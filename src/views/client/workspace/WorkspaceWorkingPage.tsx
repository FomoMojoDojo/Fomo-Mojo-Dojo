// WORKING PAGE frame (comp port 1 — P:110-157): a paper page; header grid with the eyebrow, the
// title with the lime full stop, and the Working-set count box (lime left rule; the count is passed in
// by the page from its own read); then the main column. No lede slot (ruling 1). Reserves the cluster
// zone (ruling 5). The 15rem Strategy-anchor rail (winning aspiration / Where to play / How to win)
// came off on 2026-09-16 (operator direction) — the cascade read left with it; the Strategy page is
// where those read.
import type { ReactNode } from "react";
import { Eyebrow } from "@/views/client/firstReadPreview/primitives";
import { withStop } from "@/views/client/firstReadPreview/primitives-editorial";
import { WorkspaceAbsent } from "./absent";
import { WORKSPACE_STRINGS } from "./workspaceNav";

/** T1 (2026-09-19): titles longer than this take the wide measure (data-fr-long-title). */
export const LONG_TITLE_CHARS = 40;

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
          <h1 className="fr-display fr-ws-working-title" data-fr-long-title={title.trim().length > LONG_TITLE_CHARS ? "" : undefined}>{withStop(title)}</h1>
        </div>
        <div className="fr-ws-working-set" data-testid="ws-working-set">
          <span className="fr-ws-working-set-label fr-mono">{WORKSPACE_STRINGS.workingSet}</span>
          {count === null ? <WorkspaceAbsent what="working-set" /> : <strong className="fr-ws-working-set-count">{count} {unit}</strong>}
        </div>
      </header>
      <div className="fr-ws-working-grid">
        <div className="fr-ws-working-main">{children}</div>
      </div>
    </main>
  );
}
