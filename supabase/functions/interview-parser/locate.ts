// ── The POST-CHECK LOCATOR (parser commit 3, PR8) ────────────────────────────────────────────────
//
// The finder returns a quote and the passage index it thinks the quote came from. Neither is trusted:
// rule 2 says the model never asserts a pointer, so the CODE decides where the quote actually sits.
//
// The ladder, in order, first hit wins (R1, operator ruling 2026-09-23):
//   1. the passage the model named, whitespace-normalized containment
//   2. the other passages of the SAME WINDOW (the model's index is often one off, never far off)
//   3. PUNCTUATION- AND CASE-INSENSITIVE containment, the named passage then its neighbours
//   4. LENGTH-MATCHED fuzzy at 0.85 — Sørensen-Dice against a sliding window of the passage the size
//      of the quote, not against the whole passage
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
// A quote found nowhere is not_located. Under keep_and_mark it STILL LANDS, pointed at the passage the
// model named, because rule 1 says a rejected item lands marked and never missing; under located_only
// it is dropped. That choice belongs to the caller, not here — this module only reports.
import type { Passage } from "./segment.ts";
import { diceSimilarity, normalizeWs } from "./trace.ts";
import { FUZZY_THRESHOLD } from "./trace.ts";

export type LocateOutcome = {
  /** Index into the passages array handed in — NOT the model's claim, unless they agree. */
  passage_index: number;
  trace_state: "located" | "not_located";
  /** How it was found, or why it was not. Always present. */
  reason: string;
  similarity: number | null;
};

/**
 * Where does `quote` actually sit among `passages`? `claimedIndex` is what the model said and is used
 * only as the first place to look and as the fallback pointer when nothing matches.
 */
export function locateQuote(
  quote: string,
  passages: readonly Passage[],
  claimedIndex: number,
): LocateOutcome {
  const q = normalizeWs(quote);
  const clamp = (i: number) => Math.min(Math.max(i, 0), Math.max(0, passages.length - 1));
  const fallback = clamp(claimedIndex);
  if (!q || passages.length === 0) {
    return { passage_index: fallback, trace_state: "not_located", reason: "the quote is empty", similarity: null };
  }
  // 1. the passage the model named
  if (claimedIndex >= 0 && claimedIndex < passages.length && normalizeWs(passages[claimedIndex].text).includes(q)) {
    return { passage_index: claimedIndex, trace_state: "located", reason: "found in the passage the finder named", similarity: 1 };
  }
  // 2. any other passage of this window
  for (let i = 0; i < passages.length; i++) {
    if (i === claimedIndex) continue;
    if (normalizeWs(passages[i].text).includes(q)) {
      return { passage_index: i, trace_state: "located", reason: `found in a neighbouring passage of the window (the finder named ${claimedIndex})`, similarity: 1 };
    }
  }
  // 3. punctuation- and case-insensitive containment: the named passage first, then its neighbours
  const lq = looseNormalize(quote);
  if (lq) {
    const order = [claimedIndex, ...passages.map((_, i) => i).filter((i) => i !== claimedIndex)];
    for (const i of order) {
      if (i < 0 || i >= passages.length) continue;
      if (looseNormalize(passages[i].text).includes(lq)) {
        return {
          passage_index: i,
          trace_state: "located",
          reason: i === claimedIndex
            ? "found in the passage the finder named, once punctuation and case are set aside"
            : `found in a neighbouring passage once punctuation and case are set aside (the finder named ${claimedIndex})`,
          similarity: 1,
        };
      }
    }
  }
  // 4. length-matched fuzzy across the window
  let bestIndex = fallback, best = 0;
  for (let i = 0; i < passages.length; i++) {
    const s = bestLocalSimilarity(q, normalizeWs(passages[i].text));
    if (s > best) { best = s; bestIndex = i; }
  }
  if (best >= FUZZY_THRESHOLD) {
    return { passage_index: bestIndex, trace_state: "located", reason: `matched a passage at ${best.toFixed(2)} similarity`, similarity: best };
  }
  return {
    passage_index: fallback,
    trace_state: "not_located",
    reason: `the quote is not in any passage of the window (best ${best.toFixed(2)}, below ${FUZZY_THRESHOLD}) — kept against the passage the finder named`,
    similarity: best,
  };
}

/** Lowercase, drop everything that is not a letter, a digit or a space, collapse the spaces. The rung-3
 *  key: it forgives an apostrophe, a comma, a dash and a capital, and nothing else. */
export function looseNormalize(s: string): string {
  return String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

/** The best Dice score between `quote` and any slice of `hay` the SAME LENGTH as the quote. Whole-text
 *  Dice is dominated by the length difference, which is what made the old rung 3 unreachable. */
export function bestLocalSimilarity(quote: string, hay: string): number {
  const L = quote.length;
  if (!L || hay.length < 2) return 0;
  if (hay.length <= L) return diceSimilarity(quote, hay);
  const step = Math.max(4, Math.floor(L / 12));
  let best = 0;
  for (let i = 0; i + 2 <= hay.length; i += step) {
    const s = diceSimilarity(quote, hay.slice(i, Math.min(hay.length, i + L)));
    if (s > best) best = s;
    if (best >= 0.999) break;
  }
  return best;
}
