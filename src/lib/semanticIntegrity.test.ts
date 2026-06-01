import { describe, expect, it } from "vitest";
import { auditSemanticIntegrity, type SemanticIntegrityInput } from "./semanticIntegrity";
import type { AttentionContext } from "./strategicAttention";
import type { DecayContext } from "./strategicDecay";
import type { GovernanceDrift } from "./decisionOperations";
import type { DisciplineAssessment } from "./confidenceDiscipline";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeBase(): SemanticIntegrityInput {
  return {
    register: "converging",
    discipline: null,
    confidencePosture: "directional",
    temporalPosture: {
      proofGapMaturity: "aging",
      contradictionPressure: "isolated",
      momentum: "stable",
      approxCycleCount: 2,
      proofGapEvolvedPhrases: null,
      contradictionEvolvedPhrases: null,
      landscapeEvolution: {},
    },
    attention: {
      posture: "watchful",
      postureLabel: "Active monitoring",
      dominantConcern: "Customer validation is the active constraint.",
      escalationCollapsed: false,
      signalQuotas: { critical: 1, active: 3, ambient: 2 },
    },
    decay: null,
    customerRealityPosture: "directional",
    hasCustomerBehavioralProof: false,
    governanceDrift: {
      overcommitted: false,
      perpetualExploration: false,
      validationBottleneck: false,
      driftingCommitment: false,
      categoryImbalance: false,
      any: false,
    },
    safeToCommit: [],
    portfolioHasStalledOrGatedRoutes: false,
    operatingMode: "diagnose",
  };
}

function withAttention(
  base: SemanticIntegrityInput,
  overrides: Partial<AttentionContext>,
): SemanticIntegrityInput {
  return {
    ...base,
    attention: base.attention ? { ...base.attention, ...overrides } : null,
  };
}

function withGovernanceDrift(
  base: SemanticIntegrityInput,
  overrides: Partial<GovernanceDrift>,
): SemanticIntegrityInput {
  const drift = { ...base.governanceDrift, ...overrides };
  return {
    ...base,
    governanceDrift: { ...drift, any: Object.values(drift).some((v) => v === true && typeof v === "boolean") },
  };
}

function withDecay(
  base: SemanticIntegrityInput,
  overrides: Partial<DecayContext>,
): SemanticIntegrityInput {
  const defaultDecay: DecayContext = {
    contradictionCooled: false,
    proofGapNormalized: false,
    conditionsStabilizing: false,
    coolContradictorySignals: false,
    compressReinforcingSignals: false,
    signalDecay: new Map(),
    backgroundNote: null,
  };
  return { ...base, decay: { ...defaultDecay, ...overrides } };
}

// ─── Clean state — no violations ─────────────────────────────────────────────

describe("clean state", () => {
  it("baseline input → isClean and trustScore 100", () => {
    const result = auditSemanticIntegrity(makeBase());
    expect(result.isClean).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.trustScore).toBe(100);
  });

  it("null attention and decay → no spurious violations", () => {
    const result = auditSemanticIntegrity({ ...makeBase(), attention: null, decay: null });
    expect(result.isClean).toBe(true);
  });
});

// ─── Part 1: Cross-layer impossibilities ─────────────────────────────────────

describe("COMMITMENT_WITHOUT_BEHAVIORAL_PROOF (blocking)", () => {
  it("safeToCommit non-empty + no behavioral proof → blocking violation", () => {
    const result = auditSemanticIntegrity({
      ...makeBase(),
      safeToCommit: ["Route A"],
      hasCustomerBehavioralProof: false,
    });
    expect(result.violations.some((v) => v.code === "COMMITMENT_WITHOUT_BEHAVIORAL_PROOF")).toBe(true);
    expect(result.violations.find((v) => v.code === "COMMITMENT_WITHOUT_BEHAVIORAL_PROOF")?.severity).toBe("blocking");
    expect(result.blockingCount).toBeGreaterThanOrEqual(1);
  });

  it("safeToCommit non-empty WITH behavioral proof → no violation", () => {
    const result = auditSemanticIntegrity({
      ...makeBase(),
      safeToCommit: ["Route A"],
      hasCustomerBehavioralProof: true,
      customerRealityPosture: "grounded",
    });
    expect(result.violations.some((v) => v.code === "COMMITMENT_WITHOUT_BEHAVIORAL_PROOF")).toBe(false);
  });

  it("safeToCommit empty + no proof → no violation", () => {
    const result = auditSemanticIntegrity({
      ...makeBase(),
      safeToCommit: [],
      hasCustomerBehavioralProof: false,
    });
    expect(result.violations.some((v) => v.code === "COMMITMENT_WITHOUT_BEHAVIORAL_PROOF")).toBe(false);
  });
});

describe("FOCUSED_WITHOUT_DOMINANT_CONCERN (blocking)", () => {
  it("focused posture + null dominant concern → blocking violation", () => {
    const result = auditSemanticIntegrity(
      withAttention(makeBase(), { posture: "focused", dominantConcern: null }),
    );
    expect(result.violations.some((v) => v.code === "FOCUSED_WITHOUT_DOMINANT_CONCERN")).toBe(true);
    expect(result.violations.find((v) => v.code === "FOCUSED_WITHOUT_DOMINANT_CONCERN")?.severity).toBe("blocking");
  });

  it("focused posture WITH dominant concern → no violation", () => {
    const result = auditSemanticIntegrity(
      withAttention(makeBase(), { posture: "focused", dominantConcern: "Committed route contradicted." }),
    );
    expect(result.violations.some((v) => v.code === "FOCUSED_WITHOUT_DOMINANT_CONCERN")).toBe(false);
  });
});

describe("STABILIZING_WITH_ACTIVE_CONTRADICTION (blocking)", () => {
  it("conditionsStabilizing + entrenched contradiction → blocking violation", () => {
    const result = auditSemanticIntegrity({
      ...withDecay(makeBase(), { conditionsStabilizing: true }),
      temporalPosture: {
        proofGapMaturity: "fresh",
        contradictionPressure: "entrenched",
        momentum: "strengthening",
        approxCycleCount: 3,
        proofGapEvolvedPhrases: null,
        contradictionEvolvedPhrases: null,
        landscapeEvolution: {},
      },
    });
    expect(result.violations.some((v) => v.code === "STABILIZING_WITH_ACTIVE_CONTRADICTION")).toBe(true);
  });

  it("conditionsStabilizing + no/isolated contradiction → no violation", () => {
    const result = auditSemanticIntegrity(
      withDecay(makeBase(), { conditionsStabilizing: true }),
    );
    expect(result.violations.some((v) => v.code === "STABILIZING_WITH_ACTIVE_CONTRADICTION")).toBe(false);
  });
});

// ─── Part 2: Language tier violations ─────────────────────────────────────────

describe("STABILIZED_REGISTER_WITHOUT_PROOF (warning)", () => {
  it("stabilized register + fresh proof gap + no behavioral proof → warning", () => {
    const result = auditSemanticIntegrity({
      ...makeBase(),
      register: "stabilized",
      temporalPosture: {
        proofGapMaturity: "fresh",
        contradictionPressure: "none",
        momentum: "strengthening",
        approxCycleCount: 1,
        proofGapEvolvedPhrases: null,
        contradictionEvolvedPhrases: null,
        landscapeEvolution: {},
      },
      hasCustomerBehavioralProof: false,
    });
    expect(result.violations.some((v) => v.code === "STABILIZED_REGISTER_WITHOUT_PROOF")).toBe(true);
    expect(result.violations.find((v) => v.code === "STABILIZED_REGISTER_WITHOUT_PROOF")?.severity).toBe("warning");
  });

  it("stabilized register + aging proof gap → no tier violation", () => {
    const result = auditSemanticIntegrity({
      ...makeBase(),
      register: "stabilized",
    });
    expect(result.violations.some((v) => v.code === "STABILIZED_REGISTER_WITHOUT_PROOF")).toBe(false);
  });

  it("stabilized register + fresh + WITH behavioral proof → no violation", () => {
    const result = auditSemanticIntegrity({
      ...makeBase(),
      register: "stabilized",
      temporalPosture: {
        proofGapMaturity: "fresh",
        contradictionPressure: "none",
        momentum: "strengthening",
        approxCycleCount: 1,
        proofGapEvolvedPhrases: null,
        contradictionEvolvedPhrases: null,
        landscapeEvolution: {},
      },
      hasCustomerBehavioralProof: true,
    });
    expect(result.violations.some((v) => v.code === "STABILIZED_REGISTER_WITHOUT_PROOF")).toBe(false);
  });
});

describe("STRUCTURAL_PRESSURE_FRESH_STATE (warning)", () => {
  it("structural_pressure register + fresh + no contradiction → warning", () => {
    const result = auditSemanticIntegrity({
      ...makeBase(),
      register: "structural_pressure",
      temporalPosture: {
        proofGapMaturity: "fresh",
        contradictionPressure: "none",
        momentum: "stable",
        approxCycleCount: 1,
        proofGapEvolvedPhrases: null,
        contradictionEvolvedPhrases: null,
        landscapeEvolution: {},
      },
    });
    expect(result.violations.some((v) => v.code === "STRUCTURAL_PRESSURE_FRESH_STATE")).toBe(true);
  });

  it("structural_pressure register + fresh + entrenched contradiction → no violation (contradiction earns it)", () => {
    const result = auditSemanticIntegrity({
      ...makeBase(),
      register: "structural_pressure",
      temporalPosture: {
        proofGapMaturity: "fresh",
        contradictionPressure: "entrenched",
        momentum: "weakening",
        approxCycleCount: 4,
        proofGapEvolvedPhrases: null,
        contradictionEvolvedPhrases: null,
        landscapeEvolution: {},
      },
    });
    expect(result.violations.some((v) => v.code === "STRUCTURAL_PRESSURE_FRESH_STATE")).toBe(false);
  });
});

// ─── Part 3: Sacred concept protection ───────────────────────────────────────

describe("PROOF_ABSENT_STABLE_POSTURE (warning)", () => {
  it("customer proof inferred + stable attention posture → warning", () => {
    const result = auditSemanticIntegrity(
      withAttention(
        { ...makeBase(), customerRealityPosture: "inferred" },
        { posture: "stable", dominantConcern: null },
      ),
    );
    expect(result.violations.some((v) => v.code === "PROOF_ABSENT_STABLE_POSTURE")).toBe(true);
  });

  it("customer proof directional + watchful posture → no violation", () => {
    const result = auditSemanticIntegrity({
      ...makeBase(),
      customerRealityPosture: "directional",
    });
    expect(result.violations.some((v) => v.code === "PROOF_ABSENT_STABLE_POSTURE")).toBe(false);
  });

  it("customer proof inferred + focused posture → no violation for this check", () => {
    // PROOF_ABSENT_STABLE_POSTURE is specifically about stable posture hiding missing proof.
    // Focused posture with inferred proof is handled differently (dominated by the critical concern).
    const result = auditSemanticIntegrity(
      withAttention(
        { ...makeBase(), customerRealityPosture: "inferred" },
        { posture: "focused", dominantConcern: "Active concern." },
      ),
    );
    expect(result.violations.some((v) => v.code === "PROOF_ABSENT_STABLE_POSTURE")).toBe(false);
  });
});

describe("STRUCTURAL_CLAIM_ISOLATED_CONTRADICTION (warning)", () => {
  it("structural_pressure register + isolated contradiction + no structural proof gap → warning", () => {
    const result = auditSemanticIntegrity({
      ...makeBase(),
      register: "structural_pressure",
      temporalPosture: {
        proofGapMaturity: "aging",
        contradictionPressure: "isolated",
        momentum: "stable",
        approxCycleCount: 2,
        proofGapEvolvedPhrases: null,
        contradictionEvolvedPhrases: null,
        landscapeEvolution: {},
      },
    });
    expect(result.violations.some((v) => v.code === "STRUCTURAL_CLAIM_ISOLATED_CONTRADICTION")).toBe(true);
  });

  it("structural_pressure register + isolated + structural proof gap → no violation", () => {
    const result = auditSemanticIntegrity({
      ...makeBase(),
      register: "structural_pressure",
      temporalPosture: {
        proofGapMaturity: "structural",
        contradictionPressure: "isolated",
        momentum: "cooling",
        approxCycleCount: 5,
        proofGapEvolvedPhrases: null,
        contradictionEvolvedPhrases: null,
        landscapeEvolution: {},
      },
    });
    expect(result.violations.some((v) => v.code === "STRUCTURAL_CLAIM_ISOLATED_CONTRADICTION")).toBe(false);
  });
});

describe("STABILIZING_WITH_GOVERNANCE_DRIFT (warning)", () => {
  it("conditionsStabilizing + governance drift → warning", () => {
    const result = auditSemanticIntegrity(
      withDecay(
        withGovernanceDrift(makeBase(), { validationBottleneck: true }),
        { conditionsStabilizing: true },
      ),
    );
    expect(result.violations.some((v) => v.code === "STABILIZING_WITH_GOVERNANCE_DRIFT")).toBe(true);
  });

  it("conditionsStabilizing + no drift → no violation", () => {
    const result = auditSemanticIntegrity(
      withDecay(makeBase(), { conditionsStabilizing: true }),
    );
    expect(result.violations.some((v) => v.code === "STABILIZING_WITH_GOVERNANCE_DRIFT")).toBe(false);
  });
});

// ─── Part 4: Tone collisions ──────────────────────────────────────────────────

describe("DECAY_NOTE_WITH_FOCUSED_POSTURE (warning)", () => {
  it("backgroundNote set + focused posture → warning", () => {
    const result = auditSemanticIntegrity({
      ...withDecay(makeBase(), { backgroundNote: "Contradiction entrenched — no recent escalation." }),
      attention: {
        posture: "focused",
        postureLabel: "Focus required",
        dominantConcern: "Portfolio committed without customer validation.",
        escalationCollapsed: false,
        signalQuotas: { critical: 1, active: 2, ambient: 1 },
      },
    });
    expect(result.violations.some((v) => v.code === "DECAY_NOTE_WITH_FOCUSED_POSTURE")).toBe(true);
  });

  it("backgroundNote null + focused posture → no violation for this check", () => {
    const result = auditSemanticIntegrity(
      withAttention(makeBase(), { posture: "focused", dominantConcern: "Active constraint." }),
    );
    expect(result.violations.some((v) => v.code === "DECAY_NOTE_WITH_FOCUSED_POSTURE")).toBe(false);
  });
});

describe("STABLE_POSTURE_ESCALATION_REGISTER (warning)", () => {
  it("stable posture + escalation register → warning", () => {
    const result = auditSemanticIntegrity({
      ...withAttention(makeBase(), { posture: "stable", dominantConcern: null }),
      register: "escalation",
    });
    expect(result.violations.some((v) => v.code === "STABLE_POSTURE_ESCALATION_REGISTER")).toBe(true);
  });

  it("watchful posture + escalation register → no violation for this check", () => {
    const result = auditSemanticIntegrity({
      ...withAttention(makeBase(), { posture: "watchful" }),
      register: "escalation",
    });
    expect(result.violations.some((v) => v.code === "STABLE_POSTURE_ESCALATION_REGISTER")).toBe(false);
  });
});

describe("COHERENT_POSTURE_WITH_BLOCKED_ROUTES (advisory)", () => {
  it("coherent posture + stalled routes → advisory", () => {
    const result = auditSemanticIntegrity({
      ...makeBase(),
      confidencePosture: "coherent",
      portfolioHasStalledOrGatedRoutes: true,
    });
    expect(result.violations.some((v) => v.code === "COHERENT_POSTURE_WITH_BLOCKED_ROUTES")).toBe(true);
    expect(result.violations.find((v) => v.code === "COHERENT_POSTURE_WITH_BLOCKED_ROUTES")?.severity).toBe("advisory");
  });

  it("directional posture + stalled routes → no violation for this check", () => {
    const result = auditSemanticIntegrity({
      ...makeBase(),
      confidencePosture: "directional",
      portfolioHasStalledOrGatedRoutes: true,
    });
    expect(result.violations.some((v) => v.code === "COHERENT_POSTURE_WITH_BLOCKED_ROUTES")).toBe(false);
  });
});

// ─── Part 5: Register guardrails ─────────────────────────────────────────────

describe("ESCALATION_REGISTER_COOLED_BY_DISCIPLINE (warning)", () => {
  it("escalation register + discipline cooled to structural_pressure → warning", () => {
    const coolDiscipline: DisciplineAssessment = {
      restraintFlags: {
        prematureCertainty: false,
        falseConvergence: false,
        escalationWithoutProof: true,
        immatureAmbiguity: false,
      },
      cooledRegister: "structural_pressure",
      active: true,
      coolPhrase: (p) => p,
      assertsTooMuch: () => false,
    };
    const result = auditSemanticIntegrity({
      ...makeBase(),
      register: "escalation",
      discipline: coolDiscipline,
    });
    expect(result.violations.some((v) => v.code === "ESCALATION_REGISTER_COOLED_BY_DISCIPLINE")).toBe(true);
  });

  it("escalation register + discipline also at escalation → no violation", () => {
    const hotDiscipline: DisciplineAssessment = {
      restraintFlags: {
        prematureCertainty: false,
        falseConvergence: false,
        escalationWithoutProof: false,
        immatureAmbiguity: false,
      },
      cooledRegister: "escalation",
      active: false,
      coolPhrase: (p) => p,
      assertsTooMuch: () => false,
    };
    const result = auditSemanticIntegrity({
      ...makeBase(),
      register: "escalation",
      discipline: hotDiscipline,
    });
    expect(result.violations.some((v) => v.code === "ESCALATION_REGISTER_COOLED_BY_DISCIPLINE")).toBe(false);
  });
});

describe("EXPLORATORY_REGISTER_IN_STABLE_STATE (advisory)", () => {
  it("exploratory register + conditionsStabilizing → advisory", () => {
    const result = auditSemanticIntegrity(
      withDecay({ ...makeBase(), register: "exploratory" }, { conditionsStabilizing: true }),
    );
    expect(result.violations.some((v) => v.code === "EXPLORATORY_REGISTER_IN_STABLE_STATE")).toBe(true);
    expect(result.violations.find((v) => v.code === "EXPLORATORY_REGISTER_IN_STABLE_STATE")?.severity).toBe("advisory");
  });

  it("converging register + conditionsStabilizing → no violation for this check", () => {
    const result = auditSemanticIntegrity(
      withDecay(makeBase(), { conditionsStabilizing: true }),
    );
    expect(result.violations.some((v) => v.code === "EXPLORATORY_REGISTER_IN_STABLE_STATE")).toBe(false);
  });
});

describe("DECIDE_MODE_WITHOUT_CUSTOMER_PROOF (advisory)", () => {
  it("decide mode + inferred customer proof → advisory", () => {
    const result = auditSemanticIntegrity({
      ...makeBase(),
      operatingMode: "decide",
      customerRealityPosture: "inferred",
    });
    expect(result.violations.some((v) => v.code === "DECIDE_MODE_WITHOUT_CUSTOMER_PROOF")).toBe(true);
  });

  it("decide mode + converging customer proof → no violation", () => {
    const result = auditSemanticIntegrity({
      ...makeBase(),
      operatingMode: "decide",
      customerRealityPosture: "converging",
    });
    expect(result.violations.some((v) => v.code === "DECIDE_MODE_WITHOUT_CUSTOMER_PROOF")).toBe(false);
  });
});

describe("STABILIZED_REGISTER_WEAKENING_MOMENTUM (warning)", () => {
  it("stabilized register + weakening momentum → warning", () => {
    const result = auditSemanticIntegrity({
      ...makeBase(),
      register: "stabilized",
      temporalPosture: {
        proofGapMaturity: "structural",
        contradictionPressure: "entrenched",
        momentum: "weakening",
        approxCycleCount: 6,
        proofGapEvolvedPhrases: null,
        contradictionEvolvedPhrases: null,
        landscapeEvolution: {},
      },
    });
    expect(result.violations.some((v) => v.code === "STABILIZED_REGISTER_WEAKENING_MOMENTUM")).toBe(true);
  });

  it("stabilized register + strengthening momentum → no violation", () => {
    const result = auditSemanticIntegrity({
      ...makeBase(),
      register: "stabilized",
      temporalPosture: {
        proofGapMaturity: "fresh",
        contradictionPressure: "none",
        momentum: "strengthening",
        approxCycleCount: 1,
        proofGapEvolvedPhrases: null,
        contradictionEvolvedPhrases: null,
        landscapeEvolution: {},
      },
      hasCustomerBehavioralProof: true,
    });
    expect(result.violations.some((v) => v.code === "STABILIZED_REGISTER_WEAKENING_MOMENTUM")).toBe(false);
  });
});

// ─── Trust score ─────────────────────────────────────────────────────────────

describe("trustScore", () => {
  it("clean state → 100", () => {
    expect(auditSemanticIntegrity(makeBase()).trustScore).toBe(100);
  });

  it("one blocking violation → 70", () => {
    const result = auditSemanticIntegrity(
      withAttention(makeBase(), { posture: "focused", dominantConcern: null }),
    );
    expect(result.blockingCount).toBeGreaterThanOrEqual(1);
    expect(result.trustScore).toBeLessThanOrEqual(70);
  });

  it("one advisory violation → 97", () => {
    const result = auditSemanticIntegrity({
      ...makeBase(),
      confidencePosture: "coherent",
      portfolioHasStalledOrGatedRoutes: true,
    });
    expect(result.advisoryCount).toBeGreaterThanOrEqual(1);
    expect(result.trustScore).toBeLessThanOrEqual(97);
  });

  it("multiple violations → score decrements correctly", () => {
    const result = auditSemanticIntegrity({
      ...makeBase(),
      register: "escalation",
      safeToCommit: ["Route A"],
      hasCustomerBehavioralProof: false,
      confidencePosture: "coherent",
      portfolioHasStalledOrGatedRoutes: true,
    });
    expect(result.trustScore).toBeLessThan(100);
    expect(result.violations.length).toBeGreaterThan(1);
  });

  it("trust score cannot go below 0", () => {
    // construct a maximally violated state
    const result = auditSemanticIntegrity({
      ...makeBase(),
      register: "escalation",
      safeToCommit: ["A", "B"],
      hasCustomerBehavioralProof: false,
      confidencePosture: "coherent",
      portfolioHasStalledOrGatedRoutes: true,
      attention: {
        posture: "focused",
        postureLabel: "Focus required",
        dominantConcern: null,
        escalationCollapsed: false,
        signalQuotas: { critical: 1, active: 2, ambient: 1 },
      },
    });
    expect(result.trustScore).toBeGreaterThanOrEqual(0);
  });
});

// ─── Violation structure ──────────────────────────────────────────────────────

describe("violation structure", () => {
  it("every violation has code, severity, description, and non-empty layers", () => {
    const result = auditSemanticIntegrity({
      ...makeBase(),
      safeToCommit: ["Route A"],
      hasCustomerBehavioralProof: false,
    });
    for (const v of result.violations) {
      expect(v.code).toBeTruthy();
      expect(["blocking", "warning", "advisory"]).toContain(v.severity);
      expect(v.description).toBeTruthy();
      expect(v.layers.length).toBeGreaterThan(0);
    }
  });

  it("violations are ordered: blocking first, then warning, then advisory", () => {
    const result = auditSemanticIntegrity({
      ...makeBase(),
      safeToCommit: ["Route A"],
      hasCustomerBehavioralProof: false,
      confidencePosture: "coherent",
      portfolioHasStalledOrGatedRoutes: true,
    });
    const severities = result.violations.map((v) => v.severity);
    const tierOrder = { blocking: 0, warning: 1, advisory: 2 };
    for (let i = 1; i < severities.length; i++) {
      expect(tierOrder[severities[i]]).toBeGreaterThanOrEqual(tierOrder[severities[i - 1]]);
    }
  });
});
