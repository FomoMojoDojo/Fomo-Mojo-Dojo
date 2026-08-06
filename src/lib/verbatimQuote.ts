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

/** A validated source date + its precision. The `date` is always a full YYYY-MM-DD (the
 *  column type is `date`); `precision` records whether the source carried a full day or only
 *  a month — so the (event_date, event_date_precision) pair is SELF-DESCRIBING and no consumer
 *  needs raw_payload to render it honestly ("Apr 2026" vs "1 Apr 2026"). */
export interface PickedDate {
  date: string; // YYYY-MM-DD (month-precision stored as YYYY-MM-01)
  precision: "day" | "month";
}

/**
 * A source's visible date → { date, precision } or null. Absence-isn't-a-verdict: an
 * unparseable / missing date returns null, NEVER an inferred one. Accepted forms:
 *   - full ISO date or timestamp (YYYY-MM-DD[T…]) → precision 'day'
 *   - month precision (YYYY-MM)                   → date YYYY-MM-01, precision 'month'
 * Rejected: bare year, prose, "Captured", anything else (no inference).
 */
export function pickEventDate(candidate: string | null | undefined): PickedDate | null {
  if (typeof candidate !== "string") return null;
  const s = candidate.trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/);
  if (iso) {
    const [, y, m, d] = iso;
    const month = Number(m), day = Number(d);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return { date: `${y}-${m}-${d}`, precision: "day" };
  }
  // Month precision: YYYY-MM → first of month, flagged 'month' so the day is never
  // mistaken for a genuine first-of-month publication date.
  const ym = s.match(/^(\d{4})-(\d{2})$/);
  if (ym) {
    const [, y, m] = ym;
    const month = Number(m);
    if (month < 1 || month > 12) return null;
    return { date: `${y}-${m}-01`, precision: "month" };
  }
  return null;
}
