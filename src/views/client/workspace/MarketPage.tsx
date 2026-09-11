// Market (Read frame): odi_market_definitions via useOdiNeeds (the spine definition) and the lens
// list via useCompanyLenses — ruling 6 of the build brief: nothing else. Statement = the job executor
// (P:275); body (brief 2 rewrites it) = the lenses as a hanging list.
import { useCompany } from "@/hooks/useCompany";
import { useOdiNeeds } from "@/hooks/useOdiNeeds";
import { useCompanyLenses } from "@/lib/lensResolution";
import { HangingItem } from "@/views/client/firstReadPreview/primitives-editorial";
import { WorkspaceAbsent } from "./absent";
import { WorkspaceReadPage } from "./WorkspaceReadPage";
import { WORKSPACE_STRINGS } from "./workspaceNav";

export default function MarketPage() {
  const { activeCompany } = useCompany();
  const { marketDefinition, loading: defLoading } = useOdiNeeds(activeCompany?.id);
  const { lenses, loading: lensLoading } = useCompanyLenses(activeCompany?.id);
  const loading = defLoading || lensLoading;
  return (
    <WorkspaceReadPage eyebrow={WORKSPACE_STRINGS.yourMarket} statement={marketDefinition?.job_executor || null}>
      {loading ? null : lenses.length === 0 ? (
        <div className="mt-14"><WorkspaceAbsent what="market" /></div>
      ) : (
        <ol className="fr-hanging-list fr-stagger mt-14">
          {lenses.map((l) => (
            <HangingItem key={l.id} title={l.title || undefined} muted={l.portfolio_state !== "active"}>
              <span data-fr-portfolio-role={l.portfolio_role} data-fr-portfolio-state={l.portfolio_state} aria-hidden="true" />
            </HangingItem>
          ))}
        </ol>
      )}
    </WorkspaceReadPage>
  );
}
