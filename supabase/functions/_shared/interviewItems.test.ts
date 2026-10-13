// ── R-A1: effectiveItemKind(), the ONE resolver ─────────────────────────────────────────────────
//
// The parser's row is never edited. An operator reclassification is an append-only override keyed on
// (item id, content_identity), and this resolver is the only place that rule lives.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  INTERVIEW_ITEM_KIND_OVERRIDES_TABLE, INTERVIEW_ITEMS_TABLE, effectiveItemKind,
} from "./interviewItems.ts";

const ITEM = "61dac18a-50fe-4a3a-82c3-56e5c9cc441e";
const IDENT = "e".repeat(64);
const OTHER_IDENT = "f".repeat(64);

type Row = Record<string, unknown>;
/** A fake whose override table honours eq() on both keys and order()/limit() on decided_at. */
function fakeDb(overrides: Row[]) {
  const reads: string[] = [];
  const from = (table: string) => {
    reads.push(table);
    let rows: Row[] = table === INTERVIEW_ITEM_KIND_OVERRIDES_TABLE ? [...overrides] : [];
    const b: Record<string, unknown> = {};
    Object.assign(b, {
      select: () => b,
      eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return b; },
      order: (c: string, o: { ascending: boolean }) => { rows = [...rows].sort((a, z) => String(a[c]).localeCompare(String(z[c])) * (o.ascending ? 1 : -1)); return b; },
      limit: (n: number) => { rows = rows.slice(0, n); return Promise.resolve({ data: rows, error: null }); },
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (res: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: rows, error: null }).then(res),
    });
    return b;
  };
  return { from, reads };
}
const override = (over: Row = {}) => ({
  id: "o-1", interview_item_id: ITEM, content_identity: IDENT,
  from_kind: "ask", to_kind: "correction", reason: "r", decided_by: "op",
  decided_at: "2026-10-12T19:00:00Z", ...over,
});

Deno.test("NO override ⇒ the parser's kind is the effective kind", async () => {
  const db = fakeDb([]);
  const e = await effectiveItemKind(db, { itemId: ITEM, contentIdentity: IDENT, parserKind: "ask" });
  assertEquals(e, { kind: "ask", overridden: false, override: null });
});

Deno.test("an override for THIS landing wins over the parser's kind", async () => {
  const db = fakeDb([override()]);
  const e = await effectiveItemKind(db, { itemId: ITEM, contentIdentity: IDENT, parserKind: "ask" });
  assertEquals(e.kind, "correction");
  assertEquals(e.overridden, true);
  assertEquals(e.override?.from_kind, "ask");
  assertEquals(e.override?.decided_by, "op");
});

Deno.test("an override decided against a DIFFERENT identity does not apply (a re-parse frees the row)", async () => {
  const db = fakeDb([override({ content_identity: OTHER_IDENT })]);
  const e = await effectiveItemKind(db, { itemId: ITEM, contentIdentity: IDENT, parserKind: "ask" });
  assertEquals(e.kind, "ask", "the parser's kind is in force again");
  assertEquals(e.overridden, false);
});

Deno.test("an override for a different ITEM does not apply", async () => {
  const db = fakeDb([override({ interview_item_id: "some-other-item" })]);
  const e = await effectiveItemKind(db, { itemId: ITEM, contentIdentity: IDENT, parserKind: "ask" });
  assertEquals(e.overridden, false);
});

Deno.test("APPEND-ONLY ⇒ the LATEST decision wins, not the first", async () => {
  const db = fakeDb([
    override({ id: "o-old", reason: "first call", decided_at: "2026-10-01T00:00:00Z" }),
    override({ id: "o-new", reason: "second thoughts", decided_at: "2026-10-12T19:00:00Z" }),
  ]);
  const e = await effectiveItemKind(db, { itemId: ITEM, contentIdentity: IDENT, parserKind: "ask" });
  assertEquals(e.override?.id, "o-new");
  assertEquals(e.override?.reason, "second thoughts");
});

Deno.test("the resolver reads ONLY the override table — it never touches the parser's row", async () => {
  const db = fakeDb([override()]);
  await effectiveItemKind(db, { itemId: ITEM, contentIdentity: IDENT, parserKind: "ask" });
  assertEquals(db.reads, [INTERVIEW_ITEM_KIND_OVERRIDES_TABLE]);
  // the name comes from the constant, never spelled here — the items census counts test files too
  assert(!db.reads.includes(INTERVIEW_ITEMS_TABLE), `no read, and therefore no write, of ${INTERVIEW_ITEMS_TABLE}`);
});

Deno.test("there is no SQL copy of the rule: no migration defines a kind-resolving view or function", async () => {
  const dir = new URL("../../migrations/", import.meta.url);
  let offenders: string[] = [];
  for await (const e of Deno.readDir(dir)) {
    if (!e.isFile || !e.name.endsWith(".sql")) continue;
    const sql = await Deno.readTextFile(new URL(e.name, dir));
    if (/create\s+(or\s+replace\s+)?(view|function)[\s\S]{0,400}effective_item_kind/i.test(sql)) offenders.push(e.name);
  }
  assertEquals(offenders, [], "the resolver lives in TypeScript only — one rule, one authority");
});

// ── R-A4: the undo is an APPENDED NULL row ──────────────────────────────────────────────────────
Deno.test("R-A4: a NULL to_kind restores the PARSER's kind", async () => {
  const db = fakeDb([override({ to_kind: null, reason: "undo", decided_at: "2026-10-12T20:00:00Z" })]);
  const e = await effectiveItemKind(db, { itemId: ITEM, contentIdentity: IDENT, parserKind: "ask" });
  assertEquals(e.kind, "ask", "the parser's kind stands again");
  assertEquals(e.overridden, false, "a NULL undo is not an override in force");
  assertEquals(e.override?.reason, "undo", "but the decision that undid it is still named");
});

Deno.test("R-A4: an override then a NULL undo ⇒ parser kind (the undo is newer)", async () => {
  const db = fakeDb([
    override({ id: "o-1", to_kind: "correction", decided_at: "2026-10-12T19:00:00Z" }),
    override({ id: "o-2", to_kind: null, reason: "undo", decided_at: "2026-10-12T20:00:00Z" }),
  ]);
  const e = await effectiveItemKind(db, { itemId: ITEM, contentIdentity: IDENT, parserKind: "ask" });
  assertEquals(e.kind, "ask");
  assertEquals(e.overridden, false);
  assertEquals(e.override?.id, "o-2");
});

Deno.test("R-A4: a NULL undo then a REDO ⇒ correction again (latest still wins, both directions)", async () => {
  const db = fakeDb([
    override({ id: "o-1", to_kind: "correction", decided_at: "2026-10-12T19:00:00Z" }),
    override({ id: "o-2", to_kind: null, reason: "undo", decided_at: "2026-10-12T20:00:00Z" }),
    override({ id: "o-3", to_kind: "correction", reason: "redo", decided_at: "2026-10-12T21:00:00Z" }),
  ]);
  const e = await effectiveItemKind(db, { itemId: ITEM, contentIdentity: IDENT, parserKind: "ask" });
  assertEquals(e.kind, "correction");
  assertEquals(e.overridden, true);
  assertEquals(e.override?.id, "o-3");
});

Deno.test("R-A4: 'no decision ever made' and 'deliberately undone' are distinguishable", async () => {
  const never = await effectiveItemKind(fakeDb([]), { itemId: ITEM, contentIdentity: IDENT, parserKind: "ask" });
  const undone = await effectiveItemKind(fakeDb([override({ to_kind: null })]), { itemId: ITEM, contentIdentity: IDENT, parserKind: "ask" });
  assertEquals(never.kind, undone.kind, "both resolve to the parser's kind");
  assertEquals(never.overridden, undone.overridden, "neither has an override in force");
  assertEquals(never.override, null);
  assert(undone.override !== null, "but only the undone one names a decision");
});
