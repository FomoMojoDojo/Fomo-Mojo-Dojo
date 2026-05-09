import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import type { Company } from "@/hooks/useCompany";
import { useClientViewData } from "@/hooks/useClientViewData";
import { usePositioningCanvas } from "@/hooks/usePositioningCanvas";
import { useStrategyCascade } from "@/hooks/useStrategyCascade";
import { useOdiNeeds } from "@/hooks/useOdiNeeds";
import { useJobSteps } from "@/hooks/useJobSteps";
import { useStrategicChangeSummary } from "@/hooks/useStrategicChangeSummary";
import JobMapOrgPanel, { deriveSuggestedId } from "./workshop/tabs/JobMapOrgPanel";
import { usePublicBaseline } from "@/hooks/usePublicBaseline";
import { useSourceConfidence } from "@/hooks/useSourceConfidence";
import { useSignalExclusion } from "@/hooks/useSignalExclusion";
import { computeExclusionImpact, computeLatestExclusionAt } from "@/lib/evidenceImpact";
import { supabase } from "@/integrations/supabase/client";
import { CLIENT_REFINE_PREVIEW_ROUTE, CLIENT_REFINE_PREVIEW_ROUTES_ROUTE } from "@/lib/clientRefinePreview";
import { useRoutes } from "@/views/Routes/useRoutes";
import ScoreContextBar from "@/components/score/ScoreContextBar";

import PositioningOrgPanel from "./workshop/tabs/PositioningOrgPanel";
import StrategyOrgPanel from "./workshop/tabs/StrategyOrgPanel";
import NeedsOrgPanel from "./workshop/tabs/NeedsOrgPanel";
import InputsTab from "./workshop/tabs/InputsTab";
import { RoutesOrgPanel } from "./ClientRefinePreviewRoutesView";
import WorkshopCouncilTab from "./workshop/tabs/CouncilPanel";
import { StrategyCompare, PositioningCompare } from "./workshop/tabs/ComparePanel";
import { CustomerPlaceholder, SignalBar, PositioningOutside, StrategyOutside, NeedsOutside, NeedsOutsideCompare } from "./workshop/tabs/OutsidePanels";
import "@/styles/client-refine-preview.css";
import {
  type WorkshopTab,
  type SignalStage,
  type ExclusionControls,
  type BaselineVoiceSignal,
  type BaselineEvidenceItem,
  type BaselineResult,
} from "./workshop/types";
import { baselineOf } from "./workshop/helpers";
import {
  EvidenceImpactBanner,
  ARTIFACT_TO_TAB,
} from "./workshop/primitives";
import { deriveNextBestMove, type EvidenceReadiness } from "@/lib/nextBestMove";

function cleanText(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
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

function StrategicChangeBanner({
  total,
  scoreNote,
  affectedArtifacts,
  onOpenArtifact,
}: {
  total: number;
  scoreNote: string | null;
  affectedArtifacts: Array<{
    object_type: "odi_need" | "route" | "desired_outcome";
    object_id: string;
    label: string;
    dependency_state: string;
    stale_reason: string | null;
    updated_at: string | null;
  }>;
  onOpenArtifact: (artifact: {
    object_type: "odi_need" | "route" | "desired_outcome";
    object_id: string;
    label: string;
    dependency_state: string;
    stale_reason: string | null;
    updated_at: string | null;
  }) => void;
}) {
  if (total <= 0) return null;

  return (
    <div style={{ marginBottom: 16, border: "1px solid #d7ded1", background: "#f8f7f2", padding: "14px 16px" }}>
      <div className="cap" style={{ color: "#6e847f" }}>Change notice</div>
      <div style={{ marginTop: 6, color: "#233c4b", fontSize: 15, fontWeight: 600 }}>
        Job map updated. {total} dependent item{total === 1 ? "" : "s"} need review.
      </div>
      {scoreNote ? (
        <div style={{ marginTop: 6, color: "#54656a", fontSize: 13, lineHeight: 1.5 }}>
          {scoreNote}
        </div>
      ) : null}
      <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
        {affectedArtifacts.slice(0, 10).map((artifact) => (
          <button
            key={`${artifact.object_type}:${artifact.object_id}`}
            type="button"
            onClick={() => onOpenArtifact(artifact)}
            style={{
              display: "grid",
              gridTemplateColumns: "140px 1fr 110px",
              gap: 12,
              textAlign: "left",
              border: "1px solid #d7ded1",
              background: "#fff",
              padding: "10px 12px",
            }}
          >
            <span className="cap" style={{ color: "#6e847f" }}>
              {artifact.object_type === "odi_need" ? "Need" : artifact.object_type === "route" ? "Route" : "Desired outcome"}
            </span>
            <span>
              <span style={{ color: "#233c4b", fontSize: 13, display: "block" }}>{artifact.label}</span>
              <span style={{ color: "#6e847f", fontSize: 11, display: "block", marginTop: 3 }}>
                {artifact.stale_reason || "Needs review"}{artifact.updated_at ? ` · ${new Date(artifact.updated_at).toLocaleString()}` : ""}
              </span>
            </span>
            <span className="cap" style={{ color: "#6e847f" }}>{artifact.dependency_state}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StrategicDebugSummary({
  latestEventId,
  latestEventAt,
  affectedCount,
  artifactVersionCount,
  dependenciesCreatedCount,
}: {
  latestEventId: string | null;
  latestEventAt: string | null;
  affectedCount: number;
  artifactVersionCount: number;
  dependenciesCreatedCount: number;
}) {
  if (!latestEventId) return null;

  return (
    <div style={{ marginBottom: 16, border: "1px dashed #d7ded1", background: "#fbfaf6", padding: "12px 14px" }}>
      <div className="cap" style={{ color: "#6e847f" }}>Strategic graph debug</div>
      <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
        <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12 }}>
          <span className="cap" style={{ color: "#6e847f" }}>Latest event</span>
          <span style={{ color: "#233c4b", fontSize: 13 }}>{latestEventId}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12 }}>
          <span className="cap" style={{ color: "#6e847f" }}>Event timestamp</span>
          <span style={{ color: "#233c4b", fontSize: 13 }}>{latestEventAt || "—"}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12 }}>
          <span className="cap" style={{ color: "#6e847f" }}>Affected artifacts</span>
          <span style={{ color: "#233c4b", fontSize: 13 }}>{affectedCount}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12 }}>
          <span className="cap" style={{ color: "#6e847f" }}>Artifact versions</span>
          <span style={{ color: "#233c4b", fontSize: 13 }}>{artifactVersionCount}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12 }}>
          <span className="cap" style={{ color: "#6e847f" }}>Dependencies in scope</span>
          <span style={{ color: "#233c4b", fontSize: 13 }}>{dependenciesCreatedCount}</span>
        </div>
      </div>
    </div>
  );
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

export default function ClientRefinePreviewWorkshopView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { user, isAdmin } = useAuth();
  const { companies, setActiveCompanyId, loading: companiesLoading, refetch: refetchCompany } = useCompany();
  const { activeCompany, hasCompany, confidence } = useClientViewData({ actionLimit: 0 });
  const { items: routes, loading: routesLoading } = useRoutes(activeCompany?.id);

  const initialTab   = (searchParams.get("tab")   as WorkshopTab | null) ?? "positioning";
  const initialStage = (searchParams.get("stage") as SignalStage | null) ?? "outside";

  const [activeTab,         setActiveTab]         = useState<WorkshopTab>(initialTab);
  const [activeStage,       setActiveStage]       = useState<SignalStage>(initialStage);
  const [showCompare,       setShowCompare]       = useState(false);
  const [activeStepId,      setActiveStepId]      = useState<string | null>(null);
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

  const exclusionImpact = useMemo(
    () => computeExclusionImpact(baseline?.evidence_ledger ?? [], signalExclusion.excludedSet, ARTIFACT_TO_TAB),
    [baseline?.evidence_ledger, signalExclusion.excludedSet],
  );

  const latestExclusionAt = useMemo(
    () => computeLatestExclusionAt(signalExclusion.excluded),
    [signalExclusion.excluded],
  );

  const {
    loading: posLoading,
    item: positioning,
    updateTextField: updatePosTextField,
    updateItemsField: updatePosItemsField,
  } = usePositioningCanvas(companyId);

  const {
    loading: stratLoading,
    item: strategy,
    updateNarrativeField,
    updateListField,
  } = useStrategyCascade(companyId);

  const {
    loading: odiLoading,
    marketDefinition,
    needs,
    error: odiError,
    updateNeedScores,
  } = useOdiNeeds(companyId, needsRefreshKey);

  const goToMainSite   = useCallback(() => navigate("/"), [navigate]);
  const goToRefineHome = useCallback(() => navigate(CLIENT_REFINE_PREVIEW_ROUTE), [navigate]);
  const [pendingInspectRouteId, setPendingInspectRouteId] = useState<string | null>(null);
  const [pendingReviewNeedId, setPendingReviewNeedId] = useState<string | null>(null);
  const handleRouteSelect = useCallback(
    (routeId: string) => { setPendingInspectRouteId(routeId); setActiveTab("routes"); },
    [],
  );

  const { items: jobSteps, loading: jobStepsLoading, refetch: refetchJobSteps } = useJobSteps(companyId);
  const { data: strategicChangeSummary } = useStrategicChangeSummary(companyId);

  // Compare mode only makes sense on the org stage
  const compareActive = showCompare && activeStage === "org";

  const evidenceReadiness = useMemo((): EvidenceReadiness => ({
    hasPrimaryEvidence: sourceSignals.hasPrimaryEvidence,
    primaryEvidenceSignals: sourceSignals.primaryEvidenceSignals,
    hasCompanyEvidence: sourceSignals.hasCompanyEvidence,
  }), [sourceSignals.hasPrimaryEvidence, sourceSignals.primaryEvidenceSignals, sourceSignals.hasCompanyEvidence]);


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
      toast.error("Select a company before regenerating the ODI job map.");
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
          toast.success("ODI job map regenerated.", { id: "rerun-jobmap" });
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
              toast.success("ODI job map regenerated.", { id: "rerun-jobmap" });
              return;
            }
          }
        } else {
          nullProposalStreak = 0;
        }
      }

      throw new Error("Analysis is taking longer than expected. The map will update automatically — refresh the page in a moment.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to regenerate ODI job map.", {
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

      if (newClientRunBaseline) {
        if (!sanitizedWebsite) {
          throw new Error("Website required to run outside-signals baseline.");
        }
        toast.loading(`Running outside signals for ${data.name}…`, { id: "create-client-baseline" });
        await runPublicBaseline(data.id, data.name, sanitizedWebsite);
        toast.success(`Outside signals captured for ${data.name}.`, { id: "create-client-baseline" });
      } else {
        toast.success(`Client created: ${data.name}`);
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
    { key: "positioning", label: "Positioning" },
    { key: "jobmap",      label: "Job Map" },
    { key: "strategy",    label: "Strategy" },
    { key: "needs",       label: "Needs" },
    { key: "routes",      label: "Routes" },
    { key: "council",     label: "Council" },
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
      <PositioningOrgPanel
        canvas={positioning}
        loading={posLoading}
        baseline={baseline}
        signals={sourceSignals}
        updateTextField={updatePosTextField}
        updateItemsField={updatePosItemsField}
      />
    );
    if (activeTab === "jobmap") return (
      <JobMapOrgPanel
        steps={filteredJobSteps}
        loading={jobStepsLoading}
        activeStepId={activeStepId}
        onSelectStep={(id) => setActiveStepId((prev) => (prev === id ? null : id))}
        routes={filteredRoutes}
        activeStep={activeStep}
      />
    );
    if (activeTab === "strategy") return (
      <StrategyOrgPanel
        strategy={strategy}
        loading={stratLoading}
        baseline={baseline}
        signals={sourceSignals}
        updateNarrativeField={updateNarrativeField}
        updateListField={updateListField}
      />
    );
    if (odiError) return <div className="crpv-ws-placeholder crpv-ws-error cap">Needs query error: {odiError}</div>;
    return (
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
        />
        {!odiLoading && filteredNeeds.length === 0 && (
          <p className="crpv-ws-hint" style={{ marginTop: 8, textAlign: "center" }}>
            company id: {companyId}
          </p>
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
              : <NeedsOrgPanel needs={needs} loading={odiLoading} updateNeedScores={updateNeedScores} latestExclusionAt={latestExclusionAt} activeStep={activeStep} onClearStep={clearStep} routes={routes} onRouteSelect={handleRouteSelect} companyId={companyId ?? undefined} currentPhase={activeCompany?.engagement_phase} reviewNeedId={pendingReviewNeedId} onReviewNeedHandled={() => setPendingReviewNeedId(null)} />
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
    <section className="crpv-page crpv-workshop-page">
      <header className="crpv-header">
        <div className="left">
          <b>Mojo</b>
          <CompanySwitcher
            activeCompany={activeCompany}
            companies={companies}
            loading={companiesLoading}
            onSelect={(id) => { setActiveCompanyId(id); setShowCompare(false); }}
            suffix={`· WORKSHOP · ${activeStage.toUpperCase()}`}
          />
          {isAdmin && (
            <button type="button" className="btn ghost" onClick={() => setShowCreateClient((current) => !current)}>
              {showCreateClient ? "Close add client" : "+ Add client"}
            </button>
          )}
        </div>
        <div className="crpv-header-tools">
          <button type="button" className="btn ghost" onClick={goToRefineHome}>← Refine Home</button>
          <button type="button" className="btn ghost crpv-main-site-btn" onClick={goToMainSite}>← Main site</button>
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
              {creatingClient ? "Creating…" : newClientRunBaseline ? "Create + baseline" : "Create client"}
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

      <ScoreContextBar
        currentScore={Math.round(Number(activeCompany?.mojo_score ?? 0))}
        reachableScore={Math.round(Number(activeCompany?.potential_score ?? 0))}
        unlockableScore={Math.round(Number(activeCompany?.projected_score ?? 0))}
        routesCount={routes.length}
        confidenceLabel={confidence.level}
      />

      <SignalBar
        activeStage={activeStage}
        setActiveStage={(s) => { setActiveStage(s); setShowCompare(false); }}
        baseline={baseline}
        positioning={positioning}
        strategy={strategy}
        excludedCount={exclusionImpact.excludedCount}
      />

      <nav className="crpv-ws-tabs">
        {/* INPUTS — source library, visually separated from the reasoning tabs */}
        <button
          type="button"
          onClick={() => setActiveTab("inputs")}
          style={{
            fontSize: 9,
            fontFamily: "monospace",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: activeTab === "inputs" ? "#5a3fc0" : "#888",
            background: activeTab === "inputs" ? "#f5f2ff" : "none",
            border: activeTab === "inputs" ? "1px solid #c4b5fd" : "1px solid #d9d9d9",
            borderRadius: 3,
            padding: "3px 10px",
            cursor: "pointer",
            flexShrink: 0,
            alignSelf: "center",
          }}
        >
          Inputs
        </button>
        <span style={{ color: "#ddd", margin: "0 6px", alignSelf: "center", flexShrink: 0, fontSize: 14 }}>|</span>
        {TABS.map((tab) => {
          const isAffected = activeStage === "outside" && exclusionImpact.affectedTabKeys.has(tab.key);
          return (
            <button
              key={tab.key}
              type="button"
              className={`crpv-ws-tab${activeTab === tab.key ? " active" : ""}${isAffected ? " crpv-ws-tab-affected" : ""}`}
              onClick={() => setActiveTab(tab.key)}
              title={isAffected ? "Affected by excluded outside signals" : undefined}
            >
              {tab.label}
              {isAffected && <span className="crpv-ws-tab-warn-dot" aria-hidden="true">⚠</span>}
            </button>
          );
        })}
        {activeStage === "org" && activeTab !== "council" && activeTab !== "jobmap" && activeTab !== "routes" && activeTab !== "inputs" && (
          <button
            type="button"
            className={`crpv-ws-tab crpv-ws-compare-toggle${showCompare ? " active" : ""}`}
            onClick={() => setShowCompare((v) => !v)}
            title="Compare with outside signals"
          >
            {showCompare ? "Hide compare" : "Compare ⇄"}
          </button>
        )}
      </nav>

      {/* Outside Signals impact banner — lives outside the scroll container so it
          stays visible as the user scrolls through signals. Only shown when on the
          outside stage and at least one signal (ledger or voice) is excluded. */}
      {activeStage === "outside" && activeTab !== "council" && activeTab !== "inputs" && (
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
            socialNeeds={needs.filter((n) => String(n.source_path).startsWith("social_"))}
            onAdded={() => setNeedsRefreshKey((k) => k + 1)}
          />
        </div>
      ) : activeTab === "council" ? (
        <div className="crpv-ws-content">
          {companyId ? (
            <WorkshopCouncilTab companyId={companyId} companyName={activeCompany?.name ?? ""} />
          ) : (
            <div className="crpv-ws-placeholder">Select a company to run the council.</div>
          )}
        </div>
      ) : activeTab === "jobmap" ? (
        <div className="crpv-ws-content">
          <MarketFoundationSection
            marketDefinition={marketFoundation.marketDefinition}
          />
          <StrategicChangeBanner
            total={strategicChangeSummary?.affectedCounts.total ?? 0}
            scoreNote={strategicChangeSummary?.scoreNote ?? null}
            affectedArtifacts={strategicChangeSummary?.affectedArtifacts ?? []}
            onOpenArtifact={openAffectedArtifact}
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
          {journeyOptions.length > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span className="cap" style={{ color: "#6e847f" }}>Map</span>
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
                  minWidth: 320,
                  border: "1px solid #dde6d1",
                  borderRadius: 6,
                  background: "#fff",
                  color: "#233c4b",
                  fontSize: 13,
                  padding: "7px 10px",
                }}
              >
                {journeyOptions.map((journey) => (
                  <option key={journey.key} value={journey.key}>
                    {journey.title}
                  </option>
                ))}
                <option value="__all__">Show all maps</option>
              </select>
            </div>
          )}
          <JobMapOrgPanel
            steps={filteredJobSteps}
            loading={jobStepsLoading}
            activeStepId={activeStepId}
            onSelectStep={(id) => setActiveStepId((prev) => (prev === id ? null : id))}
            routes={filteredRoutes}
            activeStep={activeStep}
            routesReady={!nextBestMove || nextBestMove.type === "start_route"}
            headerControls={
              <button
                type="button"
                className="btn ghost"
                onClick={() => void rerunLocalJobMapSynthesis()}
                disabled={regeneratingJobMap || jobStepsLoading}
              >
                {regeneratingJobMap ? "Regenerating…" : "Regenerate ODI Job Map"}
              </button>
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
          />
        </div>
      ) : activeStage === "customer" ? (
        <div className="crpv-ws-content">
          <CustomerPlaceholder />
        </div>
      ) : compareActive ? (
        <div className="crpv-ws-cmp">
          <div className="crpv-ws-cmp-col-headers">
            <div className="crpv-ws-cmp-col-hd cap">Outside Signals</div>
            <div className="crpv-ws-cmp-col-hd cap">Organization Signals</div>
          </div>
          <div className="crpv-ws-cmp-scroll">
            {renderCompareTab()}
          </div>
        </div>
      ) : (
        <div className="crpv-ws-content">
          {activeStage === "outside" ? renderOutsideTab() : renderOrgTab()}
        </div>
      )}
    </section>
  );
}
