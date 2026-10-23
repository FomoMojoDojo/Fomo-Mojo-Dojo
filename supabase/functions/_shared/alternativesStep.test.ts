// Operator ruling 49 (2026-10-22) — the alternatives step. Fixture rows are copied text of Spectrum's pool (c6beea42,
// thestreet 3b21cd30) plus constructed controls. Each test is the target of one plant:
//   PA-4  A4: a paraphrase of the row is not its clause → dropped
//   PA-5  A5: a clause naming neither the company nor a confirmed related entity → dropped
//   PA-6  entries sharing one text MERGE, names joined " and " in record order
//   PA-7  the step sees record and review rows only; a you / our-read / pair row never reaches it, and a citation of one drops
//   PA-8  the name must be IN the clause the text copies (a name elsewhere in the row does not count)
//   AS-W  the positioning prompt no longer asks for alternatives; the step is attached at every attempt; its prompt is not
//         the read's prompt_sha; the signed strings are the ones rendered
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { alternativesStepRows, entityTokensOf, gateAlternativesStep, ALTERNATIVE_RENDER, ALTERNATIVE_GAP_QUESTION, renderAlternative } from "./positioningAlternative.ts";

const ROWS: Record<string, string> = {
  S1: "The two primary competitive threats to Charter's broadband business are fiber overbuilders and wireless FWA.",   // c6beea42, as rowTextOf returns it
  S2: "Phone carriers such as T-Mobile, Verizon, and AT&T have become major rivals of Spectrum, as they have been attracting internet customers through their 5G plans.",
  S3: "Comcast faces pressure from Starlink in rural markets; prices rose again.",
  S4: "Spectrum raised prices again this year. Many households now compare Starlink.",
};
const STEP = new Set(["S1", "S2", "S3", "S4"]);
const TOKENS = entityTokensOf(["Spectrum", "Charter Communications", "Cox Communications"]);
const gate = (raw: unknown) => gateAlternativesStep(raw, (r) => ROWS[r] ?? "", (r) => STEP.has(r), TOKENS);
const CLAUSE = "The two primary competitive threats to Charter's broadband business are fiber overbuilders and wireless FWA";

Deno.test("entity tokens drop generic words: Spectrum, charter, cox (communications is generic)", () => {
  assertEquals(TOKENS.sort(), ["charter", "cox", "spectrum"]);
});
Deno.test("PA-4 A4 — a paraphrase is not the row's clause and is dropped", () => {
  const g = gate([{ name: "fiber overbuilders", text: "Charter faces threats from fiber overbuilders", citations: ["S1"] }]);
  assertEquals([g.kept.length, g.dropped.map((d) => d.rule)], [0, ["A4"]]);
  assertEquals(gate([{ name: "fiber overbuilders", text: CLAUSE, citations: ["S1"] }]).kept.length, 1, "the byte-exact clause stays (its final stop optional)");
  assertEquals(gate([{ name: "fiber overbuilders", text: `${CLAUSE}.`, citations: ["S1"] }]).kept.length, 1, "with the row's own final stop, too");
  assertEquals(gate([{ name: "fiber overbuilders", text: CLAUSE.replace("The two", "the two"), citations: ["S1"] }]).kept.length, 0, "a changed letter case is not the row's words");
});
Deno.test("PA-5 A5 — a clause about another company is not an alternative to this one", () => {
  const g = gate([{ name: "Starlink", text: "Comcast faces pressure from Starlink in rural markets", citations: ["S3"] }]);
  assertEquals(g.dropped.map((d) => d.rule), ["A5"]);
});
Deno.test("PA-6 entries sharing one text merge, names joined ' and ' in record order", () => {
  const g = gate([
    { name: "wireless FWA", text: CLAUSE, citations: ["S1"] },
    { name: "fiber overbuilders", text: CLAUSE, citations: ["S1"] },
  ]);
  assertEquals(g.kept, [{ name: "fiber overbuilders and wireless FWA", text: CLAUSE, citations: ["S1"] }]);
  assertEquals(renderAlternative(g.kept[0]), `Your customers could choose fiber overbuilders and wireless FWA instead — \u201c${CLAUSE}\u201d`);
  // the dropped terminal stop stays outside the quotes: a clause stored WITH its period renders without it
  assertEquals(renderAlternative({ name: "x", text: `${CLAUSE}.` }), `Your customers could choose x instead — \u201c${CLAUSE}\u201d`);
});
Deno.test("PA-7 the step sees record and review rows only; citing any other row drops the entry", () => {
  const rows = [
    { id: "a", kind: "signal", source_class: "record" }, { id: "b", kind: "signal", source_class: "you" },
    { id: "c", kind: "own_word", source_class: "you" }, { id: "d", kind: "finding", source_class: "our_read" },
    { id: "e", kind: "delta", source_class: "record" }, { id: "f", kind: "signal", source_class: "our_read" },
  ];
  assertEquals(alternativesStepRows(rows).map((r) => r.id), ["a"]);
  const g = gateAlternativesStep([{ name: "fiber overbuilders", text: CLAUSE, citations: ["S1", "O9"] }], (r) => ROWS[r] ?? "", (r) => STEP.has(r), TOKENS);
  assertEquals(g.dropped.map((d) => d.rule), ["A3"]);
});
Deno.test("PA-8 the name must be in the clause the text copies — elsewhere in the row does not count", () => {
  const g = gate([{ name: "Starlink", text: "Spectrum raised prices again this year", citations: ["S4"] }]);
  assertEquals(g.dropped.map((d) => d.rule), ["A4"]);
  assertEquals(gate([{ name: "Starlink", text: "Many households now compare Starlink.", citations: ["S4"] }]).kept.length, 0, "and the clause must name the company (A5)");
});
Deno.test("AS-W the wiring, the prompt, and the signed strings", async () => {
  const g = await Deno.readTextFile(new URL("../generate-public-read/index.ts", import.meta.url));
  const pos = g.slice(g.indexOf("const GEN_POSITIONING = `"), g.indexOf("const GEN_STRATEGY = `"));
  assert(!pos.includes('"alternatives"') && !pos.includes("ALTERNATIVES (ruling 15)"), "the positioning prompt no longer asks for alternatives");
  assert(g.includes('if (kind === "positioning") payload.alternatives = (await alternativesForRun()).kept'), "attached at the head of every positioning attempt");
  assert(g.includes('meta.role !== "judge" && meta.role !== "alternatives") promptSha[meta.kind] = sha;'), "the step's prompt is not the read's prompt_sha");
  assert(g.includes('{ kind: "positioning", attempt: 1, role: "alternatives" }'), "ledgered as generate-public-read:positioning:alternatives");
  assertEquals(ALTERNATIVE_RENDER, "Your customers could choose {name} instead — \u201c{text}\u201d");   // ruling 54
  assertEquals(ALTERNATIVE_GAP_QUESTION, "When customers choose you, what are they choosing you over?");
});
