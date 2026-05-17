import { useState } from "react";

const SIDEBAR_TABS = [
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
}: {
  activeTab: string | null;
  onTabClick: (tab: SidebarTabKey) => void;
  onHome: () => void;
  onAddClient?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

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
          <button
            type="button"
            className="crpv-ws-tab crpv-ws-tab-home"
            onClick={onHome}
          >
            ← Home
          </button>

          <div className="crpv-ws-tab-divider" />

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

          <div className="crpv-ws-tab-divider crpv-ws-tab-divider-push" />

          {onAddClient && (
            <button
              type="button"
              className="crpv-ws-tab crpv-ws-tab-add-client"
              onClick={onAddClient}
            >
              + Add Client
            </button>
          )}
        </>
      )}
    </nav>
  );
}
