// V2-6d — the canonical fetch-and-extract path, lifted VERBATIM from public-baseline's
// own crawl primitives (extractTextBasic / fetchWithTimeout / fetchAndExtract) so the
// fetch-and-retain quote pass reuses the SAME fetch behavior — same browser-ish UA,
// same 20s timeout, same tag-stripping extraction, same 12k cap — rather than inventing
// a second fetcher ("reuse, don't fork", GOAL 1).
//
// Note on the fragile-generator ruling: public-baseline still carries its own inline
// copies of these three functions and is deliberately left UNTOUCHED for this gate.
// This module is the shared home new consumers use; migrating public-baseline to import
// it is a separate, deferred change (it would touch the fragile generator).

/** Strip tags/script/style to readable text — identical to the crawl's extractTextBasic. */
export function extractTextBasic(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|br|li|h1|h2|h3|h4|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** fetch() with an abort timeout and the crawl's browser-ish default headers. */
export async function fetchWithTimeout(url: string, ms: number, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const headers = new Headers(init.headers || {});
    if (!headers.has("User-Agent")) {
      headers.set("User-Agent", "Mozilla/5.0 (compatible; MojoBaselineBot/1.0; +https://fomomojodojo.com)");
    }
    if (!headers.has("Accept")) {
      headers.set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
    }
    if (!headers.has("Accept-Language")) {
      headers.set("Accept-Language", "en-US,en;q=0.8");
    }
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: init.redirect || "follow",
      headers,
    });
  } finally {
    clearTimeout(t);
  }
}

export interface FetchExtractResult {
  url: string;
  ok: boolean;
  /** HTTP status; 0 = network/timeout/abort; 415 = non-HTML (PDF etc.). */
  status: number;
  text: string;
}

/**
 * Fetch a URL and return its readable text (capped at 12k), or an honest failure with the
 * status. Identical behavior to public-baseline's fetchAndExtract: !ok on non-2xx, 415 on
 * PDF, status 0 on network/timeout. Bot-walled and failed fetches surface as ok:false —
 * the caller records honest absence, never pads.
 */
export async function fetchAndExtract(url: string): Promise<FetchExtractResult> {
  try {
    const resp = await fetchWithTimeout(url, 20_000);
    const ct = resp.headers.get("content-type") || "";
    if (!resp.ok) return { url, ok: false, status: resp.status, text: "" };
    if (ct.includes("application/pdf")) return { url, ok: false, status: 415, text: "" };
    const html = await resp.text();
    const text = extractTextBasic(html);
    const capped = text.slice(0, 12_000);
    return { url, ok: true, status: 200, text: capped };
  } catch {
    return { url, ok: false, status: 0, text: "" };
  }
}
