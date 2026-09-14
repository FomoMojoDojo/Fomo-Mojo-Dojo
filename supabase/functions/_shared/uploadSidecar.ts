// The extracted-text sidecar of an uploaded document (`<file_path>.extracted.txt`, written by analyze-file at
// upload, by intake, or by the sidecar backfill) — the single content identity every reader shares
// (uploadVoiceClassifier, uploadCorpus). Ruling 5 (2026-09-14): it is also the BASIS the E4 excerpt guard
// verifies upload evidence against. Returns null when the file row or the sidecar is gone (orphan proposals):
// the guard then leaves drafts as-is — its honest-limit law — and the caller logs it.
type Sb = { from: (t: string) => any; storage: any };

export async function loadUploadSidecar(supabase: Sb, fileId: string | null | undefined): Promise<{ text: string; filePath: string } | null> {
  const id = String(fileId ?? "").trim();
  if (!id) return null;
  const { data: file } = await supabase.from("input_files").select("file_path").eq("id", id).maybeSingle();
  const filePath = String(file?.file_path ?? "").trim();
  if (!filePath) return null;
  const { data: sidecar, error } = await supabase.storage.from("input-files").download(`${filePath}.extracted.txt`);
  if (error || !sidecar) return null;
  const text = await sidecar.text();
  return text.trim() ? { text, filePath } : null;
}
export async function loadUploadSidecarText(supabase: Sb, fileId: string | null | undefined): Promise<string | null> {
  return (await loadUploadSidecar(supabase, fileId))?.text ?? null;
}
