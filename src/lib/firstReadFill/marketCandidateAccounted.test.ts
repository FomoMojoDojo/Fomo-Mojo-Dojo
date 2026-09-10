// Gate 1b — proofs for the market-discovery confirm-poll rule (_shared/marketCandidateAccounted.ts).
//
// The defect these guard against, measured in the Gate 1a census: the previous rule counted a
// candidate "accounted" on the mere existence of a step_perspective_verdicts row. The buyer gate runs
// FIRST for every candidate, so that row proves TOUCHED, never FINISHED. 16 of 42 candidates
// fleet-wide were skipped past by the confirm-poll and lost inside runs that closed
// status='completed' done_count=target — 8 of them `buyer` groups, including Riverlane's "Quantum
// software developers…", which is why that surface shows no buyer audience at all.
//
// WHICH OF THESE ARE PROOFS. (a) and (c) go RED if the fix is reverted — they are the guard. (b),
// (c') and (e) pass under BOTH the old and the new body: they are regression guards and stated
// behaviour, and must never be counted as evidence the fix is in force.
import { describe, it, expect } from "vitest";
import {
  marketCandidateAccounted,
  type ExistsProbe,
} from "../../../supabase/functions/_shared/marketCandidateAccounted.ts";
import {
  marketIdentity,
  CANDIDATE_ERROR_COMPONENT,
} from "../../../supabase/functions/_shared/marketPortfolioDiscovery.ts";
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

type Row = Record<string, string>;
type Fixture = Record<string, Row[]>;

/** A fixture-backed equality probe: a row matches when every column in `match` is equal. */
const probe = (fixture: Fixture): ExistsProbe => async (table, match) =>
  (fixture[table] ?? []).some((row) => Object.entries(match).every(([c, v]) => row[c] === v));

const accounted = (fixture: Fixture, candidate = CANDIDATE) =>
  marketCandidateAccounted({ exists: probe(fixture), companyId: COMPANY, candidate });

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

  // ── (b) a gate-(b)/(c) decision is terminal, whichever way it went ──────────────────────────────
  for (const verdict of ["accepted", "rejected"] as const) {
    it(`(b) a solution_agnostic verdict (${verdict}) on the original identity IS accounted`, async () => {
      const f = await midFlight();
      f.market_discovery_verdicts = [{
        company_id: COMPANY,
        market_a_identity: await marketIdentity(EXECUTOR, ORIGINAL_JTBD),
        verdict_kind: "solution_agnostic",
        verdict,
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

  // ── (c') reframe-safety: the widened def match ──────────────────────────────────────────────────
  it("(c') a written public def under the SAME executor with a DIFFERENT jtbd IS accounted "
    + "(the reframe holds the executor fixed; 8 of the fleet's 17 written defs are reframe rescues)", async () => {
    const f = await midFlight();
    f.odi_market_definitions = [{
      company_id: COMPANY, job_executor: EXECUTOR, jtbd: REFRAMED_JTBD, market_register: "public_inferred",
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

  // ── (e) STATED BEHAVIOUR, NOT A PROOF ───────────────────────────────────────────────────────────
  it("(e) STATED BEHAVIOUR (not a proof): two candidates sharing an executor — a def written for the "
    + "first accounts for the second too, because clause (1) keys on the executor alone", async () => {
    // The reframe replaces the jtbd but never the executor, so the executor is the ONLY key that
    // survives a rescue — and the generator's rule (4) ("Each market must have a DISTINCT executor")
    // is what keeps this collision off the real path. When the model breaks that rule anyway, the
    // second candidate is treated as already decided and is not re-judged. That is the accepted
    // trade: the alternative (exact executor+jtbd) strands every reframe rescue and re-writes it as a
    // duplicate def under the `-2` journey-key suffix. Asserted so the trade is visible and any
    // change to it is deliberate — this assertion passes under the OLD body too and proves nothing
    // about the fix.
    const second = { job_executor: EXECUTOR, jtbd: "A different job, same executor." };
    const f = await midFlight();
    f.odi_market_definitions = [{
      company_id: COMPANY, job_executor: EXECUTOR, jtbd: ORIGINAL_JTBD, market_register: "public_inferred",
    }];
    expect(await accounted(f, second)).toBe(true);
  });
});
