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

import { normalizeForHash, sha256Hex } from "./contentIdentity.ts";
import { sidecarCapForFile } from "./sidecarAllocation.ts";

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
export async function loadContributingDocs(
  supabase: SupabaseLike,
  companyId: string,
): Promise<ContributingDoc[]> {
  const { data: inputRows } = await supabase.from("inputs").select("id").eq("company_id", companyId).limit(60);
  const inputIds = ((inputRows ?? []) as Array<{ id?: string }>).map((r) => String(r?.id || "")).filter(Boolean);
  if (inputIds.length === 0) return [];

  const { data: fileRows } = await supabase
    .from("input_files")
    .select("id, file_name, file_type, file_path, archived_at")
    .in("input_id", inputIds)
    .limit(180);
  const files = ((fileRows ?? []) as Array<{
    id?: string;
    file_name?: string;
    file_type?: string;
    file_path?: string;
    archived_at?: string | null;
  }>).filter((f) => !f?.archived_at); // withdrawn uploads are never declared voice

  const ordered = [
    ...files.filter((f) => String(f?.file_name || "").trim().startsWith("B2B_")),
    ...files.filter((f) => !String(f?.file_name || "").trim().startsWith("B2B_")),
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
  // Stable order for deterministic runs/proofs.
  return out.sort((a, b) => a.input_file_id.localeCompare(b.input_file_id));
}
