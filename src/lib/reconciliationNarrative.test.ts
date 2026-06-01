import { describe, expect, it } from "vitest";
import type { HypothesisProvenanceCard } from "@/hooks/useStrategicHypotheses";
import type { RouteRationale } from "@/lib/routeRationale";
import type { StrategicCenterRouteSeed } from "@/lib/strategicCenter";
import type { RouteRow } from "@/views/Routes/useRoutes";
import { buildReconciliationNarrative } from "./reconciliationNarrative";

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

function makeRouteRationale(overrides: Partial<RouteRationale> = {}): RouteRationale {
  return {
    routeId: "route-1",
    routeTitle: "Test whether operational proof changes repeat purchasing confidence",
    confidenceLabel: "Customer validation missing",
    movement: "narrow",
    movementLabel: "Narrowing",
    readiness: "Validate",
    readinessMeaning: "Promising path. Needs validation before commitment.",
    whyThisRouteExists: "Why",
    whatSupportsIt: "Support",
    uncertainty: "Uncertainty",
    mustBecomeTrue: "Need proof",
    couldWeaken: "Could weaken",
    supportingEvidenceLines: [],
    weakeningEvidenceLines: [],
    relevanceScore: 10,
    matchedHypothesisIds: [],
    supportShape: { outside: 1, organization: 1, customer: 0 },
    linkSource: "graph_linked",
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
        statement: "Operators respond to visible proof of reliability.",
        status: "unproven",
        layer: "customer",
        critical: true,
      },
    ],
    ...overrides,
  };
}

describe("reconciliation narrative", () => {
  it("surfaces public versus strategic divergence in diagnose", () => {
    const outsideRow = makeRow();
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
            statement: "Internal strategy is centered on partner operational outcomes and operator risk reduction.",
          },
          supportShape: { outside: 0, organization: 2, customer: 0 },
        },
      ],
    });

    const narrative = buildReconciliationNarrative({
      activeRows: [outsideRow, orgRow],
      routeRationales: [makeRouteRationale()],
      routeSeeds: [makeRouteSeed()],
      phase: "diagnose",
    });

    expect(narrative?.shouldRender).toBe(true);
    expect(narrative?.mode).toBe("divergent");
    expect(narrative?.publicPerspective).toBe("A company publicly known for craft quality and specialty coffee");
    expect(narrative?.strategicDirection?.toLowerCase()).toContain("partner operational outcomes");
    expect(narrative?.customerReality).toContain("Customer validation is still lagging");
  });

  it("surfaces customer lag when focus is clearer internally than in proof", () => {
    const orgRow = makeRow({
      hypothesis: {
        ...makeRow().hypothesis,
        id: "hyp-2",
        hypothesis_key: "hyp-2",
        statement: "Operational reliability may matter more than coffee novelty.",
        hypothesis_kind: "candidate_assumption",
        confidence: "medium",
      },
      supportingClaims: [
        {
          ...makeRow().supportingClaims[0],
          claim: {
            ...makeRow().supportingClaims[0].claim,
            id: "claim-2",
            statement: "Operational reliability is carrying more strategic weight than novelty.",
          },
          supportShape: { outside: 0, organization: 2, customer: 0 },
        },
      ],
    });

    const narrative = buildReconciliationNarrative({
      activeRows: [orgRow],
      routeRationales: [makeRouteRationale({ readiness: "Validate" })],
      routeSeeds: [makeRouteSeed()],
      phase: "focus",
    });

    expect(narrative?.shouldRender).toBe(true);
    expect(narrative?.mode).toBe("lagging");
    expect(narrative?.alignmentSummary).toBe("Customer validation is still lagging internal confidence.");
    expect(narrative?.unresolvedQuestion).toContain("current focus");
  });

  it("collapses to a quiet alignment strip when all three perspectives converge", () => {
    const outsideRow = makeRow({
      hypothesis: {
        ...makeRow().hypothesis,
        statement: "Public positioning is starting to center on proof and trust.",
      },
      supportingClaims: [
        {
          ...makeRow().supportingClaims[0],
          claim: {
            ...makeRow().supportingClaims[0].claim,
            statement: "Public positioning is starting to center on proof and trust.",
          },
          supportShape: { outside: 2, organization: 0, customer: 0 },
        },
      ],
    });
    const orgRow = makeRow({
      hypothesis: {
        ...makeRow().hypothesis,
        id: "hyp-2",
        hypothesis_key: "hyp-2",
        statement: "Internal strategy is increasingly centered on proof and trust.",
        confidence: "medium",
      },
      supportingClaims: [
        {
          ...makeRow().supportingClaims[0],
          claim: {
            ...makeRow().supportingClaims[0].claim,
            id: "claim-2",
            statement: "Internal strategy is increasingly centered on proof and trust.",
          },
          supportShape: { outside: 0, organization: 2, customer: 0 },
        },
      ],
    });
    const customerRow = makeRow({
      hypothesis: {
        ...makeRow().hypothesis,
        id: "hyp-3",
        hypothesis_key: "hyp-3",
        statement: "Customer evidence points to proof and trust affecting real decisions.",
        confidence: "medium",
      },
      supportingClaims: [
        {
          ...makeRow().supportingClaims[0],
          claim: {
            ...makeRow().supportingClaims[0].claim,
            id: "claim-3",
            statement: "Customer evidence points to proof and trust affecting real decisions.",
          },
          supportShape: { outside: 0, organization: 0, customer: 2 },
        },
      ],
    });

    const narrative = buildReconciliationNarrative({
      activeRows: [outsideRow, orgRow, customerRow],
      routeRationales: [makeRouteRationale({ readiness: "Commit", supportShape: { outside: 1, organization: 1, customer: 1 } })],
      routeSeeds: [makeRouteSeed()],
      phase: "focus",
    });

    expect(narrative?.shouldRender).toBe(true);
    expect(narrative?.reconciliationStrength).toBe("strong");
    expect(narrative?.alignmentSummary).toBe("These perspectives are beginning to align.");
  });

  it("stays quiet when there is nothing meaningful to reconcile yet", () => {
    const outsideOnly = makeRow();

    const narrative = buildReconciliationNarrative({
      activeRows: [outsideOnly],
      routeRationales: [],
      phase: "outside_signals",
    });

    expect(narrative).toBeNull();
  });

  it("renders when strategic emphasis differs even without a hard contradiction", () => {
    const outsideOnly = makeRow();

    const narrative = buildReconciliationNarrative({
      activeRows: [outsideOnly],
      routeRationales: [makeRouteRationale()],
      routeSeeds: [makeRouteSeed()],
      phase: "focus",
    });

    expect(narrative?.shouldRender).toBe(true);
    expect(narrative?.publicPerspective).toBe("A company publicly known for craft quality and specialty coffee");
    expect(narrative?.strategicDirection?.toLowerCase()).toContain("partner operational outcomes");
  });
});
