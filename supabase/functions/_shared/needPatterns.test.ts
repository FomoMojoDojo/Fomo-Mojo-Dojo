// ── The pattern layer's pure parts (SP-463 / SP-428 / PCT-1) ─────────────────────────────────────
// Every case here is a way a model answer could put a wrong row in the table.
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  PATTERN_CEILING, MAX_PATTERN_NAME_CHARS,
  parseGenerated, parseJudgeOne, patternIdentity, patternStrength, quoteLabels, type PatternQuote,
} from "./needPatterns.ts";

const qt = (id: string, site: string): PatternQuote =>
  ({ signalId: id, quote: "q", site, eventDate: null, brand: "spectrum", polarity: "not working" });
/** rubric v2: a pattern answer carries a polarity and a representative. */
const pat = (over: Record<string, unknown> = {}) =>
  ({ name: "a", polarity: "not working", quotes: ["q1"], representative: "q1", ...over });
const labels = (...qs: PatternQuote[]) => quoteLabels(qs);

Deno.test("SP-428: the four strengths come from the surviving quotes, not from the model", () => {
  const sites = (n: number, s: number) =>
    Array.from({ length: n }, (_, i) => ({ site: `site${i % s}` }));
  assertEquals(patternStrength(sites(9, 4)), "confirmed rule");
  assertEquals(patternStrength(sites(8, 3)), "confirmed rule");
  // 8 quotes but only 2 sites is NOT confirmed — both floors have to be met
  assertEquals(patternStrength(sites(8, 2)), "likely rule");
  assertEquals(patternStrength(sites(5, 2)), "likely rule");
  // SP-428's own numbers: 5+ from 2+ is 'likely rule', so 4 from 2 is not
  assertEquals(patternStrength(sites(4, 2)), "possible failure");
  assertEquals(patternStrength(sites(2, 1)), "possible failure");
  assertEquals(patternStrength(sites(1, 1)), "too thin");
  assertEquals(patternStrength([]), "too thin");
});

Deno.test("citation integrity: a label that was not in the input rejects the WHOLE answer", () => {
  const l = labels(qt("s1", "BBB"), qt("s2", "Trustpilot"));
  assertThrows(
    () => parseGenerated(JSON.stringify({ patterns: [pat({ quotes: ["q1", "q9"] })] }), l),
    Error, "label(s) that were not in its input",
  );
  // and the measured real failure: a mangled uuid is just another unknown label
  assertThrows(
    () => parseGenerated(JSON.stringify({ patterns: [pat({ quotes: ["a76c4a80-5b4d-9b68-f62e97d19115"], representative: "" })] }), l),
    Error, "label(s) that were not in its input",
  );
});

Deno.test("a label IS mapped back to the real signal id", () => {
  const l = labels(qt("sig-a", "BBB"), qt("sig-b", "Trustpilot"));
  const out = parseGenerated(JSON.stringify({ patterns: [pat({ quotes: ["q2", "q1"], representative: "q2" })] }), l);
  assertEquals(out.length, 1);
  assertEquals(out[0].signalIds, ["sig-b", "sig-a"]);
  assertEquals(out[0].representativeSignalId, "sig-b", "the generator's representative maps to its real id");
});

Deno.test("SP-469: the ceiling is enforced on the ANSWER, not only asked for", () => {
  const l = labels(qt("s1", "BBB"));
  const over = { patterns: Array.from({ length: PATTERN_CEILING + 1 }, () => pat({ representative: "" })) };
  assertThrows(() => parseGenerated(JSON.stringify(over), l), Error, `over the SP-469 ceiling of ${PATTERN_CEILING}`);

  const longName = "x".repeat(MAX_PATTERN_NAME_CHARS + 1);
  assertThrows(
    () => parseGenerated(JSON.stringify({ patterns: [pat({ name: longName })] }), l),
    Error, `over the cap of ${MAX_PATTERN_NAME_CHARS}`,
  );
  // exactly at the cap is allowed — the bound is inclusive, as the column constraint is
  assertEquals(parseGenerated(JSON.stringify({ patterns: [pat({ name: "x".repeat(MAX_PATTERN_NAME_CHARS) })] }), l).length, 1);
  // AT the ceiling is allowed; it is a ceiling, and the RUNNER records that it was reached
  assertEquals(parseGenerated(JSON.stringify({ patterns: Array.from({ length: PATTERN_CEILING }, () => pat({ representative: "" })) }), l).length, PATTERN_CEILING);
});

Deno.test("SP-470: a pattern must carry ONE of the three polarities", () => {
  const l = labels(qt("s1", "BBB"));
  for (const bad of ["", "positive", "NOT WORKING!", "unknown"]) {
    assertThrows(() => parseGenerated(JSON.stringify({ patterns: [pat({ polarity: bad })] }), l), Error, "carries polarity");
  }
  for (const good of ["working", "not working", "mixed"]) {
    assertEquals(parseGenerated(JSON.stringify({ patterns: [pat({ polarity: good })] }), l)[0].polarity, good);
  }
  // case and padding are forgiven; the value is not invented
  assertEquals(parseGenerated(JSON.stringify({ patterns: [pat({ polarity: " Working " })] }), l)[0].polarity, "working");
});

Deno.test("SP-475(c): a label cannot be the representative of two patterns in one answer", () => {
  const l = labels(qt("s1", "BBB"), qt("s2", "Trustpilot"));
  const out = parseGenerated(JSON.stringify({ patterns: [
    pat({ name: "first", quotes: ["q1", "q2"], representative: "q1" }),
    pat({ name: "second", quotes: ["q1", "q2"], representative: "q1" }),
  ] }), l);
  assertEquals(out[0].representativeSignalId, "s1");
  assertEquals(out[1].representativeSignalId, null, "the repeat is dropped to null; the runner then picks a free survivor");
});

Deno.test("a cut or malformed answer fails LOUDLY rather than being repaired", () => {
  const l = labels(qt("s1", "BBB"));
  assertThrows(() => parseGenerated("no json here", l), Error, "no JSON object");
  // this one DOES match the brace scan but is not valid JSON — a cut answer, which is the SP-F43 shape
  assertThrows(() => parseGenerated('{"patterns":[{"name":"a","polarity":"mixed","quotes":["q1",]}]}', l), Error, "unparseable JSON");
  // and one that never closes is caught by the scan instead, with the other message
  assertThrows(() => parseGenerated('{"patterns":[{"name":"a","quotes":["q1"', l), Error, "no JSON object");
  assertThrows(() => parseGenerated('{"ok":true}', l), Error, "no `patterns` array");
  assertThrows(() => parseGenerated(JSON.stringify({ patterns: [pat({ name: "  " })] }), l), Error, "no name");
  assertThrows(() => parseGenerated(JSON.stringify({ patterns: [{ name: "a", polarity: "mixed" }] }), l), Error, "cites no quotes array");
  assertThrows(() => parseGenerated(JSON.stringify({ patterns: [pat({ quotes: [] })] }), l), Error, "cites no quotes at all");
});

Deno.test("SP-494: `supports` is OURS — the judge's own not-stated list decides first", () => {
  const Q = "the app logs me out every single time I try to watch";
  // an EMPTY list plus a verbatim span is the only way through
  const ok = parseJudgeOne(JSON.stringify({ not_stated: [], states: "logs me out every single time", reason: "its own words" }), Q);
  assertEquals(ok.supports, true);
  assertEquals(ok.states, "logs me out every single time");
  assertEquals(ok.notStated, []);
  // a NON-EMPTY list is a no, whatever the span says
  const no = parseJudgeOne(JSON.stringify({ not_stated: ["on every use"], states: "logs me out every single time" }), Q);
  assertEquals(no.supports, false);
  assertEquals(no.notStated, ["on every use"]);
});

Deno.test("SP-494(1): a span that is not verbatim in the quote rejects the verdict", () => {
  const Q = "the app logs me out every single time I try to watch";
  const P = "The app logs the customer out on every use";
  // THE MEASURED FAILURE, in miniature: the judge paraphrases the quote and asserts support
  const para = parseJudgeOne(JSON.stringify({ not_stated: [], states: "the customer is logged out repeatedly" }), Q);
  assertEquals(para.supports, false);
  assertEquals(para.rejected, "span_not_verbatim");
  assertEquals(para.states, "the customer is logged out repeatedly", "the bad span is still returned, so it can be stored and seen");
  // an empty list with NO span is also a no
  const bare = parseJudgeOne(JSON.stringify({ not_stated: [], states: "" }), Q);
  assertEquals(bare.supports, false);
  assertEquals(bare.rejected, "span_missing");
  // whitespace and case are forgiven, as the E4 predicate forgives them
  assertEquals(parseJudgeOne(JSON.stringify({ not_stated: [], states: "  LOGS   me OUT every single time " }), Q).supports, true);
});

Deno.test("SP-494: a missing not_stated list is 'every part unstated', not assent", () => {
  const Q = "the app logs me out";
  for (const bad of ['{"states":"logs me out"}', '{"not_stated":"none","states":"logs me out"}', "{}"]) {
    const v = parseJudgeOne(bad, Q);
    assertEquals(v.supports, false, `${bad} must not read as assent`);
    assertEquals(v.notStated.length > 0, true, "and it must say why");
  }
  assertThrows(() => parseJudgeOne("the pattern looks fine to me", Q), Error, "no JSON object");
});

Deno.test("SP-504: the keyword flag is gone, and no verdict ever depended on it", () => {
  // It fired on about two thirds of calls over two full runs (125/189 and 74/123) and never vetoed
  // anything, so removing it changes no stored row. This pins its absence: the module must not export
  // it again without a ruling, and JudgeVerdict must not carry it.
  const src = Deno.readTextFileSync(new URL("./needPatterns.ts", import.meta.url));
  assertEquals(/export function keywordOverlap/.test(src), false, "keywordOverlap must not be exported");
  assertEquals(/keywordFlagged/.test(src), false, "JudgeVerdict must not carry a keyword flag");
  const v = parseJudgeOne(JSON.stringify({ not_stated: [], states: "logs me out" }), "the app logs me out");
  assertEquals(Object.keys(v).sort(), ["notStated", "reason", "rejected", "states", "supports"]);
});

Deno.test("PCT-1: a pattern's identity is its need, its rubric version and its normalised name", async () => {
  const a = await patternIdentity("need-1", "The app logs you out");
  const b = await patternIdentity("need-1", "  the   APP logs you out  ");
  const c = await patternIdentity("need-2", "The app logs you out");
  const d = await patternIdentity("need-1", "The app logs you out again");
  assertEquals(a, b, "case and whitespace do not change the identity");
  assertEquals(a === c, false, "the same sentence under a different need is a different pattern");
  assertEquals(a === d, false, "a different sentence is a different pattern");
  assertEquals(a.length, 64);
});


