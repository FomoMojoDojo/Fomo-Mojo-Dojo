import { describe, expect, it } from "vitest";
import { claimsWhollyBackedBy, isRetirementReason } from "./retirementPlan";

describe("isRetirementReason", () => {
  it("accepts <who>:<what> snake_case and nothing else", () => {
    expect(isRetirementReason("operator_retired:test_ingest")).toBe(true);
    expect(isRetirementReason("duplicate_of:abc")).toBe(true);
    expect(isRetirementReason("remint_authorship_v2")).toBe(false); // the constant is not an operator reason
    expect(isRetirementReason("operator retired: test")).toBe(false);
    expect(isRetirementReason("")).toBe(false);
    expect(isRetirementReason(null)).toBe(false);
  });
});

describe("claimsWhollyBackedBy", () => {
  const retiring = new Map([["s1", "p1"], ["s2", "p1"], ["s3", "p2"]]);
  it("strikes a sole-backed claim and attributes it to its proposal", () => {
    expect(claimsWhollyBackedBy([{ claim_id: "c1", signal_id: "s1" }], retiring, new Set())).toEqual([{ claim_id: "c1", attributedTo: "p1" }]);
  });
  it("keeps a claim that has one live ref outside the batch", () => {
    expect(claimsWhollyBackedBy([{ claim_id: "c1", signal_id: "s1" }, { claim_id: "c1", signal_id: "live" }], retiring, new Set())).toEqual([]);
  });
  it("counts already-superseded refs as dead", () => {
    expect(claimsWhollyBackedBy([{ claim_id: "c1", signal_id: "s1" }, { claim_id: "c1", signal_id: "old" }], retiring, new Set(["old"]))).toEqual([{ claim_id: "c1", attributedTo: "p1" }]);
  });
  it("a claim spread across two retiring proposals is struck once, attributed to the first ref's proposal", () => {
    expect(claimsWhollyBackedBy([{ claim_id: "c1", signal_id: "s3" }, { claim_id: "c1", signal_id: "s1" }], retiring, new Set())).toEqual([{ claim_id: "c1", attributedTo: "p2" }]);
  });
  it("a claim standing only on already-dead signals (no retiring ref) is not this run's to strike", () => {
    expect(claimsWhollyBackedBy([{ claim_id: "c1", signal_id: "old" }], retiring, new Set(["old"]))).toEqual([]);
  });
  it("is empty with no refs", () => {
    expect(claimsWhollyBackedBy([], retiring, new Set())).toEqual([]);
  });
});
