// first-read-fill — the FIRST-FILL AUTO-CHAIN stage (operator-signed 2026-09-01).
//
// Fired from public-baseline's tail after a successful baseline inside a full_refresh (chain:true). It
// generates ONLY what has no current row — the 4 public-read kinds (generate-public-read, external +
// judged) and market discovery (market-discovery-step, self-chaining, local). FIRST-FILL BY
// CONSTRUCTION: it enumerates MISSING kinds from the beats' emptiness predicates and passes only those,
// so it can never supersede a current row (regeneration stays a deliberate manual act). A kind failure
// (or judge/citation REJECT — never retried) is that kind's honest terminal, recorded per-kind; the
// parent full_refresh completes regardless. The first-read components (own-words/gap-pairs/questions/
// findings/relevance) are already produced by the baseline→mojo-analysis chain, not here.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  runFirstReadFill, missingPublicReadKinds, marketReadIsEmpty,
  type PublicReadKind, type GenPerKind, type KindStatus,
} from "../_shared/firstReadFill.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
function waitUntil(p: Promise<unknown>) {
  const edge = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (edge?.waitUntil) edge.waitUntil(p); else void p;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(url, key) as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

  let company_id = ""; let parent_run_id: string | null = null; let owns_parent_close = false;
  try { const b = await req.json(); company_id = String(b.company_id ?? ""); parent_run_id = b.parent_run_id != null ? String(b.parent_run_id) : null; owns_parent_close = b.owns_parent_close === true; } catch { /* */ }
  if (!company_id) return json({ ok: false, error: "company_id required" }, 400);

  // ── open the first_read_fill stage ledger (child of the full_refresh parent) ────────────────────
  let stageId: string | null = null;
  {
    const ins: Record<string, unknown> = { run_kind: "first_read_fill", company_id, status: "running", done_count: 0 };
    if (parent_run_id) ins.parent_run_id = parent_run_id;
    const { data } = await supabase.from("long_runner_runs").insert(ins).select("id").single();
    stageId = (data as { id?: unknown } | null)?.id ? String((data as { id: unknown }).id) : null;
  }

  // ── EMPTINESS PREDICATES (the beats' own queries) ───────────────────────────────────────────────
  const { data: prRows } = await supabase.from("public_reads").select("kind").eq("company_id", company_id).eq("is_current", true);
  const currentKinds = ((prRows ?? []) as Array<{ kind: string }>).map((r) => r.kind);
  const missingKinds = missingPublicReadKinds(currentKinds);

  const { data: mdRows } = await supabase.from("odi_market_definitions").select("market_register, job_executor").eq("company_id", company_id);
  const marketEmpty = marketReadIsEmpty((mdRows ?? []) as Array<{ market_register?: string | null; job_executor?: string | null }>);

  // per-kind child ledger row (run_kind fr_<kind>): completed / failed / completed_empty (skipped).
  const recordKindLedger = async (kind: string, status: KindStatus) => {
    const ins: Record<string, unknown> = {
      run_kind: `fr_${kind}`, company_id,
      status: status === "completed_empty" ? "completed" : status, // ledger CHECK allows only completed/failed/running
      done_count: status === "completed" ? 1 : 0,
      error_text: status === "completed_empty" ? "already current — first-fill no-op" : (status === "failed" ? "generation failed or judge/citation reject" : null),
      finished_at: new Date().toISOString(),
    };
    if (parent_run_id) ins.parent_run_id = parent_run_id;
    await supabase.from("long_runner_runs").insert(ins);
  };

  const generatePublicRead = async (kinds: PublicReadKind[]): Promise<{ perKind: GenPerKind }> => {
    const res = await fetch(`${url}/functions/v1/generate-public-read`, {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ company_id, write: true, kinds }),
    });
    let data: Record<string, unknown> | null = null;
    try { data = await res.json(); } catch { /* */ }
    const perKind: GenPerKind = {};
    const written = Array.isArray((data as { written?: unknown })?.written) ? (data as { written: Array<{ kind?: string }> }).written : [];
    const ok = res.ok && !!data && (data as { ok?: unknown }).ok !== false;
    if (ok && written.length > 0) {
      const w = new Set(written.map((x) => x.kind));
      for (const k of kinds) perKind[k] = w.has(k) ? "written" : "rejected"; // a judged reject leaves the kind out of `written`
    } else {
      for (const k of kinds) perKind[k] = "rejected"; // whole-run reject / error — honest terminal, never retried
    }
    return { perKind };
  };

  const fireMarketDiscovery = async () => {
    waitUntil(fetch(`${url}/functions/v1/market-discovery-step`, {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ company_id, parent_run_id }),
    }).catch(() => {}));
  };

  const closeParent = owns_parent_close && parent_run_id
    ? async () => { await supabase.from("long_runner_runs").update({ status: "completed", done_count: 0, error_text: "first read filled", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", parent_run_id); }
    : undefined;

  const result = await runFirstReadFill({ missingKinds, marketEmpty, generatePublicRead, recordKindLedger, fireMarketDiscovery, closeParent });

  // close the stage ledger: completed_empty (no-op) when nothing was missing, else completed (work done).
  if (stageId) {
    const empty = result.stageEmpty;
    await supabase.from("long_runner_runs").update({
      status: "completed", done_count: result.generated.length,
      error_text: empty ? "first-fill no-op — all reads current" : `filled: ${result.generated.join(",") || "none"}${result.failed.length ? ` · failed: ${result.failed.join(",")}` : ""}${result.marketFired ? " · market discovery fired" : ""}`,
      finished_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", stageId);
  }

  return json({ ok: true, ...result });
});
