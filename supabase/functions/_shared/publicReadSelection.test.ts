// Operator ruling 5 (signed 2026-09-18) — generate-public-read input selection: deterministic, admitted by the
// preview's own authorities, broad across hosts, stamped with a selection version.
//
// Guards (each with a by-hand planted failure, reported in the gate; non-empty fixtures on both sides):
//   (a) a junk row and a non-page-shaped row are excluded; a page-shaped prose row stays
//   (b) an orthogonal pair is excluded; a relevant pair stays
//   (c) a candidate whose identity has only a STRUCK own_words claim is excluded; one with an active claim stays
//   (d) two duplicate signals (same canonical URL + same statement) take ONE slot — the newest read wins
//   (e) breadth: 3 hosts, cap 3 → one row per host even when one host holds the 3 newest rows
//   (f) determinism: shuffled input → the same selection, in the same order
//   (g) the ledger carries selection_version (source guard on the generator)
//   (h) breadth for pairs (amendment 2026-09-18): 3 observed claims, cap 3 → one pair per observed claim even
//       when one observed claim holds the 3 top-ranked pairs
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SELECTION_VERSION, selectDeltas, selectOwnWords, selectSignals, type SelDelta, type SelSignal } from "./publicReadSelection.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const NONE = new Set<string>();
const sig = (id: string, url: string, text: string, created: string, extra: Partial<SelSignal> = {}): SelSignal => ({
  id, claim_text: text, evidence_excerpt: null, source_title: "Edgewood — Home", source_url: url, event_date: null,
  created_at: created, confidence_to_use: "medium", evidence_class: "prose", voice_class: "outside_voice_about_client",
  raw_payload: { url, snippet: text }, ...extra,
});

Deno.test("(a) junk and non-page-shaped rows are excluded; a page-shaped prose row stays", () => {
  const rows = [
    sig("S-prose", "https://glassdoor.com/r/1", "3.4/5 rating; 58% recommend; management described as far removed.", "2026-09-11T00:00:00Z"),
    sig("S-junk", "https://edgewood.org/", "Edgewood — Home", "2026-09-11T00:00:00Z"), // exact page title
    sig("S-meta", "https://x.com/EdgewoodCenter", "Declared in page metadata (/)", "2026-09-11T00:00:00Z", { raw_payload: { hypothesis: "x" } }),
    sig("S-noshape", "https://edgewood.org/about", "A sentence with no page address in its payload.", "2026-09-11T00:00:00Z", { raw_payload: {} }),
    sig("S-listing", "https://yelp.com/biz/e", "Edgewood San Francisco 2 reviews", "2026-09-11T00:00:00Z", { evidence_class: "listing" }),
  ];
  const { kept, dropped } = selectSignals(rows, 20, NONE);
  assertEquals(kept.map((s) => s.id), ["S-prose"]);
  assertEquals(Object.fromEntries(dropped.map((d) => [d.id, d.reason])), { "S-junk": "channel_junk", "S-meta": "not_page_shaped", "S-noshape": "not_page_shaped", "S-listing": "listing" });
});

const delta = (id: string, extra: Partial<SelDelta> = {}): SelDelta => ({ id, delta_type: "echoed", declared_claim_id: "c-decl", public_claim_id: "c-pub", relevance_verdict: "relevant", observed_own_host: false, operator_disposition: null, ...extra });
const CLAIMS = new Map([
  ["c-decl", { id: "c-decl", statement: "We see families within a week.", status: "active", confidence: "medium" }],
  ["c-pub", { id: "c-pub", statement: "Edgewood saw our family within days.", status: "active", confidence: "high" }],
  ["c-struck", { id: "c-struck", statement: "they've created what's essentially a brand operating system", status: "struck", confidence: "medium" }],
]);

Deno.test("(b) an orthogonal pair is excluded; a relevant pair stays (and own-host / rejected / struck-claim pairs drop too)", () => {
  const rows = [delta("D-orth", { relevance_verdict: "orthogonal" }), delta("D-rel"), delta("D-own", { observed_own_host: true }), delta("D-rej", { operator_disposition: "rejected_pairing" }), delta("D-struck", { declared_claim_id: "c-struck" })];
  const { kept, dropped } = selectDeltas(rows, 15, CLAIMS);
  assertEquals(kept.map((d) => d.id), ["D-rel"]);
  assertEquals(Object.fromEntries(dropped.map((d) => [d.id, d.reason])), { "D-orth": "relevance_orthogonal", "D-own": "observed_own_host", "D-rej": "rejected_pairing", "D-struck": "claim_not_active" });
});

Deno.test("(c) a candidate whose identity has only a struck claim is excluded; one with an active claim stays; one per identity", () => {
  const rows = [
    { id: "O-struck", quote: "they've created what's essentially a brand operating system", judge_kind: null, content_identity: "ci-struck", created_at: "2026-08-21T22:08:59Z" },
    { id: "O-live", quote: "We provide the people, place, and path for exceptional youth mental healthcare.", judge_kind: null, content_identity: "ci-live", created_at: "2026-08-21T22:08:59Z" },
    { id: "O-live-2", quote: "We provide the people, place, and path for exceptional youth mental healthcare.", judge_kind: null, content_identity: "ci-live", created_at: "2026-08-21T23:46:01Z" },
  ];
  const { kept, dropped } = selectOwnWords(rows, 25, new Set(["ci-live"]), () => true);
  assertEquals(kept.map((w) => w.id), ["O-live"]);
  assertEquals(Object.fromEntries(dropped.map((d) => [d.id, d.reason])), { "O-struck": "no_active_claim", "O-live-2": "duplicate_identity" });
});

Deno.test("(d) two duplicate signals (canonical URL + statement) take one slot — the newest read wins", () => {
  const text = "Edgewood provides expert mental healthcare for youth and families.";
  const rows = [
    sig("S-old", "https://edgewood.org/", text, "2026-06-06T00:00:00Z"),
    sig("S-new", "https://www.edgewood.org", text, "2026-09-11T00:00:00Z"), // www + no slash → same canonical URL
    sig("S-other", "https://edgewood.org/about/", "Edgewood offers a continuum of mental healthcare.", "2026-06-06T00:00:00Z"),
  ];
  const { kept, dropped } = selectSignals(rows, 20, NONE);
  assertEquals(kept.map((s) => s.id), ["S-new", "S-other"]);
  assertEquals(dropped, [{ id: "S-old", kind: "signal", reason: "duplicate_of:S-new" }]);
});

Deno.test("(e) breadth: 3 hosts, cap 3 → one row per host, even when one host holds the 3 newest rows", () => {
  const rows = [
    sig("G1", "https://glassdoor.com/r/1", "Glassdoor review one.", "2026-09-11T00:00:00Z"),
    sig("G2", "https://glassdoor.com/r/2", "Glassdoor review two.", "2026-09-11T00:00:00Z"),
    sig("G3", "https://glassdoor.com/r/3", "Glassdoor review three.", "2026-09-11T00:00:00Z"),
    sig("Y1", "https://yelp.com/biz/e", "Yelp review one.", "2026-08-01T00:00:00Z"),
    sig("C1", "https://charitynavigator.org/ein/1", "4/4 stars for accountability.", "2026-07-01T00:00:00Z"),
  ];
  const { kept, dropped } = selectSignals(rows, 3, NONE);
  assertEquals(kept.map((s) => s.id), ["G1", "Y1", "C1"], "first pass takes one per host in fresh-first order");
  assertEquals(dropped.map((d) => d.id).sort(), ["G2", "G3"]);
  // with room for a second pass, the second-per-host rows come next
  assertEquals(selectSignals(rows, 5, NONE).kept.map((s) => s.id), ["G1", "Y1", "C1", "G2", "G3"]);
});

Deno.test("(f) determinism: shuffled input gives the same selection in the same order", () => {
  const base = [
    sig("A", "https://glassdoor.com/r/1", "Glassdoor review one.", "2026-09-11T00:00:00Z"),
    sig("B", "https://glassdoor.com/r/2", "Glassdoor review two.", "2026-09-11T00:00:00Z"),
    sig("C", "https://yelp.com/biz/e", "Yelp review one.", "2026-09-11T00:00:00Z"),
    sig("D", "https://charitynavigator.org/ein/1", "4/4 stars for accountability.", "2026-07-01T00:00:00Z"),
    sig("E", "https://niche.com/k12/e", "Very helpful with emotional needs.", "2026-08-01T00:00:00Z"),
  ];
  const expected = selectSignals(base, 4, NONE).kept.map((s) => s.id);
  const shuffles = [[4, 2, 0, 3, 1], [1, 0, 4, 3, 2], [3, 4, 1, 2, 0]];
  for (const order of shuffles) assertEquals(selectSignals(order.map((i) => base[i]), 4, NONE).kept.map((s) => s.id), expected);
  assertEquals(expected.length, 4);
  // deltas too: equal keys resolve by id whatever the arrival order
  const ds = [delta("D-b"), delta("D-a"), delta("D-c", { delta_type: "divergent" })];
  assertEquals(selectDeltas(ds, 15, CLAIMS).kept.map((d) => d.id), ["D-c", "D-a", "D-b"]);
  assertEquals(selectDeltas([...ds].reverse(), 15, CLAIMS).kept.map((d) => d.id), ["D-c", "D-a", "D-b"]);
});

Deno.test("(h) breadth for pairs: 3 observed claims, cap 3 → one pair per observed claim even when one claim holds the 3 top-ranked pairs", () => {
  const claims = new Map([
    ...CLAIMS,
    ["c-obs-glassdoor", { id: "c-obs-glassdoor", statement: "Mixed reviews: 'Amazing colleagues and model for providing…'", status: "active", confidence: "high" }],
    ["c-obs-kaiser", { id: "c-obs-kaiser", statement: "Kaiser Permanente lists Edgewood as an affiliated provider.", status: "active", confidence: "medium" }],
    ["c-obs-niche", { id: "c-obs-niche", statement: "School is very helpful when it comes to supporting emotional needs.", status: "active", confidence: "low" }],
    ["c-d1", { id: "c-d1", statement: "We are dedicated to embedding trauma-informed principles.", status: "active", confidence: "medium" }],
    ["c-d2", { id: "c-d2", statement: "We serve children and youth from 8 school districts.", status: "active", confidence: "medium" }],
    ["c-d3", { id: "c-d3", statement: "Our Acute Intensive Mental Health Services provide short-term care.", status: "active", confidence: "medium" }],
  ]);
  // the glassdoor observed claim holds the three TOP-ranked pairs (divergent + high confidence)
  const rows = [
    delta("G-1", { delta_type: "divergent", declared_claim_id: "c-d1", public_claim_id: "c-obs-glassdoor" }),
    delta("G-2", { delta_type: "divergent", declared_claim_id: "c-d2", public_claim_id: "c-obs-glassdoor" }),
    delta("G-3", { delta_type: "divergent", declared_claim_id: "c-d3", public_claim_id: "c-obs-glassdoor" }),
    delta("K-1", { delta_type: "divergent", declared_claim_id: "c-d1", public_claim_id: "c-obs-kaiser" }),
    delta("N-1", { delta_type: "echoed", declared_claim_id: "c-d2", public_claim_id: "c-obs-niche" }),
  ];
  const { kept, dropped } = selectDeltas(rows, 3, claims);
  assertEquals(kept.map((d) => d.id), ["G-1", "K-1", "N-1"], "first pass: one pair per observed claim in gap order");
  assertEquals(dropped.map((d) => d.id).sort(), ["G-2", "G-3"]);
  assertEquals(selectDeltas(rows, 5, claims).kept.map((d) => d.id), ["G-1", "K-1", "N-1", "G-2", "G-3"], "second pass fills from the same observed claim");
  // determinism holds for pairs under breadth
  assertEquals(selectDeltas([...rows].reverse(), 3, claims).kept.map((d) => d.id), ["G-1", "K-1", "N-1"]);
});

Deno.test("(g) the ledger carries selection_version; the generator selects through the helper and imports every predicate", async () => {
  assertEquals(SELECTION_VERSION, "gpr-select-2026-09-18.1");
  const gen = await read("../generate-public-read/index.ts");
  assert(gen.includes("selection_version: SELECTION_VERSION,"), "ledgerOf stamps the version");
  assert(gen.includes("const { inputs, dropped } = await selectPublicInputs(supabase, company_id);"), "the ONE selection helper feeds the ledger");
  assert(!gen.includes("async function gatherPublicInputs("), "the physical-order gather is gone");
  // wall brief (2026-09-18): the gather MOVED to publicReadInputs.ts so the bet writer reads the same pool; the generator imports it
  assert(gen.includes('import { selectPublicInputs, type InputRow } from "../_shared/publicReadInputs.ts";'), "the generator imports the shared pool");
  const pool = await read("./publicReadInputs.ts");
  for (const fn of ["selectSignals(", "selectOwnWords(", "selectFindings(", "selectDeltas("]) assert(pool.includes(fn), `${fn} used by the shared pool`);
  const sel = await read("./publicReadSelection.ts");
  for (const imp of ['from "./voiceLabel.ts"', 'from "./ownWordsExtract.ts"', 'from "./relevanceActive.ts"', 'from "./previewOrder.ts"', 'from "../../../src/lib/firstRead/quoteProducer.ts"']) assert(sel.includes(imp), `imports ${imp}`);
  assert(!/function isChannelJunk|function isPairAdmissible|function isPageShapedRow|function compareBeat2/.test(sel), "no predicate is copied");
  // the preview still orders through the same moved authorities
  const mapping = await read("../../../src/views/client/firstReadPreview/mapping.ts");
  assert(mapping.includes('from "../../../../supabase/functions/_shared/previewOrder.ts"') && mapping.includes("export { GAP_VERDICT_ORDER, orderBeat2Signals, orderGapPairs, strengthForSignal };"));
  const ra = await read("../../../src/lib/firstRead/relevanceActive.ts");
  assert(ra.includes('} from "../../../supabase/functions/_shared/relevanceActive.ts";') && !ra.includes("export function isPairAdmissible"), "the client's relevanceActive re-exports the moved authority");
});
