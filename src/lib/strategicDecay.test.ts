import { describe, expect, it } from "vitest";
import { buildDecayContext } from "./strategicDecay";
import { scoreSignalPriority } from "./strategicAttention";
import type { TemporalPosture } from "./strategicTemporalState";
import type { UnifiedConfidencePosture } from "./strategicCenterSurface";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makePosture(overrides: Partial<TemporalPosture> = {}): TemporalPosture {
  return {
    proofGapMaturity: "fresh",
    contradictionPressure: "none",
    momentum: "stable",
    approxCycleCount: 0,
    proofGapEvolvedPhrases: null,
    contradictionEvolvedPhrases: null,
    landscapeEvolution: {},
    ...overrides,
  };
}

// ─── buildDecayContext — null inputs ─────────────────────────────────────────

describe("buildDecayContext — null inputs", () => {
  it("null temporalPosture → all false, empty map, no note", () => {
    const ctx = buildDecayContext({ temporalPosture: null, confidencePosture: null });
    expect(ctx.contradictionCooled).toBe(false);
    expect(ctx.proofGapNormalized).toBe(false);
    expect(ctx.conditionsStabilizing).toBe(false);
    expect(ctx.coolContradictorySignals).toBe(false);
    expect(ctx.compressReinforcingSignals).toBe(false);
    expect(ctx.signalDecay.size).toBe(0);
    expect(ctx.backgroundNote).toBeNull();
  });
});

// ─── Rule 1: Contradiction cooling ───────────────────────────────────────────

describe("Rule 1: contradictionCooled", () => {
  it("entrenched + stable → cooled", () => {
    const ctx = buildDecayContext({
      temporalPosture: makePosture({ contradictionPressure: "entrenched", momentum: "stable" }),
      confidencePosture: null,
    });
    expect(ctx.contradictionCooled).toBe(true);
    expect(ctx.coolContradictorySignals).toBe(true);
  });

  it("entrenched + strengthening → cooled (non-worsening)", () => {
    const ctx = buildDecayContext({
      temporalPosture: makePosture({ contradictionPressure: "entrenched", momentum: "strengthening" }),
      confidencePosture: null,
    });
    expect(ctx.contradictionCooled).toBe(true);
  });

  it("entrenched + weakening → NOT cooled", () => {
    const ctx = buildDecayContext({
      temporalPosture: makePosture({ contradictionPressure: "entrenched", momentum: "weakening" }),
      confidencePosture: null,
    });
    expect(ctx.contradictionCooled).toBe(false);
  });

  it("accumulating (not entrenched) → NOT cooled", () => {
    const ctx = buildDecayContext({
      temporalPosture: makePosture({ contradictionPressure: "accumulating", momentum: "stable" }),
      confidencePosture: null,
    });
    expect(ctx.contradictionCooled).toBe(false);
  });

  it("cooled contradiction populates fading signals — pos-contradicted only", () => {
    const ctx = buildDecayContext({
      temporalPosture: makePosture({ contradictionPressure: "entrenched", momentum: "stable" }),
      confidencePosture: null,
    });
    // pos-contradicted (market_perception) decays to fading — positioning tensions cool
    expect(ctx.signalDecay.get("pos-contradicted")).toBe("fading");
    // cr-contradicted (customer_proof) is NOT in the fading list — customer reality
    // contradictions are independent of hypothesis contradiction age; never decay them
    expect(ctx.signalDecay.get("cr-contradicted")).toBeUndefined();
  });

  it("cooled contradiction → backgroundNote includes 'entrenched'", () => {
    const ctx = buildDecayContext({
      temporalPosture: makePosture({ contradictionPressure: "entrenched", momentum: "stable" }),
      confidencePosture: null,
    });
    expect(ctx.backgroundNote).toMatch(/entrenched/i);
  });
});

// ─── Rule 2: Proof gap normalization ─────────────────────────────────────────

describe("Rule 2: proofGapNormalized", () => {
  it("structural proof gap + stable → normalized", () => {
    const ctx = buildDecayContext({
      temporalPosture: makePosture({ proofGapMaturity: "structural", momentum: "stable" }),
      confidencePosture: null,
    });
    expect(ctx.proofGapNormalized).toBe(true);
  });

  it("structural proof gap + strengthening → normalized", () => {
    const ctx = buildDecayContext({
      temporalPosture: makePosture({ proofGapMaturity: "structural", momentum: "strengthening" }),
      confidencePosture: null,
    });
    expect(ctx.proofGapNormalized).toBe(true);
  });

  it("structural proof gap + cooling → normalized", () => {
    const ctx = buildDecayContext({
      temporalPosture: makePosture({ proofGapMaturity: "structural", momentum: "cooling" }),
      confidencePosture: null,
    });
    expect(ctx.proofGapNormalized).toBe(true);
  });

  it("structural proof gap + weakening → NOT normalized", () => {
    const ctx = buildDecayContext({
      temporalPosture: makePosture({ proofGapMaturity: "structural", momentum: "weakening" }),
      confidencePosture: null,
    });
    expect(ctx.proofGapNormalized).toBe(false);
  });

  it("aging proof gap (not structural) → NOT normalized", () => {
    const ctx = buildDecayContext({
      temporalPosture: makePosture({ proofGapMaturity: "aging", momentum: "stable" }),
      confidencePosture: null,
    });
    expect(ctx.proofGapNormalized).toBe(false);
  });

  it("normalized proof gap populates ambient signals", () => {
    const ctx = buildDecayContext({
      temporalPosture: makePosture({ proofGapMaturity: "structural", momentum: "stable" }),
      confidencePosture: null,
    });
    expect(ctx.signalDecay.get("cr-directional")).toBe("ambient");
    expect(ctx.signalDecay.get("pos-emerging")).toBe("ambient");
  });

  it("normalized proof gap → backgroundNote includes 'proof gap'", () => {
    const ctx = buildDecayContext({
      temporalPosture: makePosture({ proofGapMaturity: "structural", momentum: "stable" }),
      confidencePosture: null,
    });
    expect(ctx.backgroundNote).toMatch(/proof gap/i);
  });
});

// ─── Rule 3: Conditions stabilizing ──────────────────────────────────────────

describe("Rule 3: conditionsStabilizing", () => {
  it("strengthening + no contradiction + coherent → stabilizing", () => {
    const ctx = buildDecayContext({
      temporalPosture: makePosture({ momentum: "strengthening", contradictionPressure: "none" }),
      confidencePosture: "coherent" as UnifiedConfidencePosture,
    });
    expect(ctx.conditionsStabilizing).toBe(true);
    expect(ctx.compressReinforcingSignals).toBe(true);
  });

  it("stable + isolated contradiction + stabilizing posture → stabilizing", () => {
    const ctx = buildDecayContext({
      temporalPosture: makePosture({ momentum: "stable", contradictionPressure: "isolated" }),
      confidencePosture: "stabilizing" as UnifiedConfidencePosture,
    });
    expect(ctx.conditionsStabilizing).toBe(true);
  });

  it("strengthening + accumulating contradiction → NOT stabilizing", () => {
    const ctx = buildDecayContext({
      temporalPosture: makePosture({ momentum: "strengthening", contradictionPressure: "accumulating" }),
      confidencePosture: "coherent" as UnifiedConfidencePosture,
    });
    expect(ctx.conditionsStabilizing).toBe(false);
  });

  it("strengthening + wrong confidence posture → NOT stabilizing", () => {
    const ctx = buildDecayContext({
      temporalPosture: makePosture({ momentum: "strengthening", contradictionPressure: "none" }),
      confidencePosture: "contradicted" as UnifiedConfidencePosture,
    });
    expect(ctx.conditionsStabilizing).toBe(false);
  });

  it("stabilizing populates ambient signals — positioning only, not customer proof or commitment pressure", () => {
    const ctx = buildDecayContext({
      temporalPosture: makePosture({ momentum: "strengthening", contradictionPressure: "none" }),
      confidencePosture: "coherent" as UnifiedConfidencePosture,
    });
    // Positioning signals correctly decay to ambient
    expect(ctx.signalDecay.get("pos-coherent")).toBe("ambient");
    // cr-converging (customer_proof) is NOT decayed — validation progress always surfaces.
    // The per-ID map fires before the exemption check in scoreSignalPriority; removing it
    // from this list is the correct fix.
    expect(ctx.signalDecay.get("cr-converging")).toBeUndefined();
    // port-converging (commitment_pressure) is NOT decayed — same bypass risk.
    expect(ctx.signalDecay.get("port-converging")).toBeUndefined();
  });
});

// ─── Signal decay map — priority rules ───────────────────────────────────────

describe("signalDecay map priority", () => {
  it("proof gap normalized takes precedence over stabilizing for pos-emerging", () => {
    // Both rules fire: pos-emerging appears in both STRUCTURAL_PROOF_GAP_AMBIENT and STABILIZING_AMBIENT.
    // proofGapNormalized is processed first → "ambient". stabilizing check should not overwrite.
    const ctx = buildDecayContext({
      temporalPosture: makePosture({
        proofGapMaturity: "structural",
        momentum: "strengthening",
        contradictionPressure: "none",
      }),
      confidencePosture: "coherent" as UnifiedConfidencePosture,
    });
    expect(ctx.signalDecay.get("pos-emerging")).toBe("ambient");
  });

  it("fading signals are not overwritten by ambient rules", () => {
    // pos-contradicted is set to "fading" by contradictionCooled rule.
    // It should never be overwritten by another rule.
    const ctx = buildDecayContext({
      temporalPosture: makePosture({
        contradictionPressure: "entrenched",
        proofGapMaturity: "structural",
        momentum: "stable",
      }),
      confidencePosture: null,
    });
    // pos-contradicted is fading (not overwritten to ambient by proof gap rule)
    expect(ctx.signalDecay.get("pos-contradicted")).toBe("fading");
    // pos-emerging is ambient from proof gap rule — set first, not overwritten by stabilizing
    expect(ctx.signalDecay.get("pos-emerging")).toBe("ambient");
  });
});

// ─── Background note ──────────────────────────────────────────────────────────

describe("backgroundNote", () => {
  it("both cooled + normalized → combined note", () => {
    const ctx = buildDecayContext({
      temporalPosture: makePosture({
        contradictionPressure: "entrenched",
        momentum: "stable",
        proofGapMaturity: "structural",
      }),
      confidencePosture: null,
    });
    expect(ctx.backgroundNote).toMatch(/structural/i);
    expect(ctx.backgroundNote).toMatch(/contradiction/i);
    expect(ctx.backgroundNote).toMatch(/proof gap/i);
  });

  it("stabilizing only → stabilizing note", () => {
    const ctx = buildDecayContext({
      temporalPosture: makePosture({ momentum: "strengthening", contradictionPressure: "none" }),
      confidencePosture: "coherent" as UnifiedConfidencePosture,
    });
    expect(ctx.backgroundNote).toMatch(/stabiliz/i);
  });

  it("no decay active → null note", () => {
    // weakening momentum satisfies no decay rule (stabilizing requires strengthening/stable)
    const ctx = buildDecayContext({
      temporalPosture: makePosture({ momentum: "weakening" }),
      confidencePosture: "coherent" as UnifiedConfidencePosture,
    });
    expect(ctx.backgroundNote).toBeNull();
  });
});

// ─── Integration: scoreSignalPriority with decay ──────────────────────────────

describe("scoreSignalPriority with decay", () => {
  it("fading signal (pos-contradicted) capped at active (not critical) when contradiction cooled", () => {
    const decay = buildDecayContext({
      temporalPosture: makePosture({ contradictionPressure: "entrenched", momentum: "stable" }),
      confidencePosture: null,
    });
    // pos-contradicted is in CONTRADICTION_COOLED_FADING — high-pressure contradictory
    // signal that would normally be "critical" is capped at "active" when cooled
    const priority = scoreSignalPriority(
      { id: "pos-contradicted", pressure: "high", relevance: "market_perception", polarity: "contradictory" },
      "watchful",
      decay,
    );
    expect(priority).toBe("active");
  });

  it("cr-contradicted (customer proof) is NOT faded by contradiction cooling", () => {
    const decay = buildDecayContext({
      temporalPosture: makePosture({ contradictionPressure: "entrenched", momentum: "stable" }),
      confidencePosture: null,
    });
    // cr-contradicted is not in CONTRADICTION_COOLED_FADING — customer reality
    // contradictions are always fresh data regardless of hypothesis contradiction age
    const priority = scoreSignalPriority(
      { id: "cr-contradicted", pressure: "high", relevance: "customer_proof", polarity: "contradictory" },
      "watchful",
      decay,
    );
    // Cooled contradictions globally → active (via coolContradictorySignals global check)
    // but not via per-ID fading. The global check still caps it at "active".
    expect(priority).toBe("active");
  });

  it("cr-converging (customer proof) is NOT ambient-decayed by stabilizing", () => {
    const decay = buildDecayContext({
      temporalPosture: makePosture({ momentum: "strengthening", contradictionPressure: "none" }),
      confidencePosture: "coherent" as UnifiedConfidencePosture,
    });
    // cr-converging is not in STABILIZING_AMBIENT — customer validation progress
    // must always surface despite the global compressReinforcingSignals flag
    const priority = scoreSignalPriority(
      { id: "cr-converging", pressure: "medium", relevance: "customer_proof", polarity: "reinforcing" },
      "stable",
      decay,
    );
    // Global compressReinforcingSignals fires but customer_proof is exempt → active
    expect(priority).toBe("active");
  });

  it("ambient-decayed signal → ambient regardless of pressure", () => {
    const decay = buildDecayContext({
      temporalPosture: makePosture({ proofGapMaturity: "structural", momentum: "stable" }),
      confidencePosture: null,
    });
    const priority = scoreSignalPriority(
      { id: "cr-directional", pressure: "high", relevance: "customer_validation", polarity: "reinforcing" },
      "watchful",
      decay,
    );
    expect(priority).toBe("ambient");
  });

  it("reinforcing signal compressed when conditions stabilizing (non-customer-proof)", () => {
    const decay = buildDecayContext({
      temporalPosture: makePosture({ momentum: "strengthening", contradictionPressure: "none" }),
      confidencePosture: "coherent" as UnifiedConfidencePosture,
    });
    const priority = scoreSignalPriority(
      { id: "pos-coherent", pressure: "medium", relevance: "positioning", polarity: "reinforcing" },
      "stable",
      decay,
    );
    expect(priority).toBe("ambient");
  });

  it("customer_proof signal is exempt from reinforcing compression", () => {
    const decay = buildDecayContext({
      temporalPosture: makePosture({ momentum: "strengthening", contradictionPressure: "none" }),
      confidencePosture: "coherent" as UnifiedConfidencePosture,
    });
    const priority = scoreSignalPriority(
      { id: "some-proof-signal", pressure: "medium", relevance: "customer_proof", polarity: "reinforcing" },
      "stable",
      decay,
    );
    expect(priority).toBe("active");
  });

  it("commitment_pressure signal is exempt from reinforcing compression", () => {
    const decay = buildDecayContext({
      temporalPosture: makePosture({ momentum: "strengthening", contradictionPressure: "none" }),
      confidencePosture: "coherent" as UnifiedConfidencePosture,
    });
    const priority = scoreSignalPriority(
      { id: "commit-signal", pressure: "high", relevance: "commitment_pressure", polarity: "reinforcing" },
      "stable",
      decay,
    );
    expect(priority).toBe("critical");
  });

  it("no decay → original scoring unchanged", () => {
    const priority = scoreSignalPriority(
      { id: "cr-contradicted", pressure: "high", relevance: "contradiction", polarity: "contradictory" },
      "watchful",
      null,
    );
    expect(priority).toBe("critical");
  });
});
