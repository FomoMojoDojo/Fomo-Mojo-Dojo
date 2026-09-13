// ── analysis file-size guard (2026-09-12) ────────────────────────────────────────────────────────
//
// The extraction path holds the whole file in the 256 MB edge worker. The cap is the upload dialog's
// existing promise (25 MiB); anything above it is refused BEFORE download() with a typed body the
// surfaces render as the signed refusal string. The size is read from storage metadata (list), never
// by downloading the object. A missing object (size unknown) is not refused here — the download that
// follows reports it as it always has.

export const MAX_ANALYSIS_FILE_BYTES = 25 * 1024 * 1024;

export type FileTooLargeBody = { error: "file_too_large"; size: number; cap: number };

type StorageListClient = {
  storage: {
    from: (bucket: string) => {
      list: (path?: string, opts?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    };
  };
};

/** The object's size in bytes from storage metadata, or null when it cannot be read. */
export async function storageObjectSize(supabase: StorageListClient, bucket: string, path: string): Promise<number | null> {
  const clean = String(path || "").replace(/^\/+/, "");
  const slash = clean.lastIndexOf("/");
  const dir = slash >= 0 ? clean.slice(0, slash) : "";
  const name = slash >= 0 ? clean.slice(slash + 1) : clean;
  if (!name) return null;
  try {
    const { data, error } = await supabase.storage.from(bucket).list(dir, { search: name, limit: 200 });
    if (error || !Array.isArray(data)) return null;
    const hit = (data as Array<{ name?: string; metadata?: { size?: unknown } | null }>).find((o) => o?.name === name);
    const size = hit?.metadata?.size;
    return typeof size === "number" && Number.isFinite(size) ? size : null;
  } catch {
    return null;
  }
}

export function fileTooLargeBody(size: number, cap = MAX_ANALYSIS_FILE_BYTES): FileTooLargeBody {
  return { error: "file_too_large", size, cap };
}

/** Refuse iff the size is known and above the cap. */
export function isOverCap(size: number | null, cap = MAX_ANALYSIS_FILE_BYTES): size is number {
  return typeof size === "number" && size > cap;
}
