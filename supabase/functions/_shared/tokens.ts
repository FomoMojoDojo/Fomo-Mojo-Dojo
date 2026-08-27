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
  // Gate 5b (stopword refinement, 2026-08-24): function / interrogative / auxiliary
  // words that were passing as "meaningful" and manufacturing spurious ≥2-token
  // finding-membership merges (a content word + a function word). Proven on live
  // data: dropping these breaks only content+function merges, never a legitimate
  // 2-content merge. "than" is a pure comparative conjunction → stopped. The
  // borderline quantity/degree tier (over, only, very, about, more, some, any,
  // both, all, most) is DELIBERATELY NOT stopped — those can carry real meaning.
  // "under" is likewise NOT stopped: in the observed data it is the age qualifier
  // "under 12", a real anchor, not a function word (filed for a separate look).
  "who", "what", "when", "where", "which", "why", "how",
  "could", "would", "should", "will", "must", "been", "being",
  "does", "did", "done", "had", "were", "them", "these", "those", "than",
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

// ── Gate 5a — DISTINCTIVE-token membership floor (2026-08-26) ───────────────────
//
// The ≥2 shared-token membership floor (FINDING_MEMBERSHIP_MIN_SHARED_TOKENS) is
// VACUOUSLY satisfied when the only shared tokens are near-universal brand/category
// words for the company: two outside signals sharing only "cafe"+"barra" (or
// "coffee"+"roaster", or "edgewood") are not about the same FACT — they are merely
// about the same company/category. Measured live: the largest CB2 cluster's 18 of
// 20 members passed the floor ONLY via such tokens. The repair: count only
// DISTINCTIVE tokens — meaningful tokens that are NOT near-universal in the
// company's own eligible-signal corpus.
//
// GENERIC = document-frequency ≥ θ across the eligible-signal corpus. Deterministic:
// DF counts are order-independent (a token's document count is independent of doc
// order), θ is fixed, the functions are pure — a no-change rerun is byte-identical.

/** Default document-frequency threshold above which a token is GENERIC for a
 *  company (appears in ≥40% of eligible signals → near-universal → not distinctive). */
export const GENERIC_TOKEN_DF_THRESHOLD = 0.4;

/** The GENERIC token set for a corpus: meaningful tokens whose document frequency
 *  (fraction of documents containing the token) is ≥ `threshold`. Order-independent
 *  and pure. Empty corpus → empty set (nothing is generic, so the floor stays the
 *  plain ≥2 shared-token rule). */
export function genericTokens(corpus: string[], threshold: number = GENERIC_TOKEN_DF_THRESHOLD): Set<string> {
  const n = corpus.length;
  if (n === 0) return new Set<string>();
  const df = new Map<string, number>();
  for (const doc of corpus) {
    for (const t of meaningfulTokens(doc)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const generic = new Set<string>();
  for (const [t, c] of df) if (c / n >= threshold) generic.add(t);
  return generic;
}

/** |intersection| of two texts' meaningful tokens, EXCLUDING generic (near-universal
 *  in-corpus) tokens — the count the DISTINCTIVE membership floor gates on. With an
 *  empty `generic` set this equals sharedTokenCount (the plain ≥N rule). */
export function distinctiveSharedTokenCount(a: string, b: string, generic: Set<string>): number {
  const ta = meaningfulTokens(a);
  const tb = meaningfulTokens(b);
  let n = 0;
  for (const t of ta) if (tb.has(t) && !generic.has(t)) n++;
  return n;
}

/** The distinctive shared tokens themselves (generic-excluded) — for auditable
 *  proof output ("which non-generic tokens actually bridged these two texts"). */
export function distinctiveSharedTokens(a: string, b: string, generic: Set<string>): string[] {
  const ta = meaningfulTokens(a);
  const tb = meaningfulTokens(b);
  const out: string[] = [];
  for (const t of ta) if (tb.has(t) && !generic.has(t)) out.push(t);
  return out;
}
