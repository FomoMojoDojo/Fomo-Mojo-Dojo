// RELEVANCE BACKSTOP · stepper — the SERVER-SIDE self-chaining driver for the relevance backstop
// over ONE company (public_vs_public only). One isolate judges up to MAX_JUDGE rows, then
// self-chains via EdgeRuntime.waitUntil, so a company with many verdict rows drains across many
// isolates and never approaches the 400s wall / 150s edge ceiling. It REUSES
// backstop-delta-relevance verbatim as a pure worker (never modifies it) and records progress on
// a long_runner_runs row (run_kind='relevance_backstop') so a headless chain is visible.
//
// The backstop is deterministic and idempotent (already-stamped rows are skipped by the worker's
// `relevance_verdict IS NULL` load), so a died/retried isolate re-judges nothing already banked.
// A worker 403 (frozen) is a terminal, not a stall.
//
// WIRED (operator ruling 2026-09-03): fired fire-and-forget from every delta COMPLETED terminal
// (refresh-deltas-step finalize; first-read-fill's public_gap_pairs kind) so a recompute — whose
// stale sweep deletes the row-bound stamps — always leaves the company stamped again. ONE self-gating
// path: BEFORE find-or-create, relevanceBackstopNeedsFire (pure, _shared/firstReadFill.ts) counts the
// IS-NULL judgeable rows and looks for a live chain — zero unstamped ⇒ { skipped: "nothing_to_stamp" }
// with NO ledger row (a second finalize never spawns a second chain); a live row ⇒ adopted. Transient
// worker errors re-fire at most MAX_TRANSIENT_RETRIES times; on exhaustion the ledger row is closed
// failed with the last error — never left running.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { relevanceBackstopNeedsFire } from "../_shared/firstReadFill.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function waitUntil(promise: Promise<unknown>) {
  const edge = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (edge?.waitUntil) edge.waitUntil(promise); else void promise;
}

const RUN_KIND = "relevance_backstop";
const CHAIN_WINDOW_MS = 25 * 60_000;
// Judge-rows per isolate. Each external gpt-4.1-mini judge call is ~1-2s; well under the ceiling.
const MAX_JUDGE_PER_STEP = 40;
// Bounded transient-retry discipline: a worker 5xx / network cut re-fires the stepper carrying
// `attempt`; past this cap the chain is closed failed (never a silent infinite self-fire loop).
export const MAX_TRANSIENT_RETRIES = 5;

async function callWorker(url: string, key: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null; reason?: string }> {
  try {
    const res = await fetch(`${url}/functions/v1/backstop-delta-relevance`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    let data: Record<string, unknown> | null = null;
    try { data = await res.json(); } catch { /* response cut */ }
    if (!res.ok || (data && (data as { ok?: unknown }).ok === false)) {
      const reason = (data && (data as { error?: unknown }).error != null) ? String((data as { error?: unknown }).error) : `HTTP ${res.status}`;
      return { ok: false, status: res.status, data, reason };
    }
    return { ok: true, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: null, reason: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(url, key);

  let company_id = "";
  let parent_run_id: string | null = null;
  let attempt = 0;
  try {
    const body = await req.json();
    company_id = String(body.company_id ?? "");
    parent_run_id = body.parent_run_id != null ? String(body.parent_run_id) : null;
    attempt = Number.isFinite(Number(body.attempt)) ? Math.max(0, Math.floor(Number(body.attempt))) : 0;
  } catch { /* 400 below */ }
  if (!company_id) return json({ ok: false, error: "company_id required" }, 400);

  // FROZEN first: a frozen company is refused before any ledger write (the worker + DB trigger hold
  // the real line; this is the courtesy fast-fail so no ledger row is ever opened for CB1).
  {
    const { data: co } = await supabase.from("companies").select("frozen").eq("id", company_id).maybeSingle();
    if ((co as { frozen?: boolean } | null)?.frozen) return json({ ok: false, error: "relevance backstop refused: company is frozen", frozen: true }, 403);
  }

  // ── FIRE GATE (before find-or-create): skip when nothing is unstamped; adopt a live chain. ──
  const sinceIso = new Date(Date.now() - CHAIN_WINDOW_MS).toISOString();
  const { count: unstamped } = await supabase
    .from("claim_deltas").select("id", { count: "exact", head: true })
    .eq("company_id", company_id).eq("pairing_kind", "public_vs_public")
    .in("delta_type", ["echoed", "divergent"]).is("relevance_verdict", null);
  const { data: running } = await supabase
    .from("long_runner_runs").select("id, started_at")
    .eq("company_id", company_id).eq("run_kind", RUN_KIND).eq("status", "running")
    .order("started_at", { ascending: false }).limit(1).maybeSingle();
  const decision = relevanceBackstopNeedsFire({
    unstampedPairs: Number(unstamped ?? 0),
    runningRow: running ? { id: String((running as { id: string }).id), started_at: String((running as { started_at: string }).started_at) } : null,
    windowMs: CHAIN_WINDOW_MS,
  });
  if (decision === "skip_nothing_to_stamp") {
    return json({ ok: true, skipped: "nothing_to_stamp", unstamped: 0 });
  }

  // find-or-create the chain ledger row (adopt the live row inside the window; else create)
  let childId: string | null = null;
  if (decision === "adopt_running" && running) {
    childId = String((running as { id: string }).id);
  } else {
    void sinceIso;
    const insertRow: Record<string, unknown> = { run_kind: RUN_KIND, company_id, status: "running", done_count: 0 };
    if (parent_run_id) insertRow.parent_run_id = parent_run_id;
    const { data: created, error: cErr } = await supabase
      .from("long_runner_runs").insert(insertRow).select("id").single();
    if (cErr || !created) return json({ ok: false, error: `ledger insert failed: ${cErr?.message ?? "no row"}` }, 500);
    childId = String((created as { id: string }).id);
  }

  const finish = async (status: "completed" | "failed", errorText?: string) => {
    const patch = { status, error_text: errorText ?? null, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    await supabase.from("long_runner_runs").update(patch).eq("id", childId);
    if (parent_run_id) await supabase.from("long_runner_runs").update(patch).eq("id", parent_run_id);
  };

  const selfFire = (nextAttempt: number) => {
    waitUntil(fetch(`${url}/functions/v1/refresh-relevance-step`, {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ company_id, parent_run_id, attempt: nextAttempt }),
    }).catch(() => {}));
  };

  // one bounded worker step
  const res = await callWorker(url, key, { company_id, write: true, max_judge: MAX_JUDGE_PER_STEP });
  if (!res.ok) {
    // 403 frozen / 400 bad request are deterministic terminals; anything else re-fires (idempotent),
    // bounded by MAX_TRANSIENT_RETRIES — exhaustion closes the chain failed with the last error.
    if (res.status === 403 || res.status === 400) { await finish("failed", res.reason); return json({ ok: false, error: res.reason }, 200); }
    if (attempt >= MAX_TRANSIENT_RETRIES) {
      const msg = `transient retries exhausted (${MAX_TRANSIENT_RETRIES}): ${res.reason ?? "unknown"}`;
      await finish("failed", msg);
      return json({ ok: false, error: msg }, 200);
    }
    selfFire(attempt + 1);
    return json({ ok: true, retry: true, attempt: attempt + 1, reason: res.reason });
  }

  const totals = ((res.data ?? {}) as { totals?: { remaining?: number } }).totals ?? {};
  const remaining = Number(totals.remaining ?? 0);
  if (remaining > 0) {
    selfFire(0); // a successful step resets the transient-retry budget
    return json({ ok: true, stepped: true, remaining });
  }
  await finish("completed");
  return json({ ok: true, drained: true, totals });
});
