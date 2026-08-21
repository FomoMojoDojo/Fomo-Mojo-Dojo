import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSurfaceTeachingMode } from "@/hooks/useSurfaceTeachingMode";
import { useCompany } from "@/hooks/useCompany";
import { clientRefineFirstReadPath } from "@/lib/clientRefinePreview";
import { CLIENT_VIEW_ROUTE } from "@/lib/clientStoryView";

const SIDEBAR_TABS = [
  { key: "diagnose",    label: "Diagnose" },
  { key: "routes",      label: "Routes" },
  { key: "council",     label: "Council" },
  { key: "needs",       label: "Opportunities" },
  { key: "strategy",    label: "Strategy" },
  { key: "positioning", label: "Positioning" },
  { key: "jobmap",      label: "Job Map" },
  { key: "inputs",      label: "Inputs" },
] as const;

export type SidebarTabKey = typeof SIDEBAR_TABS[number]["key"];

export function WorkshopSidebar({
  activeTab,
  onTabClick,
  onHome,
  onAddClient,
  onCompany,
  onMembers,
  onExtracts,
  onInbox,
  inboxCount = 0,
  inboxHasNew = false,
  isHome,
  showTeachingToggle = false,
}: {
  activeTab: string | null;
  onTabClick: (tab: SidebarTabKey) => void;
  onHome: () => void;
  onAddClient?: () => void;
  onCompany?: () => void;
  onMembers?: () => void;
  onExtracts?: () => void;
  onInbox?: () => void;
  inboxCount?: number;
  inboxHasNew?: boolean;
  isHome?: boolean;
  showTeachingToggle?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const { enabled: teachingMode, toggle: toggleTeaching } = useSurfaceTeachingMode();
  const navigate = useNavigate();
  // "First read" — the single 8-beat First Read entry point, moved here from the Inputs tab
  // (2026-08-21). Routes to the existing preview surface for the active company; a plain
  // navigation (the surface owns its own empty/dead-id states, never mints a session).
  const { activeCompany } = useCompany();
  const firstReadHref = activeCompany?.id ? clientRefineFirstReadPath(activeCompany.id) : null;

  return (
    <nav
      className={`crpv-ws-tabs crpv-hier-rail${collapsed ? " crpv-sidebar-collapsed" : ""}`}
      aria-label="Workshop navigation"
    >
      <button
        type="button"
        className="crpv-sidebar-toggle"
        onClick={() => setCollapsed((v) => !v)}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? "›" : "‹"}
      </button>

      {!collapsed && (
        <>
          {!isHome && (
            <>
              <button
                type="button"
                className="crpv-ws-tab crpv-ws-tab-home"
                onClick={onHome}
              >
                ← Home
              </button>
              <div className="crpv-ws-tab-divider" />
            </>
          )}

          {SIDEBAR_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              data-tab={tab.key}
              className={`crpv-ws-tab${activeTab === tab.key ? " active" : ""}`}
              onClick={() => onTabClick(tab.key)}
            >
              {tab.label}
            </button>
          ))}

          {/* First read — last item under the Inputs group; opens the 8-beat First Read surface. */}
          {firstReadHref && (
            <button
              type="button"
              data-first-read
              className="crpv-ws-tab"
              onClick={() => navigate(firstReadHref)}
              title="Open the First Read for this company"
            >
              First read
            </button>
          )}

          <div className="crpv-ws-tab-divider crpv-ws-tab-divider-push" />

          {onInbox && (
            <button
              type="button"
              className={`crpv-ws-tab${activeTab === "__inbox__" ? " active" : ""}`}
              onClick={onInbox}
              style={{ position: "relative" }}
            >
              Inbox
              {inboxCount > 0 && (
                <span style={{
                  position: "absolute",
                  top: 4,
                  right: 6,
                  minWidth: 16,
                  height: 16,
                  background: inboxHasNew ? "#c45c00" : "rgba(17,17,17,0.4)",
                  color: "#fff",
                  borderRadius: 8,
                  fontSize: 8,
                  fontFamily: "monospace",
                  fontWeight: 700,
                  letterSpacing: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 4px",
                  lineHeight: 1,
                }}>
                  {inboxCount > 99 ? "99+" : inboxCount}
                </span>
              )}
              {inboxHasNew && inboxCount === 0 && (
                <span style={{
                  position: "absolute",
                  top: 6,
                  right: 8,
                  width: 6,
                  height: 6,
                  background: "#c45c00",
                  borderRadius: "50%",
                }} />
              )}
            </button>
          )}

          {onCompany && (
            <button
              type="button"
              className={`crpv-ws-tab${activeTab === "__company__" ? " active" : ""}`}
              onClick={onCompany}
            >
              Company
            </button>
          )}

          {onMembers && (
            <button
              type="button"
              className={`crpv-ws-tab${activeTab === "__members__" ? " active" : ""}`}
              onClick={onMembers}
            >
              Member roles
            </button>
          )}

          {onExtracts && (
            <button
              type="button"
              className={`crpv-ws-tab${activeTab === "__extracts__" ? " active" : ""}`}
              onClick={onExtracts}
            >
              Extracts
            </button>
          )}

          {onAddClient && (
            <button
              type="button"
              className="crpv-ws-tab crpv-ws-tab-add-client"
              onClick={onAddClient}
            >
              + Add Client
            </button>
          )}

          {showTeachingToggle && (
            <button
              type="button"
              className="crpv-ws-tab"
              onClick={toggleTeaching}
              data-teaching-toggle
              title={teachingMode ? "Collapse educational panels" : "Expand educational panels"}
              style={{
                opacity: teachingMode ? 1 : 0.55,
                fontStyle: teachingMode ? "normal" : "italic",
              }}
            >
              {teachingMode ? "Teaching ✓" : "Teaching"}
            </button>
          )}

          {/* Client View — leaves the workshop for the full-bleed client story
              room (/client-view). Accent + arrow keep it from reading as a
              workshop tab. Admin-gated by the /preview/client-refine surface. */}
          <div className="crpv-ws-tab-divider" />
          <button
            type="button"
            className="crpv-ws-tab"
            onClick={() => navigate(CLIENT_VIEW_ROUTE)}
            title="Open the full-bleed client story surface"
            style={{ color: "#9c6e15", fontWeight: 600 }}
          >
            Client View →
          </button>
        </>
      )}
    </nav>
  );
}
