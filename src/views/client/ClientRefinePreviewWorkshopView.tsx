import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { isFrozenCompany } from "@/lib/frozenCompanies";
import { engagementDayFrom } from "@/lib/engagementDay";
import { resolveChosenSet, heuristicDefaultViewSeed } from "@/lib/chosenJobStepSet";
import { useAuth } from "@/hooks/useAuth";
import { useCapability } from "@/hooks/useCapability";
import { useCompany } from "@/hooks/useCompany";
import type { Company } from "@/hooks/useCompany";
import { useClientViewData } from "@/hooks/useClientViewData";
import { usePositioningCanvas, mapRow as mapPositioningCanvasRow } from "@/hooks/usePositioningCanvas";
import { usePositioningProposal } from "@/hooks/usePositioningProposal";
import { useCascadeProposal } from "@/hooks/useCascadeProposal";
import { useOpportunityProposalHandlers } from "@/hooks/useOpportunityProposalHandlers";
import { useStrategyCascade, mapRow as mapStrategyCascadeRow } from "@/hooks/useStrategyCascade";
import { useOdiNeeds } from "@/hooks/useOdiNeeds";
import { useJobSteps } from "@/hooks/useJobSteps";
import { useStrategicChangeSummary } from "@/hooks/useStrategicChangeSummary";
import { useStrategicHypotheses } from "@/hooks/useStrategicHypotheses";
import JobMapOrgPanel, { deriveSuggestedId } from "./workshop/tabs/JobMapOrgPanel";
import { usePublicBaseline } from "@/hooks/usePublicBaseline";
import { useSourceConfidence } from "@/hooks/useSourceConfidence";
import { useSignalExclusion } from "@/hooks/useSignalExclusion";
import { computeExclusionImpact, computeLatestExclusionAt } from "@/lib/evidenceImpact";
import { stageLabel } from "@/lib/phaseDisplay";
import { supabase } from "@/integrations/supabase/client";
import { pollPublicBaselineTerminal } from "@/lib/pollPublicBaseline";
import { captureBaseline } from "@/lib/baselineCapture";
import { saveManualEdit } from "@/lib/manualInlineEdit";
import { CLIENT_REFINE_PREVIEW_ROUTE, CLIENT_REFINE_PREVIEW_ROUTES_ROUTE, CLIENT_REFINE_PREVIEW_COMPANY_ROUTE, CLIENT_REFINE_PREVIEW_INBOX_ROUTE, CLIENT_REFINE_PREVIEW_MEMBERS_ROUTE, CLIENT_REFINE_PREVIEW_EXTRACTS_ROUTE } from "@/lib/clientRefinePreview";
import { useRoutes } from "@/hooks/useRoutes";
import { useDriftScan } from "@/hooks/useDriftScan";
import { useDriftInboxCount } from "@/hooks/useDriftInbox";
import { formatDistanceToNow } from "date-fns";
import ScoreContextBar from "@/components/score/ScoreContextBar";


import PositioningOrgPanel from "./workshop/tabs/PositioningOrgPanel";
import StrategyOrgPanel from "./workshop/tabs/StrategyOrgPanel";
import NeedsOrgPanel from "./workshop/tabs/NeedsOrgPanel";
import InputsTab from "./workshop/tabs/InputsTab";
import { RoutesOrgPanel } from "./ClientRefinePreviewRoutesView";
import DiagnosePanel from "./workshop/tabs/DiagnosePanel";
import WorkshopCouncilTab from "./workshop/tabs/CouncilPanel";
import { WorkshopSidebar } from "@/components/client/WorkshopSidebar";
import DriftDetailPanel from "@/components/drift/DriftDetailPanel";
import { OnStrategyPin } from "@/components/strategy/OnStrategyPin";
import { StrategyCompare, PositioningCompare } from "./workshop/tabs/ComparePanel";
import { PositioningOutside, StrategyOutside, NeedsOutside, NeedsOutsideCompare } from "./workshop/tabs/OutsidePanels";
import "@/styles/client-refine-preview.css";
import {
  type WorkshopTab,
  type ExclusionControls,
  type BaselineVoiceSignal,
  type BaselineEvidenceItem,
  type BaselineResult,
} from "./workshop/types";
import { baselineOf } from "./workshop/helpers";
import {
  EvidenceImpactBanner,
  ARTIFACT_TO_TAB,
  DataQualityMarker,
} from "./workshop/primitives";
import { deriveNextBestMove, type EvidenceReadiness } from "@/lib/nextBestMove";
import { deriveClientAssumptions, deriveClientEvidence } from "@/lib/routeClientNarrative";
import { detectStrategicThemes, normalizeAuthorityPhase } from "@/lib/signalAuthority";
import { inferStrategicCenter } from "@/lib/strategicCenter";
import { deriveStrategicTensions } from "@/lib/tensionDerivation";
import { buildReadinessFromCompanySignals } from "@/lib/mojoScoreFromAnatomy";
import { useCompanyClaims } from "@/lib/claims/useCompanyClaims";
import type { ClaimState } from "@/lib/claimState";
import { useSignalLandscape } from "@/hooks/useSignalLandscape";
import type { SignalBasis } from "@/components/design-system/SignalBasisChip";
import {
  sanitizeWebsite,
  findCompanyCollision,
  suggestInstanceName,
  countUploadedFiles,
  createCompanyInstance,
  type CompanyCollision,
} from "@/lib/companyCollision";
import { useCompanyLenses, fetchLensRouteRefs } from "@/lib/lensResolution";
import { useDiagnoseReadiness } from "@/lib/phaseReadiness";

function cleanText(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function StrategicDebugSummary(_props: {
  latestEventId: string | null;
  latestEventAt: string | null;
  affectedCount: number;
  artifactVersionCount: number | null;
  dependenciesCreatedCount: number | null;
}) {
  return null;
}





// ─── Company switcher ─────────────────────────────────────────────────────────

function CompanySwitcher({
  activeCompany,
  companies,
  loading,
  onSelect,
  suffix,
}: {
  activeCompany: Company | null | undefined;
  companies: Company[];
  loading: boolean;
  onSelect: (id: string) => void;
  suffix?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) { setQuery(""); return; }
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = query.trim()
    ? companies.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    : companies;

  const label = activeCompany ? activeCompany.name.toUpperCase() : "SELECT COMPANY";

  return (
    <div className="crpv-co-switcher" ref={containerRef}>
      <button
        type="button"
        className="crpv-co-trigger cap"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        [{label}]{suffix ? ` ${suffix}` : ""}
        <span className="crpv-co-caret">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="crpv-co-dropdown" role="listbox">
          {companies.length > 6 && (
            <div className="crpv-co-search-wrap">
              <input
                ref={inputRef}
                className="crpv-co-search"
                type="text"
                placeholder="Filter companies…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}
          {loading ? (
            <div className="crpv-co-empty cap">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="crpv-co-empty cap">No match</div>
          ) : (
            <ul className="crpv-co-list">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`crpv-co-option${c.id === activeCompany?.id ? " active" : ""}`}
                    role="option"
                    aria-selected={c.id === activeCompany?.id}
                    onClick={() => { onSelect(c.id); setOpen(false); }}
                  >
                    <span className="crpv-co-option-name">{c.name}</span>
                    <span className="crpv-co-option-meta cap">
                      {[
                        c.quarter,
                        c.archetype,
                        c.mojo_score != null ? `score ${Math.round(c.mojo_score)}` : null,
                      ].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

function deriveFieldCondition({
  mojoScore,
  confidenceLevel,
  tensionsCount,
  hasPrimaryEvidence,
}: {
  mojoScore: number;
  confidenceLevel: string;
  tensionsCount: number;
  hasPrimaryEvidence: boolean;
}): string {
  const score = Math.round(mojoScore);
  if (score < 35 || confidenceLevel === "Low") {
    return "Outside view · directional read only, validation not yet earned.";
  }
  if (score < 58 && tensionsCount > 1) {
    return "Reframe · competing signals, earlier interpretation weakening.";
  }
  if (score < 55 && tensionsCount > 0) {
    return "Reframe · earlier interpretation weakening.";
  }
  if (!hasPrimaryEvidence && score < 68) {
    return "Diagnose · outside read active, customer proof still thin.";
  }
  if (score < 70 && confidenceLevel !== "High") {
    return "Focus · commitment building, gaps narrowing.";
  }
  if (score >= 70 && tensionsCount > 0) {
    return "Flow · confidence stable, unresolved tensions remain.";
  }
  if (score >= 70) {
    return "Flow · confidence stable, validation holding.";
  }
  return "Diagnose · reading the field.";
}

function deriveStrategicStateLine({
  phase,
  underservedHighCount,
  commitmentBlockerCount,
  highPressureTensionCount,
  hasSelectedRoute,
  selectedRouteCategory,
  needsCount,
  topTensionStatement,
}: {
  phase: string;
  underservedHighCount: number;
  commitmentBlockerCount: number;
  highPressureTensionCount: number;
  hasSelectedRoute: boolean;
  selectedRouteCategory: string | null;
  needsCount: number;
  topTensionStatement: string | null;
}): string {
  // Primary: describe the current momentum or constraint — not counts, but direction
  if (commitmentBlockerCount > 0) {
    if (topTensionStatement) return topTensionStatement;
    return "A commitment blocker remains unresolved — directional confidence at risk.";
  }

  if (hasSelectedRoute && selectedRouteCategory) {
    const anchor = selectedRouteCategory === "fix"
      ? "Commitment anchored on known friction — execution proof is the open question."
      : selectedRouteCategory === "create"
      ? "Expansionary bet committed — outside validation still required to hold this direction."
      : "Commitment building on incremental signals — continue strengthening the evidence base.";
    return anchor;
  }

  if (highPressureTensionCount >= 2) {
    if (topTensionStatement) return topTensionStatement;
    return "Competing signals are generating strategic pressure — commitment not yet safe.";
  }

  if (underservedHighCount >= 4) {
    return "Customer gaps remain the primary unresolved constraint on directional commitment.";
  }

  if (phase === "outside_signals" || phase === "validate_outside") {
    return "Outside signals being collected — too early for directional commitment.";
  }

  if (phase === "diagnose" || phase === "validate_diagnose") {
    return needsCount > 0
      ? "Pattern reading in progress — customer tensions identified, commitment window not yet open."
      : "Pattern reading in progress — customer tensions not yet mapped.";
  }

  if (topTensionStatement) return topTensionStatement;

  return "";
}

/**
 * BRT-1 — the ONE definition of the cold-start (birth) payload for this surface.
 *
 * Extracted from handleCreateInstance so the create-instance path and the Inputs-tab
 * birth trigger cannot drift: both send byte-identical bodies by construction rather
 * than by copy-paste. `include_public_collection: false` is the load-bearing flag —
 * it makes research-company CONSUME the company's already-banked public signals
 * instead of re-running public collection (the SIAA/Wasabi procedure). Flipping it
 * true would re-collect a baseline the operator already paid for.
 *
 * research-company's cold-start guard is birth-only and refuses any company that
 * already has a spine, so callers must gate on an empty spine before invoking.
 */
function coldStartBody(companyId: string, companyName: string, website: string, trigger: string) {
  return {
    company_id: companyId,
    company_name: companyName,
    website,
    mode: "hybrid",
    include_public_collection: false,
    include_local_alignment: true,
    apply_score_update: true,
    trigger,
    review_mode: "advisory",
    allow_review_block_save: true,
  };
}

export default function ClientRefinePreviewWorkshopView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { user, isAdmin } = useAuth();
  const { companies, setActiveCompanyId, loading: companiesLoading, refetch: refetchCompany , fetchError: companiesFetchError } = useCompany();
  const { activeCompany, hasCompany, confidence } = useClientViewData({ actionLimit: 0 });
  // Lens focus state must precede useRoutes (the hook takes the focused key).
  // viewing (viewedSetKey) stays ephemeral — never persisted; choosing is OnStrategyPin's.
  const [viewedSetKey, setViewedSetKey] = useState<string | null>(null);
  const [showAllJourneys, setShowAllJourneys] = useState(false);
  // Lens layer (reads gate): the company's market_lens rows, lead-first. Empty for
  // frozen fixtures / pre-lens companies ⇒ every consumer falls back to legacy.
  const { lenses: companyLenses } = useCompanyLenses(activeCompany?.id);
  // INT-4 passive advancement offer: shown only when the phase is NOT operator-set
  // AND internal evidence exists (single readiness authority). Dismissable for the
  // session; reappears naturally on revisit while still unset+ready. Never writes.
  const phaseIsSet = activeCompany?.engagement_phase_set === true;
  const { ready: diagnoseReady } = useDiagnoseReadiness(activeCompany?.id, !phaseIsSet && isAdmin);
  const [advanceOfferDismissed, setAdvanceOfferDismissed] = useState(false);
  // The COMPANY POOL stays unscoped here — hierarchy/unrouted are company-level
  // properties. Lens scoping applies downstream in filteredRoutes (via
  // route_lens_refs), so a focused-but-unreferenced lens can render its honest
  // empty state without flipping company-level layout decisions.
  const { items: routes, loading: routesLoading } = useRoutes(activeCompany?.id);
  const { data: strategicHypothesisRows = [] } = useStrategicHypotheses(activeCompany?.id);

  // Focused lens's referenced route ids: null = no lens layer for the focused key
  // (legacy filtering applies); a Set (possibly empty) = lens-scoped.
  const [focusedLensRouteIds, setFocusedLensRouteIds] = useState<Set<string> | null>(null);
  // DEF-3: `null` alone cannot say WHY there are no ids — "no lens layer" and "the
  // fetch hasn't resolved yet" both read as null. That conflation is the flash: on
  // mount null took the legacy branch and rendered every route, then the Set landed
  // and the filter collapsed the view. This flag separates loading from resolved so
  // consumers can hold a stable state instead of rendering-then-swapping.
  const [lensRefsLoading, setLensRefsLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const cid = activeCompany?.id;
    if (!cid || !viewedSetKey || showAllJourneys) { setFocusedLensRouteIds(null); setLensRefsLoading(false); return; }
    setLensRefsLoading(true);
    fetchLensRouteRefs(cid, viewedSetKey)
      .then((res) => {
        if (!cancelled) setFocusedLensRouteIds(res.lens ? res.referencedRouteIds : null);
      })
      .catch(() => {
        // A rejected read must not strand the loading state (it would hold the panel
        // in "Loading routes…" forever). Fall back to the legacy/unscoped branch.
        if (!cancelled) setFocusedLensRouteIds(null);
      })
      .finally(() => {
        if (!cancelled) setLensRefsLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeCompany?.id, viewedSetKey, showAllJourneys]);

  // BRT-1 — spine presence, mirroring _shared/spinePredicate.ts EXACTLY (routes at
  // level 'route', job_steps, positioning_canvases, strategy_cascades,
  // odi_market_definitions). Deliberately NOT hasHierarchy: that proxy has now caused
  // four gaps, and here it would be actively wrong — a company can have job steps or a
  // market definition (hence a spine, hence refused by the birth guard) while still
  // having zero routes. The gate must match the server's predicate or the button lies.
  //
  // `null` = not yet determined; the button must not claim "no spine" while loading
  // (DEF-3's lesson), because that would offer birth to a company that already has one.
  const [companyHasSpine, setCompanyHasSpine] = useState<boolean | null>(null);
  const [birthRunning, setBirthRunning] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const cid = companyId;
    if (!cid) { setCompanyHasSpine(null); return; }
    setCompanyHasSpine(null);
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const hasRow = async (table: string) => {
        const { count } = await sb.from(table).select("id", { count: "exact", head: true }).eq("company_id", cid);
        return (count ?? 0) > 0;
      };
      try {
        const { count: routeCount } = await sb
          .from("routes")
          .select("id", { count: "exact", head: true })
          .eq("company_id", cid)
          .eq("level", "route");
        const found = (routeCount ?? 0) > 0
          || await hasRow("job_steps")
          || await hasRow("positioning_canvases")
          || await hasRow("strategy_cascades")
          || await hasRow("odi_market_definitions");
        if (!cancelled) setCompanyHasSpine(found);
      } catch {
        // Unknown stays unknown — never report "no spine" on a failed read, or the
        // button would offer a birth the server will refuse with 409.
        if (!cancelled) setCompanyHasSpine(null);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, needsRefreshKey]);

  // BRT-1 — birth an EXISTING baseline-only company. Same run-agent-flow invocation
  // and payload as create-instance (shared coldStartBody), so no second definition of
  // the birth contract exists. run-agent-flow writes NO long_runner_runs row, so there
  // is no ledger to poll for this flow: past the ~150s edge cut the honest report is
  // "still running server-side" — the SPINE itself is the truth, and when it lands the
  // trigger flips to its already-spined disabled state on the next refresh.
  const handleBirthSpine = useCallback(async () => {
    const cid = companyId;
    const name = activeCompany?.name ?? "";
    const site = activeCompany?.website ?? "";
    if (!cid || !name || !site || birthRunning) return;
    setBirthRunning(true);
    toast.loading(`Building ${name}'s spine — routes, job map, market definition… (~3–7 min)`, { id: "birth-spine" });
    try {
      const { error } = await supabase.functions.invoke("run-agent-flow", {
        body: coldStartBody(cid, name, site, "workshop_birth_spine"),
      });
      if (error) {
        // The ~150s gateway wall cuts the browser while the isolate keeps running —
        // both prior births (SIAA, Wasabi) landed this way. Not a failure.
        console.warn("[Workshop] birth-spine cold start:", error);
        toast.success(`${name}'s spine is still building server-side — reload in a few minutes to see it.`, { id: "birth-spine" });
      } else {
        toast.success(`${name}'s spine is built — routes, job map and market definition are in.`, { id: "birth-spine" });
      }
      await refetchCompany();
      setNeedsRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(`Spine build failed — ${err instanceof Error ? err.message : String(err)}`, { id: "birth-spine" });
    } finally {
      setBirthRunning(false);
    }
  }, [companyId, activeCompany?.name, activeCompany?.website, birthRunning, refetchCompany]);

  const workshopHasHierarchy = routes.some((r) => r.level === "route");
  const unroutedCount = routes.filter((r) => r.parent_id == null && r.level !== "route").length;

  const initialTab = (searchParams.get("tab") as WorkshopTab | null) ?? "positioning";

  const [activeTab,   setActiveTab]   = useState<WorkshopTab>(initialTab);
  const [showCompare, setShowCompare] = useState(false);
  const [activeStepId,      setActiveStepId]      = useState<string | null>(null);
  const [activeRouteId,     setActiveRouteId]     = useState<string | null>(null);
  const [needsRefreshKey,   setNeedsRefreshKey]   = useState(0);
  const [regeneratingJobMap, setRegeneratingJobMap] = useState(false);
  const [regeneratingConditions, setRegeneratingConditions] = useState(false);
  const [regeneratingMarket, setRegeneratingMarket] = useState(false);
  const [regeneratingOpportunities, setRegeneratingOpportunities] = useState(false);
  // Operator's CHOSEN on-strategy job-step set (operator_primary_selection,
  // domain='job_step_set'). undefined = not loaded yet, null = nothing chosen.
  const [chosenSetKey, setChosenSetKey] = useState<string | null | undefined>(undefined);
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [creatingClient, setCreatingClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientWebsite, setNewClientWebsite] = useState("");
  const [newClientRunBaseline, setNewClientRunBaseline] = useState(true);
  // Gate 2 — create-new-instance: collision dialog state. stage 'confirm' shows the
  // "already exists — create a new instance? OK/Cancel" prompt; stage 'name' is the
  // validate-loop new-name prompt (re-checks on every OK, stays open on collision).
  const [instancePrompt, setInstancePrompt] = useState<null | {
    stage: "confirm" | "name";
    original: CompanyCollision;
    fileCount: number;
  }>(null);
  const [instanceName, setInstanceName] = useState("");
  const [instanceNameError, setInstanceNameError] = useState<string | null>(null);
  const [instanceCopyFiles, setInstanceCopyFiles] = useState(false);
  const [creatingInstance, setCreatingInstance] = useState(false);

  const companyId = activeCompany?.id;
  // Governance split (checkpoint 3a): positioning + cascade apply/reject gated by
  // capability. Single authority — never re-query roles/caps inline.
  const canApply = useCapability("governance.proposal.apply", companyId);
  const canReject = useCapability("governance.proposal.reject", companyId);
  // Operational caps (checkpoint 3b).
  const canCreateClient = useCapability("workspace.client.create", companyId);
  const canScan = useCapability("governance.drift.scan", companyId);
  const canGenPositioning = useCapability("structure.positioning.generate", companyId);
  const canGenCascade = useCapability("structure.cascade.generate", companyId);
  const canInlineCascade = useCapability("structure.cascade.inlineEdit", companyId);
  const canInlinePositioning = useCapability("structure.positioning.inlineEdit", companyId);

  const { signals: sourceSignals } = useSourceConfidence({
    companyId,
    areaScoresJson: activeCompany?.area_scores_json,
    evidenceStatus: activeCompany?.evidence_status,
  });

  const signalExclusion = useSignalExclusion(
    companyId ?? null,
    activeCompany?.excluded_signals_json,
    refetchCompany,
  );
  const exclusionControls: ExclusionControls = {
    isExcluded: signalExclusion.isExcluded,
    excludeSignal: signalExclusion.excludeSignal,
    restoreSignal: signalExclusion.restoreSignal,
  };

  const { preferredRun: baselineRun, loading: baselineLoading, error: baselineError } = usePublicBaseline(companyId);
  // Integrity sweep: the outside panels distinguish looked / not-yet / couldn't-check.
  const baselineIntegrity = { run: baselineRun, error: baselineError ?? null };
  const baseline = baselineOf(baselineRun);
  const dataQualityFlag = baseline?.data_quality_flag ?? null;

  const { landscape: workshopSignalLandscape } = useSignalLandscape(companyId);
  // DAY-52 hardcode removed (queue item): same formula as the homepage's ENGAGEMENT_DAY
  // (ClientRefinePreviewView) — computed from companies.engagement_started_at, "—" when unset.
  const workshopEngagementDay = useMemo(
    () => engagementDayFrom(activeCompany?.engagement_started_at),
    [activeCompany?.engagement_started_at],
  );

  const workshopSignalBasis: SignalBasis | undefined = workshopSignalLandscape ? {
    publicCount:   workshopSignalLandscape.byBand.outside.count,
    teamCount:     workshopSignalLandscape.byBand.organization.count,
    customerCount: workshopSignalLandscape.byBand.customer.count,
    publicBreakdown: workshopSignalLandscape.publicBreakdown,
  } : undefined;

  const exclusionImpact = useMemo(
    () => computeExclusionImpact(baseline?.evidence_ledger ?? [], signalExclusion.excludedSet, ARTIFACT_TO_TAB),
    [baseline?.evidence_ledger, signalExclusion.excludedSet],
  );

  const latestExclusionAt = useMemo(
    () => computeLatestExclusionAt(signalExclusion.excluded),
    [signalExclusion.excluded],
  );

  const [posRefreshKey, setPosRefreshKey] = useState(0);
  const [posReEvalLoading, setPosReEvalLoading] = useState(false);
  const [cascadeProposalRefreshKey, setCascadeProposalRefreshKey] = useState(0);
  const [cascadeRefreshKey, setCascadeRefreshKey] = useState(0);

  // ── Drift detail panel ────────────────────────────────────────────────────────
  const [driftPanel, setDriftPanel] = useState<{ surfaceType: string; surfaceId: string } | null>(null);
  const [driftBadgeRefreshKey, setDriftBadgeRefreshKey] = useState(0);
  const { scanningAll, checkingSurfaceId: driftCheckingSurfaceId, scanAllSurfaces, checkSurface: checkSurfaceDrift } = useDriftScan(companyId);
  const [scanAllStatus, setScanAllStatus] = useState<{ assessed: number; aligned: number; slight_drift: number; material_drift: number; scannedAt: Date } | null>(null);
  const [scanAllError, setScanAllError] = useState<string | null>(null);

  const handleScanAllSurfaces = useCallback(() => {
    if (!canScan) return; // governance.drift.scan
    setScanAllError(null);
    scanAllSurfaces(
      (result) => {
        setDriftBadgeRefreshKey((k) => k + 1);
        setScanAllStatus({ ...result, scannedAt: new Date() });
        const driftCount = (result.slight_drift ?? 0) + (result.material_drift ?? 0);
        const summary = driftCount === 0
          ? `${result.assessed} surface${result.assessed === 1 ? "" : "s"} · all aligned`
          : `${result.assessed} surface${result.assessed === 1 ? "" : "s"} · ${driftCount} with drift`;
        toast.success(`Scanned · ${summary}`, { duration: 4000 });
      },
      (err) => {
        setScanAllError(err);
        toast.error(`Scan failed — ${err}`, { duration: 5000 });
      },
    );
  }, [canScan, scanAllSurfaces]);

  const handleCheckSurfaceDrift = useCallback((surfaceType: string, surfaceId: string) => {
    if (!canScan) return; // governance.drift.scan
    checkSurfaceDrift(
      surfaceType,
      surfaceId,
      (result) => {
        setDriftBadgeRefreshKey((k) => k + 1);
        const driftLabel = result.material_drift > 0 ? "material drift" : result.slight_drift > 0 ? "slight drift" : "aligned";
        toast.success(`Checked ${surfaceType} · ${driftLabel}`, { duration: 4000 });
      },
      (err) => {
        toast.error(`Check failed — ${err}`, { duration: 5000 });
      },
    );
  }, [canScan, checkSurfaceDrift]);

  const { totalUnresolved: inboxCount, newCount: inboxNewCount } = useDriftInboxCount(companyId);

  // ─── All data-fetching hooks before any callbacks ─────────────────────────
  const {
    loading: posLoading,
    item: positioning,
    error: posError,
    updateTextField: updatePosTextField,
    updateItemsField: updatePosItemsField,
    canvasId,
  } = usePositioningCanvas(companyId, posRefreshKey);
  // 3b: positioning inline-edit save gated by structure.positioning.inlineEdit.
  const updatePosTextFieldGated = useCallback(
    (field: Parameters<typeof updatePosTextField>[0], value: string, opts?: { isManualInline?: boolean }) =>
      canInlinePositioning ? updatePosTextField(field, value, opts) : Promise.resolve(),
    [canInlinePositioning, updatePosTextField],
  );

  const {
    loading: stratLoading,
    item: strategy,
    updateNarrativeField,
    updateListField,
    cascadeId,
  } = useStrategyCascade(companyId, cascadeRefreshKey);

  // ── Gate 3b: declared-direction artifacts (operator-signed dual render) ────
  // All of this renders NOTHING unless a declared artifact exists — companies
  // without one are byte-identical to the single-render behavior.
  const [declaredCanvasRow, setDeclaredCanvasRow] = useState<Record<string, unknown> | null>(null);
  const [declaredCascadeRow, setDeclaredCascadeRow] = useState<Record<string, unknown> | null>(null);
  const [directionView, setDirectionView] = useState<"declared" | "market">("market");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!companyId) { setDeclaredCanvasRow(null); setDeclaredCascadeRow(null); setDirectionView("market"); return; }
      const sb = supabase as unknown as { from: (t: string) => any };
      // Lens-reads law: with a focused lens, declared artifacts resolve by that
      // lens's source_direction_key — never first-row. No focus ⇒ legacy limit(1)
      // (single-declared companies; the M3 coalesced unique index guarantees at
      // most one row per (company, role, direction)).
      const declaredCanvasQ = viewedSetKey && !showAllJourneys
        ? sb.from("positioning_canvases").select("*").eq("company_id", companyId).eq("artifact_role", "declared_direction").eq("source_direction_key", viewedSetKey).maybeSingle()
        : sb.from("positioning_canvases").select("*").eq("company_id", companyId).eq("artifact_role", "declared_direction").limit(1).maybeSingle();
      const declaredCascadeQ = viewedSetKey && !showAllJourneys
        ? sb.from("strategy_cascades").select("*").eq("company_id", companyId).eq("artifact_role", "declared_direction").eq("source_direction_key", viewedSetKey).maybeSingle()
        : sb.from("strategy_cascades").select("*").eq("company_id", companyId).eq("artifact_role", "declared_direction").limit(1).maybeSingle();
      const [c, k, p] = await Promise.all([
        declaredCanvasQ,
        declaredCascadeQ,
        sb.from("operator_primary_selection").select("item_key").eq("company_id", companyId).eq("domain", "job_step_set").maybeSingle(),
      ]);
      if (cancelled) return;
      const canvasRow = (c?.data ?? null) as Record<string, unknown> | null;
      const cascadeRow = (k?.data ?? null) as Record<string, unknown> | null;
      setDeclaredCanvasRow(canvasRow);
      setDeclaredCascadeRow(cascadeRow);
      // Pin resolution (operator-ruled): declared is primary ONLY when the
      // job_step_set pin matches the declared artifacts' direction — pinning is
      // the promotion act; declared-but-unpinned keeps the market read primary.
      const pinnedKey = String((p?.data as { item_key?: unknown } | null)?.item_key ?? "").toLowerCase();
      const dirKey = String((canvasRow?.source_direction_key ?? cascadeRow?.source_direction_key) ?? "").toLowerCase();
      setDirectionView((canvasRow || cascadeRow) && pinnedKey && pinnedKey === dirKey ? "declared" : "market");
    })();
    return () => { cancelled = true; };
  }, [companyId, posRefreshKey, cascadeRefreshKey, viewedSetKey, showAllJourneys]);

  const declaredCanvas = useMemo(
    () => (declaredCanvasRow ? mapPositioningCanvasRow(declaredCanvasRow as Parameters<typeof mapPositioningCanvasRow>[0]) : null),
    [declaredCanvasRow],
  );
  const declaredCascade = useMemo(
    () => (declaredCascadeRow ? mapStrategyCascadeRow(declaredCascadeRow as Parameters<typeof mapStrategyCascadeRow>[0]) : null),
    [declaredCascadeRow],
  );
  const declaredCanvasId = declaredCanvasRow ? String(declaredCanvasRow.id ?? "") : null;
  const declaredCascadeId = declaredCascadeRow ? String(declaredCascadeRow.id ?? "") : null;

  // Declared edits write to the declared row by id — operator reshaping targets
  // the declared artifact, never the market read.
  const updateDeclaredCanvasText = useCallback(async (field: "value_for_customer" | "best_fit_customers" | "market_category" | "category_rationale" | "current_tagline" | "proposed_tagline", value: string) => {
    if (!declaredCanvasId) return;
    await (supabase as unknown as { from: (t: string) => any }).from("positioning_canvases")
      .update({ [field]: value, updated_at: new Date().toISOString() }).eq("id", declaredCanvasId);
    setPosRefreshKey((x) => x + 1);
  }, [declaredCanvasId]);
  const updateDeclaredCanvasItems = useCallback(async (field: "competitive_alternatives_json" | "unique_attributes_json", items: unknown[]) => {
    if (!declaredCanvasId) return;
    await (supabase as unknown as { from: (t: string) => any }).from("positioning_canvases")
      .update({ [field]: items, updated_at: new Date().toISOString() }).eq("id", declaredCanvasId);
    setPosRefreshKey((x) => x + 1);
  }, [declaredCanvasId]);
  const updateDeclaredCascadeNarrative = useCallback(async (field: "winning_aspiration" | "where_to_play" | "how_to_win", value: string) => {
    if (!declaredCascadeId) return;
    await (supabase as unknown as { from: (t: string) => any }).from("strategy_cascades")
      .update({ [field]: value, updated_at: new Date().toISOString() }).eq("id", declaredCascadeId);
    setCascadeRefreshKey((x) => x + 1);
  }, [declaredCascadeId]);
  const updateDeclaredCascadeList = useCallback(async (field: "capabilities_json" | "management_systems_json", items: unknown[]) => {
    if (!declaredCascadeId) return;
    await (supabase as unknown as { from: (t: string) => any }).from("strategy_cascades")
      .update({ [field]: items, updated_at: new Date().toISOString() }).eq("id", declaredCascadeId);
    setCascadeRefreshKey((x) => x + 1);
  }, [declaredCascadeId]);

  // Operator-signed strings (Gate 3b checkpoint): pane names and the Declared
  // treatment. The subline is the signed declared-direction sentence, verbatim.
  const renderDirectionToggle = (hasDeclared: boolean) => {
    if (!hasDeclared) return null;
    const btn = (key: "declared" | "market", label: string) => (
      <button
        type="button"
        onClick={() => setDirectionView(key)}
        style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em",
          padding: "5px 12px", borderRadius: 2, cursor: "pointer",
          border: directionView === key ? "1px solid #b45309" : "1px solid rgba(17,17,17,0.15)",
          background: directionView === key ? "#fef3c7" : "transparent",
          color: directionView === key ? "#b45309" : "rgba(17,17,17,0.55)",
        }}
      >
        {label}
      </button>
    );
    return (
      <div style={{ margin: "0 0 16px" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {btn("declared", "Where you're going")}
          {btn("market", "What the market sees")}
        </div>
        {directionView === "declared" && (
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "#b45309", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 2, padding: "3px 8px" }}>
              Declared
            </span>
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "rgba(17,17,17,0.6)", lineHeight: 1.5 }}>
              Declared direction, derived from your internal documents. Not yet validated by market or customer evidence.
            </span>
          </div>
        )}
      </div>
    );
  };

  const {
    loading: odiLoading,
    marketDefinition,
    needs,
    error: odiError,
    updateNeedScores,
  } = useOdiNeeds(companyId, needsRefreshKey, viewedSetKey ?? undefined);

  const { claims: workshopClaimsMap } = useCompanyClaims(companyId);
  const [pendingInspectRouteId, setPendingInspectRouteId] = useState<string | null>(null);
  const [pendingReviewNeedId, setPendingReviewNeedId] = useState<string | null>(null);
  const { items: jobSteps, loading: jobStepsLoading, refetch: refetchJobSteps } = useJobSteps(companyId);
  const { data: strategicChangeSummary } = useStrategicChangeSummary(companyId);

  const handlePosReEvaluate = useCallback(async () => {
    if (!companyId) return;
    setPosReEvalLoading(true);
    await supabase.functions.invoke("evaluate-positioning-alignment", {
      body: { company_id: companyId },
    });
    setPosReEvalLoading(false);
    setPosRefreshKey((k) => k + 1);
  }, [companyId]);

  const [proposalRefreshKey, setProposalRefreshKey] = useState(0);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);
  const [acceptLoading, setAcceptLoading] = useState(false);
  const [rejectLoading, setRejectLoading] = useState(false);

  const { proposal } = usePositioningProposal(companyId ?? undefined, proposalRefreshKey);

  // ── Cascade proposal state ────────────────────────────────────────────────
  const [cascadeGenerateLoading, setCascadeGenerateLoading] = useState(false);
  const [cascadeGenerateMessage, setCascadeGenerateMessage] = useState<string | null>(null);
  const [cascadeAcceptLoading, setCascadeAcceptLoading] = useState(false);
  const [cascadeRejectLoading, setCascadeRejectLoading] = useState(false);
  const [cascadeReEvalProgress, setCascadeReEvalProgress] = useState<string | null>(null);

  const { proposal: cascadeProposal } = useCascadeProposal(companyId ?? undefined, cascadeProposalRefreshKey);

  const handleGenerateProposal = useCallback(async () => {
    if (!companyId) return;
    if (!canGenPositioning) return; // structure.positioning.generate
    setGenerateLoading(true);
    setGenerateMessage(null);
    const { data, error } = await supabase.functions.invoke("propose-positioning-changes", {
      body: { company_id: companyId },
    });
    setGenerateLoading(false);
    if (error) {
      setGenerateMessage(`Error: ${error.message}`);
    } else if ((data as Record<string, unknown>)?.skipped) {
      setGenerateMessage("No meaningful changes from current evidence.");
    } else {
      setGenerateMessage(null);
      setProposalRefreshKey((k) => k + 1);
    }
  }, [companyId, canGenPositioning]);

  const handleAcceptProposal = useCallback(async (proposalId: string, acceptedFields: string[], skippedFields: string[]) => {
    if (!companyId || !proposal) return;
    if (!canApply) return; // governance.proposal.apply (positioning)
    setAcceptLoading(true);
    try {
      const proposed = proposal.proposed_state as Record<string, unknown>;
      const patch: Record<string, unknown> = { source: `manual_${proposalId}` };
      for (const field of acceptedFields) {
        patch[field] = proposed[field];
      }
      const { error: updateError } = await supabase
        .from("positioning_canvases")
        .update(patch)
        .eq("id", proposal.surface_id as string);
      if (updateError) {
        setGenerateMessage(`Accept failed: ${updateError.message}`);
        return;
      }
      await captureBaseline(companyId, "positioning", proposal.surface_id as string);
      await supabase
        .from("surface_proposals")
        .update({
          status: "accepted",
          reviewed_at: new Date().toISOString(),
          raw_payload: { accepted_fields: acceptedFields, skipped_fields: skippedFields },
        })
        .eq("id", proposalId);
      await supabase.functions.invoke("evaluate-positioning-alignment", {
        body: { company_id: companyId },
      });
      setPosRefreshKey((k) => k + 1);
      setProposalRefreshKey((k) => k + 1);
    } finally {
      setAcceptLoading(false);
    }
  }, [companyId, canApply, proposal]);

  const handleRejectProposal = useCallback(async (proposalId: string) => {
    if (!canReject) return; // governance.proposal.reject (positioning)
    setRejectLoading(true);
    await supabase
      .from("surface_proposals")
      .update({ status: "rejected", reviewed_at: new Date().toISOString() })
      .eq("id", proposalId);
    setRejectLoading(false);
    setProposalRefreshKey((k) => k + 1);
  }, [canReject]);

  // ── Cascade proposal handlers ─────────────────────────────────────────────
  const handleGenerateCascadeProposal = useCallback(async () => {
    if (!companyId) return;
    if (!canGenCascade) return; // structure.cascade.generate
    setCascadeGenerateLoading(true);
    setCascadeGenerateMessage(null);
    const { data, error } = await supabase.functions.invoke("propose-cascade-changes", {
      body: { company_id: companyId },
    });
    setCascadeGenerateLoading(false);
    if (error) {
      setCascadeGenerateMessage(`Error: ${error.message}`);
    } else if ((data as Record<string, unknown>)?.skipped) {
      setCascadeGenerateMessage((data as Record<string, unknown>).reason as string ?? "No changes detected.");
    } else {
      setCascadeGenerateMessage(null);
    }
    setCascadeProposalRefreshKey((k) => k + 1);
  }, [companyId, canGenCascade]);

  const handleAcceptCascadeProposal = useCallback(async (
    proposalId: string,
    acceptedFields: string[],
    skippedFields: string[],
  ) => {
    if (!companyId || !cascadeProposal) return;
    if (!canApply) return; // governance.proposal.apply (cascade)
    setCascadeAcceptLoading(true);
    setCascadeReEvalProgress(null);
    try {
      const proposed = cascadeProposal.proposed_state as Record<string, unknown>;
      const patch: Record<string, unknown> = { source: `manual_${proposalId}` };
      for (const field of acceptedFields) {
        patch[field] = proposed[field];
      }
      const { error: updateError } = await supabase
        .from("strategy_cascades")
        .update(patch)
        .eq("id", cascadeProposal.surface_id as string);
      if (updateError) {
        setCascadeGenerateMessage(`Accept failed: ${updateError.message}`);
        return;
      }
      await captureBaseline(companyId, "cascade", cascadeProposal.surface_id as string);
      await supabase
        .from("surface_proposals")
        .update({
          status: "accepted",
          reviewed_at: new Date().toISOString(),
          raw_payload: { accepted_fields: acceptedFields, skipped_fields: skippedFields },
        })
        .eq("id", proposalId);
      setCascadeRefreshKey((k) => k + 1);
      setCascadeProposalRefreshKey((k) => k + 1);

      // Downstream alignment re-eval across all surfaces
      const routeIds = routes.filter((r) => r.level === "route" || !r.level).map((r) => r.id);
      const needIds = needs.map((n) => n.id);
      const total = routeIds.length + 1 + needIds.length;
      let done = 0;
      setCascadeReEvalProgress(`Re-evaluating alignment across ${routeIds.length} routes, 1 positioning canvas, ${needIds.length} opportunities…`);

      const tick = () => {
        done++;
        setCascadeReEvalProgress(`Re-evaluating… ${done} of ${total} complete`);
      };

      await Promise.all([
        ...routeIds.map((route_id) =>
          supabase.functions.invoke("evaluate-route-alignment", { body: { route_id, company_id: companyId } })
            .then(tick).catch(tick)
        ),
        supabase.functions.invoke("evaluate-positioning-alignment", { body: { company_id: companyId } })
          .then(tick).catch(tick),
        ...needIds.map((need_id) =>
          supabase.functions.invoke("evaluate-opportunity-alignment", { body: { need_id, company_id: companyId } })
            .then(tick).catch(tick)
        ),
      ]);

      setCascadeReEvalProgress(`Alignment re-evaluation complete — ${total} surfaces updated.`);
      setPosRefreshKey((k) => k + 1);
      setNeedsRefreshKey((k) => k + 1);
    } finally {
      setCascadeAcceptLoading(false);
    }
  }, [companyId, canApply, cascadeProposal, routes, needs]);

  const handleRejectCascadeProposal = useCallback(async (proposalId: string) => {
    if (!canReject) return; // governance.proposal.reject (cascade)
    setCascadeRejectLoading(true);
    await supabase
      .from("surface_proposals")
      .update({ status: "rejected", reviewed_at: new Date().toISOString() })
      .eq("id", proposalId);
    setCascadeRejectLoading(false);
    setCascadeProposalRefreshKey((k) => k + 1);
  }, [canReject]);

  const handleCascadeNarrativeInlineEdit = useCallback(async (
    field: "winning_aspiration" | "where_to_play" | "how_to_win",
    value: string,
    opts?: { isManualInline?: boolean },
  ) => {
    if (!canInlineCascade) return; // structure.cascade.inlineEdit
    await updateNarrativeField(field, value, opts);
    if (!companyId) return;
    const routeIds = routes.filter((r) => r.level === "route" || !r.level).map((r) => r.id);
    const needIds = needs.map((n) => n.id);
    routeIds.forEach((route_id) => {
      supabase.functions.invoke("evaluate-route-alignment", { body: { route_id, company_id: companyId } }).catch(() => {});
    });
    supabase.functions.invoke("evaluate-positioning-alignment", { body: { company_id: companyId } }).catch(() => {});
    needIds.forEach((need_id) => {
      supabase.functions.invoke("evaluate-opportunity-alignment", { body: { need_id, company_id: companyId } }).catch(() => {});
    });
    setPosRefreshKey((k) => k + 1);
    setNeedsRefreshKey((k) => k + 1);
  }, [companyId, canInlineCascade, updateNarrativeField, routes, needs]);

  // ── Opportunity proposal handlers (extracted to avoid TDZ ordering fragility) ─
  const {
    opportunityProposalsMap,
    generateLoadingOpportunityId,
    acceptLoadingOpportunityProposalId,
    rejectLoadingOpportunityProposalId,
    handleSaveNeedField,
    handleGenerateOpportunityProposal,
    handleAuthorOpportunityProposal,
    handleAcceptOpportunityProposal,
    handleRejectOpportunityProposal,
  } = useOpportunityProposalHandlers(companyId, () => setNeedsRefreshKey((k) => k + 1));

  const handleDriftClick = useCallback((surfaceType: string, surfaceId: string) => {
    setDriftPanel({ surfaceType, surfaceId });
  }, []);

  // Safe: handleGenerateOpportunityProposal is from the hook call above, not a TDZ binding.
  const getDriftProposeCallback = useCallback((surfaceType: string, surfaceId: string) => {
    if (surfaceType === "cascade") return handleGenerateCascadeProposal;
    if (surfaceType === "positioning") return handleGenerateProposal;
    if (surfaceType === "opportunity") return () => handleGenerateOpportunityProposal(surfaceId);
    return undefined;
  }, [handleGenerateCascadeProposal, handleGenerateOpportunityProposal]);

  const [odiReEvalLoadingId, setOdiReEvalLoadingId] = useState<string | null>(null);

  const handleNeedReEvaluate = useCallback(async (needId: string) => {
    if (!companyId) return;
    setOdiReEvalLoadingId(needId);
    await supabase.functions.invoke("evaluate-opportunity-alignment", {
      body: { need_id: needId, company_id: companyId },
    });
    setOdiReEvalLoadingId(null);
    setNeedsRefreshKey((k) => k + 1);
  }, [companyId]);

  const workshopRouteSeeds = useMemo(
    () =>
      routes.map((route) => {
        const evidence = deriveClientEvidence(route);
        const assumptions = deriveClientAssumptions(route, evidence);
        return { route, evidence, assumptions };
      }),
    [routes],
  );
  const workshopStrategicCenter = useMemo(
    () =>
      inferStrategicCenter({
        activeRows: strategicHypothesisRows,
        routeSeeds: workshopRouteSeeds,
        phase: activeCompany?.engagement_phase ?? "diagnose",
      }),
    [activeCompany?.engagement_phase, strategicHypothesisRows, workshopRouteSeeds],
  );
  const strategyContextNote = useMemo(() => {
    if (!strategy) return null;
    if (normalizeAuthorityPhase(activeCompany?.engagement_phase ?? "diagnose") === "pre_diagnosis") return null;
    if (!workshopStrategicCenter.shouldLeadExplanations || !workshopStrategicCenter.label) return null;

    const strategyText = cleanText(
      [
        strategy.winning_aspiration,
        strategy.where_to_play,
        strategy.how_to_win,
        ...strategy.capabilities.map((item) => item.name),
        ...strategy.management_systems.map((item) => item.name),
      ].join(" "),
    );
    if (!strategyText) return null;

    const strategyThemes = detectStrategicThemes(strategyText);
    const centerThemes = workshopStrategicCenter.supportingThemes.slice(0, 2).map((theme) => theme.key);
    if (centerThemes.length === 0 || strategyThemes.length === 0) return null;

    const overlaps = centerThemes.some((theme) => strategyThemes.includes(theme));
    const craftLedStrategy = strategyThemes.includes("craft_quality");
    const nonCraftCenter = centerThemes.some((theme) =>
      theme === "partner_outcomes" || theme === "operational_reliability" || theme === "proof_trust",
    );

    if (!overlaps && nonCraftCenter) {
      return "Current strategy language may no longer reflect the strongest emerging direction.";
    }
    if (craftLedStrategy && nonCraftCenter && !centerThemes.includes("craft_quality")) {
      return "Current strategy language may no longer reflect the strongest emerging direction.";
    }
    return null;
  }, [activeCompany?.engagement_phase, strategy, workshopStrategicCenter]);

  const workshopTopLevelRoutes = useMemo(() => routes.filter((r) => r.level === "route"), [routes]);

  const workshopDominantClaimState = useMemo((): ClaimState | null => {
    if (!workshopHasHierarchy || workshopTopLevelRoutes.length === 0) return null;
    const order: ClaimState[] = ["flow", "focus", "diagnose", "outside_view"];
    const states = workshopTopLevelRoutes
      .map((r) => (r as { claim_id?: string | null }).claim_id
        ? (workshopClaimsMap.get((r as { claim_id?: string | null }).claim_id!)?.state ?? null)
        : null)
      .filter((s): s is ClaimState => s !== null);
    for (const s of order) { if (states.includes(s)) return s; }
    return states[0] ?? null;
  }, [workshopHasHierarchy, workshopTopLevelRoutes, workshopClaimsMap]);

  const goToMainSite   = useCallback(() => navigate("/"), [navigate]);
  const goToRefineHome = useCallback(() => navigate(CLIENT_REFINE_PREVIEW_ROUTE), [navigate]);
  const handleRouteSelect = useCallback(
    (routeId: string) => { setPendingInspectRouteId(routeId); setActiveTab("routes"); },
    [],
  );

  const compareActive = showCompare;

  const evidenceReadiness = useMemo((): EvidenceReadiness => ({
    hasPrimaryEvidence: sourceSignals.hasPrimaryEvidence,
    primaryEvidenceSignals: sourceSignals.primaryEvidenceSignals,
    hasCompanyEvidence: sourceSignals.hasCompanyEvidence,
  }), [sourceSignals.hasPrimaryEvidence, sourceSignals.primaryEvidenceSignals, sourceSignals.hasCompanyEvidence]);

  const councilTensions = useMemo(
    () => deriveStrategicTensions({ routes, needs, canvas: positioning ?? null, cascade: strategy ?? null, sourceSignals }),
    [routes, needs, positioning, strategy, sourceSignals],
  );

  const readiness = useMemo(
    () => buildReadinessFromCompanySignals({
      mojoScore:      activeCompany?.mojo_score,
      evidenceStatus: activeCompany?.evidence_status,
    }),
    [activeCompany?.mojo_score, activeCompany?.evidence_status],
  );

  const fieldCondition = deriveFieldCondition({
    mojoScore: Number(activeCompany?.mojo_score ?? 0),
    confidenceLevel: confidence.level,
    tensionsCount: councilTensions.length,
    hasPrimaryEvidence: sourceSignals.hasPrimaryEvidence,
  });

  const setOptions = useMemo(() => {
    const grouped = new Map<string, { key: string; title: string }>();
    for (const step of jobSteps) {
      if (!grouped.has(step.journey_key)) {
        grouped.set(step.journey_key, {
          key: step.journey_key,
          title: cleanText(step.journey_title) || step.journey_key,
        });
      }
    }
    return Array.from(grouped.values());
  }, [jobSteps]);

  // MH-4a: all sets' market_defs (journey_key → row) so the title-switcher can label
  // each option by its MH-2 market headline. Refetched on company / market regen.
  const [marketDefsByKey, setMarketDefsByKey] = useState<Record<string, { journey_key?: string | null; job_executor?: string | null; jtbd?: string | null; provenance_type?: string | null }>>({});
  useEffect(() => {
    if (!companyId) { setMarketDefsByKey({}); return; }
    let cancelled = false;
    (async () => {
      const sb = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
      const { data } = await sb.from("odi_market_definitions").select("journey_key, job_executor, jtbd, provenance_type").eq("company_id", companyId);
      if (cancelled) return;
      const map: Record<string, { journey_key?: string | null; job_executor?: string | null; jtbd?: string | null; provenance_type?: string | null }> = {};
      for (const r of ((data as Array<{ journey_key?: string | null }>) ?? [])) {
        if (r.journey_key) map[String(r.journey_key)] = r as { journey_key?: string | null; job_executor?: string | null; jtbd?: string | null; provenance_type?: string | null };
      }
      setMarketDefsByKey(map);
    })();
    return () => { cancelled = true; };
  }, [companyId, needsRefreshKey]);

  // Lens layer active ⇒ the switcher lists the company's LENSES (lead first, per
  // fetchCompanyLenses order); market_def lookup keeps the hypothesis-tier tag.
  // No lens rows (frozen fixtures / pre-lens) ⇒ legacy distinct-set options.
  const marketSwitcherOptions = useMemo(() => {
    if (companyLenses.length > 0) {
      return companyLenses.map((lens) => {
        const opt = setOptions.find((o) => o.key === lens.journey_key);
        return {
          key: lens.journey_key,
          title: lens.title || opt?.title || lens.journey_key,
          marketDef: marketDefsByKey[lens.journey_key] ?? null,
        };
      });
    }
    return setOptions.map((o) => ({ key: o.key, title: o.title, marketDef: marketDefsByKey[o.key] ?? null }));
  }, [companyLenses, setOptions, marketDefsByKey]);

  // Designed-step count per set — the view-seed signal (prefer the most complete
  // non-internal set when no choice exists).
  const designedByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const step of jobSteps) {
      if (step.designed) m.set(step.journey_key, (m.get(step.journey_key) ?? 0) + 1);
    }
    return m;
  }, [jobSteps]);

  // Load the operator's chosen on-strategy set for the default seed. Reset the
  // ephemeral view on company change so a selection never bleeds across companies
  // (companyId changes in place — the workbench doesn't remount). The RPC isn't
  // used directly: its no-choice path applies the +3 heuristic, but the default
  // must fall back to the EXISTING heuristic below when nothing is chosen.
  useEffect(() => {
    setViewedSetKey(null);
    if (!companyId) { setChosenSetKey(null); return; }
    let cancelled = false;
    setChosenSetKey(undefined);
    (async () => {
      const sb = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
      const { data } = await sb
        .from("operator_primary_selection")
        .select("item_key")
        .eq("company_id", companyId)
        .eq("domain", "job_step_set")
        .maybeSingle();
      if (cancelled) return;
      const key = String((data as { item_key?: unknown } | null)?.item_key ?? "").trim().toLowerCase();
      setChosenSetKey(key || null);
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  useEffect(() => {
    if (setOptions.length === 0) {
      setViewedSetKey(null);
      return;
    }
    // Wait for the chosen set to load so the first seed honors the operator's
    // choice instead of the heuristic cementing under the keep-current guard.
    if (chosenSetKey === undefined) return;
    // Default seed = the operator's CHOSEN on-strategy set (shared rule). When
    // nothing is chosen, seed the VIEW only (never an assertion) to a real,
    // complete NON-internal set — never the undesigned internal-ops set. View-
    // switching stays ephemeral; the keep-current guard preserves a live selection.
    // Lens layer: the LEAD lens is the default focus (reads gate). Falls back to
    // the chosen set, then the heuristic, for pre-lens/frozen companies.
    const leadLensKey = companyLenses.find((l) => l.portfolio_role === "lead")?.journey_key ?? null;
    const chosen = resolveChosenSet(chosenSetKey ?? null, setOptions.map((j) => j.key)).chosenKey;
    const preferred =
      (leadLensKey && setOptions.some((j) => j.key === leadLensKey) ? leadLensKey : null) ??
      chosen ??
      heuristicDefaultViewSeed(setOptions.map((j) => j.key), designedByKey) ??
      null;
    setViewedSetKey((current) => {
      if (current && setOptions.some((journey) => journey.key === current)) return current;
      return preferred;
    });
    if (setOptions.some((journey) => journey.key !== "customer")) {
      setShowAllJourneys(false);
    }
  }, [setOptions, chosenSetKey, designedByKey, companyLenses]);

  const filteredJobSteps = useMemo(() => {
    if (showAllJourneys || !viewedSetKey) return jobSteps;
    return jobSteps.filter((step) => step.journey_key === viewedSetKey);
  }, [jobSteps, viewedSetKey, showAllJourneys]);

  const filteredNeeds = useMemo(() => {
    if (showAllJourneys || !viewedSetKey) return needs;
    const matching = needs.filter((need) => String(need.journey_key || "").toLowerCase() === viewedSetKey.toLowerCase());
    return matching.length > 0 ? matching : needs;
  }, [needs, viewedSetKey, showAllJourneys]);

  const filteredRoutes = useMemo(() => {
    if (showAllJourneys || !viewedSetKey) return routes;
    // Lens layer active for the focused key: routes resolve via route_lens_refs
    // (legs ride with their referenced parent). An empty set is the honest
    // "unassessed" state — NEVER the company pool (the .limit(1)-era description
    // hack below applies only to pre-lens/frozen companies).
    if (focusedLensRouteIds) {
      return routes.filter(
        (r) => focusedLensRouteIds.has(String(r.id)) || (r.parent_id && focusedLensRouteIds.has(String(r.parent_id))),
      );
    }
    return routes.filter((route) => {
      if (!String(route.id || "").startsWith("derived-")) return true;
      const description = cleanText(route.short_description);
      return description.toLowerCase().startsWith(`${viewedSetKey.toLowerCase()} journey`);
    });
  }, [routes, viewedSetKey, showAllJourneys, focusedLensRouteIds]);

  // Honest empty state for a focused-but-unreferenced lens (Edgewood's lenses have
  // zero route_lens_refs by design until first assessment).
  const lensRoutesUnassessed =
    !showAllJourneys && !!viewedSetKey && focusedLensRouteIds !== null && focusedLensRouteIds.size === 0;

  const activeRoute = useMemo(
    () => routes.find((r) => r.id === activeRouteId) ?? null,
    [routes, activeRouteId],
  );

  const activeStep = activeStepId ? (filteredJobSteps.find((s) => s.id === activeStepId) ?? null) : null;
  const clearStep = () => setActiveStepId(null);

  const suggestedStep = useMemo(() => {
    const id = deriveSuggestedId(filteredJobSteps);
    return id ? (filteredJobSteps.find((s) => s.id === id) ?? null) : null;
  }, [filteredJobSteps]);
  const contextStep = activeStep ?? suggestedStep;

  useEffect(() => {
    if (!activeStepId) return;
    if (filteredJobSteps.some((step) => step.id === activeStepId)) return;
    setActiveStepId(null);
  }, [activeStepId, filteredJobSteps]);

  const selectedRoute = useMemo(
    () => filteredRoutes.find((r) => r.id === (activeCompany?.selected_route_id ?? "")) ?? null,
    [filteredRoutes, activeCompany?.selected_route_id],
  );

  const nextBestMove = useMemo(
    () => deriveNextBestMove({ needs: filteredNeeds, routes: filteredRoutes, jobSteps: filteredJobSteps, evidenceState: evidenceReadiness, selectedRoute }),
    [filteredNeeds, filteredRoutes, filteredJobSteps, evidenceReadiness, selectedRoute],
  );

  const strategicStateLine = useMemo(() => deriveStrategicStateLine({
    phase: activeCompany?.engagement_phase ?? "outside_signals",
    underservedHighCount: filteredNeeds.filter((n) => n.service_state === "underserved" && n.importance >= 7).length,
    commitmentBlockerCount: councilTensions.filter((t) => t.is_commitment_blocker).length,
    highPressureTensionCount: councilTensions.filter((t) => t.pressure === "high" || t.pressure === "critical").length,
    hasSelectedRoute: !!selectedRoute,
    selectedRouteCategory: selectedRoute?.category ?? null,
    needsCount: filteredNeeds.length,
    topTensionStatement: councilTensions.find((t) => t.pressure === "critical" || t.pressure === "high")?.statement ?? null,
  }), [activeCompany?.engagement_phase, filteredNeeds, councilTensions, selectedRoute]);

  const stateRegionStabilizing = useMemo((): string | null => {
    if (selectedRoute) return selectedRoute.title;
    return null;
  }, [selectedRoute]);

  const stateRegionUnresolved = useMemo((): string | null => {
    const blocker = councilTensions.find((t) => t.is_commitment_blocker);
    if (blocker?.detail) return blocker.detail;
    const high = councilTensions.find((t) => t.pressure === "high" || t.pressure === "critical");
    if (high?.detail) return high.detail;
    const topUnderserved = [...filteredNeeds]
      .filter((n) => n.service_state === "underserved" && n.importance >= 7)
      .sort((a, b) => (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0))[0];
    if (topUnderserved?.desired_outcome) {
      const o = String(topUnderserved.desired_outcome);
      return o.length > 90 ? o.slice(0, 90) + "…" : o;
    }
    return null;
  }, [councilTensions, filteredNeeds]);

  const threadStabilizing = useMemo((): string | null => {
    if (selectedRoute) {
      const seed = workshopRouteSeeds.find((s) => s.route.id === selectedRoute.id);
      const nonMissingCount = (seed?.evidence ?? []).filter((e) => e.status !== "missing").length;
      const cat = String(selectedRoute.category || "").toLowerCase();
      const catLabel = cat === "fix" ? "Fix" : cat === "create" ? "Create" : "Improve";
      return nonMissingCount > 0
        ? `${catLabel} route committed — backed by ${nonMissingCount} piece${nonMissingCount === 1 ? "" : "s"} of evidence.`
        : `${catLabel} route committed — execution proof is the current constraint.`;
    }
    if (positioning?.value_for_customer && positioning?.best_fit_customers && positioning?.market_category) {
      return "Positioning grounded — category, buyer, and value all defined.";
    }
    if (strategy?.winning_aspiration && strategy?.where_to_play) {
      return "Strategic direction set — aspiration and arena both defined.";
    }
    return null;
  }, [selectedRoute, workshopRouteSeeds, positioning, strategy]);

  const threadUnresolved = useMemo((): string | null => {
    const blocker = councilTensions.find((t) => t.is_commitment_blocker);
    if (blocker?.statement) {
      const s = blocker.statement;
      return s.length > 110 ? s.slice(0, 110) + "…" : s;
    }
    const high = councilTensions.find((t) => t.pressure === "critical" || t.pressure === "high");
    if (high?.statement) {
      const s = high.statement;
      return s.length > 110 ? s.slice(0, 110) + "…" : s;
    }
    const topUnderserved = [...filteredNeeds]
      .filter((n) => n.service_state === "underserved" && n.importance >= 7)
      .sort((a, b) => (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0))[0];
    if (topUnderserved?.desired_outcome) {
      const o = String(topUnderserved.desired_outcome);
      return o.length > 100 ? o.slice(0, 100) + "…" : o;
    }
    return null;
  }, [councilTensions, filteredNeeds]);

  const threadShifting = useMemo((): string | null => {
    const affected = strategicChangeSummary?.affectedCounts.total ?? 0;
    if (affected > 0) {
      return `Interpretation shifted — ${affected} downstream assumption${affected === 1 ? "" : "s"} flagged.`;
    }
    return null;
  }, [strategicChangeSummary]);

  const rerunLocalJobMapSynthesis = useCallback(async () => {
    if (!companyId) {
      toast.error("Select a company before generating the job map.");
      return;
    }

    const journeyKey = viewedSetKey || "customer";

    setRegeneratingJobMap(true);
    toast.loading("Starting job map analysis… (~1 min)", { id: "rerun-jobmap" });
    try {
      const { data, error } = await supabase.functions.invoke("run-mojo-analysis", {
        body: {
          company_id: companyId,
          trigger_type: "jobmap_regenerate",
          journey_key: journeyKey,
        },
      });

      if (error) throw error;

      const proposalId = (data as { proposal_id?: string } | null)?.proposal_id;
      if (!proposalId) throw new Error("Analysis did not start — no proposal ID returned.");

      toast.loading("Analyzing job map… (~2–3 min)", { id: "rerun-jobmap" });

      const startedAt = new Date().toISOString();

      // Poll for completion — up to 5 minutes (60 × 5s).
      // Primary: check file_proposals processing_state.
      // Fallback: if file_proposals returns null (RLS), check job_steps directly for new Dify steps.
      const MAX_ATTEMPTS = 60;
      let nullProposalStreak = 0;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        await new Promise<void>((r) => setTimeout(r, 5000));

        if (attempt === 18) {
          toast.loading("Still analyzing… almost there.", { id: "rerun-jobmap" });
        }

        // Primary: proposal status
        const { data: proposal } = await supabase
          .from("file_proposals")
          .select("processing_state, processing_error")
          .eq("id", proposalId)
          .maybeSingle();

        const state = (proposal as { processing_state?: string; processing_error?: string } | null)?.processing_state;
        if (state === "ready") {
          await refetchJobSteps();
          await refetchCompany();
          setNeedsRefreshKey((current) => current + 1);
          await queryClient.invalidateQueries({ queryKey: ["strategic-change-summary", companyId] });
          setActiveStepId(null);
          toast.success("Job map generated.", { id: "rerun-jobmap" });
          return;
        }
        if (state === "failed") {
          const msg = (proposal as { processing_error?: string } | null)?.processing_error || "Analysis failed.";
          throw new Error(msg);
        }

        // Fallback: if proposal is unreadable (RLS), detect completion via job_steps
        if (!proposal) {
          nullProposalStreak++;
          if (nullProposalStreak >= 3) {
            const { data: newSteps } = await supabase
              .from("job_steps")
              .select("id")
              .eq("company_id", companyId)
              .eq("journey_key", journeyKey)
              .contains("frameworks_used", ["dify_mojo_analysis"])
              .gte("created_at", startedAt)
              .limit(1);
            if (newSteps && newSteps.length > 0) {
              await refetchJobSteps();
              await refetchCompany();
              setNeedsRefreshKey((current) => current + 1);
              await queryClient.invalidateQueries({ queryKey: ["strategic-change-summary", companyId] });
              setActiveStepId(null);
              toast.success("Job map generated.", { id: "rerun-jobmap" });
              return;
            }
          }
        } else {
          nullProposalStreak = 0;
        }
      }

      throw new Error("Analysis is taking longer than expected. The map will update automatically — refresh the page in a moment.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate job map.", {
        id: "rerun-jobmap",
      });
    } finally {
      setRegeneratingJobMap(false);
    }
  }, [companyId, viewedSetKey, queryClient, refetchCompany, refetchJobSteps]);

  // b-ii: deliberate per-set conditions generation. Invokes the edge function
  // (LOCAL 14b + 70b judge via the committed module; field-merge keeps operator
  // edits). Generation can exceed the Kong 150s gateway — on timeout the writes
  // still land server-side, so we confirm completion by polling conditions_json
  // for a change against a pre-run snapshot.
  const runConditionsGeneration = useCallback(async () => {
    if (!companyId || !viewedSetKey) return;
    if (isFrozenCompany(companyId)) {
      toast.error("This is a frozen reference company — conditions are not generated for it.");
      return;
    }
    const setHadConditions = filteredJobSteps.some(
      (s) => Array.isArray(s.conditions_json) && s.conditions_json.length > 0,
    );
    const successMsg = setHadConditions ? "Conditions refreshed — your edits kept" : "Conditions generated";
    const beforeSig = JSON.stringify(filteredJobSteps.map((s) => [s.id, s.conditions_json ?? null]));

    setRegeneratingConditions(true);
    toast.loading(setHadConditions ? "Regenerating conditions… (~1–2 min)" : "Generating conditions… (~1–2 min)", { id: "gen-conditions" });
    try {
      const { data, error } = await supabase.functions.invoke("generate-step-conditions", {
        body: { company_id: companyId, journey_key: viewedSetKey },
      });
      if (!error && (data as { ok?: boolean } | null)?.ok === true) {
        await refetchJobSteps();
        toast.success(successMsg, { id: "gen-conditions" });
        return;
      }
      // Invoke errored (often a Kong 150s timeout while generation continues
      // server-side). Poll the set's conditions_json until it changes.
      for (let attempt = 0; attempt < 50; attempt++) {
        await new Promise<void>((r) => setTimeout(r, 6000));
        const { data: rows } = await supabase
          .from("job_steps")
          .select("id, conditions_json")
          .eq("company_id", companyId)
          .eq("journey_key", viewedSetKey)
          .order("step_number", { ascending: true });
        const sig = JSON.stringify(((rows as Array<{ id: string; conditions_json: unknown }> | null) ?? []).map((r) => [r.id, r.conditions_json ?? null]));
        if (sig !== beforeSig) {
          await refetchJobSteps();
          toast.success(successMsg, { id: "gen-conditions" });
          return;
        }
      }
      throw new Error("Conditions are taking longer than expected — refresh the page in a moment.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate conditions.", { id: "gen-conditions" });
    } finally {
      setRegeneratingConditions(false);
    }
  }, [companyId, viewedSetKey, filteredJobSteps, refetchJobSteps]);

  // MH-5b: deliberate Regenerate-market (force) for the viewed declared set. Re-rolls
  // the labeled hypothesis; manual market_defs stay protected in the generator.
  const runMarketRegeneration = useCallback(async () => {
    if (!companyId || !viewedSetKey) return;
    if (isFrozenCompany(companyId)) {
      toast.error("This is a frozen reference company — the market is not generated for it.");
      return;
    }
    const beforeJtbd = String(marketDefinition?.jtbd ?? "");
    setRegeneratingMarket(true);
    toast.loading("Regenerating market hypothesis… (~1 min)", { id: "gen-market" });
    try {
      const { data, error } = await supabase.functions.invoke("generate-market-hypothesis", {
        body: { company_id: companyId, journey_key: viewedSetKey, force: true },
      });
      if (!error && (data as { ok?: boolean } | null)?.ok === true) {
        setNeedsRefreshKey((k) => k + 1);
        toast.success("Market hypothesis refreshed", { id: "gen-market" });
        return;
      }
      // Kong-timeout fallback: poll the market_def jtbd until it changes.
      const sb = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
      for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise<void>((r) => setTimeout(r, 6000));
        const { data: row } = await sb
          .from("odi_market_definitions")
          .select("jtbd")
          .eq("company_id", companyId)
          .eq("journey_key", viewedSetKey)
          .maybeSingle();
        const jtbd = String((row as { jtbd?: unknown } | null)?.jtbd ?? "");
        if (jtbd && jtbd !== beforeJtbd) {
          setNeedsRefreshKey((k) => k + 1);
          toast.success("Market hypothesis refreshed", { id: "gen-market" });
          return;
        }
      }
      throw new Error("Market is taking longer than expected — refresh the page in a moment.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to regenerate the market.", { id: "gen-market" });
    } finally {
      setRegeneratingMarket(false);
    }
  }, [companyId, viewedSetKey, marketDefinition]);

  // DECL-OPP-A2-4b: deliberate Regenerate for declared opportunities (force). Invokes
  // the edge function (LOCAL 14b gen + 70b value judge; the writer replaces generated
  // rows but keeps operator edits via content_identity staleness). Generation can
  // exceed the Kong 150s gateway — on timeout the writes still land server-side, so we
  // confirm by polling the set's internal_declared rows against a pre-run snapshot.
  const runOpportunitiesGeneration = useCallback(async () => {
    if (!companyId || !viewedSetKey) return;
    if (isFrozenCompany(companyId)) {
      toast.error("This is a frozen reference company — opportunities are not generated for it.");
      return;
    }
    const setHadOpps = filteredNeeds.some((n) => String(n.provenance_type ?? "") === "internal_declared");
    const successMsg = setHadOpps ? "Opportunities refreshed — your edits kept" : "Opportunities generated";
    const snapshot = async () => {
      const { data: rows } = await supabase
        .from("odi_needs")
        .select("id, desired_outcome, odi_canonical_statement, confidence")
        .eq("company_id", companyId)
        .eq("journey_key", viewedSetKey)
        .eq("provenance_type", "internal_declared")
        .order("id", { ascending: true });
      return JSON.stringify(((rows as Array<Record<string, unknown>> | null) ?? []).map((r) => [r.id, r.desired_outcome, r.odi_canonical_statement, r.confidence]));
    };
    const beforeSig = await snapshot();

    setRegeneratingOpportunities(true);
    toast.loading(setHadOpps ? "Regenerating opportunities… (~1–2 min)" : "Generating opportunities… (~1–2 min)", { id: "gen-opps" });
    try {
      const { data, error } = await supabase.functions.invoke("generate-step-opportunities", {
        body: { company_id: companyId, journey_key: viewedSetKey },
      });
      if (!error && (data as { ok?: boolean } | null)?.ok === true) {
        setNeedsRefreshKey((k) => k + 1);
        toast.success(successMsg, { id: "gen-opps" });
        return;
      }
      // Invoke errored (often a Kong 150s timeout while generation continues
      // server-side). Poll the set's declared opps until they change.
      for (let attempt = 0; attempt < 50; attempt++) {
        await new Promise<void>((r) => setTimeout(r, 6000));
        if ((await snapshot()) !== beforeSig) {
          setNeedsRefreshKey((k) => k + 1);
          toast.success(successMsg, { id: "gen-opps" });
          return;
        }
      }
      throw new Error("Opportunities are taking longer than expected — refresh the page in a moment.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate opportunities.", { id: "gen-opps" });
    } finally {
      setRegeneratingOpportunities(false);
    }
  }, [companyId, viewedSetKey, filteredNeeds]);

  const openAffectedArtifact = useCallback((artifact: {
    object_type: "odi_need" | "route" | "desired_outcome";
    object_id: string;
  }) => {
    if (artifact.object_type === "route") {
      setActiveTab("routes");
      return;
    }
    if (artifact.object_type === "desired_outcome") {
      setActiveTab("strategy");
      return;
    }
    setPendingReviewNeedId(artifact.object_id);
    setActiveTab("needs");
  }, []);

  const runPublicBaseline = useCallback(async (targetCompanyId: string, companyName: string, companyWebsite: string) => {
    if (!cleanText(companyWebsite)) {
      throw new Error(`Add a website for ${companyName} before running the public baseline.`);
    }

    const startedAt = new Date().toISOString();
    const { error } = await supabase.functions.invoke("public-baseline", {
      body: {
        company_id: targetCompanyId,
        company_name: companyName,
        website: companyWebsite,
      },
    });

    if (error) {
      // The 150s wall may have cut the browser after the isolate already succeeded.
      // Poll the durable run-status row before declaring failure.
      const terminal = await pollPublicBaselineTerminal({ companyId: targetCompanyId, sinceIso: startedAt });
      if (terminal === "completed") return;
      if (terminal === "running") {
        throw new Error("Public baseline is still running in the background — refresh shortly.");
      }
      throw new Error(error.message || "Failed to run public baseline.");
    }
  }, []);

  const handleCreateClient = useCallback(async () => {
    if (!isAdmin || !user?.id) return;
    if (!canCreateClient) return; // workspace.client.create
    const name = cleanText(newClientName);
    if (!name) {
      toast.error("Client name is required.");
      return;
    }

    setCreatingClient(true);
    const sanitizedWebsite = sanitizeWebsite(newClientWebsite);

    // Gate 2 — create-new-instance front door: if the name or normalized URL already
    // exists, offer a fresh instance instead of silently duplicating. Soft check only.
    const collision = await findCompanyCollision(name, sanitizedWebsite);
    if (collision) {
      const fileCount = await countUploadedFiles(collision.id);
      setInstancePrompt({ stage: "confirm", original: collision, fileCount });
      setInstanceCopyFiles(false);
      setInstanceNameError(null);
      setCreatingClient(false);
      return;
    }

    // DEF-1: names the company once the baseline step has started, so the catch can
    // (a) replace the infinite toast.loading by its id and (b) name the step that
    // actually failed. Null until then = the failure was the create itself.
    let baselineName: string | null = null;

    try {
      const { data, error } = await supabase
        .from("companies")
        .insert({
          name,
          website: sanitizedWebsite || null,
          created_by: user.id,
        })
        .select("id,name,website")
        .single();

      if (error || !data?.id) {
        throw new Error(error?.message || "Failed to create client.");
      }

      setActiveCompanyId(data.id);
      await refetchCompany();

      if (newClientRunBaseline && sanitizedWebsite) {
        baselineName = data.name;
        toast.loading(`Running outside signals for ${data.name}…`, { id: "create-client-baseline" });
        await runPublicBaseline(data.id, data.name, sanitizedWebsite);
        toast.success(`Outside signals captured for ${data.name}.`, { id: "create-client-baseline" });
      } else {
        toast.success(`Client created: ${data.name}`);
        if (!sanitizedWebsite) {
          setActiveTab("inputs");
        }
      }

      setNewClientName("");
      setNewClientWebsite("");
      setNewClientRunBaseline(true);
      setShowCreateClient(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create client.";
      if (baselineName) {
        // Carry the loading toast's id: sonner's toast.loading is duration:Infinity,
        // so an error WITHOUT the id leaves the "Running outside signals for X…" toast
        // on screen for the rest of the page session — a false "running" claim that
        // survives navigation and company switches (it outlived a failed run by 3 days
        // and showed on another company's screen). Naming the step keeps it honest:
        // the company WAS created; it's the baseline that failed.
        toast.error(`Outside signals failed for ${baselineName} — ${message}`, { id: "create-client-baseline" });
      } else {
        toast.error(message);
      }
    } finally {
      setCreatingClient(false);
    }
  }, [
    isAdmin,
    canCreateClient,
    user?.id,
    newClientName,
    newClientWebsite,
    newClientRunBaseline,
    refetchCompany,
    runPublicBaseline,
    setActiveCompanyId,
  ]);

  // Instance dialog OK (confirm stage) → move to the new-name prompt, pre-filled with
  // an auto-suggested free name so the default OK always succeeds.
  const handleConfirmInstance = useCallback(async () => {
    if (!instancePrompt) return;
    const suggested = await suggestInstanceName(instancePrompt.original.name);
    setInstanceName(suggested);
    setInstanceNameError(null);
    setInstancePrompt({ ...instancePrompt, stage: "name" });
  }, [instancePrompt]);

  // Name-stage OK: validate-loop (re-check collision on EVERY OK; stay open on
  // collision) → clone per Q2 (website + curation columns; files opt-in, copied
  // BEFORE cold start) → cold-start the NEW company via the existing run-agent-flow
  // invoke shape. The original is only ever read.
  const handleCreateInstance = useCallback(async () => {
    if (!instancePrompt || !user?.id || creatingInstance) return;
    const chosen = cleanText(instanceName);
    if (!chosen) {
      setInstanceNameError("A name is required.");
      return;
    }
    const nameTaken = await findCompanyCollision(chosen, undefined);
    if (nameTaken) {
      setInstanceNameError("That name is also taken.");
      return; // validate-loop: stay open
    }

    setCreatingInstance(true);
    try {
      toast.loading(`Creating instance "${chosen}"…`, { id: "create-instance" });
      const clone = await createCompanyInstance({
        originalId: instancePrompt.original.id,
        newName: chosen,
        userId: user.id,
        copyFiles: instanceCopyFiles && instancePrompt.fileCount > 0,
      });
      for (const failure of clone.fileFailures) {
        toast.error(`Couldn't copy ${failure} — continuing without it.`);
      }

      setActiveCompanyId(clone.companyId);
      await refetchCompany();

      // Cold start the NEW company (birth-only law: only an empty company is ever
      // cold-started; the original keeps its spine and is untouched). Long-running —
      // a gateway timeout means it is still running server-side, not a failure.
      toast.loading(`Researching ${clone.companyName}… (~3–7 min)`, { id: "create-instance" });
      const { error: flowError } = await supabase.functions.invoke("run-agent-flow", {
        body: coldStartBody(clone.companyId, clone.companyName, clone.website, "workshop_create_instance"),
      });
      if (flowError) {
        console.warn("[Workshop] create-instance cold start:", flowError);
        toast.success(
          `Instance "${clone.companyName}" created — research is still running; refresh in a few minutes.`,
          { id: "create-instance" },
        );
      } else {
        toast.success(`Instance "${clone.companyName}" created and researched.`, { id: "create-instance" });
      }
      await refetchCompany();

      setInstancePrompt(null);
      setInstanceName("");
      setInstanceNameError(null);
      setInstanceCopyFiles(false);
      setNewClientName("");
      setNewClientWebsite("");
      setShowCreateClient(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create the instance.", { id: "create-instance" });
    } finally {
      setCreatingInstance(false);
    }
  }, [
    instancePrompt,
    instanceName,
    instanceCopyFiles,
    creatingInstance,
    user?.id,
    refetchCompany,
    setActiveCompanyId,
  ]);

  const handleCancelInstance = useCallback(() => {
    setInstancePrompt(null);
    setInstanceName("");
    setInstanceNameError(null);
    setInstanceCopyFiles(false);
  }, []);

  if (!hasCompany) {
    return (
      <section className="crpv-page crpv-workshop-page">
        <article className="crpv-empty-state">
          <p className="cap">Client Refine Preview · Workshop</p>
          <h1>Select a company to edit strategy.</h1>
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
          {/* Integrity sweep: fetch failure renders REGARDLESS of the fallback company
              injection — the dead-branch version of this line could never fire. */}
          {companiesFetchError && (
            <p className="crpv-muted" style={{ color: "#c45c00" }}>Couldn't load companies — try reloading.</p>
          )}
        </article>
      </section>
    );
  }

  const TABS: { key: WorkshopTab; label: string }[] = [
    { key: "diagnose",    label: "Diagnose" },
    { key: "routes",      label: "Routes" },
    { key: "council",     label: "Council" },
    { key: "needs",       label: "Opportunities" },
    { key: "strategy",    label: "Strategy" },
    { key: "positioning", label: "Positioning" },
    { key: "jobmap",      label: "Job Map" },
    { key: "inputs",      label: "Inputs" },
  ];

  function renderOutsideTab() {
    if (baselineLoading) return <div className="crpv-ws-placeholder cap">Loading outside signals…</div>;
    if (activeTab === "positioning") return <PositioningOutside baseline={baseline} companyId={companyId} exclusion={exclusionControls} integrity={baselineIntegrity} />;
    if (activeTab === "strategy")   return <StrategyOutside baseline={baseline} companyId={companyId} integrity={baselineIntegrity} />;
    if (activeTab === "jobmap")     return null;
    if (activeTab === "routes")     return null;
    if (activeTab === "diagnose")   return null;
    return <NeedsOutside baseline={baseline} exclusion={exclusionControls} integrity={baselineIntegrity} />;
  }

  function renderOrgTab() {
    if (!companyId) return null;
    if (activeTab === "positioning") return (
      <>
        {posError && !positioning && (
          <div style={{ padding: "8px 12px", background: "#fef3cd", border: "1px solid #f5d96b", borderRadius: 4, marginBottom: 8, fontSize: 11, color: "#7c5400" }}>
            Positioning data could not be loaded — connection issue. Reload the page to retry.
          </div>
        )}
        {activeRoute && !posError && (
          <div style={{ padding: "6px 10px", background: "#f4f7f6", borderRadius: 4, marginBottom: 8, fontSize: 11, color: "#46606d" }}>
            {(() => {
              const why = Array.isArray(activeRoute.why_this_matters_json)
                ? activeRoute.why_this_matters_json.map(String).filter(Boolean) : [];
              const reason = why[0]?.replace(/\.$/, "").trim();
              const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
              return reason
                ? `Route context: ${lc(reason)}.`
                : `Route context: ${activeRoute.title || "selected route"}.`;
            })()}
          </div>
        )}
        {renderDirectionToggle(Boolean(declaredCanvas))}
        {directionView === "declared" && declaredCanvas ? (
          <PositioningOrgPanel
            companyId={companyId}
            canvasError={null}
            canvas={declaredCanvas}
            loading={posLoading}
            baseline={baseline}
            signals={sourceSignals}
            updateTextField={updateDeclaredCanvasText}
            updateItemsField={updateDeclaredCanvasItems as Parameters<typeof PositioningOrgPanel>[0]["updateItemsField"]}
            hasHierarchy={workshopHasHierarchy}
            canvasId={declaredCanvasId ?? undefined}
            phase={activeCompany?.engagement_phase}
          />
        ) : (
        <PositioningOrgPanel
          companyId={companyId}
          canvasError={posError ?? null}
          canvas={positioning}
          loading={posLoading}
          baseline={baseline}
          signals={sourceSignals}
          updateTextField={updatePosTextFieldGated}
          updateItemsField={updatePosItemsField}
          hasHierarchy={workshopHasHierarchy}
          unroutedCount={unroutedCount}
          signalBasis={workshopSignalBasis}
          onReEvaluate={handlePosReEvaluate}
          reEvalLoading={posReEvalLoading}
          onGenerateProposal={handleGenerateProposal}
          generateLoading={generateLoading}
          generateMessage={generateMessage}
          proposal={proposal}
          onAcceptProposal={handleAcceptProposal}
          onRejectProposal={handleRejectProposal}
          acceptLoading={acceptLoading}
          rejectLoading={rejectLoading}
          canvasId={canvasId}
          phase={activeCompany?.engagement_phase}
          onDriftClick={handleDriftClick}
          driftRefreshKey={driftBadgeRefreshKey}
          onCheckSurfaceDrift={handleCheckSurfaceDrift}
          checkingSurfaceId={driftCheckingSurfaceId}
        />
        )}
      </>
    );
    if (activeTab === "jobmap") return (
      <JobMapOrgPanel
        steps={filteredJobSteps}
        loading={jobStepsLoading}
        activeStepId={activeStepId}
        onSelectStep={(id) => setActiveStepId((prev) => (prev === id ? null : id))}
        routes={filteredRoutes}
        activeStep={activeStep}
        activeRoute={activeRoute}
        hasHierarchy={workshopHasHierarchy}
        needs={filteredNeeds}
        signalBasis={workshopSignalBasis}
        marketDef={marketDefinition}
      />
    );
    if (activeTab === "strategy") {
      const stratRouteNote = activeRoute
        ? (() => {
            const why = Array.isArray(activeRoute.why_this_matters_json)
              ? activeRoute.why_this_matters_json.map(String).filter(Boolean) : [];
            const reason = why[0]?.replace(/\.$/, "").trim();
            const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
            return reason
              ? `Route context: ${lc(reason)}.`
              : `Route context: ${activeRoute.title || "selected route"}.`;
          })()
        : null;
      return (
      <>
      {renderDirectionToggle(Boolean(declaredCascade))}
      {directionView === "declared" && declaredCascade ? (
        <StrategyOrgPanel
          strategy={declaredCascade}
          loading={stratLoading}
          baseline={baseline}
          signals={sourceSignals}
          updateNarrativeField={updateDeclaredCascadeNarrative as Parameters<typeof StrategyOrgPanel>[0]["updateNarrativeField"]}
          updateListField={updateDeclaredCascadeList as Parameters<typeof StrategyOrgPanel>[0]["updateListField"]}
          hasHierarchy={workshopHasHierarchy}
          cascadeId={declaredCascadeId ?? undefined}
          phase={activeCompany?.engagement_phase}
          companyName={activeCompany?.name}
          companyId={companyId}
        />
      ) : (
      <StrategyOrgPanel
        strategy={strategy}
        loading={stratLoading}
        baseline={baseline}
        signals={sourceSignals}
        directionContextNote={stratRouteNote ?? strategyContextNote}
        updateNarrativeField={handleCascadeNarrativeInlineEdit}
        updateListField={updateListField}
        hasHierarchy={workshopHasHierarchy}
        signalBasis={workshopSignalBasis}
        claimsMap={workshopClaimsMap}
        onGenerateProposal={handleGenerateCascadeProposal}
        generateLoading={cascadeGenerateLoading}
        generateMessage={cascadeGenerateMessage}
        proposal={cascadeProposal}
        onAcceptProposal={handleAcceptCascadeProposal}
        onRejectProposal={handleRejectCascadeProposal}
        acceptLoading={cascadeAcceptLoading}
        rejectLoading={cascadeRejectLoading}
        reEvalProgress={cascadeReEvalProgress}
        cascadeId={cascadeId}
        phase={activeCompany?.engagement_phase}
        onDriftClick={handleDriftClick}
        driftRefreshKey={driftBadgeRefreshKey}
        onCheckSurfaceDrift={handleCheckSurfaceDrift}
        checkingSurfaceId={driftCheckingSurfaceId}
        companyName={activeCompany?.name}
        companyId={companyId}
      />
      )}
      </>
      );
    }
    if (odiError) {
      console.warn("[Workshop] Needs query error:", odiError, { companyId });
    }
    return (
      <>
        {odiError && (
          <div style={{ padding: "8px 12px", background: "#fef3cd", border: "1px solid #f5d96b", borderRadius: 4, marginBottom: 8, fontSize: 11, color: "#7c5400" }}>
            Needs data could not be loaded — connection issue. Reload the page to retry.
          </div>
        )}
        {!odiError && activeRoute && (
          <div style={{ padding: "6px 10px", background: "#f4f7f6", borderRadius: 4, marginBottom: 8, fontSize: 11, color: "#46606d" }}>
            {(() => {
              const why = Array.isArray(activeRoute.why_this_matters_json)
                ? activeRoute.why_this_matters_json.map(String).filter(Boolean) : [];
              const reason = why[0]?.replace(/\.$/, "").trim();
              const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
              return reason
                ? `Route context: ${lc(reason)}.`
                : `Route context: ${activeRoute.title || "selected route"}.`;
            })()}
          </div>
        )}
        {!odiError && (
          <>
            {viewedSetKey && !showAllJourneys && !isFrozenCompany(companyId) && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => void runOpportunitiesGeneration()}
                  disabled={regeneratingOpportunities || odiLoading}
                >
                  {regeneratingOpportunities
                    ? "Working…"
                    : filteredNeeds.some((n) => String(n.provenance_type ?? "") === "internal_declared")
                    ? "Regenerate opportunities"
                    : "Generate opportunities"}
                </button>
              </div>
            )}
            <NeedsOrgPanel
              needs={filteredNeeds}
              loading={odiLoading}
              updateNeedScores={updateNeedScores}
              latestExclusionAt={latestExclusionAt}
              activeStep={activeStep}
              onClearStep={clearStep}
              routes={filteredRoutes}
              onRouteSelect={handleRouteSelect}
              companyId={companyId ?? undefined}
              currentPhase={activeCompany?.engagement_phase}
              reviewNeedId={pendingReviewNeedId}
              onReviewNeedHandled={() => setPendingReviewNeedId(null)}
              hasHierarchy={workshopHasHierarchy}
              signalBasis={workshopSignalBasis}
              onReEvaluate={handleNeedReEvaluate}
              reEvalLoadingId={odiReEvalLoadingId}
              proposalsMap={opportunityProposalsMap}
              onGenerateProposal={handleGenerateOpportunityProposal}
              generateLoadingId={generateLoadingOpportunityId}
              onAcceptProposal={handleAcceptOpportunityProposal}
              onRejectProposal={handleRejectOpportunityProposal}
              acceptLoadingProposalId={acceptLoadingOpportunityProposalId}
              rejectLoadingProposalId={rejectLoadingOpportunityProposalId}
              onSaveNeedField={handleSaveNeedField}
              onAuthorProposal={handleAuthorOpportunityProposal}
              onDriftClick={handleDriftClick}
              driftRefreshKey={driftBadgeRefreshKey}
              onCheckSurfaceDrift={handleCheckSurfaceDrift}
              checkingSurfaceId={driftCheckingSurfaceId}
            />
            {/* DEF-4: this empty state WAS "company id: {companyId}" — debug residue from
                c8383b5 that leaked an internal uuid onto a client-facing surface and was
                the entire empty state, so a company with no opportunities saw a bare
                uuid and nothing else. Operator-signed minimal wording: states the fact
                without asserting a cause (we have not established that none were found
                vs. that the job map is not built yet). */}
            {!odiLoading && filteredNeeds.length === 0 && (
              <p className="crpv-ws-hint" style={{ marginTop: 8, textAlign: "center" }}>
                No opportunities yet.
              </p>
            )}
          </>
        )}
      </>
    );
  }

  function renderCompareTab() {
    if (!companyId) return null;
    if (activeTab === "strategy") return (
      <StrategyCompare
        baseline={baseline}
        strategy={strategy}
        loading={stratLoading}
        updateNarrativeField={updateNarrativeField}
        updateListField={updateListField}
      />
    );
    if (activeTab === "positioning") return (
      <PositioningCompare
        baseline={baseline}
        canvas={positioning}
        loading={posLoading}
        updateTextField={updatePosTextFieldGated}
        updateItemsField={updatePosItemsField}
      />
    );
    // Needs compare — inferred needs from outside vs defined ODI needs
    const outsideSignals = (baseline?.outside_voice_signals ?? []).filter((s) => s.signal);
    return (
      <>
        <div className="crpv-ws-cmp-support">
          <div className="crpv-ws-cmp-support-col">
            <NeedsOutsideCompare baseline={baseline} integrity={baselineIntegrity} />
          </div>
          <div className="crpv-ws-cmp-support-col">
            {odiError
              ? <div className="crpv-ws-placeholder crpv-ws-error cap">Query error: {odiError}</div>
              : <NeedsOrgPanel needs={needs} loading={odiLoading} updateNeedScores={updateNeedScores} latestExclusionAt={latestExclusionAt} activeStep={activeStep} onClearStep={clearStep} routes={routes} onRouteSelect={handleRouteSelect} companyId={companyId ?? undefined} currentPhase={activeCompany?.engagement_phase} reviewNeedId={pendingReviewNeedId} onReviewNeedHandled={() => setPendingReviewNeedId(null)} onReEvaluate={handleNeedReEvaluate} reEvalLoadingId={odiReEvalLoadingId} proposalsMap={opportunityProposalsMap} onGenerateProposal={handleGenerateOpportunityProposal} generateLoadingId={generateLoadingOpportunityId} onAcceptProposal={handleAcceptOpportunityProposal} onRejectProposal={handleRejectOpportunityProposal} acceptLoadingProposalId={acceptLoadingOpportunityProposalId} rejectLoadingProposalId={rejectLoadingOpportunityProposalId} onSaveNeedField={handleSaveNeedField} onDriftClick={handleDriftClick} />
            }
          </div>
        </div>
        {outsideSignals.length > 0 && (
          <>
            <div className="crpv-ws-cmp-support-hd cap">Supporting context — outside voice signals</div>
            <div className="crpv-ws-cmp-support">
              <div className="crpv-ws-cmp-support-col">
                <div className="crpv-ws-readonly-list">
                  {outsideSignals.map((s, i) => (
                    <div key={i} className="crpv-ws-outside-evidence-item">
                      <div className="crpv-ws-outside-title">
                        {s.source_type && <span className="crpv-ws-outside-type cap">{s.source_type}</span>}
                        {s.sentiment && (
                          <span className={`crpv-ws-outside-strength cap crpv-ws-strength-${s.sentiment}`}>{s.sentiment}</span>
                        )}
                      </div>
                      <div className="crpv-ws-outside-body">
                        <span className="crpv-ws-outside-snippet">{s.signal}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="crpv-ws-cmp-support-col" />
            </div>
          </>
        )}
      </>
    );
  }

  return (
    <>
    <section className={`crpv-page crpv-workshop-page${workshopHasHierarchy ? " has-hierarchy" : ""}`}>
      <header className="crpv-header">
        <div className="left">
          <b>Mojo</b>
          {workshopHasHierarchy ? (
            <span className="cap">
              [{activeCompany?.name?.toUpperCase() || "COMPANY"}] · DAY {workshopEngagementDay ?? "—"} · {workshopDominantClaimState ? workshopDominantClaimState.replace(/_/g, " ").toUpperCase() : !phaseIsSet && diagnoseReady ? "DIAGNOSE · AUTO-READ — NOT YET CONFIRMED" : stageLabel(activeCompany?.engagement_phase ?? "diagnose").toUpperCase()}
            </span>
          ) : (
            <CompanySwitcher
              activeCompany={activeCompany}
              companies={companies}
              loading={companiesLoading}
              onSelect={(id) => { setActiveCompanyId(id); setShowCompare(false); }}
              suffix="· WORKSHOP"
            />
          )}
        </div>
      </header>

      {/* INT-4: passive diagnose-advancement offer (DRAFT copy pending operator
          signature). Passive means passive: no modal, no auto-write, dismissable. */}
      {isAdmin && !phaseIsSet && diagnoseReady && !advanceOfferDismissed && (
        <section
          style={{
            margin: "12px 24px 0", padding: "10px 14px", border: "1px solid #cfdcd4",
            background: "#f4f9f6", borderRadius: 10, display: "flex", alignItems: "center", gap: 12,
          }}
        >
          <p style={{ margin: 0, fontSize: 13, color: "#31514a", flex: 1 }}>
            Internal evidence has arrived — advance to Diagnose?
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => navigate(`${CLIENT_REFINE_PREVIEW_COMPANY_ROUTE}?advance=diagnose`)}
          >
            Review &amp; confirm
          </button>
          <button type="button" className="btn ghost" onClick={() => setAdvanceOfferDismissed(true)}>
            Dismiss
          </button>
        </section>
      )}

      {isAdmin && showCreateClient && (
        <section
          style={{
            margin: "12px 24px 0",
            padding: 16,
            border: "1px solid #dde6d1",
            borderRadius: 12,
            background: "#fff",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "end" }}>
            <div>
              <p className="cap" style={{ margin: 0, color: "#6e847f" }}>Client name</p>
              <input
                value={newClientName}
                onChange={(event) => setNewClientName(event.target.value)}
                placeholder="Company name"
                style={{ width: "100%", marginTop: 6, border: "1px solid #dde6d1", borderRadius: 6, padding: "9px 10px" }}
              />
            </div>
            <div>
              <p className="cap" style={{ margin: 0, color: "#6e847f" }}>Website</p>
              <input
                value={newClientWebsite}
                onChange={(event) => setNewClientWebsite(event.target.value)}
                placeholder="https://example.com"
                style={{ width: "100%", marginTop: 6, border: "1px solid #dde6d1", borderRadius: 6, padding: "9px 10px" }}
              />
            </div>
            <button
              type="button"
              className="btn ghost"
              disabled={creatingClient || !canCreateClient}
              title={!canCreateClient ? "Creating a client requires the client-create capability" : undefined}
              onClick={() => void handleCreateClient()}
            >
              {creatingClient ? "Creating…" : (newClientRunBaseline && newClientWebsite.trim()) ? "Create + baseline" : "Create client"}
            </button>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, color: "#46606d", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={newClientRunBaseline}
              onChange={(event) => setNewClientRunBaseline(event.target.checked)}
            />
            Run outside-signals baseline immediately after create
          </label>
        </section>
      )}

      {/* Gate 2 — create-new-instance dialog. confirm stage: OK/Cancel. name stage:
          validate-loop new-name prompt (+ opt-in evidence copy when files exist). */}
      {isAdmin && instancePrompt && (
        <section
          style={{
            margin: "12px 24px 0",
            padding: 16,
            border: "1px solid #d9a441",
            borderRadius: 12,
            background: "#fffaf0",
          }}
        >
          {instancePrompt.stage === "confirm" ? (
            <>
              <p style={{ margin: 0, color: "#5a4a1f", fontSize: 14 }}>
                This company/URL already exists (matches <strong>{instancePrompt.original.name}</strong>
                {instancePrompt.original.website ? ` · ${instancePrompt.original.website}` : ""}). Create a new instance?
              </p>
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button type="button" className="btn" onClick={() => void handleConfirmInstance()}>
                  OK
                </button>
                <button type="button" className="btn ghost" onClick={handleCancelInstance}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="cap" style={{ margin: 0, color: "#8a6d2f" }}>
                New instance of {instancePrompt.original.name}
              </p>
              <p style={{ margin: "6px 0 0", color: "#5a4a1f", fontSize: 13 }}>
                Name the new instance. It starts empty, clones the original's website and source
                settings, and is then researched fresh. The original is not touched.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "end", marginTop: 10 }}>
                <div>
                  <input
                    value={instanceName}
                    onChange={(event) => {
                      setInstanceName(event.target.value);
                      setInstanceNameError(null);
                    }}
                    placeholder="Instance name"
                    style={{ width: "100%", border: "1px solid #d9a441", borderRadius: 6, padding: "9px 10px" }}
                  />
                  {instanceNameError && (
                    <p style={{ margin: "6px 0 0", color: "#b3261e", fontSize: 12 }}>{instanceNameError}</p>
                  )}
                </div>
                <button
                  type="button"
                  className="btn"
                  disabled={creatingInstance}
                  onClick={() => void handleCreateInstance()}
                >
                  {creatingInstance ? "Creating…" : "OK"}
                </button>
                <button type="button" className="btn ghost" disabled={creatingInstance} onClick={handleCancelInstance}>
                  Cancel
                </button>
              </div>
              {instancePrompt.fileCount > 0 && (
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, color: "#5a4a1f", fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={instanceCopyFiles}
                    onChange={(event) => setInstanceCopyFiles(event.target.checked)}
                  />
                  Also copy uploaded evidence ({instancePrompt.fileCount} files)
                </label>
              )}
            </>
          )}
        </section>
      )}

      {!routes.some((r) => r.level === "route") && (
        <ScoreContextBar
          currentScore={readiness.currentReadiness}
          reachableScore={readiness.nearTermPotential}
          unlockableScore={readiness.structuralUpside}
          routesCount={routes.length}
          confidenceLabel={readiness.postureLabel}
          ceilingReason={readiness.ceilingReason}
        />
      )}

      {/* ── Strategic State Region — hidden for hierarchy clients ── */}
      {!workshopHasHierarchy && <div style={{
        padding: "20px 24px 18px",
        background: "#f2f6f4",
        borderBottom: "2px solid #d8e8e1",
      }}>
        <p style={{
          fontFamily: "monospace",
          fontSize: 9,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#7a9e90",
          margin: "0 0 10px",
          lineHeight: 1.4,
        }}>
          {fieldCondition}
        </p>

        <p style={{
          fontSize: 16,
          fontWeight: 400,
          color: "#1e3340",
          lineHeight: 1.5,
          margin: strategicStateLine ? "0 0 16px" : "0",
          maxWidth: 700,
          letterSpacing: "-0.01em",
        }}>
          {strategicStateLine || "Reading the strategic field."}
        </p>

        {(stateRegionStabilizing || stateRegionUnresolved) && (
          <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
            {stateRegionStabilizing && (
              <div>
                <p style={{ fontFamily: "monospace", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "#4a9e78", margin: "0 0 3px" }}>
                  Stabilizing
                </p>
                <p style={{ fontSize: 12, color: "#2d5240", margin: 0, lineHeight: 1.4 }}>
                  {stateRegionStabilizing}
                </p>
              </div>
            )}
            {stateRegionUnresolved && (
              <div>
                <p style={{ fontFamily: "monospace", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "#b06a3c", margin: "0 0 3px" }}>
                  Unresolved
                </p>
                <p style={{ fontSize: 12, color: "#4a2a18", margin: 0, lineHeight: 1.4, maxWidth: 380 }}>
                  {stateRegionUnresolved}
                </p>
              </div>
            )}
          </div>
        )}
      </div>}

      <div className="crpv-ws-body">
      <WorkshopSidebar
        activeTab={activeTab}
        onTabClick={(tab) => setActiveTab(tab as WorkshopTab)}
        onHome={goToRefineHome}
        onAddClient={isAdmin ? () => setShowCreateClient((v) => !v) : undefined}
        onCompany={() => navigate(CLIENT_REFINE_PREVIEW_COMPANY_ROUTE)}
        onMembers={() => navigate(CLIENT_REFINE_PREVIEW_MEMBERS_ROUTE)}
        onExtracts={() => navigate(CLIENT_REFINE_PREVIEW_EXTRACTS_ROUTE)}
        onInbox={() => navigate(CLIENT_REFINE_PREVIEW_INBOX_ROUTE)}
        inboxCount={inboxCount}
        inboxHasNew={inboxNewCount > 0}
        showTeachingToggle={isAdmin}
      />
      <div className="crpv-ws-content-col">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", padding: "6px 20px 0", gap: 4 }}>
        <button
          type="button"
          onClick={handleScanAllSurfaces}
          disabled={scanningAll || !canScan}
          title={!canScan ? "Drift scan requires the drift-scan capability" : undefined}
          style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: "0.06em", color: scanningAll || !canScan ? "rgba(17,17,17,0.25)" : "rgba(17,17,17,0.45)", background: "none", border: "1px solid rgba(17,17,17,0.15)", cursor: scanningAll ? "wait" : !canScan ? "default" : "pointer", padding: "4px 10px", borderRadius: 2 }}
        >
          {scanningAll ? "Scanning…" : "Scan all surfaces"}
        </button>
        {scanAllError && (
          <p style={{ fontFamily: "monospace", fontSize: 9, letterSpacing: "0.05em", color: "#c0392b", margin: 0 }}>
            Scan failed — {scanAllError}
          </p>
        )}
        {!scanAllError && scanAllStatus && (
          <p style={{ fontFamily: "monospace", fontSize: 9, letterSpacing: "0.05em", color: "rgba(17,17,17,0.35)", margin: 0 }}>
            {(() => {
              const driftCount = (scanAllStatus.slight_drift ?? 0) + (scanAllStatus.material_drift ?? 0);
              const summary = driftCount === 0
                ? `${scanAllStatus.assessed} surface${scanAllStatus.assessed === 1 ? "" : "s"} · all aligned`
                : `${scanAllStatus.assessed} surface${scanAllStatus.assessed === 1 ? "" : "s"} · ${driftCount} with drift`;
              return `Last scanned ${formatDistanceToNow(scanAllStatus.scannedAt)} ago · ${summary}`;
            })()}
          </p>
        )}
      </div>
      {!workshopHasHierarchy && (threadStabilizing || threadUnresolved || threadShifting) && (
        <div style={{
          display: "flex",
          alignItems: "stretch",
          borderBottom: "1px solid #e4ede8",
          background: "#f9fbfa",
          flexWrap: "wrap",
          overflow: "hidden",
        }}>
          {threadStabilizing && (
            <div style={{
              padding: "6px 20px 6px 24px",
              borderRight: (threadUnresolved || threadShifting) ? "1px solid #e0eae4" : undefined,
              flex: "0 1 auto",
              minWidth: 0,
              display: "flex",
              alignItems: "center",
            }}>
              <span style={{ fontSize: 11, color: "#3d6e5c", lineHeight: 1.4, letterSpacing: "0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
                {threadStabilizing}
              </span>
            </div>
          )}
          {threadUnresolved && (
            <div style={{
              padding: "6px 20px",
              borderRight: threadShifting ? "1px solid #e0eae4" : undefined,
              flex: "1 1 0",
              minWidth: 0,
              display: "flex",
              alignItems: "center",
            }}>
              <span style={{ fontSize: 11, color: "#7a4e30", lineHeight: 1.4, letterSpacing: "0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                {threadUnresolved}
              </span>
            </div>
          )}
          {threadShifting && (
            <div style={{
              padding: "6px 24px 6px 20px",
              flex: "0 1 auto",
              minWidth: 0,
              display: "flex",
              alignItems: "center",
            }}>
              <span style={{ fontSize: 11, color: "#6e5a2a", lineHeight: 1.4, letterSpacing: "0.01em", whiteSpace: "nowrap", display: "block" }}>
                {threadShifting}
              </span>
            </div>
          )}
        </div>
      )}
      {compareActive && exclusionImpact.excludedCount > 0 && activeTab !== "council" && activeTab !== "inputs" && (
        <EvidenceImpactBanner
          impact={exclusionImpact}
          evidenceStatus={activeCompany?.evidence_status}
          hasCompanyEvidence={sourceSignals?.hasCompanyEvidence ?? false}
          totalSignalCount={signalExclusion.excludedSet.size}
        />
      )}

      {activeTab === "inputs" ? (
        <div className="crpv-ws-content">
          <InputsTab
            companyId={companyId ?? null}
            companyName={activeCompany?.name}
            companyWebsite={activeCompany?.website ?? undefined}
            socialNeeds={needs.filter((n) => String(n.source_path).startsWith("social_"))}
            onAdded={() => setNeedsRefreshKey((k) => k + 1)}
            hasHierarchy={workshopHasHierarchy}
            signalBasis={workshopSignalBasis}
            /* BRT-1: birth trigger for a baseline-banked, spineless company. The
               invocation stays in this file (the only preview file that invokes
               run-agent-flow); InputsTab receives a callback and the state it needs
               to render honestly. */
            companyHasSpine={companyHasSpine}
            birthRunning={birthRunning}
            onBirthSpine={handleBirthSpine}
          />
        </div>
      ) : activeTab === "council" ? (
        <div className="crpv-ws-content">
          {companyId ? (
            <WorkshopCouncilTab companyId={companyId} companyName={activeCompany?.name ?? ""} tensions={councilTensions} hasHierarchy={workshopHasHierarchy} signalBasis={workshopSignalBasis} />
          ) : (
            <div className="crpv-ws-placeholder">Select a company to run the council.</div>
          )}
        </div>
      ) : activeTab === "jobmap" ? (
        <div className="crpv-ws-content">
          {isAdmin ? (
            <StrategicDebugSummary
              latestEventId={strategicChangeSummary?.debug.latestEventId ?? null}
              latestEventAt={strategicChangeSummary?.debug.latestEventAt ?? null}
              affectedCount={strategicChangeSummary?.affectedCounts.total ?? 0}
              artifactVersionCount={strategicChangeSummary?.debug.latestArtifactVersionCount ?? 0}
              dependenciesCreatedCount={strategicChangeSummary?.debug.dependenciesCreatedCount ?? 0}
            />
          ) : null}
          <JobMapOrgPanel
            steps={filteredJobSteps}
            loading={jobStepsLoading}
            activeStepId={activeStepId}
            onSelectStep={(id) => setActiveStepId((prev) => (prev === id ? null : id))}
            routes={filteredRoutes}
            routesUnassessedNote={lensRoutesUnassessed ? "No routes assessed for this market yet." : null}
            activeStep={activeStep}
            activeRoute={activeRoute}
            routesReady={!nextBestMove || nextBestMove.type === "start_route"}
            hasHierarchy={workshopHasHierarchy}
            needs={filteredNeeds}
            marketDef={marketDefinition}
            marketSwitcher={{
              options: marketSwitcherOptions,
              showingAll: showAllJourneys,
              onSelect: (k) => { setShowAllJourneys(false); setViewedSetKey(k || null); setActiveStepId(null); },
              onShowAll: () => { setShowAllJourneys(true); setActiveStepId(null); },
            }}
            headerControls={
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <OnStrategyPin
                  companyId={companyId}
                  setOptions={setOptions}
                  viewedSetKey={showAllJourneys ? null : viewedSetKey}
                />
                {viewedSetKey && !showAllJourneys && !isFrozenCompany(companyId) && (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => void runConditionsGeneration()}
                    disabled={regeneratingConditions || jobStepsLoading}
                  >
                    {regeneratingConditions
                      ? "Working…"
                      : filteredJobSteps.some((s) => Array.isArray(s.conditions_json) && s.conditions_json.length > 0)
                      ? "Regenerate conditions"
                      : "Generate conditions"}
                  </button>
                )}
                {viewedSetKey && !showAllJourneys && !isFrozenCompany(companyId) && (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => void runMarketRegeneration()}
                    disabled={regeneratingMarket || jobStepsLoading}
                  >
                    {regeneratingMarket ? "Working…" : "Regenerate market"}
                  </button>
                )}
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => void rerunLocalJobMapSynthesis()}
                  disabled={regeneratingJobMap || jobStepsLoading}
                >
                  {regeneratingJobMap ? "Generating…" : "Generate Job Map"}
                </button>
              </div>
            }
          />
        </div>
      ) : activeTab === "diagnose" ? (
        <div className="crpv-ws-content">
          <DiagnosePanel routes={routes} companyId={companyId ?? undefined} />
        </div>
      ) : activeTab === "routes" ? (
        <div className="crpv-ws-content">
          {/* DEF-3 — pre-assessment default (operator ruling 2026-07-20, inverting
              DEF-2's polarity). A lens that has assessed NOTHING should not scope the
              view down to nothing: until it has refs, this tab shows the company's
              full route list, labelled honestly. Once the lens has assessed routes,
              the scoped view below is exactly as before. `loading` also waits on the
              lens read, so the correct view renders once instead of the full list
              flashing and then collapsing. View-only: choosing what to DISPLAY,
              never writing refs or focusing/choosing anything. */}
          <RoutesOrgPanel
            routes={lensRoutesUnassessed ? routes : filteredRoutes}
            loading={routesLoading || lensRefsLoading}
            activeCompany={activeCompany}
            routeIdParam={pendingInspectRouteId}
            onClearRouteIdParam={() => setPendingInspectRouteId(null)}
            contextStep={contextStep}
            nextBestMove={nextBestMove}
            needs={filteredNeeds}
            onRouteActivate={(id) => setActiveRouteId(id)}
            lensUnassessed={lensRoutesUnassessed}
          />
        </div>
      ) : compareActive ? (
        <div className="crpv-ws-cmp">
          <div className="crpv-ws-cmp-col-headers">
            <div className="crpv-ws-cmp-col-hd cap">Outside read</div>
            <div className="crpv-ws-cmp-col-hd cap">Your inputs</div>
          </div>
          <div className="crpv-ws-cmp-scroll">
            {renderCompareTab()}
          </div>
        </div>
      ) : (
        <div className="crpv-ws-content">
          {companyId && !baselineLoading && dataQualityFlag?.type === "no_results" && (
            <div className="crpv-dq-notice">
              <p className="crpv-dq-notice-prompt">{dataQualityFlag.prompt}</p>
              <button
                type="button"
                className="crpv-dq-notice-cta"
                onClick={() => setActiveTab("inputs")}
              >
                Upload documents
              </button>
            </div>
          )}
          {companiesFetchError && (
            <div className="crpv-dq-notice">
              <p className="crpv-dq-notice-prompt" style={{ color: "#c45c00" }}>Couldn't load companies — try reloading.</p>
            </div>
          )}
          {companyId && !baselineLoading && baselineError && (
            <div className="crpv-dq-notice">
              <p className="crpv-dq-notice-prompt" style={{ color: "#c45c00" }}>This check didn't complete — it will run again on the next scan.</p>
            </div>
          )}
          {companyId && !baselineLoading && !baselineError && !baselineRun && (
            <div className="crpv-dq-notice">
              <p className="crpv-dq-notice-prompt">No public data found for this company. Upload internal documents to establish a starting baseline — strategy, positioning, or customer research.</p>
              <button
                type="button"
                className="crpv-dq-notice-cta"
                onClick={() => setActiveTab("inputs")}
              >
                Upload documents
              </button>
            </div>
          )}
          {companyId && !baselineLoading && dataQualityFlag && (dataQualityFlag.type === "thin" || dataQualityFlag.type === "ambiguous") && (
            <div style={{ marginBottom: 8 }}>
              <DataQualityMarker type={dataQualityFlag.type} prompt={dataQualityFlag.prompt} />
            </div>
          )}
          {renderOrgTab()}
        </div>
      )}
      </div>
      </div>
    </section>

    {driftPanel && (
      <DriftDetailPanel
        open
        onClose={() => { setDriftPanel(null); }}
        surfaceType={driftPanel.surfaceType}
        surfaceId={driftPanel.surfaceId}
        refreshKey={driftBadgeRefreshKey}
        onRefresh={() => setDriftBadgeRefreshKey((k) => k + 1)}
        onProposeChanges={getDriftProposeCallback(driftPanel.surfaceType, driftPanel.surfaceId)}
      />
    )}
    </>
  );
}
