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

// ── THE TEXT-ONLY NOTE (IR6, signed 2026-10-01) ──────────────────────────────────────────────────
//
// Every line above that reports a silence about the company — "Nothing we've read so far speaks to
// this", "What we haven't found yet", "Scanned {date} — none found" — was honest when nothing could
// read an image. It is not honest about COVERAGE: the read strips every tag with its attributes
// (extractTextBasic, public-baseline/index.ts:185 and _shared/fetchAndExtract.ts:18), fetches no
// image bytes, and sends a text-only prompt to the web_search lane. Words on a flyer, an event
// graphic or a quote card are not read and never were.
//
// So wherever such a silence renders, this note renders beside it, ONCE per section — never per row,
// never twice in a section. It is a statement about what the read covers, not about the company, so
// it carries no mark control and is not markable (FM15), and no census or parity spec counts it as
// a row.
//
// THE EXISTING SIGNED STRINGS ARE UNCHANGED. This note is additive.
export const TEXT_ONLY_NOTE = "We read text only. Words inside images, such as flyers, aren't read yet.";

/** One row of a say-vs-see group, reduced to what the silence test needs. */
export type SilenceProbeRow = { readonly see?: string | null };

/**
 * Does this group render at least one silence string, and therefore take the note?
 *
 * TRUE for publicly_silent always: its heading ("What we haven't found yet") is itself a silence
 * claim and every one of its rows renders SILENT_SEE_LINE by definition.
 * TRUE for echoed / divergent only when a row has no see side — the same `silent` test the row
 * components and the export each apply (DeltaItemRow.tsx:28, FeaturedExhibitCard, exportHtml:223).
 *
 * Shared so the screen and the leave-behind can never disagree about where the note belongs.
 */
export function groupShowsSilence(key: SayVsSeeGroupKey, rows: readonly SilenceProbeRow[]): boolean {
  if (key === "publicly_silent") return true;
  return rows.some((r) => !r.see);
}

/** The same silence test for a SINGLE row (the featured lead card shows one item, not a group). */
export function rowShowsSilence(key: SayVsSeeGroupKey | string, row: SilenceProbeRow): boolean {
  return key === "publicly_silent" || !row.see;
}
