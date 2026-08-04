// RB-1 Stage 3: the claim rebuild writes its OWN start/outcome marker.
//
// Before this, the rebuild had no status of its own. The public_baseline_runs
// result_json.status field is the GENERATION-quality signal (ok / weak-evidence
// variants), consumed as such by six downstream functions (isWeakStatus gating) —
// it is NOT the rebuild's status and must not be overloaded with one, or that
// gating breaks. The baseline-level long_runner_runs conflates generation+ingest.
//
// withRebuildLedger gives the rebuild a dedicated long_runner_runs row
// (run_kind='claim_rebuild'), following the established start→terminal pattern:
//   - START: insert status='running' BEFORE the work.
//   - SUCCESS: update status='completed', done_count, finished_at.
//   - FAILURE: update status='failed', error_text, finished_at, then rethrow.
//   - KILLED mid-work (isolate terminated): neither terminal update runs, so the
//     row is left at 'running' — an unfinished rebuild is now VISIBLE (a stuck
//     'running' marker), where before result_json.status='ok' hid it entirely.
// The marker is deliberately OUTSIDE the transactional apply: it records the
// attempt and its outcome even when the apply rolls back.

type LedgerDb = {
  from: (t: string) => {
    insert: (v: unknown) => { select: (c: string) => { single: () => Promise<{ data: unknown }> } };
    update: (v: unknown) => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
  };
};

export async function withRebuildLedger<T>(
  supabase: LedgerDb,
  companyId: string,
  targetCount: number,
  fn: () => Promise<T>,
  runKind = "claim_rebuild",
): Promise<T> {
  let ledgerId: string | null = null;
  try {
    const { data } = await supabase
      .from("long_runner_runs")
      .insert({ run_kind: runKind, company_id: companyId, status: "running", target_count: Math.max(1, targetCount) })
      .select("id")
      .single();
    ledgerId = (data as { id?: unknown } | null)?.id ? String((data as { id: unknown }).id) : null;
  } catch (_startErr) {
    // Non-fatal: a ledger start failure must never break the rebuild itself.
    ledgerId = null;
  }

  try {
    const result = await fn();
    if (ledgerId) {
      const nowIso = new Date().toISOString();
      await supabase
        .from("long_runner_runs")
        .update({ status: "completed", done_count: targetCount, finished_at: nowIso, updated_at: nowIso })
        .eq("id", ledgerId);
    }
    return result;
  } catch (err) {
    if (ledgerId) {
      const nowIso = new Date().toISOString();
      await supabase
        .from("long_runner_runs")
        .update({
          status: "failed",
          error_text: String((err as { message?: unknown })?.message ?? err),
          finished_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", ledgerId);
    }
    throw err;
  }
}
