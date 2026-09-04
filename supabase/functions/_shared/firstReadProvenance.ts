// First Read = OUTSIDE-ONLY + INTAKE (provenance gate, 2026-08-08 ruling; R1 amendment 2026-08-20).
//
// The First Read may draw ONLY from the intake / told-us-pre-meeting corpus and the outside read
// (the company's own public presence + what others say). UPLOADED DOCUMENTS must never feed any
// First Read surface — uploaded documents power the deeper engagement only.
//
import { normalizeForHash } from "./contentIdentity.ts";
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

// ── PUBLIC-ONLY (operator ruling 2026-08-20, supersedes 08-08 "OUTSIDE-ONLY + INTAKE") ──
// First Read renders PUBLIC content only. Act 1 = the company's own public channels
// (client-voice public claims); the record = third-party public; NO internal_declared,
// canvas-minted, intake, or uploaded content renders at any First Read site. The upload
// gate (R1, above) stays as defense in depth — the boundary is two-deep.

export const PUBLIC_PROVENANCE = "public_observed";

/** Lowercased, www-stripped hostname. */
export function normalizeHost(host: string): string {
  return host.replace(/^www\./, "").toLowerCase();
}

/**
 * THE own-domain rule — one definition, shared by the public-baseline stamping guard and
 * clientVoiceClaimIds: the URL's host equals the company host or is a subdomain of it
 * (both www-stripped, case-insensitive).
 */
export function isOwnDomainUrl(url: string, companyHost: string | null | undefined): boolean {
  if (!companyHost) return false;
  const ch = normalizeHost(companyHost);
  if (!ch) return false;
  try {
    const h = normalizeHost(new URL(url).hostname);
    return h === ch || h.endsWith(`.${ch}`);
  } catch {
    return false;
  }
}

/**
 * Act-1 sourcing: claim ids whose backing signals carry the company's own public voice —
 * voice_class='client_voice', or a legacy NULL voice_class on an own-domain URL (the
 * same rule the stamping guard would have applied).
 */
export function clientVoiceClaimIds(
  refs: Array<{ claim_id: string; signal_id: string }>,
  signalById: Map<string, { voice_class?: string | null; source_url?: string | null }>,
  companyHost: string | null | undefined,
): Set<string> {
  const ids = new Set<string>();
  for (const r of refs) {
    const s = signalById.get(r.signal_id);
    if (!s) continue;
    const vc = s.voice_class ?? null;
    if (vc === "client_voice" || (vc === null && s.source_url && isOwnDomainUrl(s.source_url, companyHost))) {
      ids.add(r.claim_id);
    }
  }
  return ids;
}

/**
 * The claim ids that render in beat 3's "your channels, as we read them" (OUR READ) section:
 * own-voice-qualified public claims, EXCLUDING own_words and upload-derived claims.
 *
 * OWN-WORDS EXCLUSION (2026-08-27): a statement rendered as the client's OWN WORDS must never also
 * render as OUR READ of their channels. own_words claims are provenance='public_observed' and are
 * typically backed by client_voice signals, so they satisfy clientVoiceClaimIds and would double-
 * render below their own-words block. Excluded STRUCTURALLY by claim_type (like the prune carve-out),
 * not by string-dedup. They still render once, in the own-words block (loaded as claim_type='own_words').
 */
export function channelReadClaimIds(
  claims: Array<{ id: string; claim_type?: string | null; statement?: string | null; declared_eligible?: boolean | null }>,
  ownVoiceIds: Set<string>,
  docExcludedIds: Set<string>,
  ownWordsNormTexts: Set<string>,
): Set<string> {
  const ids = new Set<string>();
  for (const c of claims) {
    if (c.claim_type === "own_words") continue; // never double-render as our channel read (by class)
    // RF ADMISSION (operator ruling 2026-09-04): an inference claim the admission criterion FAILED
    // (declared_eligible=false, written by the rf-channels-apply door) never renders as our channel read.
    // null/undefined = untyped = eligible (fail-toward-eligible, as for own words). Callers REPORT the ids.
    if (c.declared_eligible === false) continue;
    // 1ea2464 COMPLETED to TEXT IDENTITY (R3b, 2026-08-27): the invariant is text-level, not
    // claim_type-level — a statement must never render as both "your words" (own_words block) AND
    // "our read of your channels", regardless of claim CLASS. R3b's client_voice regeneration minted
    // `inference` claims carrying the SAME verbatim own-site text as own_words claims; those slip past
    // the claim_type gate above but are excluded here by normalized-text identity (the single
    // normalizeForHash normalizer — same rule the own-words verbatim guard uses).
    if (c.statement && ownWordsNormTexts.has(normalizeForHash(c.statement))) continue;
    if (docExcludedIds.has(c.id)) continue;
    if (!ownVoiceIds.has(c.id)) continue;
    ids.add(c.id);
  }
  return ids;
}

/**
 * OWN-HOST channel signal per claim (operator ruling 2026-09-03, beat 3 "What you say" (b)):
 * the demoted "Your channels, as we read them" block renders ONLY sources on the company's own
 * host. Aggregator-hosted self-copy (Glassdoor About, a press-wire release body, a ZoomInfo
 * description) keeps voice_class='client_voice' — it is the company's voice and must never echo —
 * but it is not one of the company's channels, so it does not render there. For each claim,
 * returns the NEWEST own-voice signal (event_date) whose source_url is on the company host
 * (isOwnDomainUrl — the same rule the stamping guard and clientVoiceClaimIds use). A claim whose
 * own-voice signals are all off-host gets no entry: the caller excludes it and REPORTS its id.
 */
export function ownHostSignalByClaim<S extends { source_url?: string | null; voice_class?: string | null; event_date?: string | null }>(
  refs: Array<{ claim_id: string; signal_id: string }>,
  signalById: Map<string, S>,
  companyHost: string | null | undefined,
): Map<string, S> {
  const out = new Map<string, S>();
  for (const r of refs) {
    const s = signalById.get(r.signal_id);
    if (!s) continue;
    const vc = s.voice_class ?? null;
    const ownVoice = vc === "client_voice" || (vc === null && !!s.source_url && isOwnDomainUrl(s.source_url, companyHost));
    if (!ownVoice) continue;
    // OWN HOST ONLY: a client_voice signal on an aggregator host is the company's voice but not
    // one of its channels — it never becomes the channel row's source.
    if (!s.source_url || !isOwnDomainUrl(s.source_url, companyHost)) continue;
    const prior = out.get(r.claim_id);
    if (!prior || (s.event_date ?? "") > (prior.event_date ?? "")) out.set(r.claim_id, s);
  }
  return out;
}

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
 * THE First Read exclusion set: upload-derived (R1: tier a ∪ tier b) UNION non-public
 * provenance (public-only ruling: anything other than public_observed — internal_declared,
 * client_attested, analytic — never renders). A claim row without a provenance field only
 * goes through the upload tests; every First Read call site fetches provenance.
 */
export function firstReadExcludedClaimIds(
  refs: Array<{ claim_id: string; signal_id: string }>,
  sourceTypeBySignal: Map<string, string | null | undefined>,
  claimRows: Array<{ id: string; raw_payload?: unknown; provenance?: string | null }>,
): Set<string> {
  const excluded = uploadDerivedClaimIds(refs, sourceTypeBySignal, claimRows);
  for (const c of claimRows) {
    if (c.provenance !== undefined && c.provenance !== PUBLIC_PROVENANCE) excluded.add(c.id);
  }
  return excluded;
}

/**
 * Check-rail site gate (useFirstReadCapture): drop every delta whose declared OR public claim is
 * First-Read-excluded (upload-derived or non-public). Exported so the site's falsification test
 * exercises the exact production filter.
 */
export function gateCheckRailDeltas<T extends { declared_claim_id: string | null; public_claim_id: string | null }>(
  dRows: T[],
  refs: Array<{ claim_id: string; signal_id: string }>,
  sourceTypeBySignal: Map<string, string | null | undefined>,
  claimRows: Array<{ id: string; raw_payload?: unknown; provenance?: string | null }>,
): T[] {
  const excluded = firstReadExcludedClaimIds(refs, sourceTypeBySignal, claimRows);
  if (!excluded.size) return dRows;
  return dRows.filter(
    (d) =>
      !(d.declared_claim_id && excluded.has(d.declared_claim_id)) &&
      !(d.public_claim_id && excluded.has(d.public_claim_id)),
  );
}

/**
 * Featured-defaults site gate (compute-featured-defaults): a delta is say-vs-see-eligible only if
 * its declared claim is not First-Read-excluded. Exported for the site's falsification test.
 */
export function featuredEligibleDeltas<T extends { declared_claim_id: string | null }>(
  deltas: T[],
  refs: Array<{ claim_id: string; signal_id: string }>,
  sourceTypeBySignal: Map<string, string | null | undefined>,
  claimRows: Array<{ id: string; raw_payload?: unknown; provenance?: string | null }>,
): T[] {
  const excluded = firstReadExcludedClaimIds(refs, sourceTypeBySignal, claimRows);
  return deltas.filter((d) => !(d.declared_claim_id && excluded.has(d.declared_claim_id)));
}
