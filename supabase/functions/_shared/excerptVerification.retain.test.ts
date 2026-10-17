// Step (a) of the excerpt-fidelity fix (operator ruling 2026-10-16): the writer, against a fake store.
//
// Two facts the guard proves on the real database are proven here with no database at all, so a plant in
// either branch is RED in `deno test` before any guard runs:
//   1. retainPublicPages stores a basis under the url IN THE FORM THE SIGNALS CARRY, one row per form, and
//      labels it basis_kind crawl | cited_text (unknown when no meta names it) with the normalized url_key.
//   2. applyMintExcerptGuard: a draft with no retained basis keeps claim_text, loses evidence_excerpt, and
//      carries the dropped text in raw_payload.excerpt_guard.unverified_excerpt under basis "none"; a draft
//      on a cited_text basis passes when verbatim and is blanked when paraphrased; an analysis row is
//      stamped and kept (the 2026-09-02 carve-out); the stamp's basis/reason never changes meaning.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { retainPublicPages } from "./excerptVerification.ts";
import { applyMintExcerptGuard } from "./evidencePhase1.ts";

// A minimal thenable query builder over in-memory tables. Only what the two functions call.
class FakeStore {
  tables: Record<string, Array<Record<string, unknown>>> = { outside_page_snapshots: [], excerpt_verifications: [] };
  from(table: string) { return new FakeQuery(this, table); }
}
class FakeQuery {
  private filters: Array<[string, unknown]> = [];
  private op: "select" | "insert" | "upsert" = "select";
  private payload: Record<string, unknown> | null = null;
  private upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } | null = null;
  constructor(private store: FakeStore, private table: string) {}
  select(_cols?: string) { return this; }
  eq(col: string, v: unknown) { this.filters.push([col, v]); return this; }
  limit(_n: number) { return this; }
  insert(row: Record<string, unknown>) { this.op = "insert"; this.payload = row; return this; }
  upsert(row: Record<string, unknown>, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) { this.op = "upsert"; this.payload = row; this.upsertOpts = opts ?? null; return this; }
  // deno-lint-ignore no-explicit-any
  then(resolve: (v: any) => void) {
    const rows = this.store.tables[this.table] ?? (this.store.tables[this.table] = []);
    if (this.op === "insert") { rows.push({ ...this.payload!, id: `${this.table}-${rows.length + 1}` }); return resolve({ data: null, error: null }); }
    if (this.op === "upsert") {
      const keys = (this.upsertOpts?.onConflict ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const dup = rows.some((r) => keys.every((k) => r[k] === this.payload![k]));
      if (dup && this.upsertOpts?.ignoreDuplicates) return resolve({ data: [], error: null });
      const row = { ...this.payload!, id: `${this.table}-${rows.length + 1}` };
      rows.push(row);
      return resolve({ data: [{ id: row.id }], error: null });
    }
    const data = rows.filter((r) => this.filters.every(([c, v]) => r[c] === v));
    return resolve({ data, error: null });
  }
}

const CO = "00000000-0000-4000-8000-00000000c0de";
const SNIPPET = "Staff were compassionate and the crisis unit responded within the hour, my daughter felt safe there.";
const PAGE = "About us. The roastery opened in 2011 on Magnolia Boulevard and roasts every bean in Burbank, three days a week.";

Deno.test("retainPublicPages — one row per url form the signals carry, labelled by basis kind, never the bare key alone", async () => {
  const store = new FakeStore();
  const r = await retainPublicPages(store, CO, [
    { key: "cited.test/p", text: SNIPPET, urls: ["https://www.cited.test/p/", "https://cited.test/p"], kind: "cited_text" },
    { key: "crawl.test/about", text: PAGE, urls: ["https://crawl.test/about"], kind: "crawl" },
    { key: "nometa.test/y", text: PAGE + " y", urls: ["nometa.test/y"], kind: "unknown" },
    { key: "empty.test/z", text: "   ", urls: ["https://empty.test/z"], kind: "crawl" },   // nothing to retain
  ], "run-1");
  assertEquals(r, { retained: 4, already: 0 });
  const rows = store.tables.outside_page_snapshots as Array<{ source_url: string; structured: Record<string, unknown>; text_sha256: string }>;
  assertEquals(rows.map((x) => x.source_url).sort(), ["https://cited.test/p", "https://crawl.test/about", "https://www.cited.test/p/", "nometa.test/y"]);
  assert(!rows.some((x) => x.source_url === "cited.test/p"), "the normalized key is not stored as the url when a signal form exists");
  const byUrl = Object.fromEntries(rows.map((x) => [x.source_url, x.structured]));
  assertEquals(byUrl["https://www.cited.test/p/"].basis_kind, "cited_text");
  assertEquals(byUrl["https://cited.test/p"].basis_kind, "cited_text");
  assertEquals(byUrl["https://cited.test/p"].url_key, "cited.test/p");
  assertEquals(byUrl["https://crawl.test/about"].basis_kind, "crawl");
  assertEquals(byUrl["nometa.test/y"].basis_kind, "unknown");
  assertEquals(byUrl["https://crawl.test/about"].retained_at_mint, true);
  assertEquals(byUrl["https://crawl.test/about"].public_baseline_run_id, "run-1");
  // the two forms of one page share one sha — the same text, stored twice so either join hits
  assertEquals(byUrl["https://www.cited.test/p/"] && rows.find((x) => x.source_url === "https://www.cited.test/p/")!.text_sha256, rows.find((x) => x.source_url === "https://cited.test/p")!.text_sha256);
  // idempotent on the (company, url, sha) key
  const again = await retainPublicPages(store, CO, [{ key: "crawl.test/about", text: PAGE, urls: ["https://crawl.test/about"], kind: "crawl" }], "run-2");
  assertEquals(again, { retained: 0, already: 1 });
});

// deno-lint-ignore no-explicit-any
const draft = (over: Record<string, unknown>): any => ({
  company_id: CO, source_id: "run-1", source_type: "public_baseline_run", source_title: "t", source_url: null,
  signal_band: "outside", evidence_type: "market_signal", claim_text: "", evidence_excerpt: "", topic: "x", framework: null,
  directness: "direct", recency: "recent", framing_fit: "partial", structure_level: "extracted", validation_status: "directional",
  confidence_to_use: "medium", relevance_state: "unknown", voice_class: "outside_voice_about_client", raw_payload: {},
  ...over,
});

Deno.test("applyMintExcerptGuard — no basis: claim_text stays, evidence_excerpt is emptied, the text is kept as unverified_excerpt under basis none", async () => {
  const store = new FakeStore();
  const summary = "Summary words the model wrote about a page nobody retained.";
  const d = draft({ source_url: "https://nobasis.test/page", claim_text: summary, evidence_excerpt: summary, raw_payload: { keep: 1 } });
  const stats = await applyMintExcerptGuard({ supabase: store, companyId: CO, runId: "run-1", signals: [d], sourceTextByUrl: new Map([["other.test/q", PAGE]]) });
  assertEquals(d.claim_text, summary);
  assertEquals(d.evidence_excerpt, "");
  assertEquals(d.raw_payload.keep, 1);
  assertEquals(d.raw_payload.excerpt_guard, { basis: "none", reason: "page_not_retained", guard_version: 1, unverified_excerpt: summary });
  assertEquals(stats.no_basis_at_mint, 1);
  assertEquals(stats.blanked_no_basis, 1);
  assertEquals(store.tables.excerpt_verifications.length, 0, "no basis ⇒ no verification row (never_checked is absence)");
});

Deno.test("applyMintExcerptGuard — an EMPTY basis map still applies the law (a no-crawl run has no page words)", async () => {
  const store = new FakeStore();
  const d = draft({ source_url: "https://nobasis.test/page", claim_text: "s", evidence_excerpt: "s" });
  await applyMintExcerptGuard({ supabase: store, companyId: CO, runId: null, signals: [d], sourceTextByUrl: new Map() });
  assertEquals(d.evidence_excerpt, "");
  assertEquals(d.claim_text, "s");
  assertEquals(store.tables.outside_page_snapshots.length, 0);
});

Deno.test("applyMintExcerptGuard — cited_text basis: verbatim passes and is recorded; a paraphrase is blanked; an analysis row is stamped and kept", async () => {
  const store = new FakeStore();
  const verbatim = draft({ source_url: "https://www.cited.test/p/", claim_text: "crisis unit responded within the hour", evidence_excerpt: "crisis unit responded within the hour" });
  const paraphrase = draft({ source_url: "https://cited.test/p", claim_text: "the crisis team came in sixty minutes", evidence_excerpt: "the crisis team came in sixty minutes" });
  const analysis = draft({ source_url: "https://nobasis.test/page", voice_class: "analysis", claim_text: "Our reading.", evidence_excerpt: "Our reading." });
  const stats = await applyMintExcerptGuard({
    supabase: store, companyId: CO, runId: "run-1", signals: [verbatim, paraphrase, analysis],
    sourceTextByUrl: new Map([["cited.test/p", SNIPPET]]),
    sourceBasisMeta: new Map([["cited.test/p", { url: "https://www.cited.test/p/", kind: "cited_text" }]]),
  });
  assertEquals(verbatim.evidence_excerpt, "crisis unit responded within the hour");
  assertEquals(verbatim.raw_payload.excerpt_guard.basis, "retained_page");
  assertEquals(verbatim.raw_payload.excerpt_guard.traced, true);
  // the blanked branch (ruling 2026-10-16, second step): claim_text stays, excerpt emptied, text stashed, own reason
  assertEquals(paraphrase.evidence_excerpt, "");
  assertEquals(paraphrase.claim_text, "the crisis team came in sixty minutes", "a blanked row keeps its summary");
  assertEquals(paraphrase.raw_payload.excerpt_guard.traced, false);
  assertEquals(paraphrase.raw_payload.excerpt_guard.basis, "retained_page");
  assertEquals(paraphrase.raw_payload.excerpt_guard.reason, "not_on_retained_page");
  assertEquals(paraphrase.raw_payload.excerpt_guard.unverified_excerpt, "the crisis team came in sixty minutes");
  assertEquals(paraphrase.raw_payload.excerpt_guard.blanked_excerpt, undefined, "one key for the stashed text, in both branches");
  assertEquals(analysis.evidence_excerpt, "Our reading.", "the analysis carve-out keeps our labelled reading");
  assertEquals(analysis.raw_payload.excerpt_guard, { basis: "none", reason: "page_not_retained", guard_version: 1, analysis_carve_out: true });
  assertEquals({ passed: stats.passed, dropped: stats.dropped_unverifiable, no_basis: stats.no_basis_at_mint, blanked_no_basis: stats.blanked_no_basis }, { passed: 1, dropped: 1, no_basis: 1, blanked_no_basis: 0 });
  // retention: under BOTH signal forms, labelled cited_text — never under the bare key
  const urls = (store.tables.outside_page_snapshots as Array<{ source_url: string; structured: Record<string, unknown> }>);
  assertEquals(urls.map((u) => u.source_url).sort(), ["https://cited.test/p", "https://www.cited.test/p/"]);
  assert(urls.every((u) => u.structured.basis_kind === "cited_text" && u.structured.url_key === "cited.test/p"));
  assertEquals(stats.retained, { retained: 2, already: 0 });
  // verification records: one per non-empty excerpt that HAD a basis (passed + blanked), none for the analysis row
  assertEquals(store.tables.excerpt_verifications.map((r) => r.verdict).sort(), ["blanked", "passed"]);
  assertEquals(store.tables.excerpt_verifications.map((r) => r.source_url).sort(), ["https://cited.test/p", "https://www.cited.test/p/"]);
});

Deno.test("applyMintExcerptGuard — a basis no draft cites is retained under the source's own url, else the key, kind unknown without meta", async () => {
  const store = new FakeStore();
  await applyMintExcerptGuard({
    supabase: store, companyId: CO, runId: "run-1", signals: [],
    sourceTextByUrl: new Map([["orphan.test/x", PAGE], ["nometa.test/y", PAGE + " y"]]),
    sourceBasisMeta: new Map([["orphan.test/x", { url: "https://orphan.test/x/", kind: "crawl" }]]),
  });
  const rows = store.tables.outside_page_snapshots as Array<{ source_url: string; structured: Record<string, unknown> }>;
  assertEquals(rows.map((r) => [r.source_url, r.structured.basis_kind]).sort(), [["https://orphan.test/x/", "crawl"], ["nometa.test/y", "unknown"]]);
});
