// ── Contributor: Action Portfolio Balance (weight 10%) ───────────────────────
//
// Rewards a balanced distribution of Fix / Improve / Create route legs.
// A portfolio concentrated in one category suggests incomplete coverage.
//
// Scoring uses a balance index: 1 − (max_share − 1/3) × 3
//   - Perfect balance (33/33/33): balance index = 1.0 → score 100
//   - All one category (100/0/0): balance index = 0.0 → score 0
//   - Two equal categories (50/50/0): balance index ≈ 0.5 → score ~50
//
// Bonus: +10 pts if all three categories are present.
// Score capped at 100.

import type { MojoScoreInput, ContributorScore } from "../types";

export const WEIGHT = 0.10;

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
