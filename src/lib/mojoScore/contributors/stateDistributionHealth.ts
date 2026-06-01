// ── Contributor: State Distribution Health (weight 30%) ──────────────────────
//
// Measures how far the claim portfolio has progressed through the state machine.
// Higher states (focus, flow) earn more points than hypothesis-level claims.
//
// State point values:
//   outside_view → 0    (hypothesis, no evidence)
//   diagnose     → 33   (internal evidence building)
//   focus        → 67   (customer signal validated)
//   flow         → 100  (committed and moving)
//
// Momentum bonus: +5 if any flow claims, +2 if any focus claims.
// Total score capped at 100.

import type { MojoScoreInput, ContributorScore, EngagementState } from "../types";

export const WEIGHT = 0.30;

const STATE_POINTS: Record<string, number> = {
  outside_view: 0,
  diagnose: 33,
  focus: 67,
  flow: 100,
};

export function deriveEngagementState(
  claims: MojoScoreInput["claims"],
): EngagementState {
  const total = claims.length;
  if (total === 0) return "forming";

  const counts = { outside_view: 0, diagnose: 0, focus: 0, flow: 0 };
  for (const c of claims) {
    if (c.state in counts) counts[c.state as keyof typeof counts]++;
  }

  const flowRatio = counts.flow / total;
  const focusOrFlowRatio = (counts.focus + counts.flow) / total;
  const diagnoseOrAboveRatio = (counts.diagnose + counts.focus + counts.flow) / total;

  if (flowRatio >= 0.6) return "accelerating";
  if (flowRatio >= 0.3) return "committing";
  if (focusOrFlowRatio >= 0.1) return "focusing";
  if (diagnoseOrAboveRatio >= 0.5) return "diagnosing";
  return "forming";
}

export function scoreStateDistributionHealth(
  input: MojoScoreInput,
): ContributorScore {
  const claims = input.claims;
  const total = claims.length;

  if (total === 0) {
    return {
      key: "state_distribution_health",
      label: "Claim State Distribution",
      score: 0,
      weight: WEIGHT,
      weighted: 0,
      explanation: "No claims found. Add strategic claims to start building your readiness score.",
    };
  }

  const counts = { outside_view: 0, diagnose: 0, focus: 0, flow: 0 };
  for (const c of claims) {
    if (c.state in counts) counts[c.state as keyof typeof counts]++;
  }

  const baseScore =
    (counts.outside_view * STATE_POINTS.outside_view +
      counts.diagnose * STATE_POINTS.diagnose +
      counts.focus * STATE_POINTS.focus +
      counts.flow * STATE_POINTS.flow) /
    total;

  const momentumBonus = counts.flow > 0 ? 5 : counts.focus > 0 ? 2 : 0;
  const score = Math.min(100, Math.round(baseScore + momentumBonus));

  const dominantLabel =
    counts.flow > total * 0.3
      ? "Commitment is active and building."
      : counts.focus > total * 0.1
        ? "Customer evidence is validating direction."
        : counts.diagnose > total * 0.5
          ? "Internal evidence is accumulating — customer validation is the next layer."
          : "Most claims are still at the hypothesis stage.";

  const explanation = `${total} claims — ${counts.flow} flow, ${counts.focus} focus, ${counts.diagnose} diagnose, ${counts.outside_view} hypothesis. ${dominantLabel}`;

  return {
    key: "state_distribution_health",
    label: "Claim State Distribution",
    score,
    weight: WEIGHT,
    weighted: Math.round(score * WEIGHT * 100) / 100,
    explanation: explanation.slice(0, 200),
    sub_scores: {
      outside_view: counts.outside_view,
      diagnose: counts.diagnose,
      focus: counts.focus,
      flow: counts.flow,
    },
  };
}
