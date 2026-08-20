// First Read = OUTSIDE-ONLY + INTAKE (provenance gate, 2026-08-08 ruling; R1 amendment 2026-08-20).
//
// The First Read may draw ONLY from the intake / told-us-pre-meeting corpus and the outside read
// (the company's own public presence + what others say). UPLOADED DOCUMENTS must never feed any
// First Read surface — uploaded documents power the deeper engagement only.
//
// R1 (operator ruling, 2026-08-20): upload-derived content is excluded STRUCTURALLY, as the union
// of two derivable tests — (a) any backing signal with source_type = 'uploaded_file', and (b) the
// claim's own birth record (raw_payload basis/source) citing an uploaded document by filename.
// The former INFER-BY-ABSENCE rule (2026-08-08 ruling 2: "no marker = clean") is RETIRED — a claim
// with no signal refs is resolved by its birth record, never assumed clean. (R1 closed the no-ref
// bypass that let manual_remint claims render with a PDF source tag.)
//
// SHARED: imported by the client rail read (useFirstReadCapture — covers the rail AND the export,
// its sole item source), the preview adapter (useFirstReadPreviewData), the open-question read
// (useFirstReadOpenQuestions), the curated-tension read (useCuratedTensions), the auto-default
// selectors (compute-featured-defaults), and the source-tag deriver (deriveSourceTag — SAME
// document-filename regex, so the tag and the gate can never disagree about what counts as a
// document citation). One predicate, no per-component drift.

export const UPLOADED_FILE_SOURCE_TYPE = "uploaded_file";

/**
 * THE document-filename pattern — the single definition shared by the provenance gate (tier b)
 * and deriveSourceTag's doc branch. First match names the cited document.
 */
export const UPLOADED_DOC_NAME_RE = /([\w&()'’\-. ]+\.(?:pdf|docx?|pptx?|xlsx?|md|txt|csv|rtf))/i;

/** Payload fields a birth record may cite a document in. */
const PAYLOAD_DOC_FIELDS = ["basis", "source", "source_file", "file_name"] as const;

/** First document filename cited in a claim's birth record (raw_payload), or null. */
export function citedDocumentName(rawPayload: unknown): string | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  const p = rawPayload as Record<string, unknown>;
  for (const key of PAYLOAD_DOC_FIELDS) {
    const v = p[key];
    if (typeof v !== "string") continue;
    const m = UPLOADED_DOC_NAME_RE.exec(v);
    if (m) return m[1].trim();
  }
  return null;
}

/** Tier (b): the claim's own birth record cites an uploaded document. */
export function citesUploadedDocument(rawPayload: unknown): boolean {
  return citedDocumentName(rawPayload) !== null;
}

/** True if any of these backing source_types is an uploaded file → the claim is document-derived. */
export function isDocumentDerivedSourceTypes(sourceTypes: Iterable<string | null | undefined>): boolean {
  for (const t of sourceTypes) if (t === UPLOADED_FILE_SOURCE_TYPE) return true;
  return false;
}

/**
 * Tier (a): document-derived claim ids from claim_signal_refs rows and a signalId → source_type
 * map. A claim lands in the set as soon as ONE uploaded_file signal backs it (strict: any document
 * touch excludes, so document content can never leak via a mixed claim).
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

/**
 * R1 — THE First Read exclusion set: tier (a) ∪ tier (b). Every First Read read path resolves
 * upload-derivation through this one function. `claimRows` must cover every candidate claim
 * (including no-ref claims — that is the point of tier b).
 */
export function uploadDerivedClaimIds(
  refs: Array<{ claim_id: string; signal_id: string }>,
  sourceTypeBySignal: Map<string, string | null | undefined>,
  claimRows: Array<{ id: string; raw_payload?: unknown }>,
): Set<string> {
  const excluded = documentDerivedClaimIds(refs, sourceTypeBySignal);
  for (const c of claimRows) {
    if (citesUploadedDocument(c.raw_payload)) excluded.add(c.id);
  }
  return excluded;
}

/**
 * Check-rail site gate (useFirstReadCapture): drop every delta whose declared OR public claim is
 * upload-derived. Exported so the site's falsification test exercises the exact production filter.
 */
export function gateCheckRailDeltas<T extends { declared_claim_id: string | null; public_claim_id: string | null }>(
  dRows: T[],
  refs: Array<{ claim_id: string; signal_id: string }>,
  sourceTypeBySignal: Map<string, string | null | undefined>,
  claimRows: Array<{ id: string; raw_payload?: unknown }>,
): T[] {
  const excluded = uploadDerivedClaimIds(refs, sourceTypeBySignal, claimRows);
  if (!excluded.size) return dRows;
  return dRows.filter(
    (d) =>
      !(d.declared_claim_id && excluded.has(d.declared_claim_id)) &&
      !(d.public_claim_id && excluded.has(d.public_claim_id)),
  );
}

/**
 * Featured-defaults site gate (compute-featured-defaults): a delta is say-vs-see-eligible only if
 * its declared claim is not upload-derived. Exported for the site's falsification test.
 */
export function featuredEligibleDeltas<T extends { declared_claim_id: string | null }>(
  deltas: T[],
  refs: Array<{ claim_id: string; signal_id: string }>,
  sourceTypeBySignal: Map<string, string | null | undefined>,
  claimRows: Array<{ id: string; raw_payload?: unknown }>,
): T[] {
  const excluded = uploadDerivedClaimIds(refs, sourceTypeBySignal, claimRows);
  return deltas.filter((d) => !(d.declared_claim_id && excluded.has(d.declared_claim_id)));
}
