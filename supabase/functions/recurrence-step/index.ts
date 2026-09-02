// recurrence-step — the SELF-CHAINING stepper for signal-recurrence (operator ruling 2026-09-02),
// mirroring open-questions-step / market-discovery-step.
//
// generate-signal-recurrence is plan → cap-5 pair chunks → finalize, with NO single-call mode; a
// company of Geniant's size has ~1865 candidate pairs (~78 min to hours on the local 70b judge). This
// stepper does ONE chunk per fire then self-fires. The fresh-pair MANIFEST + cursor + run_id are
// DB-persisted on a 'recurrence_step' ledger row (chain_state), RESUMABLE by the next fire — banked
// verdicts (frozen by pair_identity) make resume zero-re-judge. Terminal discipline (runRecurrenceStep):
// max-steps + no-progress make an infinite loop impossible. The generate-signal-recurrence worker is
// REUSED verbatim (no judge/criterion/clusterer change) and owns its own 'signal_recurrence' ledger.
//
// FROZEN GUARD at the first door — CB1 refused before plan or any write.
// INTEGRITY: finalize writes a first_read_recurrence record (pairs_examined/total, clusters,
// findings_badged) so "What stands out" can say recurrence not_yet / partial / completed / failed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runRecurrenceStep, type RecChainState, type RecPair } from "../_shared/recurrenceStepper.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
function waitUntil(p: Promise<unknown>) {
  const edge = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (edge?.waitUntil) edge.waitUntil(p); else void p;
}

const RUN_KIND = "recurrence_step";
const INTEGRITY_COMPONENT = "first_read_recurrence";
const CHAIN_WINDOW_MS = 6 * 60 * 60_000; // 6h — recurrence legitimately runs for hours; sweep excludes it
const CHUNK_SIZE = 5; // the client pair-packer cap
type EdgeChainState = RecChainState & { pairs_total: number };
const DEFAULT_STATE: EdgeChainState = { planned: false, pairs: [], cursor: 0, chunkSize: CHUNK_SIZE, stepCount: 0, maxSteps: 500, pairs_total: 0 };

async function callRec(url: string, key: string, body: Record<string, unknown>): Promise<{ ok: boolean; data: Record<string, unknown> | null }> {
  try {
    const res = await fetch(`${url}/functions/v1/generate-signal-recurrence`, {
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

  // FROZEN GUARD (first door).
  const { data: co } = await supabase.from("companies").select("frozen").eq("id", company_id).maybeSingle();
  if (co && (co as { frozen?: boolean }).frozen) return json({ ok: false, error: "recurrence refused: company is frozen", frozen: true }, 403);

  // find-or-create the recurrence_step chain row (resumable).
  const sinceIso = new Date(Date.now() - CHAIN_WINDOW_MS).toISOString();
  let ledgerId: string | null = null;
  let chain: EdgeChainState = { ...DEFAULT_STATE };
  {
    const { data: existing } = await supabase.from("long_runner_runs")
      .select("id, chain_state").eq("company_id", company_id).eq("run_kind", RUN_KIND).eq("status", "running")
      .gte("started_at", sinceIso).order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (existing) {
      ledgerId = String((existing as { id: string }).id);
      const cs = (existing as { chain_state?: Partial<EdgeChainState> | null }).chain_state ?? null;
      if (cs) chain = { ...DEFAULT_STATE, ...cs, pairs: Array.isArray(cs.pairs) ? (cs.pairs as RecPair[]) : [] };
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
  const writeIntegrity = async (status: "completed" | "failed", examined: number, clusters: number | null, badged: number | null, error: string | null) => {
    await supabase.from("integrity_runs").insert({
      company_id, component: INTEGRITY_COMPONENT, surface_type: null, surface_id: null,
      ran_at: new Date().toISOString(), status,
      examined, admitted: badged,
      excluded_by_rule: { pairs_total: chain.pairs_total, pairs_examined: examined, clusters, findings_badged: badged },
      error, run_ref: String(ledgerId),
    });
  };
  const badgedCount = async (): Promise<number> => {
    const { data } = await supabase.from("finding_recurrence").select("finding_id").eq("company_id", company_id);
    return ((data ?? []) as unknown[]).length;
  };
  // WRITEBACK: close the fill's fr_signal_recurrence handoff row by run reference on a terminal.
  const closeDispatch = async (status: "completed" | "failed") => {
    await supabase.from("long_runner_runs")
      .update({ status, error_text: `recurrence ${status} · run=${ledgerId}`, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("company_id", company_id).eq("run_kind", "fr_signal_recurrence").eq("status", "running").like("error_text", `%run=${ledgerId}%`);
  };
  const selfFire = async () => {
    waitUntil(fetch(`${url}/functions/v1/recurrence-step`, {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ company_id, parent_run_id }),
    }).catch(() => {}));
  };

  let finalizeClusters: number | null = null;
  const out = await runRecurrenceStep({
    state: { planned: chain.planned, pairs: chain.pairs, cursor: chain.cursor, chunkSize: chain.chunkSize ?? CHUNK_SIZE, stepCount: chain.stepCount ?? 0, maxSteps: chain.maxSteps ?? 500 },
    plan: async () => {
      const r = await callRec(url, key, { company_id, plan: true });
      // The plan's RecurrencePlanPair uses signal_a_id/signal_b_id (status/basis too); the worker's
      // scoped-chunk call expects {a,b} (packPairChunks' shape). Map to {a,b} for the manifest.
      const rawPairs = Array.isArray((r.data as { pairs?: unknown } | null)?.pairs) ? (r.data as { pairs: Array<{ signal_a_id?: unknown; signal_b_id?: unknown }> }).pairs : [];
      const pairs: RecPair[] = rawPairs
        .filter((p) => typeof p?.signal_a_id === "string" && typeof p?.signal_b_id === "string")
        .map((p) => ({ a: String(p.signal_a_id), b: String(p.signal_b_id) }));
      const total = Number((r.data as { candidates_total?: unknown } | null)?.candidates_total ?? pairs.length);
      chain = { ...chain, pairs_total: total };
      return { pairs };
    },
    runChunk: async (chunk) => {
      const r = await callRec(url, key, { company_id, pairs: chunk, write: true, run_target: chain.pairs.length });
      return { ok: r.ok };
    },
    finalize: async () => {
      const r = await callRec(url, key, { company_id, write: true });
      const t = (r.data as { totals?: { clusters?: unknown } } | null)?.totals;
      finalizeClusters = t && typeof t.clusters === "number" ? t.clusters : null;
    },
    persistPlanned: async (pairs) => {
      const maxSteps = Math.ceil(pairs.length / (chain.chunkSize ?? CHUNK_SIZE)) + 5; // "full run" ceiling + headroom
      chain = { ...chain, planned: true, pairs, cursor: 0, maxSteps };
      await patchLedger({ chain_state: chain, target_count: pairs.length });
    },
    persistProgress: async (cursor, stepCount) => {
      chain = { ...chain, cursor, stepCount };
      await patchLedger({ chain_state: chain, done_count: cursor });
    },
    closeCompleted: async (empty) => {
      const badged = await badgedCount();
      await writeIntegrity("completed", empty ? 0 : chain.pairs.length, finalizeClusters, badged, null);
      await closeLedger("completed", empty ? "no fresh pairs — reconciled from banked verdicts" : null);
      await closeDispatch("completed");
    },
    closeFailed: async (reason) => {
      await writeIntegrity("failed", chain.pairs.length, null, null, reason);
      await closeLedger("failed", reason);
      await closeDispatch("failed");
    },
    selfFire,
  });

  return json({ ok: true, outcome: out.outcome, ledger: ledgerId, pairs: chain.pairs.length, cursor: chain.cursor });
});
