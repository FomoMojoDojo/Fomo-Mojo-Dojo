/**
 * Strategic Decay Engine
 *
 * The system must learn when something no longer deserves executive attention.
 * Without decay, strategic residue accumulates and erodes executive trust.
 *
 * This layer answers:
 *   Is this contradiction still acute, or has it become structural background?
 *   Is this proof gap still alarming, or is it a known persistent condition?
 *   Are these reinforcing signals adding signal, or just confirming stability?
 *
 * Three decay scenarios:
 *
 * 1. Entrenched contradiction cooling
 *    Contradiction present 56+ days with non-worsening momentum.
 *    → No longer drives "focused" attention posture.
 *    → Contradictory signals capped at "active", not "critical".
 *    → Becomes structural background, not acute pressure.
 *
 * 2. Structural proof gap normalization
 *    Proof gap 56+ days with stable/strengthening momentum.
 *    → Known condition, not newly alarming.
 *    → Specific "still directional" signals compress to ambient.
 *
 * 3. Conditions stabilizing
 *    Strengthening momentum, no active contradiction pressure.
 *    → Reinforcing positioning/sequencing signals become background confidence.
 *    → Customer proof signals are exempt — validation progress always surfaces.
 *
 * Design principles:
 *   - Decay is invisible — never rendered as labels, badges, or countdowns
 *   - Decay changes emphasis, not truth (historical state still inspectable in Diagnose)
 *   - Conservative — only fires on clear multi-week duration signals
 *   - Does NOT suppress acute new pressure (re-evaluating, escalation, governance drift)
 */

import type { TemporalPosture } from "@/lib/strategicTemporalState";
import type { UnifiedConfidencePosture } from "@/lib/strategicCenterSurface";

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * Decay state for a specific signal.
 *   fading  — signal still surfaces but is capped at "active" (not critical)
 *   ambient — signal treated as ambient regardless of pressure/posture
 */
export type SignalDecayState = "fading" | "ambient";

export type DecayContext = {
  /**
   * Entrenched contradiction (56+ days) with non-worsening momentum.
   * Removes contradiction-based "focused" posture trigger.
   */
  contradictionCooled: boolean;
  /**
   * Structural proof gap (56+ days) with stable momentum.
   * Known persistent condition — directional/emerging signals compress.
   */
  proofGapNormalized: boolean;
  /**
   * Strengthening/stable momentum with no active contradiction pressure.
   * Reinforcing positioning and sequencing signals become background.
   */
  conditionsStabilizing: boolean;
  /** Cap contradictory signals at "active" — no critical pressure from old contradictions. */
  coolContradictorySignals: boolean;
  /**
   * Compress reinforcing signals with non-customer-proof relevance to ambient.
   * Customer validation signals are always exempt — proof progress always surfaces.
   */
  compressReinforcingSignals: boolean;
  /**
   * Per-signal-id decay state for named static signals.
   * Dynamic signals (hyp-*, port-esc-*) are handled by the global flags above.
   */
  signalDecay: ReadonlyMap<string, SignalDecayState>;
  /**
   * One institutional sentence describing the structural background condition.
   * Null when no decay is active. Used for Diagnose mode context only.
   */
  backgroundNote: string | null;
};

// ─── Decay rule constants ─────────────────────────────────────────────────────

/**
 * Signals that decay to "ambient" when the proof gap becomes structural and
 * momentum is not deteriorating. These signals express "still directional" —
 * a known condition, not an acute alarm.
 */
const STRUCTURAL_PROOF_GAP_AMBIENT: readonly string[] = [
  "cr-directional",  // Customer proof directional — known after 56+ days
  "pos-emerging",    // Positioning emerging but stuck — not advancing to coherent
];

/**
 * Signals that decay to "ambient" when conditions are stabilizing
 * (strengthening momentum, no contradiction pressure).
 * These signals express background confidence, not new information.
 *
 * Intentionally excludes customer_proof and commitment_pressure relevance signals.
 * cr-converging (customer_proof) and port-converging (commitment_pressure) are
 * exempt by design — the scoreSignalPriority exemption applies globally, but
 * the per-ID map fires before that check and would bypass it. Keep validation
 * progress and commitment momentum out of this list.
 */
const STABILIZING_AMBIENT: readonly string[] = [
  "pos-coherent",    // Positioning coherent — background confidence, not active pressure
  "pos-emerging",    // Also ambient when stabilizing (if not already marked above)
];

/**
 * Signals that decay to "fading" when the contradiction is cooled.
 * Still surfaced as "active", but not driven to "critical".
 *
 * Only pos-contradicted (market_perception) is listed here. cr-contradicted is the
 * CustomerRealityNarrative signal (customer_proof relevance) — it tracks customer
 * *behavior* contradicting direction, which is independent of hypothesis contradiction
 * age. Customer reality contradictions are always fresh data; fading them based on
 * hypothesis temporal state is wrong.
 */
const CONTRADICTION_COOLED_FADING: readonly string[] = [
  "pos-contradicted",
];

// ─── Main export ──────────────────────────────────────────────────────────────

export function buildDecayContext(args: {
  temporalPosture: TemporalPosture | null;
  confidencePosture: UnifiedConfidencePosture | null;
}): DecayContext {
  const empty: DecayContext = {
    contradictionCooled: false,
    proofGapNormalized: false,
    conditionsStabilizing: false,
    coolContradictorySignals: false,
    compressReinforcingSignals: false,
    signalDecay: new Map(),
    backgroundNote: null,
  };

  if (!args.temporalPosture) return empty;

  const { contradictionPressure, proofGapMaturity, momentum } = args.temporalPosture;
  const cp = args.confidencePosture;

  // ─── Rule 1: Entrenched contradiction cooling ─────────────────────────────
  // Contradiction present 56+ days with non-deteriorating momentum.
  // Not getting worse → no longer justifies acute "focused" posture.
  const contradictionCooled =
    contradictionPressure === "entrenched" && momentum !== "weakening";

  // ─── Rule 2: Structural proof gap normalization ───────────────────────────
  // 56+ days with stable/strengthening momentum.
  // Proof gap is a known structural condition — directional signals are ambient.
  const proofGapNormalized =
    proofGapMaturity === "structural" &&
    (momentum === "stable" || momentum === "strengthening" || momentum === "cooling");

  // ─── Rule 3: Conditions stabilizing ──────────────────────────────────────
  // Strengthening/stable momentum, no contradictions (or only isolated).
  // Background confidence — reinforcing positioning/sequencing signals are noise.
  const conditionsStabilizing =
    (momentum === "strengthening" || momentum === "stable") &&
    (contradictionPressure === "none" || contradictionPressure === "isolated") &&
    (cp === "coherent" || cp === "stabilizing" || cp === "directional");

  // ─── Build signal decay map ───────────────────────────────────────────────
  const decay = new Map<string, SignalDecayState>();

  if (proofGapNormalized) {
    for (const id of STRUCTURAL_PROOF_GAP_AMBIENT) decay.set(id, "ambient");
  }

  if (conditionsStabilizing) {
    for (const id of STABILIZING_AMBIENT) {
      if (!decay.has(id)) decay.set(id, "ambient");
    }
  }

  if (contradictionCooled) {
    for (const id of CONTRADICTION_COOLED_FADING) {
      if (!decay.has(id)) decay.set(id, "fading");
    }
  }

  // ─── Background note ──────────────────────────────────────────────────────
  let backgroundNote: string | null = null;
  if (contradictionCooled && proofGapNormalized) {
    backgroundNote = "Structural contradiction and proof gap — established conditions, no recent escalation.";
  } else if (contradictionCooled) {
    backgroundNote = "Contradiction entrenched — no recent escalation. Structural background.";
  } else if (proofGapNormalized) {
    backgroundNote = "Proof gap established — known structural condition.";
  } else if (conditionsStabilizing) {
    backgroundNote = "Conditions stabilizing — reinforcing signals are background context.";
  }

  return {
    contradictionCooled,
    proofGapNormalized,
    conditionsStabilizing,
    coolContradictorySignals: contradictionCooled,
    compressReinforcingSignals: conditionsStabilizing,
    signalDecay: decay,
    backgroundNote,
  };
}
