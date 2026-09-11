// WORKING PAGE frame (comp port 1 — P:110-157): a paper page; header grid with the eyebrow, the
// title with the lime full stop, and the Working-set count box (lime left rule; the count is passed in
// by the page from its own read); then a 15rem sticky Strategy-anchor rail reading the strategy
// cascade (winning aspiration / Where to play / How to win), Absent as a whole when that read is
// empty; and the main column. No lede slot (ruling 1). Reserves the cluster zone (ruling 5).
import type { ReactNode } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useStrategyCascade } from "@/hooks/useStrategyCascade";
import { Eyebrow } from "@/views/client/firstReadPreview/primitives";
import { withStop } from "@/views/client/firstReadPreview/primitives-editorial";
import { WorkspaceAbsent } from "./absent";
import { WORKSPACE_STRINGS } from "./workspaceNav";

function StrategyAnchor() {
  const { activeCompany } = useCompany();
  const { item, loading } = useStrategyCascade(activeCompany?.id);
  const empty = !item || (!item.winning_aspiration && !item.where_to_play && !item.how_to_win);
  return (
    <aside className="fr-ws-anchor" data-testid="ws-anchor">
      <p className="fr-ws-anchor-eyebrow fr-mono">{WORKSPACE_STRINGS.strategyAnchor}</p>
      {loading ? null : empty ? (
        <div className="mt-4"><WorkspaceAbsent what="strategy-anchor" /></div>
      ) : (
        <>
          {item.winning_aspiration ? <p className="fr-ws-anchor-statement">{item.winning_aspiration}</p> : null}
          {item.where_to_play ? (
            <div className="fr-ws-anchor-choice">
              <p className="fr-ws-anchor-label fr-mono">{WORKSPACE_STRINGS.whereToPlay}</p>
              <p className="fr-ws-anchor-text">{item.where_to_play}</p>
            </div>
          ) : null}
          {item.how_to_win ? (
            <div className="fr-ws-anchor-choice">
              <p className="fr-ws-anchor-label fr-mono">{WORKSPACE_STRINGS.howToWin}</p>
              <p className="fr-ws-anchor-text">{item.how_to_win}</p>
            </div>
          ) : null}
        </>
      )}
    </aside>
  );
}

export function WorkspaceWorkingPage({ eyebrow, title, count, unit, children }: {
  eyebrow: string;
  title: string;
  /** The working-set count from the page's own read; null while loading. */
  count: number | null;
  /** The signed unit word (WORKSPACE_STRINGS.unit*). */
  unit: string;
  children: ReactNode;
}) {
  return (
    <main className="fr-ws-working" data-testid="ws-working">
      <header className="fr-ws-working-head">
        <div>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="fr-display fr-ws-working-title">{withStop(title)}</h1>
        </div>
        <div className="fr-ws-working-set" data-testid="ws-working-set">
          <span className="fr-ws-working-set-label fr-mono">{WORKSPACE_STRINGS.workingSet}</span>
          {count === null ? <WorkspaceAbsent what="working-set" /> : <strong className="fr-ws-working-set-count">{count} {unit}</strong>}
        </div>
      </header>
      <div className="fr-ws-working-grid">
        <StrategyAnchor />
        <div className="fr-ws-working-main">{children}</div>
      </div>
    </main>
  );
}
