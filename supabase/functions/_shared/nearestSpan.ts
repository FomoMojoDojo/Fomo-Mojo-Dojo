// ── R27 (operator ruling 2026-10-18): WHEN e4 REFUSES A CANDIDATE, NAME THE PAGE SPAN IT CAME CLOSEST TO ──
//
// A refused candidate used to leave an 80-char prefix and a code. The architect's eye review of pilot 2 had to
// re-derive by hand that "The company has maintained…" was the page's "This company has maintained…" with one
// word changed. This finds the longest common substring between the candidate and the page on the SAME
// normalization e4 uses (normalizeForHash: lowercase, whitespace collapsed), and reports that span as the raw
// page carries it, with its offset in the raw page text. Deterministic; no model.
import { normalizeForHash } from "./contentIdentity.ts";

export type NearestSpan = { text: string; offset: number; length: number; normalized_length: number };

/** Minimum common run (normalized chars) worth naming; below it there is no "nearest" span, only noise. */
export const NEAREST_SPAN_MIN_CHARS = 12;

/** Normalize like e4 and keep, for every normalized char, the index of the raw char it came from. */
function normalizeWithMap(raw: string): { norm: string; map: number[] } {
  const map: number[] = [];
  let norm = "";
  let pendingSpace = false;
  let started = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (/\s/.test(ch)) { pendingSpace = started; continue; }
    if (pendingSpace) { norm += " "; map.push(i - 1); pendingSpace = false; }
    const low = ch.toLowerCase();
    // a lowercase of one char can be more than one char (e.g. İ); keep the map aligned by mapping each to i
    for (const c of low) { norm += c; map.push(i); }
    started = true;
  }
  return { norm, map };
}

/** Longest common substring of two normalized strings; returns [startA, startB, length]. O(|a|·|b|) with two rows. */
function longestCommonRun(a: string, b: string): [number, number, number] {
  let best = 0, endA = 0, endB = 0;
  let prev = new Int32Array(b.length + 1);
  let cur = new Int32Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      if (ca === b.charCodeAt(j - 1)) {
        const v = prev[j - 1] + 1;
        cur[j] = v;
        if (v > best) { best = v; endA = i; endB = j; }
      } else cur[j] = 0;
    }
    const t = prev; prev = cur; cur = t; cur.fill(0);
  }
  return [endA - best, endB - best, best];
}

/** The page span a candidate came closest to, as the raw page carries it, or null when no run reaches the minimum. */
export function nearestSpan(candidate: string, pageText: string, minChars = NEAREST_SPAN_MIN_CHARS): NearestSpan | null {
  const cand = normalizeForHash(String(candidate ?? ""));
  if (!cand || !pageText) return null;
  const { norm, map } = normalizeWithMap(String(pageText));
  if (norm !== normalizeForHash(String(pageText))) {
    // the map must be built on exactly e4's normalization; if the two ever diverge, say nothing rather than mislead
    return null;
  }
  let [, startB, len] = longestCommonRun(cand, norm);
  // a run never starts or ends on a normalized space: the raw span stops at the cell's own last character
  while (len > 0 && norm[startB + len - 1] === " ") len--;
  while (len > 0 && norm[startB] === " ") { startB++; len--; }
  if (len < minChars) return null;
  const rawStart = map[startB];
  const rawEnd = map[startB + len - 1] + 1;
  return { text: pageText.slice(rawStart, rawEnd), offset: rawStart, length: rawEnd - rawStart, normalized_length: len };
}
