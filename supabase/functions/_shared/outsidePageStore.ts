// ── Outside-page basis store (Gate 3 / J1 step 1) ────────────────────────────
//
// The explicit outside-fetch pass: fetch an outside signal's URL, clean it, and
// record an honest snapshot in outside_page_snapshots. Independent of the baseline
// model path (callClaudeWebSearch never fetches these — only cited_text). A 403/404
// is not skipped: it writes a row with fetch_status + http_status and NULL clean_text.
// Content identity uses the SINGLE TS helper (normalizeForHash + sha256Hex).
//
// This module is INERT: no render path reads what it writes. It drops nothing,
// supersedes nothing, and writes ONLY to outside_page_snapshots.
import { fetchWithTimeout, extractTextBasic } from "./fetchAndExtract.ts";
import { normalizeForHash, sha256Hex } from "./contentIdentity.ts";

// A browser User-Agent, matching the design-gate reachability probe: outside review /
// listing sites commonly 403 a bot UA. Fetching public pages we are allowed to read.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export type OutsideFetchStatus = "ok" | "blocked" | "gone";

/** Map an HTTP result to the honest fetch_status. gone = the page is removed (404/410);
 *  blocked = present-but-unreadable (403/401/429/415-non-HTML/5xx/timeout=0). */
export function classifyFetchStatus(httpStatus: number, ok: boolean): OutsideFetchStatus {
  if (ok) return "ok";
  if (httpStatus === 404 || httpStatus === 410) return "gone";
  return "blocked";
}

export interface OutsideSnapshotDraft {
  fetch_status: OutsideFetchStatus;
  http_status: number;
  clean_text: string | null;
  text_sha256: string;
}

/** Fetch + clean one outside URL into a snapshot draft. Never throws — a network
 *  failure resolves to status 0 → 'blocked'. clean_text is NULL unless 'ok'. */
export async function fetchOutsidePage(url: string): Promise<OutsideSnapshotDraft> {
  let httpStatus = 0;
  let ok = false;
  let text = "";
  try {
    const resp = await fetchWithTimeout(url, 20_000, { headers: { "User-Agent": BROWSER_UA } });
    httpStatus = resp.status;
    const ct = resp.headers.get("content-type") || "";
    if (resp.ok && ct.includes("application/pdf")) {
      httpStatus = 415; // non-HTML → not readable text
    } else if (resp.ok) {
      text = extractTextBasic(await resp.text()).slice(0, 12_000);
      ok = text.trim().length > 0;
      if (!ok) httpStatus = httpStatus || 204; // 200-but-empty is not usable basis
    }
  } catch {
    httpStatus = 0;
  }
  const fetch_status = classifyFetchStatus(httpStatus, ok);
  const clean_text = fetch_status === "ok" ? text : null;
  // Deterministic identity even for no-fetch rows: hash of the empty-normalized string.
  const text_sha256 = await sha256Hex(normalizeForHash(clean_text ?? ""));
  return { fetch_status, http_status: httpStatus, clean_text, text_sha256 };
}
