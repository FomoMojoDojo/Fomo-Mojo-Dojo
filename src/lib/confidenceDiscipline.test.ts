import { describe, expect, it } from "vitest";
import {
  assessConfidenceDiscipline,
  hasCustomerBehavioralProofFromPosture,
} from "./confidenceDiscipline";
import { disciplinedPostureLabel } from "./strategicCenterSurface";
import type { TemporalPosture } from "./strategicTemporalState";

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeTemporal(overrides: Partial<TemporalPosture> = {}): TemporalPosture {
  return {
    proofGapMaturity: "fresh",
    contradictionPressure: "none",
    momentum: "stable",
    approxCycleCount: 1,
    proofGapEvolvedPhrases: null,
    contradictionEvolvedPhrases: null,
    landscapeEvolution: null,
    ...overrides,
  };
}

function makeAssessment(overrides: {
  confidencePosture?: Parameters<typeof assessConfidenceDiscipline>[0]["confidencePosture"];
  temporalPosture?: TemporalPosture;
  register?: Parameters<typeof assessConfidenceDiscipline>[0]["register"];
  hasCustomerBehavioralProof?: boolean;
  routeCount?: number;
} = {}) {
  return assessConfidenceDiscipline({
    confidencePosture: overrides.confidencePosture ?? "directional",
    temporalPosture: overrides.temporalPosture ?? makeTemporal(),
    register: overrides.register ?? "exploratory",
    hasCustomerBehavioralProof: overrides.hasCustomerBehavioralProof ?? false,
    routeCount: overrides.routeCount ?? 3,
  });
}

// ─── 1. Restraint flags ────────────────────────────────────────────────────────

describe("RestraintFlags — prematureCertainty", () => {
  it("fires when coherent posture + fresh + no behavioral proof", () => {
    const d = makeAssessment({ confidencePosture: "coherent", register: "stabilized" });
    expect(d.restraintFlags.prematureCertainty).toBe(true);
  });

  it("fires when stabilizing posture + fresh + no behavioral proof", () => {
    const d = makeAssessment({ confidencePosture: "stabilizing", register: "converging" });
    expect(d.restraintFlags.prematureCertainty).toBe(true);
  });

  it("suppressed when behavioral proof present", () => {
    const d = makeAssessment({
      confidencePosture: "coherent",
      register: "stabilized",
      hasCustomerBehavioralProof: true,
    });
    expect(d.restraintFlags.prematureCertainty).toBe(false);
  });

  it("suppressed when hypotheses are aging (not fresh)", () => {
    const d = makeAssessment({
      confidencePosture: "coherent",
      register: "stabilized",
      temporalPosture: makeTemporal({ proofGapMaturity: "aging" }),
    });
    expect(d.restraintFlags.prematureCertainty).toBe(false);
  });

  it("does not fire for directional posture — already hedged", () => {
    const d = makeAssessment({ confidencePosture: "directional" });
    expect(d.restraintFlags.prematureCertainty).toBe(false);
  });
});

describe("RestraintFlags — falseConvergence", () => {
  it("fires when stabilizing + fresh + no proof + not weakening", () => {
    const d = makeAssessment({
      confidencePosture: "stabilizing",
      temporalPosture: makeTemporal({ momentum: "stable" }),
    });
    expect(d.restraintFlags.falseConvergence).toBe(true);
  });

  it("fires when coherent + fresh + no proof + stable momentum", () => {
    const d = makeAssessment({ confidencePosture: "coherent", register: "stabilized" });
    expect(d.restraintFlags.falseConvergence).toBe(true);
  });

  it("suppressed when momentum is weakening", () => {
    const d = makeAssessment({
      confidencePosture: "stabilizing",
      temporalPosture: makeTemporal({ momentum: "weakening" }),
    });
    expect(d.restraintFlags.falseConvergence).toBe(false);
  });

  it("suppressed when behavioral proof present", () => {
    const d = makeAssessment({
      confidencePosture: "stabilizing",
      hasCustomerBehavioralProof: true,
    });
    expect(d.restraintFlags.falseConvergence).toBe(false);
  });

  it("does not fire for directional posture", () => {
    const d = makeAssessment({ confidencePosture: "directional" });
    expect(d.restraintFlags.falseConvergence).toBe(false);
  });
});

describe("RestraintFlags — escalationWithoutProof", () => {
  it("fires for escalation register + no proof + fresh", () => {
    const d = makeAssessment({ register: "escalation", hasCustomerBehavioralProof: false });
    expect(d.restraintFlags.escalationWithoutProof).toBe(true);
  });

  it("suppressed when behavioral proof present", () => {
    const d = makeAssessment({ register: "escalation", hasCustomerBehavioralProof: true });
    expect(d.restraintFlags.escalationWithoutProof).toBe(false);
  });

  it("suppressed when hypotheses structural (not fresh)", () => {
    const d = makeAssessment({
      register: "escalation",
      temporalPosture: makeTemporal({ proofGapMaturity: "structural" }),
    });
    expect(d.restraintFlags.escalationWithoutProof).toBe(false);
  });

  it("does not fire for structural_pressure register", () => {
    const d = makeAssessment({ register: "structural_pressure" });
    expect(d.restraintFlags.escalationWithoutProof).toBe(false);
  });
});

describe("RestraintFlags — immatureAmbiguity", () => {
  it("fires for fragmented posture + fresh + few routes", () => {
    const d = makeAssessment({
      confidencePosture: "fragmented",
      routeCount: 2,
    });
    expect(d.restraintFlags.immatureAmbiguity).toBe(true);
  });

  it("fires with routeCount = 0", () => {
    const d = makeAssessment({ confidencePosture: "fragmented", routeCount: 0 });
    expect(d.restraintFlags.immatureAmbiguity).toBe(true);
  });

  it("suppressed when routeCount > 2 (true fragmentation possible)", () => {
    const d = makeAssessment({ confidencePosture: "fragmented", routeCount: 3 });
    expect(d.restraintFlags.immatureAmbiguity).toBe(false);
  });

  it("suppressed when hypotheses are structural (real persistence, not immaturity)", () => {
    const d = makeAssessment({
      confidencePosture: "fragmented",
      routeCount: 1,
      temporalPosture: makeTemporal({ proofGapMaturity: "structural" }),
    });
    expect(d.restraintFlags.immatureAmbiguity).toBe(false);
  });

  it("does not fire for directional posture", () => {
    const d = makeAssessment({ confidencePosture: "directional", routeCount: 0 });
    expect(d.restraintFlags.immatureAmbiguity).toBe(false);
  });
});

// ─── 2. Register cooling ───────────────────────────────────────────────────────

describe("cooledRegister", () => {
  it("downgrades escalation → structural_pressure when escalationWithoutProof", () => {
    const d = makeAssessment({ register: "escalation" });
    expect(d.cooledRegister).toBe("structural_pressure");
  });

  it("downgrades stabilized → converging when prematureCertainty", () => {
    const d = makeAssessment({
      confidencePosture: "coherent",
      register: "stabilized",
    });
    expect(d.cooledRegister).toBe("converging");
  });

  it("downgrades stabilized → converging when falseConvergence", () => {
    const d = makeAssessment({
      confidencePosture: "stabilizing",
      register: "stabilized",
    });
    expect(d.cooledRegister).toBe("converging");
  });

  it("passes through exploratory register unchanged when no flags", () => {
    const d = makeAssessment({ confidencePosture: "directional", register: "exploratory" });
    expect(d.cooledRegister).toBe("exploratory");
  });

  it("passes through structural_pressure unchanged", () => {
    const d = makeAssessment({
      register: "structural_pressure",
      temporalPosture: makeTemporal({ proofGapMaturity: "structural" }),
    });
    expect(d.cooledRegister).toBe("structural_pressure");
  });
});

// ─── 3. Phrase cooling — premature certainty ──────────────────────────────────

describe("coolPhrase — premature certainty", () => {
  it("cools 'established' to 'forming'", () => {
    const d = makeAssessment({ confidencePosture: "coherent", register: "stabilized" });
    expect(d.coolPhrase("Validation established.")).toContain("forming");
  });

  it("cools 'Proof holding' — preserves case of non-matched words", () => {
    const d = makeAssessment({ confidencePosture: "coherent", register: "stabilized" });
    // "holding" is replaced; surrounding words keep their casing
    expect(d.coolPhrase("Proof holding.")).toBe("Proof building.");
  });

  it("cools 'holding' in other contexts to 'building'", () => {
    const d = makeAssessment({ confidencePosture: "coherent", register: "stabilized" });
    expect(d.coolPhrase("Coherence holding.")).not.toMatch(/holding/i);
  });
});

// ─── 4. Phrase cooling — false convergence ────────────────────────────────────

describe("coolPhrase — false convergence", () => {
  it("cools 'coherent' to 'more consistent'", () => {
    const d = makeAssessment({ confidencePosture: "stabilizing" });
    expect(d.coolPhrase("Positioning coherent across routes.")).toMatch(/more consistent/i);
  });

  it("cools 'coherence strengthening' to directional language", () => {
    const d = makeAssessment({ confidencePosture: "stabilizing" });
    const cooled = d.coolPhrase("Positioning coherence strengthening.");
    expect(cooled).toMatch(/becoming more consistent/i);
  });

  it("cools 'alignment building' to 'alignment beginning'", () => {
    const d = makeAssessment({ confidencePosture: "stabilizing" });
    expect(d.coolPhrase("Signal alignment building.")).toMatch(/beginning/i);
  });
});

// ─── 5. Phrase cooling — escalation without proof ────────────────────────────

describe("coolPhrase — escalation without proof", () => {
  it("cools 'commitment stage' to 'commitment decision'", () => {
    const d = makeAssessment({ register: "escalation" });
    expect(d.coolPhrase("Portfolio fragmented at commitment stage.")).toMatch(/commitment decision/i);
  });

  it("cools 'ready to commit' to 'approaching commitment'", () => {
    const d = makeAssessment({ register: "escalation" });
    expect(d.coolPhrase("Route A ready to commit. Evidence converging.")).toMatch(/approaching commitment/i);
  });

  it("cools 'blocking forward progress'", () => {
    const d = makeAssessment({ register: "escalation" });
    expect(d.coolPhrase("Fragmentation blocking forward progress.")).toMatch(/limiting forward/i);
  });
});

// ─── 6. Phrase cooling — immature ambiguity ───────────────────────────────────

describe("coolPhrase — immature ambiguity", () => {
  it("cools 'Portfolio fragmented' to 'Direction not yet differentiated'", () => {
    const d = makeAssessment({ confidencePosture: "fragmented", routeCount: 1 });
    expect(d.coolPhrase("Portfolio fragmented.")).toMatch(/not yet differentiated/i);
  });

  it("cools 'No route ready to commit' to differentiated language", () => {
    const d = makeAssessment({ confidencePosture: "fragmented", routeCount: 1 });
    expect(d.coolPhrase("No route ready to commit.")).toMatch(/differentiated lead path/i);
  });

  it("cools 'Route clarity absent'", () => {
    const d = makeAssessment({ confidencePosture: "fragmented", routeCount: 1 });
    expect(d.coolPhrase("Route clarity absent.")).toMatch(/still forming/i);
  });

  it("does not cool when no immatureAmbiguity flag", () => {
    const d = makeAssessment({ confidencePosture: "directional", routeCount: 0 });
    const phrase = "Portfolio fragmented.";
    expect(d.coolPhrase(phrase)).toBe(phrase);
  });
});

// ─── 7. assertsTooMuch ────────────────────────────────────────────────────────

describe("assertsTooMuch", () => {
  it("flags 'established' when prematureCertainty active", () => {
    const d = makeAssessment({ confidencePosture: "coherent", register: "stabilized" });
    expect(d.assertsTooMuch("Validation established.")).toBe(true);
  });

  it("flags 'binding constraint' when fresh and discipline is active", () => {
    // coherent + fresh + no proof → prematureCertainty fires → active = true → isFresh check runs
    const d = makeAssessment({ confidencePosture: "coherent", register: "stabilized" });
    expect(d.active).toBe(true);
    expect(d.assertsTooMuch("Validation is the binding constraint.")).toBe(true);
  });

  it("does not flag 'binding constraint' when structural maturity", () => {
    const d = makeAssessment({
      register: "structural_pressure",
      temporalPosture: makeTemporal({ proofGapMaturity: "structural" }),
    });
    expect(d.assertsTooMuch("Validation is the binding constraint.")).toBe(false);
  });

  it("flags 'commitment stage' when escalationWithoutProof", () => {
    const d = makeAssessment({ register: "escalation" });
    expect(d.assertsTooMuch("Fragmented at commitment stage.")).toBe(true);
  });

  it("flags 'scaling without' when escalationWithoutProof", () => {
    const d = makeAssessment({ register: "escalation" });
    expect(d.assertsTooMuch("Direction scaling without validation.")).toBe(true);
  });

  it("returns false for appropriate phrases when no flags active", () => {
    const d = makeAssessment({ confidencePosture: "directional", register: "exploratory" });
    expect(d.assertsTooMuch("Customer validation is still forming.")).toBe(false);
    expect(d.assertsTooMuch("Direction ahead of proof.")).toBe(false);
  });

  it("is a no-op when active = false", () => {
    const d = makeAssessment({
      confidencePosture: "directional",
      register: "exploratory",
      hasCustomerBehavioralProof: false,
    });
    expect(d.active).toBe(false);
    expect(d.assertsTooMuch("Validation established.")).toBe(false);
  });
});

// ─── 8. active flag ───────────────────────────────────────────────────────────

describe("active flag", () => {
  it("is false when no restraint flags fire", () => {
    const d = makeAssessment({
      confidencePosture: "directional",
      register: "exploratory",
      hasCustomerBehavioralProof: false,
      routeCount: 3,
    });
    expect(d.active).toBe(false);
  });

  it("is true when any flag fires", () => {
    const d = makeAssessment({ register: "escalation" });
    expect(d.active).toBe(true);
  });

  it("coolPhrase is a no-op when active = false", () => {
    const d = makeAssessment({ confidencePosture: "directional", register: "exploratory" });
    const phrase = "Positioning coherent across routes.";
    expect(d.coolPhrase(phrase)).toBe(phrase);
  });
});

// ─── 9. disciplinedPostureLabel ───────────────────────────────────────────────

describe("disciplinedPostureLabel", () => {
  it("returns 'Becoming more consistent' for coherent + prematureCertainty", () => {
    const d = makeAssessment({ confidencePosture: "coherent", register: "stabilized" });
    expect(disciplinedPostureLabel("coherent", d)).toBe("Becoming more consistent");
  });

  it("returns 'Beginning to stabilize' for stabilizing + falseConvergence", () => {
    const d = makeAssessment({ confidencePosture: "stabilizing" });
    expect(disciplinedPostureLabel("stabilizing", d)).toBe("Beginning to stabilize");
  });

  it("returns 'Not yet differentiated' for fragmented + immatureAmbiguity", () => {
    const d = makeAssessment({ confidencePosture: "fragmented", routeCount: 1 });
    expect(disciplinedPostureLabel("fragmented", d)).toBe("Not yet differentiated");
  });

  it("returns base label when no relevant flags active", () => {
    const d = makeAssessment({ confidencePosture: "directional" });
    expect(disciplinedPostureLabel("directional", d)).toBe("Directional");
    expect(disciplinedPostureLabel("contradicted", d)).toBe("Contradicted");
    expect(disciplinedPostureLabel("speculative", d)).toBe("Speculative");
  });

  it("returns base label for fragmented when not immatureAmbiguity", () => {
    const d = makeAssessment({ confidencePosture: "fragmented", routeCount: 5 });
    expect(disciplinedPostureLabel("fragmented", d)).toBe("Fragmented");
  });
});

// ─── 10. hasCustomerBehavioralProofFromPosture ────────────────────────────────

describe("hasCustomerBehavioralProofFromPosture", () => {
  it("returns true for grounded posture", () => {
    expect(hasCustomerBehavioralProofFromPosture("grounded")).toBe(true);
  });

  it("returns true for converging posture", () => {
    expect(hasCustomerBehavioralProofFromPosture("converging")).toBe(true);
  });

  it("returns false for inferred posture", () => {
    expect(hasCustomerBehavioralProofFromPosture("inferred")).toBe(false);
  });

  it("returns false for directional posture", () => {
    expect(hasCustomerBehavioralProofFromPosture("directional")).toBe(false);
  });

  it("returns false for null", () => {
    expect(hasCustomerBehavioralProofFromPosture(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(hasCustomerBehavioralProofFromPosture(undefined)).toBe(false);
  });
});

// ─── 11. Structural threshold — no false discipline for mature states ──────────

describe("structural maturity — no premature cooling", () => {
  it("does not flag prematureCertainty when proof gap is structural", () => {
    const d = makeAssessment({
      confidencePosture: "coherent",
      register: "stabilized",
      temporalPosture: makeTemporal({ proofGapMaturity: "structural" }),
    });
    expect(d.restraintFlags.prematureCertainty).toBe(false);
  });

  it("does not flag falseConvergence when proof gap is aging", () => {
    const d = makeAssessment({
      confidencePosture: "stabilizing",
      temporalPosture: makeTemporal({ proofGapMaturity: "aging" }),
    });
    expect(d.restraintFlags.falseConvergence).toBe(false);
  });
});

// ─── 12. Behavioral proof requirement edge cases ──────────────────────────────

describe("behavioral proof edge cases", () => {
  it("grounded posture suppresses all fresh-based flags", () => {
    const d = makeAssessment({
      confidencePosture: "coherent",
      register: "escalation",
      hasCustomerBehavioralProof: true,
    });
    expect(d.restraintFlags.prematureCertainty).toBe(false);
    expect(d.restraintFlags.falseConvergence).toBe(false);
    expect(d.restraintFlags.escalationWithoutProof).toBe(false);
    expect(d.active).toBe(false);
  });
});
