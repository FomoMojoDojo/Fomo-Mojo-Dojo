// EXCERPT VERIFICATION RECORDS (trace design signed 2026-09-14). The durable record of whether a stored
// evidence_excerpt was verified, against what basis, when — written at mint (forward) and by the fleet
// back-verification (verify-excerpts). Keyed by CONTENT — (company, source key, excerpt identity, guard
// version) — so it outlives re-ingest; signal_id is informational only.
//   verdict: passed | blanked | no_basis.  never_checked = the ABSENCE of a row; this module cannot write it.
//   guard_version: 1 = the normalizeForHash-substring rule (excerptTracesToSource). Moves ONLY by ruling.
import { normalizeForHash, sha256Hex } from "./contentIdentity.ts";
import { excerptTracesToSource } from "../../../src/lib/evidenceExcerptGuard.ts";

export const EXCERPT_GUARD_VERSION = 1;
export type BasisKind = "retained_page" | "quote_source_text" | "sidecar" | "page_snapshot" | "refetch";
export type NoBasisReason = "page_not_retained" | "frozen_company_no_refetch" | "fetch_blocked" | "fetch_gone" | "no_document" | "file_row_deleted" | "no_sidecar" | "no_url";
export type Verdict = "passed" | "blanked" | "no_basis";
type Sb = { from: (t: string) => any };

export async function excerptIdentity(excerpt: string): Promise<string> {
  return await sha256Hex(normalizeForHash(excerpt));
}
export async function basisSha(text: string): Promise<string> {
  return await sha256Hex(normalizeForHash(text));
}
/** The source key of a signal: its URL; a document's storage path; else the proposal/run it came from. */
export function sourceKeyFor(s: { source_url?: string | null; file_path?: string | null; source_id?: string | null }): string {
  const url = String(s.source_url ?? "").trim();
  if (url) return url;
  const fp = String(s.file_path ?? "").trim();
  if (fp) return `file:${fp}`;
  return `proposal:${String(s.source_id ?? "").trim()}`;
}
/** The verdict of guard_version 1 for a NON-EMPTY excerpt against a basis text. */
export function verdictAgainstBasis(excerpt: string, basisText: string): Exclude<Verdict, "no_basis"> {
  return excerptTracesToSource(excerpt, basisText) ? "passed" : "blanked";
}

export type VerificationRow = {
  company_id: string;
  signal_id: string | null;
  source_url: string;
  excerpt_identity: string;
  guard_version: number;
  verdict: Verdict;
  basis_kind: BasisKind | "none";
  basis_sha: string | null;
  basis_at: string | null;
  no_basis_reason: NoBasisReason | null;
  recorded_by: string;
  note?: string | null;
};

/** Append one record; a second write for the same key is a no-op (idempotent by the unique key). Returns
 *  true when a row was written. Never writes 'never_checked' — the type forbids it. */
export async function recordVerification(supabase: Sb, row: VerificationRow): Promise<boolean> {
  const { data, error } = await supabase.from("excerpt_verifications")
    .upsert(row, { onConflict: "company_id,source_url,excerpt_identity,guard_version", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(`excerpt_verifications: ${error.message}`);
  return Array.isArray(data) && data.length > 0;
}

/** Verify one excerpt against a basis and record it. Empty excerpts are not verifiable and get no row. */
export async function verifyAndRecord(supabase: Sb, args: {
  companyId: string; signalId: string | null; sourceKey: string; excerpt: string;
  basis: { kind: BasisKind; text: string; at: string | null } | { kind: "none"; reason: NoBasisReason };
  recordedBy: string; note?: string | null;
}): Promise<{ verdict: Verdict; written: boolean } | null> {
  const excerpt = String(args.excerpt ?? "");
  if (!normalizeForHash(excerpt)) return null;
  const identity = await excerptIdentity(excerpt);
  if (args.basis.kind === "none") {
    const written = await recordVerification(supabase, { company_id: args.companyId, signal_id: args.signalId, source_url: args.sourceKey, excerpt_identity: identity, guard_version: EXCERPT_GUARD_VERSION, verdict: "no_basis", basis_kind: "none", basis_sha: null, basis_at: null, no_basis_reason: args.basis.reason, recorded_by: args.recordedBy, note: args.note ?? null });
    return { verdict: "no_basis", written };
  }
  const verdict = verdictAgainstBasis(excerpt, args.basis.text);
  const written = await recordVerification(supabase, { company_id: args.companyId, signal_id: args.signalId, source_url: args.sourceKey, excerpt_identity: identity, guard_version: EXCERPT_GUARD_VERSION, verdict, basis_kind: args.basis.kind, basis_sha: await basisSha(args.basis.text), basis_at: args.basis.at, no_basis_reason: null, recorded_by: args.recordedBy, note: args.note ?? null });
  return { verdict, written };
}

/** Retain the crawl's fetched page text at mint into outside_page_snapshots for EVERY company (ruling: without
 *  it a verdict is unrepeatable). signal_id NULL (the rows are not yet minted); dedup by (company, url, sha). */
export async function retainPublicPages(supabase: Sb, companyId: string, sourceTextByUrl: Map<string, string>, runId: string | number | null): Promise<{ retained: number; already: number }> {
  let retained = 0, already = 0;
  for (const [url, text] of sourceTextByUrl) {
    if (!url || !normalizeForHash(text)) continue;
    const sha = await basisSha(text);
    const { data: ex } = await supabase.from("outside_page_snapshots").select("id").eq("company_id", companyId).eq("source_url", url).eq("text_sha256", sha).limit(1);
    if (Array.isArray(ex) && ex.length > 0) { already++; continue; }
    const { error } = await supabase.from("outside_page_snapshots").insert({ company_id: companyId, source_url: url, signal_id: null, clean_text: text, text_sha256: sha, run_id: null, fetch_status: "ok", http_status: 200, structured: { retained_at_mint: true, public_baseline_run_id: runId == null ? null : String(runId) } });
    if (error) throw new Error(`outside_page_snapshots retain: ${error.message}`);
    retained++;
  }
  return { retained, already };
}
