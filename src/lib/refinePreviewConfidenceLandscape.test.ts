import { describe, expect, it } from "vitest";
import type { StrategicChangeSummary } from "@/hooks/useStrategicChangeSummary";
import type { HypothesisProvenanceCard } from "@/hooks/useStrategicHypotheses";
import type { RouteRationale } from "@/lib/routeRationale";
import type { RouteRow } from "@/hooks/useRoutes";
import { buildRefinePreviewConfidenceLandscape, selectConfidenceLandscapeHighlight, type ConfidenceLandscapeRouteSeed } from "./refinePreviewConfidenceLandscape";

function makeRow(overrides: Partial<HypothesisProvenanceCard> = {}): HypothesisProvenanceCard {
  return {
    hypothesis: {
      id: "hyp-1",
      company_id: "company-1",
      hypothesis_key: "hyp-1",
      statement: "Category positioning may need stronger operational proof to hold buyer trust.",
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
          statement: "Public positioning emphasizes artisanal quality over operational proof.",
          topic: "positioning",
          claim_type: "inference",
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
    title: "Make proof of operational reliability visible earlier",
    short_description: "Reduce trust loss before buyers experience the operational value of the offer.",
    why_this_matters_json: ["Trust breaks down before the operational value becomes visible."],
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeSeed(overrides: Partial<ConfidenceLandscapeRouteSeed> = {}): ConfidenceLandscapeRouteSeed {
  return {
    route: makeRoute(),
    evidence: [{ id: "ev-1", title: "Customer proof that operational reliability changes buying confidence", status: "missing" }],
    assumptions: [
      {
        id: "assumption-1",
        statement: "Customers will notice and benefit from this improvement.",
        status: "unproven",
        layer: "customer",
        critical: true,
      },
    ],
    ...overrides,
  };
}

function makeRationale(overrides: Partial<RouteRationale> = {}): RouteRationale {
  return {
    routeId: "route-1",
    routeTitle: "Make proof of operational reliability visible earlier",
    confidenceLabel: "Customer validation missing",
    movement: "narrow",
    movementLabel: "Narrowing",
    readiness: "Validate",
    readinessMeaning: "Promising path. Needs validation before commitment.",
    whyThisRouteExists: "This route rises because category positioning may need stronger operational proof to hold buyer trust.",
    whatSupportsIt: "Public and internal evidence are pointing toward proof, but customer proof is still missing.",
    uncertainty: "We still do not have direct customer evidence showing this route would change real decisions.",
    mustBecomeTrue: "We need evidence that clearer operational proof changes confidence or choice.",
    couldWeaken: "If buyers prioritize price or convenience more than reliability or proof, this route may weaken.",
    supportingEvidenceLines: [],
    weakeningEvidenceLines: [],
    relevanceScore: 6,
    matchedHypothesisIds: ["hyp-1"],
    supportShape: { outside: 1, organization: 1, customer: 0 },
    linkSource: "graph_linked",
    ...overrides,
  };
}

function makeChangeSummary(overrides: Partial<StrategicChangeSummary> = {}): StrategicChangeSummary {
  return {
    latestJobMapEvent: null,
    affectedArtifacts: [],
    affectedCounts: { total: 0, odi_needs: 0, routes: 0, desired_outcomes: 0 },
    scoreNote: null,
    debug: {
      latestEventId: null,
      latestEventAt: null,
      latestArtifactVersionCount: 0,
      dependenciesCreatedCount: 0,
    },
    ...overrides,
  };
}

describe("refine preview confidence landscape", () => {
  it("shows customer proof as early when the read has no customer backing", () => {
    const domains = buildRefinePreviewConfidenceLandscape({
      activeRows: [makeRow()],
      allRows: [makeRow()],
      changeSummary: makeChangeSummary(),
      routeRationales: [makeRationale()],
      routeSeeds: [makeSeed()],
    });

    expect(domains.find((domain) => domain.key === "customer_proof")?.state).toBe("Early signal");
    expect(domains.find((domain) => domain.key === "customer_proof")?.narrative).toContain(
      "We have not yet heard directly from enough customers",
    );
  });

  it("raises customer proof when customer-backed routes and hypotheses exist", () => {
    const customerRow = makeRow({
      supportingClaims: [
        {
          ...makeRow().supportingClaims[0],
          supportShape: { outside: 1, organization: 1, customer: 1 },
        },
      ],
    });
    const domains = buildRefinePreviewConfidenceLandscape({
      activeRows: [customerRow, customerRow],
      allRows: [customerRow, customerRow],
      changeSummary: makeChangeSummary(),
      routeRationales: [
        makeRationale({
          readiness: "Commit",
          confidenceLabel: "Supported by multiple validated signals",
          supportShape: { outside: 1, organization: 1, customer: 1 },
        }),
      ],
      routeSeeds: [
        makeSeed({
          evidence: [{ id: "ev-1", title: "Customer proof", status: "complete" }],
          assumptions: [],
        }),
      ],
    });

    expect(domains.find((domain) => domain.key === "customer_proof")?.state).toBe("Strong enough to act on");
  });

  it("keeps strategic alignment early when review pressure is unresolved", () => {
    const domains = buildRefinePreviewConfidenceLandscape({
      activeRows: [makeRow()],
      allRows: [makeRow()],
      changeSummary: makeChangeSummary({
        affectedCounts: { total: 2, odi_needs: 2, routes: 0, desired_outcomes: 0 },
      }),
      routeRationales: [makeRationale()],
      routeSeeds: [makeSeed()],
    });

    expect(domains.find((domain) => domain.key === "strategic_alignment")?.state).toBe("Early signal");
    expect(domains.find((domain) => domain.key === "execution_readiness")?.whatStillWeakensConfidence).toContain(
      "still need review before the work is safe to execute",
    );
  });

  it("treats route confidence as strong enough when a route is commit-ready without holds", () => {
    const domains = buildRefinePreviewConfidenceLandscape({
      activeRows: [makeRow()],
      allRows: [makeRow()],
      changeSummary: makeChangeSummary(),
      routeRationales: [makeRationale({ readiness: "Commit", movement: "strengthen" })],
      routeSeeds: [makeSeed({ assumptions: [], evidence: [] })],
    });

    expect(domains.find((domain) => domain.key === "route_confidence")?.state).toBe("Strong enough to act on");
  });

  it("does not highlight route confidence as strongest when every route is still early and customer proof is weak", () => {
    const domains = buildRefinePreviewConfidenceLandscape({
      activeRows: [makeRow()],
      allRows: [makeRow()],
      changeSummary: makeChangeSummary(),
      routeRationales: [
        makeRationale({
          readiness: "Investigate",
          confidenceLabel: "Still highly uncertain",
          movement: "remain_unresolved",
        }),
      ],
      routeSeeds: [makeSeed()],
    });

    const strongest = selectConfidenceLandscapeHighlight(domains);
    expect(strongest?.key).not.toBe("route_confidence");
  });

  it("preserves recognizable public identity language when alignment is diverging", () => {
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
            statement: "Internal strategy is centered on partner operational outcomes and operational reliability.",
          },
          supportShape: { outside: 0, organization: 2, customer: 0 },
        },
      ],
    });

    const domains = buildRefinePreviewConfidenceLandscape({
      activeRows: [makeRow(), orgRow],
      allRows: [makeRow(), orgRow],
      changeSummary: makeChangeSummary(),
      routeRationales: [makeRationale()],
      routeSeeds: [makeSeed()],
      phase: "diagnose",
    });

    expect(domains.find((domain) => domain.key === "strategic_alignment")?.narrative).toContain(
      "publicly the company still reads as a company publicly known for craft quality and specialty coffee",
    );
  });
});
