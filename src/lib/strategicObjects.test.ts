import { describe, expect, it } from "vitest";
import {
  CONFIDENCE_DOMAIN_TYPES,
  LENS_SUPPORTED_OBJECTS,
  LENS_TYPES,
  RELATIONSHIP_TYPES,
  SOURCE_AUTHORITY_WEIGHTS,
  isAssumption,
  isConfidenceDomain,
  isCustomerNeed,
  isHeroCapable,
  isLensCompatible,
  isMarketTension,
  isStrategicDirection,
  isStrategicRoute,
  isStrategicSignal,
  type Assumption,
  type ConfidenceDomain,
  type CustomerNeed,
  type LensType,
  type MarketTension,
  type OntologyObjectKind,
  type RelationshipType,
  type StrategicDirection,
  type StrategicOntologyObject,
  type StrategicObjectRelationship,
  type StrategicRoute,
  type StrategicSignal,
} from "@/lib/strategicObjects";

// ─── Relationship types ────────────────────────────────────────────────────────

describe("RELATIONSHIP_TYPES", () => {
  it("includes all required canonical relationship types", () => {
    const required: RelationshipType[] = [
      "realizes", "aligns_with", "addresses", "serves", "rests_on",
      "supports", "contradicts", "validates", "weakens",
      "unlocks", "depends_on", "reframes",
    ];
    for (const type of required) {
      expect(RELATIONSHIP_TYPES).toContain(type);
    }
  });

  it("includes reconciliation-specific relationship types as first-class members", () => {
    expect(RELATIONSHIP_TYPES).toContain("reconciles");
    expect(RELATIONSHIP_TYPES).toContain("diverges_from");
  });

  it("has 14 total relationship types", () => {
    expect(RELATIONSHIP_TYPES).toHaveLength(14);
  });
});

// ─── Lens types ─────────────────────────────────────────────────────────────────

describe("LENS_TYPES", () => {
  it("includes all 8 canonical lens types", () => {
    const expected: LensType[] = [
      "positioning",
      "customer_reality",
      "evidence",
      "validation",
      "strategy_cascade",
      "market_dynamics",
      "reconciliation",
      "confidence",
    ];
    for (const type of expected) {
      expect(LENS_TYPES).toContain(type);
    }
    expect(LENS_TYPES).toHaveLength(8);
  });

  it("has LENS_SUPPORTED_OBJECTS entries for every lens type", () => {
    for (const type of LENS_TYPES) {
      expect(LENS_SUPPORTED_OBJECTS).toHaveProperty(type);
      expect(Array.isArray(LENS_SUPPORTED_OBJECTS[type])).toBe(true);
      expect(LENS_SUPPORTED_OBJECTS[type].length).toBeGreaterThan(0);
    }
  });

  it("evidence lens can inspect all 7 object kinds", () => {
    const allKinds: OntologyObjectKind[] = [
      "strategic_direction", "strategic_route", "market_tension",
      "customer_need", "strategic_signal", "confidence_domain", "assumption",
    ];
    for (const kind of allKinds) {
      expect(isLensCompatible("evidence", kind)).toBe(true);
    }
  });

  it("reconciliation lens does not inspect strategic_signal or confidence_domain", () => {
    expect(isLensCompatible("reconciliation", "strategic_signal")).toBe(false);
    expect(isLensCompatible("reconciliation", "confidence_domain")).toBe(false);
  });

  it("positioning lens only inspects direction, route, and tension", () => {
    expect(isLensCompatible("positioning", "strategic_direction")).toBe(true);
    expect(isLensCompatible("positioning", "strategic_route")).toBe(true);
    expect(isLensCompatible("positioning", "market_tension")).toBe(true);
    expect(isLensCompatible("positioning", "customer_need")).toBe(false);
    expect(isLensCompatible("positioning", "assumption")).toBe(false);
  });
});

// ─── StrategicDirection shape and hero capability ──────────────────────────────

describe("StrategicDirection", () => {
  const direction: StrategicDirection = {
    _kind: "strategic_direction",
    id: "dir-001",
    companyId: "co-001",
    winningAspiration: "Become the operational backbone for specialty coffee operators.",
    whereToPlay: ["B2B specialty coffee operators", "Mid-market accounts"],
    howToWin: ["Reliability as a differentiator", "Outcome-based support model"],
    capabilities: ["Consistent quality at scale", "Partner success infrastructure"],
    lifecycle: "validated",
    setAt: "2026-01-15T00:00:00Z",
    narrative: {
      headline: "Operational backbone for specialty operators",
      summary: "The company is committing to reliability and partner outcomes as its core differentiator.",
      confidenceLabel: "moderate",
      evidenceShape: { outside: 3, organization: 5, customer: 2, market_validation: 1, supporting: 8, contradicting: 1, missing: 2 },
      phaseRelevance: ["foundation", "refine"],
      inspectable: true,
      sourceRefs: [],
    },
    hero: {
      heroCapable: true,
      supportedHeroModes: ["orientation"],
      defaultHeroMode: "orientation",
    },
  };

  it("has _kind = 'strategic_direction'", () => {
    expect(direction._kind).toBe("strategic_direction");
  });

  it("passes isStrategicDirection type guard", () => {
    expect(isStrategicDirection(direction)).toBe(true);
  });

  it("is hero-capable with orientation as default mode", () => {
    expect(direction.hero.heroCapable).toBe(true);
    expect(direction.hero.defaultHeroMode).toBe("orientation");
  });

  it("passes isHeroCapable", () => {
    expect(isHeroCapable(direction)).toBe(true);
  });

  it("does not pass isStrategicRoute guard", () => {
    expect(isStrategicRoute(direction as StrategicOntologyObject)).toBe(false);
  });
});

// ─── StrategicRoute shape and hero capability ──────────────────────────────────

describe("StrategicRoute", () => {
  const route: StrategicRoute = {
    _kind: "strategic_route",
    id: "route-001",
    companyId: "co-001",
    title: "Build a partner success program",
    category: "create",
    ptsValue: 12,
    effort: "high",
    whyThisMatters: [
      "Operators lack structured onboarding beyond initial sales.",
      "Repeat purchasing correlates with hands-on support in months 1–3.",
    ],
    steps: [{ id: "s1", title: "Define success metrics", status: "in_progress" }],
    evidence: [{ id: "e1", title: "Partner survey Q1 2026", status: "complete" }],
    frameworksUsed: ["JTBD", "ODI", "dify_mojo_analysis"],
    directionAlignment: "aligned",
    lifecycle: "active",
    narrative: {
      headline: "Create a partner success program",
      summary: "Operators are under-served in the post-sale phase. A structured program addresses the highest-opportunity need.",
      confidenceLabel: "strong",
      evidenceShape: { outside: 2, organization: 4, customer: 3, market_validation: 0, supporting: 7, contradicting: 0, missing: 1 },
      phaseRelevance: ["refine", "decision"],
      inspectable: true,
      sourceRefs: [],
    },
    hero: {
      heroCapable: true,
      supportedHeroModes: ["commitment", "action", "movement"],
      defaultHeroMode: "commitment",
    },
  };

  it("has _kind = 'strategic_route'", () => {
    expect(route._kind).toBe("strategic_route");
  });

  it("passes isStrategicRoute type guard", () => {
    expect(isStrategicRoute(route)).toBe(true);
  });

  it("is hero-capable with commitment as default mode", () => {
    expect(route.hero.heroCapable).toBe(true);
    expect(route.hero.defaultHeroMode).toBe("commitment");
    expect(route.hero.supportedHeroModes).toContain("action");
    expect(route.hero.supportedHeroModes).toContain("movement");
  });

  it("passes isHeroCapable", () => {
    expect(isHeroCapable(route)).toBe(true);
  });
});

// ─── Reconciliation as first-class relationship capability ─────────────────────

describe("reconciliation relationship support", () => {
  it("reconciles is a valid RelationshipType at runtime", () => {
    const type: RelationshipType = "reconciles";
    expect(RELATIONSHIP_TYPES).toContain(type);
  });

  it("diverges_from is a valid RelationshipType at runtime", () => {
    const type: RelationshipType = "diverges_from";
    expect(RELATIONSHIP_TYPES).toContain(type);
  });

  it("reconciliation is a valid LensType", () => {
    const type: LensType = "reconciliation";
    expect(LENS_TYPES).toContain(type);
  });

  it("a StrategicObjectRelationship can carry a ReconciliationFlag on reconciles type", () => {
    const rel: StrategicObjectRelationship = {
      id: "rel-001",
      type: "reconciles",
      fromId: "dir-001",
      fromKind: "strategic_direction",
      toId: "route-001",
      toKind: "strategic_route",
      strength: "moderate",
      state: "contested",
      lastEvaluatedAt: "2026-05-10T00:00:00Z",
      reconciliation: {
        conflictingObjectIds: ["dir-001", "sig-042"],
        conflictingObjectKinds: ["strategic_direction", "strategic_signal"],
        description: "Outside signal suggests different where-to-play than current direction.",
        authorityWeights: [0.7, 0.85],
        resolution: "pending",
      },
    };
    expect(rel.type).toBe("reconciles");
    expect(rel.reconciliation?.resolution).toBe("pending");
    expect(rel.reconciliation?.authorityWeights).toHaveLength(2);
  });
});

// ─── Remaining canonical object type guards ────────────────────────────────────

describe("remaining type guards", () => {
  const tension: MarketTension = {
    _kind: "market_tension",
    id: "ten-001", companyId: "co-001",
    label: "Operator onboarding gap",
    description: "Operators cannot get consistent results without hands-on setup support.",
    severity: 72, momentum: "intensifying", sourceLayer: "customer",
    lifecycle: "validated", detectedAt: "2026-03-01T00:00:00Z",
    narrative: { headline: "", summary: "", confidenceLabel: "moderate", evidenceShape: { outside: 0, organization: 0, customer: 0, market_validation: 0, supporting: 0, contradicting: 0, missing: 0 }, phaseRelevance: [], inspectable: true, sourceRefs: [] },
  };

  const need: CustomerNeed = {
    _kind: "customer_need",
    id: "need-001", companyId: "co-001",
    desiredOutcome: "Minimize time to dial in consistent extraction across batch variability.",
    importance: 8, satisfaction: 3, opportunityScore: 40,
    serviceState: "under_served",
    journeyKey: "customer", stepNumber: 5, stepLabel: "Execute onboarding",
    sourcePath: "partner-survey-q1-2026", sourceLayer: "customer",
    lifecycle: "validated",
    narrative: { headline: "", summary: "", confidenceLabel: "strong", evidenceShape: { outside: 0, organization: 0, customer: 0, market_validation: 0, supporting: 0, contradicting: 0, missing: 0 }, phaseRelevance: [], inspectable: true, sourceRefs: [] },
  };

  const signal: StrategicSignal = {
    _kind: "strategic_signal",
    id: "sig-001", companyId: "co-001",
    claim: "Partners who received hands-on setup support had 2.4× higher repeat rate in Q4.",
    sourceLayer: "customer", sourceType: "research",
    authorityWeight: SOURCE_AUTHORITY_WEIGHTS.customer,
    lifecycle: "active", ingestedAt: "2026-04-10T00:00:00Z",
    narrative: { headline: "", summary: "", confidenceLabel: "validated", evidenceShape: { outside: 0, organization: 0, customer: 0, market_validation: 0, supporting: 0, contradicting: 0, missing: 0 }, phaseRelevance: [], inspectable: false, sourceRefs: [] },
  };

  const domain: ConfidenceDomain = {
    _kind: "confidence_domain",
    id: "dom-001", companyId: "co-001",
    domainType: "customer_insight", label: "Customer Insight",
    score: 71, components: [], suppressorAssumptionIds: [],
    lifecycle: "stable", lastCalculatedAt: "2026-05-10T00:00:00Z",
    gapNarrative: "Add primary research interviews to raise this score.",
    narrative: { headline: "", summary: "", confidenceLabel: "moderate", evidenceShape: { outside: 0, organization: 0, customer: 0, market_validation: 0, supporting: 0, contradicting: 0, missing: 0 }, phaseRelevance: [], inspectable: true, sourceRefs: [] },
  };

  const assumption: Assumption = {
    _kind: "assumption",
    id: "asm-001", companyId: "co-001",
    statement: "Operators are willing to pay a premium for a structured success program.",
    status: "unvalidated", riskLevel: "high",
    riskDescription: "If false, the Create route has significantly weaker justification.",
    validationPath: "Run a price-sensitivity survey with 10 existing partners.",
    underliesKind: "strategic_route", underliesId: "route-001",
    lifecycle: "explicit",
    createdAt: "2026-04-01T00:00:00Z", updatedAt: "2026-05-01T00:00:00Z",
    narrative: { headline: "", summary: "", confidenceLabel: "low", evidenceShape: { outside: 0, organization: 0, customer: 0, market_validation: 0, supporting: 0, contradicting: 0, missing: 0 }, phaseRelevance: [], inspectable: true, sourceRefs: [] },
  };

  it("isMarketTension", () => { expect(isMarketTension(tension)).toBe(true); });
  it("isCustomerNeed", () => { expect(isCustomerNeed(need)).toBe(true); });
  it("isStrategicSignal", () => { expect(isStrategicSignal(signal)).toBe(true); });
  it("isConfidenceDomain", () => { expect(isConfidenceDomain(domain)).toBe(true); });
  it("isAssumption", () => { expect(isAssumption(assumption)).toBe(true); });

  it("signal authority weight matches SOURCE_AUTHORITY_WEIGHTS for customer layer", () => {
    expect(signal.authorityWeight).toBe(1.0);
  });

  it("MarketTension and CustomerNeed are not hero-capable", () => {
    expect(isHeroCapable(tension as StrategicOntologyObject)).toBe(false);
    expect(isHeroCapable(need as StrategicOntologyObject)).toBe(false);
  });
});

// ─── ConfidenceDomainType coverage ────────────────────────────────────────────

describe("CONFIDENCE_DOMAIN_TYPES", () => {
  it("defines exactly 5 canonical confidence domains", () => {
    expect(CONFIDENCE_DOMAIN_TYPES).toHaveLength(5);
  });

  it("includes all expected domain types", () => {
    expect(CONFIDENCE_DOMAIN_TYPES).toContain("customer_insight");
    expect(CONFIDENCE_DOMAIN_TYPES).toContain("strategy_cascade");
    expect(CONFIDENCE_DOMAIN_TYPES).toContain("market_dynamics");
    expect(CONFIDENCE_DOMAIN_TYPES).toContain("route_completeness");
    expect(CONFIDENCE_DOMAIN_TYPES).toContain("gtm_execution");
  });
});
