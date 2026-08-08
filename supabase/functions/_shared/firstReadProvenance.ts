// First Read = OUTSIDE-ONLY + INTAKE (provenance gate, 2026-08-08 ruling).
//
// The First Read may draw ONLY from the intake / told-us-pre-meeting corpus and the outside read
// (the company's own public presence + what others say). UPLOADED DOCUMENTS must never feed any
// First Read surface — uploaded documents power the deeper engagement only.
//
// The boundary is a single marker: signals.source_type = 'uploaded_file'. A claim is
// document-derived — and therefore First-Read-EXCLUDED — iff ANY signal backing it is an uploaded
// file. INFER-BY-ABSENCE (operator ruling 2): there is no reclassification; the marker IS the
// boundary. A told-us-pre-meeting declared claim carries NO uploaded_file signal, so it is
// included; a document-derived claim always carries one, so there is no loophole.
//
// SHARED: imported by the client rail read (useFirstReadCapture — covers the rail AND the export,
// its sole item source) and the auto-default selectors (compute-featured-defaults). One predicate,
// no per-component drift.

export const UPLOADED_FILE_SOURCE_TYPE = "uploaded_file";

/** True if any of these backing source_types is an uploaded file → the claim is document-derived. */
export function isDocumentDerivedSourceTypes(sourceTypes: Iterable<string | null | undefined>): boolean {
  for (const t of sourceTypes) if (t === UPLOADED_FILE_SOURCE_TYPE) return true;
  return false;
}

/**
 * Build the set of document-derived (First-Read-excluded) claim ids from claim_signal_refs rows and
 * a signalId → source_type map. A claim lands in the set as soon as ONE uploaded_file signal backs
 * it (strict: any document touch excludes, so document content can never leak via a mixed claim).
 */
export function documentDerivedClaimIds(
  refs: Array<{ claim_id: string; signal_id: string }>,
  sourceTypeBySignal: Map<string, string | null | undefined>,
): Set<string> {
  const excluded = new Set<string>();
  for (const r of refs) {
    if (sourceTypeBySignal.get(r.signal_id) === UPLOADED_FILE_SOURCE_TYPE) excluded.add(r.claim_id);
  }
  return excluded;
}
