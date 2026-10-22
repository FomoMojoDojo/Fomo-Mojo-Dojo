// ── N1 / N2 (operator rulings, 2026-10-14): names are specifics too ─────────────────────────────
//
// WHY. Wasabi's third staged read (2322e6db, audit 10303) named "Wasabi Fire" and "AI/ML" in a
// record-classed differentiator whose only cited row (2242bdd1) states neither — it quotes Liverpool
// FC on Wasabi AiR and nothing else. Every gate passed it: S1's scope was figures plus four position
// words, so a product name went unchecked, and C1-S had just asked the model to carry the line
// forward word for word.
//
// N1 adds names to S1. N2 closes the loop N1 would otherwise open: the three rows that DO name
// Wasabi Fire (7964d012, 9373abfc, ba7db62d) were outside the pool, because P1 admits only rows the
// current read CITES and the current read never cited them. Without N2, N1 would refuse the read for
// naming a product whose evidence the selection withheld, and the only way to pass would be to stop
// naming it — a worse read.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { nameShaped, namesIn, s1Unsourced, unsourcedNames } from "./classFactCheck.ts";
import { PREDECESSOR_CITED_CAP, PREDECESSOR_CITED_REASON, PREDECESSOR_NAMED_REASON } from "./publicReadInputs.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// ── what counts as a name, and the four narrowing fixes ─────────────────────────────────────────

Deno.test("N1. the shapes the ruling names ARE names", () => {
  // N1a (2026-10-14) removed the two-letter abbreviations from this list: AI and TV name a
  // CATEGORY, not a thing, and belong to the judge's grounding check. Three letters or more stays.
  for (const t of ["FedRAMP", "AI/ML", "S3", "CRM", "SMBs", "SunRise", "BlueSkySquads", "JRVS", "Medi-Cal/Medicare"]) {
    assert(nameShaped(t), `${t} is a name by shape`);
  }
  for (const t of ["AI", "TV"]) assertEquals(nameShaped(t), false, `${t} is a category word under N1a`);
  assertEquals(namesIn("supports AI/ML workloads on S3 with FedRAMP Ready status").sort(),
    ["AI/ML", "FedRAMP Ready", "S3"]);
});

Deno.test("N1 fix (a). only the MAXIMAL run — never its constituent words", () => {
  // "San Francisco" also emitted "San" and "Francisco"; "Therapeutic Behavioral Services" all three
  const n = namesIn("Youth and families in San Francisco and San Mateo counties, including Therapeutic Behavioral Services");
  assert(n.includes("San Francisco"), "the run");
  assert(n.includes("Therapeutic Behavioral Services"), "and the three-word run");
  for (const sub of ["San", "Francisco", "Mateo", "Therapeutic", "Behavioral", "Services"]) {
    assert(!n.includes(sub), `${sub} is a word inside a run, not a name of its own`);
  }
});

Deno.test("N1 fix (b). a single letter is never a name", () => {
  assertEquals(nameShaped("S"), false);
  assertEquals(nameShaped("U"), false);
  // "U.S." emitted "U" and "S" 17 times across the classed reads
  const n = namesIn("the largest provider in the U.S. market");
  assert(n.includes("U.S."), "the abbreviation is one name — fix (d)");
  assert(!n.includes("U") && !n.includes("S"), "and not two letters");
});

Deno.test("N1 fix (c). a plain Capitalized word is NOT a name", () => {
  for (const t of ["The", "To", "Small", "Clients", "Ability", "Expertise", "Deliver", "Automate", "Youth", "Area"]) {
    assertEquals(nameShaped(t), false, `${t} is an ordinary word that happens to be capitalized`);
  }
  assertEquals(namesIn("Small and medium-sized businesses seeking Expertise"), [], "neither is a name");
});

Deno.test("N1 fix (e). a hyphenated category adjective is not a name; a 3+ abbreviation inside it is", () => {
  // The compound itself is never a name. Whether the ABBREVIATION inside it is now depends on N1a:
  // AI- compounds yield nothing at all (AI is a category word), while a 3+ stem is still extracted.
  for (const t of ["AI-powered", "AI-driven", "AI-focused", "AI-first", "AI-fueled", "AI-savvy"]) {
    const n = namesIn(`businesses seeking ${t} tools`);
    assert(!n.includes(t), `${t} is the same kind of word as "regulated", which the ruling leaves to the judge`);
    assert(!n.includes("AI"), "and under N1a the two-letter stem is not a name either");
  }
  const crm = namesIn("businesses seeking CRM-integrated tools");
  assert(!crm.includes("CRM-integrated"), "the compound is still not a name");
  assert(crm.includes("CRM"), "but a THREE-letter stem inside it is extracted");
});

Deno.test("N1. the company's own name is excluded — but only when it IS the whole name", () => {
  const src = ["Wasabi provides hot cloud storage"];
  // The fixture must use a name that IS name-shaped, or the test passes whether the exclusion works
  // or not: "Wasabi" is a plain Capitalized word and nameShaped already refuses it.
  assert(nameShaped("BlueSkyAI"), "a mixed-case company name IS extracted, so the exclusion is load-bearing");
  assertEquals(unsourcedNames({ text: "BlueSkyAI builds agents", cls: "record", citedSourceTexts: ["unrelated row text"], companyName: "BlueSkyAI" }),
    [], "the company's own name alone is never demanded of the record");
  assertEquals(namesIn("Wasabi Technologies provides storage").includes("Wasabi Technologies"), true,
    "a multi-word company name IS extracted too");
  assertEquals(unsourcedNames({ text: "Wasabi Technologies provides storage", cls: "record", citedSourceTexts: ["unrelated"], companyName: "Wasabi Technologies" }),
    [], "and excluded when it is the whole name");
  assertEquals(unsourcedNames({ text: "Wasabi provides storage", cls: "record", citedSourceTexts: src, companyName: "Wasabi Technologies" }),
    [], "Wasabi alone is not demanded of the record");
  assertEquals(unsourcedNames({ text: "Wasabi Fire is the faster tier", cls: "record", citedSourceTexts: src, companyName: "Wasabi Technologies" }),
    ["Wasabi Fire"], "Wasabi Fire is a name and must be stated");
  // and a second real name in the same line is reported too — NVMe is a name, not noise
  assertEquals(unsourcedNames({ text: "Wasabi Fire is an NVMe tier", cls: "record", citedSourceTexts: src, companyName: "Wasabi Technologies" }).sort(),
    ["NVMe", "Wasabi Fire"]);
});

// ── the refusal ──────────────────────────────────────────────────────────────────────────────────

Deno.test("N1. a record line naming a product absent from its cited rows is refused", () => {
  const r = s1Unsourced({
    field: "unique_attributes[2]", cls: "record", companyName: "Wasabi Technologies",
    text: "AI-focused storage solutions like Wasabi Fire and Wasabi AiR support AI/ML workloads",
    citedSourceTexts: ["Liverpool FC SVP of Digital Drew Crisp quoted at NAB 2024: 'Wasabi AiR significantly reduces our manual efforts due to its seamless use of AI recognition technology'"],
  });
  // the real 2322e6db case: AiR is stated, Fire and AI/ML are not
  assertEquals(r.unsourced_names?.sort(), ["AI/ML", "Wasabi Fire"]);
  assert(!r.unsourced_names?.includes("Wasabi AiR"), "AiR IS in the cited row");
  assert(r.unsourced.some((u) => u.kind === "name" && u.token === "Wasabi Fire"), "and it refuses as a name");
});

Deno.test("N1. the same name PRESENT in a cited row passes", () => {
  const r = s1Unsourced({
    field: "unique_attributes[2]", cls: "record", companyName: "Wasabi Technologies",
    text: "Wasabi Fire and Wasabi AiR support AI/ML workloads",
    citedSourceTexts: ["infrastructure (Wasabi Fire NVMe tier, Wasabi AiR metadata) serving AI/ML workloads"],
  });
  assertEquals(r.unsourced_names, []);
  assertEquals(r.unsourced.filter((u) => u.kind === "name"), []);
});

Deno.test("N1. an UNCLASSED line is not N1's business; our_read is, since N1b", () => {
  assertEquals(unsourcedNames({ text: "Wasabi Fire and AI/ML", cls: null, citedSourceTexts: [] }), [],
    "an unclassed line cites nothing to be tested against");
  // N1b (2026-10-14) brought our_read into scope: calling a line our read licenses the READING, not
  // the invention of a product name. This is the 2322e6db case, which N1 alone never examined.
  assertEquals(unsourcedNames({ text: "Wasabi Fire and AI/ML", cls: "our_read", citedSourceTexts: [] }).sort(),
    ["AI/ML", "Wasabi Fire"]);
});

Deno.test("N1. names ride in the SAME result and the SAME refusal as the figures", async () => {
  const src = await read("./classFactCheck.ts");
  const fn = src.slice(src.indexOf("export function s1Unsourced("), src.indexOf("export function s1Detail("));
  assert(fn.includes("unsourcedNames({"), "s1Unsourced calls the name check");
  assert(fn.includes('kind: "name" as SpecificKind'), "and a missing name enters `unsourced` like any specific");
  assert(fn.includes("unsourced_names: names"), "reported separately so a reader can tell the two apart");
});

Deno.test("N1. runs at STAGE and at PROMOTE, with the company name at both", async () => {
  const gen = await read("../generate-public-read/index.ts");
  assert(/s1Unsourced\(\{[\s\S]{0,120}companyName/.test(gen), "stage passes the company name");
  const prm = await read("./publicReadPromote.ts");
  assert(prm.includes("export async function promoteS1Refusal("), "the promote check exists");
  assert(/s1Unsourced\(\{[\s\S]{0,140}companyName/.test(prm), "and promote passes it too");
  assert(prm.includes('.from("companies").select("name")'), "reading it from the company, not guessing");
  // and it must be THE shared function, imported — a local stub satisfies every check above while
  // doing nothing, which is exactly how a promote-side skip would look.
  assert(/import \{[^}]*\bs1Unsourced\b[^}]*\} from "\.\/classFactCheck\.ts";/.test(prm),
    "s1Unsourced is imported from the shared module, never redefined locally");
  assert(!/const s1Unsourced\s*=/.test(prm), "no local shadow of the gate");
});

// ── N2 ──────────────────────────────────────────────────────────────────────────────────────────

Deno.test("N2. the admission uses the SAME name extractor the gate uses", async () => {
  const src = await read("./publicReadInputs.ts");
  assert(/import \{ namesIn \} from "\.\/classFactCheck\.ts";/.test(src),
    "imported, not re-stated — the gate and the admission must agree on what a name is");
  assert(src.includes("for (const n of namesIn(l.text))"), "the predecessor's names come from it");
  assertEquals(PREDECESSOR_NAMED_REASON, "predecessor_named");
});

Deno.test("N2. candidates go through selectSignals, so every admission law applies", async () => {
  const src = await read("./publicReadInputs.ts");
  assert(/const p1Named = p1Budget > 0 && namedCandidates\.length > 0\s*\n\s*\? selectSignals\(namedCandidates, p1Budget, confirmed\)/.test(src),
    "through the real selector: empty_text, page-shape, junk, listing, dedupe and order all hold");
  // W1 and the query predicates are upstream of sigRest, which namedCandidates is filtered from
  const fn = src.slice(src.indexOf("export async function selectPublicInputs("));
  const w1 = fn.indexOf("isPublicSignalSourceType(r.source_type)");
  const cands = fn.indexOf("const namedCandidates =");
  assert(w1 > 0 && w1 < cands, "W1 filters before the candidates are picked");
  assert(fn.includes("const namedCandidates = predecessorNames.length > 0\n    ? sigRest.filter("),
    "and the candidates come from sigRest — already W1-filtered, live, outside-band");
});

Deno.test("N2. findings and deltas are never admitted by it", async () => {
  const src = await read("./publicReadInputs.ts");
  const fn = src.slice(src.indexOf("export async function selectPublicInputs("));
  // the name lane touches only the signal list
  assert(fn.includes("? sigRest.filter("), "candidates are signals only");
  // predecessorNames is READ in exactly two places: the harvest that builds it, and the ONE filter
  // over sigRest. A third reader means some other kind started being admitted by name — which is how
  // a finding or delta lane would creep in without touching the word "namedCandidates".
  const reads = [...fn.matchAll(/predecessorNames(?!:)/g)].length;
  assertEquals(reads, 4, "the harvest (3: declare, includes-guard, push) and the single sigRest filter");
  const filters = [...fn.matchAll(/predecessorNames\.some\(/g)].length;
  assertEquals(filters, 1, "exactly ONE name filter, and it is over sigRest");
  const lenGuards = [...fn.matchAll(/predecessorNames\.length > 0/g)].length;
  assertEquals(lenGuards, 1, "ONE guard, on the candidate filter — the N2 selection guards on namedCandidates");
});

Deno.test("N2. P1 and N2 SHARE one budget of 12, and P1 spends first", async () => {
  assertEquals(PREDECESSOR_CITED_CAP, 12);
  const src = await read("./publicReadInputs.ts");
  const fn = src.slice(src.indexOf("export async function selectPublicInputs("));
  const sigSpend = fn.indexOf("p1Budget -= p1Sig.kept.length;");
  const owSpend = fn.indexOf("p1Budget -= p1Ow.kept.length;");
  const n2Select = fn.indexOf("const p1Named = p1Budget > 0");
  const n2Spend = fn.indexOf("p1Budget -= p1Named.kept.length;");
  assert(sigSpend > 0 && owSpend > 0 && n2Select > 0 && n2Spend > 0);
  assert(sigSpend < owSpend, "P1's signals spend first");
  assert(owSpend < n2Select,
    "and P1's own_words spend BEFORE N2 — selecting N2 earlier starved that lane on Wasabi (3 cited own_words lost it to 8 name rows)");
  assert(n2Select < n2Spend, "then N2 takes what is left");
  // the budget IS the cap handed to the selector, so the three together cannot exceed 12
  assert(fn.includes("selectSignals(namedCandidates, p1Budget, confirmed)"), "N2's cap is the remaining budget");
});

Deno.test("N2. the two reasons are distinct, and the ledger names both sets", async () => {
  assertEquals(PREDECESSOR_CITED_REASON, "predecessor_cited");
  assertEquals(PREDECESSOR_NAMED_REASON, "predecessor_named");
  assert(PREDECESSOR_CITED_REASON !== PREDECESSOR_NAMED_REASON, "a reader can tell why a row is there");
  const gen = await read("../generate-public-read/index.ts");
  assert(gen.includes("predecessor_cited: inputs.filter((r) => r.admitted_by === PREDECESSOR_CITED_REASON).map((r) => r.id),"));
  assert(gen.includes("predecessor_named: inputs.filter((r) => r.admitted_by === PREDECESSOR_NAMED_REASON).map((r) => r.id),"));
});

Deno.test("N2. the name harvest does NOT require a class on the predecessor's line", async () => {
  // 21 of the 22 current positioning reads are wholly unclassed (they predate 1a-4). Requiring
  // record/you there made N2 a no-op on exactly the reads that need it — measured: Wasabi admitted
  // 0 rows while "Wasabi Fire" was one of its own names.
  const src = await read("./publicReadInputs.ts");
  const harvest = src.slice(src.indexOf("const predecessorNames: string[] = [];"), src.indexOf("/** P1's shared budget"));
  assert(!harvest.includes('l.cls !== "record"'), "no class test on the predecessor's line");
  assert(harvest.includes("NO CLASS TEST HERE"), "and the reason is written down");
});

Deno.test("N2. selection_version was bumped — which rows enter the pool changed", async () => {
  const { SELECTION_VERSION } = await import("./publicReadSelection.ts");
  assert(SELECTION_VERSION !== "gpr-select-2026-10-14.2", "the pre-N2 version must not still be stamped");
  assertEquals(SELECTION_VERSION, "gpr-select-2026-10-22.3");   // bumped again 2026-10-22 (own-words host order; ruling 9 rule refusals)
});
