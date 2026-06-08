import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import type { Company } from "@/hooks/useCompany";
import { useClientViewData } from "@/hooks/useClientViewData";
import { usePositioningCanvas } from "@/hooks/usePositioningCanvas";
import { usePositioningProposal } from "@/hooks/usePositioningProposal";
import { useCascadeProposal } from "@/hooks/useCascadeProposal";
import { useOpportunityProposalHandlers } from "@/hooks/useOpportunityProposalHandlers";
import { useStrategyCascade } from "@/hooks/useStrategyCascade";
import { useOdiNeeds } from "@/hooks/useOdiNeeds";
import { useJobSteps } from "@/hooks/useJobSteps";
import { useStrategicChangeSummary } from "@/hooks/useStrategicChangeSummary";
import { useStrategicHypotheses } from "@/hooks/useStrategicHypotheses";
import JobMapOrgPanel, { deriveSuggestedId } from "./workshop/tabs/JobMapOrgPanel";
import { usePublicBaseline } from "@/hooks/usePublicBaseline";
import { useSourceConfidence } from "@/hooks/useSourceConfidence";
import { useSignalExclusion } from "@/hooks/useSignalExclusion";
import { computeExclusionImpact, computeLatestExclusionAt } from "@/lib/evidenceImpact";
import { supabase } from "@/integrations/supabase/client";
import { captureBaseline } from "@/lib/baselineCapture";
import { saveManualEdit } from "@/lib/manualInlineEdit";
import { CLIENT_REFINE_PREVIEW_ROUTE, CLIENT_REFINE_PREVIEW_ROUTES_ROUTE, CLIENT_REFINE_PREVIEW_COMPANY_ROUTE, CLIENT_REFINE_PREVIEW_INBOX_ROUTE } from "@/lib/clientRefinePreview";
import { useRoutes } from "@/views/Routes/useRoutes";
import { useDriftScan } from "@/hooks/useDriftScan";
import { useDriftInboxCount } from "@/hooks/useDriftInbox";
import { formatDistanceToNow } from "date-fns";
import ScoreContextBar from "@/components/score/ScoreContextBar";


import PositioningOrgPanel from "./workshop/tabs/PositioningOrgPanel";
import StrategyOrgPanel from "./workshop/tabs/StrategyOrgPanel";
import NeedsOrgPanel from "./workshop/tabs/NeedsOrgPanel";
import InputsTab from "./workshop/tabs/InputsTab";
import { RoutesOrgPanel } from "./ClientRefinePreviewRoutesView";
import WorkshopCouncilTab from "./workshop/tabs/CouncilPanel";
import { WorkshopSidebar } from "@/components/client/WorkshopSidebar";
import DriftDetailPanel from "@/components/drift/DriftDetailPanel";
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

function cleanText(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stageLabel(value: string) {
  if (value === "outside_signals" || value === "validate_outside" || value === "outside") return "outside signals";
  if (value === "diagnose" || value === "validate_diagnose" || value === "diagnosis") return "diagnose";
  if (value === "focus" || value === "validate_focus") return "focus";
  if (value === "flow" || value === "validate_flow" || value === "execution") return "flow";
  return "diagnose";
}

function sanitizeWebsite(url?: string) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function sentenceCase(value: string) {
  const text = cleanText(value).replace(/\.$/, "");
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function lowerFirst(value: string) {
  const text = cleanText(value);
  if (!text) return "";
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function extractCoreJobClause(value: string) {
  const text = cleanText(value).replace(/\.$/, "");
  if (!text) return "";
  const patterns = [
    /\bneed(?:s)? to\s+(.+?)(?:,\s*so\b|\s+so\b|$)/i,
    /\bwant(?:s)? to\s+(.+?)(?:,\s*so\b|\s+so\b|$)/i,
    /\btrying to\s+(.+?)(?:,\s*so\b|\s+so\b|$)/i,
    /\bhelp\s+.+?\s+(.+?)(?:,\s*so\b|\s+so\b|$)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return sentenceCase(match[1]);
  }
  return sentenceCase(text);
}

function MarketFoundationSection({
  marketDefinition,
}: {
  marketDefinition: string;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <p className="cap" style={{ margin: 0, color: "#6e847f" }}>Market definition</p>
      <p style={{ margin: "6px 0 0", color: "#233c4b", fontSize: 15, lineHeight: 1.55, maxWidth: 980 }}>
        {marketDefinition}
      </p>
    </div>
  );
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

export default function ClientRefinePreviewWorkshopView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { user, isAdmin } = useAuth();
  const { companies, setActiveCompanyId, loading: companiesLoading, refetch: refetchCompany } = useCompany();
  const { activeCompany, hasCompany, confidence } = useClientViewData({ actionLimit: 0 });
  const { items: routes, loading: routesLoading } = useRoutes(activeCompany?.id);
  const { data: strategicHypothesisRows = [] } = useStrategicHypotheses(activeCompany?.id);

  const workshopHasHierarchy = routes.some((r) => r.level === "route");
  const unroutedCount = routes.filter((r) => r.parent_id == null && r.level !== "route").length;

  const initialTab = (searchParams.get("tab") as WorkshopTab | null) ?? "positioning";

  const [activeTab,   setActiveTab]   = useState<WorkshopTab>(initialTab);
  const [showCompare, setShowCompare] = useState(false);
  const [activeStepId,      setActiveStepId]      = useState<string | null>(null);
  const [activeRouteId,     setActiveRouteId]     = useState<string | null>(null);
  const [needsRefreshKey,   setNeedsRefreshKey]   = useState(0);
  const [regeneratingJobMap, setRegeneratingJobMap] = useState(false);
  const [focusedJourneyKey, setFocusedJourneyKey] = useState<string | null>(null);
  const [showAllJourneys, setShowAllJourneys] = useState(false);
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [creatingClient, setCreatingClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientWebsite, setNewClientWebsite] = useState("");
  const [newClientRunBaseline, setNewClientRunBaseline] = useState(true);

  const companyId = activeCompany?.id;

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

  const { preferredRun: baselineRun, loading: baselineLoading } = usePublicBaseline(companyId);
  const baseline = baselineOf(baselineRun);
  const dataQualityFlag = baseline?.data_quality_flag ?? null;

  const { landscape: workshopSignalLandscape } = useSignalLandscape(companyId);
  const workshopSignalBasis: SignalBasis | undefined = workshopSignalLandscape ? {
    publicCount:   workshopSignalLandscape.byBand.outside.count,
    teamCount:     workshopSignalLandscape.byBand.organization.count,
    customerCount: workshopSignalLandscape.byBand.customer.count,
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
  }, [scanAllSurfaces]);

  const handleCheckSurfaceDrift = useCallback((surfaceType: string, surfaceId: string) => {
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
  }, [checkSurfaceDrift]);

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

  const {
    loading: stratLoading,
    item: strategy,
    updateNarrativeField,
    updateListField,
    cascadeId,
  } = useStrategyCascade(companyId, cascadeRefreshKey);

  const {
    loading: odiLoading,
    marketDefinition,
    needs,
    error: odiError,
    updateNeedScores,
  } = useOdiNeeds(companyId, needsRefreshKey, focusedJourneyKey ?? undefined);

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
  }, [companyId]);

  const handleAcceptProposal = useCallback(async (proposalId: string, acceptedFields: string[], skippedFields: string[]) => {
    if (!companyId || !proposal) return;
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
  }, [companyId, proposal]);

  const handleRejectProposal = useCallback(async (proposalId: string) => {
    setRejectLoading(true);
    await supabase
      .from("surface_proposals")
      .update({ status: "rejected", reviewed_at: new Date().toISOString() })
      .eq("id", proposalId);
    setRejectLoading(false);
    setProposalRefreshKey((k) => k + 1);
  }, []);

  // ── Cascade proposal handlers ─────────────────────────────────────────────
  const handleGenerateCascadeProposal = useCallback(async () => {
    if (!companyId) return;
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
  }, [companyId]);

  const handleAcceptCascadeProposal = useCallback(async (
    proposalId: string,
    acceptedFields: string[],
    skippedFields: string[],
  ) => {
    if (!companyId || !cascadeProposal) return;
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
  }, [companyId, cascadeProposal, routes, needs]);

  const handleRejectCascadeProposal = useCallback(async (proposalId: string) => {
    setCascadeRejectLoading(true);
    await supabase
      .from("surface_proposals")
      .update({ status: "rejected", reviewed_at: new Date().toISOString() })
      .eq("id", proposalId);
    setCascadeRejectLoading(false);
    setCascadeProposalRefreshKey((k) => k + 1);
  }, []);

  const handleCascadeNarrativeInlineEdit = useCallback(async (
    field: "winning_aspiration" | "where_to_play" | "how_to_win",
    value: string,
    opts?: { isManualInline?: boolean },
  ) => {
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
  }, [companyId, updateNarrativeField, routes, needs]);

  // ── Opportunity proposal handlers (extracted to avoid TDZ ordering fragility) ─
  const {
    opportunityProposalsMap,
    generateLoadingOpportunityId,
    acceptLoadingOpportunityProposalId,
    rejectLoadingOpportunityProposalId,
    handleSaveNeedField,
    handleGenerateOpportunityProposal,
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

  const journeyOptions = useMemo(() => {
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

  useEffect(() => {
    if (journeyOptions.length === 0) {
      setFocusedJourneyKey(null);
      return;
    }
    const preferred =
      journeyOptions.find((journey) => journey.key !== "customer")?.key ??
      journeyOptions[0]?.key ??
      null;
    setFocusedJourneyKey((current) => {
      if (current && journeyOptions.some((journey) => journey.key === current)) return current;
      return preferred;
    });
    if (journeyOptions.some((journey) => journey.key !== "customer")) {
      setShowAllJourneys(false);
    }
  }, [journeyOptions]);

  const filteredJobSteps = useMemo(() => {
    if (showAllJourneys || !focusedJourneyKey) return jobSteps;
    return jobSteps.filter((step) => step.journey_key === focusedJourneyKey);
  }, [jobSteps, focusedJourneyKey, showAllJourneys]);

  const filteredNeeds = useMemo(() => {
    if (showAllJourneys || !focusedJourneyKey) return needs;
    const matching = needs.filter((need) => String(need.journey_key || "").toLowerCase() === focusedJourneyKey.toLowerCase());
    return matching.length > 0 ? matching : needs;
  }, [needs, focusedJourneyKey, showAllJourneys]);

  const filteredRoutes = useMemo(() => {
    if (showAllJourneys || !focusedJourneyKey) return routes;
    return routes.filter((route) => {
      if (!String(route.id || "").startsWith("derived-")) return true;
      const description = cleanText(route.short_description);
      return description.toLowerCase().startsWith(`${focusedJourneyKey.toLowerCase()} journey`);
    });
  }, [routes, focusedJourneyKey, showAllJourneys]);

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

  const marketFoundation = useMemo(() => {
    const primaryJobStatement = cleanText(marketDefinition?.jtbd);
    const primaryJob = extractCoreJobClause(primaryJobStatement) || "Accomplish the core job with less uncertainty and rework.";
    const jobExecutor = sentenceCase(
      cleanText(marketDefinition?.job_executor) || cleanText(positioning?.best_fit_customers) || "Primary job performer",
    );
    const marketDefinitionText = sentenceCase(
      cleanText(primaryJobStatement)
        ? `Market defined by ${lowerFirst(jobExecutor)} trying to ${lowerFirst(primaryJob)}.`
        : `Market defined by the job performer trying to ${lowerFirst(primaryJob)}.`
    ) || "Market defined by the stable job the actor is trying to accomplish.";

    return {
      marketDefinition: marketDefinitionText,
    };
  }, [marketDefinition?.jtbd, marketDefinition?.job_executor, positioning]);

  const rerunLocalJobMapSynthesis = useCallback(async () => {
    if (!companyId) {
      toast.error("Select a company before generating the job map.");
      return;
    }

    const journeyKey = focusedJourneyKey || "customer";

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
  }, [companyId, focusedJourneyKey, queryClient, refetchCompany, refetchJobSteps]);

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

    const { error } = await supabase.functions.invoke("public-baseline", {
      body: {
        company_id: targetCompanyId,
        company_name: companyName,
        website: companyWebsite,
      },
    });

    if (error) {
      throw new Error(error.message || "Failed to run public baseline.");
    }
  }, []);

  const handleCreateClient = useCallback(async () => {
    if (!isAdmin || !user?.id) return;
    const name = cleanText(newClientName);
    if (!name) {
      toast.error("Client name is required.");
      return;
    }

    setCreatingClient(true);
    const sanitizedWebsite = sanitizeWebsite(newClientWebsite);

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
      toast.error(error instanceof Error ? error.message : "Failed to create client.");
    } finally {
      setCreatingClient(false);
    }
  }, [
    isAdmin,
    user?.id,
    newClientName,
    newClientWebsite,
    newClientRunBaseline,
    refetchCompany,
    runPublicBaseline,
    setActiveCompanyId,
  ]);

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
        </article>
      </section>
    );
  }

  const TABS: { key: WorkshopTab; label: string }[] = [
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
    if (activeTab === "positioning") return <PositioningOutside baseline={baseline} companyId={companyId} exclusion={exclusionControls} />;
    if (activeTab === "strategy")   return <StrategyOutside baseline={baseline} companyId={companyId} />;
    if (activeTab === "jobmap")     return null;
    if (activeTab === "routes")     return null;
    return <NeedsOutside baseline={baseline} exclusion={exclusionControls} />;
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
        <PositioningOrgPanel
          canvas={positioning}
          loading={posLoading}
          baseline={baseline}
          signals={sourceSignals}
          updateTextField={updatePosTextField}
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
              onDriftClick={handleDriftClick}
              driftRefreshKey={driftBadgeRefreshKey}
              onCheckSurfaceDrift={handleCheckSurfaceDrift}
              checkingSurfaceId={driftCheckingSurfaceId}
            />
            {!odiLoading && filteredNeeds.length === 0 && (
              <p className="crpv-ws-hint" style={{ marginTop: 8, textAlign: "center" }}>
                company id: {companyId}
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
        updateTextField={updatePosTextField}
        updateItemsField={updatePosItemsField}
      />
    );
    // Needs compare — inferred needs from outside vs defined ODI needs
    const outsideSignals = (baseline?.outside_voice_signals ?? []).filter((s) => s.signal);
    return (
      <>
        <div className="crpv-ws-cmp-support">
          <div className="crpv-ws-cmp-support-col">
            <NeedsOutsideCompare baseline={baseline} />
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
              [{activeCompany?.name?.toUpperCase() || "COMPANY"}] · DAY 52 · {workshopDominantClaimState ? workshopDominantClaimState.replace(/_/g, " ").toUpperCase() : stageLabel(activeCompany?.engagement_phase ?? "diagnose").toUpperCase()}
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
              disabled={creatingClient}
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
          disabled={scanningAll}
          style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: "0.06em", color: scanningAll ? "rgba(17,17,17,0.25)" : "rgba(17,17,17,0.45)", background: "none", border: "1px solid rgba(17,17,17,0.15)", cursor: scanningAll ? "wait" : "pointer", padding: "4px 10px", borderRadius: 2 }}
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
          <MarketFoundationSection
            marketDefinition={marketFoundation.marketDefinition}
          />
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
            activeStep={activeStep}
            activeRoute={activeRoute}
            routesReady={!nextBestMove || nextBestMove.type === "start_route"}
            hasHierarchy={workshopHasHierarchy}
            needs={filteredNeeds}
            headerControls={
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {journeyOptions.length > 1 && (
                  <select
                    value={showAllJourneys ? "__all__" : focusedJourneyKey ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === "__all__") {
                        setShowAllJourneys(true);
                        return;
                      }
                      setShowAllJourneys(false);
                      setFocusedJourneyKey(value || null);
                    }}
                    style={{
                      minWidth: 280,
                      border: "1px solid #dde6d1",
                      borderRadius: 4,
                      background: "#fff",
                      color: "#233c4b",
                      fontSize: 13,
                      padding: "5px 10px",
                      appearance: "auto",
                      cursor: "pointer",
                    }}
                  >
                    {journeyOptions.map((journey) => (
                      <option key={journey.key} value={journey.key}>
                        {journey.title}
                      </option>
                    ))}
                    <option value="__all__">Show all maps</option>
                  </select>
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
      ) : activeTab === "routes" ? (
        <div className="crpv-ws-content">
          <RoutesOrgPanel
            routes={filteredRoutes}
            loading={routesLoading}
            activeCompany={activeCompany}
            routeIdParam={pendingInspectRouteId}
            onClearRouteIdParam={() => setPendingInspectRouteId(null)}
            contextStep={contextStep}
            nextBestMove={nextBestMove}
            needs={filteredNeeds}
            onRouteActivate={(id) => setActiveRouteId(id)}
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
          {companyId && !baselineLoading && !baselineRun && (
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
