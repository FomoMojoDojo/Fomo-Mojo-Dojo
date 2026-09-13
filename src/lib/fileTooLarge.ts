// ── analysis size refusal — the client side of _shared/fileSizeGuard.ts (2026-09-12) ──────────────
//
// Both extraction functions refuse a file above the cap with HTTP 413 {error:"file_too_large", size, cap}
// before downloading it. Every surface that can receive that refusal (workspace Inputs, the old Inputs
// tab, the upload dialog) renders ONE signed sentence from it:
//   "File too large to analyse — {size} exceeds the {cap} limit"
// The cap mirrors the upload dialog's existing 25 MiB promise.

export const FILE_TOO_LARGE_CAP_BYTES = 25 * 1024 * 1024;

export type FileTooLargeRefusal = { size: number; cap: number };

/** "24.3 MiB" for a measured size, "25 MiB" for a whole-number cap. */
export function formatMiB(bytes: number): string {
  const mib = bytes / 1048576;
  return Number.isInteger(mib) ? `${mib} MiB` : `${mib.toFixed(1)} MiB`;
}

/** The signed refusal sentence (ruling 3, 2026-09-12). */
export function fileTooLargeMessage(refusal: FileTooLargeRefusal): string {
  return `File too large to analyse — ${formatMiB(refusal.size)} exceeds the ${formatMiB(refusal.cap)} limit`;
}

/** The typed refusal body, or null for anything else. */
export function parseFileTooLarge(body: unknown): FileTooLargeRefusal | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { error?: unknown; size?: unknown; cap?: unknown };
  if (b.error !== "file_too_large") return null;
  if (typeof b.size !== "number" || typeof b.cap !== "number") return null;
  return { size: b.size, cap: b.cap };
}

/** supabase.functions.invoke surfaces a non-2xx as FunctionsHttpError with the Response on `context`. */
export async function refusalFromInvoke(data: unknown, error: unknown): Promise<FileTooLargeRefusal | null> {
  const direct = parseFileTooLarge(data);
  if (direct) return direct;
  const ctx = (error as { context?: unknown } | null)?.context;
  if (ctx && typeof (ctx as Response).clone === "function") {
    try {
      return parseFileTooLarge(await (ctx as Response).clone().json());
    } catch {
      return null;
    }
  }
  return null;
}

export class FileTooLargeError extends Error {
  readonly refusal: FileTooLargeRefusal;
  constructor(refusal: FileTooLargeRefusal) {
    super(fileTooLargeMessage(refusal));
    this.name = "FileTooLargeError";
    this.refusal = refusal;
  }
}
