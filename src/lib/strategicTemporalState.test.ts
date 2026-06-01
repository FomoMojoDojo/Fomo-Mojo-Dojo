import { describe, expect, it } from "vitest";
import { deriveTemporalPosture } from "./strategicTemporalState";
import type { HypothesisProvenanceCard } from "@/hooks/useStrategicHypotheses";
import type { StrategicHypothesis } from "@/lib/strategicHypothesisDomain";

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

const NOW = new Date("2026-05-11T12:00:00Z");

function isoAgo(days: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function makeHypothesis(overrides: Partial<StrategicHypothesis> = {}): StrategicHypothesis {
  return {
    id: "hyp-1",
    company_id: "company-1",
    hypothesis_key: "hyp-1",
    statement: "Strategy may be ahead of customer proof.",
    hypothesis_kind: "directional_hypothesis",
    hypothesis_state: "inferred",
    topic: "positioning",
    confidence: "low",
    validation_state: "unvalidated",
    what_must_be_true: [],
    source_run_id: null,
    reframed_from_hypothesis_id: null,
    is_active: true,
    raw_payload: {},
    created_at: isoAgo(5),
    updated_at: isoAgo(5),
    ...overrides,
  };
}

function makeCard(hyp: StrategicHypothesis): HypothesisProvenanceCard {
  return {
    hypothesis: hyp,
    supportingClaims: [],
    weakeningClaims: [],
    latestEventAt: null,
  };
}

// ─── 1. Proof gap maturity ─────────────────────────────────────────────────────

describe("proof gap maturity", () => {
  it("returns fresh when inferred hypothesis is < 14 days old", () => {
    const result = deriveTemporalPosture({
      hypotheses: [makeCard(makeHypothesis({ updated_at: isoAgo(5) }))],
      centerStateKey: "strategy_outrunning_proof",
      confidencePosture: "directional",
      topContradiction: null,
      now: NOW,
    });
    expect(result.proofGapMaturity).toBe("fresh");
    expect(result.approxCycleCount).toBe(1);
    expect(result.proofGapEvolvedPhrases).toBeNull();
  });

  it("returns aging when inferred hypothesis is 14–55 days old", () => {
    const result = deriveTemporalPosture({
      hypotheses: [makeCard(makeHypothesis({ updated_at: isoAgo(21) }))],
      centerStateKey: "strategy_outrunning_proof",
      confidencePosture: "directional",
      topContradiction: null,
      now: NOW,
    });
    expect(result.proofGapMaturity).toBe("aging");
    expect(result.approxCycleCount).toBeGreaterThanOrEqual(2);
    expect(result.proofGapEvolvedPhrases).not.toBeNull();
    expect(result.proofGapEvolvedPhrases!.length).toBeGreaterThan(0);
  });

  it("returns structural when inferred hypothesis is 56+ days old", () => {
    const result = deriveTemporalPosture({
      hypotheses: [makeCard(makeHypothesis({ updated_at: isoAgo(70) }))],
      centerStateKey: "strategy_outrunning_proof",
      confidencePosture: "directional",
      topContradiction: null,
      now: NOW,
    });
    expect(result.proofGapMaturity).toBe("structural");
    expect(result.approxCycleCount).toBeGreaterThanOrEqual(5);
    expect(result.proofGapEvolvedPhrases).not.toBeNull();
  });

  it("returns fresh when no hypotheses exist", () => {
    const result = deriveTemporalPosture({
      hypotheses: [],
      centerStateKey: "direction_cohering",
      confidencePosture: "directional",
      topContradiction: null,
      now: NOW,
    });
    expect(result.proofGapMaturity).toBe("fresh");
    expect(result.proofGapEvolvedPhrases).toBeNull();
  });

  it("ignores retired and reframed hypotheses for maturity calculation", () => {
    const result = deriveTemporalPosture({
      hypotheses: [
        makeCard(makeHypothesis({ updated_at: isoAgo(90), hypothesis_state: "retired" })),
        makeCard(makeHypothesis({ updated_at: isoAgo(60), hypothesis_state: "reframed" })),
      ],
      centerStateKey: "strategy_outrunning_proof",
      confidencePosture: "directional",
      topContradiction: null,
      now: NOW,
    });
    // Retired/reframed are excluded — no active proof gap
    expect(result.proofGapMaturity).toBe("fresh");
  });
});

// ─── 2. Contradiction pressure ─────────────────────────────────────────────────

describe("contradiction pressure", () => {
  it("returns none when no contradicted hypotheses and no topContradiction", () => {
    const result = deriveTemporalPosture({
      hypotheses: [makeCard(makeHypothesis())],
      centerStateKey: "direction_cohering",
      confidencePosture: "directional",
      topContradiction: null,
      now: NOW,
    });
    expect(result.contradictionPressure).toBe("none");
    expect(result.contradictionEvolvedPhrases).toBeNull();
  });

  it("returns isolated for a single fresh contradiction", () => {
    const result = deriveTemporalPosture({
      hypotheses: [
        makeCard(makeHypothesis({ hypothesis_state: "contradicted", updated_at: isoAgo(5) })),
      ],
      centerStateKey: "perception_conflicts_emphasis",
      confidencePosture: "contradicted",
      topContradiction: "Outside perception conflicts with strategic emphasis.",
      now: NOW,
    });
    expect(result.contradictionPressure).toBe("isolated");
    expect(result.contradictionEvolvedPhrases).toBeNull();
  });

  it("returns accumulating for a single aging contradiction", () => {
    const result = deriveTemporalPosture({
      hypotheses: [
        makeCard(makeHypothesis({ hypothesis_state: "contradicted", updated_at: isoAgo(20) })),
      ],
      centerStateKey: "perception_conflicts_emphasis",
      confidencePosture: "contradicted",
      topContradiction: "Conflict persists.",
      now: NOW,
    });
    expect(result.contradictionPressure).toBe("accumulating");
    expect(result.contradictionEvolvedPhrases).not.toBeNull();
  });

  it("returns entrenched when contradiction is 56+ days old", () => {
    const result = deriveTemporalPosture({
      hypotheses: [
        makeCard(makeHypothesis({ hypothesis_state: "contradicted", updated_at: isoAgo(80) })),
      ],
      centerStateKey: "perception_conflicts_emphasis",
      confidencePosture: "contradicted",
      topContradiction: "Conflict persists.",
      now: NOW,
    });
    expect(result.contradictionPressure).toBe("entrenched");
    expect(result.contradictionEvolvedPhrases).not.toBeNull();
  });

  it("returns isolated when only topContradiction with no contradicted hypotheses", () => {
    const result = deriveTemporalPosture({
      hypotheses: [makeCard(makeHypothesis())],
      centerStateKey: "direction_cohering",
      confidencePosture: "directional",
      topContradiction: "A conflict was found.",
      now: NOW,
    });
    expect(result.contradictionPressure).toBe("isolated");
  });
});

// ─── 3. Momentum ──────────────────────────────────────────────────────────────

describe("momentum derivation", () => {
  it("strengthening when confidence is stabilizing", () => {
    const result = deriveTemporalPosture({
      hypotheses: [],
      centerStateKey: "positioning_stabilizing",
      confidencePosture: "stabilizing",
      topContradiction: null,
      now: NOW,
    });
    expect(result.momentum).toBe("strengthening");
  });

  it("weakening when confidence is contradicted with aging contradiction", () => {
    const result = deriveTemporalPosture({
      hypotheses: [
        makeCard(makeHypothesis({ hypothesis_state: "contradicted", updated_at: isoAgo(25) })),
      ],
      centerStateKey: "perception_conflicts_emphasis",
      confidencePosture: "contradicted",
      topContradiction: "Hard conflict.",
      now: NOW,
    });
    expect(result.momentum).toBe("weakening");
  });

  it("cooling when directional confidence with aging proof gap", () => {
    const result = deriveTemporalPosture({
      hypotheses: [
        makeCard(makeHypothesis({ updated_at: isoAgo(30) })),
      ],
      centerStateKey: "strategy_outrunning_proof",
      confidencePosture: "directional",
      topContradiction: null,
      now: NOW,
    });
    expect(result.momentum).toBe("cooling");
  });

  it("stable when directional with fresh proof gap", () => {
    const result = deriveTemporalPosture({
      hypotheses: [
        makeCard(makeHypothesis({ updated_at: isoAgo(5) })),
      ],
      centerStateKey: "strategy_outrunning_proof",
      confidencePosture: "directional",
      topContradiction: null,
      now: NOW,
    });
    expect(result.momentum).toBe("stable");
  });
});

// ─── 4. Landscape evolution ───────────────────────────────────────────────────

describe("landscape evolution", () => {
  it("overrides landscape line for structural proof gap in strategy_outrunning_proof", () => {
    const result = deriveTemporalPosture({
      hypotheses: [
        makeCard(makeHypothesis({ updated_at: isoAgo(70) })),
      ],
      centerStateKey: "strategy_outrunning_proof",
      confidencePosture: "directional",
      topContradiction: null,
      now: NOW,
    });
    expect(result.landscapeEvolution).not.toBeNull();
    expect(result.landscapeEvolution!.strategy_outrunning_proof).toContain("direct investment");
  });

  it("overrides landscape line for entrenched contradiction in perception_conflicts_emphasis", () => {
    const result = deriveTemporalPosture({
      hypotheses: [
        makeCard(makeHypothesis({ hypothesis_state: "contradicted", updated_at: isoAgo(90) })),
      ],
      centerStateKey: "perception_conflicts_emphasis",
      confidencePosture: "contradicted",
      topContradiction: "Contradiction persists.",
      now: NOW,
    });
    expect(result.landscapeEvolution?.perception_conflicts_emphasis).toContain("resisted resolution");
  });

  it("returns null landscape evolution for fresh state", () => {
    const result = deriveTemporalPosture({
      hypotheses: [makeCard(makeHypothesis({ updated_at: isoAgo(3) }))],
      centerStateKey: "direction_cohering",
      confidencePosture: "directional",
      topContradiction: null,
      now: NOW,
    });
    expect(result.landscapeEvolution).toBeNull();
  });
});

// ─── 5. Conductor integration ─────────────────────────────────────────────────

describe("conductor integration via temporalPosture", () => {
  it("shifted evolved phrase appears for aging proof gap (not static fresh phrase)", () => {
    // White-box: when proofGapEvolvedPhrases is set, conductor should use it
    const result = deriveTemporalPosture({
      hypotheses: [makeCard(makeHypothesis({ updated_at: isoAgo(30) }))],
      centerStateKey: "strategy_outrunning_proof",
      confidencePosture: "directional",
      topContradiction: null,
      now: NOW,
    });
    const aging = result.proofGapEvolvedPhrases;
    expect(aging).not.toBeNull();
    // Aging phrases use compressed, time-indexed language ("stalled", "persisting") not fresh language
    const allAging = aging!.join(" ");
    expect(allAging).toMatch(/stalled|persisting|directional|proof-gathering/i);
  });

  it("structural proof gap phrases contain structural language", () => {
    const result = deriveTemporalPosture({
      hypotheses: [makeCard(makeHypothesis({ updated_at: isoAgo(80) }))],
      centerStateKey: "strategy_outrunning_proof",
      confidencePosture: "directional",
      topContradiction: null,
      now: NOW,
    });
    const structural = result.proofGapEvolvedPhrases!;
    const joined = structural.join(" ");
    expect(joined).toMatch(/structural|widening|immobile|persistent/i);
  });
});
