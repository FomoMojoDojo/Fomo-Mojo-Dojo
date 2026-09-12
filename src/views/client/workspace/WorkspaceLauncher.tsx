// WORKSPACE LAUNCHER (comp port 1, 2026-09-11 — S:125-196 in fr tokens). An ink/35 scrim over a slate
// panel that fills the viewport and unfolds from — then folds back into — the bottom-left launcher
// (C:170-181, 225-250 ported as fr-launcher-*). Header row: the company name as a lime eyebrow + Close.
// Nav, bottom-justified: Outputs then Base as bordered 3-column grids of square tiles (numeral, colour
// tick, title, summary, ↗); the active tile is lime (Outputs) / paper (Base) with the "Here" tag and
// aria-current. Then the Tools strip: Inputs · Council · Admin▾ (Admin and its popover render only
// with operator context). Footer: Workspace home / First read.
//
// data-state open|closing; unmounted on the panel's animation end. Under prefers-reduced-motion the
// keyframes are none, so the close is immediate.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Eyebrow } from "@/views/client/firstReadPreview/primitives";
import { clientRefineFirstReadPath, clientRefineWorkspacePath } from "@/lib/clientRefinePreview";
import { TileGrid, ToolsStrip } from "./WorkspaceChart";
import { WORKSPACE_STRINGS, groupPages } from "./workspaceNav";

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function WorkspaceLauncher({ activeKey, companyName, companyId, onClose, onNavigate }: {
  activeKey: string;
  companyName: string | null;
  companyId: string | null;
  onClose: () => void;
  onNavigate: () => void;
}) {
  const [state, setState] = useState<"open" | "closing">("open");
  const [adminOpen, setAdminOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const requestClose = () => {
    if (reducedMotion()) { onClose(); return; }
    setState("closing");
  };
  const navigateAndClose = () => { onNavigate(); requestClose(); };

  useEffect(() => { rootRef.current?.querySelector<HTMLButtonElement>("button[data-fr-launcher-close]")?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={rootRef} className="fr-launcher" data-state={state} data-testid="workspace-launcher" onClick={requestClose}>
      <section
        className="fr-launcher-panel"
        role="dialog"
        aria-modal="true"
        aria-label={WORKSPACE_STRINGS.map}
        data-testid="workspace-launcher-panel"
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={(e) => { if (e.target === e.currentTarget && state === "closing") onClose(); }}
      >
        <header className="fr-launcher-head">
          <div className="fr-launcher-head-id">{companyName ? <Eyebrow>{companyName}</Eyebrow> : null}</div>
          <button type="button" className="fr-launcher-close" aria-label={WORKSPACE_STRINGS.closeMap} data-fr-launcher-close onClick={requestClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M3 3 L13 13 M13 3 L3 13" fill="none" stroke="currentColor" strokeWidth="1.25" />
            </svg>
          </button>
        </header>

        <nav aria-label={WORKSPACE_STRINGS.navigation} className="fr-launcher-nav">
          <TileGrid id="fr-launcher-outputs" head={WORKSPACE_STRINGS.outputs} pages={groupPages("outputs")} activeKey={activeKey} onNavigate={navigateAndClose} activeTone="lime" variant="slate" />
          <TileGrid id="fr-launcher-base" head={WORKSPACE_STRINGS.base} pages={groupPages("base")} activeKey={activeKey} onNavigate={navigateAndClose} activeTone="paper" variant="slate" />

          <ToolsStrip activeKey={activeKey} variant="slate" adminOpen={adminOpen} onToggleAdmin={() => setAdminOpen((v) => !v)} onNavigate={navigateAndClose} />
        </nav>

        <footer className="fr-launcher-foot fr-mono">
          <Link to={clientRefineWorkspacePath()} data-fr-tile="index" onClick={navigateAndClose}>{WORKSPACE_STRINGS.workspaceHome}</Link>
          {companyId ? <Link to={clientRefineFirstReadPath(companyId)} onClick={navigateAndClose}>{WORKSPACE_STRINGS.firstRead}</Link> : null}
        </footer>
      </section>
    </div>
  );
}
