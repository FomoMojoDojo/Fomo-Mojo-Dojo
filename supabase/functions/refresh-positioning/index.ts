// refresh-positioning: standalone leaf function to re-run the positioning LLM step.
// Reads existing DB state (baseline, inputs, opportunities, routes, job_steps),
// injects the current strategy cascade as a positioning anchor (strategy-as-lens),
// and writes a new positioning_canvases row.
//
// Safety: returns status='skipped_manual_preserved' without LLM call if the
// current positioning canvas has source LIKE 'manual_%'.
// dry_run=true returns the prompt without calling OpenAI or writing to DB.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callOpenAIJSON, STANDARD_MARKET_CATEGORY_GUIDANCE } from "../_shared/openaiClient.ts";
import {
  buildBaselineBrief,
  buildCascadeContext,
  buildInputBrief,
  buildJourneyBrief,
  buildJourneysFromJobSteps,
  buildOpportunityBrief,
  buildSelectedJobMapBrief,
  buildStrategicAssumptionBrief,
  buildStrategicProblemBrief,
  normalizeStrategicAssumptions,
  normalizeStrategicProblems,
} from "../_shared/contextBuilders.ts";
import { buildFrameworkBrief, getFrameworkRoutingPlan } from "../_shared/frameworkLibrary.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const positioningCanvasSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    competitive_alternatives: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          highlighted: { type: "boolean" },
        },
        required: ["id", "name", "description", "highlighted"],
      },
    },
    unique_attributes: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          highlighted: { type: "boolean" },
        },
        required: ["id", "name", "description", "highlighted"],
      },
    },
    value_for_customer: { type: "string" },
    best_fit_customers: { type: "string" },
    market_category: { type: "string" },
    category_rationale: { type: "string" },
    current_tagline: { type: "string" },
    proposed_tagline: { type: "string" },
  },
  required: [
    "competitive_alternatives",
    "unique_attributes",
    "value_for_customer",
    "best_fit_customers",
    "market_category",
    "category_rationale",
    "current_tagline",
    "proposed_tagline",
  ],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const openaiModel = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse({ error: "Missing Supabase env vars" }, 500);
    }
    if (!openaiKey) return jsonResponse({ error: "Missing OPENAI_API_KEY" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "No auth header" }, 401);
    const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();

    // Accept service role key directly (internal/orchestrator calls) or user JWT.
    let userId: string;
    if (bearerToken === serviceRoleKey) {
      userId = "service_role";
    } else {
      const anonClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userRes, error: authError } = await anonClient.auth.getUser();
      if (authError || !userRes?.user) return jsonResponse({ error: "Unauthorized" }, 401);
      userId = userRes.user.id;
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const company_id = String((body as Record<string, unknown>)?.company_id || "").trim();
    const dry_run = !!(body as Record<string, unknown>)?.dry_run;
    // skip_lock: accepted from orchestrator (research-company already holds the lock); no-op here
    const _skip_lock = !!(body as Record<string, unknown>)?.skip_lock;

    if (!company_id) return jsonResponse({ error: "company_id required" }, 400);

    // --- Safety check: skip if existing positioning canvas is manually curated ---
    const { data: manualCheck } = await supabase
      .from("positioning_canvases")
      .select("id, source")
      .eq("company_id", company_id)
      .like("source", "manual_%")
      .maybeSingle();

    if (manualCheck) {
      console.warn("[refresh-positioning] skipping — manual positioning canvas detected", {
        company_id,
        source: manualCheck.source,
        id: manualCheck.id,
      });
      return jsonResponse({
        status: "skipped_manual_preserved",
        message: "Positioning canvas has a manual source and was not overwritten.",
        source: manualCheck.source,
        canvas_id: manualCheck.id,
      });
    }

    // --- Fetch company ---
    const { data: companyRow, error: companyErr } = await supabase
      .from("companies")
      .select("name, website")
      .eq("id", company_id)
      .maybeSingle();
    if (companyErr || !companyRow) {
      return jsonResponse({ error: "Company not found", company_id }, 404);
    }
    const company_name = String(companyRow.name || "");
    const website = String(companyRow.website || "");

    // --- Fetch baseline ---
    const { data: baselineRuns } = await supabase
      .from("public_baseline_runs")
      .select("id, result_json")
      .eq("company_id", company_id)
      .order("created_at", { ascending: false })
      .limit(12);

    const isWeakStatus = (run: { result_json?: unknown }) =>
      ["ambiguous_public_evidence", "insufficient_public_evidence"].includes(
        String((run?.result_json as { status?: string } | null)?.status || ""),
      );

    const runs = Array.isArray(baselineRuns) ? baselineRuns : [];
    const baselineRun = runs.find((r) => !isWeakStatus(r)) ?? runs[0] ?? null;
    const baselineResultJson = baselineRun?.result_json ?? null;

    // --- Fetch strategic problems and assumptions ---
    const { data: problemRows } = await supabase
      .from("strategy_problem_statements")
      .select("id, statement, source, status, reconciliation_note")
      .eq("company_id", company_id)
      .order("created_at", { ascending: true })
      .limit(80);

    const { data: assumptionRows } = await supabase
      .from("strategy_assumptions")
      .select("id, assumption, source, status, note")
      .eq("company_id", company_id)
      .order("created_at", { ascending: true })
      .limit(120);

    const strategicProblems = normalizeStrategicProblems(problemRows ?? []);
    const strategicAssumptions = normalizeStrategicAssumptions(assumptionRows ?? []);
    const strategicProblemBrief = [
      buildStrategicProblemBrief(strategicProblems),
      buildStrategicAssumptionBrief(strategicAssumptions),
      "Use both strategic problems and assumptions to determine what to prioritize, what to test next, and where confidence is still low.",
    ].join("\n\n");

    // --- Fetch job_steps → reconstruct journeys ---
    const { data: jobStepRows } = await supabase
      .from("job_steps")
      .select(
        "journey_key, journey_title, journey_subtitle, step_number, step_label, description, designed, has_gap, evidence_status, evidence_basis, evidence_confidence",
      )
      .eq("company_id", company_id)
      .order("journey_key", { ascending: true })
      .order("step_number", { ascending: true })
      .limit(240);

    const journeys = buildJourneysFromJobSteps(jobStepRows ?? []);
    const selectedJobMapBrief = buildSelectedJobMapBrief(journeys);

    // --- Fetch inputs ---
    const { data: inputRows } = await supabase
      .from("inputs")
      .select("input_key, input_label, sub_group, description, why_it_matters")
      .eq("company_id", company_id)
      .limit(20);

    // --- Fetch opportunities ---
    const { data: opportunityRows } = await supabase
      .from("opportunities")
      .select("outcome, journey_key, step_number, step_label, importance, satisfaction, opportunity_score, priority_tier")
      .eq("company_id", company_id)
      .order("opportunity_score", { ascending: false })
      .limit(30);

    // --- Fetch routes (non-manual) ---
    const { data: routeRows } = await supabase
      .from("routes")
      .select("category, title, short_description")
      .eq("company_id", company_id)
      .not("source", "like", "manual_%")
      .limit(20);

    // --- Fetch current cascade as positioning anchor (strategy-as-lens) ---
    const { data: cascadeRow } = await supabase
      .from("strategy_cascades")
      .select("winning_aspiration, where_to_play, how_to_win, source")
      .eq("company_id", company_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const cascadeContext = buildCascadeContext(cascadeRow ?? null);

    // --- Build context ---
    const baselineBrief = [
      "Public baseline context (augmented with uploaded files):",
      buildBaselineBrief(baselineResultJson),
    ].filter(Boolean).join("\n\n");

    const routes = Array.isArray(routeRows) ? routeRows : [];
    const routesSummary = routes.slice(0, 10).map((r, i) =>
      `${i + 1}. ${(r as Record<string, unknown>).category || "improve"} | ${(r as Record<string, unknown>).title || "Untitled"} | ${(r as Record<string, unknown>).short_description || "No description"}`
    ).join("\n");

    // --- Framework keys (mirrors research-company §5) ---
    const positioningFrameworkKeys = getFrameworkRoutingPlan("positioning").map((f) => f.key);

    // --- Build prompts (matches research-company §5 exactly + cascade anchor) ---
    const systemText =
      `You are generating an April Dunford style positioning canvas for a strategy platform.\n` +
      `Return ONLY valid JSON matching the schema. No prose outside the JSON.\n` +
      `Apply the framework guidance below as decision rules, not as output headings.\n\n` +
      `Framework guidance:\n${buildFrameworkBrief("positioning", getFrameworkRoutingPlan("positioning"))}\n\n` +
      `Rules:\n` +
      `- Stay strictly consistent with the provided website, evidence, category, audience, and company context\n` +
      `- Use April Dunford frame-of-reference logic plus ODI role clarity (job executor, chooser, user)\n` +
      `- Never switch industries, populations, or buyer types from the baseline evidence\n` +
      `- competitive_alternatives should be real alternatives, including manual workarounds or doing nothing when relevant\n` +
      `- competitive_alternatives must serve the same customer/job context as the company; do not list alternatives from unrelated sectors\n` +
      `- unique_attributes should be specific and credible, not vague marketing claims\n` +
      `- value_for_customer should describe what customers can do or achieve that they could not before\n` +
      `- best_fit_customers should describe the clearest-fit audience in one paragraph and name buyer/executor context when possible\n` +
      `- market_category should be the category the company should claim or reshape and must be concise (2-8 words)\n` +
      `- ${STANDARD_MARKET_CATEGORY_GUIDANCE}\n` +
      `- market_category and best_fit_customers must align with the public baseline and website evidence\n` +
      `- positioning should directly address the client-stated strategic problem framing when provided\n` +
      `- category_rationale should explain why this category frame of reference helps buyers understand the company in ODI job terms\n` +
      `- current_tagline should be an exact homepage or website phrase if publicly evidenced; if not clearly present, return 'unknown'\n` +
      `- proposed_tagline should be a strategist-quality direction, not a generic slogan\n` +
      `- highlighted=true only for the strongest or most differentiating items\n` +
      `- The current strategy cascade below is the strategic anchor. Positioning must be coherent with it.\n`;

    const userText =
      `Company: ${company_name}\nWebsite: ${website || "unknown"}\n\n` +
      `Public baseline context:\n${baselineBrief}\n\n` +
      `Client-stated strategic problems:\n${strategicProblemBrief}\n\n` +
      `Current strategy cascade (positioning anchor):\n${cascadeContext}\n\n` +
      `Selected job maps:\n${selectedJobMapBrief || "none"}\n\n` +
      `Generated strategy inputs:\n${buildInputBrief(inputRows ?? [])}\n\n` +
      `Generated opportunities:\n${buildOpportunityBrief(opportunityRows ?? [])}\n\n` +
      `Generated routes:\n${routesSummary}\n\n` +
      `Generate a positioning canvas for this exact company.`;

    // --- Dry run: return prompts without calling LLM ---
    if (dry_run) {
      return jsonResponse({
        status: "dry_run",
        company_id,
        company_name,
        cascade_source: cascadeRow?.source ?? null,
        prompt_used: `SYSTEM:\n${systemText}\n\n---\n\nUSER:\n${userText}`,
      });
    }

    // --- Call LLM ---
    const positioningResult = await callOpenAIJSON({
      apiKey: openaiKey,
      model: openaiModel,
      schemaName: "mojo_positioning_canvas_v1",
      schema: positioningCanvasSchema,
      systemText,
      userText,
      maxOutputTokens: 2200,
      temperature: 0.2,
    });

    // --- Persist to DB ---
    const payload = {
      company_id,
      user_id: userId,
      source: "system",
      provenance_type: "public_research",
      frameworks_used: positioningFrameworkKeys,
      competitive_alternatives_json: Array.isArray(positioningResult?.competitive_alternatives)
        ? positioningResult.competitive_alternatives
        : [],
      unique_attributes_json: Array.isArray(positioningResult?.unique_attributes)
        ? positioningResult.unique_attributes
        : [],
      value_for_customer: String(positioningResult?.value_for_customer || ""),
      best_fit_customers: String(positioningResult?.best_fit_customers || ""),
      market_category: String(positioningResult?.market_category || ""),
      category_rationale: String(positioningResult?.category_rationale || ""),
      current_tagline: String(positioningResult?.current_tagline || ""),
      proposed_tagline: String(positioningResult?.proposed_tagline || ""),
    };

    let { data: inserted, error: insertErr } = await supabase
      .from("positioning_canvases")
      .insert(payload)
      .select("id")
      .single();

    if (insertErr && String(insertErr.message || "").toLowerCase().includes("frameworks_used")) {
      const fallback = await supabase
        .from("positioning_canvases")
        .insert({
          company_id,
          user_id: user.id,
          source: "system",
          provenance_type: "public_research",
          competitive_alternatives_json: payload.competitive_alternatives_json,
          unique_attributes_json: payload.unique_attributes_json,
          value_for_customer: payload.value_for_customer,
          best_fit_customers: payload.best_fit_customers,
          market_category: payload.market_category,
          category_rationale: payload.category_rationale,
          current_tagline: payload.current_tagline,
          proposed_tagline: payload.proposed_tagline,
        })
        .select("id")
        .single();
      inserted = fallback.data;
      insertErr = fallback.error;
    }

    if (insertErr) {
      console.error("[refresh-positioning] insert error:", insertErr);
      return jsonResponse({ error: "positioning_insert_failed", detail: insertErr.message }, 500);
    }

    console.log("[refresh-positioning] canvas inserted", { company_id, canvas_id: inserted?.id });
    return jsonResponse({ status: "ok", company_id, canvas_id: inserted?.id });
  } catch (err) {
    console.error("[refresh-positioning] unhandled error:", err);
    return jsonResponse({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
