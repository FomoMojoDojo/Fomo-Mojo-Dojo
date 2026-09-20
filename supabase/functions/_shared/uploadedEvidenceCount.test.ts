// Gate B guard (v) — R16 (2026-09-19): run-agent-flow and run-framework-diagnosis count uploaded evidence
// without interview rows, fail closed on a lookup error. Both counters live inside module-level servers, so
// the predicate is proven on a fake client with the exact chain each uses, and the wiring by source.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

type Row = Record<string, unknown>;
function fakeDb(rows: Row[], opts: { fail?: boolean } = {}) {
  return { from: (_t: string) => {
    let r = [...rows]; let head = false; const b: Record<string, unknown> = {};
    Object.assign(b, {
      select: (_c: string, o?: { head?: boolean }) => { head = !!o?.head; return b; },
      in: (c: string, vs: unknown[]) => { r = r.filter((x) => vs.includes(x[c])); return b; },
      eq: (c: string, v: unknown) => { r = r.filter((x) => x[c] === v); return b; },
      then: (res: (v: unknown) => unknown) => Promise.resolve(opts.fail ? { data: null, count: null, error: { message: "boom" } } : { data: null, count: head ? r.length : null, error: null }).then(res),
    });
    return b;
  } };
}
// The R16 count, exactly as both functions now write it.
async function uploadedFileCount(db: ReturnType<typeof fakeDb>, inputIds: string[]): Promise<number> {
  const { count, error: countErr } = await db.from("input_files").select("id", { count: "exact", head: true }).in("input_id", inputIds).eq("is_interview", false);
  return countErr ? 0 : Number(count || 0);
}

Deno.test("(v) interview rows are not uploaded evidence; a company whose ONLY file is an interview has none", async () => {
  const rows = [{ id: "a", input_id: "in-1", is_interview: false }, { id: "b", input_id: "in-1", is_interview: true }, { id: "c", input_id: "in-2", is_interview: true }];
  assertEquals(await uploadedFileCount(fakeDb(rows), ["in-1", "in-2"]), 1);
  assertEquals(await uploadedFileCount(fakeDb(rows.filter((r) => r.is_interview)), ["in-1", "in-2"]), 0, "has_uploaded_evidence = false");
  assertEquals(await uploadedFileCount(fakeDb(rows, { fail: true }), ["in-1"]), 0, "fail closed");
});

Deno.test("(v) wiring: both counters carry .eq(\"is_interview\", false) and treat an error as zero", async () => {
  const here = new URL(".", import.meta.url).pathname;
  for (const f of ["../run-agent-flow/index.ts", "../run-framework-diagnosis/index.ts"]) {
    const s = await Deno.readTextFile(`${here}${f}`);
    const sel = s.indexOf('.from("input_files")');
    const eq = s.indexOf('.eq("is_interview", false)', sel);
    const zero = s.indexOf("countErr ? 0 : Number(count || 0)", sel);
    assert(sel > 0 && eq > sel && eq - sel < 260, `${f}: the count chain excludes interview rows`);
    assert(zero > eq && zero - eq < 200, `${f}: fail closed`);
  }
});
