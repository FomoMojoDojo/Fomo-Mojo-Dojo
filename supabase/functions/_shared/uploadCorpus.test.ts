// J2 guards (operator ruling signed 2026-09-18): a fully operator-retired upload never reaches a model.
// Fake client: tables in memory, chainable select/eq/in/limit, storage.download of the sidecar by path.
// Each guard has a by-hand planted failure (reported in the gate): (a) drop the filter → the retired
// fixture's sentinel reaches the docs; (b) mixed live/retired → treat any retired as retired; (c) zero
// signals → treat as retired; (d) lookup error → fail open (silently included).
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isOperatorRetiredUpload, loadContributingCorpus, loadContributingDocs } from "./uploadCorpus.ts";

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
      limit: () => b,
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej),
    });
    return b;
  };
  const storage = { from: (_b: string) => ({ download: (p: string) => Promise.resolve(p in sidecars ? { data: new Blob([sidecars[p]]), error: null } : { data: null, error: "missing" }) }) };
  return { from, storage };
}

const CO = "co-1";
const LIVE = { id: "f-live", input_id: "in-1", file_name: "Live Plan.pdf", file_type: "pdf", file_path: "co/live.pdf", archived_at: null };
const RETIRED = { id: "f-retired", input_id: "in-1", file_name: "Old Test Ingest.pdf", file_type: "pdf", file_path: "co/retired.pdf", archived_at: null };
const MIXED = { id: "f-mixed", input_id: "in-1", file_name: "Mixed.pdf", file_type: "pdf", file_path: "co/mixed.pdf", archived_at: null };
const FRESH = { id: "f-fresh", input_id: "in-1", file_name: "Fresh Upload.pdf", file_type: "pdf", file_path: "co/fresh.pdf", archived_at: null };
const SIDECARS = {
  "co/live.pdf.extracted.txt": "LIVE-SENTENCE the plan for next year",
  "co/retired.pdf.extracted.txt": "RETIRED-SENTINEL words the operator withdrew",
  "co/mixed.pdf.extracted.txt": "MIXED-SENTENCE partly re-minted",
  "co/fresh.pdf.extracted.txt": "FRESH-SENTENCE not yet ingested",
};
function world(extra: { proposals?: Row[]; signals?: Row[]; files?: Row[] } = {}) {
  return {
    inputs: [{ id: "in-1", company_id: CO }],
    input_files: extra.files ?? [LIVE, RETIRED, MIXED, FRESH],
    file_proposals: extra.proposals ?? [
      { id: "p-live", company_id: CO, file_id: "f-live", file_name: "Live Plan.pdf" },
      // the retired upload's proposals DANGLE (file_id of a deleted row) — linked by exact file_name
      { id: "p-ret-1", company_id: CO, file_id: "f-deleted-1", file_name: "Old Test Ingest.pdf" },
      { id: "p-ret-2", company_id: CO, file_id: null, file_name: "Old Test Ingest.pdf" },
      { id: "p-mixed", company_id: CO, file_id: "f-mixed", file_name: "Mixed.pdf" },
      { id: "p-fresh", company_id: CO, file_id: "f-fresh", file_name: "Fresh Upload.pdf" },
    ],
    signals: extra.signals ?? [
      { company_id: CO, source_type: "uploaded_file", source_id: "p-live", superseded_at: null, superseded_reason: null },
      { company_id: CO, source_type: "uploaded_file", source_id: "p-ret-1", superseded_at: "2026-09-01", superseded_reason: "operator_retired:test_ingest" },
      { company_id: CO, source_type: "uploaded_file", source_id: "p-ret-1", superseded_at: "2026-09-01", superseded_reason: "operator_retired:test_ingest" },
      { company_id: CO, source_type: "uploaded_file", source_id: "p-ret-2", superseded_at: "2026-09-01", superseded_reason: "operator_retired:test_ingest" },
      { company_id: CO, source_type: "uploaded_file", source_id: "p-mixed", superseded_at: null, superseded_reason: null },
      { company_id: CO, source_type: "uploaded_file", source_id: "p-mixed", superseded_at: "2026-09-01", superseded_reason: "operator_retired:test_ingest" },
      // a non-upload signal on the retired proposal id must not count as live
      { company_id: CO, source_type: "public_baseline_run", source_id: "p-ret-1", superseded_at: null, superseded_reason: null },
    ],
  };
}

Deno.test("(a) a live upload contributes; a fully operator-retired upload (dangling proposals, linked by name) never does — its sentinel is absent", async () => {
  const db = fakeDb(world(), SIDECARS);
  const { docs, excluded } = await loadContributingCorpus(db, CO);
  const names = docs.map((d) => d.file_name);
  assert(names.includes("Live Plan.pdf"), "live upload contributes");
  assert(!names.includes("Old Test Ingest.pdf"), "retired upload excluded");
  assert(!docs.some((d) => d.excerpt.includes("RETIRED-SENTINEL")), "the retired sentinel never reaches the docs");
  assert(docs.some((d) => d.excerpt.includes("LIVE-SENTENCE")), "the live text does");
  const x = excluded.find((e) => e.input_file_id === "f-retired");
  assert(x && x.reason === "operator_retired" && x.detail.includes("3 upload-family signal(s), 0 live"), `exclusion reported: ${JSON.stringify(excluded)}`);
  // the docs-only wrapper returns the same filtered set
  const plain = await loadContributingDocs(db, CO);
  assertEquals(plain.map((d) => d.file_name), names);
});

Deno.test("(b) an upload with some live and some retired signals still contributes", async () => {
  const { docs, excluded } = await loadContributingCorpus(fakeDb(world(), SIDECARS), CO);
  assert(docs.some((d) => d.file_name === "Mixed.pdf" && d.excerpt.includes("MIXED-SENTENCE")), "mixed upload contributes");
  assert(!excluded.some((e) => e.input_file_id === "f-mixed"), "not reported as excluded");
  const v = isOperatorRetiredUpload({ id: "f-mixed", file_name: "Mixed.pdf" }, world().file_proposals as never, world().signals as never);
  assertEquals({ retired: v.retired, total: v.total, live: v.live }, { retired: false, total: 2, live: 1 });
});

Deno.test("(c) an upload with zero upload-family signals (not yet ingested) still contributes", async () => {
  const { docs, excluded } = await loadContributingCorpus(fakeDb(world(), SIDECARS), CO);
  assert(docs.some((d) => d.file_name === "Fresh Upload.pdf" && d.excerpt.includes("FRESH-SENTENCE")), "fresh upload contributes");
  assert(!excluded.some((e) => e.input_file_id === "f-fresh"), "not reported as excluded");
  const v = isOperatorRetiredUpload({ id: "f-fresh", file_name: "Fresh Upload.pdf" }, world().file_proposals as never, world().signals as never);
  assertEquals({ retired: v.retired, total: v.total }, { retired: false, total: 0 });
});

Deno.test("(d) a lookup error fails closed: every upload is excluded and the exclusion is reported — never silently included", async () => {
  for (const failTable of ["file_proposals", "signals"]) {
    const { docs, excluded } = await loadContributingCorpus(fakeDb(world(), SIDECARS, { failTable }), CO);
    assertEquals(docs.length, 0, `${failTable} failure → zero docs`);
    assertEquals(excluded.length, 4, `${failTable} failure → every upload reported`);
    assert(excluded.every((e) => e.reason === "lookup_error" && e.detail.includes(`planted ${failTable} failure`)), "each exclusion names the error");
    assert(!docs.some((d) => d.excerpt.includes("LIVE-SENTENCE") || d.excerpt.includes("RETIRED-SENTINEL")), "nothing reaches the docs");
  }
});
