import { describe, expect, it } from "vitest";
import { buildCadenceFrame } from "./executiveCadence";
import type { StrategicChangeSummary } from "@/hooks/useStrategicChangeSummary";
import type { TemporalPosture } from "./strategicTemporalState";
import type { AttentionContext } from "./strategicAttention";
import type { DecisionOperationsContext } from "./decisionOperations";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeChangeSummary(overrides: {
  routes?: number;
  needs?: number;
  desired_outcomes?: number;
  hasEvent?: boolean;
} = {}): StrategicChangeSummary {
  const hasEvent = overrides.hasEvent !== false;
  return {
    latestJobMapEvent: hasEvent
      ? { id: "evt-1", created_at: "2026-05-01T00:00:00Z", company_id: "c1", event_type: "regenerated", object_type: "job_map", source_run_id: "run-1", new_value: { journey_key: "customer" } } as never
      : null,
    affectedArtifacts: [],
    affectedCounts: {
      total: (overrides.routes ?? 0) + (overrides.needs ?? 0) + (overrides.desired_outcomes ?? 0),
      odi_needs: overrides.needs ?? 0,
      routes: overrides.routes ?? 0,
      desired_outcomes: overrides.desired_outcomes ?? 0,
    },
    scoreNote: null,
    debug: {
      latestEventId: hasEvent ? "evt-1" : null,
      latestEventAt: hasEvent ? "2026-05-01T00:00:00Z" : null,
      latestArtifactVersionCount: 0,
      dependenciesCreatedCount: 0,
    },
  };
}

function makeTemporalPosture(
  contradictionPressure: TemporalPosture["contradictionPressure"],
  overrides: Partial<TemporalPosture> = {},
): TemporalPosture {
  return {
    proofGapMaturity: "fresh",
    contradictionPressure,
    momentum: "stable",
    approxCycleCount: 1,
    proofGapEvolvedPhrases: null,
    contradictionEvolvedPhrases: null,
    landscapeEvolution: null,
    customerProofAgingState: "fresh",
    validationCadencePressure: "none",
    ...overrides,
  };
}

function makeAttention(posture: AttentionContext["posture"]): AttentionContext {
  return {
    posture,
    postureLabel: posture,
    dominantConcern: null,
    escalationCollapsed: false,
    signalQuotas: { critical: 0, active: 3, ambient: 3 },
  };
}

function makeDecisionOps(overrides: {
  lifecycleStates?: string[];
  reviewWarranted?: boolean;
} = {}): DecisionOperationsContext {
  const states = overrides.lifecycleStates ?? [];
  return {
    routes: states.map((state, i) => ({
      routeId: `r${i}`,
      lifecycleState: state as never,
      lifecycleLabel: state,
      commitmentMaturity: "intellectually_interesting",
      commitmentMaturityLabel: "Intellectually interesting",
      reviewPressure: { warranted: overrides.reviewWarranted ?? false, note: null },
    })),
    drift: { overcommitted: false, perpetualExploration: false, validationBottleneck: false, driftingCommitment: false, categoryImbalance: false, any: false },
    portfolioGovernanceState: "healthy",
    portfolioGovernanceLabel: "Portfolio governance on track",
    governanceSignals: [],
  };
}

// ─── buildCadenceFrame ────────────────────────────────────────────────────────

describe("buildCadenceFrame", () => {
  it("null changeSummary → no cadence", () => {
    const frame = buildCadenceFrame({
      changeSummary: null,
      temporalPosture: null,
      attention: null,
      decisionOps: null,
    });
    expect(frame.hasCadence).toBe(false);
    expect(frame.sinceLastReview).toBeNull();
  });

  it("changeSummary with no event → no cadence", () => {
    const frame = buildCadenceFrame({
      changeSummary: makeChangeSummary({ hasEvent: false }),
      temporalPosture: null,
      attention: null,
      decisionOps: null,
    });
    expect(frame.hasCadence).toBe(false);
    expect(frame.sinceLastReview).toBeNull();
  });

  it("event with zero affected artifacts + stable temporal → no sinceLastReview", () => {
    const frame = buildCadenceFrame({
      changeSummary: makeChangeSummary({ routes: 0, needs: 0, hasEvent: true }),
      temporalPosture: makeTemporalPosture("none"),
      attention: null,
      decisionOps: null,
    });
    expect(frame.sinceLastReview).toBeNull();
  });

  it("event with routes affected → routes cadence line", () => {
    const frame = buildCadenceFrame({
      changeSummary: makeChangeSummary({ routes: 3, hasEvent: true }),
      temporalPosture: null,
      attention: null,
      decisionOps: null,
    });
    expect(frame.sinceLastReview).toMatch(/3 routes/i);
    expect(frame.hasCadence).toBe(true);
  });

  it("event with needs affected → needs cadence line", () => {
    const frame = buildCadenceFrame({
      changeSummary: makeChangeSummary({ needs: 2, hasEvent: true }),
      temporalPosture: null,
      attention: null,
      decisionOps: null,
    });
    expect(frame.sinceLastReview).toMatch(/2 needs/i);
  });

  it("event with routes + needs → both in cadence line", () => {
    const frame = buildCadenceFrame({
      changeSummary: makeChangeSummary({ routes: 1, needs: 2, hasEvent: true }),
      temporalPosture: null,
      attention: null,
      decisionOps: null,
    });
    expect(frame.sinceLastReview).toMatch(/route/i);
    expect(frame.sinceLastReview).toMatch(/need/i);
  });

  it("event with zero artifacts + entrenched contradiction → entrenched cadence", () => {
    const frame = buildCadenceFrame({
      changeSummary: makeChangeSummary({ routes: 0, hasEvent: true }),
      temporalPosture: makeTemporalPosture("entrenched"),
      attention: null,
      decisionOps: null,
    });
    expect(frame.sinceLastReview).toMatch(/entrenched/i);
    expect(frame.hasCadence).toBe(true);
  });

  it("event with zero artifacts + accumulating contradiction → structural cadence", () => {
    const frame = buildCadenceFrame({
      changeSummary: makeChangeSummary({ routes: 0, hasEvent: true }),
      temporalPosture: makeTemporalPosture("accumulating"),
      attention: null,
      decisionOps: null,
    });
    expect(frame.sinceLastReview).toMatch(/structural/i);
  });

  it("no event but entrenched contradiction → entrenched cadence", () => {
    const frame = buildCadenceFrame({
      changeSummary: null,
      temporalPosture: makeTemporalPosture("entrenched"),
      attention: null,
      decisionOps: null,
    });
    expect(frame.sinceLastReview).toMatch(/entrenched/i);
    expect(frame.hasCadence).toBe(true);
  });

  it("advancing route → readyForCommitment", () => {
    const frame = buildCadenceFrame({
      changeSummary: null,
      temporalPosture: null,
      attention: null,
      decisionOps: makeDecisionOps({ lifecycleStates: ["advancing"] }),
    });
    expect(frame.readyForCommitment).toBe(true);
    expect(frame.hasCadence).toBe(true);
  });

  it("focused attention → requiresLeadershipAttention", () => {
    const frame = buildCadenceFrame({
      changeSummary: null,
      temporalPosture: null,
      attention: makeAttention("focused"),
      decisionOps: null,
    });
    expect(frame.requiresLeadershipAttention).toBe(true);
    expect(frame.hasCadence).toBe(true);
  });

  it("warranted review pressure → requiresLeadershipAttention", () => {
    const frame = buildCadenceFrame({
      changeSummary: null,
      temporalPosture: null,
      attention: null,
      decisionOps: makeDecisionOps({ reviewWarranted: true, lifecycleStates: ["gated"] }),
    });
    expect(frame.requiresLeadershipAttention).toBe(true);
  });

  it("gated routes → counted in unresolved", () => {
    const frame = buildCadenceFrame({
      changeSummary: null,
      temporalPosture: null,
      attention: null,
      decisionOps: makeDecisionOps({ lifecycleStates: ["gated", "stalled", "validating"] }),
    });
    expect(frame.unresolved).toBe(2);
  });

  it("singular route wording", () => {
    const frame = buildCadenceFrame({
      changeSummary: makeChangeSummary({ routes: 1, hasEvent: true }),
      temporalPosture: null,
      attention: null,
      decisionOps: null,
    });
    expect(frame.sinceLastReview).toMatch(/1 route[^s]/);
  });
});

// ─── Phase 44 — validation cadence pressure ───────────────────────────────────

describe("buildCadenceFrame — validation cadence pressure", () => {
  it("urgent pressure with no change event → surfaces staleness in sinceLastReview", () => {
    const frame = buildCadenceFrame({
      changeSummary: null,
      temporalPosture: makeTemporalPosture("none", { validationCadencePressure: "urgent" }),
      attention: null,
      decisionOps: null,
    });
    expect(frame.sinceLastReview).toMatch(/customer validation/i);
    expect(frame.sinceLastReview).toMatch(/stale|reality/i);
    expect(frame.hasCadence).toBe(true);
  });

  it("warming pressure with no change event → surfaces aging in sinceLastReview", () => {
    const frame = buildCadenceFrame({
      changeSummary: null,
      temporalPosture: makeTemporalPosture("none", { validationCadencePressure: "warming" }),
      attention: null,
      decisionOps: null,
    });
    expect(frame.sinceLastReview).toMatch(/aging/i);
    expect(frame.hasCadence).toBe(true);
  });

  it("urgent pressure with event but zero artifacts → surfaces staleness", () => {
    const frame = buildCadenceFrame({
      changeSummary: makeChangeSummary({ routes: 0, hasEvent: true }),
      temporalPosture: makeTemporalPosture("none", { validationCadencePressure: "urgent" }),
      attention: null,
      decisionOps: null,
    });
    expect(frame.sinceLastReview).toMatch(/customer validation/i);
  });

  it("none pressure → no cadence from aging alone", () => {
    const frame = buildCadenceFrame({
      changeSummary: null,
      temporalPosture: makeTemporalPosture("none", { validationCadencePressure: "none" }),
      attention: null,
      decisionOps: null,
    });
    expect(frame.sinceLastReview).toBeNull();
    expect(frame.hasCadence).toBe(false);
  });

  it("entrenched contradiction takes priority over warming cadence", () => {
    const frame = buildCadenceFrame({
      changeSummary: makeChangeSummary({ routes: 0, hasEvent: true }),
      temporalPosture: makeTemporalPosture("entrenched", { validationCadencePressure: "warming" }),
      attention: null,
      decisionOps: null,
    });
    // Entrenched should appear first (it's checked before cadence pressure)
    expect(frame.sinceLastReview).toMatch(/entrenched/i);
    expect(frame.sinceLastReview).not.toMatch(/aging/i);
  });

  it("urgent cadence text is distinct from warming cadence text", () => {
    const urgent = buildCadenceFrame({
      changeSummary: null,
      temporalPosture: makeTemporalPosture("none", { validationCadencePressure: "urgent" }),
      attention: null,
      decisionOps: null,
    });
    const warming = buildCadenceFrame({
      changeSummary: null,
      temporalPosture: makeTemporalPosture("none", { validationCadencePressure: "warming" }),
      attention: null,
      decisionOps: null,
    });
    expect(urgent.sinceLastReview).not.toBe(warming.sinceLastReview);
    expect(urgent.sinceLastReview).not.toBeNull();
    expect(warming.sinceLastReview).not.toBeNull();
  });
});
