// First Read · The Check — Option B: "What the outside raised that you haven't spoken to".
//
// The OBSERVED-anchored section. Unlike the say-vs-see exhibit (DeltaItemRow), an
// internally_silent item has NO declared side — its item text is the OBSERVED statement,
// rendered under "The record says:". The verdict is against the outside's reading (the same
// three signed buttons the act already uses: Confirm / Reject / "True, but not a focus now"),
// and a Reject births a disputed contest via the delta's stored public_claim_id (unchanged).
//
// The backing guard lives at the READ (useFirstReadCapture / assembleDeltaItems): an item
// only reaches here if its observed claim carries >=1 outside-band signal, so an unbacked
// (mis-stamped-as-public) statement can never render in the outside's voice. This component
// renders items it is given; it does not re-derive that guard.
//
// This section renders ONLY inside TheCheckAct's <ActData> ready branch, so the honest-empty
// string below is unreachable on a failed or pending read.

import type { CheckItem, Verdict } from "@/hooks/useFirstReadCapture";
import CheckControl from "./CheckControl";
import SignalQuote from "@/components/evidence/SignalQuote";

// ── Client-facing copy — OPERATOR-SIGNED (Option B design gate, 2026-08-05) ──────────
// Byte-for-byte per the ruling. String 2 carries a literal em-dash (U+2014); apostrophes
// are ASCII (house style, matching the neighbouring signed strings).
export const OUTSIDE_RAISED_HEADING = "What the outside raised that you haven't spoken to";
export const OUTSIDE_RAISED_FRAMING =
  "These came up in the public record. Nothing you've shared with us so far speaks to them. That's not a criticism — it's a list of things worth taking a position on.";
export const OUTSIDE_RAISED_LABEL = "The record says:";
export const OUTSIDE_RAISED_COVERAGE = "Across everything you've shared with us to date, nothing speaks to this.";
export const OUTSIDE_RAISED_PROMPT = "Where do you land on this?";
export const OUTSIDE_RAISED_EMPTY =
  "In what we've read so far, the outside didn't raise anything you haven't already spoken to.";
// ─────────────────────────────────────────────────────────────────────────────────────

export default function OutsideRaisedSection({
  items,
  onSet,
  disabled,
}: {
  items: CheckItem[];
  onSet: (item: CheckItem, v: Verdict, correction?: string) => void;
  disabled?: boolean;
}) {
  return (
    <section className="cvs-outside-raised" aria-label={OUTSIDE_RAISED_HEADING}>
      <h3 className="cvs-outside-raised-heading">{OUTSIDE_RAISED_HEADING}</h3>
      {items.length === 0 ? (
        <p className="cvs-outside-raised-empty cvs-support">{OUTSIDE_RAISED_EMPTY}</p>
      ) : (
        <>
          <p className="cvs-outside-raised-framing">{OUTSIDE_RAISED_FRAMING}</p>
          <div className="cvs-outside-raised-list">
            {items.map((item) => {
              const d = item.delta!;
              const confirmed = item.verdict === "confirmed";
              const rejected = item.verdict === "rejected";
              const notImportant = item.verdict === "not_important";
              return (
                <div
                  key={item.identity}
                  className={`cvs-outside-raised-item${rejected ? " is-rejected" : ""}${confirmed ? " is-confirmed" : ""}${notImportant ? " is-notimportant" : ""}`}
                >
                  <p className="cvs-outside-raised-item-label">{OUTSIDE_RAISED_LABEL}</p>
                  <p className="cvs-outside-raised-item-text">{d.see}</p>
                  {/* verbatim receipt where one resolves; SignalQuote renders nothing when quote is null */}
                  <SignalQuote quote={d.quote} eventDate={d.eventDate} />
                  <p className="cvs-outside-raised-coverage">{OUTSIDE_RAISED_COVERAGE}</p>
                  <p className="cvs-outside-raised-prompt">{OUTSIDE_RAISED_PROMPT}</p>
                  <CheckControl
                    verdict={item.verdict}
                    correctionText={item.correctionText}
                    onSet={(v, c) => onSet(item, v, c)}
                    disabled={disabled}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
