// First Read ROLLUP (Gate 1) — the theme-overview copy. Operator-signed 2026-08-08.
//
// The Check act rolls its items into THREE themed overviews so the meeting shows demonstrated
// insight, not a wall of per-item choices. Each theme: a plain headline + (Gate 2) an operator-set
// featured exhibit + a collapsed "…and N more like this" tail whose framing tells the client
// nothing here needs a decision today. Batteries stay until Gate 3; the tail is read-only in spirit.
//
// Strings are BYTE-EXACT to the operator's signature. Do not reword, shorten, or re-punctuate.
// (The ellipsis is a single U+2026 character, matching the house style of the neighbouring copy.)

export const THEME_1_HEADLINE = "What you say, and what the record says back"; // say-vs-see deltas
export const THEME_2_HEADLINE = "What the outside raised that you haven't spoken to"; // internally_silent
export const THEME_3_HEADLINE = "What we found"; // findings (+ differentiators fold in)

// The collapsed-tail toggle. {N} is the count of items behind the fold.
const MORE_LABEL_TEMPLATE = "…and {N} more like this";
export const EXPANSION_FRAMING =
  "The full set, for when the conversation goes deeper. Nothing here needs a decision today.";

// The single in-room ask on the 3-5 featured items (wired in Gate 3; defined here so all First
// Read theme copy has one home).
export const ASK_MOMENT_PROMPT = "Where do you land on this?";

/** The "…and N more like this" toggle label for a given count. One home for the substitution so
 *  the label can never drift between the screen and any future leave-behind. */
export function moreLabel(count: number): string {
  return MORE_LABEL_TEMPLATE.replace("{N}", String(count));
}
