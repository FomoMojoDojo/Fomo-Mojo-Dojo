/**
 * Operating Mode
 *
 * Four interaction postures for executive engagement. These are not tabs —
 * they govern how the same intelligence composes itself for different purposes.
 *
 * Scan:     Fast situational awareness. Arrive cold, orient quickly.
 * Diagnose: Investigate uncertainty. Contradictions open, evidence paths visible.
 * Decide:   Commitment review. Routes primary, tradeoffs foregrounded.
 * Monitor:  Drift and movement. Proof arrival, confidence changes, assumption shifts.
 *
 * Design principles:
 *   - Same data, different composition — no new queries per mode
 *   - Defaults derived from attention posture + portfolio state
 *   - User can always override manually
 *   - Modes suppress complexity rather than revealing it
 */

import type { AttentionContext } from "@/lib/strategicAttention";
import type { DecisionOperationsContext } from "@/lib/decisionOperations";

// ─── Mode type ────────────────────────────────────────────────────────────────

export type OperatingMode = "scan" | "diagnose" | "decide" | "monitor";

export const OPERATING_MODE_LABELS: Record<OperatingMode, string> = {
  scan:     "SCAN",
  diagnose: "DIAGNOSE",
  decide:   "DECIDE",
  monitor:  "MONITOR",
};

export const OPERATING_MODE_DESCRIPTIONS: Record<OperatingMode, string> = {
  scan:     "Fastest read",
  diagnose: "Evidence and uncertainty",
  decide:   "Commitment readiness",
  monitor:  "Drift and movement",
};

// ─── Content configuration per mode ──────────────────────────────────────────

/**
 * What each mode surfaces. Applied on top of phase-based section visibility —
 * mode can suppress sections but never expand beyond what phase permits.
 */
export type OperatingModeContentConfig = {
  /** Max total signals after attention pipeline. null = no additional cap. */
  maxSignals: number | null;
  showHypotheses: boolean;
  showMovement: boolean;
  showConfidenceLandscape: boolean;
  /** Max routes rendered. null = all routes. */
  maxRoutes: number | null;
  /** Suppress signals scored "ambient" by attention (low pressure, stable). */
  suppressAmbientSignals: boolean;
  /** Routes section has visual emphasis (spacing, header weight). */
  emphasizeRoutes: boolean;
  /** Open contradiction detail by default. */
  expandContradictions: boolean;
};

export const MODE_CONTENT: Record<OperatingMode, OperatingModeContentConfig> = {
  scan: {
    maxSignals: 4,
    showHypotheses: false,
    showMovement: false,
    showConfidenceLandscape: false,
    maxRoutes: 1,
    suppressAmbientSignals: true,
    emphasizeRoutes: false,
    expandContradictions: false,
  },
  diagnose: {
    maxSignals: null,
    showHypotheses: true,
    showMovement: true,
    showConfidenceLandscape: true,
    maxRoutes: null,
    suppressAmbientSignals: false,
    emphasizeRoutes: false,
    expandContradictions: true,
  },
  decide: {
    maxSignals: 5,
    showHypotheses: false,
    showMovement: false,
    showConfidenceLandscape: false,
    maxRoutes: null,
    suppressAmbientSignals: true,
    emphasizeRoutes: true,
    expandContradictions: true,
  },
  monitor: {
    maxSignals: null,
    showHypotheses: false,
    showMovement: true,
    showConfidenceLandscape: true,
    maxRoutes: null,
    suppressAmbientSignals: false,
    emphasizeRoutes: false,
    expandContradictions: false,
  },
};

// ─── Default mode derivation ──────────────────────────────────────────────────

/**
 * Derives the recommended initial mode from attention posture + portfolio state.
 * User can always switch manually — this is a default, not a lock.
 *
 * Priority:
 *   focused  → decide    (critical concern needs a commitment response)
 *   watchful → diagnose  (active concerns need investigation before commitment)
 *   fragmented → diagnose (competing pressures, no dominant thread)
 *   stable + committed routes → monitor
 *   otherwise → scan
 */
export function deriveDefaultMode(
  attention: AttentionContext | null,
  decisionOps: DecisionOperationsContext | null,
): OperatingMode {
  if (!attention) return "scan";

  if (attention.posture === "focused") return "decide";

  if (attention.posture === "watchful" || attention.posture === "fragmented") return "diagnose";

  if (attention.posture === "stable" && decisionOps) {
    const hasCommitted = decisionOps.routes.some(
      (r) => r.lifecycleState === "committed" || r.lifecycleState === "advancing",
    );
    if (hasCommitted) return "monitor";
  }

  return "scan";
}
