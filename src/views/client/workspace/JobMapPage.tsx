// Job Map body (comp port 2a — P:159-204, fr tokens). Reads (cited in the port-2a report):
//   steps        job_steps of the chosen set — useJobSteps + useChosenSetKey (via useViewedSet)
//   needs        odi_needs scoped to the set's journey_key — useOdiNeeds(companyId, 0, viewedKey)
//   hypothesis   odi_market_definitions.job_executor for the set — useOdiNeeds keys the definition by
//                (company_id, journey_key) when a focus key is passed (useOdiNeeds.ts:105-110)
//   posture      "Under pressure" — JobMapOrgPanel.stepPosture: evidence_status evidenced|unclear + has_gap
//   band label   serviceVerdictWord(need) ?? needBestGuessBandLabel(need) — JobMapOrgPanel:1341
//   "N High"     needBestGuessBand(need) === "High" — the same band the label carries
//   conditions   job_steps.conditions_json through the shared b-i gate (InternalConditions)
// Stage changes ask the shell for a directional remount (fwd when the index grows, back otherwise).
import { useCompany } from "@/hooks/useCompany";
import { useOdiNeeds, type OdiNeedRow } from "@/hooks/useOdiNeeds";
import type { JobStepRow } from "@/hooks/useJobSteps";
import { DEFAULT_SEED_NOTE } from "@/lib/chosenJobStepSet";
import { checkpointForStepNumber } from "@/lib/jtbdProcess";
import { needBestGuessBand, needBestGuessBandLabel, serviceVerdictWord } from "@/lib/surveyVerdict";
import { ON_STRATEGY_LABEL } from "@/components/strategy/OnStrategyPin";
import { Chip, Eyebrow } from "@/views/client/firstReadPreview/primitives";
import { withStop } from "@/views/client/firstReadPreview/primitives-editorial";
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

/** JobMapOrgPanel:1341 — the verdict word when survey-validated, else the best-guess band label. */
function bandLabel(need: OdiNeedRow): string {
  return serviceVerdictWord(need) ?? needBestGuessBandLabel(need);
}

const pad = (n: number) => String(n).padStart(2, "0");

export default function JobMapPage() {
  const { activeCompany } = useCompany();
  const set = useViewedSet(activeCompany?.id);
  const { needs, marketDefinition, loading: needsLoading } = useOdiNeeds(activeCompany?.id, 0, set.viewedKey ?? undefined);
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

  return (
    <WorkspaceWorkingPage eyebrow={pageLabel("job-map")} title={WORKSPACE_STRINGS.titleJobMap} count={set.loading ? null : n} unit={WORKSPACE_STRINGS.unitStages}>
      {set.loading ? null : (
        <>
          <div className="fr-ws-setlead">
            {set.chosen ? <Chip tone="accent-0">{ON_STRATEGY_LABEL}</Chip> : null}
            {set.viewedTitle ? <Eyebrow>{set.viewedTitle}</Eyebrow> : null}
            {!set.chosen && set.viewedKey ? <span className="fr-tag fr-mono" data-fr-seed-note>{DEFAULT_SEED_NOTE}</span> : null}
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
            <div className="fr-ws-jobmap" data-fr-region="stages">
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
                    {isUnderPressure(step) ? <Chip tone="warn">{WORKSPACE_STRINGS.underPressure}</Chip> : null}
                  </header>

                  <div className="fr-ws-opps" data-fr-block="opportunities">
                    <div className="fr-ws-opps-head fr-mono">
                      <span>{WORKSPACE_STRINGS.mappedOpportunities}</span>
                      {highNeeds.length > 0 ? <span data-testid="jobmap-high-count">{highNeeds.length} {needBestGuessBand(highNeeds[0])}</span> : null}
                    </div>
                    {needsLoading ? null : stepNeeds.length === 0 ? (
                      <WorkspaceAbsent what="opportunities" />
                    ) : (
                      <ol className="fr-ws-opps-list">
                        {stepNeeds.map((x, i) => (
                          <li key={x.id} className="fr-ws-opp">
                            <span className="fr-ws-opp-num fr-mono">{pad(i + 1)}</span>
                            <span className="fr-ws-opp-text">{x.desired_outcome}</span>
                            <span className="fr-ws-opp-band fr-mono">{bandLabel(x)}</span>
                          </li>
                        ))}
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
