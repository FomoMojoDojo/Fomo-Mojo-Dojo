/**
 * Decision Posture Narrative
 *
 * Derives field-condition editorial lines from active strategic decisions.
 * These are the sentences that replace route-portfolio-state language when
 * first-class decisions exist:
 *
 *   "Commitment stabilizing around operational reliability."
 *   "Scaling decision remains unresolved under customer pressure."
 *   "Partnership direction weakening after recent validation."
 *   "Several decisions remain open under conflicting evidence."
 *
 * Priority ordering (highest urgency first):
 *   destabilizing → reframing → contradicted confidence → commit_ready
 *   → stabilizing → under_validation → committed → exploratory
 *
 * Design principles:
 *   - Pure functions (no side effects, no Supabase imports)
 *   - Prefers explicit current_posture when set (editorial override)
 *   - Conservative: never inflates confidence language
 *   - Atmospheric, not dashboard-summary style
 */

import type { StrategicDecisionRow } from "./strategicDecisionDomain";

// Subset of StrategicDecisionRow used for narrative derivation
export type NarrativeDecision = Pick<
  StrategicDecisionRow,
  | "decision_state"
  | "confidence_state"
  | "title"
  | "current_posture"
  | "confidence_movement"
  | "decision_memory"
>;

// ─── Field condition line ──────────────────────────────────────────────────────

/**
 * Derives a single editorial field-condition line from active decisions.
 * Returns null when no active (non-retired) decisions exist.
 *
 * When current_posture is set on the priority decision, it is used directly —
 * it represents an explicit editorial override written by the system or user.
 */
export function deriveDecisionFieldCondition(
  decisions: NarrativeDecision[],
): string | null {
  const active = decisions.filter((d) => d.decision_state !== "retired");
  if (active.length === 0) return null;

  // Priority 1: destabilizing — something is actively weakening
  const destabilizing = active.filter((d) => d.decision_state === "destabilizing");
  if (destabilizing.length > 0) {
    const d = destabilizing[0];
    if (d.current_posture) return d.current_posture;
    const latestMovement = d.confidence_movement.slice(-1)[0];
    return latestMovement?.direction === "weakening"
      ? `${d.title} is weakening under present evidence.`
      : `${d.title} has become unstable — the basis needs review.`;
  }

  // Priority 2: reframing — the question itself is shifting
  const reframing = active.filter((d) => d.decision_state === "reframing");
  if (reframing.length > 0) {
    const d = reframing[0];
    return d.current_posture ?? `${d.title} is being reframed.`;
  }

  // Priority 3: contradicted confidence (cross-state — any active state can have contradicted confidence)
  const contradicted = active.filter((d) => d.confidence_state === "contradicted");
  if (contradicted.length > 0) {
    return contradicted.length > 1
      ? "Several decisions remain open under conflicting evidence."
      : `${contradicted[0].title} faces contradicting evidence.`;
  }

  // Priority 4: commit_ready — a decision is ready to call
  const commitReady = active.filter((d) => d.decision_state === "commit_ready");
  if (commitReady.length > 0) {
    const d = commitReady[0];
    return d.current_posture ?? `${d.title} has reached commitment readiness.`;
  }

  // Priority 5: stabilizing — signal is converging
  const stabilizing = active.filter((d) => d.decision_state === "stabilizing");
  if (stabilizing.length > 0) {
    const d = stabilizing[0];
    if (d.current_posture) return d.current_posture;
    return stabilizing.length === active.length && active.length === 1
      ? `Commitment stabilizing around ${d.title.charAt(0).toLowerCase() + d.title.slice(1)}.`
      : `Commitment stabilizing — ${stabilizing.length} direction${stabilizing.length === 1 ? "" : "s"} converging.`;
  }

  // Priority 6: under_validation — validation is in progress
  const underValidation = active.filter((d) => d.decision_state === "under_validation");
  if (underValidation.length > 0) {
    if (active.length === 1) {
      return underValidation[0].current_posture ?? `${underValidation[0].title} remains under validation.`;
    }
    return `${underValidation.length} commitment question${underValidation.length === 1 ? "" : "s"} under active validation.`;
  }

  // Priority 7: all committed
  const committed = active.filter((d) => d.decision_state === "committed");
  if (committed.length === active.length) {
    return active.length === 1
      ? (committed[0].current_posture ?? `${committed[0].title} is committed.`)
      : `${committed.length} decisions committed.`;
  }

  // Fallback: exploratory / mixed
  const openCount = active.filter((d) => d.decision_state !== "committed").length;
  return openCount === 1
    ? "1 commitment question under active evaluation."
    : `${openCount} commitment questions under active evaluation.`;
}

// ─── Confidence movement ──────────────────────────────────────────────────────

/**
 * Returns a user-facing label for a confidence movement direction.
 */
export function confidenceMovementLabel(
  direction: string | null | undefined,
): string {
  if (direction === "strengthening") return "Strengthening";
  if (direction === "weakening") return "Weakening";
  if (direction === "stable") return "Stable";
  return "";
}

/**
 * Returns a hex color for confidence movement direction.
 * Hardcoded values — safe for use outside Radix portals where CSS vars are unavailable.
 */
export function confidenceMovementColor(
  direction: string | null | undefined,
): string {
  if (direction === "strengthening") return "#5F9B8C"; // teal
  if (direction === "weakening") return "#b06a3c"; // amber-brown
  if (direction === "stable") return "#6E847F"; // muted
  return "#6E847F";
}

// ─── Decision state styling ───────────────────────────────────────────────────

/**
 * Returns a hex color for a decision state label.
 */
export function decisionStateColor(state: string): string {
  if (state === "destabilizing") return "#c44233";
  if (state === "reframing") return "#b06a3c";
  if (state === "commit_ready" || state === "committed") return "#5F9B8C";
  if (state === "stabilizing") return "#5F9B8C";
  if (state === "under_validation") return "#FAC846";
  return "#6E847F";
}

/**
 * Returns a hex color for a decision state left-border accent.
 */
export function decisionStateBorderColor(state: string): string {
  if (state === "destabilizing") return "#c44233";
  if (state === "reframing") return "#b06a3c";
  if (state === "commit_ready" || state === "committed") return "#5F9B8C";
  if (state === "stabilizing") return "#a0c4b8";
  if (state === "under_validation") return "#e0c86a";
  return "#DDE6D1";
}
