// V2-7 — one say-vs-see delta item: the client's declared statement (SAY, labeled as
// yours) beside the outside record's reading (SEE, labeled as the record's), with a
// verbatim SignalQuote receipt on the see side where one exists (CV-2e — quote-less is
// honest, no quotation machinery), and the SAME four-button Check verdict control. The
// registers never blend: each side is explicitly labeled. No bars.

import type { CheckItem, Verdict } from "@/hooks/useFirstReadCapture";
import { checkItemAnnotation, NOT_IMPORTANT_NOTE } from "@/lib/firstRead/checkItemView";
import { SAY_LABEL, SEE_LABEL, SILENT_SEE_LINE } from "@/lib/firstRead/sayVsSee";
import CheckControl from "./CheckControl";
import SignalQuote from "@/components/evidence/SignalQuote";
import { formatSourceAttribution } from "@/lib/firstRead/reportedDate";

export default function DeltaItemRow({
  item,
  onSet,
  disabled,
}: {
  item: CheckItem;
  onSet: (item: CheckItem, v: Verdict, correction?: string) => void;
  disabled?: boolean;
}) {
  const d = item.delta!;
  const ann = checkItemAnnotation(item);
  const confirmed = item.verdict === "confirmed";
  const rejected = item.verdict === "rejected";
  const notImportant = item.verdict === "not_important";
  const silent = d.deltaType === "publicly_silent" || !d.see;
  // Overlap rule: the attribution line only when there is no quote (a quote-bearing signal
  // already shows its date via "As captured" — no double-date, and no host on that receipt).
  const reported = d.quote ? null : formatSourceAttribution(d.sourceUrl, d.reportedEventDate, d.capturedAt);

  return (
    <div className={`cvs-delta-item${rejected ? " is-rejected" : ""}${confirmed ? " is-confirmed" : ""}${notImportant ? " is-notimportant" : ""}`}>
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
          {/* verbatim receipt on the see side; SignalQuote renders nothing when quote is null */}
          <SignalQuote quote={d.quote} eventDate={d.eventDate} />
          {reported && <p className="cvs-delta-reported">{reported}</p>}
        </div>
      </div>

      <CheckControl
        verdict={item.verdict}
        correctionText={item.correctionText}
        onSet={(v, c) => onSet(item, v, c)}
        disabled={disabled}
      />

      {ann?.kind === "confirmed" && (
        <p className="cvs-check-lift"><span className="cvs-check-source">Confirmed by you · {ann.date}</span></p>
      )}
      {ann?.kind === "rejected" && <p className="cvs-check-rejected-note">Rejected by the client · {ann.date}</p>}
      {ann?.kind === "not_important" && <p className="cvs-check-notimportant-note">{NOT_IMPORTANT_NOTE}{ann.date}</p>}
      {ann?.kind === "corrected" && <p className="cvs-check-corrected-note">Corrected: “{ann.text}”</p>}
    </div>
  );
}
