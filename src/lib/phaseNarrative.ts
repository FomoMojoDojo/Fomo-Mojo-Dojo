// Phase-aware narrative engine.
//
// Replaces the inline researchFinding useMemo in MapView/index.tsx.
// Enforces guardrails so execution and prioritization language never appears
// before the Focus phase — regardless of what the evidence signals say.

import type { EngagementPhase } from "@/lib/engagementPhase";
import { phaseAllows } from "@/lib/engagementPhase";
import type { OpportunityRow } from "@/hooks/useOpportunities";
import type { ClientSummary, InputItem, ScoreArea } from "@/lib/types";
import type { SourceConfidenceSignals } from "@/lib/sourceConfidence";

export interface ResearchFinding {
  label: string;
  headline: string;
  detail: string;
  whyItMatters: string | null;
  whatNext: string | null;
  opportunityId: string | null;
  chips: Array<{ label: string; value: number }>;
  // true only when the phase allows route recommendations (Focus and later).
  showRouteRecommendations: boolean;
}

function isClientSummary(value: unknown): value is ClientSummary {
  return typeof value === "object" && value !== null && Array.isArray((value as ClientSummary).key_insights);
}

function safeNumber(n: unknown, fallback = 0): number {
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function areaLabel(area: ScoreArea): string {
  return area.area_label || area.area_key || "Area";
}

// ── Per-phase evidence prefix ─────────────────────────────────────────────────

function evidencePrefix(sourceSignals: SourceConfidenceSignals, phase: EngagementPhase): string {
  // In early phases, always describe as public/external — never imply certainty.
  if (phase === "outside_signals" || phase === "validate_outside") {
    return "Public evidence";
  }
  if (sourceSignals.hasPrimaryEvidence) return "Research evidence";
  if (sourceSignals.hasCompanyEvidence) return "Uploaded company evidence";
  return "Public evidence";
}

// ── Core builder ─────────────────────────────────────────────────────────────

export function buildPhaseNarrative(args: {
  phase: EngagementPhase;
  focusOpps: OpportunityRow[];
  weakestArea: ScoreArea | null;
  topInputGap: InputItem | null;
  summary: unknown;
  initiativeContext: { primaryJourneyTitle: string };
  sourceSignals: SourceConfidenceSignals;
}): ResearchFinding {
  const { phase, focusOpps, weakestArea, topInputGap, summary, initiativeContext, sourceSignals } = args;

  const canPrioritize    = phaseAllows(phase, "prioritization_advice");
  const canRecommRoutes  = phaseAllows(phase, "route_recommendations");
  const isObservational  = phase === "outside_signals" || phase === "validate_outside";
  const isDiagnostic     = phase === "diagnose" || phase === "validate_diagnose";

  const topFocus = focusOpps[0] ?? null;

  // ── Case 1: A focus-priority opportunity exists ────────────────────────────
  if (topFocus) {
    const stepContext =
      topFocus.step_label && topFocus.step_number
        ? `${topFocus.journey_key} checkpoint ${topFocus.step_number}: ${topFocus.step_label}`
        : topFocus.step_label || topFocus.journey_key || "current workflow";

    const prefix = evidencePrefix(sourceSignals, phase);

    // Label reflects certainty level
    const label = isObservational
      ? "External Signal"
      : isDiagnostic
        ? "Emerging Finding"
        : "Highest-Impact Finding";

    // Detail line is phase-gated
    const detail = isObservational
      ? `${prefix} points to ${stepContext} as a possible area of investigation for ${initiativeContext.primaryJourneyTitle}. This is an external signal — not yet a validated finding.`
      : isDiagnostic
        ? `${prefix} points to ${stepContext} as an area to examine further in ${initiativeContext.primaryJourneyTitle}. Validate with customer interviews before committing to a direction.`
        : `${prefix} points to ${stepContext} as the biggest leverage point for ${initiativeContext.primaryJourneyTitle}.`;

    // whyItMatters and whatNext are suppressed until route_recommendations unlocks
    const whyItMatters = canRecommRoutes
      ? "This checkpoint is likely creating the most drag right now, so improving it should unlock progress across the rest of the journey."
      : null;

    const whatNext = canPrioritize
      ? sourceSignals.hasPrimaryEvidence
        ? "Open this opportunity, define one testable change, and set clear success criteria for the next cycle."
        : "Strengthen evidence for this checkpoint first, then rerun baseline + analysis to confirm priority."
      : null;

    return {
      label,
      headline: String(topFocus.outcome || "A high-impact opportunity was identified."),
      detail,
      whyItMatters,
      whatNext,
      opportunityId: canRecommRoutes ? topFocus.id : null,
      chips: [],
      showRouteRecommendations: canRecommRoutes,
    };
  }

  // ── Case 2: A weak area exists ─────────────────────────────────────────────
  if (weakestArea) {
    const label = isObservational ? "Signal Pattern" : "Weakest Area";
    const headline = isObservational
      ? `${areaLabel(weakestArea)} shows as the lowest-scoring area in public evidence.`
      : `${areaLabel(weakestArea)} is the current constraint.`;

    return {
      label,
      headline,
      detail: weakestArea.status_note || "This area is the lowest-scoring part and the most likely drag on overall confidence.",
      whyItMatters: null,
      whatNext: null,
      opportunityId: null,
      chips: [{ label: "Score", value: Math.round(safeNumber(weakestArea.score, 0)) }],
      showRouteRecommendations: canRecommRoutes,
    };
  }

  // ── Case 3: A critical input gap exists ───────────────────────────────────
  if (topInputGap) {
    const label = isObservational ? "Missing Evidence" : "Largest Missing Input";
    const headline = isObservational
      ? `${topInputGap.input_label || "A key input"} is not yet in the evidence picture.`
      : topInputGap.input_label || "A critical input is still missing.";

    return {
      label,
      headline,
      detail: topInputGap.why_it_matters || "This input is still incomplete and needs attention before strategy becomes reliable.",
      whyItMatters: null,
      whatNext: null,
      opportunityId: null,
      chips: [{ label: "Impact", value: Math.round(safeNumber(topInputGap.score_impact, 0)) }],
      showRouteRecommendations: canRecommRoutes,
    };
  }

  // ── Case 4: Summary insight fallback ──────────────────────────────────────
  const insights = isClientSummary(summary) ? (summary.key_insights ?? []) : [];
  const topInsight = insights[0] ?? null;

  const label = isObservational ? "External Signals" : "Research Finding";
  const headline = isObservational
    ? "Gathering public signals — no top finding yet."
    : topInsight?.headline?.replace(/\*/g, "") || "No research finding yet.";
  const detail = isObservational
    ? "Run the public baseline to begin surfacing external signals and possible gaps."
    : topInsight?.detail || "Run Web Baseline + AI analysis to generate an evidence-backed finding.";

  return {
    label,
    headline,
    detail,
    whyItMatters: null,
    whatNext: null,
    opportunityId: null,
    chips: [],
    showRouteRecommendations: canRecommRoutes,
  };
}
