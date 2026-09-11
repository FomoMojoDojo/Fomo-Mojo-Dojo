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
import { useOperatorControls } from "@/views/client/firstReadPreview/operatorControls";
import { OPERATOR_MARK } from "@/views/client/firstReadPreview/operatorStrings";
import { clientRefineFirstReadPath, clientRefineWorkspacePath } from "@/lib/clientRefinePreview";
import {
  WORKSPACE_ADMIN_LINKS,
  WORKSPACE_STRINGS,
  WORKSPACE_TOOL_EYEBROWS,
  groupPages,
  workspacePagePath,
  type WorkspacePage,
} from "./workspaceNav";

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function ArrowUpRight() {
  return (
    <svg className="fr-launcher-arrow" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M4 12 L12 4 M6 4 H12 V10" fill="none" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

function TileGrid({ id, head, pages, activeKey, onNavigate, activeTone }: {
  id: string; head: string; pages: ReadonlyArray<WorkspacePage>; activeKey: string; onNavigate: () => void; activeTone: "lime" | "paper";
}) {
  return (
    <section aria-labelledby={id} className="fr-launcher-group" data-fr-group={pages[0]?.group}>
      <h2 id={id} className="fr-launcher-group-head fr-mono">{head}</h2>
      <div className="fr-launcher-grid fr-launcher-stagger">
        {pages.map((p) => {
          const active = p.key === activeKey;
          return (
            <Link
              key={p.key}
              to={workspacePagePath(p)}
              className="fr-launcher-tile"
              data-active={active ? activeTone : undefined}
              aria-current={active ? "page" : undefined}
              data-fr-tile={p.key}
              onClick={onNavigate}
            >
              <div className="fr-launcher-tile-top fr-mono">
                <span>{p.index}</span>
                <span className="fr-launcher-tick" data-fr-tone={active ? (activeTone === "lime" ? "ink" : "lime") : p.tone} aria-hidden="true" />
              </div>
              <div className="fr-launcher-tile-body">
                <div>
                  <h3 className="fr-launcher-tile-title">{p.label}</h3>
                  {p.summary ? <p className="fr-launcher-tile-summary">{p.summary}</p> : null}
                </div>
                <ArrowUpRight />
              </div>
              {active ? <span className="fr-launcher-here fr-mono">{WORKSPACE_STRINGS.here}</span> : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
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
  const operator = useOperatorControls();
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

  const tools = groupPages("tools").filter((p) => p.key !== "index");

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
          <TileGrid id="fr-launcher-outputs" head={WORKSPACE_STRINGS.outputs} pages={groupPages("outputs")} activeKey={activeKey} onNavigate={navigateAndClose} activeTone="lime" />
          <TileGrid id="fr-launcher-base" head={WORKSPACE_STRINGS.base} pages={groupPages("base")} activeKey={activeKey} onNavigate={navigateAndClose} activeTone="paper" />

          <div className="fr-launcher-tools">
            {tools.map((p) => (
              <Link
                key={p.key}
                to={workspacePagePath(p)}
                className="fr-launcher-tool"
                data-fr-tile={p.key}
                data-active={p.key === activeKey ? "true" : undefined}
                aria-current={p.key === activeKey ? "page" : undefined}
                onClick={navigateAndClose}
              >
                <span className="fr-launcher-tool-text">
                  <span className="fr-launcher-tool-eyebrow fr-mono">{WORKSPACE_TOOL_EYEBROWS[p.key]}</span>
                  <span className="fr-launcher-tool-title">{p.label}</span>
                </span>
                <ArrowUpRight />
              </Link>
            ))}
            {operator ? (
              <div className="fr-launcher-admin" {...{ [OPERATOR_MARK.attr]: "admin" }}>
                <button type="button" className="fr-launcher-tool" aria-expanded={adminOpen} onClick={() => setAdminOpen((v) => !v)}>
                  <span className="fr-launcher-tool-text">
                    <span className="fr-launcher-tool-eyebrow fr-mono">{WORKSPACE_STRINGS.workspaceControls}</span>
                    <span className="fr-launcher-tool-title">{WORKSPACE_STRINGS.admin}</span>
                  </span>
                  <svg className="fr-launcher-caret" data-open={adminOpen ? "true" : undefined} width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                    <path d="M8 3 V13 M4 9 L8 13 L12 9" fill="none" stroke="currentColor" strokeWidth="1.25" />
                  </svg>
                </button>
                {adminOpen ? (
                  <div className="fr-launcher-admin-pop">
                    {WORKSPACE_ADMIN_LINKS.map((l) => (
                      <Link key={l.to} to={l.to} className="fr-launcher-admin-link" onClick={navigateAndClose}>{l.label}</Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </nav>

        <footer className="fr-launcher-foot fr-mono">
          <Link to={clientRefineWorkspacePath()} data-fr-tile="index" onClick={navigateAndClose}>{WORKSPACE_STRINGS.workspaceHome}</Link>
          {companyId ? <Link to={clientRefineFirstReadPath(companyId)} onClick={navigateAndClose}>{WORKSPACE_STRINGS.firstRead}</Link> : null}
        </footer>
      </section>
    </div>
  );
}
