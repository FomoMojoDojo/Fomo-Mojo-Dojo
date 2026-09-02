// ── Analysis-findings capture (shared) ───────────────────────────────────────────────────────────
//
// Auto-captures a run's analysis synthesis reads (voice_class='analysis' / raw_payload.source_type=
// 'analysis') as standing findings, and writes the first_read_findings INTEGRITY record with counts
// (seen / captured / skipped-and-why) so "What stands out" renders never-fired vs fired-and-empty from
// a persisted record — a silent empty beat is impossible.
//
// Idempotent by (company_id, origin_signal_id) — a re-capture over the same signals inserts nothing
// new. READS existing signals only; NO crawl, NO model. Used by the baseline ingest (per run) and by
// the company-scoped recapture-findings edge fn (backfill after the E4 analysis carve-out).
//
// On success writes a 'completed' integrity row; THROWS on a DB error so the caller can record a
// 'failed' (couldn't-check) integrity row — never a silent gap.

// deno-lint-ignore no-explicit-any
type AnySupabase = { from: (t: string) => any };

// first_read_* integrity uses a RAW integrity_runs insert (the IntegrityRecord union in ./integrity.ts
// is scoped to the reviewer components; first_read_findings/offering/gap_pairs/own_words all insert
// directly — see writeGapPairsIntegrity).
export const FINDINGS_INTEGRITY_COMPONENT = "first_read_findings";

export type CaptureCounts = { seen: number; captured: number; skippedEmptyBody: number };

export async function captureAnalysisFindings(
  supabase: AnySupabase,
  companyId: string,
  runId: string | number,
): Promise<CaptureCounts> {
  const runIdNum = Number(runId);
  const { data } = await supabase
    .from("signals")
    .select("id, claim_text, signal_band")
    .eq("company_id", companyId)
    .eq("source_type", "public_baseline_run")
    .eq("source_id", String(runId))
    .eq("raw_payload->>source_type", "analysis");
  const all = (Array.isArray(data) ? data : []) as Array<{ id: string; claim_text?: unknown; signal_band?: string | null }>;
  const seen = all.length;
  const withBody = all.filter((s) => typeof s.claim_text === "string" && s.claim_text.trim().length > 0);
  const skippedEmptyBody = seen - withBody.length;
  const findingRows = withBody.map((s) => ({
    company_id: companyId,
    origin_run_id: Number.isFinite(runIdNum) ? runIdNum : null,
    origin_signal_id: s.id,
    kind: "observation",
    body: s.claim_text as string,
    status: "open",
    // RG-2: register EARNED from the origin signal's band, never defaulted.
    register: s.signal_band === "outside" ? "public_inferred" : s.signal_band === "organization" ? "internal_inferred" : null,
  }));
  if (findingRows.length > 0) {
    const { error } = await supabase.from("findings").upsert(findingRows, { onConflict: "company_id,origin_signal_id", ignoreDuplicates: true });
    if (error) throw new Error(`findings upsert: ${error.message}`); // the real work — a throw records a 'failed' record via the caller
  }
  const { error: intErr } = await supabase.from("integrity_runs").insert({
    company_id: companyId, component: FINDINGS_INTEGRITY_COMPONENT, surface_type: null, surface_id: null,
    ran_at: new Date().toISOString(), status: "completed",
    examined: seen, admitted: findingRows.length, excluded_by_rule: { empty_body: skippedEmptyBody },
    error: null, run_ref: String(runId),
  });
  if (intErr) throw new Error(`findings integrity: ${intErr.message}`);
  return { seen, captured: findingRows.length, skippedEmptyBody };
}

/** 'failed' (couldn't-check) integrity record when capture throws — never a silent gap. Best-effort. */
export async function writeFindingsIntegrityFailed(
  supabase: AnySupabase,
  companyId: string,
  runId: string | number,
  err: unknown,
): Promise<void> {
  try {
    await supabase.from("integrity_runs").insert({
      company_id: companyId, component: FINDINGS_INTEGRITY_COMPONENT, surface_type: null, surface_id: null,
      ran_at: new Date().toISOString(), status: "failed", examined: null, admitted: null,
      excluded_by_rule: null, error: String(err instanceof Error ? err.message : err).slice(0, 500), run_ref: String(runId),
    });
  } catch { /* integrity write is best-effort */ }
}
