// assess-surface-drift: compare current active signals against each surface's
// captured baseline. Writes one surface_drift_assessments row per surface.
//
// Input:  { company_id, surface_type?, surface_id? }
//   - surface_type + surface_id: assess that one surface
//   - company_id only:           assess all 4 surface types for that company
//
// Output: { assessed, aligned, slight_drift, material_drift }
//
// Detection strategy: Option B (LLM-only, no embedding pre-filter).
// Embeddings are not present on the signals table. When the signal corpus is
// small enough for alpha, LLM-only delivers higher precision at acceptable cost.
//
// Empty-diff fast-path: if current active signal IDs == baseline IDs, write
// drift_state='aligned', drift_score=0, no LLM call.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callOpenAIJSON } from "../_shared/openaiClient.ts";
import { recordIntegrityRun } from "../_shared/integrity.ts";
import { gateStrategyArtifactsForExternal } from "../_shared/strategyArtifactGate.ts";
import { gateDriftSurfacesForExternal } from "../_shared/driftExternalGate.ts";

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

// ── Surface text builders ─────────────────────────────────────────────────────

type CascadeRow = {
  id: string;
  winning_aspiration: string | null;
  where_to_play: string | null;
  how_to_win: string | null;
  capabilities_json: unknown;
  management_systems_json: unknown;
  assumptions_json: unknown;
  evidence_baseline_signal_ids: string[] | null;
  evidence_baseline_captured_at: string | null;
};

type PositioningRow = {
  id: string;
  value_for_customer: string | null;
  best_fit_customers: string | null;
  market_category: string | null;
  category_rationale: string | null;
  current_tagline: string | null;
  competitive_alternatives_json: unknown;
  unique_attributes_json: unknown;
  evidence_baseline_signal_ids: string[] | null;
  evidence_baseline_captured_at: string | null;
};

type RouteRow = {
  id: string;
  title: string | null;
  short_description: string | null;
  rejected_alternatives: string | null;
  what_would_have_to_be_true: string | null;
  evidence_baseline_signal_ids: string[] | null;
  evidence_baseline_captured_at: string | null;
  provenance_type: string | null;
};

type OpportunityRow = {
  id: string;
  desired_outcome: string | null;
  odi_canonical_statement: string | null;
  evidence_baseline_signal_ids: string[] | null;
  evidence_baseline_captured_at: string | null;
  provenance_type: string | null;
};

function extractJsonNames(arr: unknown): string {
  if (!Array.isArray(arr)) return "";
  return arr
    .map((item) => {
      const it = item as Record<string, unknown>;
      return [it.name, it.note].filter(Boolean).join(": ");
    })
    .filter(Boolean)
    .join(" | ");
}

function buildCascadeText(row: CascadeRow): string {
  return [
    row.winning_aspiration && `Winning aspiration: ${row.winning_aspiration}`,
    row.where_to_play && `Where to play: ${row.where_to_play}`,
    row.how_to_win && `How to win: ${row.how_to_win}`,
    extractJsonNames(row.capabilities_json) && `Capabilities: ${extractJsonNames(row.capabilities_json)}`,
    extractJsonNames(row.management_systems_json) && `Management systems: ${extractJsonNames(row.management_systems_json)}`,
    extractJsonNames(row.assumptions_json) && `Assumptions: ${extractJsonNames(row.assumptions_json)}`,
  ].filter(Boolean).join("\n");
}

function buildPositioningText(row: PositioningRow): string {
  return [
    row.value_for_customer && `Value for customer: ${row.value_for_customer}`,
    row.best_fit_customers && `Best-fit customers: ${row.best_fit_customers}`,
    row.market_category && `Market category: ${row.market_category}`,
    row.category_rationale && `Category rationale: ${row.category_rationale}`,
    row.current_tagline && `Tagline: ${row.current_tagline}`,
    extractJsonNames(row.competitive_alternatives_json) &&
      `Competitive alternatives: ${extractJsonNames(row.competitive_alternatives_json)}`,
    extractJsonNames(row.unique_attributes_json) &&
      `Unique attributes: ${extractJsonNames(row.unique_attributes_json)}`,
  ].filter(Boolean).join("\n");
}

function buildRouteText(row: RouteRow): string {
  return [
    row.title && `Route: ${row.title}`,
    row.short_description && `Description: ${row.short_description}`,
    row.rejected_alternatives && `Rejected alternatives: ${row.rejected_alternatives}`,
    row.what_would_have_to_be_true && `What would have to be true: ${row.what_would_have_to_be_true}`,
  ].filter(Boolean).join("\n");
}

function buildOpportunityText(row: OpportunityRow): string {
  return [
    row.desired_outcome && `Desired outcome: ${row.desired_outcome}`,
    row.odi_canonical_statement && `ODI statement: ${row.odi_canonical_statement}`,
  ].filter(Boolean).join("\n");
}

// ── Drift assessment schema ───────────────────────────────────────────────────

const driftSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    drift_state: {
      type: "string",
      enum: ["aligned", "slight_drift", "material_drift"],
    },
    score: { type: "number" },
    reason: { type: "string" },
  },
  required: ["drift_state", "score", "reason"],
};

const DRIFT_SYSTEM_PROMPT = `You are a strategic evidence analyst. Given a surface's current content and a set of new signals that weren't present when the surface was last reviewed, decide whether the surface remains well-supported by current evidence.

Reply with JSON matching the schema exactly:
  drift_state: 'aligned' | 'slight_drift' | 'material_drift'
  score: 0.0–1.0 (1.0 = strong material drift, 0.0 = clearly aligned)
  reason: 1–2 plain sentences explaining the drift state

Definitions:
- aligned: new signals are consistent with or don't contradict the surface content
- slight_drift: new signals suggest the surface could use minor refinement but isn't structurally wrong
- material_drift: new signals suggest the surface is substantively misaligned with current evidence

Be concrete. Reference specific signals if they drive the assessment.`;

// ── Signal content type ───────────────────────────────────────────────────────

type SignalRow = {
  id: string;
  claim_text: string | null;
  evidence_excerpt: string | null;
  topic: string | null;
  signal_band: string | null;
  evidence_type: string | null;
};

function formatSignalForPrompt(s: SignalRow, index: number): string {
  return [
    `Signal ${index + 1} [${s.signal_band ?? ""}/${s.evidence_type ?? ""}]:`,
    s.topic && `Topic: ${s.topic}`,
    s.claim_text && `Claim: ${s.claim_text}`,
    s.evidence_excerpt && `Excerpt: ${s.evidence_excerpt}`,
  ].filter(Boolean).join(" ");
}

// ── Assessment writer ─────────────────────────────────────────────────────────

type AssessmentPayload = {
  company_id: string;
  surface_type: string;
  surface_id: string;
  drift_score: number;
  drift_state: string;
  llm_confirmation: string | null;
  assessment_basis: unknown;
  last_assessed_at: string;
  // Per-assessment acceptance law: present (as null) only on alerting assessments.
  accepted_as_aligned_at?: null;
  operator_seen_at?: null;
};

async function upsertAssessment(supabase: ReturnType<typeof createClient>, payload: AssessmentPayload) {
  const existing = await supabase
    .from("surface_drift_assessments")
    .select("id")
    .eq("company_id", payload.company_id)
    .eq("surface_type", payload.surface_type)
    .eq("surface_id", payload.surface_id)
    .maybeSingle();

  if (existing.data?.id) {
    await supabase
      .from("surface_drift_assessments")
      .update(payload)
      .eq("id", existing.data.id);
  } else {
    await supabase.from("surface_drift_assessments").insert(payload);
  }
}

// ── Per-surface assessment logic ──────────────────────────────────────────────

type AssessResult = { surfaceId: string; drift_state: string } | null;

async function assessSurface(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  companyId: string,
  surfaceType: string,
  surfaceId: string,
  surfaceText: string,
  baselineIds: string[],
  currentActiveIds: string[],
): Promise<AssessResult> {
  const baselineSet = new Set(baselineIds);
  const newSignalIds = currentActiveIds.filter((id) => !baselineSet.has(id));

  if (newSignalIds.length === 0) {
    console.log(`[assess-surface-drift] ${surfaceType}/${surfaceId}: empty diff → aligned (fast-path)`);
    await recordIntegrityRun(supabase as unknown as { from: (t: string) => any }, {
      company_id: companyId, component: "drift_scan", surface_type: surfaceType, surface_id: surfaceId,
      status: "completed", examined: 0, admitted: 0,
      excluded_by_rule: { fast_path: "empty_diff" },
    });
    await upsertAssessment(supabase, {
      company_id: companyId,
      surface_type: surfaceType,
      surface_id: surfaceId,
      drift_score: 0,
      drift_state: "aligned",
      llm_confirmation: null,
      assessment_basis: { new_signals: [] },
      last_assessed_at: new Date().toISOString(),
    });
    return { surfaceId, drift_state: "aligned" };
  }

  // Fetch content of new signals (cap at 30 to keep prompt manageable)
  const candidateIds = newSignalIds.slice(0, 30);
  const { data: signalRows, error: sigErr } = await supabase
    .from("signals")
    .select("id, claim_text, evidence_excerpt, topic, signal_band, evidence_type")
    .in("id", candidateIds);

  if (sigErr) {
    console.error(`[assess-surface-drift] ${surfaceType}/${surfaceId}: signal fetch error:`, sigErr.message);
    await recordIntegrityRun(supabase as unknown as { from: (t: string) => any }, {
      company_id: companyId, component: "drift_scan", surface_type: surfaceType, surface_id: surfaceId,
      status: "failed", error: `signal fetch: ${sigErr.message}`,
    });
    return null;
  }

  const signals = (signalRows ?? []) as SignalRow[];
  const signalBlock = signals.map(formatSignalForPrompt).join("\n\n");
  const userText = `SURFACE CONTENT:\n${surfaceText}\n\nNEW SIGNALS (${signals.length}):\n${signalBlock}`;

  let llmResult: { drift_state: string; score: number; reason: string };
  try {
    llmResult = await callOpenAIJSON({
      apiKey,
      model: "gpt-4.1-mini",
      schemaName: "drift_assessment",
      schema: driftSchema,
      systemText: DRIFT_SYSTEM_PROMPT,
      userText,
      maxOutputTokens: 400,
      temperature: 0.1,
    }) as { drift_state: string; score: number; reason: string };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[assess-surface-drift] ${surfaceType}/${surfaceId}: LLM error: ${message}`);
    await recordIntegrityRun(supabase as unknown as { from: (t: string) => any }, {
      company_id: companyId, component: "drift_scan", surface_type: surfaceType, surface_id: surfaceId,
      status: "failed", error: `LLM: ${message}`, examined: signals.length,
    });
    return null;
  }

  const validStates = ["aligned", "slight_drift", "material_drift"];
  if (!validStates.includes(llmResult.drift_state)) {
    console.error(`[assess-surface-drift] ${surfaceType}/${surfaceId}: unexpected drift_state: ${llmResult.drift_state}`);
    await recordIntegrityRun(supabase as unknown as { from: (t: string) => any }, {
      company_id: companyId, component: "drift_scan", surface_type: surfaceType, surface_id: surfaceId,
      status: "failed", error: `invalid drift_state from model: ${llmResult.drift_state}`, examined: signals.length,
    });
    return null;
  }

  console.log(`[assess-surface-drift] ${surfaceType}/${surfaceId}: ${llmResult.drift_state} (score=${llmResult.score})`);

  await upsertAssessment(supabase, {
    company_id: companyId,
    surface_type: surfaceType,
    surface_id: surfaceId,
    drift_score: llmResult.score,
    drift_state: llmResult.drift_state,
    llm_confirmation: llmResult.reason,
    assessment_basis: {
      new_signals: newSignalIds,
      top_candidates: candidateIds,
    },
    last_assessed_at: new Date().toISOString(),
    // Per-assessment acceptance law (operator-signed at the integrity gate; same fix
    // as reconcile-market-definition): "I accept this" is a judgment about THAT
    // assessment, never a permanent waiver. An alerting assessment is a NEW
    // assessment — prior acceptance must not mute it, and the operator hasn't seen
    // it yet. Aligned updates leave operator state untouched.
    ...(llmResult.drift_state !== "aligned" ? { accepted_as_aligned_at: null, operator_seen_at: null } : {}),
  });

  await recordIntegrityRun(supabase as unknown as { from: (t: string) => any }, {
    company_id: companyId, component: "drift_scan", surface_type: surfaceType, surface_id: surfaceId,
    status: "completed", examined: signals.length,
    excluded_by_rule: { drift_state: llmResult.drift_state, score: llmResult.score },
  });
  return { surfaceId, drift_state: llmResult.drift_state };
}

// ── Surface loaders ───────────────────────────────────────────────────────────

async function assessCascades(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  companyId: string,
  currentActiveIds: string[],
  filterSurfaceId?: string,
): Promise<{ aligned: number; slight_drift: number; material_drift: number; assessed: number }> {
  const query = supabase
    .from("strategy_cascades")
    .select("id, winning_aspiration, where_to_play, how_to_win, capabilities_json, management_systems_json, assumptions_json, evidence_baseline_signal_ids, evidence_baseline_captured_at, artifact_role, provenance_type")
    .eq("company_id", companyId)
    .eq("artifact_role", "market_read");

  if (filterSurfaceId) query.eq("id", filterSurfaceId);

  const { data: fetched, error } = await query;
  if (error) { console.error("[assess-surface-drift] cascade fetch:", error.message); return { aligned: 0, slight_drift: 0, material_drift: 0, assessed: 0 }; }
  // Gate 3a: this assessor ships artifact content to the external model.
  const cascadeGate = await gateStrategyArtifactsForExternal({
    supabase: supabase as unknown as { from: (t: string) => any },
    companyId,
    artifacts: (fetched ?? []) as Array<{ artifact_role?: string | null; provenance_type?: string | null }>,
    artifactKind: "strategy_cascade",
    consumer: "assess-surface-drift",
  });
  const data = cascadeGate.admissible;

  const counts = { aligned: 0, slight_drift: 0, material_drift: 0, assessed: 0 };
  for (const row of (data ?? []) as CascadeRow[]) {
    if (!row.evidence_baseline_signal_ids || !row.evidence_baseline_captured_at) {
      console.log(`[assess-surface-drift] cascade/${row.id}: no baseline — skipping`);
      // Integrity: a surface skipped for lack of an evidence baseline is a recorded
      // outcome, not silence — found live during integrity validation (IAQM canvas).
      await recordIntegrityRun(supabase as unknown as { from: (t: string) => any }, {
        company_id: companyId, component: "drift_scan", surface_type: "cascade", surface_id: row.id,
        status: "skipped_empty_input", excluded_by_rule: { reason: "no_evidence_baseline" },
      });
      continue;
    }
    const result = await assessSurface(
      supabase, apiKey, companyId, "cascade", row.id,
      buildCascadeText(row),
      row.evidence_baseline_signal_ids,
      currentActiveIds,
    );
    if (result) {
      counts.assessed++;
      counts[result.drift_state as keyof typeof counts]++;
    }
  }
  return counts;
}

async function assessPositioning(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  companyId: string,
  currentActiveIds: string[],
  filterSurfaceId?: string,
): Promise<{ aligned: number; slight_drift: number; material_drift: number; assessed: number }> {
  const query = supabase
    .from("positioning_canvases")
    .select("id, value_for_customer, best_fit_customers, market_category, category_rationale, current_tagline, competitive_alternatives_json, unique_attributes_json, evidence_baseline_signal_ids, evidence_baseline_captured_at, artifact_role, provenance_type")
    .eq("company_id", companyId)
    .eq("artifact_role", "market_read");

  if (filterSurfaceId) query.eq("id", filterSurfaceId);

  const { data: fetched, error } = await query;
  if (error) { console.error("[assess-surface-drift] positioning fetch:", error.message); return { aligned: 0, slight_drift: 0, material_drift: 0, assessed: 0 }; }
  const canvasGate = await gateStrategyArtifactsForExternal({
    supabase: supabase as unknown as { from: (t: string) => any },
    companyId,
    artifacts: (fetched ?? []) as Array<{ artifact_role?: string | null; provenance_type?: string | null }>,
    artifactKind: "positioning_canvas",
    consumer: "assess-surface-drift",
  });
  const data = canvasGate.admissible;

  const counts = { aligned: 0, slight_drift: 0, material_drift: 0, assessed: 0 };
  for (const row of (data ?? []) as PositioningRow[]) {
    if (!row.evidence_baseline_signal_ids || !row.evidence_baseline_captured_at) {
      console.log(`[assess-surface-drift] positioning/${row.id}: no baseline — skipping`);
      // Integrity: a surface skipped for lack of an evidence baseline is a recorded
      // outcome, not silence — found live during integrity validation (IAQM canvas).
      await recordIntegrityRun(supabase as unknown as { from: (t: string) => any }, {
        company_id: companyId, component: "drift_scan", surface_type: "positioning", surface_id: row.id,
        status: "skipped_empty_input", excluded_by_rule: { reason: "no_evidence_baseline" },
      });
      continue;
    }
    const result = await assessSurface(
      supabase, apiKey, companyId, "positioning", row.id,
      buildPositioningText(row),
      row.evidence_baseline_signal_ids,
      currentActiveIds,
    );
    if (result) {
      counts.assessed++;
      counts[result.drift_state as keyof typeof counts]++;
    }
  }
  return counts;
}

async function assessRoutes(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  companyId: string,
  currentActiveIds: string[],
  filterSurfaceId?: string,
): Promise<{ aligned: number; slight_drift: number; material_drift: number; assessed: number }> {
  const query = supabase
    .from("routes")
    .select("id, title, short_description, rejected_alternatives, what_would_have_to_be_true, evidence_baseline_signal_ids, evidence_baseline_captured_at, provenance_type")
    .eq("company_id", companyId)
    .eq("relevance_state", "active");

  if (filterSurfaceId) query.eq("id", filterSurfaceId);

  const { data, error } = await query;
  if (error) { console.error("[assess-surface-drift] routes fetch:", error.message); return { aligned: 0, slight_drift: 0, material_drift: 0, assessed: 0 }; }

  // DECL-OPP 1a — Option-B privacy gate: only public-derived routes may cross the
  // external boundary; declared/internal/NULL-provenance routes are skipped here,
  // before any surface text is assembled (fail-closed).
  const routeGate = await gateDriftSurfacesForExternal({
    supabase: supabase as unknown as { from: (t: string) => any },
    companyId,
    surfaceType: "route",
    rows: (data ?? []) as RouteRow[],
    consumer: "assess-surface-drift",
  });

  const counts = { aligned: 0, slight_drift: 0, material_drift: 0, assessed: 0 };
  for (const row of routeGate.admissible) {
    if (!row.evidence_baseline_signal_ids || !row.evidence_baseline_captured_at) {
      console.log(`[assess-surface-drift] route/${row.id}: no baseline — skipping`);
      // Integrity: a surface skipped for lack of an evidence baseline is a recorded
      // outcome, not silence — found live during integrity validation (IAQM canvas).
      await recordIntegrityRun(supabase as unknown as { from: (t: string) => any }, {
        company_id: companyId, component: "drift_scan", surface_type: "route", surface_id: row.id,
        status: "skipped_empty_input", excluded_by_rule: { reason: "no_evidence_baseline" },
      });
      continue;
    }
    const result = await assessSurface(
      supabase, apiKey, companyId, "route", row.id,
      buildRouteText(row),
      row.evidence_baseline_signal_ids,
      currentActiveIds,
    );
    if (result) {
      counts.assessed++;
      counts[result.drift_state as keyof typeof counts]++;
    }
  }
  return counts;
}

async function assessOpportunities(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  companyId: string,
  currentActiveIds: string[],
  filterSurfaceId?: string,
): Promise<{ aligned: number; slight_drift: number; material_drift: number; assessed: number }> {
  const query = supabase
    .from("odi_needs")
    .select("id, desired_outcome, odi_canonical_statement, evidence_baseline_signal_ids, evidence_baseline_captured_at, provenance_type")
    .eq("company_id", companyId);

  if (filterSurfaceId) query.eq("id", filterSurfaceId);

  const { data, error } = await query;
  if (error) { console.error("[assess-surface-drift] odi_needs fetch:", error.message); return { aligned: 0, slight_drift: 0, material_drift: 0, assessed: 0 }; }

  // DECL-OPP 1a — Option-B privacy gate: only public-derived opportunities may cross
  // the external boundary; declared (internal_declared) / manual-curated / NULL-
  // provenance opportunities are skipped here, before any surface text is assembled.
  // This is the live leak fix — declared opportunity text never reaches OpenAI.
  const oppGate = await gateDriftSurfacesForExternal({
    supabase: supabase as unknown as { from: (t: string) => any },
    companyId,
    surfaceType: "opportunity",
    rows: (data ?? []) as OpportunityRow[],
    consumer: "assess-surface-drift",
  });

  const counts = { aligned: 0, slight_drift: 0, material_drift: 0, assessed: 0 };
  for (const row of oppGate.admissible) {
    if (!row.evidence_baseline_signal_ids || !row.evidence_baseline_captured_at) {
      console.log(`[assess-surface-drift] opportunity/${row.id}: no baseline — skipping`);
      // Integrity: a surface skipped for lack of an evidence baseline is a recorded
      // outcome, not silence — found live during integrity validation (IAQM canvas).
      await recordIntegrityRun(supabase as unknown as { from: (t: string) => any }, {
        company_id: companyId, component: "drift_scan", surface_type: "opportunity", surface_id: row.id,
        status: "skipped_empty_input", excluded_by_rule: { reason: "no_evidence_baseline" },
      });
      continue;
    }
    const result = await assessSurface(
      supabase, apiKey, companyId, "opportunity", row.id,
      buildOpportunityText(row),
      row.evidence_baseline_signal_ids,
      currentActiveIds,
    );
    if (result) {
      counts.assessed++;
      counts[result.drift_state as keyof typeof counts]++;
    }
  }
  return counts;
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return jsonResponse({ error: "OPENAI_API_KEY not configured" }, 500);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) return jsonResponse({ error: "Supabase env vars missing" }, 500);

  const supabase = createClient(supabaseUrl, supabaseKey);

  let body: { company_id?: string; surface_type?: string; surface_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { company_id, surface_type, surface_id } = body;
  if (!company_id) return jsonResponse({ error: "company_id is required" }, 400);

  if ((surface_type && !surface_id) || (!surface_type && surface_id)) {
    return jsonResponse({ error: "Provide both surface_type and surface_id, or neither" }, 400);
  }

  // Fetch current active signal IDs once for the company
  const { data: signalIdRows, error: signalIdErr } = await supabase
    .from("signals")
    .select("id")
    .eq("company_id", company_id)
    .eq("relevance_state", "active");

  if (signalIdErr) {
    return jsonResponse({ error: `Signal fetch failed: ${signalIdErr.message}` }, 500);
  }

  const currentActiveIds = ((signalIdRows ?? []) as { id: string }[]).map((r) => r.id);
  console.log(`[assess-surface-drift] company=${company_id}: ${currentActiveIds.length} active signals`);

  const totals = { assessed: 0, aligned: 0, slight_drift: 0, material_drift: 0 };

  function merge(counts: { assessed: number; aligned: number; slight_drift: number; material_drift: number }) {
    totals.assessed += counts.assessed;
    totals.aligned += counts.aligned;
    totals.slight_drift += counts.slight_drift;
    totals.material_drift += counts.material_drift;
  }

  const surfaceTypes = surface_type
    ? [surface_type]
    : ["cascade", "positioning", "route", "opportunity"];

  for (const st of surfaceTypes) {
    const filterId = surface_type ? surface_id : undefined;
    switch (st) {
      case "cascade":
        merge(await assessCascades(supabase, apiKey, company_id, currentActiveIds, filterId));
        break;
      case "positioning":
        merge(await assessPositioning(supabase, apiKey, company_id, currentActiveIds, filterId));
        break;
      case "route":
        merge(await assessRoutes(supabase, apiKey, company_id, currentActiveIds, filterId));
        break;
      case "opportunity":
        merge(await assessOpportunities(supabase, apiKey, company_id, currentActiveIds, filterId));
        break;
      default:
        return jsonResponse({ error: `Unknown surface_type: ${st}` }, 400);
    }
  }

  return jsonResponse(totals);
});