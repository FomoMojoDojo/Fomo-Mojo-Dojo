// Gate B guard (c) — ruling A1 (2026-09-19): the client-voice corpus loader excludes an interview upload
// even when a sidecar exists for it, keyed on the FILE (input_files.is_interview) OR on a record naming the
// file (interview_records.input_file_id); the exclusion is reported with reason "interview". A lookup error
// on the record side fails closed. classify-upload-voice's planners read only through this loader, so they
// inherit the exclusion — proven here by the same call path (planUploadVoice).
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { loadContributingCorpus, loadContributingDocs, UPLOAD_FAMILY_SOURCE_TYPES } from "./uploadCorpus.ts";
import { planUploadVoice } from "./uploadVoiceClassifier.ts";

type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>, sidecars: Record<string, string>, opts: { failTable?: string } = {}) {
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const b: Record<string, unknown> = {};
    const chain = (fn: (r: Row[]) => Row[]) => { rows = fn(rows); return b; };
    const result = () => opts.failTable === table ? { data: null, error: { message: `planted ${table} failure` } } : { data: rows, error: null };
    Object.assign(b, {
      select: () => b,
      eq: (c: string, v: unknown) => chain((r) => r.filter((x) => x[c] === v)),
      in: (c: string, vs: unknown[]) => chain((r) => r.filter((x) => vs.includes(x[c]))),
      not: (c: string, _op: string, v: unknown) => chain((r) => r.filter((x) => (v === null ? x[c] != null : x[c] !== v))),
      limit: () => b,
      maybeSingle: () => b,
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej),
    });
    return b;
  };
  const storage = { from: (_b: string) => ({ download: (p: string) => Promise.resolve(p in sidecars ? { data: new Blob([sidecars[p]]), error: null } : { data: null, error: "missing" }) }) };
  return { from, storage };
}
const CO = "co-b";
function seed(opts: { flag: boolean; record: boolean }) {
  return {
    tables: {
      inputs: [{ id: "in-1", company_id: CO }],
      input_files: [
        { id: "f-ord", input_id: "in-1", file_name: "B2B_ordinary.pdf", file_type: "application/pdf", file_path: "u/co/ordinary.pdf", archived_at: null, is_interview: false },
        { id: "f-int", input_id: "in-1", file_name: "interview-fixture.txt", file_type: "text/plain", file_path: "u/co/interview-fixture.txt", archived_at: null, is_interview: opts.flag },
      ],
      interview_records: opts.record ? [{ id: "rec-1", company_id: CO, input_file_id: "f-int", speaker_role: "market_participant" }] : [],
      file_proposals: [], signals: [], doc_voice_verdicts: [],
    },
    // The PLANTED sidecar: if the loader ever read it, the interview would contribute.
    sidecars: { "u/co/ordinary.pdf.extracted.txt": "ordinary document text", "u/co/interview-fixture.txt.extracted.txt": "FIXTURE transcript text that must never be read" },
  };
}

Deno.test("(c) is_interview=true with a planted sidecar → excluded with reason interview; the ordinary doc still contributes", async () => {
  const s = seed({ flag: true, record: true });
  const { docs, excluded } = await loadContributingCorpus(fakeDb(s.tables, s.sidecars) as never, CO);
  assertEquals(docs.map((d) => d.input_file_id), ["f-ord"]);
  assertEquals(excluded, [{ input_file_id: "f-int", file_name: "interview-fixture.txt", reason: "interview", detail: "input_files.is_interview" }]);
  assert(!docs.some((d) => d.excerpt.includes("FIXTURE transcript")));
});

Deno.test("(c) A1: the flag alone (no record) excludes; the record alone (flag false) excludes", async () => {
  const a = seed({ flag: true, record: false });
  const ra = await loadContributingCorpus(fakeDb(a.tables, a.sidecars) as never, CO);
  assertEquals(ra.docs.map((d) => d.input_file_id), ["f-ord"]);
  assertEquals(ra.excluded[0].reason, "interview"); assertEquals(ra.excluded[0].detail, "input_files.is_interview");
  const b = seed({ flag: false, record: true });
  const rb = await loadContributingCorpus(fakeDb(b.tables, b.sidecars) as never, CO);
  assertEquals(rb.docs.map((d) => d.input_file_id), ["f-ord"]);
  assertEquals(rb.excluded[0].reason, "interview"); assertEquals(rb.excluded[0].detail, "interview_records.input_file_id");
});

Deno.test("(c) a record lookup error fails closed — every upload excluded, reported", async () => {
  const s = seed({ flag: false, record: false });
  const { docs, excluded } = await loadContributingCorpus(fakeDb(s.tables, s.sidecars, { failTable: "interview_records" }) as never, CO);
  assertEquals(docs, []);
  assertEquals(excluded.length, 2);
  assert(excluded.every((x) => x.reason === "lookup_error" && x.detail.includes("interview lookup failed")));
});

Deno.test("(iii) classify-upload-voice inherits: its plan over the same company never lists the interview file", async () => {
  const s = seed({ flag: true, record: true });
  const db = fakeDb(s.tables, s.sidecars);
  const docs = await loadContributingDocs(db as never, CO);
  assertEquals(docs.map((d) => d.file_name), ["B2B_ordinary.pdf"]);
  const plan = await planUploadVoice(db as never, CO);
  const listed = JSON.stringify(plan);
  assert(!listed.includes("interview-fixture.txt"), "the classifier's plan must not name the interview file");
  assert(listed.includes("B2B_ordinary.pdf"));
});

Deno.test("(iv) the upload-family list carries interview", () => {
  assert((UPLOAD_FAMILY_SOURCE_TYPES as readonly string[]).includes("interview"));
});
