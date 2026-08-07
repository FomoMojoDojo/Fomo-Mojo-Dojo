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

// ── ROLLUP Gate 2 — theme LEAD lines (operator-signed 2026-08-08, byte-exact) ────────────────
// A theme with a featured item leads with its lead line + the featured exhibit card. Theme 1
// (say-vs-see) leads with the curated tension and needs no lead line here. THEME_2 carries {N}
// (the count of outside-raised items); THEME_3 is fixed.
// THEME 1's operator-chosen/ratified FALLBACK lead (say-vs-see pointer only; the curated tension
// keeps its own curation language). Operator-signed 2026-08-08, byte-exact.
export const THEME_1_LEAD = "Of everything you say and the record says back, start here:";
const THEME_2_LEAD_TEMPLATE =
  "The public record raised {N} things you haven't yet spoken to. This is the one worth starting with:";
export const THEME_3_LEAD = "From everything we read, this is what stood up. The one that matters most:";

/** THEME_2 lead line with the count substituted. One home for the substitution. */
export function theme2Lead(count: number): string {
  return THEME_2_LEAD_TEMPLATE.replace("{N}", String(count));
}

// INTERNAL / PRESENTER-ONLY (never client-facing). Operator-signed 2026-08-08, byte-exact.
export const NO_FEATURED_PROMPT = "No featured item picked for this theme yet — expand the list and choose one.";
export const FEATURED_MISSING_PROMPT = "The featured item for this theme no longer exists — pick a new one.";
export const FEATURE_THIS_LABEL = "Feature this";

// ── ROLLUP Gate 2.5 — auto-default framing (operator-signed 2026-08-08, byte-exact) ──────────
// An AUTO default renders QUIETLY under this NEUTRAL line — never the operator-choice leads
// (THEME_1/2/3_LEAD). It carries NO meta-line and NO ratify button (AMENDMENT 1, 2026-08-08):
// featuring another item is the only visible action; origin flips to 'operator' (+ its signed
// choice lead) only then. The honesty hinge stays: the system says "where we'd start", never
// "we chose". (The judge's one-line reason still renders, in the italic meta style — AMENDMENT 2.)
export const THEME_AUTO_LEAD = "Where we'd start:";

/** The "…and N more like this" toggle label for a given count. One home for the substitution so
 *  the label can never drift between the screen and any future leave-behind. */
export function moreLabel(count: number): string {
  return MORE_LABEL_TEMPLATE.replace("{N}", String(count));
}
