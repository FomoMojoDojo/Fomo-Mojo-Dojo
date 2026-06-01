import { describe, expect, it } from "vitest";
import {
  scoreSignalPriority,
  buildAttentionContext,
  SIGNAL_QUOTAS,
  ATTENTION_POSTURE_LABELS,
  type AttentionPosture,
  type AttentionPriority,
} from "./strategicAttention";
import type { ExecutiveRegister } from "./executiveRegister";
import type { DisciplineAssessment } from "./confidenceDiscipline";
import type { GovernanceDrift } from "./decisionOperations";
import type { TemporalPosture } from "./strategicTemporalState";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSignal(overrides: {
  pressure?: "low" | "medium" | "high";
  relevance?: string;
  polarity?: string;
} = {}) {
  return {
    pressure: overrides.pressure ?? "medium" as "low" | "medium" | "high",
    relevance: overrides.relevance ?? "strategic_direction",
    polarity: overrides.polarity ?? "reinforcing",
  };
}

function makeDrift(overrides: Partial<GovernanceDrift> = {}): GovernanceDrift {
  return {
    overcommitted: false,
    perpetualExploration: false,
    validationBottleneck: false,
    driftingCommitment: false,
    categoryImbalance: false,
    any: false,
    ...overrides,
  };
}

function makeDiscipline(overrides: {
  escalationWithoutProof?: boolean;
  prematureCertainty?: boolean;
  falseConvergence?: boolean;
} = {}): DisciplineAssessment {
  const flags = {
    prematureCertainty: overrides.prematureCertainty ?? false,
    falseConvergence: overrides.falseConvergence ?? false,
    escalationWithoutProof: overrides.escalationWithoutProof ?? false,
    immatureAmbiguity: false,
  };
  return {
    restraintFlags: flags,
    cooledRegister: "converging",
    active: Object.values(flags).some(Boolean),
    coolPhrase: (p: string) => p,
    assertsTooMuch: () => false,
  };
}

function makeTemporalPosture(overrides: {
  contradictionPressure?: TemporalPosture["contradictionPressure"];
} = {}): TemporalPosture {
  return {
    proofGapDuration: "fresh",
    contradictionPressure: overrides.contradictionPressure ?? "none",
    proofGapEvolvedPhrases: null,
    contradictionEvolvedPhrases: null,
    landscapeEvolution: {},
  };
}

// ─── scoreSignalPriority ──────────────────────────────────────────────────────

describe("scoreSignalPriority", () => {
  it("high pressure + commitment_pressure → critical", () => {
    const sig = makeSignal({ pressure: "high", relevance: "commitment_pressure" });
    expect(scoreSignalPriority(sig, "stable")).toBe("critical");
  });

  it("high pressure + contradictory polarity → critical", () => {
    const sig = makeSignal({ pressure: "high", polarity: "contradictory" });
    expect(scoreSignalPriority(sig, "stable")).toBe("critical");
  });

  it("high pressure + non-critical combo → active", () => {
    const sig = makeSignal({ pressure: "high", relevance: "strategic_direction", polarity: "reinforcing" });
    expect(scoreSignalPriority(sig, "stable")).toBe("active");
  });

  it("blocked polarity → active regardless of pressure", () => {
    const sig = makeSignal({ pressure: "low", polarity: "blocked" });
    expect(scoreSignalPriority(sig, "stable")).toBe("active");
  });

  it("accelerating polarity → active", () => {
    const sig = makeSignal({ pressure: "low", polarity: "accelerating" });
    expect(scoreSignalPriority(sig, "stable")).toBe("active");
  });

  it("medium pressure + non-critical → active", () => {
    const sig = makeSignal({ pressure: "medium" });
    expect(scoreSignalPriority(sig, "stable")).toBe("active");
  });

  it("low pressure + stable polarity → ambient in stable posture", () => {
    const sig = makeSignal({ pressure: "low", polarity: "reinforcing" });
    expect(scoreSignalPriority(sig, "stable")).toBe("ambient");
  });

  it("low pressure in focused posture → suppressed", () => {
    const sig = makeSignal({ pressure: "low" });
    expect(scoreSignalPriority(sig, "focused")).toBe("suppressed");
  });

  it("low pressure in fragmented posture → suppressed", () => {
    const sig = makeSignal({ pressure: "low" });
    expect(scoreSignalPriority(sig, "fragmented")).toBe("suppressed");
  });

  it("low pressure in watchful posture → ambient (not suppressed)", () => {
    const sig = makeSignal({ pressure: "low", polarity: "reinforcing" });
    expect(scoreSignalPriority(sig, "watchful")).toBe("ambient");
  });
});

// ─── SIGNAL_QUOTAS ────────────────────────────────────────────────────────────

describe("SIGNAL_QUOTAS", () => {
  const postures: AttentionPosture[] = ["focused", "watchful", "stable", "fragmented"];

  it("all postures have quotas", () => {
    for (const p of postures) {
      expect(SIGNAL_QUOTAS[p]).toBeTruthy();
      expect(typeof SIGNAL_QUOTAS[p].critical).toBe("number");
      expect(typeof SIGNAL_QUOTAS[p].active).toBe("number");
      expect(typeof SIGNAL_QUOTAS[p].ambient).toBe("number");
    }
  });

  it("focused: max 1 critical", () => {
    expect(SIGNAL_QUOTAS.focused.critical).toBe(1);
  });

  it("stable: 0 critical (ambient-only)", () => {
    expect(SIGNAL_QUOTAS.stable.critical).toBe(0);
  });

  it("fragmented: 0 critical, 1 ambient (noise reduction)", () => {
    expect(SIGNAL_QUOTAS.fragmented.critical).toBe(0);
    expect(SIGNAL_QUOTAS.fragmented.ambient).toBe(1);
  });
});

// ─── ATTENTION_POSTURE_LABELS ─────────────────────────────────────────────────

describe("ATTENTION_POSTURE_LABELS", () => {
  it("all postures have labels", () => {
    const postures: AttentionPosture[] = ["focused", "watchful", "stable", "fragmented"];
    for (const p of postures) {
      expect(ATTENTION_POSTURE_LABELS[p]).toBeTruthy();
    }
  });
});

// ─── buildAttentionContext — posture derivation ───────────────────────────────

describe("buildAttentionContext — posture", () => {
  const base = {
    register: "converging" as ExecutiveRegister,
    discipline: null,
    temporalPosture: null,
    governanceDrift: makeDrift(),
    routeDecisions: [],
  };

  it("no signals → stable posture", () => {
    const ctx = buildAttentionContext(base);
    expect(ctx.posture).toBe("stable");
  });

  it("re-evaluating route → focused", () => {
    const ctx = buildAttentionContext({
      ...base,
      routeDecisions: [{ lifecycleState: "re-evaluating", commitmentState: "commit" }],
    });
    expect(ctx.posture).toBe("focused");
  });

  it("escalation register + escalationWithoutProof → focused", () => {
    const ctx = buildAttentionContext({
      ...base,
      register: "escalation",
      discipline: makeDiscipline({ escalationWithoutProof: true }),
    });
    expect(ctx.posture).toBe("focused");
  });

  it("overcommitted + driftingCommitment → focused", () => {
    const ctx = buildAttentionContext({
      ...base,
      governanceDrift: makeDrift({ overcommitted: true, driftingCommitment: true, any: true }),
    });
    expect(ctx.posture).toBe("focused");
  });

  it("structural contradiction + committed route → focused", () => {
    const ctx = buildAttentionContext({
      ...base,
      temporalPosture: makeTemporalPosture({ contradictionPressure: "structural" }),
      routeDecisions: [{ lifecycleState: "committed", commitmentState: "commit" }],
    });
    expect(ctx.posture).toBe("focused");
  });

  it("structural_pressure register → watchful", () => {
    const ctx = buildAttentionContext({
      ...base,
      register: "structural_pressure",
    });
    expect(ctx.posture).toBe("watchful");
  });

  it("one governance drift flag (not overcommitted) → watchful", () => {
    const ctx = buildAttentionContext({
      ...base,
      governanceDrift: makeDrift({ validationBottleneck: true, any: true }),
    });
    expect(ctx.posture).toBe("watchful");
  });

  it("prematureCertainty + falseConvergence + accumulating contradiction → fragmented (3+ active)", () => {
    const ctx = buildAttentionContext({
      ...base,
      discipline: makeDiscipline({ prematureCertainty: true, falseConvergence: true }),
      temporalPosture: makeTemporalPosture({ contradictionPressure: "accumulating" }),
    });
    expect(ctx.posture).toBe("fragmented");
  });

  it("posture labels are set from ATTENTION_POSTURE_LABELS", () => {
    const ctx = buildAttentionContext(base);
    expect(ctx.postureLabel).toBe(ATTENTION_POSTURE_LABELS[ctx.posture]);
  });
});

// ─── buildAttentionContext — dominant concern ─────────────────────────────────

describe("buildAttentionContext — dominantConcern", () => {
  it("stable state → null dominant concern", () => {
    const ctx = buildAttentionContext({
      register: "converging",
      discipline: null,
      temporalPosture: null,
      governanceDrift: makeDrift(),
      routeDecisions: [],
    });
    expect(ctx.dominantConcern).toBeNull();
  });

  it("re-evaluating route → committed route contradicted concern", () => {
    const ctx = buildAttentionContext({
      register: "converging",
      discipline: null,
      temporalPosture: null,
      governanceDrift: makeDrift(),
      routeDecisions: [{ lifecycleState: "re-evaluating", commitmentState: "commit" }],
    });
    expect(ctx.dominantConcern).toMatch(/re-evaluation warranted/i);
  });

  it("escalation register + escalationWithoutProof → commitment pressure rising concern", () => {
    const ctx = buildAttentionContext({
      register: "escalation",
      discipline: makeDiscipline({ escalationWithoutProof: true }),
      temporalPosture: null,
      governanceDrift: makeDrift(),
      routeDecisions: [],
    });
    expect(ctx.dominantConcern).toMatch(/commitment pressure rising/i);
  });

  it("overcommitted + driftingCommitment → portfolio committed without validation", () => {
    const ctx = buildAttentionContext({
      register: "converging",
      discipline: null,
      temporalPosture: null,
      governanceDrift: makeDrift({ overcommitted: true, driftingCommitment: true, any: true }),
      routeDecisions: [],
    });
    expect(ctx.dominantConcern).toMatch(/portfolio committed without customer validation/i);
  });

  it("structural_pressure register (no critical flags) → validation is the constraint", () => {
    const ctx = buildAttentionContext({
      register: "structural_pressure",
      discipline: null,
      temporalPosture: null,
      governanceDrift: makeDrift(),
      routeDecisions: [],
    });
    expect(ctx.dominantConcern).toMatch(/validation is the active constraint/i);
  });

  it("validationBottleneck (no critical flags) → validation bottleneck concern", () => {
    const ctx = buildAttentionContext({
      register: "converging",
      discipline: null,
      temporalPosture: null,
      governanceDrift: makeDrift({ validationBottleneck: true, any: true }),
      routeDecisions: [],
    });
    expect(ctx.dominantConcern).toMatch(/validation bottleneck/i);
  });
});

// ─── buildAttentionContext — escalationCollapsed ──────────────────────────────

describe("buildAttentionContext — escalationCollapsed", () => {
  it("stable state → not collapsed", () => {
    const ctx = buildAttentionContext({
      register: "converging",
      discipline: null,
      temporalPosture: null,
      governanceDrift: makeDrift(),
      routeDecisions: [],
    });
    expect(ctx.escalationCollapsed).toBe(false);
  });

  it("two or more critical flags → collapsed", () => {
    const ctx = buildAttentionContext({
      register: "escalation",
      discipline: makeDiscipline({ escalationWithoutProof: true }),
      temporalPosture: null,
      governanceDrift: makeDrift({ overcommitted: true, driftingCommitment: true, any: true }),
      routeDecisions: [],
    });
    // Two critical flags: (escalation+escalationWithoutProof) + (overcommitted+driftingCommitment)
    expect(ctx.escalationCollapsed).toBe(true);
  });

  it("overcommitted + escalationWithoutProof → collapsed", () => {
    const ctx = buildAttentionContext({
      register: "converging",
      discipline: makeDiscipline({ escalationWithoutProof: true }),
      temporalPosture: null,
      governanceDrift: makeDrift({ overcommitted: true, any: true }),
      routeDecisions: [],
    });
    expect(ctx.escalationCollapsed).toBe(true);
  });
});

// ─── buildAttentionContext — signalQuotas ─────────────────────────────────────

describe("buildAttentionContext — signalQuotas", () => {
  it("stable posture → SIGNAL_QUOTAS.stable", () => {
    const ctx = buildAttentionContext({
      register: "converging",
      discipline: null,
      temporalPosture: null,
      governanceDrift: makeDrift(),
      routeDecisions: [],
    });
    expect(ctx.signalQuotas).toEqual(SIGNAL_QUOTAS.stable);
  });

  it("focused posture → SIGNAL_QUOTAS.focused", () => {
    const ctx = buildAttentionContext({
      register: "converging",
      discipline: null,
      temporalPosture: null,
      governanceDrift: makeDrift(),
      routeDecisions: [{ lifecycleState: "re-evaluating", commitmentState: "commit" }],
    });
    expect(ctx.signalQuotas).toEqual(SIGNAL_QUOTAS.focused);
  });
});
