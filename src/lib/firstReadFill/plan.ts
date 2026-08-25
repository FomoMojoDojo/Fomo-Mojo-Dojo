// Pure decision layer for the per-company First Read fill runner (scripts/first-read-fill.ts).
// No I/O — kept separate so the ordering / skip / frozen-refusal rules are unit-testable.

export const FILL_STEP_ORDER = [
  "own_words",
  "recurrence",
  "deltas_public",
  "conflict_explanations",
  "open_questions",
  "status_conflict",
  "score",
  "our_read",
] as const;
export type FillStep = (typeof FILL_STEP_ORDER)[number];

/** Steps to run, honoring --from=<step> (resume). Throws on an unknown step name. */
export function stepsFrom(fromStep: string | null | undefined): FillStep[] {
  if (!fromStep) return [...FILL_STEP_ORDER];
  const i = FILL_STEP_ORDER.indexOf(fromStep as FillStep);
  if (i < 0) throw new Error(`--from='${fromStep}' is not a step (${FILL_STEP_ORDER.join(", ")})`);
  return FILL_STEP_ORDER.slice(i);
}

/** Parse --skip=<step,…> into a set of steps the operator has held out (ledgered skipped:operator).
 *  Throws on an unknown step name. */
export function parseSkip(skipArg: string | null | undefined): Set<FillStep> {
  const set = new Set<FillStep>();
  if (!skipArg) return set;
  for (const s of skipArg.split(",").map((x) => x.trim()).filter(Boolean)) {
    if ((FILL_STEP_ORDER as readonly string[]).includes(s)) set.add(s as FillStep);
    else throw new Error(`--skip: '${s}' is not a step (${FILL_STEP_ORDER.join(", ")})`);
  }
  return set;
}

export type FillCounts = { hasWebsite: boolean; ownWords: number; outsideSignals: number };

/**
 * The skip decision per step from the company's current counts. Returns the reason to SKIP, or
 * null to RUN. Dependency-honest: no website → no own-words; no own-words → no deltas; <2 outside
 * signals → no recurrence pairs; <10 outside-voice signals → score ineligible.
 */
export function skipReason(step: FillStep, c: FillCounts): string | null {
  switch (step) {
    case "own_words": return c.hasWebsite ? null : "no_website";
    case "recurrence": return c.outsideSignals >= 2 ? null : "insufficient_signals";
    case "deltas_public": return c.ownWords > 0 ? null : "no_own_words";
    case "conflict_explanations": return null; // always eligible; runner reports empty when no ungrounded divergent pairs
    case "open_questions": return null; // always runs; finalize marks empty when no anchors
    case "status_conflict": return null; // deterministic, always runs
    case "score": return c.outsideSignals >= 10 ? null : "ineligible_lt10_signals";
    case "our_read": return null; // always eligible; the runner skips:unchanged (ledger id-set) / empty
  }
}

export const CB1_FROZEN_ID = "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc";
// Held out of --all (NOT frozen — --company can still target them explicitly): the empty dup, and
// CB2 the regenerable live-test fixture / protected client bar.
export const HELD_FROM_ALL: ReadonlySet<string> = new Set<string>([
  "916ce5f4-8ab3-4908-907e-570dc294e330", // Edgewood Center (2) — empty dup
  "fd3f7f63-968b-4698-b946-3d6b6450d79d", // Cafe Barra 2 — live-test fixture
]);

/** HARD refusal — CB1 or ANY frozen company is never run, even when passed via --company. */
export function refuseReason(company: { id: string; frozen: boolean }): string | null {
  if (company.id === CB1_FROZEN_ID) return "frozen";
  if (company.frozen) return "frozen";
  return null;
}

/** Ledger writes are suppressed entirely in dry-run. */
export function ledgerEnabled(dryRun: boolean): boolean {
  return !dryRun;
}
