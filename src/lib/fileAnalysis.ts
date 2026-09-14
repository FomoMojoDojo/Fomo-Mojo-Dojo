// File-analysis methodology version and extraction shape (operator rulings 2026-09-14, signed 1b / 1c).
//
// FILE_ANALYSIS_VERSION is stamped on every proposal dify-analyze-file starts (file_proposals.analysis_version)
// and on every signal minted from it (raw_payload.analysis_version). Prior rows read 1 by column default —
// history, never re-rolled, never re-analysed. Bump it ONLY on a signed methodology change.
//   1 — frameworks read Grounding's summary in place of the file; absence could attest; no excerpt guard on uploads
//   2 — frameworks read file_text with Grounding alongside; missing_information never reaches a framework;
//       Torres gap findings carry empty evidence; the E4 excerpt guard runs on the upload path (sidecar basis)
export const FILE_ANALYSIS_VERSION = 2;

/** What the parser actually read. `images` counts images it did NOT read — no OCR exists (ruling 10). */
export type ExtractionShape = {
  chars: number;
  images: number;
  pages: number | null;
  source: string;
};

// Signed client-visible strings (1c, 2026-09-14). "not read" is literal.
//   "{chars} characters of text read · {images} images not read"   when images > 0
//   "{chars} characters of text read"                              when images = 0
//   "· {pages} pages" appended when pages is known
export function formatExtractionShape(shape: { chars: number | null; images: number | null; pages: number | null }): string | null {
  if (shape.chars == null) return null;
  const n = (v: number) => v.toLocaleString("en-US");
  const parts = [`${n(shape.chars)} characters of text read`];
  if ((shape.images ?? 0) > 0) parts.push(`${n(shape.images as number)} images not read`);
  if (shape.pages != null) parts.push(`${n(shape.pages)} pages`);
  return parts.join(" · ");
}

/** Signed (1c): the methodology stamp shown beside an analysis. */
export function formatAnalysisVersion(version: number | null | undefined): string {
  return `Analysis v${version ?? 1}`;
}
