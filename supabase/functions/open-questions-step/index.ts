// open-questions-step — the SELF-CHAINING stepper for open-question generation (operator ruling
// 2026-09-02), mirroring market-discovery-step.
//
// generate-open-questions is plan → scoped anchor chunks → finalize, with NO single-call mode; a
// public-only company can have many publicly_silent deltas (Geniant: 45 anchors ≈ 15 chunks), far more
// than one 400s isolate holds. This stepper does ONE chunk per fire then self-fires. The anchor
// MANIFEST + cursor + run_id are DB-persisted on the open_questions ledger row (long_runner_runs.
// chain_state), so a mid-chunk isolate death is RESUMABLE — DB is truth, never a stuck 'running' lie.
// Terminal discipline (runOpenQuestionsStep): a hard max-step count AND a no-progress guard make an
// infinite self-fire loop structurally impossible. The generate-open-questions worker is REUSED verbatim.
//
// FROZEN GUARD (this stepper adds what generate-open-questions lacks): a frozen company (CB1) is refused
// at the FIRST door, before plan or any write.
//
// INTEGRITY: the finalize (and every failed terminal) writes a first_read_open_questions integrity row
// (completed / failed) so the Questions beat renders never-fired vs fired-and-empty from a persisted
// record, not array emptiness.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runOpenQuestionsStep, type OQChainState } from "../_shared/openQuestionsStepper.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
function waitUntil(p: Promise<unknown>) {
  const edge = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (edge?.waitUntil) edge.waitUntil(p); else void p;
}

const RUN_KIND = "open_questions";
const INTEGRITY_COMPONENT = "first_read_open_questions";
const CHAIN_WINDOW_MS = 30 * 60_000;
const CHUNK_SIZE = 3;   // the anchor packer cap (ANCHOR_CHUNK_CAP)
const MAX_STEPS = 25;   // ≥ (max anchors / chunk) + plan + finalize, with headroom
// The edge chain_state also carries run_id (the pure stepper's manifest is anchors only).
type EdgeChainState = OQChainState & { run_id: string };
const DEFAULT_STATE: EdgeChainState = { planned: false, anchors: [], cursor: 0, chunkSize: CHUNK_SIZE, stepCount: 0, maxSteps: MAX_STEPS, run_id: "" };

// One server-to-server call into the UNMODIFIED generate-open-questions worker.
async function callOQ(url: string, key: string, body: Record<string, unknown>): Promise<{ ok: boolean; data: Record<string, unknown> | null }> {
  try {
    const res = await fetch(`${url}/functions/v1/generate-open-questions`, {
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

  // ── FROZEN GUARD (first door, before plan or any write) ─────────────────────────────────────────
  const { data: co } = await supabase.from("companies").select("frozen").eq("id", company_id).maybeSingle();
  if (co && (co as { frozen?: boolean }).frozen) {
    return json({ ok: false, error: "open questions refused: company is frozen", frozen: true }, 403);
  }

  // ── find-or-create the open_questions ledger row (chain identity; resumable) ─────────────────────
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
      if (cs) chain = { ...DEFAULT_STATE, ...cs, anchors: Array.isArray(cs.anchors) ? cs.anchors.map(String) : [] };
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
  const writeIntegrity = async (status: "completed" | "failed", examined: number, admitted: number | null, error: string | null) => {
    await supabase.from("integrity_runs").insert({
      company_id, component: INTEGRITY_COMPONENT, surface_type: null, surface_id: null,
      ran_at: new Date().toISOString(), status, examined, admitted, excluded_by_rule: null, error, run_ref: chain.run_id || null,
    });
  };
  // Live delta-driven questions written for this run — the integrity 'admitted' count.
  const liveSilentCount = async (): Promise<number> => {
    const { data } = await supabase.from("first_read_open_questions").select("id")
      .eq("company_id", company_id).eq("run_id", chain.run_id).eq("source_kind", "silent_delta").eq("status", "live");
    return ((data ?? []) as unknown[]).length;
  };
  const closeLedger = async (status: "completed" | "failed", err: string | null) => {
    await patchLedger({ status, error_text: err, finished_at: new Date().toISOString() });
  };
  // WRITEBACK (sweep-hazard fix): on a terminal, close the fill's fr_open_questions handoff row BY OUR
  // run_id REFERENCE (its note carries "run=<ledgerId>"), setting a real terminal + finished_at — so a
  // completed/failed stepper never leaves a 'running' dispatch marker for the stale-chain sweep to
  // false-fail. Best-effort: on the planned-empty race (the fill writes the handoff row just after our
  // first call) the row may not exist yet; the sweep's explicit exclusion is the backstop.
  const closeDispatch = async (status: "completed" | "failed") => {
    await supabase.from("long_runner_runs")
      .update({ status, error_text: `open questions ${status} · run=${ledgerId}`, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("company_id", company_id).eq("run_kind", "fr_open_questions").eq("status", "running")
      .like("error_text", `%run=${ledgerId}%`);
  };
  // Mirror generate-open-questions' run-id derivation, with a baseline-run fallback so a public-only
  // company (findings empty) still questions its publicly_silent deltas: newest findings.origin_run_id,
  // else the latest public_baseline_runs.id, else "".
  const resolveRunId = async (): Promise<string> => {
    const { data: f } = await supabase.from("findings").select("origin_run_id")
      .eq("company_id", company_id).not("origin_run_id", "is", null)
      .order("origin_run_id", { ascending: false }).limit(1).maybeSingle();
    const fromFinding = (f as { origin_run_id?: number } | null)?.origin_run_id;
    if (fromFinding != null) return String(fromFinding);
    const { data: b } = await supabase.from("public_baseline_runs").select("id")
      .eq("company_id", company_id).order("id", { ascending: false }).limit(1).maybeSingle();
    return String((b as { id?: number } | null)?.id ?? "");
  };
  const selfFire = async () => {
    waitUntil(fetch(`${url}/functions/v1/open-questions-step`, {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ company_id, parent_run_id }),
    }).catch(() => {}));
  };

  const out = await runOpenQuestionsStep({
    state: {
      planned: chain.planned, anchors: chain.anchors, cursor: chain.cursor,
      chunkSize: chain.chunkSize ?? CHUNK_SIZE, stepCount: chain.stepCount ?? 0, maxSteps: chain.maxSteps ?? MAX_STEPS,
    },
    plan: async () => {
      // RUN-ID resolution (wiring, NOT a producer change): generate-open-questions derives run_id from
      // the newest FINDINGS run and REFUSES ("No findings run for this company.") when none exists —
      // which would drop a public-only company's publicly_silent DELTA anchors on the floor (Geniant
      // has 45 deltas but 0 findings, the descoped Prong 1 regression). We compute the run_id here and
      // pass it explicitly, mirroring the worker's own derivation with a baseline-run fallback so the
      // delta anchors are never lost: newest findings.origin_run_id → else the latest public baseline run.
      const runId = await resolveRunId();
      chain = { ...chain, run_id: runId };
      const r = await callOQ(url, key, { company_id, plan: true, run_id: runId });
      const anchors = Array.isArray((r.data as { anchors?: unknown } | null)?.anchors)
        ? (r.data as { anchors: Array<{ identity?: unknown }> }).anchors.map((a) => String(a?.identity ?? "")).filter(Boolean)
        : [];
      return { anchors };
    },
    runChunk: async (chunk) => {
      const r = await callOQ(url, key, { company_id, run_id: chain.run_id, write: true, anchor_identities: chunk });
      return { ok: r.ok };
    },
    finalize: async () => { await callOQ(url, key, { company_id, run_id: chain.run_id, write: true }); },
    persistPlanned: async (anchors) => {
      chain = { ...chain, planned: true, anchors, cursor: 0 };
      await patchLedger({ chain_state: chain, target_count: anchors.length });
    },
    persistProgress: async (cursor, stepCount) => {
      chain = { ...chain, cursor, stepCount };
      await patchLedger({ chain_state: chain, done_count: cursor });
    },
    closeCompleted: async (empty) => {
      const admitted = empty ? 0 : await liveSilentCount();
      await writeIntegrity("completed", chain.anchors.length, admitted, null);
      await closeLedger("completed", empty ? "no publicly-silent anchors — nothing to question" : null);
      await closeDispatch("completed");
    },
    closeFailed: async (reason) => {
      await writeIntegrity("failed", chain.anchors.length, null, reason);
      await closeLedger("failed", reason);
      await closeDispatch("failed");
    },
    selfFire,
  });

  return json({ ok: true, outcome: out.outcome, ledger: ledgerId, run_id: chain.run_id });
});
