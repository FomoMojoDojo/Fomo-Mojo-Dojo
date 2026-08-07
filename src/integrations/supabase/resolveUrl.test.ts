import { describe, it, expect } from "vitest";
import { mapSupabaseUrl, TAILSCALE_APP_HOST, TAILSCALE_SUPABASE_URL } from "./resolveUrl";

const LOCAL = "http://127.0.0.1:54321";

describe("mapSupabaseUrl", () => {
  // THE FIX: a remote https ts.net origin must call the TLS API at :8443, never the mixed-content
  // http://<ts.net>:54321 the hostname-only rewrite used to produce (which silently hung sign-in).
  it("ts.net host → the TLS :8443 API (https, not the mixed-content http:54321)", () => {
    const out = mapSupabaseUrl(LOCAL, TAILSCALE_APP_HOST, true);
    expect(out).toBe(TAILSCALE_SUPABASE_URL);
    const u = new URL(out);
    expect(u.protocol).toBe("https:");            // was http: → mixed-content blocked
    expect(u.port).toBe("8443");                  // was 54321 → not tunneled remotely
    expect(u.hostname).toBe(TAILSCALE_APP_HOST);
  });

  it("ts.net host maps regardless of DEV (specific known origin)", () => {
    expect(mapSupabaseUrl(LOCAL, TAILSCALE_APP_HOST, false)).toBe(TAILSCALE_SUPABASE_URL);
  });

  // LOCALHOST UNTOUCHED — byte-identical to the configured URL, both dev and prod.
  it("localhost browser → configured URL unchanged", () => {
    expect(mapSupabaseUrl(LOCAL, "localhost", true)).toBe(LOCAL);
    expect(mapSupabaseUrl(LOCAL, "127.0.0.1", true)).toBe(LOCAL);
    expect(mapSupabaseUrl(LOCAL, "localhost", false)).toBe(LOCAL);
  });

  // Existing LAN/Tailscale-IP dev rewrite preserved: hostname swapped, protocol + port kept.
  it("dev LAN/IP host → hostname swapped only (protocol + port preserved)", () => {
    expect(mapSupabaseUrl(LOCAL, "192.168.12.191", true)).toBe("http://192.168.12.191:54321");
    expect(mapSupabaseUrl(LOCAL, "100.96.232.94", true)).toBe("http://100.96.232.94:54321");
  });

  it("LAN/IP host in PROD (not dev) → no rewrite, configured URL unchanged", () => {
    expect(mapSupabaseUrl(LOCAL, "192.168.12.191", false)).toBe(LOCAL);
  });

  it("no browser host (SSR-ish) → configured URL unchanged", () => {
    expect(mapSupabaseUrl(LOCAL, undefined, true)).toBe(LOCAL);
  });

  it("malformed configured URL → returned verbatim (no throw)", () => {
    expect(mapSupabaseUrl("not-a-url", "192.168.1.2", true)).toBe("not-a-url");
  });

  // A cloud/https configured URL is never touched for localhost.
  it("cloud https configured URL → unchanged on localhost", () => {
    const cloud = "https://abc.supabase.co";
    expect(mapSupabaseUrl(cloud, "localhost", true)).toBe(cloud);
  });
});
