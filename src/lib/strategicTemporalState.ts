/**
 * Strategic Temporal State
 *
 * Lightweight temporal layer that enriches narrative phrasing based on how
 * long a strategic condition has persisted. No snapshot history, no event
 * sourcing — derives "age" from hypothesis timestamps already in the DB.
 *
 * Core question: Is this issue newly emerged or has it resisted resolution
 * across multiple cycles? That distinction changes the editorial register:
 *
 *   Fresh (< 14 days):   "Customer proof is still limited."
 *   Aging (14–55 days):  "Validation has not materially improved."
 *   Structural (56+ d):  "The proof gap is becoming structural."
 *
 * Design principles:
 *   - No external dependencies beyond hypothesis provenance + center state
 *   - Deterministic (injectable `now` for testing)
 *   - Pre-computes evolved phrase families — conductor consumes without re-deriving
 *   - Composable (pure functions, no side effects)
 */

import type { HypothesisProvenanceCard } from "@/hooks/useStrategicHypotheses";
import type { CenterStateKey, UnifiedConfidencePosture } from "@/lib/strategicCenterSurface";
import {
  deriveValidationCadencePressure,
  type EvidenceAgingState,
  type ValidationCadencePressure,
} from "@/lib/evidenceAging";

// ─── Public types ──────────────────────────────────────────────────────────────

/**
 * How long the current proof gap has persisted without material improvement.
 * Derived from the age of hypotheses in unvalidated / directional states.
 */
export type ProofGapMaturity = "fresh" | "aging" | "structural";

/**
 * How much contradiction pressure is currently active and how entrenched it is.
 */
export type ContradictionPressure = "none" | "isolated" | "accumulating" | "entrenched";

/**
 * Whether overall strategic confidence is improving, degrading, or holding.
 */
export type MomentumDirection = "strengthening" | "weakening" | "cooling" | "stable";

export type TemporalPosture = {
  proofGapMaturity: ProofGapMaturity;
  contradictionPressure: ContradictionPressure;
  momentum: MomentumDirection;
  /**
   * Approximate number of 2-week strategic cycles the current state has persisted.
   * Used for cycle-indexed narrative generation and diagnostic context.
   */
  approxCycleCount: number;
  /**
   * Temporally-evolved phrase families for the conductor to use in place of
   * static evolved phrases. Null when maturity is fresh and no elevation needed.
   */
  proofGapEvolvedPhrases: string[] | null;
  contradictionEvolvedPhrases: string[] | null;
  /**
   * Landscape summary line overrides keyed by center state.
   * Null when the standard landscape lines are appropriate.
   */
  landscapeEvolution: Partial<Record<CenterStateKey, string>> | null;
  /**
   * Age classification of the freshest customer proof signals.
   * "unconfirmed" when no customer signals are present.
   * Passed in by the caller via the customerProofAgingState param.
   */
  customerProofAgingState: EvidenceAgingState;
  /**
   * Whether validation cadence is under temporal pressure.
   * Derived from customerProofAgingState + proofGapMaturity.
   */
  validationCadencePressure: ValidationCadencePressure;
};

// Re-export for consumers that only import from this module
export type { EvidenceAgingState, ValidationCadencePressure };

// ─── Day thresholds ────────────────────────────────────────────────────────────

const AGING_THRESHOLD_DAYS = 14;
const STRUCTURAL_THRESHOLD_DAYS = 56;

// ─── Phrase families (temporally indexed) ─────────────────────────────────────

const PROOF_GAP_PHRASES: Record<Exclude<ProofGapMaturity, "fresh">, string[]> = {
  aging: [
    "Validation stalled.",
    "Proof gap persisting.",
    "Signal still directional. No behavioral confirmation.",
    "Proof-gathering stalled.",
  ],
  structural: [
    "Proof gap structural.",
    "Validation is the persistent constraint.",
    "Proof falling further behind direction.",
    "Proof immobile. Direction exposed.",
  ],
};

const CONTRADICTION_PHRASES: Record<Exclude<ContradictionPressure, "none" | "isolated">, string[]> = {
  accumulating: [
    "Contradictions accumulating.",
    "Multiple conflicts unresolved.",
    "Positioning tension building.",
  ],
  entrenched: [
    "Contradiction entrenched.",
    "Positioning tension unresolved across cycles.",
    "Conflict now structural.",
  ],
};

const LANDSCAPE_STRUCTURAL_PROOF_GAP =
  "Proof gap persisted — direct investment required, not just time.";

const LANDSCAPE_ENTRENCHED_CONTRADICTION =
  "Structural confidence. The contradiction has resisted resolution.";

// ─── Internal derivation utilities ────────────────────────────────────────────

function daysSince(dateStr: string, now: Date): number {
  const then = new Date(dateStr);
  if (isNaN(then.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / 86_400_000));
}

function classifyProofGapMaturity(days: number): ProofGapMaturity {
  if (days >= STRUCTURAL_THRESHOLD_DAYS) return "structural";
  if (days >= AGING_THRESHOLD_DAYS) return "aging";
  return "fresh";
}

function approxCycles(days: number): number {
  if (days < AGING_THRESHOLD_DAYS) return 1;
  return Math.min(8, 1 + Math.floor(days / 14));
}

/**
 * Finds hypotheses that represent an unresolved proof gap.
 * These are active hypotheses in inferred or directional states — not yet
 * validated, not contradicted (contradicted gets its own path).
 */
function proofGapHypotheses(hypotheses: HypothesisProvenanceCard[]): HypothesisProvenanceCard[] {
  return hypotheses.filter(
    (h) =>
      h.hypothesis.is_active &&
      (h.hypothesis.hypothesis_state === "inferred" ||
        h.hypothesis.validation_state === "unvalidated") &&
      h.hypothesis.hypothesis_state !== "contradicted" &&
      h.hypothesis.hypothesis_state !== "retired" &&
      h.hypothesis.hypothesis_state !== "reframed",
  );
}

function contradictedHypotheses(hypotheses: HypothesisProvenanceCard[]): HypothesisProvenanceCard[] {
  return hypotheses.filter(
    (h) => h.hypothesis.is_active && h.hypothesis.hypothesis_state === "contradicted",
  );
}

function oldestAge(hyps: HypothesisProvenanceCard[], now: Date): number {
  if (hyps.length === 0) return 0;
  return Math.max(...hyps.map((h) => daysSince(h.hypothesis.updated_at || h.hypothesis.created_at, now)));
}

function classifyContradictionPressure(
  contradicted: HypothesisProvenanceCard[],
  now: Date,
): ContradictionPressure {
  if (contradicted.length === 0) return "none";
  const oldest = oldestAge(contradicted, now);
  if (oldest >= STRUCTURAL_THRESHOLD_DAYS) return "entrenched";
  if (contradicted.length >= 2 || oldest >= AGING_THRESHOLD_DAYS) return "accumulating";
  return "isolated";
}

function deriveMomentum(
  confidencePosture: UnifiedConfidencePosture,
  proofGapMaturity: ProofGapMaturity,
  contradictionPressure: ContradictionPressure,
): MomentumDirection {
  if (confidencePosture === "stabilizing" || confidencePosture === "coherent") {
    return "strengthening";
  }
  if (
    contradictionPressure === "accumulating" ||
    contradictionPressure === "entrenched" ||
    confidencePosture === "contradicted"
  ) {
    return "weakening";
  }
  if (confidencePosture === "directional" && proofGapMaturity !== "fresh") {
    return "cooling";
  }
  return "stable";
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function deriveTemporalPosture(args: {
  hypotheses: HypothesisProvenanceCard[];
  centerStateKey: CenterStateKey;
  confidencePosture: UnifiedConfidencePosture;
  topContradiction: string | null;
  now?: Date;
  /**
   * Worst aging state of customer proof signals in the portfolio.
   * Defaults to "unconfirmed" — absence of data is not the same as freshness.
   * Callers with signal access should compute this via worstCustomerProofAge().
   */
  customerProofAgingState?: EvidenceAgingState;
}): TemporalPosture {
  const { hypotheses, centerStateKey, confidencePosture, topContradiction } = args;
  const now = args.now ?? new Date();

  // Proof gap maturity — keyed off age of unresolved inferred hypotheses
  const proofGapHyps = proofGapHypotheses(hypotheses);
  const proofGapDays = oldestAge(proofGapHyps, now);
  const proofGapMaturity = classifyProofGapMaturity(proofGapDays);

  // Contradiction pressure
  const contradicted = contradictedHypotheses(hypotheses);
  // Also count topContradiction as at least isolated if no contradicted hypotheses
  const effectiveContradicted = contradicted.length === 0 && topContradiction ? [] : contradicted;
  const contradictionPressure = topContradiction && contradicted.length === 0
    ? "isolated"
    : classifyContradictionPressure(effectiveContradicted, now);

  const momentum = deriveMomentum(confidencePosture, proofGapMaturity, contradictionPressure);
  const approxCycleCount = approxCycles(Math.max(proofGapDays, oldestAge(contradicted, now)));

  // Evolved phrase families — null when fresh/none (conductor falls back to static phrases)
  const proofGapEvolvedPhrases: string[] | null =
    proofGapMaturity === "fresh" ? null : PROOF_GAP_PHRASES[proofGapMaturity];

  const contradictionEvolvedPhrases: string[] | null =
    contradictionPressure === "none" || contradictionPressure === "isolated"
      ? null
      : CONTRADICTION_PHRASES[contradictionPressure as "accumulating" | "entrenched"];

  // Landscape evolutions — only when state has meaningfully elevated
  let landscapeEvolution: Partial<Record<CenterStateKey, string>> | null = null;
  if (proofGapMaturity === "structural" && centerStateKey === "strategy_outrunning_proof") {
    landscapeEvolution = { strategy_outrunning_proof: LANDSCAPE_STRUCTURAL_PROOF_GAP };
  } else if (contradictionPressure === "entrenched" && centerStateKey === "perception_conflicts_emphasis") {
    landscapeEvolution = { perception_conflicts_emphasis: LANDSCAPE_ENTRENCHED_CONTRADICTION };
  }

  // Validation cadence pressure — derived from customer proof age + proof gap maturity
  const customerProofAgingState: EvidenceAgingState = args.customerProofAgingState ?? "unconfirmed";
  const validationCadencePressure = deriveValidationCadencePressure({
    customerProofAgingState,
    proofGapMaturity,
  });

  return {
    proofGapMaturity,
    contradictionPressure,
    momentum,
    approxCycleCount,
    proofGapEvolvedPhrases,
    contradictionEvolvedPhrases,
    landscapeEvolution,
    customerProofAgingState,
    validationCadencePressure,
  };
}
