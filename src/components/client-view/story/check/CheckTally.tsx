// First Read · Act 3 (The Check) — live session tally.
//
// The pitch stat, live: confirmed / refined / wrong / set aside. Derived directly
// from the session's response rows (see useFirstReadCapture). "corrected" verdicts
// read as "refined"; "not_important" reads as "set aside" — the client-facing framing.

import { Fragment } from "react";
import type { CaptureTally } from "@/hooks/useFirstReadCapture";
// Segment labels (incl. the OPERATOR-SIGNED "set aside") are single-sourced with the
// export in checkItemView.ts so the screen and the leave-behind can never diverge.
import { TALLY_SEGMENTS } from "@/lib/firstRead/checkItemView";

export default function CheckTally({ tally }: { tally: CaptureTally }) {
  return (
    <p className="cvs-check-tally">
      {TALLY_SEGMENTS.map((seg, i) => (
        <Fragment key={seg.key}>
          {i > 0 ? " · " : null}
          <span className="cvs-check-tally-n">{tally[seg.key]}</span> {seg.label}
        </Fragment>
      ))}
    </p>
  );
}
