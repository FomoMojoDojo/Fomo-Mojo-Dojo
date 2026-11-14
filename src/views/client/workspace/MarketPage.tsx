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
import { isGenericJtbdStatement } from "@/views/JobSteps/helpers/validation";

export default function MarketPage() {
  const { activeCompany } = useCompany();
  const set = useViewedSet(activeCompany?.id);
  const { marketDefinition, needs, loading } = useOdiNeeds(activeCompany?.id, 0, set.viewedKey ?? undefined);
  const busy = set.loading || loading;
  const jtbd = marketDefinition?.jtbd?.trim() || null;
  // SP-300 (S-MKT-1): research-company's jtbdFromJourneyTitle() falls through to a fixed sentence —
  // "…move from defining outcomes to executing and monitoring progress…" — whenever the audience it
  // parsed matches none of four keyword lists, and that sentence rests on no evidence (SP-F46; 9 of 27
  // companies rendered it). The admin JobSteps view already blanks it with this same check; the client
  // page now says what is true instead. The stored row is not changed.
  const jtbdIsCanned = jtbd !== null && isGenericJtbdStatement(jtbd);
  const statement = marketDefinition?.job_executor?.trim() || null;
  return (
    <WorkspaceReadPage eyebrow={WORKSPACE_STRINGS.yourMarket} statement={statement}>
      {busy ? null : !marketDefinition ? (
        <div className="mt-14"><WorkspaceAbsent what="market" /></div>
      ) : (
        <>
          {jtbd ? (
            <ReadBand label={WORKSPACE_STRINGS.whatTheyAreHiringFor} region="hiring-for">
              {jtbdIsCanned ? (
                <p className="fr-ws-band-statement" data-testid="market-hiring-for-unknown">{WORKSPACE_STRINGS.marketNotEnoughEvidence}</p>
              ) : (
                <p className="fr-ws-band-statement fr-ws-band-statement--large">{withStop(jtbd)}</p>
              )}
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
