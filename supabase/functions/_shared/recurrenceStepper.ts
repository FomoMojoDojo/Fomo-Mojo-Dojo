// ── Signal-recurrence self-chaining stepper (pure orchestration) ─────────────────────────────────
//
// generate-signal-recurrence is plan → cap-5 pair chunks (freeze verdicts by pair_identity) → one
// unscoped finalize (prune → union-find clusters → R1 finding↔cluster join → finding_recurrence
// reconcile). No single-call mode; a company of Geniant's size has ~1865 candidate pairs (373 chunks,
// ~78 min to hours on the local 70b judge), far more than one isolate holds. This stepper does ONE
// chunk per fire then self-fires, mirroring open-questions-step / market-discovery-step. The pair
// MANIFEST + cursor are DB-persisted (long_runner_runs.chain_state), so a mid-chunk isolate death is
// RESUMABLE — banked verdicts (frozen by pair_identity) make resume zero-re-judge. Terminal discipline:
// max-steps + a no-progress guard make an infinite self-fire loop structurally impossible. The
// generate-signal-recurrence worker is REUSED verbatim (no judge/criterion/clusterer change).
//
// PURE seam — every side effect (plan / chunk / finalize / persist / close / self-fire) is injected.

export type RecPair = { a: string; b: string };

/** The DB-persisted chain state (long_runner_runs.chain_state), read at the start of each fire. */
export type RecChainState = {
  planned: boolean;   // has the plan run + pair manifest been persisted?
  pairs: RecPair[];   // the persisted fresh-pair manifest (empty until planned)
  cursor: number;     // next pair index to judge
  chunkSize: number;  // pairs judged per fire (cap-5, the client packer size)
  stepCount: number;  // fires so far (bounds the loop)
  maxSteps: number;   // HARD terminal — self-fire is impossible beyond this
};

export type RecStepConfig = {
  state: RecChainState;
  /** Run the plan (generate-signal-recurrence plan:true) → the FRESH (not-yet-frozen) pair manifest. */
  plan: () => Promise<{ pairs: RecPair[] }>;
  /** Judge ONE chunk (generate-signal-recurrence pairs:[chunk], write); ok:false ⇒ no progress. */
  runChunk: (chunk: RecPair[]) => Promise<{ ok: boolean }>;
  /** The unscoped finalize (clusters + finding_recurrence + integrity). */
  finalize: () => Promise<void>;
  /** Persist the plan manifest to the ledger chain row (DB is truth). */
  persistPlanned: (pairs: RecPair[]) => Promise<void>;
  /** Persist cursor + stepCount advance after a completed chunk. */
  persistProgress: (cursor: number, stepCount: number) => Promise<void>;
  /** Close the ledger completed (empty = no fresh pairs). Writes first_read_recurrence integrity. */
  closeCompleted: (empty: boolean) => Promise<void>;
  /** Close the ledger failed with a machine-readable reason. Writes a failed integrity record. */
  closeFailed: (reason: string) => Promise<void>;
  /** Self-fire the next step (a fresh isolate). Never called on a terminal. */
  selfFire: () => Promise<void>;
};

export type RecStepOutcome =
  | "terminate_max_steps"
  | "planned_empty"
  | "planned"
  | "finalized"
  | "no_progress_failed"
  | "chunk_done";

/**
 * Run ONE recurrence step. Exactly one of: terminate (max-steps/no-progress → failed), plan, finalize,
 * or judge-one-chunk-then-self-fire. Every non-terminal path with more work self-fires exactly once;
 * every terminal path closes the ledger (+ integrity) and NEVER self-fires.
 */
export async function runRecurrenceStep(cfg: RecStepConfig): Promise<{ outcome: RecStepOutcome }> {
  const s = cfg.state;

  // TERMINAL 1 — hard step ceiling. Checked FIRST so a runaway can never do more work.
  if (s.stepCount >= s.maxSteps) {
    await cfg.closeFailed(`max_steps (${s.maxSteps}) exceeded — recurrence halted`);
    return { outcome: "terminate_max_steps" };
  }

  // PLAN — once. Persists the fresh-pair manifest to the DB, then self-fires into judging.
  if (!s.planned) {
    const { pairs } = await cfg.plan();
    await cfg.persistPlanned(pairs);
    if (pairs.length === 0) {
      await cfg.finalize();          // nothing fresh to judge — still finalize (reconcile from banked)
      await cfg.closeCompleted(true);
      return { outcome: "planned_empty" };
    }
    await cfg.selfFire();
    return { outcome: "planned" };
  }

  // FINALIZE — the manifest is exhausted (cursor past the end). One unscoped finalize, then done.
  if (s.cursor >= s.pairs.length) {
    await cfg.finalize();
    await cfg.closeCompleted(false);
    return { outcome: "finalized" };
  }

  // JUDGE ONE CHUNK — resume from the DB cursor (NOT from 0), advance, self-fire.
  const chunk = s.pairs.slice(s.cursor, s.cursor + s.chunkSize);
  const res = await cfg.runChunk(chunk);
  const nextCursor = s.cursor + chunk.length;

  // TERMINAL 2 — no-progress guard. A fire whose chunk failed, or that advanced ZERO, closes the ledger
  // failed rather than self-firing again → no infinite loop.
  if (!res.ok || nextCursor <= s.cursor) {
    await cfg.closeFailed(`no_progress at cursor ${s.cursor} — recurrence halted`);
    return { outcome: "no_progress_failed" };
  }

  await cfg.persistProgress(nextCursor, s.stepCount + 1);
  await cfg.selfFire();
  return { outcome: "chunk_done" };
}
