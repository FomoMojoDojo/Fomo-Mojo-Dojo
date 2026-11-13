// THE PARTIAL-READ COPY (S-ING-1, signed 2026-11-12 under SP-94).
//
// WHY A STRINGS FILE. The PDF path reads the first 30 pages of a document and stops. Until this
// build it recorded the DOCUMENT's page count and then said "Analysis ready", so a 77-page filing
// analysed on 30 pages looked, on every screen, exactly like one analysed whole. Pages 31-77 were
// never opened and nothing anywhere said so. That is the silent partial display honesty forbids:
// the reader draws a conclusion about their own document from an analysis that never saw most of it.
//
// SP-93 keeps the cap for now — lifting it before chunking exists would turn documents that analyse
// today into documents that fail — so the obligation falls here: the read must SAY it is partial,
// wherever the file or its analysis appears. A string only stays signed while something checks it,
// hence the parity test beside this file.
export const INGEST_STRINGS = {
  /**
   * S-ING-1 — shown wherever a file or its analysis appears, whenever pages_read < pages_total.
   * "Analysis ready" never appears alone on such a document: this line reads beside it.
   */
  partialRead: "Only the first {n} of {m} pages were read.",
} as const;

/**
 * Is this a read we know to be partial? Both numbers are required: a row that knows one and not the
 * other knows nothing, and would render a false fraction. Rows written before 2026-11-13 carry NULL
 * on both and are NOT called partial — their truth was never recorded, and claiming either way
 * would be a guess. Equal counts are a WHOLE read, not a partial one.
 */
export function isPartialRead(
  pagesRead: number | null | undefined,
  pagesTotal: number | null | undefined,
): boolean {
  if (typeof pagesRead !== "number" || typeof pagesTotal !== "number") return false;
  if (!Number.isFinite(pagesRead) || !Number.isFinite(pagesTotal)) return false;
  return pagesRead >= 0 && pagesTotal > 0 && pagesRead < pagesTotal;
}

/** S-ING-1 with its two numbers substituted, and nothing else done to it. */
export function partialReadLine(pagesRead: number, pagesTotal: number): string {
  return INGEST_STRINGS.partialRead
    .replace("{n}", String(pagesRead))
    .replace("{m}", String(pagesTotal));
}
