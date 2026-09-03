// OPERATOR RELEVANCE CONTROLS — SIGNED STRINGS (operator sign-off 2026-09-03, stage 3 of the durable
// relevance-override gate). One home, byte-exact, never inlined at a render site. The controls render
// ONLY under the admin preview (OperatorControlsContext, provided by FirstReadPreviewView alone); a
// client surface never sees these strings.
export const OPERATOR_STRINGS = {
  /** Control labels — tag-style text buttons in the pair's Source/Recency line. */
  spare: "Spare",
  strike: "Strike",
  withdraw: "Withdraw",
  /** Reason prompt (inline, replaces the control while open). */
  reasonEyebrow: "Why — recorded with the decision",
  reasonPlaceholder: "One line the next reader can act on",
  record: "Record",
  cancel: "Cancel",
  /** Operator-only block under a statement, listing the pairs the machine struck. */
  struckBlockEyebrow: "Struck by the machine — operator view",
  /** Who decided a machine strike, prefixed to the stored relevance_reason. */
  routerPrefix: "Router · ",
  judgePrefix: "Judge · ",
} as const;

/** Provenance tag on an operator-decided pair: "Operator · spared · September 3, 2026". */
export function operatorProvenanceLabel(verdict: "relevant" | "orthogonal", fullDate: string | null): string {
  const word = verdict === "relevant" ? "spared" : "struck";
  return fullDate ? `Operator · ${word} · ${fullDate}` : `Operator · ${word}`;
}

/** DOM markers the guards assert on (structure, never text). */
export const OPERATOR_MARK = {
  attr: "data-fr-operator",
  controls: "relevance-controls",
  struck: "struck-pairs",
} as const;
