// First-read marks — the signed strings (operator, 2026-09-22, commit 2 fix pass). Every visible word of the mark
// affordance and the "What we heard" beat comes from here; marks.strings.test.ts pins them. S6 is reused
// from the interview door for a failed save. The kind name client_reaction stays in the DB; it is never shown.
export const MARK_STRINGS = {
  /** The three reaction choices (a client reaction's disposition), in box order. */
  interesting: "Interesting",
  important: "Important",
  notImportant: "Not important",
  /** Our kind. */
  stoodOut: "Stood out to us",
  /** The x button of the box (aria-label). */
  close: "Close",
  /** The permanent withdraw. */
  withdraw: "Withdraw mark (permanent)",
  /** The beat. */
  whatWeHeard: "What we heard",
  /** S6 (signed 2026-09-21) — reused: a save that did not land. */
  saveFailed: "That didn't save. Try again.",
} as const;

/** The reaction choices of the box, in box order (single choice; nothing preselected — FM18). */
export const REACTION_CHOICES = [
  { disposition: "interesting", label: MARK_STRINGS.interesting },
  { disposition: "important", label: MARK_STRINGS.important },
  { disposition: "not_important", label: MARK_STRINGS.notImportant },
] as const;
/** The groups of "What we heard", in order: Important · Interesting · Not important · Stood out to us. */
export const HEARD_GROUP_ORDER = ["important", "interesting", "not_important", "our_mark"] as const;
/** The withdraw reason stored on every operator withdraw from the page. */
export const WITHDRAW_REASON = "operator_withdrew_mark";
