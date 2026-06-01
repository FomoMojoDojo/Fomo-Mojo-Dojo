import { describe, expect, it } from "vitest";
import {
  buildConfidenceAnatomyReport,
  buildDecisionOnlyContext,
  buildDecompositionNarrative,
  buildTemporalNote,
  deriveUnlockPaths,
  isPostureAtRisk,
  POSTURE_RANK,
  type ConfidenceInputContext,
  type ConfidenceDimension,
  type ConfidencePosture,
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
    hasContradictingEvidence:  false,
    hasStaleCustomerProof:     false,
    hasActiveBlockingTension:  false,
    hasCapabilityGap:          false,
    hasMultiLayerEvidence:     false,
    hasCustomerBehavioralProof: false,
    hasAnyEvidence:            true,
    evidenceFreshness:         "aging",
    contradictedHypothesisCount: 0,
    activeHypothesisCount:       0,
    councilPendingCount:         0,
    councilLongPendingCount:     0,
    lastMeaningfulChangeAt:      null,
    ...overrides,
  };
}

function mv(direction: "strengthening" | "weakening" | "stable", at = "2026-01-01T00:00:00Z") {
  return { at, direction, reason: "" };
}

// ─── buildConfidenceAnatomyReport — overall ───────────────────────────────────

describe("buildConfidenceAnatomyReport", () => {
  it("always returns 10 dimensions", () => {
    const report = buildConfidenceAnatomyReport(ctx());
    expect(report.dimensions).toHaveLength(10);
  });

  it("always returns 3 readiness layers", () => {
    const report = buildConfidenceAnatomyReport(ctx());
    expect(report.readinessLayers).toHaveLength(3);
    expect(report.readinessLayers.map((l) => l.id)).toEqual(["current", "near_term", "structural"]);
  });

  it("clean context → overall posture is not absent", () => {
    const report = buildConfidenceAnatomyReport(ctx({ hasAnyEvidence: true }));
    expect(report.overallPosture).not.toBe("absent");
  });

  it("contradicted confidence → contradiction_pressure is absent, overall is absent", () => {
    const report = buildConfidenceAnatomyReport(ctx({ confidenceState: "contradicted" }));
    const contDim = report.dimensions.find((d) => d.id === "contradiction_pressure")!;
    expect(contDim.posture).toBe("absent");
    expect(report.overallPosture).toBe("absent");
  });

  it("destabilizing decision state → decision_stability is absent, overall is absent", () => {
    const report = buildConfidenceAnatomyReport(ctx({ decisionState: "destabilizing" }));
    const stabDim = report.dimensions.find((d) => d.id === "decision_stability")!;
    expect(stabDim.posture).toBe("absent");
    expect(report.overallPosture).toBe("absent");
  });

  it("active blocking tension → tension_pressure is absent, overall is absent", () => {
    const report = buildConfidenceAnatomyReport(ctx({ hasActiveBlockingTension: true, activeTensionIds: ["t1"] }));
    const tenDim = report.dimensions.find((d) => d.id === "unresolved_tension_pressure")!;
    expect(tenDim.posture).toBe("absent");
    expect(report.overallPosture).toBe("absent");
  });

  it("all strong signals → overall posture is strong or building", () => {
    const report = buildConfidenceAnatomyReport(ctx({
      decisionState:             "committed",
      confidenceState:           "strong",
      hasCustomerBehavioralProof: true,
      hasMultiLayerEvidence:      true,
      hasAnyEvidence:             true,
      evidenceFreshness:          "fresh",
      activeHypothesisCount:      3,
      confidenceMovement:         [mv("strengthening")],
      validationRequirements:     [{ requirement: "A", status: "met" }],
    }));
    expect(["strong", "building"]).toContain(report.overallPosture);
  });

  it("decompositionNarrative is a non-empty string", () => {
    const report = buildConfidenceAnatomyReport(ctx());
    expect(typeof report.decompositionNarrative).toBe("string");
    expect(report.decompositionNarrative.length).toBeGreaterThan(0);
  });

  it("overallMovement is unresolved when no movement entries", () => {
    const report = buildConfidenceAnatomyReport(ctx({ confidenceMovement: [] }));
    expect(report.overallMovement).toBe("unresolved");
  });

  it("overallMovement strengthening when latest is strengthening and multiple dims strengthen", () => {
    const report = buildConfidenceAnatomyReport(ctx({
      decisionState:             "committed",
      confidenceState:           "strong",
      hasCustomerBehavioralProof: true,
      hasMultiLayerEvidence:      true,
      hasAnyEvidence:             true,
      evidenceFreshness:          "fresh",
      activeHypothesisCount:      3,
      confidenceMovement:         [mv("strengthening"), mv("strengthening"), mv("strengthening")],
      validationRequirements:     [{ requirement: "A", status: "met" }],
    }));
    expect(report.overallMovement).toBe("strengthening");
  });
});

// ─── Individual dimensions ────────────────────────────────────────────────────

describe("validation_maturity dimension", () => {
  it("committed + all met → strong", () => {
    const report = buildConfidenceAnatomyReport(ctx({
      decisionState: "committed",
      validationRequirements: [{ requirement: "A", status: "met" }],
    }));
    const dim = report.dimensions.find((d) => d.id === "validation_maturity")!;
    expect(dim.posture).toBe("strong");
  });

  it("no requirements at all → absent", () => {
    const report = buildConfidenceAnatomyReport(ctx({
      decisionState: "exploratory",
      validationRequirements: [],
    }));
    const dim = report.dimensions.find((d) => d.id === "validation_maturity")!;
    expect(dim.posture).toBe("absent");
  });

  it("under_validation with open requirements → directional", () => {
    const report = buildConfidenceAnatomyReport(ctx({
      decisionState: "under_validation",
      validationRequirements: [{ requirement: "A", status: "open" }],
    }));
    const dim = report.dimensions.find((d) => d.id === "validation_maturity")!;
    expect(dim.posture).toBe("directional");
    expect(dim.unresolvedBlockers).toEqual(expect.arrayContaining(["1 open requirement"]));
  });
});

describe("customer_proof_strength dimension", () => {
  it("behavioral proof + fresh → strong", () => {
    const report = buildConfidenceAnatomyReport(ctx({
      hasCustomerBehavioralProof: true,
      hasStaleCustomerProof: false,
    }));
    const dim = report.dimensions.find((d) => d.id === "customer_proof_strength")!;
    expect(dim.posture).toBe("strong");
  });

  it("no evidence at all → absent", () => {
    const report = buildConfidenceAnatomyReport(ctx({
      hasCustomerBehavioralProof: false,
      hasMultiLayerEvidence: false,
      hasAnyEvidence: false,
    }));
    const dim = report.dimensions.find((d) => d.id === "customer_proof_strength")!;
    expect(dim.posture).toBe("absent");
  });

  it("multi-layer but no behavioral → building", () => {
    const report = buildConfidenceAnatomyReport(ctx({
      hasMultiLayerEvidence: true,
      hasCustomerBehavioralProof: false,
    }));
    const dim = report.dimensions.find((d) => d.id === "customer_proof_strength")!;
    expect(dim.posture).toBe("building");
  });
});

describe("contradiction_pressure dimension", () => {
  it("contradicted confidence state → absent", () => {
    const report = buildConfidenceAnatomyReport(ctx({ confidenceState: "contradicted" }));
    const dim = report.dimensions.find((d) => d.id === "contradiction_pressure")!;
    expect(dim.posture).toBe("absent");
  });

  it("no contradictions → strong", () => {
    const report = buildConfidenceAnatomyReport(ctx({
      confidenceState: "building",
      hasContradictingEvidence: false,
      contradictedHypothesisCount: 0,
    }));
    const dim = report.dimensions.find((d) => d.id === "contradiction_pressure")!;
    expect(dim.posture).toBe("strong");
  });

  it("contradicting evidence → fragile", () => {
    const report = buildConfidenceAnatomyReport(ctx({ hasContradictingEvidence: true }));
    const dim = report.dimensions.find((d) => d.id === "contradiction_pressure")!;
    expect(dim.posture).toBe("fragile");
  });

  it("long-pending council recs downgrade from strong to directional", () => {
    const report = buildConfidenceAnatomyReport(ctx({ councilLongPendingCount: 2 }));
    const dim = report.dimensions.find((d) => d.id === "contradiction_pressure")!;
    expect(POSTURE_RANK[dim.posture]).toBeLessThanOrEqual(POSTURE_RANK["directional"]);
  });
});

describe("unresolved_tension_pressure dimension", () => {
  it("blocking tension → absent", () => {
    const report = buildConfidenceAnatomyReport(ctx({ hasActiveBlockingTension: true, activeTensionIds: ["t1"] }));
    const dim = report.dimensions.find((d) => d.id === "unresolved_tension_pressure")!;
    expect(dim.posture).toBe("absent");
  });

  it("no tensions → strong", () => {
    const report = buildConfidenceAnatomyReport(ctx({ activeTensionIds: [] }));
    const dim = report.dimensions.find((d) => d.id === "unresolved_tension_pressure")!;
    expect(dim.posture).toBe("strong");
  });

  it("3+ tensions → fragile", () => {
    const report = buildConfidenceAnatomyReport(ctx({ activeTensionIds: ["t1", "t2", "t3"] }));
    const dim = report.dimensions.find((d) => d.id === "unresolved_tension_pressure")!;
    expect(dim.posture).toBe("fragile");
  });
});

describe("evidence_freshness dimension", () => {
  it("fresh + multi-layer → strong", () => {
    const report = buildConfidenceAnatomyReport(ctx({
      evidenceFreshness: "fresh",
      hasMultiLayerEvidence: true,
    }));
    const dim = report.dimensions.find((d) => d.id === "evidence_freshness")!;
    expect(dim.posture).toBe("strong");
  });

  it("stale + stale dependencies → fragile", () => {
    const report = buildConfidenceAnatomyReport(ctx({
      evidenceFreshness: "stale",
      staleDependencies: ["dep-1"],
    }));
    const dim = report.dimensions.find((d) => d.id === "evidence_freshness")!;
    expect(dim.posture).toBe("fragile");
  });
});

// ─── buildTemporalNote ────────────────────────────────────────────────────────

describe("buildTemporalNote", () => {
  it("no movement entries → null", () => {
    expect(buildTemporalNote(ctx({ confidenceMovement: [] }))).toBeNull();
  });

  it("3+ all strengthening → building consistently", () => {
    const result = buildTemporalNote(ctx({
      confidenceMovement: [mv("strengthening"), mv("strengthening"), mv("strengthening")],
    }));
    expect(result).toContain("building consistently");
  });

  it("3+ all weakening → declining", () => {
    const result = buildTemporalNote(ctx({
      confidenceMovement: [mv("weakening"), mv("weakening"), mv("weakening")],
    }));
    expect(result).toContain("declining");
  });

  it("last weakening after strengthening → weakening earlier progress", () => {
    const result = buildTemporalNote(ctx({
      confidenceMovement: [mv("strengthening"), mv("weakening")],
    }));
    expect(result).toContain("weaken earlier progress");
  });

  it("last strengthening after weakening → recovering", () => {
    const result = buildTemporalNote(ctx({
      confidenceMovement: [mv("weakening"), mv("strengthening")],
    }));
    expect(result).toContain("recovering");
  });

  it("all stable → holding without new signal", () => {
    const result = buildTemporalNote(ctx({
      confidenceMovement: [mv("stable"), mv("stable")],
    }));
    expect(result).toContain("holding");
  });

  it("static for >30 days with no movement shows days count", () => {
    const oldDate = new Date(Date.now() - 35 * 86400000).toISOString();
    const result = buildTemporalNote(ctx({
      confidenceMovement: [],
      lastMeaningfulChangeAt: oldDate,
    }));
    expect(result).toContain("days");
  });
});

// ─── buildDecompositionNarrative ─────────────────────────────────────────────

describe("buildDecompositionNarrative", () => {
  function makeDim(id: string, posture: ConfidencePosture): ConfidenceDimension {
    return { id: id as any, label: id, posture, movement: "unresolved", strengtheningFactors: [], weakeningFactors: [], staleConditions: [], unresolvedBlockers: [id + " blocked"] };
  }

  it("all strong → mentions strong and anchored", () => {
    const dims = ["validation_maturity", "customer_proof_strength"].map((id) => makeDim(id, "strong"));
    const result = buildDecompositionNarrative(dims as ConfidenceDimension[], "strong");
    expect(result).toContain("strong");
    expect(result).toContain("anchored");
  });

  it("absent overall → names the absent dimension", () => {
    const dims = [makeDim("decision_stability", "absent"), makeDim("market_support", "building")];
    const result = buildDecompositionNarrative(dims as ConfidenceDimension[], "absent");
    expect(result).toContain("absent");
    expect(result).toContain("decision_stability");
  });

  it("building with fragile weak point → mentions held back", () => {
    const dims = [
      makeDim("customer_proof_strength", "building"),
      makeDim("contradiction_pressure", "fragile"),
    ];
    const result = buildDecompositionNarrative(dims as ConfidenceDimension[], "building");
    expect(result).toContain("held back");
  });
});

// ─── deriveUnlockPaths ────────────────────────────────────────────────────────

describe("deriveUnlockPaths", () => {
  it("fragile validation → includes validation action", () => {
    const report = buildConfidenceAnatomyReport(ctx({
      decisionState: "exploratory",
      validationRequirements: [{ requirement: "A", status: "open" }],
    }));
    const paths = report.unlockPaths;
    const valPath = paths.find((p) => p.targetDimension === "validation_maturity");
    expect(valPath).toBeDefined();
  });

  it("contradiction absent → includes contradiction action with high impact", () => {
    const report = buildConfidenceAnatomyReport(ctx({ confidenceState: "contradicted" }));
    const paths = report.unlockPaths;
    const contraPath = paths.find((p) => p.targetDimension === "contradiction_pressure");
    expect(contraPath).toBeDefined();
    expect(contraPath?.expectedImpact).toBe("high");
  });

  it("council long pending → adds council action", () => {
    const report = buildConfidenceAnatomyReport(ctx({ councilLongPendingCount: 3 }));
    const councilPath = report.unlockPaths.find((p) => p.action.includes("council"));
    expect(councilPath).toBeDefined();
  });

  it("no blockers → no paths", () => {
    const report = buildConfidenceAnatomyReport(ctx({
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
    expect(report.unlockPaths).toHaveLength(0);
  });

  it("returns at most 5 paths", () => {
    const report = buildConfidenceAnatomyReport(ctx({
      confidenceState: "contradicted",
      hasContradictingEvidence: true,
      hasActiveBlockingTension: true,
      activeTensionIds: ["t1", "t2", "t3"],
      hasCapabilityGap: true,
      blockedBy: ["b1"],
      councilLongPendingCount: 2,
    }));
    expect(report.unlockPaths.length).toBeLessThanOrEqual(5);
  });
});

// ─── buildDecisionOnlyContext ─────────────────────────────────────────────────

describe("buildDecisionOnlyContext", () => {
  it("builds valid context from minimal decision", () => {
    const c = buildDecisionOnlyContext({
      decision_state: "exploratory",
      confidence_state: "directional",
      confidence_movement: [],
      decision_memory: [],
    });
    expect(c.decisionState).toBe("exploratory");
    expect(c.confidenceState).toBe("directional");
    expect(c.blockedBy).toEqual([]);
  });

  it("contradicted confidence state → hasContradictingEvidence true", () => {
    const c = buildDecisionOnlyContext({
      decision_state: "stabilizing",
      confidence_state: "contradicted",
      confidence_movement: [],
      decision_memory: [],
    });
    expect(c.hasContradictingEvidence).toBe(true);
  });

  it("strong confidence state → hasCustomerBehavioralProof true", () => {
    const c = buildDecisionOnlyContext({
      decision_state: "committed",
      confidence_state: "strong",
      confidence_movement: [],
      decision_memory: [],
    });
    expect(c.hasCustomerBehavioralProof).toBe(true);
  });

  it("produces a full anatomy report without errors", () => {
    const c = buildDecisionOnlyContext({
      decision_state: "under_validation",
      confidence_state: "building",
      confidence_movement: [mv("strengthening")],
      decision_memory: [],
      blocked_by: [],
      active_tension_ids: [],
    });
    expect(() => buildConfidenceAnatomyReport(c)).not.toThrow();
  });
});

// ─── isPostureAtRisk ──────────────────────────────────────────────────────────

describe("isPostureAtRisk", () => {
  it("absent → true",  () => expect(isPostureAtRisk("absent")).toBe(true));
  it("fragile → true", () => expect(isPostureAtRisk("fragile")).toBe(true));
  it("directional → false", () => expect(isPostureAtRisk("directional")).toBe(false));
  it("building → false",    () => expect(isPostureAtRisk("building")).toBe(false));
  it("strong → false",      () => expect(isPostureAtRisk("strong")).toBe(false));
});

// ─── Readiness layers ─────────────────────────────────────────────────────────

describe("readiness layers", () => {
  it("current layer narrative reflects overall posture", () => {
    const report = buildConfidenceAnatomyReport(ctx({ confidenceState: "contradicted" }));
    const current = report.readinessLayers.find((l) => l.id === "current")!;
    expect(current.narrative).toContain("insufficient");
  });

  it("near_term layer narrative mentions unlock when paths exist", () => {
    const report = buildConfidenceAnatomyReport(ctx({
      validationRequirements: [{ requirement: "A", status: "open" }],
      decisionState: "exploratory",
    }));
    const nearTerm = report.readinessLayers.find((l) => l.id === "near_term")!;
    expect(nearTerm.narrative.length).toBeGreaterThan(0);
  });

  it("structural layer cites unstable structural dims", () => {
    const report = buildConfidenceAnatomyReport(ctx({ decisionState: "destabilizing" }));
    const structural = report.readinessLayers.find((l) => l.id === "structural")!;
    expect(structural.narrative).toContain("decision stability");
  });
});
