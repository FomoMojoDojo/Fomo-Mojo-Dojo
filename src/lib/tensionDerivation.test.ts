import { describe, expect, it } from "vitest";
import { deriveStrategicTensions } from "./tensionDerivation";
import type { StrategicHypothesis } from "./strategicHypothesisDomain";
import type { HypothesisProvenanceCard } from "@/hooks/useStrategicHypotheses";
import type { TensionDerivationInput } from "./tensionTypes";

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeHypothesisCard(
  overrides: Partial<StrategicHypothesis> = {},
  weakeningClaimCount = 0,
): HypothesisProvenanceCard {
  return {
    hypothesis: {
      id: "hyp-1",
      company_id: "company-1",
      hypothesis_key: "directional_hypothesis:reliability_matters",
      statement: "Reliability concerns are affecting repeat purchasing confidence.",
      hypothesis_kind: "directional_hypothesis",
      hypothesis_state: "emerging",
      topic: "problem",
      confidence: "medium",
      validation_state: "directional",
      what_must_be_true: [],
      source_run_id: null,
      reframed_from_hypothesis_id: null,
      superseded_by_id: null,
      reframed_reason: null,
      originating_context: null,
      is_active: true,
      raw_payload: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    },
    supportingClaims: [],
    weakeningClaims: Array.from({ length: weakeningClaimCount }, (_, i) => ({
      claim: { id: `claim-${i}`, statement: `Weakening signal ${i}` } as never,
      dependencyTypes: ["contradicts"],
      supportShape: { outside: 0, organization: 0, customer: 0 },
      contradictionCount: 1,
      derivedTriangulationState: "contradicted" as const,
      strongestSupportingSignal: null,
      supportingSignals: [],
      contradictorySignals: [],
      qualifyingSignals: [],
    })),
    latestEventAt: null,
  };
}

function makeInput(hypotheses: HypothesisProvenanceCard[]): TensionDerivationInput {
  return { hypotheses };
}

// ─── Hypothesis contradiction tension ─────────────────────────────────────────

describe("hypothesis contradiction tension", () => {
  it("does not fire when all hypotheses are in non-problematic states", () => {
    const tensions = deriveStrategicTensions(
      makeInput([
        makeHypothesisCard({ hypothesis_state: "emerging" }),
        makeHypothesisCard({ id: "hyp-2", hypothesis_state: "strengthened" }),
      ]),
    );

    const hypothesisTension = tensions.find((t) => t.source === "hypothesis_contradiction");
    expect(hypothesisTension).toBeUndefined();
  });

  it("fires at high pressure when a contradicted hypothesis is active", () => {
    const tensions = deriveStrategicTensions(
      makeInput([
        makeHypothesisCard({ hypothesis_state: "contradicted" }, 2),
      ]),
    );

    const hypothesisTension = tensions.find((t) => t.source === "hypothesis_contradiction");
    expect(hypothesisTension).toBeDefined();
    expect(hypothesisTension?.pressure).toBe("high");
    expect(hypothesisTension?.statement).toMatch(/contradicted/);
  });

  it("fires at medium pressure when an unstable hypothesis is active", () => {
    const tensions = deriveStrategicTensions(
      makeInput([
        makeHypothesisCard({ hypothesis_state: "unstable" }, 1),
      ]),
    );

    const hypothesisTension = tensions.find((t) => t.source === "hypothesis_contradiction");
    expect(hypothesisTension).toBeDefined();
    expect(hypothesisTension?.pressure).toBe("medium");
    expect(hypothesisTension?.statement).toMatch(/conflicting evidence/);
  });

  it("fires at high pressure (not medium) when both contradicted and unstable exist", () => {
    const tensions = deriveStrategicTensions(
      makeInput([
        makeHypothesisCard({ id: "hyp-unstable", hypothesis_state: "unstable" }, 1),
        makeHypothesisCard({ id: "hyp-contradicted", hypothesis_state: "contradicted" }, 2),
      ]),
    );

    const hypothesisTension = tensions.find((t) => t.source === "hypothesis_contradiction");
    expect(hypothesisTension?.pressure).toBe("high");
    expect(hypothesisTension?.statement).toMatch(/contradicted/);
  });

  it("detail line shows the contradicted hypothesis statement (not unstable) when mixed", () => {
    const tensions = deriveStrategicTensions(
      makeInput([
        // unstable comes first in array — must not win over contradicted
        makeHypothesisCard({
          id: "hyp-unstable",
          hypothesis_state: "unstable",
          statement: "Unstable hypothesis statement.",
        }, 1),
        makeHypothesisCard({
          id: "hyp-contradicted",
          hypothesis_state: "contradicted",
          statement: "Contradicted hypothesis statement.",
        }, 2),
      ]),
    );

    const hypothesisTension = tensions.find((t) => t.source === "hypothesis_contradiction");
    expect(hypothesisTension?.detail).toMatch(/Contradicted hypothesis statement/);
    expect(hypothesisTension?.detail).not.toMatch(/Unstable hypothesis statement/);
  });

  it("does not fire for inactive contradicted hypotheses", () => {
    const tensions = deriveStrategicTensions(
      makeInput([
        makeHypothesisCard({ hypothesis_state: "contradicted", is_active: false }),
      ]),
    );

    const hypothesisTension = tensions.find((t) => t.source === "hypothesis_contradiction");
    expect(hypothesisTension).toBeUndefined();
  });

  it("does not fire for retired or reframed hypotheses", () => {
    const tensions = deriveStrategicTensions(
      makeInput([
        makeHypothesisCard({ hypothesis_state: "retired", is_active: false }),
        makeHypothesisCard({ id: "hyp-2", hypothesis_state: "reframed", is_active: false }),
      ]),
    );

    const hypothesisTension = tensions.find((t) => t.source === "hypothesis_contradiction");
    expect(hypothesisTension).toBeUndefined();
  });

  it("unstable tension uses distinct resolution signals from contradicted", () => {
    const contradictedTensions = deriveStrategicTensions(
      makeInput([makeHypothesisCard({ hypothesis_state: "contradicted" }, 1)]),
    );
    const unstableTensions = deriveStrategicTensions(
      makeInput([makeHypothesisCard({ hypothesis_state: "unstable" }, 1)]),
    );

    const ct = contradictedTensions.find((t) => t.source === "hypothesis_contradiction");
    const ut = unstableTensions.find((t) => t.source === "hypothesis_contradiction");

    expect(ct?.resolution_signals).not.toEqual(ut?.resolution_signals);
    expect(ct?.resolution_signals?.some((s) => s.includes("reframed"))).toBe(true);
    expect(ut?.resolution_signals?.some((s) => s.includes("resolves the conflicting"))).toBe(true);
  });
});
