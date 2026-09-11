// ── Market-discovery self-chaining stepper (pure orchestration) ─────────────────────────────────
//
// FIRST-FILL AUTO-CHAIN (operator ruling 2026-09-01): market discovery (generate-market-discovery,
// local llama3:70b, ~minutes) outlives the full_refresh parent and CANNOT fit one 400s isolate. It
// self-chains: ONE model phase per fire, then self-fires the next. The candidate MANIFEST + cursor are
// DB-persisted (market_discovery_chain), so a mid-chunk isolate death is RESUMABLE by the next fire —
// the ledger is never a stuck 'running' lie.
//
// TERMINAL DISCIPLINE (the claim_deltas lesson) — TWO independent bounds, both real:
//   (1) a hard max-step ceiling, checked before any work;
//   (2) a NO-PROGRESS guard: HOLD_LIMIT consecutive unconfirmed holds at the SAME cursor close the
//       run failed. Gate 1c restored this. It was deleted in 0cb86fb when the unconfirmed HOLD
//       replaced the old no_progress terminal, and the hold path — unlike every progress path — does
//       not increment stepCount, so bound (1) could never bind on a repeating hold. That was harmless
//       only while NOTHING re-fired a held run; the sweep's RE-ARM (2) branch now does, at */5, so a
//       deterministically-dying chunk would otherwise loop forever. The guard is what makes the
//       automatic resume safe to switch on.
//
// This module is the PURE orchestration seam — every side effect (plan / judge-chunk / finalize /
// persist / close / self-fire) is injected, so the resume-after-death and no-refire-on-no-progress
// proofs exercise it with fakes and no live models.

/** The DB-persisted chain state (market_discovery_chain row), read at the start of each fire. */
export type MDChainState = {
  planned: boolean;      // has the plan run + manifest been persisted?
  candidates: unknown[]; // the persisted candidate manifest (empty until planned)
  cursor: number;        // next candidate index to judge
  chunkSize: number;     // candidates judged per fire (≤2 recommended)
  stepCount: number;     // fires so far (bounds the loop)
  maxSteps: number;      // HARD terminal — self-fire is impossible beyond this
  // NO-PROGRESS guard (Gate 1c). holdCursor is the cursor the consecutive holds are counted AT, so a
  // hold that moves to a new cursor is real progress and restarts the count at 1. Any progress path
  // clears both. Absent on a legacy chain row ⇒ 0 / null ⇒ the first hold starts a fresh count.
  holdsAtCursor: number;
  holdCursor: number | null;
};

/** Consecutive holds at ONE cursor before the run is closed failed. Three: a hold is a maybe-alive
 *  worker, so one or two are ordinary (a slow local 70b, a gateway cut); three at the SAME cursor with
 *  nothing accounted in between is a chunk that cannot land, not a chunk that is slow. */
export const HOLD_LIMIT = 3;

/** The stepper's HOLD marker, written by markUnconfirmed and read by three places that must agree:
 *  the adopt path (consumes it), the sweep's RE-ARM (2) predicate (`error_text LIKE 'unconfirmed:%'`),
 *  and the admin fill-status cell. One constant so the prefix can never drift between them. */
export const HOLD_NOTE_PREFIX = "unconfirmed:";

/**
 * Does adopting this ledger row require re-opening it (status → 'running', error_text → null)?
 *
 * A failed/unconfirmed row obviously does. The load-bearing case is the second clause: a HELD row is
 * ALREADY 'running', so the original `status !== "running"` test skipped it and the hold marker
 * survived the entire resumed fire. Since the sweep re-arms on exactly that marker, leaving it in
 * place would post again five minutes later on top of a fire still doing work — two isolates judging
 * one chunk, and the def write is not race-safe. Clearing it here makes the marker exactly-once per
 * hold: markUnconfirmed sets it, the resumed fire consumes it, a further hold sets it again.
 */
export function shouldReopenAdoptedRun(status: string | null, errorText: string | null): boolean {
  return status !== "running" || String(errorText ?? "").startsWith(HOLD_NOTE_PREFIX);
}

export type MDStepConfig = {
  state: MDChainState;
  /** Run the plan (generate-market-discovery plan:true). alreadyDiscovered ⇒ nothing to do. */
  plan: () => Promise<{ candidates: unknown[]; alreadyDiscovered?: boolean }>;
  /** Judge ONE chunk (generate-market-discovery candidates:[chunk]); ok:false ⇒ the FETCH did not return
   *  a success — but the worker (local 70b, ~45s/candidate) may still be alive and writing server-side,
   *  so ok:false is NEVER treated as failure on its own. confirmChunk is the arbiter (DB is truth). */
  judgeChunk: (chunk: unknown[]) => Promise<{ ok: boolean }>;
  /** CONFIRM-POLL (the gap_pairs 504 class, for discovery): on a not-ok chunk fetch, bounded-poll the
   *  chunk's PERSISTED writes and return how many LEADING candidates (contiguous from the chunk start)
   *  are accounted — a written def (accepted/deduped), a banked solution_agnostic verdict
   *  (rejected_solution), or a banked buyer verdict (rejected_buyer). A judged rejection with a
   *  persisted reason counts as accounted, never "not yet". 0 ⇒ nothing landed within the window. */
  confirmChunk: (chunk: unknown[]) => Promise<{ accounted: number }>;
  /** Gate 7d — the COMPLETED gate. One boolean per manifest index: does this candidate have its own
   *  terminal record (an outcome row at the current criterion version, or an error terminal)? Same
   *  rule as the confirm-poll (marketCandidateAccounted), asked of the WHOLE manifest, because the
   *  cursor reaching the end says only that every chunk was dispatched — not that every row landed.
   *  done_count is derived from this, never from the cursor. */
  accountedIndices: (candidates: unknown[]) => Promise<boolean[]>;
  /** The unscoped finalize (generate-market-discovery with no candidates). */
  finalize: () => Promise<void>;
  /** Persist the plan manifest to the ledger chain row (DB is truth). */
  persistPlanned: (candidates: unknown[]) => Promise<void>;
  /** Persist cursor + stepCount advance after a completed chunk. `holdsAtCursor` is ALWAYS 0 here —
   *  progress of any kind clears the no-progress count, and passing it explicitly keeps that rule in
   *  the pure seam where a proof can see it, rather than hiding it in the writer. */
  persistProgress: (cursor: number, stepCount: number, holdsAtCursor: number, doneCount: number) => Promise<void>;
  /** Close the ledger completed (empty = nothing was discovered / already discovered). */
  closeCompleted: (empty: boolean) => Promise<void>;
  /** Close the ledger failed with a machine-readable reason (terminal, no self-fire). */
  closeFailed: (reason: string) => Promise<void>;
  /** HOLD the chain non-terminal at the given cursor: status stays 'running' + the 'unconfirmed:' note
   *  (sweep-excluded from the CLOSE, and the marker the sweep's RE-ARM (2) keys on), NO self-fire. The
   *  worker may be alive; a re-fire (the sweep, the fill predicate, or manual control) resumes from
   *  this cursor. NEVER 'failed' when the worker may still be writing. `holdsAtCursor` is the running
   *  count of consecutive holds AT this cursor — persisted so the next fire can bound it. */
  markUnconfirmed: (cursor: number, holdsAtCursor: number) => Promise<void>;
  /** Self-fire the next step (a fresh isolate). Never called on a terminal or an unconfirmed hold. */
  selfFire: () => Promise<void>;
};

export type MDStepOutcome =
  | "terminate_max_steps"
  | "already_discovered"
  | "planned_empty"
  | "planned"
  | "finalized"
  // Gate 7d: the cursor had reached the end but some manifest index has no row and no error terminal
  // — the ledger stays open, the cursor is rewound to the first such index, and that chunk is judged
  // on this same fire (its own chunk_* / hold outcome is what is returned, not this).
  | "chunk_done"
  // not-ok fetch, but the confirm-poll accounted the chunk's writes → cursor advanced, chain continues.
  | "chunk_recovered"          // the whole chunk was accounted
  | "chunk_recovered_partial"  // only the leading N were accounted; the tail re-judges next fire
  // not-ok fetch, nothing accounted within the window → non-terminal hold (running + note), no self-fire.
  | "unconfirmed_hold"
  // HOLD_LIMIT consecutive holds at the SAME cursor with nothing accounted between them → terminal.
  | "no_progress_failed";

/**
 * Run ONE market-discovery step. Exactly one of: terminate (max-steps/no-progress → failed), plan,
 * finalize, or judge-one-chunk-then-self-fire. Every non-terminal path that has more work self-fires
 * exactly once; every terminal path closes the ledger and NEVER self-fires.
 */
export async function runMarketDiscoveryStep(cfg: MDStepConfig): Promise<{ outcome: MDStepOutcome }> {
  const s = cfg.state;

  // FINALIZE FIRST (Gate 5d) — a chain whose cursor has reached the end of its manifest has no judge
  // work left; closing it is bookkeeping, not a step a runaway could take. It therefore closes
  // COMPLETED regardless of the step count. Geniant's v2 re-fire carried step_count 9, judged all six
  // in three steps (12) and then self-fired for this close — which the ceiling below caught first and
  // wrote 'max_steps exceeded' over a finished chain: a status that misdescribed the work. (A chain
  // whose rows are SHORT is not finished — the Gate 7d rewind below sends it back through the ceiling.)
  //
  // Gate 7d (operator ruling 2026-09-11) — COMPLETED IS GATED ON THE ROWS, NOT THE CURSOR. The
  // 2026-09-11 diagnostic found every one of Coreviva, whispering.ai and Edgewood closing 'completed'
  // while the last worker was still judging (−3 min, −1 min, −29 s before its rows landed): the cursor
  // had reached the end because the confirm-poll advanced it, and the terminal was written on that
  // alone. A status written before the work it describes is not a status. So the close asks the
  // manifest, index by index, "is your row (or error terminal) on the record?" — and closes only when
  // every index answers yes. done_count is that count. If any index is short, the cursor is REWOUND
  // to the first such index and it is judged again on this fire: the worker's decided-skip files the
  // missing row (banked verdicts make it cheap), and the ordinary chunk path — step ceiling, confirm-
  // poll, hold count — bounds it exactly as it bounds any other chunk.
  let cursor = s.cursor;
  if (s.planned && cursor >= s.candidates.length) {
    const accounted = await cfg.accountedIndices(s.candidates);
    const firstMissing = accounted.findIndex((a) => !a);
    if (firstMissing === -1) {
      await cfg.persistProgress(cursor, s.stepCount, 0, accounted.length);
      await cfg.finalize();
      await cfg.closeCompleted(false);
      return { outcome: "finalized" };
    }
    cursor = firstMissing;
  }

  // TERMINAL 1 — hard step ceiling. Checked before any WORK (plan or judge) so a runaway can never do
  // more; it binds only while work remains.
  if (s.stepCount >= s.maxSteps) {
    await cfg.closeFailed(`max_steps (${s.maxSteps}) exceeded — market discovery halted`);
    return { outcome: "terminate_max_steps" };
  }

  // PLAN — once. Persists the manifest to the DB, then self-fires into judging.
  if (!s.planned) {
    const { candidates, alreadyDiscovered } = await cfg.plan();
    if (alreadyDiscovered) {
      await cfg.closeCompleted(true);
      return { outcome: "already_discovered" };
    }
    await cfg.persistPlanned(candidates);
    if (candidates.length === 0) {
      await cfg.closeCompleted(true); // nothing to discover — an honest empty completion
      return { outcome: "planned_empty" };
    }
    await cfg.selfFire();
    return { outcome: "planned" };
  }

  // JUDGE ONE CHUNK — resume from the DB cursor (NOT from 0; or from the Gate 7d rewind), advance,
  // self-fire. done_count is re-derived from the manifest's rows after every advance.
  const chunk = s.candidates.slice(cursor, cursor + s.chunkSize);
  const res = await cfg.judgeChunk(chunk);
  const nextCursor = cursor + chunk.length;
  const doneCount = async () => (await cfg.accountedIndices(s.candidates)).filter(Boolean).length;
  // A Gate 7d rewind chooses THIS fire's chunk; it never moves the persisted cursor backwards. The
  // tail past the rewound chunk was already dispatched — re-walking it would spend a step per chunk
  // on decided-skips. The next fire's finalize gate finds the next missing index, if any.
  const advanceTo = (n: number) => Math.max(n, s.cursor);

  // HAPPY PATH — the fetch returned success and the chunk is non-empty → advance + self-fire.
  if (res.ok && nextCursor > cursor) {
    await cfg.persistProgress(advanceTo(nextCursor), s.stepCount + 1, 0, await doneCount());
    await cfg.selfFire();
    return { outcome: "chunk_done" };
  }

  // NOT-OK — the fetch did not return success (isolate wall / gateway cut). The worker may be ALIVE and
  // still writing (~45s/candidate on local 70b). DB is truth: confirm-poll the chunk's persisted writes
  // before ever calling it failed (the gap_pairs 504 class; market-discovery had no confirm-poll before).
  const { accounted } = await cfg.confirmChunk(chunk);
  if (accounted > 0) {
    // Progress is REAL (a def / a banked verdict landed) → advance to the last accounted candidate
    // (full or partial) and continue. The unaccounted tail re-judges next fire — banked-verdict cheap,
    // dedup-safe by content identity. A real advance means no infinite loop.
    const advanced = cursor + Math.min(accounted, chunk.length);
    await cfg.persistProgress(advanceTo(advanced), s.stepCount + 1, 0, await doneCount());
    await cfg.selfFire();
    return { outcome: advanced >= nextCursor ? "chunk_recovered" : "chunk_recovered_partial" };
  }

  // Nothing landed within the window → the worker may still be alive mid-first-candidate. HOLD
  // non-terminal (running + note, sweep-excluded); NO self-fire (no hot loop). A later re-fire — the
  // sweep's RE-ARM (2), the fill predicate, or manual control — resumes from this cursor.
  //
  // TERMINAL 2 — NO-PROGRESS. "Maybe alive" is a claim with an expiry date. HOLD_LIMIT consecutive
  // holds at the SAME cursor means HOLD_LIMIT fires accounted NOTHING there: not a slow worker, a
  // stuck one. Close it failed with the sibling steppers' wording, so the operator sees a terminal
  // instead of a row that is re-armed every five minutes forever. A hold at a DIFFERENT cursor is
  // progress and restarts the count.
  const holds = s.holdCursor === cursor ? s.holdsAtCursor + 1 : 1;
  if (holds >= HOLD_LIMIT) {
    await cfg.closeFailed(`no_progress at cursor ${cursor} — market discovery halted`);
    return { outcome: "no_progress_failed" };
  }
  await cfg.markUnconfirmed(cursor, holds);
  return { outcome: "unconfirmed_hold" };
}
