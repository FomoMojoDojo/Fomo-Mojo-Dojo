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
// THE RULE. Accounted ⇔ the candidate reached an OUTCOME:
//   (1) a written def under this executor, in the PUBLIC register — accepted.
//       Matched on job_executor ALONE, never (executor, jtbd): the reframe round holds the executor
//       FIXED and replaces the jtbd, so an exact-pair match misses every reframe rescue. Tightening
//       the rule without this widening would strand 8 of 17 written defs as "not accounted",
//       re-judge completed work, and collide into a duplicate def under the `-2` journey-key suffix.
//   (2) a market_discovery_verdicts row on the ORIGINAL marketIdentity — gate (b)/(c) decided
//       (rejected_solution / accepted / deduped). A reframed candidate's downstream verdicts key on
//       the REFRAMED identity and are reached through (1), not here.
//   (4) an integrity_runs row {component:'market_discovery_candidate', run_ref: marketIdentity} —
//       the honest per-candidate error terminal written by the generator's try/catch. A RECORDED
//       failure is a terminal; an unrecorded one is not.
// A perspective verdict is not consulted at all: with (2) checked, the "accepted buyer AND
// solution_agnostic" conjunction reduces to its solution_agnostic half, so the read cannot change
// the answer. Anything else ⇒ NOT accounted ⇒ the confirm-poll stops at this candidate and the
// chunk re-judges it (idempotent by content identity).
//
// A candidate with no executor probes job_executor='' , matches nothing, and is correctly NOT
// accounted — the chain then makes no progress and closes FAILED, which is the honest terminal.

// Both imports come from the WRITER module, so reader and writer can never drift: marketIdentity is
// the one identity authority, and CANDIDATE_ERROR_COMPONENT is declared next to the code that writes
// the error terminal. One direction only — no import cycle.
import { marketIdentity, CANDIDATE_ERROR_COMPONENT } from "./marketPortfolioDiscovery.ts";

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
export type ExistsProbe = (table: string, match: Record<string, string>) => Promise<boolean>;

/**
 * DECIDED — clauses (1) and (2) only: this candidate reached a JUDGED outcome that is on the record.
 *
 * Gate 3b splits this out of `marketCandidateAccounted` because the two questions are different:
 *   • DECIDED asks "has a judge already ruled on this?" — the question the WORKER must ask before
 *     spending model calls, because re-judging a decided candidate is not free and not idempotent.
 *   • ACCOUNTED asks "did this candidate reach any terminal, including an honest failure?" — the
 *     question the CONFIRM-POLL must ask before advancing the cursor past it.
 * An error terminal (clause 4) answers the second and NOT the first: a candidate whose judge chain
 * threw has no ruling, so the worker must retry it, while the poll must still be able to move on.
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

  // (2) a persisted gate-(b)/(c) decision on the original identity.
  if (await args.exists("market_discovery_verdicts", {
    company_id: args.companyId,
    market_a_identity: identity,
  })) return true;

  // (3) a persisted per-candidate OUTCOME on the original identity (Gate 4b).
  //
  // Clauses (1) and (2) miss one whole class: a rail-dropped candidate (rejected_buyer) banks nothing
  // but a step_perspective_verdicts row, which is deliberately NOT consulted — a lone perspective row
  // cannot tell a mid-flight candidate from a finished one (Gate 1b). The outcome row can: it is
  // written only at a chunk's terminal, and it says which terminal. Lumio #5 is the live case; before
  // this it was re-judged on every replay, at model cost, forever.
  //
  // 'error' is excluded because it is a terminal WITHOUT a ruling — accounted (the poll may advance)
  // but not decided (the worker must retry). Rather than widen ExistsProbe with a negation, the clause
  // asks for each renderable/decided outcome by name: the probe stays equality-only, and the list is
  // explicit at the call site where a reader can check it against the CHECK constraint.
  for (const outcome of DECIDED_OUTCOMES) {
    if (await args.exists("market_candidate_outcomes", {
      company_id: args.companyId,
      original_identity: identity,
      outcome,
    })) return true;
  }
  return false;
}

export async function marketCandidateAccounted(args: {
  exists: ExistsProbe;
  companyId: string;
  candidate: MarketCandidateRef;
}): Promise<boolean> {
  // (1) + (2) — a judged outcome is a terminal.
  if (await marketCandidateDecided(args)) return true;

  // (4) an honest per-candidate error terminal. NOT a decision: the worker retries it, but the poll
  // may advance past it, because a recorded failure IS an outcome the run can report.
  if (await args.exists("integrity_runs", {
    company_id: args.companyId,
    component: CANDIDATE_ERROR_COMPONENT,
    run_ref: await marketIdentity(
      String(args.candidate?.job_executor ?? ""),
      String(args.candidate?.jtbd ?? ""),
    ),
  })) return true;

  // Touched but not finished (a lone perspective verdict, whichever way it went) ⇒ re-judge.
  return false;
}
