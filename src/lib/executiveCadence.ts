/**
 * Executive Cadence
 *
 * Answers: "What changed since the last time leadership looked?"
 *
 * Executives operate in rhythm. Each review should open with a brief framing of
 * what is different since the last one — not a status report, not a summary,
 * but a temporal orientation:
 *   - What shifted
 *   - What remains stuck
 *   - Whether a decision is now warranted
 *
 * This layer produces a single-sentence cadence frame from:
 *   - Stale artifact counts (from useStrategicChangeSummary)
 *   - Contradiction pressure duration (from TemporalPosture)
 *   - Lifecycle state of routes (from DecisionOperationsContext)
 *
 * Design principles:
 *   - One sentence max — any more is a summary, not a cadence signal
 *   - Conservative (null when nothing materially changed)
 *   - Directional (points at the most important thing, not everything)
 *   - Internal — not shown unless hasCadence is true
 */

import type { StrategicChangeSummary } from "@/hooks/useStrategicChangeSummary";
import type { TemporalPosture } from "@/lib/strategicTemporalState";
import type { AttentionContext } from "@/lib/strategicAttention";
import type { DecisionOperationsContext } from "@/lib/decisionOperations";

// ─── Public type ──────────────────────────────────────────────────────────────

export type CadenceFrame = {
  /** True when there is something material worth surfacing in the cadence strip. */
  hasCadence: boolean;
  /**
   * One sentence describing what changed since the last review.
   * Null when nothing material changed or data is unavailable.
   */
  sinceLastReview: string | null;
  /** One or more routes are at advancing/commit-ready state. */
  readyForCommitment: boolean;
  /** Leadership attention is warranted by review pressure or focused attention. */
  requiresLeadershipAttention: boolean;
  /** Routes stuck in gated/stalled state. */
  unresolved: number;
};

// ─── Main export ──────────────────────────────────────────────────────────────

export function buildCadenceFrame(args: {
  changeSummary: StrategicChangeSummary | null | undefined;
  temporalPosture: TemporalPosture | null;
  attention: AttentionContext | null;
  decisionOps: DecisionOperationsContext | null;
}): CadenceFrame {
  const { changeSummary, temporalPosture, attention, decisionOps } = args;

  const readyForCommitment = decisionOps
    ? decisionOps.routes.some((r) => r.lifecycleState === "advancing")
    : false;

  const requiresLeadershipAttention =
    attention?.posture === "focused" ||
    (decisionOps?.routes.some((r) => r.reviewPressure.warranted) ?? false);

  const unresolved = decisionOps
    ? decisionOps.routes.filter(
        (r) => r.lifecycleState === "gated" || r.lifecycleState === "stalled",
      ).length
    : 0;

  let sinceLastReview: string | null = null;

  // Stale artifacts from last job map event
  if (changeSummary?.latestJobMapEvent) {
    const { affectedCounts } = changeSummary;

    if (affectedCounts.total === 0) {
      // No artifact changes — check temporal pressure for a non-trivial story
      if (temporalPosture?.contradictionPressure === "entrenched") {
        sinceLastReview = "Contradiction pressure is entrenched — still unresolved.";
      } else if (temporalPosture?.contradictionPressure === "accumulating") {
        sinceLastReview = "A structural contradiction remains open.";
      } else if (temporalPosture?.validationCadencePressure === "urgent") {
        sinceLastReview = "Customer validation is stale.";
      } else if (temporalPosture?.validationCadencePressure === "warming") {
        sinceLastReview = "Customer validation signals are aging.";
      }
      // stable with no changes → silent (hasCadence will be false)
    } else {
      // Build from most specific to least
      if (affectedCounts.routes > 0 && affectedCounts.odi_needs > 0) {
        sinceLastReview = `${affectedCounts.routes} route${affectedCounts.routes !== 1 ? "s" : ""} and ${affectedCounts.odi_needs} need${affectedCounts.odi_needs !== 1 ? "s" : ""} affected by the last update.`;
      } else if (affectedCounts.routes > 0) {
        sinceLastReview = `${affectedCounts.routes} route${affectedCounts.routes !== 1 ? "s" : ""} affected by the last update.`;
      } else if (affectedCounts.odi_needs > 0) {
        sinceLastReview = `${affectedCounts.odi_needs} need${affectedCounts.odi_needs !== 1 ? "s" : ""} flagged for review.`;
      }
    }
  } else if (temporalPosture?.contradictionPressure === "entrenched") {
    sinceLastReview = "Contradiction pressure is entrenched — still unresolved.";
  } else if (temporalPosture?.validationCadencePressure === "urgent") {
    sinceLastReview = "Customer validation is stale.";
  } else if (temporalPosture?.validationCadencePressure === "warming") {
    sinceLastReview = "Customer validation signals are aging.";
  }

  const hasCadence =
    sinceLastReview !== null || readyForCommitment || requiresLeadershipAttention;

  return {
    hasCadence,
    sinceLastReview,
    readyForCommitment,
    requiresLeadershipAttention,
    unresolved,
  };
}
