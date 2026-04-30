import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useCompany } from "@/hooks/useCompany";
import type { Company } from "@/hooks/useCompany";
import { useClientViewData } from "@/hooks/useClientViewData";
import { usePositioningCanvas } from "@/hooks/usePositioningCanvas";
import { useStrategyCascade } from "@/hooks/useStrategyCascade";
import { useOdiNeeds } from "@/hooks/useOdiNeeds";
import { useJobSteps } from "@/hooks/useJobSteps";
import JobMapOrgPanel from "./workshop/tabs/JobMapOrgPanel";
import { usePublicBaseline } from "@/hooks/usePublicBaseline";
import { useSourceConfidence } from "@/hooks/useSourceConfidence";
import { useSignalExclusion } from "@/hooks/useSignalExclusion";
import { computeExclusionImpact, computeLatestExclusionAt } from "@/lib/evidenceImpact";
import { CLIENT_REFINE_PREVIEW_ROUTE } from "@/lib/clientRefinePreview";
import { useRoutes } from "@/views/Routes/useRoutes";
import ScoreContextBar from "@/components/score/ScoreContextBar";

import PositioningOrgPanel from "./workshop/tabs/PositioningOrgPanel";
import StrategyOrgPanel from "./workshop/tabs/StrategyOrgPanel";
import NeedsOrgPanel from "./workshop/tabs/NeedsOrgPanel";
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
  const { companies, setActiveCompanyId, loading: companiesLoading, refetch: refetchCompany } = useCompany();
  const { activeCompany, hasCompany, confidence } = useClientViewData({ actionLimit: 0 });
  const { items: routes } = useRoutes(activeCompany?.id);
  const [activeTab,   setActiveTab]   = useState<WorkshopTab>("positioning");
  const [activeStage, setActiveStage] = useState<SignalStage>("outside");
  const [showCompare, setShowCompare] = useState(false);

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
    needs,
    error: odiError,
    updateNeedScores,
  } = useOdiNeeds(companyId);

  const goToMainSite   = useCallback(() => navigate("/"), [navigate]);
  const goToRefineHome = useCallback(() => navigate(CLIENT_REFINE_PREVIEW_ROUTE), [navigate]);

  const { items: jobSteps, loading: jobStepsLoading } = useJobSteps(companyId);

  // Compare mode only makes sense on the org stage
  const compareActive = showCompare && activeStage === "org";

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
    { key: "council",     label: "Council" },
  ];

  function renderOutsideTab() {
    if (baselineLoading) return <div className="crpv-ws-placeholder cap">Loading outside signals…</div>;
    if (activeTab === "positioning") return <PositioningOutside baseline={baseline} companyId={companyId} exclusion={exclusionControls} />;
    if (activeTab === "strategy")   return <StrategyOutside baseline={baseline} companyId={companyId} />;
    if (activeTab === "jobmap")     return null;
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
      <JobMapOrgPanel steps={jobSteps} loading={jobStepsLoading} />
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
          needs={needs}
          loading={odiLoading}
          updateNeedScores={updateNeedScores}
          latestExclusionAt={latestExclusionAt}
        />
        {!odiLoading && needs.length === 0 && (
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
              : <NeedsOrgPanel needs={needs} loading={odiLoading} updateNeedScores={updateNeedScores} latestExclusionAt={latestExclusionAt} />
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
        </div>
        <div className="crpv-header-tools">
          <button type="button" className="btn ghost" onClick={goToRefineHome}>← Refine Home</button>
          <button type="button" className="btn ghost crpv-main-site-btn" onClick={goToMainSite}>← Main site</button>
        </div>
      </header>

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
        {activeStage === "org" && activeTab !== "council" && activeTab !== "jobmap" && (
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
      {activeStage === "outside" && activeTab !== "council" && (
        <EvidenceImpactBanner
          impact={exclusionImpact}
          evidenceStatus={activeCompany?.evidence_status}
          hasCompanyEvidence={sourceSignals?.hasCompanyEvidence ?? false}
          totalSignalCount={signalExclusion.excludedSet.size}
        />
      )}

      {activeTab === "council" ? (
        <div className="crpv-ws-content">
          {companyId ? (
            <WorkshopCouncilTab companyId={companyId} companyName={activeCompany?.name ?? ""} />
          ) : (
            <div className="crpv-ws-placeholder">Select a company to run the council.</div>
          )}
        </div>
      ) : activeTab === "jobmap" ? (
        <div className="crpv-ws-content">
          <JobMapOrgPanel steps={jobSteps} loading={jobStepsLoading} />
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
