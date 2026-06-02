// ── Contributor: Action Portfolio Balance (weight 0% — informational) ────────
//
// Rewards a balanced distribution of Fix / Improve / Create route legs.
// Weight reduced to 0: portfolio balance is now informational only.
// The score is still computed and recorded in component_scores for visibility,
// but it does not contribute to the total mojo score.
//
// Weight redistributed to structural_completeness (+5%) and
// state_distribution_health (+5%) in methodology v1.1.0.

import type { MojoScoreInput, ContributorScore } from "../types.ts";

export const WEIGHT = 0.00;

export function scoreActionPortfolioBalance(
  input: MojoScoreInput,
): ContributorScore {
  const hasHierarchy = input.routes.some((r) => r.level === "route");

  const legs = hasHierarchy
    ? input.routes.filter((r) => r.level === "leg" || r.level === "action")
    : input.routes;

  if (legs.length === 0) {
    return {
      key: "action_portfolio_balance",
      label: "Portfolio Balance",
      score: 0,
      weight: WEIGHT,
      weighted: 0,
      explanation: "No route legs found. Add Fix, Improve, and Create legs to balance the portfolio.",
    };
  }

  const fixCount = legs.filter(
    (r) => String(r.category).toLowerCase() === "fix",
  ).length;
  const improveCount = legs.filter(
    (r) => String(r.category).toLowerCase() === "improve",
  ).length;
  const createCount = legs.filter(
    (r) => String(r.category).toLowerCase() === "create",
  ).length;
  const total = legs.length;

  const fixShare = fixCount / total;
  const improveShare = improveCount / total;
  const createShare = createCount / total;

  const maxShare = Math.max(fixShare, improveShare, createShare);
  const idealShare = 1 / 3;

  // Balance index: 1 when all equal, 0 when fully concentrated
  const rawBalance = Math.max(0, 1 - (maxShare - idealShare) * 3);

  const allPresent = fixCount > 0 && improveCount > 0 && createCount > 0;
  const bonus = allPresent ? 10 : 0;

  const score = Math.min(100, Math.round(rawBalance * 90 + bonus));

  const dominant =
    fixShare >= improveShare && fixShare >= createShare
      ? "Fix"
      : improveShare >= createShare
        ? "Improve"
        : "Create";

  const explanation = allPresent
    ? `Portfolio has all three categories. ${fixCount} Fix, ${improveCount} Improve, ${createCount} Create across ${total} legs.`
    : `Portfolio is ${dominant}-heavy (${fixCount} Fix / ${improveCount} Improve / ${createCount} Create). Adding ${allPresent ? "more variety" : "the missing categories"} will raise this score.`;

  return {
    key: "action_portfolio_balance",
    label: "Portfolio Balance",
    score,
    weight: WEIGHT,
    weighted: Math.round(score * WEIGHT * 100) / 100,
    explanation: explanation.slice(0, 200),
    sub_scores: { fix: fixCount, improve: improveCount, create: createCount },
  };
}
