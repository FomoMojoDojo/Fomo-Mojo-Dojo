// Opportunities body (comp port 2a — P:362-389, fr tokens). Reads (cited in the port-2a report):
//   rows        odi_needs.desired_outcome of the viewed set — useOdiNeeds(companyId, 0, viewedKey)
//   band        serviceVerdictWord(need) ?? needBestGuessBandLabel(need) — the Job Map's computation
//   High value  needBestGuessBand(need) === "High" (surveyVerdict: opportunity_score ≥ 10, or the
//               declared-confidence ladder) — the existing band, not a new threshold
//   Status      omitted: no signed validation_state vocabulary renders on any client-refine surface
//   documents   omitted: "N internal documents" has no read path
// Filter + search are view state; selection defaults to the first visible row.
import { useMemo, useState } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useOdiNeeds, type OdiNeedRow } from "@/hooks/useOdiNeeds";
import { DEFAULT_SEED_NOTE } from "@/lib/chosenJobStepSet";
import { compareNeedsByValue, needBestGuessBand, needBestGuessBandLabel, serviceVerdictWord } from "@/lib/surveyVerdict";
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

export default function OpportunitiesPage() {
  const { activeCompany } = useCompany();
  const set = useViewedSet(activeCompany?.id);
  const { needs, loading } = useOdiNeeds(activeCompany?.id, 0, set.viewedKey ?? undefined);
  const operator = useOperatorControls();
  const [filter, setFilter] = useState<"all" | "high">("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const ranked = useMemo(() => [...needs].sort(compareNeedsByValue), [needs]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ranked.filter((x) => (filter === "all" || needBestGuessBand(x) === "High") && (!q || x.desired_outcome.toLowerCase().includes(q)));
  }, [filter, query, ranked]);
  const selected = visible.find((x) => x.id === selectedId) ?? visible[0] ?? null;
  const busy = set.loading || loading;

  return (
    <WorkspaceWorkingPage eyebrow={pageLabel("opportunities")} title={WORKSPACE_STRINGS.titleOpportunities} count={busy ? null : ranked.length} unit={WORKSPACE_STRINGS.unitMapped}>
      {busy ? null : (
        <>
          {!set.chosen && set.viewedKey ? <p className="fr-tag fr-mono fr-ws-setlead" data-fr-seed-note>{DEFAULT_SEED_NOTE}</p> : null}
          {ranked.length === 0 ? (
            <WorkspaceAbsent what="opportunities" />
          ) : (
            <>
              <div className="fr-ws-filterrow" data-testid="opps-filters">
                <div className="fr-ws-filters">
                  <button type="button" className="fr-ws-filter fr-mono" data-active={filter === "all" ? "true" : undefined} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>{WORKSPACE_STRINGS.filterAll}</button>
                  <button type="button" className="fr-ws-filter fr-mono" data-active={filter === "high" ? "true" : undefined} aria-pressed={filter === "high"} onClick={() => setFilter("high")}>{WORKSPACE_STRINGS.filterHighValue}</button>
                </div>
                <label className="fr-ws-search fr-mono">
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><circle cx="5" cy="5" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.25" /><path d="M7.5 7.5 L11 11" stroke="currentColor" strokeWidth="1.25" /></svg>
                  <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label={WORKSPACE_STRINGS.searchOpportunities} placeholder={WORKSPACE_STRINGS.searchOpportunities} data-testid="opps-search" />
                </label>
              </div>
              <div className="fr-ws-oppgrid">
                <section className="fr-ws-opplist" data-testid="opps-list">
                  {visible.length === 0 ? <WorkspaceAbsent what="opportunities-filtered" /> : visible.map((x) => {
                    const active = selected?.id === x.id;
                    const rank = ranked.indexOf(x);
                    return (
                      <button key={x.id} type="button" className="fr-ws-opprow" data-active={active ? "true" : undefined} aria-pressed={active} onClick={() => setSelectedId(x.id)} data-testid="opps-row">
                        <span className="fr-ws-opprow-num fr-mono">{pad(rank + 1)}</span>
                        <span className="fr-ws-opprow-text">{x.desired_outcome}</span>
                        <span className="fr-ws-opprow-band fr-mono">{bandLabel(x)}</span>
                      </button>
                    );
                  })}
                </section>
                {selected ? (
                  <aside className="fr-ws-oppaside" data-testid="opps-aside">
                    <p className="fr-ws-band-eyebrow fr-mono">{WORKSPACE_STRINGS.selectedOpportunity}</p>
                    <p className="fr-ws-oppaside-title" data-testid="opps-aside-title">{selected.desired_outcome}</p>
                    <dl className="fr-ws-oppaside-facts">
                      <div><dt className="fr-mono">{WORKSPACE_STRINGS.potential}</dt><dd>{bandLabel(selected)}</dd></div>
                    </dl>
                    {operator ? (
                      // Operator-only: no client-refine surface carries a "create route from a need" handler
                      // (the string exists only in lib), so the control is present but inert.
                      <button type="button" className="fr-ws-control fr-mono" disabled aria-disabled="true" {...{ [OPERATOR_MARK.attr]: "create-route" }}>
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
    </WorkspaceWorkingPage>
  );
}
