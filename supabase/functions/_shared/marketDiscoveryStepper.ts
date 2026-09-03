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
  /** HOLD the chain non-terminal at the given cursor: status stays 'running' + a note (sweep-excluded),
   *  NO self-fire. The worker may be alive; a later re-fire (fill predicate / manual control) resumes
   *  from this cursor. NEVER 'failed' when the worker may still be writing. */
  markUnconfirmed: (cursor: number) => Promise<void>;
  /** Self-fire the next step (a fresh isolate). Never called on a terminal or an unconfirmed hold. */
  selfFire: () => Promise<void>;
};

export type MDStepOutcome =
  | "terminate_max_steps"
  | "already_discovered"
  | "planned_empty"
  | "planned"
  | "finalized"
  | "chunk_done"
  // not-ok fetch, but the confirm-poll accounted the chunk's writes → cursor advanced, chain continues.
  | "chunk_recovered"          // the whole chunk was accounted
  | "chunk_recovered_partial"  // only the leading N were accounted; the tail re-judges next fire
  // not-ok fetch, nothing accounted within the window → non-terminal hold (running + note), no self-fire.
  | "unconfirmed_hold";

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

  // HAPPY PATH — the fetch returned success and the chunk is non-empty → advance + self-fire.
  if (res.ok && nextCursor > s.cursor) {
    await cfg.persistProgress(nextCursor, s.stepCount + 1);
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
    const advanced = s.cursor + Math.min(accounted, chunk.length);
    await cfg.persistProgress(advanced, s.stepCount + 1);
    await cfg.selfFire();
    return { outcome: advanced >= nextCursor ? "chunk_recovered" : "chunk_recovered_partial" };
  }

  // Nothing landed within the window → the worker may still be alive mid-first-candidate. HOLD
  // non-terminal (running + note, sweep-excluded); NO self-fire (no hot loop). A later re-fire resumes
  // from this cursor. NEVER 'failed' on a maybe-alive worker.
  await cfg.markUnconfirmed(s.cursor);
  return { outcome: "unconfirmed_hold" };
}
