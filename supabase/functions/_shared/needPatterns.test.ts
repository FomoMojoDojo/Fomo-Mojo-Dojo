// ── The pattern layer's pure parts (SP-463 / SP-428 / PCT-1) ─────────────────────────────────────
// Every case here is a way a model answer could put a wrong row in the table.
import { assertEquals, assertRejects, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  MAX_PATTERNS_PER_NEED, MAX_PATTERN_NAME_CHARS,
  parseGenerated, parseJudged, patternIdentity, patternStrength, quoteLabels, type PatternQuote,
} from "./needPatterns.ts";

const qt = (id: string, site: string): PatternQuote =>
  ({ signalId: id, quote: "q", site, eventDate: null, brand: "spectrum" });
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
    () => parseGenerated('{"patterns":[{"name":"a","quotes":["q1","q9"]}]}', l),
    Error, "label(s) that were not in its input",
  );
  // and the measured real failure: a mangled uuid is just another unknown label
  assertThrows(
    () => parseGenerated('{"patterns":[{"name":"a","quotes":["a76c4a80-5b4d-9b68-f62e97d19115"]}]}', l),
    Error, "label(s) that were not in its input",
  );
});

Deno.test("a label IS mapped back to the real signal id", () => {
  const l = labels(qt("sig-a", "BBB"), qt("sig-b", "Trustpilot"));
  const out = parseGenerated('{"patterns":[{"name":"a","quotes":["q2","q1"]}]}', l);
  assertEquals(out.length, 1);
  assertEquals(out[0].signalIds, ["sig-b", "sig-a"]);
});

Deno.test("SP-463: the generator's caps are enforced on the ANSWER, not only asked for", () => {
  const l = labels(qt("s1", "BBB"));
  const over = { patterns: Array.from({ length: MAX_PATTERNS_PER_NEED + 1 }, () => ({ name: "n", quotes: ["q1"] })) };
  assertThrows(() => parseGenerated(JSON.stringify(over), l), Error, `over the SP-463 cap of ${MAX_PATTERNS_PER_NEED}`);

  const longName = "x".repeat(MAX_PATTERN_NAME_CHARS + 1);
  assertThrows(
    () => parseGenerated(JSON.stringify({ patterns: [{ name: longName, quotes: ["q1"] }] }), l),
    Error, `over the SP-463 cap of ${MAX_PATTERN_NAME_CHARS}`,
  );
  // exactly at the cap is allowed — the bound is inclusive, as the column constraint is
  assertEquals(parseGenerated(JSON.stringify({ patterns: [{ name: "x".repeat(MAX_PATTERN_NAME_CHARS), quotes: ["q1"] }] }), l).length, 1);
});

Deno.test("a cut or malformed answer fails LOUDLY rather than being repaired", () => {
  const l = labels(qt("s1", "BBB"));
  assertThrows(() => parseGenerated("no json here", l), Error, "no JSON object");
  // this one DOES match the brace scan but is not valid JSON — a cut answer, which is the SP-F43 shape
  assertThrows(() => parseGenerated('{"patterns":[{"name":"a","quotes":["q1",]}]}', l), Error, "unparseable JSON");
  // and one that never closes is caught by the scan instead, with the other message
  assertThrows(() => parseGenerated('{"patterns":[{"name":"a","quotes":["q1"', l), Error, "no JSON object");
  assertThrows(() => parseGenerated('{"ok":true}', l), Error, "no `patterns` array");
  assertThrows(() => parseGenerated('{"patterns":[{"name":"  ","quotes":["q1"]}]}', l), Error, "no name");
  assertThrows(() => parseGenerated('{"patterns":[{"name":"a"}]}', l), Error, "cites no quotes array");
});

Deno.test("the judge can only ever take evidence away", () => {
  const cited = labels(qt("s1", "BBB"), qt("s2", "Trustpilot"));
  // it names a label outside the cited set: dropped, never added
  const v = parseJudged('{"supporting":["q1","q7"],"rejected":["q2"],"reason":"only q1 says it"}', cited);
  assertEquals(v.supporting, ["s1"]);
  assertEquals(v.rejected, ["s2"]);
  assertEquals(v.reason, "only q1 says it");
  // a label in BOTH lists counts as supporting once and is not also rejected
  assertEquals(parseJudged('{"supporting":["q1"],"rejected":["q1","q2"]}', cited).rejected, ["s2"]);
  // keeping nothing is a legitimate answer — the caller stores no pattern for it (SP-463)
  assertEquals(parseJudged('{"supporting":[],"rejected":["q1","q2"]}', cited).supporting, []);
});

Deno.test("PCT-1: a pattern's identity is its need plus its normalised name", async () => {
  const a = await patternIdentity("need-1", "The app logs you out");
  const b = await patternIdentity("need-1", "  the   APP logs you out  ");
  const c = await patternIdentity("need-2", "The app logs you out");
  const d = await patternIdentity("need-1", "The app logs you out again");
  assertEquals(a, b, "case and whitespace do not change the identity");
  assertEquals(a === c, false, "the same sentence under a different need is a different pattern");
  assertEquals(a === d, false, "a different sentence is a different pattern");
  assertEquals(a.length, 64);
});

Deno.test("a judge answer with no JSON is an error, not an empty verdict", async () => {
  await assertRejects(
    () => Promise.resolve().then(() => parseJudged("the pattern looks fine to me", labels(qt("s1", "BBB")))),
    Error, "no JSON object",
  );
});
