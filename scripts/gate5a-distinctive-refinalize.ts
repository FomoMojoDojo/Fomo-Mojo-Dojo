// ── Gate 5a — deterministic distinctive-floor re-finalize (Option A runner) ─────
//
// The small in-process runner for the DETERMINISTIC distinctive-floor re-finalize.
// Wraps _shared/signalRecurrence.recomputeFindingRecurrenceGated — NO model calls,
// NO re-clustering. It re-derives each existing finding_recurrence row for ONE
// company from ALREADY-PERSISTED state (cluster_signal_ids + eligible signals +
// accepted signal↔signal verdicts) under the Gate-5a DISTINCTIVE membership floor
// (brand/category tokens near-universal in the company's eligible corpus no longer
// satisfy the ≥2 floor — genericTokens over the eligible-signal corpus, θ=0.40),
// reconciling IN PLACE (idempotent; a no-change rerun is byte-identical).
//
//   • frozen-refusal — CB1 is refused in the core (FROZEN_COMPANY_IDS + live
//     companies.frozen) AND independently by the DB freeze trigger; this runner
//     adds an explicit CB1 guard as a third layer and never opens a ledger row for
//     a frozen company.
//   • per-company — one company_id per invocation; never a fan-out.
//   • ledger-last, failure-settable — long_runner_runs is written AFTER the compute
//     settles: a completed row on success, a failed row on throw. A dry run writes
//     nothing (no rows, no ledger).
//
// Run (dry):   SUPABASE_URL=http://127.0.0.1:54321 SRK=<service_role_key> \
//                deno run --allow-net --allow-env scripts/gate5a-distinctive-refinalize.ts <company_id>
// Run (write): ...same... scripts/gate5a-distinctive-refinalize.ts <company_id> write
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { recomputeFindingRecurrenceGated } from "../supabase/functions/_shared/signalRecurrence.ts";

const CB1 = "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc"; // frozen reference — never written
const RUN_KIND = "finding_recurrence_gated_recompute";

const url = Deno.env.get("SUPABASE_URL");
const key = Deno.env.get("SRK") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) throw new Error("SUPABASE_URL and SRK (service role key) are required.");

const companyId = Deno.args[0];
if (!companyId) throw new Error("usage: <company_id> [write]");
const doWrite = Deno.args[1] === "write";

// Explicit frozen guard (third layer over the core + DB trigger).
if (companyId === CB1) {
  console.error("REFUSED: CB1 is a frozen reference company — recurrence is never recomputed for it.");
  Deno.exit(2);
}

const supabase = createClient(url, key) as any;
const nowIso = new Date().toISOString();

let result;
try {
  result = await recomputeFindingRecurrenceGated({ supabase, companyId, nowIso, write: doWrite });
} catch (err) {
  // ledger-last (failure-settable): record a failed row for a write run.
  if (doWrite) {
    try {
      await supabase.from("long_runner_runs").insert({
        run_kind: RUN_KIND, company_id: companyId, status: "failed",
        error_text: String((err as Error)?.message ?? err), finished_at: new Date().toISOString(),
      });
    } catch { /* non-fatal */ }
  }
  console.error("COMPUTE FAILED:", String((err as Error)?.message ?? err));
  Deno.exit(1);
}

if (!result.ok) {
  if ("skipped" in result && result.skipped === "frozen_company") {
    console.error("REFUSED: frozen company (core guard).");
    Deno.exit(2);
  }
  console.error("ERROR:", (result as { error: string }).error);
  Deno.exit(1);
}

// ledger-last (success): a completed row, written after the compute settles.
let ledgerRowId: string | null = null;
if (doWrite) {
  try {
    const { data: row } = await supabase.from("long_runner_runs").insert({
      run_kind: RUN_KIND, company_id: companyId, status: "completed",
      target_count: result.findings.length, done_count: result.findings.length,
      finished_at: new Date().toISOString(),
    }).select("id").single();
    ledgerRowId = (row as { id?: unknown } | null)?.id ? String((row as { id: unknown }).id) : null;
  } catch (e) {
    console.error("[gate5a] ledger error (non-fatal)", String((e as Error)?.message ?? e));
  }
}

console.log(JSON.stringify({ dry_run: !doWrite, ledger_row_id: ledgerRowId, ...result }));
