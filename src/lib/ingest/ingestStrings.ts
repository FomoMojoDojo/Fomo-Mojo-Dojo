// THE PARTIAL-READ COPY (S-ING-1, signed 2026-11-12 under SP-94).
//
// WHY A STRINGS FILE. The PDF path reads the first 30 pages of a document and stops. Until this
// build it recorded the DOCUMENT's page count and then said "Analysis ready", so a 77-page filing
// analysed on 30 pages looked, on every screen, exactly like one analysed whole. Pages 31-77 were
// never opened and nothing anywhere said so. That is the silent partial display honesty forbids:
// the reader draws a conclusion about their own document from an analysis that never saw most of it.
//
// SP-93 kept the cap at first — lifting it before chunking existed would have turned documents that
// analysed into documents that failed — so the obligation fell here: the read must SAY it is partial,
// wherever the file or its analysis appears. A string only stays signed while something checks it,
// hence the parity test beside this file.
//
// SP-231 then removed the page cap, and SP-244 and SP-261 added the four strings a chunked read needs.
// THE DISTINCTION THAT RUNS THROUGH ALL OF THEM: three of these describe something that could not be
// read, and one describes something that was read in full and interpreted in part. They must not look
// alike.
//
//   S-ING-1  the read stopped short of the pages the document has        (could not be read)
//   S-ING-2  progress while a multi-section document is running          (neither)
//   S-ING-3  some sections FAILED                                        (could not be read)
//   S-ING-4  the 400,000-character cap cut the document                  (could not be read)
//   S-ING-5  every section was read; the hand-off carried the key ones   (READ IN FULL)
//
// S-ING-5 therefore takes the app's existing INFO icon and neutral styling, never the warning style
// (SP-262). A reader who cannot tell "we could not read your document" from "we read all of it and
// quoted the best of it" has been told something false by the styling alone.
export const INGEST_STRINGS = {
  /**
   * S-ING-1 — shown wherever a file or its analysis appears, whenever pages_read < pages_total.
   * "Analysis ready" never appears alone on such a document: this line reads beside it.
   */
  partialRead: "Only the first {n} of {m} pages were read.",

  /** S-ING-2 — while a multi-section document is running. Never shown for a one-window document. */
  sectionsProgress: "{n} of {m} sections analyzed",

  /** S-ING-3 — ready-partial because some windows FAILED. Warning styling, beside "Analysis ready". */
  sectionsFailed: "Analysis ready. {k} of {m} sections could not be read.",

  /** S-ING-4 — the character cap cut the document. No page counts are known in this case. */
  charsCapped: "Only the first part of this document was read.",

  /**
   * S-ING-5 (SP-261) — the info icon's tooltip AND its aria-label, on a READY row whose
   * items_interpreted is below its items_extracted. Not a warning: every section was read and
   * SP-256's round-robin guarantees every section contributed to the hand-off.
   */
  budgetSelected: "Long document. The analysis draws on the key passages from every section.",
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

/** S-ING-2, with its two numbers substituted. A one-window document never shows this (see below). */
export function sectionsProgressLine(done: number, total: number): string {
  return INGEST_STRINGS.sectionsProgress.replace("{n}", String(done)).replace("{m}", String(total));
}

/** S-ING-3, with its two numbers substituted. */
export function sectionsFailedLine(failed: number, total: number): string {
  return INGEST_STRINGS.sectionsFailed.replace("{k}", String(failed)).replace("{m}", String(total));
}

/**
 * Does this document show section counts at all? SP-244: only when m > 1. A one-window document shows
 * today's states and none of S-ING-2 / S-ING-3 — "1 of 1 sections analyzed" is noise that makes a
 * normal upload look like machinery.
 */
export function showsSectionCounts(windowCount: number | null | undefined): boolean {
  return typeof windowCount === "number" && Number.isFinite(windowCount) && windowCount > 1;
}

/**
 * SP-260: does the ready badge carry the info icon? Only on a READY row where the framework pass read
 * fewer items than extraction found. Both counts are required — a row that knows one and not the
 * other knows nothing, exactly as with the page pair — and rows predating the counts carry NULL on
 * both and get no icon, because their truth was never recorded.
 *
 * It is deliberately NOT keyed on "is this a long document": a long document whose extract fitted the
 * budget whole has nothing to disclose, and an icon there would be decoration.
 */
export function isBudgetSelected(
  itemsExtracted: number | null | undefined,
  itemsInterpreted: number | null | undefined,
): boolean {
  if (typeof itemsExtracted !== "number" || typeof itemsInterpreted !== "number") return false;
  if (!Number.isFinite(itemsExtracted) || !Number.isFinite(itemsInterpreted)) return false;
  return itemsExtracted > 0 && itemsInterpreted >= 0 && itemsInterpreted < itemsExtracted;
}
