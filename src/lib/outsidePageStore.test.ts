import { describe, it, expect, vi, afterEach } from "vitest";
import { classifyFetchStatus, fetchOutsidePage } from "../../supabase/functions/_shared/outsidePageStore.ts";
import { normalizeForHash, sha256Hex } from "../../supabase/functions/_shared/contentIdentity.ts";

function fakeResponse(status: number, body: string, contentType = "text/html"): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? contentType : null) },
    text: async () => body,
  } as unknown as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe("Gate 3 · outside-page store — honest fetch_status classification", () => {
  it("ok → ok; 404/410 → gone; 403/401/429/0/415 → blocked", () => {
    expect(classifyFetchStatus(200, true)).toBe("ok");
    expect(classifyFetchStatus(404, false)).toBe("gone");
    expect(classifyFetchStatus(410, false)).toBe("gone");
    expect(classifyFetchStatus(403, false)).toBe("blocked");
    expect(classifyFetchStatus(401, false)).toBe("blocked");
    expect(classifyFetchStatus(429, false)).toBe("blocked");
    expect(classifyFetchStatus(0, false)).toBe("blocked");
    expect(classifyFetchStatus(415, false)).toBe("blocked");
  });
});

describe("Gate 3 · fetchOutsidePage — content identity + honest absence", () => {
  it("200 HTML → ok, clean_text present, text_sha256 recomputes byte-identical via the TS helper", async () => {
    const html = "<html><body><p>Wine + Eggs sells Cafe Barra's Machado de Assis Brazil.</p></body></html>";
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(200, html)));
    const d = await fetchOutsidePage("https://wineandeggs.com/x");
    expect(d.fetch_status).toBe("ok");
    expect(d.http_status).toBe(200);
    expect(d.clean_text).toContain("Machado de Assis");
    // hash-integrity: the stored hash IS sha256Hex(normalizeForHash(clean_text))
    expect(d.text_sha256).toBe(await sha256Hex(normalizeForHash(d.clean_text!)));
  });

  it("403 → blocked, NULL clean_text, deterministic empty-content hash (row still written, not skipped)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(403, "Forbidden")));
    const d = await fetchOutsidePage("https://www.lefrenchrooster.com/about-us/");
    expect(d.fetch_status).toBe("blocked");
    expect(d.http_status).toBe(403);
    expect(d.clean_text).toBeNull();
    expect(d.text_sha256).toBe(await sha256Hex(normalizeForHash("")));
  });

  it("404 → gone, NULL clean_text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(404, "Not Found")));
    const d = await fetchOutsidePage("https://postmates.com/store/x");
    expect(d.fetch_status).toBe("gone");
    expect(d.http_status).toBe(404);
    expect(d.clean_text).toBeNull();
  });

  it("200-but-empty is not usable basis → blocked (never a padded ok)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse(200, "<html><head></head><body></body></html>")));
    const d = await fetchOutsidePage("https://example.com/empty");
    expect(d.fetch_status).toBe("blocked");
    expect(d.clean_text).toBeNull();
  });

  it("network failure → blocked (status 0), never throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const d = await fetchOutsidePage("https://unreachable.example/x");
    expect(d.fetch_status).toBe("blocked");
    expect(d.http_status).toBe(0);
  });
});
