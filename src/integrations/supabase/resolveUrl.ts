// Single home for deriving the browser-facing Supabase base URL from the configured URL and the
// page's hostname. Pure + unit-tested; client.ts delegates here (auth, PostgREST, and
// functions.invoke all use the one base this returns).

// Remote access via `tailscale serve`: the app is served with TLS at this hostname, and the
// operator published the Supabase API at :8443 (→ localhost:54321). A remote https origin CANNOT
// reach http://localhost:54321 — it is mixed-content-blocked AND the port is not tunneled. The
// hostname-only dev rewrite below would yield http://<ts.net>:54321, which silently hangs auth
// (a mixed-content fetch never leaves the browser, so the sign-in promise never settles). Map the
// known ts.net host straight to its TLS API instead. Specific host constant — no wildcard.
export const TAILSCALE_APP_HOST = "mojomap.tail7b863b.ts.net";
export const TAILSCALE_SUPABASE_URL = "https://mojomap.tail7b863b.ts.net:8443";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

/**
 * Map the configured Supabase URL to the one the current browser origin should actually call.
 * Pure: no window / env access — callers pass hostname + isDev. Returns the configured URL
 * unchanged for localhost and for any host not specifically handled.
 */
export function mapSupabaseUrl(
  configuredUrl: string,
  browserHost: string | undefined,
  isDev: boolean,
): string {
  // The ts.net host maps to its TLS API regardless of DEV — it is a specific, known origin.
  if (browserHost === TAILSCALE_APP_HOST) return TAILSCALE_SUPABASE_URL;

  try {
    const parsed = new URL(configuredUrl);
    // In dev, a page opened via a LAN / Tailscale IP talks to the same host's local Supabase by
    // swapping ONLY the hostname (protocol + port preserved). Unchanged from the prior behaviour.
    if (isDev && LOCAL_HOSTS.has(parsed.hostname) && browserHost && !LOCAL_HOSTS.has(browserHost)) {
      parsed.hostname = browserHost;
      return parsed.toString().replace(/\/$/, "");
    }
  } catch {
    // malformed configured URL → fall back to it verbatim
  }
  return configuredUrl;
}
