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
  chainKindLedgerStatus, chainKindIsTerminal, openQuestionsAlreadyPresent, handoffTerminal, missingPublicReadKinds, marketReadIsEmpty, marketDiscoveryNeedsFire,
  publicReadsDepsTerminal, depTerminalForScore,
  type PublicReadKind, type GenPerKind, type KindStatus,
  type ChainKindStep, type ChainKindTerminal, type DepRow,
} from "../_shared/firstReadFill.ts";
import { handOffToResumeStepper, isGatewayCut, newResumeState, resumeHandoffNote } from "../_shared/gatewayResume.ts";
import { gapPairsAlreadyPresent, gapPairsFreshnessNote, gapPairsStaleness, type FreshnessVerdict } from "../_shared/gapPairsFreshness.ts";

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
  let stage = "";
  try { const b = await req.json(); company_id = String(b.company_id ?? ""); parent_run_id = b.parent_run_id != null ? String(b.parent_run_id) : null; owns_parent_close = b.owns_parent_close === true; stage = String(b.stage ?? ""); } catch { /* */ }
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
  const recordKindLedger = async (kind: string, status: KindStatus, detail?: string | null) => {
    // 2026-09-09: a failed kind now names the GUARD that rejected it (generate-public-read returns
    // per_kind:{kind:{status,guard,detail}}), instead of one generic string for all four kinds.
    const failText = detail && detail.trim() !== ""
      ? `generation failed or judge/citation reject — ${detail}`.slice(0, 300)
      : "generation failed or judge/citation reject";
    const ins: Record<string, unknown> = {
      run_kind: `fr_${kind}`, company_id,
      status: status === "completed_empty" ? "completed" : status, // ledger CHECK allows only completed/failed/running
      done_count: status === "completed" ? 1 : 0,
      error_text: status === "completed_empty" ? "already current — first-fill no-op" : (status === "failed" ? failText : null),
      finished_at: new Date().toISOString(),
    };
    if (parent_run_id) ins.parent_run_id = parent_run_id;
    await supabase.from("long_runner_runs").insert(ins);
  };

  const generatePublicRead = async (kinds: PublicReadKind[]): Promise<{ perKind: GenPerKind; detail: Record<string, string> }> => {
    const res = await fetch(`${url}/functions/v1/generate-public-read`, {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ company_id, write: true, kinds }),
    });
    let data: Record<string, unknown> | null = null;
    try { data = await res.json(); } catch { /* */ }
    const perKind: GenPerKind = {};
    const detail: Record<string, string> = {};
    const written = Array.isArray((data as { written?: unknown })?.written) ? (data as { written: Array<{ kind?: string }> }).written : [];
    const ok = res.ok && !!data && (data as { ok?: unknown }).ok !== false;

    // PER-KIND (2026-09-09): generate-public-read now isolates the kinds and reports each one's
    // own status + the guard that rejected it. Prefer that map — one kind's reject no longer
    // implies anything about the others. The `written`/whole-run fallbacks below stay for a
    // response that predates the map (older deploy) so this caller never regresses.
    const rawPerKind = (data as { per_kind?: unknown } | null)?.per_kind;
    if (rawPerKind && typeof rawPerKind === "object") {
      const map = rawPerKind as Record<string, { status?: string; guard?: string | null; detail?: string | null }>;
      let sawAny = false;
      for (const k of kinds) {
        const entry = map[k];
        if (!entry || typeof entry.status !== "string") continue;
        sawAny = true;
        perKind[k] = entry.status === "written" ? "written" : "rejected";
        if (entry.guard) detail[k] = `guard=${entry.guard}${entry.detail ? ` detail=${entry.detail}` : ""}`;
      }
      if (sawAny) {
        for (const k of kinds) if (!perKind[k]) perKind[k] = "rejected";
        return { perKind, detail };
      }
    }

    if (ok && written.length > 0) {
      const w = new Set(written.map((x) => x.kind));
      for (const k of kinds) perKind[k] = w.has(k) ? "written" : "rejected"; // a judged reject leaves the kind out of `written`
    } else {
      for (const k of kinds) perKind[k] = "rejected"; // whole-run reject / error — honest terminal, never retried
    }
    return { perKind, detail };
  };

  // GATE B — fire the gated public-reads stage. Fire-and-forget and self-gating: it no-ops with
  // deps_pending until BOTH own-words and recurrence have terminated, so it is safe to call from
  // every terminal. Mirrors the outside-score fire exactly.
  const firePublicReadsStage = () => fetch(`${url}/functions/v1/first-read-fill`, {
    method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({ company_id, parent_run_id, stage: "public_reads" }),
  }).catch(() => {});

  const fireMarketDiscovery = async () => {
    waitUntil(fetch(`${url}/functions/v1/market-discovery-step`, {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ company_id, parent_run_id }),
    }).catch(() => {}));
  };

  const closeParent = owns_parent_close && parent_run_id
    ? async () => { await supabase.from("long_runner_runs").update({ status: "completed", done_count: 0, error_text: "first read filled", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", parent_run_id); }
    : undefined;

  // ══ GATE B (2026-09-09) — the GATED PUBLIC-READS STAGE ═════════════════════════════════════════
  // Public reads no longer ride baseline_complete. They are fired fire-and-forget (from this
  // function's own tail, from the own-words terminal, and from the recurrence-step finalize) and
  // SELF-GATE here on both upstreams having terminated — the same shape outside-score already uses.
  // On a fresh onboarding the first two fires no-op with deps_pending; whichever upstream lands last
  // re-fires and this run generates. Idempotent: only MISSING kinds are ever generated.
  if (stage === "public_reads") {
    const { data: owRow } = await supabase.from("long_runner_runs")
      .select("status, error_text").eq("company_id", company_id).eq("run_kind", "fr_own_words")
      .order("started_at", { ascending: false }).limit(1).maybeSingle();
    const { data: rcRow } = await supabase.from("long_runner_runs")
      .select("status, error_text").eq("company_id", company_id).eq("run_kind", "recurrence_step")
      .order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (!publicReadsDepsTerminal(owRow as DepRow, rcRow as DepRow)) {
      // GATE D (D2) — CLOSE THE ROW. This stage opens a `first_read_fill` ledger row at entry, and a
      // deps_pending return used to leave it 'running' forever: one leaked row per poll, and the gate
      // is polled on every upstream terminal. Chosen fix: keep opening the row (one honest record per
      // poll, so the wait is visible in the ledger) and CLOSE it as completed with the deps_pending
      // note. The alternative — not opening a row until the gate is open — would have hidden the
      // polling entirely, and a gate that never opens is exactly what an operator needs to see.
      if (stageId) {
        await supabase.from("long_runner_runs").update({
          status: "completed", done_count: 0,
          error_text: `deps_pending — own-words ${(owRow as { status?: string } | null)?.status ?? "absent"}, recurrence ${(rcRow as { status?: string } | null)?.status ?? "absent"}`,
          finished_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq("id", stageId);
      }
      return json({
        ok: true, skipped: "deps_pending",
        own_words: (owRow as { status?: string } | null)?.status ?? null,
        recurrence: (rcRow as { status?: string } | null)?.status ?? null,
      });
    }
    const { data: cur } = await supabase.from("public_reads").select("kind").eq("company_id", company_id).eq("is_current", true);
    const missing = missingPublicReadKinds(((cur ?? []) as Array<{ kind: string }>).map((r) => r.kind));
    if (missing.length === 0) {
      if (stageId) {
        await supabase.from("long_runner_runs").update({
          status: "completed", done_count: 0, error_text: "all reads current — gate no-op",
          finished_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq("id", stageId);
      }
      return json({ ok: true, skipped: "all_reads_current" });
    }

    // INPUT-FAMILY CENSUS — recorded on the run so an empty or thin read is attributable to the
    // record it was generated from, not to an unexplained reject.
    const countOf = async (table: string, apply: (q: any) => any): Promise<number> => { // deno-lint-ignore-line no-explicit-any
      const { count } = await apply(supabase.from(table).select("id", { count: "exact", head: true }).eq("company_id", company_id));
      return Number(count ?? 0);
    };
    const inputsPresent = {
      own_words_candidates_kept: await countOf("own_words_candidates", (q: any) => q.eq("judge_keep", true)), // deno-lint-ignore-line no-explicit-any
      finding_recurrence: await countOf("finding_recurrence", (q: any) => q), // deno-lint-ignore-line no-explicit-any
      outside_signals: await countOf("signals", (q: any) => q.eq("signal_band", "outside")), // deno-lint-ignore-line no-explicit-any
      own_words_terminal: (owRow as { status?: string } | null)?.status ?? null,
      recurrence_terminal: (rcRow as { status?: string } | null)?.status ?? null,
    };
    const gen = await generatePublicRead(missing);
    for (const k of missing) {
      const st = gen.perKind[k] === "written" ? "completed" : "failed";
      await recordKindLedger(k, st as KindStatus, gen.detail[k] ?? null);
    }
    await supabase.from("integrity_runs").insert({
      company_id, component: "first_read_public_reads_gate", status: "completed",
      examined: missing.length,
      admitted: missing.filter((k) => gen.perKind[k] === "written").length,
      excluded_by_rule: { inputs_present: inputsPresent, per_kind: gen.perKind, guards: gen.detail },
    }).then(() => {}, () => {}); // observability only — never fails the stage
    if (stageId) {
      const wrote = missing.filter((k) => gen.perKind[k] === "written");
      await supabase.from("long_runner_runs").update({
        status: "completed", done_count: wrote.length,
        error_text: `gate open — generated: ${wrote.join(",") || "none"}${wrote.length < missing.length ? ` · rejected: ${missing.filter((k) => gen.perKind[k] !== "written").join(",")}` : ""}`,
        finished_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", stageId);
    }
    return json({ ok: true, stage: "public_reads", generated: missing.filter((k) => gen.perKind[k] === "written"), per_kind: gen.perKind, inputs_present: inputsPresent });
  }

  // GATE B: the baseline-triggered fill no longer generates public reads. It still fires market
  // discovery and closes the parent; the reads run in the gated stage above once own-words and
  // recurrence terminate. `firePublicReadsStage` below is the first (usually no-op) fire.
  const result = await runFirstReadFill({ missingKinds, marketNeedsFire, generatePublicRead, recordKindLedger, fireMarketDiscovery, closeParent, generateReads: false });

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
    // GATE B — own-words just reached a terminal: re-fire the gated public-reads stage. It no-ops
    // unless recurrence has ALSO terminated, so whichever upstream lands last is the one that opens
    // the gate. (Recurrence fires the same stage from its own finalize.)
    if (kind === "own_words") waitUntil(firePublicReadsStage());

    // 2026-09-10 — RE-ENTER ON AN OWN-WORDS **WRITE**. The declared side just changed, so gap pairs
    // must re-evaluate its freshness predicate. This covers the out-of-band paths the in-chain
    // ordering does not: a gateway-resume write that lands long after the chain moved on, and a
    // manual write. On the normal path the re-entry is redundant (gap pairs runs next in this very
    // chain) and idempotent — it finds the deltas fresh and skips.
    //
    // LOOP GUARD: fire ONLY on a note carrying "wrote " — i.e. an actual write terminal. A re-entry's
    // own-words is always the already-present skip path, whose note is "already present …", so the
    // chain is exactly one hop deep and cannot recur.
    if (kind === "own_words" && (note ?? "").includes("wrote ")) {
      waitUntil(fetch(`${url}/functions/v1/first-read-fill`, {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({ company_id, parent_run_id }),
      }).catch(() => {}));
    }
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

  // Most-recent first_read_own_words integrity status (the plan/write worker owns this row).
  const readOwnWordsIntegrityStatus = async (): Promise<string | null> => {
    const { data } = await supabase.from("integrity_runs").select("status")
      .eq("company_id", company_id).eq("component", "first_read_own_words")
      .order("ran_at", { ascending: false }).limit(1);
    return ((data ?? []) as Array<{ status: string }>)[0]?.status ?? null;
  };

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
      // PHASE 2 — write: materialize own_words claims + integrity 'completed'. Shared by the normal
      // path and the gateway-resume path, so a resumed run writes through exactly the same code.
      const doWrite = async (planned: number, prefix = ""): Promise<{ status: ChainKindTerminal; note?: string }> => {
        const write = await postFn("extract-own-words", { company_id, mode: "write" });
        if (!write.ok) {
          // 409 = the frozen plan produced no candidates → looked, none kept (earned empty).
          if (write.status === 409) return { status: "completed_empty" as const, note: `${prefix}plan ${planned} · no candidates` };
          return { status: "failed" as const, note: `${prefix}write failed (${write.status})` };
        }
        const inserted = Number((write.data as { inserted?: unknown } | null)?.inserted ?? 0);
        return inserted > 0
          ? { status: "completed" as const, note: `${prefix}plan ${planned} · wrote ${inserted}` }
          : { status: "completed_empty" as const, note: `${prefix}plan ${planned} · wrote 0` };
      };

      // PHASE 1 — plan: fetch + snapshot + freeze candidates + integrity 'planned'. No claims written.
      const plan = await postFn("extract-own-words", { company_id, mode: "plan" });
      if (!plan.ok) {
        if (plan.status === 403) return { status: "failed" as const, note: "refused: company frozen" };
        // GATEWAY CUT — UNKNOWN, never failed. The plan isolate owns its 'planned' integrity row and
        // routinely finishes AFTER the gateway cuts us (Riverlane: cut 17:25:55, row 17:26:24). Poll
        // for that row and, on finding it, issue the write the cut caller never got to send.
        if (isGatewayCut(plan.status)) {
          // GATE D — HAND THE WAIT OFF. Gate B polled here, inside this isolate; on Brand AI that
          // spent ~150s of the fill's wall clock and the isolate was killed 19s later, taking
          // gap-pairs, relevance, open-questions, finding-beats, recurrence and the score with it.
          // Now the stepper owns the wait: we open its row, dispatch once, and the chain CONTINUES.
          const { rowId } = await handOffToResumeStepper({
            companyId: company_id,
            parentRunId: parent_run_id,
            state: newResumeState({
              component: "first_read_own_words",
              terminalStatuses: ["planned", "completed"],
              followUp: { fn: "extract-own-words", body: { company_id, mode: "write" } },
              // When the write lands, re-enter the fill so the stages that self-gate on own-words
              // (gap-pairs) run with the declared side present.
              onDone: [{ fn: "first-read-fill", body: { company_id, parent_run_id } }],
            }),
            openRow: async (row) => {
              const { data } = await supabase.from("long_runner_runs").insert(row).select("id").single();
              return (data as { id?: unknown } | null)?.id ? String((data as { id: unknown }).id) : null;
            },
            dispatch: (id) => {
              waitUntil(fetch(`${url}/functions/v1/gateway-resume-step`, {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
                body: JSON.stringify({ company_id, row_id: id }),
              }).catch(() => {}));
            },
          });
          return {
            status: "handed_off" as const,
            note: rowId ? resumeHandoffNote("first_read_own_words", plan.status) : `gateway ${plan.status}; resume row could not be opened`,
          };
        }
        return { status: "failed" as const, note: `plan failed (${plan.status})` };
      }
      const planned = Array.isArray((plan.data as { would_be_own_words?: unknown } | null)?.would_be_own_words)
        ? (plan.data as { would_be_own_words: unknown[] }).would_be_own_words.length : 0;
      return await doWrite(planned);
    },
  };

  // PUBLIC GAP-PAIRS. First-fill = a non-failed first_read_gap_pairs integrity row OR any existing
  // public_vs_public claim_deltas. The worker self-writes first_read_gap_pairs on every terminal.
  // Beat-4 relevance overlay: armed ONLY by a COMPLETED public_gap_pairs terminal (never unconfirmed /
  // failed / completed_empty). The relevance chain kind below dispatches the stepper when armed OR when
  // unstamped judgeable rows already exist from an earlier run; the stepper itself self-gates.
  let relevanceArmed = false;
  // The freshness verdict from the presence check, banked so both the skip note and the run note can
  // show their working (which timestamps decided it).
  let gapFreshness: FreshnessVerdict | null = null;
  const gapPairsStep: ChainKindStep = {
    kind: "public_gap_pairs",
    alreadyPresent: async () => {
      const { data: intg } = await supabase.from("integrity_runs").select("id")
        .eq("company_id", company_id).eq("component", "first_read_gap_pairs")
        .in("status", ["completed", "skipped_empty_input"]).limit(1);
      const { data: dl } = await supabase.from("claim_deltas").select("id")
        .eq("company_id", company_id).eq("pairing_kind", "public_vs_public").limit(1);
      const present = ((intg ?? []) as unknown[]).length > 0 || ((dl ?? []) as unknown[]).length > 0;

      // FRESHNESS (2026-09-09): presence alone let a STALE set block its own refresh. Riverlane's
      // deltas were computed against zero own-words claims; the 7 claims arrived 3.5h later and the
      // guard skipped the recompute forever, so the cold open reported one INFERRED claim while
      // seven verbatim self-descriptions sat unpaired. Deltas older than the declared side re-run.
      const { data: owNewest } = await supabase.from("claims").select("created_at")
        .eq("company_id", company_id).eq("claim_type", "own_words").eq("status", "active")
        .order("created_at", { ascending: false }).limit(1);
      const { data: dNewest } = await supabase.from("claim_deltas").select("computed_at")
        .eq("company_id", company_id).eq("pairing_kind", "public_vs_public")
        .order("computed_at", { ascending: false }).limit(1);
      const freshness = gapPairsStaleness({
        newestOwnWordsAt: ((owNewest ?? []) as Array<{ created_at: string }>)[0]?.created_at ?? null,
        newestDeltaAt: ((dNewest ?? []) as Array<{ computed_at: string }>)[0]?.computed_at ?? null,
      });
      gapFreshness = freshness;
      if (freshness.stale) {
        console.log(`[first-read-fill] gap pairs STALE (${freshness.reason}) — ${gapPairsFreshnessNote(freshness)}`);
      }
      return gapPairsAlreadyPresent(present, freshness);
    },
    presenceNote: () => (gapFreshness ? gapPairsFreshnessNote(gapFreshness) : null),
    run: async () => {
      // GATE D — SELF-GATE on the resumed component. own-words may be mid-resume (handed off to the
      // stepper); comparing against a declared side that has not landed yet would bank a weaker
      // pairing permanently. Same predicate the public-reads gate uses: terminal, not successful.
      const { data: owRow } = await supabase.from("long_runner_runs")
        .select("status, error_text").eq("company_id", company_id).eq("run_kind", "fr_own_words")
        .order("started_at", { ascending: false }).limit(1).maybeSingle();
      if (owRow && !depTerminalForScore(owRow as DepRow)) {
        return { status: "handed_off" as const, note: "deferred — own-words not terminal (resume in flight); re-runs when it lands" };
      }
      const res = await postFn("generate-claim-deltas", { company_id, pairing_kind: "public_vs_public", write: true });
      if (res.status === 403) return { status: "failed" as const, note: "refused: company frozen" };
      const data = res.data as { ok?: unknown; skipped?: unknown; empty?: unknown } | null;
      if (res.ok && data && data.ok !== false) {
        // The worker returns success-shaped with a marker for the earned no-declared-side empty state.
        if (data.skipped === "no_declared_claims" || data.empty === true) return { status: "completed_empty" as const, note: "no declared side — nothing to compare yet" };
        relevanceArmed = true; // completed terminal → the relevance kind fires next
        const why = gapFreshness ? ` · ${gapPairsFreshnessNote(gapFreshness)}` : "";
        return { status: "completed" as const, note: `public deltas computed${why}` };
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

  // RELEVANCE BACKSTOP (operator ruling 2026-09-03). Runs AFTER public_gap_pairs: the delta finalize's
  // stale sweep deletes the row-bound relevance stamps, so the fill re-fires refresh-relevance-step —
  // dispatched fire-and-forget, recorded 'handed_off' (the stepper's relevance_backstop row is truth).
  // First-fill = zero unstamped judgeable rows OR a relevance chain already running (the stepper applies
  // the same gate again, so a double dispatch adopts rather than spawns). NOT fired on an unconfirmed /
  // failed gap-pairs terminal unless unstamped rows from an earlier run are already waiting.
  const relevanceStep: ChainKindStep = {
    kind: "relevance_backstop",
    alreadyPresent: async () => {
      const { count } = await supabase.from("claim_deltas").select("id", { count: "exact", head: true })
        .eq("company_id", company_id).eq("pairing_kind", "public_vs_public")
        .in("delta_type", ["echoed", "divergent"]).is("relevance_verdict", null);
      if (Number(count ?? 0) === 0) return true; // nothing to stamp — first-fill satisfied
      const { data: run } = await supabase.from("long_runner_runs").select("id")
        .eq("company_id", company_id).eq("run_kind", "relevance_backstop").eq("status", "running").limit(1);
      return ((run ?? []) as unknown[]).length > 0;
    },
    run: async () => {
      if (!relevanceArmed) return { status: "completed_empty" as const, note: "gap pairs not completed this fill — waiting rows left for the next completed delta terminal" };
      const res = await postFn("refresh-relevance-step", { company_id, parent_run_id });
      if (res.status === 403 || (res.data as { frozen?: unknown } | null)?.frozen === true) return { status: "failed" as const, note: "refused: company frozen" };
      if (!res.ok) return { status: "failed" as const, note: `refresh-relevance-step dispatch failed (${res.status})` };
      const d = res.data as { skipped?: unknown; stepped?: unknown; drained?: unknown; remaining?: unknown } | null;
      if (d?.skipped === "nothing_to_stamp") return { status: "completed_empty" as const, note: "nothing to stamp" };
      return { status: "handed_off" as const, note: `handed off to refresh-relevance-step · ${d?.drained ? "drained" : `remaining=${d?.remaining ?? "?"}`}` };
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
      // H2: a terminal reported in THIS response is observed, and recorded as the terminal it is.
      const status = handoffTerminal(outcome);
      const verb = status === "handed_off" ? "handed off to" : `observed terminal (${status}) from`;
      return { status, note: `${verb} open-questions-step · run=${ledger ?? "?"} · outcome=${outcome ?? "?"}` };
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
      // H2: same rule as open questions — an observed terminal is recorded as one.
      const status = handoffTerminal(outcome);
      const verb = status === "handed_off" ? "handed off to" : `observed terminal (${status}) from`;
      return { status, note: `${verb} recurrence-step · run=${ledger ?? "?"} · outcome=${outcome ?? "?"}` };
    },
  };

  // OUTSIDE SCORE (orphan #6) — the outside Mojo Score producer. NOT a sequential chain kind: it depends
  // on signal recurrence, which is handed-off (async), so it cannot run inline after the recurrence
  // DISPATCH. Instead it is fired fire-and-forget here (TRIGGER ii) and self-gates: on a fresh A′ its deps
  // are still running → it no-ops (deps_pending); the recurrence-step finalize re-fires it (TRIGGER i)
  // once recurrence lands. On a re-invoke where both deps are ALREADY terminal (Geniant), it scores now.
  // One path, first-fill-guarded — never double-scores.
  const fireOutsideScore = () => fetch(`${url}/functions/v1/outside-score`, {
    method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({ company_id }),
  }).catch(() => {});
  waitUntil(runChainKinds([ownWordsStep, gapPairsStep, relevanceStep, openQuestionsStep, findingBeatsStep, recurrenceStep], { recordChainLedger })
    .then(fireOutsideScore)
    .then(firePublicReadsStage));

  return json({ ok: true, ...result });
});
