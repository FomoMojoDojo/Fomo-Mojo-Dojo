/**
 * Executive Register System
 *
 * Determines the communication register appropriate to the current strategic
 * condition and provides phrase families calibrated to that register.
 *
 * Register is NOT personality, tone, or stylistic preference.
 * It is a property of the strategic situation:
 *   - A structural contradiction warrants cold, declarative language
 *   - An early directional read warrants open, qualifying language
 *   - A converging direction warrants calm, observational language
 *   - An escalation warrants sharp, causal language
 *   - A stable, coherent state warrants quiet, sparse language
 *
 * Design principles:
 *   - Deterministic (driven by condition, not randomness)
 *   - Composable (phrase selection is a pure function)
 *   - Inspectable (callers can read the derived register)
 *   - Conservative (register shift is subtle — language evolves, not transforms)
 *
 * Register hierarchy (each condition overrides the one below):
 *   escalation > structural_pressure > stabilized > converging > exploratory
 */

import type { NarrativeConcept } from "@/lib/narrativeConductor";
import type { CenterStateKey, UnifiedConfidencePosture } from "@/lib/strategicCenterSurface";
import type { TemporalPosture } from "@/lib/strategicTemporalState";
import type { PortfolioState } from "@/lib/decisionSystem";

// ─── Public types ──────────────────────────────────────────────────────────────

/**
 * Five strategic communication registers.
 *
 * Each maps to a distinct combination of:
 * - compression level
 * - certainty markers
 * - sentence shape
 * - verb selection
 * - semantic temperature
 */
export type ExecutiveRegister =
  | "exploratory"        // early reads, forming signals, low-certainty movement
  | "converging"         // strengthening proof, accumulating validation
  | "structural_pressure"// persistent gaps, entrenched contradictions, blocked commitment
  | "stabilized"         // mature coherence, validated direction, low volatility
  | "escalation";        // active danger, scaling ahead of proof, fragmentation at decision stage

// ─── Register derivation ──────────────────────────────────────────────────────

/**
 * Derives the appropriate register from current strategic state.
 *
 * Precedence (descending):
 * 1. Escalation — portfolio danger or active scaling ahead of proof
 * 2. Structural pressure — persistent unresolved state (structural gaps, entrenched contradictions)
 * 3. Stabilized — mature coherence with low volatility
 * 4. Converging — strengthening momentum or accumulating proof
 * 5. Exploratory — fresh/uncertain state (default)
 */
export function deriveRegister(args: {
  confidencePosture: UnifiedConfidencePosture;
  temporalPosture: TemporalPosture;
  centerStateKey: CenterStateKey;
  hasEscalations: boolean;
  portfolioState?: PortfolioState | null;
}): ExecutiveRegister {
  const { confidencePosture, temporalPosture, hasEscalations, portfolioState } = args;
  const { proofGapMaturity, contradictionPressure, momentum } = temporalPosture;

  // 1. Escalation — active exposure under commitment or portfolio danger
  if (
    portfolioState === "scaling_ahead" ||
    (hasEscalations && (proofGapMaturity === "structural" || contradictionPressure === "entrenched")) ||
    (confidencePosture === "fragmented" && hasEscalations)
  ) {
    return "escalation";
  }

  // 2. Structural pressure — persistent unresolved state (not yet dangerous, but serious)
  if (
    proofGapMaturity === "structural" ||
    contradictionPressure === "entrenched" ||
    (contradictionPressure === "accumulating" && confidencePosture === "contradicted")
  ) {
    return "structural_pressure";
  }

  // 3. Stabilized — high confidence, low contradiction, low maturity pressure
  if (
    (confidencePosture === "coherent" || confidencePosture === "stabilizing") &&
    proofGapMaturity === "fresh" &&
    contradictionPressure === "none"
  ) {
    return "stabilized";
  }

  // 4. Converging — evidence building, momentum positive
  if (
    momentum === "strengthening" ||
    confidencePosture === "stabilizing" ||
    (proofGapMaturity === "aging" && momentum !== "cooling" && momentum !== "weakening")
  ) {
    return "converging";
  }

  // 5. Exploratory — default for fresh, uncertain, directional state
  return "exploratory";
}

// ─── Register phrase families ─────────────────────────────────────────────────

/**
 * Per-concept phrase families calibrated to each register.
 *
 * Phrase design by register:
 *   exploratory      — present progressive, open hedges ("forming", "still needed")
 *   converging       — active -ing fragments, directional but calmer
 *   structural_pressure — declarative, cold, no explanatory scaffolding
 *   stabilized       — past-participial ("established", "validated"), quiet
 *   escalation       — gerunds under pressure ("scaling ahead of", "diverging from")
 *
 * Empty arrays mean this concept + register combination is unlikely to occur.
 * The conductor falls back to temporal or static evolved phrases when empty.
 */
const CONCEPT_PHRASES_BY_REGISTER: Record<NarrativeConcept, Partial<Record<ExecutiveRegister, string[]>>> = {
  customer_proof_missing: {
    exploratory: [
      "Customer validation is still forming.",
      "Direction is ahead. Proof hasn't followed yet.",
      "Directional confidence. Validation still needed.",
    ],
    converging: [
      "Validation building. Customer signal not yet confirmed.",
      "Proof gap narrowing — not yet closed.",
      "Customer signal strengthening toward confirmation.",
    ],
    structural_pressure: [
      "Proof gap structural.",
      "Customer proof absent across cycles.",
      "Validation has not progressed in multiple cycles.",
    ],
    stabilized: [],
    escalation: [
      "Commitment ahead of customer proof.",
      "Direction scaling without validation.",
      "Proof absent. Exposure increasing.",
    ],
  },

  customer_proof_present: {
    exploratory: [
      "Early customer signals are aligning.",
      "Validation beginning to form.",
      "First customer signals confirming direction.",
    ],
    converging: [
      "Validation strengthening.",
      "Customer confirmation accumulating.",
      "Signal alignment building.",
    ],
    structural_pressure: [],
    stabilized: [
      "Validation established.",
      "Customer signal confirmed.",
      "Proof holding.",
    ],
    escalation: [],
  },

  positioning_conflict: {
    exploratory: [
      "A positioning tension is beginning to emerge.",
      "Routes and public perception are starting to diverge.",
      "Early positioning gap — not yet resolved.",
    ],
    converging: [
      "Positioning tension reducing.",
      "Coherence gap narrowing.",
      "Positioning and direction converging.",
    ],
    structural_pressure: [
      "Contradiction entrenched.",
      "Positioning divergence unresolved.",
      "Perception-strategy gap persists.",
    ],
    stabilized: [],
    escalation: [
      "Execution diverging from positioning.",
      "Positioning contradiction at decision stage.",
      "Identity conflict under commitment pressure.",
    ],
  },

  fragmentation: {
    exploratory: [
      "Direction is forming across multiple paths.",
      "Routes are early — no dominant path yet.",
      "Multiple paths still under exploration.",
    ],
    converging: [
      "A clearer path is beginning to emerge.",
      "Routes starting to converge.",
      "Portfolio direction sharpening.",
    ],
    structural_pressure: [
      "No clear path ahead.",
      "Portfolio fragmented.",
      "Route clarity absent.",
    ],
    stabilized: [],
    escalation: [
      "Portfolio fragmented at commitment stage.",
      "No route ready to commit.",
      "Fragmentation blocking forward progress.",
    ],
  },

  proof_gap: {
    exploratory: [
      "Validation is the open question.",
      "Proof gathering is in early stages.",
      "Evidence is building — not yet sufficient.",
    ],
    converging: [
      "Validation narrowing.",
      "Proof accumulating.",
      "Evidence strengthening.",
    ],
    structural_pressure: [
      "Validation is the binding constraint.",
      "Proof gap persisting across cycles.",
      "Evidence remains insufficient.",
    ],
    stabilized: [],
    escalation: [
      "Validation absent under commitment pressure.",
      "Evidence gap creating active exposure.",
      "Proof required before this can proceed.",
    ],
  },

  positioning_stabilizing: {
    exploratory: [
      "Positioning beginning to cohere.",
      "Route and direction alignment forming.",
      "Coherence emerging.",
    ],
    converging: [
      "Positioning coherence strengthening.",
      "Route alignment building.",
      "Direction and positioning converging.",
    ],
    structural_pressure: [],
    stabilized: [
      "Positioning coherent.",
      "Route alignment established.",
      "Coherence holding.",
    ],
    escalation: [],
  },
};

// ─── Phrase selection ──────────────────────────────────────────────────────────

/**
 * Returns the register-calibrated phrase family for a given concept, or null
 * if this concept × register combination has no applicable phrases.
 * The caller is responsible for fallback selection (temporal → static).
 */
export function phrasesForRegister(
  concept: NarrativeConcept,
  register: ExecutiveRegister,
): string[] | null {
  const family = CONCEPT_PHRASES_BY_REGISTER[concept]?.[register];
  return family && family.length > 0 ? family : null;
}

// ─── Register-aware landscape overrides ───────────────────────────────────────

/**
 * Register-shifted landscape summary lines.
 * These are alternatives to the base `LANDSCAPE_SUMMARY` lines for conditions
 * where the register meaningfully changes what the landscape section should foreground.
 *
 * Only populated for combinations where the shift is substantive.
 */
const LANDSCAPE_BY_REGISTER: Partial<Record<ExecutiveRegister, Partial<Record<CenterStateKey, string>>>> = {
  exploratory: {
    strategy_outrunning_proof:
      "Where proof is still needed — and where early validation would create the most traction.",
    direction_cohering:
      "Confidence is forming across layers — early signals are beginning to converge.",
  },
  structural_pressure: {
    strategy_outrunning_proof:
      "Proof gap has persisted — direct investment required, not just time.",
    perception_conflicts_emphasis:
      "Structural confidence below the gap. The contradiction has not resolved.",
    route_confidence_fragmented:
      "Confidence is fragmented across layers — no stable foundation yet.",
  },
  stabilized: {
    customer_validation_converging:
      "Confidence holding across layers. Proof is building.",
    positioning_stabilizing:
      "Confidence established across positioning and routes.",
    direction_cohering:
      "Confidence holding. Direction clear.",
  },
  escalation: {
    strategy_outrunning_proof:
      "Validation is absent. The current direction is exposed.",
    route_confidence_fragmented:
      "No stable confidence base — commitment is ahead of what the evidence supports.",
  },
};

/**
 * Returns a register-calibrated landscape summary line, or null if the base
 * line is appropriate for this register × center state combination.
 */
export function landscapeForRegister(
  centerStateKey: CenterStateKey,
  register: ExecutiveRegister,
): string | null {
  return LANDSCAPE_BY_REGISTER[register]?.[centerStateKey] ?? null;
}
