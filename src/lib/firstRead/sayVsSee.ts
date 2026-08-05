// V2-7 — Act 4 "Where the customer agrees — and where they don't": the say-vs-see
// exhibit copy. Single-sourced so the screen (SayVsSeeExhibit) and the leave-behind
// (exportHtml) render the SAME group headings, labels, and honest-absence lines and can
// never diverge. Registers never blend silently: the SAY side and the SEE side render
// explicitly labeled. All strings below are client-facing DRAFTS — PENDING OPERATOR
// SIGNATURE. (The Check verdict copy + tally labels are already signed elsewhere.)

// The three say-anchored delta groups, in order. (internally_silent — the outside says
// something you didn't declare — has no say side and is NOT part of this exhibit.)
export type SayVsSeeGroupKey = "echoed" | "divergent" | "publicly_silent";

export interface SayVsSeeGroupCopy {
  key: SayVsSeeGroupKey;
  heading: string;
  /** honest-absence line when the group has no items — PENDING SIGNATURE. */
  empty: string;
}

export const SAY_VS_SEE_GROUPS: readonly SayVsSeeGroupCopy[] = [
  { key: "echoed", heading: "Where the outside echoes you",
    empty: "Nothing we've read so far repeats back what you've told us." },
  { key: "divergent", heading: "Where the outside disagrees",
    empty: "Nothing we've read so far contradicts what you've told us." },
  { key: "publicly_silent", heading: "What we haven't found yet",
    empty: "Everything you've told us turned up somewhere in what we've read." },
] as const;

export const sayVsSeeGroup = (key: SayVsSeeGroupKey): SayVsSeeGroupCopy =>
  SAY_VS_SEE_GROUPS.find((g) => g.key === key)!;

// The two register labels — the say side (your declared words) and the see side (the
// public record's reading). Rendered explicitly so the registers never blend. PENDING.
export const SAY_LABEL = "You say";
export const SEE_LABEL = "The record shows";

// The per-item see-side line for a publicly_silent item (no public claim exists). PENDING.
export const SILENT_SEE_LINE = "Nothing we've read so far speaks to this.";

// publicly_silent items double as the open-question bridge (V2-4). A LIGHT connective
// line — no duplicate list. PENDING SIGNATURE.
export const SILENT_BRIDGE_NOTE = "These are also the open questions we'll leave you with.";
