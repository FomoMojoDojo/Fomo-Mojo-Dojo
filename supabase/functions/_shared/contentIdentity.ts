// PCT-2: the single authoritative content-identity implementation. Every place
// that derives a stable identity from a free-text statement hashes through here —
// the reconcile (public opps/needs) and the step-perspective judge both import
// these, so the normalization rule can never drift between call sites.
//
// Order is load-bearing and verified against a SQL/TS parity harness (PCT-1):
// lower() -> collapse any whitespace run (JS \s, incl. Unicode like NBSP) to one
// space -> trim. A SQL re-implementation was rejected precisely because Postgres
// POSIX \s diverges on Unicode whitespace; this TS helper is the only source.

export function normalizeForHash(value: string): string {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Content identity of a single free-text statement.
export async function contentIdentity(statement: string): Promise<string> {
  return sha256Hex(normalizeForHash(statement));
}
