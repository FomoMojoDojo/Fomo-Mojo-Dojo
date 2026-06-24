import { useEffect, useMemo, useRef, useState, useCallback, Fragment } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useCompany } from "@/hooks/useCompany";
import type { Company, ExcludedSignal } from "@/hooks/useCompany";
import { useClientViewData } from "@/hooks/useClientViewData";
import { useCapability } from "@/hooks/useCapability";
import { useRouteHypothesisDependencies, useStrategicHypotheses } from "@/hooks/useStrategicHypotheses";
import { supabase } from "@/integrations/supabase/client";
import { captureBaseline } from "@/lib/baselineCapture";
import { stageLabel } from "@/lib/phaseDisplay";
import { saveManualEdit } from "@/lib/manualInlineEdit";
import InlineTextEdit from "@/components/inline-edit/InlineTextEdit";
import InlineTextareaEdit from "@/components/inline-edit/InlineTextareaEdit";
import { useRoutes, type RouteAssumption } from "@/hooks/useRoutes";
import { CLIENT_REFINE_PREVIEW_ROUTE, CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE, CLIENT_REFINE_PREVIEW_PATH_ROUTE, CLIENT_REFINE_PREVIEW_INBOX_ROUTE, CLIENT_REFINE_PREVIEW_MEMBERS_ROUTE, CLIENT_REFINE_PREVIEW_EXTRACTS_ROUTE } from "@/lib/clientRefinePreview";
import { useDriftInboxCount } from "@/hooks/useDriftInbox";
import { setActivePath } from "@/lib/activePath";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import CanonicalRouteInspectPanel, { type RouteInspectDetail as CanonicalRouteInspectDetail } from "@/components/routes/RouteInspectPanel";
import ScoreContextBar from "@/components/score/ScoreContextBar";
import { buildReadinessFromCompanySignals } from "@/lib/mojoScoreFromAnatomy";
import type { RouteRow } from "@/hooks/useRoutes";
import type { JobStepRow } from "@/hooks/useJobSteps";
import { useOdiNeeds } from "@/hooks/useOdiNeeds";
import type { OdiNeedRow } from "@/hooks/useOdiNeeds";
import { usePublicBaseline } from "@/hooks/usePublicBaseline";
import { usePositioningCanvas } from "@/hooks/usePositioningCanvas";
import { useStrategyCascade } from "@/hooks/useStrategyCascade";
import { SignalBar } from "./workshop/tabs/OutsidePanels";
import type { SignalStage } from "./workshop/types";
import { baselineOf } from "./workshop/helpers";
import {
  routeRelativeTime,
  buildDecisionBullets,
  persistSelectedRouteDecision,
  clearSelectedRouteDecision,
  insertRouteDecisionEvent,
} from "@/lib/routeDecision";
import { computeLatestExclusionAt, isArtifactStale } from "@/lib/evidenceImpact";
import { clientGateInsight } from "@/lib/routeInsights";
import TierAlignmentGrid from "@/components/inspect/TierAlignmentGrid";
import { routeSignalTiers, generationContextLabel } from "@/lib/strategicObject";
import { buildRouteSourceLinks } from "@/lib/sourceLinks";
import SourcesUsedSection from "@/components/inspect/SourcesUsedSection";
import { selectRecommendedRoute, impactReason } from "@/lib/routeScoring";
import { type NextBestMove } from "@/lib/nextBestMove";
import { buildRouteRationales, deriveWhyLeading, type RouteRationale } from "@/lib/routeRationale";
import { buildRouteOrientationRead, deriveCommitmentLegitimacy, type RouteOrientationRead } from "@/lib/routeOrientationRead";
import { deriveClientAssumptions, deriveClientEvidence } from "@/lib/routeClientNarrative";
import { buildRouteEditorialRoles, floorEngagementPhase, phaseNarrativePriority, softenRouteForPhase, sortRoutesForPhase, type RouteEditorialRole } from "@/lib/refinePreviewPhaseOrchestration";
import { displayConfidenceLabel, commitmentMovementSentence } from "@/lib/strategicLanguage";
import "@/styles/client-refine-preview.css";
import { WorkshopSidebar } from "@/components/client/WorkshopSidebar";
import { useCompanyClaims, type ClaimRow } from "@/lib/claims/useCompanyClaims";

import ClaimStateBadge from "@/components/claims/ClaimStateBadge";
import type { ClaimState } from "@/lib/claimState";
import DriftBadge from "@/components/drift/DriftBadge";
import DriftDetailPanel from "@/components/drift/DriftDetailPanel";
import ProposeChangesButton from "@/components/drift/ProposeChangesButton";
import { useDriftScan } from "@/hooks/useDriftScan";
import type { EngagementPhase } from "@/lib/engagementPhase";
import { useDesiredOutcomes } from "@/lib/desiredOutcomes";
import type { DesiredOutcomeRow } from "@/lib/desiredOutcomes";
import { useMojoScore } from "@/hooks/useMojoScore";
import { computeMojoScore } from "@/lib/mojoScore/computeMojoScore";
import { computeReachableScore, computeUnlockableScore } from "@/lib/mojoScore/projections";
import { useSignalLandscape } from "@/hooks/useSignalLandscape";
import { SignalBasisChip } from "@/components/design-system/SignalBasisChip";
import { useRouteProposals, type RouteProposalRow } from "@/hooks/useRouteProposals";
import { useAuth } from "@/hooks/useAuth";
import SurfaceEducationTrigger from "@/components/surface-education/SurfaceEducationTrigger";
import FlowCommitSheet from "@/components/claims/FlowCommitSheet";
import { R, RouteCategory, CATEGORY_META, CATEGORY_POSTURE_LABEL, isHypothesisPhase, toSentence, deriveClientWhyReasons, deriveCanonicalRouteSentence, EvidenceItem, ClientAssumption, CLIENT_LAYER_LABELS, CLIENT_STATUS_LABELS, CLIENT_STATUS_COLORS, CLIENT_STATUS_GLYPHS, deriveStrengthMoves, DetailItem, statusGlyph, statusTip, ROUTE_FIELD_LABELS, ROUTE_FIELDS, summarizeRouteValue, routeDiffedFields, routeTimeAgo, WrapAlt, WrapCond, HIERARCHY_STATE_ACCENT, HIERARCHY_STATE_LABEL, HIERARCHY_FRAMING, HIERARCHY_HERO, inferRelevantCategory } from "./routes/shared";
import { ExpandRingBtn, ExpandRingIndicator, InkMetaChip, RouteStateTag, ScoreChip, HierarchyScoreStrip, KeystoneStripe } from "./routes/primitives";
import { ClientRouteInspectPanel, ClientDecisionBanner, RouteWhyRisingPanel, RouteProposalSection, RouteCard, RoutesColumn, HierarchyWrapPanel, HierarchyPageHeader, LegRow, HierarchyRouteSection, HierarchyGroupCard } from "./routes/components";















































export function DesiredOutcomeBanner({ outcome }: { outcome: DesiredOutcomeRow }) {
  if (!outcome.statement) return null;
  return (
    <div style={{ borderLeft: `5px solid ${R.signal}`, paddingLeft: 24, marginBottom: 52 }}>
      <p style={{ fontFamily: R.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.14em", color: R.signal, margin: "0 0 12px" }}>
        § Destination
      </p>
      <p style={{ fontFamily: R.sans, fontSize: 32, fontWeight: 800, color: R.ink, margin: 0, lineHeight: 1.2, letterSpacing: "-0.02em", maxWidth: 680 }}>
        {outcome.statement}
      </p>
      {outcome.metric && (
        <p style={{ fontFamily: R.sans, fontSize: 13, color: R.inkSoft, margin: "14px 0 0", lineHeight: 1.5 }}>
          <span style={{ fontFamily: R.mono, fontSize: 8.5, textTransform: "uppercase", letterSpacing: "0.1em", color: R.inkFaint }}>Leading Indicator</span>
          {" · "}{outcome.metric}
        </p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientRefinePreviewRoutesView() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { companies, setActiveCompanyId, loading: companiesLoading } = useCompany();
  const { activeCompany, hasCompany, confidence } = useClientViewData({ actionLimit: 5 });
  const [routesRefreshKey, setRoutesRefreshKey] = useState(0);
  const { loading: routesLoading, items: routes } = useRoutes(activeCompany?.id, routesRefreshKey);
  // ─── All data-fetching hooks before any callbacks ────────────────────────────
  const { needs } = useOdiNeeds(activeCompany?.id);
  const { preferredRun: baselineRun } = usePublicBaseline(activeCompany?.id);
  const { item: positioning } = usePositioningCanvas(activeCompany?.id);
  const { item: strategy } = useStrategyCascade(activeCompany?.id);
  const [activeStage, setActiveStage] = useState<SignalStage>("org");
  const [showHeaderSwitcher, setShowHeaderSwitcher] = useState(false);
  const headerSwitcherRef = useRef<HTMLDivElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const phase = floorEngagementPhase({
    phase: activeCompany?.engagement_phase ?? "outside_signals",
    hasNeedsWithScores: needs.some((n) => n.importance > 0),
    hasSelectedRoute: !!activeCompany?.selected_route_id,
  });
  const routeIdParam = searchParams.get("routeId");
  const baseline = baselineOf(baselineRun);
  const excludedCount = activeCompany?.excluded_signals_json?.length ?? 0;

  const { totalUnresolved: inboxCount, newCount: inboxNewCount } = useDriftInboxCount(activeCompany?.id);

  const goToMainSite   = useCallback(() => navigate("/"), [navigate]);
  const goToRefineHome = useCallback(() => navigate(CLIENT_REFINE_PREVIEW_ROUTE), [navigate]);
  const goToWorkshop   = useCallback(() => navigate(CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE), [navigate]);

  const handleStageChange = useCallback((stage: SignalStage) => {
    setActiveStage(stage);
    navigate(`${CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE}?stage=${stage}`);
  }, [navigate]);

  const clearRouteIdParam = useCallback(() => {
    setSearchParams((prev) => { prev.delete("routeId"); return prev; }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    if (!showHeaderSwitcher) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!headerSwitcherRef.current?.contains(e.target as Node)) setShowHeaderSwitcher(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowHeaderSwitcher(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [showHeaderSwitcher]);

  const readiness = useMemo(
    () => buildReadinessFromCompanySignals({
      mojoScore:       activeCompany?.mojo_score,
      evidenceStatus:  activeCompany?.evidence_status,
    }),
    [activeCompany?.mojo_score, activeCompany?.evidence_status],
  );
  const currentScore    = readiness.currentReadiness;
  const reachableScore  = readiness.nearTermPotential;
  const unlockableScore = readiness.structuralUpside;
  const readinessLabel  = readiness.postureLabel;
  const ceilingReason   = readiness.ceilingReason;
  const hasHierarchy    = routes.some((r) => r.level === "route");
  const { claims: pageClaimsMap } = useCompanyClaims(activeCompany?.id);
  const pageTopLevelRoutes = useMemo(() => routes.filter((r) => r.level === "route"), [routes]);
  const pagesDominantClaimState = useMemo((): ClaimState | null => {
    if (!hasHierarchy || pageTopLevelRoutes.length === 0) return null;
    const order: ClaimState[] = ["flow", "focus", "diagnose", "outside_view"];
    const states = pageTopLevelRoutes
      .map((r) => (r as { claim_id?: string | null }).claim_id
        ? (pageClaimsMap.get((r as { claim_id?: string | null }).claim_id!)?.state ?? null)
        : null)
      .filter((s): s is ClaimState => s !== null);
    for (const s of order) { if (states.includes(s)) return s; }
    return states[0] ?? null;
  }, [hasHierarchy, pageTopLevelRoutes, pageClaimsMap]);

  if (!hasCompany) {
    return (
      <section className="crpv-page crpv-routes-page">
        <article className="crpv-empty-state">
          <p className="cap">Client Refine Preview · Routes</p>
          <h1>Select a company to view routes.</h1>
          {companiesLoading ? (
            <p className="crpv-muted">Loading companies…</p>
          ) : companies.length > 0 ? (
            <div className="crpv-company-grid">
              {companies.map((company) => (
                <button
                  key={company.id}
                  type="button"
                  className="crpv-company-button"
                  onClick={() => setActiveCompanyId(company.id)}
                >
                  <span>{company.name}</span>
                  <small>{company.quarter || "Quarter"} · {company.archetype || "Archetype"}</small>
                </button>
              ))}
            </div>
          ) : (
            <p className="crpv-muted">No companies available.</p>
          )}
        </article>
      </section>
    );
  }

  return (
    <section className="crpv-page crpv-routes-page">
      <header className="crpv-header">
        <div className="left">
          <b>Mojo</b>
          {companies.length > 1 ? (
            <div className="crpv-co-switcher" ref={headerSwitcherRef}>
              <button
                type="button"
                className="crpv-co-trigger cap"
                onClick={() => setShowHeaderSwitcher((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={showHeaderSwitcher}
              >
                [{toSentence(activeCompany?.name) || "COMPANY"}]
                <span className="crpv-co-caret">{showHeaderSwitcher ? "▲" : "▼"}</span>
              </button>
              <span className="cap" style={{ marginLeft: 4 }}>· DAY 52 · {pagesDominantClaimState ? pagesDominantClaimState.replace(/_/g, " ").toUpperCase() : stageLabel(phase).toUpperCase()}</span>
              {showHeaderSwitcher && (
                <div className="crpv-co-dropdown" role="listbox">
                  <ul className="crpv-co-list">
                    {companies.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className={`crpv-co-option${c.id === activeCompany?.id ? " active" : ""}`}
                          role="option"
                          aria-selected={c.id === activeCompany?.id}
                          onClick={() => { setActiveCompanyId(c.id); setShowHeaderSwitcher(false); }}
                        >
                          <span className="crpv-co-option-name">{c.name}</span>
                          <span className="crpv-co-option-meta cap">
                            {[c.quarter, c.archetype, c.mojo_score != null ? `score ${Math.round(c.mojo_score)}` : null].filter(Boolean).join(" · ")}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <span className="cap">[{toSentence(activeCompany?.name) || "COMPANY"}] · DAY 52 · {pagesDominantClaimState ? pagesDominantClaimState.replace(/_/g, " ").toUpperCase() : stageLabel(phase).toUpperCase()}</span>
          )}
        </div>
      </header>

      {!hasHierarchy && (
        <ScoreContextBar
          currentScore={currentScore}
          reachableScore={reachableScore}
          unlockableScore={unlockableScore}
          routesCount={routes.length}
          confidenceLabel={readinessLabel}
          ceilingReason={ceilingReason}
        />
      )}

      {!hasHierarchy && (
        <SignalBar
          activeStage={activeStage}
          setActiveStage={handleStageChange}
          baseline={baseline}
          positioning={positioning ?? null}
          strategy={strategy ?? null}
          excludedCount={excludedCount}
        />
      )}

      <div className="crpv-ws-body">
        <WorkshopSidebar
          activeTab="routes"
          onTabClick={(tab) => navigate(`${CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE}?tab=${tab}`)}
          onHome={goToRefineHome}
          onMembers={() => navigate(CLIENT_REFINE_PREVIEW_MEMBERS_ROUTE)}
          onExtracts={() => navigate(CLIENT_REFINE_PREVIEW_EXTRACTS_ROUTE)}
          onInbox={() => navigate(CLIENT_REFINE_PREVIEW_INBOX_ROUTE)}
          inboxCount={inboxCount}
          inboxHasNew={inboxNewCount > 0}
          showTeachingToggle={isAdmin}
        />
        <div className="crpv-ws-content">
          <RoutesOrgPanel
            routes={routes}
            loading={routesLoading}
            activeCompany={activeCompany}
            routeIdParam={routeIdParam}
            onClearRouteIdParam={clearRouteIdParam}
            needs={needs}
            onCommitSuccess={() => setRoutesRefreshKey((k) => k + 1)}
          />
        </div>
      </div>
    </section>
  );
}

// ─── Workshop-embedded panel ──────────────────────────────────────────────────



export function RoutesOrgPanel({
  routes,
  loading,
  activeCompany,
  routeIdParam,
  onClearRouteIdParam,
  contextStep,
  nextBestMove,
  needs,
  onRouteActivate,
  onCommitSuccess,
}: {
  routes: RouteRow[];
  loading: boolean;
  activeCompany: Company | null | undefined;
  routeIdParam?: string | null;
  onClearRouteIdParam?: () => void;
  contextStep?: JobStepRow | null;
  nextBestMove?: NextBestMove;
  needs?: OdiNeedRow[];
  onRouteActivate?: (routeId: string) => void;
  onCommitSuccess?: () => void;
}) {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [inspectRoute, setInspectRoute]     = useState<RouteRow | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [decisionSavedAt, setDecisionSavedAt] = useState<string | null>(null);
  const [hoveredRouteId, setHoveredRouteId]   = useState<string | null>(null);
  const [confirmRoute, setConfirmRoute]       = useState<RouteRow | null>(null);
  // Governance + route-generate caps (3a/3b): the handlers + RoutesColumn renders
  // that consume these live in THIS component, so the hooks must resolve here.
  const canApply = useCapability("governance.proposal.apply", activeCompany?.id);
  const canReject = useCapability("governance.proposal.reject", activeCompany?.id);
  const canGenRoute = useCapability("structure.route.generate", activeCompany?.id);
  const { data: strategicHypothesisRows = [] } = useStrategicHypotheses(activeCompany?.id);
  const { data: routeHypothesisDependencies = [] } = useRouteHypothesisDependencies(activeCompany?.id);
  const [claimsRefreshKey, setClaimsRefreshKey] = useState(0);
  const [flowCommitClaim, setFlowCommitClaim] = useState<{ id: string; statement: string } | null>(null);
  const { claims: claimsMap } = useCompanyClaims(activeCompany?.id, claimsRefreshKey);
  const { primary: desiredOutcome } = useDesiredOutcomes(activeCompany?.id);
  const { history: mojoScoreHistory } = useMojoScore(activeCompany?.id);
  const { landscape: routesSignalLandscape } = useSignalLandscape(activeCompany?.id);
  const [reEvalLoading, setReEvalLoading] = useState<string | null>(null);
  const [routeProposalRefreshKey, setRouteProposalRefreshKey] = useState(0);
  const { proposals: routeProposalsMap } = useRouteProposals(activeCompany?.id, routeProposalRefreshKey);
  const [generateLoadingRouteId, setGenerateLoadingRouteId] = useState<string | null>(null);
  const [acceptLoadingProposalId, setAcceptLoadingProposalId] = useState<string | null>(null);
  const [rejectLoadingProposalId, setRejectLoadingProposalId] = useState<string | null>(null);
  const [driftPanel, setDriftPanel] = useState<{ surfaceType: string; surfaceId: string } | null>(null);
  const [driftBadgeRefreshKey, setDriftBadgeRefreshKey] = useState(0);
  const { checkingSurfaceId, checkSurface: checkRouteDrift } = useDriftScan(activeCompany?.id);

  useEffect(() => {
    setSelectedRouteId(activeCompany?.selected_route_id ?? null);
    setDecisionSavedAt(activeCompany?.selected_route_updated_at ?? null);
  }, [activeCompany?.id]);

  useEffect(() => {
    if (!routeIdParam || routes.length === 0) return;
    const target = routes.find((r) => r.id === routeIdParam);
    if (target) {
      setInspectRoute(target);
      onClearRouteIdParam?.();
    } else {
      console.warn(`[RoutesOrgPanel] No route found for routeId: ${routeIdParam}`);
    }
  }, [routeIdParam, routes]);

  const handleReEvaluate = useCallback(async (routeId: string) => {
    if (!activeCompany?.id) return;
    setReEvalLoading(routeId);
    const { error } = await supabase.functions.invoke("evaluate-route-alignment", {
      body: { route_id: routeId, company_id: activeCompany.id },
    });
    setReEvalLoading(null);
    if (error) console.error("[RoutesOrgPanel] Re-evaluate error:", error.message);
  }, [activeCompany?.id]);

  const handleGenerateRouteProposal = useCallback(async (routeId: string) => {
    if (!activeCompany?.id) return;
    if (!canGenRoute) return; // structure.route.generate
    setGenerateLoadingRouteId(routeId);
    try {
      await supabase.functions.invoke("propose-route-changes", {
        body: { route_id: routeId, company_id: activeCompany.id },
      });
      setRouteProposalRefreshKey((k) => k + 1);
    } finally {
      setGenerateLoadingRouteId(null);
    }
  }, [activeCompany?.id, canGenRoute]);

  const handleDriftClick = useCallback((surfaceType: string, surfaceId: string) => {
    setDriftPanel({ surfaceType, surfaceId });
  }, []);

  const handleCheckRouteDrift = useCallback((routeId: string) => {
    checkRouteDrift(
      "route",
      routeId,
      (result) => {
        setDriftBadgeRefreshKey((k) => k + 1);
        const driftLabel = result.material_drift > 0 ? "material drift" : result.slight_drift > 0 ? "slight drift" : "aligned";
        toast.success(`Checked route · ${driftLabel}`, { duration: 4000 });
      },
      (err) => {
        toast.error(`Check failed — ${err}`, { duration: 5000 });
      },
    );
  }, [checkRouteDrift]);

  const handleAcceptRouteProposal = useCallback(async (
    proposalId: string,
    acceptedFields: string[],
    skippedFields: string[],
  ) => {
    if (!activeCompany?.id) return;
    if (!canApply) return; // governance.proposal.apply (route)
    const proposal = Array.from(routeProposalsMap.values()).find((p) => p.id === proposalId);
    if (!proposal?.surface_id) return;
    setAcceptLoadingProposalId(proposalId);
    try {
      const proposed = proposal.proposed_state as Record<string, unknown>;
      const patch: Record<string, unknown> = { source: `manual_${proposalId}` };
      for (const field of acceptedFields) { patch[field] = proposed[field]; }
      const { error: updateError } = await supabase
        .from("routes")
        .update(patch)
        .eq("id", proposal.surface_id)
        .eq("company_id", activeCompany.id);
      if (updateError) { return; }
      await captureBaseline(activeCompany.id, "route", proposal.surface_id);
      await supabase
        .from("surface_proposals")
        .update({
          status: "accepted",
          reviewed_at: new Date().toISOString(),
          raw_payload: { accepted_fields: acceptedFields, skipped_fields: skippedFields },
        })
        .eq("id", proposalId);
      setRouteProposalRefreshKey((k) => k + 1);
      await supabase.functions.invoke("evaluate-route-alignment", {
        body: { route_id: proposal.surface_id, company_id: activeCompany.id },
      });
    } finally {
      setAcceptLoadingProposalId(null);
    }
  }, [activeCompany?.id, canApply, routeProposalsMap]);

  const handleRejectRouteProposal = useCallback(async (proposalId: string) => {
    if (!activeCompany?.id) return;
    if (!canReject) return; // governance.proposal.reject (route)
    setRejectLoadingProposalId(proposalId);
    try {
      await supabase.from("surface_proposals").update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
      }).eq("id", proposalId);
      setRouteProposalRefreshKey((k) => k + 1);
    } finally {
      setRejectLoadingProposalId(null);
    }
  }, [activeCompany?.id, canReject]);

  const phase = floorEngagementPhase({
    phase: activeCompany?.engagement_phase ?? "outside_signals",
    hasNeedsWithScores: (needs ?? []).some((n) => n.importance > 0),
    hasSelectedRoute: !!activeCompany?.selected_route_id,
  });
  const hypothesisPh = isHypothesisPhase(phase);
  const phasePriority = phaseNarrativePriority(phase);

  const fix     = useMemo(() => routes.filter((r) => String(r.category).toLowerCase() === "fix"),     [routes]);
  const improve = useMemo(() => routes.filter((r) => String(r.category).toLowerCase() === "improve"), [routes]);
  const create  = useMemo(() => routes.filter((r) => String(r.category).toLowerCase() === "create"),  [routes]);

  const selectedRoute = useMemo(
    () => routes.find((r) => r.id === selectedRouteId) ?? null,
    [routes, selectedRouteId],
  );

  const latestExclusionAt = useMemo(
    () => computeLatestExclusionAt(activeCompany?.excluded_signals_json ?? []),
    [activeCompany?.excluded_signals_json],
  );

  // A5 route/leg hierarchy
  const hasHierarchy = useMemo(() => routes.some((r) => r.level === "route"), [routes]);
  const topLevelRoutes = useMemo(() => routes.filter((r) => r.level === "route"), [routes]);
  const legRoutes = useMemo(() => routes.filter((r) => r.level === "leg" || r.level === "action"), [routes]);
  const legsByParent = useMemo(() => {
    const map = new Map<string, RouteRow[]>();
    for (const leg of legRoutes) {
      if (!leg.parent_id) continue;
      const arr = map.get(leg.parent_id) ?? [];
      arr.push(leg);
      map.set(leg.parent_id, arr);
    }
    return map;
  }, [legRoutes]);
  const dominantClaimState = useMemo((): ClaimState | null => {
    if (!hasHierarchy || topLevelRoutes.length === 0) return null;
    // Prefer the lead (recommended) route's claim state for the header label.
    const recommended = selectRecommendedRoute(routes, null, null);
    const leadRoute = recommended ? topLevelRoutes.find((r) => r.id === recommended.id) : null;
    const leadState = leadRoute?.claim_id ? (claimsMap?.get(leadRoute.claim_id)?.state ?? null) as ClaimState | null : null;
    if (leadState) return leadState;
    const dominanceOrder: ClaimState[] = ["flow", "focus", "diagnose", "outside_view"];
    const states = topLevelRoutes
      .map((r) => r.claim_id ? ((claimsMap?.get(r.claim_id)?.state ?? null) as ClaimState | null) : null)
      .filter((s): s is ClaimState => s !== null);
    for (const s of dominanceOrder) {
      if (states.includes(s)) return s;
    }
    return states[0] ?? null;
  }, [hasHierarchy, topLevelRoutes, claimsMap, routes]);
  const ungroupedRoutes = useMemo(
    () => hasHierarchy ? routes.filter((r) => r.level == null && r.parent_id == null) : [],
    [hasHierarchy, routes],
  );
  const ungroupedFix     = useMemo(() => ungroupedRoutes.filter((r) => String(r.category).toLowerCase() === "fix"),     [ungroupedRoutes]);
  const ungroupedImprove = useMemo(() => ungroupedRoutes.filter((r) => String(r.category).toLowerCase() === "improve"), [ungroupedRoutes]);
  const ungroupedCreate  = useMemo(() => ungroupedRoutes.filter((r) => String(r.category).toLowerCase() === "create"),  [ungroupedRoutes]);

  const focusClaims = useMemo(
    () => Array.from(claimsMap.values()).filter((c) => c.state === "focus"),
    [claimsMap],
  );
  const flowClaims = useMemo(
    () => Array.from(claimsMap.values()).filter((c) => c.state === "flow"),
    [claimsMap],
  );
  const routeByClaimId = useMemo(() => {
    const map = new Map<string, RouteRow>();
    for (const r of routes) {
      if (r.claim_id) map.set(r.claim_id, r);
    }
    return map;
  }, [routes]);

  // Live-compute MojoScore from in-memory data (fallback when no DB row exists yet)
  const liveMojoScore = useMemo(() => {
    if (!hasHierarchy || !activeCompany?.id) return null;
    return computeMojoScore({
      companyId: activeCompany.id,
      claims: Array.from(claimsMap.values()).map((c) => ({
        id: c.id,
        state: c.state,
        claim_type: c.claim_type,
        topic: c.topic,
        outside_support_count: c.outside_support_count,
        organization_support_count: c.organization_support_count,
        customer_support_count: c.customer_support_count,
        updated_at: c.updated_at,
      })),
      routes: routes.map((r) => ({
        id: r.id,
        category: r.category,
        level: r.level ?? null,
        parent_id: r.parent_id ?? null,
        steps_json: (Array.isArray(r.steps_json) ? r.steps_json : null) as Array<{ id: string; title: string; status: string }> | null,
        evidence_json: (Array.isArray(r.evidence_json) ? r.evidence_json : null) as Array<{ id: string; title: string; status: string }> | null,
        why_this_matters_json: Array.isArray(r.why_this_matters_json) ? r.why_this_matters_json as string[] : null,
        rejected_alternatives: Array.isArray(r.rejected_alternatives) ? r.rejected_alternatives : null,
        what_would_have_to_be_true: Array.isArray(r.what_would_have_to_be_true) ? r.what_would_have_to_be_true : null,
        linked_need_ids: Array.isArray(r.linked_need_ids) ? r.linked_need_ids : null,
        updated_at: r.updated_at ?? null,
      })),
      needs: (needs ?? []).map((n) => ({
        id: n.id,
        desired_outcome: n.desired_outcome,
        importance: n.importance,
        satisfaction: n.satisfaction,
        opportunity_score: n.opportunity_score,
        service_state: n.service_state,
        updated_at: n.updated_at ?? null,
      })),
      computedAt: new Date().toISOString(),
    });
  }, [hasHierarchy, activeCompany?.id, claimsMap, routes, needs]);

  const displayMojoScore = liveMojoScore;
  const displayMojoHistory = mojoScoreHistory.length > 0 ? mojoScoreHistory : [];

  const isReroute = useMemo(() => {
    if (!selectedRoute) return false;
    const stale = latestExclusionAt ? isArtifactStale(selectedRoute, latestExclusionAt) : false;
    const ev = deriveClientEvidence(selectedRoute);
    return stale || deriveClientAssumptions(selectedRoute, ev).some((a) => a.critical && a.status === "unproven");
  }, [selectedRoute, latestExclusionAt]);

  async function handleSaveRouteField(routeOrLegId: string, field: "title" | "short_description", value: string) {
    if (!activeCompany?.id) return;
    try {
      await saveManualEdit("route", routeOrLegId, activeCompany.id, field, value);
    } catch (err) {
      console.error("[route-save] write failed (saveManualEdit/captureBaseline):", err);
      toast.error("Edit didn't save — please try again.", { duration: 5000 });
      return;
    }
    supabase.functions.invoke("evaluate-route-alignment", { body: { route_id: routeOrLegId, company_id: activeCompany.id } }).catch(() => {});
    onCommitSuccess?.();
  }

  function handleInspectRoute(route: RouteRow) {
    setInspectRoute(route);
    onRouteActivate?.(route.id);
  }

  async function handleSelectRoute(route: RouteRow) {
    onRouteActivate?.(route.id);
    if (selectedRouteId === route.id) { handleClearDecision(); return; }
    const eventType = selectedRouteId ? "changed" : "selected";
    const now = new Date().toISOString();
    setSelectedRouteId(route.id);
    setDecisionSavedAt(now);
    if (!activeCompany?.id) return;
    const why      = deriveClientWhyReasons(route);
    const evidence = deriveClientEvidence(route);
    const steps    = (Array.isArray(route.steps_json) ? route.steps_json : []) as Array<{ status: string }>;
    const summary  = { bullets: buildDecisionBullets({ whyThisMatters: why, evidence, steps }, null), route_title: route.title, route_category: route.category };
    await persistSelectedRouteDecision(activeCompany.id, route.id, summary, now);
    await insertRouteDecisionEvent(activeCompany.id, route.id, eventType, summary);
  }

  async function handleClearDecision() {
    const priorRouteId = selectedRouteId;
    const priorSummary = activeCompany?.selected_route_summary_json ?? {};
    setSelectedRouteId(null);
    setDecisionSavedAt(null);
    if (!activeCompany?.id) return;
    await clearSelectedRouteDecision(activeCompany.id);
    await insertRouteDecisionEvent(activeCompany.id, priorRouteId, "cleared", priorSummary);
  }

  function handleConfirmStart(route: RouteRow) {
    if (!activeCompany?.id) return;
    const steps = Array.isArray(route.steps_json) ? route.steps_json : [];
    const stepId = steps.find((s) => s.status !== "complete")?.id ?? steps[0]?.id ?? null;
    setActivePath(activeCompany.id, { routeId: route.id, stepId, startedAt: new Date().toISOString() });
    setConfirmRoute(null);
    navigate(CLIENT_REFINE_PREVIEW_PATH_ROUTE);
  }

  const relevantCategory = contextStep ? inferRelevantCategory(contextStep) : null;

  const recommended = useMemo(
    () => selectRecommendedRoute(routes, relevantCategory, contextStep ?? null),
    [routes, relevantCategory, contextStep]
  );
  const recommendedRouteId = recommended?.id ?? null;
  const recommendedReason = recommended ? impactReason(recommended.breakdown.expectedImpact) : null;

  const routeSeeds = useMemo(
    () =>
      routes.map((route) => {
        const evidence = deriveClientEvidence(route);
        const assumptions = deriveClientAssumptions(route, evidence);
        return { route, evidence, assumptions };
      }),
    [routes],
  );

  const routeRationales = useMemo(
    () =>
      buildRouteRationales({
        seeds: routeSeeds,
        hypotheses: strategicHypothesisRows,
        routeLinks: routeHypothesisDependencies,
        selectedRouteId,
        recommendedRouteId,
        phase,
      }),
    [phase, recommendedRouteId, routeHypothesisDependencies, routeSeeds, selectedRouteId, strategicHypothesisRows],
  );

  const routeRationaleMap = useMemo(
    () => new Map(routeRationales.map((rationale) => [rationale.routeId, rationale])),
    [routeRationales],
  );
  const editorialRoles = useMemo(
    () => buildRouteEditorialRoles({
      items: routes,
      rationales: routeRationaleMap,
      phase,
      recommendedRouteId,
    }),
    [phase, recommendedRouteId, routeRationaleMap, routes],
  );

  const isReady = !nextBestMove || nextBestMove.type === "start_route";

  const topNeed = useMemo(
    () => [...(needs ?? [])].sort((a, b) => (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0))[0] ?? null,
    [needs],
  );

  const leadRoute = useMemo(
    () =>
      selectedRoute ??
      routes.find((route) => route.id === recommendedRouteId) ??
      routeSeeds
        .map((seed) => seed.route)
        .find(Boolean) ??
      null,
    [recommendedRouteId, routeSeeds, routes, selectedRoute],
  );

  const leadRouteRationale = useMemo(
    () => (leadRoute ? routeRationaleMap.get(leadRoute.id) ?? null : null),
    [leadRoute, routeRationaleMap],
  );

  const whyLeading = useMemo(
    () => leadRouteRationale ? deriveWhyLeading(leadRouteRationale, routeRationales) : null,
    [leadRouteRationale, routeRationales],
  );

  const orientationRead = useMemo(
    () =>
      buildRouteOrientationRead({
        phase,
        leadRationale: leadRouteRationale,
        allRationales: routeRationales,
        hypothesisRows: strategicHypothesisRows,
        topNeedOutcome: topNeed?.desired_outcome ?? null,
      }),
    [phase, leadRouteRationale, routeRationales, strategicHypothesisRows, topNeed?.desired_outcome],
  );

  const commitmentLegitimacy = useMemo(
    () => deriveCommitmentLegitimacy(leadRouteRationale ?? null, !!selectedRoute, phase),
    [leadRouteRationale, selectedRoute, phase],
  );

  const dynamicPanelTitle = useMemo(() => {
    const base = phasePriority.routes.panelTitle;
    if (phase !== "flow" || !leadRouteRationale) return base;
    if (leadRouteRationale.movement === "weaken") return "How this commitment is destabilizing";
    if (leadRouteRationale.movement === "strengthen") return "How this commitment is strengthening";
    return base;
  }, [phase, phasePriority.routes.panelTitle, leadRouteRationale]);

  // Canonical inspect panel inputs — built from stored blobs only (no job-step or opportunity data in this view)
  const inspectDetail = useMemo<CanonicalRouteInspectDetail | null>(() => {
    if (!inspectRoute) return null;
    const evidence   = deriveClientEvidence(inspectRoute);
    const why        = Array.isArray(inspectRoute.why_this_matters_json)
      ? inspectRoute.why_this_matters_json.map(String).filter(Boolean)
      : [inspectRoute.short_description || "This route addresses a meaningful strategic gap."];
    return {
      steps:           (Array.isArray(inspectRoute.steps_json) ? inspectRoute.steps_json : []) as CanonicalRouteInspectDetail["steps"],
      evidence:        evidence as CanonicalRouteInspectDetail["evidence"],
      whyThisMatters:  why,
      frameworks:      Array.isArray(inspectRoute.frameworks_used) ? inspectRoute.frameworks_used.filter(Boolean) : [],
      rankedOpps:      [],
    };
  }, [inspectRoute]);

  const inspectRationale = useMemo(
    () => inspectRoute ? (routeRationaleMap.get(inspectRoute.id) ?? null) : null,
    [inspectRoute, routeRationaleMap],
  );

  return (
    <div
      className={hasHierarchy ? undefined : "crpv-ws-section crpv-ws-section-wide"}
      style={hasHierarchy ? { margin: -36, padding: "40px 48px 80px", background: "#ffffff" } : undefined}
      data-tone={phasePriority.orientation.tone}
    >
      {/* ── Hierarchy page header: eyebrow + hero + score strip + keystone ── */}
      {hasHierarchy && (() => {
        const framing = HIERARCHY_FRAMING[dominantClaimState ?? "diagnose"] ?? HIERARCHY_FRAMING.diagnose;
        if (!displayMojoScore) {
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 32 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: R.signal, display: "inline-block" }} />
              <span style={{ fontFamily: R.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.16em", color: "rgba(17,17,17,0.4)" }}>
                Strategy · Route Plan
              </span>
            </div>
          );
        }
        const reachable  = computeReachableScore(displayMojoScore);
        const unlockable = computeUnlockableScore(reachable, displayMojoScore);
        const current    = Math.round(displayMojoScore.total_score);
        const scoreLift  = Math.round(reachable) - current;
        const leadRoute = recommendedRouteId ? topLevelRoutes.find((r) => r.id === recommendedRouteId) ?? topLevelRoutes[0] : topLevelRoutes[0];
        const keystoneAction =
          nextBestMove?.title ??
          (leadRoute?.title ? `Validate "${leadRoute.title}" with direct customer evidence` : "Validate the leading direction with direct customer evidence.");
        return (
          <>
            <HierarchyPageHeader
              framing={framing}
              current={current}
              reachable={reachable}
              unlockable={unlockable}
              dominantState={dominantClaimState}
            />
            <div style={{ marginBottom: 12, marginTop: -16 }}>
              <SurfaceEducationTrigger
                surfaceKey="routes"
                isAdmin={isAdmin}
                panelTitle="About Routes"
                slotData={{ route_count: topLevelRoutes.length }}
              />
            </div>
            {scoreLift > 0 && (
              <KeystoneStripe action={keystoneAction} scoreLift={scoreLift} />
            )}
            {routesSignalLandscape && (
              <SignalBasisChip
                publicCount={routesSignalLandscape.byBand.outside.count}
                teamCount={routesSignalLandscape.byBand.organization.count}
                customerCount={routesSignalLandscape.byBand.customer.count}
              />
            )}
          </>
        );
      })()}

      {/* ── Orientation Layer ──────────────────────────────────────────── */}
      {!hasHierarchy && <section
        className="crpv-r-orientation"
        data-tone={phasePriority.orientation.tone}
        aria-label="Current strategic read"
      >
        <div className="crpv-r-orientation-header">
          <p className="crpv-r-orientation-cap">Current Strategic Read</p>
          <p className="crpv-r-orientation-question">{phasePriority.orientation.question}</p>
        </div>

        <div className="crpv-r-orientation-body">
          <div className="crpv-r-orientation-item" data-primary="true">
            <p className="crpv-r-orientation-label">What currently appears true</p>
            <p className="crpv-r-orientation-value">{orientationRead.whatAppearsTrue}</p>
          </div>

          {commitmentLegitimacy && (
            <div className="crpv-r-orientation-item">
              <p className="crpv-r-orientation-label">Why the organization is comfortable acting here</p>
              <p className="crpv-r-orientation-value">{commitmentLegitimacy}</p>
            </div>
          )}

          {orientationRead.strongestSignal && (
            <div className="crpv-r-orientation-item">
              <p className="crpv-r-orientation-label">Strongest signal</p>
              <p className="crpv-r-orientation-value">{orientationRead.strongestSignal}</p>
            </div>
          )}

          <div className="crpv-r-orientation-item">
            <p className="crpv-r-orientation-label">What remains unresolved</p>
            <p className="crpv-r-orientation-value">{orientationRead.whatRemains}</p>
          </div>

          {orientationRead.validating && (
            <div className="crpv-r-orientation-item">
              <p className="crpv-r-orientation-label">What we're still working to prove</p>
              <p className="crpv-r-orientation-value">{orientationRead.validating}</p>
            </div>
          )}

          <div className="crpv-r-orientation-item" data-ambient="true">
            <p className="crpv-r-orientation-label">What could change this</p>
            <p className="crpv-r-orientation-value">{orientationRead.whatCouldChange}</p>
          </div>
        </div>
      </section>}

      {/* ── Focal action (secondary to orientation) ────────────────────── */}
      {!hasHierarchy && nextBestMove && (
        <div style={{ marginBottom: 32, paddingTop: 4 }}>
          <p style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.1em", color: "#999", textTransform: "uppercase", margin: "0 0 6px" }}>
            {hypothesisPh ? "Most in focus" : phasePriority.phase === "flow" ? "What is shifting now" : phasePriority.orientation.tone === "exploratory" ? "Examine next" : "Do this next"}
          </p>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#222", margin: "0 0 4px", lineHeight: 1.35 }}>
            {nextBestMove.title}
          </p>
          <p style={{ fontSize: 12, color: "#777", margin: 0, lineHeight: 1.5 }}>
            {nextBestMove.reason}
          </p>
        </div>
      )}

      {/* ── Route context — only for non-hierarchy clients ─────────────────── */}
      {!hasHierarchy && (
        <>
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.1em", color: "#999", textTransform: "uppercase", margin: "0 0 4px" }}>
              {phasePriority.routes.introLabel}
            </p>
            <p style={{ fontSize: 12, color: "#888", margin: 0, lineHeight: 1.5 }}>
              {phasePriority.routes.introCopy}
            </p>
          </div>

          {contextStep && (
            <div style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.1em", color: "#888", textTransform: "uppercase", margin: "0 0 4px", fontWeight: 600 }}>
                Focusing on
              </p>
              <p style={{ fontSize: 13, fontWeight: 500, color: "#222", margin: "0 0 4px" }}>
                {contextStep.step_number != null ? `Step ${contextStep.step_number} — ` : ""}{contextStep.step_label ?? "Selected step"}
              </p>
              <p style={{ fontSize: 12, color: "#888", margin: 0 }}>
                These routes help address gaps in this step.
              </p>
            </div>
          )}
        </>
      )}

      {(activeCompany?.excluded_signals_json?.length ?? 0) > 0 && (
        <div style={{ border: "1px solid #FAC846", borderRadius: 6, padding: "10px 16px", marginBottom: 16, background: "#fef9ec" }}>
          <p style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.08em", color: "#FAC846", textTransform: "uppercase", fontWeight: 600, margin: 0, lineHeight: 1.5 }}>
            Some outside signals were excluded. You may want to review these recommendations.
          </p>
        </div>
      )}

      {!hasHierarchy && leadRoute && leadRouteRationale ? (
        <div style={{ marginBottom: 24 }}>
          <RouteWhyRisingPanel
            route={leadRoute}
            rationale={leadRouteRationale}
            title={dynamicPanelTitle}
            safeNowLabel={phasePriority.routes.safeNowLabel}
            whyLeading={whyLeading ?? undefined}
            phase={phase}
          />
        </div>
      ) : null}

      {/* ── Claims: Ready to commit (focus state) ── */}
      {focusClaims.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontFamily: R.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: R.inkFaint, margin: "0 0 10px" }}>
            Ready to Commit
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {focusClaims.map((claim) => (
              <div
                key={claim.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 14px",
                  border: `1px solid ${R.hairline}`,
                  borderRadius: 6,
                  background: "#fff",
                }}
              >
                <p style={{ fontFamily: R.sans, fontSize: 13, color: R.ink, margin: 0, lineHeight: 1.4, flex: 1, minWidth: 0 }}>
                  {claim.statement ?? claim.topic ?? "—"}
                </p>
                <button
                  type="button"
                  onClick={() => setFlowCommitClaim({ id: claim.id, statement: claim.statement ?? claim.topic ?? "" })}
                  style={{
                    flexShrink: 0,
                    fontFamily: R.mono,
                    fontSize: 9,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "#3A6B28",
                    background: "none",
                    border: "1px solid #3A6B28",
                    borderRadius: 4,
                    padding: "4px 10px",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Commit →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Claims: In flow (committed) ── */}
      {flowClaims.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontFamily: R.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: R.inkFaint, margin: "0 0 10px" }}>
            In Flow
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {flowClaims.map((claim) => {
              const linkedRoute = routeByClaimId.get(claim.id);
              return (
                <div
                  key={claim.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "10px 14px",
                    border: `1px solid ${R.hairline}`,
                    borderRadius: 6,
                    background: "#fff",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: R.sans, fontSize: 13, color: R.ink, margin: 0, lineHeight: 1.4 }}>
                      {claim.statement ?? claim.topic ?? "—"}
                    </p>
                    {linkedRoute && (
                      <p style={{ fontFamily: R.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: R.inkFaint, margin: "4px 0 0" }}>
                        Route · {linkedRoute.title}
                      </p>
                    )}
                  </div>
                  <ClaimStateBadge state={claim.state} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div className="crpv-ws-placeholder cap">Loading routes…</div>
      ) : (
        <>
          {!isReady && !hasHierarchy && (
            <p style={{ fontSize: 11, color: "#999", margin: "0 0 14px", fontStyle: "italic" }}>
              {phasePriority.routes.unreadyNote}
            </p>
          )}
          {hasHierarchy ? (
            <>
              {desiredOutcome && <DesiredOutcomeBanner outcome={desiredOutcome} />}
              <div>
                {topLevelRoutes.map((tlRoute, idx) => (
                  <HierarchyRouteSection
                    key={tlRoute.id}
                    route={tlRoute}
                    legs={legsByParent.get(tlRoute.id) ?? []}
                    index={idx + 1}
                    isLead={tlRoute.id === recommendedRouteId}
                    claimsMap={claimsMap}
                    rationales={routeRationaleMap}
                    selectedRouteId={selectedRoute?.id}
                    defaultExpanded={idx === 0}
                    recommendedRouteId={recommendedRouteId}
                    onSaveField={handleSaveRouteField}
                    phase={phase}
                    onDriftClick={handleDriftClick}
                    driftRefreshKey={driftBadgeRefreshKey}
                    onCheckDrift={handleCheckRouteDrift}
                    checkingSurfaceId={checkingSurfaceId}
                  />
                ))}
              </div>
              {ungroupedRoutes.length > 0 && (
                <div className="crpv-r-columns" style={{ marginTop: 24 }}>
                  <RoutesColumn category="fix"     items={ungroupedFix}     rationales={routeRationaleMap} onInspect={handleInspectRoute} selectedRouteId={selectedRoute?.id} onSelect={handleSelectRoute} hoveredRouteId={hoveredRouteId} onHover={setHoveredRouteId} isContextMatch={relevantCategory === "fix"}     isContextDim={relevantCategory !== null && relevantCategory !== "fix"}     recommendedRouteId={recommendedRouteId} recommendedReason={recommendedReason} onStartRoute={!hypothesisPh && isReady ? setConfirmRoute : undefined} isDeemphasized={!isReady} isReady={isReady} hypothesisPhase={hypothesisPh} phase={phase} editorialRoles={editorialRoles} claimsMap={claimsMap} onReEvaluate={handleReEvaluate} reEvalLoadingId={reEvalLoading} proposalsMap={routeProposalsMap} onGenerateProposal={handleGenerateRouteProposal} canGenerate={canGenRoute} generateLoadingId={generateLoadingRouteId} onAcceptProposal={handleAcceptRouteProposal} onRejectProposal={handleRejectRouteProposal} canApply={canApply} canReject={canReject} acceptLoadingProposalId={acceptLoadingProposalId} rejectLoadingProposalId={rejectLoadingProposalId} driftRefreshKey={driftBadgeRefreshKey} onCheckDrift={handleCheckRouteDrift} checkingSurfaceId={checkingSurfaceId} />
                  <RoutesColumn category="improve" items={ungroupedImprove} rationales={routeRationaleMap} onInspect={handleInspectRoute} selectedRouteId={selectedRoute?.id} onSelect={handleSelectRoute} hoveredRouteId={hoveredRouteId} onHover={setHoveredRouteId} isContextMatch={relevantCategory === "improve"} isContextDim={relevantCategory !== null && relevantCategory !== "improve"} recommendedRouteId={recommendedRouteId} recommendedReason={recommendedReason} onStartRoute={!hypothesisPh && isReady ? setConfirmRoute : undefined} isDeemphasized={!isReady} isReady={isReady} hypothesisPhase={hypothesisPh} phase={phase} editorialRoles={editorialRoles} claimsMap={claimsMap} onReEvaluate={handleReEvaluate} reEvalLoadingId={reEvalLoading} proposalsMap={routeProposalsMap} onGenerateProposal={handleGenerateRouteProposal} canGenerate={canGenRoute} generateLoadingId={generateLoadingRouteId} onAcceptProposal={handleAcceptRouteProposal} onRejectProposal={handleRejectRouteProposal} canApply={canApply} canReject={canReject} acceptLoadingProposalId={acceptLoadingProposalId} rejectLoadingProposalId={rejectLoadingProposalId} driftRefreshKey={driftBadgeRefreshKey} onCheckDrift={handleCheckRouteDrift} checkingSurfaceId={checkingSurfaceId} />
                  <RoutesColumn category="create"  items={ungroupedCreate}  rationales={routeRationaleMap} onInspect={handleInspectRoute} selectedRouteId={selectedRoute?.id} onSelect={handleSelectRoute} hoveredRouteId={hoveredRouteId} onHover={setHoveredRouteId} isContextMatch={relevantCategory === "create"}  isContextDim={relevantCategory !== null && relevantCategory !== "create"}  recommendedRouteId={recommendedRouteId} recommendedReason={recommendedReason} onStartRoute={!hypothesisPh && isReady ? setConfirmRoute : undefined} isDeemphasized={!isReady} isReady={isReady} hypothesisPhase={hypothesisPh} phase={phase} editorialRoles={editorialRoles} claimsMap={claimsMap} onReEvaluate={handleReEvaluate} reEvalLoadingId={reEvalLoading} proposalsMap={routeProposalsMap} onGenerateProposal={handleGenerateRouteProposal} canGenerate={canGenRoute} generateLoadingId={generateLoadingRouteId} onAcceptProposal={handleAcceptRouteProposal} onRejectProposal={handleRejectRouteProposal} canApply={canApply} canReject={canReject} acceptLoadingProposalId={acceptLoadingProposalId} rejectLoadingProposalId={rejectLoadingProposalId} driftRefreshKey={driftBadgeRefreshKey} onCheckDrift={handleCheckRouteDrift} checkingSurfaceId={checkingSurfaceId} />
                </div>
              )}
            </>
          ) : (
            <div className="crpv-r-columns">
              <RoutesColumn category="fix"     items={fix}     rationales={routeRationaleMap} onInspect={handleInspectRoute} selectedRouteId={selectedRoute?.id} onSelect={handleSelectRoute} hoveredRouteId={hoveredRouteId} onHover={setHoveredRouteId} isContextMatch={relevantCategory === "fix"}     isContextDim={relevantCategory !== null && relevantCategory !== "fix"}     recommendedRouteId={recommendedRouteId} recommendedReason={recommendedReason} onStartRoute={!hypothesisPh && isReady ? setConfirmRoute : undefined} isDeemphasized={!isReady} isReady={isReady} hypothesisPhase={hypothesisPh} phase={phase} subtitleOverride={hypothesisPh ? phasePriority.routes.hypothesisSubtitleOverride : undefined} recommendedLabel={phasePriority.routes.recommendedLabel} recommendedReasonPrefix={phasePriority.routes.recommendedReasonPrefix} editorialRoles={editorialRoles} claimsMap={claimsMap} onReEvaluate={handleReEvaluate} reEvalLoadingId={reEvalLoading} proposalsMap={routeProposalsMap} onGenerateProposal={handleGenerateRouteProposal} canGenerate={canGenRoute} generateLoadingId={generateLoadingRouteId} onAcceptProposal={handleAcceptRouteProposal} onRejectProposal={handleRejectRouteProposal} canApply={canApply} canReject={canReject} acceptLoadingProposalId={acceptLoadingProposalId} rejectLoadingProposalId={rejectLoadingProposalId} driftRefreshKey={driftBadgeRefreshKey} onCheckDrift={handleCheckRouteDrift} checkingSurfaceId={checkingSurfaceId} />
              <RoutesColumn category="improve" items={improve} rationales={routeRationaleMap} onInspect={handleInspectRoute} selectedRouteId={selectedRoute?.id} onSelect={handleSelectRoute} hoveredRouteId={hoveredRouteId} onHover={setHoveredRouteId} isContextMatch={relevantCategory === "improve"} isContextDim={relevantCategory !== null && relevantCategory !== "improve"} recommendedRouteId={recommendedRouteId} recommendedReason={recommendedReason} onStartRoute={!hypothesisPh && isReady ? setConfirmRoute : undefined} isDeemphasized={!isReady} isReady={isReady} hypothesisPhase={hypothesisPh} phase={phase} subtitleOverride={hypothesisPh ? phasePriority.routes.hypothesisSubtitleOverride : undefined} recommendedLabel={phasePriority.routes.recommendedLabel} recommendedReasonPrefix={phasePriority.routes.recommendedReasonPrefix} editorialRoles={editorialRoles} claimsMap={claimsMap} onReEvaluate={handleReEvaluate} reEvalLoadingId={reEvalLoading} proposalsMap={routeProposalsMap} onGenerateProposal={handleGenerateRouteProposal} canGenerate={canGenRoute} generateLoadingId={generateLoadingRouteId} onAcceptProposal={handleAcceptRouteProposal} onRejectProposal={handleRejectRouteProposal} canApply={canApply} canReject={canReject} acceptLoadingProposalId={acceptLoadingProposalId} rejectLoadingProposalId={rejectLoadingProposalId} driftRefreshKey={driftBadgeRefreshKey} onCheckDrift={handleCheckRouteDrift} checkingSurfaceId={checkingSurfaceId} />
              <RoutesColumn category="create"  items={create}  rationales={routeRationaleMap} onInspect={handleInspectRoute} selectedRouteId={selectedRoute?.id} onSelect={handleSelectRoute} hoveredRouteId={hoveredRouteId} onHover={setHoveredRouteId} isContextMatch={relevantCategory === "create"}  isContextDim={relevantCategory !== null && relevantCategory !== "create"}  recommendedRouteId={recommendedRouteId} recommendedReason={recommendedReason} onStartRoute={!hypothesisPh && isReady ? setConfirmRoute : undefined} isDeemphasized={!isReady} isReady={isReady} hypothesisPhase={hypothesisPh} phase={phase} subtitleOverride={hypothesisPh ? phasePriority.routes.hypothesisSubtitleOverride : undefined} recommendedLabel={phasePriority.routes.recommendedLabel} recommendedReasonPrefix={phasePriority.routes.recommendedReasonPrefix} editorialRoles={editorialRoles} claimsMap={claimsMap} onReEvaluate={handleReEvaluate} reEvalLoadingId={reEvalLoading} proposalsMap={routeProposalsMap} onGenerateProposal={handleGenerateRouteProposal} canGenerate={canGenRoute} generateLoadingId={generateLoadingRouteId} onAcceptProposal={handleAcceptRouteProposal} onRejectProposal={handleRejectRouteProposal} canApply={canApply} canReject={canReject} acceptLoadingProposalId={acceptLoadingProposalId} rejectLoadingProposalId={rejectLoadingProposalId} driftRefreshKey={driftBadgeRefreshKey} onCheckDrift={handleCheckRouteDrift} checkingSurfaceId={checkingSurfaceId} />
            </div>
          )}
        </>
      )}

      {selectedRoute && (
        <ClientDecisionBanner route={selectedRoute} savedAt={decisionSavedAt} onClear={handleClearDecision} isHypothesis={!isReady} />
      )}

      {isReroute && (
        <div style={{ border: "1px solid #FAC846", borderRadius: 6, padding: "10px 16px", marginTop: 4, background: "#fef9ec" }}>
          <p style={{ fontSize: 12, color: "#888", margin: "0 0 2px", fontWeight: 500 }}>⚠ This path may need to be reconsidered.</p>
          <p style={{ fontSize: 11, color: "#999", margin: 0, lineHeight: 1.5 }}>Review alternative paths or confirm the open conditions.</p>
        </div>
      )}

      {confirmRoute && (
        <>
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.28)", zIndex: 40 }}
            onClick={() => setConfirmRoute(null)}
          />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", background: "#fff", borderRadius: 8, padding: "28px 32px", zIndex: 41, minWidth: 320, maxWidth: 420, boxShadow: "0 4px 32px rgba(0,0,0,0.16)" }}>
            <p style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.1em", color: "#999", textTransform: "uppercase", margin: "0 0 10px" }}>
              Start this route
            </p>
            <p style={{ fontSize: 16, fontWeight: 600, color: "#111", margin: "0 0 8px", lineHeight: 1.3 }}>
              {confirmRoute.title}
            </p>
            <p style={{ fontSize: 13, color: "#888", margin: "0 0 24px", lineHeight: 1.5 }}>
              This will become your current path.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => handleConfirmStart(confirmRoute)}
                style={{ background: "#111", color: "#fff", border: "none", borderRadius: 4, padding: "8px 18px", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
              >
                Start route
              </button>
              <button
                type="button"
                onClick={() => setConfirmRoute(null)}
                style={{ background: "none", color: "#888", border: "1px solid #ddd", borderRadius: 4, padding: "8px 16px", fontSize: 13, cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {!hasHierarchy && (
        <CanonicalRouteInspectPanel
          open={!!inspectRoute}
          onClose={() => setInspectRoute(null)}
          route={inspectRoute}
          detail={inspectDetail}
          rationale={inspectRationale}
          areaScoresJson={activeCompany?.area_scores_json}
          linkedDesiredOutcome={null}
          currentPhase={phase}
          staleNote={
            inspectRoute && latestExclusionAt && isArtifactStale(inspectRoute, latestExclusionAt)
              ? "Needs review after excluded inputs"
              : null
          }
        />
      )}
      {driftPanel && (
        <DriftDetailPanel
          open
          onClose={() => setDriftPanel(null)}
          surfaceType={driftPanel.surfaceType}
          surfaceId={driftPanel.surfaceId}
          refreshKey={driftBadgeRefreshKey}
          onRefresh={() => setDriftBadgeRefreshKey((k) => k + 1)}
          onProposeChanges={() => handleGenerateRouteProposal(driftPanel.surfaceId)}
          proposeChangesLabel="Propose route changes from current evidence"
        />
      )}

      {flowCommitClaim && activeCompany?.id && (
        <FlowCommitSheet
          open={!!flowCommitClaim}
          onOpenChange={(o) => { if (!o) setFlowCommitClaim(null); }}
          claimId={flowCommitClaim.id}
          claimStatement={flowCommitClaim.statement}
          companyId={activeCompany.id}
          onSuccess={() => {
            setFlowCommitClaim(null);
            setClaimsRefreshKey((k) => k + 1);
            onCommitSuccess?.();
          }}
        />
      )}
    </div>
  );
}
