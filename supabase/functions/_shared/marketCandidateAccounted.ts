// ── Market-discovery confirm-poll rule: is a candidate TERMINAL? ─────────────────────────────────
//
// Gate 1b (operator-signed 2026-09-10). Lifted out of market-discovery-step/index.ts so the rule is
// a PURE, injectable function with proofs that can actually run (vitest), per the sibling seam idiom
// in marketDiscoveryStepper.ts: every side effect is injected.
//
// WHAT WENT WRONG. The previous rule counted a candidate "accounted" on ANY of three markers, the
// first being a step_perspective_verdicts row keyed on sha256(normalize(jtbd)). The buyer gate runs
// FIRST for every candidate, so that row proves the candidate was TOUCHED — never that it FINISHED.
// Two ways it lies:
//   - `seller` is NOT terminal: the MPD-1e reframe round exists precisely to rescue gate-(a)
//     rejections, and does (8 of the fleet's 17 written defs are reframe rescues).
//   - an accepted `buyer` with nothing downstream means the worker died INSIDE the 180s
//     solution-agnostic call at gate (b) — mid-flight, not decided.
// The Gate 1a census measured the cost: 16 of 42 candidates fleet-wide were counted accounted, the
// cursor advanced past them, and five runs closed status='completed' done_count=target having lost
// them silently — no def, no verdict, no error text. Half of those were `buyer` groups (Riverlane's
// "Quantum software developers…" among them, which is why that surface shows no buyer at all).
//
// THE RULE — ACCOUNTED (Gate 7c, operator ruling 2026-09-11). Accounted ⇔ the candidate's OWN
// terminal record exists:
//   (3) a market_candidate_outcomes row on the ORIGINAL marketIdentity at the CURRENT criterion
//       version — any outcome, 'error' included. The worker files this row the instant a candidate
//       reaches its terminal (fileOutcome in marketPortfolioDiscovery.ts), so its presence means
//       FINISHED, not touched.
//   (4) an integrity_runs row {component:'market_discovery_candidate', run_ref: marketIdentity} —
//       the honest per-candidate error terminal written by the generator's try/catch. A RECORDED
//       failure is a terminal; an unrecorded one is not.
//
// WHY (1) AND (2) WERE REMOVED FROM ACCOUNTED — touched ≠ finished, one gate later. Gate 1b stopped
// counting the perspective verdict because gate (a) runs first and proves only that a candidate was
// started. Clauses (1) and (2) lie the same way, one step downstream:
//   - (2) a gate-(b) solution_agnostic verdict is banked BEFORE gate (c) and BEFORE the reframe round.
//     The 2026-09-11 diagnostic caught it in the act: the stepper's fetch is cut at ~150s, the poll
//     found Edgewood #1's SA verdict (03:35:57Z) while its same-market chain was still running,
//     advanced the cursor at 03:37:50Z, and the isolate holding the ruling was killed at the 400s
//     wall (03:39:58Z, `in_flight_req_exists = true`). Coreviva #3 and #4 went the same way at
//     04:21:11Z — #4 with its REJECTED original verdict counted as "decided" while its reframe was
//     mid-judge. Three rulings the worker had reached were never filed, and the cursor was past them.
//   - (1) a written def lands one statement before its outcome row; a death between the two leaves a
//     def the poll would count and a row that never comes. Same shape, smaller window.
// Both remain in DECIDED (below) — the worker's question is "has a judge ruled?", and a def or a
// banked verdict answers that. The poll's question is "did this candidate FINISH?", and only the
// candidate's own terminal record answers that. Anything else ⇒ NOT accounted ⇒ the confirm-poll
// stops at this candidate and the chunk re-judges it (banked-verdict cheap; the decided skip files
// the row it was missing).
//
// A candidate with no executor probes job_executor='' , matches nothing, and is correctly NOT
// accounted — the chain then makes no progress and closes FAILED, which is the honest terminal.

// Both imports come from the WRITER module, so reader and writer can never drift: marketIdentity is
// the one identity authority, and CANDIDATE_ERROR_COMPONENT is declared next to the code that writes
// the error terminal. One direction only — no import cycle.
import { marketIdentity, CANDIDATE_ERROR_COMPONENT } from "./marketPortfolioDiscovery.ts";
// Gate 5b — decided is VERSION-AWARE: a ruling counts only under the current criterion. A v1-only
// rejection is un-decided under v2 and is re-judged exactly once; a written def (clause 1) is a
// snapshot artefact and is never versioned.
import { CRITERION_VERSION } from "./solutionAgnosticJudge.ts";

/** Outcomes that constitute a RULING. Mirrors the market_candidate_outcomes CHECK minus 'error',
 *  which is a terminal without a ruling: accounted, never decided. */
export const DECIDED_OUTCOMES = [
  "accepted_active",
  "accepted_deferred",
  "deduped",
  "rejected_solution",
  "rejected_buyer",
  "already_decided",
] as const;

/** The manifest shape the confirm-poll holds — chain_state.candidates entries are untyped JSON. */
export type MarketCandidateRef = { job_executor?: unknown; jtbd?: unknown };

/** The injected reader: does at least one row exist in `table` matching every column in `match`?
 *  Table names and match columns live HERE (they are the substance of the rule and are covered by
 *  the proofs); the caller supplies only a dumb equality probe. */
export type ExistsProbe = (table: string, match: Record<string, string | number | boolean>) => Promise<boolean>;

/**
 * DECIDED — clauses (1), (2) and (3): this candidate reached a JUDGED outcome that is on the record.
 * UNCHANGED by Gate 7c: the worker's skip still trusts a def or a banked verdict, because its question
 * is whether a judge has ruled, not whether the candidate's own row was filed.
 *
 * Gate 3b splits this out of `marketCandidateAccounted` because the two questions are different:
 *   • DECIDED asks "has a judge already ruled on this?" — the question the WORKER must ask before
 *     spending model calls, because re-judging a decided candidate is not free and not idempotent.
 *   • ACCOUNTED asks "did this candidate reach any terminal, including an honest failure?" — the
 *     question the CONFIRM-POLL must ask before advancing the cursor past it.
 * An error terminal (clause 4) answers the second and NOT the first: a candidate whose judge chain
 * threw has no ruling, so the worker must retry it, while the poll must still be able to move on.
 * Since Gate 7c the two rules share no clause: DECIDED reads (1)/(2)/(3), ACCOUNTED reads (3)/(4) —
 * a candidate can be decided-but-not-accounted (verdict banked, row not yet filed), and the poll must
 * wait for it.
 *
 * Why the worker needs this at all: the loop had no already-written check, so a replay re-judged
 * candidates that already have defs. Gate (a) returns its banked verdict, the MPD-1e reframe then
 * makes a FRESH qwen2.5:14b call at temperature 0.2, and only an exact content-identity match folds
 * the result back into the existing def. A differently-worded restatement that the same-market judge
 * calls "different" gets WRITTEN, landing a duplicate audience under the `-2` journey-key suffix.
 * Idempotence resting on a model reproducing its own prior text is not idempotence.
 */
export async function marketCandidateDecided(args: {
  exists: ExistsProbe;
  companyId: string;
  candidate: MarketCandidateRef;
}): Promise<boolean> {
  const executor = String(args.candidate?.job_executor ?? "");
  const jtbd = String(args.candidate?.jtbd ?? "");

  // (1) written def — reframe-safe (executor fixed, jtbd not).
  if (await args.exists("odi_market_definitions", {
    company_id: args.companyId,
    job_executor: executor,
    market_register: "public_inferred",
  })) return true;

  const identity = await marketIdentity(executor, jtbd);

  // (2) a persisted gate-(b)/(c) decision on the original identity, UNDER THE CURRENT CRITERION, judged
  //     WITH ITS INPUTS (Gate 6e: a verdict banked with no solution line is history, not a ruling).
  if (await args.exists("market_discovery_verdicts", {
    company_id: args.companyId,
    market_a_identity: identity,
    criterion_version: CRITERION_VERSION,
    inputs_complete: true,
  })) return true;

  // (3) a persisted per-candidate OUTCOME on the original identity (Gate 4b).
  //
  // Clauses (1) and (2) miss one whole class: a rail-dropped candidate (rejected_buyer) banks nothing
  // but a step_perspective_verdicts row, which is deliberately NOT consulted — a lone perspective row
  // cannot tell a mid-flight candidate from a finished one (Gate 1b). The outcome row can: it is
  // written at the candidate's terminal, and it says which terminal. Lumio #5 is the live case; before
  // this it was re-judged on every replay, at model cost, forever.
  //
  // 'error' is excluded because it is a terminal WITHOUT a ruling — accounted (the poll may advance)
  // but not decided (the worker must retry). Rather than widen ExistsProbe with a negation, the clause
  // asks for each renderable/decided outcome by name: the probe stays equality-only, and the list is
  // explicit at the call site where a reader can check it against the CHECK constraint.
  return await outcomeRowExists(args.exists, args.companyId, identity, DECIDED_OUTCOMES);
}

/** Clause (3) as a probe: does a market_candidate_outcomes row exist on this ORIGINAL identity, at the
 *  CURRENT criterion version, with one of `outcomes`? Rather than widen ExistsProbe with a negation
 *  or an IN, the clause asks for each outcome by name: the probe stays equality-only, and the list is
 *  explicit at the call site where a reader can check it against the CHECK constraint. */
async function outcomeRowExists(
  exists: ExistsProbe,
  companyId: string,
  identity: string,
  outcomes: ReadonlyArray<string>,
): Promise<boolean> {
  for (const outcome of outcomes) {
    if (await exists("market_candidate_outcomes", {
      company_id: companyId,
      original_identity: identity,
      outcome,
      criterion_version: CRITERION_VERSION,
    })) return true;
  }
  return false;
}

/** Every outcome the writer can file — the rulings plus 'error'. Mirrors the market_candidate_outcomes
 *  CHECK in full. An 'error' row is a terminal the poll may advance past (the candidate is filed) even
 *  though it is not a ruling (the worker retries it). */
export const TERMINAL_OUTCOMES = [...DECIDED_OUTCOMES, "error"] as const;

export async function marketCandidateAccounted(args: {
  exists: ExistsProbe;
  companyId: string;
  candidate: MarketCandidateRef;
}): Promise<boolean> {
  const identity = await marketIdentity(
    String(args.candidate?.job_executor ?? ""),
    String(args.candidate?.jtbd ?? ""),
  );

  // (3) the candidate's OWN terminal record, at the current criterion version. Written at the moment
  //     the terminal is reached, so it means finished. Clauses (1) and (2) are deliberately NOT
  //     consulted here — see the header: a def or a gate-(b) verdict proves a candidate was touched.
  if (await outcomeRowExists(args.exists, args.companyId, identity, TERMINAL_OUTCOMES)) return true;

  // (4) an honest per-candidate error terminal. NOT a decision: the worker retries it, but the poll
  //     may advance past it, because a recorded failure IS an outcome the run can report.
  if (await args.exists("integrity_runs", {
    company_id: args.companyId,
    component: CANDIDATE_ERROR_COMPONENT,
    run_ref: identity,
  })) return true;

  // Touched but not finished — a def, a banked verdict, a perspective row, whichever — ⇒ re-judge.
  return false;
}
