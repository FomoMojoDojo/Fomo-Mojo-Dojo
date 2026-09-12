// Job Map body (comp port 2a — P:159-204, fr tokens). Reads (cited in the port-2a report):
//   steps        job_steps of the viewed set — useJobSteps + useChosenSetKey (via useViewedSet)
//   needs        odi_needs scoped to the set's journey_key — useOdiNeeds(companyId, refresh, viewedKey)
//   hypothesis   odi_market_definitions.job_executor for the set — useOdiNeeds keys the definition by
//                (company_id, journey_key) when a focus key is passed (useOdiNeeds.ts:105-110)
//   posture      "Under pressure" — JobMapOrgPanel.stepPosture: evidence_status evidenced|unclear + has_gap
//   band label   serviceVerdictWord(need) ?? needBestGuessBandLabel(need) — JobMapOrgPanel
//   "N High"     needBestGuessBand(need) === "High" — the same band the label carries
//   conditions   job_steps.conditions_json through the shared b-i gate (InternalConditions)
// Stage changes ask the shell for a directional remount (fwd when the index grows, back otherwise).
//
// Tier 1 controls (2026-09-11) — every one behind the operator switch (OperatorControlsContext), with the
// old surface's own gate on top (none of these five carries a capability beyond the admin route; the
// conditions run is frozen-gated as in the workshop), and every write through the SAME lifted function /
// hook the old surface now calls (no new path — Option B holds):
//   Switcher        view another set — useViewedSet(companyId, viewKey); the view only, never the choice
//   Choose          useChooseJobStepSet ← OnStrategyPin.pinFocused (operator_primary_selection upsert + audit);
//                   the old answer is cleared and the chip follows the re-read (useChosenSetKey), never local state
//   Regenerate      useConditionsGeneration ← ClientRefinePreviewWorkshopView.runConditionsGeneration
//                   (generate-step-conditions with { company_id, journey_key } only); steps re-read after
//   Show evidence   EvidenceDrawer (moved to workshop/jobMapShared) on the stage panel
//   Mark reviewed   markNeedReviewed ← JobMapOrgPanel.handleMarkNeedReviewed (odi_needs update); the row
//                   reflects the re-read of needs, not a local flag
import { useState } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useChooseJobStepSet } from "@/hooks/useChooseJobStepSet";
import { setHasConditions, useConditionsGeneration } from "@/hooks/useConditionsGeneration";
import { markNeedReviewed, useOdiNeeds, type OdiNeedRow } from "@/hooks/useOdiNeeds";
import type { JobStepRow } from "@/hooks/useJobSteps";
import { DEFAULT_SEED_NOTE } from "@/lib/chosenJobStepSet";
import { isFrozenCompany } from "@/lib/frozenCompanies";
import { checkpointForStepNumber } from "@/lib/jtbdProcess";
import { needBestGuessBand, needBestGuessBandLabel, serviceVerdictWord } from "@/lib/surveyVerdict";
import { ON_STRATEGY_LABEL } from "@/components/strategy/OnStrategyPin";
import { Chip, Eyebrow } from "@/views/client/firstReadPreview/primitives";
import { withStop } from "@/views/client/firstReadPreview/primitives-editorial";
import { useOperatorControls } from "@/views/client/firstReadPreview/operatorControls";
import { OPERATOR_MARK } from "@/views/client/firstReadPreview/operatorStrings";
import { EvidenceDrawer, NEEDS_REVIEW_STATES } from "@/views/client/workshop/jobMapShared";
import { InternalConditions, admissibleStepConditions } from "@/views/client/workshop/tabs/internalConditions";
import { WorkspaceAbsent } from "./absent";
import { useViewedSet } from "./viewedSet";
import { useWorkspaceStage } from "./workspaceContext";
import { WorkspaceWorkingPage } from "./WorkspaceWorkingPage";
import { WORKSPACE_STRINGS, pageLabel } from "./workspaceNav";

/** JobMapOrgPanel.stepPosture, the two branches that read "Under pressure". */
function isUnderPressure(step: JobStepRow): boolean {
  const ev = step.evidence_status ?? "";
  return Boolean(step.has_gap) && (ev === "evidenced" || ev === "unclear");
}

/** JobMapOrgPanel — the verdict word when survey-validated, else the best-guess band label. */
function bandLabel(need: OdiNeedRow): string {
  return serviceVerdictWord(need) ?? needBestGuessBandLabel(need);
}

const pad = (n: number) => String(n).padStart(2, "0");
const mark = (v: string) => ({ [OPERATOR_MARK.attr]: v });

export default function JobMapPage() {
  const { activeCompany } = useCompany();
  const companyId = activeCompany?.id;
  const operator = useOperatorControls();
  const gated = Boolean(operator);
  // The view only — a switch never touches the choice. Reset with the company (keyed by the shell's remount).
  const [viewKey, setViewKey] = useState<string | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(0);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const set = useViewedSet(companyId, viewKey);
  const { needs, marketDefinition, loading: needsLoading } = useOdiNeeds(companyId, needsRefresh, set.viewedKey ?? undefined);
  const { choose, choosing } = useChooseJobStepSet(companyId);
  const conditionsRun = useConditionsGeneration({ companyId, setKey: set.viewedKey, steps: set.viewedSteps, refetch: set.refetchSteps });
  const stage = useWorkspaceStage();
  const steps = set.viewedSteps;
  const n = steps.length;
  const index = Math.min(Math.max(parseInt(stage?.stageKey || "0", 10) || 0, 0), Math.max(n - 1, 0));
  const step = steps[index] ?? null;
  const select = (i: number) => {
    if (!stage || i === index) return;
    stage.setStage(i > index ? "fwd" : "back", String(i));
  };
  const stepNeeds = step ? needs.filter((x) => x.step_number === step.step_number) : [];
  // The high-band rows and the band word they carry (the word comes from the row, never a literal).
  const highNeeds = stepNeeds.filter((x) => needBestGuessBand(x) === "High");
  const conditions = step && Array.isArray(step.conditions_json) ? admissibleStepConditions(step.conditions_json) : [];
  const hypothesis = marketDefinition?.job_executor?.trim() || null;
  const canRegenerate = gated && Boolean(set.viewedKey) && !isFrozenCompany(companyId);

  const viewSet = (key: string) => {
    setSwitcherOpen(false);
    if (key === set.viewedKey) return;
    setViewKey(key);
    setEvidenceOpen(false);
    if (stage && index !== 0) stage.setStage("back", "0");
  };
  const chooseViewed = async () => {
    if (!set.viewedKey || choosing) return;
    if (await choose(set.viewedKey)) set.invalidateChosen(); // nothing is chosen until the read confirms the new key
  };
  const review = async (need: OdiNeedRow) => {
    if (reviewingId) return;
    setReviewingId(need.id);
    try { await markNeedReviewed(need.id); setNeedsRefresh((k) => k + 1); } finally { setReviewingId(null); }
  };

  return (
    <WorkspaceWorkingPage eyebrow={pageLabel("job-map")} title={WORKSPACE_STRINGS.titleJobMap} count={set.loading ? null : n} unit={WORKSPACE_STRINGS.unitStages}>
      {set.loading ? null : (
        <>
          <div className="fr-ws-setlead">
            {set.chosen ? <Chip tone="accent-0">{ON_STRATEGY_LABEL}</Chip> : null}
            {set.viewedTitle ? <Eyebrow>{set.viewedTitle}</Eyebrow> : null}
            {!set.chosen && set.viewedKey ? <span className="fr-tag fr-mono" data-fr-seed-note>{DEFAULT_SEED_NOTE}</span> : null}
            {gated && set.sets.length > 1 ? (
              <div className="fr-ws-switcher" {...mark("switcher")} data-testid="jobmap-switcher">
                <button type="button" className="fr-ws-control fr-mono" aria-haspopup="listbox" aria-expanded={switcherOpen} onClick={() => setSwitcherOpen((v) => !v)} data-testid="jobmap-switcher-open">
                  {WORKSPACE_STRINGS.showAllMarkets}
                </button>
                {switcherOpen ? (
                  <div role="listbox" aria-label={WORKSPACE_STRINGS.switchMarketViewingOnly} className="fr-ws-switcher-list" data-testid="jobmap-switcher-list">
                    <p className="fr-ws-switcher-note fr-mono">{WORKSPACE_STRINGS.switchMarketViewingOnly}</p>
                    {set.sets.map((s) => (
                      <button key={s.key} type="button" role="option" aria-selected={s.key === set.viewedKey} className="fr-ws-switcher-option" data-fr-set-key={s.key} data-testid="jobmap-switcher-option" onClick={() => viewSet(s.key)}>
                        {s.title ?? s.key}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {gated && set.viewedKey && !set.chosen ? (
              <button type="button" className="fr-ws-control fr-mono" disabled={choosing} onClick={() => { void chooseViewed(); }} {...mark("choose")} data-testid="jobmap-choose">
                {choosing ? WORKSPACE_STRINGS.working : WORKSPACE_STRINGS.chooseSet}
              </button>
            ) : null}
            {canRegenerate ? (
              <button type="button" className="fr-ws-control fr-mono" disabled={conditionsRun.running} onClick={() => { void conditionsRun.run(); }} {...mark("regenerate-conditions")} data-testid="jobmap-regenerate">
                {conditionsRun.running ? WORKSPACE_STRINGS.working : setHasConditions(steps) ? WORKSPACE_STRINGS.regenerateConditions : WORKSPACE_STRINGS.generateConditions}
              </button>
            ) : null}
          </div>

          {hypothesis ? (
            <div className="fr-ws-accent" data-fr-tone="periwinkle" data-testid="jobmap-hypothesis" data-fr-region="hypothesis">
              <p className="fr-ws-band-eyebrow fr-mono">{WORKSPACE_STRINGS.marketHypothesis}</p>
              <p className="fr-ws-band-text">{hypothesis}</p>
            </div>
          ) : null}

          {n === 0 ? (
            <WorkspaceAbsent what="job-steps" />
          ) : (
            <div className="fr-ws-jobmap" data-fr-region="stages" data-fr-set-key={set.viewedKey ?? undefined}>
              <nav aria-label={WORKSPACE_STRINGS.jobStages} className="fr-ws-stagenav" data-testid="jobmap-stage-nav">
                {steps.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    className="fr-ws-stagebtn fr-mono"
                    data-active={i === index ? "true" : undefined}
                    aria-current={i === index ? "step" : undefined}
                    data-fr-stage-nav={i > index ? "next" : i < index ? "prev" : "current"}
                    data-fr-stage-index={i}
                    onClick={() => select(i)}
                  >
                    <span className="fr-ws-stagebtn-num">{pad(i + 1)}</span>
                    <span className="fr-ws-stagebtn-word">{checkpointForStepNumber(s.step_number ?? i + 1).key}</span>
                  </button>
                ))}
              </nav>
              {step ? (
                <section className="fr-ws-stage fr-stagger" data-testid="jobmap-stage" data-fr-step={step.step_number ?? undefined}>
                  <header className="fr-ws-stage-head">
                    <div>
                      <p className="fr-ws-sectionlabel fr-mono">
                        <span className="fr-ws-sectionlabel-num">{pad(index + 1)}</span>
                        <span className="fr-ws-sectionlabel-slash">/</span>
                        <span className="fr-ws-stagebtn-word">{checkpointForStepNumber(step.step_number ?? index + 1).key}</span>
                      </p>
                      <h2 className="fr-display fr-ws-stage-title">{withStop(step.step_label || checkpointForStepNumber(step.step_number ?? index + 1).canonicalLabel)}</h2>
                      {step.description ? <p className="fr-ws-stage-desc">{step.description}</p> : null}
                    </div>
                    <div className="fr-ws-stage-aside">
                      {isUnderPressure(step) ? <Chip tone="warn">{WORKSPACE_STRINGS.underPressure}</Chip> : null}
                      {gated ? (
                        <button type="button" className="fr-ws-control fr-mono" aria-expanded={evidenceOpen} onClick={() => setEvidenceOpen((v) => !v)} {...mark("evidence")} data-testid="jobmap-evidence-toggle">
                          {evidenceOpen ? WORKSPACE_STRINGS.hideEvidence : WORKSPACE_STRINGS.showEvidence}
                        </button>
                      ) : null}
                    </div>
                  </header>
                  {gated && evidenceOpen ? (
                    <div className="fr-ws-evidence" {...mark("evidence-drawer")} data-testid="jobmap-evidence">
                      <EvidenceDrawer step={step} />
                    </div>
                  ) : null}

                  <div className="fr-ws-opps" data-fr-block="opportunities">
                    <div className="fr-ws-opps-head fr-mono">
                      <span>{WORKSPACE_STRINGS.mappedOpportunities}</span>
                      {highNeeds.length > 0 ? <span data-testid="jobmap-high-count">{highNeeds.length} {needBestGuessBand(highNeeds[0])}</span> : null}
                    </div>
                    {needsLoading ? null : stepNeeds.length === 0 ? (
                      <WorkspaceAbsent what="opportunities" />
                    ) : (
                      <ol className="fr-ws-opps-list">
                        {stepNeeds.map((x, i) => {
                          const pending = gated && NEEDS_REVIEW_STATES.has(x.dependency_state ?? "");
                          return (
                            <li key={x.id} className="fr-ws-opp" data-fr-need-id={x.id} data-fr-review={pending ? "pending" : undefined}>
                              <span className="fr-ws-opp-num fr-mono">{pad(i + 1)}</span>
                              <span className="fr-ws-opp-text">
                                {x.desired_outcome}
                                {pending ? (
                                  <span className="fr-ws-opp-review" {...mark("review")}>
                                    <span className="fr-tag fr-mono">{WORKSPACE_STRINGS.reviewPending}</span>
                                    <button type="button" className="fr-ws-control fr-mono" disabled={reviewingId === x.id} onClick={() => { void review(x); }} data-testid="jobmap-mark-reviewed">
                                      {reviewingId === x.id ? WORKSPACE_STRINGS.working : WORKSPACE_STRINGS.markReviewed}
                                    </button>
                                  </span>
                                ) : null}
                              </span>
                              <span className="fr-ws-opp-band fr-mono">{bandLabel(x)}</span>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </div>

                  {conditions.length > 0 ? (
                    <div className="fr-ws-accent fr-ws-conditions" data-fr-tone="electric" data-fr-block="conditions" data-fr-count={conditions.length}>
                      <InternalConditions entries={step.conditions_json ?? []} />
                    </div>
                  ) : null}
                </section>
              ) : null}
            </div>
          )}
        </>
      )}
    </WorkspaceWorkingPage>
  );
}
