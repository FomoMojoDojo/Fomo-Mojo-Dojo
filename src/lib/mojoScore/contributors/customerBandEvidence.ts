// ── Contributor: Customer Band Evidence (weight 20%) ─────────────────────────
//
// Measures evidence quality across route legs using a band derivation.
// Each leg is scored 0–100 by its evidence band, then averaged.
//
// Band scores:
//   hypothesis_only            → 0
//   directional_not_validated  → 20
//   customer_evidenced         → 50
//   market_validated           → 75
//   proven_path                → 90
//   sustained_performance      → 100
//
// A route leg qualifies when:
//   level === 'leg' | 'action' — or level is null (legacy unstructured route)
//
// Falls back to all routes when no hierarchy is present.

import type { MojoScoreInput, ContributorScore, RouteInput } from "../types";

export const WEIGHT = 0.20;

type EvidenceBand =
  | "hypothesis_only"
  | "directional_not_validated"
  | "customer_evidenced"
  | "market_validated"
  | "proven_path"
  | "sustained_performance";

const BAND_SCORE: Record<EvidenceBand, number> = {
  hypothesis_only: 0,
  directional_not_validated: 20,
  customer_evidenced: 50,
  market_validated: 75,
  proven_path: 90,
  sustained_performance: 100,
};

function deriveBand(route: RouteInput): EvidenceBand {
  const ev = route.evidence_json ?? [];
  const total = ev.length;
  if (total === 0) return "hypothesis_only";

  const supporting = ev.filter((e) => e.status !== "missing").length;
  const missing = ev.filter((e) => e.status === "missing").length;
  const isDerived = route.id.startsWith("derived-");

  if (isDerived && supporting === 0) return "hypothesis_only";
  if (supporting === 0) return "directional_not_validated";

  // Customer signal bonus: linked_need_ids present = customer evidence exists
  const hasCustomerSignal = (route.linked_need_ids?.length ?? 0) > 0;

  if (!hasCustomerSignal && missing > supporting) return "directional_not_validated";
  if (!hasCustomerSignal) return "customer_evidenced";
  if (missing === 0 && hasCustomerSignal) return "market_validated";
  return "customer_evidenced";
}

function routeIsActionable(route: RouteInput): boolean {
  const level = route.level ?? null;
  // Include legs, actions, and legacy routes (no level). Exclude top-level containers.
  return level !== "route";
}

export function scoreCustomerBandEvidence(
  input: MojoScoreInput,
): ContributorScore {
  const actionableRoutes = input.routes.filter(routeIsActionable);

  if (actionableRoutes.length === 0) {
    return {
      key: "customer_band_evidence",
      label: "Evidence Quality",
      score: 0,
      weight: WEIGHT,
      weighted: 0,
      explanation: "No route legs found. Structure routes into legs to enable evidence tracking.",
    };
  }

  const bands = actionableRoutes.map(deriveBand);
  const bandCounts: Record<EvidenceBand, number> = {
    hypothesis_only: 0,
    directional_not_validated: 0,
    customer_evidenced: 0,
    market_validated: 0,
    proven_path: 0,
    sustained_performance: 0,
  };
  for (const b of bands) bandCounts[b]++;

  const avgScore =
    bands.reduce((sum, b) => sum + BAND_SCORE[b], 0) / bands.length;
  const score = Math.round(avgScore);

  const customerEvidenced =
    bandCounts.customer_evidenced +
    bandCounts.market_validated +
    bandCounts.proven_path +
    bandCounts.sustained_performance;
  const hypothesis = bandCounts.hypothesis_only + bandCounts.directional_not_validated;

  const explanation =
    customerEvidenced > 0
      ? `${customerEvidenced} of ${actionableRoutes.length} legs have customer or market evidence. ${hypothesis > 0 ? `${hypothesis} still directional.` : "All legs are evidenced."}`
      : `${actionableRoutes.length} legs are directional — none yet have customer evidence. Linking needs to legs will raise this score.`;

  return {
    key: "customer_band_evidence",
    label: "Evidence Quality",
    score,
    weight: WEIGHT,
    weighted: Math.round(score * WEIGHT * 100) / 100,
    explanation: explanation.slice(0, 200),
    sub_scores: {
      hypothesis_only: bandCounts.hypothesis_only,
      directional: bandCounts.directional_not_validated,
      customer_evidenced: customerEvidenced,
    },
  };
}
