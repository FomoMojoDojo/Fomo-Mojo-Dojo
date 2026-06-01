// ── Contributor: Evidence Freshness (weight 10%) ──────────────────────────────
//
// Rewards recently-updated claims and route legs.
// Uses an exponential decay curve based on days since last update.
//
// Freshness score per item:
//   ≤ 7 days   → 100
//   ≤ 30 days  → 80
//   ≤ 90 days  → 60
//   ≤ 180 days → 40
//   ≤ 365 days → 20
//   > 365 days → 5
//   no date    → 0 (counts against freshness)
//
// Portfolio score = mean across all claims + route legs.

import type { MojoScoreInput, ContributorScore } from "../types.ts";

export const WEIGHT = 0.10;

function freshnessScore(
  updatedAt: string | null | undefined,
  nowIso: string,
): number {
  if (!updatedAt) return 0;
  const msSince =
    new Date(nowIso).getTime() - new Date(updatedAt).getTime();
  const days = msSince / (1000 * 60 * 60 * 24);

  if (days <= 7) return 100;
  if (days <= 30) return 80;
  if (days <= 90) return 60;
  if (days <= 180) return 40;
  if (days <= 365) return 20;
  return 5;
}

export function scoreEvidenceFreshness(
  input: MojoScoreInput,
): ContributorScore {
  const hasHierarchy = input.routes.some((r) => r.level === "route");
  const legs = hasHierarchy
    ? input.routes.filter((r) => r.level === "leg" || r.level === "action")
    : input.routes;

  const items: Array<{ updated_at: string | null | undefined }> = [
    ...input.claims,
    ...legs,
  ];

  if (items.length === 0) {
    return {
      key: "evidence_freshness",
      label: "Evidence Freshness",
      score: 0,
      weight: WEIGHT,
      weighted: 0,
      explanation: "No claims or route legs found to assess freshness.",
    };
  }

  const scores = items.map((item) =>
    freshnessScore(item.updated_at, input.computedAt),
  );
  const score = Math.round(
    scores.reduce((sum, s) => sum + s, 0) / scores.length,
  );

  const fresh = scores.filter((s) => s >= 80).length;
  const stale = scores.filter((s) => s < 40).length;
  const total = scores.length;

  const explanation =
    stale > total * 0.5
      ? `${stale} of ${total} claims and legs are more than 6 months old. Reviewing and updating evidence will raise this score.`
      : fresh > total * 0.5
        ? `${fresh} of ${total} items updated within the last 30 days — evidence is current.`
        : `Mixed freshness across ${total} items. ${stale} stale, ${fresh} current.`;

  return {
    key: "evidence_freshness",
    label: "Evidence Freshness",
    score,
    weight: WEIGHT,
    weighted: Math.round(score * WEIGHT * 100) / 100,
    explanation: explanation.slice(0, 200),
    sub_scores: { fresh, stale, total },
  };
}
