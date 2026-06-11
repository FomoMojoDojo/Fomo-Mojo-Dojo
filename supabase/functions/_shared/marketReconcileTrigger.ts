// Reconciler trigger (queue item, 2026-06-11): reconcile-market-definition fires
// itself whenever either side of the market comparison gains new information —
// (a) a public-baseline run completes, (b) a competitor-discovery run completes,
// (c) odi_market_definitions content changes (every edge writer is wired; direct
// SQL edits bypass by design — documented residual, DB-trigger infra rejected for
// the local stack).
//
// MECHANISM: direct AWAITED HTTP invocation from the parent edge function, with every
// failure swallowed and recorded — the parent can never fail because of it, it only
// finishes a little later. Chosen over DB triggers/queues (no pg_net or queue infra
// on the local stack) and over EdgeRuntime.waitUntil/fire-and-forget: validated live
// that a detached promise dies with the parent isolate on this runtime — the trigger
// logged "firing" and the reconcile never ran, with no failure record. A silent gap
// is the exact failure mode this trigger exists to prevent, so the parent waits.
//
// ISOLATION LAW: a broken reconcile must never break the run that triggered it.
// Everything here is wrapped — the helper NEVER throws into the parent. A failed
// or unreachable reconcile writes its own integrity_runs failed row (loud, recorded,
// visible in the inbox's didn't-complete line), and the parent completes normally.

import { recordIntegrityRun } from "./integrity.ts";

export async function fireMarketReconcile(opts: {
  supabase: { from: (t: string) => any };
  companyId: string;
  source: "public_baseline_run" | "competitor_discovery_run" | "definition_change";
}): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.warn("[market-reconcile-trigger] env missing — reconcile NOT fired", { source: opts.source });
      void recordIntegrityRun(opts.supabase, {
        company_id: opts.companyId, component: "market_reconcile", status: "failed",
        error: `trigger(${opts.source}): SUPABASE_URL/SERVICE_ROLE_KEY missing in runtime env`,
        run_ref: `trigger:${opts.source}`,
      });
      return;
    }
    console.log("[market-reconcile-trigger] firing", { company_id: opts.companyId, source: opts.source });
    const call = fetch(`${supabaseUrl}/functions/v1/reconcile-market-definition`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ company_id: opts.companyId }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          console.warn("[market-reconcile-trigger] reconcile returned non-OK", { source: opts.source, status: res.status });
          // Kong times out at ~150s while the reconcile continues server-side (the
          // established 504 pattern): the failed row below is honest about that, and a
          // completed record written by the reconcile itself supersedes it as latest.
          const gatewayNote = res.status === 504
            ? " (gateway timeout — the reconcile may still complete server-side; a completed record supersedes this one)"
            : "";
          await recordIntegrityRun(opts.supabase, {
            company_id: opts.companyId, component: "market_reconcile", status: "failed",
            error: `trigger(${opts.source}): reconcile HTTP ${res.status}${gatewayNote} ${body.slice(0, 300)}`,
            run_ref: `trigger:${opts.source}`,
          });
        } else {
          console.log("[market-reconcile-trigger] reconcile completed", { source: opts.source });
        }
      })
      .catch(async (error) => {
        console.warn("[market-reconcile-trigger] reconcile unreachable", {
          source: opts.source,
          message: String(error instanceof Error ? error.message : error).slice(0, 200),
        });
        await recordIntegrityRun(opts.supabase, {
          company_id: opts.companyId, component: "market_reconcile", status: "failed",
          error: `trigger(${opts.source}): unreachable — ${String(error instanceof Error ? error.message : error).slice(0, 300)}`,
          run_ref: `trigger:${opts.source}`,
        });
      });

    // Awaited: the .then/.catch chain above swallows every outcome, so this await can
    // delay the parent but never throw into it.
    await call;
  } catch (error) {
    // Absolute backstop — trigger problems are recorded events, never parent failures.
    console.warn("[market-reconcile-trigger] dispatch failed (parent unaffected)", {
      message: String(error instanceof Error ? error.message : error).slice(0, 200),
    });
  }
}
