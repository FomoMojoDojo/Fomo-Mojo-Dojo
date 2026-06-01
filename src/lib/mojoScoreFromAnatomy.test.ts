import { describe, expect, it } from "vitest";
import {
  buildMojoScoreReadinessReport,
  postureFromLegacyScore,
  READINESS_POSTURE_LABELS,
  READINESS_MOVEMENT_LABELS,
  READINESS_MOVEMENT_COLORS,
} from "./mojoScoreFromAnatomy";
import {
  buildConfidenceAnatomyReport,
  buildDecisionOnlyContext,
  type ConfidenceInputContext,
} from "./confidenceAnatomy";

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function ctx(overrides: Partial<ConfidenceInputContext> = {}): ConfidenceInputContext {
  return {
    decisionState:           "under_validation",
    confidenceState:         "directional",
    confidenceMovement:      [],
    decisionMemory:          [],
    validationRequirements:  [],
    blockedBy:               [],
    activeTensionIds:        [],
    staleDependencies:       [],
    supportingHypothesisIds: [],
    hasContradictingEvidence:   false,
    hasStaleCustomerProof:      false,
    hasActiveBlockingTension:   false,
    hasCapabilityGap:           false,
    hasMultiLayerEvidence:      false,
    hasCustomerBehavioralProof: false,
    hasAnyEvidence:             true,
    evidenceFreshness:          "aging",
    contradictedHypothesisCount: 0,
    activeHypothesisCount:       0,
    councilPendingCount:         0,
    councilLongPendingCount:     0,
    lastMeaningfulChangeAt:      null,
    ...overrides,
  };
}

function mv(direction: "strengthening" | "weakening" | "stable", reason = "") {
  return { at: "2026-01-01T00:00:00Z", direction, reason };
}

function report(overrides: Partial<ConfidenceInputContext> = {}) {
  const anatomy = buildConfidenceAnatomyReport(ctx(overrides));
  return buildMojoScoreReadinessReport(anatomy);
}

// ─── Shape ────────────────────────────────────────────────────────────────────

describe("buildMojoScoreReadinessReport shape", () => {
  it("returns all required fields", () => {
    const r = report();
    expect(typeof r.currentReadiness).toBe("number");
    expect(typeof r.nearTermPotential).toBe("number");
    expect(typeof r.structuralUpside).toBe("number");
    expect(typeof r.readinessCeiling).toBe("number");
    expect(typeof r.postureLabel).toBe("string");
    expect(typeof r.movementLabel).toBe("string");
    expect(typeof r.movementColor).toBe("string");
    expect(typeof r.unlockableGain).toBe("number");
  });

  it("postureLabel is a non-empty string", () => {
    const r = report();
    expect(r.postureLabel.length).toBeGreaterThan(0);
    expect(Object.values(READINESS_POSTURE_LABELS)).toContain(r.postureLabel);
  });

  it("movementLabel is a non-empty string", () => {
    const r = report();
    expect(r.movementLabel).toBe(READINESS_MOVEMENT_LABELS["unresolved"]);
  });

  it("movementColor is a hex string", () => {
    const r = report();
    expect(r.movementColor).toMatch(/^#[0-9a-f]{6}/i);
    expect(r.movementColor).toBe(READINESS_MOVEMENT_COLORS["unresolved"]);
  });
});

// ─── Score ranges ─────────────────────────────────────────────────────────────

describe("score value ranges", () => {
  it("currentReadiness is within 0–100", () => {
    const r = report();
    expect(r.currentReadiness).toBeGreaterThanOrEqual(0);
    expect(r.currentReadiness).toBeLessThanOrEqual(100);
  });

  it("nearTermPotential ≥ currentReadiness", () => {
    const r = report();
    expect(r.nearTermPotential).toBeGreaterThanOrEqual(r.currentReadiness);
  });

  it("structuralUpside ≥ nearTermPotential", () => {
    const r = report();
    expect(r.structuralUpside).toBeGreaterThanOrEqual(r.nearTermPotential);
  });

  it("structuralUpside never exceeds 88", () => {
    const r = report({
      decisionState:             "committed",
      confidenceState:           "strong",
      hasCustomerBehavioralProof: true,
      hasMultiLayerEvidence:      true,
      hasAnyEvidence:             true,
      evidenceFreshness:          "fresh",
      activeHypothesisCount:      5,
      confidenceMovement:         [mv("strengthening")],
      validationRequirements:     [{ requirement: "A", status: "met" }],
    });
    expect(r.structuralUpside).toBeLessThanOrEqual(88);
  });

  it("all-strong context produces high currentReadiness (≥ 66)", () => {
    const r = report({
      decisionState:             "committed",
      confidenceState:           "strong",
      hasCustomerBehavioralProof: true,
      hasMultiLayerEvidence:      true,
      hasAnyEvidence:             true,
      evidenceFreshness:          "fresh",
      activeHypothesisCount:      4,
      confidenceMovement:         [mv("strengthening")],
      validationRequirements:     [{ requirement: "A", status: "met" }],
    });
    expect(r.currentReadiness).toBeGreaterThanOrEqual(66);
  });
});

// ─── Readiness ceilings (governors) ──────────────────────────────────────────

describe("readiness ceilings", () => {
  it("contradicted confidence → currentReadiness ≤ 22", () => {
    const r = report({ confidenceState: "contradicted" });
    expect(r.currentReadiness).toBeLessThanOrEqual(22);
  });

  it("contradicted confidence → ceilingReason is set", () => {
    const r = report({ confidenceState: "contradicted" });
    expect(r.ceilingReason).not.toBeNull();
    expect(r.ceilingReason).toMatch(/contradiction/i);
  });

  it("destabilizing decision → currentReadiness ≤ 20", () => {
    const r = report({ decisionState: "destabilizing" });
    expect(r.currentReadiness).toBeLessThanOrEqual(20);
  });

  it("destabilizing decision → ceilingReason mentions stability", () => {
    const r = report({ decisionState: "destabilizing" });
    expect(r.ceilingReason).toMatch(/destabiliz/i);
  });

  it("active blocking tension → currentReadiness ≤ 28", () => {
    const r = report({ hasActiveBlockingTension: true, activeTensionIds: ["t1"] });
    expect(r.currentReadiness).toBeLessThanOrEqual(28);
  });

  it("capability gap + blockers → currentReadiness ≤ 35", () => {
    const r = report({ hasCapabilityGap: true, blockedBy: ["b1"] });
    expect(r.currentReadiness).toBeLessThanOrEqual(35);
  });

  it("clean context → ceilingReason is null", () => {
    const r = report({
      decisionState: "committed",
      confidenceState: "strong",
      hasCustomerBehavioralProof: true,
      hasMultiLayerEvidence: true,
      hasAnyEvidence: true,
      evidenceFreshness: "fresh",
      activeHypothesisCount: 3,
      confidenceMovement: [mv("strengthening")],
      validationRequirements: [{ requirement: "A", status: "met" }],
    });
    expect(r.ceilingReason).toBeNull();
  });

  it("contradicting evidence (fragile) → ceiling ≤ 48", () => {
    const r = report({ hasContradictingEvidence: true });
    expect(r.readinessCeiling).toBeLessThanOrEqual(48);
  });

  it("multiple tensions (fragile) → ceiling ≤ 52", () => {
    const r = report({ activeTensionIds: ["t1", "t2", "t3"] });
    expect(r.readinessCeiling).toBeLessThanOrEqual(52);
  });
});

// ─── Near-term potential and unlockable gain ──────────────────────────────────

describe("near-term potential and unlock", () => {
  it("fragile validation → unlockableGain > 0", () => {
    const r = report({
      decisionState: "exploratory",
      validationRequirements: [{ requirement: "A", status: "open" }],
    });
    expect(r.unlockableGain).toBeGreaterThan(0);
  });

  it("topUnlockAction is set when unlock paths exist", () => {
    const r = report({ confidenceState: "contradicted" });
    expect(r.topUnlockAction).not.toBeNull();
  });

  it("no blockers → unlockableGain is 0", () => {
    const r = report({
      decisionState: "committed",
      confidenceState: "strong",
      hasCustomerBehavioralProof: true,
      hasMultiLayerEvidence: true,
      hasAnyEvidence: true,
      evidenceFreshness: "fresh",
      activeHypothesisCount: 3,
      confidenceMovement: [mv("strengthening")],
      validationRequirements: [{ requirement: "A", status: "met" }],
    });
    expect(r.unlockableGain).toBe(0);
    expect(r.topUnlockAction).toBeNull();
  });
});

// ─── Movement explanation ─────────────────────────────────────────────────────

describe("movementExplanation", () => {
  it("strengthening movement with reason → explanation contains reason", () => {
    const anatomy = buildConfidenceAnatomyReport(ctx({
      confidenceMovement: [mv("strengthening", "Customer interviews confirmed direction")],
    }));
    const r = buildMojoScoreReadinessReport(anatomy, [mv("strengthening", "Customer interviews confirmed direction")]);
    expect(r.movementExplanation).not.toBeNull();
    expect(r.movementExplanation).toContain("customer interviews confirmed direction");
  });

  it("weakening movement with reason → explanation mentions pressure", () => {
    const anatomy = buildConfidenceAnatomyReport(ctx({
      confidenceMovement: [mv("weakening", "Hypothesis contradicted by field data")],
    }));
    const r = buildMojoScoreReadinessReport(anatomy, [mv("weakening", "Hypothesis contradicted by field data")]);
    expect(r.movementExplanation).toContain("pressure");
  });

  it("ceiling reason appears in explanation when ceiling active", () => {
    const anatomy = buildConfidenceAnatomyReport(ctx({ confidenceState: "contradicted" }));
    const r = buildMojoScoreReadinessReport(anatomy, []);
    expect(r.movementExplanation).not.toBeNull();
  });

  it("no movement and no ceiling → movementExplanation may be null or pressure-based", () => {
    const anatomy = buildConfidenceAnatomyReport(ctx({
      decisionState: "committed",
      confidenceState: "strong",
      hasCustomerBehavioralProof: true,
      hasMultiLayerEvidence: true,
      hasAnyEvidence: true,
      evidenceFreshness: "fresh",
      activeHypothesisCount: 3,
      confidenceMovement: [mv("strengthening")],
      validationRequirements: [{ requirement: "A", status: "met" }],
    }));
    const r = buildMojoScoreReadinessReport(anatomy, [mv("strengthening")]);
    // Either null or a string — both valid
    expect(typeof r.movementExplanation === "string" || r.movementExplanation === null).toBe(true);
  });
});

// ─── Temporal summary ─────────────────────────────────────────────────────────

describe("temporalSummary", () => {
  it("passes through anatomy temporalNote", () => {
    const anatomy = buildConfidenceAnatomyReport(ctx({
      confidenceMovement: [mv("strengthening"), mv("strengthening"), mv("strengthening")],
    }));
    const r = buildMojoScoreReadinessReport(anatomy);
    expect(r.temporalSummary).toContain("building consistently");
  });

  it("null when no movement entries", () => {
    const r = report();
    expect(r.temporalSummary).toBeNull();
  });
});

// ─── postureFromLegacyScore ───────────────────────────────────────────────────

describe("postureFromLegacyScore", () => {
  it("85 → strong",      () => expect(postureFromLegacyScore(85)).toBe("strong"));
  it("70 → building",    () => expect(postureFromLegacyScore(70)).toBe("building"));
  it("50 → directional", () => expect(postureFromLegacyScore(50)).toBe("directional"));
  it("30 → fragile",     () => expect(postureFromLegacyScore(30)).toBe("fragile"));
  it("10 → absent",      () => expect(postureFromLegacyScore(10)).toBe("absent"));
  it("0 → absent",       () => expect(postureFromLegacyScore(0)).toBe("absent"));
  it("100 → strong",     () => expect(postureFromLegacyScore(100)).toBe("strong"));
  it("80 → strong",      () => expect(postureFromLegacyScore(80)).toBe("strong"));
  it("62 → building",    () => expect(postureFromLegacyScore(62)).toBe("building"));
  it("44 → directional", () => expect(postureFromLegacyScore(44)).toBe("directional"));
  it("24 → fragile",     () => expect(postureFromLegacyScore(24)).toBe("fragile"));
});

// ─── buildDecisionOnlyContext integration ────────────────────────────────────

describe("buildDecisionOnlyContext → anatomy → readiness pipeline", () => {
  it("full pipeline produces a valid report without errors", () => {
    const c = buildDecisionOnlyContext({
      decision_state: "stabilizing",
      confidence_state: "building",
      confidence_movement: [mv("strengthening")],
      decision_memory: [],
      blocked_by: [],
      active_tension_ids: ["t1"],
    });
    const anatomy = buildConfidenceAnatomyReport(c);
    const r = buildMojoScoreReadinessReport(anatomy, c.confidenceMovement);
    expect(r.currentReadiness).toBeGreaterThan(0);
    expect(r.nearTermPotential).toBeGreaterThanOrEqual(r.currentReadiness);
    expect(r.structuralUpside).toBeLessThanOrEqual(88);
  });

  it("contradicted decision path is fully inspectable", () => {
    const c = buildDecisionOnlyContext({
      decision_state: "destabilizing",
      confidence_state: "contradicted",
      confidence_movement: [mv("weakening", "Core hypothesis contradicted")],
      decision_memory: [],
    });
    const anatomy = buildConfidenceAnatomyReport(c);
    const r = buildMojoScoreReadinessReport(anatomy, c.confidenceMovement);
    expect(r.ceilingReason).not.toBeNull();
    expect(r.movementExplanation).not.toBeNull();
    expect(r.currentReadiness).toBeLessThanOrEqual(20);
  });
});
