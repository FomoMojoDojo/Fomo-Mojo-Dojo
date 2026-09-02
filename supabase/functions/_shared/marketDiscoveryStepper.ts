// ── Market-discovery self-chaining stepper (pure orchestration) ─────────────────────────────────
//
// FIRST-FILL AUTO-CHAIN (operator ruling 2026-09-01): market discovery (generate-market-discovery,
// local llama3:70b, ~minutes) outlives the full_refresh parent and CANNOT fit one 400s isolate. It
// self-chains: ONE model phase per fire, then self-fires the next. The candidate MANIFEST + cursor are
// DB-persisted (market_discovery_chain), so a mid-chunk isolate death is RESUMABLE by the next fire —
// the ledger is never a stuck 'running' lie. Terminal discipline (the claim_deltas lesson): a hard
// max-step count AND a no-progress guard make an infinite self-fire loop structurally impossible.
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
};

export type MDStepConfig = {
  state: MDChainState;
  /** Run the plan (generate-market-discovery plan:true). alreadyDiscovered ⇒ nothing to do. */
  plan: () => Promise<{ candidates: unknown[]; alreadyDiscovered?: boolean }>;
  /** Judge ONE chunk (generate-market-discovery candidates:[chunk]); ok:false ⇒ this fire made no progress. */
  judgeChunk: (chunk: unknown[]) => Promise<{ ok: boolean }>;
  /** The unscoped finalize (generate-market-discovery with no candidates). */
  finalize: () => Promise<void>;
  /** Persist the plan manifest to the ledger chain row (DB is truth). */
  persistPlanned: (candidates: unknown[]) => Promise<void>;
  /** Persist cursor + stepCount advance after a completed chunk. */
  persistProgress: (cursor: number, stepCount: number) => Promise<void>;
  /** Close the ledger completed (empty = nothing was discovered / already discovered). */
  closeCompleted: (empty: boolean) => Promise<void>;
  /** Close the ledger failed with a machine-readable reason (terminal, no self-fire). */
  closeFailed: (reason: string) => Promise<void>;
  /** Self-fire the next step (a fresh isolate). Never called on a terminal. */
  selfFire: () => Promise<void>;
};

export type MDStepOutcome =
  | "terminate_max_steps"
  | "already_discovered"
  | "planned_empty"
  | "planned"
  | "finalized"
  | "no_progress_failed"
  | "chunk_done";

/**
 * Run ONE market-discovery step. Exactly one of: terminate (max-steps/no-progress → failed), plan,
 * finalize, or judge-one-chunk-then-self-fire. Every non-terminal path that has more work self-fires
 * exactly once; every terminal path closes the ledger and NEVER self-fires.
 */
export async function runMarketDiscoveryStep(cfg: MDStepConfig): Promise<{ outcome: MDStepOutcome }> {
  const s = cfg.state;

  // TERMINAL 1 — hard step ceiling. Checked FIRST so a runaway can never do more work.
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

  // FINALIZE — the manifest is exhausted (cursor past the end). One unscoped finalize, then done.
  if (s.cursor >= s.candidates.length) {
    await cfg.finalize();
    await cfg.closeCompleted(false);
    return { outcome: "finalized" };
  }

  // JUDGE ONE CHUNK — resume from the DB cursor (NOT from 0), advance, self-fire.
  const chunk = s.candidates.slice(s.cursor, s.cursor + s.chunkSize);
  const res = await cfg.judgeChunk(chunk);
  const nextCursor = s.cursor + chunk.length;

  // TERMINAL 2 — no-progress guard. A fire that judged its chunk but advanced ZERO (chunk failed, or
  // the cursor did not move) closes the ledger failed rather than self-firing again → no infinite loop.
  if (!res.ok || nextCursor <= s.cursor) {
    await cfg.closeFailed(`no_progress at cursor ${s.cursor} — market discovery halted`);
    return { outcome: "no_progress_failed" };
  }

  await cfg.persistProgress(nextCursor, s.stepCount + 1);
  await cfg.selfFire();
  return { outcome: "chunk_done" };
}
