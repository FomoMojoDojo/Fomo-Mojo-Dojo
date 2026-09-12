// THE ELEMENT CHART (home rebuild, 2026-09-11): the launcher's tile rows and tools strip as one shared
// component set with two variants — "slate" (the launcher; emits exactly the launcher's markup, no
// variant attribute) and "paper" (the home; the same markup plus data-variant="paper", restyled on the
// paper ground). Same order, numerals, ticks and summaries in both.
import { Link } from "react-router-dom";
import { useOperatorControls } from "@/views/client/firstReadPreview/operatorControls";
import { OPERATOR_MARK } from "@/views/client/firstReadPreview/operatorStrings";
import {
  WORKSPACE_ADMIN_LINKS,
  WORKSPACE_STRINGS,
  WORKSPACE_TOOL_EYEBROWS,
  groupPages,
  workspacePagePath,
  type WorkspacePage,
} from "./workspaceNav";

export type ChartVariant = "slate" | "paper";
const variantAttr = (v: ChartVariant) => (v === "paper" ? { "data-variant": "paper" } : {});

export function ArrowUpRight() {
  return (
    <svg className="fr-launcher-arrow" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M4 12 L12 4 M6 4 H12 V10" fill="none" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

export function WorkspaceTile({ page, active, activeTone, variant, onNavigate }: {
  page: WorkspacePage; active: boolean; activeTone: "lime" | "paper"; variant: ChartVariant; onNavigate?: () => void;
}) {
  return (
    <Link
      to={workspacePagePath(page)}
      className="fr-launcher-tile"
      data-active={active ? activeTone : undefined}
      aria-current={active ? "page" : undefined}
      data-fr-tile={page.key}
      onClick={onNavigate}
      {...variantAttr(variant)}
    >
      <div className="fr-launcher-tile-top fr-mono">
        <span>{page.index}</span>
        <span className="fr-launcher-tick" data-fr-tone={active ? (activeTone === "lime" ? "ink" : "lime") : page.tone} aria-hidden="true" />
      </div>
      <div className="fr-launcher-tile-body">
        <div>
          <h3 className="fr-launcher-tile-title">{page.label}</h3>
          {page.summary ? <p className="fr-launcher-tile-summary">{page.summary}</p> : null}
        </div>
        <ArrowUpRight />
      </div>
      {active ? <span className="fr-launcher-here fr-mono">{WORKSPACE_STRINGS.here}</span> : null}
    </Link>
  );
}

export function TileGrid({ id, head, pages, activeKey, activeTone, variant, onNavigate }: {
  id: string; head: string; pages: ReadonlyArray<WorkspacePage>; activeKey: string | null; activeTone: "lime" | "paper"; variant: ChartVariant; onNavigate?: () => void;
}) {
  return (
    <section aria-labelledby={id} className="fr-launcher-group" data-fr-group={pages[0]?.group} {...variantAttr(variant)}>
      <h2 id={id} className="fr-launcher-group-head fr-mono">{head}</h2>
      <div className="fr-launcher-grid fr-launcher-stagger">
        {pages.map((p) => (
          <WorkspaceTile key={p.key} page={p} active={p.key === activeKey} activeTone={activeTone} variant={variant} onNavigate={onNavigate} />
        ))}
      </div>
    </section>
  );
}

/** The Tools strip: Inputs · Council, plus the Admin disclosure only with operator context. */
export function ToolsStrip({ activeKey, variant, adminOpen, onToggleAdmin, onNavigate }: {
  activeKey: string | null; variant: ChartVariant; adminOpen: boolean; onToggleAdmin: () => void; onNavigate?: () => void;
}) {
  const operator = useOperatorControls();
  const tools = groupPages("tools").filter((p) => p.key !== "index");
  return (
    <div className="fr-launcher-tools" {...variantAttr(variant)}>
      {tools.map((p) => (
        <Link
          key={p.key}
          to={workspacePagePath(p)}
          className="fr-launcher-tool"
          data-fr-tile={p.key}
          data-active={p.key === activeKey ? "true" : undefined}
          aria-current={p.key === activeKey ? "page" : undefined}
          onClick={onNavigate}
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
          <button type="button" className="fr-launcher-tool" aria-expanded={adminOpen} onClick={onToggleAdmin}>
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
                <Link key={l.to} to={l.to} className="fr-launcher-admin-link" onClick={onNavigate}>{l.label}</Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
