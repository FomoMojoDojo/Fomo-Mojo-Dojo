// Positioning (comp port 2b — P:219-262, fr tokens). Reads: positioning_canvases via usePositioningCanvas —
// market_category (statement), unique_attributes[] name/description (What holds it up), best_fit_customers
// (Who this is for), competitive_alternatives[] name (Instead of), current_tagline → proposed_tagline
// (Tagline shift; omitted unless both exist). The comp's "reviewed against N alternatives" footer has no
// signed label — omitted. A band whose read is empty is omitted.
import { useCompany } from "@/hooks/useCompany";
import { usePositioningCanvas } from "@/hooks/usePositioningCanvas";
import { WorkspaceAbsent } from "./absent";
import { NumberedCells } from "./readBands";
import { ReadBand, WorkspaceReadPage } from "./WorkspaceReadPage";
import { WORKSPACE_STRINGS } from "./workspaceNav";

export default function PositioningPage() {
  const { activeCompany } = useCompany();
  const { item, loading } = usePositioningCanvas(activeCompany?.id);
  const points = item?.unique_attributes.filter((p) => p.name?.trim()).map((p) => ({ title: p.name, body: p.description?.trim() || null })) ?? [];
  const audience = item?.best_fit_customers?.trim() || null;
  const alternatives = item?.competitive_alternatives.map((a) => a.name).filter((n) => n?.trim()) ?? [];
  const oldTag = item?.current_tagline?.trim() || null;
  const newTag = item?.proposed_tagline?.trim() || null;
  const empty = !item || (points.length === 0 && !audience && alternatives.length === 0 && !(oldTag && newTag));
  return (
    <WorkspaceReadPage eyebrow={WORKSPACE_STRINGS.yourPositioning} statement={item?.market_category?.trim() || null}>
      {loading ? null : empty ? (
        <div className="mt-14"><WorkspaceAbsent what="positioning" /></div>
      ) : (
        <>
          {points.length > 0 ? (
            <ReadBand label={WORKSPACE_STRINGS.whatHoldsItUp} region="what-holds-it-up">
              <NumberedCells items={points} columns={3} />
            </ReadBand>
          ) : null}
          {audience ? (
            <ReadBand label={WORKSPACE_STRINGS.whoThisIsFor} region="who-this-is-for">
              <p className="fr-ws-band-statement">{audience}</p>
            </ReadBand>
          ) : null}
          {alternatives.length > 0 ? (
            <ReadBand label={WORKSPACE_STRINGS.insteadOf} region="instead-of">
              <NumberedCells items={alternatives} columns={2} compact />
            </ReadBand>
          ) : null}
          {oldTag && newTag ? (
            <ReadBand label={WORKSPACE_STRINGS.taglineShift} region="tagline-shift">
              <div className="fr-ws-shift">
                <p className="fr-ws-shift-old">{oldTag}</p>
                <span className="fr-ws-shift-arrow fr-mono" aria-hidden="true">→</span>
                <p className="fr-ws-shift-new">{newTag}</p>
              </div>
            </ReadBand>
          ) : null}
        </>
      )}
    </WorkspaceReadPage>
  );
}
