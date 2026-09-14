// QUOTE WARRANT (operator ruling 2026-09-14). On the client-facing First Read, a source excerpt renders
// inside quotation marks ONLY where a durable excerpt_verifications record says it PASSED against a basis
// that was the source's own text at the time we read it:
//   mint_time (basis_kind 'quote_source_text' — the retained page at mint) | sidecar (the document's extracted text)
// at guard_version 1. A pass against a page_snapshot or refetch says the words are on the page NOW — honest
// evidence the analyst did not invent them, but not the claim a quotation mark makes. WIDENING THIS SET
// (or the guard version) IS AN OPERATOR RULING, NOT A CODE CHANGE. Everything else renders as attributed
// text without quotation marks (beat 2's treatment); the old substring test (excerpt ⊂ claim_text) confers
// nothing — it is vacuous for rows whose excerpt is their claim text.
import { normalizeForHash, sha256Hex } from "../../../supabase/functions/_shared/contentIdentity.ts";

export const QUOTE_GUARD_VERSION = 1;
export const QUOTE_WARRANT_BASES = ["quote_source_text", "sidecar"] as const;
export type QuoteWarrantBasis = (typeof QUOTE_WARRANT_BASES)[number];

export type VerificationRecordLike = { verdict: string; basis_kind: string; guard_version: number };

/** True iff this record warrants a quotation mark under the ruling. */
export function warrantsQuotation(rec: VerificationRecordLike | null | undefined): boolean {
  return !!rec && rec.verdict === "passed" && rec.guard_version === QUOTE_GUARD_VERSION && (QUOTE_WARRANT_BASES as readonly string[]).includes(rec.basis_kind);
}

/** The record's source key for a signal (the same rule the writer uses, _shared/excerptVerification.ts):
 *  the URL; a document's 'file:<path>'; else 'proposal:<source_id>'. */
export function sourceKeyForSignal(sig: { source_url?: string | null; source_id?: string | null }, filePath?: string | null): string {
  const url = String(sig.source_url ?? "").trim();
  if (url) return url;
  const fp = String(filePath ?? "").trim();
  if (fp) return `file:${fp}`;
  return `proposal:${String(sig.source_id ?? "").trim()}`;
}

export const WARRANT_KEY_SEP = "|#|";
export async function warrantKey(sourceKey: string, excerpt: string): Promise<string> {
  return `${sourceKey}${WARRANT_KEY_SEP}${await sha256Hex(normalizeForHash(excerpt))}`;
}

/** The set of warrant keys from the company's records that qualify — built once per load. */
export function warrantKeySet(rows: Array<{ source_url: string; excerpt_identity: string } & VerificationRecordLike>): Set<string> {
  const out = new Set<string>();
  for (const r of rows) if (warrantsQuotation(r)) out.add(`${r.source_url}${WARRANT_KEY_SEP}${r.excerpt_identity}`);
  return out;
}
