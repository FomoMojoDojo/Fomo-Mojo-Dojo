// V2-7 — Act 4 say-vs-see exhibit: the three say-anchored delta groups (echoed /
// divergent / publicly_silent), each item carrying the Check verdict control. A group
// with no items renders its honest-absence line (never filler). publicly_silent items
// double as the open-question bridge (V2-4) — a light connective note, no duplicate list.

import type { CheckItem, Verdict } from "@/hooks/useFirstReadCapture";
import { SAY_VS_SEE_GROUPS, SILENT_BRIDGE_NOTE } from "@/lib/firstRead/sayVsSee";
import DeltaItemRow from "./DeltaItemRow";

export default function SayVsSeeExhibit({
  items,
  onSet,
  disabled,
}: {
  items: CheckItem[]; // kind === 'delta' only
  onSet: (item: CheckItem, v: Verdict, correction?: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="cvs-saysee">
      {SAY_VS_SEE_GROUPS.map((g) => {
        const groupItems = items.filter((i) => i.delta?.deltaType === g.key);
        // PUBLIC-ONLY interim (2026-08-20): until the Gate-B recompute re-bases the
        // say side on client-voice public claims, an empty say-anchored group is a
        // NOT-COMPUTED state, not an all-found state — the honest-absence lines
        // ("Everything you've told us turned up somewhere…", "Nothing we've read so
        // far repeats back…") would be false statements. An empty group renders
        // NOTHING (no placeholder) until Gate B restores computed absences.
        if (groupItems.length === 0) return null;
        return (
          <section className="cvs-saysee-group" key={g.key} aria-label={g.heading}>
            <p className="cvs-saysee-heading">{g.heading}</p>
            {groupItems.map((i) => (
              <DeltaItemRow key={i.identity} item={i} onSet={onSet} disabled={disabled} />
            ))}
            {g.key === "publicly_silent" && <p className="cvs-saysee-bridge">{SILENT_BRIDGE_NOTE}</p>}
          </section>
        );
      })}
    </div>
  );
}
