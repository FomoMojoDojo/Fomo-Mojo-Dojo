// Opportunities body (comp port 2a — P:362-389, fr tokens). Reads (cited in the port-2a report):
//   rows        odi_needs.desired_outcome of the viewed set — useOdiNeeds(companyId, needsRefreshKey, viewedKey)
//   band        serviceVerdictWord(need) ?? needBestGuessBandLabel(need) — the Job Map's computation
//   High value  needBestGuessBand(need) === "High" (surveyVerdict: opportunity_score ≥ 10, or the
//               declared-confidence ladder) — the existing band, not a new threshold
//   Status      omitted: no signed validation_state vocabulary renders on any client-refine surface
//   documents   omitted: "N internal documents" has no read path
// Filter + search are view state; selection defaults to the first visible row.
//
// Tier 1 controls (2026-09-12) — in the aside of the selected row, every one operator-gated
// (OperatorControlsContext) AND capability-gated exactly as the Workshop Opportunities tab, through the
// SAME hooks / moved components the tab uses (no new write path):
//   Human | Canonical   view state (the tab's titleMode)
//   Suggest an edit     SuggestEditLane (moved from NeedsOrgPanel) → handleAuthorOpportunityProposal — participation.suggest
//   Apply / Dismiss     OpportunityProposalSection (moved) → handleAccept/RejectOpportunityProposal — governance.proposal.apply / .reject
//   Propose changes     ProposeChangesButton → handleGenerateOpportunityProposal — structure.opportunity.generate
//                       (disabled without a drift row, as on the tab)
//   Check for drift     useDriftScan.checkSurfaceGated (moved from the workshop view) — governance.drift.scan
//   Drift badge         DriftBadge → DriftDetailPanel (Accept as aligned — governance.drift.review, ruling 1)
// Refresh: the tab's needsRefreshKey (useOdiNeeds re-read) and the handlers hook's own proposal key;
// driftBadgeRefreshKey bumps the badge reads after an assessment.
import { useCallback, useMemo, useState } from "react";
import { useCapability } from "@/hooks/useCapability";
import { useCompany } from "@/hooks/useCompany";
import { useDriftScan } from "@/hooks/useDriftScan";
import { useOdiNeeds, type OdiNeedRow } from "@/hooks/useOdiNeeds";
import { useOpportunityProposalHandlers } from "@/hooks/useOpportunityProposalHandlers";
import { DEFAULT_SEED_NOTE } from "@/lib/chosenJobStepSet";
import { compareNeedsByValue, needBestGuessBand, needBestGuessBandLabel, serviceVerdictWord } from "@/lib/surveyVerdict";
import DriftBadge from "@/components/drift/DriftBadge";
import DriftDetailPanel from "@/components/drift/DriftDetailPanel";
import ProposeChangesButton from "@/components/drift/ProposeChangesButton";
import { OpportunityProposalSection, SuggestEditLane } from "@/views/client/workshop/opportunitiesShared";
import { useOperatorControls } from "@/views/client/firstReadPreview/operatorControls";
import { OPERATOR_MARK } from "@/views/client/firstReadPreview/operatorStrings";
import { WorkspaceAbsent } from "./absent";
import { useViewedSet } from "./viewedSet";
import { WorkspaceWorkingPage } from "./WorkspaceWorkingPage";
import { WORKSPACE_STRINGS, pageLabel } from "./workspaceNav";

function bandLabel(need: OdiNeedRow): string {
  return serviceVerdictWord(need) ?? needBestGuessBandLabel(need);
}
const pad = (n: number) => String(n).padStart(2, "0");
const mark = (v: string) => ({ [OPERATOR_MARK.attr]: v });

export default function OpportunitiesPage() {
  const { activeCompany } = useCompany();
  const companyId = activeCompany?.id;
  const set = useViewedSet(companyId);
  // The tab's needsRefreshKey: bumped by the handlers after an accepted proposal (useOdiNeeds re-reads).
  const [needsRefreshKey, setNeedsRefreshKey] = useState(0);
  const bumpNeeds = useCallback(() => setNeedsRefreshKey((k) => k + 1), []);
  const { needs, loading } = useOdiNeeds(companyId, needsRefreshKey, set.viewedKey ?? undefined);
  const operator = useOperatorControls();
  const gated = Boolean(operator);
  // Governance split (checkpoint 3a/3b) — the tab's gates, same capability keys.
  const canApply = useCapability("governance.proposal.apply", companyId);
  const canReject = useCapability("governance.proposal.reject", companyId);
  const canSuggest = useCapability("participation.suggest", companyId);
  const canGenerate = useCapability("structure.opportunity.generate", companyId);
  const canScan = useCapability("governance.drift.scan", companyId);
  const {
    opportunityProposalsMap,
    generateLoadingOpportunityId,
    acceptLoadingOpportunityProposalId,
    rejectLoadingOpportunityProposalId,
    handleGenerateOpportunityProposal,
    handleAuthorOpportunityProposal,
    handleAcceptOpportunityProposal,
    handleRejectOpportunityProposal,
  } = useOpportunityProposalHandlers(companyId, bumpNeeds);
  const [driftBadgeRefreshKey, setDriftBadgeRefreshKey] = useState(0);
  const onDriftAssessed = useCallback(() => setDriftBadgeRefreshKey((k) => k + 1), []);
  const { checkingSurfaceId, checkSurfaceGated } = useDriftScan(companyId, { canScan, onAssessed: onDriftAssessed });
  const [driftPanelId, setDriftPanelId] = useState<string | null>(null);

  const [filter, setFilter] = useState<"all" | "high">("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [titleMode, setTitleMode] = useState<"human" | "canonical">("human");
  const [authoringNeedId, setAuthoringNeedId] = useState<string | null>(null);

  const ranked = useMemo(() => [...needs].sort(compareNeedsByValue), [needs]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ranked.filter((x) => (filter === "all" || needBestGuessBand(x) === "High") && (!q || x.desired_outcome.toLowerCase().includes(q)));
  }, [filter, query, ranked]);
  const selected = visible.find((x) => x.id === selectedId) ?? visible[0] ?? null;
  const busy = set.loading || loading;
  const textOf = (x: OdiNeedRow) => (titleMode === "canonical" ? (x.odi_canonical_statement ?? x.desired_outcome) : x.desired_outcome);
  const pendingProposal = selected ? opportunityProposalsMap.get(selected.id) ?? null : null;
  const selectedDeclared = selected?.provenance_type === "internal_declared";

  return (
    <WorkspaceWorkingPage eyebrow={pageLabel("opportunities")} title={WORKSPACE_STRINGS.titleOpportunities} count={busy ? null : ranked.length} unit={WORKSPACE_STRINGS.unitMapped}>
      {busy ? null : (
        <>
          {!set.chosen && set.viewedKey ? <p className="fr-tag fr-mono fr-ws-setlead" data-fr-seed-note>{DEFAULT_SEED_NOTE}</p> : null}
          {ranked.length === 0 ? (
            <WorkspaceAbsent what="opportunities" />
          ) : (
            <>
              <div className="fr-ws-filterrow" data-testid="opps-filters" data-fr-region="filters">
                <div className="fr-ws-filters">
                  <button type="button" className="fr-ws-filter fr-mono" data-active={filter === "all" ? "true" : undefined} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>{WORKSPACE_STRINGS.filterAll}</button>
                  <button type="button" className="fr-ws-filter fr-mono" data-active={filter === "high" ? "true" : undefined} aria-pressed={filter === "high"} onClick={() => setFilter("high")}>{WORKSPACE_STRINGS.filterHighValue}</button>
                </div>
                {gated ? (
                  <div className="fr-ws-filters fr-ws-titlemode" {...mark("title-mode")} data-testid="opps-title-mode">
                    <button type="button" className="fr-ws-filter fr-mono" data-active={titleMode === "human" ? "true" : undefined} aria-pressed={titleMode === "human"} onClick={() => setTitleMode("human")}>{WORKSPACE_STRINGS.human}</button>
                    <button type="button" className="fr-ws-filter fr-mono" data-active={titleMode === "canonical" ? "true" : undefined} aria-pressed={titleMode === "canonical"} onClick={() => setTitleMode("canonical")}>{WORKSPACE_STRINGS.canonical}</button>
                  </div>
                ) : null}
                <label className="fr-ws-search fr-mono">
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><circle cx="5" cy="5" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.25" /><path d="M7.5 7.5 L11 11" stroke="currentColor" strokeWidth="1.25" /></svg>
                  <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label={WORKSPACE_STRINGS.searchOpportunities} placeholder={WORKSPACE_STRINGS.searchOpportunities} data-testid="opps-search" />
                </label>
              </div>
              <div className="fr-ws-oppgrid">
                <section className="fr-ws-opplist" data-testid="opps-list" data-fr-region="list">
                  {visible.length === 0 ? <WorkspaceAbsent what="opportunities-filtered" /> : visible.map((x) => {
                    const active = selected?.id === x.id;
                    const rank = ranked.indexOf(x);
                    return (
                      <button key={x.id} type="button" className="fr-ws-opprow" data-active={active ? "true" : undefined} aria-pressed={active} onClick={() => setSelectedId(x.id)} data-testid="opps-row" data-fr-need-id={x.id} data-fr-provenance={x.provenance_type ?? undefined}>
                        <span className="fr-ws-opprow-num fr-mono">{pad(rank + 1)}</span>
                        <span className="fr-ws-opprow-text">{textOf(x)}</span>
                        <span className="fr-ws-opprow-band fr-mono">{bandLabel(x)}</span>
                      </button>
                    );
                  })}
                </section>
                {selected ? (
                  <aside className="fr-ws-oppaside" data-testid="opps-aside" data-fr-region="aside" data-fr-need-id={selected.id}>
                    <p className="fr-ws-band-eyebrow fr-mono">{WORKSPACE_STRINGS.selectedOpportunity}</p>
                    <p className="fr-ws-oppaside-title" data-testid="opps-aside-title">{textOf(selected)}</p>
                    <dl className="fr-ws-oppaside-facts">
                      <div><dt className="fr-mono">{WORKSPACE_STRINGS.potential}</dt><dd>{bandLabel(selected)}</dd></div>
                    </dl>
                    {gated ? (
                      <div className="fr-ws-oppactions" data-testid="opps-actions" data-fr-region="actions">
                        <div className="fr-ws-oppactions-row">
                          <button
                            type="button"
                            className="fr-ws-control fr-mono"
                            disabled={checkingSurfaceId === selected.id || !canScan}
                            onClick={() => checkSurfaceGated("opportunity", selected.id)}
                            {...mark("check-drift")}
                            data-testid="opps-check-drift"
                          >
                            {checkingSurfaceId === selected.id ? WORKSPACE_STRINGS.working : WORKSPACE_STRINGS.checkForDrift}
                          </button>
                          <span {...mark("drift-badge")} data-testid="opps-drift-badge">
                            <DriftBadge
                              surfaceType="opportunity"
                              surfaceId={selected.id}
                              phase={activeCompany?.engagement_phase}
                              refreshKey={driftBadgeRefreshKey}
                              onClick={(a) => setDriftPanelId(a.surface_id)}
                            />
                          </span>
                        </div>
                        {/* Agent "Propose changes" is hidden for declared — that lane is subject-gated to
                            not-applicable; declared uses the human edit lane below (the tab's split). */}
                        {!selectedDeclared ? (
                          <div {...mark("propose-changes")} data-testid="opps-propose-changes">
                            <ProposeChangesButton
                              surfaceType="opportunity"
                              surfaceId={selected.id}
                              onGenerate={() => handleGenerateOpportunityProposal(selected.id)}
                              canGenerate={canGenerate}
                              generateLoading={generateLoadingOpportunityId === selected.id}
                              hasPendingProposal={!!pendingProposal}
                              variant="link"
                              refreshKey={driftBadgeRefreshKey}
                            />
                          </div>
                        ) : null}
                        {selectedDeclared && !pendingProposal ? (
                          <div {...mark("suggest-edit")} data-testid="opps-suggest-edit">
                            <SuggestEditLane
                              need={selected}
                              open={authoringNeedId === selected.id}
                              canSuggest={canSuggest}
                              onOpen={() => setAuthoringNeedId(selected.id)}
                              onClose={() => setAuthoringNeedId(null)}
                              onAuthorProposal={handleAuthorOpportunityProposal}
                            />
                          </div>
                        ) : null}
                        {pendingProposal ? (
                          <div {...mark("review-proposal")} data-testid="opps-review-proposal">
                            <OpportunityProposalSection
                              canApply={canApply}
                              canReject={canReject}
                              proposal={pendingProposal}
                              onAcceptProposal={(propId, accepted, skipped) => handleAcceptOpportunityProposal(propId, selected.id, accepted, skipped)}
                              onRejectProposal={handleRejectOpportunityProposal}
                              acceptLoading={acceptLoadingOpportunityProposalId === pendingProposal.id}
                              rejectLoading={rejectLoadingOpportunityProposalId === pendingProposal.id}
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {operator ? (
                      // Operator-only: no client-refine surface carries a "create route from a need" handler
                      // (the string exists only in lib), so the control is present but inert.
                      <button type="button" className="fr-ws-control fr-mono" disabled aria-disabled="true" {...mark("create-route")}>
                        {WORKSPACE_STRINGS.createRoute}
                      </button>
                    ) : null}
                  </aside>
                ) : null}
              </div>
            </>
          )}
        </>
      )}
      {gated && driftPanelId ? (
        <DriftDetailPanel
          open
          onClose={() => setDriftPanelId(null)}
          surfaceType="opportunity"
          surfaceId={driftPanelId}
          refreshKey={driftBadgeRefreshKey}
          onRefresh={onDriftAssessed}
          onProposeChanges={
            ranked.find((x) => x.id === driftPanelId)?.provenance_type !== "internal_declared"
              ? () => handleGenerateOpportunityProposal(driftPanelId)
              : undefined
          }
        />
      ) : null}
    </WorkspaceWorkingPage>
  );
}
