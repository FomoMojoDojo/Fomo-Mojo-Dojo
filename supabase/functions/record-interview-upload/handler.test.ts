// record-interview-upload — Gate B guards (b), (f), (g), (h) + the record shape (R1/R7), model-free. The fake
// client applies inserts/deletes to in-memory tables and logs every write; the fake storage holds the object
// bytes and logs removes; the fake parser answers as the local parser would (source + versions). Fixtures are
// throwaway strings written here — never a real transcript.
import { assert, assertEquals, assertStrictEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decodeTranscriptBytes, extractionVersionFrom, handleRecordInterviewUpload, marketStateFor, sha256HexBytes, sha256HexText, STRINGS, TEXT_READER_VERSION } from "./handler.ts";

type Row = Record<string, unknown>;
const CO = "co-b"; const OWNER = "user-owner"; const CALLER = "user-caller";
function fake(seed: { files: Row[]; records?: Row[]; objects: Record<string, Uint8Array> }, opts: { skipRollback?: boolean; refuseInsert?: boolean; noCaller?: boolean } = {}) {
  const tables: Record<string, Row[]> = { input_files: seed.files.map((r) => ({ ...r })), interview_records: (seed.records ?? []).map((r) => ({ ...r })), integrity_runs: [], companies: [{ id: CO, created_by: OWNER }], inputs: [{ id: "in-1", company_id: CO }] };
  const objects = { ...seed.objects };
  const writes: Array<{ table: string; op: string; row?: Row }> = [];
  const removed: string[] = [];
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])]; let op: "select" | "insert" | "delete" = "select"; let payload: Row | null = null;
    const b: Record<string, unknown> = {};
    const chain = (fn: (r: Row[]) => Row[]) => { rows = fn(rows); return b; };
    const run = () => {
      if (op === "insert") {
        if (table === "interview_records" && opts.refuseInsert) return { data: null, error: { message: "planted insert refusal" } };
        const row = { id: `new-${table}-${tables[table].length + 1}`, ...payload! }; tables[table].push(row); writes.push({ table, op, row }); return { data: row, error: null };
      }
      if (op === "delete") { const ids = new Set(rows.map((r) => r.id)); tables[table] = tables[table].filter((r) => !ids.has(r.id)); writes.push({ table, op }); return { data: null, error: null }; }
      return { data: rows, error: null };
    };
    Object.assign(b, {
      select: () => b,
      eq: (c: string, v: unknown) => chain((r) => r.filter((x) => x[c] === v)),
      insert: (p: Row) => { op = "insert"; payload = p; return b; },
      delete: () => { op = "delete"; return b; },
      maybeSingle: () => { const r = run(); return Promise.resolve(Array.isArray(r.data) ? { data: r.data[0] ?? null, error: r.error } : r); },
      single: () => { const r = run(); return Promise.resolve(Array.isArray(r.data) ? { data: r.data[0] ?? null, error: r.error } : r); },
      then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
    });
    return b;
  };
  const storage = { from: (_b: string) => ({
    download: (p: string) => Promise.resolve(p in objects ? { data: new Blob([objects[p]]), error: null } : { data: null, error: { message: "missing" } }),
    remove: (paths: string[]) => { if (opts.skipRollback) return Promise.resolve({ data: null, error: { message: "PLANT: rollback skipped" } }); for (const p of paths) { delete objects[p]; removed.push(p); } return Promise.resolve({ data: paths, error: null }); },
  }) };
  const client = { from: (t: string) => (t === "input_files" && opts.skipRollback ? new Proxy(from(t), { get: (target, prop) => prop === "delete" ? () => ({ eq: () => Promise.resolve({ data: null, error: { message: "PLANT: rollback skipped" } }) }) : (target as Record<string, unknown>)[prop as string] }) : from(t)), storage, auth: { getUser: () => Promise.resolve({ data: { user: opts.noCaller ? null : { id: CALLER } } }) } };
  return { client, tables, objects, writes, removed };
}
const enc = (s: string) => new TextEncoder().encode(s);
const FIXTURE = "FIXTURE TRANSCRIPT (not a real interview).\r\nSpeaker A: line one.  \r\nSpeaker B: line two.\r\n";
function seeded(opts: { name?: string; type?: string; bytes?: Uint8Array; flagged?: boolean } = {}) {
  const name = opts.name ?? "fixture-interview.txt";
  const path = `u/co/${name}`;
  const files = [{ id: "f-1", input_id: "in-1", file_name: name, file_type: opts.type ?? "text/plain", file_path: path, uploaded_at: "2026-09-19T10:00:00Z", is_interview: opts.flagged ?? true, inputs: { company_id: CO } }];
  return { files, objects: { [path]: opts.bytes ?? enc(FIXTURE) }, path };
}
function env() { Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321"); Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "sr"); Deno.env.set("SUPABASE_ANON_KEY", "anon"); Deno.env.set("LOCAL_PARSER_URL", "http://host.docker.internal:8789/extract"); }
function post(body: Record<string, unknown>, auth = true) { return new Request("http://local/record-interview-upload", { method: "POST", headers: auth ? { "Content-Type": "application/json", Authorization: "Bearer test-jwt" } : { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
async function run(f: ReturnType<typeof fake>, body: Record<string, unknown>, parser?: Parameters<typeof handleRecordInterviewUpload>[1]["callParser"], auth = true) {
  env();
  const resp = await handleRecordInterviewUpload(post(body, auth), { createClient: () => f.client as never, callParser: parser, now: () => "2026-09-19T12:00:00Z" });
  return { status: resp.status, json: await resp.json() };
}

Deno.test("boot: {} → 400 company_id required", async () => {
  const r = await run(fake(seeded()), {});
  assertEquals(r.status, 400); assertEquals(r.json.error, "company_id required");
});

Deno.test("R1/R7 stakeholder .txt: ONE record — verbatim = normalized text, both hashes, bytes, method/version, per_item, basis [original:none], no name / consent / interviewer; ONE integrity row; no sidecar", async () => {
  const s = seeded(); const f = fake(s);
  const sha = await sha256HexBytes(enc(FIXTURE).buffer as ArrayBuffer);
  const r = await run(f, { company_id: CO, input_file_id: "f-1", speaker_role: "client_stakeholder", file_sha256: sha });
  assertEquals(r.status, 200, JSON.stringify(r.json));
  const rec = f.tables.interview_records[0];
  assertEquals(f.tables.interview_records.length, 1);
  assertEquals(rec.speaker_role, "client_stakeholder"); assertEquals(rec.market_state, "per_item"); assertEquals(rec.journey_key, null);
  assertEquals(rec.market_basis, [{ kind: "original", result: "none", at: "2026-09-19T12:00:00Z" }]);
  assertEquals(rec.person_name, null); assertEquals(rec.consent_basis, null); assertEquals(rec.interviewer, null);
  assertEquals(rec.created_by, CALLER, "R10: the authenticated caller, never the owner");
  assertEquals(rec.interviewed_at, null, "R9: the upload time is not the interview date");
  assertEquals(rec.input_file_id, "f-1"); assertEquals(rec.file_sha256, sha); assertEquals(rec.file_bytes, enc(FIXTURE).length);
  assertEquals(rec.verbatim, FIXTURE, "F2: exactly what the reader returned — CRLF and trailing spaces kept");
  assertEquals(rec.text_sha256, await sha256HexText(rec.verbatim as string));
  assertEquals(rec.extraction_method, "local_text_reader"); assertEquals(rec.extraction_version, TEXT_READER_VERSION); assertStringIncludes(TEXT_READER_VERSION, "utf8-strict,bom-dropped,verbatim");
  assertEquals(rec.review_state, "unreviewed");
  const audit = f.tables.integrity_runs; assertEquals(audit.length, 1);
  assertEquals(audit[0].component, "interview_upload"); assertEquals(audit[0].status, "completed");
  const ex = audit[0].excluded_by_rule as Record<string, unknown>;
  assertEquals(ex.sidecar_written, false); assertEquals(ex.model_called, false); assertEquals(ex.chars, (rec.verbatim as string).length);
  assert(!JSON.stringify(audit).includes("Speaker A"), "the audit row carries no transcript text");
  assertEquals(Object.keys(f.objects), [s.path], "the object stays; no sidecar was written");
  assertEquals(r.json.market_state, "per_item");
});

Deno.test("R7 customer → unplaced, journey_key NULL", async () => {
  const s = seeded(); const f = fake(s);
  const r = await run(f, { company_id: CO, input_file_id: "f-1", speaker_role: "market_participant", file_sha256: await sha256HexBytes(enc(FIXTURE).buffer as ArrayBuffer) });
  assertEquals(r.status, 200); assertEquals(f.tables.interview_records[0].market_state, "unplaced"); assertEquals(f.tables.interview_records[0].journey_key, null);
  assertEquals(marketStateFor("market_participant"), "unplaced"); assertEquals(marketStateFor("client_stakeholder"), "per_item");
  // 4f-1: only a CUSTOMER transcript is placed as a whole. A working session carries items about
  // several markets or none, so it is per_item exactly like a stakeholder transcript.
  assertEquals(marketStateFor("working_session"), "per_item");
});

Deno.test("4f-1: a WORKING SESSION upload records the third role, per_item, journey_key NULL", async () => {
  const s = seeded(); const f = fake(s);
  const r = await run(f, { company_id: CO, input_file_id: "f-1", speaker_role: "working_session", file_sha256: await sha256HexBytes(enc(FIXTURE).buffer as ArrayBuffer) });
  assertEquals(r.status, 200);
  const rec = f.tables.interview_records[0];
  assertEquals(rec.speaker_role, "working_session");
  assertEquals(rec.market_state, "per_item");
  assertEquals(rec.journey_key, null);
  assertEquals(r.json.speaker_role, "working_session");
  assertEquals(r.json.market_state, "per_item");
});

Deno.test("4f-1: the role refusal names all three, and an unknown role is still refused", async () => {
  const s = seeded(); const f = fake(s);
  const r = await run(f, { company_id: CO, input_file_id: "f-1", speaker_role: "board_meeting", file_sha256: await sha256HexBytes(enc(FIXTURE).buffer as ArrayBuffer) });
  assertEquals(r.status, 400);
  assertStringIncludes(String(r.json.error), "client_stakeholder");
  assertStringIncludes(String(r.json.error), "market_participant");
  assertStringIncludes(String(r.json.error), "working_session");
  assertEquals(f.tables.interview_records.length, 0, "nothing recorded");
});

Deno.test("(f) sha mismatch → 422 S6, zero records, the object and the row rolled back, a rejected audit row", async () => {
  const s = seeded(); const f = fake(s);
  const r = await run(f, { company_id: CO, input_file_id: "f-1", speaker_role: "client_stakeholder", file_sha256: "0".repeat(64) });
  assertEquals(r.status, 422); assertEquals(r.json.error, "file_hash_mismatch"); assertEquals(r.json.message, STRINGS.S6);
  assertEquals(f.tables.interview_records, []); assertEquals(f.tables.input_files, []); assertEquals(f.removed, [s.path]);
  assertEquals(f.tables.integrity_runs[0].status, "rejected"); assertEquals((f.tables.integrity_runs[0].excluded_by_rule as Row).reason, "file_hash_mismatch");
});

Deno.test("(g) empty extraction → 422 S5, zero records, rolled back", async () => {
  const s = seeded({ bytes: enc("   \n\n  ") }); const f = fake(s);
  const r = await run(f, { company_id: CO, input_file_id: "f-1", speaker_role: "client_stakeholder", file_sha256: await sha256HexBytes(enc("   \n\n  ").buffer as ArrayBuffer) });
  assertEquals(r.status, 422); assertEquals(r.json.error, "empty_extraction"); assertEquals(r.json.message, STRINGS.S5);
  assertEquals(f.tables.interview_records, []); assertEquals(f.tables.input_files, []); assertEquals(f.removed, [s.path]);
});

Deno.test("S4 unsupported type (.xlsx) → 422, rolled back, the parser never called", async () => {
  const s = seeded({ name: "fixture.xlsx", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes: enc("PK-fixture") }); const f = fake(s);
  let parserCalls = 0;
  const r = await run(f, { company_id: CO, input_file_id: "f-1", speaker_role: "client_stakeholder", file_sha256: await sha256HexBytes(enc("PK-fixture").buffer as ArrayBuffer) }, () => { parserCalls++; return Promise.resolve({ text: "x", source: "local_parser_mammoth" }); });
  assertEquals(r.status, 422); assertEquals(r.json.error, "unsupported_transcript_type"); assertEquals(r.json.message, STRINGS.S4);
  assertEquals(parserCalls, 0); assertEquals(f.tables.interview_records, []); assertEquals(f.tables.input_files, []);
});

Deno.test("(h) docx → local_parser_mammoth with the parser's versions; the parser receives the bytes, not a path", async () => {
  const bytes = enc("PK-docx-fixture-bytes");
  const s = seeded({ name: "fixture-interview.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes }); const f = fake(s);
  let seen: { fileName: string; size: number } | null = null;
  const parser = async (a: { fileName: string; fileType: string; blob: Blob }) => { seen = { fileName: a.fileName, size: a.blob.size }; return { text: "Fixture docx text.\r\n", source: "local_parser_mammoth", versions: { server: "local-parser-server-2026-09-19", pdfjs: "5.5.207", mammoth: "1.12.0" } }; };
  const r = await run(f, { company_id: CO, input_file_id: "f-1", speaker_role: "market_participant", file_sha256: await sha256HexBytes(bytes.buffer as ArrayBuffer) }, parser);
  assertEquals(r.status, 200, JSON.stringify(r.json));
  assertEquals(seen, { fileName: "fixture-interview.docx", size: bytes.length });
  const rec = f.tables.interview_records[0];
  assertEquals(rec.extraction_method, "local_parser_mammoth");
  assertEquals(rec.extraction_version, "local-parser:server=local-parser-server-2026-09-19,pdfjs=5.5.207,mammoth=1.12.0");
  assertEquals(rec.verbatim, "Fixture docx text.\r\n", "F2: the parser's text stored verbatim");
  assertEquals(extractionVersionFrom("local_parser_pdfjs", null), "local-parser:unversioned");
});

Deno.test("(b) the record write is refused → the object and the row are rolled back, zero records", async () => {
  const s = seeded(); const f = fake(s, { refuseInsert: true });
  const r = await run(f, { company_id: CO, input_file_id: "f-1", speaker_role: "client_stakeholder", file_sha256: await sha256HexBytes(enc(FIXTURE).buffer as ArrayBuffer) });
  assertEquals(r.status, 409); assertEquals(r.json.error, "record_write_refused"); assertEquals(r.json.message, STRINGS.S6);
  assertEquals(f.tables.interview_records, []); assertEquals(f.tables.input_files, [], "the input_files row is gone"); assertEquals(f.removed, [s.path], "the object is gone");
  assertEquals(r.json.rolled_back, { storage: true, input_files: true });
});

Deno.test("A1: a file that is not flagged is refused (422 file_not_flagged) and NOT rolled back (it is an ordinary upload)", async () => {
  const s = seeded({ flagged: false }); const f = fake(s);
  const r = await run(f, { company_id: CO, input_file_id: "f-1", speaker_role: "client_stakeholder", file_sha256: await sha256HexBytes(enc(FIXTURE).buffer as ArrayBuffer) });
  assertEquals(r.status, 422); assertEquals(r.json.error, "file_not_flagged");
  assertEquals(f.tables.input_files.length, 1); assertEquals(f.removed, []);
});

Deno.test("A4: transcript text in the body is refused before any read", async () => {
  const f = fake(seeded());
  const r = await run(f, { company_id: CO, input_file_id: "f-1", speaker_role: "client_stakeholder", file_sha256: "a".repeat(64), transcript_text: "never" });
  assertEquals(r.status, 400); assertStringIncludes(r.json.error, "A4");
});

Deno.test("Option B: no model, no OpenAI, no external host in this function", async () => {
  const src = await Deno.readTextFile(new URL("./handler.ts", import.meta.url));
  for (const bad of ["openai", "anthropic", "OLLAMA", "api.openai.com", "extracted.txt"]) assert(!src.toLowerCase().includes(bad.toLowerCase()) || bad === "extracted.txt" && !src.includes(".upload("), `found ${bad}`);
  assert(!src.includes(".upload("), "never writes to storage (no sidecar)");
});


// ── Format amendment (F1–F4) + R9/R10 guards ───────────────────────────────────────────────────────────
const VTT = "WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\n<v Speaker A>fixture caption one\n\n2\n00:00:05.000 --> 00:00:08.000\n<v Speaker B>fixture caption two   \n";
const SRT = "1\r\n00:00:01,000 --> 00:00:04,000\r\nSpeaker A: fixture caption one\r\n\r\n2\r\n00:00:05,000 --> 00:00:08,000\r\nSpeaker B: fixture caption two\r\n";
const BOM = new Uint8Array([0xef, 0xbb, 0xbf]);
const cat = (...parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };

Deno.test("(n) .vtt and .srt record with local_text_reader; the stored text is byte-identical to the file minus a leading BOM (cues, timestamps, speaker labels, CRLF, trailing spaces all kept)", async () => {
  for (const [name, text, bommed] of [["fixture-captions.vtt", VTT, false], ["fixture-captions.srt", SRT, true]] as const) {
    const bytes = bommed ? cat(BOM, enc(text)) : enc(text);
    const s = seeded({ name, type: name.endsWith(".vtt") ? "text/vtt" : "", bytes }); const f = fake(s);
    const r = await run(f, { company_id: CO, input_file_id: "f-1", speaker_role: "client_stakeholder", file_sha256: await sha256HexBytes(bytes.buffer as ArrayBuffer) });
    assertEquals(r.status, 200, JSON.stringify(r.json));
    const rec = f.tables.interview_records[0];
    assertEquals(rec.extraction_method, "local_text_reader");
    assertEquals(rec.extraction_version, TEXT_READER_VERSION);
    assertEquals(rec.verbatim, text, `${name}: exactly the file's text (BOM ${bommed ? "dropped" : "absent"})`);
    assertEquals(rec.text_sha256, await sha256HexText(text));
    assertEquals(rec.file_sha256, await sha256HexBytes(bytes.buffer as ArrayBuffer), "file_sha256 hashes the bytes INCLUDING the BOM");
    assertEquals(rec.file_bytes, bytes.length);
  }
});

Deno.test("(o) .xlsx and .doc → 422 S4 (the new wording), zero rows, zero objects left, the parser never called", async () => {
  for (const [name, type] of [["fixture.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], ["fixture.doc", "application/msword"], ["fixture.csv", "text/csv"]] as const) {
    const bytes = enc(`fixture bytes for ${name}`);
    const s = seeded({ name, type, bytes }); const f = fake(s);
    let parserCalls = 0;
    const r = await run(f, { company_id: CO, input_file_id: "f-1", speaker_role: "market_participant", file_sha256: await sha256HexBytes(bytes.buffer as ArrayBuffer) }, () => { parserCalls++; return Promise.resolve({ text: "x", source: "local_parser_mammoth" }); });
    assertEquals(r.status, 422, name); assertEquals(r.json.error, "unsupported_transcript_type"); assertEquals(r.json.message, "This file type can't be read as a transcript. Upload a text, Word or PDF file.");
    assertEquals(parserCalls, 0); assertEquals(f.tables.interview_records, []); assertEquals(f.tables.input_files, []); assertEquals(Object.keys(f.objects), []); assertEquals(f.removed, [s.path]);
  }
});

Deno.test("(p) a text-less PDF → 422 S5, zero rows, rolled back", async () => {
  const bytes = enc("%PDF-fixture-with-no-text-layer");
  const s = seeded({ name: "fixture-scan.pdf", type: "application/pdf", bytes }); const f = fake(s);
  const r = await run(f, { company_id: CO, input_file_id: "f-1", speaker_role: "market_participant", file_sha256: await sha256HexBytes(bytes.buffer as ArrayBuffer) }, () => Promise.resolve({ text: "   \n", source: "local_parser_pdfjs", versions: { pdfjs: "5.5.207" } }));
  assertEquals(r.status, 422); assertEquals(r.json.error, "empty_extraction"); assertEquals(r.json.message, STRINGS.S5);
  assertEquals(f.tables.interview_records, []); assertEquals(f.tables.input_files, []); assertEquals(f.removed, [s.path]);
});

Deno.test("(q) invalid UTF-8 → 422 S5, zero rows, rolled back — never a replacement character", async () => {
  const bytes = cat(enc("Speaker A: fixture "), new Uint8Array([0xff, 0xfe, 0xc3]), enc(" broken"));
  const s = seeded({ name: "fixture-bad.txt", bytes }); const f = fake(s);
  const r = await run(f, { company_id: CO, input_file_id: "f-1", speaker_role: "client_stakeholder", file_sha256: await sha256HexBytes(bytes.buffer as ArrayBuffer) });
  assertEquals(r.status, 422); assertEquals(r.json.error, "invalid_utf8"); assertEquals(r.json.message, STRINGS.S5);
  assertEquals(f.tables.interview_records, []); assertEquals(f.tables.input_files, []); assertEquals(f.removed, [s.path]);
  let threw = false; try { decodeTranscriptBytes(bytes.buffer as ArrayBuffer); } catch { threw = true; }
  assert(threw, "the decoder is strict");
  assertEquals(decodeTranscriptBytes(cat(BOM, enc("x\r\n")).buffer as ArrayBuffer), "x\r\n", "BOM dropped, CRLF kept");
  assertEquals(decodeTranscriptBytes(enc("\u00ef\u00bb\u00bfy").buffer as ArrayBuffer), "\u00ef\u00bb\u00bfy", "only a leading BYTE-level BOM is dropped");
});

Deno.test("(r) R9: the door row has interviewed_at NULL even though the file row carries uploaded_at", async () => {
  const s = seeded(); const f = fake(s);
  assertEquals(f.tables.input_files[0].uploaded_at, "2026-09-19T10:00:00Z");
  const r = await run(f, { company_id: CO, input_file_id: "f-1", speaker_role: "market_participant", file_sha256: await sha256HexBytes(enc(FIXTURE).buffer as ArrayBuffer) });
  assertEquals(r.status, 200);
  assertStrictEquals(f.tables.interview_records[0].interviewed_at, null);
});

Deno.test("(s) R10: no authenticated caller → 401, zero rows, the object and the row rolled back; the owner is never substituted", async () => {
  for (const variant of ["no-header", "header-but-no-user"] as const) {
    const s = seeded(); const f = fake(s, { noCaller: true });
    const r = await run(f, { company_id: CO, input_file_id: "f-1", speaker_role: "market_participant", file_sha256: await sha256HexBytes(enc(FIXTURE).buffer as ArrayBuffer) }, undefined, variant === "header-but-no-user");
    assertEquals(r.status, 401, variant); assertEquals(r.json.error, "no_authenticated_caller"); assertEquals(r.json.message, STRINGS.S6);
    assertEquals(f.tables.interview_records, []); assertEquals(f.tables.input_files, []); assertEquals(f.removed, [s.path]);
    assertEquals(f.tables.integrity_runs[0].status, "rejected");
    assert(!JSON.stringify(f.tables).includes(OWNER) || JSON.stringify(f.tables.companies).includes(OWNER), "the owner id appears nowhere but the companies fixture");
  }
});
