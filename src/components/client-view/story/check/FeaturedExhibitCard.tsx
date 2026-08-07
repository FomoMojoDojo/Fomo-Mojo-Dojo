// First Read ROLLUP (Gate 2) — the featured-item exhibit card. Renders ONE operator-picked item
// as its theme's flagship: the item's existing full render (statement, attribution, receipts where
// they exist) via the SAME helpers the rows use — but styled as a card and with NO verdict buttons
// (the "Where do you land?" ask arrives in Gate 3). No data reads here; it renders the item given.

import type { CheckItem } from "@/hooks/useFirstReadCapture";
import { CHECK_KIND_LABEL } from "@/lib/firstRead/checkItemView";
import { OUTSIDE_RAISED_LABEL } from "./OutsideRaisedSection";
import SignalQuote from "@/components/evidence/SignalQuote";
import { formatSourceAttribution } from "@/lib/firstRead/reportedDate";

export default function FeaturedExhibitCard({ item }: { item: CheckItem }) {
  // Outside-raised (internally_silent delta): the observed statement under "The record says:",
  // with its verbatim receipt and same-signal attribution — identical helpers to the section row,
  // minus the coverage/prompt lines and the verdict control.
  if (item.kind === "delta" && item.delta) {
    const d = item.delta;
    const reported = d.quote ? null : formatSourceAttribution(d.sourceUrl, d.reportedEventDate, d.capturedAt);
    return (
      <div className="cvs-theme-featured cvs-theme-featured-outside">
        <p className="cvs-outside-raised-item-label">{OUTSIDE_RAISED_LABEL}</p>
        <p className="cvs-outside-raised-item-text">{d.see}</p>
        <SignalQuote quote={d.quote} eventDate={d.eventDate} />
        {reported && <p className="cvs-outside-raised-reported">{reported}</p>}
      </div>
    );
  }

  // Findings / markets / differentiators: the verbatim statement with its kind label.
  return (
    <div className="cvs-theme-featured cvs-theme-featured-finding">
      <p className="cvs-check-kind">{CHECK_KIND_LABEL[item.kind]}</p>
      <p className="cvs-check-text">{item.text}</p>
    </div>
  );
}
