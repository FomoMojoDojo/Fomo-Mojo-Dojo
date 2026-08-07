// First Read ROLLUP (Gate 2) — the featured-item exhibit card. Renders ONE operator-picked item
// as its theme's flagship: the item's existing full render (statement, attribution, receipts where
// they exist) via the SAME helpers the rows use — but styled as a card and with NO verdict buttons
// (the "Where do you land?" ask arrives in Gate 3). No data reads here; it renders the item given.

import type { CheckItem } from "@/hooks/useFirstReadCapture";
import { CHECK_KIND_LABEL } from "@/lib/firstRead/checkItemView";
import { OUTSIDE_RAISED_LABEL } from "./OutsideRaisedSection";
import { SAY_LABEL, SEE_LABEL, SILENT_SEE_LINE } from "@/lib/firstRead/sayVsSee";
import SignalQuote from "@/components/evidence/SignalQuote";
import { formatSourceAttribution } from "@/lib/firstRead/reportedDate";

export default function FeaturedExhibitCard({ item }: { item: CheckItem }) {
  if (item.kind === "delta" && item.delta) {
    const d = item.delta;
    const reported = d.quote ? null : formatSourceAttribution(d.sourceUrl, d.reportedEventDate, d.capturedAt);

    // OUTSIDE-RAISED (internally_silent): the observed statement under "The record says:" — it has
    // NO declared side. This is theme 2's shape.
    if (d.deltaType === "internally_silent") {
      return (
        <div className="cvs-theme-featured cvs-theme-featured-outside">
          <p className="cvs-outside-raised-item-label">{OUTSIDE_RAISED_LABEL}</p>
          <p className="cvs-outside-raised-item-text">{d.see}</p>
          <SignalQuote quote={d.quote} eventDate={d.eventDate} />
          {reported && <p className="cvs-outside-raised-reported">{reported}</p>}
        </div>
      );
    }

    // SAY-VS-SEE (echoed / divergent / publicly_silent) — the theme-1 fallback. Both sides, by
    // register, mirroring DeltaItemRow minus the verdict control. A publicly_silent delta has NO
    // public side, so the SEE side is the honest absence line — NEVER an empty "record shows" body.
    const silent = d.deltaType === "publicly_silent" || !d.see;
    return (
      <div className="cvs-theme-featured cvs-theme-featured-saysee">
        <div className="cvs-delta-pair">
          <div className="cvs-delta-side cvs-delta-say">
            <p className="cvs-delta-label">{SAY_LABEL}</p>
            <p className="cvs-delta-text">{d.say}</p>
          </div>
          <div className="cvs-delta-side cvs-delta-see">
            <p className="cvs-delta-label">{SEE_LABEL}</p>
            {silent ? (
              <p className="cvs-delta-text is-silent">{SILENT_SEE_LINE}</p>
            ) : (
              <p className="cvs-delta-text">{d.see}</p>
            )}
            <SignalQuote quote={d.quote} eventDate={d.eventDate} />
            {reported && <p className="cvs-delta-reported">{reported}</p>}
          </div>
        </div>
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
