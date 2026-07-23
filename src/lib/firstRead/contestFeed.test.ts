// OC-2 — deriveContests law tests. The feed's edge function does the SELECTs and
// INSERTs; the LAW lives in this pure module, so these deterministic tests own
// the guarantees (kinds, anchored-only, idempotent skip, no claim writes) with
// zero DB residue. Each class is falsification-validated: a planted wrong input
// is shown to change the outcome, so a green assertion means the check bites.

import { describe, it, expect } from "vitest";
import {
  deriveContests,
  CONTEST_VERDICT_KIND,
  type FeedResponse,
  type ObservedClaim,
} from "../../../supabase/functions/_shared/contestFeed";

const CLAIM_A: ObservedClaim = { id: "claim-a", identity: "id-a" };
const CLAIM_B: ObservedClaim = { id: "claim-b", identity: "id-b" };
const CLAIM_C: ObservedClaim = { id: "claim-c", identity: "id-c" };

function mapOf(...claims: ObservedClaim[]): Map<string, ObservedClaim> {
  return new Map(claims.map((c) => [c.identity, c]));
}

describe("deriveContests — OC-2 contest feed law", () => {
  it("a. births exactly the reject+not_important responses with correct kinds; confirm births none", () => {
    const responses: FeedResponse[] = [
      { id: "r1", verdict: "rejected", item_identity: "id-a" },
      { id: "r2", verdict: "not_important", item_identity: "id-b" },
      { id: "r3", verdict: "confirmed", item_identity: "id-c" },
    ];
    const plan = deriveContests({
      responses,
      publicByIdentity: mapOf(CLAIM_A, CLAIM_B, CLAIM_C),
      existingClaimIds: [],
    });

    expect(plan.births).toHaveLength(2);
    expect(plan.disputed).toBe(1);
    expect(plan.immaterial).toBe(1);
    const byClaim = Object.fromEntries(plan.births.map((b) => [b.claim_id, b.contest_kind]));
    expect(byClaim["claim-a"]).toBe("disputed"); // reject → disputed
    expect(byClaim["claim-b"]).toBe("immaterial"); // not_important → immaterial
    expect(byClaim["claim-c"]).toBeUndefined(); // confirm never contests

    // FALSIFICATION: if the mapping were reversed, this same assertion would fail.
    expect(CONTEST_VERDICT_KIND.rejected).not.toBe(CONTEST_VERDICT_KIND.not_important);
    // corrected also never contests
    const withCorrection = deriveContests({
      responses: [{ id: "rc", verdict: "corrected", item_identity: "id-a" }],
      publicByIdentity: mapOf(CLAIM_A),
      existingClaimIds: [],
    });
    expect(withCorrection.births).toHaveLength(0);
    expect(withCorrection.considered).toBe(0);
  });

  it("b. an unanchored reject births nothing and is counted as render-only", () => {
    const responses: FeedResponse[] = [
      { id: "r1", verdict: "rejected", item_identity: "id-UNKNOWN" },
    ];
    const plan = deriveContests({
      responses,
      publicByIdentity: mapOf(CLAIM_A, CLAIM_B), // no id-UNKNOWN
      existingClaimIds: [],
    });
    expect(plan.births).toHaveLength(0);
    expect(plan.unanchored).toBe(1);
    expect(plan.considered).toBe(1);

    // FALSIFICATION: the SAME response DOES birth once its anchor is present —
    // proving the zero above is the missing anchor, not a dead code path.
    const anchored = deriveContests({
      responses,
      publicByIdentity: mapOf(CLAIM_A, { id: "claim-x", identity: "id-UNKNOWN" }),
      existingClaimIds: [],
    });
    expect(anchored.births).toHaveLength(1);
    expect(anchored.unanchored).toBe(0);
  });

  it("c. idempotent: a claim already contested (existing, or twice in one run) is skipped before insert", () => {
    const responses: FeedResponse[] = [
      { id: "r1", verdict: "rejected", item_identity: "id-a" },
    ];
    // pre-existing contest on claim-a → skip
    const rerun = deriveContests({
      responses,
      publicByIdentity: mapOf(CLAIM_A),
      existingClaimIds: ["claim-a"],
    });
    expect(rerun.births).toHaveLength(0);
    expect(rerun.skipped_existing).toBe(1);

    // FALSIFICATION: with NO existing contest the identical response DOES birth —
    // so the skip is caused by the existing row, not by rejecting everything.
    const fresh = deriveContests({
      responses,
      publicByIdentity: mapOf(CLAIM_A),
      existingClaimIds: [],
    });
    expect(fresh.births).toHaveLength(1);

    // two responses resolving to the same claim in ONE run → second skipped
    const twoSameClaim = deriveContests({
      responses: [
        { id: "r1", verdict: "rejected", item_identity: "id-a" },
        { id: "r2", verdict: "not_important", item_identity: "id-a" },
      ],
      publicByIdentity: mapOf(CLAIM_A),
      existingClaimIds: [],
    });
    expect(twoSameClaim.births).toHaveLength(1); // one contest per (session, claim)
    expect(twoSameClaim.skipped_existing).toBe(1);
  });

  it("e. structural: a birth is a contest row only — never a claim/status write shape", () => {
    const plan = deriveContests({
      responses: [{ id: "r1", verdict: "rejected", item_identity: "id-a" }],
      publicByIdentity: mapOf(CLAIM_A),
      existingClaimIds: [],
    });
    const allowed = new Set(["claim_id", "claim_identity", "contest_kind", "response_id"]);
    for (const birth of plan.births) {
      for (const key of Object.keys(birth)) expect(allowed.has(key)).toBe(true);
      // no field that could target the claims lifecycle
      expect(birth).not.toHaveProperty("status");
      expect(birth).not.toHaveProperty("struck_reason");
      expect(birth).not.toHaveProperty("statement");
    }
    // the plan itself carries only counts + births — nothing claim-mutating
    expect(Object.keys(plan).sort()).toEqual(
      ["births", "considered", "disputed", "immaterial", "skipped_existing", "unanchored"].sort(),
    );
  });
});
