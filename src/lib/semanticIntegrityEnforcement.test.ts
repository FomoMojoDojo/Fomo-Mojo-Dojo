import { describe, it, expect } from "vitest";
import { deriveSemanticEnforcement } from "@/lib/semanticIntegrityEnforcement";
import type { SemanticIntegrity, SemanticViolation } from "@/lib/semanticIntegrity";
import type { ExecutiveRegister } from "@/lib/executiveRegister";
import type { AttentionPosture } from "@/lib/strategicAttention";
import type { UnifiedConfidencePosture } from "@/lib/strategicCenterSurface";
import type { OperatingMode } from "@/lib/operatingMode";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeIntegrity(violations: SemanticViolation[]): SemanticIntegrity {
  const blocking = violations.filter((v) => v.severity === "blocking").length;
  const warning  = violations.filter((v) => v.severity === "warning").length;
  const advisory = violations.filter((v) => v.severity === "advisory").length;
  const trustScore = Math.max(0, Math.min(100, 100 - blocking * 30 - warning * 10 - advisory * 3));
  return {
    violations,
    isClean: violations.length === 0,
    blockingCount: blocking,
    warningCount: warning,
    advisoryCount: advisory,
    trustScore,
  };
}

function violation(
  code: string,
  severity: SemanticViolation["severity"],
  layers: string[] = ["test"],
): SemanticViolation {
  return { code, severity, description: `${code} test violation`, layers };
}

const CLEAN = makeIntegrity([]);

function enforce(
  integrity: SemanticIntegrity,
  opts: {
    register?: ExecutiveRegister;
    attentionPosture?: AttentionPosture;
    confidencePosture?: UnifiedConfidencePosture;
    operatingMode?: OperatingMode;
  } = {},
) {
  return deriveSemanticEnforcement({
    integrity,
    register:          opts.register          ?? "converging",
    attentionPosture:  opts.attentionPosture  ?? "stable",
    confidencePosture: opts.confidencePosture ?? "coherent",
    operatingMode:     opts.operatingMode     ?? "diagnose",
  });
}

// ─── Clean audit — no enforcement ────────────────────────────────────────────

describe("clean audit", () => {
  it("returns raw state unchanged when no violations", () => {
    const result = enforce(CLEAN, { register: "stabilized", attentionPosture: "focused" });
    expect(result.safeRegister).toBe("stabilized");
    expect(result.safeAttentionPosture).toBe("focused");
    expect(result.suppressCommitmentLanguage).toBe(false);
    expect(result.suppressStructuralLanguage).toBe(false);
    expect(result.forceCustomerProofVisibility).toBe(false);
    expect(result.suppressFocusedLandscape).toBe(false);
    expect(result.safeModeDescriptor).toBeNull();
    expect(result.appliedCorrections).toHaveLength(0);
  });

  it("advisory-only violations receive no enforcement", () => {
    const integrity = makeIntegrity([
      violation("SOME_ADVISORY", "advisory"),
    ]);
    const result = enforce(integrity, { register: "escalation", attentionPosture: "focused" });
    expect(result.safeRegister).toBe("escalation");
    expect(result.safeAttentionPosture).toBe("focused");
    expect(result.suppressCommitmentLanguage).toBe(false);
    expect(result.appliedCorrections).toHaveLength(0);
  });
});

// ─── Commitment language suppression ─────────────────────────────────────────

describe("COMMITMENT_WITHOUT_BEHAVIORAL_PROOF", () => {
  it("suppresses commitment language", () => {
    const integrity = makeIntegrity([
      violation("COMMITMENT_WITHOUT_BEHAVIORAL_PROOF", "blocking"),
    ]);
    const result = enforce(integrity);
    expect(result.suppressCommitmentLanguage).toBe(true);
  });

  it("downgrades escalation register to structural_pressure", () => {
    const integrity = makeIntegrity([
      violation("COMMITMENT_WITHOUT_BEHAVIORAL_PROOF", "blocking"),
    ]);
    const result = enforce(integrity, { register: "escalation" });
    expect(result.safeRegister).toBe("structural_pressure");
  });

  it("does not upgrade a lower register", () => {
    const integrity = makeIntegrity([
      violation("COMMITMENT_WITHOUT_BEHAVIORAL_PROOF", "blocking"),
    ]);
    const result = enforce(integrity, { register: "converging" });
    expect(result.safeRegister).toBe("converging");
  });

  it("sets safeModeDescriptor to 'Commitment review' in decide mode", () => {
    const integrity = makeIntegrity([
      violation("COMMITMENT_WITHOUT_BEHAVIORAL_PROOF", "blocking"),
    ]);
    const result = enforce(integrity, { operatingMode: "decide" });
    expect(result.safeModeDescriptor).toBe("Commitment review");
  });

  it("no safeModeDescriptor override outside decide mode", () => {
    const integrity = makeIntegrity([
      violation("COMMITMENT_WITHOUT_BEHAVIORAL_PROOF", "blocking"),
    ]);
    const result = enforce(integrity, { operatingMode: "diagnose" });
    expect(result.safeModeDescriptor).toBeNull();
  });
});

// ─── Focused posture downgrade ────────────────────────────────────────────────

describe("FOCUSED_WITHOUT_DOMINANT_CONCERN", () => {
  it("downgrades focused posture to watchful", () => {
    const integrity = makeIntegrity([
      violation("FOCUSED_WITHOUT_DOMINANT_CONCERN", "blocking"),
    ]);
    const result = enforce(integrity, { attentionPosture: "focused" });
    expect(result.safeAttentionPosture).toBe("watchful");
  });

  it("suppresses focused landscape", () => {
    const integrity = makeIntegrity([
      violation("FOCUSED_WITHOUT_DOMINANT_CONCERN", "blocking"),
    ]);
    const result = enforce(integrity, { attentionPosture: "focused" });
    expect(result.suppressFocusedLandscape).toBe(true);
  });

  it("does not upgrade a less assertive posture", () => {
    const integrity = makeIntegrity([
      violation("FOCUSED_WITHOUT_DOMINANT_CONCERN", "blocking"),
    ]);
    const result = enforce(integrity, { attentionPosture: "stable" });
    expect(result.safeAttentionPosture).toBe("stable");
  });
});

// ─── Structural language suppression ─────────────────────────────────────────

describe("STABILIZING_WITH_ACTIVE_CONTRADICTION", () => {
  it("suppresses structural language", () => {
    const integrity = makeIntegrity([
      violation("STABILIZING_WITH_ACTIVE_CONTRADICTION", "blocking"),
    ]);
    const result = enforce(integrity);
    expect(result.suppressStructuralLanguage).toBe(true);
  });

  it("downgrades stabilized register to converging", () => {
    const integrity = makeIntegrity([
      violation("STABILIZING_WITH_ACTIVE_CONTRADICTION", "blocking"),
    ]);
    const result = enforce(integrity, { register: "stabilized" });
    expect(result.safeRegister).toBe("converging");
  });
});

// ─── Warning — register downgrades ────────────────────────────────────────────

describe("STABILIZED_REGISTER_WITHOUT_PROOF", () => {
  it("downgrades stabilized to converging", () => {
    const integrity = makeIntegrity([
      violation("STABILIZED_REGISTER_WITHOUT_PROOF", "warning"),
    ]);
    const result = enforce(integrity, { register: "stabilized" });
    expect(result.safeRegister).toBe("converging");
  });
});

describe("STABILIZED_REGISTER_WITH_GOVERNANCE_DRIFT", () => {
  it("downgrades stabilized to converging", () => {
    const integrity = makeIntegrity([
      violation("STABILIZED_REGISTER_WITH_GOVERNANCE_DRIFT", "warning"),
    ]);
    const result = enforce(integrity, { register: "stabilized" });
    expect(result.safeRegister).toBe("converging");
  });
});

describe("STABILIZED_REGISTER_WEAKENING_MOMENTUM", () => {
  it("downgrades escalation to structural_pressure", () => {
    // structural_pressure (conservatism=4) is less conservative than escalation (5),
    // so this downgrade only fires when starting at escalation.
    const integrity = makeIntegrity([
      violation("STABILIZED_REGISTER_WEAKENING_MOMENTUM", "warning"),
    ]);
    const result = enforce(integrity, { register: "escalation" });
    expect(result.safeRegister).toBe("structural_pressure");
  });

  it("does not change stabilized (already more conservative than structural_pressure)", () => {
    const integrity = makeIntegrity([
      violation("STABILIZED_REGISTER_WEAKENING_MOMENTUM", "warning"),
    ]);
    const result = enforce(integrity, { register: "stabilized" });
    expect(result.safeRegister).toBe("stabilized");
  });
});

describe("STRUCTURAL_PRESSURE_FRESH_STATE", () => {
  it("suppresses structural language and downgrades to converging", () => {
    const integrity = makeIntegrity([
      violation("STRUCTURAL_PRESSURE_FRESH_STATE", "warning"),
    ]);
    const result = enforce(integrity, { register: "structural_pressure" });
    expect(result.suppressStructuralLanguage).toBe(true);
    expect(result.safeRegister).toBe("converging");
  });
});

describe("STRUCTURAL_CLAIM_ISOLATED_CONTRADICTION", () => {
  it("suppresses structural language and downgrades to converging", () => {
    const integrity = makeIntegrity([
      violation("STRUCTURAL_CLAIM_ISOLATED_CONTRADICTION", "warning"),
    ]);
    const result = enforce(integrity, { register: "structural_pressure" });
    expect(result.suppressStructuralLanguage).toBe(true);
    expect(result.safeRegister).toBe("converging");
  });
});

describe("PROOF_ABSENT_STABLE_POSTURE", () => {
  it("forces customer proof visibility", () => {
    const integrity = makeIntegrity([
      violation("PROOF_ABSENT_STABLE_POSTURE", "warning"),
    ]);
    const result = enforce(integrity, { attentionPosture: "stable" });
    expect(result.forceCustomerProofVisibility).toBe(true);
  });

  it("downgrades focused posture to watchful", () => {
    // watchful (assertiveness=2) is less assertive than focused (3), so fires from focused.
    // stable (assertiveness=1) is already less assertive than watchful — stays stable.
    const integrity = makeIntegrity([
      violation("PROOF_ABSENT_STABLE_POSTURE", "warning"),
    ]);
    const result = enforce(integrity, { attentionPosture: "focused" });
    expect(result.safeAttentionPosture).toBe("watchful");
  });
});

describe("ESCALATION_REGISTER_COOLED_BY_DISCIPLINE", () => {
  it("downgrades escalation to structural_pressure", () => {
    const integrity = makeIntegrity([
      violation("ESCALATION_REGISTER_COOLED_BY_DISCIPLINE", "warning"),
    ]);
    const result = enforce(integrity, { register: "escalation" });
    expect(result.safeRegister).toBe("structural_pressure");
  });
});

describe("STABLE_POSTURE_ESCALATION_REGISTER", () => {
  it("downgrades escalation to structural_pressure", () => {
    const integrity = makeIntegrity([
      violation("STABLE_POSTURE_ESCALATION_REGISTER", "warning"),
    ]);
    const result = enforce(integrity, { register: "escalation" });
    expect(result.safeRegister).toBe("structural_pressure");
  });
});

describe("DECAY_NOTE_WITH_FOCUSED_POSTURE", () => {
  it("suppresses focused landscape", () => {
    const integrity = makeIntegrity([
      violation("DECAY_NOTE_WITH_FOCUSED_POSTURE", "warning"),
    ]);
    const result = enforce(integrity, { attentionPosture: "focused" });
    expect(result.suppressFocusedLandscape).toBe(true);
  });

  it("does not downgrade posture (posture is not touched by this check)", () => {
    const integrity = makeIntegrity([
      violation("DECAY_NOTE_WITH_FOCUSED_POSTURE", "warning"),
    ]);
    const result = enforce(integrity, { attentionPosture: "focused" });
    expect(result.safeAttentionPosture).toBe("focused");
  });
});

// ─── Register conservatism — only moves down ─────────────────────────────────

describe("register only moves in conservative direction", () => {
  it("exploratory never upgrades", () => {
    // STABILIZED_REGISTER_WEAKENING_MOMENTUM would try to downgrade to structural_pressure,
    // but if starting register is exploratory (more conservative) it stays.
    const integrity = makeIntegrity([
      violation("STABILIZED_REGISTER_WEAKENING_MOMENTUM", "warning"),
    ]);
    const result = enforce(integrity, { register: "exploratory" });
    expect(result.safeRegister).toBe("exploratory");
  });

  it("converging stays converging when multiple checks all target converging", () => {
    const integrity = makeIntegrity([
      violation("STABILIZED_REGISTER_WITHOUT_PROOF", "warning"),
      violation("STABILIZED_REGISTER_WITH_GOVERNANCE_DRIFT", "warning"),
    ]);
    const result = enforce(integrity, { register: "stabilized" });
    expect(result.safeRegister).toBe("converging");
  });
});

// ─── Posture conservatism — only moves toward less assertive ─────────────────

describe("posture only moves toward less assertive", () => {
  it("stable posture is never upgraded to focused by any check", () => {
    const integrity = makeIntegrity([
      violation("FOCUSED_WITHOUT_DOMINANT_CONCERN", "blocking"),
      violation("PROOF_ABSENT_STABLE_POSTURE", "warning"),
    ]);
    const result = enforce(integrity, { attentionPosture: "stable" });
    // stable (assertiveness=1) wins over watchful (assertiveness=2)
    expect(result.safeAttentionPosture).toBe("stable");
  });

  it("focused posture reduced by two independent checks takes the minimum", () => {
    const integrity = makeIntegrity([
      violation("FOCUSED_WITHOUT_DOMINANT_CONCERN", "blocking"),
      violation("PROOF_ABSENT_STABLE_POSTURE", "warning"),
    ]);
    const result = enforce(integrity, { attentionPosture: "focused" });
    // both push to watchful — result is watchful, not stable
    expect(result.safeAttentionPosture).toBe("watchful");
  });
});

// ─── Multiple violations — most conservative outcome wins ─────────────────────

describe("multiple violations — most conservative wins", () => {
  it("blocking + warning both fire — blocking takes precedence on register", () => {
    const integrity = makeIntegrity([
      violation("COMMITMENT_WITHOUT_BEHAVIORAL_PROOF", "blocking"),   // → structural_pressure
      violation("STABILIZED_REGISTER_WITHOUT_PROOF", "warning"),      // → converging (more conservative)
    ]);
    const result = enforce(integrity, { register: "escalation" });
    // converging is more conservative than structural_pressure
    expect(result.safeRegister).toBe("converging");
  });

  it("suppression flags accumulate independently", () => {
    const integrity = makeIntegrity([
      violation("STABILIZING_WITH_ACTIVE_CONTRADICTION", "blocking"),
      violation("STRUCTURAL_PRESSURE_FRESH_STATE", "warning"),
    ]);
    const result = enforce(integrity, { register: "structural_pressure" });
    expect(result.suppressStructuralLanguage).toBe(true);
    expect(result.safeRegister).toBe("converging");
  });

  it("commitment suppression + focused landscape suppression both active", () => {
    const integrity = makeIntegrity([
      violation("COMMITMENT_WITHOUT_BEHAVIORAL_PROOF", "blocking"),
      violation("FOCUSED_WITHOUT_DOMINANT_CONCERN", "blocking"),
    ]);
    const result = enforce(integrity, { attentionPosture: "focused", operatingMode: "decide" });
    expect(result.suppressCommitmentLanguage).toBe(true);
    expect(result.suppressFocusedLandscape).toBe(true);
    expect(result.safeModeDescriptor).toBe("Commitment review");
  });
});

// ─── Audit trail ─────────────────────────────────────────────────────────────

describe("appliedCorrections audit trail", () => {
  it("records corrections when enforcement fires", () => {
    const integrity = makeIntegrity([
      violation("COMMITMENT_WITHOUT_BEHAVIORAL_PROOF", "blocking"),
    ]);
    const result = enforce(integrity, { register: "escalation", operatingMode: "decide" });
    expect(result.appliedCorrections.length).toBeGreaterThan(0);
    const joined = result.appliedCorrections.join(" ");
    expect(joined).toContain("COMMITMENT_WITHOUT_BEHAVIORAL_PROOF");
  });

  it("no corrections when audit is clean", () => {
    const result = enforce(CLEAN);
    expect(result.appliedCorrections).toHaveLength(0);
  });
});
