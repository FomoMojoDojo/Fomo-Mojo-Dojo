// first-read-fill — the FIRST-FILL AUTO-CHAIN stage (operator-signed 2026-09-01).
//
// Fired from public-baseline's tail after a successful baseline inside a full_refresh (chain:true). It
// generates ONLY what has no current row — the 4 public-read kinds (generate-public-read, external +
// judged) and market discovery (market-discovery-step, self-chaining, local). FIRST-FILL BY
// CONSTRUCTION: it enumerates MISSING kinds from the beats' emptiness predicates and passes only those,
// so it can never supersede a current row (regeneration stays a deliberate manual act). A kind failure
// (or judge/citation REJECT — never retried) is that kind's honest terminal, recorded per-kind; the
// parent full_refresh completes regardless. The fill stage ALSO fills two components the baseline→
// mojo-analysis chain does NOT produce on a fresh create: own-words (extract-own-words, two-phase
// plan→write) and the public gap-pairs (generate-claim-deltas, pairing_kind='public_vs_public'),
// run after the public reads in dependency order (own-words → gap-pairs), each first-fill-only and
// failure-isolated. Fired in the BACKGROUND (waitUntil) so the two-phase fetch + the public delta
// run are not bound by the response wall — the per-kind ledger (fr_own_words / fr_public_gap_pairs)
// is the truth. Findings are auto-captured upstream in the baseline ingest; questions/relevance keep
// their own stages.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  runFirstReadFill, runChainKinds, classifyGapPairsAfterTimeout,
  chainKindLedgerStatus, chainKindIsTerminal, openQuestionsAlreadyPresent, missingPublicReadKinds, marketReadIsEmpty, marketDiscoveryNeedsFire,
  type PublicReadKind, type GenPerKind, type KindStatus,
  type ChainKindStep, type ChainKindTerminal,
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
  const defsEmpty = marketReadIsEmpty((mdRows ?? []) as Array<{ market_register?: string | null; job_executor?: string | null }>);
  // The MANIFEST is the completeness authority: read the newest market_discovery ledger row and decide
  // (re)fire vs skip from its terminal state + cursor — NOT from def existence (which no-op'd forever
  // once one def landed). No manifest → fall back to the legacy def-emptiness gate.
  const { data: mdManifest } = await supabase.from("long_runner_runs")
    .select("status, chain_state").eq("company_id", company_id).eq("run_kind", "market_discovery")
    .order("started_at", { ascending: false }).limit(1).maybeSingle();
  const marketNeedsFire = marketDiscoveryNeedsFire(
    (mdManifest ?? null) as { status?: string | null; chain_state?: { cursor?: unknown; candidates?: unknown } | null } | null,
    defsEmpty,
  );

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

  const result = await runFirstReadFill({ missingKinds, marketNeedsFire, generatePublicRead, recordKindLedger, fireMarketDiscovery, closeParent });

  // close the stage ledger: completed_empty (no-op) when nothing was missing, else completed (work done).
  if (stageId) {
    const empty = result.stageEmpty;
    await supabase.from("long_runner_runs").update({
      status: "completed", done_count: result.generated.length,
      error_text: empty ? "first-fill no-op — all reads current" : `filled: ${result.generated.join(",") || "none"}${result.failed.length ? ` · failed: ${result.failed.join(",")}` : ""}${result.marketFired ? " · market discovery fired" : ""}`,
      finished_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", stageId);
  }

  // ── Chain kinds (own-words → public gap-pairs) — fired in the BACKGROUND, in dependency order.
  // First-fill-only + failure-isolated (runChainKinds). Additive: they never touch the parent close
  // above (already handled). The per-kind ledger (fr_own_words / fr_public_gap_pairs) is the truth. ──
  const postFn = async (fn: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null }> => {
    const res = await fetch(`${url}/functions/v1/${fn}`, {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    let data: Record<string, unknown> | null = null;
    try { data = await res.json(); } catch { /* */ }
    return { ok: res.ok, status: res.status, data };
  };

  const recordChainLedger = async (kind: string, status: ChainKindTerminal, note?: string) => {
    // STANDING LAW — an unearned status is not a status. The ledger CHECK allows only running/completed/
    // failed today, so 'unconfirmed' is written as the non-terminal 'running' (never completed, never
    // failed) with an explicit note and NO finished_at, pending a migration that adds 'unconfirmed'.
    const ins: Record<string, unknown> = {
      run_kind: `fr_${kind}`, company_id,
      status: chainKindLedgerStatus(status),
      done_count: status === "completed" ? 1 : 0,
      error_text: status === "unconfirmed" ? `unconfirmed: ${note ?? ""}`.trim() : (note ?? null),
    };
    if (chainKindIsTerminal(status)) ins.finished_at = new Date().toISOString();
    if (parent_run_id) ins.parent_run_id = parent_run_id;
    await supabase.from("long_runner_runs").insert(ins);
  };

  // Most-recent first_read_gap_pairs integrity status (the worker owns this row). Used by the 504
  // confirm-poll to learn whether the isolate finished server-side after the gateway cut its response.
  const readGapPairsIntegrityStatus = async (): Promise<string | null> => {
    const { data } = await supabase.from("integrity_runs").select("status")
      .eq("company_id", company_id).eq("component", "first_read_gap_pairs")
      .order("ran_at", { ascending: false }).limit(1);
    return ((data ?? []) as Array<{ status: string }>)[0]?.status ?? null;
  };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // OWN-WORDS (two-phase). First-fill = own_words CLAIMS exist (the artifact, per ruling), NOT the
  // integrity row (plan writes a 'planned' row even on a fresh run). plan → on frozen plan → write.
  const ownWordsStep: ChainKindStep = {
    kind: "own_words",
    alreadyPresent: async () => {
      const { data } = await supabase.from("claims").select("id")
        .eq("company_id", company_id).eq("claim_type", "own_words").eq("status", "active").limit(1);
      return ((data ?? []) as unknown[]).length > 0;
    },
    run: async () => {
      // PHASE 1 — plan: fetch + snapshot + freeze candidates + integrity 'planned'. No claims written.
      const plan = await postFn("extract-own-words", { company_id, mode: "plan" });
      if (!plan.ok) {
        if (plan.status === 403) return { status: "failed" as const, note: "refused: company frozen" };
        return { status: "failed" as const, note: `plan failed (${plan.status})` };
      }
      const planned = Array.isArray((plan.data as { would_be_own_words?: unknown } | null)?.would_be_own_words)
        ? (plan.data as { would_be_own_words: unknown[] }).would_be_own_words.length : 0;
      // PHASE 2 — write: materialize own_words claims + integrity 'completed'.
      const write = await postFn("extract-own-words", { company_id, mode: "write" });
      if (!write.ok) {
        // 409 = the frozen plan produced no candidates → looked, none kept (earned empty).
        if (write.status === 409) return { status: "completed_empty" as const, note: `plan ${planned} · no candidates` };
        return { status: "failed" as const, note: `write failed (${write.status})` };
      }
      const inserted = Number((write.data as { inserted?: unknown } | null)?.inserted ?? 0);
      return inserted > 0
        ? { status: "completed" as const, note: `plan ${planned} · wrote ${inserted}` }
        : { status: "completed_empty" as const, note: `plan ${planned} · wrote 0` };
    },
  };

  // PUBLIC GAP-PAIRS. First-fill = a non-failed first_read_gap_pairs integrity row OR any existing
  // public_vs_public claim_deltas. The worker self-writes first_read_gap_pairs on every terminal.
  const gapPairsStep: ChainKindStep = {
    kind: "public_gap_pairs",
    alreadyPresent: async () => {
      const { data: intg } = await supabase.from("integrity_runs").select("id")
        .eq("company_id", company_id).eq("component", "first_read_gap_pairs")
        .in("status", ["completed", "skipped_empty_input"]).limit(1);
      if (((intg ?? []) as unknown[]).length > 0) return true;
      const { data: dl } = await supabase.from("claim_deltas").select("id")
        .eq("company_id", company_id).eq("pairing_kind", "public_vs_public").limit(1);
      return ((dl ?? []) as unknown[]).length > 0;
    },
    run: async () => {
      const res = await postFn("generate-claim-deltas", { company_id, pairing_kind: "public_vs_public", write: true });
      if (res.status === 403) return { status: "failed" as const, note: "refused: company frozen" };
      const data = res.data as { ok?: unknown; skipped?: unknown; empty?: unknown } | null;
      if (res.ok && data && data.ok !== false) {
        // The worker returns success-shaped with a marker for the earned no-declared-side empty state.
        if (data.skipped === "no_declared_claims" || data.empty === true) return { status: "completed_empty" as const, note: "no declared side — nothing to compare yet" };
        return { status: "completed" as const, note: "public deltas computed" };
      }
      // GATEWAY CUT (504/502/408): the worker isolate may have outrun the response and finished
      // server-side (it owns first_read_gap_pairs). Confirm-poll that row, bounded by GAP_POLL_BUDGET_MS
      // (well under the isolate wall-clock). A conclusive status wins; the window expiring with no
      // conclusive row is 'unconfirmed' (NEVER 'failed'). Any other non-2xx is a real failure.
      if (res.status === 504 || res.status === 502 || res.status === 408) {
        const GAP_POLL_BUDGET_MS = 90_000;
        const GAP_POLL_INTERVAL_MS = 6_000;
        const deadline = Date.now() + GAP_POLL_BUDGET_MS;
        // First read is immediate — the isolate often finished before the gateway even cut us off.
        for (;;) {
          const st = await readGapPairsIntegrityStatus();
          const cls = classifyGapPairsAfterTimeout(st);
          if (cls !== "unconfirmed") return { status: cls, note: `gateway ${res.status}; integrity=${st}` };
          if (Date.now() >= deadline) return { status: "unconfirmed" as const, note: `gateway ${res.status}; integrity not observed within ${GAP_POLL_BUDGET_MS}ms` };
          await sleep(GAP_POLL_INTERVAL_MS);
        }
      }
      return { status: "failed" as const, note: `deltas failed (${res.status})` };
    },
  };

  // OPEN QUESTIONS. Runs AFTER public_gap_pairs terminates (it questions the publicly_silent deltas
  // that kind writes). generate-open-questions is a plan→chunks→finalize stepper with no single-call
  // mode, so the fill DISPATCHES the self-chaining open-questions-step (fire-and-forget) and records
  // 'handed_off' — never 'completed' for work it did not observe; the stepper's own long_runner_runs
  // row (run_kind='open_questions') is truth. First-fill = (a) delta-driven questions already exist OR
  // (b) a stepper run is already in-flight → skip (no double-fire).
  const openQuestionsStep: ChainKindStep = {
    kind: "open_questions",
    alreadyPresent: async () => {
      // (a) delta-driven questions already written (cascade_gap rows do NOT block — different source_kind)
      const { data: q } = await supabase.from("first_read_open_questions").select("id")
        .eq("company_id", company_id).eq("source_kind", "silent_delta").limit(1);
      // (b) an open-questions stepper run is already in-flight — no double-fire
      const { data: run } = await supabase.from("long_runner_runs").select("id")
        .eq("company_id", company_id).eq("run_kind", "open_questions").eq("status", "running").limit(1);
      return openQuestionsAlreadyPresent({
        hasSilentDeltaRows: ((q ?? []) as unknown[]).length > 0,
        hasRunningStepper: ((run ?? []) as unknown[]).length > 0,
      });
    },
    run: async () => {
      // Await the FIRST step (plan; fast, no model) to capture the stepper's run_id/ledger; it self-
      // fires the chunks in its own background isolates. The stepper owns the ledger + integrity row.
      const res = await postFn("open-questions-step", { company_id, parent_run_id });
      if (res.status === 403 || (res.data as { frozen?: unknown } | null)?.frozen === true) {
        return { status: "failed" as const, note: "refused: company frozen" };
      }
      if (!res.ok) return { status: "failed" as const, note: `open-questions-step dispatch failed (${res.status})` };
      const ledger = (res.data as { ledger?: unknown } | null)?.ledger;
      const outcome = (res.data as { outcome?: unknown } | null)?.outcome;
      return { status: "handed_off" as const, note: `handed off to open-questions-step · run=${ledger ?? "?"} · outcome=${outcome ?? "?"}` };
    },
  };

  // FINDING BEATS. Fills Observe/Name/Open on findings WHERE beats IS NULL (idempotent). Runs INLINE
  // (fast, ~1 gpt-4.1-mini call/finding). First-fill = there ARE findings needing beats (skip if none).
  // Findings are captured upstream in the baseline; the recapture path (E4 backfill) leaves beats null,
  // so this is the backstop that fills them.
  const findingBeatsStep: ChainKindStep = {
    kind: "finding_beats",
    alreadyPresent: async () => {
      const { data } = await supabase.from("findings").select("id").eq("company_id", company_id).is("beats", null).limit(1);
      return ((data ?? []) as unknown[]).length === 0; // nothing needs beats → skip
    },
    run: async () => {
      const res = await postFn("generate-finding-beats", { company_id });
      if (!res.ok) return { status: "failed" as const, note: `finding-beats failed (${res.status})` };
      const gen = Number((res.data as { generated?: unknown } | null)?.generated ?? 0);
      return gen > 0 ? { status: "completed" as const, note: `beats generated ${gen}` } : { status: "completed_empty" as const, note: "beats: nothing to do" };
    },
  };

  // SIGNAL RECURRENCE. A self-chaining stepper (recurrence-step) — the pair corpus is large (~1865 for
  // Geniant, hours on the local judge), so the fill DISPATCHES it fire-and-forget and records
  // 'handed_off' (never 'completed' for unobserved work; the stepper's recurrence_step row is truth).
  // First-fill = finding_recurrence rows already exist OR a recurrence run is in-flight (no double-fire).
  const recurrenceStep: ChainKindStep = {
    kind: "signal_recurrence",
    alreadyPresent: async () => {
      const { data: fr } = await supabase.from("finding_recurrence").select("finding_id").eq("company_id", company_id).limit(1);
      if (((fr ?? []) as unknown[]).length > 0) return true;
      const { data: run } = await supabase.from("long_runner_runs").select("id")
        .eq("company_id", company_id).in("run_kind", ["recurrence_step", "signal_recurrence"]).eq("status", "running").limit(1);
      return ((run ?? []) as unknown[]).length > 0;
    },
    run: async () => {
      const res = await postFn("recurrence-step", { company_id, parent_run_id });
      if (res.status === 403 || (res.data as { frozen?: unknown } | null)?.frozen === true) return { status: "failed" as const, note: "refused: company frozen" };
      if (!res.ok) return { status: "failed" as const, note: `recurrence-step dispatch failed (${res.status})` };
      const ledger = (res.data as { ledger?: unknown } | null)?.ledger;
      const outcome = (res.data as { outcome?: unknown } | null)?.outcome;
      return { status: "handed_off" as const, note: `handed off to recurrence-step · run=${ledger ?? "?"} · outcome=${outcome ?? "?"}` };
    },
  };

  waitUntil(runChainKinds([ownWordsStep, gapPairsStep, openQuestionsStep, findingBeatsStep, recurrenceStep], { recordChainLedger }));

  return json({ ok: true, ...result });
});
