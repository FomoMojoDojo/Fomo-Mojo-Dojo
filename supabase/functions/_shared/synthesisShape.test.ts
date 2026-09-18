// S2 (signed 2026-09-18) — a synthesis row is identified by SHAPE (raw_payload.hypothesis on a baseline row);
// the marker and the label are honoured, neither is required.
//
// Guards (each with a by-hand planted failure, reported in the gate):
//   (a) classifyVoice: an UNMARKED, UNLABELLED hypothesis-shaped row on the company's own URL → 'analysis'
//       (a page-shaped own-host row → client_voice; a flat labelled item → its label; an outside item → outside)
//   (b) the lazy stamper (storeSupplement.ts) stamps that row 'analysis', never client_voice — while the true
//       own-host page row beside it IS stamped client_voice (non-empty on both sides)
//   (c) pickPageSignals: a synthesis row first + a page row second → the page row; the order reversed → the SAME
//       page row (the pick is order-independent: earliest created_at, then id, per URL)
//   (d) the rebuild's candidate predicate mints nothing from the shape (label absent, marker absent), while a
//       page-shaped client_voice row and an outside row stay candidates
// Source guards: classifyVoice, the client mirror and the lazy stamper read isAnalysisRow (raw_payload) before any
// URL test; pickPageSignals reads isPageShapedRow; the extractor selects created_at for the pick.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyVoice } from "./claimProvenance.ts";
import { isClaimCandidateSignal } from "./evidencePhase1.ts";
import { pickPageSignals } from "./ownWordsExtract.ts";
import { buildStoreSupplement } from "./storeSupplement.ts";
import { isAnalysisRow, isPageShapedRow, isSynthesisShaped } from "./voiceLabel.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const HOST = "edgewood.org";
const HOME = "https://edgewood.org/";
// The Edgewood row 58 shape, byte for byte: no label, no marker, only the hypothesis.
const UNMARKED = { voice_class: null, source_url: HOME, url: HOME, raw_payload: { hypothesis: "Edgewood is a leading nonprofit provider of youth mental health and family support services in the San Francisco Bay Area." } };
const PAGE = { voice_class: null, source_url: HOME, url: HOME, raw_payload: { bucket: "company_claim", url: HOME, snippet: "Edgewood provides expert mental healthcare for youth and families." } };

Deno.test("(a) classifyVoice: an unmarked hypothesis-shaped row on the own host is analysis; a page-shaped own-host row is client_voice", () => {
  assertEquals(classifyVoice(UNMARKED, HOST), "analysis");
  assertEquals(classifyVoice({ ...UNMARKED, url: "https://www.edgewood.org/about/" }, HOST), "analysis");
  assertEquals(classifyVoice(PAGE, HOST), "client_voice", "the page row on the same URL is still the company speaking");
  assertEquals(classifyVoice({ voice_class: "client_voice", url: HOME, raw_payload: { url: HOME } }, HOST), "client_voice");
  assertEquals(classifyVoice({ voice_class: "outside_voice_about_client", url: "https://sfexaminer.com/x", raw_payload: { url: "https://sfexaminer.com/x" } }, HOST), "outside_voice_about_client");
  assertEquals(classifyVoice({ url: "https://sfexaminer.com/x" }, HOST), "outside_voice_about_client", "a flat item with no raw_payload keeps the legacy fallback");
  assertEquals(classifyVoice({ voice_class: "analysis", url: HOME }, HOST), "analysis", "the S1 label rule still holds");
  // the marker alone (NULL label) is honoured too — the 21 NULL-voice marked rows
  assertEquals(classifyVoice({ voice_class: undefined, url: HOME, raw_payload: { hypothesis: "x", source_type: "analysis" } }, HOST), "analysis");
  assert(isSynthesisShaped(UNMARKED) && !isSynthesisShaped(PAGE) && isAnalysisRow(UNMARKED) && !isAnalysisRow(PAGE));
});

/** A fake client for the lazy stamper: the pinned run, the candidate rows, and a ledger of every UPDATE. */
function fakeSupplementDb(rows: Array<Record<string, unknown>>) {
  const stamps: Array<{ id: string; voice_class: string }> = [];
  const inserts: string[] = [];
  const from = (table: string) => {
    const b: Record<string, unknown> = {};
    let pendingUpdate: { voice_class: string } | null = null;
    let updateId: string | null = null;
    Object.assign(b, {
      select: () => b,
      eq: (c: string, v: unknown) => { if (pendingUpdate && c === "id") updateId = String(v); return b; },
      order: () => b, limit: () => b,
      is: (c: string, v: unknown) => {
        // the IS NULL guard: only a still-NULL row is stamped
        if (pendingUpdate && c === "voice_class" && v === null && updateId) {
          const row = rows.find((r) => r.id === updateId);
          if (row && row.voice_class == null) { row.voice_class = pendingUpdate.voice_class; stamps.push({ id: updateId, voice_class: pendingUpdate.voice_class }); }
        }
        return Promise.resolve({ data: null, error: null });
      },
      update: (patch: { voice_class: string }) => { pendingUpdate = patch; return b; },
      insert: () => { inserts.push(table); return Promise.resolve({ data: null, error: null }); },
      maybeSingle: () => Promise.resolve({ data: table === "public_baseline_runs" ? { created_at: "2026-06-11T00:00:00Z" } : null, error: null }),
      then: (res: (v: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data: table === "signals" ? rows : [], error: null }).then(res),
    });
    return b;
  };
  return { from, stamps, inserts };
}

Deno.test("(b) the lazy stamper stamps the unmarked hypothesis row 'analysis' and the page row 'client_voice' — never client_voice for the synthesis row", async () => {
  const rows = [
    { id: "S-synth", source_id: 3, source_url: HOME, claim_text: UNMARKED.raw_payload.hypothesis, evidence_excerpt: "", voice_class: null, raw_payload: UNMARKED.raw_payload, created_at: "2026-06-06T00:08:47Z" },
    { id: "S-page", source_id: 3, source_url: HOME, claim_text: PAGE.raw_payload.snippet, evidence_excerpt: PAGE.raw_payload.snippet, voice_class: null, raw_payload: PAGE.raw_payload, created_at: "2026-06-06T00:08:47Z" },
    { id: "S-labelled", source_id: 3, source_url: HOME, claim_text: "already classed", evidence_excerpt: "x", voice_class: "client_voice", raw_payload: { url: HOME }, created_at: "2026-06-06T00:08:47Z" },
  ];
  const db = fakeSupplementDb(rows);
  await buildStoreSupplement({
    supabase: db, companyId: "3dd2cfbb-0792-4bf1-9cd4-15db9646874b", pinnedRunId: 3, companyHost: HOST,
    corpus: { texts: [], hosts: new Set<string>() } as never, clientSample: "", currentRunItems: [],
    classify: (entry) => classifyVoice(entry, HOST), label: "guard-b",
  });
  const byId = Object.fromEntries(db.stamps.map((s) => [s.id, s.voice_class]));
  assertEquals(byId["S-synth"], "analysis", "the synthesis row is stamped analysis");
  assertEquals(byId["S-page"], "client_voice", "the page row on the same URL is stamped client_voice");
  assertEquals("S-labelled" in byId, false, "an already-classed row is not touched (IS NULL guard)");
  assertEquals(db.stamps.length, 2);
});

Deno.test("(c) pickPageSignals: synthesis first + page second → the page row; reversed → the same page row; earliest page row wins", () => {
  const synth = { id: "S-synth", source_url: HOME, source_title: "Edgewood public baseline", voice_class: "client_voice", raw_payload: UNMARKED.raw_payload, created_at: "2026-06-06T00:08:47.000Z" };
  const page = { id: "S-page", source_url: HOME, source_title: "Edgewood public baseline", voice_class: "client_voice", raw_payload: PAGE.raw_payload, created_at: "2026-06-06T00:08:47.614Z" };
  const later = { id: "S-page-later", source_url: HOME, source_title: null, voice_class: "client_voice", raw_payload: { url: HOME, snippet: "later" }, created_at: "2026-07-24T00:00:00Z" };
  const about = { id: "S-about", source_url: "https://edgewood.org/about/", source_title: null, voice_class: "client_voice", raw_payload: { page_url: "https://edgewood.org/about/" } };
  const onlySynth = { id: "S-only", source_url: "https://edgewood.org/programs/", source_title: null, voice_class: "client_voice", raw_payload: { hypothesis: "x" } };
  const forward = pickPageSignals([synth, page, later, about, onlySynth]);
  const reversed = pickPageSignals([onlySynth, about, later, page, synth]);
  assertEquals(forward.get(HOME)?.id, "S-page", "the synthesis row listed first is refused");
  assertEquals(reversed.get(HOME)?.id, "S-page", "the same page row whatever the order");
  assertEquals([...forward.entries()].map(([u, v]) => `${u}→${v.id}`).sort(), [...reversed.entries()].map(([u, v]) => `${u}→${v.id}`).sort());
  assertEquals(forward.get("https://edgewood.org/about/")?.id, "S-about");
  assertEquals(forward.has("https://edgewood.org/programs/"), false, "a URL with only a synthesis row gets no page signal");
  assertEquals(forward.size, 2);
  assert(isPageShapedRow(page) && isPageShapedRow(about) && !isPageShapedRow(synth) && !isPageShapedRow({ raw_payload: {} }));
});

Deno.test("(d) the rebuild mints nothing from the shape; a page-shaped client_voice row and an outside row stay candidates", () => {
  assertEquals(isClaimCandidateSignal({ voice_class: "client_voice", source_type: "public_baseline_run", raw_payload: { hypothesis: "x" } }), false, "unmarked, mis-stamped client_voice");
  assertEquals(isClaimCandidateSignal({ voice_class: null, source_type: "public_baseline_run", raw_payload: { hypothesis: "x" } }), false, "unmarked, NULL voice");
  assertEquals(isClaimCandidateSignal({ voice_class: "client_voice", source_type: "public_baseline_run", raw_payload: { url: HOME, snippet: "s" } }), true);
  assertEquals(isClaimCandidateSignal({ voice_class: "outside_voice_about_client", source_type: "public_baseline_run", raw_payload: { url: "https://sfexaminer.com/x" } }), true);
});

Deno.test("source guard: the deciders read isAnalysisRow (raw_payload) before any URL test; the pick reads isPageShapedRow; the extractor selects created_at", async () => {
  const prov = await read("./claimProvenance.ts");
  const fn = prov.slice(prov.indexOf("function classifyVoice("), prov.indexOf("function classifyVoice(") + 900);
  assert(fn.includes("raw_payload?: unknown"), "server: the entry carries raw_payload");
  assert(fn.indexOf("isAnalysisRow(entry)") > 0 && fn.indexOf("isAnalysisRow(entry)") < fn.indexOf("isCompanySource(entry, companyHost)"), "server: shape before host");
  const mirror = await read("../../../src/hooks/useSignalLandscape.ts");
  const mf = mirror.slice(mirror.indexOf("function classifyOutsideRow("), mirror.indexOf("function classifyOutsideRow(") + 700);
  assert(mf.indexOf("isAnalysisRow(row)") > 0 && mf.indexOf("isAnalysisRow(row)") < mf.indexOf("isCompanySource(row, companyHost)"), "mirror: shape before host");
  const sup = await read("./storeSupplement.ts");
  assert(sup.includes("raw_payload: row.raw_payload,") && sup.includes("raw_payload?: unknown }) => string;"), "lazy stamper: raw_payload rides to classify");
  const ow = await read("./ownWordsExtract.ts");
  assert(ow.includes("if (!s.source_url || !isPageShapedRow(s)) continue;"), "the pick admits page-shaped rows only");
  const ex = await read("../extract-own-words/index.ts");
  assert(ex.includes("raw_payload, superseded_at, created_at\")"), "the extractor selects created_at for the order-independent pick");
  const vl = await read("./voiceLabel.ts");
  assert(vl.includes('const SYNTHESIS_SHAPE_KEY = "hypothesis";'));
});
