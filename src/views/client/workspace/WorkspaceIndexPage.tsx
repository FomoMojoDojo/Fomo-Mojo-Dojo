// Workspace home (rebuild, 2026-09-11): the hero "Strategy Workspace" over the element chart on paper —
// Outputs row, Base row, Tools band (Admin only with operator context), the launcher's order, numerals,
// ticks and summaries, from WORKSPACE_PAGES through the shared chart components (paper variant). Square
// tiles sized to the home column and capped so all rows fit the viewport. No score block, no cards.
import { useState } from "react";
import { TileGrid, ToolsStrip } from "./WorkspaceChart";
import { WorkspaceHeroPage } from "./WorkspaceHeroPage";
import { WORKSPACE_STRINGS, groupPages } from "./workspaceNav";

export default function WorkspaceIndexPage() {
  const [adminOpen, setAdminOpen] = useState(false);
  return (
    <WorkspaceHeroPage eyebrow={WORKSPACE_STRINGS.indexSection} title={WORKSPACE_STRINGS.heroHome} accent={WORKSPACE_STRINGS.heroHomeAccent} compact>
      <div className="fr-ws-chart" data-fr-region="chart" data-testid="home-chart">
        <TileGrid id="fr-home-outputs" head={WORKSPACE_STRINGS.outputs} pages={groupPages("outputs")} activeKey={null} activeTone="lime" variant="paper" />
        <TileGrid id="fr-home-base" head={WORKSPACE_STRINGS.base} pages={groupPages("base")} activeKey={null} activeTone="paper" variant="paper" />
        <ToolsStrip activeKey={null} variant="paper" adminOpen={adminOpen} onToggleAdmin={() => setAdminOpen((v) => !v)} />
      </div>
    </WorkspaceHeroPage>
  );
}
