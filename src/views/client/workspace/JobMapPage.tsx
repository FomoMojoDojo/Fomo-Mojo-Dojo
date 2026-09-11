// Job Map (Working frame): the ODI job steps of the viewed set, one step per stage. The chosen set is
// useChosenSetKey (via useViewedSet); a seeded view always carries DEFAULT_SEED_NOTE and never the
// "On strategy" chip. Prev/next stage ask the shell for a directional remount of the keyed wrapper
// (data-fr-stage fwd|back). Brief 2 replaces the arrow stage nav with the comp's stage list.
//
// Conditions: JobMapOrgPanel's InternalConditions is the SOLE sanctioned render path for step
// conditions (the b-i honesty gate) and it is not exported — the block renders as Absent until then.
import { useCompany } from "@/hooks/useCompany";
import { useOdiNeeds } from "@/hooks/useOdiNeeds";
import { DEFAULT_SEED_NOTE } from "@/lib/chosenJobStepSet";
import { ON_STRATEGY_LABEL } from "@/components/strategy/OnStrategyPin";
import { Chip, Eyebrow, TwoWeightHeadline } from "@/views/client/firstReadPreview/primitives";
import { HangingItem } from "@/views/client/firstReadPreview/primitives-editorial";
import { WorkspaceAbsent } from "./absent";
import { useViewedSet } from "./viewedSet";
import { useWorkspaceStage } from "./workspaceContext";
import { WorkspaceWorkingPage } from "./WorkspaceWorkingPage";
import { WORKSPACE_STRINGS, pageLabel } from "./workspaceNav";

export default function JobMapPage() {
  const { activeCompany } = useCompany();
  const set = useViewedSet(activeCompany?.id);
  const { needs, loading: needsLoading } = useOdiNeeds(activeCompany?.id, 0, set.viewedKey ?? undefined);
  const stage = useWorkspaceStage();
  const n = set.viewedSteps.length;
  const index = Math.min(Math.max(parseInt(stage?.stageKey || "0", 10) || 0, 0), Math.max(n - 1, 0));
  const step = set.viewedSteps[index] ?? null;
  const go = (dir: "prev" | "next") => {
    if (!stage || n === 0) return;
    const nextIndex = dir === "next" ? (index + 1) % n : (index + n - 1) % n;
    stage.setStage(dir === "next" ? "fwd" : "back", String(nextIndex));
  };
  const stepNeeds = step
    ? needs.filter((x) => x.step_number === step.step_number).sort((a, b) => (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0))
    : [];

  const setLead = (
    <div className="flex flex-wrap items-center gap-4">
      {set.chosen ? <Chip tone="accent-0">{ON_STRATEGY_LABEL}</Chip> : null}
      {set.viewedTitle ? <Eyebrow>{set.viewedTitle}</Eyebrow> : null}
      {!set.chosen && set.viewedKey ? <span className="fr-tag fr-mono" data-fr-seed-note>{DEFAULT_SEED_NOTE}</span> : null}
    </div>
  );

  return (
    <WorkspaceWorkingPage eyebrow={pageLabel("job-map")} title={WORKSPACE_STRINGS.titleJobMap} count={set.loading ? null : n} unit={WORKSPACE_STRINGS.unitStages}>
      {set.loading ? null : !step ? (
        <>
          {setLead}
          <div className="mt-8"><WorkspaceAbsent what="job-steps" /></div>
        </>
      ) : (
        <div className="fr-stagger" data-testid="jobmap-stage" data-fr-step={step.step_number ?? undefined}>
          {n > 1 ? (
            <div className="fr-jobmap-stage-nav mb-6" data-testid="jobmap-stage-nav">
              <button type="button" className="fr-ws-arrow fr-mono" onClick={() => go("prev")} aria-label={WORKSPACE_STRINGS.previous} data-fr-stage-nav="prev">
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false"><path d="M9 2 L4 7 L9 12" fill="none" stroke="currentColor" strokeWidth="1.25" /></svg>
              </button>
              <span className="fr-tag fr-mono" aria-hidden="true">{String(index + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}</span>
              <button type="button" className="fr-ws-arrow fr-mono" onClick={() => go("next")} aria-label={WORKSPACE_STRINGS.next} data-fr-stage-nav="next">
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false"><path d="M5 2 L10 7 L5 12" fill="none" stroke="currentColor" strokeWidth="1.25" /></svg>
              </button>
            </div>
          ) : null}
          <header>
            {setLead}
            <div className="mt-6">
              <TwoWeightHeadline lead={String(step.step_number ?? index + 1).padStart(2, "0")} bold={step.step_label ?? ""} />
            </div>
            {step.description ? <p className="fr-lede mt-6">{step.description}</p> : null}
          </header>
          <div className="mt-10" data-fr-block="opportunities">
            {needsLoading ? null : stepNeeds.length === 0 ? (
              <WorkspaceAbsent what="opportunities" />
            ) : (
              <ol className="fr-hanging-list">
                {stepNeeds.map((x) => (
                  <HangingItem key={x.id} title={x.desired_outcome} />
                ))}
              </ol>
            )}
          </div>
          <div className="mt-10" data-fr-block="conditions">
            <WorkspaceAbsent what="conditions" />
          </div>
        </div>
      )}
    </WorkspaceWorkingPage>
  );
}
