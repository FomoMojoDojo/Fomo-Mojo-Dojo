// THE WITHHELD-ASSESSMENT COPY (S-DRIFT-1, S-DRIFT-2 — signed 2026-11-12).
//
// WHY A STRINGS FILE. A drift assessment can now end in 'withheld': the surface's new evidence
// contains at least one row that is not public, so the judgement was NOT sent to an outside model
// and no verdict exists. Before this, such a row could only have been written as 'aligned' — a
// verdict nobody made, shown to a reader as if it were one.
//
// Two readers, two registers. The badge and the inbox carry the short label; the detail panel is the
// one place with room to say WHY, and it says it plainly: the documents are private, and private
// documents are not sent to an outside model. Neither line says "error" or "failed", because nothing
// failed — the system declined, by design.
//
// These strings are rendered from here and checked verbatim by driftStrings.parity.test.ts. A string
// only stays signed while something checks it.
export const DRIFT_STRINGS = {
  /** S-DRIFT-1 — the badge and the inbox row label for a withheld assessment. */
  withheldLabel: "Not assessed",
  /**
   * S-DRIFT-2 — the detail panel, where there is room for the reason.
   *
   * REVISED AND RE-SIGNED 2026-11-12 (SP-124). The first wording said "This rests on private
   * documents, and private documents are not sent to an outside model." That is FALSE for a large
   * share of the cases that reach it: signalProvenance returns null both for an upload-derived row
   * AND for an outside-band row whose voice is `analysis` or NULL — our own reading of a public
   * page, which is not a private document at all. A public-only company holding analysis-voice
   * signals would have been told its evidence was private. The replacement states the fact that is
   * true of every withheld case — the evidence is not cleared to send — and claims nothing about
   * where it came from.
   */
  withheldDetail:
    "Not assessed. Some of this evidence is not cleared to send to an outside model.",
} as const;

/**
 * The reason a judgement was withheld (SP-124). Recorded on the row and the integrity run, never
 * shown to a reader: the copy above is deliberately the same in both cases, because the distinction
 * matters to an operator reading the ledger and not to someone reading the surface.
 *   private_evidence     at least one candidate signal is NOT outside-band — an uploaded document,
 *                        an intake note, anything whose origin is the company's own material.
 *   unlabelled_evidence  every candidate is outside-band, but at least one carries voice `analysis`
 *                        or NULL — our own reading of a public source, which the router declines to
 *                        treat as the public record.
 */
export const WITHHELD_REASON = {
  privateEvidence: "private_evidence",
  unlabelledEvidence: "unlabelled_evidence",
} as const;

/** The one state name the three readers test against, so no reader spells it itself. */
export const DRIFT_STATE_WITHHELD = "withheld";

/** True for the state that carries no verdict and no score. Neither aligned nor drift. */
export function isWithheld(driftState: string | null | undefined): boolean {
  return driftState === DRIFT_STATE_WITHHELD;
}
