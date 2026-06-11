// refresh-cascade: standalone leaf function to re-run the cascade LLM step.
// Reads existing DB state (baseline, inputs, opportunities, routes, job_steps),
// rebuilds the strategy cascade prompt, and writes a new strategy_cascades row.
//
// Safety: returns status='skipped_manual_preserved' without LLM call if the
// current cascade row has source LIKE 'manual_%'.
// dry_run=true returns the prompt without calling OpenAI or writing to DB.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callOpenAIJSON, STANDARD_MARKET_CATEGORY_GUIDANCE } from "../_shared/openaiClient.ts";
import {
  buildCompetitorMarketBrief,
  buildBaselineBrief,
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

const strategyCascadeSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    winning_aspiration: { type: "string" },
    where_to_play: { type: "string" },
    how_to_win: { type: "string" },
    capabilities: {
      type: "array",
      minItems: 4,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          status: { type: "string", enum: ["strong", "developing", "gap"] },
          note: { type: "string" },
        },
        required: ["name", "status", "note"],
      },
    },
    management_systems: {
      type: "array",
      minItems: 4,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          status: { type: "string", enum: ["strong", "developing", "gap"] },
          note: { type: "string" },
        },
        required: ["name", "status", "note"],
      },
    },
    assumptions: {
      type: "array",
      minItems: 4,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          assumption: { type: "string" },
          tested: { type: "boolean" },
          note: { type: "string" },
        },
        required: ["assumption", "tested", "note"],
      },
    },
  },
  required: ["winning_aspiration", "where_to_play", "how_to_win", "capabilities", "management_systems", "assumptions"],
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
    // Dedicated service-role identity in auth.users — email: system@mojomap.internal (A55).
    // user_id is a NOT NULL uuid; the literal "service_role" breaks the insert (22P02).
    // Migration: 20260518000002_create_service_role_user.sql
    const SERVICE_ROLE_UUID = "1a27cf29-554a-46e9-bab8-0e238f9dc088";
    let userId: string;
    if (bearerToken === serviceRoleKey) {
      userId = SERVICE_ROLE_UUID;
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

    // --- Safety check: skip if existing cascade is manually curated ---
    const { data: manualCheck } = await supabase
      .from("strategy_cascades")
      .select("id, source")
      .eq("company_id", company_id)
      .like("source", "manual_%")
      .maybeSingle();

    if (manualCheck) {
      console.warn("[refresh-cascade] skipping — manual cascade row detected", {
        company_id,
        source: manualCheck.source,
        id: manualCheck.id,
      });
      return jsonResponse({
        status: "skipped_manual_preserved",
        message: "Cascade row has a manual source and was not overwritten.",
        source: manualCheck.source,
        cascade_id: manualCheck.id,
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

    // --- Fetch baseline (prefer latest strong run, fall back to latest) ---
    // Optional baseline_run_id override (same scoped pattern as refresh-positioning and
    // research-company): the orchestrator forwards its RESOLVED run id so every surface of
    // one run builds from one snapshot. Scoped to company_id, 404 if not owned, never a
    // silent fallback. Absent → byte-identical newest-non-weak behavior.
    const bodyBaselineRunId = Number((body as Record<string, unknown>)?.baseline_run_id) || null;
    let baselineRun: { id: unknown; result_json: unknown } | null = null;
    if (bodyBaselineRunId) {
      const { data: pinnedRun } = await supabase
        .from("public_baseline_runs")
        .select("id, result_json")
        .eq("company_id", company_id)
        .eq("id", bodyBaselineRunId)
        .maybeSingle();
      if (!pinnedRun) {
        return jsonResponse(
          { error: "baseline_run_not_found", baseline_run_id: bodyBaselineRunId, company_id },
          404,
        );
      }
      baselineRun = pinnedRun;
      console.log("[refresh-cascade] building from baseline_run_id override", {
        baseline_run_id: bodyBaselineRunId,
      });
    } else {
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
      baselineRun = runs.find((r) => !isWeakStatus(r)) ?? runs[0] ?? null;
    }
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
      .select("category, title, short_description, pts_value, effort")
      .eq("company_id", company_id)
      .not("source", "like", "manual_%")
      .limit(20);

    // --- Build context briefs ---
    // B2.1: latest competitor-discovery snapshot grounds where-to-play context.
    const { data: competitorRun } = await supabase
      .from("competitor_discovery_runs")
      .select("id, result_json")
      .eq("company_id", company_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const competitorMarketBrief = buildCompetitorMarketBrief((competitorRun as { result_json?: unknown } | null)?.result_json ?? null);

    const baselineBrief = [
      "Public baseline context (augmented with uploaded files):",
      buildBaselineBrief(baselineResultJson),
    ].filter(Boolean).join("\n\n");

    const routes = Array.isArray(routeRows) ? routeRows : [];
    const routesSummary = routes.slice(0, 12).map((r, i) =>
      `${i + 1}. ${r.category || "improve"} | ${r.title || "Untitled"} | ${r.short_description || "No description"}`
    ).join("\n");

    // --- Framework keys (mirrors research-company §6 which reuses positioning plan) ---
    const strategyFrameworkKeys = getFrameworkRoutingPlan("positioning").map((f) => f.key);

    // --- Build prompts (matches research-company §6 exactly) ---
    const systemText =
      `You are generating a strategy cascade for a strategy platform.\n` +
      `Return ONLY valid JSON matching the schema. No prose outside the JSON.\n` +
      `Synthesize the evidence into a clear Roger Martin style cascade.\n` +
      `Use strong, executive-quality language, but stay tethered to the supplied evidence.\n` +
      `If evidence is thin, make the uncertainty explicit through status and assumptions rather than pretending certainty.\n\n` +
      `Rules:\n` +
      `- Stay strictly consistent with the public baseline, website, buyer context, and company category\n` +
      `- Strategy choices should directly resolve or reduce the client-stated strategic problem(s) when provided\n` +
      `- Never switch industries, populations, or buyer types from the baseline evidence\n` +
      `- where_to_play must be framed around the job executor and job context — not a product category. Format: who the job executor is, what job they are trying to accomplish, and the specific segment or context where this company competes.\n` +
      `- where_to_play should align with April Dunford frame of reference and ODI role/job context\n` +
      `- ${STANDARD_MARKET_CATEGORY_GUIDANCE}\n` +
      `- winning_aspiration, where_to_play, and how_to_win should each be one well-written paragraph\n` +
      `- capabilities should be concrete operational or strategic abilities, not departments\n` +
      `- management_systems should be recurring operating loops, measurement systems, governance, planning, or resource systems\n` +
      `- status=strong only when the capability or system is meaningfully evidenced\n` +
      `- status=developing when there is some evidence but it appears incomplete or immature\n` +
      `- status=gap when it appears important but weak, missing, or unproven\n` +
      `- note should be a short evidence-based explanation, 6-16 words\n` +
      `- assumptions should read like untested strategic beliefs or claims implied by the company story\n` +
      `- assumptions.note should explain why the assumption is untested or what would validate it\n` +
      `- When CATEGORY/MARKET EVIDENCE is provided, where_to_play must stay consistent with the real competitive set and market context it describes\n` +
      `- The ALTERNATIVES and CATEGORY/MARKET evidence sections ground where-to-play and category context ONLY — they may NEVER be used to support, corroborate, or strengthen any claim the client makes about itself\n`;

    const userText =
      `Company: ${company_name}\nWebsite: ${website || "unknown"}\n\n` +
      `Public baseline context:\n${baselineBrief}\n\n` +
      `Client-stated strategic problems:\n${strategicProblemBrief}\n\n` +
      `Selected job maps:\n${selectedJobMapBrief || "none"}\n\n` +
      `Generated strategy inputs:\n${buildInputBrief(inputRows ?? [])}\n\n` +
      `Generated journeys:\n${buildJourneyBrief(journeys)}\n\n` +
      `Generated opportunities:\n${buildOpportunityBrief(opportunityRows ?? [])}\n\n` +
      `Generated routes:\n${routesSummary}\n\n` +
      (competitorMarketBrief ? `${competitorMarketBrief}\n\n` : "") +
      `Generate a full strategy cascade for this exact company in the supplied schema.`;

    // --- Dry run: return prompts without calling LLM ---
    if (dry_run) {
      return jsonResponse({
        status: "dry_run",
        company_id,
        company_name,
        prompt_used: `SYSTEM:\n${systemText}\n\n---\n\nUSER:\n${userText}`,
      });
    }

    // --- Call LLM ---
    const cascadeResult = await callOpenAIJSON({
      apiKey: openaiKey,
      model: openaiModel,
      schemaName: "mojo_strategy_cascade_v1",
      schema: strategyCascadeSchema,
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
      frameworks_used: strategyFrameworkKeys,
      winning_aspiration: String(cascadeResult?.winning_aspiration || ""),
      where_to_play: String(cascadeResult?.where_to_play || ""),
      how_to_win: String(cascadeResult?.how_to_win || ""),
      capabilities_json: Array.isArray(cascadeResult?.capabilities) ? cascadeResult.capabilities : [],
      management_systems_json: Array.isArray(cascadeResult?.management_systems)
        ? cascadeResult.management_systems
        : [],
      assumptions_json: Array.isArray(cascadeResult?.assumptions) ? cascadeResult.assumptions : [],
      // No updated_at trigger on this table — set explicitly so refreshes are visible.
      updated_at: new Date().toISOString(),
    };

    // Upsert: strategy_cascades is one row per company (strategy_cascades_company_id_key),
    // so a plain insert can never refresh an existing cascade (23505). The manual-preserve
    // guard above already returned before any write for manual cascades.
    let { data: inserted, error: insertErr } = await supabase
      .from("strategy_cascades")
      .upsert(payload, { onConflict: "company_id" })
      .select("id")
      .single();

    if (insertErr && String(insertErr.message || "").toLowerCase().includes("frameworks_used")) {
      const fallback = await supabase
        .from("strategy_cascades")
        .upsert({
          company_id,
          user_id: userId,
          source: "system",
          provenance_type: "public_research",
          winning_aspiration: payload.winning_aspiration,
          where_to_play: payload.where_to_play,
          how_to_win: payload.how_to_win,
          capabilities_json: payload.capabilities_json,
          management_systems_json: payload.management_systems_json,
          assumptions_json: payload.assumptions_json,
          updated_at: payload.updated_at,
        }, { onConflict: "company_id" })
        .select("id")
        .single();
      inserted = fallback.data;
      insertErr = fallback.error;
    }

    if (insertErr) {
      console.error("[refresh-cascade] insert error:", insertErr);
      return jsonResponse({ error: "cascade_insert_failed", detail: insertErr.message }, 500);
    }

    console.log("[refresh-cascade] cascade inserted", { company_id, cascade_id: inserted?.id });
    return jsonResponse({ status: "ok", company_id, cascade_id: inserted?.id });
  } catch (err) {
    console.error("[refresh-cascade] unhandled error:", err);
    return jsonResponse({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
