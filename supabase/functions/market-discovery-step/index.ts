// market-discovery-step — the SELF-CHAINING stepper for market discovery (operator ruling 2026-09-01).
//
// generate-market-discovery is multi-phase (plan → candidate chunks → finalize) on local llama3:70b,
// ~minutes — it cannot fit one 400s isolate and must outlive the full_refresh parent. This stepper
// does ONE model phase per fire then self-fires, mirroring refresh-deltas-step. The candidate MANIFEST
// + cursor are DB-persisted on the market_discovery ledger row (long_runner_runs.chain_state), so a
// mid-chunk isolate death is RESUMABLE by the next fire — DB is truth, never a stuck 'running' lie.
// Terminal discipline (runMarketDiscoveryStep): a hard max-step count AND a no-progress guard make an
// infinite self-fire loop structurally impossible. The generator itself is REUSED verbatim (no change).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runMarketDiscoveryStep, type MDChainState } from "../_shared/marketDiscoveryStepper.ts";
// Confirm-poll attribution — reuse the EXACT content-identity schemes the generator writes under, so a
// poll keys on the same rows (no new marker column). marketIdentity → market_discovery_verdicts
// (solution_agnostic) + odi_market_definitions; sha256(normalize(jtbd)) → step_perspective_verdicts
// (the buyer gate, judged FIRST for every candidate → the universal per-candidate marker).
import { marketIdentity } from "../_shared/marketPortfolioDiscovery.ts";
import { normalizeForHash, sha256Hex } from "../_shared/contentIdentity.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
function waitUntil(p: Promise<unknown>) {
  const edge = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (edge?.waitUntil) edge.waitUntil(p); else void p;
}

const RUN_KIND = "market_discovery";
const CHAIN_WINDOW_MS = 30 * 60_000;
const CHUNK_SIZE = 2;
const MAX_STEPS = 12;
// Confirm-poll budget — bounded ≪ the 400s isolate wall. A slow-but-alive worker persists per candidate
// as it goes, so a handful of short polls suffice; return early the moment the chunk is fully accounted.
const CONFIRM_POLL_TRIES = 6;
const CONFIRM_POLL_MS = 3_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type ChainState = { planned: boolean; candidates: unknown[]; cursor: number; chunk_size: number; step_count: number; max_steps: number };
const DEFAULT_STATE: ChainState = { planned: false, candidates: [], cursor: 0, chunk_size: CHUNK_SIZE, step_count: 0, max_steps: MAX_STEPS };

// One server-to-server call into the UNMODIFIED generate-market-discovery worker.
async function callDiscovery(url: string, key: string, body: Record<string, unknown>): Promise<{ ok: boolean; data: Record<string, unknown> | null }> {
  try {
    const res = await fetch(`${url}/functions/v1/generate-market-discovery`, {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` }, body: JSON.stringify(body),
    });
    let data: Record<string, unknown> | null = null;
    try { data = await res.json(); } catch { /* cut / non-JSON */ }
    const ok = res.ok && !!data && (data as { ok?: unknown }).ok !== false;
    return { ok, data };
  } catch { return { ok: false, data: null }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(url, key) as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

  let company_id = ""; let parent_run_id: string | null = null;
  try { const b = await req.json(); company_id = String(b.company_id ?? ""); parent_run_id = b.parent_run_id != null ? String(b.parent_run_id) : null; } catch { /* */ }
  if (!company_id) return json({ ok: false, error: "company_id required" }, 400);

  // FROZEN GUARD (first door) — refuse CB1 before adopting/creating any ledger row or touching the
  // manifest. computeMarketDiscovery also refuses frozen, but the sibling steppers (recurrence,
  // open-questions) refuse at the first door and market discovery must match: no ledger row for CB1.
  {
    const { data: co } = await supabase.from("companies").select("frozen").eq("id", company_id).maybeSingle();
    if (co && (co as { frozen?: boolean }).frozen) return json({ ok: false, error: "market discovery refused: company is frozen", frozen: true }, 403);
  }

  // ── find-or-create the market_discovery ledger row (chain identity; resumable) ──────────────────
  // ADOPT the newest INCOMPLETE manifest regardless of status — running (live self-chain), OR
  // failed/unconfirmed with a planned manifest and cursor < total. Resume is idempotent (banked verdicts
  // + dedup by content identity), so a stalled OR failed run is picked up from its cursor rather than
  // re-planned from scratch. NO started_at gate: a manifest that stalled >30 min ago is still resumable.
  // Only a completed@total (or completed-empty) manifest is left alone → a fresh plan is started instead.
  let ledgerId: string | null = null;
  let chain: ChainState = { ...DEFAULT_STATE };
  {
    // Prefer the ACTIVE chain: the newest NON-completed row — a live 'running' self-chain (adopted at ANY
    // cursor, so a cursor==total row is adopted to FINALIZE on the SAME row, never left a stuck 'running'
    // lie), or a resumable failed/unconfirmed manifest (planned, cursor < total). A 'completed' row is
    // terminal — never adopted, never resurrected (skipping it avoids spawning a spurious empty re-plan).
    const { data: existing } = await supabase.from("long_runner_runs")
      .select("id, status, chain_state, started_at").eq("company_id", company_id).eq("run_kind", RUN_KIND)
      .neq("status", "completed")
      .order("started_at", { ascending: false }).limit(1).maybeSingle();
    const cs = (existing as { chain_state?: Partial<ChainState> | null } | null)?.chain_state ?? null;
    const status = (existing as { status?: string } | null)?.status ?? null;
    const cands = cs && Array.isArray(cs.candidates) ? cs.candidates : [];
    const cursor = Number(cs?.cursor ?? 0);
    // running → adopt at any cursor (resume mid-manifest OR finalize at the end). failed/unconfirmed →
    // adopt only when still incomplete (planned, cursor < total) — never resurrect a done chain.
    const adopt = !!existing && (status === "running" || (!!cs?.planned && cands.length > 0 && cursor < cands.length));
    if (adopt) {
      ledgerId = String((existing as { id: string }).id);
      chain = { ...DEFAULT_STATE, ...cs, candidates: cands };
      // Re-open a failed/unconfirmed row to 'running' so this fire owns it and the sweep leaves it be.
      if (status !== "running") {
        await supabase.from("long_runner_runs")
          .update({ status: "running", finished_at: null, error_text: null, updated_at: new Date().toISOString() })
          .eq("id", ledgerId);
      }
    } else {
      const ins: Record<string, unknown> = { run_kind: RUN_KIND, company_id, status: "running", done_count: 0, chain_state: DEFAULT_STATE };
      if (parent_run_id) ins.parent_run_id = parent_run_id;
      const { data: created, error } = await supabase.from("long_runner_runs").insert(ins).select("id").single();
      if (error || !created) return json({ ok: false, error: `ledger insert failed: ${error?.message ?? "no row"}` }, 500);
      ledgerId = String((created as { id: string }).id);
    }
  }

  const patchLedger = async (patch: Record<string, unknown>) => {
    await supabase.from("long_runner_runs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", ledgerId);
  };

  // Is this candidate ACCOUNTED — did the worker demonstrably process it? Three read-only, index-keyed
  // checks against the exact rows the generator writes (no new marker): (1) buyer verdict by
  // sha256(normalize(jtbd)) — the buyer gate runs FIRST for every candidate, so this is the universal
  // per-candidate marker (covers rejected_buyer with its persisted reason); (2) solution_agnostic verdict
  // by marketIdentity (rejected_solution / accepted); (3) a written def by marketIdentity (accepted /
  // deduped). ANY ⇒ accounted. A judged rejection with a persisted reason counts, never "not yet".
  const candidateAccounted = async (cand: { job_executor?: unknown; jtbd?: unknown }): Promise<boolean> => {
    const executor = String(cand?.job_executor ?? "");
    const jtbd = String(cand?.jtbd ?? "");
    const buyerHash = await sha256Hex(normalizeForHash(jtbd));
    const { data: bv } = await supabase.from("step_perspective_verdicts")
      .select("content_hash").eq("company_id", company_id).eq("content_hash", buyerHash).limit(1).maybeSingle();
    if (bv) return true;
    const identity = await marketIdentity(executor, jtbd);
    const { data: sv } = await supabase.from("market_discovery_verdicts")
      .select("id").eq("company_id", company_id).eq("market_a_identity", identity).limit(1).maybeSingle();
    if (sv) return true;
    const { data: def } = await supabase.from("odi_market_definitions")
      .select("id").eq("company_id", company_id).eq("job_executor", executor).eq("jtbd", jtbd).limit(1).maybeSingle();
    return !!def;
  };
  // Confirm-poll a not-ok chunk: return how many LEADING candidates are accounted (contiguous from the
  // start — the worker processes in order). Bounded ≪ wall; returns early once the chunk is fully
  // accounted. Non-contiguous cannot happen (candidate N+1 implies N was processed first).
  const confirmChunk = async (chunk: unknown[]): Promise<{ accounted: number }> => {
    const cands = chunk as Array<{ job_executor?: unknown; jtbd?: unknown }>;
    let best = 0;
    for (let attempt = 0; attempt < CONFIRM_POLL_TRIES; attempt++) {
      let leading = 0;
      for (const cand of cands) { if (await candidateAccounted(cand)) leading++; else break; }
      best = Math.max(best, leading);
      if (best >= cands.length) return { accounted: best };
      if (attempt < CONFIRM_POLL_TRIES - 1) await sleep(CONFIRM_POLL_MS);
    }
    return { accounted: best };
  };
  const markUnconfirmed = async (cursor: number) => {
    chain = { ...chain, cursor };
    // status STAYS 'running' (never closed) → sweep-excluded (market_discovery) → resumable next fire.
    await patchLedger({
      chain_state: chain,
      error_text: `unconfirmed: chunk at cursor ${cursor} not yet accounted — worker may be alive; awaiting resume`,
    });
  };
  const closeLedger = async (status: "completed" | "failed", err: string | null) => {
    await patchLedger({ status, error_text: err, finished_at: new Date().toISOString() });
  };
  const selfFire = async () => {
    waitUntil(fetch(`${url}/functions/v1/market-discovery-step`, {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ company_id, parent_run_id }),
    }).catch(() => {}));
  };

  const state: MDChainState = {
    planned: chain.planned, candidates: chain.candidates, cursor: chain.cursor,
    chunkSize: chain.chunk_size ?? CHUNK_SIZE, stepCount: chain.step_count ?? 0, maxSteps: chain.max_steps ?? MAX_STEPS,
  };

  const out = await runMarketDiscoveryStep({
    state,
    plan: async () => {
      const r = await callDiscovery(url, key, { company_id, plan: true });
      if (!r.ok) {
        // a plan skip of already_discovered arrives as ok:false skipped — treat that as alreadyDiscovered.
        if (r.data && (r.data as { skipped?: unknown }).skipped === "already_discovered") return { candidates: [], alreadyDiscovered: true };
        return { candidates: [] }; // plan failed / no signals → empty (honest completed_empty)
      }
      const cands = Array.isArray((r.data as { candidates?: unknown })?.candidates) ? (r.data as { candidates: unknown[] }).candidates : [];
      return { candidates: cands };
    },
    judgeChunk: async (chunk) => { const r = await callDiscovery(url, key, { company_id, candidates: chunk }); return { ok: r.ok }; },
    confirmChunk,
    finalize: async () => { await callDiscovery(url, key, { company_id }); },
    persistPlanned: async (candidates) => { chain = { ...chain, planned: true, candidates, cursor: 0 }; await patchLedger({ chain_state: chain, target_count: candidates.length }); },
    persistProgress: async (cursor, stepCount) => { chain = { ...chain, cursor, step_count: stepCount }; await patchLedger({ chain_state: chain, done_count: cursor }); },
    closeCompleted: async (empty) => { await closeLedger("completed", empty ? "no public markets discovered" : null); },
    closeFailed: async (reason) => { await closeLedger("failed", reason); },
    markUnconfirmed,
    selfFire,
  });

  return json({ ok: true, outcome: out.outcome, ledger: ledgerId });
});
