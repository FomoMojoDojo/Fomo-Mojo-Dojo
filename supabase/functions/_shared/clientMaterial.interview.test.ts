// Gate B guard (e) — the client-material wall (7980a797) and interviews (2026-09-19): a company whose ONLY
// material is one `interview` upload-signal is walled (the upload-signal list gained `interview`); a company
// whose only material is one interview_records row is walled (the `interview` kind, unchanged). Plant: the
// list entry removed → the signal-only company reads as having no material.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CLIENT_PROVIDED_SOURCE_KINDS, companyHasClientProvidedMaterial } from "./clientMaterial.ts";

type Row = Record<string, unknown>;
function fakeDb(seed: Record<string, Row[]>) {
  const from = (table: string) => {
    let rows = [...(seed[table] ?? [])];
    let head = false;
    const b: Record<string, unknown> = {};
    const chain = (fn: (r: Row[]) => Row[]) => { rows = fn(rows); return b; };
    Object.assign(b, {
      select: (_c?: string, o?: { head?: boolean }) => { head = !!o?.head; return b; },
      eq: (c: string, v: unknown) => chain((r) => r.filter((x) => (c.includes(".") ? String(x.company_id) === String(v) : x[c] === v))),
      in: (c: string, vs: unknown[]) => chain((r) => r.filter((x) => vs.includes(x[c]))),
      not: (c: string, _op: string, v: unknown) => chain((r) => r.filter((x) => x[c] != v)),
      then: (res: (v: unknown) => unknown) => Promise.resolve(head ? { data: null, count: rows.length, error: null } : { data: rows, error: null }).then(res),
    });
    return b;
  };
  return { from };
}
const CO = "co-wall";

Deno.test("(e) one `interview` signal is client material — walled", async () => {
  const db = fakeDb({ signals: [{ id: "s1", company_id: CO, source_type: "interview" }] }) as never;
  const v = await companyHasClientProvidedMaterial(db, CO);
  assert(v.has);
  assertEquals(v.found, [{ kind: "upload_signal", count: 1 }]);
  assertEquals(v.errors, []);
});

Deno.test("(e) one interview_records row is client material — walled (the kind that already existed)", async () => {
  const db = fakeDb({ interview_records: [{ id: "r1", company_id: CO }] }) as never;
  const v = await companyHasClientProvidedMaterial(db, CO);
  assert(v.has);
  assertEquals(v.found, [{ kind: "interview", count: 1 }]);
});

Deno.test("(e) nothing at all → not walled; the list names interview in the upload-signal column", async () => {
  const v = await companyHasClientProvidedMaterial(fakeDb({}) as never, CO);
  assertEquals(v.has, false);
  const k = CLIENT_PROVIDED_SOURCE_KINDS.find((x) => x.kind === "upload_signal")!;
  assert(k.column.includes("interview"), k.column);
});
