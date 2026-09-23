// ── The interview parser RULES (operator rulings PR1–PR6, signed 2026-09-22) ──────────────────────
//
// The design these serve is Part I, signed 2026-09-19: a LOCAL pipeline, separate from the Dify file
// analysis — segment the transcript into passages, find typed items (job, pain point, desire,
// outcome), convert each to framework form, let a judge annotate and never drop, and land every item
// once in interview_items.
//
// The version below is stamped on every row the parser writes. Bump it when any rule text changes:
// a row then says which rules produced it, and rows written under an older version stand as history
// rather than being re-interpreted under rules they never saw.
export const PARSER_RULES_VERSION = "2026-09-23.2";

/** R6 (operator ruling, 2026-09-23) — SUPERSESSION. Parsing a record whose live items carry an OLDER
 *  rules_version retracts every one of them first, with the reason below, then lands the new set; a
 *  same-version parse stays idempotent (rule 5). Retracted rows are kept: they are the history of what
 *  the older rules produced, and the audit reads the pair. */
export const supersededReason = (version: string = PARSER_RULES_VERSION): string => `superseded by rules ${version}`;
/** R7 — the one case where a SAME-version parse is not a no-op: our_speakers changed under it. */
export const SIDE_CHANGED_REASON = "speaker side changed";

/** The five rules, verbatim. interviewParserRules.test.ts pins each string and the count. */
export const PARSER_RULES = [
  "Breadth, never drop: every candidate item lands; the judge annotates with a reason on pass and on reject; a rejected item lands marked, never missing.",
  "Pointer over wording: a passage pointer is computed by the code (turn index, line range, passage sha256) against the record's stored text sha; the model never asserts offsets; trace verifies the pointer, not the words.",
  "The executor's words: raw words are stored verbatim with their speaker label; the framework statement is derived and judged under the current criterion (job statements under solution-agnostic v3 with the deterministic means layer; needs under the ODI canonical form); no hand-authored statement ever enters a row.",
  "Unvalidated and unreviewed on landing; \"Mark reviewed\" never sets validated; public-register and external writers never read items; local generators may.",
  "One landing per item, keyed by content identity so a re-parse is idempotent; retiring the record withdraws every item it produced.",
] as const;

/** Rule 2 is the one the P6 probe forced: asked for character offsets over a 12,000-char window, the
 *  local model returned 116 spans of which 34 fell outside the window or inverted. An offset a model
 *  asserts is not evidence, so the pointer is computed by the code and trace re-checks the pointer. */
export const POINTER_IS_CODE_COMPUTED = true;

/** Per-record strictness (a per-company admin setting, stored on each record). */
export const STRICTNESS = ["keep_and_mark", "located_only"] as const;
/** How a pointer's passage is matched back to the stored text when trace re-checks it. */
export const MATCH_TOLERANCE = ["exact", "ws", "fuzzy_0_85"] as const;
export type Strictness = (typeof STRICTNESS)[number];
export type MatchTolerance = (typeof MATCH_TOLERANCE)[number];
