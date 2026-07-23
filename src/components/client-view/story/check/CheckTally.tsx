// First Read · Act 3 (The Check) — live session tally.
//
// The pitch stat, live: confirmed / refined / wrong / set aside. Derived directly
// from the session's response rows (see useFirstReadCapture). "corrected" verdicts
// read as "refined"; "not_important" reads as "set aside" — the client-facing framing.

import type { CaptureTally } from "@/hooks/useFirstReadCapture";

// OC-2c — the fourth verdict's tally label. DRAFT copy PENDING OPERATOR SIGNATURE
// (house pattern); operator signs "set aside" at acceptance.
const SET_ASIDE_LABEL = "set aside";

export default function CheckTally({ tally }: { tally: CaptureTally }) {
  return (
    <p className="cvs-check-tally">
      <span className="cvs-check-tally-n">{tally.confirmed}</span> confirmed
      {" · "}
      <span className="cvs-check-tally-n">{tally.corrected}</span> refined
      {" · "}
      <span className="cvs-check-tally-n">{tally.rejected}</span> wrong
      {" · "}
      <span className="cvs-check-tally-n">{tally.not_important}</span> {SET_ASIDE_LABEL}
    </p>
  );
}
