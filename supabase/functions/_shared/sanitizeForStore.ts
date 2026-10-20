// ── R36 (a) (operator ruling 2026-10-20): MODEL OUTPUT IS SANITIZED AT THE PARSE BOUNDARY ────────────────────
//
// Heart Coffee's regen run (52851965) minted 58 rows and then lost its ledger: the run's integrity row was refused
// with "unsupported Unicode escape sequence" because a candidate record carried U+0000 — a \u0000 escape in the
// model's JSON, which JSON.parse turns into a real NUL that Postgres jsonb and text refuse. This is the ONE sanitizer:
// it strips U+0000 and replaces every other C0 control except \t \n \r with a space, and says whether it changed
// anything, so the candidate record can carry `sanitized: true`. Applied where generator and judge JSON are parsed
// (parseGeneratorStatements: text, reason · the judge verdict map: quote, reason · judgeSpeaker: speaker_name,
// speaker_role, reason) and on the nearest span (page-derived, sanitized all the same).
// deno-lint-ignore no-control-regex
const NUL = /\u0000/g;
// deno-lint-ignore no-control-regex
const OTHER_C0 = /[\u0001-\u0008\u000b\u000c\u000e-\u001f]/g;

export function sanitizeForStore(value: unknown): { text: string; changed: boolean } {
  const raw = value == null ? "" : String(value);
  const text = raw.replace(NUL, "").replace(OTHER_C0, " ");
  return { text, changed: text !== raw };
}
/** Convenience for optional string fields: null stays null; a sanitized empty string becomes null. */
export function sanitizeNullable(value: unknown): { text: string | null; changed: boolean } {
  if (value == null) return { text: null, changed: false };
  const r = sanitizeForStore(value);
  return { text: r.text.trim() ? r.text : null, changed: r.changed };
}
