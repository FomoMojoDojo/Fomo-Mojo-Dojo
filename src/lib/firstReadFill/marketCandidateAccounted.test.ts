// Gate 1b — proofs for the market-discovery confirm-poll rule (_shared/marketCandidateAccounted.ts).
//
// The defect these guard against, measured in the Gate 1a census: the previous rule counted a
// candidate "accounted" on the mere existence of a step_perspective_verdicts row. The buyer gate runs
// FIRST for every candidate, so that row proves TOUCHED, never FINISHED. 16 of 42 candidates
// fleet-wide were skipped past by the confirm-poll and lost inside runs that closed
// status='completed' done_count=target — 8 of them `buyer` groups, including Riverlane's "Quantum
// software developers…", which is why that surface shows no buyer audience at all.
//
// WHICH OF THESE ARE PROOFS. (a) and (c) go RED if the Gate 1b fix is reverted — they are that
// guard. (7c-a), (7c-b) and (7c-e) go RED if the Gate 7c fix is reverted (clauses (1)/(2) restored to
// ACCOUNTED). (c2) passes under every body: a regression guard, never evidence a fix is in force.
//
// Gate 7c (operator ruling 2026-09-11) — touched ≠ finished, one gate later. The 2026-09-11 diagnostic
// caught clause (2) doing what the perspective row used to do: Edgewood #1's gate-(b) verdict was
// banked at 03:35:57Z, the poll counted it accounted at 03:37:50Z while its same-market chain was
// still running, and the isolate holding the ruling was killed at the 400s wall (03:39:58Z). Coreviva
// #3/#4 the same at 04:21:11Z. So ACCOUNTED now reads only the candidate's OWN terminal record —
// clause (3) the outcome row at the current criterion, clause (4) the error terminal. DECIDED still
// reads (1)/(2)/(3): the worker's question is whether a judge has ruled, and it has.
import { describe, it, expect } from "vitest";
import {
  marketCandidateAccounted,
  marketCandidateDecided,
  type ExistsProbe,
} from "../../../supabase/functions/_shared/marketCandidateAccounted.ts";
import {
  marketIdentity,
  CANDIDATE_ERROR_COMPONENT,
} from "../../../supabase/functions/_shared/marketPortfolioDiscovery.ts";
import { CRITERION_VERSION } from "../../../supabase/functions/_shared/solutionAgnosticJudge.ts";
// The perspective verdicts are planted under their REAL content hashes. This matters: it is what
// makes the red-on-revert run non-vacuous — the reverted body looks these rows up by
// sha256(normalizeForHash(jtbd)) and must genuinely find them, then wrongly return true.
import { normalizeForHash, sha256Hex } from "../../../supabase/functions/_shared/contentIdentity.ts";

const COMPANY = "49435388-954b-42ff-8366-62e207a3f625"; // Riverlane, the company the census measured

// Riverlane candidate #4 — the dropped `buyer` group, planted verbatim from manifest b60e2867.
const EXECUTOR = "Quantum software developers building applications on quantum computers";
const ORIGINAL_JTBD =
  "To create robust quantum applications by integrating Riverlane's Deltaflow QEC stack, ensuring " +
  "that their software runs reliably on quantum hardware.";
const REFRAMED_JTBD =
  "To develop reliable and robust quantum applications that run effectively on quantum hardware.";

const CANDIDATE = { job_executor: EXECUTOR, jtbd: ORIGINAL_JTBD };

type Row = Record<string, string | number | boolean>;
type Fixture = Record<string, Row[]>;

/** A fixture-backed equality probe: a row matches when every column in `match` is equal. */
const probe = (fixture: Fixture): ExistsProbe => async (table, match) =>
  (fixture[table] ?? []).some((row) => Object.entries(match).every(([c, v]) => row[c] === v));

const accounted = (fixture: Fixture, candidate = CANDIDATE) =>
  marketCandidateAccounted({ exists: probe(fixture), companyId: COMPANY, candidate });
const decided = (fixture: Fixture, candidate = CANDIDATE) =>
  marketCandidateDecided({ exists: probe(fixture), companyId: COMPANY, candidate });

const perspectiveHash = (jtbd: string) => sha256Hex(normalizeForHash(jtbd));

/** (a)'s fixture: the candidate is MID-FLIGHT. Gate (a) rejected the original wording (`seller`),
 *  the MPD-1e reframe round restated the job and gate (a) passed it (`buyer`) — and then the chunk
 *  died inside the 180s solution-agnostic call. Nothing downstream exists. */
const midFlight = async (originalVerdict: "seller" | "buyer" = "seller"): Promise<Fixture> => ({
  step_perspective_verdicts: [
    { company_id: COMPANY, content_hash: await perspectiveHash(ORIGINAL_JTBD), verdict: originalVerdict },
    { company_id: COMPANY, content_hash: await perspectiveHash(REFRAMED_JTBD), verdict: "buyer" },
  ],
  market_discovery_verdicts: [],
  odi_market_definitions: [],
  integrity_runs: [],
  market_candidate_outcomes: [],
});

describe("marketCandidateAccounted", () => {
  // ── (a) THE PROOF — red on revert ───────────────────────────────────────────────────────────────
  it("(a) mid-flight (seller + reframed buyer, nothing downstream) is NOT accounted", async () => {
    expect(await accounted(await midFlight())).toBe(false);
  });

  it("(a2) an ACCEPTED buyer verdict alone is NOT accounted either — 10 of the 16 lost candidates "
    + "had passed gate (a) and died inside gate (b)", async () => {
    expect(await accounted(await midFlight("buyer"))).toBe(false);
  });

  // ── (7c-a) THE PROOF — red on revert of Gate 7c ─────────────────────────────────────────────────
  // The moment of death, as the DB saw it: the worker banked the gate-(b) verdict and was killed
  // before its terminal — no outcome row, no error terminal (an isolate wall is not a throw; the
  // catch never ran). Edgewood #1 at 03:39:58Z had exactly these rows (accepted); Coreviva #3 at
  // 04:21:11Z had them with `rejected` and its reframe rail-dropped. The old body returned true for
  // both, the cursor moved, and the ruling was never filed. A banked verdict is DECIDED (the worker
  // may skip the judge) but NOT accounted (the poll must wait for the row).
  for (const verdict of ["accepted", "rejected"] as const) {
    it(`(7c-a) a banked solution_agnostic verdict (${verdict}) with NO outcome row is decided but NOT accounted`, async () => {
      const f = await midFlight();
      f.market_discovery_verdicts = [{
        company_id: COMPANY,
        market_a_identity: await marketIdentity(EXECUTOR, ORIGINAL_JTBD),
        verdict_kind: "solution_agnostic",
        verdict,
        criterion_version: CRITERION_VERSION,
        inputs_complete: true,
      }];
      expect(await decided(f)).toBe(true);      // the worker's skip still trusts the bank (unchanged)
      expect(await accounted(f)).toBe(false);   // the poll does not — RED on revert
      // …and the instant the worker files the row, the same fixture accounts.
      f.market_candidate_outcomes = [{
        company_id: COMPANY, original_identity: await marketIdentity(EXECUTOR, ORIGINAL_JTBD),
        outcome: verdict === "accepted" ? "deduped" : "rejected_solution", criterion_version: CRITERION_VERSION,
      }];
      expect(await accounted(f)).toBe(true);
    });
  }

  // ── (c) THE PROOF — red on revert ───────────────────────────────────────────────────────────────
  // The perspective verdicts are DELIBERATELY absent here: the gate-(a) judge call is itself the first
  // thing that can throw, and when it does no verdict is banked. That also makes this assertion
  // DISCRIMINATING — with a perspective row present the old body returns true for its own (wrong)
  // reason and the test cannot tell the two bodies apart. See (c2) for the coexisting case.
  it("(c) an honest per-candidate error terminal IS accounted", async () => {
    const f = await midFlight();
    f.step_perspective_verdicts = [];
    f.integrity_runs = [{
      company_id: COMPANY,
      component: CANDIDATE_ERROR_COMPONENT,
      status: "failed",
      run_ref: await marketIdentity(EXECUTOR, ORIGINAL_JTBD),
      error: "market-discovery model call failed: HTTP 504 (llama3:70b)",
    }];
    expect(await accounted(f)).toBe(true);
  });

  it("(c2) REGRESSION GUARD (passes under both bodies): the error terminal still accounts when a "
    + "gate-(a) verdict happens to coexist with it", async () => {
    const f = await midFlight();
    f.integrity_runs = [{
      company_id: COMPANY,
      component: CANDIDATE_ERROR_COMPONENT,
      status: "failed",
      run_ref: await marketIdentity(EXECUTOR, ORIGINAL_JTBD),
      error: "market-discovery model call failed: HTTP 504 (llama3:70b)",
    }];
    expect(await accounted(f)).toBe(true);
  });

  it("(c-neg) an integrity_runs row under a DIFFERENT component or identity is not a terminal", async () => {
    const f = await midFlight();
    f.integrity_runs = [
      { company_id: COMPANY, component: "first_read_gap_pairs", status: "failed",
        run_ref: await marketIdentity(EXECUTOR, ORIGINAL_JTBD), error: "x" },
      { company_id: COMPANY, component: CANDIDATE_ERROR_COMPONENT, status: "failed",
        run_ref: await marketIdentity("Somebody else entirely", ORIGINAL_JTBD), error: "x" },
    ];
    expect(await accounted(f)).toBe(false);
  });

  // ── (7c-b) THE PROOF — red on revert of Gate 7c ─────────────────────────────────────────────────
  // A written def lands one statement before its outcome row (fileOutcome runs after def + lens). A
  // death between the two leaves a def the old body counted and a row that never comes. The def
  // still DECIDES (executor-only match, reframe-safe — 8 of the fleet's 17 defs are reframe rescues
  // and the worker must not re-judge them), but it does not ACCOUNT.
  it("(7c-b) a written public def with NO outcome row is decided but NOT accounted", async () => {
    const f = await midFlight();
    f.odi_market_definitions = [{
      company_id: COMPANY, job_executor: EXECUTOR, jtbd: REFRAMED_JTBD, market_register: "public_inferred",
    }];
    expect(await decided(f)).toBe(true);
    expect(await accounted(f)).toBe(false);
    f.market_candidate_outcomes = [{
      company_id: COMPANY, original_identity: await marketIdentity(EXECUTOR, ORIGINAL_JTBD),
      outcome: "accepted_active", criterion_version: CRITERION_VERSION,
    }];
    expect(await accounted(f)).toBe(true);
  });

  it("(c'-neg) an INTERNAL-register def under the same executor is not a public write", async () => {
    const f = await midFlight();
    f.odi_market_definitions = [{
      company_id: COMPANY, job_executor: EXECUTOR, jtbd: REFRAMED_JTBD, market_register: "internal_inferred",
    }];
    expect(await accounted(f)).toBe(false);
  });

  it("(c'-neg2) another company's def never accounts for this one", async () => {
    const f = await midFlight();
    f.odi_market_definitions = [{
      company_id: "00000000-0000-0000-0000-000000000000",
      job_executor: EXECUTOR, jtbd: REFRAMED_JTBD, market_register: "public_inferred",
    }];
    expect(await accounted(f)).toBe(false);
  });

  // ── Gate 4b — clause (3): a persisted OUTCOME is a decision ────────────────────────────────────
  // RED ON REVERT. A rail-dropped candidate (rejected_buyer) banks nothing but a perspective row, so
  // clauses (1) and (2) miss it entirely — Lumio #5 was re-judged on every replay because of this.
  it("(g4b) a persisted rejected_buyer outcome makes the candidate accounted", async () => {
    const f = await midFlight();
    f.market_candidate_outcomes = [{
      company_id: COMPANY,
      original_identity: await marketIdentity(EXECUTOR, ORIGINAL_JTBD),
      outcome: "rejected_buyer",
      criterion_version: CRITERION_VERSION,
    }];
    expect(await accounted(f)).toBe(true);
  });

  it("(g4b) an 'error' outcome is NOT a decision — but it is still accounted via clause (4)", async () => {
    const identity = await marketIdentity(EXECUTOR, ORIGINAL_JTBD);
    const f = await midFlight();
    f.market_candidate_outcomes = [{ company_id: COMPANY, original_identity: identity, outcome: "error" }];
    // no integrity terminal planted: the error OUTCOME alone must not account it
    expect(await accounted(f)).toBe(false);
    f.integrity_runs = [{ company_id: COMPANY, component: CANDIDATE_ERROR_COMPONENT, run_ref: identity, status: "failed" }];
    expect(await accounted(f)).toBe(true);
  });

  // ── Gate 5b — decided/accounted are VERSION-AWARE ───────────────────────────────────────────────
  // RED ON REVERT. Before this a v1 verdict decided a candidate forever, so a better criterion could
  // never run on the 16 already-judged candidates. Now a ruling counts only under the current
  // criterion: a v1-only rejection is un-decided under v2 and is re-judged exactly once. This applies
  // to `accounted` too — if the confirm-poll called a v1 ruling a terminal during a v2 run, the cursor
  // would advance past the candidate before its v2 ruling landed (the Gate 1b defect, reborn).
  it("(g5b) a v1-ONLY solution_agnostic rejection is NOT accounted under the current criterion", async () => {
    const f = await midFlight();
    f.market_discovery_verdicts = [{
      company_id: COMPANY, market_a_identity: await marketIdentity(EXECUTOR, ORIGINAL_JTBD),
      verdict_kind: "solution_agnostic", verdict: "rejected", criterion_version: 1,
    }];
    expect(await accounted(f)).toBe(false);
  });
  // Gate 6e — RED ON REVERT. Gotham's four v2 verdicts were banked with no solution line (the offering
  // read did not exist at judge time). A verdict judged without its inputs is history, not a ruling.
  it("(g6e) a current-version verdict with inputs_complete=false is NOT accounted — not a ruling", async () => {
    const f = await midFlight();
    f.market_discovery_verdicts = [{
      company_id: COMPANY, market_a_identity: await marketIdentity(EXECUTOR, ORIGINAL_JTBD),
      verdict_kind: "solution_agnostic", verdict: "rejected", criterion_version: CRITERION_VERSION, inputs_complete: false,
    }];
    expect(await accounted(f)).toBe(false);
  });
  it("(g5b) a v1-only outcome row is NOT accounted; the same row at the current version IS", async () => {
    const f = await midFlight();
    const identity = await marketIdentity(EXECUTOR, ORIGINAL_JTBD);
    f.market_candidate_outcomes = [{ company_id: COMPANY, original_identity: identity, outcome: "rejected_solution", criterion_version: 1 }];
    expect(await accounted(f)).toBe(false);
    f.market_candidate_outcomes.push({ company_id: COMPANY, original_identity: identity, outcome: "rejected_solution", criterion_version: CRITERION_VERSION });
    expect(await accounted(f)).toBe(true);
  });
  it("(g5b) a written def (clause 1) is UNVERSIONED — a v1 def still DECIDES under v2 (and, since 7c, never accounts)", async () => {
    const f = await midFlight();
    f.odi_market_definitions = [{ company_id: COMPANY, job_executor: EXECUTOR, jtbd: REFRAMED_JTBD, market_register: "public_inferred" }];
    expect(await decided(f)).toBe(true);
    expect(await accounted(f)).toBe(false);
  });
  it("(7c) an 'error' OUTCOME ROW at the current version IS accounted on its own — the row is the terminal", async () => {
    const f = await midFlight();
    f.market_candidate_outcomes = [{
      company_id: COMPANY, original_identity: await marketIdentity(EXECUTOR, ORIGINAL_JTBD),
      outcome: "error", criterion_version: CRITERION_VERSION,
    }];
    expect(await decided(f)).toBe(false);     // not a ruling — the worker retries
    expect(await accounted(f)).toBe(true);    // but filed — the poll may advance
  });

  // ── (7c-e) the executor-only def match reaches DECIDED, not ACCOUNTED ──────────────────────────
  it("(7c-e) two candidates sharing an executor — a def written for the first DECIDES the second "
    + "(clause 1 keys on the executor alone) but does NOT account for it", async () => {
    // The reframe replaces the jtbd but never the executor, so the executor is the ONLY key that
    // survives a rescue — and the generator's rule (4) ("Each market must have a DISTINCT executor")
    // is what keeps this collision off the real path. When the model breaks that rule anyway, the
    // second candidate is skipped by the worker as already decided (the accepted trade: exact
    // executor+jtbd would strand every reframe rescue as a duplicate `-2` def). But the poll waits
    // for the second candidate's OWN row — which the skip files as already_decided.
    const second = { job_executor: EXECUTOR, jtbd: "A different job, same executor." };
    const f = await midFlight();
    f.odi_market_definitions = [{
      company_id: COMPANY, job_executor: EXECUTOR, jtbd: ORIGINAL_JTBD, market_register: "public_inferred",
    }];
    expect(await decided(f, second)).toBe(true);
    expect(await accounted(f, second)).toBe(false);
  });
});
