import { describe, expect, it } from "vitest";
import type { StrategicCenter } from "@/lib/strategicCenter";
import type { CustomerRealityNarrative } from "@/lib/customerRealityNarrative";
import type { PositioningLensNarrative } from "@/lib/positioningLensNarrative";
import type { ConfidenceLandscapeDomain } from "@/lib/refinePreviewConfidenceLandscape";
import type { RouteRationale } from "@/lib/routeRationale";
import type { DecisionPortfolio } from "@/lib/decisionSystem";
import { buildStrategicCenterSurface, type CenterStateKey, type UnifiedConfidencePosture } from "./strategicCenterSurface";

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeCenter(overrides: Partial<StrategicCenter> = {}): StrategicCenter {
  return {
    key: "operational_reliability",
    label: "operational reliability",
    confidence: "medium",
    supportingThemes: [{ key: "operational_reliability", label: "Operational Reliability", score: 3.2, source: "hypothesis" }],
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
    postureHeadline: "Strategic direction is running ahead of customer proof.",
    validatedNeedCount: 0,
    inferredNeedCount: 2,
    highPriorityGaps: [],
    frictionPatterns: [],
    directionGrounding: "Direction is not yet grounded in validated customer behavior.",
    unresolved: [],
    conflicts: [],
    wouldResolve: [],
    ...overrides,
  };
}

function makePositioningNarrative(overrides: Partial<PositioningLensNarrative> = {}): PositioningLensNarrative {
  return {
    posture: "emerging",
    postureHeadline: "Strategic direction is shifting faster than market understanding.",
    marketPerception: "A reliable operations partner.",
    intendedIdentity: "A trusted partner for operational outcomes.",
    customerProofStatus: "partial",
    customerProofNote: "Some customer proof exists.",
    tensions: [],
    reinforcingRoutes: [],
    contradictingRoutes: [],
    wouldStrengthen: [],
    ...overrides,
  };
}

function makeConfidenceDomain(overrides: Partial<ConfidenceLandscapeDomain> = {}): ConfidenceLandscapeDomain {
  return {
    key: "customer_proof",
    title: "Customer Proof",
    state: "Direction forming",
    narrative: "Customer proof is still thin.",
    whatIncreasesConfidence: "Run primary customer interviews.",
    whatStillWeakensConfidence: "No direct customer signal.",
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
    whyThisRouteExists: "Order reliability is a top customer concern.",
    whatSupportsIt: "Internal operations data supports the direction.",
    uncertainty: "Customer signal is still missing.",
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

// ─── 1. Default state (no customer/positioning data) ──────────────────────────

describe("default surface (no customer/positioning narrative)", () => {
  it("returns direction_cohering state with medium confidence center", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter(),
      customerReality: null,
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "diagnose",
    });
    expect(result.centerStateKey).toBe<CenterStateKey>("direction_cohering");
  });

  it("includes center label in headline for direction_cohering", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter({ label: "operational reliability" }),
      customerReality: null,
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "diagnose",
    });
    expect(result.centerHeadline).toContain("operational reliability");
  });

  it("returns speculative confidence posture for low center confidence", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter({ confidence: "low" }),
      customerReality: null,
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "outside_signals",
    });
    expect(result.confidencePosture).toBe<UnifiedConfidencePosture>("speculative");
  });

  it("returns directional confidence posture for medium center confidence", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter({ confidence: "medium" }),
      customerReality: null,
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "diagnose",
    });
    expect(result.confidencePosture).toBe<UnifiedConfidencePosture>("directional");
  });

  it("returns empty topTensions and null contradiction when no signals exist", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter({ unresolvedTensions: [] }),
      customerReality: null,
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "diagnose",
    });
    expect(result.topTensions).toHaveLength(0);
    expect(result.topContradiction).toBeNull();
    expect(result.biggestUnresolvedAssumption).toBeNull();
  });
});

// ─── 2. Coherent surface ───────────────────────────────────────────────────────

describe("coherent surface", () => {
  it("returns coherent confidence posture when all layers align", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter({ confidence: "high" }),
      customerReality: makeCustomerReality({ posture: "grounded" }),
      positioningNarrative: makePositioningNarrative({ posture: "coherent" }),
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "focus",
    });
    expect(result.confidencePosture).toBe<UnifiedConfidencePosture>("coherent");
  });

  it("returns stabilizing posture when high confidence but customer not grounded", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter({ confidence: "high" }),
      customerReality: makeCustomerReality({ posture: "converging" }),
      positioningNarrative: makePositioningNarrative({ posture: "coherent" }),
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "focus",
    });
    expect(result.confidencePosture).toBe<UnifiedConfidencePosture>("stabilizing");
  });
});

// ─── 3. Contradicted surface ──────────────────────────────────────────────────

describe("contradicted surface", () => {
  it("returns contradicted posture when positioning is contradicted", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter(),
      customerReality: null,
      positioningNarrative: makePositioningNarrative({ posture: "contradicted" }),
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "focus",
    });
    expect(result.confidencePosture).toBe<UnifiedConfidencePosture>("contradicted");
  });

  it("returns perception_conflicts_emphasis state when positioning is contradicted", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter(),
      customerReality: null,
      positioningNarrative: makePositioningNarrative({ posture: "contradicted" }),
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "focus",
    });
    expect(result.centerStateKey).toBe<CenterStateKey>("perception_conflicts_emphasis");
  });

  it("returns contradicted posture when customer reality is contradicted", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter({ confidence: "high" }),
      customerReality: makeCustomerReality({ posture: "contradicted" }),
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "flow",
    });
    expect(result.confidencePosture).toBe<UnifiedConfidencePosture>("contradicted");
  });

  it("returns contradicted posture when lead route confidence is contradicted", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter({ confidence: "high" }),
      customerReality: makeCustomerReality({ posture: "grounded" }),
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: makeRationale({ confidenceLabel: "Contradicted by recent evidence" }),
      phase: "flow",
    });
    expect(result.confidencePosture).toBe<UnifiedConfidencePosture>("contradicted");
  });
});

// ─── 4. Center state derivation ───────────────────────────────────────────────

describe("center state derivation", () => {
  it("returns strategy_outrunning_proof when customer is directional and center is medium", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter({ confidence: "medium" }),
      customerReality: makeCustomerReality({ posture: "directional" }),
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "diagnose",
    });
    expect(result.centerStateKey).toBe<CenterStateKey>("strategy_outrunning_proof");
  });

  it("returns customer_validation_converging when customer is converging", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter(),
      customerReality: makeCustomerReality({ posture: "converging" }),
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "diagnose",
    });
    expect(result.centerStateKey).toBe<CenterStateKey>("customer_validation_converging");
  });

  it("returns customer_validation_converging when customer is grounded", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter(),
      customerReality: makeCustomerReality({ posture: "grounded" }),
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "focus",
    });
    expect(result.centerStateKey).toBe<CenterStateKey>("customer_validation_converging");
  });

  it("returns route_confidence_fragmented when more than half of routes are weakening or on hold", () => {
    const rationales = [
      makeRationale({ routeId: "r1", movement: "weaken" }),
      makeRationale({ routeId: "r2", readiness: "Hold" }),
      makeRationale({ routeId: "r3", movement: "strengthen" }),
    ];
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter(),
      customerReality: null,
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: rationales,
      leadRationale: null,
      phase: "focus",
    });
    expect(result.centerStateKey).toBe<CenterStateKey>("route_confidence_fragmented");
  });

  it("returns positioning_stabilizing when positioning is coherent and center is medium", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter({ confidence: "medium" }),
      customerReality: makeCustomerReality({ posture: "inferred" }),
      positioningNarrative: makePositioningNarrative({ posture: "coherent" }),
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "focus",
    });
    expect(result.centerStateKey).toBe<CenterStateKey>("positioning_stabilizing");
  });

  it("returns perception_conflicts_emphasis when center has meaningful divergence with public context", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter({
        publicContextLabel: "craft quality",
        hasMeaningfulDivergence: true,
      }),
      customerReality: null,
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "diagnose",
    });
    expect(result.centerStateKey).toBe<CenterStateKey>("perception_conflicts_emphasis");
  });

  it("positioning_stabilizing headline includes center.label", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter({ confidence: "medium", label: "partner outcomes" }),
      customerReality: makeCustomerReality({ posture: "inferred" }),
      positioningNarrative: makePositioningNarrative({ posture: "coherent" }),
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "focus",
    });
    expect(result.centerHeadline).toContain("partner outcomes");
  });
});

// ─── 5. Tension collection ────────────────────────────────────────────────────

describe("tension collection", () => {
  it("collects tensions from strategic center", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter({
        unresolvedTensions: ["Customer validation is lagging.", "Public perception conflicts."],
      }),
      customerReality: null,
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "diagnose",
    });
    expect(result.topTensions).toContain("Customer validation is lagging.");
  });

  it("limits topTensions to 2 items", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter({
        unresolvedTensions: ["Tension A.", "Tension B.", "Tension C."],
      }),
      customerReality: makeCustomerReality({
        conflicts: [{ description: "Customer conflict.", severity: "warning" }],
      }),
      positioningNarrative: makePositioningNarrative({
        tensions: [{ between: "X", and: "Y", description: "Positioning tension." }],
      }),
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "diagnose",
    });
    expect(result.topTensions.length).toBeLessThanOrEqual(2);
  });

  it("deduplicates tensions across layers", () => {
    const shared = "Customer validation is lagging.";
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter({ unresolvedTensions: [shared] }),
      customerReality: makeCustomerReality({
        conflicts: [{ description: shared, severity: "warning" }],
      }),
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "diagnose",
    });
    expect(result.topTensions.filter((t) => t === shared).length).toBe(1);
  });
});

// ─── 6. Contradiction and assumption detection ────────────────────────────────

describe("contradiction and assumption detection", () => {
  it("returns topContradiction from positioning tensions when posture is contradicted", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter(),
      customerReality: null,
      positioningNarrative: makePositioningNarrative({
        posture: "contradicted",
        tensions: [{ between: "Strategy", and: "Market", description: "Direction conflicts with market identity." }],
      }),
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "focus",
    });
    expect(result.topContradiction).toBe("Direction conflicts with market identity.");
  });

  it("returns biggestUnresolvedAssumption from customer unresolved", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter(),
      customerReality: makeCustomerReality({
        unresolved: ["Are customers really frustrated by reliability gaps?"],
      }),
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "diagnose",
    });
    expect(result.biggestUnresolvedAssumption).toBe("Are customers really frustrated by reliability gaps?");
  });

  it("does not repeat biggestUnresolvedAssumption if already in topTensions", () => {
    const shared = "Customer validation is lagging.";
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter({ unresolvedTensions: [shared] }),
      customerReality: makeCustomerReality({ unresolved: [shared] }),
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "diagnose",
    });
    expect(result.biggestUnresolvedAssumption).not.toBe(shared);
  });
});

// ─── 7. Lead route enrichment ─────────────────────────────────────────────────

describe("lead route enrichment", () => {
  it("returns null leadRoute when leadRationale is null", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter(),
      customerReality: null,
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "focus",
    });
    expect(result.leadRoute).toBeNull();
  });

  it("marks positioningCoherence as reinforces when route appears in reinforcing list", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter(),
      customerReality: null,
      positioningNarrative: makePositioningNarrative({
        reinforcingRoutes: [{
          routeId: "route-1",
          routeTitle: "Fix order reliability gaps",
          category: "fix",
          claimReinforced: "Operational reliability claim",
          tensionNavigated: null,
          coherenceSignal: "reinforces",
          displayLabel: "reinforces direction",
        }],
        contradictingRoutes: [],
      }),
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: makeRationale({ routeId: "route-1" }),
      phase: "focus",
    });
    expect(result.leadRoute?.positioningCoherence).toBe("reinforces");
  });

  it("marks positioningCoherence as weakens when route appears in contradicting list", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter(),
      customerReality: null,
      positioningNarrative: makePositioningNarrative({
        reinforcingRoutes: [],
        contradictingRoutes: [{
          routeId: "route-1",
          routeTitle: "Create new market channel",
          category: "create",
          claimReinforced: "Market expansion claim",
          tensionNavigated: null,
          coherenceSignal: "weakens",
          displayLabel: "weakens direction",
        }],
      }),
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: makeRationale({ routeId: "route-1" }),
      phase: "focus",
    });
    expect(result.leadRoute?.positioningCoherence).toBe("weakens");
  });

  it("marks contradictionPressure true when route readiness is Hold", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter(),
      customerReality: null,
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: makeRationale({ readiness: "Hold", movement: "remain_unresolved" }),
      phase: "focus",
    });
    expect(result.leadRoute?.contradictionPressure).toBe(true);
  });

  it("marks contradictionPressure true when route movement is weaken", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter(),
      customerReality: null,
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: makeRationale({ movement: "weaken" }),
      phase: "flow",
    });
    expect(result.leadRoute?.contradictionPressure).toBe(true);
  });

  it("marks confidencePosture as strong for validated signals", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter(),
      customerReality: null,
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: makeRationale({ confidenceLabel: "Supported by multiple validated signals" }),
      phase: "focus",
    });
    expect(result.leadRoute?.confidencePosture).toBe("strong");
  });

  it("marks confidencePosture as thin for highly uncertain routes", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter(),
      customerReality: null,
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: makeRationale({ confidenceLabel: "Still highly uncertain" }),
      phase: "focus",
    });
    expect(result.leadRoute?.confidencePosture).toBe("thin");
  });
});

// ─── 8. Phase attention items ─────────────────────────────────────────────────

describe("phase attention items", () => {
  it("pre_diagnosis surfaces public perception when center has publicContextLabel", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter({ publicContextLabel: "craft quality" }),
      customerReality: null,
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "outside_signals",
    });
    expect(result.phaseAttentionItems.some((item) => item.includes("craft quality"))).toBe(true);
  });

  it("pre_diagnosis surfaces customer lag when present", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter({ customerLag: true }),
      customerReality: null,
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "outside_signals",
    });
    expect(result.phaseAttentionItems.some((item) => item.toLowerCase().includes("customer"))).toBe(true);
  });

  it("diagnose surfaces customer grounding gap", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter(),
      customerReality: makeCustomerReality({ posture: "inferred" }),
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "diagnose",
    });
    expect(result.phaseAttentionItems.some((item) => item.toLowerCase().includes("customer"))).toBe(true);
  });

  it("focus surfaces contradiction pressure when lead route is on hold", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter(),
      customerReality: null,
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: makeRationale({ readiness: "Hold" }),
      phase: "focus",
    });
    expect(result.phaseAttentionItems.some((item) => item.toLowerCase().includes("route"))).toBe(true);
  });

  it("flow surfaces weakening lead route movement", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter(),
      customerReality: null,
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: makeRationale({ movement: "weaken" }),
      phase: "flow",
    });
    expect(result.phaseAttentionItems.some((item) => item.toLowerCase().includes("weakening"))).toBe(true);
  });

  it("limits phaseAttentionItems to 2", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter({ customerLag: true, publicContextLabel: "craft quality", hasMeaningfulDivergence: true }),
      customerReality: makeCustomerReality({ posture: "directional", unresolved: ["Question A.", "Question B.", "Question C."] }),
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "outside_signals",
    });
    expect(result.phaseAttentionItems.length).toBeLessThanOrEqual(2);
  });
});

// ─── 9. Fragmented surface ────────────────────────────────────────────────────

describe("fragmented confidence posture", () => {
  it("returns fragmented posture when customer reality is fragmented", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter({ confidence: "high" }),
      customerReality: makeCustomerReality({ posture: "fragmented" }),
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "focus",
    });
    expect(result.confidencePosture).toBe<UnifiedConfidencePosture>("fragmented");
  });
});

// ─── 10. State ranking — perception conflict does not always win ──────────────

function makePortfolio(overrides: Partial<DecisionPortfolio> = {}): DecisionPortfolio {
  return {
    portfolioState: "balanced",
    portfolioStateLabel: "Portfolio is balanced",
    portfolioNarrative: "Routes are balanced across commitment states.",
    portfolioNextMove: "Continue validating the lead route.",
    escalations: [],
    routes: [],
    commitCounts: {
      explore: 0, validate: 1, commit: 0, scale: 0, pause: 0, unwind: 0,
    },
    safeToCommit: [],
    tooEarly: ["Fix order reliability gaps"],
    blocked: [],
    converging: [],
    ...overrides,
  };
}

describe("perception conflict ranking — does not always win", () => {
  it("customer proof gap outranks public divergence", () => {
    // Public divergence is present, but customer proof gap is also present.
    // strategy_outrunning_proof should win.
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter({
        confidence: "medium",
        publicContextLabel: "craft quality",
        hasMeaningfulDivergence: true,
      }),
      customerReality: makeCustomerReality({ posture: "directional" }),
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "diagnose",
    });
    expect(result.centerStateKey).toBe<CenterStateKey>("strategy_outrunning_proof");
  });

  it("hard positioning contradiction still surfaces perception conflict (highest priority contradiction)", () => {
    // Hard contradiction (explicit contradicted posture) should still surface perception conflict
    // when no customer proof gap or fragmentation is present.
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter(),
      customerReality: makeCustomerReality({ posture: "inferred" }),
      positioningNarrative: makePositioningNarrative({ posture: "contradicted" }),
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "focus",
    });
    // customerReality.posture is "inferred" (not "directional"), so proof gap rule doesn't fire.
    // Hard contradiction at step 5 surfaces.
    expect(result.centerStateKey).toBe<CenterStateKey>("perception_conflicts_emphasis");
  });

  it("customer proof gap outranks hard positioning contradiction", () => {
    // Both customer proof gap AND positioning contradiction are present.
    // Proof gap (step 2) should outrank hard contradiction (step 5).
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter({ confidence: "medium" }),
      customerReality: makeCustomerReality({ posture: "directional" }),
      positioningNarrative: makePositioningNarrative({ posture: "contradicted" }),
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "diagnose",
    });
    expect(result.centerStateKey).toBe<CenterStateKey>("strategy_outrunning_proof");
  });

  it("public divergence surfaces only when no more decision-relevant state is present", () => {
    // No customer reality, no positioning contradiction, just divergence.
    // perception_conflicts_emphasis should surface as last resort before default.
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter({
        publicContextLabel: "craft quality",
        hasMeaningfulDivergence: true,
      }),
      customerReality: null,
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "diagnose",
    });
    expect(result.centerStateKey).toBe<CenterStateKey>("perception_conflicts_emphasis");
  });
});

// ─── 11. Decision portfolio pressure outranks perception conflict ─────────────

describe("decision portfolio pressure influences center state", () => {
  it("validation_heavy portfolio with no safe commit path surfaces strategy_outrunning_proof", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter({
        confidence: "medium",
        publicContextLabel: "craft quality",
        hasMeaningfulDivergence: true,
      }),
      customerReality: makeCustomerReality({ posture: "directional" }),
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "diagnose",
      decisionPortfolio: makePortfolio({
        portfolioState: "validation_heavy",
        safeToCommit: [],
        tooEarly: ["Fix order reliability gaps", "Improve partner onboarding"],
      }),
    });
    expect(result.centerStateKey).toBe<CenterStateKey>("strategy_outrunning_proof");
  });

  it("fragmented portfolio with no safe commit path and weak customer → route_confidence_fragmented", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter({
        confidence: "medium",
        publicContextLabel: "craft quality",
        hasMeaningfulDivergence: true,
      }),
      customerReality: makeCustomerReality({ posture: "grounded" }),
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "focus",
      decisionPortfolio: makePortfolio({
        portfolioState: "fragmented",
        safeToCommit: [],
        tooEarly: ["Fix order reliability gaps"],
      }),
    });
    // customer is "grounded" (not weak), so fragmented portfolio → route_confidence_fragmented
    expect(result.centerStateKey).toBe<CenterStateKey>("route_confidence_fragmented");
  });

  it("balanced portfolio with safe commits does not elevate conflict state", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter({
        confidence: "medium",
        publicContextLabel: "craft quality",
        hasMeaningfulDivergence: true,
      }),
      customerReality: null,
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "diagnose",
      decisionPortfolio: makePortfolio({
        portfolioState: "balanced",
        safeToCommit: ["Fix order reliability gaps"],
      }),
    });
    // Balanced portfolio with a safe commit — perception conflict surfaces normally at step 7.
    expect(result.centerStateKey).toBe<CenterStateKey>("perception_conflicts_emphasis");
  });
});

// ─── 12. Company-specific hero language ──────────────────────────────────────

describe("company-specific hero language", () => {
  it("strategy_outrunning_proof headline names the center when available", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter({ confidence: "medium", label: "partner reliability" }),
      customerReality: makeCustomerReality({ posture: "directional" }),
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: makeRationale({ mustBecomeTrue: "Partners confirm reliability is the key gap." }),
      phase: "diagnose",
    });
    expect(result.centerHeadline).toContain("partner reliability");
  });

  it("strategy_outrunning_proof headline falls back to center label without lead rationale", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter({ confidence: "medium", label: "strategic operating systems" }),
      customerReality: makeCustomerReality({ posture: "directional" }),
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "diagnose",
    });
    expect(result.centerHeadline).toContain("strategic operating systems");
  });

  it("perception_conflicts_emphasis headline names both public label and center label", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter({
        label: "donor impact visibility",
        publicContextLabel: "community outreach",
        hasMeaningfulDivergence: true,
        confidence: "medium",
      }),
      customerReality: null,
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "diagnose",
    });
    expect(result.centerHeadline).toContain("community outreach");
    expect(result.centerHeadline).toContain("donor impact visibility");
  });

  it("customer_validation_converging headline names the center when available", () => {
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter({ label: "operational reliability" }),
      customerReality: makeCustomerReality({ posture: "converging" }),
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: [],
      leadRationale: null,
      phase: "focus",
    });
    expect(result.centerHeadline).toContain("operational reliability");
  });

  it("route_confidence_fragmented headline names the center when available", () => {
    const rationales = [
      makeRationale({ routeId: "r1", movement: "weaken" }),
      makeRationale({ routeId: "r2", readiness: "Hold" }),
      makeRationale({ routeId: "r3", movement: "strengthen" }),
    ];
    const result = buildStrategicCenterSurface({
      strategicCenter: makeCenter({ label: "partner outcomes" }),
      customerReality: null,
      positioningNarrative: null,
      confidenceDomains: [],
      routeRationales: rationales,
      leadRationale: null,
      phase: "focus",
    });
    expect(result.centerHeadline).toContain("partner outcomes");
  });
});
