// Market (comp port 2b — P:271-297, fr tokens). Reads: odi_market_definitions for the chosen set via
// useOdiNeeds(companyId, 0, viewedKey) (keyed by company_id + journey_key, useOdiNeeds.ts:105-110) —
// job_executor (statement), jtbd (What they are hiring for); odi_needs of the set for the footer count
// (Market hypothesis · N Customer tensions mapped). The comp's "Who is in it" segments have no read
// path — omitted.
import { useCompany } from "@/hooks/useCompany";
import { useOdiNeeds } from "@/hooks/useOdiNeeds";
import { withStop } from "@/views/client/firstReadPreview/primitives-editorial";
import { WorkspaceAbsent } from "./absent";
import { ReadFoot } from "./readBands";
import { useViewedSet } from "./viewedSet";
import { ReadBand, WorkspaceReadPage } from "./WorkspaceReadPage";
import { WORKSPACE_STRINGS } from "./workspaceNav";

export default function MarketPage() {
  const { activeCompany } = useCompany();
  const set = useViewedSet(activeCompany?.id);
  const { marketDefinition, needs, loading } = useOdiNeeds(activeCompany?.id, 0, set.viewedKey ?? undefined);
  const busy = set.loading || loading;
  const jtbd = marketDefinition?.jtbd?.trim() || null;
  const statement = marketDefinition?.job_executor?.trim() || null;
  return (
    <WorkspaceReadPage eyebrow={WORKSPACE_STRINGS.yourMarket} statement={statement}>
      {busy ? null : !marketDefinition ? (
        <div className="mt-14"><WorkspaceAbsent what="market" /></div>
      ) : (
        <>
          {jtbd ? (
            <ReadBand label={WORKSPACE_STRINGS.whatTheyAreHiringFor} region="hiring-for">
              <p className="fr-ws-band-statement fr-ws-band-statement--large">{withStop(jtbd)}</p>
            </ReadBand>
          ) : null}
          {needs.length > 0 ? (
            <div data-fr-region="tensions-count">
              <ReadFoot>{WORKSPACE_STRINGS.marketHypothesis} · <span data-testid="market-tensions-count">{needs.length}</span> {WORKSPACE_STRINGS.customerTensionsMapped}</ReadFoot>
            </div>
          ) : null}
        </>
      )}
    </WorkspaceReadPage>
  );
}
