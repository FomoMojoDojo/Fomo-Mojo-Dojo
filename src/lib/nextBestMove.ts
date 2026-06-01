// ── Next Best Move ────────────────────────────────────────────────────────────
//
// Derives the highest-leverage action the user should take next, based on
// evidence readiness — not on route scoring. Prevents committing to a route
// before the customer foundation is strong enough.
//
// Readiness ladder (weakest → strongest):
//   1. No primary customer evidence  → validate_needs   (run interviews first)
//   2. Interviews exist, unquantified → run_odi_survey  (score the needs)
//   3. Needs prioritised by ODI data → start_route      (act on the signal)
//
// Critical invariant: seeded/generated needs (source_path: "research-company",
// "baseline", "generated", etc.) are treated as hypotheses. They do NOT count
// as customer evidence and do NOT count toward statistical prioritisation.
// Only needs with primary research source paths (interview, survey, etc.) count.
//
// Rule 4: if a selectedRoute exists but readiness is below "start_route",
// isHypothesis: true signals the UI to frame it as a working hypothesis.

import type { OdiNeedRow } from "@/hooks/useOdiNeeds";
import type { RouteRow } from "@/views/Routes/useRoutes";
import type { JobStepRow } from "@/hooks/useJobSteps";
import { isPrimaryNeedsSourcePath } from "@/lib/evidenceBands";

// ── Public types ──────────────────────────────────────────────────────────────

export type NextBestMoveType = "validate_needs" | "run_odi_survey" | "start_route";

export type NextBestMove = {
  type: NextBestMoveType;
  title: string;
  reason: string;
  routeId?: string;
  stepId?: string;
  /** True when a selectedRoute exists but evidence readiness does not yet
   *  support committing to it. The route is a working hypothesis. */
  isHypothesis?: boolean;
};

// ── Evidence state passed in by the caller ────────────────────────────────────

export type EvidenceReadiness = {
  /** From SourceConfidenceSignals.hasPrimaryEvidence */
  hasPrimaryEvidence: boolean;
  /** Count of primary research inputs (interviews, surveys) */
  primaryEvidenceSignals: number;
  /** True if org-layer artifacts exist (uploaded docs, strategy cascade, etc.) */
  hasCompanyEvidence: boolean;
};

// ── Debug type (for development inspection) ───────────────────────────────────

export type NextBestMoveDebug = {
  result: NextBestMove;
  primaryNeedsCount: number;
  scoredPrimaryNeedsCount: number;
  scoreSpread: number;
  hasHighPriority: boolean;
  customerLayer: "missing" | "directional" | "validated";
  priorityClarity: "unclear" | "clear";
  weakStepRatio: number;
};

// ── Internal thresholds ───────────────────────────────────────────────────────

// One primary-research need is enough to say "interviews present" (directional).
// This correctly separates "no interviews yet" from "some interviews, not quantified."
const MIN_PRIMARY_NEEDS = 1;

// Minimum primary-sourced needs with ODI-level scoring to call priority "clear."
const MIN_SCORED_PRIMARY_NEEDS = 3;

// Score spread required to confirm priorities are differentiated.
const MIN_SCORE_SPREAD = 5;

// Score threshold for "clearly actionable" need.
const HIGH_OPPORTUNITY_THRESHOLD = 10;

// Ratio of job steps with weak evidence above which customer layer is treated as missing
// even if hasPrimaryEvidence is nominally set.
const WEAK_STEP_EVIDENCE_RATIO = 0.5;

// ── Route-specific action derivation ─────────────────────────────────────────

// Pick the best evidence-derived route to extract a validation action from.
// Prefers routes with route_insights_json.uncertainty and evidence_derived_79 tag.
function findLeadInsightRoute(routes: RouteRow[]): RouteRow | null {
  const withInsights = routes.filter((r) => !!r.route_insights_json?.movement_condition);
  const evidenceDerived = withInsights.filter(
    (r) => Array.isArray(r.frameworks_used) && r.frameworks_used.includes("evidence_derived_79"),
  );
  const candidates = evidenceDerived.length > 0 ? evidenceDerived : withInsights;
  return candidates.sort((a, b) => (b.pts_value ?? 0) - (a.pts_value ?? 0))[0] ?? null;
}

// Extract a specific, first-person test question from movement_condition.
// "Confidence strengthens when a partner reports X" → "Test whether a partner reports X."
export function deriveRouteValidationTitle(route: RouteRow): string {
  const mc = route.route_insights_json?.movement_condition ?? "";
  const match = mc.match(/strengthens when ([^.]+)/i);
  if (match) {
    const condition = match[1].trim().replace(/\.$/, "");
    return `Test whether ${condition.charAt(0).toLowerCase()}${condition.slice(1)}.`;
  }
  return route.title;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// A need is "meaningfully scored" when importance/satisfaction are not both at
// the default midpoint (5) and the opportunity score is non-zero.
function isMeaningfullyScored(n: OdiNeedRow): boolean {
  return !(n.importance === 5 && n.satisfaction === 5) && n.opportunity_score > 0;
}

function deriveCurrentStepId(route: RouteRow): string | null {
  const steps = Array.isArray(route.steps_json) ? route.steps_json : [];
  return steps.find((s) => s.status !== "complete")?.id ?? steps[0]?.id ?? null;
}

// ── Layer assessments ─────────────────────────────────────────────────────────

function assessCustomerLayer(
  needs: OdiNeedRow[],
  jobSteps: JobStepRow[],
): "missing" | "directional" | "validated" {
  if (needs.length === 0) return "missing";

  // Only primary research source paths count as customer evidence.
  // hasPrimaryEvidence from sourceSignals is NOT used here — it can be set
  // by uploaded files or tagged inputs that are not interview/survey data on
  // these specific needs. We require evidence tied to actual need records.
  const primaryNeeds = needs.filter((n) => isPrimaryNeedsSourcePath(n.source_path));
  if (primaryNeeds.length < MIN_PRIMARY_NEEDS) return "missing";

  // Even with some primary needs, if job steps are mostly unclear the customer
  // layer is still too thin to act on.
  if (jobSteps.length >= 3) {
    const weakSteps = jobSteps.filter(
      (s) => s.evidence_status === "unclear" || (s.evidence_confidence ?? 100) < 40,
    ).length;
    if (weakSteps / jobSteps.length > WEAK_STEP_EVIDENCE_RATIO) return "missing";
  }

  return "directional";
}

type PriorityAssessment = {
  clarity: "unclear" | "clear";
  scoredCount: number;
  spread: number;
  hasHighPriority: boolean;
};

function assessPriorityClarity(needs: OdiNeedRow[]): PriorityAssessment {
  // Only primary-sourced needs count toward statistical prioritisation.
  // Seeded or generated needs are hypotheses — their importance/satisfaction
  // values reflect assumptions, not validated customer responses.
  const primaryNeeds = needs.filter((n) => isPrimaryNeedsSourcePath(n.source_path));
  const scored = primaryNeeds.filter(isMeaningfullyScored);

  if (scored.length < MIN_SCORED_PRIMARY_NEEDS) {
    return { clarity: "unclear", scoredCount: scored.length, spread: 0, hasHighPriority: false };
  }

  const scores = scored.map((n) => n.opportunity_score);
  const spread = Math.max(...scores) - Math.min(...scores);
  const hasHighPriority = scores.some((s) => s >= HIGH_OPPORTUNITY_THRESHOLD);

  return {
    clarity: spread >= MIN_SCORE_SPREAD && hasHighPriority ? "clear" : "unclear",
    scoredCount: scored.length,
    spread,
    hasHighPriority,
  };
}

// ── Main exports ──────────────────────────────────────────────────────────────

export function deriveNextBestMove({
  needs,
  routes,
  jobSteps,
  evidenceState: _evidenceState,
  selectedRoute,
}: {
  needs: OdiNeedRow[];
  routes: RouteRow[];
  jobSteps: JobStepRow[];
  evidenceState: EvidenceReadiness;
  selectedRoute: RouteRow | null;
}): NextBestMove {
  return deriveNextBestMoveDebug({ needs, routes, jobSteps, evidenceState: _evidenceState, selectedRoute }).result;
}

export function deriveNextBestMoveDebug({
  needs,
  routes,
  jobSteps,
  evidenceState: _evidenceState,
  selectedRoute,
}: {
  needs: OdiNeedRow[];
  routes: RouteRow[];
  jobSteps: JobStepRow[];
  evidenceState: EvidenceReadiness;
  selectedRoute: RouteRow | null;
}): NextBestMoveDebug {
  const primaryNeedsCount = needs.filter((n) => isPrimaryNeedsSourcePath(n.source_path)).length;
  const customerLayer = assessCustomerLayer(needs, jobSteps);
  const priorityResult = customerLayer !== "missing" ? assessPriorityClarity(needs) : {
    clarity: "unclear" as const,
    scoredCount: 0,
    spread: 0,
    hasHighPriority: false,
  };

  const weakStepRatio = jobSteps.length >= 3
    ? jobSteps.filter(
        (s) => s.evidence_status === "unclear" || (s.evidence_confidence ?? 100) < 40,
      ).length / jobSteps.length
    : 0;

  function build(result: NextBestMove): NextBestMoveDebug {
    return {
      result,
      primaryNeedsCount,
      scoredPrimaryNeedsCount: priorityResult.scoredCount,
      scoreSpread: priorityResult.spread,
      hasHighPriority: priorityResult.hasHighPriority,
      customerLayer,
      priorityClarity: priorityResult.clarity,
      weakStepRatio,
    };
  }

  // Rule 1: no primary customer research on these needs
  if (customerLayer === "missing") {
    const leadInsightRoute = findLeadInsightRoute(routes);
    if (leadInsightRoute) {
      return build({
        type: "validate_needs",
        title: deriveRouteValidationTitle(leadInsightRoute),
        reason: leadInsightRoute.route_insights_json?.uncertainty ?? "No customer-sourced data covers this route yet.",
        routeId: leadInsightRoute.id,
        isHypothesis: selectedRoute != null,
      });
    }
    return build({
      type: "validate_needs",
      title: "Gather direct evidence from partner cafes",
      reason: "Route recommendations are working hypotheses until customer evidence confirms them.",
      isHypothesis: selectedRoute != null,
    });
  }

  // Rule 2: interviews present but needs not statistically prioritised by ODI data
  if (priorityResult.clarity === "unclear") {
    return build({
      type: "run_odi_survey",
      title: "Send a short survey to score what matters most",
      reason: "Interviews show what's broken. A survey shows how broken.",
      isHypothesis: selectedRoute != null,
    });
  }

  // Rule 3: needs are ODI-prioritised — recommend a route
  const targetRoute =
    selectedRoute ??
    [...routes].sort((a, b) => (b.pts_value ?? 0) - (a.pts_value ?? 0))[0] ??
    null;

  if (!targetRoute) {
    return build({
      type: "start_route",
      title: "Pick a Fix or Improve path and start moving",
      reason: "You know what's broken. Time to decide and act.",
    });
  }

  return build({
    type: "start_route",
    title: `Start: ${targetRoute.title}`,
    reason: "This is your clearest path forward. Start here.",
    routeId: targetRoute.id,
    stepId: deriveCurrentStepId(targetRoute),
  });
}
