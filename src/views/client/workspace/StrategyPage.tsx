// Strategy (comp port 2b — P:307-359, fr tokens). Reads: strategy_cascades via useStrategyCascade —
// winning_aspiration (statement), where_to_play / how_to_win (single bodies; no head/body field),
// capabilities[].name (Must-have capabilities), management_systems[].name (Management systems).
// No lede (no field). A band whose read is empty is omitted.
import { useCompany } from "@/hooks/useCompany";
import { useStrategyCascade } from "@/hooks/useStrategyCascade";
import { WorkspaceAbsent } from "./absent";
import { NumberedCells } from "./readBands";
import { ReadBand, WorkspaceReadPage } from "./WorkspaceReadPage";
import { WORKSPACE_STRINGS } from "./workspaceNav";

export default function StrategyPage() {
  const { activeCompany } = useCompany();
  const { item, loading } = useStrategyCascade(activeCompany?.id);
  const choices = item
    ? [
        { key: "wtp", label: WORKSPACE_STRINGS.whereToPlay, body: item.where_to_play?.trim() },
        { key: "htw", label: WORKSPACE_STRINGS.howToWin, body: item.how_to_win?.trim() },
      ].filter((c) => c.body)
    : [];
  const capabilities = item?.capabilities.map((c) => c.name).filter(Boolean) ?? [];
  const systems = item?.management_systems.map((c) => c.name).filter(Boolean) ?? [];
  const empty = !item || (choices.length === 0 && capabilities.length === 0 && systems.length === 0);
  return (
    <WorkspaceReadPage eyebrow={WORKSPACE_STRINGS.yourStrategy} statement={item?.winning_aspiration?.trim() || null}>
      {loading ? null : empty ? (
        <div className="mt-14"><WorkspaceAbsent what="strategy" /></div>
      ) : (
        <>
          {choices.length > 0 || capabilities.length > 0 ? (
            <div className="fr-ws-choices" data-fr-region="choices" data-testid="strategy-choices">
              {choices.map((c) => (
                <div key={c.key} className="fr-ws-choice">
                  <span className="fr-ws-choice-label fr-mono">{c.label}</span>
                  <p className="fr-ws-choice-body">{c.body}</p>
                </div>
              ))}
              {capabilities.length > 0 ? (
                <div className="fr-ws-choice">
                  <span className="fr-ws-choice-label fr-mono">{WORKSPACE_STRINGS.mustHaveCapabilities}</span>
                  <NumberedCells items={capabilities} columns={1} compact />
                </div>
              ) : null}
            </div>
          ) : null}
          {systems.length > 0 ? (
            <ReadBand label={WORKSPACE_STRINGS.managementSystems} region="management-systems">
              <NumberedCells items={systems} columns={2} compact />
            </ReadBand>
          ) : null}
        </>
      )}
    </WorkspaceReadPage>
  );
}
