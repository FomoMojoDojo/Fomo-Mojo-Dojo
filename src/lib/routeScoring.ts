import type { RouteRow } from "@/hooks/useRoutes";
import type { JobStepRow } from "@/hooks/useJobSteps";

export type RelevantCategory = "fix" | "improve" | "create" | null;

export type RouteScoreBreakdown = {
  routeId: string;
  baseScore: number;
  expectedImpact: number;
  finalScore: number;
  reasons: string[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function effortTiebreaker(effort: string | null | undefined): number {
  return effort === "low" ? 3 : effort === "medium" ? 2 : 1;
}

function countMissingEvidence(route: RouteRow): number {
  return (Array.isArray(route.evidence_json) ? route.evidence_json : []).filter(
    (e) => e.status === "missing"
  ).length;
}

// ─── Core scoring ─────────────────────────────────────────────────────────────
//
// finalScore = baseScore + expectedImpactScore
//
// baseScore components (existing factors, now numeric):
//   step match         — category aligns with inferred step need       +5
//   gap alignment      — fix route on a step with confirmed gap        +2
//   uncertainty reduction — missing evidence items addressed (cap 2)  +1 each
//   pts_value          — direct score potential                        raw pts
//   effort             — low=3 / medium=2 / high=1                    tie-breaker
//
// expectedImpactScore (mutually exclusive tiers — Mojo Score driver):
//   +3  directly closes highest-risk gap  (fix + has_gap)
//   +2  improves evidence / reduces uncertainty
//   +1  improves execution only

export function scoreRoute(
  route: RouteRow,
  relevantCategory: RelevantCategory,
  contextStep: JobStepRow | null
): RouteScoreBreakdown {
  let baseScore = 0;
  const reasons: string[] = [];
  const cat = String(route.category).toLowerCase();
  const hasGap = contextStep?.has_gap ?? false;
  const evidenceStatus = contextStep?.evidence_status;
  const evidenceConf = contextStep?.evidence_confidence ?? 100;
  const missingCount = countMissingEvidence(route);

  // Step match
  if (relevantCategory && cat === relevantCategory) {
    baseScore += 5;
    reasons.push(`step match — ${cat} aligns with step context (+5)`);
  }

  // Gap alignment
  if (cat === "fix" && hasGap) {
    baseScore += 2;
    reasons.push("gap alignment — step has confirmed gap (+2)");
  }

  // Uncertainty reduction (route-internal: missing evidence items)
  const uncertaintyBonus = Math.min(missingCount, 2);
  if (uncertaintyBonus > 0) {
    baseScore += uncertaintyBonus;
    reasons.push(
      `uncertainty reduction — ${missingCount} missing evidence item(s) (+${uncertaintyBonus})`
    );
  }

  // pts_value
  const pts = route.pts_value ?? 0;
  baseScore += pts;
  if (pts > 0) reasons.push(`pts potential (+${pts})`);

  // Effort tie-breaker
  baseScore += effortTiebreaker(route.effort);

  // expectedImpactScore — mutually exclusive tiers
  let expectedImpact: number;

  if (cat === "fix" && hasGap) {
    expectedImpact = 3;
    reasons.push("expected impact: directly closes highest-risk gap (+3)");
  } else if (
    missingCount > 0 ||
    (cat === "improve" &&
      (evidenceStatus === "unclear" || evidenceStatus === "implied" || evidenceConf < 70))
  ) {
    expectedImpact = 2;
    reasons.push("expected impact: improves evidence / reduces uncertainty (+2)");
  } else {
    expectedImpact = 1;
    reasons.push("expected impact: improves execution (+1)");
  }

  return {
    routeId: route.id,
    baseScore,
    expectedImpact,
    finalScore: baseScore + expectedImpact,
    reasons,
  };
}

// ─── Impact reason ────────────────────────────────────────────────────────────
// Plain-language "Why this:" shown beneath the RECOMMENDED STARTING POINT label.
// Co-located with scoring tiers so copy stays consistent if tiers change.

export function impactReason(expectedImpact: number): string {
  if (expectedImpact >= 3) return "Removes the highest-risk gap holding this step back.";
  if (expectedImpact >= 2) return "Addresses missing evidence to reduce uncertainty.";
  return "Improves execution readiness.";
}

// ─── Selection ────────────────────────────────────────────────────────────────

export function selectRecommendedRoute(
  routes: RouteRow[],
  relevantCategory: RelevantCategory,
  contextStep: JobStepRow | null
): { id: string; breakdown: RouteScoreBreakdown } | null {
  if (routes.length === 0) return null;
  const scored = routes
    .map((r) => ({ route: r, breakdown: scoreRoute(r, relevantCategory, contextStep) }))
    .sort((a, b) => b.breakdown.finalScore - a.breakdown.finalScore);
  const top = scored[0];
  return { id: top.route.id, breakdown: top.breakdown };
}
