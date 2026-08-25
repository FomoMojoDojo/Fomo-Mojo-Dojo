// ── E4 INGEST GUARD (gate 2, 2026-08-25). The public-baseline extractor emits a free-text
// `snippet`/`signal` that is copied verbatim into a signal's evidence_excerpt AND claim_text.
// That text is an ANALYST read and may append a conclusion the source never stated (Wine+Eggs:
// "…espresso/pour-over - confirming active wholesale/retail account"). The `quote` column already
// obeys the right discipline — it is admitted only when it is a byte-exact substring of the
// retained source (liftVerbatimQuote). This guard extends that SAME discipline to the displayed
// excerpt: evidence_excerpt is admitted only when it is a normalizeForHash-substring of the
// source the extractor saw (the fetched page on the OpenAI path, else the citation cited_text).
// Fail → store NO excerpt (attributed-summary path, which gate 1 already renders); the analyst's
// interpretation stays in raw_payload, never surfaced as the source's words. Deterministic; no model.
import { normalizeForHash } from "../../supabase/functions/_shared/contentIdentity.ts";

/** True iff `excerpt` traces to `sourceText`: a normalizeForHash-substring of the source the
 *  extractor saw. A missing/empty source basis is NOT a pass — the caller decides how to treat
 *  "no basis" (this gate leaves basis-less drafts untouched; see applyExcerptGuard). */
export function excerptTracesToSource(
  excerpt: string | null | undefined,
  sourceText: string | null | undefined,
): boolean {
  const e = normalizeForHash(String(excerpt ?? ""));
  const s = normalizeForHash(String(sourceText ?? ""));
  if (!e) return true; // empty excerpt: nothing claimed as the source's words → nothing to gate
  if (!s) return false; // a real excerpt with no source basis cannot be verified
  return s.includes(e);
}

/** Apply the guard to a single draft-shaped record, GIVEN the source basis the extractor saw
 *  (sourceText from the retained-source map). Returns the fields to store:
 *   - source basis present AND excerpt does NOT trace → drop the excerpt+claim (attributed-summary),
 *     keeping the untouched interpretation only in raw_payload.
 *   - source basis absent (null/empty) → LEAVE AS-IS (honest limit: nothing to verify against;
 *     the default Claude path with no citation, and gate-3 re-crawl is what supplies a basis).
 *   - excerpt traces → unchanged.
 *  Deterministic string op — zero model calls. */
export function applyExcerptGuard<T extends { evidence_excerpt: string; claim_text: string }>(
  draft: T,
  sourceText: string | null | undefined,
): { evidence_excerpt: string; claim_text: string; dropped: boolean } {
  const hasBasis = !!normalizeForHash(String(sourceText ?? ""));
  if (!hasBasis) return { evidence_excerpt: draft.evidence_excerpt, claim_text: draft.claim_text, dropped: false };
  if (excerptTracesToSource(draft.evidence_excerpt, sourceText)) {
    return { evidence_excerpt: draft.evidence_excerpt, claim_text: draft.claim_text, dropped: false };
  }
  // Unverifiable excerpt → store no excerpt/claim; the interpretation remains in raw_payload.
  return { evidence_excerpt: "", claim_text: "", dropped: true };
}
