// ── Contributor: Structural Completeness (weight 10%) ─────────────────────────
//
// Measures how much of the documented route work has been completed.
// Score = (step_completion_rate × 50) + (evidence_completeness_rate × 50)
//
// step_completion_rate    = completed steps / total steps across all legs
// evidence_completeness_rate = non-missing evidence items / total evidence items
//
// Routes with empty steps_json or evidence_json contribute 0 to numerator
// but DO count in the denominator if they have at least one item.

import type { MojoScoreInput, ContributorScore } from "../types.ts";

export const WEIGHT = 0.10;

export function scoreStructuralCompleteness(
  input: MojoScoreInput,
): ContributorScore {
  const hasHierarchy = input.routes.some((r) => r.level === "route");

  const legs = hasHierarchy
    ? input.routes.filter((r) => r.level === "leg" || r.level === "action")
    : input.routes;

  let totalSteps = 0;
  let completedSteps = 0;
  let totalEvidence = 0;
  let nonMissingEvidence = 0;

  for (const leg of legs) {
    for (const step of leg.steps_json ?? []) {
      totalSteps++;
      if (step.status === "complete") completedSteps++;
    }
    for (const ev of leg.evidence_json ?? []) {
      totalEvidence++;
      if (ev.status !== "missing") nonMissingEvidence++;
    }
  }

  if (totalSteps === 0 && totalEvidence === 0) {
    return {
      key: "structural_completeness",
      label: "Route Completeness",
      score: 0,
      weight: WEIGHT,
      weighted: 0,
      explanation: "No steps or evidence items found on route legs. Adding structured steps and evidence will enable this score.",
    };
  }

  const stepRate = totalSteps > 0 ? completedSteps / totalSteps : 0;
  const evidenceRate =
    totalEvidence > 0 ? nonMissingEvidence / totalEvidence : 0;

  const score = Math.round(stepRate * 50 + evidenceRate * 50);

  const stepPct = Math.round(stepRate * 100);
  const evidencePct = Math.round(evidenceRate * 100);

  const explanation =
    `${stepPct}% of steps complete across ${legs.length} legs. ${evidencePct}% of evidence items filled. ` +
    (stepPct < 50 || evidencePct < 50
      ? "Completing more steps and linking evidence will strengthen this area."
      : "Good structural coverage.");

  return {
    key: "structural_completeness",
    label: "Route Completeness",
    score,
    weight: WEIGHT,
    weighted: Math.round(score * WEIGHT * 100) / 100,
    explanation: explanation.slice(0, 200),
    sub_scores: {
      steps_complete: completedSteps,
      steps_total: totalSteps,
      evidence_non_missing: nonMissingEvidence,
      evidence_total: totalEvidence,
    },
  };
}
