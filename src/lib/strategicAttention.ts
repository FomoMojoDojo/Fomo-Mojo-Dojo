/**
 * Strategic Attention Architecture
 *
 * Attention is a governed resource. Every surfaced element consumes cognitive
 * bandwidth, competes with other signals, and shapes organizational focus.
 * Therefore: visibility must become selective, not comprehensive.
 *
 * This layer answers:
 *   What deserves attention right now?          → AttentionPriority
 *   Where is the system's attention directed?   → AttentionPosture
 *   What is the single most important concern?  → dominantConcern
 *   How many signals should each tier surface?  → signalQuotas
 *
 * Design principles:
 *   - Governs visibility, not truth (true ≠ important)
 *   - Conservative (suppresses rather than amplifies)
 *   - Deterministic (same inputs → same posture)
 *   - Internal orchestration — no user-facing priority badges
 *
 * Priority order (attention governs what discipline/register output reaches the surface):
 *   attention → discipline → register → temporal → static fallback
 *
 * Restraint targets:
 *   - Max 1 critical concern at a time
 *   - Escalation stacking collapsed: multiple "commitment ahead of proof" signals → 1
 *   - Ambient signals suppressed in focused mode (critical concern dominates)
 *   - Fragmented posture: ambient noise removed, competing pressures not amplified
 */

import type { ExecutiveRegister } from "@/lib/executiveRegister";
import type { DisciplineAssessment } from "@/lib/confidenceDiscipline";
import type { TemporalPosture } from "@/lib/strategicTemporalState";
import type { GovernanceDrift, DecisionLifecycleState } from "@/lib/decisionOperations";
import type { CommitmentState } from "@/lib/decisionSystem";
import type { DecayContext } from "@/lib/strategicDecay";

// ─── Attention priority ───────────────────────────────────────────────────────

/**
 * Priority tier for a surfaced element.
 * INTERNAL ONLY — never rendered as a badge or label to users.
 */
export type AttentionPriority = "critical" | "active" | "ambient" | "suppressed";

// ─── Attention posture ────────────────────────────────────────────────────────

/**
 * System-wide attention state. Drives signal quotas and landscape framing.
 *
 *   focused:    One critical concern dominates. Others stay background.
 *   watchful:   Active concerns tracked. No single critical interrupt.
 *   stable:     Ambient alignment. Coherent state, no urgency.
 *   fragmented: Multiple competing pressures. No single dominant concern.
 */
export type AttentionPosture = "focused" | "watchful" | "stable" | "fragmented";

export const ATTENTION_POSTURE_LABELS: Record<AttentionPosture, string> = {
  focused:    "Focus required",
  watchful:   "Active monitoring",
  stable:     "Stable",
  fragmented: "Distributed pressure",
};

// ─── Signal admission quotas ──────────────────────────────────────────────────

/**
 * How many signals per priority tier to admit to the surface.
 * Applied AFTER the existing deduplication and center-echo suppression pipeline.
 *
 * Focused:    4 max — one critical thing + minimal context
 * Watchful:   6 max — key concerns + context
 * Stable:     6 max — ambient-friendly, no critical interrupt
 * Fragmented: 4 max — competing pressures without ambient noise
 */
export const SIGNAL_QUOTAS: Record<AttentionPosture, { readonly critical: number; readonly active: number; readonly ambient: number }> = {
  focused:    { critical: 1, active: 2, ambient: 1 },
  watchful:   { critical: 1, active: 3, ambient: 2 },
  stable:     { critical: 0, active: 3, ambient: 3 },
  fragmented: { critical: 0, active: 3, ambient: 1 },
};

// ─── Public types ─────────────────────────────────────────────────────────────

export type AttentionContext = {
  posture: AttentionPosture;
  postureLabel: string;
  /**
   * The single most important concern right now.
   * One plain-language sentence, or null when the system is stable.
   * NOT user-facing — used by conductor and signals to align phrasing.
   */
  dominantConcern: string | null;
  /**
   * True when multiple escalation signals converge on the same concept
   * (e.g., discipline.escalationWithoutProof + governance overcommitted +
   * re-evaluating route all firing simultaneously).
   * Signals layer uses this to collapse to the single strongest signal.
   */
  escalationCollapsed: boolean;
  /** Admission quotas per priority tier for the signal surface. */
  signalQuotas: Readonly<{ critical: number; active: number; ambient: number }>;
};

// ─── Signal priority scoring ──────────────────────────────────────────────────

/**
 * Scores a single signal's attention priority given the current posture.
 *
 * Accepts generic signal fields (not StrategicSignal) to avoid circular imports.
 * Callers in strategicSignals.ts apply this to StrategicSignal instances.
 */
export function scoreSignalPriority(
  signal: {
    readonly id?: string;
    readonly pressure: "low" | "medium" | "high";
    readonly relevance: string;
    readonly polarity: string;
  },
  posture: AttentionPosture,
  decay?: DecayContext | null,
): AttentionPriority {
  // Decay: per-signal-id state — applied before all other rules
  if (decay && signal.id) {
    const decayState = decay.signalDecay.get(signal.id);
    if (decayState === "ambient") return "ambient";
    // "fading" falls through — still surfaces but caps at "active" below
  }

  // Decay: compress reinforcing signals when conditions are stabilizing
  // Customer proof and commitment pressure are always exempt — progress must surface
  if (
    decay?.compressReinforcingSignals &&
    signal.polarity === "reinforcing" &&
    signal.relevance !== "customer_proof" &&
    signal.relevance !== "commitment_pressure"
  ) {
    return "ambient";
  }

  // In focused mode: ambient/low-pressure signals don't compete with the critical concern
  if (posture === "focused" && signal.pressure === "low") return "suppressed";

  // In fragmented mode: ambient signals add noise to already-contested attention
  if (posture === "fragmented" && signal.pressure === "low") return "suppressed";

  // Critical: high-pressure commitment decisions
  if (signal.pressure === "high" && signal.relevance === "commitment_pressure") return "critical";

  // Critical: high-pressure active contradictions
  // Decay: cooled contradictions are capped at "active" — no longer escalate to critical
  if (signal.polarity === "contradictory" && signal.pressure === "high") {
    if (decay?.coolContradictorySignals) return "active";
    return "critical";
  }

  // Active: any high-pressure signal not already critical
  if (signal.pressure === "high") return "active";

  // Active: blocked or accelerating always worth watching
  if (signal.polarity === "blocked" || signal.polarity === "accelerating") return "active";

  // Active: medium-pressure signals
  if (signal.pressure === "medium") return "active";

  // Ambient: low-pressure, stable, reinforcing
  return "ambient";
}

// ─── Posture derivation ───────────────────────────────────────────────────────

type RouteDecisionSnapshot = {
  readonly lifecycleState: DecisionLifecycleState;
  readonly commitmentState: CommitmentState;
};

function deriveDominantConcern(args: {
  register: ExecutiveRegister;
  discipline: DisciplineAssessment | null;
  governanceDrift: GovernanceDrift;
  contradictionPressure: TemporalPosture["contradictionPressure"] | null;
  hasReEvaluatingRoute: boolean;
  hasCommittedRoute: boolean;
  decay?: DecayContext | null;
}): string | null {
  const { register, discipline, governanceDrift, contradictionPressure, hasReEvaluatingRoute, hasCommittedRoute, decay } = args;

  // Highest priority: committed route contradicted — active governance failure
  if (hasReEvaluatingRoute) {
    return "Committed route contradicted — re-evaluation warranted.";
  }

  // Escalation register with no behavioral proof
  if (register === "escalation" && discipline?.restraintFlags.escalationWithoutProof) {
    return "Commitment pressure rising ahead of proof.";
  }

  // Portfolio overcommitted without customer validation
  if (governanceDrift.overcommitted && governanceDrift.driftingCommitment) {
    return "Portfolio committed without customer validation.";
  }

  // Structural contradiction pressure with active commitment
  // Decay: cooled contradiction no longer fires as dominant concern — it is structural background
  if (
    (contradictionPressure === "structural" || contradictionPressure === "entrenched") &&
    hasCommittedRoute &&
    !decay?.contradictionCooled
  ) {
    return "Structural contradiction active while commitment is in place.";
  }

  // Structural register pressure
  if (register === "structural_pressure") {
    return "Validation is the active constraint.";
  }

  // Validation bottleneck
  if (governanceDrift.validationBottleneck) {
    return "Validation bottleneck limiting forward movement.";
  }

  return null;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function buildAttentionContext(args: {
  register: ExecutiveRegister;
  discipline: DisciplineAssessment | null;
  temporalPosture: TemporalPosture | null;
  governanceDrift: GovernanceDrift;
  routeDecisions: RouteDecisionSnapshot[];
  decay?: DecayContext | null;
}): AttentionContext {
  const { register, discipline, temporalPosture, governanceDrift, routeDecisions, decay } = args;

  const contradictionPressure = temporalPosture?.contradictionPressure ?? null;
  const hasReEvaluatingRoute = routeDecisions.some((r) => r.lifecycleState === "re-evaluating");
  const hasCommittedRoute = routeDecisions.some(
    (r) => r.commitmentState === "commit" || r.commitmentState === "scale",
  );

  // ─── Critical concern flags (each independently justifies "focused" posture) ─
  // Decay: cooled entrenched contradiction no longer qualifies as a critical flag —
  // it is structural background and should not drive "focused" posture.
  const contradictionIsCritical =
    (contradictionPressure === "structural" || contradictionPressure === "entrenched") &&
    hasCommittedRoute &&
    !decay?.contradictionCooled;

  const criticalFlags = [
    hasReEvaluatingRoute,
    register === "escalation" && (discipline?.restraintFlags.escalationWithoutProof ?? false),
    governanceDrift.overcommitted && governanceDrift.driftingCommitment,
    contradictionIsCritical,
  ];
  const criticalCount = criticalFlags.filter(Boolean).length;

  // ─── Active concern flags (each contributes to "watchful" or "fragmented") ──
  const activeFlags = [
    register === "structural_pressure",
    governanceDrift.any && !governanceDrift.overcommitted,
    governanceDrift.validationBottleneck && !governanceDrift.overcommitted,
    discipline?.restraintFlags.prematureCertainty ?? false,
    discipline?.restraintFlags.falseConvergence ?? false,
    contradictionPressure === "accumulating" || contradictionPressure === "entrenched",
  ];
  const activeCount = activeFlags.filter(Boolean).length;

  // ─── Posture ──────────────────────────────────────────────────────────────────
  let posture: AttentionPosture;
  if (criticalCount >= 1) {
    posture = "focused";
  } else if (activeCount >= 3) {
    // Multiple competing concerns — no single dominant thread
    posture = "fragmented";
  } else if (activeCount >= 1) {
    posture = "watchful";
  } else {
    posture = "stable";
  }

  // ─── Dominant concern ─────────────────────────────────────────────────────────
  const dominantConcern = deriveDominantConcern({
    register,
    discipline,
    governanceDrift,
    contradictionPressure,
    hasReEvaluatingRoute,
    hasCommittedRoute,
    decay,
  });

  // ─── Escalation collapse ──────────────────────────────────────────────────────
  // Collapse when multiple independent signals are all pointing to the same critical concept.
  // The signals layer will keep only the strongest, suppressing the rest.
  const escalationCollapsed =
    criticalCount >= 2 ||
    (governanceDrift.overcommitted && (discipline?.restraintFlags.escalationWithoutProof ?? false));

  return {
    posture,
    postureLabel: ATTENTION_POSTURE_LABELS[posture],
    dominantConcern,
    escalationCollapsed,
    signalQuotas: SIGNAL_QUOTAS[posture],
  };
}
