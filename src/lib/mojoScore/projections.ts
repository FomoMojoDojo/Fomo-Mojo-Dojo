// ── MojoScore Projections ─────────────────────────────────────────────────────
//
// Two pure projection functions that estimate what the MojoScore COULD reach
// under two improvement scenarios. These are not actual scores — they are
// deterministic estimates used to frame the CURRENT → REACHABLE → UNLOCKABLE
// display in the MojoScoreStrip.
//
// REACHABLE  — improvement ceiling achievable through internal foundation work
//              (no customer research required)
// UNLOCKABLE — additional ceiling achievable only with customer research
//              (interviews, linked needs, advancing claims to focus/flow)
//
// Key:
//   Foundation contributors (REACHABLE): structural_completeness,
//     evidence_freshness, action_portfolio_balance, wrap_evidence,
//     opportunity_route_coverage
//   Customer-research contributors (UNLOCKABLE): customer_band_evidence,
//     state_distribution_health

import type { MojoScoreResult } from "./types";

// Projection ceilings — the max score each contributor can reach through
// foundation work alone (no customer research).
const FOUNDATION_CEILINGS: Record<string, number> = {
  structural_completeness:    70,  // achievable by completing steps/evidence on legs
  evidence_freshness:         90,  // achievable by reviewing and refreshing claims
  action_portfolio_balance:  100,  // achievable by balancing fix/improve/create mix
  wrap_evidence:             100,  // achievable by adding conditions + rejected alts
  opportunity_route_coverage: 80,  // achievable by linking most needs to routes
};

// Projection ceilings for contributors that improve only with customer research.
const CUSTOMER_CEILINGS: Record<string, number> = {
  customer_band_evidence:    90,   // customer interviews + linked needs on legs
  state_distribution_health: 70,   // claims advance from diagnose → focus with evidence
};

/**
 * Projects the score achievable through internal foundation work alone —
 * completing steps, adding conditions, refreshing evidence, balancing the mix.
 * Does NOT include customer-research-dependent gains.
 *
 * Returns an integer. Always >= current total_score.
 */
export function computeReachableScore(result: MojoScoreResult): number {
  let gain = 0;
  for (const c of result.contributors) {
    const ceiling = FOUNDATION_CEILINGS[c.key];
    if (ceiling === undefined) continue;
    const improvement = Math.max(0, ceiling - c.score);
    gain += improvement * c.weight;
  }
  return Math.min(100, Math.round(result.total_score + gain));
}

/**
 * Projects the score achievable after customer research unlocks the remaining
 * high-weight contributors (state distribution and customer evidence).
 * Built on top of the reachable score — call computeReachableScore first.
 *
 * Returns an integer. Always >= reachableScore.
 */
export function computeUnlockableScore(
  reachableScore: number,
  result: MojoScoreResult,
): number {
  let gain = 0;
  for (const c of result.contributors) {
    const ceiling = CUSTOMER_CEILINGS[c.key];
    if (ceiling === undefined) continue;
    const improvement = Math.max(0, ceiling - c.score);
    gain += improvement * c.weight;
  }
  return Math.min(100, Math.round(reachableScore + gain));
}

/**
 * Returns the tier label for each contributor key, used to annotate
 * the breakdown panel.
 */
export function contributorTier(key: string): "foundation" | "customer" | null {
  if (key in FOUNDATION_CEILINGS) return "foundation";
  if (key in CUSTOMER_CEILINGS) return "customer";
  return null;
}
