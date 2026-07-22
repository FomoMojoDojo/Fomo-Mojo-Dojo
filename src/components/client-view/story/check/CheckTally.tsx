// First Read · Act 3 (The Check) — live session tally.
//
// The pitch stat, live: confirmed / refined / wrong. Derived directly from the
// session's response rows (see useFirstReadCapture). "corrected" verdicts read
// as "refined" here — the client-facing framing.

import type { CaptureTally } from "@/hooks/useFirstReadCapture";

export default function CheckTally({ tally }: { tally: CaptureTally }) {
  return (
    <p className="cvs-check-tally">
      <span className="cvs-check-tally-n">{tally.confirmed}</span> confirmed
      {" · "}
      <span className="cvs-check-tally-n">{tally.corrected}</span> refined
      {" · "}
      <span className="cvs-check-tally-n">{tally.rejected}</span> wrong
    </p>
  );
}
