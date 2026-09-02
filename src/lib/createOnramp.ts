// Create-client onramp sequencer (design A′, operator-signed 2026-09-02).
//
// The Add-Client dialog create must arrive at a FILLED First Read from ONE act: create → research
// birth (builds the customer spine def) → full refresh with chain:true (fires the already-shipped
// first_read_fill + market-discovery stepper). This runs CLIENT-side because both the birth
// (run-agent-flow) and the refresh (public-baseline) are verify_jwt=true and hard-401 without a user
// session — a service-role server orchestrator cannot invoke them.
//
// This module is the PURE sequencing seam so the ordering / isolation / skip-if-present proofs run
// with fakes. Guarantees:
//   ORDERING        — birth is attempted BEFORE the refresh fires.
//   SKIP-IF-PRESENT — a company that already has a spine skips the birth (no duplicate defs); the
//                     refresh still fires (first-fill-only downstream makes it a no-op when reads exist).
//   ISOLATION       — a birth failure is recorded, never thrown: the refresh fires anyway, and the
//                     create is not surfaced as failed. The stepper's clean refusal handles a still-
//                     missing spine at market-discovery time.
// NO auto-regenerate: this sequencer's ONLY caller is the create handler (a NEW company). It adds no
// re-run trigger to any existing-company path.

export type CreateOnrampConfig = {
  /** True when the company already has a spine (companyHasSpine union) — skip the birth. */
  hasSpine: () => Promise<boolean>;
  /** Fire the research birth (run-agent-flow cold start). May throw / be cut at the 150s wall. */
  fireBirth: () => Promise<void>;
  /** Fire the full refresh with chain:true (public-baseline) — the chain that fires first_read_fill. */
  fireRefresh: () => Promise<void>;
  /** Record a birth failure (toast / log). Never re-thrown — isolated from the create + refresh. */
  onBirthError?: (err: unknown) => void;
};

export type CreateOnrampResult = {
  birthRan: boolean;
  birthSkipped: boolean;   // spine already present — birth not attempted
  birthFailed: boolean;    // birth threw — recorded, isolated
  refreshFired: boolean;   // always true unless the refresh itself throws
};

/**
 * Sequence a create: birth (skip-if-present, isolated) THEN the chained refresh. The refresh ALWAYS
 * fires (regardless of the birth outcome); only a refresh throw propagates (the create genuinely
 * failed to start its outside read). A birth failure is captured, never thrown.
 */
export async function runCreateOnramp(cfg: CreateOnrampConfig): Promise<CreateOnrampResult> {
  let birthRan = false;
  let birthSkipped = false;
  let birthFailed = false;

  // SKIP-IF-PRESENT: never re-birth a company that already has a spine (no duplicate defs).
  if (await cfg.hasSpine()) {
    birthSkipped = true;
  } else {
    // BIRTH FIRST — attempted before the refresh. Failure is ISOLATED (recorded, not thrown).
    try {
      await cfg.fireBirth();
      birthRan = true;
    } catch (err) {
      birthFailed = true;
      cfg.onBirthError?.(err);
    }
  }

  // The chained refresh ALWAYS fires (after the birth attempt). A still-missing spine is handled by
  // the market-discovery stepper's clean refusal — recorded per-stage, never a create failure.
  await cfg.fireRefresh();

  return { birthRan, birthSkipped, birthFailed, refreshFired: true };
}
