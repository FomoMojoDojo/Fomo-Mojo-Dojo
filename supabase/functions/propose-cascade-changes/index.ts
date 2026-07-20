// propose-cascade-changes: generates a new strategy cascade from current
// evidence and captures the output as a surface_proposal (status='pending')
// rather than overwriting the live strategy_cascades row.
//
// Bypasses refresh-cascade's manual-preservation guard — proposals are safe
// to generate for any cascade, including manually-curated ones.
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
import { gateJobStepsForExternal, JOB_FRAMING_FALLBACK_LINE } from "../_shared/jobFramingGate.ts";
import { getFrameworkRoutingPlan } from "../_shared/frameworkLibrary.ts";
import { gateStrategyArtifactForExternal } from "../_shared/strategyArtifactGate.ts";

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

// Cascade schema + proposal_reason (refresh-cascade schema extended).
const proposalSchema = {
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
    proposal_reason: { type: "string" },
  },
  required: [
    "winning_aspiration",
    "where_to_play",
    "how_to_win",
    "capabilities",
    "management_systems",
    "assumptions",
    "proposal_reason",
  ],
};

type CascadeRow = {
  id: string;
  winning_aspiration: string;
  where_to_play: string;
  how_to_win: string;
  capabilities_json: unknown;
  management_systems_json: unknown;
  assumptions_json: unknown;
  source: string | null;
};

type Generated = {
  winning_aspiration: string;
  where_to_play: string;
  how_to_win: string;
  capabilities: Array<{ name: string; status: string; note: string }>;
  management_systems: Array<{ name: string; status: string; note: string }>;
  assumptions: Array<{ assumption: string; tested: boolean; note: string }>;
  proposal_reason: string;
};

function buildCurrentSnapshot(cascade: CascadeRow): Record<string, unknown> {
  return {
    winning_aspiration: String(cascade.winning_aspiration ?? ""),
    where_to_play: String(cascade.where_to_play ?? ""),
    how_to_win: String(cascade.how_to_win ?? ""),
    capabilities_json: Array.isArray(cascade.capabilities_json) ? cascade.capabilities_json : [],
    management_systems_json: Array.isArray(cascade.management_systems_json) ? cascade.management_systems_json : [],
    assumptions_json: Array.isArray(cascade.assumptions_json) ? cascade.assumptions_json : [],
  };
}

function buildProposedSnapshot(generated: Generated): Record<string, unknown> {
  return {
    winning_aspiration: String(generated.winning_aspiration ?? ""),
    where_to_play: String(generated.where_to_play ?? ""),
    how_to_win: String(generated.how_to_win ?? ""),
    capabilities_json: Array.isArray(generated.capabilities) ? generated.capabilities : [],
    management_systems_json: Array.isArray(generated.management_systems) ? generated.management_systems : [],
    assumptions_json: Array.isArray(generated.assumptions) ? generated.assumptions : [],
  };
}

function itemNames(arr: unknown, key: "name" | "assumption"): string {
  if (!Array.isArray(arr)) return "";
  return arr
    .map((item) => (typeof item === "object" && item ? String((item as Record<string, unknown>)[key] ?? "") : ""))
    .filter(Boolean)
    .sort()
    .join("|");
}

function snapshotsAreIdentical(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  for (const field of ["winning_aspiration", "where_to_play", "how_to_win"] as const) {
    if (String(a[field] ?? "") !== String(b[field] ?? "")) return false;
  }
  if (itemNames(a.capabilities_json, "name") !== itemNames(b.capabilities_json, "name")) return false;
  if (itemNames(a.management_systems_json, "name") !== itemNames(b.management_systems_json, "name")) return false;
  if (itemNames(a.assumptions_json, "assumption") !== itemNames(b.assumptions_json, "assumption")) return false;
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

  // --- Fetch current cascade (latest row — same ordering as alignment evaluators) ---
  const { data: cascadeRow } = await db
    .from("strategy_cascades")
    .select("id, winning_aspiration, where_to_play, how_to_win, capabilities_json, management_systems_json, assumptions_json, source, artifact_role, provenance_type")
    .eq("company_id", company_id)
    .eq("artifact_role", "market_read")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!cascadeRow) return jsonResponse({ error: "No strategy cascade found for this company" }, 404);
  // Gate 3a: external-bound artifact content passes the strategy-artifact gate.
  const cascadeRowGate = await gateStrategyArtifactForExternal({
    supabase: db as unknown as { from: (t: string) => any },
    companyId: String(company_id),
    artifact: cascadeRow as { artifact_role?: string | null; provenance_type?: string | null },
    artifactKind: "strategy_cascade",
    consumer: "propose-cascade-changes",
  });
  if (!cascadeRowGate.admissible) {
    return jsonResponse({ error: "No externally admissible strategy cascade found" }, 404);
  }
  const cascade = cascadeRow as CascadeRow;
  const currentState = buildCurrentSnapshot(cascade);

  // --- Fetch baseline ---
  const { data: baselineRuns } = await db
    .from("public_baseline_runs")
    .select("id, result_json")
    .eq("company_id", company_id)
    .order("created_at", { ascending: false })
    .limit(12);

  const isWeakStatus = (run: { result_json?: unknown }) =>
    ["ambiguous_public_evidence", "insufficient_public_evidence", "search_unavailable"].includes(
      String((run?.result_json as { status?: string } | null)?.status || ""),
    );
  const runs = Array.isArray(baselineRuns) ? baselineRuns : [];
  const baselineRun = runs.find((r) => !isWeakStatus(r)) ?? runs[0] ?? null;
  const baselineResultJson = (baselineRun as Record<string, unknown> | null)?.result_json ?? null;

  // --- Fetch strategic problems and assumptions ---
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

  // --- Fetch job_steps ---
  const { data: jobStepRows } = await db
    .from("job_steps")
    .select(
      "journey_key, journey_title, journey_subtitle, step_number, step_label, description, designed, has_gap, evidence_status, evidence_basis, evidence_confidence, provenance_type",
    )
    .eq("company_id", company_id)
    .order("journey_key", { ascending: true })
    .order("step_number", { ascending: true })
    .limit(240);

  const jobGate = await gateJobStepsForExternal({
    supabase: db as unknown as { from: (t: string) => any },
    companyId: String(company_id),
    rows: (jobStepRows ?? []) as Array<{ provenance_type?: string | null }>,
    consumer: "propose-cascade-changes",
  });
  const journeys = buildJourneysFromJobSteps(jobGate.admissible);
  const selectedJobMapBrief = jobGate.fallback ? JOB_FRAMING_FALLBACK_LINE : buildSelectedJobMapBrief(journeys);

  // --- Fetch inputs ---
  const { data: inputRows } = await db
    .from("inputs")
    .select("input_key, input_label, sub_group, description, why_it_matters")
    .eq("company_id", company_id)
    .limit(20);

  // --- Fetch opportunities (odi_needs, aligned only) ---
  // C1: migrated from legacy `opportunities` table to `odi_needs` (current canonical source).
  // Filter excludes off_strategy items so B2C/consumer-framed needs from pre-pivot data
  // don't flow into cascade proposals for B2B-pivoted companies.
  const { data: opportunityRows } = await db
    .from("odi_needs")
    .select("desired_outcome as outcome, journey_key, step_number, step_label, importance, satisfaction, opportunity_score, tier as priority_tier")
    .eq("company_id", company_id)
    .neq("strategy_alignment", "off_strategy")
    .order("opportunity_score", { ascending: false })
    .limit(30);

  // --- Fetch routes (active only) ---
  // C1: changed from .not("source", "like", "manual_%") to .neq("relevance_state", "deprioritized").
  // The source filter excluded manual_ routes (i.e., all operator-curated active routes) while
  // including system-generated deprioritized routes — the opposite of intent.
  const { data: routeRows } = await db
    .from("routes")
    .select("category, title, short_description, pts_value, effort")
    .eq("company_id", company_id)
    .neq("relevance_state", "deprioritized")
    .limit(20);

  // --- Build context briefs (matches refresh-cascade) ---
  const baselineBrief = [
    "Public baseline context (augmented with uploaded files):",
    buildBaselineBrief(baselineResultJson),
  ].filter(Boolean).join("\n\n");

  const routes = Array.isArray(routeRows) ? routeRows : [];
  const routesSummary = routes.slice(0, 12).map((r, i) =>
    `${i + 1}. ${(r as Record<string, unknown>).category || "improve"} | ${(r as Record<string, unknown>).title || "Untitled"} | ${(r as Record<string, unknown>).short_description || "No description"}`
  ).join("\n");

  // --- Current cascade snapshot for context ---
  const currentCascadeBrief = [
    `Current winning aspiration: ${cascade.winning_aspiration || "(not set)"}`,
    `Current where to play: ${cascade.where_to_play || "(not set)"}`,
    `Current how to win: ${cascade.how_to_win || "(not set)"}`,
  ].join("\n");

  // --- Framework keys ---
  const strategyFrameworkKeys = getFrameworkRoutingPlan("positioning").map((f) => f.key);
  void strategyFrameworkKeys;

  // --- Build prompts (mirrors refresh-cascade exactly, adds proposal_reason) ---

  // C1: when the cascade has been deliberately set by an operator (source starts with
  // "manual_"), anchor the proposal to the operator's intent rather than the public
  // baseline. The public baseline reflects the company's website (often consumer-facing)
  // which may diverge from the strategic direction the operator has manually set.
  const isManualCascade = typeof cascade.source === "string" && cascade.source.startsWith("manual_");
  const manualAnchorRule = isManualCascade
    ? `- The current cascade has been deliberately set by the operator. Treat the existing where_to_play as the authoritative definition of the job executor and target audience. The public baseline is historical context only — when it conflicts with the manual cascade, defer to the manual cascade. Identify drift FROM the manual cascade based on new evidence; do not revert toward the baseline buyer or category.\n`
    : `- Stay strictly consistent with the public baseline, website, buyer context, and company category\n`;

  const systemText =
    `You are generating a strategy cascade for a strategy platform.\n` +
    `Return ONLY valid JSON matching the schema. No prose outside the JSON.\n` +
    `Synthesize the evidence into a clear Roger Martin style cascade.\n` +
    `Use strong, executive-quality language, but stay tethered to the supplied evidence.\n` +
    `If evidence is thin, make the uncertainty explicit through status and assumptions rather than pretending certainty.\n\n` +
    `Rules:\n` +
    manualAnchorRule +
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
    `- proposal_reason: 1-2 sentences (operator-facing) explaining what this refresh changes versus the current cascade and why. Focus on what evidence or signal gap is driving the update. If the cascade is already well-calibrated, say so briefly.\n`;

  const userText =
    `Company: ${company_name}\nWebsite: ${website || "unknown"}\n\n` +
    `Current cascade snapshot (for context — generate what the evidence now supports):\n${currentCascadeBrief}\n\n` +
    `Public baseline context:\n${baselineBrief}\n\n` +
    `Client-stated strategic problems:\n${strategicProblemBrief}\n\n` +
    `Selected job maps:\n${selectedJobMapBrief || "none"}\n\n` +
    `Generated strategy inputs:\n${buildInputBrief(inputRows ?? [])}\n\n` +
    `Generated journeys:\n${jobGate.fallback ? JOB_FRAMING_FALLBACK_LINE : buildJourneyBrief(journeys)}\n\n` +
    `Generated opportunities:\n${buildOpportunityBrief(opportunityRows ?? [])}\n\n` +
    `Generated routes:\n${routesSummary}\n\n` +
    `Generate a full strategy cascade for this exact company. In proposal_reason, explain what changed versus the current snapshot and why.`;

  // --- LLM call ---
  let generated: Generated;
  try {
    generated = await callOpenAIJSON({
      apiKey,
      model: (Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini") as string,
      schemaName: "cascade_proposal_v1",
      schema: proposalSchema,
      systemText,
      userText,
      maxOutputTokens: 2400,
      temperature: 0.2,
    }) as Generated;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[propose-cascade-changes] LLM error:", message);
    return jsonResponse({ error: `LLM generation failed: ${message}` }, 500);
  }

  const proposedState = buildProposedSnapshot(generated);
  const reason = String(generated.proposal_reason ?? "");

  // --- No-op check ---
  if (snapshotsAreIdentical(currentState, proposedState)) {
    return jsonResponse({
      skipped: true,
      reason: "No meaningful changes from current evidence.",
    });
  }

  // --- Supersede any existing pending proposal for this cascade ---
  const { error: supersedeError } = await db
    .from("surface_proposals")
    .update({ status: "superseded", reviewed_at: new Date().toISOString() })
    .eq("surface_type", "cascade")
    .eq("surface_id", cascade.id)
    .eq("status", "pending");

  if (supersedeError) {
    console.warn("[propose-cascade-changes] supersede error (non-fatal):", supersedeError.message);
  }

  // --- Insert new proposal ---
  const { data: inserted, error: insertError } = await db
    .from("surface_proposals")
    .insert({
      company_id,
      surface_type: "cascade",
      surface_id: cascade.id,
      status: "pending",
      current_state: currentState,
      proposed_state: proposedState,
      reason,
      created_by: null,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("[propose-cascade-changes] insert error:", insertError?.message);
    return jsonResponse({ error: `Failed to write proposal: ${insertError?.message}` }, 500);
  }

  console.log("[propose-cascade-changes] proposal written", { company_id, proposal_id: (inserted as { id: string }).id });
  return jsonResponse({ proposal_id: (inserted as { id: string }).id, reason });
});