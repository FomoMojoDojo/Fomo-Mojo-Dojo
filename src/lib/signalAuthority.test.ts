import { describe, expect, it } from "vitest";
import type { HypothesisProvenanceCard } from "@/hooks/useStrategicHypotheses";
import { inferStrategicCenterOfGravity, resolveSignalConflict, signalAuthorityWeight } from "./signalAuthority";

function makeRow(overrides: Partial<HypothesisProvenanceCard> = {}): HypothesisProvenanceCard {
  return {
    hypothesis: {
      id: "hyp-1",
      company_id: "company-1",
      hypothesis_key: "hyp-1",
      statement: "Public positioning emphasizes craft quality.",
      hypothesis_kind: "directional_hypothesis",
      hypothesis_state: "inferred",
      topic: "positioning",
      confidence: "low",
      validation_state: "unvalidated",
      what_must_be_true: [],
      source_run_id: null,
      reframed_from_hypothesis_id: null,
      is_active: true,
      raw_payload: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    supportingClaims: [
      {
        claim: {
          id: "claim-1",
          company_id: "company-1",
          statement: "Public positioning emphasizes craft quality and specialty coffee.",
          topic: "positioning",
          claim_type: "observation",
          outside_support_count: 1,
          organization_support_count: 0,
          customer_support_count: 0,
          triangulation_state: "single_source",
          confidence: "low",
          revalidation_flag: false,
          raw_payload: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        dependencyTypes: ["supports"],
        supportShape: { outside: 1, organization: 0, customer: 0 },
        contradictionCount: 0,
        derivedTriangulationState: "single_source",
        strongestSupportingSignal: null,
        supportingSignals: [],
        contradictorySignals: [],
        qualifyingSignals: [],
      },
    ],
    weakeningClaims: [],
    latestEventAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("signal authority", () => {
  it("changes source authority by phase", () => {
    expect(signalAuthorityWeight({ phase: "outside_signals", signalBand: "outside" })).toBeGreaterThan(
      signalAuthorityWeight({ phase: "outside_signals", signalBand: "organization" }),
    );
    expect(signalAuthorityWeight({ phase: "diagnose", signalBand: "organization" })).toBeGreaterThan(
      signalAuthorityWeight({ phase: "diagnose", signalBand: "outside" }),
    );
    expect(signalAuthorityWeight({ phase: "flow", signalBand: "customer" })).toBeGreaterThan(
      signalAuthorityWeight({ phase: "flow", signalBand: "organization" }),
    );
  });

  it("infers a more strategic center of gravity in diagnose when org evidence is stronger", () => {
    const outsideRow = makeRow();
    const orgRow = makeRow({
      hypothesis: {
        ...makeRow().hypothesis,
        id: "hyp-2",
        statement: "Partner operational outcomes may matter more than craft identity.",
      },
      supportingClaims: [
        {
          ...makeRow().supportingClaims[0],
          claim: {
            ...makeRow().supportingClaims[0].claim,
            id: "claim-2",
            statement: "Internal strategy is centered on partner operational outcomes and operator risk reduction.",
          },
          supportShape: { outside: 0, organization: 2, customer: 0 },
        },
      ],
    });

    expect(inferStrategicCenterOfGravity([outsideRow, orgRow], "diagnose").label).toBe("partner operational outcomes");
  });

  it("surfaces conflict between public identity and strategic direction", () => {
    const outsideRow = makeRow();
    const orgRow = makeRow({
      hypothesis: {
        ...makeRow().hypothesis,
        id: "hyp-2",
        statement: "Partner operational outcomes may matter more than craft identity.",
      },
      supportingClaims: [
        {
          ...makeRow().supportingClaims[0],
          claim: {
            ...makeRow().supportingClaims[0].claim,
            id: "claim-2",
            statement: "Internal strategy is centered on partner operational outcomes and operator risk reduction.",
          },
          supportShape: { outside: 0, organization: 2, customer: 0 },
        },
      ],
    });

    const conflict = resolveSignalConflict([outsideRow, orgRow], "diagnose");
    expect(conflict.hasConflict).toBe(true);
    expect(conflict.summary).toContain("Public positioning still emphasizes craft quality");
    expect(conflict.summary).toContain("internal strategy is increasingly centered on partner operational outcomes");
  });
});
