import { describe, expect, it } from "vitest";
import {
  canTransitionDecisionState,
  isDecisionTerminal,
  isDecisionActive,
  deriveConfidenceState,
  evaluateStalePropagation,
  appendDecisionMemory,
  latestMemoryEntry,
  addConfidenceMovement,
  latestConfidenceDirection,
  suggestDecisionNextAction,
  openValidationCount,
  isCommitmentBlocked,
  type DecisionState,
  type ConfidenceState,
  type ConfidenceInputSignals,
  type DecisionMemoryEntry,
} from "./strategicDecisionDomain";

// ─── State machine ─────────────────────────────────────────────────────────────

describe("canTransitionDecisionState", () => {
  it("allows forward progression", () => {
    expect(canTransitionDecisionState("exploratory", "under_validation")).toBe(true);
    expect(canTransitionDecisionState("under_validation", "stabilizing")).toBe(true);
    expect(canTransitionDecisionState("stabilizing", "commit_ready")).toBe(true);
    expect(canTransitionDecisionState("commit_ready", "committed")).toBe(true);
  });

  it("allows evidence shortcuts", () => {
    expect(canTransitionDecisionState("exploratory", "stabilizing")).toBe(true);
    expect(canTransitionDecisionState("under_validation", "commit_ready")).toBe(true);
  });

  it("allows decisions to weaken — committed → destabilizing", () => {
    expect(canTransitionDecisionState("committed", "destabilizing")).toBe(true);
  });

  it("allows decisions to re-open — destabilizing → exploratory", () => {
    expect(canTransitionDecisionState("destabilizing", "exploratory")).toBe(true);
    expect(canTransitionDecisionState("destabilizing", "under_validation")).toBe(true);
  });

  it("allows reframing from any active state", () => {
    const activeStates: DecisionState[] = [
      "exploratory", "under_validation", "stabilizing",
      "commit_ready", "committed", "destabilizing",
    ];
    for (const state of activeStates) {
      expect(canTransitionDecisionState(state, "reframing")).toBe(true);
    }
  });

  it("allows retirement from any state", () => {
    const allStates: DecisionState[] = [
      "exploratory", "under_validation", "stabilizing",
      "commit_ready", "committed", "destabilizing", "reframing",
    ];
    for (const state of allStates) {
      expect(canTransitionDecisionState(state, "retired")).toBe(true);
    }
  });

  it("blocks committed → exploratory directly (must go through destabilizing)", () => {
    expect(canTransitionDecisionState("committed", "exploratory")).toBe(false);
  });

  it("blocks committed → commit_ready (no going back directly)", () => {
    expect(canTransitionDecisionState("committed", "commit_ready")).toBe(false);
  });

  it("blocks retired → any state (terminal)", () => {
    const allStates: DecisionState[] = [
      "exploratory", "under_validation", "stabilizing",
      "commit_ready", "committed", "destabilizing", "reframing",
    ];
    for (const state of allStates) {
      expect(canTransitionDecisionState("retired", state)).toBe(false);
    }
  });

  it("blocks exploratory → committed directly", () => {
    expect(canTransitionDecisionState("exploratory", "committed")).toBe(false);
  });
});

describe("isDecisionTerminal / isDecisionActive", () => {
  it("only retired is terminal", () => {
    expect(isDecisionTerminal("retired")).toBe(true);
    expect(isDecisionTerminal("committed")).toBe(false);
    expect(isDecisionTerminal("exploratory")).toBe(false);
  });

  it("active is inverse of terminal", () => {
    const allStates: DecisionState[] = [
      "exploratory", "under_validation", "stabilizing",
      "commit_ready", "committed", "destabilizing", "reframing", "retired",
    ];
    for (const state of allStates) {
      expect(isDecisionActive(state)).toBe(!isDecisionTerminal(state));
    }
  });
});

// ─── Confidence state derivation ──────────────────────────────────────────────

describe("deriveConfidenceState", () => {
  function signals(overrides: Partial<ConfidenceInputSignals> = {}): ConfidenceInputSignals {
    return {
      hasCustomerBehavioralProof: false,
      hasMultiLayerEvidence: false,
      hasContradictingEvidence: false,
      hasAnyEvidence: false,
      customerProofIsStale: false,
      ...overrides,
    };
  }

  it("returns low when no evidence", () => {
    expect(deriveConfidenceState(signals())).toBe("low");
  });

  it("returns directional when some evidence but not multi-layer", () => {
    expect(deriveConfidenceState(signals({ hasAnyEvidence: true }))).toBe("directional");
  });

  it("returns building when multi-layer but no customer behavioral proof", () => {
    expect(deriveConfidenceState(signals({ hasAnyEvidence: true, hasMultiLayerEvidence: true }))).toBe("building");
  });

  it("returns strong when customer proof + multi-layer + not stale", () => {
    expect(
      deriveConfidenceState(signals({
        hasCustomerBehavioralProof: true,
        hasMultiLayerEvidence: true,
        hasAnyEvidence: true,
      })),
    ).toBe("strong");
  });

  it("contradicted wins over all other signals", () => {
    expect(
      deriveConfidenceState(signals({
        hasContradictingEvidence: true,
        hasCustomerBehavioralProof: true,
        hasMultiLayerEvidence: true,
        hasAnyEvidence: true,
      })),
    ).toBe("contradicted");
  });

  it("stale customer proof caps at directional even with multi-layer evidence", () => {
    expect(
      deriveConfidenceState(signals({
        hasCustomerBehavioralProof: true,
        hasMultiLayerEvidence: true,
        hasAnyEvidence: true,
        customerProofIsStale: true,
      })),
    ).toBe("directional");
  });

  it("stale proof with no evidence returns low", () => {
    expect(deriveConfidenceState(signals({ customerProofIsStale: true }))).toBe("low");
  });
});

// ─── Stale propagation ────────────────────────────────────────────────────────

describe("evaluateStalePropagation", () => {
  const baseInput = {
    hasStaleCustomerProof: false,
    hasContradictedHypothesis: false,
    hasBlockingTension: false,
    hasCapabilityGap: false,
  };

  it("returns clean result when no stale factors", () => {
    const result = evaluateStalePropagation({
      ...baseInput,
      currentDecisionState: "stabilizing",
      currentConfidenceState: "building",
    });
    expect(result.shouldDestabilize).toBe(false);
    expect(result.suggestedConfidenceState).toBe(null);
    expect(result.reason).toBe(null);
  });

  it("destabilizes committed decision when hypothesis is contradicted", () => {
    const result = evaluateStalePropagation({
      ...baseInput,
      currentDecisionState: "committed",
      currentConfidenceState: "strong",
      hasContradictedHypothesis: true,
    });
    expect(result.shouldDestabilize).toBe(true);
    expect(result.suggestedConfidenceState).toBe("contradicted");
  });

  it("destabilizes commit_ready decision when hypothesis is contradicted", () => {
    const result = evaluateStalePropagation({
      ...baseInput,
      currentDecisionState: "commit_ready",
      currentConfidenceState: "strong",
      hasContradictedHypothesis: true,
    });
    expect(result.shouldDestabilize).toBe(true);
  });

  it("does NOT destabilize exploratory decision when hypothesis contradicted", () => {
    const result = evaluateStalePropagation({
      ...baseInput,
      currentDecisionState: "exploratory",
      currentConfidenceState: "low",
      hasContradictedHypothesis: true,
    });
    expect(result.shouldDestabilize).toBe(false);
  });

  it("caps confidence at directional when customer proof is stale (was strong)", () => {
    const result = evaluateStalePropagation({
      ...baseInput,
      currentDecisionState: "stabilizing",
      currentConfidenceState: "strong",
      hasStaleCustomerProof: true,
    });
    expect(result.shouldDestabilize).toBe(false);
    expect(result.suggestedConfidenceState).toBe("directional");
  });

  it("caps confidence at directional when proof is stale (was building)", () => {
    const result = evaluateStalePropagation({
      ...baseInput,
      currentDecisionState: "stabilizing",
      currentConfidenceState: "building",
      hasStaleCustomerProof: true,
    });
    expect(result.suggestedConfidenceState).toBe("directional");
  });

  it("does not change confidence when stale but already at directional", () => {
    const result = evaluateStalePropagation({
      ...baseInput,
      currentDecisionState: "stabilizing",
      currentConfidenceState: "directional",
      hasStaleCustomerProof: true,
    });
    expect(result.suggestedConfidenceState).toBe(null);
  });

  it("destabilizes commit_ready when blocking tension present", () => {
    const result = evaluateStalePropagation({
      ...baseInput,
      currentDecisionState: "commit_ready",
      currentConfidenceState: "building",
      hasBlockingTension: true,
    });
    expect(result.shouldDestabilize).toBe(true);
    expect(result.suggestedConfidenceState).toBe(null);
  });

  it("holds commit_ready in stabilizing when capability gap (no destabilize)", () => {
    const result = evaluateStalePropagation({
      ...baseInput,
      currentDecisionState: "commit_ready",
      currentConfidenceState: "building",
      hasCapabilityGap: true,
    });
    expect(result.shouldDestabilize).toBe(false);
    expect(result.reason).not.toBe(null);
  });
});

// ─── Decision memory ──────────────────────────────────────────────────────────

describe("appendDecisionMemory", () => {
  it("appends to empty memory", () => {
    const result = appendDecisionMemory([], "Customer validation weakened the direction.");
    expect(result).toHaveLength(1);
    expect(result[0].entry).toBe("Customer validation weakened the direction.");
    expect(result[0].at).toBeDefined();
  });

  it("preserves existing entries", () => {
    const existing: DecisionMemoryEntry[] = [
      { at: "2026-01-01T00:00:00Z", entry: "Initial signal." },
    ];
    const result = appendDecisionMemory(existing, "New development.");
    expect(result).toHaveLength(2);
    expect(result[0].entry).toBe("Initial signal.");
    expect(result[1].entry).toBe("New development.");
  });

  it("uses provided timestamp", () => {
    const at = "2026-06-01T12:00:00.000Z";
    const result = appendDecisionMemory([], "Entry.", at);
    expect(result[0].at).toBe(at);
  });

  it("truncates to 20 entries when limit exceeded", () => {
    const existing: DecisionMemoryEntry[] = Array.from({ length: 20 }, (_, i) => ({
      at: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      entry: `Entry ${i + 1}`,
    }));
    const result = appendDecisionMemory(existing, "Entry 21");
    expect(result).toHaveLength(20);
    // Oldest entry (Entry 1) is compressed out; Entry 2 is now first
    expect(result[0].entry).toBe("Entry 2");
    expect(result[result.length - 1].entry).toBe("Entry 21");
  });

  it("keeps exactly 20 when at limit", () => {
    const existing: DecisionMemoryEntry[] = Array.from({ length: 19 }, (_, i) => ({
      at: new Date().toISOString(),
      entry: `Entry ${i}`,
    }));
    const result = appendDecisionMemory(existing, "Entry 19");
    expect(result).toHaveLength(20);
  });
});

describe("latestMemoryEntry", () => {
  it("returns null for empty memory", () => {
    expect(latestMemoryEntry([])).toBe(null);
  });

  it("returns last entry", () => {
    const memory: DecisionMemoryEntry[] = [
      { at: "2026-01-01T00:00:00Z", entry: "First" },
      { at: "2026-02-01T00:00:00Z", entry: "Latest" },
    ];
    expect(latestMemoryEntry(memory)?.entry).toBe("Latest");
  });
});

// ─── Confidence movement ──────────────────────────────────────────────────────

describe("addConfidenceMovement", () => {
  it("appends entry to empty movement", () => {
    const result = addConfidenceMovement([], "strengthening", "Customer interviews confirmed direction.");
    expect(result).toHaveLength(1);
    expect(result[0].direction).toBe("strengthening");
    expect(result[0].reason).toBe("Customer interviews confirmed direction.");
    expect(result[0].triggered_by).toBeUndefined();
  });

  it("includes triggered_by when provided", () => {
    const result = addConfidenceMovement([], "weakening", "Hypothesis contradicted.", "hypothesis-123");
    expect(result[0].triggered_by).toBe("hypothesis-123");
  });

  it("preserves existing entries", () => {
    const existing = addConfidenceMovement([], "strengthening", "First signal.");
    const result = addConfidenceMovement(existing, "weakening", "Contradiction emerged.");
    expect(result).toHaveLength(2);
  });
});

describe("latestConfidenceDirection", () => {
  it("returns null for empty movement", () => {
    expect(latestConfidenceDirection([])).toBe(null);
  });

  it("returns the most recent direction", () => {
    const movement = addConfidenceMovement(
      addConfidenceMovement([], "strengthening", "First."),
      "weakening",
      "Then weakened.",
    );
    expect(latestConfidenceDirection(movement)).toBe("weakening");
  });
});

// ─── Suggested next action ────────────────────────────────────────────────────

describe("suggestDecisionNextAction", () => {
  function makeDecision(
    state: DecisionState,
    overrides: {
      validation_requirements?: { requirement: string; status: "open" | "met" | "bypassed" }[];
      blocked_by?: string[];
    } = {},
  ) {
    return {
      decision_state: state,
      validation_requirements: overrides.validation_requirements ?? [],
      blocked_by: overrides.blocked_by ?? [],
    };
  }

  it("returns exploratory guidance for exploratory state", () => {
    expect(suggestDecisionNextAction(makeDecision("exploratory"))).toContain("signal");
  });

  it("mentions open requirements for under_validation", () => {
    const result = suggestDecisionNextAction(makeDecision("under_validation", {
      validation_requirements: [
        { requirement: "Interview 5 customers", status: "open" },
        { requirement: "Validate pricing", status: "open" },
      ],
    }));
    expect(result).toContain("2 open validation requirement");
  });

  it("returns singular form for 1 open requirement", () => {
    const result = suggestDecisionNextAction(makeDecision("under_validation", {
      validation_requirements: [{ requirement: "One thing", status: "open" }],
    }));
    expect(result).toContain("1 open validation requirement");
    expect(result).not.toContain("requirements");
  });

  it("mentions blocking dependencies for stabilizing", () => {
    const result = suggestDecisionNextAction(makeDecision("stabilizing", {
      blocked_by: ["tension-xyz"],
    }));
    expect(result).toContain("blocking dependencies");
  });

  it("returns commit-call prompt for commit_ready", () => {
    expect(suggestDecisionNextAction(makeDecision("commit_ready"))).toContain("make the call");
  });

  it("returns monitoring prompt for committed", () => {
    expect(suggestDecisionNextAction(makeDecision("committed"))).toContain("Monitor");
  });

  it("returns reframe prompt for reframing", () => {
    expect(suggestDecisionNextAction(makeDecision("reframing"))).toContain("question");
  });

  it("returns closed message for retired", () => {
    expect(suggestDecisionNextAction(makeDecision("retired"))).toContain("closed");
  });
});

// ─── Validation and blocking helpers ─────────────────────────────────────────

describe("openValidationCount", () => {
  it("counts only open requirements", () => {
    expect(openValidationCount([
      { requirement: "A", status: "open" },
      { requirement: "B", status: "met" },
      { requirement: "C", status: "open" },
      { requirement: "D", status: "bypassed" },
    ])).toBe(2);
  });

  it("returns 0 for empty array", () => {
    expect(openValidationCount([])).toBe(0);
  });
});

describe("isCommitmentBlocked", () => {
  it("returns false when no blockers or tensions", () => {
    expect(isCommitmentBlocked({ blocked_by: [], active_tension_ids: [] })).toBe(false);
  });

  it("returns true when blocked_by has entries", () => {
    expect(isCommitmentBlocked({ blocked_by: ["decision-1"], active_tension_ids: [] })).toBe(true);
  });

  it("returns true when active_tension_ids has entries", () => {
    expect(isCommitmentBlocked({ blocked_by: [], active_tension_ids: ["tension-1"] })).toBe(true);
  });
});
