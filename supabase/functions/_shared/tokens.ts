// ── tokens ────────────────────────────────────────────────────────────────────
//
// Gate 5a (clusterer repair, design signed 2026-08-24): the SINGLE meaningful-token
// authority for the finding-recurrence family. Extracted verbatim from
// signalRecurrence.ts so there is exactly ONE tokenizer and ONE stopword set — no
// parallel copy, and (by law) no SQL-side tokenizer. signalRecurrence.ts and
// normativeConsistency.ts consume these; the shipping behaviour is unchanged from
// the pre-extraction inline definitions.
//
// Rule (unchanged, no stemming): lowercase → split on non-alphanumerics → drop
// tokens shorter than 3 chars → drop the stopword set → dedupe as a Set.

export const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is",
  "are", "was", "be", "by", "as", "at", "that", "this", "it", "its", "their",
  "they", "we", "our", "you", "your", "not", "no", "but", "from", "have", "has",
]);

export function meaningfulTokens(text: string): Set<string> {
  return new Set(
    String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter((t) => t.length > 2 && !STOP_WORDS.has(t)),
  );
}

/** |intersection| of the two texts' meaningful-token sets. */
export function sharedTokenCount(a: string, b: string): number {
  const ta = meaningfulTokens(a);
  const tb = meaningfulTokens(b);
  let n = 0;
  for (const t of ta) if (tb.has(t)) n++;
  return n;
}

/** The intersection itself (deterministic, insertion order of `a`'s set) — for
 *  auditable proof output ("which tokens bridged these two texts"). */
export function sharedTokens(a: string, b: string): string[] {
  const ta = meaningfulTokens(a);
  const tb = meaningfulTokens(b);
  const out: string[] = [];
  for (const t of ta) if (tb.has(t)) out.push(t);
  return out;
}
