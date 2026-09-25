// ── The POST-CHECK LOCATOR (parser commit 3 PR8; commit 4e N5) ───────────────────────────────────
//
// The finder returns a quote and the passage index it thinks the quote came from. Neither is trusted:
// rule 2 says the model never asserts a pointer, so the CODE decides where the quote actually sits.
//
// The ladder, in order, first hit wins. N5 (operator ruling, 2026-09-24) NAMES each rung and makes the
// locator return the SPAN it matched, because from 4e the stored raw_words is that span cut out of the
// record — never the model's quote. The rungs:
//   exact              — the quote is in the named passage character for character
//   ws                 — in the named passage once whitespace runs are collapsed
//   neighbour          — ws containment, but in another passage of the SAME WINDOW (the model's index
//                        is often one off, never far off)
//   punctuation-blind  — containment once punctuation and case are set aside, named passage then its
//                        neighbours
//   fuzzy              — LENGTH-MATCHED Sørensen-Dice at 0.85 against a sliding window of the passage
//                        the size of the quote, not against the whole passage
//
// WHY 3 AND 4 EXIST, measured on Edgewood's kickoff (108 items, 35 not_located):
//   • 28 of the 35 are recovered by punctuation/case-insensitive containment alone. The model
//     reproduces the words and normalises an apostrophe, a comma or the case; normalizeWs collapses
//     whitespace only, so exact containment misses a quote that is otherwise verbatim.
//   • the old rung 3 compared the quote to the WHOLE passage. A 60-character quote inside a
//     1,500-character passage scores ~0.29 on Dice however verbatim it is, so the rung could not fire:
//     zero of the 108 items were located by it. Measured length-matched instead, the median
//     in-passage similarity of the 35 is 0.926 and 19 of them clear 0.85.
//   • there is no paraphrase band: 0.85, 0.75 and 0.60 all recover the same 19, so the threshold
//     stays at FUZZY_THRESHOLD and the finder's quote instruction is left alone.
//
// WHY THE SPAN (N5). Edgewood item 9f5f32ba landed `located` at 0.93 on the fuzzy rung carrying the
// model's quote "We dons, that is not a thing anymore with us." The record says "We don't". Rung 3
// could not save it — looseNormalize forgives the apostrophe (don't -> "don t") but not a substituted
// letter — so the fuzzy rung found the right PLACE and the writer then stored the WRONG WORDS. A
// pointer that leads to the passage while the quote misquotes it is the defect N5 closes: the locator
// now hands back where the words are, and the caller cuts them from the record.
//
// A quote found nowhere is not_located. Under keep_and_mark it STILL LANDS, pointed at the passage the
// model named, because rule 1 says a rejected item lands marked and never missing; under located_only
// it is dropped. That choice belongs to the caller, not here — this module only reports.
import type { Passage } from "./segment.ts";
import { diceSimilarity, normalizeWs } from "./trace.ts";
import { FUZZY_THRESHOLD } from "./trace.ts";

/** N5: how the quote was found. Recorded on every item so a run can be read by rung. */
export const LOCATE_RUNGS = ["exact", "ws", "neighbour", "punctuation-blind", "fuzzy"] as const;
export type LocateRung = (typeof LOCATE_RUNGS)[number];

/** N5: a half-open character range into the matched passage's OWN text. */
export type Span = { start: number; end: number };

export type LocateOutcome = {
  /** Index into the passages array handed in — NOT the model's claim, unless they agree. */
  passage_index: number;
  trace_state: "located" | "not_located";
  /** How it was found, or why it was not. Always present. */
  reason: string;
  /** Which rung matched; null when nothing did. */
  rung: LocateRung | null;
  /** N5: where the words sit in that passage; null when nothing matched. */
  span: Span | null;
  similarity: number | null;
};

// ── normalization that REMEMBERS where every character came from ─────────────────────────────────
//
// The plain normalizers below are kept byte-identical in behaviour to what they always did, because
// other modules and the tests depend on them. The mapped variants produce the SAME string plus an
// index array: map[i] is the offset in the original text of normalized character i. That array is the
// whole trick behind cutting a span back out of the source.
type Mapped = { text: string; map: number[] };

/** Whitespace-collapsing normalization, with the original offset of every surviving character. */
export function normalizeWsMapped(s: string): Mapped {
  const src = String(s ?? "");
  let text = "";
  const map: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (/\s/.test(c)) { if (text.length) pendingSpace = true; continue; }
    if (pendingSpace) { text += " "; map.push(i); pendingSpace = false; }
    text += c; map.push(i);
  }
  return { text, map };
}

/** Lowercase, every non-alphanumeric run to one space, with the original offsets kept. */
export function looseNormalizeMapped(s: string): Mapped {
  const src = String(s ?? "");
  let text = "";
  const map: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (!/[\p{L}\p{N}]/u.test(c)) { if (text.length) pendingSpace = true; continue; }
    if (pendingSpace) { text += " "; map.push(i); pendingSpace = false; }
    text += c.toLowerCase(); map.push(i);
  }
  return { text, map };
}

/** Turn a hit at [at, at+len) in a mapped normalization back into a span of the ORIGINAL text. */
function spanFromMapped(m: Mapped, at: number, len: number): Span | null {
  if (at < 0 || len <= 0 || at + len > m.map.length) return null;
  return { start: m.map[at], end: m.map[at + len - 1] + 1 };
}

/**
 * Where does `quote` actually sit among `passages`? `claimedIndex` is what the model said and is used
 * only as the first place to look and as the fallback pointer when nothing matches.
 */
export function locateQuote(
  quote: string,
  passages: readonly Passage[],
  claimedIndex: number,
): LocateOutcome {
  const raw = String(quote ?? "");
  const q = normalizeWs(raw);
  const clamp = (i: number) => Math.min(Math.max(i, 0), Math.max(0, passages.length - 1));
  const fallback = clamp(claimedIndex);
  const miss = (reason: string, similarity: number | null): LocateOutcome =>
    ({ passage_index: fallback, trace_state: "not_located", reason, rung: null, span: null, similarity });
  if (!q || passages.length === 0) return miss("the quote is empty", null);

  const named = claimedIndex >= 0 && claimedIndex < passages.length ? claimedIndex : -1;

  // 1. exact — character for character, in the passage the model named
  if (named >= 0) {
    const at = passages[named].text.indexOf(raw.trim());
    if (at >= 0) {
      return {
        passage_index: named, trace_state: "located", rung: "exact",
        span: { start: at, end: at + raw.trim().length },
        reason: "found in the passage the finder named, character for character", similarity: 1,
      };
    }
  }
  // 2. ws — the named passage, whitespace collapsed
  if (named >= 0) {
    const m = normalizeWsMapped(passages[named].text);
    const at = m.text.indexOf(q);
    if (at >= 0) {
      return {
        passage_index: named, trace_state: "located", rung: "ws", span: spanFromMapped(m, at, q.length),
        reason: "found in the passage the finder named", similarity: 1,
      };
    }
  }
  // 3. neighbour — any other passage of this window, whitespace collapsed
  for (let i = 0; i < passages.length; i++) {
    if (i === named) continue;
    const m = normalizeWsMapped(passages[i].text);
    const at = m.text.indexOf(q);
    if (at >= 0) {
      return {
        passage_index: i, trace_state: "located", rung: "neighbour", span: spanFromMapped(m, at, q.length),
        reason: `found in a neighbouring passage of the window (the finder named ${claimedIndex})`, similarity: 1,
      };
    }
  }
  // 4. punctuation- and case-insensitive containment: the named passage first, then its neighbours
  const lqm = looseNormalizeMapped(raw);
  const lq = lqm.text;
  if (lq) {
    const order = [named, ...passages.map((_, i) => i).filter((i) => i !== named)];
    for (const i of order) {
      if (i < 0 || i >= passages.length) continue;
      const m = looseNormalizeMapped(passages[i].text);
      const at = m.text.indexOf(lq);
      if (at >= 0) {
        return {
          passage_index: i, trace_state: "located", rung: "punctuation-blind", span: spanFromMapped(m, at, lq.length),
          reason: i === named
            ? "found in the passage the finder named, once punctuation and case are set aside"
            : `found in a neighbouring passage once punctuation and case are set aside (the finder named ${claimedIndex})`,
          similarity: 1,
        };
      }
    }
  }
  // 5. length-matched fuzzy across the window
  let bestIndex = fallback, best = 0, bestSpan: Span | null = null;
  for (let i = 0; i < passages.length; i++) {
    const m = normalizeWsMapped(passages[i].text);
    const local = bestLocalMatch(q, m.text);
    if (local.similarity > best) {
      best = local.similarity; bestIndex = i;
      bestSpan = local.at >= 0 ? spanFromMapped(m, local.at, local.len) : null;
    }
  }
  if (best >= FUZZY_THRESHOLD && bestSpan) {
    return {
      passage_index: bestIndex, trace_state: "located", rung: "fuzzy", span: bestSpan,
      reason: `matched a passage at ${best.toFixed(2)} similarity`, similarity: best,
    };
  }
  return miss(
    `the quote is not in any passage of the window (best ${best.toFixed(2)}, below ${FUZZY_THRESHOLD}) — kept against the passage the finder named`,
    best,
  );
}

/** Lowercase, drop everything that is not a letter, a digit or a space, collapse the spaces. The rung-4
 *  key: it forgives an apostrophe, a comma, a dash and a capital, and nothing else. */
export function looseNormalize(s: string): string {
  return String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

/** The best Dice score between `quote` and any slice of `hay` the SAME LENGTH as the quote, together
 *  with WHERE that slice sits. Whole-text Dice is dominated by the length difference, which is what
 *  made the old rung 3 unreachable; the offset is what N5 needs to cut the words back out. */
export function bestLocalMatch(quote: string, hay: string): { similarity: number; at: number; len: number } {
  const L = quote.length;
  if (!L || hay.length < 2) return { similarity: 0, at: -1, len: 0 };
  if (hay.length <= L) return { similarity: diceSimilarity(quote, hay), at: 0, len: hay.length };
  const step = Math.max(4, Math.floor(L / 12));
  let best = 0, at = -1, len = 0;
  for (let i = 0; i + 2 <= hay.length; i += step) {
    const end = Math.min(hay.length, i + L);
    const s = diceSimilarity(quote, hay.slice(i, end));
    if (s > best) { best = s; at = i; len = end - i; }
    if (best >= 0.999) break;
  }
  return { similarity: best, at, len };
}

/** Kept as the scalar form the dedup layer uses — one notion of similarity in this pipeline. */
export function bestLocalSimilarity(quote: string, hay: string): number {
  return bestLocalMatch(quote, hay).similarity;
}

// ── N5: snapping the located span to whole sentences ─────────────────────────────────────────────
//
// The fuzzy rung matches a sliding window the SIZE of the model's quote, so its edges land wherever
// that length happens to fall — measured on Edgewood item 9f5f32ba the raw span began mid-sentence
// ("high family placement retention…") and ended one character into the next one ("… with us. M").
// R1 has said since commit 3 that a quote is whole sentences, so the span is snapped before it is cut:
// the start moves back to the boundary at or before it, and the end moves to the NEAREST boundary,
// which trims a one-character overrun rather than swallowing the sentence after it.
//
// Snapping happens INSIDE one passage's text, and a passage never spans more than one turn, so a
// snapped span cannot cross a turn boundary — which is the other half of what N5 requires.

/** Offsets just past every sentence terminator in `text`, plus the end of the text itself, plus the
 *  start of every LINE.
 *
 *  The line starts are not decoration. A passage's text carries its own speaker header ("Ada | 00:01")
 *  on the first line, and that header has no sentence terminator — so without a boundary at the body
 *  line, snapping the first sentence backwards runs past the newline and swallows the header into
 *  raw_words. Measured: it put "Client One | 00:00:04" inside the quote of every first-sentence item. */
export function sentenceBoundaries(text: string): number[] {
  const ends: number[] = [0];
  for (let i = 0; i < String(text ?? "").length; i++) if (text[i] === "\n") ends.push(i + 1);
  for (const m of String(text ?? "").matchAll(/[.?!]+(?=\s|$)/g)) {
    const at = m.index! + m[0].length;
    // step over the whitespace that follows, so a boundary is where the next sentence begins
    let j = at;
    while (j < text.length && /\s/.test(text[j])) j++;
    ends.push(j);
  }
  const n = String(text ?? "").length;
  if (ends[ends.length - 1] !== n) ends.push(n);
  return [...new Set(ends)].sort((a, b) => a - b);
}

/** Widen `span` to the whole sentences of `text` that carry it. Returns the span unchanged when the
 *  text has no sentence structure to snap to, and never returns an empty range. */
export function snapSpanToSentences(text: string, span: Span): Span {
  const bounds = sentenceBoundaries(text);
  if (bounds.length <= 2) return span;
  let start = 0;
  for (const b of bounds) { if (b <= span.start) start = b; else break; }
  let end = bounds[bounds.length - 1];
  let bestDelta = Infinity;
  for (const b of bounds) {
    if (b <= start) continue;
    const d = Math.abs(b - span.end);
    if (d < bestDelta) { bestDelta = d; end = b; }
  }
  if (end <= start) return span;
  return { start, end };
}

/** N5: the words as the RECORD has them — the located span, snapped to whole sentences and cut from
 *  the passage's own text. This, never the model's quote, is what a row stores. */
export function cutLocatedWords(passageText: string, span: Span | null): string {
  if (!span) return "";
  const snapped = snapSpanToSentences(passageText, span);
  return passageText.slice(snapped.start, snapped.end).trim();
}
