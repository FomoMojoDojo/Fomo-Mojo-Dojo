// FULL REFRESH · Gate 1 — the SERVER-SIDE claim-delta stepper (shape (c), loop home A).
//
// One isolate does ONE unit of work then self-chains via EdgeRuntime.waitUntil, so the whole
// plan→chunks→finalize loop spans many isolates and never approaches the 400s wall. This is
// the server home for the loop that lived in useClaimDeltaRecompute (now retired). It REUSES
// generate-claim-deltas verbatim as a pure worker (never modifies it) and packDeltaChunks
// verbatim, and it records progress on a child long_runner_runs row (run_kind='claim_deltas')
// so a headless chain is visible and a silent skip is impossible.
//
// STEP (each invocation):
//   1. find-or-create the child ledger row (the chain identity; resumable).
//   2. PLAN generate-claim-deltas (zero model calls) — the RESUME TRUTH: banked/tombstoned
//      claims drop out of `fresh`, so re-planning after any death reflects reality.
//   3. if a fresh chunk remains → run ONE chunk (pair rows only), advance done_count, and
//      waitUntil(self) to fire the next isolate. A deterministic worker error (4xx that isn't
//      transient) fails the chain now; a transient error just re-fires (idempotent bank).
//   4. if the plan is dry → run the ONE unscoped finalize (silences + stale-sweep). If the
//      gateway cut its response, confirm by a short claim_deltas change-poll (the isolate
//      usually finished server-side). Mark the child — and the parent, if any — completed.
//
// A chain that dies WITHOUT self-firing (isolate crash before waitUntil) is caught by the
// pg_cron stale-chain sweep (Gate 3) — that sweep is the ultimate bound for a pathological
// non-progressing loop too.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { packDeltaChunks, type DeltaPlanClaim } from "../../../src/lib/claimDeltas/packChunks.ts";

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

const RUN_KIND = "claim_deltas";
// A chain is "this company's claim_deltas row still running, started recently". 25 min is
// comfortably longer than the observed ~4-min loop and shorter than the 30-min lock TTL.
const CHAIN_WINDOW_MS = 25 * 60_000;

// One server-to-server call into generate-claim-deltas (the untouched worker).
async function callDeltas(url: string, key: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null; reason?: string }> {
  try {
    const res = await fetch(`${url}/functions/v1/generate-claim-deltas`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    let data: Record<string, unknown> | null = null;
    try { data = await res.json(); } catch { /* response cut / non-JSON */ }
    if (!res.ok || (data && (data as { ok?: unknown }).ok === false)) {
      const reason = (data && (data as { error?: unknown }).error != null) ? String((data as { error?: unknown }).error) : `HTTP ${res.status}`;
      return { ok: false, status: res.status, data, reason };
    }
    return { ok: true, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: null, reason: e instanceof Error ? e.message : String(e) };
  }
}

// A worker error that will fail identically on retry — stop the chain rather than loop.
// 403 frozen / 404 no claims / 422 empty-scope are deterministic; 5xx / 0 (network) are transient.
function isDeterministicWorkerError(status: number): boolean {
  return status === 403 || status === 404 || status === 422 || status === 400;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(url, key);

  let company_id = "";
  let parent_run_id: string | null = null;
  try {
    const body = await req.json();
    company_id = String(body.company_id ?? "");
    parent_run_id = body.parent_run_id != null ? String(body.parent_run_id) : null;
  } catch { /* fall through to the 400 below */ }
  if (!company_id) return json({ ok: false, error: "company_id required" }, 400);

  // ── 1) find-or-create the child ledger row (chain identity) ─────────────────────────
  const sinceIso = new Date(Date.now() - CHAIN_WINDOW_MS).toISOString();
  let childId: string | null = null;
  let targetCount: number | null = null;
  {
    const { data: existing } = await supabase
      .from("long_runner_runs")
      .select("id, target_count")
      .eq("company_id", company_id).eq("run_kind", RUN_KIND).eq("status", "running")
      .gte("started_at", sinceIso)
      .order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (existing) {
      childId = String((existing as { id: string }).id);
      targetCount = (existing as { target_count: number | null }).target_count ?? null;
    } else {
      const insertRow: Record<string, unknown> = { run_kind: RUN_KIND, company_id, status: "running", done_count: 0 };
      if (parent_run_id) insertRow.parent_run_id = parent_run_id; // Gate 2 column; harmless if the migration is applied
      const { data: created, error: cErr } = await supabase
        .from("long_runner_runs").insert(insertRow).select("id").single();
      if (cErr || !created) return json({ ok: false, error: `ledger insert failed: ${cErr?.message ?? "no row"}` }, 500);
      childId = String((created as { id: string }).id);
    }
  }

  const finish = async (status: "completed" | "failed", done: number, errorText?: string) => {
    await supabase.from("long_runner_runs").update({
      status, done_count: done, error_text: errorText ?? null,
      finished_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", childId);
    if (parent_run_id) {
      await supabase.from("long_runner_runs").update({
        status, error_text: errorText ?? null,
        finished_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", parent_run_id);
    }
  };

  // ── 2) PLAN (resume truth) ──────────────────────────────────────────────────────────
  const planRes = await callDeltas(url, key, { company_id, plan: true });
  if (!planRes.ok) {
    // A plan that errors deterministically (frozen/no-claims) is a legitimate terminal, not a stall.
    await finish("failed", 0, `plan failed: ${planRes.reason}`);
    return json({ ok: false, error: `plan failed: ${planRes.reason}` }, 200);
  }
  const plan = (planRes.data ?? {}) as { claims?: DeltaPlanClaim[] };
  const chunks = packDeltaChunks(Array.isArray(plan.claims) ? plan.claims : []);
  // First step stamps the total (the initial chunk count) so the child row reads N/total.
  if (targetCount == null) {
    targetCount = chunks.length;
    await supabase.from("long_runner_runs").update({ target_count: targetCount, updated_at: new Date().toISOString() }).eq("id", childId);
  }

  // ── 3) one chunk, then self-chain ───────────────────────────────────────────────────
  if (chunks.length > 0) {
    const chunk = chunks[0];
    const res = await callDeltas(url, key, { company_id, write: true, declared_ids: chunk.map((c) => c.declared_claim_id) });
    if (!res.ok && isDeterministicWorkerError(res.status)) {
      await finish("failed", Math.max(0, (targetCount ?? chunks.length) - chunks.length), `chunk failed: ${res.reason}`);
      return json({ ok: false, error: `chunk failed: ${res.reason}` }, 200);
    }
    // done = chunks banked so far = target − (remaining after this bank). On a transient error
    // the chunk didn't bank; the next re-plan returns it again (idempotent retry).
    const remainingAfter = res.ok ? Math.max(0, chunks.length - 1) : chunks.length;
    const done = Math.max(0, (targetCount ?? chunks.length) - remainingAfter);
    await supabase.from("long_runner_runs").update({ done_count: done, updated_at: new Date().toISOString() }).eq("id", childId);
    waitUntil(callDeltas(url, key, { company_id, plan: true }).then(() =>
      fetch(`${url}/functions/v1/refresh-deltas-step`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({ company_id, parent_run_id }),
      }).catch(() => {})
    ));
    return json({ ok: true, stepped: true, remaining: remainingAfter, target: targetCount });
  }

  // ── 4) plan dry → the ONE unscoped finalize (silences + stale-sweep) ────────────────
  const { count: preCount } = await supabase.from("claim_deltas").select("id", { count: "exact", head: true }).eq("company_id", company_id);
  const finRes = await callDeltas(url, key, { company_id, write: true });
  if (finRes.ok) {
    await finish("completed", targetCount ?? 0);
    return json({ ok: true, finalized: true });
  }
  if (isDeterministicWorkerError(finRes.status)) {
    await finish("failed", targetCount ?? 0, `finalize failed: ${finRes.reason}`);
    return json({ ok: false, error: `finalize failed: ${finRes.reason}` }, 200);
  }
  // Transient cut — the isolate usually finished server-side. Confirm by a short change-poll.
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const { count } = await supabase.from("claim_deltas").select("id", { count: "exact", head: true }).eq("company_id", company_id);
    if ((count ?? 0) !== (preCount ?? 0)) { await finish("completed", targetCount ?? 0); return json({ ok: true, finalized: true, polled: true }); }
  }
  // Couldn't confirm within the poll — re-fire once more (finalize is idempotent); the sweep bounds the tail.
  waitUntil(fetch(`${url}/functions/v1/refresh-deltas-step`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({ company_id, parent_run_id }),
  }).catch(() => {}));
  return json({ ok: true, finalize_retry: true });
});
