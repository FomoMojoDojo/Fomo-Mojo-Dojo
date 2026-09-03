// outside-score — the SERVER-SIDE home for the outside Mojo Score (computeOutsideScore, outside-v1.1.0).
//
// Closes orphan #6: the pure, deterministic, insert-only outside-score producer had NO production caller
// (the 30 existing rows were a one-time 08-21/22 batch), so every company born/refreshed since rendered
// "Not enough public signal to score yet" for want of a PRODUCER, not signal. This thin fn wraps the
// pure compute: it assembles inputs through outside_score_inputs (the batch predicates, ONE SQL home),
// runs the UNCHANGED formula (src/lib — formulas live once), and writes an insert-only mojo_scores row
// on eligible, else a first_read_outside_score integrity record on ineligible. NEVER on CB1.
//
// It self-gates (frozen → first-fill → dependencies), so BOTH triggers — the fill (deps already terminal)
// and the recurrence-step finalize (deps terminal once recurrence lands) — fire it fire-and-forget on one
// path; the first-fill check makes the second a no-op. It reads the recurrence-accepted set that exists,
// so a non-'completed' recurrence terminal still scores (flagged in the integrity note).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  computeOutsideScore,
  OUTSIDE_METHODOLOGY_VERSION,
  type OutsideDeltaInput,
  type OutsideSignalInput,
} from "../../../src/lib/outsideScore/computeOutsideScore.ts";
import { outsideScoreDepsTerminal, outsideScoreFirstFill, type DepRow } from "../_shared/firstReadFill.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

const RECORD_COMPONENT = "first_read_outside_score";
const THRESHOLD = 10; // mirrors OUTSIDE_MIN_SIGNALS — the eligibility floor, surfaced in the record

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient(url, key) as unknown as { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any };

  let company_id = "";
  try { const b = await req.json(); company_id = String(b.company_id ?? ""); } catch { /* */ }
  if (!company_id) return json({ ok: false, error: "company_id required" }, 400);

  // FROZEN GUARD (first door) — CB1 refused before ANY read/compute/write.
  {
    const { data: co } = await supabase.from("companies").select("frozen").eq("id", company_id).maybeSingle();
    if (co && (co as { frozen?: boolean }).frozen) return json({ ok: false, error: "outside score refused: company is frozen", frozen: true }, 403);
  }

  // Current baseline run (the re-arm key for the ineligible record).
  const { data: brRow } = await supabase.from("public_baseline_runs")
    .select("id").eq("company_id", company_id).order("id", { ascending: false }).limit(1).maybeSingle();
  const currentBaselineRunId = brRow ? String((brRow as { id: number | string }).id) : null;

  // FIRST-FILL — skip if already scored (any baseline) OR an outside-score record already stands for THIS
  // baseline run (a newer baseline re-arms). Never double-scores under the two-trigger convergence.
  const { data: scoreRow } = await supabase.from("mojo_scores")
    .select("id").eq("company_id", company_id).like("methodology_version", "outside-%").limit(1).maybeSingle();
  const { data: recRow } = await supabase.from("integrity_runs")
    .select("excluded_by_rule").eq("company_id", company_id).eq("component", RECORD_COMPONENT)
    .order("ran_at", { ascending: false }).limit(1).maybeSingle();
  const recordBaselineRunId = recRow
    ? (((recRow as { excluded_by_rule?: { baseline_run_id?: unknown } | null }).excluded_by_rule?.baseline_run_id ?? null) as string | number | null)
    : null;
  const fill = outsideScoreFirstFill({
    hasOutsideScoreRow: !!scoreRow,
    recordBaselineRunId: recordBaselineRunId === null ? null : String(recordBaselineRunId),
    currentBaselineRunId,
  });
  if (fill === "skip") return json({ ok: true, skipped: "first_fill", scored: !!scoreRow });

  // DEPENDENCY GATE — score only after BOTH public gap-pairs AND signal recurrence have terminated.
  const { data: gpRow } = await supabase.from("long_runner_runs")
    .select("status, error_text").eq("company_id", company_id).eq("run_kind", "fr_public_gap_pairs")
    .order("started_at", { ascending: false }).limit(1).maybeSingle();
  const { data: rcRow } = await supabase.from("long_runner_runs")
    .select("status, error_text").eq("company_id", company_id).eq("run_kind", "recurrence_step")
    .order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (!outsideScoreDepsTerminal(gpRow as DepRow, rcRow as DepRow)) {
    return json({ ok: true, skipped: "deps_pending", gap_pairs: (gpRow as { status?: string } | null)?.status ?? null, recurrence: (rcRow as { status?: string } | null)?.status ?? null });
  }
  const recurrenceCompleted = (rcRow as { status?: string } | null)?.status === "completed";

  // INPUTS — one authoritative SQL home (the batch predicates), never model-emitted.
  const { data: inputs, error: inErr } = await supabase.rpc("outside_score_inputs", { p_company: company_id });
  if (inErr) return json({ ok: false, error: `input assembly failed: ${inErr.message}` }, 500);
  const raw = (inputs ?? {}) as { signals?: unknown[]; deltas?: unknown[] };
  const signals: OutsideSignalInput[] = (Array.isArray(raw.signals) ? raw.signals : []).map((s) => {
    const r = s as Record<string, unknown>;
    return {
      id: String(r.id), sourceType: (r.source_type ?? null) as string | null, sourceUrl: (r.source_url ?? null) as string | null,
      eventDate: (r.event_date ?? null) as string | null, confidence: (r.confidence ?? null) as string | null,
      recurrenceConfirmed: r.recurrence_confirmed === true,
    };
  });
  const deltas: OutsideDeltaInput[] = (Array.isArray(raw.deltas) ? raw.deltas : []).map((d) => {
    const r = d as Record<string, unknown>;
    return { id: String(r.id), deltaType: r.delta_type as OutsideDeltaInput["deltaType"], declaredClaimId: (r.declared_claim_id ?? null) as string | null, declaredTopic: (r.declared_topic ?? null) as string | null };
  });

  const computedAt = new Date().toISOString();
  const result = computeOutsideScore({ companyId: company_id, signals, deltas, computedAt, recurrenceComputed: true });

  // The persisted honesty record — never-fired (no row) vs fired-and-ineligible vs scored — carries the
  // re-arm key (baseline_run_id) + the counts the beat / operator reads.
  const writeRecord = async (state: "scored" | "ineligible", extra: Record<string, unknown>) => {
    const { error } = await supabase.from("integrity_runs").insert({
      company_id, component: RECORD_COMPONENT, status: "completed",
      examined: result.signalCount, admitted: state === "scored" ? 1 : 0,
      excluded_by_rule: { state, baseline_run_id: currentBaselineRunId, threshold: THRESHOLD, eligible_signals: result.signalCount, recurrence_completed: recurrenceCompleted, ...extra },
    });
    if (error) throw new Error(`outside-score integrity insert failed: ${error.message}`);
  };

  if (!result.eligible) {
    await writeRecord("ineligible", {});
    return json({ ok: true, outcome: "ineligible", eligible_signals: result.signalCount, threshold: THRESHOLD });
  }

  // ELIGIBLE — insert-only mojo_scores row (outside-v1.1.0) with the full input_ledger (vacuous-proof).
  const component_scores: Record<string, unknown> = {
    anchor: { value: result.anchor, explanation: "Research base rate for strategy success (sub-20%)." },
  };
  const explanation: Record<string, unknown> = {
    methodology: "Anchor + micro-moves, read from outside-voice public signals only.",
    signal_count: result.signalCount,
  };
  for (const m of result.moves) {
    component_scores[m.key] = m.computed === false ? { value: null, min: m.min, max: m.max, not_computed: true } : { value: m.value, min: m.min, max: m.max };
    explanation[m.key] = m.explanation;
  }
  const { error: insErr } = await supabase.from("mojo_scores").insert({
    company_id, computed_at: result.computedAt, total_score: result.totalScore,
    component_scores, explanation, methodology_version: OUTSIDE_METHODOLOGY_VERSION, input_ledger: result.inputLedger,
  });
  if (insErr) return json({ ok: false, error: `mojo_scores insert failed: ${insErr.message}` }, 500);
  await writeRecord("scored", { total_score: result.totalScore, methodology: OUTSIDE_METHODOLOGY_VERSION });

  return json({ ok: true, outcome: "scored", total_score: result.totalScore, eligible_signals: result.signalCount, recurrence_completed: recurrenceCompleted });
});
