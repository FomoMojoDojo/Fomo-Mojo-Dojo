// INT-4 — readiness-derivation tests (the single readiness authority's pure core).
import { describe, expect, it } from "vitest";
import { deriveDiagnoseReadiness } from "./phaseReadiness";

const none = { declaredClaims: 0, acceptedProposals: 0, manualEdits: 0 };

describe("deriveDiagnoseReadiness", () => {
  it("not ready when no internal evidence exists", () => {
    expect(deriveDiagnoseReadiness(none)).toBe(false);
  });

  it("ready on internal_declared claims alone", () => {
    expect(deriveDiagnoseReadiness({ ...none, declaredClaims: 1 })).toBe(true);
  });

  it("ready on an accepted file proposal alone", () => {
    expect(deriveDiagnoseReadiness({ ...none, acceptedProposals: 1 })).toBe(true);
  });

  it("ready on operator manual edits alone", () => {
    expect(deriveDiagnoseReadiness({ ...none, manualEdits: 1 })).toBe(true);
  });

  it("ready on combinations", () => {
    expect(deriveDiagnoseReadiness({ declaredClaims: 10, acceptedProposals: 2, manualEdits: 3 })).toBe(true);
    expect(deriveDiagnoseReadiness({ declaredClaims: 0, acceptedProposals: 1, manualEdits: 5 })).toBe(true);
  });
});
