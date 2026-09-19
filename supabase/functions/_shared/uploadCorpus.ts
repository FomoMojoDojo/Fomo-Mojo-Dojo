// VOICE-GATE — uploadCorpus: the SINGLE definition of a company's "contributing
// documents" — the uploaded docs that would feed a declared brief. The classifier
// (classify-upload-voice) and the gate (corpusVoiceGate) BOTH read the corpus
// through here, and the declared synthesis seams feed their brief from the same
// list, so "the docs the model classified", "the docs the gate checks", and "the
// docs that reach the declared brief" are provably the SAME set — no drift.
//
// content_sha is the identity of the CLASSIFIED CONTENT, computed ONLY through the
// TS authority contentIdentity.ts (normalizeForHash + sha256Hex) over the FULL
// extracted-text sidecar — any edit anywhere in the document changes the sha and
// re-blocks (even edits past the excerpt cap). The excerpt (capped per
// sidecarAllocation) is what the model reads and what the brief carries.
//
// Archived uploads are EXCLUDED — an archived doc is withdrawn and must never be
// read as the client's declared voice.
//
// OPERATOR-RETIRED uploads are EXCLUDED (ruling J2, signed 2026-09-18): an upload whose
// upload-family signals are ALL withdrawn with an operator_retired reason (≥1 signal, 0 live)
// never reaches a model again — the operator's retirement IS the recorded decision; no new
// flag, no migration. Signals reach an upload through file_proposals (signals.source_id =
// file_proposals.id): by file_id when the upload has a proposal of its own, else by exact
// file_name within the company (the historic test ingests were re-uploaded under new file ids,
// so their proposals dangle — Edgewood Alternatives-14b55a57.pdf). An upload with some live
// signals, or with no signals at all (not yet ingested), still contributes. A lookup error
// FAILS CLOSED: every upload is excluded and the exclusion is reported, never silently included.

import { normalizeForHash, sha256Hex } from "./contentIdentity.ts";
import { sidecarCapForFile } from "./sidecarAllocation.ts";

export const UPLOAD_FAMILY_SOURCE_TYPES = ["uploaded_file", "file", "file_proposal", "intake"] as const;
export const OPERATOR_RETIRED_PREFIX = "operator_retired";

export type ExcludedUpload = { input_file_id: string; file_name: string; reason: "operator_retired" | "lookup_error"; detail: string };
export type ContributingCorpus = { docs: ContributingDoc[]; excluded: ExcludedUpload[] };

type ProposalRow = { id: string; file_id: string | null; file_name: string | null };
type SignalRow = { source_id: string | null; superseded_at: string | null; superseded_reason: string | null };

/** The J2 predicate, pure: is this upload fully operator-retired? (≥1 upload-family signal, 0 live, every
 *  withdrawal reason operator_retired). Proposals by file_id when any exist, else by exact file_name. */
export function isOperatorRetiredUpload(
  file: { id: string; file_name: string },
  proposals: readonly ProposalRow[],
  signals: readonly SignalRow[],
): { retired: boolean; total: number; live: number; reasons: string[] } {
  const byId = proposals.filter((p) => p.file_id === file.id);
  const linked = byId.length > 0 ? byId : proposals.filter((p) => !!p.file_name && p.file_name === file.file_name);
  const ids = new Set(linked.map((p) => p.id));
  const sig = signals.filter((s) => !!s.source_id && ids.has(s.source_id));
  const live = sig.filter((s) => !s.superseded_at).length;
  const reasons = [...new Set(sig.filter((s) => !!s.superseded_at).map((s) => String(s.superseded_reason ?? "")))];
  const allRetired = sig.length > 0 && live === 0 && reasons.every((r) => r.startsWith(OPERATOR_RETIRED_PREFIX));
  return { retired: allRetired, total: sig.length, live, reasons };
}

export type ContributingDoc = {
  input_file_id: string;
  file_name: string;
  file_type: string;
  file_path: string;
  content_sha: string; // sha256(normalizeForHash(full extracted text)) — TS authority only
  excerpt: string; // full text sliced to sidecarCapForFile(file_name)
};

type SupabaseLike = {
  from: (t: string) => any;
  storage: { from: (b: string) => { download: (p: string) => Promise<{ data: Blob | null; error: unknown }> } };
};

// Mirrors the declared synthesis seams: company inputs → non-archived input_files
// (B2B_ core first), each contributing iff its .extracted.txt sidecar has text.
// The docs only — every caller reads through here; exclusions are logged. Use
// loadContributingCorpus to receive the exclusion list.
export async function loadContributingDocs(
  supabase: SupabaseLike,
  companyId: string,
): Promise<ContributingDoc[]> {
  const { docs, excluded } = await loadContributingCorpus(supabase, companyId);
  for (const x of excluded) console.log(`[uploadCorpus] excluded “${x.file_name}” (${x.input_file_id}): ${x.reason} — ${x.detail}`);
  return docs;
}

export async function loadContributingCorpus(
  supabase: SupabaseLike,
  companyId: string,
): Promise<ContributingCorpus> {
  const excluded: ExcludedUpload[] = [];
  const { data: inputRows } = await supabase.from("inputs").select("id").eq("company_id", companyId).limit(60);
  const inputIds = ((inputRows ?? []) as Array<{ id?: string }>).map((r) => String(r?.id || "")).filter(Boolean);
  if (inputIds.length === 0) return { docs: [], excluded };

  const { data: fileRows } = await supabase
    .from("input_files")
    .select("id, file_name, file_type, file_path, archived_at")
    .in("input_id", inputIds)
    .limit(180);
  const notArchived = ((fileRows ?? []) as Array<{
    id?: string;
    file_name?: string;
    file_type?: string;
    file_path?: string;
    archived_at?: string | null;
  }>).filter((f) => !f?.archived_at); // withdrawn uploads are never declared voice

  // J2 — the retirement filter, ONE predicate, ONE place. Fail closed on a lookup error.
  let proposals: ProposalRow[] = [];
  let signals: SignalRow[] = [];
  let lookupError: string | null = null;
  try {
    const { data: pRows, error: pErr } = await supabase.from("file_proposals").select("id, file_id, file_name").eq("company_id", companyId);
    if (pErr) throw new Error(`file_proposals: ${String(pErr.message ?? pErr)}`);
    const { data: sRows, error: sErr } = await supabase.from("signals").select("source_id, superseded_at, superseded_reason")
      .eq("company_id", companyId).in("source_type", [...UPLOAD_FAMILY_SOURCE_TYPES]);
    if (sErr) throw new Error(`signals: ${String(sErr.message ?? sErr)}`);
    proposals = ((pRows ?? []) as Array<{ id?: unknown; file_id?: unknown; file_name?: unknown }>).map((p) => ({ id: String(p.id ?? ""), file_id: p.file_id == null ? null : String(p.file_id), file_name: p.file_name == null ? null : String(p.file_name) }));
    signals = ((sRows ?? []) as Array<{ source_id?: unknown; superseded_at?: unknown; superseded_reason?: unknown }>).map((s) => ({ source_id: s.source_id == null ? null : String(s.source_id), superseded_at: s.superseded_at == null ? null : String(s.superseded_at), superseded_reason: s.superseded_reason == null ? null : String(s.superseded_reason) }));
  } catch (e) {
    lookupError = String(e instanceof Error ? e.message : e);
  }
  const files = notArchived.filter((f) => {
    const id = String(f?.id || "");
    const name = String(f?.file_name || "").trim();
    if (lookupError) {
      excluded.push({ input_file_id: id, file_name: name, reason: "lookup_error", detail: `retirement lookup failed — excluded (fail closed): ${lookupError}` });
      return false;
    }
    const v = isOperatorRetiredUpload({ id, file_name: name }, proposals, signals);
    if (v.retired) {
      excluded.push({ input_file_id: id, file_name: name, reason: "operator_retired", detail: `${v.total} upload-family signal(s), 0 live; reasons: ${v.reasons.join(", ")}` });
      return false;
    }
    return true;
  });

  // Operator-approved ordering: B2B_ core first, the rest after. Within each
  // partition sort by file_path so the corpus (and the declared brief built from
  // it) is deterministic across runs without a DB ORDER BY.
  const byPath = (a: { file_path?: string }, b: { file_path?: string }) =>
    String(a?.file_path || "").localeCompare(String(b?.file_path || ""));
  const ordered = [
    ...files.filter((f) => String(f?.file_name || "").trim().startsWith("B2B_")).sort(byPath),
    ...files.filter((f) => !String(f?.file_name || "").trim().startsWith("B2B_")).sort(byPath),
  ];

  const out: ContributingDoc[] = [];
  for (const f of ordered) {
    const inputFileId = String(f?.id || "");
    const filePath = String(f?.file_path || "").trim();
    const fileName = String(f?.file_name || "").trim();
    const fileType = String(f?.file_type || "").trim();
    if (!inputFileId || !filePath) continue;
    try {
      const { data: sidecar, error } = await supabase.storage.from("input-files").download(`${filePath}.extracted.txt`);
      if (error || !sidecar) continue;
      const fullText = (await sidecar.text()).replace(/\s+/g, " ").trim();
      if (!fullText) continue; // empty sidecar contributes nothing to the brief or the gate
      const contentSha = await sha256Hex(normalizeForHash(fullText));
      out.push({
        input_file_id: inputFileId,
        file_name: fileName,
        file_type: fileType,
        file_path: filePath,
        content_sha: contentSha,
        excerpt: fullText.slice(0, sidecarCapForFile(fileName)),
      });
    } catch {
      // missing/unreadable sidecar contributes nothing
    }
  }
  // `ordered` already fixes B2B_-first + within-partition file_path order.
  return { docs: out, excluded };
}
