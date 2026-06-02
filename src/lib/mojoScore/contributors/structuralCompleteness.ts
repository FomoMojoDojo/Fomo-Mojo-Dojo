// ── Contributor: Structural Completeness (weight 15%) ─────────────────────────
//
// Measures execution progress on routes whose backing claim is in FLOW state.
// Score = (step_completion_rate × 50) + (evidence_completeness_rate × 50)
//
// Only routes with claim_id pointing to a flow-state claim are scored.
// Routes without a linked flow claim contribute nothing — they are an
// unvalidated menu, not a committed execution path.

import type { MojoScoreInput, ContributorScore } from "../types.ts";

export const WEIGHT = 0.15;

export function scoreStructuralCompleteness(
  input: MojoScoreInput,
): ContributorScore {
  const flowClaimIds = new Set(
    input.claims.filter((c) => c.state === "flow").map((c) => c.id),
  );

  const chosenRoutes = input.routes.filter(
    (r) => r.claim_id != null && flowClaimIds.has(r.claim_id),
  );

  if (chosenRoutes.length === 0) {
    return {
      key: "structural_completeness",
      label: "Route Completeness",
      score: 0,
      weight: WEIGHT,
      weighted: 0,
      explanation:
        "No routes linked to a claim in flow. Choose an outcome and route to begin execution scoring.",
    };
  }

  let totalSteps = 0;
  let completedSteps = 0;
  let totalEvidence = 0;
  let nonMissingEvidence = 0;

  for (const route of chosenRoutes) {
    for (const step of route.steps_json ?? []) {
      totalSteps++;
      if (step.status === "complete") completedSteps++;
    }
    for (const ev of route.evidence_json ?? []) {
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
      explanation:
        `${chosenRoutes.length} flow-linked route${chosenRoutes.length === 1 ? "" : "s"} found but no steps or evidence recorded. Add steps and evidence to score execution progress.`,
    };
  }

  const stepRate = totalSteps > 0 ? completedSteps / totalSteps : 0;
  const evidenceRate = totalEvidence > 0 ? nonMissingEvidence / totalEvidence : 0;

  const score = Math.round(stepRate * 50 + evidenceRate * 50);

  const stepPct = Math.round(stepRate * 100);
  const evidencePct = Math.round(evidenceRate * 100);

  const explanation =
    `${stepPct}% of steps complete across ${chosenRoutes.length} flow-linked route${chosenRoutes.length === 1 ? "" : "s"}. ${evidencePct}% of evidence items filled. ` +
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
      flow_linked_routes: chosenRoutes.length,
    },
  };
}
