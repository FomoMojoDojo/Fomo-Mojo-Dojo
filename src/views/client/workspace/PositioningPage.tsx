// Positioning (Read frame): positioning_canvases via usePositioningCanvas. Statement = the market
// category (P:223); body (brief 2 rewrites it) = the canvas rows and lists.
import { useCompany } from "@/hooks/useCompany";
import { usePositioningCanvas } from "@/hooks/usePositioningCanvas";
import { LedgerRow } from "@/views/client/firstReadPreview/primitives";
import { HangingItem } from "@/views/client/firstReadPreview/primitives-editorial";
import { WorkspaceAbsent } from "./absent";
import { WorkspaceReadPage } from "./WorkspaceReadPage";
import { WORKSPACE_STRINGS } from "./workspaceNav";

export default function PositioningPage() {
  const { activeCompany } = useCompany();
  const { item, loading } = usePositioningCanvas(activeCompany?.id);
  const rows = item ? [item.value_for_customer, item.best_fit_customers, item.category_rationale].filter((t) => t && t.trim()) : [];
  const lists = item ? [item.unique_attributes, item.competitive_alternatives].filter((l) => l.length > 0) : [];
  const empty = !item || (rows.length === 0 && lists.length === 0);
  return (
    <WorkspaceReadPage eyebrow={WORKSPACE_STRINGS.yourPositioning} statement={item?.market_category || null}>
      {loading ? null : empty ? (
        <div className="mt-14"><WorkspaceAbsent what="positioning" /></div>
      ) : (
        <div className="fr-stagger mt-14">
          {rows.map((text, i) => (
            <LedgerRow key={i} leftBody={text} meta={null} quoted={false} />
          ))}
          {lists.map((list, li) => (
            <ol key={li} className="fr-hanging-list">
              {list.map((p) => (
                <HangingItem key={p.id} title={p.name}>
                  {p.description ? <p className="fr-numbered-text text-sm font-light leading-relaxed">{p.description}</p> : null}
                </HangingItem>
              ))}
            </ol>
          ))}
        </div>
      )}
    </WorkspaceReadPage>
  );
}
