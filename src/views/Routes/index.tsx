import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import TopNav from "@/components/layout/TopNav";
import { useCompany } from "@/hooks/useCompany";
import { useCompanyClaims } from "@/lib/claims/useCompanyClaims";
import { useSourceConfidence } from "@/hooks/useSourceConfidence";
import { useJobSteps } from "@/hooks/useJobSteps";
import { useOpportunities } from "@/hooks/useOpportunities";
import { useManagedOutcomes } from "@/hooks/useManagedOutcomes";
import { useSolutionIdeas } from "@/hooks/useSolutionIdeas";
import { useRoutes } from "@/views/Routes/useRoutes";
import { useStrategyCascade } from "@/hooks/useStrategyCascade";
import { usePositioningCanvas } from "@/hooks/usePositioningCanvas";
import { useOdiNeeds } from "@/hooks/useOdiNeeds";
import { useStrategicHypotheses, useRouteHypothesisDependencies } from "@/hooks/useStrategicHypotheses";
import { useInspectionStack } from "@/hooks/useInspectionStack";
import { MetaBadge } from "@/components/ui/semantic-badges";
import PageContextStatus from "@/components/layout/PageContextStatus";
import GenericAuditTraceNote from "@/components/diagnostics/GenericAuditTraceNote";
import RouteCard from "./RouteCard";
import TopLevelRouteCard from "./TopLevelRouteCard";
import RouteInspectPanel, { type RouteInspectDetail } from "@/components/routes/RouteInspectPanel";
import NeedInspectPanel from "@/components/needs/NeedInspectPanel";
import StrategicDirectionInspectPanel from "@/components/direction/StrategicDirectionInspectPanel";
import InspectionShell from "@/components/inspection/InspectionShell";
import type { RouteRow } from "./useRoutes";
import type { JobStepRow } from "@/hooks/useJobSteps";
import type { OpportunityRow } from "@/hooks/useOpportunities";
import { isGenericAuditCompany } from "@/lib/genericAudit";
import {
  classifyOpportunityFocus,
  deriveInitiativeContext,
  type FocusClassification,
} from "@/lib/initiativeFocus";
import { routeDetail } from "./routeDetail";
import { useDesiredOutcomes } from "@/lib/desiredOutcomes";
import { buildRouteRationales } from "@/lib/routeRationale";
import {
  routeRelativeTime,
  buildDecisionBullets,
  persistSelectedRouteDecision,
  clearSelectedRouteDecision,
  insertRouteDecisionEvent,
} from "./routeDecision";
import { computeLatestExclusionAt, isArtifactStale } from "@/lib/evidenceImpact";
import { inferStrategicCenter } from "@/lib/strategicCenter";
import { buildCustomerRealityNarrative } from "@/lib/customerRealityNarrative";
import { buildPositioningLensNarrative } from "@/lib/positioningLensNarrative";
import { buildDecisionPortfolio } from "@/lib/decisionSystem";
import type { RouteDecision } from "@/lib/decisionSystem";
import { evaluatePositioningStrength } from "@/lib/positioningStrength";
import { useDerivedTensions } from "@/hooks/useDerivedTensions";
import TensionBlock from "@/components/tensions/TensionBlock";
import type { StrategicTension } from "@/lib/tensionTypes";
import { useStrategicDecisions } from "@/hooks/useStrategicDecisions";
import {
  deriveDecisionFieldCondition,
  confidenceMovementColor,
  confidenceMovementLabel,
  decisionStateColor,
  decisionStateBorderColor,
  type NarrativeDecision,
} from "@/lib/decisionPostureNarrative";
import { DECISION_STATE_LABELS, CONFIDENCE_STATE_LABELS, latestConfidenceDirection, latestMemoryEntry, type DecisionRouteRelationship } from "@/lib/strategicDecisionDomain";
import {
  buildConfidenceAnatomyReport,
  buildDecisionOnlyContext,
  isPostureAtRisk,
  POSTURE_RANK,
} from "@/lib/confidenceAnatomy";
import { buildMojoScoreReadinessReport } from "@/lib/mojoScoreFromAnatomy";
import {
  buildStrategicMovementEvents,
  deriveTopMovementItems,
  REVERSIBILITY_GLYPHS,
  POSTURE_IMPACT_COLORS,
} from "@/lib/strategicMovementNarrative";

const c = {
  bg: "#faf7f6",
  panel: "#FFFFFF",
  panelTint: "#F7FBF8",
  line: "#DDE6D1",
  lineFaint: "#EEF3E9",
  charcoal: "#233C4B",
  secondary: "#46606D",
  muted: "#6E847F",
  coral: "#FF7D2D",
  amber: "#FAC846",
  teal: "#5F9B8C",
};

function DecisionContextBlock({ decisions }: { decisions: NarrativeDecision[] }) {
  const active = decisions.filter((d) => d.decision_state !== "retired");
  if (active.length === 0) return null;

  return (
    <section style={{ paddingTop: 14, paddingBottom: 14, borderBottom: `1px solid ${c.lineFaint}` }}>
      <p className="mb-3 font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: c.muted, opacity: 0.6 }}>
        Active Decisions · {active.length}
      </p>
      <div className="space-y-[10px]">
        {active.slice(0, 5).map((d, i) => {
          const borderColor = decisionStateBorderColor(d.decision_state);
          const stateColor = decisionStateColor(d.decision_state);
          const stateLabel = DECISION_STATE_LABELS[d.decision_state] ?? d.decision_state;
          const confidenceLabel = CONFIDENCE_STATE_LABELS[d.confidence_state] ?? d.confidence_state;
          const latestDir = latestConfidenceDirection(d.confidence_movement);
          const movColor = confidenceMovementColor(latestDir);
          const movLabel = confidenceMovementLabel(latestDir);
          const latestMem = latestMemoryEntry(d.decision_memory);
          return (
            <div
              key={i}
              style={{ borderLeft: `2px solid ${borderColor}`, paddingLeft: 14 }}
            >
              <div className="flex items-start gap-3 flex-wrap">
                <p className="flex-1 font-sans text-[14px] font-medium leading-[1.4]" style={{ color: c.charcoal }}>
                  {d.title}
                </p>
                <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: stateColor }}>
                  {stateLabel}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-3 flex-wrap">
                <span className="font-mono text-[9px]" style={{ color: c.muted, opacity: 0.7 }}>
                  {confidenceLabel}
                </span>
                {movLabel && (
                  <span className="font-mono text-[9px]" style={{ color: movColor }}>
                    {movLabel}
                  </span>
                )}
                {d.current_posture && (
                  <span className="font-sans text-[12px] leading-[1.4]" style={{ color: c.secondary }}>
                    {d.current_posture}
                  </span>
                )}
              </div>
              {latestMem && (
                <p className="mt-1 font-sans text-[11px] leading-[1.4]" style={{ color: c.muted, fontStyle: "italic" }}>
                  {latestMem.entry}
                </p>
              )}
              {(() => {
                const anatomy = buildConfidenceAnatomyReport(buildDecisionOnlyContext(d));
                const topPressure = anatomy.pressurePoints[0] ?? null;
                const topUnlock = anatomy.unlockPaths[0] ?? null;
                const atRisk = isPostureAtRisk(anatomy.overallPosture);
                if (!atRisk && !anatomy.temporalNote) return null;
                return (
                  <div className="mt-2 space-y-[3px]">
                    {atRisk && topPressure && (
                      <p className="font-sans text-[11px] leading-[1.4]" style={{ color: "#b06a3c", fontStyle: "italic" }}>
                        {topPressure}
                      </p>
                    )}
                    {atRisk && topUnlock && (
                      <p className="font-sans text-[11px] leading-[1.4]" style={{ color: c.muted }}>
                        → {topUnlock.action}
                      </p>
                    )}
                    {anatomy.temporalNote && (
                      <p className="font-sans text-[10px] leading-[1.4]" style={{ color: c.muted, fontStyle: "italic", opacity: 0.65 }}>
                        {anatomy.temporalNote}
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    </section>
  );
}

type PressureGroupKey = "under_pressure" | "active_commitment" | "under_validation" | "competing" | "directional";

const PRESSURE_GROUP_ORDER: PressureGroupKey[] = [
  "under_pressure",
  "active_commitment",
  "under_validation",
  "competing",
  "directional",
];

const PRESSURE_GROUP_META: Record<PressureGroupKey, { label: string; description: string; accent: string }> = {
  under_pressure: {
    label: "Under pressure",
    description: "Commitment is weakening or paused — confidence has shifted.",
    accent: c.coral,
  },
  active_commitment: {
    label: "Active commitments",
    description: "Sufficient confidence to continue investing in these paths.",
    accent: c.teal,
  },
  under_validation: {
    label: "Under validation",
    description: "Enough signal to pursue — not yet safe to commit broadly.",
    accent: c.amber,
  },
  competing: {
    label: "Competing interpretations",
    description: "Paths in tension with each other — one may undermine or contradict the other.",
    accent: "#9298B5",
  },
  directional: {
    label: "Directional paths",
    description: "Early-direction signal — investigation without commitment.",
    accent: c.muted,
  },
};

const EDITORIAL_CONDITION_LABELS: Record<string, string> = {
  fragmented:         "Confidence is fragmented across paths — no clear lead.",
  validation_heavy:   "Most paths are stacked in validation — commitment not yet safe.",
  over_concentrated:  "Investment is over-concentrated — spreading risk unevenly.",
  converging:         "Paths are converging toward commitment.",
  scaling_ahead:      "Committing faster than confidence currently supports.",
  balanced:           "Commitment posture looks balanced.",
};

function pressureGroupKey(
  decision: RouteDecision | undefined,
  relationship: DecisionRouteRelationship | null,
): PressureGroupKey {
  if (relationship === "contradicting") return "competing";
  if (!decision) return "directional";
  if (
    decision.commitmentState === "pause" ||
    decision.commitmentState === "unwind" ||
    decision.sequencingPosture === "operationally_blocked" ||
    decision.blockedReason !== null
  ) return "under_pressure";
  if (decision.commitmentState === "commit" || decision.commitmentState === "scale") return "active_commitment";
  if (decision.commitmentState === "validate") return "under_validation";
  return "directional";
}

function consequenceSortValue(commitmentState: string | undefined): number {
  if (commitmentState === "unwind") return 5;
  if (commitmentState === "pause") return 4;
  if (commitmentState === "explore") return 2;
  if (commitmentState === "validate") return 1;
  if (commitmentState === "commit" || commitmentState === "scale") return 0;
  return 3;
}

function focusSortValue(focus: FocusClassification | undefined) {
  if (!focus) return 0;
  if (focus.level === "initiative") return 2;
  if (focus.level === "related") return 1;
  return 0;
}

function PressureGroupSection({
  groupKey,
  routes,
  opportunities,
  steps,
  initiativeContext,
  opportunityFocusById,
  routeOutcomeMap,
  routeDecisionMap,
  routeDecisionAttributionMap,
  allTensions,
  onInspect,
  selectedRouteId,
  onSelect,
  claimsMap,
}: {
  groupKey: PressureGroupKey;
  routes: RouteRow[];
  opportunities: OpportunityRow[];
  steps: JobStepRow[];
  initiativeContext: ReturnType<typeof deriveInitiativeContext>;
  opportunityFocusById: Map<string, FocusClassification>;
  routeOutcomeMap: Map<string, { statement: string; leadingIndicator: string }>;
  routeDecisionMap: Map<string, RouteDecision>;
  routeDecisionAttributionMap: Map<string, { title: string; decision_state: string }>;
  allTensions: StrategicTension[];
  onInspect?: (route: RouteRow) => void;
  selectedRouteId?: string | null;
  onSelect?: (route: RouteRow) => void;
  claimsMap?: Map<string, import("@/lib/claims/useCompanyClaims").ClaimRow>;
}) {
  const meta = PRESSURE_GROUP_META[groupKey];

  return (
    <section style={{ borderTop: `1px solid ${meta.accent}40`, paddingTop: 16, paddingBottom: 8 }}>
      <div className="mb-4">
        <h2 className="font-sans text-[16px] font-semibold leading-[1.1]" style={{ color: c.charcoal }}>
          {meta.label}
        </h2>
        <p className="mt-1 font-sans text-[12px] leading-[1.5]" style={{ color: c.muted }}>
          {meta.description}
        </p>
      </div>

      <div className="space-y-0">
        {[...routes]
          .map((route) => ({
            route,
            detail: routeDetail({ route, opportunities, steps, initiativeContext, opportunityFocusById }),
          }))
          .sort((a, b) => {
            const aDecision = routeDecisionMap.get(a.route.id);
            const bDecision = routeDecisionMap.get(b.route.id);
            const consequenceRank = consequenceSortValue(bDecision?.commitmentState) - consequenceSortValue(aDecision?.commitmentState);
            if (consequenceRank !== 0) return consequenceRank;
            const focusRank = focusSortValue(b.detail.focus) - focusSortValue(a.detail.focus);
            if (focusRank !== 0) return focusRank;
            return Number(a.route.sort_order ?? 999) - Number(b.route.sort_order ?? 999);
          })
          .map(({ route, detail }) => {
            const decision = routeDecisionMap.get(route.id);
            const routeTensions = allTensions.filter((t) => t.affected_routes.includes(route.id)).slice(0, 2);
            const decisionAttribution = routeDecisionAttributionMap.get(route.id) ?? null;
            return (
              <RouteCard
                key={route.id}
                route={route}
                accent={meta.accent}
                steps={detail.steps}
                evidence={detail.evidence}
                whyThisMatters={detail.whyThisMatters}
                frameworks={detail.frameworks}
                linkedDesiredOutcome={routeOutcomeMap.get(route.id) || null}
                focus={detail.focus}
                onInspect={onInspect ? () => onInspect(route) : undefined}
                isSelected={selectedRouteId === route.id}
                isOtherSelected={!!selectedRouteId && selectedRouteId !== route.id}
                onSelect={onSelect ? () => onSelect(route) : undefined}
                commitmentState={decision?.commitmentState}
                sequencingNarrative={decision?.sequencingNarrative ?? null}
                commitmentRationale={decision?.commitmentRationale ?? null}
                routeTensions={routeTensions}
                parentDecisionLabel={decisionAttribution?.title ?? null}
                isParentDestabilizing={decisionAttribution?.decision_state === "destabilizing"}
                claimId={route.claim_id ?? null}
                claimState={route.claim_id ? (claimsMap?.get(route.claim_id)?.state ?? null) : null}
              />
            );
          })}
      </div>
    </section>
  );
}

function DecisionSummaryBanner({
  route,
  detail,
  linkedOutcome,
  savedAt,
  onClear,
}: {
  route: RouteRow;
  detail: ReturnType<typeof routeDetail>;
  linkedOutcome: { statement: string; leadingIndicator: string } | null;
  savedAt: string | null;
  onClear: () => void;
}) {
  const bullets = buildDecisionBullets(detail, linkedOutcome);
  const points = typeof route.pts_value === "number" ? Math.round(route.pts_value) : null;

  return (
    <section style={{ borderLeft: `3px solid ${c.teal}`, paddingLeft: 20, paddingTop: 4, paddingBottom: 4 }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: c.teal }}>
              Lead commitment
            </span>
            {points !== null && (
              <span className="font-mono text-[10px] font-semibold" style={{ color: c.teal }}>
                +{points} pts
              </span>
            )}
          </div>

          <h3 className="mb-3 font-sans text-[26px] font-semibold leading-tight" style={{ color: c.charcoal }}>
            {route.title || "Untitled route"}
          </h3>

          <ul className="space-y-1.5">
            {bullets.map((bullet, i) => (
              <li
                key={i}
                className="flex items-start gap-2 font-sans text-[13px] leading-[1.5]"
                style={{ color: c.secondary }}
              >
                <span style={{ color: c.teal }}>·</span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 font-mono text-[10px]" style={{ color: c.muted, opacity: 0.65 }}>
            {savedAt
              ? `Saved decision · last updated ${routeRelativeTime(savedAt)}`
              : "Saving…"}
          </p>
        </div>

        <button
          type="button"
          onClick={onClear}
          className="mt-1 shrink-0 font-mono text-[10px] uppercase tracking-[0.08em]"
          style={{ color: c.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          Clear
        </button>
      </div>
    </section>
  );
}

function CommitmentReviewBlock({
  portfolio,
  routeOutcomeMap,
  items,
  opportunities,
  steps,
  initiativeContext,
  opportunityFocusById,
  onSelect,
}: {
  portfolio: { safeToCommit: string[]; blocked: string[]; routes: RouteDecision[]; escalations: { detail: string }[] };
  routeOutcomeMap: Map<string, { statement: string; leadingIndicator: string }>;
  items: RouteRow[];
  opportunities: OpportunityRow[];
  steps: JobStepRow[];
  initiativeContext: ReturnType<typeof deriveInitiativeContext>;
  opportunityFocusById: Map<string, FocusClassification>;
  onSelect: (route: RouteRow) => void;
}) {
  const supportableDecision = useMemo(() => {
    return portfolio.routes.find(
      (d) => d.commitmentState === "commit" || d.commitmentState === "scale",
    ) ?? null;
  }, [portfolio.routes]);

  const supportableRoute = useMemo(() => {
    if (!supportableDecision) return null;
    return items.find((r) => r.id === supportableDecision.routeId) ?? null;
  }, [supportableDecision, items]);

  const blockedCount = portfolio.blocked.length;
  const validatingCount = portfolio.routes.filter((r) => r.commitmentState === "validate").length;
  const primaryBlocker = portfolio.escalations[0]?.detail ?? null;
  const catKey = String(supportableRoute?.category || "improve").toLowerCase();
  const catMeta = CATEGORY_META[catKey] ?? CATEGORY_META.improve;
  const points = supportableRoute && typeof supportableRoute.pts_value === "number" ? Math.round(supportableRoute.pts_value) : null;

  const saferIfLine = useMemo(() => {
    if (!supportableDecision) return null;
    if (supportableDecision.blockedReason) return supportableDecision.blockedReason;
    if (supportableDecision.sequencingPosture === "waiting_on_customer_confirmation") {
      return "Additional customer interviews would strengthen confidence before committing.";
    }
    if (supportableDecision.sequencingPosture === "needs_prerequisite_proof") {
      return "One foundational route needs to prove out first.";
    }
    if (supportableDecision.sequencingPosture === "sequencing_conflict") {
      return "A conflicting commitment exists — resolve sequencing before proceeding.";
    }
    return null;
  }, [supportableDecision]);

  if (!supportableRoute) {
    return (
      <section style={{ paddingTop: 12, paddingBottom: 16, borderBottom: `1px solid ${c.lineFaint}` }}>
        <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: c.muted }}>
          Commitment review
        </p>
        <p className="mt-2 font-sans text-[16px] leading-[1.45]" style={{ color: c.secondary }}>
          {validatingCount > 0
            ? `${validatingCount} ${validatingCount === 1 ? "route remains" : "routes remain"} in validation — commitment readiness hasn't settled yet.`
            : "No route has reached a supportable state. Validation continues."}
        </p>
        {primaryBlocker && (
          <p className="mt-2 font-sans text-[13px] leading-[1.5]" style={{ color: c.muted }}>
            {primaryBlocker}
          </p>
        )}
      </section>
    );
  }

  const detail = routeDetail({ route: supportableRoute, opportunities, steps, initiativeContext, opportunityFocusById });
  const linkedOutcome = routeOutcomeMap.get(supportableRoute.id) ?? null;
  const bullets = buildDecisionBullets(detail, linkedOutcome);

  return (
    <section style={{ borderLeft: `3px solid ${c.teal}`, paddingLeft: 20, paddingTop: 16, paddingBottom: 16 }}>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: c.teal }}>
          Most supportable route
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: catMeta.accent }}>
          {catMeta.title}
        </span>
        {points !== null && (
          <span className="font-mono text-[10px] font-semibold" style={{ color: catMeta.accent }}>
            +{points} pts potential
          </span>
        )}
        {blockedCount > 0 && (
          <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.coral }}>
            {blockedCount} {blockedCount === 1 ? "route" : "routes"} blocked
          </span>
        )}
        {validatingCount > 0 && (
          <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.amber }}>
            {validatingCount} validating
          </span>
        )}
      </div>

      <h2 className="mb-3 font-sans text-[26px] font-semibold leading-tight" style={{ color: c.charcoal }}>
        {supportableRoute.title || "Untitled route"}
      </h2>

      {bullets.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {bullets.slice(0, 3).map((bullet, i) => (
            <li
              key={i}
              className="flex items-start gap-2 font-sans text-[14px] leading-[1.6]"
              style={{ color: c.secondary }}
            >
              <span style={{ color: c.teal }}>·</span>
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      )}

      {saferIfLine && (
        <p className="mb-3 font-sans text-[12px] leading-[1.5]" style={{ color: c.muted, fontStyle: "italic" }}>
          {saferIfLine}
        </p>
      )}

      <button
        type="button"
        onClick={() => onSelect(supportableRoute)}
        className="font-mono text-[10px] uppercase tracking-[0.1em] underline"
        style={{ color: c.teal, background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        Select as chosen path →
      </button>
    </section>
  );
}

export default function RoutesView() {
  const { activeCompany } = useCompany();
  const auditMode = isGenericAuditCompany(activeCompany);
  const { stack, top, open: openFrame, push: pushFrame, pop: popFrame, clear: clearFrame, updateTopLens } = useInspectionStack();
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [decisionSavedAt, setDecisionSavedAt] = useState<string | null>(null);

  // Sync from DB when company changes
  useEffect(() => {
    setSelectedRouteId(activeCompany?.selected_route_id ?? null);
    setDecisionSavedAt(activeCompany?.selected_route_updated_at ?? null);
  }, [activeCompany?.id]);
  const { loading, items, error } = useRoutes(activeCompany?.id);
  const { claims: claimsMap } = useCompanyClaims(activeCompany?.id);
  const { primary: primaryOutcome } = useDesiredOutcomes(activeCompany?.id);
  const { item: cascade } = useStrategyCascade(activeCompany?.id);
  const { item: positioning } = usePositioningCanvas(activeCompany?.id);
  const { items: steps } = useJobSteps(activeCompany?.id);
  const { items: opportunities } = useOpportunities(activeCompany?.id);
  const { needs } = useOdiNeeds(activeCompany?.id);
  const { items: managedOutcomes } = useManagedOutcomes(activeCompany?.id);
  const { items: solutionIdeas } = useSolutionIdeas(activeCompany?.id);
  const { signals: sourceSignals } = useSourceConfidence({
    companyId: activeCompany?.id,
    areaScoresJson: activeCompany?.area_scores_json,
    evidenceStatus: activeCompany?.evidence_status,
  });
  // Must be declared before any useMemo that references decisions (avoids temporal dead zone)
  const { decisions } = useStrategicDecisions(activeCompany?.id);
  const initiativeContext = useMemo(
    () =>
      deriveInitiativeContext({
        areaScoresJson: activeCompany?.area_scores_json,
        jobSteps: steps,
      }),
    [activeCompany?.area_scores_json, steps],
  );
  const opportunityFocusById = useMemo(() => {
    const map = new Map<string, FocusClassification>();
    for (const opp of opportunities) {
      map.set(opp.id, classifyOpportunityFocus(opp, initiativeContext));
    }
    return map;
  }, [initiativeContext, opportunities]);

  const routeRelationshipMap = useMemo(() => {
    const map = new Map<string, DecisionRouteRelationship>();
    for (const d of decisions) {
      for (const r of d.routes) {
        if (!map.has(r.route_id)) map.set(r.route_id, r.relationship);
      }
    }
    return map;
  }, [decisions]);

  const routeOutcomeMap = useMemo(() => {
    const managedById = new Map(
      managedOutcomes.map((outcome) => [
        outcome.id,
        {
          statement: String(outcome.outcome_statement || outcome.outcome_title || "").trim(),
          leadingIndicator: String(outcome.leading_indicator || outcome.metric || "").trim(),
        },
      ]),
    );
    const opportunitiesById = new Map(opportunities.map((opp) => [opp.id, opp]));
    const map = new Map<string, { statement: string; leadingIndicator: string }>();
    for (const idea of solutionIdeas) {
      const routeId = String(idea.route_id || "").trim();
      if (!routeId || map.has(routeId)) continue;
      const opp = opportunitiesById.get(String(idea.opportunity_id || ""));
      if (!opp?.managed_outcome_id) continue;
      const managed = managedById.get(String(opp.managed_outcome_id || ""));
      if (!managed) continue;
      map.set(routeId, managed);
    }
    return map;
  }, [managedOutcomes, opportunities, solutionIdeas]);

  const latestExclusionAt = useMemo(
    () => computeLatestExclusionAt(activeCompany?.excluded_signals_json ?? []),
    [activeCompany?.excluded_signals_json],
  );

  const selectedRoute = useMemo(
    () => items.find((r) => r.id === selectedRouteId) ?? null,
    [items, selectedRouteId],
  );

  // Rationale hooks — loaded alongside routes; needed for inspect panel confidence posture
  const { data: strategicHypothesisRows = [] } = useStrategicHypotheses(activeCompany?.id);
  const { data: routeHypothesisDeps = [] } = useRouteHypothesisDependencies(activeCompany?.id);

  const routeSeeds = useMemo(
    () => items.map((route) => ({
      route,
      evidence: Array.isArray(route.evidence_json) ? route.evidence_json : [],
      assumptions: Array.isArray(route.assumptions_json) ? route.assumptions_json : [],
    })),
    [items],
  );

  const routeRationales = useMemo(
    () => buildRouteRationales({
      seeds: routeSeeds,
      hypotheses: strategicHypothesisRows,
      routeLinks: routeHypothesisDeps,
      selectedRouteId,
      phase: activeCompany?.engagement_phase ?? "outside_signals",
    }),
    [routeSeeds, strategicHypothesisRows, routeHypothesisDeps, selectedRouteId, activeCompany?.engagement_phase],
  );

  const routeRationaleMap = useMemo(
    () => new Map(routeRationales.map((r) => [r.routeId, r])),
    [routeRationales],
  );

  const strategicCenter = useMemo(
    () => inferStrategicCenter({ activeRows: strategicHypothesisRows, routeSeeds, phase: activeCompany?.engagement_phase ?? "outside_signals" }),
    [strategicHypothesisRows, routeSeeds, activeCompany?.engagement_phase],
  );

  const customerRealityNarrative = useMemo(
    () => buildCustomerRealityNarrative(needs, items, cascade ?? null),
    [needs, items, cascade],
  );

  const positioningNarrative = useMemo(
    () => buildPositioningLensNarrative(positioning ?? null, cascade ?? null, items),
    [positioning, cascade, items],
  );

  const portfolio = useMemo(
    () => buildDecisionPortfolio({
      routes: items,
      rationales: routeRationales,
      strategicCenter,
      customerReality: customerRealityNarrative,
      positioningNarrative,
      phase: activeCompany?.engagement_phase ?? "outside_signals",
    }),
    [items, routeRationales, strategicCenter, customerRealityNarrative, positioningNarrative, activeCompany?.engagement_phase],
  );

  const routeDecisionMap = useMemo(
    () => new Map(portfolio.routes.map((d) => [d.routeId, d])),
    [portfolio.routes],
  );

  const pressureGroups = useMemo(() => {
    const groups = new Map<PressureGroupKey, RouteRow[]>(
      PRESSURE_GROUP_ORDER.map((k) => [k, []]),
    );
    for (const route of items) {
      const decision = routeDecisionMap.get(route.id);
      const relationship = routeRelationshipMap.get(route.id) ?? null;
      const key = pressureGroupKey(decision, relationship);
      groups.get(key)!.push(route);
    }
    return PRESSURE_GROUP_ORDER
      .map((key) => ({ key, routes: groups.get(key)! }))
      .filter((g) => g.routes.length > 0);
  }, [items, routeDecisionMap, routeRelationshipMap]);

  const needsById = useMemo(() => new Map(needs.map((n) => [n.id, n])), [needs]);
  const REVIEW_STATES = ["needs_review", "stale", "contradicted", "revalidate"];

  const positioningStrength = useMemo(
    () => positioning ? evaluatePositioningStrength(positioning) : undefined,
    [positioning],
  );

  const decisionFieldCondition = useMemo(
    () => deriveDecisionFieldCondition(decisions),
    [decisions],
  );

  const routeDecisionAttributionMap = useMemo(() => {
    const map = new Map<string, { title: string; decision_state: string }>();
    for (const d of decisions) {
      for (const r of d.routes) {
        if (!map.has(r.route_id)) {
          map.set(r.route_id, { title: d.title, decision_state: d.decision_state });
        }
      }
    }
    return map;
  }, [decisions]);

  const readinessReport = useMemo(() => {
    const active = decisions.filter((d) => d.decision_state !== "retired");
    if (active.length === 0) return null;
    // Pick the decision with the worst posture (most in need of attention)
    const anatomies = active.map((d) => ({
      d,
      anatomy: buildConfidenceAnatomyReport(buildDecisionOnlyContext(d)),
    }));
    const worst = anatomies.reduce((prev, curr) =>
      POSTURE_RANK[curr.anatomy.overallPosture] < POSTURE_RANK[prev.anatomy.overallPosture] ? curr : prev,
    );
    return buildMojoScoreReadinessReport(worst.anatomy, worst.d.confidence_movement);
  }, [decisions]);

  const topMovementItems = useMemo(() => {
    if (decisions.length === 0) return [];
    const events = buildStrategicMovementEvents(decisions);
    return deriveTopMovementItems(events, 2);
  }, [decisions]);

  const { all: allTensions, forContext: tensionsForContext, blockers: tensionBlockers } = useDerivedTensions({
    routes: items,
    needs,
    canvas: positioning ?? null,
    cascade: cascade ?? null,
    sourceSignals,
    portfolio,
    hypotheses: strategicHypothesisRows,
    positioningStrength,
  });
  const routeTensions = tensionsForContext("routes", 3);

  // Derive the route/need objects being inspected from the top stack frame
  const topRoute = useMemo(
    () => top?.kind === "route" ? (items.find((r) => r.id === top.objectId) ?? null) : null,
    [top, items],
  );
  const topNeed = useMemo(
    () => top?.kind === "need" ? (needsById.get(top.objectId) ?? null) : null,
    [top, needsById],
  );

  const inspectDetail = useMemo<RouteInspectDetail | null>(() => {
    if (!topRoute) return null;
    const d = routeDetail({ route: topRoute, opportunities, steps, initiativeContext, opportunityFocusById });
    return { steps: d.steps, evidence: d.evidence, whyThisMatters: d.whyThisMatters, frameworks: d.frameworks, rankedOpps: d.rankedOpps };
  }, [topRoute, opportunities, steps, initiativeContext, opportunityFocusById]);

  const inspectRationale = useMemo(
    () => topRoute ? (routeRationaleMap.get(topRoute.id) ?? null) : null,
    [topRoute, routeRationaleMap],
  );

  const inspectRouteDecision = useMemo(
    () => topRoute ? (portfolio.routes.find((d) => d.routeId === topRoute.id) ?? null) : null,
    [topRoute, portfolio],
  );

  const topDirectionCompanyId = useMemo(
    () => top?.kind === "direction" ? top.objectId : null,
    [top],
  );

  const topNeedStaleNote = useMemo(() => {
    if (!topNeed) return null;
    if (latestExclusionAt && isArtifactStale(topNeed, latestExclusionAt)) return "Needs review after excluded inputs";
    const state = String((topNeed as unknown as Record<string, unknown>).dependency_state ?? "").toLowerCase();
    if (REVIEW_STATES.includes(state)) {
      return (String((topNeed as unknown as Record<string, unknown>).stale_reason ?? "") || "This need may need review.");
    }
    return null;
  }, [topNeed, latestExclusionAt]);

  const selectedDetail = useMemo(() => {
    if (!selectedRoute) return null;
    return routeDetail({ route: selectedRoute, opportunities, steps, initiativeContext, opportunityFocusById });
  }, [selectedRoute, opportunities, steps, initiativeContext, opportunityFocusById]);

  const selectedOutcome = selectedRoute ? (routeOutcomeMap.get(selectedRoute.id) ?? null) : null;

  async function handleSelectRoute(route: RouteRow) {
    if (selectedRouteId === route.id) {
      handleClearDecision();
      return;
    }

    // Capture prior selection before optimistic update for history event
    const eventType = selectedRouteId ? "changed" : "selected";

    // Optimistic
    const now = new Date().toISOString();
    setSelectedRouteId(route.id);
    setDecisionSavedAt(now);

    if (!activeCompany?.id) return;

    const detail = routeDetail({ route, opportunities, steps, initiativeContext, opportunityFocusById });
    const linkedOutcome = routeOutcomeMap.get(route.id) ?? null;
    const bullets = buildDecisionBullets(detail, linkedOutcome);
    const summary = { bullets, route_title: route.title, route_category: route.category };

    await persistSelectedRouteDecision(activeCompany.id, route.id, summary, now);
    await insertRouteDecisionEvent(activeCompany.id, route.id, eventType, summary);
  }

  async function handleClearDecision() {
    // Capture prior selection before optimistic update for history event
    const priorRouteId = selectedRouteId;
    const priorSummary = activeCompany?.selected_route_summary_json ?? {};

    // Optimistic
    setSelectedRouteId(null);
    setDecisionSavedAt(null);

    if (!activeCompany?.id) return;

    await clearSelectedRouteDecision(activeCompany.id);
    await insertRouteDecisionEvent(activeCompany.id, priorRouteId, "cleared", priorSummary);
  }

  const currentScore = Math.round(Number(activeCompany?.mojo_score ?? 0));
  const potentialScore = Math.round(Number(activeCompany?.potential_score ?? 0));
  const totalPts = items.reduce((sum, route) => sum + Math.max(0, Number(route.pts_value || 0)), 0);

  const flaggedNeedsCount = needs.filter((n) =>
    REVIEW_STATES.includes(String((n as unknown as Record<string, unknown>).dependency_state ?? "").toLowerCase())
  ).length;
  const editorialHeadline = decisionFieldCondition ?? EDITORIAL_CONDITION_LABELS[portfolio.portfolioState] ?? "Commitment posture is uncertain.";
  const primaryPressure = readinessReport?.ceilingReason ?? portfolio.escalations[0]?.detail ?? null;
  const safestCommitment = portfolio.safeToCommit[0] ?? null;
  const activeSignals = strategicHypothesisRows.filter((h) => h.hypothesis.is_active).slice(0, 5);

  // ── A5 hierarchy ──────────────────────────────────────────────────────────
  const topLevelRoutes = useMemo(
    () => items.filter((r) => r.level === "route"),
    [items],
  );
  const legRoutes = useMemo(
    () => items.filter((r) => r.level !== "route"),
    [items],
  );
  const legsByParent = useMemo(() => {
    const map = new Map<string, typeof legRoutes>();
    for (const leg of legRoutes) {
      const pid = leg.parent_id ?? "__orphan__";
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid)!.push(leg);
    }
    return map;
  }, [legRoutes]);

  const hasHierarchy = topLevelRoutes.length > 0;

  // State-aware page-level framing derived from top-level route claim states
  const routesPageFraming = useMemo(() => {
    if (!hasHierarchy) return null;
    const states = topLevelRoutes.map((r) =>
      r.claim_id ? (claimsMap?.get(r.claim_id)?.state ?? null) : null,
    );
    const flowRoute = topLevelRoutes.find((r) => claimsMap?.get(r.claim_id ?? "")?.state === "flow");
    const focusRoute = topLevelRoutes.find((r) => claimsMap?.get(r.claim_id ?? "")?.state === "focus");
    if (flowRoute) {
      return {
        lead: "Committed route in progress",
        sub: `${flowRoute.title} — leg-by-leg execution underway.`,
      };
    }
    if (focusRoute) {
      return {
        lead: "Primary route emerging",
        sub: `${focusRoute.title} continues to strengthen across evidence layers. Comparing against alternatives before commitment.`,
      };
    }
    const diagnoseCount = states.filter((s) => s === "diagnose").length;
    const n = topLevelRoutes.length;
    if (diagnoseCount > 0) {
      return {
        lead: "Routes under consideration",
        sub: `${n} candidate ${n === 1 ? "direction" : "directions"}, all grounded in internal evidence. Customer validation is the next layer needed to focus around one.`,
      };
    }
    return {
      lead: "Routes under consideration — internal grounding still forming",
      sub: "Compare directions as evidence accumulates. None yet has the evidence to focus around.",
    };
  }, [hasHierarchy, topLevelRoutes, claimsMap]);

  return (
    <div
      className="min-h-screen strategic-surface"
      style={{
        background: c.bg,
        backgroundImage:
          'url("data:image/svg+xml,%3Csvg width=\'6\' height=\'6\' viewBox=\'0 0 6 6\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23000\' fill-opacity=\'0.025\'%3E%3Cpath d=\'M5 0h1L0 5V4zM6 5v1H5z\'/%3E%3C/g%3E%3C/svg%3E")',
      }}
    >
      <TopNav />

      <main className="mx-auto max-w-[1440px] px-4 pb-12 pt-6 sm:px-6 md:px-8">
        <PageContextStatus lastScoredAt={activeCompany?.last_scored_at} sourceSignals={sourceSignals} />

        <div className="mb-1" style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: "#9298B5" }}>
            Commitment Review · {activeCompany?.name || "No company selected"} · {initiativeContext.primaryJourneyTitle}
          </p>
          <Link
            to="/preview/client-refine/workshop?tab=council"
            className="font-mono text-[10px] uppercase tracking-[0.1em] underline"
            style={{ color: "#6a9e94", opacity: 0.7 }}
          >
            Council →
          </Link>
          <GenericAuditTraceNote
            active={auditMode}
            className="mt-3 max-w-5xl"
            source="routes table when available; otherwise route cards are derived from opportunities and priority tiers."
            evaluation="AI/logic classify each route as Fix/Improve/Create and match it against initiative focus and linked opportunities."
            scoring="Route impact uses pts_value; top-panel score delta compares current reality vs reachable score and highlights expected movement."
            why="This shows whether route guidance is evidence-backed or derived fallback, so you can tune route quality and confidence."
          />
        </div>

        {!activeCompany?.id ? (
          <div className="px-0 py-12 text-center">
            <p className="font-sans text-[15px]" style={{ color: c.secondary }}>
              Select a company to view route data.
            </p>
          </div>
        ) : loading ? (
          <div className="px-0 py-12 text-center">
            <p className="font-mono text-[12px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
              Loading routes…
            </p>
          </div>
        ) : error ? (
          <div className="px-0 py-12 text-center">
            <p className="font-sans text-[15px]" style={{ color: c.coral }}>
              Failed to load routes: {error}
            </p>
          </div>
        ) : (
          <div className="space-y-0">

            {/* ── STATE-AWARE PAGE FRAMING ──────────────────────────────── */}
            {routesPageFraming ? (
              <section style={{ paddingTop: 14, paddingBottom: 20, borderBottom: `1px solid ${c.line}` }}>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: c.muted, opacity: 0.65 }}>
                  Route overview
                </p>
                <h2 className="mt-2 font-sans font-semibold leading-[1.15] max-w-3xl" style={{ fontSize: 36, color: c.charcoal }}>
                  {routesPageFraming.lead}
                </h2>
                <p className="mt-2 font-sans text-[14px] leading-[1.5] max-w-2xl" style={{ color: c.secondary }}>
                  {routesPageFraming.sub}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1">
                  {flaggedNeedsCount > 0 && (
                    <Link to="/job-steps#needs" className="font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: c.coral, textDecoration: "underline" }}>
                      {flaggedNeedsCount} {flaggedNeedsCount === 1 ? "proof point" : "proof points"} need review →
                    </Link>
                  )}
                  <span className="font-mono text-[9px]" style={{ color: c.muted, opacity: 0.55 }}>
                    {currentScore} readiness · +{Math.max(0, potentialScore - currentScore)} reachable · {topLevelRoutes.length} {topLevelRoutes.length === 1 ? "route" : "routes"} · {legRoutes.length} legs
                  </span>
                </div>
              </section>
            ) : (
              /* Fallback framing for companies without hierarchy */
              <section style={{ paddingTop: 14, paddingBottom: 20, borderBottom: `1px solid ${c.line}` }}>
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: readinessReport ? (readinessReport.readinessCeiling < 35 ? c.coral : readinessReport.readinessCeiling < 55 ? c.amber : c.muted) : c.muted }}>
                    {readinessReport ? readinessReport.postureLabel : "Commitment posture"}
                  </p>
                  {readinessReport && (
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: readinessReport.movementColor }}>
                      {readinessReport.movementLabel}
                    </p>
                  )}
                </div>
                <h2 className="mt-3 font-sans font-semibold leading-[1.2] max-w-3xl" style={{ fontSize: 44, color: c.charcoal }}>
                  {editorialHeadline}
                </h2>
              </section>
            )}

            {/* ── DESIRED OUTCOME ───────────────────────────────────────── */}
            {primaryOutcome && (
              <section style={{ paddingTop: 18, paddingBottom: 18, borderBottom: `1px solid ${c.line}` }}>
                <p className="font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: c.muted, opacity: 0.65 }}>
                  Desired Outcome
                </p>
                <p className="mt-2 font-sans text-[16px] leading-[1.5] max-w-2xl" style={{ color: c.charcoal, fontWeight: 500 }}>
                  {primaryOutcome.statement}
                </p>
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
                  {primaryOutcome.importance_score !== null && (
                    <span className="font-mono text-[11px]" style={{ color: c.secondary }}>
                      Importance: <strong style={{ color: c.charcoal }}>{primaryOutcome.importance_score}/10</strong>
                    </span>
                  )}
                  {primaryOutcome.satisfaction_score !== null && (
                    <span className="font-mono text-[11px]" style={{ color: c.secondary }}>
                      Current satisfaction: <strong style={{ color: c.charcoal }}>{primaryOutcome.satisfaction_score}/10</strong>
                    </span>
                  )}
                  {primaryOutcome.importance_score !== null && primaryOutcome.satisfaction_score !== null && (
                    <span className="font-mono text-[11px]" style={{ color: c.coral }}>
                      Gap: <strong>{primaryOutcome.importance_score - primaryOutcome.satisfaction_score}</strong>
                    </span>
                  )}
                </div>
                {primaryOutcome.metric && (
                  <p className="mt-2 font-sans text-[11px] leading-[1.45]" style={{ color: c.muted, fontStyle: "italic" }}>
                    {primaryOutcome.metric}
                  </p>
                )}
              </section>
            )}

            {/* ── STRATEGIC SIGNALS ─────────────────────────────────────── */}
            {activeSignals.length > 0 && (
              <section style={{ paddingTop: 10, paddingBottom: 10, borderBottom: `1px solid ${c.lineFaint}` }}>
                <div className="space-y-[10px]">
                  {activeSignals.map((card) => {
                    const isBlocked = card.weakeningClaims.length > 0 || card.hypothesis.hypothesis_state === "contradicted";
                    const stateLabel =
                      card.hypothesis.hypothesis_state === "strengthened" ? "GAINING"
                      : card.hypothesis.hypothesis_state === "contradicted" ? "CRITICAL"
                      : card.hypothesis.hypothesis_state === "reframed"    ? "REFRAMED"
                      : "HOLDING";
                    const stateColor = stateLabel === "GAINING" ? c.teal : stateLabel === "CRITICAL" ? c.coral : c.muted;
                    return (
                      <div key={card.hypothesis.id} className="flex items-start gap-3">
                        <span className="mt-[6px] h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: isBlocked ? c.coral : c.teal }} />
                        <p className="flex-1 font-sans text-[13px] leading-[1.45]" style={{ color: c.charcoal }}>
                          {card.hypothesis.statement}
                        </p>
                        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: stateColor }}>
                          {stateLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── STRATEGIC TENSIONS ────────────────────────────────────── */}
            {routeTensions.length > 0 && (
              <section style={{ paddingTop: 16, paddingBottom: 16, borderBottom: `1px solid ${c.lineFaint}` }}>
                <TensionBlock
                  tensions={routeTensions}
                  context="routes"
                  showBlockerCallout={tensionBlockers.length > 0}
                />
              </section>
            )}

            {/* ── DECISION CONTEXT ──────────────────────────────────────── */}
            {decisions.length > 0 && (
              <DecisionContextBlock decisions={decisions} />
            )}

            {/* ── MOVEMENT SIGNALS ──────────────────────────────────────── */}
            {topMovementItems.length > 0 && (
              <section style={{ paddingTop: 12, paddingBottom: 12, borderBottom: `1px solid ${c.lineFaint}` }}>
                <div className="flex items-center justify-between mb-2">
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: c.muted, opacity: 0.6 }}>
                    Field conditions
                  </p>
                  <Link to="/movement" className="font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: c.muted, opacity: 0.5, textDecoration: "none" }}>
                    All movement →
                  </Link>
                </div>
                <div className="space-y-[6px]">
                  {topMovementItems.map((item) => (
                    <div key={item.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span aria-hidden style={{ flexShrink: 0, fontSize: 12, paddingTop: 2, color: POSTURE_IMPACT_COLORS[item.postureImpact] }}>
                        {REVERSIBILITY_GLYPHS[item.reversibility]}
                      </span>
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 500, color: c.charcoal, margin: 0, lineHeight: "1.4" }}>
                          {item.headline}
                        </p>
                        <p style={{ fontSize: 11, color: c.secondary, margin: "2px 0 0", lineHeight: "1.4" }}>
                          {item.meaning}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {latestExclusionAt && (
              <div style={{ borderLeft: `2px solid #FAC846`, paddingLeft: 12, paddingTop: 4, paddingBottom: 4 }}>
                <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: "#FAC846" }}>
                  Outside signals have been excluded. Route confidence may have changed.
                </p>
                <p className="font-sans text-[12px] mt-1" style={{ color: "#6E847F" }}>
                  Review affected recommendations before making a decision.
                </p>
              </div>
            )}

            {/* ── SELECTED ROUTE BANNER ─────────────────────────────────── */}
            {selectedRoute && selectedDetail && (
              <DecisionSummaryBanner
                route={selectedRoute}
                detail={selectedDetail}
                linkedOutcome={selectedOutcome}
                savedAt={decisionSavedAt}
                onClear={handleClearDecision}
              />
            )}

            {/* ── ROUTE HIERARCHY (primary layout when hierarchy exists) ── */}
            {hasHierarchy ? (
              <div style={{ paddingTop: 12 }}>
                {topLevelRoutes.map((route) => (
                  <TopLevelRouteCard
                    key={route.id}
                    route={route}
                    legs={legsByParent.get(route.id) ?? []}
                    claimsMap={claimsMap}
                    opportunities={opportunities}
                    steps={steps}
                    initiativeContext={initiativeContext}
                    opportunityFocusById={opportunityFocusById}
                    routeOutcomeMap={routeOutcomeMap}
                    routeDecisionMap={routeDecisionMap}
                    routeDecisionAttributionMap={routeDecisionAttributionMap}
                    allTensions={allTensions}
                    selectedRouteId={selectedRouteId}
                    onSelect={handleSelectRoute}
                    onInspect={(r) => openFrame({ kind: "route", objectId: r.id, lens: "overview" })}
                  />
                ))}
              </div>
            ) : (
              /* Fallback flat layout for companies without hierarchy */
              <div className="space-y-2" style={{ paddingTop: 12 }}>
                {pressureGroups.length === 0 ? (
                  <p className="font-sans text-[13px] py-4" style={{ color: c.muted }}>
                    No commitment paths defined yet.
                  </p>
                ) : (
                  pressureGroups.map(({ key, routes }) => (
                    <PressureGroupSection
                      key={key}
                      groupKey={key}
                      routes={routes}
                      opportunities={opportunities}
                      steps={steps}
                      initiativeContext={initiativeContext}
                      opportunityFocusById={opportunityFocusById}
                      routeOutcomeMap={routeOutcomeMap}
                      routeDecisionMap={routeDecisionMap}
                      routeDecisionAttributionMap={routeDecisionAttributionMap}
                      allTensions={allTensions}
                      onInspect={(route) => openFrame({ kind: "route", objectId: route.id, lens: "overview" })}
                      selectedRouteId={selectedRouteId}
                      onSelect={handleSelectRoute}
                      claimsMap={claimsMap}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </main>

      <InspectionShell
        stack={stack}
        onPop={popFrame}
        onClear={clearFrame}
        renderRoute={(frame) => (
          <RouteInspectPanel
            key={frame.objectId}
            shellMode
            initialLens={frame.lens}
            onLensChange={updateTopLens}
            open
            onClose={clearFrame}
            route={topRoute}
            detail={inspectDetail}
            rationale={inspectRationale}
            areaScoresJson={activeCompany?.area_scores_json}
            linkedDesiredOutcome={topRoute ? (routeOutcomeMap.get(topRoute.id) || null) : null}
            currentPhase={activeCompany?.engagement_phase ?? "outside_signals"}
            staleNote={topRoute && latestExclusionAt && isArtifactStale(topRoute, latestExclusionAt) ? "Needs review after excluded inputs" : null}
            linkedNeeds={needs}
            onInspectNeed={(needId) => pushFrame({ kind: "need", objectId: needId, lens: "overview" })}
            onInspectDirection={activeCompany?.id ? () => pushFrame({ kind: "direction", objectId: activeCompany.id, lens: "overview" }) : undefined}
            cascade={cascade}
            positioning={positioning}
            routeDecision={inspectRouteDecision}
          />
        )}
        renderNeed={(frame) => {
          const prevFrame = stack.length > 1 ? stack[stack.length - 2] : null;
          const linkedRouteIds = prevFrame?.kind === "route" ? [prevFrame.objectId] : [];
          return (
            <NeedInspectPanel
              key={frame.objectId}
              shellMode
              initialLens={frame.lens}
              onLensChange={updateTopLens}
              open
              onClose={clearFrame}
              need={topNeed}
              routes={items}
              onInspectRoute={(routeId) => pushFrame({ kind: "route", objectId: routeId, lens: "overview" })}
              currentPhase={activeCompany?.engagement_phase ?? "outside_signals"}
              staleNote={topNeedStaleNote}
              linkedRouteIds={linkedRouteIds}
            />
          );
        }}
        renderDirection={(frame) => (
          <StrategicDirectionInspectPanel
            key={frame.objectId}
            shellMode
            initialLens={frame.lens}
            onLensChange={updateTopLens}
            open
            onClose={clearFrame}
            companyId={topDirectionCompanyId}
            routes={items}
            needs={needs}
            onInspectRoute={(routeId) => pushFrame({ kind: "route", objectId: routeId, lens: "overview" })}
          />
        )}
      />
    </div>
  );
}
