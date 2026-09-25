// ── THE SPECS' FROZEN SCORE CLOCK (operator ruling P1, 2026-09-25) ──────────────────────────────
//
// The live Mojo Score's evidence_freshness contributor is a step function on days-since-update
// (7 / 30 / 90 / 180 / 365), so the number the page renders changes on its own as the wall clock
// passes a step — with no code and no data change. Four tests in two files pinned that number and
// went red on 2026-09-24 when 27 of Edgewood's 117 scored items crossed the 7-day step together.
//
// Freezing the BROWSER's clock was tried and rejected: the page authenticates with a short-lived
// token validated against the real clock, so any fixed timestamp falls outside the usable window
// within about an hour and the page loads with no session at all. What is frozen here is ONLY the
// score's `now`, through the development-build-gated override in useLiveMojoScore.ts. Auth, DAY and
// every other clock on the page stay real.
//
// WHY THIS INSTANT. The home-parity baseline (fixtures/home-dom-before_20260918.txt) was captured
// after integrity_runs 1538 at 23:01 UTC on 2026-09-18; this is the first round hour at which that
// capture was current, so the pinned score is the score the baseline was taken against. Both specs
// freeze to the SAME instant, because their numerals come from one computation and must not be able
// to disagree.
export const FROZEN_SCORE_TIME = "2026-09-19T00:00:00.000Z";

/** The key useLiveMojoScore reads. Kept as a literal rather than imported from src/ so a rename in
 *  the product cannot silently make these specs stop freezing anything. */
export const SCORE_NOW_KEY = "__FR_SCORE_NOW";

/** Freeze the SCORE's clock for this page. MUST be called before the page navigates: the score is
 *  computed during the first render. */
export async function freezeScoreClock(
  page: { addInitScript: (fn: (arg: [string, string]) => void, arg: [string, string]) => Promise<void> },
  at: string = FROZEN_SCORE_TIME,
): Promise<void> {
  await page.addInitScript(([key, value]) => {
    (window as unknown as Record<string, unknown>)[key] = value;
  }, [SCORE_NOW_KEY, at] as [string, string]);
}
