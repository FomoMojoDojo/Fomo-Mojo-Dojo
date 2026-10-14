// ── A2 (operator ruling, 2026-10-13): how a CARRIED line reads ─────────────────────────────────
//
// A carried line is the record's own words, lifted verbatim from a row. The row needed a preamble
// the read does not: "in 1993 Edgewood established the first kinship program in the country" reads,
// on a page headed Edgewood, as "established the first kinship program in the country". A2 drops a
// leading date phrase and a leading mention of the company's own name, and nothing else.
//
// THIS IS A RENDER, NEVER A REWRITE. The stored text keeps the verbatim span and the carried block
// keeps the offsets that prove it; the drift check still compares the stored text against the row.
// Only what the reader sees is shortened — store/render parity is a test, not a hope.
//
// It lives in its own module with NO imports because D2 calls it from the browser (the First Read
// render path) and from the edge function; carriedSpan.ts re-exports it so there is one authority.
/** A2 (amendment 2026-10-13) — RENDER ONLY. A leading date phrase and the company's own name may be
 *  dropped for display. The STORED text is untouched, so verbatimProvable against the span still
 *  holds; this is the same display-only licence the slot path has for sentence casing. */
export function renderCarried(stored: string, companyName: string): string {
  let out = stored;
  // a leading date phrase: "in 1993 ", "since 1993 ", "in January 2014 "
  out = out.replace(/^(?:in|since|from|as of)\s+(?:[A-Z][a-z]+\s+)?\d{4},?\s+/i, "");
  // the company's own name, once, at the start of what remains
  const n = companyName.trim();
  if (n) out = out.replace(new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i"), "");
  return out.trim();
}
