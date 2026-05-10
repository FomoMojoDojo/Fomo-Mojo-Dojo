import { describe, expect, it } from "vitest";
import type { HypothesisProvenanceCard } from "@/hooks/useStrategicHypotheses";
import type { StrategicCenterRouteSeed } from "@/lib/strategicCenter";
import { inferStrategicCenter } from "@/lib/strategicCenter";
import type { RouteRow } from "@/views/Routes/useRoutes";
import { inferIdentityNarrative } from "./identityNarrative";

function makeRow(overrides: Partial<HypothesisProvenanceCard> = {}): HypothesisProvenanceCard {
  return {
    hypothesis: {
      id: "hyp-1",
      company_id: "company-1",
      hypothesis_key: "hyp-1",
      statement: "Public positioning emphasizes craft quality and specialty coffee.",
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

function makeRoute(overrides: Partial<RouteRow> = {}): RouteRow {
  return {
    id: "route-1",
    company_id: "company-1",
    category: "fix",
    title: "Test whether operational proof changes repeat purchasing confidence",
    short_description: "Reduce operator risk by making reliability visible earlier.",
    why_this_matters_json: ["Lower operator burden and make reliability easier to experience."],
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeRouteSeed(overrides: Partial<StrategicCenterRouteSeed> = {}): StrategicCenterRouteSeed {
  return {
    route: makeRoute(),
    evidence: [{ title: "Operational reliability proof is still missing", status: "missing" }],
    assumptions: [
      {
        id: "assumption-1",
        statement: "Operators need visible proof that reliability reduces day-to-day risk.",
        status: "unproven",
        layer: "customer",
        critical: true,
      },
    ],
    ...overrides,
  };
}

describe("identity narrative", () => {
  it("preserves recognizable public and strategic identity language", () => {
    const publicRow = makeRow();
    const orgRow = makeRow({
      hypothesis: {
        ...makeRow().hypothesis,
        id: "hyp-2",
        hypothesis_key: "hyp-2",
        statement: "Partner operational outcomes may matter more than craft identity.",
        confidence: "medium",
      },
      supportingClaims: [
        {
          ...makeRow().supportingClaims[0],
          claim: {
            ...makeRow().supportingClaims[0].claim,
            id: "claim-2",
            statement: "Internal strategy is centered on partner operational outcomes, operational reliability, and lower operator burden.",
          },
          supportShape: { outside: 0, organization: 2, customer: 0 },
        },
      ],
    });

    const center = inferStrategicCenter({
      activeRows: [publicRow, orgRow],
      routeSeeds: [makeRouteSeed()],
      phase: "diagnose",
    });
    const narrative = inferIdentityNarrative({
      activeRows: [publicRow, orgRow],
      routeSeeds: [makeRouteSeed()],
      phase: "diagnose",
      strategicCenter: center,
    });

    expect(narrative.publicIdentity).toBe("A craft-focused specialty coffee roaster");
    expect(narrative.strategicIdentity).toContain("operational partner for cafe operators");
  });
});
