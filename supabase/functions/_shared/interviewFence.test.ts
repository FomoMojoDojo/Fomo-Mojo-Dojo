// Gate B guard (d) — ruling A1 (2026-09-19): the analysis doors (analyze-file, dify-analyze-file) refuse an
// interview file 422 interview_file BEFORE any download or proposal insert. The predicate is proven here
// on a fake client (flag / record / ordinary / lookup error → fail closed); the wiring is proven by
// source order: in both doors the fence call precedes the signed URL, the size guard and the download.
// (Both index.ts files start their server at module level, so the handler cannot be imported.)
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { INTERVIEW_FILE_REFUSAL, interviewFenceForFile, interviewFileRefusalBody } from "./uploadCorpus.ts";

type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>, opts: { failTable?: string } = {}) {
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const b: Record<string, unknown> = {};
    const chain = (fn: (r: Row[]) => Row[]) => { rows = fn(rows); return b; };
    const result = () => opts.failTable === table ? { data: null, error: { message: `planted ${table} failure` } } : { data: rows, error: null };
    Object.assign(b, {
      select: () => b,
      eq: (c: string, v: unknown) => chain((r) => r.filter((x) => x[c] === v)),
      limit: (n: number) => chain((r) => r.slice(0, n)),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej),
    });
    return b;
  };
  return { from, storage: { from: () => ({ download: () => Promise.resolve({ data: null, error: "never" }) }) } };
}
const tables = () => ({
  input_files: [
    { id: "f-ord", file_path: "u/ordinary.pdf", is_interview: false },
    { id: "f-flag", file_path: "u/flagged.txt", is_interview: true },
    { id: "f-rec", file_path: "u/recorded.txt", is_interview: false },
  ],
  interview_records: [{ id: "r1", input_file_id: "f-rec" }],
});

Deno.test("(d) predicate: ordinary → not fenced; flag → fenced; record without flag → fenced (A1: either alone)", async () => {
  const db = fakeDb(tables()) as never;
  assertEquals(await interviewFenceForFile(db, { fileId: "f-ord" }), { interview: false });
  assertEquals(await interviewFenceForFile(db, { filePath: "u/ordinary.pdf" }), { interview: false });
  assertEquals(await interviewFenceForFile(db, { fileId: "f-flag" }), { interview: true, why: "input_files.is_interview", detail: "f-flag" });
  assertEquals(await interviewFenceForFile(db, { filePath: "u/flagged.txt" }), { interview: true, why: "input_files.is_interview", detail: "f-flag" });
  assertEquals(await interviewFenceForFile(db, { fileId: "f-rec" }), { interview: true, why: "interview_records.input_file_id", detail: "f-rec" });
  assertEquals(await interviewFenceForFile(db, {}), { interview: false });
  const body = interviewFileRefusalBody({ interview: true, why: "input_files.is_interview", detail: "f-flag" });
  assertEquals(body.error, INTERVIEW_FILE_REFUSAL); assertEquals(body.ok, false);
});

Deno.test("(d) a lookup error fails closed — refused, named", async () => {
  const a = await interviewFenceForFile(fakeDb(tables(), { failTable: "input_files" }) as never, { fileId: "f-ord" });
  assert(a.interview && a.why === "lookup_error" && a.detail.includes("fail closed"));
  const b = await interviewFenceForFile(fakeDb(tables(), { failTable: "interview_records" }) as never, { fileId: "f-ord" });
  assert(b.interview && b.why === "lookup_error");
});

Deno.test("(d) wiring: in both doors the fence precedes the signed URL / size guard / download and the file_proposals insert", async () => {
  const here = new URL(".", import.meta.url).pathname;
  const analyze = await Deno.readTextFile(`${here}../analyze-file/index.ts`);
  const dify = await Deno.readTextFile(`${here}../dify-analyze-file/index.ts`);
  const pos = (s: string, needle: string) => { const i = s.indexOf(needle); assert(i >= 0, `missing: ${needle}`); return i; };
  // analyze-file: fence → size guard → download
  const aFence = pos(analyze, "interviewFenceForFile(");
  const aGuard = pos(analyze, "if (fence.interview) {");
  assert(aFence < aGuard && aGuard < pos(analyze, "storageObjectSize(supabase, \"input-files\", filePath)"), "analyze-file: the refusal guard sits between the fence call and the size guard");
  assert(aFence < pos(analyze, "storageObjectSize(supabase, \"input-files\", filePath)"), "analyze-file: fence before the size guard");
  assert(aFence < pos(analyze, ".download(filePath)"), "analyze-file: fence before the download");
  assert(analyze.includes("status: 422") && analyze.includes("interviewFileRefusalBody(fence)"));
  // dify-analyze-file: fence → signed URL → size guard → download → file_proposals insert
  const dFence = pos(dify, "interviewFenceForFile(");
  const dGuard = pos(dify, "if (fence.interview) {");
  assert(dFence < dGuard && dGuard < pos(dify, ".createSignedUrl(filePath, 900)"), "dify: the refusal guard sits between the fence call and the signed URL");
  assert(dFence < pos(dify, ".createSignedUrl(filePath, 900)"), "dify: fence before the signed URL");
  assert(dFence < pos(dify, "storageObjectSize(supabase, \"input-files\", filePath)"), "dify: fence before the size guard");
  assert(dFence < pos(dify, ".download(filePath)"), "dify: fence before the download");
  assert(dFence < pos(dify, "source_type:  sourceType ?? \"\""), "dify: fence before the file_proposals insert");
  assert(dify.includes("interviewFileRefusalBody(fence)"));
});

// (f) after a withdraw (2026-09-21, commit 2b Part 1): the file is archived and its record retracted, but the flag
// stays and the record still names the file — both analysis doors keep refusing it (a withdrawn transcript is
// never analysable). Plant: an archived exemption inside interviewFenceForFile → not fenced → red.
Deno.test("(f) after a withdraw the fence still refuses in both doors: archived file, retracted record, flag on", async () => {
  const t = tables();
  t.input_files.push({ id: "f-wd", file_path: "u/withdrawn.txt", is_interview: true, archived_at: "2026-09-20T15:23:49.924Z" });
  t.interview_records.push({ id: "r-wd", input_file_id: "f-wd", retracted_at: "2026-09-20T15:23:49.924Z" });
  const db = fakeDb(t) as never;
  assertEquals(await interviewFenceForFile(db, { fileId: "f-wd" }), { interview: true, why: "input_files.is_interview", detail: "f-wd" });
  assertEquals(await interviewFenceForFile(db, { filePath: "u/withdrawn.txt" }), { interview: true, why: "input_files.is_interview", detail: "f-wd" });
  // the record alone (flag cleared by some future path) still fences
  t.input_files[t.input_files.length - 1] = { ...t.input_files[t.input_files.length - 1], is_interview: false };
  assertEquals(await interviewFenceForFile(fakeDb(t) as never, { fileId: "f-wd" }), { interview: true, why: "interview_records.input_file_id", detail: "f-wd" });
});
