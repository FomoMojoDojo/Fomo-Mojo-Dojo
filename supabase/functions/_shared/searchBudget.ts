// ── SEARCH BUDGET (2026-11-19, the sweep-cost brief) ───────────────────────────────────────────────────────────────────
// generate-normative-jobmap's discovery lets the model run up to 16 web searches, and its cost grows faster than the
// search count (every later turn re-reads the earlier results). An optional request field `search_budget` sets the
// web_search tool's max_uses. Default 16: product behaviour is unchanged. outside-call-guard (e3) passes 1, because its
// public-control check needs one search to prove the lane, not a full discovery.
export const SEARCH_BUDGET_DEFAULT = 16;
export const SEARCH_BUDGET_MAX = 16;

/** An integer 1..16 is honoured; anything else (absent, 0, negative, fractional, too large, a string) is the default. */
export function clampSearchBudget(v: unknown): number {
  const n = typeof v === "number" ? v : NaN;
  return Number.isInteger(n) && n >= 1 && n <= SEARCH_BUDGET_MAX ? n : SEARCH_BUDGET_DEFAULT;
}
