// Gap-quality rules R1–R3 + record page words on the page (operator ruling 2026-10-22). Pure — no DB, no network, no model.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { checkPair, companyNameWords, isEmployerReviewHost, planRuleRefusals, type PairRuleInput } from "./deltaRuleChecks.ts";
import { recordWordsForRender, stripRecordMarkup, wordCharacters } from "./recordPageWords.ts";

const names = companyNameWords(["Acme Broadband", "Acme Holdings"]);
const pair = (over: Partial<PairRuleInput>): PairRuleInput => ({
  deltaId: "d1", contentIdentity: "ci1", deltaType: "divergent", declared: null, recordPageWords: [], recordHosts: ["reviews.example"], ...over,
});

// ── R1 ──
Deno.test("R1: a figure is not disputed by a rant that states no competing figure of the same unit", () => {
  const v = checkPair(pair({ declared: "Acme offers services to more than 57 million homes in 41 states.", recordPageWords: ["Acme is a company that will never survive beyond its shrinking customer base of homes."] }), names);
  assertEquals(v?.rule, "R1");
  assertEquals(v?.outcome, "not_echoed");
});
Deno.test("R1: a competing figure of the same unit stands (no refusal)", () => {
  const v = checkPair(pair({ declared: "Acme offers services to 57 million homes in 41 states.", recordPageWords: ["In fact Acme reaches 31 million homes in 30 states."] }), names);
  assertEquals(v, null);
});
Deno.test("R1: 24/7 support is not disputed by a 60-minute hold", () => {
  const v = checkPair(pair({ declared: "Online customer support is available 24/7", recordPageWords: ["I was on hold 60 minutes with inconsistent replies about customer support."] }), names);
  assertEquals(v?.rule, "R1");
});

// ── R2 ──
Deno.test("R2: no shared content word is absence, not contradiction", () => {
  const v = checkPair(pair({ declared: "Switching to Acme is easy", recordPageWords: ["Acme is the worst company I have ever had the displeasure of dealing with."] }), names);
  assertEquals(v?.rule, "R2");
  assertEquals(v?.outcome, "not_echoed");
});
Deno.test("R2: the company's own names are not shared content words", () => {
  const v = checkPair(pair({ declared: "Acme Holdings builds networks", recordPageWords: ["Acme Holdings was rude to me."] }), names);
  assertEquals(v?.rule, "R2");
});
Deno.test("R2: a shared content word lets the pair stand", () => {
  const v = checkPair(pair({ declared: "Signing up for home internet is easy", recordPageWords: ["Signing up took three calls and a week."] }), names);
  assertEquals(v, null);
});

// ── R3 ──
Deno.test("R3: employer-review hosts (every glassdoor TLD, indeed, comparably, kununu, teamblind)", () => {
  for (const h of ["glassdoor.com", "glassdoor.co.uk", "www.glassdoor.de", "indeed.com", "uk.indeed.com", "comparably.com", "kununu.com", "teamblind.com"]) assert(isEmployerReviewHost(h), h);
  for (const h of ["trustpilot.com", "yelp.com", "notglassdoor.com", "indeed.co"]) assert(!isEmployerReviewHost(h), h);
});
Deno.test("R3: an employee-voice-only record is removed — disputed or raised; it outranks R1/R2", () => {
  const d = checkPair(pair({ declared: "Best customer experience, 24/7", recordPageWords: ["Metrics over customer care"], recordHosts: ["glassdoor.co.uk"] }), names);
  assertEquals(d?.rule, "R3"); assertEquals(d?.outcome, "removed");
  const r = checkPair(pair({ deltaType: "internally_silent", recordPageWords: ["Free internet and cable"], recordHosts: ["glassdoor.com"] }), names);
  assertEquals(r?.rule, "R3");
});
Deno.test("R3: one customer host among the backing rows keeps it customer evidence", () => {
  const v = checkPair(pair({ deltaType: "internally_silent", recordPageWords: ["x"], recordHosts: ["glassdoor.com", "trustpilot.com"] }), names);
  assertEquals(v, null);
});
Deno.test("raised pairs take R3 only — no declared side, no R1/R2", () => {
  assertEquals(checkPair(pair({ deltaType: "internally_silent", recordPageWords: ["Nothing in common"], recordHosts: ["yelp.com"] }), names), null);
});
Deno.test("plan skips an identity that already carries an active refusal; sorted by delta id", () => {
  const ins = [pair({ deltaId: "b", contentIdentity: "x", declared: "Switching is easy", recordPageWords: ["worst ever"] }), pair({ deltaId: "a", contentIdentity: "y", declared: "Switching is easy", recordPageWords: ["worst ever"] })];
  assertEquals(planRuleRefusals(ins, names, new Map()).map((p) => p.delta_id), ["a", "b"]);
  assertEquals(planRuleRefusals(ins, names, new Map([["x", {}]])).map((p) => p.delta_id), ["a"]);
});

// ── record page words on the page ──
const WEB_SEARCH_ROW = {
  evidence_excerpt: "## Acme is a company that will never…\nAcme is a company that will never survive beyond their existing but shrinking customer base. They are cu...",
  claim_text: "One reviewer writes that Acme \"is a company that will never survive\", noting they are the only game in town.",
  structure_level: "extracted",
  raw_payload: { excerpt_guard: { basis: "websearch_cited_text", traced: true } },
};
Deno.test("a web_search-lane record (cited_text excerpt, model-sentence claim_text) renders its page words", () => {
  const w = recordWordsForRender(WEB_SEARCH_ROW);
  assert(w !== null, "record must render");
  assert(w!.startsWith("Acme is a company that will never…"), w!);
  assert(!w!.includes("#"));
});
Deno.test("an unverified excerpt renders no record line", () => {
  assertEquals(recordWordsForRender({ ...WEB_SEARCH_ROW, raw_payload: {} }), null);
  assertEquals(recordWordsForRender({ ...WEB_SEARCH_ROW, structure_level: "interpreted" }), null);
  assertEquals(recordWordsForRender(null), null);
});
const MARKUP_CASES = [
  "# Reviews\n## Customer Review Ratings\n\n2.4/5 stars\n\nAverage of 5,024 Customer Reviews",
  "# Charter\n## Dishonest dealings\nJul 24, 2025\n\n1.0\n\n- - I was on hold 60 minutes with inconsistent replies.\n- ...",
  "# Spectrum (brand)\n- **Product type**: Broadband Cable television Digital cable",
  "* item one\n+ item two\n• item three — 100% of #1 customers",
];
Deno.test("the markup strip removes # * and leading list markers and never a word character", () => {
  for (const c of MARKUP_CASES) {
    const s = stripRecordMarkup(c);
    assertEquals(wordCharacters(s), wordCharacters(c), c);
    assert(!/^\s*#/.test(s) && !s.includes("*") && !/(^|\s)[-+•]\s/.test(s.slice(0, 2)), s);
  }
  assertEquals(stripRecordMarkup("- **Product type**: Broadband"), "Product type: Broadband");
  assertEquals(stripRecordMarkup("- - I was on hold"), "I was on hold");
});

// ── ruling 7: R3 reaches echoed pairs; ruling 8: the operator kind ──
import { validateOperatorRefusal } from "./deltaRuleChecks.ts";
Deno.test("R3 on an echoed pair: employee voice neither disputes nor confirms", () => {
  const v = checkPair(pair({ deltaType: "echoed", declared: "Yes, you can save with Acme packages.", recordPageWords: ["Free internet and cable"], recordHosts: ["glassdoor.co.uk"] }), names);
  assertEquals(v?.rule, "R3"); assertEquals(v?.outcome, "removed");
});
Deno.test("an echoed pair takes R3 only — never R1 or R2", () => {
  assertEquals(checkPair(pair({ deltaType: "echoed", declared: "57 million homes", recordPageWords: ["nothing shared here"], recordHosts: ["wikipedia.org"] }), names), null);
});
Deno.test("an operator refusal needs a non-empty reason and an operator: actor", () => {
  assertEquals(validateOperatorRefusal({ delta_id: "d", reason: "A rating does not dispute a stated goal.", actor: "operator:bob" }), null);
  assert(validateOperatorRefusal({ delta_id: "d", reason: "   ", actor: "operator:bob" }));
  assert(validateOperatorRefusal({ delta_id: "d", reason: "", actor: "operator:bob" }));
  assert(validateOperatorRefusal({ delta_id: "d", reason: "x", actor: "claim-delta-finalize" }));
  assert(validateOperatorRefusal({ delta_id: "d", reason: "x", actor: "" }));
});
Deno.test("the system never revisits an operator refusal: the planner skips its identity even when a rule would fire", () => {
  const ins = [pair({ deltaId: "a", contentIdentity: "op", declared: "Switching is easy", recordPageWords: ["worst ever"] })];
  assertEquals(planRuleRefusals(ins, names, new Map()).length, 1);
  assertEquals(planRuleRefusals(ins, names, new Map([["op", { kind: "operator" }]])).length, 0);
});
