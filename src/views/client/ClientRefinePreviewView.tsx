import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCapability } from "@/hooks/useCapability";
import { useCompany } from "@/hooks/useCompany";
import { useClientViewData } from "@/hooks/useClientViewData";
import { useFileProposals } from "@/hooks/useFileProposals";
import { usePublicBaseline } from "@/hooks/usePublicBaseline";
import { useStrategicAssumptions } from "@/hooks/useStrategicAssumptions";
import RefinePreviewHypothesesSection from "@/components/client/RefinePreviewHypothesesSection";
import RefinePreviewWhatChangedSection from "@/components/client/RefinePreviewWhatChangedSection";
import StrategicSignalsSection from "@/components/client/StrategicSignalsSection";
import RefinePreviewConfidenceLandscapeSection from "@/components/client/RefinePreviewConfidenceLandscapeSection";
import RefinePreviewReconciliationSection from "@/components/client/RefinePreviewReconciliationSection";
import { useRouteHypothesisDependencies, useStrategicHypotheses } from "@/hooks/useStrategicHypotheses";
import { useStrategicChangeSummary } from "@/hooks/useStrategicChangeSummary";
import { getRefinePreviewActiveHypotheses } from "@/components/client/RefinePreviewHypothesesSection";
import { selectBestProposal, normalizeToDiagnostic } from "@/lib/mojoMapDiagnostic";
import { stageLabel } from "@/lib/phaseDisplay";
import type { MojoMapDiagnostic } from "@/lib/mojoMapDiagnostic";
import { CLIENT_REFINE_PREVIEW_ROUTES_ROUTE, CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE, CLIENT_REFINE_PREVIEW_COMPANY_ROUTE, CLIENT_REFINE_PREVIEW_INBOX_ROUTE, CLIENT_REFINE_PREVIEW_MEMBERS_ROUTE } from "@/lib/clientRefinePreview";
import { useDriftInboxCount } from "@/hooks/useDriftInbox";
import { useDriftScan } from "@/hooks/useDriftScan";
import { formatDistanceToNow } from "date-fns";
import { inferIdentityNarrative } from "@/lib/identityNarrative";
import { deriveClientAssumptions, deriveClientEvidence } from "@/lib/routeClientNarrative";
import { buildRouteRationales } from "@/lib/routeRationale";
import { buildRefinePreviewConfidenceLandscape } from "@/lib/refinePreviewConfidenceLandscape";
import { buildReconciliationNarrative } from "@/lib/reconciliationNarrative";
import { floorEngagementPhase, phaseConfidenceEmphasis, phaseNarrativePriority, phaseSectionVisibility, sortRoutesForPhase } from "@/lib/refinePreviewPhaseOrchestration";
import { selectRecommendedRoute } from "@/lib/routeScoring";
import { inferStrategicCenter } from "@/lib/strategicCenter";
import { buildStrategicCenterSurface } from "@/lib/strategicCenterSurface";
import { buildCustomerRealityNarrative } from "@/lib/customerRealityNarrative";
import { buildPositioningLensNarrative } from "@/lib/positioningLensNarrative";
import { buildDecisionPortfolio } from "@/lib/decisionSystem";
import { buildStrategicSignals } from "@/lib/strategicSignals";
import { buildNarrativeConductor } from "@/lib/narrativeConductor";
import { deriveTemporalPosture } from "@/lib/strategicTemporalState";
import { deriveRegister } from "@/lib/executiveRegister";
import { assessConfidenceDiscipline, hasCustomerBehavioralProofFromPosture } from "@/lib/confidenceDiscipline";
import { buildAttentionContext, ATTENTION_POSTURE_LABELS, SIGNAL_QUOTAS } from "@/lib/strategicAttention";
import { buildDecayContext } from "@/lib/strategicDecay";
import { deriveDefaultMode, MODE_CONTENT, type OperatingMode } from "@/lib/operatingMode";
import { buildCadenceFrame } from "@/lib/executiveCadence";
import { auditSemanticIntegrity } from "@/lib/semanticIntegrity";
import { deriveSemanticEnforcement } from "@/lib/semanticIntegrityEnforcement";
import { OperatingModeBar } from "@/components/client/OperatingModeBar";
import { disciplinedPostureLabel } from "@/lib/strategicCenterSurface";
import { useOdiNeeds, type OdiMarketDefinitionRow } from "@/hooks/useOdiNeeds";
import { usePositioningCanvas } from "@/hooks/usePositioningCanvas";
import { useStrategyCascade } from "@/hooks/useStrategyCascade";
import { useRoutes } from "@/views/Routes/useRoutes";
import { deriveRouteValidationTitle } from "@/lib/nextBestMove";
import { deriveStrategicTensions, tensionsForContext } from "@/lib/tensionDerivation";
import type { StrategicTension } from "@/lib/tensionTypes";
import { buildStrategicOrientation } from "@/lib/strategicOrientation";
import { SupportingLensesSection } from "@/components/client/StrategicOrientationLayer";
import { useStrategicMovement } from "@/hooks/useStrategicMovement";
import { deriveAssumptionEvolution, buildAssumptionMovementLine } from "@/lib/assumptionEvolution";
import { displayConfidenceLabel } from "@/lib/strategicLanguage";
import "@/styles/client-refine-preview.css";
import { useCompanyClaims } from "@/lib/claims/useCompanyClaims";
import { useChosenSetKey } from "@/lib/chosenJobStepSet";
import { useMojoScore } from "@/hooks/useMojoScore";
import { computeMojoScore } from "@/lib/mojoScore/computeMojoScore";
import { computeReachableScore, computeUnlockableScore } from "@/lib/mojoScore/projections";
import MojoScoreSurface from "@/components/score/MojoScoreStrip";
import type { MojoScoreResult } from "@/lib/mojoScore/types";
import type { ClaimState } from "@/lib/claimState";

import { useSignalLandscape } from "@/hooks/useSignalLandscape";
import { useDirectionEvidence } from "@/hooks/useDirectionEvidence";
import { useInsightNextTurn } from "@/hooks/useInsightNextTurn";
import { useFoundationStatus } from "@/hooks/useFoundationStatus";
import { HomepageHierarchy } from "@/components/client/HomepageHierarchy";
import { WorkshopSidebar } from "@/components/client/WorkshopSidebar";

type LayerState = "command" | "map" | "narrative" | "drawer";
type CommitState = "idle" | "committing" | "committed" | "next-revealed" | "waiting";
type DrawerKey = "why" | "blocking" | "signals" | "progress";
type RouteCategory = "Fix" | "Improve" | "Create";
type TweakTab = "evidence" | "claims" | "foundation" | "assumptions" | "rerun" | "access";

type AccessModes = {
  pills: boolean;
  inline: boolean;
  edge: boolean;
  footer: boolean;
};

type DrawerRow = {
  key: string;
  value: string;
};

type DrawerSection = {
  title: string;
  headline: string;
  big?: string;
  rows: DrawerRow[];
  compact?: boolean;
};

const MODE_STORAGE_KEY = "phase5-modes";

const DEFAULT_ACCESS_MODES: AccessModes = {
  pills: true,
  inline: true,
  edge: true,
  footer: false,
};

const EDGE_DRAWERS: Array<{ key: DrawerKey; label: string }> = [
  { key: "why", label: "Why" },
  { key: "blocking", label: "Blocking" },
  { key: "signals", label: "Signals" },
  { key: "progress", label: "Progress" },
];


const ROUTE_ORDER: RouteCategory[] = ["Fix", "Improve", "Create"];

const ROUTE_DISPLAY_LABEL: Record<RouteCategory, string> = {
  Fix:     "Under Pressure",
  Improve: "Under Validation",
  Create:  "Directional",
};

const ROUTE_FALLBACK_HEADLINE: Record<RouteCategory, string> = {
  Fix:     "Strongest friction signal — resolution most urgent.",
  Improve: "Evidence suggests pressure in this area — validation needed.",
  Create:  "New direction — no existing path covers this signal.",
};

const MAP_ROUTE_CURVES: Record<RouteCategory, string> = {
  Fix: "M 880 300 C 960 300, 1050 288, 1140 264 S 1300 220, 1378 186",
  Improve: "M 880 300 C 962 270, 1048 226, 1138 192 S 1294 142, 1378 118",
  Create: "M 880 300 C 955 336, 1044 382, 1136 424 S 1298 498, 1378 540",
};

const MAP_ROUTE_BADGES: Record<RouteCategory, { x: number; y: number }> = {
  Fix: { x: 1146, y: 258 },
  Improve: { x: 1146, y: 176 },
  Create: { x: 1146, y: 410 },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toSentence(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function lowerFirst(value: string | null | undefined) {
  const text = toSentence(value);
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : "";
}

function stripTerminalPunctuation(value: string | null | undefined) {
  return toSentence(value).replace(/[.?!]+$/g, "");
}

function formatHHmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function buildCenterHeroSupport(args: {
  publicIdentity: string | null;
}) {
  // Only surface public identity context here. Customer proof status is already
  // addressed in the center headline (strategy_outrunning_proof / customer_validation_converging)
  // — emitting it here creates within-hero duplication or contradiction.
  if (args.publicIdentity) {
    return `Outside perception reads as ${lowerFirst(args.publicIdentity)}.`;
  }
  return null;
}

function shorten(value: string, max = 72) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

// Extracts the actor noun phrase from a job_executor string for use in conversational templates.
// "Independent cafe operators sourcing a specialty coffee offering." → "independent cafe operators"
// Falls back to null if the result would be too long (>40 chars) to fit a template slot cleanly.
function deriveAudienceShort(jobExecutor: string | null | undefined): string | null {
  if (!jobExecutor) return null;
  const text = jobExecutor.replace(/\.$/, "").trim();
  // Truncate before the first gerund or prepositional phrase that extends the NP
  const match = text.match(/^(.+?)\s+(?:sourcing|seeking|looking|providing|selling|serving|for\s|who\s|that\s|to\s)/i);
  const noun = match ? match[1].trim() : text;
  const lower = noun.charAt(0).toLowerCase() + noun.slice(1);
  return lower.length <= 40 ? lower : null;
}

function normalizeCompare(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueSentences(values: Array<string | null | undefined>, limit = 4) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const item = toSentence(value);
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
    if (output.length >= limit) break;
  }
  return output;
}

function hypothesisSourceMixSummary(row: {
  supportingClaims: Array<{
    supportShape: { outside: number; organization: number; customer: number };
  }>;
}) {
  const sourceMix = row.supportingClaims.reduce(
    (acc, claim) => {
      acc.outside += claim.supportShape.outside;
      acc.organization += claim.supportShape.organization;
      acc.customer += claim.supportShape.customer;
      return acc;
    },
    { outside: 0, organization: 0, customer: 0 },
  );

  const hasOutside = sourceMix.outside > 0;
  const hasOrganization = sourceMix.organization > 0;
  const hasCustomer = sourceMix.customer > 0;

  if (hasCustomer) {
    return "Customer evidence is starting to support this, but the pattern still needs more confirmation.";
  }
  if (hasOutside && hasOrganization) {
    return "Public and internal evidence point in this direction, but customer proof is still missing.";
  }
  if (hasOutside) {
    return "This is showing up in public signals, but we have not confirmed this with the team or customers yet.";
  }
  if (hasOrganization) {
    return "This is surfacing in internal evidence, but we have not confirmed this with customers yet.";
  }
  return "This is an early read from the evidence we have so far.";
}

function parseAccessModes(raw: string | null): AccessModes {
  if (!raw) return DEFAULT_ACCESS_MODES;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      pills: Boolean(parsed["mode-pills"]),
      inline: Boolean(parsed["mode-inline"]),
      edge: Boolean(parsed["mode-edge"]),
      footer: Boolean(parsed["mode-footer"]),
    };
  } catch {
    return DEFAULT_ACCESS_MODES;
  }
}

function confidenceBase(level: "Low" | "Medium" | "High") {
  if (level === "High") return 68;
  if (level === "Medium") return 52;
  return 38;
}

function statusLabel(value: string) {
  if (value === "in_progress") return "In progress";
  if (value === "planned") return "Planned";
  if (value === "parked") return "Parked";
  if (value === "done") return "Done";
  return "Planned";
}

function stateLabel(layer: LayerState) {
  if (layer === "map") return "Map";
  if (layer === "narrative") return "Narrative";
  if (layer === "drawer") return "Context drawer";
  return "Command";
}

export default function ClientRefinePreviewView() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { companies, setActiveCompanyId, loading: companiesLoading , fetchError: companiesFetchError } = useCompany();
  const {
    activeCompany,
    hasCompany,
    topActions,
    allActions,
    primaryConstraint,
    nextMove,
    confidence,
    evidence,
    inputCoverage,
    signalStrength,
    primaryDesiredOutcome,
    rerunAnalysis: refetchClientViewData,
  } = useClientViewData({ actionLimit: 5 });

  const rawPhase = activeCompany?.engagement_phase ?? "outside_signals";
  const { totalUnresolved: inboxCount, newCount: inboxNewCount } = useDriftInboxCount(activeCompany?.id);

  // ── Homepage drift scan (mirrors workshop-page A78 pattern) ───────────────
  const { scanningAll: homeScanningAll, scanAllSurfaces: homeScanAllSurfaces } = useDriftScan(activeCompany?.id);
  const [homeScanAllStatus, setHomeScanAllStatus] = useState<{ assessed: number; aligned: number; slight_drift: number; material_drift: number; scannedAt: Date } | null>(null);
  const [homeScanAllError, setHomeScanAllError] = useState<string | null>(null);
  const [showHeaderSwitcher, setShowHeaderSwitcher] = useState(false);
  const headerSwitcherRef = useRef<HTMLDivElement>(null);
  const canScan = useCapability("governance.drift.scan", activeCompany?.id); // 3b
  const handleHomeScanAllSurfaces = useCallback(() => {
    if (!canScan) return; // governance.drift.scan
    setHomeScanAllError(null);
    homeScanAllSurfaces(
      (result) => {
        setHomeScanAllStatus({ ...result, scannedAt: new Date() });
        const driftCount = (result.slight_drift ?? 0) + (result.material_drift ?? 0);
        const summary = driftCount === 0
          ? `${result.assessed} surface${result.assessed === 1 ? "" : "s"} · all aligned`
          : `${result.assessed} surface${result.assessed === 1 ? "" : "s"} · ${driftCount} with drift`;
        toast.success(`Scanned · ${summary}`, { duration: 4000 });
      },
      (err) => {
        setHomeScanAllError(err);
        toast.error(`Scan failed — ${err}`, { duration: 5000 });
      },
    );
  }, [canScan, homeScanAllSurfaces]);

  // ── Strategic state analysis ────────────────────────────────────────────────
  const queryClient = useQueryClient();
  const { data: fileProposals = [] } = useFileProposals(activeCompany?.id);
  const { run: latestBaselineRun, preferredRun: baselineRun, loading: baselineLoading } = usePublicBaseline(activeCompany?.id);
  const {
    items: strategicAssumptions,
    loading: assumptionsLoading,
    saving: assumptionSaving,
    updatingId: assumptionUpdatingId,
    addAssumption,
    setAssumptionStatus,
  } = useStrategicAssumptions(activeCompany?.id);
  const { data: strategicHypothesisRows = [] } = useStrategicHypotheses(activeCompany?.id);
  const { data: routeHypothesisDependencies = [], isLoading: routeLinksLoading } = useRouteHypothesisDependencies(activeCompany?.id);
  const { data: strategicChangeSummary, isLoading: strategicChangeLoading } = useStrategicChangeSummary(activeCompany?.id);
  const { loading: routesLoading, items: routes } = useRoutes(activeCompany?.id);
  const { needs, marketDefinition } = useOdiNeeds(activeCompany?.id);
  const { claims: claimsMap } = useCompanyClaims(activeCompany?.id);
  const { history: mojoScoreHistory } = useMojoScore(activeCompany?.id);

  // Floor phase to what evidence actually supports — display-only, no DB write.
  const phase = floorEngagementPhase({
    phase: rawPhase,
    hasNeedsWithScores: needs.some((n) => n.importance > 0),
    hasSelectedRoute: !!activeCompany?.selected_route_id,
  });
  const isEarlyPhase = phase === "outside_signals" || phase === "validate_outside" || phase === "diagnose" || phase === "validate_diagnose";
  const earlyHypothesisPhaseLabel = phase === "outside_signals" || phase === "validate_outside" ? "Pre-Diagnosis" : "Diagnose";
  const phaseSectionVis = phaseSectionVisibility(phase);
  const phasePriority = phaseNarrativePriority(phase);
  const confidencePrimaryKeys = phaseConfidenceEmphasis(phase);
  // sectionVisibility is redefined after modeConfig is available (later in the component).
  // Until then, use phaseSectionVis directly for any usages before the mode layer.
  let sectionVisibility = phaseSectionVis;

  // ── Hierarchy-aware computed values ────────────────────────────────────────
  // White DIAGNOSE design (HomepageHierarchy) renders for EVERY company, regardless of
  // route hierarchy. `hasHierarchy` is the master gate used throughout this view; forcing
  // it true routes every company through the white sidebar branch and makes the gray
  // "Strategic field" fallback (all the `!hasHierarchy` branches) unreachable.
  // computeMojoScore handles empty data (zeroed result) and HomepageHierarchy degrades
  // gracefully, so thin/empty companies (e.g. zero-route Edgewood) get an honest early state.
  // Cafe Barra (3 route-level routes) was already `true`, so it is unchanged.
  const hasHierarchy = true;
  const ENGAGEMENT_DAY = useMemo((): number | null => {
    const startAt = activeCompany?.engagement_started_at;
    if (!startAt) return null;
    const ms = Date.now() - new Date(startAt).getTime();
    return Math.max(1, Math.floor(ms / 86_400_000));
  }, [activeCompany?.engagement_started_at]);
  const topLevelRoutes = useMemo(() => routes.filter((r) => r.level === "route"), [routes]);
  const dominantClaimState = useMemo((): ClaimState | null => {
    if (!hasHierarchy || topLevelRoutes.length === 0) return null;
    const order: ClaimState[] = ["flow", "focus", "diagnose", "outside_view"];
    const states = topLevelRoutes
      .map((r) => (r as { claim_id?: string | null }).claim_id ? (claimsMap.get((r as { claim_id?: string | null }).claim_id!)?.state ?? null) : null)
      .filter((s): s is ClaimState => s !== null);
    for (const s of order) { if (states.includes(s)) return s; }
    return states[0] ?? null;
  }, [hasHierarchy, topLevelRoutes, claimsMap]);
  const liveMojoScore = useMemo((): MojoScoreResult | null => {
    // Score computes for every company now (computeMojoScore handles empty data);
    // null only when there is no active company.
    if (!activeCompany?.id) return null;
    return computeMojoScore({
      companyId: activeCompany.id,
      claims: Array.from(claimsMap.values()).map((c) => ({
        id: c.id, state: c.state, claim_type: c.claim_type, topic: c.topic,
        outside_support_count: c.outside_support_count,
        organization_support_count: c.organization_support_count,
        customer_support_count: c.customer_support_count,
        updated_at: c.updated_at,
      })),
      routes: routes.map((r) => ({
        id: r.id, category: r.category, level: r.level ?? null, parent_id: r.parent_id ?? null,
        steps_json: (Array.isArray(r.steps_json) ? r.steps_json : null) as Array<{ id: string; title: string; status: string }> | null,
        evidence_json: (Array.isArray(r.evidence_json) ? r.evidence_json : null) as Array<{ id: string; title: string; status: string }> | null,
        why_this_matters_json: Array.isArray(r.why_this_matters_json) ? r.why_this_matters_json as string[] : null,
        rejected_alternatives: Array.isArray(r.rejected_alternatives) ? r.rejected_alternatives : null,
        what_would_have_to_be_true: Array.isArray(r.what_would_have_to_be_true) ? r.what_would_have_to_be_true : null,
        linked_need_ids: Array.isArray(r.linked_need_ids) ? r.linked_need_ids : null,
        updated_at: r.updated_at ?? null,
      })),
      needs: (needs ?? []).map((n) => ({
        id: n.id, desired_outcome: n.desired_outcome, importance: n.importance,
        satisfaction: n.satisfaction, opportunity_score: n.opportunity_score,
        service_state: n.service_state, updated_at: n.updated_at ?? null,
      })),
      computedAt: new Date().toISOString(),
    });
  }, [hasHierarchy, activeCompany?.id, claimsMap, routes, needs]);
  const displayMojoScore: MojoScoreResult | null = liveMojoScore;
  // Block 4: pick the need with the largest gap = highest opportunity_score
  // (opportunity_score = (importance − satisfaction) × importance)
  const topNeed = useMemo(() => {
    if (!hasHierarchy || needs.length === 0) return null;
    return [...needs].sort((a, b) => b.opportunity_score - a.opportunity_score)[0] ?? null;
  }, [hasHierarchy, needs]);

  const { landscape: signalLandscape } = useSignalLandscape(
    hasHierarchy ? activeCompany?.id : undefined,
  );
  const { evidence: directionEvidence } = useDirectionEvidence(
    hasHierarchy ? activeCompany?.id : undefined,
    routes,
  );

  // Insight-anchored Next Turn (2b): primary-finding three-beat, else profile-absence
  // template from the signal-band counts. Drives the Next Turn block only.
  const insightNextTurn = useInsightNextTurn(
    hasHierarchy ? activeCompany?.id : undefined,
    signalLandscape
      ? {
          outside: signalLandscape.byBand.outside.count,
          organization: signalLandscape.byBand.organization.count,
          customer: signalLandscape.byBand.customer.count,
        }
      : null,
  );

  const { item: positioning } = usePositioningCanvas(activeCompany?.id);
  const { item: cascade } = useStrategyCascade(activeCompany?.id);

  const foundationStatus = useFoundationStatus(
    hasHierarchy ? activeCompany?.id : undefined,
    positioning,
    cascade,
    routes,
    directionEvidence,
  );

  // ── Member count — solo vs team language (Finding 2) ─────────────────────
  const [memberCount, setMemberCount] = useState<number>(1);
  useEffect(() => {
    if (!showHeaderSwitcher) return;
    const handler = (e: MouseEvent) => {
      if (headerSwitcherRef.current && !headerSwitcherRef.current.contains(e.target as Node)) {
        setShowHeaderSwitcher(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowHeaderSwitcher(false); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [showHeaderSwitcher]);

  useEffect(() => {
    if (!activeCompany?.id) return;
    supabase
      .from("company_members")
      .select("id")
      .eq("company_id", activeCompany.id)
      .then(({ data }) => { if (data) setMemberCount(Math.max(1, data.length)); });
  }, [activeCompany?.id]);

  // ── Strategic-priority market definition (J6.1.1 / DI1.1) ────────────────
  // Fetch all market definitions for the company, then select by journey_key
  // column (exact match against the priority journey). Falls back to the first
  // row (most recently updated) when no exact match exists.

  const [allMarketDefs, setAllMarketDefs] = useState<OdiMarketDefinitionRow[]>([]);
  useEffect(() => {
    if (!activeCompany?.id || !hasHierarchy) { setAllMarketDefs([]); return; }
    supabase
      .from("odi_market_definitions")
      .select("*")
      .eq("company_id", activeCompany.id)
      .order("updated_at", { ascending: false })
      .then(({ data }) => { setAllMarketDefs((data as OdiMarketDefinitionRow[]) ?? []); });
  }, [activeCompany?.id, hasHierarchy]);

  // MH-1: the strategic-priority audience reads the REAL operator choice (not a
  // needs-alignment heuristic). No choice → null → no guessed audience ("not yet
  // chosen"): the audience copy simply does not render.
  const { chosenKey: chosenSetKey } = useChosenSetKey(activeCompany?.id);

  // The chosen set's market_def — strictly by its journey_key. No choice (or no
  // matching market_def) → null; never the allMarketDefs[0] guess.
  const strategicMarketDef = useMemo((): OdiMarketDefinitionRow | null => {
    if (!chosenSetKey || allMarketDefs.length === 0) return null;
    return allMarketDefs.find((d) => d.journey_key === chosenSetKey) ?? null;
  }, [allMarketDefs, chosenSetKey]);

  // ── Audience short-form — company's own job_executor noun phrase ─────────
  const audienceShort = useMemo(
    () => deriveAudienceShort(strategicMarketDef?.job_executor),
    [strategicMarketDef],
  );

  // ── Next Turn override — context-aware action (Finding 1) ─────────────────
  const nextTurnOverride = useMemo((): string | undefined => {
    if (!hasHierarchy || !displayMojoScore) return undefined;
    const raiser = displayMojoScore.projected_raisers[0];
    if (!raiser) return undefined;
    if (dominantClaimState === "diagnose" || (!dominantClaimState && phase === "diagnose")) {
      if (audienceShort) {
        return `Run 5 conversations with ${audienceShort}. It would show which direction actually resonates.`;
      }
    }
    return undefined;
  }, [hasHierarchy, displayMojoScore, dominantClaimState, phase, audienceShort]);

  const analysisRunning = fileProposals.some(
    (p) => p.processing_state === "queued" || p.processing_state === "running",
  );
  const unresolvedAssumptionsCount = useMemo(
    () => strategicAssumptions.filter((a) => a.status === "untested" || a.status === "validating").length,
    [strategicAssumptions],
  );
  const unstableAssumptionsCount = useMemo(
    () => strategicAssumptions.filter((a) => a.status === "unstable").length,
    [strategicAssumptions],
  );
  const contradictedAssumptionsCount = useMemo(
    () => strategicAssumptions.filter((a) => a.status === "contradicted" || a.status === "invalidated").length,
    [strategicAssumptions],
  );

  // Elapsed seconds counter — resets when analysis stops
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    if (!analysisRunning) { setElapsedSeconds(0); return; }
    setElapsedSeconds(0);
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [analysisRunning]);

  // Stable ref so the analysis-complete effect can call captureMovementSnapshot
  // without holding a const that is declared later in the component body.
  const captureMovementSnapshotRef = useRef<(() => void) | null>(null);

  const prevAnalysisRunning = useRef(false);
  useEffect(() => {
    if (prevAnalysisRunning.current && !analysisRunning) {
      const latest = fileProposals[0];
      if (latest?.processing_state === "ready") {
        toast.success("Analysis complete — diagnostic updated.");
        captureMovementSnapshotRef.current?.();
      } else if (latest?.processing_state === "failed") {
        toast.error("Analysis failed. Check the pipeline and try again.");
      }
    }
    prevAnalysisRunning.current = analysisRunning;
  }, [analysisRunning, fileProposals]);

  // Poll check-mojo-analysis every 5s while a proposal is running.
  // The edge function background monitor is unreliable in the local runtime —
  // this drives result capture from the frontend instead.
  useEffect(() => {
    if (!analysisRunning || !activeCompany?.id) return;
    const runningProposal = fileProposals.find((p) => p.processing_state === "running");
    if (!runningProposal) return;

    const interval = setInterval(async () => {
      try {
        await supabase.functions.invoke("check-mojo-analysis", {
          body: { proposal_id: runningProposal.id },
        });
        queryClient.invalidateQueries({ queryKey: ["file-proposals", activeCompany.id] });
      } catch { /* ignore — next tick will retry */ }
    }, 5000);

    return () => clearInterval(interval);
  }, [analysisRunning, activeCompany?.id, fileProposals, queryClient]);

  const runAnalysis = useCallback(async () => {
    if (!activeCompany?.id) {
      toast.error("No company selected.");
      return;
    }
    if (analysisRunning) return;
    toast.loading("Starting analysis…", { id: "run-analysis" });
    const { error } = await supabase.functions.invoke("run-mojo-analysis", {
      body: { company_id: activeCompany.id, trigger_type: "manual" },
    });
    if (error) {
      console.error("[run-mojo-analysis]", error);
      toast.error(`Could not start analysis: ${error.message}`, { id: "run-analysis" });
    } else {
      toast.success("Analysis started.", { id: "run-analysis" });
      queryClient.invalidateQueries({ queryKey: ["file-proposals", activeCompany.id] });
    }
  }, [activeCompany?.id, analysisRunning, queryClient]);

  const cancelAnalysis = useCallback(async () => {
    if (!activeCompany?.id) return;
    const stuckIds = fileProposals
      .filter((p) => p.processing_state === "queued" || p.processing_state === "running")
      .map((p) => p.id);
    if (stuckIds.length === 0) return;
    await supabase.from("file_proposals")
      .update({ processing_state: "failed", processing_error: "Cancelled by user" })
      .in("id", stuckIds);
    queryClient.invalidateQueries({ queryKey: ["file-proposals", activeCompany.id] });
  }, [activeCompany?.id, fileProposals, queryClient]);

  const runOutsideSignals = useCallback(async () => {
    if (!activeCompany?.id || !activeCompany?.website?.trim()) {
      toast.error("Add a website before running outside signals.");
      return;
    }
    toast.loading("Running outside signals…", { id: "run-outside-signals" });
    const { error } = await supabase.functions.invoke("public-baseline", {
      body: {
        company_id: activeCompany.id,
        company_name: activeCompany.name,
        website: activeCompany.website,
      },
    });
    if (error) {
      toast.error(error.message || "Outside signals failed.", { id: "run-outside-signals" });
      return;
    }
    toast.success("Outside signals updated.", { id: "run-outside-signals" });
    queryClient.invalidateQueries({ queryKey: ["file-proposals", activeCompany.id] });
  }, [activeCompany?.id, activeCompany?.name, activeCompany?.website, queryClient]);

  const rerunFoundationScope = useCallback(async () => {
    if (!activeCompany?.id || !activeCompany?.name) {
      toast.error("No company selected.");
      return;
    }
    toast.loading("Rebuilding foundation and routes…", { id: "rerun-foundation-scope" });
    const { error } = await supabase.functions.invoke("research-company", {
      body: {
        company_id: activeCompany.id,
        company_name: activeCompany.name,
        website: activeCompany.website ?? "",
        journey_key: "customer",
        review_mode: "advisory",
      },
    });
    if (error) {
      toast.error(error.message || "Foundation rerun failed.", { id: "rerun-foundation-scope" });
      return;
    }
    await refetchClientViewData();
    toast.success("Foundation and routes refreshed.", { id: "rerun-foundation-scope" });
    queryClient.invalidateQueries({ queryKey: ["file-proposals", activeCompany.id] });
  }, [activeCompany?.id, activeCompany?.name, activeCompany?.website, queryClient, refetchClientViewData]);

  const rerunOdiJobMapScope = useCallback(async () => {
    if (!activeCompany?.id) {
      toast.error("No company selected.");
      return;
    }
    toast.loading("Regenerating job map…", { id: "rerun-jobmap-scope" });
    const { data, error } = await supabase.functions.invoke("local-jobmap-synthesis", {
      body: {
        company_id: activeCompany.id,
        selected_job_maps: [
          {
            journey_key: "customer",
            journey_title: "Customer Progress",
            journey_subtitle: "How the primary job performer moves through the core job.",
          },
        ],
        trigger: "command_workbench_scoped_rerun",
      },
    });
    if (error) {
      toast.error(error.message || "Job map rerun failed.", { id: "rerun-jobmap-scope" });
      return;
    }
    if (data && typeof data === "object" && "error" in data && data.error) {
      toast.error(String(data.error), { id: "rerun-jobmap-scope" });
      return;
    }
    await refetchClientViewData();
    toast.success("Job map regenerated.", { id: "rerun-jobmap-scope" });
  }, [activeCompany?.id, refetchClientViewData]);
  const diagnostic = useMemo((): MojoMapDiagnostic | null => {
    const best = selectBestProposal(fileProposals);
    if (!best) return null;
    return normalizeToDiagnostic(best);
  }, [fileProposals]);

  const baselineSummary = useMemo(() => {
    const result = (baselineRun?.result_json ?? {}) as Record<string, unknown>;
    return {
      outsideSignals: Array.isArray(result.outside_voice_signals) ? result.outside_voice_signals.length : 0,
      evidenceLedger: Array.isArray(result.evidence_ledger) ? result.evidence_ledger.length : 0,
      hypotheses: Array.isArray(result.top_hypotheses) ? result.top_hypotheses.length : 0,
      questions: Array.isArray(result.open_questions) ? result.open_questions.length : 0,
    };
  }, [baselineRun]);

  const latestBaselineSummary = useMemo(() => {
    const result = (latestBaselineRun?.result_json ?? {}) as Record<string, unknown>;
    return {
      outsideSignals: Array.isArray(result.outside_voice_signals) ? result.outside_voice_signals.length : 0,
      evidenceLedger: Array.isArray(result.evidence_ledger) ? result.evidence_ledger.length : 0,
      hypotheses: Array.isArray(result.top_hypotheses) ? result.top_hypotheses.length : 0,
      questions: Array.isArray(result.open_questions) ? result.open_questions.length : 0,
    };
  }, [latestBaselineRun]);

  const baselineSelectionReason = useMemo(() => {
    if (!baselineRun) return "No public baseline selected yet.";
    if (!latestBaselineRun) return "Using the strongest available public baseline.";
    if (baselineRun.id === latestBaselineRun.id) {
      return "Latest run is also the strongest usable public baseline.";
    }
    if (latestBaselineSummary.outsideSignals === 0 && baselineSummary.outsideSignals > 0) {
      return "Latest run had no outside voice signals, so the stronger recent baseline is active.";
    }
    return "A stronger recent baseline is active because it carries better evidence quality than the latest run.";
  }, [baselineRun, latestBaselineRun, latestBaselineSummary.outsideSignals, baselineSummary.outsideSignals]);

  const signalPosture = useMemo(() => {
    const outside =
      baselineSummary.outsideSignals > 0
        ? "Present"
        : baselineSummary.evidenceLedger > 0 || baselineSummary.hypotheses > 0
          ? "Thin"
          : "Missing";
    const organization = fileProposals.length > 0 ? "Present" : "Thin";
    const customer = evidence.sources.some((source) => /customer|interview|survey/i.test(source.label) && source.present)
      ? "Present"
      : "Missing";
    return { outside, organization, customer };
  }, [baselineSummary, fileProposals.length, evidence.sources]);

  const evidenceGuidance = useMemo(() => {
    const usable: string[] = [];
    const revalidate: string[] = [];

    if (signalPosture.outside === "Present") {
      usable.push("market language and public positioning cues");
    } else if (signalPosture.outside === "Thin") {
      usable.push("light public context only");
    }

    if (signalPosture.organization === "Present") {
      usable.push("internal strategy and uploaded company context");
    }

    if (signalPosture.customer === "Present") {
      usable.push("existing customer evidence, with framing checks");
    } else {
      revalidate.push("customer priorities under the current framing");
    }

    if (baselineRun && latestBaselineRun && baselineRun.id !== latestBaselineRun.id) {
      revalidate.push("the latest public baseline before treating it as authoritative");
    }

    return {
      usable: usable.length > 0 ? usable.join(", ") : "no strong evidence is safe to use yet",
      revalidate: revalidate.length > 0 ? revalidate.join(", ") : "no immediate revalidation flags",
    };
  }, [signalPosture, baselineRun, latestBaselineRun]);

  const frameworkClaimPreview = useMemo(
    () => (diagnostic?.frameworkFindings ?? []).slice(0, 6),
    [diagnostic],
  );

  const claimWorkbenchPreview = useMemo(() => {
    return frameworkClaimPreview.map((finding) => {
      const framework = finding.framework.toLowerCase();
      const customerSensitive = framework === "jtbd" || framework === "odi";
      const marketSensitive = framework === "april_dunford";
      const hasOutside = signalPosture.outside === "Present";
      const hasOrganization = signalPosture.organization === "Present";
      const hasCustomer = signalPosture.customer === "Present";

      let supportLevel = "Thin";
      let supportReason = "Evidence is still too incomplete to trust this claim yet.";
      let validationNote = "Gather stronger supporting evidence before treating this as durable.";

      if (customerSensitive) {
        if (hasCustomer && hasOrganization) {
          supportLevel = "Customer-backed";
          supportReason = "Direct customer signal exists and internal context supports the same read.";
          validationNote = hasOutside
            ? "Pressure-test this against market context if the framing has changed."
            : "Keep it, but add outside context if the market read still matters.";
        } else if (hasCustomer) {
          supportLevel = "Direct but narrow";
          supportReason = "Customer evidence exists, but it is not yet reinforced by enough surrounding context.";
          validationNote = "Check whether current company context still fits what customers are saying.";
        } else if (hasOrganization) {
          supportLevel = "Internal proxy only";
          supportReason = "This reads more like an internal interpretation than a confirmed customer truth.";
          validationNote = "Return to direct customer evidence before using this as foundational truth.";
        }
      } else if (marketSensitive) {
        if (hasOutside && hasOrganization) {
          supportLevel = "Market-backed";
          supportReason = "Public market context and internal positioning signals point in the same direction.";
          validationNote = hasCustomer
            ? "Customer evidence can sharpen this, but it is already usable as a positioning read."
            : "Useful for positioning now, but still worth checking against direct customer response.";
        } else if (hasOutside) {
          supportLevel = "Market-facing only";
          supportReason = "Public evidence supports the claim, but internal proof is still thin.";
          validationNote = "Confirm the company can actually support this claim internally.";
        } else if (hasOrganization) {
          supportLevel = "Internal positioning claim";
          supportReason = "This is coming mainly from company material, not external market response.";
          validationNote = "This stays directional until outside signals or customer response support it.";
        }
      } else {
        if (hasOrganization && hasOutside) {
          supportLevel = "Directional";
          supportReason = "Internal evidence and public context align enough to treat this as a working claim.";
          validationNote = hasCustomer
            ? "Customer evidence should refine this before it becomes a hard commitment."
            : "Customer confirmation is still the missing step.";
        } else if (hasOrganization) {
          supportLevel = "Internal only";
          supportReason = "This is currently supported mostly by company-side interpretation.";
          validationNote = "Use as a working hypothesis, not as a settled strategic truth.";
        }
      }

      return {
        ...finding,
        supportLevel,
        supportReason,
        validationNote,
      };
    });
  }, [frameworkClaimPreview, signalPosture]);

  const foundationWorkbenchPreview = useMemo(() => {
    const positioningStatement =
      diagnostic?.headline ||
      (baselineSummary.outsideSignals > 0
        ? "Public market context is present, but the positioning read still needs sharpening."
        : "No clear external positioning read yet.");

    const strategyStatement =
      toSentence(primaryConstraint?.title) ||
      toSentence(primaryConstraint?.detail) ||
      "No clear strategic constraint has been formed yet.";

    const outcomeStatement =
      toSentence(primaryDesiredOutcome?.statement) ||
      "No primary outcome is being held consistently yet.";

    const routeStatement =
      toSentence(nextMove?.title) ||
      toSentence(nextMove?.detail) ||
      "No active route is leading yet.";

    return [
      {
        area: "Positioning",
        statement: positioningStatement,
        evidenceShape:
          signalPosture.outside === "Present" && signalPosture.organization === "Present"
            ? "Outside + organization"
            : signalPosture.outside === "Present"
              ? "Outside-led"
              : "Thin",
        nextCheck:
          signalPosture.customer === "Present"
            ? "Check whether current customer signal still fits the positioning read."
            : "Add direct customer response before hardening this into a positioning truth.",
      },
      {
        area: "Strategy",
        statement: strategyStatement,
        evidenceShape:
          signalPosture.organization === "Present"
            ? signalPosture.outside === "Present"
              ? "Organization + outside"
              : "Organization-led"
            : "Thin",
        nextCheck:
          "Confirm this constraint still reflects the real decision bottleneck, not only internal interpretation.",
      },
      {
        area: "Outcome",
        statement: outcomeStatement,
        evidenceShape:
          signalPosture.customer === "Present"
            ? "Customer-supported"
            : signalPosture.organization === "Present"
              ? "Internal proxy"
              : "Thin",
        nextCheck:
          signalPosture.customer === "Present"
            ? "Keep outcome language tied to actual customer progress."
            : "Revalidate this outcome with direct customer evidence before overcommitting.",
      },
      {
        area: "Route",
        statement: routeStatement,
        evidenceShape: "Current move",
        nextCheck:
          "Make the core route assumption explicit before treating this as locked.",
      },
    ];
  }, [
    baselineSummary.outsideSignals,
    diagnostic?.headline,
    nextMove?.detail,
    nextMove?.title,
    primaryConstraint?.detail,
    primaryConstraint?.title,
    primaryDesiredOutcome?.statement,
    signalPosture,
  ]);

  const assumptionWorkbenchPreview = useMemo(() => {
    return strategicAssumptions.map((assumption) => {
      const normalized = assumption.assumption.toLowerCase();
      const gates: string[] = [];

      if (/(customer|buyer|user|interview|survey|demand|need|priority)/i.test(normalized)) {
        gates.push("Customer signal");
      }
      if (/(position|message|category|brand|proof|differentiat|value proposition|market)/i.test(normalized)) {
        gates.push("Positioning");
      }
      if (/(route|launch|deliver|execute|pilot|channel|distribution|partner|sales|rollout)/i.test(normalized)) {
        gates.push("Current route");
      }
      if (/(team|owner|ops|process|workflow|execution|capacity|resource)/i.test(normalized)) {
        gates.push("Execution path");
      }
      if (gates.length === 0 && primaryConstraint?.title) {
        gates.push(`Constraint: ${shorten(primaryConstraint.title, 56)}`);
      }
      if (gates.length === 0 && diagnostic?.headline) {
        gates.push(`Diagnostic: ${shorten(diagnostic.headline, 56)}`);
      }

      let impact = "Still a live assumption behind the current direction.";
      if (assumption.status === "validating") {
        impact = "In testing now. Keep dependent decisions flexible until the result settles.";
      } else if (assumption.status === "validated") {
        impact = "Supported enough to stop treating it as a primary blocker.";
      } else if (assumption.status === "invalidated") {
        impact = "Broken assumption. Recheck the dependent route or strategic read.";
      }

      return {
        ...assumption,
        gates: gates.slice(0, 2),
        impact,
      };
    });
  }, [strategicAssumptions, primaryConstraint?.title, diagnostic?.headline]);

  const [operatingMode, setOperatingMode] = useState<OperatingMode>("scan");
  const [layer, setLayer] = useState<LayerState>("command");
  const [commitState, setCommitState] = useState<CommitState>("idle");
  const [drawerKey, setDrawerKey] = useState<DrawerKey | null>(null);
  const [selectedMapRoute, setSelectedMapRoute] = useState<RouteCategory>("Fix");
  const [hoveredMapRoute, setHoveredMapRoute] = useState<RouteCategory | null>(null);
  const [systemLine, setSystemLine] = useState("");
  const [systemLineOn, setSystemLineOn] = useState(false);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [tweakTab, setTweakTab] = useState<TweakTab>("evidence");
  const [specOpen, setSpecOpen] = useState(false);
  const [accessModes, setAccessModes] = useState<AccessModes>(DEFAULT_ACCESS_MODES);
  const [showAllPressure, setShowAllPressure] = useState(false);
  const [expandedClusterKey, setExpandedClusterKey] = useState<string | null>(null);
  const [showCommitmentDependency, setShowCommitmentDependency] = useState(false);
  const [newAssumption, setNewAssumption] = useState("");
  const [confidenceFrom, setConfidenceFrom] = useState(42);
  const [confidenceTo, setConfidenceTo] = useState(42);
  const [evidenceChecks, setEvidenceChecks] = useState<boolean[]>([false, false, false]);
  const [committedAt, setCommittedAt] = useState<Date | null>(null);
  const [hoverTip, setHoverTip] = useState<{ text: string; x: number; y: number } | null>(null);

  const handleAddAssumption = useCallback(async () => {
    const assumption = toSentence(newAssumption);
    if (!assumption) return;
    try {
      await addAssumption({ assumption, source: "client", status: "untested" });
      setNewAssumption("");
      toast.success("Assumption added.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add assumption.");
    }
  }, [addAssumption, newAssumption]);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const timersRef = useRef<number[]>([]);
  const typingRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const actionHeadline = useMemo(() => {
    if (isEarlyPhase) {
      const missing = evidence.sources.filter((s) => !s.present).map((s) => s.label);
      if (missing.length > 0) {
        const listed = missing.slice(0, 2).join(" and ");
        return `${listed} ${missing.length === 1 ? "is" : "are"} still missing`;
      }
      return "What internal evidence would confirm or challenge this read";
    }
    const detail = toSentence(nextMove?.detail);
    if (detail) return detail;
    return "The next most useful step is building clearer evidence here.";
  }, [isEarlyPhase, nextMove?.detail, evidence.sources]);


  const baseConfidence = useMemo(
    () => (hasHierarchy && displayMojoScore) ? Math.round(displayMojoScore.total_score) : confidenceBase(confidence.level),
    [hasHierarchy, displayMojoScore, confidence.level],
  );

  const confidenceTarget = useMemo(() => {
    const projected = Number(activeCompany?.projected_score ?? activeCompany?.potential_score ?? 0);
    const candidate = Number.isFinite(projected) && projected > 0 ? projected : baseConfidence + 22;
    return clamp(Math.round(candidate), baseConfidence + 8, 95);
  }, [activeCompany?.potential_score, activeCompany?.projected_score, baseConfidence]);

  const confidenceLift = useMemo(
    () => clamp(confidenceTarget - baseConfidence, 8, 30),
    [baseConfidence, confidenceTarget],
  );


  const stageIndex = useMemo(() => {
    if (phase === "outside_signals" || phase === "validate_outside") return 0;
    if (phase === "diagnose" || phase === "validate_diagnose") return 1;
    if (phase === "focus" || phase === "validate_focus") return 2;
    return 3;
  }, [phase]);

  const stageStrip = useMemo(
    () => ["Outside view", "Diagnose", "Focus", "Flow"],
    [],
  );

  const strongestAction = topActions[0] ?? null;
  const earlyPhaseHypotheses = useMemo(
    () => getRefinePreviewActiveHypotheses(
      strategicHypothesisRows,
      phasePriority.hypotheses.maxItems,
      phasePriority.hypotheses.priorityMode,
    ),
    [phasePriority.hypotheses.maxItems, phasePriority.hypotheses.priorityMode, strategicHypothesisRows],
  );
  const leadEarlyHypothesis = earlyPhaseHypotheses[0] ?? null;
  const confidenceHypotheses = useMemo(() => {
    if (isEarlyPhase) return earlyPhaseHypotheses;
    const maxItems = phasePriority.phase === "flow" ? 4 : 3;
    const mode = phasePriority.phase === "flow" ? "tension_first" : "assumption_pressure";
    return getRefinePreviewActiveHypotheses(strategicHypothesisRows, maxItems, mode);
  }, [earlyPhaseHypotheses, isEarlyPhase, phasePriority.phase, strategicHypothesisRows]);
  const routeSeeds = useMemo(
    () =>
      routes.map((route) => {
        const evidence = deriveClientEvidence(route);
        const assumptions = deriveClientAssumptions(route, evidence);
        return { route, evidence, assumptions };
      }),
    [routes],
  );
  const strategicCenter = useMemo(
    () =>
      inferStrategicCenter({
        activeRows: strategicHypothesisRows,
        routeSeeds,
        phase,
      }),
    [phase, routeSeeds, strategicHypothesisRows],
  );
  const identityNarrative = useMemo(
    () =>
      inferIdentityNarrative({
        activeRows: strategicHypothesisRows,
        routeSeeds,
        phase,
        strategicCenter,
      }),
    [phase, routeSeeds, strategicCenter, strategicHypothesisRows],
  );
  const recommendedRouteId = useMemo(
    () => selectRecommendedRoute(routes, null, null)?.id ?? null,
    [routes],
  );
  const routeRationales = useMemo(
    () =>
      buildRouteRationales({
        seeds: routeSeeds,
        hypotheses: strategicHypothesisRows,
        routeLinks: routeHypothesisDependencies,
        recommendedRouteId,
        phase,
      }),
    [phase, recommendedRouteId, routeHypothesisDependencies, routeSeeds, strategicHypothesisRows],
  );
  const routeRationaleMap = useMemo(
    () => new Map(routeRationales.map((rationale) => [rationale.routeId, rationale])),
    [routeRationales],
  );
  const phaseSortedRoutes = useMemo(
    () => sortRoutesForPhase({ items: routes, rationales: routeRationaleMap, phase, recommendedRouteId }),
    [phase, recommendedRouteId, routeRationaleMap, routes],
  );
  const leadMainRoute = phaseSortedRoutes[0] ?? null;
  const leadMainRationale = leadMainRoute ? (routeRationaleMap.get(leadMainRoute.id) ?? null) : null;
  const evidenceConditions = useMemo((): string[] => {
    const wwhtbt = leadMainRoute?.what_would_have_to_be_true;
    if (Array.isArray(wwhtbt) && wwhtbt.length > 0) {
      return wwhtbt.slice(0, 5).map((c) => c.condition);
    }
    return ["Evidence collected and reviewed"];
  }, [leadMainRoute]);
  const leadRouteHypothesisRows = useMemo(() => {
    if (!leadMainRationale) return [];
    const linkedIds = new Set(leadMainRationale.matchedHypothesisIds);
    if (linkedIds.size === 0) return [];
    return strategicHypothesisRows.filter((row) => row.hypothesis.is_active && linkedIds.has(row.hypothesis.id));
  }, [leadMainRationale, strategicHypothesisRows]);
  const focusOrFlowHypotheses = useMemo(() => {
    if (isEarlyPhase) return [];

    const linkedRows = leadRouteHypothesisRows;
    if (phasePriority.phase === "focus") {
      const sourceRows = linkedRows.length > 0
        ? linkedRows.filter(
            (row) =>
              row.hypothesis.hypothesis_kind === "candidate_assumption" ||
              row.hypothesis.hypothesis_kind === "inferred_tension" ||
              row.weakeningClaims.length > 0,
          )
        : strategicHypothesisRows.filter(
            (row) =>
              row.hypothesis.is_active &&
              (row.hypothesis.hypothesis_kind === "candidate_assumption" ||
                row.hypothesis.hypothesis_kind === "inferred_tension" ||
                row.weakeningClaims.length > 0),
          );
      return getRefinePreviewActiveHypotheses(sourceRows, phasePriority.hypotheses.maxItems, phasePriority.hypotheses.priorityMode);
    }

    const sourceRows = linkedRows.length > 0
      ? linkedRows.filter(
          (row) =>
            row.hypothesis.hypothesis_kind === "inferred_tension" ||
            row.weakeningClaims.length > 0 ||
            row.hypothesis.hypothesis_state === "contradicted" ||
            row.hypothesis.hypothesis_state === "emerging",
        )
      : strategicHypothesisRows.filter(
          (row) =>
            row.hypothesis.is_active &&
            (row.hypothesis.hypothesis_kind === "inferred_tension" ||
              row.weakeningClaims.length > 0 ||
              row.hypothesis.hypothesis_state === "contradicted" ||
              row.hypothesis.hypothesis_state === "emerging"),
        );
    return getRefinePreviewActiveHypotheses(sourceRows, phasePriority.hypotheses.maxItems, phasePriority.hypotheses.priorityMode);
  }, [
    isEarlyPhase,
    leadRouteHypothesisRows,
    phasePriority.hypotheses.maxItems,
    phasePriority.hypotheses.priorityMode,
    phasePriority.phase,
    strategicHypothesisRows,
  ]);
  const confidenceLandscape = useMemo(
    () =>
      buildRefinePreviewConfidenceLandscape({
        activeRows: confidenceHypotheses,
        allRows: strategicHypothesisRows,
        changeSummary: strategicChangeSummary ?? null,
        routeRationales,
        routeSeeds,
        phase,
      }),
    [confidenceHypotheses, phase, routeRationales, routeSeeds, strategicChangeSummary, strategicHypothesisRows],
  );
  const confidenceLandscapeLoading = routesLoading || routeLinksLoading || strategicChangeLoading;
  const reconciliationNarrative = useMemo(
    () =>
      buildReconciliationNarrative({
        activeRows: strategicHypothesisRows,
        routeRationales,
        routeSeeds,
        phase,
        leadRouteRationale: leadMainRationale,
      }),
    [leadMainRationale, phase, routeRationales, routeSeeds, strategicHypothesisRows],
  );
  // renderReconciliation is declared after the mode-merged sectionVisibility below.

  // ── Strategic Center Surface ────────────────────────────────────────────────
  const customerRealityNarrative = useMemo(
    () => buildCustomerRealityNarrative(needs, routes, cascade ?? null),
    [needs, routes, cascade],
  );
  const positioningNarrative = useMemo(
    () => buildPositioningLensNarrative(positioning ?? null, cascade ?? null, routes),
    [positioning, cascade, routes],
  );
  const portfolio = useMemo(
    () =>
      buildDecisionPortfolio({
        routes,
        rationales: routeRationales,
        strategicCenter,
        customerReality: customerRealityNarrative,
        positioningNarrative,
        phase,
      }),
    [routes, routeRationales, strategicCenter, customerRealityNarrative, positioningNarrative, phase],
  );
  const surface = useMemo(
    () =>
      buildStrategicCenterSurface({
        strategicCenter,
        customerReality: customerRealityNarrative,
        positioningNarrative,
        confidenceDomains: confidenceLandscape,
        routeRationales,
        leadRationale: leadMainRationale,
        phase,
        decisionPortfolio: portfolio,
      }),
    [strategicCenter, customerRealityNarrative, positioningNarrative, confidenceLandscape, routeRationales, leadMainRationale, phase, portfolio],
  );

  const temporalPosture = useMemo(
    () => deriveTemporalPosture({
      hypotheses: strategicHypothesisRows,
      centerStateKey: surface.centerStateKey,
      confidencePosture: surface.confidencePosture,
      topContradiction: surface.topContradiction,
    }),
    [strategicHypothesisRows, surface.centerStateKey, surface.confidencePosture, surface.topContradiction],
  );

  const register = useMemo(
    () => deriveRegister({
      confidencePosture: surface.confidencePosture,
      temporalPosture,
      centerStateKey: surface.centerStateKey,
      hasEscalations: portfolio.escalations.length > 0,
      portfolioState: portfolio.portfolioState,
    }),
    [surface.confidencePosture, surface.centerStateKey, temporalPosture, portfolio.escalations, portfolio.portfolioState],
  );

  const discipline = useMemo(
    () => assessConfidenceDiscipline({
      confidencePosture: surface.confidencePosture,
      temporalPosture,
      register,
      hasCustomerBehavioralProof: hasCustomerBehavioralProofFromPosture(customerRealityNarrative?.posture),
      routeCount: routeRationales.length,
    }),
    [surface.confidencePosture, temporalPosture, register, customerRealityNarrative?.posture, routeRationales.length],
  );

  const decay = useMemo(
    () => buildDecayContext({
      temporalPosture,
      confidencePosture: surface.confidencePosture,
    }),
    [temporalPosture, surface.confidencePosture],
  );

  const attention = useMemo(
    () => buildAttentionContext({
      register,
      discipline,
      temporalPosture,
      governanceDrift: portfolio.decisionOps.drift,
      routeDecisions: portfolio.routes.map((r) => ({
        lifecycleState: r.lifecycleState,
        commitmentState: r.commitmentState,
      })),
      decay,
    }),
    [register, discipline, temporalPosture, portfolio.decisionOps.drift, portfolio.routes, decay],
  );

  // Derive the default mode once on mount (after attention + decisionOps are ready).
  // Stored in a ref so subsequent re-renders don't re-derive and override user changes.
  const modeInitialized = useRef(false);
  useEffect(() => {
    if (!modeInitialized.current) {
      setOperatingMode(deriveDefaultMode(attention, portfolio.decisionOps));
      modeInitialized.current = true;
    }
  // Intentionally runs once — attention/decisionOps at mount determine the default.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const modeConfig = MODE_CONTENT[operatingMode];

  // Merge phase visibility with mode suppression rules.
  // Mode can suppress sections; never expands beyond what phase permits.
  sectionVisibility = {
    ...phaseSectionVis,
    showHypotheses: phaseSectionVis.showHypotheses && modeConfig.showHypotheses,
    showMovement:   phaseSectionVis.showMovement && modeConfig.showMovement,
    showConfidence: phaseSectionVis.showConfidence && modeConfig.showConfidenceLandscape,
  };

  // Computed after mode-merge so it respects showHypotheses suppression.
  const renderReconciliation = sectionVisibility.showHypotheses && Boolean(reconciliationNarrative?.shouldRender);

  const cadenceFrame = useMemo(
    () => buildCadenceFrame({
      changeSummary: strategicChangeSummary ?? null,
      temporalPosture,
      attention,
      decisionOps: portfolio.decisionOps,
    }),
    [strategicChangeSummary, temporalPosture, attention, portfolio.decisionOps],
  );

  const integrity = useMemo(
    () => auditSemanticIntegrity({
      register,
      discipline,
      confidencePosture: surface.confidencePosture,
      temporalPosture,
      attention,
      decay,
      customerRealityPosture: customerRealityNarrative?.posture ?? null,
      hasCustomerBehavioralProof: hasCustomerBehavioralProofFromPosture(customerRealityNarrative?.posture),
      governanceDrift: portfolio.decisionOps.drift,
      safeToCommit: portfolio.safeToCommit,
      portfolioHasStalledOrGatedRoutes: portfolio.decisionOps.routes.some(
        (r) => r.lifecycleState === "stalled" || r.lifecycleState === "gated",
      ),
      operatingMode,
    }),
    [register, discipline, surface.confidencePosture, temporalPosture, attention, decay, customerRealityNarrative?.posture, portfolio.decisionOps, portfolio.safeToCommit, operatingMode],
  );

  const enforcement = useMemo(
    () => deriveSemanticEnforcement({
      integrity,
      register,
      attentionPosture: attention?.posture ?? "stable",
      confidencePosture: surface.confidencePosture,
      operatingMode,
    }),
    [integrity, register, attention?.posture, surface.confidencePosture, operatingMode],
  );

  const safeAttention = useMemo(() => {
    if (!attention || enforcement.safeAttentionPosture === attention.posture) return attention;
    const p = enforcement.safeAttentionPosture;
    return { ...attention, posture: p, postureLabel: ATTENTION_POSTURE_LABELS[p], signalQuotas: SIGNAL_QUOTAS[p] };
  }, [attention, enforcement.safeAttentionPosture]);

  const signals = useMemo(
    () =>
      buildStrategicSignals({
        hypotheses: strategicHypothesisRows,
        routeRationales,
        surface,
        customerReality: customerRealityNarrative,
        positioningNarrative,
        portfolio,
        phase,
        discipline,
        governanceSignals: portfolio.decisionOps.governanceSignals,
        attention: safeAttention,
        maxSignals: modeConfig.maxSignals,
        decay,
        suppressCommitmentLanguage: enforcement.suppressCommitmentLanguage,
        forceCustomerProofVisibility: enforcement.forceCustomerProofVisibility,
      }),
    [strategicHypothesisRows, routeRationales, surface, customerRealityNarrative, positioningNarrative, portfolio, phase, discipline, safeAttention, modeConfig.maxSignals, decay, enforcement.suppressCommitmentLanguage, enforcement.forceCustomerProofVisibility],
  );

  // ── Strategic orientation layer (Phase 24) ──────────────────────────────────
  // Derives structural tensions from the full data set, then assembles the
  // primary orientation surface: commitment readiness, tensions, movement, lenses.
  const homePageTensions = useMemo(
    () => deriveStrategicTensions({
      routes,
      needs,
      canvas: positioning ?? null,
      cascade: cascade ?? null,
      sourceSignals: {
        uploadedFiles: fileProposals.length,
        hasCompanyEvidence: signalPosture.organization === "Present",
        hasPrimaryEvidence: signalPosture.customer === "Present",
        primaryEvidenceSignals: signalPosture.customer === "Present" ? 1 : 0,
        testedSignal: 0,
        hasImplementedTested: false,
      },
    }),
    [routes, needs, positioning, cascade, fileProposals.length, signalPosture],
  );

  // Bootstrap orientation — no tensionAnnotations to avoid circular dep:
  // movementSnapshotInput → useStrategicMovement → annotatedTensions → orientationWithMemory.
  // This provides validationUrgency for movementSnapshotInput only.
  const strategicOrientation = useMemo(
    () => buildStrategicOrientation({ tensions: homePageTensions, portfolio, signals }),
    [homePageTensions, portfolio, signals],
  );

  const movementSnapshotInput = useMemo(() => {
    if (!activeCompany?.id) return null;
    return {
      companyId: activeCompany.id,
      centerStateKey: surface.centerStateKey,
      confidencePosture: surface.confidencePosture,
      canCommit: portfolio.safeToCommit.length > 0,
      safeToCommit: portfolio.safeToCommit,
      blocked: portfolio.blocked,
      portfolioState: portfolio.portfolioState,
      tensions: homePageTensions.map((t) => ({
        id: t.id,
        statement: t.statement,
        pressure: t.pressure,
        isCommitmentBlocker: t.isCommitmentBlocker,
      })),
      validationUrgency: strategicOrientation.validationUrgency,
      hasContradiction: Boolean(surface.topContradiction),
      customerProofPresent: signalPosture.customer === "Present",
      unresolvedAssumptionsCount,
      contradictedAssumptionsCount: contradictedAssumptionsCount + unstableAssumptionsCount,
      reframedAssumptionsCount: strategicAssumptions.filter((a) => (a.status as string) === "reframed").length,
      mojoScore: typeof activeCompany.mojo_score === "number" ? activeCompany.mojo_score : null,
    };
  }, [
    activeCompany?.id,
    activeCompany?.mojo_score,
    surface.centerStateKey,
    surface.confidencePosture,
    surface.topContradiction,
    portfolio.safeToCommit,
    portfolio.blocked,
    portfolio.portfolioState,
    homePageTensions,
    strategicOrientation.validationUrgency,
    signalPosture.customer,
    strategicAssumptions,
    unresolvedAssumptionsCount,
    contradictedAssumptionsCount,
    unstableAssumptionsCount,
  ]);

  const { movementLine, annotatedTensions, captureNow: captureMovementSnapshot } = useStrategicMovement(movementSnapshotInput);
  captureMovementSnapshotRef.current = captureMovementSnapshot;

  const persistentTensionIds = useMemo(
    () => new Set(annotatedTensions.filter((a) => a.movementStatus === "persistent").map((a) => a.tensionId)),
    [annotatedTensions],
  );

  const weakeningTensionIds = useMemo(
    () => new Set(annotatedTensions.filter((a) => a.movementStatus === "weakened" || a.movementStatus === "cooling").map((a) => a.tensionId)),
    [annotatedTensions],
  );

  const evolvedAssumptions = useMemo(
    () => deriveAssumptionEvolution(strategicAssumptions),
    [strategicAssumptions],
  );

  const assumptionEvolutionLine = useMemo(
    () => buildAssumptionMovementLine(evolvedAssumptions),
    [evolvedAssumptions],
  );

  const orientationWithMemory = useMemo(
    () => buildStrategicOrientation({ tensions: homePageTensions, portfolio, signals, tensionAnnotations: annotatedTensions }),
    [homePageTensions, portfolio, signals, annotatedTensions],
  );

  const commandActionTitle = useMemo(() => {
    const actionTitle = toSentence(strongestAction?.title);
    if (actionTitle) return actionTitle;

    // When the lead route is evidence-derived with a movement_condition, surface its
    // specific validation test rather than a generic action title.
    if (
      leadMainRoute &&
      Array.isArray(leadMainRoute.frameworks_used) &&
      leadMainRoute.frameworks_used.includes("evidence_derived_79") &&
      leadMainRoute.route_insights_json?.movement_condition
    ) {
      return deriveRouteValidationTitle(leadMainRoute);
    }

    const moveTitle = toSentence(nextMove?.title);
    if (moveTitle && moveTitle.toLowerCase() !== "in progress") return moveTitle;

    return actionHeadline;
  }, [actionHeadline, leadMainRoute, nextMove?.title, strongestAction?.title]);

  const commandActionSupport = useMemo(() => {
    const detail = toSentence(nextMove?.detail);
    if (detail && detail !== commandActionTitle) return detail;

    const supportParts: string[] = [];
    const constraintTitle = toSentence(primaryConstraint?.title);
    const desiredOutcome = toSentence(primaryDesiredOutcome?.statement);

    if (constraintTitle) supportParts.push(`Constraint: ${constraintTitle}.`);
    if (desiredOutcome) supportParts.push(`Target outcome: ${desiredOutcome}.`);

    return supportParts.join(" ");
  }, [commandActionTitle, nextMove?.detail, primaryConstraint?.title, primaryDesiredOutcome?.statement]);

  const centerLedEarlyHero = useMemo(() => {
    if (!(phase === "diagnose" || phase === "validate_diagnose")) return null;
    if (!strategicCenter.shouldLeadExplanations || !strategicCenter.label) return null;
    return {
      headline: `The strategy is converging around ${strategicCenter.label}.`,
      support: buildCenterHeroSupport({
        publicIdentity: identityNarrative.publicIdentity,
      }),
    };
  }, [identityNarrative.publicIdentity, phase, strategicCenter.customerLag, strategicCenter.label, strategicCenter.shouldLeadExplanations]);
  const showEarlyHero = Boolean(centerLedEarlyHero || leadEarlyHypothesis);

  const earlyPhaseHeadline = useMemo(() => {
    // Do not use centerLedEarlyHero.headline here — surface.centerHeadline already carries that message.
    // Use the support line (secondary context) or the leading hypothesis instead.
    if (centerLedEarlyHero?.support) return centerLedEarlyHero.support;
    if (leadEarlyHypothesis?.hypothesis.statement) return toSentence(leadEarlyHypothesis.hypothesis.statement);
    return diagnostic?.headline || "The picture is still forming.";
  }, [centerLedEarlyHero?.support, diagnostic?.headline, leadEarlyHypothesis?.hypothesis.statement]);

  const earlyPhaseSupport = useMemo(() => {
    // earlyPhaseHeadline already renders centerLedEarlyHero.support — skip here to avoid duplicate.
    if (centerLedEarlyHero?.support) {
      return null;
    }
    if (leadEarlyHypothesis) {
      return hypothesisSourceMixSummary(leadEarlyHypothesis);
    }

    const leadText = normalizeCompare(diagnostic?.headline);
    const candidates = [
      diagnostic?.subhead,
      toSentence(primaryConstraint?.detail),
      toSentence(primaryConstraint?.title),
    ]
      .map((value) => toSentence(value))
      .filter(Boolean);

    for (const candidate of candidates) {
      const normalized = normalizeCompare(candidate);
      if (!normalized) continue;
      if (leadText && (normalized === leadText || normalized.includes(leadText) || leadText.includes(normalized))) {
        continue;
      }
      return candidate;
    }

    return "";
  }, [centerLedEarlyHero?.support, diagnostic?.headline, diagnostic?.subhead, leadEarlyHypothesis, primaryConstraint?.detail, primaryConstraint?.title]);
  const latePhaseLabel = useMemo(() => {
    if (phasePriority.phase === "focus") return "Focus";
    if (phasePriority.phase === "flow") return "Flow";
    if (phasePriority.phase === "diagnose") return "Diagnose";
    return "Pre-Diagnosis";
  }, [phasePriority.phase]);
  const latePhaseHeadline = useMemo(() => {
    if ((phasePriority.phase === "focus" || phasePriority.phase === "flow") && leadMainRoute?.title) {
      return toSentence(leadMainRoute.title);
    }
    return commandActionTitle;
  }, [commandActionTitle, leadMainRoute?.title, phasePriority.phase]);
  const conductor = useMemo(
    () => buildNarrativeConductor({
      centerStateKey: surface.centerStateKey,
      centerHeadline: surface.centerHeadline,
      secondaryHeadline: isEarlyPhase ? earlyPhaseHeadline : latePhaseHeadline,
      topContradiction: surface.topContradiction,
      temporalPosture,
      register: enforcement.safeRegister,
      discipline,
      attention: safeAttention,
    }),
    [surface.centerStateKey, surface.centerHeadline, surface.topContradiction, isEarlyPhase, earlyPhaseHeadline, latePhaseHeadline, temporalPosture, enforcement.safeRegister, discipline, safeAttention],
  );

  const conductedSignals = useMemo(
    () => conductor.conductSignals(signals),
    [conductor, signals],
  );

  const conductedAttentionItems = useMemo(
    () => conductor.conductAttentionItems(surface.phaseAttentionItems),
    [conductor, surface.phaseAttentionItems],
  );

  // When hierarchy is present and no lead route yet, replace "lead route" framing in next moves
  const displayAttentionItems = useMemo(() => {
    if (hasHierarchy && (dominantClaimState === "diagnose" || dominantClaimState === "outside_view")) {
      const n = topLevelRoutes.length;
      const leadRouteFreeItems = conductedAttentionItems.filter(
        (item) => !/lead route|weakening signals|pulling positioning/i.test(item),
      );
      return [
        `No lead route yet — ${n} direction${n === 1 ? "" : "s"} under evaluation.`,
        ...leadRouteFreeItems.slice(0, 1),
      ];
    }
    return conductedAttentionItems;
  }, [hasHierarchy, dominantClaimState, topLevelRoutes, conductedAttentionItems]);

  const latePhaseSupport = useMemo(() => {
    if (phasePriority.phase === "focus" && leadMainRationale) {
      return leadMainRationale.whatSupportsIt;
    }
    if (phasePriority.phase === "flow" && leadMainRationale) {
      if (leadMainRationale.movement === "weaken" || leadMainRationale.readiness === "Hold") {
        return leadMainRationale.couldWeaken || leadMainRationale.uncertainty;
      }
      if (leadMainRationale.movement === "strengthen" || leadMainRationale.movement === "narrow") {
        return leadMainRationale.whatSupportsIt;
      }
      return leadMainRationale.uncertainty || leadMainRationale.whatSupportsIt;
    }
    return commandActionSupport;
  }, [commandActionSupport, leadMainRationale, phasePriority.phase]);
  const latePhaseStatus = useMemo(() => {
    if (!leadMainRationale) return "";
    if (phasePriority.phase === "focus") {
      return `Route posture · ${leadMainRationale.readiness} · ${leadMainRationale.readinessMeaning}`;
    }
    if (phasePriority.phase === "flow") {
      return `Route health · ${leadMainRationale.movementLabel} · ${displayConfidenceLabel(leadMainRationale.confidenceLabel)}`;
    }
    return "";
  }, [leadMainRationale, phasePriority.phase]);
  const commitmentBlockerTensions = useMemo(
    () => homePageTensions.filter((tension) => tension.is_commitment_blocker).slice(0, 2),
    [homePageTensions],
  );
  const destabilizingTensions = useMemo(
    () => homePageTensions.filter((tension) => !tension.is_commitment_blocker).slice(0, 2),
    [homePageTensions],
  );
  const councilPressureTensions = useMemo(
    () => tensionsForContext(homePageTensions, "council", 1),
    [homePageTensions],
  );
  const destabilizingSignals = useMemo(() => {
    const groups = conductedSignals.groups.filter((group) =>
      group.polarity === "blocked" ||
      group.polarity === "contradictory" ||
      group.polarity === "weakening" ||
      group.polarity === "unresolved",
    );
    return {
      ...conductedSignals,
      groups,
      totalCount: groups.reduce((sum, group) => sum + group.signals.length, 0),
      hasBlockingSignals: groups.some((group) => group.polarity === "blocked"),
      hasConflictingSignals: groups.some((group) => group.polarity === "contradictory"),
    };
  }, [conductedSignals]);
  const strengtheningSignal = useMemo(
    () =>
      conductedSignals.groups.find((group) => group.polarity === "reinforcing" || group.polarity === "accelerating")?.signals[0]?.statement ??
      null,
    [conductedSignals],
  );
  const weakeningSignal = useMemo(
    () =>
      conductedSignals.groups.find((group) =>
        group.polarity === "blocked" ||
        group.polarity === "contradictory" ||
        group.polarity === "weakening",
      )?.signals[0]?.statement ?? null,
    [conductedSignals],
  );
  const commitmentIsFragile =
    !orientationWithMemory.commitmentReadiness.canCommit ||
    orientationWithMemory.hasBlockingTensions ||
    strategicCenter.customerLag ||
    portfolio.blocked.length > 0;
  const pressureAlert = useMemo(() => {
    // When routes use level hierarchy, surface state-aware framing based on dominant claim state
    if (hasHierarchy && dominantClaimState) {
      const n = topLevelRoutes.length;
      if (dominantClaimState === "diagnose") {
        return {
          tone: "neutral" as const,
          headline: `Building the foundation — exploring ${n} direction${n === 1 ? "" : "s"}.`,
          detail: "Evidence is accumulating around three directions. Customer validation is the next layer needed.",
        };
      }
      if (dominantClaimState === "outside_view") {
        return {
          tone: "neutral" as const,
          headline: "Early engagement — first signals are forming. Internal grounding is still developing.",
          detail: null,
        };
      }
      if (dominantClaimState === "focus") {
        return {
          tone: "stable" as const,
          headline: "A route is emerging as the primary direction. Evidence continues to strengthen.",
          detail: "Comparing against alternatives before commitment.",
        };
      }
      if (dominantClaimState === "flow") {
        return {
          tone: "stable" as const,
          headline: "Committed to a direction. Monitoring whether evidence continues to support it.",
          detail: null,
        };
      }
    }
    if (orientationWithMemory.hasBlockingTensions) {
      const blockerCount = commitmentBlockerTensions.length || orientationWithMemory.primaryTensions.filter((tension) => tension.is_commitment_blocker).length;
      return {
        tone: "critical" as const,
        headline: `Commitment blocked — ${blockerCount === 1 ? "a blocking tension is active." : `${Math.max(blockerCount, 2)} blocking tensions are active.`}`,
        detail: orientationWithMemory.validationUrgency || "Commitment depends on resolving the current blockers first.",
      };
    }
    if (orientationWithMemory.commitmentReadiness.blockedRoutes.length > 0) {
      const blockedCount = orientationWithMemory.commitmentReadiness.blockedRoutes.length;
      return {
        tone: "warning" as const,
        headline: `Commitment risk elevated — ${blockedCount} route${blockedCount === 1 ? "" : "s"} blocked.`,
        detail: orientationWithMemory.validationUrgency || "The current path is constrained by unresolved proof pressure.",
      };
    }
    if (orientationWithMemory.commitmentReadiness.canCommit) {
      const hasBlockedToo = orientationWithMemory.commitmentReadiness.blockedRoutes.length > 0;
      return {
        tone: "stable" as const,
        headline: hasBlockedToo
          ? "One path is commit-ready — blocked routes remain secondary."
          : "A commitment path is starting to hold.",
        detail: hasBlockedToo
          ? "The primary direction is clear; secondary blockers are contained, not resolved."
          : "Confidence is stronger here, but it still needs to stay earned.",
      };
    }
    return {
      tone: "neutral" as const,
      headline: "The direction is visible, but commitment is still conditional.",
      detail: orientationWithMemory.validationUrgency || "Commitment depends on how validation moves from here.",
    };
  }, [hasHierarchy, dominantClaimState, topLevelRoutes, commitmentBlockerTensions.length, orientationWithMemory, strategicCenter.customerLag]);
  const commitmentIntro = useMemo(() => {
    if (hasHierarchy && dominantClaimState === "diagnose") return "Multiple paths are forming — none yet strong enough to prioritize.";
    if (hasHierarchy && dominantClaimState === "outside_view") return "A first read is forming — not yet ready to choose from.";
    if (hasHierarchy && dominantClaimState === "focus") return "A lead path is visible — commitment remains conditional.";
    if (phasePriority.phase === "pre_diagnosis") return "A first read is forming — not yet ready to choose from.";
    if (phasePriority.phase === "diagnose") return "A direction is forming — still waiting on a few open questions.";
    if (phasePriority.phase === "focus") return "A lead path is visible — commitment remains conditional.";
    return "The direction is live under pressure — it can still weaken.";
  }, [hasHierarchy, dominantClaimState, phasePriority.phase]);
  const instabilityIntro = useMemo(() => {
    if (phasePriority.phase === "pre_diagnosis") return "These keep the outside read provisional.";
    if (phasePriority.phase === "diagnose") return "These keep the diagnosis from hardening too early.";
    if (phasePriority.phase === "focus") return "These keep the current focus fragile.";
    return "These can still weaken the direction in motion.";
  }, [phasePriority.phase]);
  const validationIntro = useMemo(() => {
    if (strategicCenter.customerLag) return "Customer proof is still the binding condition.";
    if (leadMainRationale?.mustBecomeTrue) return leadMainRationale.mustBecomeTrue;
    if (contradictedAssumptionsCount > 0 || unstableAssumptionsCount > 0) {
      const count = contradictedAssumptionsCount + unstableAssumptionsCount;
      return `${count} assumption${count === 1 ? "" : "s"} unsettled — confidence can't harden yet.`;
    }
    if (phasePriority.phase === "flow") return "Execution is now either reinforcing or weakening confidence.";
    return "Proof here either hardens the direction or exposes it.";
  }, [contradictedAssumptionsCount, leadMainRationale?.mustBecomeTrue, phasePriority.phase, strategicCenter.customerLag, unstableAssumptionsCount]);
  const safeRightNowLine = useMemo(() => {
    if (leadMainRationale) {
      if (leadMainRationale.readiness === "Commit") return "Safe right now: focus around this path.";
      if (leadMainRationale.readiness === "Validate") return "Safe right now: validate before commitment.";
      if (leadMainRationale.readiness === "Hold") return "Safe right now: hold until the evidence clears.";
      return "Safe right now: investigate, not choose.";
    }
    if (orientationWithMemory.commitmentReadiness.canCommit) {
      return "Safe right now: move forward, but keep proof visible.";
    }
    return "Safe right now: keep the direction open.";
  }, [leadMainRationale, orientationWithMemory.commitmentReadiness.canCommit]);
  const commitmentFragilityLines = useMemo(
    () =>
      uniqueSentences(
        [
          safeRightNowLine,
          orientationWithMemory.commitmentReadiness.label,
          isEarlyPhase ? null : orientationWithMemory.commitmentReadiness.sublabel,
          strategicCenter.customerLag ? "Customer validation is still gating commitment." : null,
          portfolio.safeToCommit.length === 0 && portfolio.blocked.length > 0
            ? `${portfolio.blocked.length} route${portfolio.blocked.length === 1 ? "" : "s"} still depend on unresolved blockers.`
            : null,
          portfolio.safeToCommit.length > 0 && !hasCustomerBehavioralProofFromPosture(customerRealityNarrative?.posture)
            ? "Promising signal — customer behavior not yet confirmed."
            : null,
        ],
        3,
      ),
    [customerRealityNarrative?.posture, isEarlyPhase, orientationWithMemory.commitmentReadiness, portfolio.blocked.length, portfolio.safeToCommit.length, safeRightNowLine, strategicCenter.customerLag],
  );

  // ── Evidence-grounded commitment card metrics (replaces synthetic Impact/Effort/Certainty) ──

  const evidencePostureValue = useMemo(() => {
    const posture = leadMainRoute?.route_insights_json?.confidence_posture;
    if (posture) return posture.charAt(0).toUpperCase() + posture.slice(1);
    if (leadMainRationale?.readiness === "Validate") return "Validation active";
    if (leadMainRationale?.readiness === "Hold") return "Evidence conditional";
    if (leadMainRationale?.readiness === "Commit") return "Evidence present";
    return commitmentIsFragile ? "Evidence conditional" : "Evidence present";
  }, [commitmentIsFragile, leadMainRationale?.readiness, leadMainRoute?.route_insights_json?.confidence_posture]);

  const commitmentPressureValue = useMemo(() => {
    if (commitmentBlockerTensions.length > 0) return "Blockers unresolved";
    if (surface.topContradiction) return "Contradiction active";
    if (strategicCenter.customerLag) return "Customer validation pending";
    if (!orientationWithMemory.commitmentReadiness.canCommit) return "Proof incomplete";
    return "No active blockers";
  }, [commitmentBlockerTensions.length, orientationWithMemory.commitmentReadiness.canCommit, strategicCenter.customerLag, surface.topContradiction]);

  const readinessPostureValue = useMemo(() => {
    if (leadMainRationale?.readiness === "Commit") return "Safe to commit";
    if (leadMainRationale?.readiness === "Validate") return "Validate first";
    if (leadMainRationale?.readiness === "Hold") return "Hold for now";
    const label = orientationWithMemory.commitmentReadiness.label;
    const short = label.split(" — ")[0].split(".")[0].trim();
    return short || (orientationWithMemory.commitmentReadiness.canCommit ? "Commit window open" : "Conditional");
  }, [leadMainRationale?.readiness, orientationWithMemory.commitmentReadiness]);

  const pressureClusters = useMemo(() => {
    const computeRipple = (t: StrategicTension | null | undefined): string[] => {
      if (!t) return [];
      const items: string[] = [];
      if (t.affected_strategy) items.push("Strategy coherence depends on this resolving.");
      if (t.affected_positioning) items.push("Positioning confidence depends on this resolving.");
      if (!t.affected_strategy && !t.affected_positioning && t.affected_routes.length > 1) {
        items.push(`${t.affected_routes.length} route paths remain conditionally committed.`);
      }
      return items.slice(0, 2);
    };

    const groups: Array<{
      key: string;
      label: string;
      tone: "critical" | "warning" | "quiet";
      headline: string;
      lines: string[];
      inspectLabel: string;
      sourceTension: StrategicTension | null;
      rippleItems: string[];
      isPersistent: boolean;
      isWeakening: boolean;
      isStructuralPull: boolean;
    }> = [];

    if (surface.topContradiction || commitmentBlockerTensions.length > 0 || orientationWithMemory.validationUrgency) {
      groups.push({
        key: "blocking",
        label: commitmentBlockerTensions.length > 0 ? "Blocking commitment" : "Proof pressure",
        tone: surface.topContradiction ? "critical" : "warning",
        headline: shorten(
          surface.topContradiction ||
            commitmentBlockerTensions[0]?.statement ||
            orientationWithMemory.validationUrgency ||
            "Validation pressure is still constraining the current direction.",
          88,
        ),
        lines: uniqueSentences([
          commitmentBlockerTensions[0]?.detail,
          orientationWithMemory.validationUrgency,
          commitmentBlockerTensions[0]?.validation_requirements[0],
          strategicCenter.customerLag ? "Customer validation is still lagging the current direction." : null,
        ], 2).map((line) => shorten(line, 98)),
        inspectLabel: "What still blocks this",
        sourceTension: commitmentBlockerTensions[0] ?? null,
        rippleItems: computeRipple(commitmentBlockerTensions[0]),
        isPersistent: persistentTensionIds.has(commitmentBlockerTensions[0]?.id ?? ""),
        isWeakening: weakeningTensionIds.has(commitmentBlockerTensions[0]?.id ?? ""),
        isStructuralPull: Boolean(
          commitmentBlockerTensions[0] &&
          commitmentBlockerTensions[0].affected_routes.length > 0 &&
          (commitmentBlockerTensions[0].affected_strategy || commitmentBlockerTensions[0].affected_positioning),
        ),
      });
    }

    if (destabilizingTensions.length > 0) {
      groups.push({
        key: "unstable",
        label: "Keeping the read unstable",
        tone: destabilizingTensions[0]?.pressure === "critical" || destabilizingTensions[0]?.pressure === "high" ? "warning" : "quiet",
        headline: shorten(destabilizingTensions[0]?.statement || "The read still carries unresolved instability.", 88),
        lines: uniqueSentences([
          destabilizingTensions[0]?.detail,
          destabilizingTensions[1]?.statement,
          destabilizingTensions[1]?.detail,
          portfolio.escalations[0]?.detail,
        ], 2).map((line) => shorten(line, 98)),
        inspectLabel: "Why this is unstable",
        sourceTension: destabilizingTensions[0] ?? null,
        rippleItems: computeRipple(destabilizingTensions[0]),
        isPersistent: persistentTensionIds.has(destabilizingTensions[0]?.id ?? ""),
        isWeakening: weakeningTensionIds.has(destabilizingTensions[0]?.id ?? ""),
        isStructuralPull: Boolean(
          destabilizingTensions[0] &&
          destabilizingTensions[0].affected_routes.length > 0 &&
          (destabilizingTensions[0].affected_strategy || destabilizingTensions[0].affected_positioning),
        ),
      });
    }

    if (councilPressureTensions[0]) {
      groups.push({
        key: "council",
        label: "Council pressure",
        tone: "quiet",
        headline: shorten(councilPressureTensions[0].statement, 88),
        lines: uniqueSentences([
          councilPressureTensions[0].detail,
          councilPressureTensions[0].validation_requirements[0],
        ], 1).map((line) => shorten(line, 98)),
        inspectLabel: "What pressure remains",
        sourceTension: councilPressureTensions[0] ?? null,
        rippleItems: [],
        isPersistent: persistentTensionIds.has(councilPressureTensions[0]?.id ?? ""),
        isWeakening: weakeningTensionIds.has(councilPressureTensions[0]?.id ?? ""),
        isStructuralPull: Boolean(
          councilPressureTensions[0] &&
          councilPressureTensions[0].affected_routes.length > 0 &&
          (councilPressureTensions[0].affected_strategy || councilPressureTensions[0].affected_positioning),
        ),
      });
    }

    return groups.slice(0, 3);
  }, [
    commitmentBlockerTensions,
    councilPressureTensions,
    destabilizingTensions,
    orientationWithMemory.validationUrgency,
    persistentTensionIds,
    weakeningTensionIds,
    portfolio.escalations,
    strategicCenter.customerLag,
    surface.topContradiction,
  ]);
  const validationSummaryItems = useMemo(
    () =>
      [
        strengtheningSignal
          ? { label: "Strengthening", text: shorten(strengtheningSignal, 92) }
          : null,
        weakeningSignal
          ? { label: "Weakening", text: shorten(weakeningSignal, 92) }
          : null,
        {
          label: "Needs direct verification",
          text: shorten(
            leadMainRationale?.mustBecomeTrue ||
              customerRealityNarrative?.wouldResolve[0] ||
              customerRealityNarrative?.unresolved[0] ||
              (strategicCenter.customerLag ? "We still need direct customer evidence before this direction can harden." : ""),
            104,
          ),
        },
        contradictedAssumptionsCount > 0 || unstableAssumptionsCount > 0 || unresolvedAssumptionsCount > 0
          ? {
              label: "Assumptions still unstable",
              text: shorten(
                contradictedAssumptionsCount > 0
                  ? `${contradictedAssumptionsCount} contradicted or invalidated assumption${contradictedAssumptionsCount === 1 ? "" : "s"} still need resolution.`
                  : unstableAssumptionsCount > 0
                    ? `${unstableAssumptionsCount} unstable assumption${unstableAssumptionsCount === 1 ? "" : "s"} still need to settle.`
                    : `${unresolvedAssumptionsCount} assumption${unresolvedAssumptionsCount === 1 ? "" : "s"} are still under active validation.`,
                96,
              ),
            }
          : null,
      ].filter((item): item is { label: string; text: string } => Boolean(item?.text)).slice(0, 3),
    [
      contradictedAssumptionsCount,
      customerRealityNarrative?.unresolved,
      customerRealityNarrative?.wouldResolve,
      leadMainRationale?.mustBecomeTrue,
      strategicCenter.customerLag,
      strengtheningSignal,
      unresolvedAssumptionsCount,
      unstableAssumptionsCount,
      weakeningSignal,
    ],
  );
  const commitmentAnchorHeadline = isEarlyPhase ? earlyPhaseHeadline : latePhaseHeadline;
  const commitmentAnchorSupport = isEarlyPhase ? earlyPhaseSupport : latePhaseSupport;
  const commitmentAnchorStatus = isEarlyPhase
    ? (diagnostic && !diagnostic.isAccepted ? "Early read · not validated yet" : "")
    : latePhaseStatus;
  const fieldHypothesisRows = isEarlyPhase ? earlyPhaseHypotheses : focusOrFlowHypotheses;
  const fieldHypothesisPhaseLabel = isEarlyPhase ? earlyHypothesisPhaseLabel : latePhaseLabel;
  const commitmentFieldHeadline = useMemo(() => {
    // When routes use level hierarchy, feature the strongest top-level route
    if (hasHierarchy && topLevelRoutes.length > 0) {
      const best = [...topLevelRoutes].sort((a, b) => (b.pts_value ?? 0) - (a.pts_value ?? 0))[0];
      if (best?.title) return best.title;
    }
    if (phasePriority.phase === "focus" || phasePriority.phase === "flow") {
      return latePhaseHeadline || surface.centerHeadline;
    }
    return surface.centerHeadline;
  }, [hasHierarchy, topLevelRoutes, latePhaseHeadline, phasePriority.phase, surface.centerHeadline]);
  const commitmentFieldSupportLines = useMemo(() => {
    const centerContext =
      !isEarlyPhase && strategicCenter.label
        ? `The direction is centering on ${lowerFirst(strategicCenter.label)}.`
        : null;

    const lines = isEarlyPhase
      ? [commitmentAnchorHeadline, commitmentAnchorSupport]
      : [centerContext, latePhaseSupport, commitmentAnchorSupport];

    return uniqueSentences(lines, isEarlyPhase ? 2 : 1).filter((line) => normalizeCompare(line) !== normalizeCompare(commitmentFieldHeadline));
  }, [
    commitmentAnchorHeadline,
    commitmentAnchorSupport,
    commitmentFieldHeadline,
    isEarlyPhase,
    latePhaseSupport,
    strategicCenter.label,
  ]);
  const fieldHypothesisExcludeId = useMemo(() => {
    const lead = fieldHypothesisRows[0];
    if (!lead) return null;
    const headlineKey = normalizeCompare(commitmentFieldHeadline);
    const leadKey = normalizeCompare(lead.hypothesis.statement);
    if (!headlineKey || !leadKey) return null;
    if (headlineKey === leadKey || headlineKey.includes(leadKey) || leadKey.includes(headlineKey)) {
      return lead.hypothesis.id;
    }
    return null;
  }, [commitmentFieldHeadline, fieldHypothesisRows]);
  const visiblePressureClusters = useMemo(
    () => (showAllPressure ? pressureClusters : pressureClusters.slice(0, 1)),
    [pressureClusters, showAllPressure],
  );
  const pressureSignalsPreview = useMemo(() => {
    const groups = destabilizingSignals.groups
      .slice(0, showAllPressure ? 2 : 1)
      .map((group) => ({
        ...group,
        signals: group.signals.slice(0, showAllPressure ? 3 : 2),
      }));
    return {
      ...destabilizingSignals,
      groups,
      totalCount: groups.reduce((sum, group) => sum + group.signals.length, 0),
    };
  }, [destabilizingSignals, showAllPressure]);

  const routeLabelMap = useMemo(
    () => new Map(routes.map((r) => [r.id, r.title])),
    [routes],
  );

  const commitmentDependencyItems = useMemo(() => {
    const blocker = commitmentBlockerTensions[0];
    if (!blocker) return [] as string[];
    const items: string[] = [];
    const req = blocker.validation_requirements[0];
    if (req) items.push(req);
    const res = blocker.resolution_signals[0];
    if (res && res !== req) items.push(`Resolves if: ${shorten(res, 72)}`);
    for (const routeId of (blocker.blocked_commitments ?? []).slice(0, 1)) {
      const label = routeLabelMap.get(routeId);
      if (label) items.push(`Blocks path to: ${shorten(label, 56)}`);
    }
    return items.slice(0, 3);
  }, [commitmentBlockerTensions, routeLabelMap]);

  const unstableAssumptionLines = useMemo(
    () => evolvedAssumptions.filter((a) => a.isUnstable).slice(0, 2).map((a) => a.statement),
    [evolvedAssumptions],
  );

  // Phase 30 — commitment consequence and validation leverage
  const commitmentConsequenceItems = useMemo(() => {
    const items: string[] = [];
    // Lead route's critical unproven assumptions — dependency framing
    const assumptions = leadMainRoute?.assumptions_json ?? [];
    const criticalUnproven = assumptions.filter(
      (a) => a.critical && (a.status === "unproven" || !a.status),
    );
    if (criticalUnproven[0]) {
      items.push(`This path currently depends on: ${lowerFirst(criticalUnproven[0].statement)}`);
    }
    // Blocker tension as dependency (only if assumption didn't fill this already)
    if (items.length === 0 && commitmentBlockerTensions[0]) {
      items.push(`Commitment depends on: ${shorten(lowerFirst(commitmentBlockerTensions[0].statement), 84)}`);
    }
    // Unstable assumption affecting routes — fragility framing
    const routeAffecting = evolvedAssumptions.find((a) => a.isUnstable && a.affectedRouteIds.length > 0);
    if (routeAffecting && items.length < 2) {
      items.push(`If this weakens: ${shorten(lowerFirst(routeAffecting.statement), 68)} would need reassessment.`);
    }
    // Customer lag — condition framing
    if (strategicCenter.customerLag && items.length < 2) {
      items.push("Route confidence weakens without direct customer evidence.");
    }
    return items.slice(0, 2);
  }, [commitmentBlockerTensions, evolvedAssumptions, leadMainRoute?.assumptions_json, strategicCenter.customerLag]);

  const validationConsequenceItems = useMemo(() => {
    const items: string[] = [];
    // Customer proof leverage
    if (strategicCenter.customerLag) {
      const wouldResolve = customerRealityNarrative?.wouldResolve[0];
      items.push(wouldResolve
        ? `Customer proof would: ${lowerFirst(wouldResolve)}`
        : "Customer proof would stabilize all route recommendations simultaneously."
      );
    }
    // Commitment window unlock
    if (commitmentBlockerTensions.length > 0 && portfolio.safeToCommit.length === 0) {
      const routeCount = Math.min(routes.length, 3);
      if (routeCount > 0 && items.length < 2) {
        items.push(`Resolving this would open the commitment window for up to ${routeCount} route${routeCount === 1 ? "" : "s"}.`);
      }
    }
    // Assumption stabilization leverage
    const unstableCount = evolvedAssumptions.filter((a) => a.isUnstable).length;
    if (unstableCount > 0 && items.length < 2) {
      items.push(`Stabilizing ${unstableCount === 1 ? "this belief" : "these beliefs"} would reduce commitment pressure across the portfolio.`);
    }
    return items.slice(0, 2);
  }, [
    commitmentBlockerTensions.length,
    customerRealityNarrative?.wouldResolve,
    evolvedAssumptions,
    portfolio.safeToCommit.length,
    routes.length,
    strategicCenter.customerLag,
  ]);

  // ── Strategic field condition derivation ─────────────────────────────────────
  // Eight condition state memos produce raw condition lines.
  // conditionDiscipline (below) applies ownership rules and produces the final
  // deduplicated set. In JSX: use conditionDiscipline.* for commitment posture
  // condition lines; window renders directly (it has no suppression rule).
  //
  // Strategic roles:
  //   driftSignalLine      — confidence degradation under momentum pressure
  //   driftContextLines    — proof-aging context for the validation region
  //   reframingState       — interpretive evolution (beliefs shifted)
  //   convergenceState     — decision narrowing (viable set is shrinking)
  //   commitmentWindowState — commitment readiness (a window exists)
  //   fragilityState       — support breadth (window rests on narrow proof)
  //   gravityState         — field concentration (signals pulling to one interpretation)
  //   counterforceState    — residual resistance (competing themes still active)

  // Drift — confidence degradation. Fires when momentum is weakening or contradiction pressure is rising.
  // Suppressed in commitment posture when canCommit=true (window + drift are contradictory).
  const driftSignalLine = useMemo((): string | null => {
    const drift = portfolio.decisionOps.drift;
    const { momentum, contradictionPressure } = temporalPosture;
    if (momentum === "weakening" && drift.driftingCommitment) {
      return "Commitment confidence is drifting under sustained pressure.";
    }
    if (contradictionPressure === "entrenched") {
      return "Contradiction pressure has become entrenched without resolution.";
    }
    if (contradictionPressure === "accumulating") {
      return "Contradiction pressure is accumulating.";
    }
    if (momentum === "weakening") {
      return "Confidence is weakening around this direction.";
    }
    if (drift.validationBottleneck) {
      return "Validation has not kept pace with commitment.";
    }
    if (drift.perpetualExploration) {
      return "Exploration is cycling without converging.";
    }
    return null;
  }, [portfolio.decisionOps.drift, temporalPosture.momentum, temporalPosture.contradictionPressure]);

  const driftContextLines = useMemo((): string[] => {
    const lines: string[] = [];
    const { proofGapMaturity, approxCycleCount } = temporalPosture;
    if (proofGapMaturity === "structural") {
      lines.push("Proof gaps have become structural rather than temporary.");
    } else if (proofGapMaturity === "aging") {
      lines.push("Proof gaps are aging without recent resolution.");
    }
    if (decay.backgroundNote && proofGapMaturity !== "structural") {
      lines.push(decay.backgroundNote);
    }
    if (approxCycleCount >= 3 && lines.length < 2) {
      lines.push("Validation has not kept pace with how far the strategy has committed.");
    }
    return lines.slice(0, 2);
  }, [decay.backgroundNote, temporalPosture.proofGapMaturity, temporalPosture.approxCycleCount]);

  // Reframing — interpretive evolution. Fires when assumptions have been actively reframed
  // (status=reframed) or when cooling tensions suggest a direction is weakening.
  const reframingState = useMemo(() => {
    const reframedBeliefs = evolvedAssumptions.filter((a) => a.hasReframing);
    const hasCoolingTension = weakeningTensionIds.size > 0;

    // Commitment posture — single interpretive evolution line
    let commitmentReframingLine: string | null = null;
    if (reframedBeliefs.length > 0) {
      commitmentReframingLine = "The interpretation behind this direction is shifting.";
    } else if (decay.contradictionCooled && hasCoolingTension) {
      commitmentReframingLine = "The earlier framing is becoming harder to support.";
    } else if (decay.conditionsStabilizing && hasCoolingTension) {
      commitmentReframingLine = "The direction is narrowing toward a more specific read.";
    }

    // Validation region — what became less relevant
    const consequenceLines: string[] = [];
    const routeAffectingBelief = reframedBeliefs.find((a) => a.affectedRouteIds.length > 0);
    if (routeAffectingBelief) {
      consequenceLines.push("One route's basis has shifted — its relevance may be narrowing.");
    }
    if (!strategicCenter.customerLag && decay.conditionsStabilizing && consequenceLines.length < 2) {
      consequenceLines.push("Customer pressure is concentrating in a more specific direction.");
    }
    if (strategicCenter.customerLag && hasCoolingTension && consequenceLines.length < 2) {
      consequenceLines.push("Customer evidence is narrowing the read.");
    }

    // Movement memory — compressed editorial line
    let reframingMovementLine: string | null = null;
    if (reframedBeliefs.length >= 2) {
      reframingMovementLine = "The strategic read narrowed.";
    } else if (reframedBeliefs.length === 1) {
      reframingMovementLine = "An interpretation shifted.";
    } else if (hasCoolingTension && decay.conditionsStabilizing) {
      reframingMovementLine = "The direction is concentrating.";
    }

    return {
      commitmentReframingLine,
      consequenceLines: consequenceLines.slice(0, 2),
      reframingMovementLine,
    };
  }, [decay.conditionsStabilizing, decay.contradictionCooled, evolvedAssumptions, strategicCenter.customerLag, weakeningTensionIds.size]);

  // Convergence — decision narrowing. Fires when the portfolio is converging or
  // momentum is strengthening alongside weakening alternative tensions.
  const convergenceState = useMemo(() => {
    const isConverging = portfolio.portfolioState === "converging";
    const hasSafeRoutes = portfolio.safeToCommit.length > 0;
    const hasConvergingRoutes = portfolio.converging.length > 0;
    const momentumStrengthening = temporalPosture.momentum === "strengthening";
    const hasWeakening = weakeningTensionIds.size > 0;
    const noBlockers = commitmentBlockerTensions.length === 0;

    // Commitment posture — directional amplification after the anchor
    let commitmentConvergenceLine: string | null = null;
    if (hasSafeRoutes && (momentumStrengthening || isConverging)) {
      commitmentConvergenceLine = "Signals are increasingly reinforcing this direction.";
    } else if (isConverging && noBlockers) {
      commitmentConvergenceLine = "The field is narrowing around a commitment path.";
    } else if (momentumStrengthening && strengtheningSignal && hasWeakening) {
      commitmentConvergenceLine = "Validation is concentrating confidence here.";
    } else if (hasConvergingRoutes && noBlockers && hasWeakening) {
      commitmentConvergenceLine = "This route is becoming easier to support.";
    }

    // Instability region — narrowing note, PART 4: convergence despite instability
    // Only meaningful when pressure clusters are present (enforced in JSX)
    let narrowingNote: string | null = null;
    if ((isConverging || hasSafeRoutes) && !noBlockers) {
      narrowingNote = "Confidence is concentrating on one path even as pressure persists.";
    } else if (hasConvergingRoutes && hasWeakening && !noBlockers) {
      narrowingNote = "Alternative interpretations are weakening — the viable set is narrowing.";
    }

    // Movement memory cadence line
    let convergenceMovementLine: string | null = null;
    if (hasSafeRoutes && isConverging) {
      convergenceMovementLine = "Validation strengthened a narrower commitment set.";
    } else if (isConverging) {
      convergenceMovementLine = "Confidence is concentrating around fewer paths.";
    } else if (momentumStrengthening && hasWeakening) {
      convergenceMovementLine = "Signals increasingly reinforce the current interpretation.";
    }

    return { commitmentConvergenceLine, narrowingNote, convergenceMovementLine };
  }, [
    commitmentBlockerTensions.length,
    portfolio.converging.length,
    portfolio.portfolioState,
    portfolio.safeToCommit.length,
    strengtheningSignal,
    temporalPosture.momentum,
    weakeningTensionIds.size,
  ]);

  // Commitment window — readiness. Fires when safeToCommit routes exist and no
  // blocking tensions are present. Supersedes convergence in commitment posture.
  const commitmentWindowState = useMemo(() => {
    const windowPresent = orientationWithMemory.commitmentReadiness.canCommit;
    const windowForming = portfolio.portfolioState === "converging" && commitmentBlockerTensions.length === 0;
    // Fragility check within a present window (canCommit may coexist with partial blockage)
    const windowHasFragility =
      orientationWithMemory.hasBlockingTensions ||
      strategicCenter.customerLag ||
      portfolio.blocked.length > 0;

    // Commitment posture — temporality qualifier, only when window is actually present
    // (the converging/forming case is already covered by the anchor text)
    let commitmentWindowLine: string | null = null;
    if (windowPresent) {
      if (windowHasFragility) {
        commitmentWindowLine = "This window still depends on sustained validation.";
      } else {
        commitmentWindowLine = "The field is stabilizing around a narrower set of commitments.";
      }
    }

    // Movement memory — contextual window state observation
    let windowMovementLine: string | null = null;
    if (windowPresent) {
      windowMovementLine = "Alignment is holding, but still depends on proof.";
    } else if (windowForming) {
      windowMovementLine = "Commitment readiness is building.";
    }

    return { commitmentWindowLine, windowMovementLine };
  }, [
    commitmentBlockerTensions.length,
    orientationWithMemory.commitmentReadiness.canCommit,
    orientationWithMemory.hasBlockingTensions,
    portfolio.blocked.length,
    portfolio.portfolioState,
    strategicCenter.customerLag,
  ]);

  // Fragility — support breadth. Fires when a commitment window is open but the
  // underlying proof is narrow or concentrated. Mutually exclusive with counterforce
  // in commitment posture — one owns the ambiguity slot.
  const fragilityState = useMemo(() => {
    const windowPresent = orientationWithMemory.commitmentReadiness.canCommit;
    const isConverging = portfolio.portfolioState === "converging";

    // Only meaningful when there is a window or convergence to qualify
    if (!windowPresent && !isConverging) {
      return { fragilitySupportLine: null, fragilityMovementLine: null };
    }

    const safeCount = portfolio.safeToCommit.length;
    const tooEarlyCount = portfolio.tooEarly.length;
    const blockedCount = portfolio.blocked.length;

    // Support concentration — what is narrow about the current base
    let fragilitySupportLine: string | null = null;
    if (safeCount === 1 && (tooEarlyCount > 1 || blockedCount > 0)) {
      fragilitySupportLine = "Support remains concentrated around a single viable path.";
    } else if (isConverging && strategicCenter.customerLag && !windowPresent) {
      fragilitySupportLine = "Operational support is strengthening unevenly.";
    } else if (windowPresent && unresolvedAssumptionsCount > 2) {
      fragilitySupportLine = "The current coherence still relies on unresolved conditions.";
    } else if (windowPresent && tooEarlyCount > safeCount) {
      fragilitySupportLine = "Broader portfolio support is still forming.";
    }

    // Movement memory — concentration/breadth observation
    // Exclusive with commitmentWindowState.windowMovementLine (enforced in JSX)
    let fragilityMovementLine: string | null = null;
    if (windowPresent && strategicCenter.customerLag) {
      fragilityMovementLine = "Support remains concentrated around a narrow proof base.";
    } else if (isConverging && strategicCenter.customerLag) {
      fragilityMovementLine = "Validation strengthened confidence without fully broadening support.";
    } else if (windowPresent && blockedCount > 0) {
      fragilityMovementLine = "The commitment window is holding, but still depends on reinforcement.";
    }

    return { fragilitySupportLine, fragilityMovementLine };
  }, [
    orientationWithMemory.commitmentReadiness.canCommit,
    portfolio.blocked.length,
    portfolio.portfolioState,
    portfolio.safeToCommit.length,
    portfolio.tooEarly.length,
    strategicCenter.customerLag,
    unresolvedAssumptionsCount,
  ]);

  // Phase 36 — strategic center of gravity
  // Makes visible where the field is concentrating, what interpretation exerts pull,
  // and which tensions are shaping multiple regions simultaneously.
  const gravityState = useMemo(() => {
    const hasCenter = Boolean(strategicCenter.label);
    const centerHigh = strategicCenter.confidence === "high";
    const centerMedium = strategicCenter.confidence === "medium";
    const isConverging = portfolio.portfolioState === "converging";
    const hasSafeRoutes = portfolio.safeToCommit.length > 0;
    const momentumStrengthening = temporalPosture.momentum === "strengthening";

    // Commitment posture — directional gravity line (single line, highest resolution)
    // Only fires when a specific center is identifiable.
    // Note: "Validation is concentrating confidence here." removed — that text belongs to convergence.
    // Gravity only produces lines that convergence cannot (specific label, or medium-confidence pull).
    let commitmentGravityLine: string | null = null;
    if (hasCenter && strategicCenter.label) {
      if (centerHigh && (hasSafeRoutes || isConverging)) {
        commitmentGravityLine = `The field is increasingly organizing around ${lowerFirst(strategicCenter.label)}.`;
      } else if (centerMedium && isConverging) {
        commitmentGravityLine = "Signals continue pulling toward this interpretation.";
      }
    }

    // Instability — structural pull: which tension is shaping multiple regions at once
    // (routes + strategy or positioning simultaneously)
    const structuralTension =
      homePageTensions.find(
        (t) =>
          t.affected_routes.length > 0 &&
          (t.affected_strategy || t.affected_positioning),
      ) ?? null;
    let structuralPullNote: string | null = null;
    if (structuralTension) {
      if (structuralTension.affected_strategy && structuralTension.affected_positioning) {
        structuralPullNote = "This tension is shaping commitments across multiple strategic dimensions.";
      } else if (structuralTension.affected_routes.length > 1) {
        structuralPullNote = "This tension is narrowing viability across the current route set.";
      } else {
        structuralPullNote = "This tension shapes more than the immediate commitment decision.";
      }
    }

    // Validation region — where validation pressure is accumulating
    let validationGravityLine: string | null = null;
    if (hasCenter && strategicCenter.confidence !== "low") {
      if (momentumStrengthening && strengtheningSignal) {
        validationGravityLine = "Validation pressure is concentrating here.";
      } else if (isConverging && !strategicCenter.customerLag) {
        validationGravityLine = "Validation is increasingly aligning around one interpretation.";
      }
    }

    // Movement memory — gravity cadence (exclusive with window + fragility in JSX)
    let gravityMovementLine: string | null = null;
    if (hasCenter && hasSafeRoutes && momentumStrengthening) {
      gravityMovementLine = "Validation pressure increasingly reinforced one commitment path.";
    } else if (hasCenter && isConverging && persistentTensionIds.size > 0) {
      gravityMovementLine = "Operational gravity strengthened around a narrower route set.";
    } else if (hasCenter && momentumStrengthening && !hasSafeRoutes) {
      gravityMovementLine = "Signals continue concentrating around the current interpretation.";
    } else if (persistentTensionIds.size > 1 && structuralTension) {
      gravityMovementLine = "Several tensions now pull toward the same interpretation.";
    }

    return {
      commitmentGravityLine,
      structuralPullNote,
      validationGravityLine,
      gravityMovementLine,
    };
  }, [
    homePageTensions,
    persistentTensionIds.size,
    portfolio.portfolioState,
    portfolio.safeToCommit.length,
    strategicCenter.confidence,
    strategicCenter.customerLag,
    strategicCenter.label,
    strengtheningSignal,
    temporalPosture.momentum,
  ]);

  // Phase 37 — strategic counterforce + residual ambiguity
  // Expresses what continues resisting the dominant pull — competing themes, surviving
  // alternative paths, unresolved interpretive pressure — without undermining convergence.
  const counterforceState = useMemo(() => {
    const hasCompetingThemes = strategicCenter.competingThemes.length > 0;
    const hasMeaningfulDivergence = strategicCenter.hasMeaningfulDivergence;
    const hasAlternativePaths = portfolio.tooEarly.length > 0;
    // Only "isolated" — "accumulating"/"entrenched" are already covered by driftSignalLine (Phase 31)
    const hasResidualContradiction = temporalPosture.contradictionPressure === "isolated";
    const hasUnstableBeliefs = unstableAssumptionsCount > 0;
    const leadingCompetingTheme = strategicCenter.competingThemes[0] ?? null;
    const isConverging = portfolio.portfolioState === "converging";
    const hasSafeRoutes = portfolio.safeToCommit.length > 0;

    // Commitment posture — residual pull resisting the converging interpretation.
    // Appears after gravity line — PART 4 coexistence: gravity increasing while ambiguity persists.
    let commitmentCounterforceLine: string | null = null;
    if (hasMeaningfulDivergence && leadingCompetingTheme) {
      commitmentCounterforceLine = "Competing pressures continue shaping the read.";
    } else if (hasAlternativePaths && hasCompetingThemes) {
      commitmentCounterforceLine = "The field continues carrying unresolved pull.";
    } else if (hasResidualContradiction && hasUnstableBeliefs) {
      commitmentCounterforceLine = "Several signals still resist full stabilization.";
    }

    // Instability region — surviving alternative interpretation, named when a label is available.
    let instabilityCounterforceLine: string | null = null;
    if (hasMeaningfulDivergence && leadingCompetingTheme) {
      instabilityCounterforceLine = `Alternative pressure remains active around ${lowerFirst(leadingCompetingTheme.label)}.`;
    } else if (hasAlternativePaths && portfolio.tooEarly.length > 1) {
      instabilityCounterforceLine = "Alternative routes continue retaining partial support.";
    }

    // Validation region — where proof concentration is uneven across interpretations.
    let validationCounterforceLine: string | null = null;
    if (hasMeaningfulDivergence && (isConverging || hasSafeRoutes)) {
      // Key PART 4 case: convergence strengthening while alternatives retain evidence support.
      validationCounterforceLine = "Competing interpretations retain evidence support.";
    } else if (strategicCenter.customerLag && hasCompetingThemes && !hasMeaningfulDivergence) {
      validationCounterforceLine = "Validation remains uneven across the broader interpretation.";
    }

    // Movement memory — counterforce cadence.
    // Exclusive with window + fragility + gravity in JSX (all four form a priority chain).
    let counterforceMovementLine: string | null = null;
    if (hasMeaningfulDivergence && (hasSafeRoutes || isConverging)) {
      counterforceMovementLine = "Validation strengthened one interpretation without fully resolving the others.";
    } else if (hasAlternativePaths && strategicCenter.label) {
      counterforceMovementLine = "Alternative routes continue retaining partial support.";
    } else if (hasMeaningfulDivergence) {
      counterforceMovementLine = "Residual pressure continues shaping the field.";
    } else if (hasResidualContradiction) {
      counterforceMovementLine = "The broader interpretation remains unevenly stabilized.";
    }

    return {
      commitmentCounterforceLine,
      instabilityCounterforceLine,
      validationCounterforceLine,
      counterforceMovementLine,
    };
  }, [
    portfolio.portfolioState,
    portfolio.safeToCommit.length,
    portfolio.tooEarly.length,
    strategicCenter.competingThemes,
    strategicCenter.customerLag,
    strategicCenter.hasMeaningfulDivergence,
    strategicCenter.label,
    temporalPosture.contradictionPressure,
    unstableAssumptionsCount,
  ]);

  // conditionDiscipline — ownership rules + max-3 commitment posture cap
  // Structural cap: window/convergence (1 slot, mutually exclusive) +
  //   fragility/counterforce (1 slot, mutually exclusive) +
  //   gravity (label form shows freely; generic form suppressed when convergence fires)
  // = up to 3 condition lines in the commitment posture region.
  // Drift and reframing are additional but deduped against each other (Rule 4/4b).
  //
  // Ownership:
  //   Window    — owns actionability/readiness language
  //   Gravity   — owns field-concentration language (label form only alongside convergence)
  //   Fragility — owns narrow-support language (when no meaningful divergence)
  //   Counterforce — owns competing-theme language (when hasMeaningfulDivergence)
  //   Drift     — owns confidence-degradation language (suppressed when canCommit)
  //   Reframing — owns interpretive-evolution language (suppressed when drift fires without actual reframes)
  const conditionDiscipline = useMemo(() => {
    const rawWindow = commitmentWindowState.commitmentWindowLine;
    const rawConvergence = convergenceState.commitmentConvergenceLine;
    const rawFragility = fragilityState.fragilitySupportLine;
    const rawGravity = gravityState.commitmentGravityLine;
    const rawCounterforce = counterforceState.commitmentCounterforceLine;
    const rawDrift = driftSignalLine;
    const rawReframing = reframingState.commitmentReframingLine;

    // Rule 1 — Window supersedes convergence.
    // Window owns actionability; when it fires, convergence is implied by the anchor + window.
    const convergenceLine = rawWindow ? null : rawConvergence;

    // Rule 2 — Gravity: suppress non-label variants when convergence occupies the same slot.
    // Gravity's only distinct contribution is the specific theme label. Generic "signals pulling"
    // variants collide with convergence's semantic territory when both fire.
    const gravityHasLabel = Boolean(rawGravity?.startsWith("The field is increasingly organizing"));
    const gravityLine = (convergenceLine && !gravityHasLabel) ? null : rawGravity;

    // Rule 3 — Fragility vs counterforce: one per ambiguity slot.
    // Both say "ambiguity remains" — express once, clearly (PART 7).
    // Counterforce wins when hasMeaningfulDivergence: it names the competing theme.
    // Fragility wins otherwise: support breadth is the more actionable signal.
    let fragiliteLine = rawFragility;
    let counterforceLine = rawCounterforce;
    if (rawFragility && rawCounterforce) {
      if (strategicCenter.hasMeaningfulDivergence) {
        fragiliteLine = null;
      } else {
        counterforceLine = null;
      }
    }

    // Rule 4 — Drift/reframing: reframing suppresses when drift fires without actual reframes.
    // Drift owns confidence degradation; reframing owns interpretive change.
    // When drift fires and there are no actual reframed beliefs (only cooling pattern), both
    // would say "direction is weakening" — suppress the weaker reframing signal.
    // Rule 4b — Drift suppresses when canCommit: "window open" + "commitment drifting" is
    // contradictory. Drift signals deterioration; a commitment window means readiness exists.
    const canCommit = orientationWithMemory.commitmentReadiness.canCommit;
    const driftLine = canCommit ? null : rawDrift;
    const reframedCount = evolvedAssumptions.filter((a) => a.hasReframing).length;
    const reframingLine = (driftLine && reframedCount === 0) ? null : rawReframing;

    // Validation discipline — gravity/counterforce suppressions.
    // Gravity validation suppresses when drift context already covers proof-aging pressure.
    // Counterforce validation suppresses when reframing consequence already expresses
    // interpretation-shifting consequences — same semantic territory.
    const suppressGravityValidation = driftContextLines.length > 0;
    const suppressCounterforceValidation = reframingState.consequenceLines.length > 0;

    // Cadence discipline — reframing movement line.
    // Suppress when: (a) reframing already visible in commitment posture (avoid repetition),
    // or (b) drift fires without actual reframes (weak signal — cadence should not amplify it).
    const suppressReframingCadence =
      Boolean(reframingLine) || (Boolean(rawDrift) && reframedCount === 0);

    return {
      convergenceLine,
      fragiliteLine,
      gravityLine,
      counterforceLine,
      driftLine,
      reframingLine,
      suppressGravityValidation,
      suppressCounterforceValidation,
      suppressReframingCadence,
    };
  }, [
    commitmentWindowState.commitmentWindowLine,
    convergenceState.commitmentConvergenceLine,
    counterforceState.commitmentCounterforceLine,
    driftContextLines.length,
    driftSignalLine,
    evolvedAssumptions,
    fragilityState.fragilitySupportLine,
    gravityState.commitmentGravityLine,
    orientationWithMemory.commitmentReadiness.canCommit,
    reframingState.commitmentReframingLine,
    reframingState.consequenceLines.length,
    strategicCenter.hasMeaningfulDivergence,
  ]);

  // Legacy route options from useClientViewData (non-hierarchy clients)
  const routeOptions = useMemo(() => {
    const buckets: Record<RouteCategory, typeof allActions> = {
      Fix: [],
      Improve: [],
      Create: [],
    };

    allActions.forEach((action) => {
      buckets[action.category].push(action);
    });

    return ROUTE_ORDER.map((category) => {
      const lead = buckets[category][0] ?? null;
      return {
        category,
        count: buckets[category].length,
        available: buckets[category].length > 0,
        leadTitle: toSentence(lead?.title) || ROUTE_FALLBACK_HEADLINE[category],
        leadStatus: lead ? statusLabel(lead.status) : "No route",
        optionTitles: buckets[category].slice(0, 3).map((action) => toSentence(action.title)).filter(Boolean),
      };
    });
  }, [allActions]);

  // ── Hierarchy-aware map data ────────────────────────────────────────────────
  // These must be defined before preferredRoute / selectedRouteOption / hoverRouteOption
  // because those hooks depend on effectiveRouteOptions.

  const hierarchyRouteOptions = useMemo(() => {
    if (!hasHierarchy) return null;
    return ROUTE_ORDER.map((category) => {
      const key = category.toLowerCase() as "fix" | "improve" | "create";
      const categoryRoutes = topLevelRoutes.filter((r) => r.category === key);
      const lead = categoryRoutes[0] ?? null;
      const claimState = lead?.claim_id ? (claimsMap.get(lead.claim_id)?.state ?? null) : null;
      return {
        category,
        count: categoryRoutes.length,
        available: categoryRoutes.length > 0,
        leadTitle: toSentence(lead?.title) || ROUTE_FALLBACK_HEADLINE[category],
        leadStatus: claimState ? claimState.replace(/_/g, " ") : (lead ? "active" : "No route"),
        optionTitles: categoryRoutes.slice(0, 3).map((r) => toSentence(r.title)).filter(Boolean),
      };
    });
  }, [hasHierarchy, topLevelRoutes, claimsMap]);

  const effectiveRouteOptions = hierarchyRouteOptions ?? routeOptions;

  const mapCurrentScore = hasHierarchy && displayMojoScore
    ? displayMojoScore.total_score
    : confidenceTo;

  const mapReachableScore = useMemo(() => {
    if (!hasHierarchy || !displayMojoScore) return null;
    return computeReachableScore(displayMojoScore);
  }, [hasHierarchy, displayMojoScore]);

  const mapDesiredScore = useMemo(() => {
    if (!hasHierarchy || !displayMojoScore || mapReachableScore === null) return confidenceTarget;
    return computeUnlockableScore(mapReachableScore, displayMojoScore);
  }, [hasHierarchy, displayMojoScore, mapReachableScore, confidenceTarget]);

  // Everything below reads effectiveRouteOptions — defined above, so no TDZ.

  const preferredRoute = useMemo<RouteCategory>(() => {
    if (!hasHierarchy && strongestAction?.category) return strongestAction.category;
    const firstAvailable = effectiveRouteOptions.find((route) => route.available);
    return firstAvailable ? firstAvailable.category : "Fix";
  }, [hasHierarchy, effectiveRouteOptions, strongestAction?.category]);

  const selectedRouteOption = useMemo(
    () => effectiveRouteOptions.find((route) => route.category === selectedMapRoute) ?? effectiveRouteOptions[0],
    [effectiveRouteOptions, selectedMapRoute],
  );

  const hoverRouteOption = useMemo(
    () =>
      hoveredMapRoute
        ? effectiveRouteOptions.find((route) => route.category === hoveredMapRoute) ?? null
        : null,
    [hoveredMapRoute, effectiveRouteOptions],
  );

  const mapActionHeadline = useMemo(() => {
    if (hasHierarchy && displayMojoScore && displayMojoScore.projected_raisers.length > 0) {
      return displayMojoScore.projected_raisers[0].action_description;
    }
    const eff = effectiveRouteOptions.find((r) => r.category === selectedMapRoute);
    return eff?.leadTitle || actionHeadline;
  }, [hasHierarchy, displayMojoScore, effectiveRouteOptions, selectedMapRoute, actionHeadline]);

  const routeHoverText = useCallback((category: RouteCategory) => {
    const route = effectiveRouteOptions.find((item) => item.category === category);
    if (!route) return `${category} route`;
    if (!route.available) return `${category} route · no live options yet`;
    const options = route.optionTitles.length > 0
      ? route.optionTitles.map((item) => shorten(item, 56)).join(" • ")
      : shorten(route.leadTitle, 56);
    return `${category} route · ${route.count} option${route.count === 1 ? "" : "s"} · ${options}`;
  }, [effectiveRouteOptions]);

  const evidencePresentLabels = useMemo(
    () => evidence.sources.filter((source) => source.present).map((source) => source.label),
    [evidence.sources],
  );

  const evidenceMissingLabels = useMemo(
    () => evidence.sources.filter((source) => !source.present).map((source) => source.label),
    [evidence.sources],
  );

  const criticalActionCount = useMemo(
    () => allActions.filter((item) => item.category === "Fix" || item.category === "Improve").length,
    [allActions],
  );

  const unownedCriticalCount = useMemo(
    () => allActions.filter((item) => (item.category === "Fix" || item.category === "Improve") && !item.isOwned).length,
    [allActions],
  );

  const plannedCriticalCount = useMemo(
    () => allActions.filter((item) => (item.category === "Fix" || item.category === "Improve") && item.status === "planned").length,
    [allActions],
  );

  const topAssumption = useMemo(
    () => toSentence(strongestAction?.assumptions?.[0]),
    [strongestAction?.assumptions],
  );

  const topOutcomeIfSolved = useMemo(
    () => toSentence(strongestAction?.ifSolved?.[0]),
    [strongestAction?.ifSolved],
  );

  const topSuccessCriterion = useMemo(
    () => toSentence(strongestAction?.successCriteria?.[0]),
    [strongestAction?.successCriteria],
  );

  const signalRows = useMemo(
    () => [
      { key: "Proof", value: `${Math.round(signalStrength.proof.value)} · ${signalStrength.proof.level.toUpperCase()}` },
      { key: "Ownership", value: `${Math.round(signalStrength.ownership.value)} · ${signalStrength.ownership.level.toUpperCase()}` },
      { key: "Execution", value: `${Math.round(signalStrength.execution.value)} · ${signalStrength.execution.level.toUpperCase()}` },
    ],
    [
      signalStrength.execution.level,
      signalStrength.execution.value,
      signalStrength.ownership.level,
      signalStrength.ownership.value,
      signalStrength.proof.level,
      signalStrength.proof.value,
    ],
  );

  const weakestSignalRow = useMemo(
    () =>
      [...signalRows].sort((a, b) => {
        const aValue = Number(a.value.split("·")[0]?.trim() || 0);
        const bValue = Number(b.value.split("·")[0]?.trim() || 0);
        return aValue - bValue;
      })[0] ?? null,
    [signalRows],
  );

  const drawerSections = useMemo<Record<DrawerKey, DrawerSection>>(
    () => {
      if (isEarlyPhase) {
        const diagHeadline  = diagnostic?.headline  || toSentence(primaryConstraint?.title) || "The picture is still forming.";
        const diagSubhead   = diagnostic?.subhead   || toSentence(primaryConstraint?.detail) || "More evidence is needed before a clear direction can be confirmed.";
        const diagObs       = diagnostic?.observations.filter(Boolean) ?? [];
        const diagTensions  = diagnostic?.tensions.filter(Boolean) ?? [];
        const diagMissing   = diagnostic?.missingEvidence.filter(Boolean) ?? [];
        const diagQuestions = diagnostic?.questionsToInvestigate.filter(Boolean) ?? [];
        const missingLabel  = diagMissing.length > 0
          ? diagMissing.slice(0, 3).join(" · ")
          : evidenceMissingLabels.length > 0 ? evidenceMissingLabels.join(", ") : "None identified";
        const nextLearning  = diagnostic?.recommendedNextLearningStep ?? null;

        return {
          why: {
            title: "WHAT WE'RE SEEING",
            headline: diagHeadline,
            big: diagSubhead,
            rows: [
              { key: "Pattern", value: diagObs.length > 0 ? diagObs[0] : (toSentence(primaryConstraint?.title) || "Still emerging") },
              { key: "Tensions", value: diagTensions.length > 0 ? diagTensions[0] : "None identified yet" },
              { key: "Evidence present", value: evidencePresentLabels.length > 0 ? evidencePresentLabels.join(", ") : "None captured yet" },
            ],
          },
          blocking: {
            title: "WHAT'S STILL MISSING",
            headline: diagMissing.length > 0 ? `${diagMissing.length} gap${diagMissing.length === 1 ? "" : "s"} flagged by analysis.` : evidenceMissingLabels.length > 0 ? `${evidenceMissingLabels.length} evidence type${evidenceMissingLabels.length === 1 ? "" : "s"} not yet captured.` : "No obvious evidence gap identified.",
            big: nextLearning || "These evidence types would materially sharpen the diagnosis.",
            compact: true,
            rows: [
              { key: "Missing", value: missingLabel },
              { key: "Proof signal", value: signalRows.find((r) => r.key === "Proof")?.value ?? "Not yet measured" },
            ],
          },
          signals: {
            title: "SIGNAL LEVELS",
            headline: weakestSignalRow ? `${weakestSignalRow.key} is the weakest signal right now.` : "Signal read not available.",
            compact: true,
            rows: [
              { key: "Missing evidence", value: evidenceMissingLabels.length > 0 ? evidenceMissingLabels.join(", ") : "No obvious gap" },
              { key: "Signal levels", value: signalRows.map((row) => `${row.key} ${row.value}`).join(" · ") },
            ],
          },
          progress: {
            title: "QUESTIONS TO INVESTIGATE",
            headline: diagQuestions.length > 0
              ? diagQuestions[0]
              : evidencePresentLabels.length > 0
                ? `${evidencePresentLabels.length} of ${evidencePresentLabels.length + evidenceMissingLabels.length} evidence types present`
                : "No evidence captured yet",
            compact: true,
            rows: [
              ...(diagQuestions.length > 1 ? [{ key: "Also", value: diagQuestions.slice(1, 3).join(" · ") }] : []),
              { key: "Present", value: evidencePresentLabels.length > 0 ? evidencePresentLabels.join(", ") : "None" },
              { key: "Missing", value: evidenceMissingLabels.length > 0 ? evidenceMissingLabels.join(", ") : "None" },
            ],
          },
        };
      }

      return {
        why: {
          title: "WHY THIS MOVE",
          headline: commandActionTitle || "This is the next move with the highest leverage right now.",
          big:
            toSentence(strongestAction?.whyItMatters) ||
            "This is the move most likely to improve the current decision path.",
          rows: [
            {
              key: "If this lands",
              value: topOutcomeIfSolved || "A clearer next action becomes possible.",
            },
            {
              key: "Success signal",
              value: topSuccessCriterion || `Confidence moves by +${confidenceLift}.`,
            },
            {
              key: "Owner",
              value: toSentence(strongestAction?.primaryOwner) || "Unassigned",
            },
          ],
        },
        blocking: {
          title: "WHAT IS BLOCKING",
          headline: toSentence(primaryConstraint?.title) || "Core blocker is still unresolved.",
          big: toSentence(primaryConstraint?.detail) || "No validated blocker statement has been captured yet.",
          compact: true,
          rows: [
            {
              key: "Assumption",
              value: topAssumption || "The key assumption has not been made explicit yet.",
            },
            {
              key: "Execution state",
              value:
                unownedCriticalCount > 0
                  ? `${unownedCriticalCount} of ${Math.max(1, criticalActionCount)} critical actions are unowned`
                  : plannedCriticalCount > 0
                    ? `${plannedCriticalCount} critical actions are still planned`
                    : "Critical work is already moving",
            },
          ],
        },
        signals: {
          title: "SIGNALS",
          headline:
            weakestSignalRow ? `${weakestSignalRow.key} is the weakest signal right now.` : "Signal read not available.",
          compact: true,
          rows: [
            {
              key: "Missing evidence",
              value: evidenceMissingLabels.length > 0 ? evidenceMissingLabels.join(", ") : "No obvious evidence gap",
            },
            {
              key: "Signal levels",
              value: signalRows.map((row) => `${row.key} ${row.value}`).join(" · "),
            },
          ],
        },
        progress: {
          title: "PROGRESS",
          headline: `${baseConfidence} → ${baseConfidence + confidenceLift}`,
          compact: true,
          rows: [
            { key: "Movement", value: `${baseConfidence} → ${baseConfidence + confidenceLift}` },
          ],
        },
      };
    },
    [
      isEarlyPhase,
      baseConfidence,
      confidenceLift,
      confidenceTarget,
      commandActionTitle,
      criticalActionCount,
      evidencePresentLabels,
      evidenceMissingLabels,
      primaryConstraint?.detail,
      primaryConstraint?.title,
      primaryDesiredOutcome?.leadingIndicator,
      primaryDesiredOutcome?.statement,
      strongestAction?.primaryOwner,
      strongestAction?.whyItMatters,
      plannedCriticalCount,
      signalRows,
      topAssumption,
      topOutcomeIfSolved,
      topSuccessCriterion,
      unownedCriticalCount,
      weakestSignalRow,
      diagnostic,
    ],
  );

  const combinedDrawerSections = useMemo(
    () => [drawerSections.why, drawerSections.blocking, drawerSections.signals, drawerSections.progress],
    [drawerSections],
  );

  const narrativeRows = useMemo(() => {
    const obs    = toSentence(primaryConstraint?.title);
    const detail = toSentence(primaryConstraint?.detail) || obs;
    const ifMissed = toSentence(strongestAction?.ifMissed?.[0]);

    // For early phases, prefer diagnostic data from Dify when available
    const diagObs     = diagnostic?.observations?.[0] ?? "";
    const diagObs2    = diagnostic?.observations?.[1] ?? "";
    const diagTension = diagnostic?.tensions?.[0] ?? "";
    const diagMissing = diagnostic?.missingEvidence?.[0] ?? "";
    const diagQ       = diagnostic?.questionsToInvestigate?.[0] ?? "";
    const diagImpl    = diagnostic?.possibleImplications?.[0] ?? "";

    if (phase === "outside_signals") {
      const row1 = diagObs  || obs    || "Outside signals are still forming";
      const row2 = diagObs2 || detail || "A second signal appears in the same area";
      const row3 = diagMissing || diagQ  || actionHeadline || "Still unclear what the company's own evidence shows";
      const row4 = diagTension || ifMissed || "Company or customer evidence would confirm or contradict this";
      return [
        { label: "What keeps appearing",         lead: "", emphasis: row1, tail: row1 === obs && !obs ? " — more signals needed." : "." },
        { label: "",                             lead: "", emphasis: row2, tail: diagObs2 ? "." : " — not yet confirmed." },
        { label: "What's still unclear",         lead: "", emphasis: row3, tail: ". Without that, this is a hypothesis." },
        { label: "What would sharpen confidence",lead: "", emphasis: row4, tail: "." },
      ].filter((r) => r.emphasis);
    }

    if (phase === "validate_outside") {
      const row1 = diagObs     || obs    || "The external signals are consistent enough to share";
      const row2 = diagTension || detail || "The outside read may not match how you see yourselves";
      const row3 = diagMissing || diagQ  || actionHeadline;
      const row4 = ifMissed || "The next phase starts from a shared understanding";
      return [
        { label: "What the outside view says", lead: "", emphasis: row1, tail: ". This is what the outside read looks like before you weigh in." },
        { label: "Why it matters to check",    lead: "", emphasis: row2, tail: ". The client's reaction shapes what comes next." },
        { label: "What we haven't heard",      lead: "", emphasis: row3, tail: ". That's the gap this moment closes." },
        { label: "What changes if we get it",  lead: "", emphasis: row4, tail: ", not an untested assumption." },
      ];
    }

    if (phase === "diagnose") {
      const row1 =
        strategicCenter.shouldLeadExplanations && strategicCenter.label
          ? `The read is increasingly centered on ${strategicCenter.label}`
          : diagObs || obs || "A pattern is emerging but not yet confirmed";
      const row2 =
        identityNarrative.publicIdentity
          ? `Outside perception reads as ${lowerFirst(identityNarrative.publicIdentity)}`
          : diagObs2 || detail || "A second signal points in the same direction";
      const row3 =
        reconciliationNarrative?.unresolvedQuestion ||
        (strategicCenter.customerLag && strategicCenter.label
          ? `Customer proof has not yet confirmed whether ${strategicCenter.label} changes real decisions`
          : diagMissing || diagQ || diagTension || actionHeadline || "Still unclear what would confirm or change this");
      const row4 =
        strategicCenter.shouldLeadExplanations && strategicCenter.label
          ? `We still need direct customer evidence that ${strategicCenter.label} change partner choice or repeat buying`
          : leadMainRationale?.mustBecomeTrue ||
            ifMissed ||
            diagMissing ||
            "Direct customer evidence would move this from likely to clear";
      const row5 =
        leadMainRationale?.whyThisRouteExists ||
        (strategicCenter.label
          ? `If this holds, the focus is likely to shift toward routes built around ${strategicCenter.label}`
          : diagImpl || diagTension || "If this holds, the focus likely shifts to closing that gap");
      return [
        { label: "Why this is surfacing",        lead: "", emphasis: row1, tail: diagObs  ? "." : (obs ? "." : " — not yet confirmed.") },
        { label: "Public context",               lead: "", emphasis: row2, tail: "." },
        { label: "What's still unclear",         lead: "", emphasis: row3, tail: "." },
        { label: "What would sharpen confidence",lead: "", emphasis: row4, tail: "." },
        { label: "Possible implication",         lead: "", emphasis: row5, tail: " — not a recommendation yet." },
      ].filter((r) => r.emphasis);
    }

    if (phase === "validate_diagnose") {
      const row1 = diagObs  || obs    || "A working direction is in place";
      const row2 = diagObs2 || detail || "A second signal reinforces it";
      const row3 = diagMissing || diagQ  || diagTension || actionHeadline || "Still unclear what would confirm or change this";
      const row4 = ifMissed || diagMissing || "Getting the client's read separates confirmed from still-open";
      const row5 = diagImpl || diagTension || "If confirmed, the next phase starts from a shared foundation";
      return [
        { label: "Why this is surfacing",        lead: "", emphasis: row1, tail: diagObs  ? "." : (obs ? " — some of it backed by evidence, some still assumed." : " — parts are still assumed.") },
        { label: "",                             lead: "", emphasis: row2, tail: diagObs2 ? "." : "." },
        { label: "What's still unclear",         lead: "", emphasis: row3, tail: " — that's what needs settling before the direction gets locked." },
        { label: "What would sharpen confidence",lead: "", emphasis: row4, tail: "." },
        { label: "Possible implication",         lead: "", emphasis: row5, tail: " — not a decision yet." },
      ].filter((r) => r.emphasis);
    }

    if (phase === "focus") return [
      {
        label: "What the evidence says",
        lead: "",
        emphasis: leadMainRationale?.whyThisRouteExists || obs || "A direction is beginning to stand out",
        tail: ".",
      },
      {
        label: "What supports this focus",
        lead: "",
        emphasis: leadMainRationale?.whatSupportsIt || detail || "The current focus has more support than the alternatives",
        tail: ".",
      },
      {
        label: "The priority",
        lead: "",
        emphasis: actionHeadline,
        tail: `. This is the route currently worth validating before stronger commitment.`,
      },
      {
        label: "What would shift it",
        lead: "",
        emphasis: leadMainRationale?.uncertainty || leadMainRationale?.couldWeaken || ifMissed || "If the evidence changes, the focus should change with it",
        tail: ".",
      },
    ];

    if (phase === "validate_focus") return [
      {
        label: "What the evidence says",
        lead: "",
        emphasis: leadMainRationale?.whyThisRouteExists || obs || "A direction has been chosen",
        tail: ".",
      },
      {
        label: "What needs to be true",
        lead: "",
        emphasis: leadMainRationale?.mustBecomeTrue || detail || "The route assumptions still need one more pass",
        tail: ".",
      },
      {
        label: "The last open question",
        lead: "",
        emphasis: leadMainRationale?.uncertainty || actionHeadline,
        tail: ".",
      },
      {
        label: "What happens if we skip",
        lead: "",
        emphasis: leadMainRationale?.couldWeaken || ifMissed || "Execution would begin with an untested assumption still open",
        tail: ".",
      },
    ];

    if (phase === "flow") return [
      { label: "What's in motion", lead: "", emphasis: obs    || "The route is in execution",                     tail: obs ? ". That's what the work is built around." : "." },
      { label: "Why it matters",   lead: "", emphasis: detail || "Keeping this visible keeps execution on track", tail: "." },
      { label: "The priority",     lead: "", emphasis: actionHeadline,                                           tail: ". That drives the outcome." },
      { label: "What to watch",    lead: "", emphasis: ifMissed || "If progress stalls without explanation, the assumptions need a look", tail: "." },
    ];

    // validate_flow
    return [
      { label: "What the data shows",     lead: "", emphasis: obs    || "Execution is in progress",         tail: obs ? ". Step back and check whether it's working." : " — step back and measure." },
      { label: "What to measure",         lead: "", emphasis: detail || "Results should be visible by now", tail: ". If they're flat, that's worth knowing." },
      { label: "The question",            lead: "", emphasis: actionHeadline,                              tail: ". That's what this moment is for." },
      { label: "What changes with drift", lead: "", emphasis: ifMissed || "The route gets examined, not abandoned", tail: " — small corrections here prevent larger ones later." },
    ];
  }, [
    actionHeadline,
    diagnostic,
    identityNarrative.publicIdentity,
    leadMainRationale,
    phase,
    primaryConstraint?.detail,
    primaryConstraint?.title,
    reconciliationNarrative?.unresolvedQuestion,
    strategicCenter.customerLag,
    strategicCenter.label,
    strategicCenter.shouldLeadExplanations,
    strongestAction?.ifMissed,
  ]);

  const clearAsync = useCallback(() => {
    if (typingRef.current !== null) {
      window.clearInterval(typingRef.current);
      typingRef.current = null;
    }

    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  const typeSystemLine = useCallback(
    (text: string, onDone?: () => void) => {
      if (typingRef.current !== null) {
        window.clearInterval(typingRef.current);
        typingRef.current = null;
      }

      setSystemLineOn(true);
      setSystemLine("");
      let index = 0;

      typingRef.current = window.setInterval(() => {
        index += 1;
        setSystemLine(text.slice(0, index));
        if (index >= text.length) {
          if (typingRef.current !== null) {
            window.clearInterval(typingRef.current);
            typingRef.current = null;
          }

          if (onDone) {
            later(onDone, 300);
          }
        }
      }, 22);
    },
    [later],
  );

  const animateConfidenceTo = useCallback((from: number, to: number, ms: number, onDone?: () => void) => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const start = performance.now();

    const tick = (now: number) => {
      const progress = clamp((now - start) / ms, 0, 1);
      const eased = 1 - (1 - progress) ** 3;
      setConfidenceTo(Math.round(from + (to - from) * eased));

      if (progress < 1) {
        rafRef.current = window.requestAnimationFrame(tick);
        return;
      }

      rafRef.current = null;
      if (onDone) onDone();
    };

    rafRef.current = window.requestAnimationFrame(tick);
  }, []);

  const resetCommit = useCallback(() => {
    clearAsync();
    setCommitState("idle");
    setSystemLine("");
    setSystemLineOn(false);
    setConfidenceFrom(baseConfidence);
    setConfidenceTo(baseConfidence);
    setEvidenceChecks(evidenceConditions.map(() => false));
    setCommittedAt(null);
  }, [baseConfidence, clearAsync, evidenceConditions]);

  const commitAgree = useCallback(
    (targetOverride?: number, messageOverride?: string) => {
      clearAsync();
      setCommitState("committing");
      setLayer("command");
      setDrawerKey(null);
      setEvidenceChecks(evidenceConditions.map(() => false));
      setConfidenceFrom(baseConfidence);
      setConfidenceTo(baseConfidence);

      const target = clamp(targetOverride ?? baseConfidence + confidenceLift, baseConfidence + 1, 98);

      typeSystemLine("LOGGING COMMIT · RECOMPUTING", () => {
        animateConfidenceTo(baseConfidence, target, 900, () => {
          setCommittedAt(new Date());
          setCommitState("committed");
          const message = messageOverride || `CONFIDENCE ${baseConfidence} → ${target} · STAGE ${stageLabel(phase).toUpperCase()} ADVANCING`;
          typeSystemLine(message, () => {
            later(() => {
              setCommitState("next-revealed");
              setSystemLineOn(false);
            }, 700);
          });
        });
      });
    },
    [
      animateConfidenceTo,
      baseConfidence,
      clearAsync,
      confidenceLift,
      evidenceConditions,
      later,
      phase,
      typeSystemLine,
    ],
  );

  const commitDisagree = useCallback(() => {
    clearAsync();
    setCommitState("waiting");
    setLayer("command");
    setDrawerKey(null);
    setEvidenceChecks(evidenceConditions.map(() => false));
    setConfidenceFrom(baseConfidence);
    setConfidenceTo(baseConfidence);
    const n = evidenceConditions.length;
    typeSystemLine(`DECISION PAUSED · ${n} CONDITION${n === 1 ? "" : "S"} REQUESTED`);
  }, [baseConfidence, clearAsync, evidenceConditions, typeSystemLine]);

  const commitNeedEvidence = useCallback(() => {
    clearAsync();
    setCommitState("waiting");
    setLayer("command");
    setDrawerKey(null);
    setConfidenceFrom(baseConfidence);
    setConfidenceTo(baseConfidence);
    setEvidenceChecks(evidenceConditions.map(() => false));
    const n = evidenceConditions.length;
    typeSystemLine(`DECISION PAUSED · ${n} CONDITION${n === 1 ? "" : "S"} REQUESTED`);
  }, [baseConfidence, clearAsync, evidenceConditions, typeSystemLine]);

  const resolveEvidence = useCallback(() => {
    if (commitState !== "waiting") return;

    Array.from({ length: evidenceConditions.length }, (_, i) => i).forEach((index) => {
      later(() => {
        setEvidenceChecks((current) => {
          const next = [...current];
          next[index] = true;
          return next;
        });

        if (index === evidenceConditions.length - 1) {
          later(() => {
            commitAgree(undefined, "EVIDENCE SATISFIED · COMMITTING NEXT MOVE");
          }, 500);
        }
      }, 500 + index * 600);
    });
  }, [commitAgree, commitState, evidenceConditions, later]);

  const openDrawer = useCallback((key: DrawerKey = "why") => {
    setDrawerKey(key);
    setLayer("drawer");
  }, []);

  const closeDrawer = useCallback(() => {
    if (layer !== "drawer") return;
    setLayer("command");
    setDrawerKey(null);
  }, [layer]);

  const onHotPhraseActivate = useCallback(
    (hint: DrawerKey) => {
      if (accessModes.inline) {
        openDrawer(hint);
        return;
      }
      setLayer("map");
    },
    [accessModes.inline, openDrawer],
  );

  const goToMainSite = useCallback(() => {
    navigate("/");
  }, [navigate]);

  const goToRoutesPreview = useCallback(() => {
    navigate(CLIENT_REFINE_PREVIEW_ROUTES_ROUTE);
  }, [navigate]);

  const goToWorkshop = useCallback(() => {
    navigate(CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE);
  }, [navigate]);

  const goToWorkshopInputs = useCallback(() => {
    const stage = (phase === "outside_signals" || phase === "validate_outside") ? "outside" : "org";
    navigate(`${CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE}?stage=${stage}`);
  }, [navigate, phase]);

  const navigateToLens = useCallback((key: string) => {
    if (key === "routes") navigate(CLIENT_REFINE_PREVIEW_ROUTES_ROUTE);
    else if (key === "council") navigate(`${CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE}?tab=council`);
    else navigate(`${CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE}?tab=${key}`);
  }, [navigate]);

  const showHoverTip = useCallback((event: ReactMouseEvent<HTMLElement>, text: string) => {
    const stageBounds = stageRef.current?.getBoundingClientRect();
    if (!stageBounds) return;

    setHoverTip({
      text,
      x: event.clientX - stageBounds.left + 14,
      y: event.clientY - stageBounds.top + 14,
    });
  }, []);

  const hideHoverTip = useCallback(() => {
    setHoverTip(null);
  }, []);

  const moveHoverTip = useCallback((event: ReactMouseEvent<HTMLElement>, text: string) => {
    showHoverTip(event, text);
  }, [showHoverTip]);

  useEffect(() => {
    try {
      const loaded = parseAccessModes(window.localStorage.getItem(MODE_STORAGE_KEY));
      setAccessModes(loaded);
    } catch {
      setAccessModes(DEFAULT_ACCESS_MODES);
    }
  }, []);

  useEffect(() => {
    const stored = {
      "mode-pills": accessModes.pills,
      "mode-inline": accessModes.inline,
      "mode-edge": accessModes.edge,
      "mode-footer": accessModes.footer,
    };

    window.localStorage.setItem(MODE_STORAGE_KEY, JSON.stringify(stored));
  }, [accessModes]);

  useEffect(() => {
    if (commitState === "idle") {
      setConfidenceFrom(baseConfidence);
      setConfidenceTo(baseConfidence);
    }
  }, [baseConfidence, commitState]);

  useEffect(() => {
    setSelectedMapRoute(preferredRoute);
  }, [activeCompany?.id, preferredRoute]);

  useEffect(() => {
    setLayer("command");
    setDrawerKey(null);
    setHoverTip(null);
    resetCommit();
  }, [activeCompany?.id, resetCommit]);

  useEffect(() => {
    if (layer !== "map") {
      setHoveredMapRoute(null);
      setHoverTip(null);
    }
  }, [layer]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const lower = event.key.toLowerCase();

      if (event.key === "Escape") {
        if (layer === "drawer") {
          closeDrawer();
          return;
        }
        setLayer("command");
        resetCommit();
        return;
      }

      if (lower === "m") {
        setLayer("map");
        setDrawerKey(null);
        return;
      }

      if (lower === "n") {
        setLayer("narrative");
        setDrawerKey(null);
        return;
      }

      if (event.key === "1") openDrawer("why");
      if (event.key === "2") openDrawer("blocking");
      if (event.key === "3") openDrawer("signals");
      if (event.key === "4") openDrawer("progress");
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeDrawer, layer, openDrawer, resetCommit]);

  useEffect(() => () => clearAsync(), [clearAsync]);

  const currentDrawer = drawerKey ? drawerSections[drawerKey] : null;

  const stageClassName = [
    "crpv-stage",
    layer === "command" ? "state-command" : "",
    layer === "map" ? "state-map" : "",
    layer === "narrative" ? "state-narrative" : "",
    layer === "drawer" ? "state-drawer" : "",
    commitState !== "idle" ? commitState : "",
    accessModes.pills ? "mode-pills" : "",
    accessModes.inline ? "mode-inline" : "",
    accessModes.edge ? "mode-edge" : "",
    accessModes.footer ? "mode-footer" : "",
    `mode-${operatingMode}`,
    hasHierarchy ? "has-hierarchy" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const showStageStrip = commitState !== "idle";

  return (
      <section className="crpv-page">
        {!hasCompany ? (
          <article className="crpv-empty-state">
            <p className="cap">MojoMap</p>
            <h1>Select a company to begin.</h1>
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
                    <small>
                      {company.quarter || "Quarter"} · {company.archetype || "Archetype"}
                    </small>
                  </button>
                ))}
              </div>
            ) : (
              <p className="crpv-muted">No companies available.</p>
            )}
            {/* Integrity sweep: renders regardless of the fallback company injection. */}
            {companiesFetchError && (
              <p className="crpv-muted" style={{ color: "#c45c00" }}>Couldn't load companies — try reloading.</p>
            )}
          </article>
        ) : (
          <div ref={stageRef} className={stageClassName}>
            {analysisRunning && (
              <div className="crpv-analysis-bar" aria-hidden>
                <div className="crpv-analysis-bar-fill" />
              </div>
            )}
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
                    <span className="cap" style={{ marginLeft: 4 }}>· DAY {ENGAGEMENT_DAY ?? "—"} · {dominantClaimState ? dominantClaimState.replace(/_/g, " ").toUpperCase() : stageLabel(phase).toUpperCase()}</span>
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
                  <span className="cap">[{toSentence(activeCompany?.name) || "COMPANY"}] · DAY {ENGAGEMENT_DAY ?? "—"} · {dominantClaimState ? dominantClaimState.replace(/_/g, " ").toUpperCase() : stageLabel(phase).toUpperCase()}</span>
                )}
              </div>
            </header>

            {showStageStrip ? (
              <div className="crpv-stage-strip" aria-hidden>
                {stageStrip.map((item, index) => (
                  <span
                    key={item}
                    className={`s ${index < stageIndex ? "done" : ""} ${index === stageIndex ? "current" : ""}`.trim()}
                  >
                    {String(index + 1).padStart(2, "0")} · {item}
                  </span>
                ))}
              </div>
            ) : null}

            <section className="crpv-command-layer">
              {!commitState || commitState !== "next-revealed" ? (
                hasHierarchy ? (
                  <div className="crpv-homepage-sidebar-layout">
                    <WorkshopSidebar
                      activeTab={null}
                      onTabClick={(tab) => navigate(`${CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE}?tab=${tab}`)}
                      onHome={() => {}}
                      onCompany={() => navigate(CLIENT_REFINE_PREVIEW_COMPANY_ROUTE)}
                      onMembers={() => navigate(CLIENT_REFINE_PREVIEW_MEMBERS_ROUTE)}
                      onInbox={() => navigate(CLIENT_REFINE_PREVIEW_INBOX_ROUTE)}
                      inboxCount={inboxCount}
                      inboxHasNew={inboxNewCount > 0}
                      isHome
                    />
                    <div className="crpv-homepage-content">
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", padding: "6px 20px 0", gap: 4 }}>
                        <button
                          type="button"
                          onClick={handleHomeScanAllSurfaces}
                          disabled={homeScanningAll || !canScan}
                          title={!canScan ? "Drift scan requires the drift-scan capability" : undefined}
                          style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: "0.06em", color: homeScanningAll || !canScan ? "rgba(17,17,17,0.25)" : "rgba(17,17,17,0.45)", background: "none", border: "1px solid rgba(17,17,17,0.15)", cursor: homeScanningAll ? "wait" : !canScan ? "default" : "pointer", padding: "4px 10px", borderRadius: 2 }}
                        >
                          {homeScanningAll ? "Scanning…" : "Scan all surfaces"}
                        </button>
                        {homeScanAllError && (
                          <p style={{ fontFamily: "monospace", fontSize: 9, letterSpacing: "0.05em", color: "#c0392b", margin: 0 }}>
                            Scan failed — {homeScanAllError}
                          </p>
                        )}
                        {!homeScanAllError && homeScanAllStatus && (
                          <p style={{ fontFamily: "monospace", fontSize: 9, letterSpacing: "0.05em", color: "rgba(17,17,17,0.35)", margin: 0 }}>
                            {(() => {
                              const driftCount = (homeScanAllStatus.slight_drift ?? 0) + (homeScanAllStatus.material_drift ?? 0);
                              const summary = driftCount === 0
                                ? `${homeScanAllStatus.assessed} surface${homeScanAllStatus.assessed === 1 ? "" : "s"} · all aligned`
                                : `${homeScanAllStatus.assessed} surface${homeScanAllStatus.assessed === 1 ? "" : "s"} · ${driftCount} with drift`;
                              return `Last scanned ${formatDistanceToNow(homeScanAllStatus.scannedAt)} ago · ${summary}`;
                            })()}
                          </p>
                        )}
                      </div>
                      <div className="crpv-command-main">
                        {/* Integrity sweep: renders regardless of the fallback company injection. */}
                        {companiesFetchError && (
                          <p className="crpv-muted" style={{ color: "#c45c00", margin: "0 0 12px" }}>Couldn't load companies — try reloading.</p>
                        )}
                        {displayMojoScore && foundationStatus ? (
                          <HomepageHierarchy
                            score={displayMojoScore}
                            dominantClaimState={dominantClaimState}
                            engagementPhase={phase}
                            foundationStatus={foundationStatus}
                            signalLandscape={signalLandscape}
                            directionEvidence={directionEvidence}
                            topNeed={topNeed}
                            needCount={needs.length}
                            companyCreatedAt={activeCompany?.created_at}
                            engagementDay={ENGAGEMENT_DAY ?? undefined}
                            nextTurnOverride={nextTurnOverride}
                            insightNextTurn={insightNextTurn}
                            audienceShort={audienceShort}
                            memberCount={memberCount}
                            onGoToRoutes={goToRoutesPreview}
                            onGoToOpportunities={() => navigate("/legacy/opportunities")}
                            onGoToWorkshop={goToWorkshopInputs}
                            navSlot={null}
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : (
                <div className="crpv-command-main">
                  {!hasHierarchy && <OperatingModeBar mode={operatingMode} onChange={setOperatingMode} descriptorOverride={enforcement.safeModeDescriptor} />}
                  {(
                    <>
                      {displayMojoScore && (
                        <MojoScoreSurface
                          result={displayMojoScore}
                          history={mojoScoreHistory}
                          companyName={activeCompany?.name ?? undefined}
                        />
                      )}

                  <div className={`crpv-pressure-field phase-${phasePriority.phase} ${commitmentIsFragile ? "is-fragile" : "is-earned"}`.trim()}>
                    {!hasHierarchy && (
                      <div className={`crpv-pressure-alert is-${pressureAlert.tone}`}>
                        <p className="cap">Strategic field</p>
                        <div className="crpv-pressure-alert-copy">
                          <p className="crpv-pressure-alert-headline">{pressureAlert.headline}</p>
                          {pressureAlert.detail ? <p className="crpv-pressure-alert-detail">{pressureAlert.detail}</p> : null}
                        </div>
                      </div>
                    )}

                    {!hasHierarchy && <section className={`crpv-pressure-region crpv-pressure-region-commitment ${commitmentIsFragile ? "is-fragile" : "is-earned"}`.trim()}>
                      {true && (
                        <>
                          <div className="crpv-pressure-region-topline">
                            <p className="cap">{phasePriority.readinessFraming || "Commitment posture"}</p>
                            <p className="crpv-pressure-status">
                              {disciplinedPostureLabel(surface.confidencePosture, discipline)} · {portfolio.portfolioStateLabel}
                            </p>
                          </div>
                          <p className="crpv-pressure-intro">{commitmentIntro}</p>
                        </>
                      )}

                      <div className="crpv-pressure-anchor">
                        <p className="crpv-pressure-anchor-headline" role="status">{commitmentFieldHeadline}</p>
                        {hasHierarchy ? (
                          <div className="crpv-pressure-anchor-support">
                            <p>{"The strongest signal so far — but not yet strong enough to commit to. " + (topLevelRoutes.length > 1 ? `${topLevelRoutes.length - 1} other direction${topLevelRoutes.length > 2 ? "s" : ""} ${topLevelRoutes.length > 2 ? "are" : "is"} also being explored.` : "More directions are being explored.")}</p>
                          </div>
                        ) : (
                          <>
                            {commitmentFieldSupportLines.length > 0 ? (
                              <div className="crpv-pressure-anchor-support">
                                {commitmentFieldSupportLines.map((line) => (
                                  <p key={line}>{line}</p>
                                ))}
                              </div>
                            ) : null}
                            {commitmentAnchorStatus ? <p className="crpv-phase-status">{commitmentAnchorStatus}</p> : null}
                          </>
                        )}
                      </div>

                      {!hasHierarchy && (
                        <>
                          {conditionDiscipline.convergenceLine ? (
                            <p className="crpv-pressure-convergence-signal">{conditionDiscipline.convergenceLine}</p>
                          ) : null}

                          {commitmentWindowState.commitmentWindowLine ? (
                            <p className="crpv-pressure-window-signal">{commitmentWindowState.commitmentWindowLine}</p>
                          ) : null}

                          {conditionDiscipline.fragiliteLine ? (
                            <p className="crpv-pressure-fragility-support">{conditionDiscipline.fragiliteLine}</p>
                          ) : null}

                          {showAllPressure && conditionDiscipline.gravityLine ? (
                            <p className="crpv-pressure-gravity-line">{conditionDiscipline.gravityLine}</p>
                          ) : null}

                          {showAllPressure && conditionDiscipline.counterforceLine ? (
                            <p className="crpv-pressure-counterforce-line">{conditionDiscipline.counterforceLine}</p>
                          ) : null}

                          {showAllPressure && commitmentConsequenceItems.length > 0 ? (
                            <div className="crpv-pressure-consequence">
                              {commitmentConsequenceItems.map((item, i) => (
                                <p key={i} className="crpv-pressure-consequence-line">{item}</p>
                              ))}
                            </div>
                          ) : null}

                          {showAllPressure && commitmentFragilityLines.length > 0 ? (
                            <div className="crpv-pressure-fragility">
                              {commitmentFragilityLines.map((line) => (
                                <p key={line} className="crpv-pressure-fragility-line">{line}</p>
                              ))}
                            </div>
                          ) : null}

                          {showAllPressure && pressureAlert.tone === "critical" && commitmentDependencyItems.length > 0 ? (
                            <div className="crpv-pressure-dependency">
                              <button
                                type="button"
                                className="crpv-pressure-cluster-trigger"
                                onClick={() => setShowCommitmentDependency((v) => !v)}
                              >
                                {showCommitmentDependency ? "Close ↑" : "What still blocks this →"}
                              </button>
                              {showCommitmentDependency ? (
                                <div className="crpv-pressure-dependency-lines">
                                  {commitmentDependencyItems.map((item, i) => (
                                    <p key={i} className="crpv-pressure-cluster-detail-line">{item}</p>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          {showAllPressure && conditionDiscipline.driftLine ? (
                            <p className="crpv-pressure-drift-signal">{conditionDiscipline.driftLine}</p>
                          ) : null}

                          {showAllPressure && conditionDiscipline.reframingLine ? (
                            <p className="crpv-pressure-reframing-signal">{conditionDiscipline.reframingLine}</p>
                          ) : null}

                          {sectionVisibility.showHypotheses && fieldHypothesisRows.length > 0 ? (
                            <div className="crpv-pressure-subsection">
                              <div className="crpv-pressure-subsection-header">
                                <p className="cap">
                                  {isEarlyPhase ? `What appears true · ${fieldHypothesisPhaseLabel}` : phasePriority.phase === "focus" ? "What this focus depends on" : "What still feels unresolved"}
                                </p>
                                <p className="crpv-pressure-subsection-copy">
                                  {isEarlyPhase
                                    ? "Use these as conversation starters, not conclusions."
                                    : phasePriority.phase === "focus"
                                      ? "These are the tensions and assumptions still shaping whether this focus is safe to commit around."
                                      : "These are the tensions still capable of weakening the direction in motion."}
                                </p>
                              </div>
                              <RefinePreviewHypothesesSection
                                companyId={activeCompany?.id}
                                phaseLabel={fieldHypothesisPhaseLabel}
                                rows={fieldHypothesisRows}
                                showHeader={false}
                                maxItems={phasePriority.hypotheses.maxItems}
                                priorityMode={phasePriority.hypotheses.priorityMode}
                                compressAfterLead
                                excludeHypothesisId={fieldHypothesisExcludeId}
                              />
                            </div>
                          ) : null}

                          {!isEarlyPhase ? (
                            <div className="crpv-pressure-commitment-footer">
                              <div className="crpv-meta-row">
                                <div
                                  className="meta"
                                  onClick={() => (accessModes.inline ? openDrawer("signals") : undefined)}
                                  onMouseEnter={(event) => showHoverTip(event, "What the evidence currently supports about this route.")}
                                  onMouseMove={(event) => moveHoverTip(event, "What the evidence currently supports about this route.")}
                                  onMouseLeave={hideHoverTip}
                                >
                                  <span className="cap">Evidence</span>
                                  <span className="v">{evidencePostureValue}</span>
                                </div>
                                <div
                                  className="meta"
                                  onClick={() => (accessModes.inline ? openDrawer("blocking") : undefined)}
                                  onMouseEnter={(event) => showHoverTip(event, "Active tensions or proof gaps that affect safe commitment.")}
                                  onMouseMove={(event) => moveHoverTip(event, "Active tensions or proof gaps that affect safe commitment.")}
                                  onMouseLeave={hideHoverTip}
                                >
                                  <span className="cap">Pressure</span>
                                  <span className="v">{commitmentPressureValue}</span>
                                </div>
                                <div
                                  className="meta"
                                  onClick={() => (accessModes.inline ? openDrawer("progress") : undefined)}
                                  onMouseEnter={(event) => showHoverTip(event, "Whether the current evidence supports safe commitment to this path.")}
                                  onMouseMove={(event) => moveHoverTip(event, "Whether the current evidence supports safe commitment to this path.")}
                                  onMouseLeave={hideHoverTip}
                                >
                                  <span className="cap">Posture</span>
                                  <span className="v">{readinessPostureValue}</span>
                                </div>
                              </div>

                              {accessModes.pills ? (
                                <div className="crpv-pill-row crpv-pill-row-attached">
                                  <button type="button" className="pill" onClick={() => openDrawer()}>
                                    <span className="dot" /> Decision context <span className="count">{combinedDrawerSections.length}</span>
                                  </button>
                                </div>
                              ) : null}

                            </div>
                          ) : null}
                        </>
                      )}
                    </section>}

                    {hasHierarchy && topNeed && (
                      <section className="crpv-pressure-region" style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid rgba(0,0,0,0.07)" }}>
                        <p className="cap" style={{ marginBottom: 10 }}>Customer finding</p>
                        <p style={{ fontSize: 17, fontWeight: 500, lineHeight: 1.45, margin: "0 0 14px", color: "#1e3340" }}>{topNeed.desired_outcome}</p>
                        {needs.length > 1 && (
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={goToWorkshopInputs}
                            style={{ fontSize: 11 }}
                          >
                            {needs.length - 1} more like this →
                          </button>
                        )}
                      </section>
                    )}

                    {!hasHierarchy && <aside className="crpv-pressure-region crpv-pressure-region-instability">
                      <div className="crpv-pressure-region-topline">
                        <p className="cap">Destabilizing pressures</p>
                        <p className="crpv-pressure-status">
                          {destabilizingSignals.hasBlockingSignals ? "Blocking pressure visible" : destabilizingSignals.hasConflictingSignals ? "Conflict still active" : "Instability still open"}
                        </p>
                      </div>
                      <p className="crpv-pressure-intro">{instabilityIntro}</p>

                      {renderReconciliation ? (
                        <RefinePreviewReconciliationSection narrative={reconciliationNarrative} />
                      ) : null}

                      {visiblePressureClusters.length > 0 ? (
                        <div className="crpv-pressure-clusters">
                          {visiblePressureClusters.map((cluster) => (
                            <div key={cluster.key} className={`crpv-pressure-cluster is-${cluster.tone}`}>
                              <p className="crpv-pressure-cluster-label">{cluster.label}</p>
                              <p className="crpv-pressure-cluster-headline">{cluster.headline}</p>
                              {cluster.lines.length > 0 ? (
                                <div className="crpv-pressure-cluster-lines">
                                  {cluster.lines.map((line) => (
                                    <p key={line}>{line}</p>
                                  ))}
                                </div>
                              ) : null}
                              {cluster.isStructuralPull && gravityState.structuralPullNote ? (
                                <p className="crpv-pressure-cluster-structural-pull">{gravityState.structuralPullNote}</p>
                              ) : null}
                              {cluster.sourceTension ? (
                                <>
                                  <button
                                    type="button"
                                    className="crpv-pressure-cluster-trigger"
                                    onClick={() => setExpandedClusterKey(expandedClusterKey === cluster.key ? null : cluster.key)}
                                  >
                                    {expandedClusterKey === cluster.key ? "Close ↑" : `${cluster.inspectLabel} →`}
                                  </button>
                                  {expandedClusterKey === cluster.key ? (
                                    <div className="crpv-pressure-cluster-detail">
                                      {cluster.sourceTension.validation_requirements.filter(Boolean).slice(0, 2).length > 0 ? (
                                        <div className="crpv-pressure-cluster-detail-group">
                                          <p className="cap">Needs validation</p>
                                          {cluster.sourceTension.validation_requirements.slice(0, 2).map((req, i) => (
                                            <p key={i} className="crpv-pressure-cluster-detail-line">{req}</p>
                                          ))}
                                        </div>
                                      ) : null}
                                      {cluster.sourceTension.resolution_signals.filter(Boolean).slice(0, 1).length > 0 ? (
                                        <div className="crpv-pressure-cluster-detail-group">
                                          <p className="cap">Would resolve if</p>
                                          {cluster.sourceTension.resolution_signals.slice(0, 1).map((sig, i) => (
                                            <p key={i} className="crpv-pressure-cluster-detail-line">{sig}</p>
                                          ))}
                                        </div>
                                      ) : null}
                                      {cluster.sourceTension.blocked_commitments.filter((id) => routeLabelMap.has(id)).slice(0, 1).length > 0 ? (
                                        <div className="crpv-pressure-cluster-detail-group">
                                          <p className="cap">Blocks commitment to</p>
                                          {cluster.sourceTension.blocked_commitments
                                            .slice(0, 1)
                                            .map((id) => routeLabelMap.get(id))
                                            .filter((label): label is string => Boolean(label))
                                            .map((label, i) => (
                                              <p key={i} className="crpv-pressure-cluster-detail-line">{shorten(label, 72)}</p>
                                            ))}
                                        </div>
                                      ) : null}
                                      {unstableAssumptionLines.length > 0 && cluster.key !== "council" ? (
                                        <div className="crpv-pressure-cluster-detail-group">
                                          <p className="cap">Assumptions at risk</p>
                                          {unstableAssumptionLines.slice(0, 1).map((stmt, i) => (
                                            <p key={i} className="crpv-pressure-cluster-detail-line">{shorten(stmt, 88)}</p>
                                          ))}
                                        </div>
                                      ) : null}
                                      {cluster.rippleItems.length > 0 && cluster.tone !== "quiet" ? (
                                        <div className="crpv-pressure-cluster-detail-group">
                                          <p className="cap">Weakens further if unresolved</p>
                                          {cluster.rippleItems.map((item, i) => (
                                            <p key={i} className="crpv-pressure-cluster-detail-line">{item}</p>
                                          ))}
                                        </div>
                                      ) : null}
                                      {cluster.isPersistent ? (
                                        <p className="crpv-pressure-cluster-persistence">This pressure has persisted without resolution.</p>
                                      ) : null}
                                      {cluster.isWeakening && !cluster.isPersistent ? (
                                        <p className="crpv-pressure-cluster-weakening">This pressure is weakening — its contribution to the read may be shifting.</p>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </>
                              ) : null}
                            </div>
                          ))}
                          {pressureClusters.length > 1 || destabilizingSignals.groups.length > pressureSignalsPreview.groups.length ? (
                            <div className="crpv-pressure-more">
                              <button
                                type="button"
                                className="btn ghost"
                                onClick={() => setShowAllPressure((current) => !current)}
                              >
                                {showAllPressure ? "Show less" : "See more pressure"}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {pressureSignalsPreview.totalCount > 0 ? (
                        <div className="crpv-pressure-subsection">
                          <p className="cap">Pressure signals</p>
                          <StrategicSignalsSection
                            signals={pressureSignalsPreview}
                            compact
                            onInspectRoute={() => goToRoutesPreview()}
                            onInspectDirection={() => {
                              setLayer("narrative");
                              setDrawerKey(null);
                            }}
                          />
                        </div>
                      ) : null}

                      {convergenceState.narrowingNote && pressureClusters.length > 0 ? (
                        <p className="crpv-pressure-convergence-note">{convergenceState.narrowingNote}</p>
                      ) : null}

                      {pressureClusters.length === 0 && pressureSignalsPreview.totalCount === 0 && !renderReconciliation && !counterforceState.instabilityCounterforceLine ? (
                        <p className="crpv-pressure-empty">No single destabilizing pressure is dominating this direction right now.</p>
                      ) : null}
                      {counterforceState.instabilityCounterforceLine ? (
                        <p className="crpv-pressure-counterforce-instability">{counterforceState.instabilityCounterforceLine}</p>
                      ) : null}
                    </aside>}

                    {!hasHierarchy && <section className="crpv-pressure-region crpv-pressure-region-validation">
                      <div className="crpv-pressure-region-topline">
                        <p className="cap">Validation state</p>
                        <p className="crpv-pressure-status">
                          {strategicCenter.customerLag ? "Customer proof still thin" : "Validation is actively moving"}
                        </p>
                      </div>
                      <p className="crpv-pressure-intro">{validationIntro}</p>

                      {validationSummaryItems.length > 0 ? (
                        <div className="crpv-pressure-validation-summary">
                          {validationSummaryItems.map((item) => (
                            <div key={`${item.label}-${item.text}`} className="crpv-pressure-validation-item">
                              <span>{item.label}</span>
                              <p>{item.text}</p>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {unstableAssumptionLines.length > 0 ? (
                        <div className="crpv-pressure-belief-trace">
                          <p className="cap">Beliefs still unsettled</p>
                          <div className="crpv-pressure-belief-lines">
                            {unstableAssumptionLines.map((stmt, i) => (
                              <p key={i} className="crpv-pressure-cluster-detail-line">{shorten(stmt, 88)}</p>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {validationConsequenceItems.length > 0 ? (
                        <div className="crpv-pressure-validation-leverage">
                          <p className="cap">What becomes safer</p>
                          <div className="crpv-pressure-validation-leverage-lines">
                            {validationConsequenceItems.map((item, i) => (
                              <p key={i} className="crpv-pressure-validation-leverage-line">{item}</p>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {driftContextLines.length > 0 ? (
                        <div className="crpv-pressure-drift-context">
                          {driftContextLines.map((line, i) => (
                            <p key={i} className="crpv-pressure-drift-context-line">{line}</p>
                          ))}
                        </div>
                      ) : null}

                      {reframingState.consequenceLines.length > 0 ? (
                        <div className="crpv-pressure-reframing-consequence">
                          {reframingState.consequenceLines.map((line, i) => (
                            <p key={i} className="crpv-pressure-reframing-consequence-line">{line}</p>
                          ))}
                        </div>
                      ) : null}

                      {gravityState.validationGravityLine && !conditionDiscipline.suppressGravityValidation ? (
                        <p className="crpv-pressure-gravity-validation">{gravityState.validationGravityLine}</p>
                      ) : null}

                      {counterforceState.validationCounterforceLine && !conditionDiscipline.suppressCounterforceValidation ? (
                        <p className="crpv-pressure-counterforce-validation">{counterforceState.validationCounterforceLine}</p>
                      ) : null}

                      <div
                        className={`crpv-pressure-validation-columns ${phasePriority.mainPage.showMovementFirst ? "movement-first" : "confidence-first"}`.trim()}
                      >
                        {sectionVisibility.showMovement ? (
                          <div className="crpv-pressure-validation-panel">
                            <RefinePreviewWhatChangedSection
                              companyId={activeCompany?.id}
                              phaseLabel={latePhaseLabel}
                              rows={strategicHypothesisRows}
                              routeRationales={routeRationales}
                              introCopy={phasePriority.movement.introCopy}
                              defaultVisibleCount={sectionVisibility.movementVisibleCount}
                              defaultExpanded={sectionVisibility.movementExpandedByDefault}
                              suppressLowSignal={sectionVisibility.suppressLowSignalMovement}
                            />
                          </div>
                        ) : null}

                        {sectionVisibility.showConfidence ? (
                          <div className="crpv-pressure-validation-panel">
                            <RefinePreviewConfidenceLandscapeSection
                              domains={confidenceLandscape}
                              loading={confidenceLandscapeLoading}
                              primaryKeys={confidencePrimaryKeys}
                              summaryLine={isEarlyPhase ? conductor.landscapeSummaryLine : phasePriority.mainPage.confidenceSummaryLine}
                              phase={phase}
                            />
                          </div>
                        ) : null}
                      </div>

                      {cadenceFrame.hasCadence && cadenceFrame.sinceLastReview ? (
                        <p className="crpv-pressure-cadence">{cadenceFrame.sinceLastReview}</p>
                      ) : null}
                      {movementLine && (
                        <p className="crpv-pressure-cadence">{movementLine}</p>
                      )}
                      {assumptionEvolutionLine && (
                        <p className="crpv-pressure-cadence" style={{ opacity: 0.8 }}>{assumptionEvolutionLine}</p>
                      )}
                      {reframingState.reframingMovementLine && !conditionDiscipline.suppressReframingCadence ? (
                        <p className="crpv-pressure-cadence crpv-pressure-cadence-reframing">{reframingState.reframingMovementLine}</p>
                      ) : null}
                      {convergenceState.convergenceMovementLine && !commitmentWindowState.windowMovementLine && (
                        <p className="crpv-pressure-cadence">{convergenceState.convergenceMovementLine}</p>
                      )}
                      {/* Cadence exclusivity: window → fragility → gravity → counterforce.
                          convergenceMovementLine is also suppressed by windowMovementLine (above).
                          Only the highest-priority concept that has a movement line fires. */}
                      {commitmentWindowState.windowMovementLine && (
                        <p className="crpv-pressure-cadence">{commitmentWindowState.windowMovementLine}</p>
                      )}
                      {fragilityState.fragilityMovementLine && !commitmentWindowState.windowMovementLine ? (
                        <p className="crpv-pressure-cadence">{fragilityState.fragilityMovementLine}</p>
                      ) : null}
                      {gravityState.gravityMovementLine && !commitmentWindowState.windowMovementLine && !fragilityState.fragilityMovementLine ? (
                        <p className="crpv-pressure-cadence">{gravityState.gravityMovementLine}</p>
                      ) : null}
                      {counterforceState.counterforceMovementLine && !commitmentWindowState.windowMovementLine && !fragilityState.fragilityMovementLine && !gravityState.gravityMovementLine ? (
                        <p className="crpv-pressure-cadence">{counterforceState.counterforceMovementLine}</p>
                      ) : null}
                    </section>}

                    <div className="crpv-pressure-region crpv-pressure-region-actions">
                      <div className="crpv-next-moves">
                        {!hasHierarchy && <p className="cap">Next moves</p>}
                        {!hasHierarchy && displayAttentionItems.length > 0 ? (
                          <div className="crpv-pressure-attention">
                            {displayAttentionItems.map((item, i) => (
                              <p key={i}>{item}</p>
                            ))}
                          </div>
                        ) : null}
                        {hasHierarchy && displayMojoScore && displayMojoScore.projected_raisers.length > 0 && (
                          <div style={{ background: "#f0f7f4", borderRadius: 8, padding: "12px 16px", marginBottom: 16 }}>
                            <p style={{ fontSize: 10, fontFamily: "monospace", color: "#5F9B8C", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Next move</p>
                            <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 6px", color: "#1e3340", lineHeight: 1.4 }}>{displayMojoScore.projected_raisers[0].action_description}</p>
                            <p style={{ fontSize: 11, color: "#5F9B8C" }}>+{displayMojoScore.projected_raisers[0].estimated_points} pts to MojoScore · {displayMojoScore.projected_raisers[0].confidence} confidence</p>
                          </div>
                        )}
                        <div className="crpv-secondary-links crpv-secondary-links-attached">
                          <button
                            type="button"
                            className="btn ghost"
                            data-go={isEarlyPhase ? "narrative" : "map"}
                            onClick={() => {
                              setLayer(isEarlyPhase ? "narrative" : "map");
                              setDrawerKey(null);
                            }}
                          >
                            ◎ View Map
                          </button>
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={goToRoutesPreview}
                          >
                            ⧉ Routes
                          </button>
                          <button type="button" className="btn ghost" onClick={goToWorkshopInputs}>
                            Add Evidence →
                          </button>
                        </div>

                        {!hasHierarchy && !isEarlyPhase ? (
                          <div className="crpv-pressure-utility-links">
                            <button
                              type="button"
                              className="btn ghost"
                              data-go="narrative"
                              onClick={() => {
                                setLayer("narrative");
                                setDrawerKey(null);
                              }}
                            >
                              Explain this decision
                            </button>
                            <button type="button" className="btn ghost" onClick={() => setLayer("narrative")}>
                              Share with team
                            </button>
                          </div>
                        ) : null}

                        <div className="crpv-pressure-lenses">
                          <SupportingLensesSection onNavigate={navigateToLens} />
                        </div>
                      </div>
                    </div>
                  </div>
                    </>
                  )}
                </div>
              )) : null}

              {showStageStrip ? (
                <div className="crpv-confidence-morph" aria-live="polite">
                  <span>{confidenceFrom}</span>
                  <span className="arrow">→</span>
                  <span>{confidenceTo}</span>
                  <small>{commitState === "waiting" ? "confidence · paused" : "confidence"}</small>
                </div>
              ) : null}

              {commitState === "committed" ? (
                <div className="crpv-commit-stamp">✓ COMMITTED · DAY {ENGAGEMENT_DAY ?? "—"} · {committedAt ? formatHHmm(committedAt) : "--:--"}</div>
              ) : null}

              {commitState === "waiting" ? (
                <div className="crpv-evidence-prompt">
                  <h4>Evidence conditions requested</h4>
                  {evidenceConditions.map((label, index) => (
                    <div key={label} className="check">
                      <div className={`box ${evidenceChecks[index] ? "on" : ""}`}>{evidenceChecks[index] ? "✓" : ""}</div>
                      <span className={evidenceChecks[index] ? "done" : ""}>{label}</span>
                      <span className="note">{evidenceChecks[index] ? "SATISFIED" : "REQUESTED"}</span>
                    </div>
                  ))}
                  <div className="actions">
                    <button type="button" className="btn" data-ev-resolve onClick={resolveEvidence}>
                      Resolve all
                    </button>
                    <button type="button" className="btn ghost" data-go="command-reset" onClick={resetCommit}>
                      Start over
                    </button>
                  </div>
                </div>
              ) : null}

              {commitState === "next-revealed" ? (
                <div className="crpv-next-move-reveal">
                  <p className="cap">NOW · THE NEXT MOVE AFTER THAT</p>
                  <p className="n">{toSentence(nextMove?.title) || "Run the next execution checkpoint."}</p>
                  <div className="meta">
                    <span>Owner · {toSentence(strongestAction?.primaryOwner) || "Unassigned"}</span>
                  </div>
                  <div className="actions">
                    <button
                      type="button"
                      className="btn primary"
                      data-commit="agree2"
                      onClick={() => {
                        typeSystemLine("SECOND MOVE LOGGED · ROUTE UPDATED", () => {
                          later(() => {
                            setSystemLineOn(false);
                            setLayer("map");
                          }, 900);
                        });
                      }}
                    >
                      ✓ Do this next
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setLayer("map");
                        setDrawerKey(null);
                      }}
                    >
                      ◎ Show on map
                    </button>
                    <button type="button" className="btn ghost" onClick={resetCommit}>
                      ← Start over
                    </button>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="crpv-map-layer">
              <div className="crpv-map-wrap">
                <svg viewBox="0 0 1440 620" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Decision map">
                  <defs>
                    <pattern id="crpv-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                      <line x1="0" y1="0" x2="0" y2="8" stroke="#111" strokeWidth="1" opacity="0.08" />
                    </pattern>
                  </defs>

                  {[120, 165, 210, 255, 300].map((radius) => (
                    <ellipse key={radius} cx="1050" cy="240" rx={radius} ry={radius * 0.58} fill="none" stroke="#e5e1d6" />
                  ))}
                  {[140, 190, 240].map((radius) => (
                    <ellipse key={`left-${radius}`} cx="380" cy="460" rx={radius} ry={radius * 0.58} fill="none" stroke="#e5e1d6" />
                  ))}

                  <polygon points="820,70 1440,0 1440,380 1120,300" fill="url(#crpv-hatch)" />

                  <path d="M 160 515 C 320 505, 420 450, 560 420 S 760 320, 880 300" fill="none" stroke="#111" strokeWidth="3" />
                  <path
                    d="M 880 300 C 960 280, 1040 230, 1120 200 S 1320 120, 1380 100"
                    fill="none"
                    stroke="#999"
                    strokeWidth="2"
                    strokeDasharray="2 10"
                    strokeLinecap="round"
                  />

                  {ROUTE_ORDER.map((category) => {
                    const route = effectiveRouteOptions.find((item) => item.category === category);
                    const badge = MAP_ROUTE_BADGES[category];
                    const isSelected = selectedMapRoute === category;
                    const isHovered = hoveredMapRoute === category;
                    const isDimmed = hoveredMapRoute
                      ? hoveredMapRoute !== category && !isSelected
                      : !isSelected;
                    const routeMeta = route?.available ? `${route.count} direction${route.count === 1 ? "" : "s"}` : "No options";

                    return (
                      <g
                        key={category}
                        className={[
                          "crpv-map-route",
                          `route-${category.toLowerCase()}`,
                          isSelected ? "selected" : "",
                          isHovered ? "hovered" : "",
                          isDimmed ? "dimmed" : "",
                          route?.available ? "" : "empty",
                        ].join(" ").trim()}
                        onClick={() => setSelectedMapRoute(category)}
                        onMouseEnter={(event) => {
                          setHoveredMapRoute(category);
                          showHoverTip(event, routeHoverText(category));
                        }}
                        onMouseMove={(event) => {
                          moveHoverTip(event, routeHoverText(category));
                        }}
                        onMouseLeave={() => {
                          setHoveredMapRoute(null);
                          hideHoverTip();
                        }}
                      >
                        <path d={MAP_ROUTE_CURVES[category]} className="crpv-map-route-line" />
                        <path d={MAP_ROUTE_CURVES[category]} className="crpv-map-route-hit" />
                        <g transform={`translate(${badge.x}, ${badge.y})`} className="crpv-map-route-badge">
                          <rect x="0" y="-22" width="128" height="38" rx="8" />
                          <text x="12" y="-6" className="label">{ROUTE_DISPLAY_LABEL[category]}</text>
                          <text x="12" y="10" className="meta">{routeMeta}</text>
                        </g>
                      </g>
                    );
                  })}

                  <g className="wp wp-start" onClick={() => setLayer("narrative")}>
                    <circle cx="160" cy="515" r="7" fill="#111" />
                    <text x="178" y="518" className="wp-label">Start</text>
                  </g>

                  <g className={`wp wp-current ${commitState !== "idle" ? "pulse" : ""}`} onClick={() => setLayer("narrative")}>
                    <circle cx="880" cy="300" r="26" fill="none" stroke="#111" strokeWidth="2" />
                    <circle cx="880" cy="300" r="9" fill="#111" />
                    <text x="815" y="268" className="wp-label">You are here</text>
                    <text x="842" y="338" className="wp-cap">CONF {mapCurrentScore}</text>
                  </g>

                  <g className="wp wp-next" onClick={() => setLayer("narrative")}>
                    <circle cx="1120" cy="200" r="26" fill="none" stroke="#777" strokeWidth="1.5" strokeDasharray="4 5" />
                    <line x1="1120" y1="186" x2="1120" y2="214" stroke="#111" strokeWidth="2" />
                    <line x1="1106" y1="200" x2="1134" y2="200" stroke="#111" strokeWidth="2" />
                    <text x="1080" y="170" className="wp-label">Next move →</text>
                    {mapReachableScore !== null && (
                      <text x="1058" y="240" className="wp-cap">REACHABLE {mapReachableScore}</text>
                    )}
                  </g>

                  <g className="wp wp-desired" onClick={() => setLayer("narrative")}>
                    <rect x="1368" y="88" width="24" height="24" fill="#111" />
                    <text x="1310" y="78" className="wp-label">Desired</text>
                    <text x="1308" y="126" className="wp-cap">DESIRED {mapDesiredScore}</text>
                  </g>
                </svg>
              </div>

              {hoverRouteOption ? (
                <aside className="crpv-map-hover-card" aria-live="polite">
                  <p className="cap">{ROUTE_DISPLAY_LABEL[hoverRouteOption.category as RouteCategory] ?? hoverRouteOption.category}</p>
                  <h3>
                    {hoverRouteOption.available
                      ? `${hoverRouteOption.count} option${hoverRouteOption.count === 1 ? "" : "s"}`
                      : "No live options"}
                  </h3>
                  {hoverRouteOption.optionTitles.length > 0 ? (
                    <ul>
                      {hoverRouteOption.optionTitles.slice(0, 3).map((item) => (
                        <li key={item}>{shorten(item, 64)}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="empty">{hoverRouteOption.leadTitle}</p>
                  )}
                </aside>
              ) : null}

              <div className="crpv-map-pin">
                <div className="crpv-map-route-row" role="tablist" aria-label="Route options">
                  {effectiveRouteOptions.map((route) => (
                    <button
                      key={route.category}
                      type="button"
                      role="tab"
                      aria-selected={selectedMapRoute === route.category}
                      className={`crpv-map-route-pill ${selectedMapRoute === route.category ? "active" : ""}`.trim()}
                      onClick={() => setSelectedMapRoute(route.category)}
                    >
                      <span className="name">{route.category}</span>
                      <span className="meta">{route.available ? `${route.count}` : "none"}</span>
                    </button>
                  ))}
                </div>
                <p>{mapActionHeadline}</p>
                <p className="crpv-map-route-note">
                  {hasHierarchy && selectedRouteOption?.available
                    ? selectedRouteOption.leadTitle
                    : `Chosen route: ${selectedRouteOption?.category || preferredRoute} · ${selectedRouteOption?.leadStatus || "No route"}`}
                </p>
                {hoverRouteOption ? (
                  <p className="crpv-map-route-note">
                    Hovering: {hoverRouteOption.category} ·{" "}
                    {hoverRouteOption.optionTitles.length > 0
                      ? hoverRouteOption.optionTitles.slice(0, 2).map((item) => shorten(item, 44)).join(" • ")
                      : hoverRouteOption.leadTitle}
                  </p>
                ) : null}
                <div className="actions">
                  <button type="button" className="btn" onClick={() => setLayer("command") }>
                    ← Back
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setLayer("narrative") }>
                    ✎ Explain
                  </button>
                </div>
              </div>
            </section>

            <section className="crpv-narrative-layer">
              <div className="crpv-narrative-close">
                <button type="button" className="btn ghost" onClick={() => setLayer("command") }>
                  ← Back
                </button>
              </div>
              <div className="crpv-narrative-inner">
                <p className="cap crpv-narrative-cap">
                  THE DECISION, IN FULL · [{toSentence(activeCompany?.name) || "COMPANY"}] · DAY {ENGAGEMENT_DAY ?? "—"}
                </p>
                {narrativeRows.map((item, i) => (
                  <div key={i} className="step">
                    <div className="n">{item.label}</div>
                    <p>
                      {item.lead}
                      <em>{/^[.?!,:;—-]/.test(item.tail.trim()) ? stripTerminalPunctuation(item.emphasis) : item.emphasis}</em>
                      {item.tail}
                    </p>
                  </div>
                ))}
                <div className="crpv-narrative-cta">
                  <button type="button" className="btn" onClick={() => setLayer("map") }>
                    ◎ Show on map
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setLayer("command") }>
                    ← Back
                  </button>
                </div>
              </div>
            </section>

            {!hasHierarchy && (
              <div className="crpv-edge-tabs">
                <button type="button" onClick={() => openDrawer()}>
                  Decision Context
                </button>
              </div>
            )}

            {accessModes.footer && !hasHierarchy ? (
              <div className="crpv-footer-drawers">
                <div className="left cap">DECISION CONTEXT</div>
                <div className="right">
                  <button type="button" className="btn ghost" onClick={() => openDrawer()}>
                    Open context
                  </button>
                </div>
              </div>
            ) : null}

            <button type="button" className="crpv-spec-toggle" onClick={() => setSpecOpen((value) => !value)}>
              {specOpen ? "▾ HIDE SPEC" : "▸ INTERACTION SPEC"}
            </button>
            <aside className={`crpv-spec-panel ${specOpen ? "open" : ""}`}>
              <h4>Layer stack</h4>
              <p>Command defaults. Map and Narrative are progressive disclosure layers. Drawers expose context on demand.</p>
              <h4>Keyboard</h4>
              <p>M map · N narrative · Esc command · 1-4 open context.</p>
            </aside>

            <div className="crpv-legend">
              <button type="button" className="crpv-main-link" onClick={goToMainSite}>
                ← MAIN SITE
              </button>
              <span className="sep">·</span>
              <span><span className="k">M</span> MAP</span>
              <span className="sep">·</span>
              <span><span className="k">N</span> NARRATIVE</span>
              <span className="sep">·</span>
              <span><span className="k">1-4</span> CONTEXT</span>
              <span className="sep">·</span>
              <span><span className="k">Esc</span> BACK</span>
            </div>

            <aside className={`crpv-tweaks ${tweaksOpen ? "open" : ""}`}>
              <div className="hdr">
                <span>{isAdmin ? "Admin Workbench" : "Tweaks · Drawer Access"}</span>
                <button type="button" className="x" onClick={() => setTweaksOpen(false)}>
                  ✕
                </button>
              </div>
              {isAdmin ? (
                <>
                  <div className="section">
                    <div className="crpv-tweaks-tabs">
                      {([
                        ["evidence", "Evidence"],
                        ["claims", "Claims"],
                        ["foundation", "Foundation"],
                        ["assumptions", "Assumptions"],
                        ["rerun", "Rerun"],
                        ["access", "Access"],
                      ] as Array<[TweakTab, string]>).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          className={`crpv-tweaks-tab ${tweakTab === key ? "active" : ""}`}
                          onClick={() => setTweakTab(key)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {tweakTab === "evidence" && (
                    <div className="section">
                      <div className="sect-title">Evidence state</div>
                      <div className="crpv-tweaks-stat">
                        <span>Preferred run</span>
                        <strong>
                          {baselineRun?.created_at ? new Date(baselineRun.created_at).toLocaleString() : "None"}
                        </strong>
                      </div>
                      <div className="crpv-tweaks-stat">
                        <span>Latest run</span>
                        <strong>
                          {latestBaselineRun?.created_at ? new Date(latestBaselineRun.created_at).toLocaleString() : "None"}
                        </strong>
                      </div>
                      <div className="crpv-tweaks-stat"><span>Outside signals</span><strong>{baselineLoading ? "…" : baselineSummary.outsideSignals}</strong></div>
                      <div className="crpv-tweaks-stat"><span>Evidence ledger</span><strong>{baselineLoading ? "…" : baselineSummary.evidenceLedger}</strong></div>
                      <div className="crpv-tweaks-stat"><span>Top hypotheses</span><strong>{baselineLoading ? "…" : baselineSummary.hypotheses}</strong></div>
                      <div className="crpv-tweaks-stat"><span>Open questions</span><strong>{baselineLoading ? "…" : baselineSummary.questions}</strong></div>
                      <div className="crpv-tweaks-note">{baselineSelectionReason}</div>
                      <div className="crpv-tweaks-list">
                        <div className="crpv-tweaks-list-item">
                          <div className="crpv-tweaks-list-meta">Signal posture</div>
                          <div className="crpv-tweaks-list-text">
                            Outside: {signalPosture.outside} · Organization: {signalPosture.organization} · Customer: {signalPosture.customer}
                          </div>
                        </div>
                        <div className="crpv-tweaks-list-item">
                          <div className="crpv-tweaks-list-meta">Safe to use now</div>
                          <div className="crpv-tweaks-list-text">{evidenceGuidance.usable}</div>
                        </div>
                        <div className="crpv-tweaks-list-item">
                          <div className="crpv-tweaks-list-meta">Needs revalidation</div>
                          <div className="crpv-tweaks-list-text">{evidenceGuidance.revalidate}</div>
                        </div>
                      </div>
                      <div className="crpv-tweaks-note">
                        Treat what the outside world shows as real evidence to weigh against your internal view. Customer truth still needs direct validation when framing changes.
                      </div>
                    </div>
                  )}

                  {tweakTab === "claims" && (
                    <div className="section">
                      <div className="sect-title">Current claims</div>
                      {claimWorkbenchPreview.length === 0 ? (
                        <div className="crpv-tweaks-note">No framework claims available yet. Run analysis first.</div>
                      ) : (
                        <div className="crpv-tweaks-list">
                          {claimWorkbenchPreview.map((finding, index) => (
                            <div key={`${finding.framework}-${index}`} className="crpv-tweaks-list-item">
                              <div className="crpv-tweaks-list-meta">
                                {finding.framework} · {finding.mojoArea} · {finding.confidence} · {finding.supportLevel}
                              </div>
                              <div className="crpv-tweaks-list-text">{finding.claim}</div>
                              <div className="crpv-tweaks-list-sub">{finding.supportReason}</div>
                              {finding.evidence ? <div className="crpv-tweaks-list-sub">Evidence: {shorten(finding.evidence, 110)}</div> : null}
                              <div className="crpv-tweaks-list-sub">Next check: {finding.validationNote}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {tweakTab === "foundation" && (
                    <div className="section">
                      <div className="sect-title">Foundation read</div>
                      <div className="crpv-tweaks-note">
                        This is the current working foundation the command view is using. It is not the final truth. It is the best current read from the available evidence shape.
                      </div>
                      <div className="crpv-tweaks-list">
                        {foundationWorkbenchPreview.map((item) => (
                          <div key={item.area} className="crpv-tweaks-list-item">
                            <div className="crpv-tweaks-list-meta">{item.area} · {item.evidenceShape}</div>
                            <div className="crpv-tweaks-list-text">{item.statement}</div>
                            <div className="crpv-tweaks-list-sub">Next check: {item.nextCheck}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {tweakTab === "assumptions" && (
                    <div className="section">
                      <div className="sect-title">Assumptions</div>
                      <div className="crpv-tweaks-assumption-form">
                        <textarea
                          value={newAssumption}
                          onChange={(event) => setNewAssumption(event.target.value)}
                          placeholder="Add a testable what-must-be-true statement"
                          className="crpv-tweaks-textarea"
                        />
                        <button type="button" className="btn" onClick={() => void handleAddAssumption()} disabled={assumptionSaving}>
                          {assumptionSaving ? "Saving…" : "Add assumption"}
                        </button>
                      </div>
                      {assumptionsLoading ? (
                        <div className="crpv-tweaks-note">Loading assumptions…</div>
                      ) : assumptionWorkbenchPreview.length === 0 ? (
                        <div className="crpv-tweaks-note">No assumptions stored yet.</div>
                      ) : (
                        <div className="crpv-tweaks-list">
                          {assumptionWorkbenchPreview.slice(0, 8).map((assumption) => (
                            <div key={assumption.id} className="crpv-tweaks-list-item">
                              <div className="crpv-tweaks-list-text">{assumption.assumption}</div>
                              <div className="crpv-tweaks-list-meta">
                                {assumption.source} · {assumption.status}
                                {assumption.gates.length > 0 ? ` · gates ${assumption.gates.join(" · ")}` : ""}
                              </div>
                              <div className="crpv-tweaks-list-sub">{assumption.impact}</div>
                              {assumption.note ? <div className="crpv-tweaks-list-sub">Note: {assumption.note}</div> : null}
                              <div className="crpv-tweaks-chip-row">
                                {(["untested", "validating", "validated", "invalidated"] as const).map((status) => (
                                  <button
                                    key={status}
                                    type="button"
                                    className={`crpv-tweaks-chip ${assumption.status === status ? "active" : ""}`}
                                    disabled={assumptionUpdatingId === assumption.id}
                                    onClick={() => void setAssumptionStatus(assumption.id, status)}
                                  >
                                    {status}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {tweakTab === "rerun" && (
                    <div className="section">
                      <div className="sect-title">Rerun controls</div>
                      <div className="crpv-tweaks-note">
                        Scoped reruns are preferred here. Only the full analysis button rebuilds the broader diagnostic layer.
                      </div>
                      <button type="button" className="btn" onClick={() => void runOutsideSignals()}>
                        Refresh outside evidence
                      </button>
                      <button type="button" className="btn" onClick={() => void rerunFoundationScope()}>
                        Rebuild foundation + routes
                      </button>
                      <button type="button" className="btn" onClick={() => void rerunOdiJobMapScope()}>
                        Regenerate job map
                      </button>
                      <button type="button" className="btn" onClick={() => void runAnalysis()} disabled={analysisRunning}>
                        {analysisRunning ? "Full analysis running…" : "Run full analysis"}
                      </button>
                      <button type="button" className="btn" onClick={() => void cancelAnalysis()} disabled={!analysisRunning}>
                        Cancel running analysis
                      </button>
                      <button type="button" className="btn" onClick={() => navigate(CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE)}>
                        Open workshop
                      </button>
                    </div>
                  )}

                  {tweakTab === "access" && (
                    <>
                      <div className="section">
                        <div className="sect-title">Access patterns</div>
                        <label className="tweak-toggle">
                          <span className="lbl">Pill row<span className="sub">Explicit chips under meta row</span></span>
                          <input
                            type="checkbox"
                            checked={accessModes.pills}
                            onChange={(event) =>
                              setAccessModes((prev) => ({ ...prev, pills: event.target.checked }))
                            }
                          />
                          <span className="sw" />
                        </label>
                        <label className="tweak-toggle">
                          <span className="lbl">Inline hot-phrase<span className="sub">Dashes open related drawer</span></span>
                          <input
                            type="checkbox"
                            checked={accessModes.inline}
                            onChange={(event) =>
                              setAccessModes((prev) => ({ ...prev, inline: event.target.checked }))
                            }
                          />
                          <span className="sw" />
                        </label>
                        <label className="tweak-toggle">
                          <span className="lbl">Right-edge tabs<span className="sub">Pinned vertical access</span></span>
                          <input
                            type="checkbox"
                            checked={accessModes.edge}
                            onChange={(event) =>
                              setAccessModes((prev) => ({ ...prev, edge: event.target.checked }))
                            }
                          />
                          <span className="sw" />
                        </label>
                        <label className="tweak-toggle">
                          <span className="lbl">Footer row<span className="sub">Bottom context strip</span></span>
                          <input
                            type="checkbox"
                            checked={accessModes.footer}
                            onChange={(event) =>
                              setAccessModes((prev) => ({ ...prev, footer: event.target.checked }))
                            }
                          />
                          <span className="sw" />
                        </label>
                      </div>
                      <div className="section">
                        <div className="sect-title">Navigation</div>
                        <button type="button" className="btn" onClick={goToMainSite}>
                          ← Main site
                        </button>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="section">
                    <div className="sect-title">Access patterns</div>
                    <label className="tweak-toggle">
                      <span className="lbl">Pill row<span className="sub">Explicit chips under meta row</span></span>
                      <input
                        type="checkbox"
                        checked={accessModes.pills}
                        onChange={(event) =>
                          setAccessModes((prev) => ({ ...prev, pills: event.target.checked }))
                        }
                      />
                      <span className="sw" />
                    </label>
                    <label className="tweak-toggle">
                      <span className="lbl">Inline hot-phrase<span className="sub">Dashes open related drawer</span></span>
                      <input
                        type="checkbox"
                        checked={accessModes.inline}
                        onChange={(event) =>
                          setAccessModes((prev) => ({ ...prev, inline: event.target.checked }))
                        }
                      />
                      <span className="sw" />
                    </label>
                    <label className="tweak-toggle">
                      <span className="lbl">Right-edge tabs<span className="sub">Pinned vertical access</span></span>
                      <input
                        type="checkbox"
                        checked={accessModes.edge}
                        onChange={(event) =>
                          setAccessModes((prev) => ({ ...prev, edge: event.target.checked }))
                        }
                      />
                      <span className="sw" />
                    </label>
                    <label className="tweak-toggle">
                      <span className="lbl">Footer row<span className="sub">Bottom context strip</span></span>
                      <input
                        type="checkbox"
                        checked={accessModes.footer}
                        onChange={(event) =>
                          setAccessModes((prev) => ({ ...prev, footer: event.target.checked }))
                        }
                      />
                      <span className="sw" />
                    </label>
                  </div>
                  <div className="section">
                    <div className="sect-title">Navigation</div>
                    <button type="button" className="btn" onClick={goToMainSite}>
                      ← Main site
                    </button>
                  </div>
                </>
              )}
            </aside>

            <button type="button" className={`crpv-tweaks-fab ${tweaksOpen ? "hidden" : "visible"}`} onClick={() => setTweaksOpen(true)}>
              ⚙
            </button>

            {!hasHierarchy && <div className="crpv-scrim" onClick={closeDrawer} />}

            {!hasHierarchy && <aside className="crpv-side-drawer" aria-hidden={layer !== "drawer"}>
              <button type="button" className="close" onClick={closeDrawer}>
                ✕ CLOSE
              </button>
              {currentDrawer ? (
                <>
                  <p className="cap">DECISION CONTEXT</p>
                  <h3>{commandActionTitle || currentDrawer.headline}</h3>
                  {commandActionSupport ? <p className="big">{commandActionSupport}</p> : null}
                  <div className="crpv-drawer-sections">
                    {combinedDrawerSections.map((section) => (
                      <section key={section.title} className={`crpv-drawer-section ${section.compact ? "compact" : ""}`.trim()}>
                        <div className="crpv-drawer-section-header">
                          <p className="cap">{section.title}</p>
                          {!section.compact ? <h4>{section.headline}</h4> : null}
                        </div>
                        {section.big ? <p className="big">{section.big}</p> : null}
                        <div className="rows">
                          {section.rows.map((row) => (
                            <div key={`${section.title}-${row.key}-${row.value}`} className="row">
                              <span className="label">{row.key}</span>
                              <span className="value">{row.value}</span>
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </>
              ) : null}
            </aside>}

            <div className={`crpv-system-line ${systemLineOn ? "on" : ""}`}>
              {systemLine}
              <span className="cursor" />
            </div>

            <div
              className={`crpv-waypoint-tooltip ${hoverTip ? "show" : ""}`}
              style={{
                left: `${hoverTip?.x ?? 0}px`,
                top: `${hoverTip?.y ?? 0}px`,
              }}
            >
              {hoverTip?.text || ""}
            </div>

          </div>
        )}
      </section>
  );
}
