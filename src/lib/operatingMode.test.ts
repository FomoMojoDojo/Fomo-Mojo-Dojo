import { describe, expect, it } from "vitest";
import {
  deriveDefaultMode,
  MODE_CONTENT,
  OPERATING_MODE_LABELS,
  OPERATING_MODE_DESCRIPTIONS,
  type OperatingMode,
} from "./operatingMode";
import type { AttentionContext, AttentionPosture } from "./strategicAttention";
import type { DecisionOperationsContext } from "./decisionOperations";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeAttention(posture: AttentionPosture): AttentionContext {
  return {
    posture,
    postureLabel: posture,
    dominantConcern: null,
    escalationCollapsed: false,
    signalQuotas: { critical: 0, active: 3, ambient: 3 },
  };
}

function makeDecisionOps(lifecycleStates: string[] = []): DecisionOperationsContext {
  return {
    routes: lifecycleStates.map((state, i) => ({
      routeId: `r${i}`,
      lifecycleState: state as never,
      lifecycleLabel: state,
      commitmentMaturity: "intellectually_interesting",
      commitmentMaturityLabel: "Intellectually interesting",
      reviewPressure: { warranted: false, note: null },
    })),
    drift: {
      overcommitted: false,
      perpetualExploration: false,
      validationBottleneck: false,
      driftingCommitment: false,
      categoryImbalance: false,
      any: false,
    },
    portfolioGovernanceState: "healthy",
    portfolioGovernanceLabel: "Portfolio governance on track",
    governanceSignals: [],
  };
}

// ─── MODE_CONTENT ──────────────────────────────────────────────────────────────

describe("MODE_CONTENT", () => {
  const modes: OperatingMode[] = ["scan", "diagnose", "decide", "monitor"];

  it("all modes have content config", () => {
    for (const mode of modes) {
      expect(MODE_CONTENT[mode]).toBeTruthy();
    }
  });

  it("scan: max 4 signals, no hypotheses, no movement, no landscape, max 1 route", () => {
    expect(MODE_CONTENT.scan.maxSignals).toBe(4);
    expect(MODE_CONTENT.scan.showHypotheses).toBe(false);
    expect(MODE_CONTENT.scan.showMovement).toBe(false);
    expect(MODE_CONTENT.scan.showConfidenceLandscape).toBe(false);
    expect(MODE_CONTENT.scan.maxRoutes).toBe(1);
  });

  it("diagnose: no signal cap, full sections open, contradictions expanded", () => {
    expect(MODE_CONTENT.diagnose.maxSignals).toBeNull();
    expect(MODE_CONTENT.diagnose.showHypotheses).toBe(true);
    expect(MODE_CONTENT.diagnose.showMovement).toBe(true);
    expect(MODE_CONTENT.diagnose.showConfidenceLandscape).toBe(true);
    expect(MODE_CONTENT.diagnose.expandContradictions).toBe(true);
  });

  it("decide: signal cap 5, no hypotheses, no movement, routes emphasized", () => {
    expect(MODE_CONTENT.decide.maxSignals).toBe(5);
    expect(MODE_CONTENT.decide.showHypotheses).toBe(false);
    expect(MODE_CONTENT.decide.showMovement).toBe(false);
    expect(MODE_CONTENT.decide.emphasizeRoutes).toBe(true);
    expect(MODE_CONTENT.decide.expandContradictions).toBe(true);
  });

  it("monitor: no route cap, movement shown, landscape shown", () => {
    expect(MODE_CONTENT.monitor.maxRoutes).toBeNull();
    expect(MODE_CONTENT.monitor.showMovement).toBe(true);
    expect(MODE_CONTENT.monitor.showConfidenceLandscape).toBe(true);
    expect(MODE_CONTENT.monitor.showHypotheses).toBe(false);
  });
});

// ─── OPERATING_MODE_LABELS / DESCRIPTIONS ────────────────────────────────────

describe("OPERATING_MODE_LABELS", () => {
  const modes: OperatingMode[] = ["scan", "diagnose", "decide", "monitor"];

  it("all modes have uppercase labels", () => {
    for (const mode of modes) {
      const label = OPERATING_MODE_LABELS[mode];
      expect(label).toBeTruthy();
      expect(label).toBe(label.toUpperCase());
    }
  });

  it("all modes have descriptions", () => {
    for (const mode of modes) {
      expect(OPERATING_MODE_DESCRIPTIONS[mode]).toBeTruthy();
    }
  });
});

// ─── deriveDefaultMode ────────────────────────────────────────────────────────

describe("deriveDefaultMode", () => {
  it("null attention → scan", () => {
    expect(deriveDefaultMode(null, null)).toBe("scan");
  });

  it("null decisionOps → scan (no committed route info)", () => {
    expect(deriveDefaultMode(makeAttention("stable"), null)).toBe("scan");
  });

  it("focused posture → decide", () => {
    expect(deriveDefaultMode(makeAttention("focused"), makeDecisionOps())).toBe("decide");
  });

  it("watchful posture → diagnose", () => {
    expect(deriveDefaultMode(makeAttention("watchful"), makeDecisionOps())).toBe("diagnose");
  });

  it("fragmented posture → diagnose", () => {
    expect(deriveDefaultMode(makeAttention("fragmented"), makeDecisionOps())).toBe("diagnose");
  });

  it("stable + committed routes → monitor", () => {
    expect(
      deriveDefaultMode(makeAttention("stable"), makeDecisionOps(["committed"])),
    ).toBe("monitor");
  });

  it("stable + advancing routes → monitor", () => {
    expect(
      deriveDefaultMode(makeAttention("stable"), makeDecisionOps(["advancing"])),
    ).toBe("monitor");
  });

  it("stable + no committed routes → scan", () => {
    expect(
      deriveDefaultMode(makeAttention("stable"), makeDecisionOps(["exploring", "validating"])),
    ).toBe("scan");
  });

  it("stable + empty portfolio → scan", () => {
    expect(deriveDefaultMode(makeAttention("stable"), makeDecisionOps([]))).toBe("scan");
  });
});
