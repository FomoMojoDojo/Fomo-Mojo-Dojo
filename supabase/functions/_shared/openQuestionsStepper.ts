// ── Open-questions self-chaining stepper (pure orchestration) ────────────────────────────────────
//
// generate-open-questions is multi-phase (plan → scoped anchor chunks → finalize) and has NO single-
// call mode — the actual work is the chunks, and a company with many publicly_silent deltas needs many
// of them (Geniant: 45 anchors ≈ 15 chunks), far more than one 400s isolate holds. This stepper does
// ONE chunk per fire then self-fires, mirroring market-discovery-step / refresh-deltas-step. The anchor
// MANIFEST + cursor are DB-persisted (long_runner_runs.chain_state), so a mid-chunk isolate death is
// RESUMABLE by the next fire — the ledger is never a stuck 'running' lie. Terminal discipline: a hard
// max-step count AND a no-progress guard make an infinite self-fire loop structurally impossible. The
// generate-open-questions worker is REUSED verbatim (no change).
//
// PURE seam — every side effect (plan / chunk / finalize / persist / close / self-fire) is injected, so
// the resume-after-death and no-refire-on-no-progress proofs exercise it with fakes and no live models.

/** The DB-persisted chain state (long_runner_runs.chain_state), read at the start of each fire. */
export type OQChainState = {
  planned: boolean;   // has the plan run + anchor manifest been persisted?
  anchors: string[];  // the persisted anchor-identity manifest (empty until planned)
  cursor: number;     // next anchor index to generate/judge
  chunkSize: number;  // anchors processed per fire (≤3, the packer cap)
  stepCount: number;  // fires so far (bounds the loop)
  maxSteps: number;   // HARD terminal — self-fire is impossible beyond this
};

export type OQStepConfig = {
  state: OQChainState;
  /** Run the plan (generate-open-questions plan:true) → the anchor-identity manifest. */
  plan: () => Promise<{ anchors: string[] }>;
  /** Generate+judge ONE chunk (generate-open-questions anchor_identities:[chunk]); ok:false ⇒ no progress. */
  runChunk: (chunk: string[]) => Promise<{ ok: boolean }>;
  /** The unscoped finalize (generate-open-questions with no anchor_identities) + integrity write. */
  finalize: () => Promise<void>;
  /** Persist the plan manifest to the ledger chain row (DB is truth). */
  persistPlanned: (anchors: string[]) => Promise<void>;
  /** Persist cursor + stepCount advance after a completed chunk. */
  persistProgress: (cursor: number, stepCount: number) => Promise<void>;
  /** Close the ledger completed (empty = no anchors to question). Writes integrity 'completed'. */
  closeCompleted: (empty: boolean) => Promise<void>;
  /** Close the ledger failed with a machine-readable reason (terminal, no self-fire). Writes integrity 'failed'. */
  closeFailed: (reason: string) => Promise<void>;
  /** Self-fire the next step (a fresh isolate). Never called on a terminal. */
  selfFire: () => Promise<void>;
};

export type OQStepOutcome =
  | "terminate_max_steps"
  | "planned_empty"
  | "planned"
  | "finalized"
  | "no_progress_failed"
  | "chunk_done";

/**
 * Run ONE open-questions step. Exactly one of: terminate (max-steps/no-progress → failed), plan,
 * finalize, or run-one-chunk-then-self-fire. Every non-terminal path with more work self-fires exactly
 * once; every terminal path closes the ledger (+ integrity) and NEVER self-fires.
 */
export async function runOpenQuestionsStep(cfg: OQStepConfig): Promise<{ outcome: OQStepOutcome }> {
  const s = cfg.state;

  // TERMINAL 1 — hard step ceiling. Checked FIRST so a runaway can never do more work.
  if (s.stepCount >= s.maxSteps) {
    await cfg.closeFailed(`max_steps (${s.maxSteps}) exceeded — open questions halted`);
    return { outcome: "terminate_max_steps" };
  }

  // PLAN — once. Persists the manifest to the DB, then self-fires into the chunks.
  if (!s.planned) {
    const { anchors } = await cfg.plan();
    await cfg.persistPlanned(anchors);
    if (anchors.length === 0) {
      await cfg.closeCompleted(true); // nothing to question — an honest looked-and-empty completion
      return { outcome: "planned_empty" };
    }
    await cfg.selfFire();
    return { outcome: "planned" };
  }

  // FINALIZE — the manifest is exhausted (cursor past the end). One unscoped finalize, then done.
  if (s.cursor >= s.anchors.length) {
    await cfg.finalize();
    await cfg.closeCompleted(false);
    return { outcome: "finalized" };
  }

  // RUN ONE CHUNK — resume from the DB cursor (NOT from 0), advance, self-fire.
  const chunk = s.anchors.slice(s.cursor, s.cursor + s.chunkSize);
  const res = await cfg.runChunk(chunk);
  const nextCursor = s.cursor + chunk.length;

  // TERMINAL 2 — no-progress guard. A fire whose chunk failed, or that advanced ZERO, closes the ledger
  // failed rather than self-firing again → no infinite loop.
  if (!res.ok || nextCursor <= s.cursor) {
    await cfg.closeFailed(`no_progress at cursor ${s.cursor} — open questions halted`);
    return { outcome: "no_progress_failed" };
  }

  await cfg.persistProgress(nextCursor, s.stepCount + 1);
  await cfg.selfFire();
  return { outcome: "chunk_done" };
}
