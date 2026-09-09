// H3 (2026-09-09) — TRANSIENT-ERROR RETRY for the companies query.
//
// THE DEFECT: the companies list is fetched once. When the connection dropped in flight — Kong
// logged the operator's request as HTTP 499, client closed the connection, zero bytes returned —
// supabase-js surfaced `TypeError: Failed to fetch`. The hook's abort guard matches only the
// substrings "abort"/"aborted", so a dropped fetch fell straight into the hard-error branch, which
// set the error banner AND installed the sentinel company (id 00000000-…-0001). The First Read link
// then pointed at the sentinel and rendered "Company not found", and the sentinel id was persisted
// to localStorage, so it outlived the blip.
//
// THE RULE: a dropped connection is TRANSIENT, not an answer. Retry with backoff, and only call it a
// failure once the attempts are exhausted. A real error (permission denied, bad column, 400) is NOT
// transient and fails on the first attempt exactly as before — retrying it would only delay the banner.

/** Attempts, not retries: attempt 1 is the original call. */
export const COMPANIES_FETCH_ATTEMPTS = 3;
/** Backoff consumed AFTER a failed attempt. The third entry exists for callers that raise the
 *  attempt count; with 3 attempts only the first two waits are ever used (there is no wait after
 *  the final attempt — nothing follows it). */
export const COMPANIES_BACKOFF_MS = [1_000, 3_000, 9_000] as const;

export type FetchLikeError = {
  message?: string | null;
  details?: string | null;
  name?: string | null;
  code?: string | number | null;
  status?: number | null;
} | null | undefined;

/** Gateway/proxy codes that mean "the hop failed", not "the request was answered". */
const TRANSIENT_STATUS = new Set([408, 425, 429, 499, 500, 502, 503, 504]);

/** Substrings a dropped/timed-out fetch produces across browsers and runtimes. */
const TRANSIENT_TEXT = [
  "failed to fetch",      // Chrome
  "networkerror",         // Firefox ("NetworkError when attempting to fetch resource")
  "network error",
  "load failed",          // Safari
  "fetch failed",         // undici / node
  "connection closed",
  "socket hang up",
  "econnreset",
  "network request failed",
  "timeout",
  "timed out",
];

/**
 * Is this error the connection failing rather than the server answering?
 *
 * Deliberately NOT abort-aware: an abort is the caller's own cancellation and is handled by the
 * caller's abort guard before this is ever consulted. Retrying an abort would fight the unmount.
 */
export function isTransientFetchError(error: FetchLikeError): boolean {
  if (!error) return false;
  const status = typeof error.status === "number" ? error.status : null;
  if (status !== null && TRANSIENT_STATUS.has(status)) return true;
  const code = typeof error.code === "number" ? error.code : Number(error.code);
  if (Number.isFinite(code) && TRANSIENT_STATUS.has(code)) return true;

  const text = `${String(error.message ?? "")} ${String(error.details ?? "")}`.toLowerCase();
  // An abort is never transient — it is intentional.
  if (text.includes("abort")) return false;
  if (TRANSIENT_TEXT.some((t) => text.includes(t))) return true;
  // A bare fetch rejection arrives as a TypeError with no useful body.
  return String(error.name ?? "").toLowerCase() === "typeerror";
}

export type RetryResult<T> = {
  data: T | null;
  error: FetchLikeError;
  /** Attempts actually made (1 = succeeded first time). */
  attempts: number;
  /** attempts - 1. Zero when nothing was retried — the vacuous-proof counter. */
  retries: number;
  /** True when the loop gave up because `shouldAbort()` went true. */
  aborted: boolean;
};

/**
 * Run `run` until it succeeds, hits a non-transient error, or exhausts its attempts.
 * `sleep` is injected so tests exercise the real backoff schedule without real time.
 */
export async function fetchWithTransientRetry<T>(args: {
  run: (attempt: number) => Promise<{ data: T | null; error: FetchLikeError }>;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
  backoffMs?: readonly number[];
  isTransient?: (e: FetchLikeError) => boolean;
  /** Checked before each attempt and before each wait — unmount/pagehide stops the loop. */
  shouldAbort?: () => boolean;
}): Promise<RetryResult<T>> {
  const maxAttempts = args.maxAttempts ?? COMPANIES_FETCH_ATTEMPTS;
  const backoff = args.backoffMs ?? COMPANIES_BACKOFF_MS;
  const isTransient = args.isTransient ?? isTransientFetchError;
  const sleep = args.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const shouldAbort = args.shouldAbort ?? (() => false);

  let attempts = 0;
  let last: { data: T | null; error: FetchLikeError } = { data: null, error: null };

  for (let i = 0; i < maxAttempts; i++) {
    if (shouldAbort()) return { ...last, attempts, retries: Math.max(attempts - 1, 0), aborted: true };
    attempts++;
    last = await args.run(attempts);
    if (!last.error) break;                 // answered
    if (!isTransient(last.error)) break;    // a real error — fail fast, do not delay the banner
    if (i === maxAttempts - 1) break;       // exhausted; nothing follows, so no wait
    if (shouldAbort()) return { ...last, attempts, retries: attempts - 1, aborted: true };
    await sleep(backoff[Math.min(i, backoff.length - 1)]);
  }

  return { data: last.data, error: last.error, attempts, retries: Math.max(attempts - 1, 0), aborted: false };
}
