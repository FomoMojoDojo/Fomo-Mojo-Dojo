import { describe, expect, it } from "vitest";
import type { RouteRow, RouteAssumption } from "@/hooks/useRoutes";
import type { RouteRationale } from "@/lib/routeRationale";
import type { StrategicCenter } from "@/lib/strategicCenter";
import type { CustomerRealityNarrative } from "@/lib/customerRealityNarrative";
import type { PositioningLensNarrative } from "@/lib/positioningLensNarrative";
import {
  buildDecisionPortfolio,
  type CommitmentState,
  type SequencingPosture,
  type PortfolioState,
} from "./decisionSystem";

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeRoute(overrides: Partial<RouteRow> = {}): RouteRow {
  return {
    id: "route-1",
    company_id: "company-1",
    category: "fix",
    title: "Fix order reliability gaps",
    short_description: "Reduce order errors and improve delivery consistency.",
    frameworks_used: ["odi"],
    pts_value: 12,
    effort: "medium",
    type: "Fix",
    sort_order: 1,
    steps_json: null,
    evidence_json: null,
    why_this_matters_json: ["Order errors are the top customer complaint."],
    assumptions_json: null,
    dependency_state: null,
    validation_state: null,
    evidence_state: null,
    stale_reason: null,
    updated_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeRationale(overrides: Partial<RouteRationale> = {}): RouteRationale {
  return {
    routeId: "route-1",
    routeTitle: "Fix order reliability gaps",
    confidenceLabel: "Early directional read",
    movement: "strengthen",
    movementLabel: "Strengthening",
    readiness: "Validate",
    readinessMeaning: "Worth validating now.",
    whyThisRouteExists: "Order errors are the top customer complaint.",
    whatSupportsIt: "Internal operations data and outside research support this.",
    uncertainty: "Customer confirmation is still missing.",
    mustBecomeTrue: "Customers confirm reliability is a top frustration.",
    couldWeaken: "If reliability improves without customer impact.",
    supportingEvidenceLines: [],
    weakeningEvidenceLines: [],
    relevanceScore: 60,
    matchedHypothesisIds: [],
    supportShape: { outside: 1, organization: 2, customer: 0 },
    linkSource: "graph_linked",
    ...overrides,
  };
}

function makeCenter(overrides: Partial<StrategicCenter> = {}): StrategicCenter {
  return {
    key: "operational_reliability",
    label: "operational reliability",
    confidence: "medium",
    supportingThemes: [],
    competingThemes: [],
    unresolvedTensions: [],
    publicContextLabel: null,
    customerLag: false,
    hasMeaningfulDivergence: false,
    shouldLeadExplanations: true,
    ...overrides,
  };
}

function makeCustomerReality(overrides: Partial<CustomerRealityNarrative> = {}): CustomerRealityNarrative {
  return {
    posture: "directional",
    postureHeadline: "Strategy is running ahead of customer proof.",
    validatedNeedCount: 0,
    inferredNeedCount: 2,
    highPriorityGaps: [],
    frictionPatterns: [],
    directionGrounding: "Direction is not yet grounded.",
    unresolved: [],
    conflicts: [],
    wouldResolve: [],
    ...overrides,
  };
}

// ─── 1. Route blocked by missing validation ────────────────────────────────────

describe("route blocked by missing validation", () => {
  it("assigns waiting_on_customer_confirmation when validate and no customer signal", () => {
    const route = makeRoute();
    const rationale = makeRationale({ readiness: "Validate", supportShape: { outside: 1, organization: 1, customer: 0 } });

    const result = buildDecisionPortfolio({
      routes: [route],
      rationales: [rationale],
      strategicCenter: makeCenter(),
      customerReality: null,
      positioningNarrative: null,
      phase: "focus",
    });

    expect(result.routes[0].sequencingPosture).toBe<SequencingPosture>("waiting_on_customer_confirmation");
  });

  it("assigns needs_prerequisite_proof when unproven critical assumptions exist", () => {
    const assumptions: RouteAssumption[] = [
      { id: "a1", statement: "Customers confirm reliability frustration.", status: "unproven", layer: "customer", critical: true },
    ];
    const route = makeRoute({ assumptions_json: assumptions });
    const rationale = makeRationale({ readiness: "Validate", supportShape: { outside: 1, organization: 1, customer: 0 } });

    const result = buildDecisionPortfolio({
      routes: [route],
      rationales: [rationale],
      strategicCenter: makeCenter(),
      customerReality: null,
      positioningNarrative: null,
      phase: "focus",
    });

    expect(result.routes[0].sequencingPosture).toBe<SequencingPosture>("needs_prerequisite_proof");
  });
});

// ─── 2. Scaling ahead of confidence ──────────────────────────────────────────────

describe("scaling ahead of confidence", () => {
  it("assigns scaling_ahead portfolio state when committed routes exist with low center confidence", () => {
    const route = makeRoute();
    const rationale = makeRationale({
      readiness: "Commit",
      confidenceLabel: "Evidence is starting to converge",
      movement: "strengthen",
      supportShape: { outside: 1, organization: 2, customer: 1 },
    });

    const result = buildDecisionPortfolio({
      routes: [route],
      rationales: [rationale],
      strategicCenter: makeCenter({ confidence: "low" }),
      customerReality: null,
      positioningNarrative: null,
      phase: "focus",
    });

    expect(result.portfolioState).toBe<PortfolioState>("scaling_ahead");
  });

  it("adds scaling_ahead escalation when committed route with low confidence", () => {
    const route = makeRoute();
    const rationale = makeRationale({ readiness: "Commit", confidenceLabel: "Evidence is starting to converge", supportShape: { outside: 1, organization: 2, customer: 1 } });

    const result = buildDecisionPortfolio({
      routes: [route],
      rationales: [rationale],
      strategicCenter: makeCenter({ confidence: "low" }),
      customerReality: null,
      positioningNarrative: null,
      phase: "focus",
    });

    const hasScalingEscalation = result.escalations.some((e) => e.title.toLowerCase().includes("faster than confidence"));
    expect(hasScalingEscalation).toBe(true);
  });

  it("marks isSafeToScale false when center confidence is low", () => {
    const route = makeRoute();
    const rationale = makeRationale({ readiness: "Commit", confidenceLabel: "Evidence is starting to converge" });

    const result = buildDecisionPortfolio({
      routes: [route],
      rationales: [rationale],
      strategicCenter: makeCenter({ confidence: "low" }),
      customerReality: null,
      positioningNarrative: null,
      phase: "focus",
    });

    expect(result.routes[0].isSafeToScale).toBe(false);
  });

  it("marks isSafeToScale true when multiple validated signals and medium confidence", () => {
    const route = makeRoute();
    const rationale = makeRationale({
      readiness: "Commit",
      confidenceLabel: "Supported by multiple validated signals",
      movement: "strengthen",
      supportShape: { outside: 1, organization: 2, customer: 1 },
    });

    const result = buildDecisionPortfolio({
      routes: [route],
      rationales: [rationale],
      strategicCenter: makeCenter({ confidence: "medium" }),
      customerReality: null,
      positioningNarrative: null,
      phase: "focus",
    });

    expect(result.routes[0].isSafeToScale).toBe(true);
  });
});

// ─── 3. Contradictory route portfolio ─────────────────────────────────────────────

describe("contradictory route portfolio", () => {
  it("adds escalation for contradicted route that is not paused", () => {
    const route = makeRoute();
    const rationale = makeRationale({
      confidenceLabel: "Contradicted by recent evidence",
      movement: "strengthen",
      readiness: "Validate",
    });

    const result = buildDecisionPortfolio({
      routes: [route],
      rationales: [rationale],
      strategicCenter: makeCenter(),
      customerReality: null,
      positioningNarrative: null,
      phase: "flow",
    });

    const hasContradictedEscalation = result.escalations.some((e) => e.title.toLowerCase().includes("contradicted"));
    expect(hasContradictedEscalation).toBe(true);
  });

  it("does NOT add contradicted escalation when route is already paused", () => {
    const route = makeRoute();
    const rationale = makeRationale({
      confidenceLabel: "Contradicted by recent evidence",
      movement: "weaken",
      readiness: "Hold",
    });

    const result = buildDecisionPortfolio({
      routes: [route],
      rationales: [rationale],
      strategicCenter: makeCenter(),
      customerReality: null,
      positioningNarrative: null,
      phase: "flow",
    });

    const hasContradictedEscalation = result.escalations.some((e) => e.title.toLowerCase().includes("contradicted"));
    expect(hasContradictedEscalation).toBe(false);
  });

  it("assigns unwind state when contradicted + weakening + on hold", () => {
    const route = makeRoute();
    const rationale = makeRationale({
      confidenceLabel: "Contradicted by recent evidence",
      movement: "weaken",
      readiness: "Hold",
    });

    const result = buildDecisionPortfolio({
      routes: [route],
      rationales: [rationale],
      strategicCenter: makeCenter(),
      customerReality: null,
      positioningNarrative: null,
      phase: "flow",
    });

    expect(result.routes[0].commitmentState).toBe<CommitmentState>("unwind");
  });
});

// ─── 4. Converging route portfolio ───────────────────────────────────────────────

describe("converging route portfolio", () => {
  it("returns converging portfolio state when most routes at validate/commit", () => {
    const routes = [
      makeRoute({ id: "r1", category: "fix" }),
      makeRoute({ id: "r2", category: "improve" }),
      makeRoute({ id: "r3", category: "create" }),
    ];
    const rationales = [
      makeRationale({ routeId: "r1", readiness: "Validate", movement: "strengthen" }),
      makeRationale({ routeId: "r2", readiness: "Commit", movement: "strengthen", supportShape: { outside: 1, organization: 2, customer: 1 } }),
      makeRationale({ routeId: "r3", readiness: "Validate", movement: "strengthen" }),
    ];

    const result = buildDecisionPortfolio({
      routes,
      rationales,
      strategicCenter: makeCenter({ confidence: "medium" }),
      customerReality: null,
      positioningNarrative: null,
      phase: "focus",
    });

    expect(result.portfolioState).toBe<PortfolioState>("converging");
  });

  it("populates converging list with validate and commit routes", () => {
    const routes = [
      makeRoute({ id: "r1", category: "fix", title: "Fix reliability" }),
      makeRoute({ id: "r2", category: "improve", title: "Improve onboarding" }),
    ];
    const rationales = [
      makeRationale({ routeId: "r1", readiness: "Commit", movement: "strengthen" }),
      makeRationale({ routeId: "r2", readiness: "Validate", movement: "strengthen" }),
    ];

    const result = buildDecisionPortfolio({
      routes,
      rationales,
      strategicCenter: makeCenter({ confidence: "medium" }),
      customerReality: null,
      positioningNarrative: null,
      phase: "focus",
    });

    expect(result.converging).toContain("Fix reliability");
    expect(result.converging).toContain("Improve onboarding");
  });
});

// ─── 5. Weak strategic center dependency ──────────────────────────────────────────

describe("weak strategic center dependency", () => {
  it("escalates committed routes when center confidence is low", () => {
    const route = makeRoute({ id: "r1", title: "Create premium tier" });
    const rationale = makeRationale({ routeId: "r1", readiness: "Commit", supportShape: { outside: 1, organization: 2, customer: 1 } });

    const result = buildDecisionPortfolio({
      routes: [route],
      rationales: [rationale],
      strategicCenter: makeCenter({ confidence: "low" }),
      customerReality: null,
      positioningNarrative: null,
      phase: "focus",
    });

    expect(result.escalations.some((e) => e.severity === "warning")).toBe(true);
  });

  it("does not escalate when center confidence is high", () => {
    const route = makeRoute({ id: "r1", title: "Fix order reliability" });
    const rationale = makeRationale({
      routeId: "r1",
      readiness: "Commit",
      confidenceLabel: "Supported by multiple validated signals",
      supportShape: { outside: 2, organization: 2, customer: 2 },
    });

    const result = buildDecisionPortfolio({
      routes: [route],
      rationales: [rationale],
      strategicCenter: makeCenter({ confidence: "high" }),
      customerReality: null,
      positioningNarrative: null,
      phase: "flow",
    });

    const hasWarning = result.escalations.some((e) => e.severity === "warning" && e.title.toLowerCase().includes("faster"));
    expect(hasWarning).toBe(false);
  });
});

// ─── 6. Over-concentrated assumption risk ──────────────────────────────────────────

describe("over-concentrated portfolio", () => {
  it("returns over_concentrated when 3 of 3 routes are in same category", () => {
    const routes = [
      makeRoute({ id: "r1", category: "fix", title: "Fix A" }),
      makeRoute({ id: "r2", category: "fix", title: "Fix B" }),
      makeRoute({ id: "r3", category: "fix", title: "Fix C" }),
    ];
    const rationales = routes.map((r, i) =>
      makeRationale({ routeId: r.id, readiness: i === 0 ? "Commit" : "Validate" }),
    );

    const result = buildDecisionPortfolio({
      routes,
      rationales,
      strategicCenter: makeCenter(),
      customerReality: null,
      positioningNarrative: null,
      phase: "focus",
    });

    expect(result.portfolioState).toBe<PortfolioState>("over_concentrated");
  });
});

// ─── 7. Sequencing unlock behavior ───────────────────────────────────────────────

describe("sequencing unlock behavior", () => {
  it("identifies fix route as prerequisite for improve route with token overlap", () => {
    const fixRoute = makeRoute({
      id: "r-fix",
      category: "fix",
      title: "Fix order reliability issues",
      why_this_matters_json: ["Order reliability affects customer retention."],
    });
    const improveRoute = makeRoute({
      id: "r-improve",
      category: "improve",
      title: "Improve order reliability workflow",
      why_this_matters_json: ["Improving reliability will increase retention."],
    });
    const fixRationale = makeRationale({ routeId: "r-fix", readiness: "Validate" });
    const improveRationale = makeRationale({ routeId: "r-improve", readiness: "Validate" });

    const result = buildDecisionPortfolio({
      routes: [fixRoute, improveRoute],
      rationales: [fixRationale, improveRationale],
      strategicCenter: makeCenter(),
      customerReality: null,
      positioningNarrative: null,
      phase: "focus",
    });

    const improveDecision = result.routes.find((r) => r.routeId === "r-improve");
    expect(improveDecision?.prerequisiteRouteIds).toContain("r-fix");
  });

  it("identifies improve route as enabled by fix route", () => {
    const fixRoute = makeRoute({
      id: "r-fix",
      category: "fix",
      title: "Fix order reliability issues",
      why_this_matters_json: ["Order reliability affects customer retention."],
    });
    const improveRoute = makeRoute({
      id: "r-improve",
      category: "improve",
      title: "Improve order reliability workflow",
    });

    const result = buildDecisionPortfolio({
      routes: [fixRoute, improveRoute],
      rationales: [
        makeRationale({ routeId: "r-fix", readiness: "Validate" }),
        makeRationale({ routeId: "r-improve", readiness: "Explore" as never }),
      ],
      strategicCenter: makeCenter(),
      customerReality: null,
      positioningNarrative: null,
      phase: "focus",
    });

    const fixDecision = result.routes.find((r) => r.routeId === "r-fix");
    expect(fixDecision?.enabledRouteIds).toContain("r-improve");
  });

  it("marks improve route as operationally_blocked when fix is not yet committed", () => {
    const fixRoute = makeRoute({ id: "r-fix", category: "fix", title: "Fix operational gaps" });
    const improveRoute = makeRoute({ id: "r-improve", category: "improve", title: "Improve the service layer" });

    const result = buildDecisionPortfolio({
      routes: [fixRoute, improveRoute],
      rationales: [
        makeRationale({ routeId: "r-fix", readiness: "Investigate" }),
        makeRationale({ routeId: "r-improve", readiness: "Validate" }),
      ],
      strategicCenter: makeCenter(),
      customerReality: null,
      positioningNarrative: null,
      phase: "focus",
    });

    const improveDecision = result.routes.find((r) => r.routeId === "r-improve");
    expect(improveDecision?.sequencingPosture).toBe<SequencingPosture>("operationally_blocked");
  });
});

// ─── 8. Commitment escalation suppression when confidence improves ──────────────────

describe("commitment escalation suppression when confidence improves", () => {
  it("does not add customer proof escalation when customer signal is present", () => {
    const route = makeRoute();
    const rationale = makeRationale({
      readiness: "Commit",
      confidenceLabel: "Supported by multiple validated signals",
      supportShape: { outside: 2, organization: 2, customer: 3 },
    });

    const result = buildDecisionPortfolio({
      routes: [route],
      rationales: [rationale],
      strategicCenter: makeCenter({ confidence: "high" }),
      customerReality: null,
      positioningNarrative: null,
      phase: "flow",
    });

    const hasCustomerEscalation = result.escalations.some((e) =>
      e.title.toLowerCase().includes("customer"),
    );
    expect(hasCustomerEscalation).toBe(false);
  });

  it("validation_heavy portfolio moves toward converging when validate routes exist", () => {
    const routes = [
      makeRoute({ id: "r1", category: "fix", title: "Fix A" }),
      makeRoute({ id: "r2", category: "improve", title: "Improve B" }),
    ];
    const rationales = [
      makeRationale({ routeId: "r1", readiness: "Investigate" }),
      makeRationale({ routeId: "r2", readiness: "Investigate" }),
    ];

    const result = buildDecisionPortfolio({
      routes,
      rationales,
      strategicCenter: makeCenter({ confidence: "medium" }),
      customerReality: null,
      positioningNarrative: null,
      phase: "focus",
    });

    expect(result.portfolioState).toBe<PortfolioState>("validation_heavy");
    expect(result.portfolioNextMove).toBeTruthy();
  });
});

// ─── 9. Scale state assigned for strong multi-signal routes ───────────────────────

describe("scale commitment state", () => {
  it("assigns scale state when all conditions met", () => {
    const route = makeRoute();
    const rationale = makeRationale({
      readiness: "Commit",
      confidenceLabel: "Supported by multiple validated signals",
      movement: "strengthen",
      supportShape: { outside: 2, organization: 3, customer: 2 },
    });

    const result = buildDecisionPortfolio({
      routes: [route],
      rationales: [rationale],
      strategicCenter: makeCenter({ confidence: "high" }),
      customerReality: null,
      positioningNarrative: null,
      phase: "flow",
    });

    expect(result.routes[0].commitmentState).toBe<CommitmentState>("scale");
  });
});

// ─── 10. Customer-proof commitment guard ─────────────────────────────────────────

describe("customer-proof commitment guard", () => {
  it("assigns validate (not commit) when readiness is Commit but customer signal is absent", () => {
    const route = makeRoute();
    const rationale = makeRationale({
      readiness: "Commit",
      supportShape: { outside: 1, organization: 2, customer: 0 },
    });

    const result = buildDecisionPortfolio({
      routes: [route],
      rationales: [rationale],
      strategicCenter: makeCenter({ confidence: "medium" }),
      customerReality: null,
      positioningNarrative: null,
      phase: "focus",
    });

    expect(result.routes[0].commitmentState).toBe<CommitmentState>("validate");
  });

  it("assigns commit when readiness is Commit and customer signal is present", () => {
    const route = makeRoute();
    const rationale = makeRationale({
      readiness: "Commit",
      supportShape: { outside: 1, organization: 2, customer: 1 },
    });

    const result = buildDecisionPortfolio({
      routes: [route],
      rationales: [rationale],
      strategicCenter: makeCenter({ confidence: "medium" }),
      customerReality: null,
      positioningNarrative: null,
      phase: "focus",
    });

    expect(result.routes[0].commitmentState).toBe<CommitmentState>("commit");
  });

  it("route downgraded from Commit to validate is excluded from safeToCommit but included in converging", () => {
    const route = makeRoute({ title: "Fix order reliability gaps" });
    const rationale = makeRationale({
      readiness: "Commit",
      supportShape: { outside: 1, organization: 2, customer: 0 },
    });

    const result = buildDecisionPortfolio({
      routes: [route],
      rationales: [rationale],
      strategicCenter: makeCenter({ confidence: "medium" }),
      customerReality: null,
      positioningNarrative: null,
      phase: "focus",
    });

    expect(result.safeToCommit).not.toContain("Fix order reliability gaps");
    expect(result.converging).toContain("Fix order reliability gaps");
  });

  it("rationale for downgraded route uses customer-proof copy", () => {
    const route = makeRoute();
    const rationale = makeRationale({
      readiness: "Commit",
      supportShape: { outside: 1, organization: 2, customer: 0 },
    });

    const result = buildDecisionPortfolio({
      routes: [route],
      rationales: [rationale],
      strategicCenter: makeCenter({ confidence: "medium" }),
      customerReality: null,
      positioningNarrative: null,
      phase: "focus",
    });

    expect(result.routes[0].commitmentRationale).toContain("customer proof");
  });
});

// ─── 11. Paused route not in safeToCommit ─────────────────────────────────────────

describe("paused route exclusions", () => {
  it("paused route is included in blocked list, not safeToCommit", () => {
    const route = makeRoute({ title: "Fix reliability issues" });
    const rationale = makeRationale({ readiness: "Hold", movement: "weaken" });

    const result = buildDecisionPortfolio({
      routes: [route],
      rationales: [rationale],
      strategicCenter: makeCenter(),
      customerReality: null,
      positioningNarrative: null,
      phase: "focus",
    });

    expect(result.safeToCommit).not.toContain("Fix reliability issues");
    expect(result.blocked).toContain("Fix reliability issues");
  });
});

// ─── 12. Phase 44 — stale customer proof guard ───────────────────────────────

describe("stale customer proof commitment guard", () => {
  it("assigns validate (not commit) when customer proof is stale", () => {
    const route = makeRoute();
    const rationale = makeRationale({
      readiness: "Commit",
      supportShape: { outside: 1, organization: 2, customer: 1 },
    });

    const result = buildDecisionPortfolio({
      routes: [route],
      rationales: [rationale],
      strategicCenter: makeCenter({ confidence: "medium" }),
      customerReality: null,
      positioningNarrative: null,
      phase: "focus",
      customerProofAgingState: "stale",
    });

    expect(result.routes[0].commitmentState).toBe<CommitmentState>("validate");
  });

  it("allows commit when customer proof is aging (not yet stale)", () => {
    const route = makeRoute();
    const rationale = makeRationale({
      readiness: "Commit",
      supportShape: { outside: 1, organization: 2, customer: 1 },
    });

    const result = buildDecisionPortfolio({
      routes: [route],
      rationales: [rationale],
      strategicCenter: makeCenter({ confidence: "medium" }),
      customerReality: null,
      positioningNarrative: null,
      phase: "focus",
      customerProofAgingState: "aging",
    });

    expect(result.routes[0].commitmentState).toBe<CommitmentState>("commit");
  });

  it("rationale for stale-downgraded route mentions stale proof", () => {
    const route = makeRoute();
    const rationale = makeRationale({
      readiness: "Commit",
      supportShape: { outside: 1, organization: 2, customer: 1 },
    });

    const result = buildDecisionPortfolio({
      routes: [route],
      rationales: [rationale],
      strategicCenter: makeCenter({ confidence: "medium" }),
      customerReality: null,
      positioningNarrative: null,
      phase: "focus",
      customerProofAgingState: "stale",
    });

    expect(result.routes[0].commitmentRationale).toMatch(/stale|aged/i);
    expect(result.routes[0].commitmentRationale).toMatch(/re-validate|validate/i);
  });

  it("stale guard does not affect routes without customer proof (already validate)", () => {
    const route = makeRoute();
    const rationale = makeRationale({
      readiness: "Commit",
      supportShape: { outside: 1, organization: 2, customer: 0 },
    });

    const result = buildDecisionPortfolio({
      routes: [route],
      rationales: [rationale],
      strategicCenter: makeCenter({ confidence: "medium" }),
      customerReality: null,
      positioningNarrative: null,
      phase: "focus",
      customerProofAgingState: "stale",
    });

    // Still validate, but rationale uses missing-proof copy (not stale copy)
    expect(result.routes[0].commitmentState).toBe<CommitmentState>("validate");
    expect(result.routes[0].commitmentRationale).toMatch(/customer proof/i);
    expect(result.routes[0].commitmentRationale).not.toMatch(/stale/i);
  });

  it("stale guard prevents scale in addition to commit", () => {
    const route = makeRoute();
    const rationale = makeRationale({
      readiness: "Commit",
      confidenceLabel: "Supported by multiple validated signals",
      supportShape: { outside: 2, organization: 3, customer: 1 },
    });

    const result = buildDecisionPortfolio({
      routes: [route],
      rationales: [rationale],
      strategicCenter: makeCenter({ confidence: "high" }),
      customerReality: null,
      positioningNarrative: null,
      phase: "flow",
      customerProofAgingState: "stale",
    });

    expect(result.routes[0].commitmentState).toBe<CommitmentState>("validate");
    expect(result.routes[0].commitmentState).not.toBe<CommitmentState>("scale");
  });

  it("no aging state passed → defaults to fresh (backward compat)", () => {
    const route = makeRoute();
    const rationale = makeRationale({
      readiness: "Commit",
      supportShape: { outside: 1, organization: 2, customer: 1 },
    });

    const result = buildDecisionPortfolio({
      routes: [route],
      rationales: [rationale],
      strategicCenter: makeCenter({ confidence: "medium" }),
      customerReality: null,
      positioningNarrative: null,
      phase: "focus",
      // no customerProofAgingState
    });

    expect(result.routes[0].commitmentState).toBe<CommitmentState>("commit");
  });
});
