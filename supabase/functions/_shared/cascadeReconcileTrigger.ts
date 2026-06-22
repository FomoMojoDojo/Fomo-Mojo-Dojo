// Cascade reconciler trigger (Phase 3a) — sibling of fireMarketReconcile, same
// family/mechanism: reconcile-cascade fires whenever either side of the cascade
// comparison changes — (a) local-strategy-synthesis writes the declared_direction
// cascade, (b) refresh-cascade writes the market_read cascade. It rides the CHANGE
// event only; the compare is local (qwen/70b) and is NOT wedged into refresh-cascade's
// OpenAI generation.
//
// ISOLATION LAW (inherited): a broken reconcile must never break the run that
// triggered it. Awaited HTTP invoke, every outcome swallowed + recorded; a failed or
// unreachable reconcile writes its own cascade_reconcile failed integrity row.

import { recordIntegrityRun } from "./integrity.ts";

export async function fireCascadeReconcile(opts: {
  supabase: { from: (t: string) => any };
  companyId: string;
  source: "declared_direction_change" | "market_read_change";
}): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.warn("[cascade-reconcile-trigger] env missing — reconcile NOT fired", { source: opts.source });
      void recordIntegrityRun(opts.supabase, {
        company_id: opts.companyId, component: "cascade_reconcile", status: "failed",
        error: `trigger(${opts.source}): SUPABASE_URL/SERVICE_ROLE_KEY missing in runtime env`,
        run_ref: `trigger:${opts.source}`,
      });
      return;
    }
    console.log("[cascade-reconcile-trigger] firing", { company_id: opts.companyId, source: opts.source });
    const call = fetch(`${supabaseUrl}/functions/v1/reconcile-cascade`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ company_id: opts.companyId }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          const gatewayNote = res.status === 504
            ? " (gateway timeout — the reconcile may still complete server-side; a completed record supersedes this one)"
            : "";
          await recordIntegrityRun(opts.supabase, {
            company_id: opts.companyId, component: "cascade_reconcile", status: "failed",
            error: `trigger(${opts.source}): reconcile HTTP ${res.status}${gatewayNote} ${body.slice(0, 300)}`,
            run_ref: `trigger:${opts.source}`,
          });
        } else {
          console.log("[cascade-reconcile-trigger] reconcile completed", { source: opts.source });
        }
      })
      .catch(async (error) => {
        await recordIntegrityRun(opts.supabase, {
          company_id: opts.companyId, component: "cascade_reconcile", status: "failed",
          error: `trigger(${opts.source}): unreachable — ${String(error instanceof Error ? error.message : error).slice(0, 300)}`,
          run_ref: `trigger:${opts.source}`,
        });
      });
    // Awaited: the .then/.catch chain swallows every outcome, so this can delay the
    // parent but never throw into it.
    await call;
  } catch (error) {
    console.warn("[cascade-reconcile-trigger] dispatch failed (parent unaffected)", {
      message: String(error instanceof Error ? error.message : error).slice(0, 200),
    });
  }
}
