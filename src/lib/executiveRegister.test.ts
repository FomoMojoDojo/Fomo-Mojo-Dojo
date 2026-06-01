import { describe, expect, it } from "vitest";
import { deriveRegister, phrasesForRegister, landscapeForRegister } from "./executiveRegister";
import type { TemporalPosture } from "./strategicTemporalState";

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeTemporalPosture(overrides: Partial<TemporalPosture> = {}): TemporalPosture {
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

// ─── 1. Register derivation ───────────────────────────────────────────────────

describe("deriveRegister — condition mapping", () => {
  it("returns escalation when portfolio is scaling ahead", () => {
    const result = deriveRegister({
      confidencePosture: "directional",
      temporalPosture: makeTemporalPosture(),
      centerStateKey: "strategy_outrunning_proof",
      hasEscalations: false,
      portfolioState: "scaling_ahead",
    });
    expect(result).toBe("escalation");
  });

  it("returns escalation when escalations exist with structural proof gap", () => {
    const result = deriveRegister({
      confidencePosture: "directional",
      temporalPosture: makeTemporalPosture({ proofGapMaturity: "structural" }),
      centerStateKey: "strategy_outrunning_proof",
      hasEscalations: true,
      portfolioState: "balanced",
    });
    expect(result).toBe("escalation");
  });

  it("returns structural_pressure for structural proof gap without escalations", () => {
    const result = deriveRegister({
      confidencePosture: "directional",
      temporalPosture: makeTemporalPosture({ proofGapMaturity: "structural" }),
      centerStateKey: "strategy_outrunning_proof",
      hasEscalations: false,
      portfolioState: "balanced",
    });
    expect(result).toBe("structural_pressure");
  });

  it("returns structural_pressure for entrenched contradiction", () => {
    const result = deriveRegister({
      confidencePosture: "contradicted",
      temporalPosture: makeTemporalPosture({ contradictionPressure: "entrenched" }),
      centerStateKey: "perception_conflicts_emphasis",
      hasEscalations: false,
    });
    expect(result).toBe("structural_pressure");
  });

  it("returns stabilized for coherent confidence with no volatility", () => {
    const result = deriveRegister({
      confidencePosture: "coherent",
      temporalPosture: makeTemporalPosture({ contradictionPressure: "none", proofGapMaturity: "fresh" }),
      centerStateKey: "direction_cohering",
      hasEscalations: false,
    });
    expect(result).toBe("stabilized");
  });

  it("returns converging when momentum is strengthening", () => {
    const result = deriveRegister({
      confidencePosture: "directional",
      temporalPosture: makeTemporalPosture({ momentum: "strengthening" }),
      centerStateKey: "customer_validation_converging",
      hasEscalations: false,
    });
    expect(result).toBe("converging");
  });

  it("returns exploratory for fresh, directional, stable state", () => {
    const result = deriveRegister({
      confidencePosture: "directional",
      temporalPosture: makeTemporalPosture(),
      centerStateKey: "direction_cohering",
      hasEscalations: false,
    });
    expect(result).toBe("exploratory");
  });

  it("returns exploratory when portfolioState is null", () => {
    const result = deriveRegister({
      confidencePosture: "speculative",
      temporalPosture: makeTemporalPosture(),
      centerStateKey: "direction_cohering",
      hasEscalations: false,
      portfolioState: null,
    });
    expect(result).toBe("exploratory");
  });

  it("escalation takes priority over structural_pressure", () => {
    const result = deriveRegister({
      confidencePosture: "contradicted",
      temporalPosture: makeTemporalPosture({
        proofGapMaturity: "structural",
        contradictionPressure: "entrenched",
      }),
      centerStateKey: "perception_conflicts_emphasis",
      hasEscalations: true,
      portfolioState: "scaling_ahead",
    });
    expect(result).toBe("escalation");
  });
});

// ─── 2. Phrase families ───────────────────────────────────────────────────────

describe("phrasesForRegister — phrase family selection", () => {
  it("returns exploratory phrases for customer_proof_missing in exploratory register", () => {
    const phrases = phrasesForRegister("customer_proof_missing", "exploratory");
    expect(phrases).not.toBeNull();
    const joined = phrases!.join(" ");
    expect(joined).toMatch(/forming|building|still needed/i);
  });

  it("returns escalation phrases for customer_proof_missing in escalation register", () => {
    const phrases = phrasesForRegister("customer_proof_missing", "escalation");
    expect(phrases).not.toBeNull();
    const joined = phrases!.join(" ");
    expect(joined).toMatch(/commitment ahead|scaling without|absent/i);
  });

  it("returns structural_pressure phrases for proof_gap in structural_pressure register", () => {
    const phrases = phrasesForRegister("proof_gap", "structural_pressure");
    expect(phrases).not.toBeNull();
    const joined = phrases!.join(" ");
    expect(joined).toMatch(/binding constraint|persisting|insufficient/i);
  });

  it("returns stabilized phrases for customer_proof_present in stabilized register", () => {
    const phrases = phrasesForRegister("customer_proof_present", "stabilized");
    expect(phrases).not.toBeNull();
    const joined = phrases!.join(" ");
    expect(joined).toMatch(/established|confirmed|holding/i);
  });

  it("returns null for empty combinations (customer_proof_missing in stabilized)", () => {
    const phrases = phrasesForRegister("customer_proof_missing", "stabilized");
    expect(phrases).toBeNull();
  });

  it("returns null for empty combinations (positioning_stabilizing in structural_pressure)", () => {
    const phrases = phrasesForRegister("positioning_stabilizing", "structural_pressure");
    expect(phrases).toBeNull();
  });

  it("exploratory positioning_conflict uses open, forming language", () => {
    const phrases = phrasesForRegister("positioning_conflict", "exploratory");
    expect(phrases).not.toBeNull();
    const joined = phrases!.join(" ");
    expect(joined).toMatch(/beginning|forming|starting/i);
  });

  it("escalation fragmentation uses pressure language", () => {
    const phrases = phrasesForRegister("fragmentation", "escalation");
    expect(phrases).not.toBeNull();
    const joined = phrases!.join(" ");
    expect(joined).toMatch(/commitment stage|no route|blocking/i);
  });
});

// ─── 3. Landscape overrides ───────────────────────────────────────────────────

describe("landscapeForRegister — section framing by register", () => {
  it("escalation register overrides strategy_outrunning_proof landscape", () => {
    const line = landscapeForRegister("strategy_outrunning_proof", "escalation");
    expect(line).not.toBeNull();
    expect(line).toMatch(/absent|exposed/i);
  });

  it("stabilized register overrides direction_cohering landscape", () => {
    const line = landscapeForRegister("direction_cohering", "stabilized");
    expect(line).not.toBeNull();
    expect(line).toMatch(/holding/i);
  });

  it("structural_pressure returns override for strategy_outrunning_proof", () => {
    const line = landscapeForRegister("strategy_outrunning_proof", "structural_pressure");
    expect(line).not.toBeNull();
    expect(line).toMatch(/direct investment/i);
  });

  it("returns null for converging register with direction_cohering (no specific override)", () => {
    const line = landscapeForRegister("direction_cohering", "converging");
    expect(line).toBeNull();
  });

  it("exploratory register provides early-stage framing for strategy_outrunning_proof", () => {
    const line = landscapeForRegister("strategy_outrunning_proof", "exploratory");
    expect(line).not.toBeNull();
    expect(line).toMatch(/early validation|traction/i);
  });
});

// ─── 4. Conductor integration ─────────────────────────────────────────────────

describe("conductor + register — phrase selection priority", () => {
  it("register phrases take priority over static fallback", () => {
    // White-box: phrasesForRegister returns non-null for structural_pressure + customer_proof_missing
    // Conductor should use those, not EVOLVED_BY_CONCEPT fallback
    const structural = phrasesForRegister("customer_proof_missing", "structural_pressure");
    const exploratory = phrasesForRegister("customer_proof_missing", "exploratory");
    expect(structural).not.toBeNull();
    expect(exploratory).not.toBeNull();
    // Structural phrases should be colder/more declarative than exploratory
    const structuralJoined = structural!.join(" ");
    const exploratoryJoined = exploratory!.join(" ");
    expect(structuralJoined).not.toBe(exploratoryJoined);
    expect(structuralJoined).toMatch(/structural|absent|persistent/i);
    expect(exploratoryJoined).toMatch(/forming|building|still/i);
  });
});
