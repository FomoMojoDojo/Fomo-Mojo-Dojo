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

// ── A FILE THAT COULD NOT BE READ (S0, signed 2026-11-16) ──────────────────────────────────────────
//
// Until S0 a file MojoMap could not read was filed 'voice_not_classified' with no reason, so a
// password-protected, damaged or not-yet-supported file all showed a bare "Analysis failed". Each now
// carries a code (input_files.extraction_error_code, written by analyze-file; copied onto the failed
// proposal by public.close_unread_file) and the reason is rendered FROM THE CODE, here and nowhere
// else — the database stores no copy of the wording, so the two cannot drift.
//
// Decision 6 (operator, 2026-11-16) relaxes SP-212 for exactly these codes. Every other failure code
// (voice_not_classified, no_text_extracted, enqueue_attempts_exhausted, …) still renders no reason.
export const UNREADABLE_STRINGS = {
  unreadable_password: "This file is password-protected. Remove the password and upload it again.",
  unreadable_corrupt: "This file appears to be damaged and could not be opened.",
  unreadable_empty: "This file opened but contains no text.",
  unreadable_no_text_after_ocr: "This file is an image, and no text could be recognized in it.",
  unreadable_format: "MojoMap™ cannot read this kind of file yet.",
  ocr_unavailable: "Text recognition is not available right now.",
  // R1 (signed 2026-11-16): the parser call itself failed — the file was never read.
  reader_unavailable: "The file reader was not available when this file was uploaded. Use “Analyze again” to read it now.",
} as const;

export type UnreadableCode = keyof typeof UNREADABLE_STRINGS;

/** The signed reason for an unreadable code, or null for any other code (or none). */
export function unreadableReason(code: string | null | undefined): string | null {
  if (typeof code !== "string") return null;
  return Object.prototype.hasOwnProperty.call(UNREADABLE_STRINGS, code)
    ? UNREADABLE_STRINGS[code as UnreadableCode]
    : null;
}

// ── PAGES READ BY TEXT RECOGNITION (S2, signed 2026-11-16) ─────────────────────────────────────────
//
// S-ING-7. A scanned page has no text layer; S2 reads it with Apple Vision. What was recognised IS the
// sidecar, and the quote check holds every excerpt to it — but recognition can misread, so the reader is
// told which document was read this way. INFO styling, like S-ING-5: the document WAS read in full; this
// is how, not what is missing. Rendered whenever file_proposals.ocr_pages > 0.
export const OCR_READ_STRING = "Some pages were scanned images. Their text was read by text recognition and may contain mistakes.";

/** S-ING-7 for this proposal's recorded OCR page count, or null (none, or a row from before S2). */
export function ocrReadLine(ocrPages: number | null | undefined): string | null {
  return typeof ocrPages === "number" && Number.isFinite(ocrPages) && ocrPages > 0 ? OCR_READ_STRING : null;
}

// ── A DECK READ IN PART (S6, signed 2026-11-16) ────────────────────────────────────────────────────
//
// S-ING-1b. A PowerPoint's slides ride the same pages_read / pages_total pair as a PDF's pages, with
// file_proposals.page_unit = 'slide', so the partial-read line names the right thing. Warning styling,
// like S-ING-1: slides after the n-th were never read.
export const PARTIAL_SLIDES_STRING = "Only the first {n} of {m} slides were read.";

/** S-ING-1 or S-ING-1b by the read's unit, with its two numbers substituted and nothing else done. */
export function partialReadLineFor(unit: string | null | undefined, read: number, total: number): string {
  if (unit === "slide") return PARTIAL_SLIDES_STRING.replace("{n}", String(read)).replace("{m}", String(total));
  // S4: a workbook's pair counts sheets.
  if (unit === "sheet") return PARTIAL_SHEETS_STRING.replace("{n}", String(read)).replace("{m}", String(total));
  return partialReadLine(read, total);
}

// ── A SPREADSHEET (S4, signed 2026-11-16) ──────────────────────────────────────────────────────────
//
// S-ING-1c (sheets past the 50-sheet cap) and S-ING-6 (rows past the 5,000-row cap of one sheet) describe
// something that was NOT read — warning styling, like S-ING-1. S-ING-8 says personal columns were
// withheld before analysis — info styling, like S-ING-5: it is a deliberate rule, not a failure.
export const PARTIAL_SHEETS_STRING = "Only the first {n} of {m} sheets were read.";
export const ROWS_CAPPED_STRING = 'Only the first {n} of {m} rows of sheet "{sheet}" were read.';
export const WITHHELD_COLUMNS_STRING = "Columns holding personal details were withheld from the analysis.";

/** S-ING-6, one line per sheet whose rows were capped, numbers and sheet name substituted, nothing else. */
export function rowsCappedLines(rowsCapped: ReadonlyArray<{ sheet?: unknown; read?: unknown; total?: unknown }> | null | undefined): string[] {
  if (!Array.isArray(rowsCapped)) return [];
  return rowsCapped
    .filter((r) => typeof r?.read === "number" && typeof r?.total === "number" && (r.read as number) < (r.total as number))
    .map((r) => ROWS_CAPPED_STRING.replace("{n}", String(r.read)).replace("{m}", String(r.total)).replace("{sheet}", String(r.sheet ?? "")));
}

/** S-ING-8 when any column was withheld (file_proposals.columns_withheld > 0), else null. */
export function withheldColumnsLine(columnsWithheld: number | null | undefined): string | null {
  return typeof columnsWithheld === "number" && columnsWithheld > 0 ? WITHHELD_COLUMNS_STRING : null;
}
