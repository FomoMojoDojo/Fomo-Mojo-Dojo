// Opportunities (Working frame): odi_needs of the viewed set via useOdiNeeds, highest opportunity
// score first. The viewed set follows the same chosen/seeded law as the Job Map. Body: brief 2.
import { useCompany } from "@/hooks/useCompany";
import { useOdiNeeds } from "@/hooks/useOdiNeeds";
import { DEFAULT_SEED_NOTE } from "@/lib/chosenJobStepSet";
import { HangingItem } from "@/views/client/firstReadPreview/primitives-editorial";
import { WorkspaceAbsent } from "./absent";
import { useViewedSet } from "./viewedSet";
import { WorkspaceWorkingPage } from "./WorkspaceWorkingPage";
import { WORKSPACE_STRINGS, pageLabel } from "./workspaceNav";

export default function OpportunitiesPage() {
  const { activeCompany } = useCompany();
  const set = useViewedSet(activeCompany?.id);
  const { needs, loading } = useOdiNeeds(activeCompany?.id, 0, set.viewedKey ?? undefined);
  const sorted = [...needs].sort((a, b) => (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0));
  const busy = set.loading || loading;
  return (
    <WorkspaceWorkingPage eyebrow={pageLabel("opportunities")} title={WORKSPACE_STRINGS.titleOpportunities} count={busy ? null : sorted.length} unit={WORKSPACE_STRINGS.unitMapped}>
      {busy ? null : (
        <>
          {!set.chosen && set.viewedKey ? <p className="fr-tag fr-mono mb-6" data-fr-seed-note>{DEFAULT_SEED_NOTE}</p> : null}
          {sorted.length === 0 ? (
            <WorkspaceAbsent what="opportunities" />
          ) : (
            <ol className="fr-hanging-list fr-stagger">
              {sorted.map((x) => (
                <HangingItem key={x.id} title={x.desired_outcome} muted={x.service_state === "overserved"}>
                  <span data-fr-tier={x.tier} data-fr-service={x.service_state} aria-hidden="true" />
                </HangingItem>
              ))}
            </ol>
          )}
        </>
      )}
    </WorkspaceWorkingPage>
  );
}
