import type { HypothesisProvenanceCard } from "@/hooks/useStrategicHypotheses";
import type { ConfidenceLandscapeDomain } from "@/lib/refinePreviewConfidenceLandscape";
import type { RefinePreviewMovementItem } from "@/lib/refinePreviewMovement";
import type { RouteRationale } from "@/lib/routeRationale";
import { hypothesisAuthorityScore } from "@/lib/signalAuthority";
import type { RouteRow } from "@/views/Routes/useRoutes";

export type RefineNarrativePhase = "pre_diagnosis" | "diagnose" | "focus" | "flow";
export type HypothesisPriorityMode = "balanced" | "tension_first" | "assumption_pressure";
export type RouteSortMode = "investigate_first" | "validate_first" | "commit_first" | "movement_first";
export type RouteEditorialRole = "recommended" | "improving" | "risk" | "default";

export function resolveRefineNarrativePhase(phase: string): RefineNarrativePhase {
  if (phase === "outside_signals" || phase === "validate_outside") return "pre_diagnosis";
  if (phase === "diagnose" || phase === "validate_diagnose") return "diagnose";
  if (phase === "focus" || phase === "validate_focus") return "focus";
  return "flow";
}

/**
 * Floors the engagement phase to what evidence actually supports.
 * Prevents "focus" from displaying when customer needs data is absent,
 * and "flow" from displaying when no route commitment exists.
 * Does NOT mutate the database — display-only correction.
 */
export function floorEngagementPhase(args: {
  phase: string;
  hasNeedsWithScores: boolean;
  hasSelectedRoute: boolean;
}): string {
  const { phase, hasNeedsWithScores, hasSelectedRoute } = args;

  // Flow requires a committed route — without one, floor to focus
  if ((phase === "flow" || phase === "validate_flow") && !hasSelectedRoute) {
    return hasNeedsWithScores ? "focus" : "diagnose";
  }

  // Focus requires customer needs with importance/satisfaction data
  if ((phase === "focus" || phase === "validate_focus") && !hasNeedsWithScores) {
    return "diagnose";
  }

  return phase;
}

export function phaseSectionVisibility(phase: string) {
  const narrativePhase = resolveRefineNarrativePhase(phase);
  if (narrativePhase === "focus") {
    return {
      showHypotheses: true,
      showMovement: true,
      showConfidence: true,
      movementVisibleCount: 2,
      movementExpandedByDefault: false,
      suppressLowSignalMovement: true,
    };
  }
  if (narrativePhase === "flow") {
    return {
      showHypotheses: true,
      showMovement: true,
      showConfidence: true,
      movementVisibleCount: 2,
      movementExpandedByDefault: false,
      suppressLowSignalMovement: true,
    };
  }
  return {
    showHypotheses: true,
    showMovement: true,
    showConfidence: true,
    movementVisibleCount: narrativePhase === "diagnose" ? 2 : 1,
    movementExpandedByDefault: narrativePhase === "diagnose",
    suppressLowSignalMovement: false,
  };
}

export function phaseConfidenceEmphasis(phase: string): ConfidenceLandscapeDomain["key"][] {
  const narrativePhase = resolveRefineNarrativePhase(phase);
  if (narrativePhase === "pre_diagnosis") {
    return ["market_understanding", "customer_proof"];
  }
  if (narrativePhase === "diagnose") {
    return ["customer_proof", "route_confidence"];
  }
  if (narrativePhase === "focus") {
    return ["route_confidence", "execution_readiness"];
  }
  return ["execution_readiness", "route_confidence", "customer_proof"];
}

export function phaseNarrativePriority(phase: string) {
  const narrativePhase = resolveRefineNarrativePhase(phase);

  if (narrativePhase === "pre_diagnosis") {
    return {
      phase: narrativePhase,
      orientation: {
        question: "What has not yet been grounded in direct evidence?",
        read: "Direction has been forming from outside signals. It has not yet been grounded in customer or internal evidence.",
        tone: "exploratory" as const,
      },
      readinessFraming: "How stable is our understanding so far?",
      hypotheses: {
        maxItems: 2,
        priorityMode: "tension_first" as HypothesisPriorityMode,
        introCopy: "These are early outside-view reads from the evidence gathered so far. They should sharpen or break as we learn more.",
        note: "Hold these lightly. The point is to provoke better questions, not to settle the answer.",
      },
      movement: {
        introCopy: "What is forming, holding, or still unresolved in the current read.",
      },
      mainPage: {
        confidenceSummaryLine: "Where confidence is strongest and where it still needs proof.",
        showMovementFirst: false,
        reconciliationPlacement: "after_hypotheses" as const,
        hypothesisLabel: "What appears true",
        hypothesisTitle: "Early read",
      },
      lateCommand: {
        label: "WHAT TO EXAMINE NEXT",
      },
      routes: {
        introLabel: "Possible paths",
        introCopy: "Candidate directions the evidence has been pointing toward. Treat these as directional reads — not ready to commit.",
        panelTitle: "Why this path is surfacing",
        safeNowLabel: "How to treat it now",
        unreadyNote: "Not ready to commit — use these routes to probe the problem and test assumptions.",
        sortMode: "investigate_first" as RouteSortMode,
        softenWeakRoutes: false,
        suppressLeadBadge: true,
        hypothesisSubtitleOverride: "Directional paths suggested by the outside read — useful for tension-testing, not commitment.",
        recommendedLabel: "Clearest signal so far",
        recommendedReasonPrefix: "Why this is surfacing: ",
      },
    };
  }

  if (narrativePhase === "diagnose") {
    return {
      phase: narrativePhase,
      orientation: {
        question: "What still remains untested in the current read?",
        read: "The diagnosis is developing. Track what has held up, what has weakened, and what still needs direct proof before direction narrows.",
        tone: "exploratory" as const,
      },
      readinessFraming: "How stable is our understanding?",
      hypotheses: {
        maxItems: 2,
        priorityMode: "assumption_pressure" as HypothesisPriorityMode,
        introCopy: "These are the working reads that have been holding up, weakening, or waiting on proof.",
        note: "Use these to reconcile evidence and pressure-test assumptions before turning them into direction.",
      },
      movement: {
        introCopy: "What has been strengthening, weakening, or still remains unresolved.",
      },
      mainPage: {
        confidenceSummaryLine: "Where confidence is strongest and where it still needs proof.",
        showMovementFirst: false,
        reconciliationPlacement: "after_hypotheses" as const,
        hypothesisLabel: "What appears true",
        hypothesisTitle: "Early read",
      },
      lateCommand: {
        label: "WHAT TO EXAMINE NEXT",
      },
      routes: {
        introLabel: "Candidate paths",
        introCopy: "Possible directions that have been emerging from the evidence. Use these to probe assumptions and test what holds — not to choose yet.",
        panelTitle: "Why this path is emerging",
        safeNowLabel: "How to treat it now",
        unreadyNote: "Not ready to choose — resolve the assumptions still carrying too much weight before narrowing.",
        sortMode: "investigate_first" as RouteSortMode,
        softenWeakRoutes: false,
        suppressLeadBadge: true,
        hypothesisSubtitleOverride: "Candidate paths the diagnosis is beginning to surface — provisional and still open.",
        recommendedLabel: "Clearest current signal",
        recommendedReasonPrefix: "Why this is emerging: ",
      },
    };
  }

  if (narrativePhase === "focus") {
    return {
      phase: narrativePhase,
      orientation: {
        question: "What has the evidence most consistently pointed toward?",
        read: "A clearest path has emerged from the evidence. The task now is validating what has been strengthening and resolving what remains uncertain.",
        tone: "evaluative" as const,
      },
      readinessFraming: "How safe is prioritization right now?",
      hypotheses: {
        maxItems: 2,
        priorityMode: "assumption_pressure" as HypothesisPriorityMode,
        introCopy: "The current focus still depends on these assumptions and tensions continuing to hold.",
        note: "If these weaken, the focus should move.",
      },
      movement: {
        introCopy: "What has been narrowing, validating, or still remains too uncertain to focus around.",
      },
      mainPage: {
        confidenceSummaryLine: "How safe the current focus is and what still needs proof.",
        showMovementFirst: false,
        reconciliationPlacement: "before_confidence" as const,
        hypothesisLabel: "What this focus depends on",
        hypothesisTitle: null,
      },
      lateCommand: {
        label: "WHERE TO FOCUS",
      },
      routes: {
        introLabel: "Directions being explored",
        introCopy: "Routes ranked by accumulated evidence confidence. Compare what has been strengthening against competing paths — the most consistently supported read should lead.",
        panelTitle: "Why this route is safest to focus around",
        safeNowLabel: "What to pursue now",
        unreadyNote: "A lead route is forming, but it is not safe to commit until the remaining proof gaps clear.",
        sortMode: "commit_first" as RouteSortMode,
        softenWeakRoutes: true,
        suppressLeadBadge: false,
        hypothesisSubtitleOverride: "",
        recommendedLabel: "Safest route to focus around",
        recommendedReasonPrefix: "Why this is safest: ",
      },
    };
  }

  return {
    phase: narrativePhase,
    orientation: {
      question: "What is still shifting as we act?",
      read: "We are learning through action. Track what has continued holding, what has started drifting, and what new signals are reshaping the picture.",
      tone: "committed" as const,
    },
    readinessFraming: "How safe is execution commitment right now?",
    hypotheses: {
      maxItems: 2,
      priorityMode: "tension_first" as HypothesisPriorityMode,
      introCopy: "These are the tensions and assumptions most likely to change confidence next.",
      note: "Keep these in view as the route continues to learn.",
    },
    movement: {
      introCopy: "What has continued holding, started drifting, or recently shifted.",
    },
    mainPage: {
      confidenceSummaryLine: "How confidence is holding up as new signals come in.",
      showMovementFirst: true,
      reconciliationPlacement: "after_movement" as const,
      hypothesisLabel: "What still feels unresolved",
      hypothesisTitle: null,
    },
    lateCommand: {
      label: "WHAT IS MOVING",
    },
    routes: {
      introLabel: "Routes in motion",
      introCopy: "These routes are being sustained through learning. Watch what continues to hold, what has started drifting, and what new signals are reshaping the picture.",
      panelTitle: "How this route is holding up",
      safeNowLabel: "What to watch now",
      unreadyNote: "Keep the route live, but respond quickly if confidence weakens or the supporting signals drift.",
      sortMode: "movement_first" as RouteSortMode,
      softenWeakRoutes: false,
      suppressLeadBadge: false,
      hypothesisSubtitleOverride: "",
      recommendedLabel: "Most in motion",
      recommendedReasonPrefix: "What is shifting here: ",
    },
  };
}

function readinessRank(readiness: RouteRationale["readiness"]) {
  if (readiness === "Commit") return 4;
  if (readiness === "Validate") return 3;
  if (readiness === "Investigate") return 2;
  return 1;
}

function movementRank(movement: RouteRationale["movement"]) {
  if (movement === "weaken") return 5;
  if (movement === "split") return 4;
  if (movement === "strengthen") return 3;
  if (movement === "narrow") return 2;
  return 1;
}

function confidenceRank(confidence: RouteRationale["confidenceLabel"]) {
  if (confidence === "Supported by multiple validated signals") return 6;
  if (confidence === "Evidence is starting to converge") return 5;
  if (confidence === "Customer validation missing") return 4;
  if (confidence === "Early directional read") return 3;
  if (confidence === "Still highly uncertain") return 2;
  return 1;
}

function supportMix(row: HypothesisProvenanceCard) {
  return row.supportingClaims.reduce(
    (acc, claim) => {
      acc.outside += claim.supportShape.outside;
      acc.organization += claim.supportShape.organization;
      acc.customer += claim.supportShape.customer;
      return acc;
    },
    { outside: 0, organization: 0, customer: 0 },
  );
}

export function scoreHypothesisEditorial(row: HypothesisProvenanceCard, phase: string) {
  const narrativePhase = resolveRefineNarrativePhase(phase);
  const mix = supportMix(row);
  const authorityScore = hypothesisAuthorityScore(row, phase) * 10;
  const contradictionScore =
    row.weakeningClaims.length > 0 || row.hypothesis.hypothesis_state === "contradicted"
      ? 30
      : 0;
  const tensionScore = row.hypothesis.hypothesis_kind === "inferred_tension" ? 24 : 0;
  const assumptionScore = row.hypothesis.hypothesis_kind === "candidate_assumption" ? 18 : 0;
  const customerGapScore = mix.customer === 0 ? 12 : 0;
  const convergenceScore =
    (mix.customer > 0 ? 12 : 0) +
    (mix.organization > 0 ? 6 : 0) +
    (mix.outside > 0 ? 4 : 0);
  const weakeningScore = Math.min(row.weakeningClaims.length, 3) * 8;

  if (narrativePhase === "pre_diagnosis") {
    return authorityScore + contradictionScore + tensionScore + customerGapScore + convergenceScore + (mix.outside > 0 ? 10 : 0);
  }
  if (narrativePhase === "diagnose") {
    return authorityScore + contradictionScore + weakeningScore + assumptionScore + customerGapScore + convergenceScore;
  }
  if (narrativePhase === "focus") {
    return authorityScore + contradictionScore + assumptionScore + weakeningScore + convergenceScore + (mix.customer > 0 ? 10 : 0);
  }
  return authorityScore + contradictionScore + tensionScore + weakeningScore + convergenceScore + (row.hypothesis.hypothesis_state === "emerging" ? 10 : 0);
}

export function scoreMovementEditorial(item: RefinePreviewMovementItem, phase: string) {
  const narrativePhase = resolveRefineNarrativePhase(phase);
  let score = 100 - item.priority * 10;
  if (item.id === "customer-proof-gap") score += 24;
  if (item.id === "needs-review") score += 22;
  if (item.id === "open-tension") score += 18;
  if (item.id === "focus-route-narrowing" || item.id === "focus-not-ready") score += narrativePhase === "focus" ? 22 : 0;
  if (item.id === "flow-route-drift" || item.id === "flow-route-learning") score += narrativePhase === "flow" ? 22 : 0;
  if (item.tone === "tension") score += 10;
  if (item.tone === "review") score += 8;
  if (item.tone === "strengthening") score += 6;
  return score;
}

export function filterMovementForPhase(items: RefinePreviewMovementItem[], phase: string) {
  const narrativePhase = resolveRefineNarrativePhase(phase);
  const threshold = narrativePhase === "focus" || narrativePhase === "flow" ? 4 : 5;
  const filtered = items.filter((item) => item.priority <= threshold);
  return filtered.sort((a, b) => scoreMovementEditorial(b, phase) - scoreMovementEditorial(a, phase));
}

function confidenceStateWeight(state: ConfidenceLandscapeDomain["state"]) {
  if (state === "Early signal") return 32;
  if (state === "Direction forming") return 24;
  if (state === "Building support") return 14;
  return 4;
}

export function rankConfidenceDomainsForPhase(
  domains: ConfidenceLandscapeDomain[],
  phase: string,
  primaryKeys: ConfidenceLandscapeDomain["key"][] = [],
) {
  const emphasis = new Set(primaryKeys);
  return [...domains].sort((left, right) => {
    const score = (domain: ConfidenceLandscapeDomain) => {
      let value = confidenceStateWeight(domain.state);
      if (emphasis.has(domain.key)) value += 20;
      if (resolveRefineNarrativePhase(phase) === "pre_diagnosis" && domain.key === "execution_readiness") value -= 30;
      if (resolveRefineNarrativePhase(phase) === "flow" && domain.state === "Strong enough to act on") value -= 14;
      return value;
    };
    return score(right) - score(left);
  });
}

export function filterConfidenceDomainsForPhase(
  domains: ConfidenceLandscapeDomain[],
  phase: string,
  primaryKeys: ConfidenceLandscapeDomain["key"][] = [],
) {
  const narrativePhase = resolveRefineNarrativePhase(phase);
  const emphasis = new Set(primaryKeys);
  return rankConfidenceDomainsForPhase(domains, phase, primaryKeys).filter((domain) => {
    if (narrativePhase === "pre_diagnosis" && domain.key === "execution_readiness") return false;
    if (narrativePhase === "flow" && domain.state === "Strong enough to act on" && !emphasis.has(domain.key)) {
      return false;
    }
    return true;
  });
}

export function buildRouteEditorialRoles(args: {
  items: RouteRow[];
  rationales: Map<string, RouteRationale>;
  phase: string;
  recommendedRouteId?: string | null;
}) {
  const roles = new Map<string, RouteEditorialRole>();
  const narrativePhase = resolveRefineNarrativePhase(args.phase);
  const scored = args.items
    .map((route) => ({ route, rationale: args.rationales.get(route.id) ?? null }))
    .filter((entry): entry is { route: RouteRow; rationale: RouteRationale } => Boolean(entry.rationale));

  // In exploratory phases (pre_diagnosis, diagnose) the "recommended" role implies a
  // lead has been chosen — suppress it so the badge never shows "Lead route" prematurely.
  const allowRecommendedBadge = narrativePhase === "focus" || narrativePhase === "flow";
  if (args.recommendedRouteId && allowRecommendedBadge) roles.set(args.recommendedRouteId, "recommended");

  const improving = [...scored]
    .filter(({ rationale }) => rationale.movement === "strengthen" || rationale.movement === "narrow")
    .sort((left, right) => {
      const leftScore = readinessRank(left.rationale.readiness) * 20 + confidenceRank(left.rationale.confidenceLabel) * 10 + left.rationale.relevanceScore;
      const rightScore = readinessRank(right.rationale.readiness) * 20 + confidenceRank(right.rationale.confidenceLabel) * 10 + right.rationale.relevanceScore;
      return rightScore - leftScore;
    })[0];
  if (improving && !roles.has(improving.route.id)) roles.set(improving.route.id, "improving");

  const risk = [...scored]
    .filter(({ rationale }) => rationale.movement === "weaken" || rationale.readiness === "Hold" || rationale.confidenceLabel === "Contradicted by recent evidence")
    .sort((left, right) => {
      const leftScore = movementRank(left.rationale.movement) * 20 + (left.rationale.readiness === "Hold" ? 12 : 0) + (left.rationale.confidenceLabel === "Contradicted by recent evidence" ? 8 : 0);
      const rightScore = movementRank(right.rationale.movement) * 20 + (right.rationale.readiness === "Hold" ? 12 : 0) + (right.rationale.confidenceLabel === "Contradicted by recent evidence" ? 8 : 0);
      return rightScore - leftScore;
    })[0];
  if (risk && !roles.has(risk.route.id)) roles.set(risk.route.id, "risk");

  return roles;
}

export function sortRoutesForPhase(args: {
  items: RouteRow[];
  rationales: Map<string, RouteRationale>;
  phase: string;
  recommendedRouteId?: string | null;
}) {
  const mode = phaseNarrativePriority(args.phase).routes.sortMode;

  return [...args.items].sort((left, right) => {
    const leftRationale = args.rationales.get(left.id) ?? null;
    const rightRationale = args.rationales.get(right.id) ?? null;
    const leftRecommended = left.id === args.recommendedRouteId ? 1 : 0;
    const rightRecommended = right.id === args.recommendedRouteId ? 1 : 0;

    const leftScore = (() => {
      if (!leftRationale) return leftRecommended * 100;
      if (mode === "investigate_first") {
        return leftRecommended * 100 + (leftRationale.readiness === "Investigate" ? 40 : 0) + confidenceRank(leftRationale.confidenceLabel);
      }
      if (mode === "validate_first") {
        return leftRecommended * 100 + (leftRationale.readiness === "Validate" ? 50 : leftRationale.readiness === "Commit" ? 40 : 0) + confidenceRank(leftRationale.confidenceLabel);
      }
      if (mode === "commit_first") {
        return leftRecommended * 100 + readinessRank(leftRationale.readiness) * 20 + confidenceRank(leftRationale.confidenceLabel);
      }
      return leftRecommended * 100 + movementRank(leftRationale.movement) * 20 + readinessRank(leftRationale.readiness) * 5;
    })();

    const rightScore = (() => {
      if (!rightRationale) return rightRecommended * 100;
      if (mode === "investigate_first") {
        return rightRecommended * 100 + (rightRationale.readiness === "Investigate" ? 40 : 0) + confidenceRank(rightRationale.confidenceLabel);
      }
      if (mode === "validate_first") {
        return rightRecommended * 100 + (rightRationale.readiness === "Validate" ? 50 : rightRationale.readiness === "Commit" ? 40 : 0) + confidenceRank(rightRationale.confidenceLabel);
      }
      if (mode === "commit_first") {
        return rightRecommended * 100 + readinessRank(rightRationale.readiness) * 20 + confidenceRank(rightRationale.confidenceLabel);
      }
      return rightRecommended * 100 + movementRank(rightRationale.movement) * 20 + readinessRank(rightRationale.readiness) * 5;
    })();

    return rightScore - leftScore;
  });
}

export function softenRouteForPhase(args: {
  phase: string;
  route: RouteRow;
  rationale?: RouteRationale | null;
  recommendedRouteId?: string | null;
  selectedRouteId?: string | null;
}) {
  const config = phaseNarrativePriority(args.phase).routes;
  if (!config.softenWeakRoutes) return false;
  if (args.route.id === args.recommendedRouteId || args.route.id === args.selectedRouteId) return false;
  if (!args.rationale) return false;
  return args.rationale.readiness === "Investigate" || args.rationale.readiness === "Hold";
}

export function sortHypothesesForPhase(rows: HypothesisProvenanceCard[], mode: HypothesisPriorityMode) {
  return [...rows].sort((left, right) => {
    const score = (row: HypothesisProvenanceCard) => {
      const base = scoreHypothesisEditorial(
        row,
        mode === "tension_first" ? "outside_signals" : mode === "assumption_pressure" ? "focus" : "diagnose",
      );

      if (mode === "tension_first") {
        return base + (row.hypothesis.hypothesis_kind === "inferred_tension" ? 18 : 0);
      }
      if (mode === "assumption_pressure") {
        return base + (row.hypothesis.hypothesis_kind === "candidate_assumption" ? 16 : 0) + (row.weakeningClaims.length > 0 ? 10 : 0);
      }
      return base;
    };

    return score(right) - score(left);
  });
}
