// ── RECORD PAGE WORDS ON THE PAGE (operator ruling 2026-10-22, items 3 + 4) ─────────────────────────────────────────────
//
// A gap row and a "raised by the record" row show the RECORD's own words. Before this, the render showed a record only
// when its excerpt was a substring of the signal's claim_text — the pre-b2 shape. Since b2, claim_text may be our summary
// and evidence_excerpt is the page's words (on the web_search lane: the tool's cited_text), so the substring test refused
// every web_search-lane record and no record line ever rendered. The authority is now R5's: the excerpt shows when it is
// VERIFIED PAGE WORDS (excerptIsVerifiedPageWords — the mint guard traced it, an own-site slice, or a passed
// excerpt_verifications record set by annotateVerifiedExcerpts). Otherwise there is no record line. The quote warrant
// still decides quotation marks; this decides only whether words show.
//
// cited_text is STORED AS IS. The render strips markdown MARKUP CHARACTERS only — heading #s, emphasis *s, leading list
// markers — and never a word character: stripRecordMarkup(x) keeps every letter and digit of x, in order
// (wordCharacters(stripRecordMarkup(x)) === wordCharacters(x)), which the guard checks.

import { excerptIsVerifiedPageWords } from "./classSourcingScope.ts";

/** Every letter and digit of `text`, in order — the invariant the markup strip must preserve. */
export function wordCharacters(text: string): string {
  return String(text ?? "").replace(/[^\p{L}\p{N}]/gu, "");
}

/** Markdown markup out, words kept: line-leading heading #s and list markers (- * + •, repeated), every *, then the lines
 *  joined by single spaces (the record renders as one paragraph). */
export function stripRecordMarkup(text: string): string {
  const lines = String(text ?? "").split(/\r?\n/).map((line) => line
    .replace(/^\s*#{1,6}(?=\s|$)/, "")                  // heading marker
    .replace(/^(\s*[-*+•](?=\s|$))+/, "")               // leading list markers, incl. "- -"
    .replace(/\*+/g, "")                                // emphasis / bold markers anywhere
    .replace(/\s+/g, " ").trim());
  return lines.filter((l) => l.length > 0).join(" ");
}

/** The record words a row renders, or null (no record line): verified page words, markup stripped. */
export function recordWordsForRender(sig: Readonly<Record<string, unknown>> | null | undefined): string | null {
  if (!sig) return null;
  const excerpt = String(sig.evidence_excerpt ?? "").trim();
  if (!excerpt) return null;
  if (sig.structure_level === "interpreted") return null;   // synthesized signal text is never the record's words
  if (!excerptIsVerifiedPageWords(sig)) return null;
  const words = stripRecordMarkup(excerpt);
  return words || null;
}
