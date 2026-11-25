// ── THE SENTENCE OF A QUOTE THAT HOLDS A SPAN (SP-665, 2026-11-24) ───────────────────────────────
//
// The pattern band used to show the START of the representative quote. For a long review the lines a
// reader saw could hold none of the evidence: the judge's span sat further down. v3 stores that span
// (need_pattern_quotes.states_span — verbatim in the quote, pattern-citation-guard (c9)), so the band
// shows the sentence that holds it, with the span's exact words marked — and, since SP-668
// (2026-11-25), the one sentence before it, so the marked words keep their footing.
//
// NOTHING HERE WRITES TEXT. Every character returned is a slice of the quote it was given; the caller
// adds the visible ellipsis where a slice leaves text out (SP-443: a quote shows in full or with a
// visible ellipsis, never silently cut). A span that is not in the quote returns null, and the caller
// shows the quote as it did before.

/** A quote this short is shown whole, span marked. About three lines at the band's width. */
export const SPAN_QUOTE_SHORT_CHARS = 240;

export type SpanExcerpt = {
  before: string;
  /** The span's exact words, as they sit in the quote. */
  marked: string;
  after: string;
  /** The excerpt does not start at the quote's start / end at the quote's end. */
  cutStart: boolean;
  cutEnd: boolean;
};

/** Where each sentence of `text` ends: after its closing punctuation (and any closing quote or
 *  bracket), or at a line break. The last sentence ends at the end of the text. */
function sentenceEnds(text: string): number[] {
  const ends: number[] = [];
  const re = /[.!?]+["'”’)\]]*(?=\s|$)|\n+/g;
  for (let m = re.exec(text); m; m = re.exec(text)) ends.push(m.index + m[0].length);
  if (ends[ends.length - 1] !== text.length) ends.push(text.length);
  return ends;
}

export function spanExcerpt(text: string | null | undefined, span: string | null | undefined, shortChars = SPAN_QUOTE_SHORT_CHARS): SpanExcerpt | null {
  const t = String(text ?? "");
  const s = String(span ?? "");
  if (!t || !s.trim()) return null;
  const at = t.indexOf(s);
  if (at < 0) return null;
  const spanEnd = at + s.length;
  let from = 0, to = t.length;
  if (t.length > shortChars) {
    // the sentence(s) the span touches — the first is the one that closes after the span's first
    // character, the last the first that closes at or after its last one — plus the ONE sentence
    // immediately before the first of them, when there is one (SP-668: a sentence alone can lose what
    // "that" or "the charges" referred to). A stretch of white space between two ends is no sentence.
    const sentences: Array<[number, number]> = [];
    let start = 0;
    for (const e of sentenceEnds(t)) { if (t.slice(start, e).trim()) sentences.push([start, e]); start = e; }
    const first = sentences.findIndex(([, e]) => e > at);
    const last = sentences.findIndex(([, e]) => e >= spanEnd);
    from = first < 0 ? 0 : sentences[Math.max(first - 1, 0)][0];
    to = last < 0 ? t.length : sentences[last][1];
    while (from < at && /\s/.test(t[from])) from++;
    while (to > spanEnd && /\s/.test(t[to - 1])) to--;
  }
  return { before: t.slice(from, at), marked: t.slice(at, spanEnd), after: t.slice(spanEnd, to), cutStart: from > 0, cutEnd: to < t.length };
}
