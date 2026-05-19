// propose-positioning-changes: generates a new positioning canvas from current
// evidence and captures the output as a surface_proposal (status='pending')
// rather than overwriting the live positioning_canvases row.
//
// Input: { company_id }
// Output:
//   { proposal_id, reason }     — proposal written
//   { skipped: true, reason }   — proposed_state identical to current_state
//   { error }                   — LLM or DB failure

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

// Same schema as refresh-positioning plus proposal_reason.
const proposalSchema = {
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
    proposal_reason: { type: "string" },
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
    "proposal_reason",
  ],
};

// Snapshot field names (content-bearing columns; alignment columns excluded).
const SNAPSHOT_TEXT_FIELDS = [
  "value_for_customer",
  "best_fit_customers",
  "market_category",
  "category_rationale",
  "current_tagline",
  "proposed_tagline",
] as const;

function buildSnapshot(
  canvas: Record<string, unknown>,
  generated: Record<string, unknown>,
  role: "current" | "proposed",
): Record<string, unknown> {
  if (role === "current") {
    return {
      competitive_alternatives_json: canvas.competitive_alternatives_json ?? [],
      unique_attributes_json: canvas.unique_attributes_json ?? [],
      value_for_customer: String(canvas.value_for_customer ?? ""),
      best_fit_customers: String(canvas.best_fit_customers ?? ""),
      market_category: String(canvas.market_category ?? ""),
      category_rationale: String(canvas.category_rationale ?? ""),
      current_tagline: String(canvas.current_tagline ?? ""),
      proposed_tagline: String(canvas.proposed_tagline ?? ""),
    };
  }
  return {
    competitive_alternatives_json: Array.isArray(generated.competitive_alternatives)
      ? generated.competitive_alternatives
      : [],
    unique_attributes_json: Array.isArray(generated.unique_attributes)
      ? generated.unique_attributes
      : [],
    value_for_customer: String(generated.value_for_customer ?? ""),
    best_fit_customers: String(generated.best_fit_customers ?? ""),
    market_category: String(generated.market_category ?? ""),
    category_rationale: String(generated.category_rationale ?? ""),
    current_tagline: String(generated.current_tagline ?? ""),
    proposed_tagline: String(generated.proposed_tagline ?? ""),
  };
}

function snapshotsAreIdentical(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  // Compare text fields directly.
  for (const field of SNAPSHOT_TEXT_FIELDS) {
    if (String(a[field] ?? "") !== String(b[field] ?? "")) return false;
  }
  // Compare array fields by stringifying names.
  const namesOf = (arr: unknown) =>
    (Array.isArray(arr) ? arr : [])
      .map((item) => (typeof item === "object" && item && "name" in item ? String((item as Record<string, unknown>).name) : ""))
      .sort()
      .join("|");
  if (namesOf(a.competitive_alternatives_json) !== namesOf(b.competitive_alternatives_json)) return false;
  if (namesOf(a.unique_attributes_json) !== namesOf(b.unique_attributes_json)) return false;
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return jsonResponse({ error: "OPENAI_API_KEY not configured" }, 500);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) return jsonResponse({ error: "Supabase env vars missing" }, 500);

  let body: { company_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { company_id } = body;
  if (!company_id) return jsonResponse({ error: "company_id is required" }, 400);

  const db = createClient(supabaseUrl, supabaseKey);

  // --- Fetch company ---
  const { data: companyRow } = await db
    .from("companies")
    .select("name, website")
    .eq("id", company_id)
    .maybeSingle();
  if (!companyRow) return jsonResponse({ error: "Company not found" }, 404);
  const company_name = String((companyRow as Record<string, unknown>).name ?? "");
  const website = String((companyRow as Record<string, unknown>).website ?? "");

  // --- Fetch current canvas (any source — proposals are safe even for manual canvases) ---
  const { data: canvasRow } = await db
    .from("positioning_canvases")
    .select("id, competitive_alternatives_json, unique_attributes_json, value_for_customer, best_fit_customers, market_category, category_rationale, current_tagline, proposed_tagline, source")
    .eq("company_id", company_id)
    .maybeSingle();
  if (!canvasRow) return jsonResponse({ error: "No positioning canvas found for this company" }, 404);

  const canvas = canvasRow as Record<string, unknown>;
  const currentState = buildSnapshot(canvas, {}, "current");

  // --- Fetch cascade ---
  const { data: cascadeRow } = await db
    .from("strategy_cascades")
    .select("winning_aspiration, where_to_play, how_to_win, source")
    .eq("company_id", company_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const cascadeContext = buildCascadeContext(cascadeRow ?? null);

  // --- Fetch context (mirrors refresh-positioning) ---
  const { data: baselineRuns } = await db
    .from("public_baseline_runs")
    .select("id, result_json")
    .eq("company_id", company_id)
    .order("created_at", { ascending: false })
    .limit(12);

  const isWeakStatus = (run: { result_json?: unknown }) =>
    ["ambiguous_public_evidence", "insufficient_public_evidence"].includes(
      String(((run?.result_json as { status?: string } | null)?.status) ?? ""),
    );
  const runs = Array.isArray(baselineRuns) ? baselineRuns : [];
  const baselineRun = runs.find((r) => !isWeakStatus(r)) ?? runs[0] ?? null;
  const baselineResultJson = (baselineRun as Record<string, unknown> | null)?.result_json ?? null;

  const { data: problemRows } = await db
    .from("strategy_problem_statements")
    .select("id, statement, source, status, reconciliation_note")
    .eq("company_id", company_id)
    .order("created_at", { ascending: true })
    .limit(80);

  const { data: assumptionRows } = await db
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

  const { data: jobStepRows } = await db
    .from("job_steps")
    .select("journey_key, journey_title, journey_subtitle, step_number, step_label, description, designed, has_gap, evidence_status, evidence_basis, evidence_confidence")
    .eq("company_id", company_id)
    .order("journey_key", { ascending: true })
    .order("step_number", { ascending: true })
    .limit(240);

  const journeys = buildJourneysFromJobSteps(jobStepRows ?? []);
  const selectedJobMapBrief = buildSelectedJobMapBrief(journeys);

  const { data: inputRows } = await db
    .from("inputs")
    .select("input_key, input_label, sub_group, description, why_it_matters")
    .eq("company_id", company_id)
    .limit(20);

  const { data: opportunityRows } = await db
    .from("opportunities")
    .select("outcome, journey_key, step_number, step_label, importance, satisfaction, opportunity_score, priority_tier")
    .eq("company_id", company_id)
    .order("opportunity_score", { ascending: false })
    .limit(30);

  const { data: routeRows } = await db
    .from("routes")
    .select("category, title, short_description")
    .eq("company_id", company_id)
    .not("source", "like", "manual_%")
    .limit(20);

  const baselineBrief = ["Public baseline context (augmented with uploaded files):", buildBaselineBrief(baselineResultJson)].filter(Boolean).join("\n\n");
  const routesSummary = (Array.isArray(routeRows) ? routeRows : []).slice(0, 10).map((r, i) =>
    `${i + 1}. ${(r as Record<string, unknown>).category || "improve"} | ${(r as Record<string, unknown>).title || "Untitled"} | ${(r as Record<string, unknown>).short_description || "No description"}`
  ).join("\n");

  // --- Build prompts (same as refresh-positioning + proposal_reason instruction) ---
  const positioningFrameworkKeys = getFrameworkRoutingPlan("positioning").map((f) => f.key);

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
    `- The current strategy cascade below is the strategic anchor. Positioning must be coherent with it.\n` +
    `- proposal_reason: 1-2 sentences explaining what this refresh changes versus the current positioning and why, written in operator-facing voice. Focus on what evidence or cascade alignment is driving the update. If the positioning is already well-calibrated, say so briefly.\n`;

  const currentCanvasBrief = [
    `Current market category: ${String(canvas.market_category ?? "(not set)")}`,
    `Current best-fit customers: ${String(canvas.best_fit_customers ?? "(not set)")}`,
    `Current value for customer: ${String(canvas.value_for_customer ?? "(not set)")}`,
    `Current proposed tagline: ${String(canvas.proposed_tagline ?? "(not set)")}`,
  ].join("\n");

  const userText =
    `Company: ${company_name}\nWebsite: ${website || "unknown"}\n\n` +
    `Current positioning snapshot (for context — generate what the evidence now supports, not necessarily what's here):\n${currentCanvasBrief}\n\n` +
    `Public baseline context:\n${baselineBrief}\n\n` +
    `Client-stated strategic problems:\n${strategicProblemBrief}\n\n` +
    `Current strategy cascade (positioning anchor):\n${cascadeContext}\n\n` +
    `Selected job maps:\n${selectedJobMapBrief || "none"}\n\n` +
    `Generated strategy inputs:\n${buildInputBrief(inputRows ?? [])}\n\n` +
    `Generated opportunities:\n${buildOpportunityBrief(opportunityRows ?? [])}\n\n` +
    `Generated routes:\n${routesSummary}\n\n` +
    `Generate a positioning canvas for this exact company. In proposal_reason, explain what changed versus the current snapshot and why.`;

  // --- LLM call ---
  let generated: Record<string, unknown>;
  try {
    generated = await callOpenAIJSON({
      apiKey,
      model: (Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini") as string,
      schemaName: "positioning_proposal_v1",
      schema: proposalSchema,
      systemText,
      userText,
      maxOutputTokens: 2400,
      temperature: 0.2,
    }) as Record<string, unknown>;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[propose-positioning-changes] LLM error:", message);
    return jsonResponse({ error: `LLM generation failed: ${message}` }, 500);
  }

  const proposedState = buildSnapshot({}, generated, "proposed");
  const reason = String(generated.proposal_reason ?? "");

  // --- No-op check ---
  if (snapshotsAreIdentical(currentState, proposedState)) {
    return jsonResponse({
      skipped: true,
      reason: "No meaningful changes from current evidence.",
    });
  }

  // --- Supersede any existing pending proposal for this canvas ---
  const { error: supersedeError } = await db
    .from("surface_proposals")
    .update({ status: "superseded", reviewed_at: new Date().toISOString() })
    .eq("surface_type", "positioning")
    .eq("surface_id", String(canvas.id))
    .eq("status", "pending");

  if (supersedeError) {
    console.warn("[propose-positioning-changes] supersede error (non-fatal):", supersedeError.message);
  }

  // --- Insert new proposal ---
  const { data: inserted, error: insertError } = await db
    .from("surface_proposals")
    .insert({
      company_id,
      surface_type: "positioning",
      surface_id: String(canvas.id),
      status: "pending",
      current_state: currentState,
      proposed_state: proposedState,
      reason,
      created_by: null,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("[propose-positioning-changes] insert error:", insertError?.message);
    return jsonResponse({ error: `Failed to write proposal: ${insertError?.message}` }, 500);
  }

  console.log("[propose-positioning-changes] proposal written", { company_id, proposal_id: (inserted as { id: string }).id });
  return jsonResponse({ proposal_id: (inserted as { id: string }).id, reason });
});
