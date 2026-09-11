// Strategy (Read frame): strategy_cascades via useStrategyCascade. Statement = the winning aspiration;
// body (brief 2 rewrites it) = where to play / how to win rows + the capabilities list.
import { useCompany } from "@/hooks/useCompany";
import { useStrategyCascade } from "@/hooks/useStrategyCascade";
import { LedgerRow } from "@/views/client/firstReadPreview/primitives";
import { HangingItem } from "@/views/client/firstReadPreview/primitives-editorial";
import { WorkspaceAbsent } from "./absent";
import { WorkspaceReadPage } from "./WorkspaceReadPage";
import { WORKSPACE_STRINGS } from "./workspaceNav";

export default function StrategyPage() {
  const { activeCompany } = useCompany();
  const { item, loading } = useStrategyCascade(activeCompany?.id);
  const rows = item ? [item.where_to_play, item.how_to_win].filter((t) => t && t.trim()) : [];
  return (
    <WorkspaceReadPage eyebrow={WORKSPACE_STRINGS.yourStrategy} statement={item?.winning_aspiration || null}>
      {loading ? null : !item || (rows.length === 0 && item.capabilities.length === 0) ? (
        <div className="mt-14"><WorkspaceAbsent what="strategy" /></div>
      ) : (
        <div className="fr-stagger mt-14">
          {rows.map((text, i) => (
            <LedgerRow key={i} leftBody={text} meta={null} quoted={false} />
          ))}
          {item.capabilities.length > 0 ? (
            <ol className="fr-hanging-list">
              {item.capabilities.map((c, i) => (
                <HangingItem key={`${c.name}-${i}`} title={c.name} muted={c.status === "gap"}>
                  {c.note ? <p className="fr-numbered-text text-sm font-light leading-relaxed">{c.note}</p> : null}
                </HangingItem>
              ))}
            </ol>
          ) : null}
        </div>
      )}
    </WorkspaceReadPage>
  );
}
