// U6-45 / U6-55 — the path a signed-out visitor was trying to reach, carried through /login.
//
// A "next" parameter is an open redirect unless it is constrained, and the constraint signed here is
// narrow on purpose: a SAME-ORIGIN PATH, as a path — no host, no scheme, no protocol-relative form.
// Anything else is rejected and the carry is simply dropped, which costs the visitor one navigation
// and costs an attacker the whole trick.
//
// Rejected, each for its own reason:
//   "https://evil.test/x"  absolute URL — a different origin
//   "//evil.test/x"        protocol-relative; the browser reads it as a host, not a path
//   "/\\evil.test"         backslash; some parsers normalise "\" to "/" and it becomes the above
//   "javascript:…"         not a navigation at all
//   "/login"               would bounce the visitor back to the page they are already on

export const LOGIN_PATH = "/login";
export const NEXT_PARAM = "next";

/**
 * The attempted path, if it is safe to carry; otherwise null.
 * Accepts a path with an optional query and hash. Never accepts anything that names an origin.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value.length === 0 || value.length > 2048) return null;
  // must be a path, and only a path
  if (!value.startsWith("/")) return null;
  // "//host" and "/\host" both resolve to another origin
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  // a scheme anywhere before the first slash-delimited segment ("javascript:", "data:", …) —
  // belt and braces, since the leading "/" above already excludes a well-formed absolute URL
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  // control characters, including the newline/tab tricks used to smuggle a scheme past a regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  // no point carrying the sign-in page itself
  if (value === LOGIN_PATH || value.startsWith(`${LOGIN_PATH}?`) || value.startsWith(`${LOGIN_PATH}/`)) return null;
  return value;
}

/** `/login?next=<path>` when the path is safe to carry, else a bare `/login`. */
export function loginPathFor(attempted: string | null | undefined): string {
  const next = safeNextPath(attempted);
  return next ? `${LOGIN_PATH}?${NEXT_PARAM}=${encodeURIComponent(next)}` : LOGIN_PATH;
}

/** The carried path from a location's search string, validated again on the way out. */
export function carriedNextFrom(search: string | null | undefined): string | null {
  if (typeof search !== "string" || search.length === 0) return null;
  let raw: string | null = null;
  try {
    raw = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get(NEXT_PARAM);
  } catch {
    return null;
  }
  return safeNextPath(raw);
}
