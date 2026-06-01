import { describe, expect, it } from "vitest";
import { buildNarrativeConductor } from "./narrativeConductor";
import type { StrategicSignalSurface, StrategicSignal } from "./strategicSignals";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSig(overrides: Partial<StrategicSignal> = {}): StrategicSignal {
  return {
    id: "cr-inferred",
    statement: "Customer proof is missing. Direction is ahead of validated behavior.",
    polarity: "unresolved",
    pressure: "high",
    movement: "unresolved",
    relevance: "customer_proof",
    whyItMatters: null,
    linkedRouteId: null,
    ...overrides,
  };
}

function makeSurface(signals: StrategicSignal[]): StrategicSignalSurface {
  return {
    groups: signals.length > 0
      ? [{ polarity: signals[0].polarity, label: "Unresolved", signals }]
      : [],
    totalCount: signals.length,
    hasBlockingSignals: false,
    hasConflictingSignals: false,
  };
}

// ─── 1. Concept derivation from center state ──────────────────────────────────

describe("established concept derivation", () => {
  it("strategy_outrunning_proof establishes customer_proof_missing and proof_gap", () => {
    const conductor = buildNarrativeConductor({
      centerStateKey: "strategy_outrunning_proof",
      centerHeadline: "Strategy is ahead of customer proof.",
      secondaryHeadline: "",
    });
    expect(conductor.establishedConcepts.has("customer_proof_missing" as never)).toBe(true);
    expect(conductor.establishedConcepts.has("proof_gap" as never)).toBe(true);
  });

  it("perception_conflicts_emphasis establishes positioning_conflict", () => {
    const conductor = buildNarrativeConductor({
      centerStateKey: "perception_conflicts_emphasis",
      centerHeadline: "Outside perception reads as X. The direction toward Y hasn't landed.",
      secondaryHeadline: "",
    });
    expect(conductor.establishedConcepts.has("positioning_conflict" as never)).toBe(true);
  });

  it("route_confidence_fragmented establishes fragmentation", () => {
    const conductor = buildNarrativeConductor({
      centerStateKey: "route_confidence_fragmented",
      centerHeadline: "Route confidence is fragmented.",
      secondaryHeadline: "",
    });
    expect(conductor.establishedConcepts.has("fragmentation" as never)).toBe(true);
  });

  it("direction_cohering establishes no concepts", () => {
    const conductor = buildNarrativeConductor({
      centerStateKey: "direction_cohering",
      centerHeadline: "Direction is converging.",
      secondaryHeadline: "",
    });
    expect(conductor.establishedConcepts.size).toBe(0);
  });

  it("secondary headline with 'customer proof' adds customer_proof_missing", () => {
    const conductor = buildNarrativeConductor({
      centerStateKey: "direction_cohering",
      centerHeadline: "Direction is converging.",
      secondaryHeadline: "Outside perception reads as X. Customer proof is still missing.",
    });
    expect(conductor.establishedConcepts.has("customer_proof_missing" as never)).toBe(true);
  });
});

// ─── 2. Signal evolution ──────────────────────────────────────────────────────

describe("conductSignals — signal statement evolution", () => {
  it("evolves cr-inferred statement when customer_proof_missing is established", () => {
    const conductor = buildNarrativeConductor({
      centerStateKey: "strategy_outrunning_proof",
      centerHeadline: "Strategy is ahead of customer proof.",
      secondaryHeadline: "",
    });
    const original = makeSig({ id: "cr-inferred" });
    const result = conductor.conductSignals(makeSurface([original]));
    const evolved = result.groups[0].signals[0];
    // Statement should no longer say "Customer proof is missing"
    expect(evolved.statement).not.toBe(original.statement);
    // But the signal should still be present
    expect(result.groups[0].signals).toHaveLength(1);
  });

  it("evolves cr-directional when customer_proof_missing is established", () => {
    const conductor = buildNarrativeConductor({
      centerStateKey: "strategy_outrunning_proof",
      centerHeadline: "Strategy is ahead.",
      secondaryHeadline: "",
    });
    const original = makeSig({ id: "cr-directional", statement: "Customer proof is directional." });
    const result = conductor.conductSignals(makeSurface([original]));
    expect(result.groups[0].signals[0].statement).not.toBe(original.statement);
  });

  it("does NOT evolve portfolio signals (route-specific, no concept mapping)", () => {
    const conductor = buildNarrativeConductor({
      centerStateKey: "strategy_outrunning_proof",
      centerHeadline: "Strategy is ahead.",
      secondaryHeadline: "",
    });
    const portSig = makeSig({
      id: "port-safe-commit",
      statement: "Route X is ready to commit — evidence is converging.",
      polarity: "accelerating",
    });
    const result = conductor.conductSignals(makeSurface([portSig]));
    // Portfolio signals should pass through unchanged
    expect(result.groups[0].signals[0].statement).toBe(portSig.statement);
  });

  it("does NOT evolve hypothesis signals", () => {
    const conductor = buildNarrativeConductor({
      centerStateKey: "strategy_outrunning_proof",
      centerHeadline: "Strategy is ahead.",
      secondaryHeadline: "",
    });
    const hypSig = makeSig({
      id: "hyp-abc123",
      statement: "This specific hypothesis statement.",
      polarity: "reinforcing",
    });
    const result = conductor.conductSignals(makeSurface([hypSig]));
    expect(result.groups[0].signals[0].statement).toBe(hypSig.statement);
  });

  it("passes signals unchanged when no concepts are established", () => {
    const conductor = buildNarrativeConductor({
      centerStateKey: "direction_cohering",
      centerHeadline: "Direction is converging.",
      secondaryHeadline: "",
    });
    const original = makeSig({ id: "cr-inferred" });
    const surface = makeSurface([original]);
    const result = conductor.conductSignals(surface);
    // direction_cohering establishes no concepts — signals pass through
    expect(result.groups[0].signals[0].statement).toBe(original.statement);
  });

  it("evolved statement is deterministic (same result on repeat calls)", () => {
    const conductor = buildNarrativeConductor({
      centerStateKey: "strategy_outrunning_proof",
      centerHeadline: "Strategy is ahead.",
      secondaryHeadline: "",
    });
    const original = makeSig({ id: "cr-inferred" });
    const r1 = conductor.conductSignals(makeSurface([original]));
    const r2 = conductor.conductSignals(makeSurface([original]));
    expect(r1.groups[0].signals[0].statement).toBe(r2.groups[0].signals[0].statement);
  });
});

// ─── 3. Attention item suppression ───────────────────────────────────────────

describe("conductAttentionItems — echo suppression", () => {
  it("suppresses items with high token overlap to the center headline", () => {
    const conductor = buildNarrativeConductor({
      centerStateKey: "strategy_outrunning_proof",
      centerHeadline: "Strategy is moving toward partner outcomes. Customer proof hasn't caught up.",
      secondaryHeadline: "",
    });
    const items = [
      "Customer grounding is still weak — direction is running ahead of validated customer behavior.",
      "Competing themes are pulling the direction — resolve before focusing.",
    ];
    const result = conductor.conductAttentionItems(items);
    // First item overlaps heavily with the headline — should be suppressed
    expect(result).not.toContain(items[0]);
  });

  it("keeps attention items that are genuinely distinct from the hero", () => {
    const conductor = buildNarrativeConductor({
      centerStateKey: "strategy_outrunning_proof",
      centerHeadline: "Strategy is moving toward partner outcomes. Customer proof hasn't caught up.",
      secondaryHeadline: "",
    });
    const items = [
      "Routes are pulling positioning in conflicting directions — resolve before hardening.",
    ];
    const result = conductor.conductAttentionItems(items);
    expect(result).toContain(items[0]);
  });

  it("returns all items unchanged when no concepts are established", () => {
    const conductor = buildNarrativeConductor({
      centerStateKey: "direction_cohering",
      centerHeadline: "Direction is converging.",
      secondaryHeadline: "",
    });
    const items = ["Item A.", "Item B."];
    expect(conductor.conductAttentionItems(items)).toEqual(items);
  });

  it("returns empty array for empty input", () => {
    const conductor = buildNarrativeConductor({
      centerStateKey: "strategy_outrunning_proof",
      centerHeadline: "Strategy is ahead.",
      secondaryHeadline: "",
    });
    expect(conductor.conductAttentionItems([])).toEqual([]);
  });
});

// ─── 4. Landscape summary lines ───────────────────────────────────────────────

describe("landscapeSummaryLine — section framing shift", () => {
  it("proof-gap state leads with validation uplift framing", () => {
    const conductor = buildNarrativeConductor({
      centerStateKey: "strategy_outrunning_proof",
      centerHeadline: "Strategy is ahead of customer proof.",
      secondaryHeadline: "",
    });
    expect(conductor.landscapeSummaryLine).toContain("validation");
  });

  it("perception-conflict state leads with structural framing", () => {
    const conductor = buildNarrativeConductor({
      centerStateKey: "perception_conflicts_emphasis",
      centerHeadline: "Outside perception reads as X.",
      secondaryHeadline: "",
    });
    expect(conductor.landscapeSummaryLine).toContain("perception gap");
  });

  it("fragmented state leads with stability framing", () => {
    const conductor = buildNarrativeConductor({
      centerStateKey: "route_confidence_fragmented",
      centerHeadline: "Route confidence is fragmented.",
      secondaryHeadline: "",
    });
    expect(conductor.landscapeSummaryLine).toContain("stability");
  });

  it("converging state leads with what-is-holding framing", () => {
    const conductor = buildNarrativeConductor({
      centerStateKey: "customer_validation_converging",
      centerHeadline: "Customer validation is converging.",
      secondaryHeadline: "",
    });
    expect(conductor.landscapeSummaryLine).toContain("holding");
  });
});
