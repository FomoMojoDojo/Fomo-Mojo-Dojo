// The MARK STORE's narrow doors, resolved against a table fixture (test support only).
//
// FM13 option A: the mark store is named ONLY from this directory, and census.test.ts fails the
// moment another file names first_read_marks or first_read_mark_notes. U6-25 (2026-11-10) moved the
// page's two reads onto SECURITY DEFINER functions (first_read_marks_client /
// first_read_mark_notes_client) so the withdrawn_at predicate and the column projection live in the
// database rather than in useFirstReadMarks' query. The suite's fake clients need to answer those
// doors from their TABLE fixtures — so that resolution lives here, inside the boundary, and
// src/lib/testing/clientDoors.ts delegates to it without ever naming the tables.
//
// The predicate and the projection mirror the SQL exactly: a fixture row the real door would exclude
// is excluded here too, and a column it withholds (created_by, revisit_resolved_by, withdrawn_by,
// withdraw_reason) is absent here as well.
type Row = Record<string, unknown>;

const MARKS_TABLE = "first_read_marks";
const NOTES_TABLE = "first_read_mark_notes";

const MARKS_COLS = [
  "id", "company_id", "kind", "beat_key", "anchor_kind", "anchor_key",
  "anchor_text", "anchor_text_sha256", "created_at", "revisit_resolved_against", "revisit_resolved_at",
] as const;
const NOTES_COLS = ["mark_id", "version", "note", "disposition"] as const;

const pick = (r: Row, cols: readonly string[]): Row =>
  Object.fromEntries(cols.filter((c) => c in r).map((c) => [c, r[c]]));
const isNull = (v: unknown) => (v ?? null) === null;

/** The two mark doors, or null when `name` is not one of them. */
export function marksDoorRpc(
  tables: Record<string, Row[]>,
  name: string,
  args: Record<string, unknown>,
): Row[] | null {
  const marks = [...(tables[MARKS_TABLE] ?? [])];
  const live = marks.filter((r) => r.company_id === args.p_company_id && isNull(r.withdrawn_at));

  if (name === "first_read_marks_client") {
    // withdrawn_at IS NULL. No ordering: the real function adds none either.
    return live.map((r) => pick(r, MARKS_COLS));
  }
  if (name === "first_read_mark_notes_client") {
    // Membership resolves through the parent mark, and a withdrawn mark takes its notes with it.
    const liveIds = new Set(live.map((r) => r.id));
    return [...(tables[NOTES_TABLE] ?? [])]
      .filter((r) => liveIds.has(r.mark_id))
      .map((r) => pick(r, NOTES_COLS));
  }
  return null;
}
