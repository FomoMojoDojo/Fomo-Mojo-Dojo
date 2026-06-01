// ── Contributor: Opportunity Route Coverage (weight 5%) ───────────────────────
//
// Measures how many customer needs (ODI needs) are linked to at least one route.
// Rewards organizations that have translated customer insights into action.
//
// Score = covered_needs / total_needs × 100
//
// A need is "covered" when its id appears in any route's linked_need_ids array.
// Bonus: if ALL needs are covered → +5 pts (up to cap 100).

import type { MojoScoreInput, ContributorScore } from "../types.ts";

export const WEIGHT = 0.05;

export function scoreOpportunityRouteCoverage(
  input: MojoScoreInput,
): ContributorScore {
  const totalNeeds = input.needs.length;

  if (totalNeeds === 0) {
    return {
      key: "opportunity_route_coverage",
      label: "Customer Need Coverage",
      score: 0,
      weight: WEIGHT,
      weighted: 0,
      explanation: "No customer needs found. Add ODI needs to connect customer insight to route actions.",
    };
  }

  // Collect all need IDs covered by any route
  const coveredNeedIds = new Set<string>();
  for (const route of input.routes) {
    for (const needId of route.linked_need_ids ?? []) {
      coveredNeedIds.add(needId);
    }
  }

  const coveredCount = input.needs.filter((n) =>
    coveredNeedIds.has(n.id),
  ).length;
  const coverageRate = coveredCount / totalNeeds;
  const allCovered = coveredCount === totalNeeds;

  const score = Math.min(
    100,
    Math.round(coverageRate * 100 + (allCovered ? 5 : 0)),
  );

  const explanation =
    coveredCount === 0
      ? `None of the ${totalNeeds} customer needs are linked to a route. Linking needs to legs closes the customer insight loop.`
      : allCovered
        ? `All ${totalNeeds} customer needs are covered by at least one route. Full customer insight loop closed.`
        : `${coveredCount} of ${totalNeeds} customer needs are linked to a route. ${totalNeeds - coveredCount} need${totalNeeds - coveredCount === 1 ? "" : "s"} uncovered.`;

  return {
    key: "opportunity_route_coverage",
    label: "Customer Need Coverage",
    score,
    weight: WEIGHT,
    weighted: Math.round(score * WEIGHT * 100) / 100,
    explanation: explanation.slice(0, 200),
    sub_scores: { covered: coveredCount, total: totalNeeds },
  };
}
