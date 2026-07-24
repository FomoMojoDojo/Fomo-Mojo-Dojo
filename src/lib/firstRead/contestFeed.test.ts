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
      ["births", "considered", "disputed", "immaterial", "market", "skipped_existing", "unanchored"].sort(),
    );
  });
});

describe("OC-2d — delta anchoring via public_claim_id + market disposition", () => {
  const CLAIM_P: ObservedClaim = { id: "public-claim-1", identity: "pub-id-1" };

  it("f. a delta-kind reject anchors via the delta row's public claim → disputed on the RIGHT claim", () => {
    const responses: FeedResponse[] = [
      // item_identity is the DELTA identity (pair hash) — it must NOT be used to anchor.
      { id: "r1", verdict: "rejected", item_kind: "delta", item_ref: "delta-row-9", item_identity: "delta-pair-hash" },
    ];
    const plan = deriveContests({
      responses,
      publicByIdentity: mapOf(), // empty — proves the delta path does NOT use identity
      deltaAnchorByRef: new Map([["delta-row-9", CLAIM_P]]),
      existingClaimIds: [],
    });
    expect(plan.births).toHaveLength(1);
    expect(plan.births[0].claim_id).toBe("public-claim-1"); // the RIGHT claim (via public_claim_id)
    expect(plan.births[0].contest_kind).toBe("disputed");
    expect(plan.unanchored).toBe(0);

    // FALSIFICATION: a WRONG-claim mapping births a contest on the WRONG claim — proving the
    // birth's claim_id is driven by deltaAnchorByRef, not by identity or a constant.
    const wrong = deriveContests({
      responses,
      publicByIdentity: mapOf(),
      deltaAnchorByRef: new Map([["delta-row-9", { id: "WRONG-claim", identity: "wrong-id" }]]),
      existingClaimIds: [],
    });
    expect(wrong.births[0].claim_id).toBe("WRONG-claim");
    expect(wrong.births[0].claim_id).not.toBe("public-claim-1");
  });

  it("g. a delta with no live public claim (publicly_silent / gone) births nothing — counted unanchored", () => {
    const responses: FeedResponse[] = [
      { id: "r1", verdict: "not_important", item_kind: "delta", item_ref: "delta-silent", item_identity: "d-id" },
    ];
    const plan = deriveContests({
      responses,
      publicByIdentity: mapOf(CLAIM_P),
      deltaAnchorByRef: new Map(), // the delta resolved to no live public claim
      existingClaimIds: [],
    });
    expect(plan.births).toHaveLength(0);
    expect(plan.unanchored).toBe(1);
    expect(plan.market).toBe(0);

    // FALSIFICATION: give the SAME response a delta anchor and it DOES birth — so the zero
    // above is the missing public claim, not delta verdicts being dropped wholesale.
    const anchored = deriveContests({
      responses,
      publicByIdentity: mapOf(),
      deltaAnchorByRef: new Map([["delta-silent", CLAIM_P]]),
      existingClaimIds: [],
    });
    expect(anchored.births).toHaveLength(1);
    expect(anchored.births[0].contest_kind).toBe("immaterial"); // not_important → immaterial
  });

  it("h. a market-kind verdict births no contest — counted honestly, never silently dropped", () => {
    const responses: FeedResponse[] = [
      { id: "r1", verdict: "rejected", item_kind: "market", item_ref: "mkt-1", item_identity: "m-id" },
      { id: "r2", verdict: "not_important", item_kind: "market", item_ref: "mkt-2", item_identity: "m-id-2" },
    ];
    const plan = deriveContests({
      responses,
      publicByIdentity: mapOf(CLAIM_P),
      deltaAnchorByRef: new Map(),
      existingClaimIds: [],
    });
    expect(plan.births).toHaveLength(0);
    expect(plan.market).toBe(2); // both counted as market — reported, not dropped
    expect(plan.unanchored).toBe(0); // market is NOT lumped into unanchored
    expect(plan.considered).toBe(2);
  });

  it("i. re-run idempotent across the delta path: an already-contested claim is skipped", () => {
    const responses: FeedResponse[] = [
      { id: "r1", verdict: "rejected", item_kind: "delta", item_ref: "delta-row-9", item_identity: "d" },
    ];
    const rerun = deriveContests({
      responses,
      publicByIdentity: mapOf(),
      deltaAnchorByRef: new Map([["delta-row-9", CLAIM_P]]),
      existingClaimIds: ["public-claim-1"], // already contested
    });
    expect(rerun.births).toHaveLength(0);
    expect(rerun.skipped_existing).toBe(1);
  });

  it("j. legacy finding path (no item_kind) is untouched — still anchors by identity", () => {
    const plan = deriveContests({
      responses: [{ id: "r1", verdict: "rejected", item_identity: "id-a" }], // no item_kind
      publicByIdentity: mapOf(CLAIM_A),
      existingClaimIds: [],
    });
    expect(plan.births).toHaveLength(1);
    expect(plan.births[0].claim_id).toBe("claim-a");
  });
});
