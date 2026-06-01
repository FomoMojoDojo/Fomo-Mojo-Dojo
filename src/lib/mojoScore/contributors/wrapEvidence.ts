// ── Contributor: WRAP Evidence (weight 15%) ───────────────────────────────────
//
// Rewards top-level routes that have documented their decision logic:
//   - rejected_alternatives  (+40 pts of route score)
//   - what_would_have_to_be_true conditions (+40 pts)
//   - satisfied conditions (up to +20 pts bonus — proportion met)
//
// Portfolio score = mean of per-route WRAP scores across top-level routes.
// Falls back to all routes when no hierarchy exists.

import type { MojoScoreInput, ContributorScore, RouteInput } from "../types";

export const WEIGHT = 0.15;

function routeWrapScore(route: RouteInput): number {
  const alts = Array.isArray(route.rejected_alternatives)
    ? route.rejected_alternatives
    : [];
  const conds = Array.isArray(route.what_would_have_to_be_true)
    ? route.what_would_have_to_be_true
    : [];

  const hasAlts = alts.length > 0;
  const hasConds = conds.length > 0;

  const base = (hasAlts ? 40 : 0) + (hasConds ? 40 : 0);

  const condBonus =
    hasConds
      ? 20 * (conds.filter((c) => c.satisfied_flag).length / conds.length)
      : 0;

  return Math.min(100, Math.round(base + condBonus));
}

export function scoreWrapEvidence(input: MojoScoreInput): ContributorScore {
  const hasHierarchy = input.routes.some((r) => r.level === "route");
  const topLevelRoutes = hasHierarchy
    ? input.routes.filter((r) => r.level === "route")
    : input.routes.filter((r) => !r.parent_id);

  if (topLevelRoutes.length === 0) {
    return {
      key: "wrap_evidence",
      label: "Strategic Decision Evidence",
      score: 0,
      weight: WEIGHT,
      weighted: 0,
      explanation: "No top-level routes found. WRAP evidence requires at least one route with documented alternatives and conditions.",
    };
  }

  const perRoute = topLevelRoutes.map((r) => ({
    route: r,
    score: routeWrapScore(r),
  }));

  const score = Math.round(
    perRoute.reduce((sum, r) => sum + r.score, 0) / perRoute.length,
  );

  const withAlts = topLevelRoutes.filter(
    (r) => (r.rejected_alternatives?.length ?? 0) > 0,
  ).length;
  const withConds = topLevelRoutes.filter(
    (r) => (r.what_would_have_to_be_true?.length ?? 0) > 0,
  ).length;
  const totalConds = topLevelRoutes.reduce(
    (sum, r) => sum + (r.what_would_have_to_be_true?.length ?? 0),
    0,
  );
  const metConds = topLevelRoutes.reduce(
    (sum, r) =>
      sum +
      (r.what_would_have_to_be_true?.filter((c) => c.satisfied_flag).length ??
        0),
    0,
  );

  const explanation =
    `${withAlts}/${topLevelRoutes.length} routes have alternatives documented, ${withConds}/${topLevelRoutes.length} have conditions. ` +
    (totalConds > 0
      ? `${metConds} of ${totalConds} conditions met.`
      : "Document conditions to show what must be true before committing.");

  return {
    key: "wrap_evidence",
    label: "Strategic Decision Evidence",
    score,
    weight: WEIGHT,
    weighted: Math.round(score * WEIGHT * 100) / 100,
    explanation: explanation.slice(0, 200),
    sub_scores: {
      routes_with_alternatives: withAlts,
      routes_with_conditions: withConds,
      conditions_met: metConds,
      conditions_total: totalConds,
    },
  };
}
