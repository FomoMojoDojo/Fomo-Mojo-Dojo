// ── The POST-CHECK LOCATOR (parser commit 3, PR8) ────────────────────────────────────────────────
//
// The finder returns a quote and the passage index it thinks the quote came from. Neither is trusted:
// rule 2 says the model never asserts a pointer, so the CODE decides where the quote actually sits.
//
// The ladder, in order, first hit wins:
//   1. the passage the model named, whitespace-normalized containment
//   2. the other passages of the SAME WINDOW (the model's index is often one off, never far off)
//   3. fuzzy_0_85 over the window's passages — Sørensen-Dice on the normalized text
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
  // 3. fuzzy across the window
  let bestIndex = fallback, best = 0;
  for (let i = 0; i < passages.length; i++) {
    const s = diceSimilarity(passages[i].text, quote);
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
