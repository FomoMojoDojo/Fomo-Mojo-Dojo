// HERO PAGE frame (comp port 1 — S:201-235): a paper page; lime eyebrow; the hero title (with an
// optional lime accent word) at the .fr-display statement scale; an actions slot on the right; a
// hairline; then the main slot. No lede slot (ruling 1). Reserves the cluster zone (ruling 5).
import type { ReactNode } from "react";
import { Eyebrow } from "@/views/client/firstReadPreview/primitives";

export function WorkspaceHeroPage({ eyebrow, title, accent, actions, children }: {
  eyebrow: string;
  title: string;
  accent?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="fr-ws-hero" data-testid="ws-hero">
      <div className="fr-ws-hero-head">
        <div>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="fr-display fr-ws-hero-title">
            {title}
            {accent ? <> <span className="fr-ws-hero-accent">{accent}</span></> : null}
          </h1>
        </div>
        {actions ? <div className="fr-ws-hero-actions">{actions}</div> : null}
      </div>
      <div className="fr-ws-hero-main">{children}</div>
    </main>
  );
}
