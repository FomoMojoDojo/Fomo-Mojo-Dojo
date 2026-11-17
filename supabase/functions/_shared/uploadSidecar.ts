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

// X1 (2026-11-17): THE START STEP RECOVERS A FILE THAT HAS NO SIDECAR. A file uploaded while the parser
// was down closes `reader_unavailable` and, by construction, never got a sidecar — and the start step
// used to find a file ONLY through its sidecar, so "Analyze again" failed every such file ("No upload
// sidecar …"), the opposite of what the signed reason promises. Now: no sidecar but a stored path ⇒ the
// run reads the file from that path (refreshReadAndWindow writes the sidecar from that read), with no
// old text to compare and nothing to reuse.
export type StartSource = { text: string; filePath: string; fromSidecar: boolean };

/** PURE: what the start step reads from — the sidecar, else the stored path, else nothing. */
export function resolveStartSource(
  sidecar: { text: string; filePath: string } | null,
  storedPath: string | null | undefined,
): StartSource | null {
  if (sidecar?.filePath) return { text: sidecar.text, filePath: sidecar.filePath, fromSidecar: true };
  const p = String(storedPath ?? "").trim();
  return p ? { text: "", filePath: p, fromSidecar: false } : null;
}

/** The file's stored path, read on its own (no sidecar needed). */
export async function storedFilePath(supabase: { from: (t: string) => any }, fileId: string | null | undefined): Promise<string | null> {
  const id = String(fileId ?? "").trim();
  if (!id) return null;
  const { data: file } = await supabase.from("input_files").select("file_path").eq("id", id).maybeSingle();
  const p = String(file?.file_path ?? "").trim();
  return p || null;
}
