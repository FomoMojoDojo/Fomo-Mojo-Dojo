import { describe, expect, it } from "vitest";
import type { HypothesisProvenanceCard } from "@/hooks/useStrategicHypotheses";
import type { RouteRationale } from "@/lib/routeRationale";
import type { StrategicCenterSurface } from "@/lib/strategicCenterSurface";
import type { CustomerRealityNarrative } from "@/lib/customerRealityNarrative";
import type { PositioningLensNarrative } from "@/lib/positioningLensNarrative";
import type { DecisionPortfolio } from "@/lib/decisionSystem";
import { buildStrategicSignals, type SignalPolarity, type SignalMovement, type SignalPressure } from "./strategicSignals";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSurface(overrides: Partial<StrategicCenterSurface> = {}): StrategicCenterSurface {
  return {
    centerHeadline: "Direction is converging around operational reliability.",
    centerStateKey: "direction_cohering",
    centerStateLabel: "Direction cohering",
    confidencePosture: "directional",
    confidencePostureLabel: "Confidence is directional",
    topTensions: [],
    topContradiction: null,
    biggestUnresolvedAssumption: null,
    leadRoute: null,
    phaseAttentionItems: [],
    ...overrides,
  };
}

function makePortfolio(overrides: Partial<DecisionPortfolio> = {}): DecisionPortfolio {
  return {
    portfolioState: "balanced",
    portfolioStateLabel: "Portfolio is balanced",
    portfolioNarrative: "Routes are balanced.",
    portfolioNextMove: "Continue validating the lead route.",
    escalations: [],
    routes: [],
    commitCounts: { explore: 0, validate: 1, commit: 0, scale: 0, pause: 0, unwind: 0 },
    safeToCommit: [],
    tooEarly: [],
    blocked: [],
    converging: [],
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
    directionGrounding: "Direction is not grounded in validated customer behavior.",
    unresolved: [],
    conflicts: [],
    wouldResolve: [],
    ...overrides,
  };
}

function makePositioningNarrative(overrides: Partial<PositioningLensNarrative> = {}): PositioningLensNarrative {
  return {
    posture: "emerging",
    postureHeadline: "Positioning is stabilizing.",
    marketPerception: "A reliable operations partner.",
    intendedIdentity: "A trusted outcomes partner.",
    customerProofStatus: "partial",
    customerProofNote: "Some customer proof exists.",
    tensions: [],
    reinforcingRoutes: [],
    contradictingRoutes: [],
    wouldStrengthen: [],
    ...overrides,
  };
}

function makeHypothesis(overrides: Partial<HypothesisProvenanceCard["hypothesis"]> = {}): HypothesisProvenanceCard["hypothesis"] {
  return {
    id: "hyp-1",
    company_id: "co-1",
    hypothesis_key: "reliability_gap",
    statement: "Partner reliability is the primary driver of customer churn.",
    hypothesis_kind: "directional_hypothesis",
    hypothesis_state: "strengthened",
    topic: null,
    confidence: "medium",
    validation_state: "directional",
    what_must_be_true: [],
    source_run_id: null,
    reframed_from_hypothesis_id: null,
    is_active: true,
    raw_payload: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeHypothesisCard(
  hypothesisOverrides: Partial<HypothesisProvenanceCard["hypothesis"]> = {},
  cardOverrides: Partial<Omit<HypothesisProvenanceCard, "hypothesis">> = {},
): HypothesisProvenanceCard {
  return {
    hypothesis: makeHypothesis(hypothesisOverrides),
    supportingClaims: [],
    weakeningClaims: [],
    latestEventAt: null,
    ...cardOverrides,
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
    whatSupportsIt: "Internal data supports the direction.",
    uncertainty: "Customer signal is still missing.",
    mustBecomeTrue: "Customers confirm reliability is the top frustration.",
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

// ─── 1. Duplicate-center suppression ─────────────────────────────────────────

describe("duplicate-center suppression", () => {
  it("suppresses a hypothesis statement that highly overlaps the center headline", () => {
    const overlappingStatement =
      "Direction is cohering around operational reliability and quality.";
    const result = buildStrategicSignals({
      hypotheses: [makeHypothesisCard({ statement: overlappingStatement, hypothesis_state: "strengthened" })],
      routeRationales: [],
      surface: makeSurface({ centerHeadline: "Direction is converging around operational reliability." }),
      customerReality: null,
      positioningNarrative: null,
      portfolio: makePortfolio(),
      phase: "diagnose",
    });
    const allStatements = result.groups.flatMap((g) => g.signals.map((s) => s.statement));
    expect(allStatements).not.toContain(overlappingStatement);
  });

  it("does not suppress a hypothesis statement with low overlap to the center headline", () => {
    const distinctStatement = "Partner onboarding delays are causing silent churn.";
    const result = buildStrategicSignals({
      hypotheses: [makeHypothesisCard({ statement: distinctStatement, hypothesis_state: "strengthened" })],
      routeRationales: [],
      surface: makeSurface({ centerHeadline: "Direction is converging around operational reliability." }),
      customerReality: null,
      positioningNarrative: null,
      portfolio: makePortfolio(),
      phase: "diagnose",
    });
    const allStatements = result.groups.flatMap((g) => g.signals.map((s) => s.statement));
    expect(allStatements).toContain(distinctStatement);
  });

  it("deduplicates identical statements across signal sources", () => {
    const sharedStatement = "Customer validation is missing.";
    const result = buildStrategicSignals({
      hypotheses: [
        makeHypothesisCard({ id: "h1", statement: sharedStatement, hypothesis_state: "strengthened" }),
        makeHypothesisCard({ id: "h2", statement: sharedStatement, hypothesis_state: "emerging" }),
      ],
      routeRationales: [],
      surface: makeSurface({ centerHeadline: "Something completely different." }),
      customerReality: null,
      positioningNarrative: null,
      portfolio: makePortfolio(),
      phase: "diagnose",
    });
    const matching = result.groups
      .flatMap((g) => g.signals)
      .filter((s) => s.statement === sharedStatement);
    expect(matching.length).toBeLessThanOrEqual(1);
  });
});

// ─── 2. Conflicting signal grouping ──────────────────────────────────────────

describe("conflicting signal grouping", () => {
  it("places contradicted hypothesis in the Conflicting group", () => {
    const result = buildStrategicSignals({
      hypotheses: [makeHypothesisCard({ hypothesis_state: "contradicted", statement: "Buyer urgency is declining." })],
      routeRationales: [],
      surface: makeSurface({ centerHeadline: "Something unrelated." }),
      customerReality: null,
      positioningNarrative: null,
      portfolio: makePortfolio(),
      phase: "diagnose",
    });
    const conflictGroup = result.groups.find((g) => g.polarity === "contradictory");
    expect(conflictGroup).toBeDefined();
    expect(conflictGroup!.signals.length).toBeGreaterThan(0);
  });

  it("places contradicted positioning in the Conflicting group", () => {
    const result = buildStrategicSignals({
      hypotheses: [],
      routeRationales: [],
      surface: makeSurface({ centerHeadline: "Something unrelated." }),
      customerReality: null,
      positioningNarrative: makePositioningNarrative({
        posture: "contradicted",
        tensions: [{ between: "Strategy", and: "Market", description: "Market still reads as a craft shop." }],
      }),
      portfolio: makePortfolio(),
      phase: "focus",
    });
    const conflictGroup = result.groups.find((g) => g.polarity === "contradictory");
    expect(conflictGroup).toBeDefined();
    expect(conflictGroup!.signals[0].statement).toContain("craft shop");
  });

  it("hasConflictingSignals is true when weakening signals exist", () => {
    const result = buildStrategicSignals({
      hypotheses: [makeHypothesisCard({ hypothesis_state: "contradicted", statement: "Buyers are becoming price-sensitive." })],
      routeRationales: [],
      surface: makeSurface({ centerHeadline: "Entirely different direction." }),
      customerReality: null,
      positioningNarrative: null,
      portfolio: makePortfolio(),
      phase: "diagnose",
    });
    expect(result.hasConflictingSignals).toBe(true);
  });
});

// ─── 3. Movement-state derivation ────────────────────────────────────────────

describe("movement-state derivation", () => {
  it("strengthened hypothesis → movement: strengthening", () => {
    const result = buildStrategicSignals({
      hypotheses: [makeHypothesisCard({ hypothesis_state: "strengthened", statement: "Unique signal A." })],
      routeRationales: [],
      surface: makeSurface({ centerHeadline: "Completely different." }),
      customerReality: null,
      positioningNarrative: null,
      portfolio: makePortfolio(),
      phase: "diagnose",
    });
    const sig = result.groups.flatMap((g) => g.signals).find((s) => s.id.startsWith("hyp-"));
    expect(sig?.movement).toBe<SignalMovement>("strengthening");
  });

  it("emerging hypothesis → movement: emerging", () => {
    const result = buildStrategicSignals({
      hypotheses: [makeHypothesisCard({ hypothesis_state: "emerging", statement: "Unique signal B." })],
      routeRationales: [],
      surface: makeSurface({ centerHeadline: "Completely different." }),
      customerReality: null,
      positioningNarrative: null,
      portfolio: makePortfolio(),
      phase: "diagnose",
    });
    const sig = result.groups.flatMap((g) => g.signals).find((s) => s.id.startsWith("hyp-"));
    expect(sig?.movement).toBe<SignalMovement>("emerging");
  });

  it("contradicted hypothesis → movement: weakening", () => {
    const result = buildStrategicSignals({
      hypotheses: [makeHypothesisCard({ hypothesis_state: "contradicted", statement: "Unique signal C." })],
      routeRationales: [],
      surface: makeSurface({ centerHeadline: "Completely different." }),
      customerReality: null,
      positioningNarrative: null,
      portfolio: makePortfolio(),
      phase: "diagnose",
    });
    const sig = result.groups.flatMap((g) => g.signals).find((s) => s.id.startsWith("hyp-"));
    expect(sig?.movement).toBe<SignalMovement>("weakening");
  });

  it("inferred tension hypothesis → movement: unresolved", () => {
    const result = buildStrategicSignals({
      hypotheses: [makeHypothesisCard({
        hypothesis_state: "inferred",
        hypothesis_kind: "inferred_tension",
        statement: "Tension between scale and craft.",
      })],
      routeRationales: [],
      surface: makeSurface({ centerHeadline: "Completely different." }),
      customerReality: null,
      positioningNarrative: null,
      portfolio: makePortfolio(),
      phase: "diagnose",
    });
    const sig = result.groups.flatMap((g) => g.signals).find((s) => s.id.startsWith("hyp-"));
    expect(sig?.movement).toBe<SignalMovement>("unresolved");
  });
});

// ─── 4. Pressure escalation visibility ───────────────────────────────────────

describe("pressure escalation visibility", () => {
  it("high-confidence hypothesis → pressure: high", () => {
    const result = buildStrategicSignals({
      hypotheses: [makeHypothesisCard({ confidence: "high", hypothesis_state: "strengthened", statement: "Signal D unique." })],
      routeRationales: [],
      surface: makeSurface({ centerHeadline: "Completely different." }),
      customerReality: null,
      positioningNarrative: null,
      portfolio: makePortfolio(),
      phase: "diagnose",
    });
    const sig = result.groups.flatMap((g) => g.signals).find((s) => s.id.startsWith("hyp-"));
    expect(sig?.pressure).toBe<SignalPressure>("high");
  });

  it("low-confidence hypothesis → pressure: low", () => {
    const result = buildStrategicSignals({
      hypotheses: [makeHypothesisCard({ confidence: "low", hypothesis_state: "emerging", statement: "Signal E unique." })],
      routeRationales: [],
      surface: makeSurface({ centerHeadline: "Completely different." }),
      customerReality: null,
      positioningNarrative: null,
      portfolio: makePortfolio(),
      phase: "diagnose",
    });
    const sig = result.groups.flatMap((g) => g.signals).find((s) => s.id.startsWith("hyp-"));
    expect(sig?.pressure).toBe<SignalPressure>("low");
  });

  it("portfolio escalation warning → pressure: high and polarity: contradictory", () => {
    const result = buildStrategicSignals({
      hypotheses: [],
      routeRationales: [],
      surface: makeSurface({ centerHeadline: "Completely different." }),
      customerReality: null,
      positioningNarrative: null,
      portfolio: makePortfolio({
        escalations: [{
          title: "Route committed with weak center",
          detail: "The lead route is committed but the center confidence is still low.",
          severity: "warning",
          routeIds: ["route-1"],
        }],
      }),
      phase: "focus",
    });
    const conflictGroup = result.groups.find((g) => g.polarity === "contradictory");
    expect(conflictGroup).toBeDefined();
    expect(conflictGroup!.signals[0].pressure).toBe<SignalPressure>("high");
  });
});

// ─── 5. Signal compression ranking ───────────────────────────────────────────

describe("signal compression ranking", () => {
  it("limits total signals to 8", () => {
    const hypotheses = Array.from({ length: 12 }, (_, i) =>
      makeHypothesisCard({ id: `h${i}`, statement: `Unique signal statement number ${i} here.`, hypothesis_state: "strengthened" }),
    );
    const result = buildStrategicSignals({
      hypotheses,
      routeRationales: [],
      surface: makeSurface({ centerHeadline: "Completely different from all signals." }),
      customerReality: null,
      positioningNarrative: null,
      portfolio: makePortfolio(),
      phase: "diagnose",
    });
    expect(result.totalCount).toBeLessThanOrEqual(8);
  });

  it("limits signals per group to 3", () => {
    const hypotheses = Array.from({ length: 5 }, (_, i) =>
      makeHypothesisCard({ id: `h${i}`, statement: `Partner reliability issue ${i} is a known problem.`, hypothesis_state: "strengthened" }),
    );
    const result = buildStrategicSignals({
      hypotheses,
      routeRationales: [],
      surface: makeSurface({ centerHeadline: "Completely different from all signals." }),
      customerReality: null,
      positioningNarrative: null,
      portfolio: makePortfolio(),
      phase: "diagnose",
    });
    for (const group of result.groups) {
      expect(group.signals.length).toBeLessThanOrEqual(3);
    }
  });

  it("high-pressure signals rank before low-pressure in the same group", () => {
    const hypotheses = [
      makeHypothesisCard({ id: "h-low", confidence: "low", hypothesis_state: "strengthened", statement: "Low confidence signal about market trends." }),
      makeHypothesisCard({ id: "h-high", confidence: "high", hypothesis_state: "strengthened", statement: "High confidence signal about buyer behavior shift." }),
    ];
    const result = buildStrategicSignals({
      hypotheses,
      routeRationales: [],
      surface: makeSurface({ centerHeadline: "Completely different." }),
      customerReality: null,
      positioningNarrative: null,
      portfolio: makePortfolio(),
      phase: "diagnose",
    });
    const reinforcing = result.groups.find((g) => g.polarity === "reinforcing");
    if (reinforcing && reinforcing.signals.length >= 2) {
      expect(reinforcing.signals[0].pressure).toBe("high");
    }
  });
});

// ─── 6. Blocked-route signals ─────────────────────────────────────────────────

describe("blocked-route signals", () => {
  it("portfolio with blocked routes produces a Blocked group signal", () => {
    const result = buildStrategicSignals({
      hypotheses: [],
      routeRationales: [],
      surface: makeSurface({ centerHeadline: "Completely different." }),
      customerReality: null,
      positioningNarrative: null,
      portfolio: makePortfolio({
        blocked: ["Fix order reliability gaps"],
      }),
      phase: "focus",
    });
    const blockedGroup = result.groups.find((g) => g.polarity === "blocked");
    expect(blockedGroup).toBeDefined();
    expect(blockedGroup!.signals[0].statement).toContain("Fix order reliability gaps");
    expect(result.hasBlockingSignals).toBe(true);
  });

  it("portfolio with multiple blocked routes names them in the signal", () => {
    const result = buildStrategicSignals({
      hypotheses: [],
      routeRationales: [],
      surface: makeSurface({ centerHeadline: "Completely different." }),
      customerReality: null,
      positioningNarrative: null,
      portfolio: makePortfolio({
        blocked: ["Fix order reliability gaps", "Improve partner onboarding", "Create market channel"],
      }),
      phase: "focus",
    });
    const blockedGroup = result.groups.find((g) => g.polarity === "blocked");
    expect(blockedGroup).toBeDefined();
    expect(blockedGroup!.signals[0].statement).toMatch(/\d+ routes are blocked/);
  });
});

// ─── 7. Reinforcing-route signals ─────────────────────────────────────────────

describe("reinforcing-route signals", () => {
  it("portfolio with safeToCommit routes produces an Accelerating group signal", () => {
    const result = buildStrategicSignals({
      hypotheses: [],
      routeRationales: [],
      surface: makeSurface({ centerHeadline: "Completely different." }),
      customerReality: null,
      positioningNarrative: null,
      portfolio: makePortfolio({
        safeToCommit: ["Fix order reliability gaps"],
      }),
      phase: "focus",
    });
    const accelGroup = result.groups.find((g) => g.polarity === "accelerating");
    expect(accelGroup).toBeDefined();
    expect(accelGroup!.signals[0].statement).toContain("Fix order reliability gaps");
  });

  it("grounded customer reality produces a reinforcing signal with high pressure", () => {
    const result = buildStrategicSignals({
      hypotheses: [],
      routeRationales: [],
      surface: makeSurface({ centerHeadline: "Completely different." }),
      customerReality: makeCustomerReality({ posture: "grounded" }),
      positioningNarrative: null,
      portfolio: makePortfolio(),
      phase: "focus",
    });
    const reinforcingGroup = result.groups.find((g) => g.polarity === "reinforcing");
    expect(reinforcingGroup).toBeDefined();
    const sig = reinforcingGroup!.signals.find((s) => s.id === "cr-grounded");
    expect(sig?.pressure).toBe<SignalPressure>("high");
  });
});

// ─── 8. Unresolved validation signals ────────────────────────────────────────

describe("unresolved validation signals", () => {
  it("candidate_assumption hypothesis → Unresolved group", () => {
    const result = buildStrategicSignals({
      hypotheses: [makeHypothesisCard({
        hypothesis_kind: "candidate_assumption",
        hypothesis_state: "inferred",
        statement: "Buyers prioritize predictability over cost.",
      })],
      routeRationales: [],
      surface: makeSurface({ centerHeadline: "Completely different." }),
      customerReality: null,
      positioningNarrative: null,
      portfolio: makePortfolio(),
      phase: "diagnose",
    });
    const unresolvedGroup = result.groups.find((g) => g.polarity === "unresolved");
    expect(unresolvedGroup).toBeDefined();
    expect(unresolvedGroup!.signals.length).toBeGreaterThan(0);
  });

  it("inferred customer reality → Unresolved group with high pressure", () => {
    const result = buildStrategicSignals({
      hypotheses: [],
      routeRationales: [],
      surface: makeSurface({ centerHeadline: "Completely different." }),
      customerReality: makeCustomerReality({ posture: "inferred" }),
      positioningNarrative: null,
      portfolio: makePortfolio(),
      phase: "diagnose",
    });
    const unresolvedGroup = result.groups.find((g) => g.polarity === "unresolved");
    expect(unresolvedGroup).toBeDefined();
    const sig = unresolvedGroup!.signals.find((s) => s.id === "cr-inferred");
    expect(sig?.pressure).toBe<SignalPressure>("high");
  });
});
