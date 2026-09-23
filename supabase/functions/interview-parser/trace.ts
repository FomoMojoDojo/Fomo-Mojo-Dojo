// ── TRACE (parser commit 2, rules 2026-09-22.1 — rule 2, "trace verifies the pointer, not the words")
//
// Pure. Given the record's stored text and an item's pointer, decide whether the passage the pointer
// names is still there. It checks the POINTER — the line range and the passage sha — never the item's
// framework statement and never the model's opinion.
//
// The record's own sha is checked FIRST. A pointer is a pointer INTO a particular text; if the stored
// text is not the text the pointer was cut from, every line number below it is meaningless, and
// answering "located" from a line range that happens to hash the same would be a false positive.
import { sha256Hex } from "../_shared/contentIdentity.ts";
import type { ItemPointer } from "../_shared/interviewItems.ts";
import type { MatchTolerance } from "./rules.ts";

export type TraceState = "located" | "not_located";
export type TraceResult = {
  state: TraceState;
  /** Always present, on located and not_located alike — the same contract the judge has. */
  reason: string;
  /** The similarity actually measured, for fuzzy_0_85; null for exact and ws. */
  similarity: number | null;
};

export const FUZZY_THRESHOLD = 0.85;

/** Whitespace normalization for the `ws` tolerance: runs of whitespace collapse, ends trimmed. */
export const normalizeWs = (s: string): string => s.replace(/\s+/g, " ").trim();

/**
 * Similarity for `fuzzy_0_85`: the SØRENSEN–DICE coefficient over character BIGRAMS —
 * 2 × |shared bigrams| / (|a bigrams| + |b bigrams|), computed on the whitespace-normalized text with
 * multiset semantics (a bigram occurring twice in both counts twice).
 *
 * Chosen over Levenshtein because it is O(n) rather than O(n²) — a passage runs to MAX_PASSAGE_CHARS
 * = 1500, and trace runs over every item on every revisit. It is insensitive to word ORDER, which is
 * the right trade here: a re-worded passage that keeps its words is the case we want to keep locating,
 * and a passage that shares no phrasing scores near zero either way.
 */
export function diceSimilarity(a: string, b: string): number {
  const A = normalizeWs(a), B = normalizeWs(b);
  if (A === B) return 1;
  if (A.length < 2 || B.length < 2) return 0;
  const counts = new Map<string, number>();
  for (let i = 0; i < A.length - 1; i++) {
    const g = A.slice(i, i + 2);
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  let shared = 0;
  for (let i = 0; i < B.length - 1; i++) {
    const g = B.slice(i, i + 2);
    const n = counts.get(g) ?? 0;
    if (n > 0) { shared++; counts.set(g, n - 1); }
  }
  return (2 * shared) / ((A.length - 1) + (B.length - 1));
}

/** The passage the pointer names, taken from the stored text by LINE RANGE, 1-based inclusive. */
export function passageAt(recordText: string, pointer: Pick<ItemPointer, "line_start" | "line_end">): string | null {
  const lines = recordText.split("\n");
  if (pointer.line_start < 1 || pointer.line_end < pointer.line_start || pointer.line_end > lines.length) return null;
  return lines.slice(pointer.line_start - 1, pointer.line_end).join("\n");
}

/**
 * Does the pointer still find its passage?
 *   exact       — the sha of the line range equals pointer.passage_sha256
 *   ws          — equal after whitespace normalization
 *   fuzzy_0_85  — Dice similarity on the normalized text ≥ 0.85
 * `expectedText` is the passage as it read at landing (an item's raw passage). It is needed for `ws`
 * and `fuzzy` because a sha cannot be compared loosely; `exact` never uses it.
 */
export async function locatePassage(
  recordText: string,
  pointer: ItemPointer,
  tolerance: MatchTolerance,
  recordTextSha256: string,
  expectedText?: string,
): Promise<TraceResult> {
  const actualSha = await sha256Hex(recordText);
  if (actualSha !== recordTextSha256) {
    return { state: "not_located", reason: "record text changed since landing — the pointer addresses a text that is no longer stored", similarity: null };
  }
  const found = passageAt(recordText, pointer);
  if (found === null) {
    return { state: "not_located", reason: `line range ${pointer.line_start}-${pointer.line_end} is outside the stored text`, similarity: null };
  }
  const foundSha = await sha256Hex(found);
  if (foundSha === pointer.passage_sha256) {
    return { state: "located", reason: "the line range hashes to the pointer's passage sha", similarity: tolerance === "fuzzy_0_85" ? 1 : null };
  }
  if (tolerance === "exact") {
    return { state: "not_located", reason: "the line range no longer hashes to the pointer's passage sha", similarity: null };
  }
  if (expectedText === undefined) {
    return { state: "not_located", reason: "the sha differs and no landing text was supplied to compare against", similarity: null };
  }
  if (normalizeWs(found) === normalizeWs(expectedText)) {
    return { state: "located", reason: "the passage matches once whitespace is normalized", similarity: tolerance === "fuzzy_0_85" ? 1 : null };
  }
  if (tolerance === "ws") {
    return { state: "not_located", reason: "the passage differs by more than whitespace", similarity: null };
  }
  const similarity = diceSimilarity(found, expectedText);
  return similarity >= FUZZY_THRESHOLD
    ? { state: "located", reason: `the passage is ${similarity.toFixed(2)} similar, at or above the ${FUZZY_THRESHOLD} threshold`, similarity }
    : { state: "not_located", reason: `the passage is ${similarity.toFixed(2)} similar, below the ${FUZZY_THRESHOLD} threshold`, similarity };
}
