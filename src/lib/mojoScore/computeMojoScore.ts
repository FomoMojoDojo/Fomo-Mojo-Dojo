// ── MojoScore Orchestrator ────────────────────────────────────────────────────
//
// Pure function. Accepts a MojoScoreInput bundle and returns a MojoScoreResult.
// No I/O, no side effects — safe to call in tests or UI previews.
//
// Methodology version: 'v1.1.0'
// Bump this string whenever any contributor weight changes.

import type {
  MojoScoreInput,
  MojoScoreResult,
  ProjectedRaise,
  EngagementState,
} from "./types.ts";
import { scoreStateDistributionHealth, deriveEngagementState } from "./contributors/stateDistributionHealth.ts";
import { scoreCustomerBandEvidence } from "./contributors/customerBandEvidence.ts";
import { scoreWrapEvidence } from "./contributors/wrapEvidence.ts";
import { scoreActionPortfolioBalance } from "./contributors/actionPortfolioBalance.ts";
import { scoreStructuralCompleteness } from "./contributors/structuralCompleteness.ts";
import { scoreEvidenceFreshness } from "./contributors/evidenceFreshness.ts";
import { scoreOpportunityRouteCoverage } from "./contributors/opportunityRouteCoverage.ts";

export const METHODOLOGY_VERSION = "v1.1.0";

export function computeMojoScore(input: MojoScoreInput): MojoScoreResult {
  const contributors = [
    scoreStateDistributionHealth(input),
    scoreCustomerBandEvidence(input),
    scoreWrapEvidence(input),
    scoreActionPortfolioBalance(input),
    scoreStructuralCompleteness(input),
    scoreEvidenceFreshness(input),
    scoreOpportunityRouteCoverage(input),
  ];

  const totalScore = Math.min(
    100,
    Math.round(contributors.reduce((sum, c) => sum + c.weighted, 0)),
  );

  const engagement_state = deriveEngagementState(input.claims);
  const projected_raisers = deriveProjectedRaisers(input, contributors, totalScore);

  return {
    company_id: input.companyId,
    total_score: totalScore,
    contributors,
    projected_raisers,
    engagement_state,
    methodology_version: METHODOLOGY_VERSION,
    computed_at: input.computedAt,
  };
}

// ── Projected raisers ─────────────────────────────────────────────────────────
//
// Returns the top 5 highest-leverage actions sorted by estimated_points desc.
// Each action is derived from the lowest-scoring contributors.

function deriveProjectedRaisers(
  input: MojoScoreInput,
  contributors: MojoScoreResult["contributors"],
  currentTotal: number,
): ProjectedRaise[] {
  const raisers: ProjectedRaise[] = [];

  // Sort contributors by how much headroom they have (weighted gap to 100)
  const sorted = [...contributors].sort(
    (a, b) =>
      (100 - b.score) * b.weight - (100 - a.score) * a.weight,
  );

  for (const c of sorted) {
    const headroom = Math.round((100 - c.score) * c.weight);
    if (headroom <= 0) continue;

    const { action, confidence } = suggestAction(c.key, input, c.score);
    if (!action) continue;

    raisers.push({
      action_description: action,
      estimated_points: headroom,
      confidence,
    });

    if (raisers.length >= 5) break;
  }

  return raisers;
}

type ActionSuggestion = {
  action: string | null;
  confidence: "high" | "medium" | "low";
};

function suggestAction(
  key: string,
  input: MojoScoreInput,
  currentScore: number,
): ActionSuggestion {
  switch (key) {
    case "state_distribution_health": {
      const diagnosePct =
        input.claims.length > 0
          ? input.claims.filter((c) => c.state === "diagnose").length /
            input.claims.length
          : 0;
      if (diagnosePct > 0.5) {
        return {
          action: "Talk to customers to find out which direction has the strongest real-world pull",
          confidence: "high",
        };
      }
      return {
        action: "Map out what your team believes is true — even rough claims help sharpen the picture",
        confidence: "medium",
      };
    }

    case "customer_band_evidence": {
      const hasHierarchy = input.routes.some((r) => r.level === "route");
      const legs = hasHierarchy
        ? input.routes.filter((r) => r.level === "leg" || r.level === "action")
        : input.routes;
      const uncoveredLegs = legs.filter(
        (r) => (r.linked_need_ids?.length ?? 0) === 0,
      ).length;
      if (uncoveredLegs > 0) {
        return {
          action: `Link customer needs to ${uncoveredLegs} route leg${uncoveredLegs === 1 ? "" : "s"} to validate direction with customer signal`,
          confidence: "high",
        };
      }
      return {
        action: "Complete missing evidence items on route legs to raise evidence quality",
        confidence: "medium",
      };
    }

    case "wrap_evidence": {
      const topRoutes = input.routes.some((r) => r.level === "route")
        ? input.routes.filter((r) => r.level === "route")
        : input.routes.filter((r) => !r.parent_id);
      const missingAlts = topRoutes.filter(
        (r) => (r.rejected_alternatives?.length ?? 0) === 0,
      ).length;
      const missingConds = topRoutes.filter(
        (r) => (r.what_would_have_to_be_true?.length ?? 0) === 0,
      ).length;
      if (missingAlts > 0) {
        return {
          action: `Document rejected alternatives for ${missingAlts} route${missingAlts === 1 ? "" : "s"} to show decision rigor`,
          confidence: "high",
        };
      }
      if (missingConds > 0) {
        return {
          action: `Add conditions-to-be-true for ${missingConds} route${missingConds === 1 ? "" : "s"} to clarify what must hold before committing`,
          confidence: "medium",
        };
      }
      return {
        action: "Satisfy outstanding conditions on existing routes to demonstrate progress",
        confidence: "medium",
      };
    }

    case "action_portfolio_balance": {
      const hasHierarchy = input.routes.some((r) => r.level === "route");
      const legs = hasHierarchy
        ? input.routes.filter((r) => r.level === "leg" || r.level === "action")
        : input.routes;
      const hasFix = legs.some((r) => String(r.category).toLowerCase() === "fix");
      const hasImprove = legs.some((r) => String(r.category).toLowerCase() === "improve");
      const hasCreate = legs.some((r) => String(r.category).toLowerCase() === "create");
      const missing = [
        !hasFix && "Fix",
        !hasImprove && "Improve",
        !hasCreate && "Create",
      ].filter(Boolean) as string[];
      if (missing.length > 0) {
        return {
          action: `Add ${missing.join(" and ")} leg${missing.length === 1 ? "" : "s"} to balance the action portfolio`,
          confidence: "medium",
        };
      }
      return { action: null, confidence: "low" };
    }

    case "structural_completeness": {
      if (currentScore < 30) {
        return {
          action: "Complete step-by-step actions on route legs to demonstrate execution progress",
          confidence: "high",
        };
      }
      return {
        action: "Resolve missing evidence items on route legs to strengthen structural completeness",
        confidence: "medium",
      };
    }

    case "evidence_freshness": {
      return {
        action: "Review and update claims and route legs that have not been touched in 6+ months",
        confidence: "medium",
      };
    }

    case "opportunity_route_coverage": {
      const coveredNeedIds = new Set<string>();
      for (const route of input.routes) {
        for (const needId of route.linked_need_ids ?? []) {
          coveredNeedIds.add(needId);
        }
      }
      const uncovered = input.needs.filter((n) => !coveredNeedIds.has(n.id)).length;
      if (uncovered > 0) {
        return {
          action: `Link ${uncovered} uncovered customer need${uncovered === 1 ? "" : "s"} to route legs to close the customer insight loop`,
          confidence: "medium",
        };
      }
      return { action: null, confidence: "low" };
    }

    default:
      return { action: null, confidence: "low" };
  }
}
