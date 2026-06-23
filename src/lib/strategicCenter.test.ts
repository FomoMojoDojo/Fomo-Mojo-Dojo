import { describe, expect, it } from "vitest";
import type { HypothesisProvenanceCard } from "@/hooks/useStrategicHypotheses";
import type { RouteRow } from "@/hooks/useRoutes";
import { inferStrategicCenter, type StrategicCenterRouteSeed } from "./strategicCenter";

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
        supportShape: { outside: 2, organization: 0, customer: 0 },
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

function makeRoute(overrides: Partial<RouteRow> = {}): RouteRow {
  return {
    id: "route-1",
    company_id: "company-1",
    category: "fix",
    title: "Test whether operational proof changes repeat purchasing confidence",
    short_description: "Reduce operator risk by making reliability visible earlier.",
    why_this_matters_json: ["Operational reliability may matter more than coffee novelty."],
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeRouteSeed(overrides: Partial<StrategicCenterRouteSeed> = {}): StrategicCenterRouteSeed {
  return {
    route: makeRoute(),
    evidence: [{ id: "ev-1", title: "Operational reliability proof is still missing", status: "missing" }],
    assumptions: [
      {
        id: "assumption-1",
        statement: "Operators respond to visible proof of operational reliability.",
        status: "unproven",
        layer: "customer",
        critical: true,
      },
    ],
    ...overrides,
  };
}

describe("strategic center", () => {
  it("persists a stronger operational center in diagnose when routes point beyond public craft identity", () => {
    const center = inferStrategicCenter({
      activeRows: [makeRow()],
      routeSeeds: [makeRouteSeed()],
      phase: "diagnose",
    });

    expect(center.shouldLeadExplanations).toBe(true);
    expect(center.hasMeaningfulDivergence).toBe(true);
    expect(center.publicContextLabel).toContain("craft quality");
    expect(center.label).toMatch(/operational reliability|partner operational outcomes|visible proof/i);
  });

  it("stays provisional in pre-diagnosis even when routes hint at a later strategic center", () => {
    const center = inferStrategicCenter({
      activeRows: [makeRow()],
      routeSeeds: [makeRouteSeed()],
      phase: "outside_signals",
    });

    expect(center.confidence).toBe("low");
    expect(center.shouldLeadExplanations).toBe(false);
  });
});
