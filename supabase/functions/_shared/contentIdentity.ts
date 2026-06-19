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

// The ONE identity-source for odi_needs rows (needs-identity-source hardening,
// 2026-06-18). odi_needs identity = hash(desired_outcome) ALWAYS — canonical
// (odi_canonical_statement) is a PURE DERIVED display field and must never affect
// identity (a derived backfill changing identity caused false-ADD / force-regen
// misclassification). `outcome` is the new-row field that BECOMES desired_outcome
// on write, so it's the fallback for incoming rows. desired_outcome is NOT NULL and
// never blank, so this is always a safe non-empty identity (no hash('') sink).
// Mirrors the opportunities table, which already hashes `outcome` alone.
export function needIdentityStatement(
  row: { desired_outcome?: string | null; outcome?: string | null },
): string {
  return String(row.desired_outcome ?? row.outcome ?? "");
}
