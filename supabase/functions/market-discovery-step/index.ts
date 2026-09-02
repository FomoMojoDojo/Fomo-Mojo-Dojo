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

  // ── find-or-create the market_discovery ledger row (chain identity; resumable) ──────────────────
  const sinceIso = new Date(Date.now() - CHAIN_WINDOW_MS).toISOString();
  let ledgerId: string | null = null;
  let chain: ChainState = { ...DEFAULT_STATE };
  {
    const { data: existing } = await supabase.from("long_runner_runs")
      .select("id, chain_state").eq("company_id", company_id).eq("run_kind", RUN_KIND).eq("status", "running")
      .gte("started_at", sinceIso).order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (existing) {
      ledgerId = String((existing as { id: string }).id);
      const cs = (existing as { chain_state?: Partial<ChainState> | null }).chain_state ?? null;
      if (cs) chain = { ...DEFAULT_STATE, ...cs, candidates: Array.isArray(cs.candidates) ? cs.candidates : [] };
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
    finalize: async () => { await callDiscovery(url, key, { company_id }); },
    persistPlanned: async (candidates) => { chain = { ...chain, planned: true, candidates, cursor: 0 }; await patchLedger({ chain_state: chain, target_count: candidates.length }); },
    persistProgress: async (cursor, stepCount) => { chain = { ...chain, cursor, step_count: stepCount }; await patchLedger({ chain_state: chain, done_count: cursor }); },
    closeCompleted: async (empty) => { await closeLedger("completed", empty ? "no public markets discovered" : null); },
    closeFailed: async (reason) => { await closeLedger("failed", reason); },
    selfFire,
  });

  return json({ ok: true, outcome: out.outcome, ledger: ledgerId });
});
