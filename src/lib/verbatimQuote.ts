// CV-2e (tier A) — the verbatim-quote capture guard, pure so both the capture path
// (evidencePhase1.normalizeSignalInsert) and the tests share ONE authority.
//
// liftVerbatimQuote is the CODE-side mirror of the DB CHECK signals_quote_verbatim:
// a candidate quote is admitted ONLY when it is a byte-exact substring of the
// retained fetched source text. Model output (a paraphrase) is not a substring of
// its source, so a substitution — passing model claim_text off as a quote — returns
// null here and fails the CHECK at the DB. Defense in depth: the DB is the backstop,
// this keeps the bad write from ever being attempted.

export interface VerbatimQuote {
  quote: string;
  quote_source_text: string;
}

/**
 * Admit a verbatim quote only if `candidate` occurs BYTE-EXACT inside `sourceText`.
 * Returns the (quote, source) pair to store, or null (honest absence). No
 * normalization, no trimming-into-a-match, no fuzzy: the proof is exact-substring.
 */
export function liftVerbatimQuote(
  sourceText: string | null | undefined,
  candidate: string | null | undefined,
): VerbatimQuote | null {
  const src = typeof sourceText === "string" ? sourceText : "";
  const q = typeof candidate === "string" ? candidate : "";
  if (!q.trim()) return null; // empty / whitespace candidate → no quote
  if (!src) return null; // no retained source → cannot prove verbatim → no quote
  if (!src.includes(q)) return null; // NOT a verbatim substring → refuse (substitution guard)
  return { quote: q, quote_source_text: src };
}

/**
 * A source's visible date → an ISO date string (YYYY-MM-DD), or null. Absence-isn't-
 * a-verdict: an unparseable / missing date returns null, NEVER an inferred one. Only
 * a genuinely date-shaped value the source carried is accepted.
 */
export function pickEventDate(candidate: string | null | undefined): string | null {
  if (typeof candidate !== "string") return null;
  const s = candidate.trim();
  if (!s) return null;
  // Accept a bare ISO date, or a full ISO timestamp — take its date part. Reject
  // anything else (a bare year, prose, "Captured", etc. — no inference).
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/);
  if (!iso) return null;
  const [, y, m, d] = iso;
  const year = Number(y), month = Number(m), day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${m}-${d}`;
}
