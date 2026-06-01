import { describe, expect, it } from "vitest";
import type { HypothesisProvenanceCard } from "@/hooks/useStrategicHypotheses";
import type { ConfidenceLandscapeDomain } from "@/lib/refinePreviewConfidenceLandscape";
import type { RouteRationale } from "@/lib/routeRationale";
import type { RouteRow } from "@/views/Routes/useRoutes";
import {
  buildRouteEditorialRoles,
  filterConfidenceDomainsForPhase,
  phaseConfidenceEmphasis,
  phaseNarrativePriority,
  phaseSectionVisibility,
  resolveRefineNarrativePhase,
  scoreHypothesisEditorial,
  softenRouteForPhase,
  sortHypothesesForPhase,
  sortRoutesForPhase,
} from "./refinePreviewPhaseOrchestration";

function makeHypothesis(overrides: Partial<HypothesisProvenanceCard> = {}): HypothesisProvenanceCard {
  return {
    hypothesis: {
      id: "hyp-1",
      company_id: "company-1",
      hypothesis_key: "hyp-1",
      statement: "Public positioning may need stronger operational proof to win trust.",
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
          statement: "Evidence thread",
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
    title: "Route",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeRationale(overrides: Partial<RouteRationale> = {}): RouteRationale {
  return {
    routeId: "route-1",
    routeTitle: "Route",
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
    relevanceScore: 1,
    matchedHypothesisIds: [],
    supportShape: { outside: 1, organization: 0, customer: 0 },
    linkSource: "fallback_matched",
    ...overrides,
  };
}

function makeDomain(overrides: Partial<ConfidenceLandscapeDomain> = {}): ConfidenceLandscapeDomain {
  return {
    key: "market_understanding",
    title: "Market Understanding",
    state: "Direction forming",
    narrative: "Narrative",
    whatIncreasesConfidence: "More signal",
    whatStillWeakensConfidence: "Still weak",
    ...overrides,
  };
}

describe("refine preview phase orchestration", () => {
  it("maps raw engagement phases into narrative phases", () => {
    expect(resolveRefineNarrativePhase("outside_signals")).toBe("pre_diagnosis");
    expect(resolveRefineNarrativePhase("diagnose")).toBe("diagnose");
    expect(resolveRefineNarrativePhase("focus")).toBe("focus");
    expect(resolveRefineNarrativePhase("flow")).toBe("flow");
  });

  it("changes section defaults by phase", () => {
    expect(phaseSectionVisibility("diagnose").movementExpandedByDefault).toBe(true);
    expect(phaseSectionVisibility("outside_signals").movementVisibleCount).toBe(1);
    expect(phaseSectionVisibility("focus").showConfidence).toBe(true);
    expect(phaseSectionVisibility("flow").movementExpandedByDefault).toBe(false);
    expect(phaseConfidenceEmphasis("outside_signals")).toEqual(["market_understanding", "customer_proof"]);
    expect(phaseConfidenceEmphasis("focus")).toEqual(["route_confidence", "execution_readiness"]);
    expect(phaseConfidenceEmphasis("flow")).toEqual(["execution_readiness", "route_confidence", "customer_proof"]);
  });

  it("brings tensions forward in pre-diagnosis hypothesis ordering", () => {
    const directional = makeHypothesis();
    const tension = makeHypothesis({
      hypothesis: {
        ...makeHypothesis().hypothesis,
        id: "hyp-2",
        hypothesis_kind: "inferred_tension",
      },
    });

    const ordered = sortHypothesesForPhase([directional, tension], "tension_first");
    expect(ordered[0]?.hypothesis.hypothesis_kind).toBe("inferred_tension");
  });

  it("surfaces commit-ready routes first in focus and weak moving routes first in flow", () => {
    const investigateRoute = makeRoute({ id: "route-investigate", title: "Investigate" });
    const commitRoute = makeRoute({ id: "route-commit", title: "Commit" });
    const driftRoute = makeRoute({ id: "route-drift", title: "Drift" });
    const map = new Map<string, RouteRationale>([
      ["route-investigate", makeRationale({ routeId: "route-investigate", routeTitle: "Investigate", readiness: "Investigate", movement: "remain_unresolved" })],
      ["route-commit", makeRationale({ routeId: "route-commit", routeTitle: "Commit", readiness: "Commit", confidenceLabel: "Supported by multiple validated signals", movement: "strengthen" })],
      ["route-drift", makeRationale({ routeId: "route-drift", routeTitle: "Drift", readiness: "Hold", movement: "weaken", confidenceLabel: "Contradicted by recent evidence" })],
    ]);

    const focusSorted = sortRoutesForPhase({ items: [investigateRoute, commitRoute], rationales: map, phase: "focus" });
    expect(focusSorted[0]?.id).toBe("route-commit");

    const flowSorted = sortRoutesForPhase({ items: [commitRoute, driftRoute], rationales: map, phase: "flow" });
    expect(flowSorted[0]?.id).toBe("route-drift");
  });

  it("softens weak routes in focus without hiding the lead route", () => {
    expect(
      softenRouteForPhase({
        phase: "focus",
        route: makeRoute({ id: "route-investigate" }),
        rationale: makeRationale({ routeId: "route-investigate", readiness: "Investigate" }),
        recommendedRouteId: "route-commit",
      }),
    ).toBe(true);

    expect(
      softenRouteForPhase({
        phase: "focus",
        route: makeRoute({ id: "route-commit" }),
        rationale: makeRationale({ routeId: "route-commit", readiness: "Commit" }),
        recommendedRouteId: "route-commit",
      }),
    ).toBe(false);
  });

  it("provides different route copy postures by phase", () => {
    expect(phaseNarrativePriority("outside_signals").routes.panelTitle).toBe("Why this path is surfacing");
    expect(phaseNarrativePriority("diagnose").routes.panelTitle).toBe("Why this path is emerging");
    expect(phaseNarrativePriority("focus").routes.panelTitle).toBe("Why this route is safest to focus around");
    expect(phaseNarrativePriority("flow").routes.panelTitle).toBe("How this route is holding up");
    expect(phaseNarrativePriority("focus").mainPage.hypothesisLabel).toBe("What this focus depends on");
    expect(phaseNarrativePriority("flow").mainPage.showMovementFirst).toBe(true);
  });

  it("prioritizes unresolved tensions over outside-only directional reads in early phases", () => {
    const outsideOnly = makeHypothesis();
    const tension = makeHypothesis({
      hypothesis: {
        ...makeHypothesis().hypothesis,
        id: "hyp-2",
        hypothesis_kind: "inferred_tension",
      },
      weakeningClaims: [
        {
          ...makeHypothesis().supportingClaims[0],
          claim: { ...makeHypothesis().supportingClaims[0].claim, id: "claim-2" },
        },
      ],
    });

    expect(scoreHypothesisEditorial(tension, "outside_signals")).toBeGreaterThan(scoreHypothesisEditorial(outsideOnly, "outside_signals"));
  });

  it("suppresses execution confidence in pre-diagnosis and stable domains in flow", () => {
    const domains = [
      makeDomain({ key: "execution_readiness", title: "Execution Readiness", state: "Strong enough to act on" }),
      makeDomain({ key: "market_understanding", title: "Market Understanding", state: "Direction forming" }),
      makeDomain({ key: "route_confidence", title: "Route Confidence", state: "Strong enough to act on" }),
    ];

    expect(filterConfidenceDomainsForPhase(domains, "outside_signals", ["market_understanding"]).some((domain) => domain.key === "execution_readiness")).toBe(false);
    expect(filterConfidenceDomainsForPhase(domains, "flow", ["customer_proof"]).some((domain) => domain.key === "route_confidence")).toBe(false);
  });

  it("marks recommended, improving, and risk routes for editorial emphasis", () => {
    const recommended = makeRoute({ id: "route-recommended", title: "Recommended" });
    const improving = makeRoute({ id: "route-improving", title: "Improving" });
    const risk = makeRoute({ id: "route-risk", title: "Risk" });
    const roles = buildRouteEditorialRoles({
      items: [recommended, improving, risk],
      rationales: new Map<string, RouteRationale>([
        ["route-recommended", makeRationale({ routeId: "route-recommended", routeTitle: "Recommended", readiness: "Validate" })],
        ["route-improving", makeRationale({ routeId: "route-improving", routeTitle: "Improving", movement: "strengthen", confidenceLabel: "Evidence is starting to converge", readiness: "Validate" })],
        ["route-risk", makeRationale({ routeId: "route-risk", routeTitle: "Risk", movement: "weaken", confidenceLabel: "Contradicted by recent evidence", readiness: "Hold" })],
      ]),
      phase: "flow",
      recommendedRouteId: "route-recommended",
    });

    expect(roles.get("route-recommended")).toBe("recommended");
    expect(roles.get("route-improving")).toBe("improving");
    expect(roles.get("route-risk")).toBe("risk");
  });
});
