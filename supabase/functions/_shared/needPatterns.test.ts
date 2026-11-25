// ── The pattern layer's pure parts (SP-463 / SP-428 / SP-502 / PCT-1) ────────────────────────────
// Every case here is a way a model answer could put a wrong row in the table.
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  PATTERN_CEILING, MAX_PATTERN_NAME_CHARS, MAX_PARTS_PER_PATTERN, MAX_PART_CHARS,
  CONJUNCTION_IN_PART, LEFT_OVER_REASK, REASK_GUIDANCE, GeneratorRefusal, type RefusalKind,
  accountForQuotes, buildClaimReask, buildJudgeSpanReask, mergeSpanReask, parseGenerated, parseGeneratedLenient, parseGeneratedPass, parseJudgeOne, parseReaskedClaim,
  fillCeiling, polarityRefusal, decompositionTrigger, buildDecompositionReask, type ProposedPattern,
  applyCeilingPerPass, callJudgeWithEmptyRetry, isEmptyAnswerError, armColumnIsIdentical,
  JUDGE_NUM_PREDICT, JUDGE_NUM_PREDICT_RETRY, PATTERN_JUDGE_THINK,
  JUDGE_SYSTEM, JUDGE_SYSTEM_PRE545, JUDGE_SYSTEM_TIGHTENED, GENERATOR_SYSTEM, GENERATOR_SYSTEM_NEW, GENERATOR_SYSTEM_NEW547,
  partsWithConjunction, claimOverlap, nearSynonymClaims, sharedPartClaims, NEAR_SYNONYM_THRESHOLD,
  patternIdentity, patternStrength, quoteLabels, spanReaskOrdinals,
  type JudgeVerdict, type PatternQuote,
  belongsToClaimKey, belongsVerdictEffect, voidedNominationLine, supportingByOrigin, belongsToSummaryLine, resolveBelongsToAfterJudging, splitDeferredCitations, NEVER_JUDGED,
  type BelongsToEntry, type ClaimFate,
  belongsFieldOf, claimDropClass, claimOutcome, pairBelongsFields,
  hoistNestedLeftOver, rawClaimsWritten, completeAccountFromReask, claimAccountByAnswer, type ClaimOutcome, type GeneratedPass,
  GENERATOR_SYSTEM as LIVE_GENERATOR_SYSTEM, GENERATOR_SYSTEM_NEW as GS_NEW_17, GENERATOR_SYSTEM_NEW547 as GS_547_17, GENERATOR_SYSTEM_OLD as GS_OLD_17, GENERATOR_SYSTEM_ONEPART, GENERATOR_RUBRIC_TEXT_ONEPART,
  JUDGE_SYSTEM as LIVE_JUDGE_SYSTEM, ONEPART_GEN_LIMITS, DEFAULT_GEN_LIMITS, ONEPART_CEILING, reaskGuidance, REASK_GUIDANCE as GUIDANCE_17,
  conjunctionReaskOutcome, partConjunctionWhy, PART_CONJUNCTION_GUIDANCE, CONJUNCTION_IN_PART as CONJ_17,
} from "./needPatterns.ts";
import { crypto as stdCrypto17 } from "jsr:@std/crypto@1.0.3/crypto";
import { encodeHex as encodeHex17 } from "jsr:@std/encoding@1.0.5/hex";

/** The kind a refusal carries, or "" when it was not a GeneratorRefusal at all. */
function refusalKind(fn: () => unknown): RefusalKind | "" {
  try { fn(); return ""; } catch (e) { return e instanceof GeneratorRefusal ? e.kind : ""; }
}

const qt = (id: string, site: string): PatternQuote =>
  ({ signalId: id, quote: "q", site, eventDate: null, brand: "spectrum", polarity: "not working" });
/** rubric v3: a pattern answer is a CLAIM plus 1–3 predicate parts, with a polarity and a representative. */
const pat = (over: Record<string, unknown> = {}) =>
  ({ claim: "a", parts: ["the outage lasts for hours"], polarity: "not working", quotes: ["q1"], representative: "q1", ...over });
const labels = (...qs: PatternQuote[]) => quoteLabels(qs);

/** A judge answer in v3's shape: one row per part, each with its own span. */
const judged = (rows: Array<{ ordinal: number; states: boolean; span?: string; reason?: string }>, over: Record<string, unknown> = {}) =>
  JSON.stringify({ parts: rows, belongs_to_this_need: true, reason: "r", ...over });

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
  // SP-537(a): distinct claims, so this case tests the CEILING and not the duplicate-claim refusal.
  const over = { patterns: Array.from({ length: PATTERN_CEILING + 1 }, (_, i) => pat({ claim: `claim ${i}`, representative: "" })) };
  assertThrows(() => parseGenerated(JSON.stringify(over), l), Error, `over the SP-469 ceiling of ${PATTERN_CEILING}`);

  const longName = "x".repeat(MAX_PATTERN_NAME_CHARS + 1);
  assertThrows(
    () => parseGenerated(JSON.stringify({ patterns: [pat({ claim: longName })] }), l),
    // SP-546: the message now MEASURES the failure, because the per-claim re-ask carries it verbatim
    Error, `the claim is ${MAX_PATTERN_NAME_CHARS + 1} characters; the limit is ${MAX_PATTERN_NAME_CHARS}`,
  );
  // exactly at the cap is allowed — the bound is inclusive, as the column constraint is
  assertEquals(parseGenerated(JSON.stringify({ patterns: [pat({ claim: "x".repeat(MAX_PATTERN_NAME_CHARS) })] }), l).length, 1);
  // AT the ceiling is allowed; it is a ceiling, and the RUNNER records that it was reached
  assertEquals(parseGenerated(JSON.stringify({ patterns: Array.from({ length: PATTERN_CEILING }, (_, i) => pat({ claim: `claim ${i}`, representative: "" })) }), l).length, PATTERN_CEILING);
  // and SP-537(a) bites UNDER the ceiling: twelve copies of one claim is not twelve patterns
  assertEquals(refusalKind(() => parseGenerated(JSON.stringify({ patterns: Array.from({ length: PATTERN_CEILING }, () => pat({ representative: "" })) }), l)), "duplicate_claim");
});

// ── v3: the PARTS are what the judge rules on, so the bounds on them are the load-bearing ones ──
Deno.test("SP-502: a pattern carries 1 to 3 parts, each a short predicate", () => {
  const l = labels(qt("s1", "BBB"));
  const parse = (over: Record<string, unknown>) => parseGenerated(JSON.stringify({ patterns: [pat(over)] }), l);

  assertThrows(() => parse({ parts: [] }), Error, "returned no parts");
  assertThrows(() => parse({ parts: "the outage lasts" }), Error, "returned no parts array");
  assertThrows(() => parse({ parts: undefined }), Error, "returned no parts array");
  assertThrows(() => parse({ parts: ["a", "b", "c", "d"] }), Error, `over the SP-502 cap of ${MAX_PARTS_PER_PATTERN}`);
  assertThrows(() => parse({ parts: ["x".repeat(MAX_PART_CHARS + 1)] }), Error, `part 1 is ${MAX_PART_CHARS + 1} characters; the limit is ${MAX_PART_CHARS}`);
  // exactly at both caps is allowed, as the column constraints allow them
  assertEquals(parse({ parts: ["x".repeat(MAX_PART_CHARS), "b", "c"] })[0].parts.length, 3);
  // whitespace is collapsed and an exact repeat is ONE part, not two
  assertEquals(parse({ parts: ["the   outage  lasts", "the outage lasts"] })[0].parts, ["the outage lasts"]);
});

Deno.test("SP-525: the subject rule is GONE — every one of its old refusals now parses", () => {
  const l = labels(qt("s1", "BBB"));
  // These six were the SP-501 test's refusal set. Under SP-525 each must pass: on the live run the
  // same rule refused every part of N14 and N15 and emitted nothing for either need.
  for (const was of ["Customers are charged twice", "the customers wait on hold", "Users cannot cancel",
                     "They hang up", "we are billed in full", "People lose service"]) {
    assertEquals(parseGenerated(JSON.stringify({ patterns: [pat({ parts: [was] })] }), l)[0].parts, [was]);
  }
  // and the predicates that merely CONTAIN those words keep working, as they always did
  for (const ok of ["the final month is billed in full even when cancelled mid-cycle",
                    "support tells customers to call a different number",
                    "service is restored only after people call twice"]) {
    assertEquals(parseGenerated(JSON.stringify({ patterns: [pat({ parts: [ok] })] }), l)[0].parts, [ok]);
  }
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
    pat({ claim: "first", quotes: ["q1", "q2"], representative: "q1" }),
    pat({ claim: "second", quotes: ["q1", "q2"], representative: "q1" }),
  ] }), l);
  assertEquals(out[0].representativeSignalId, "s1");
  assertEquals(out[1].representativeSignalId, null, "the repeat is dropped to null; the runner then picks a free survivor");
});

Deno.test("a cut or malformed answer fails LOUDLY rather than being repaired", () => {
  const l = labels(qt("s1", "BBB"));
  assertThrows(() => parseGenerated("no json here", l), Error, "no JSON object");
  // this one DOES match the brace scan but is not valid JSON — a cut answer, which is the SP-F43 shape
  assertThrows(() => parseGenerated('{"patterns":[{"claim":"a","polarity":"mixed","quotes":["q1",]}]}', l), Error, "unparseable JSON");
  // and one that never closes is caught by the scan instead, with the other message
  assertThrows(() => parseGenerated('{"patterns":[{"claim":"a","quotes":["q1"', l), Error, "no JSON object");
  assertThrows(() => parseGenerated('{"ok":true}', l), Error, "no `patterns` array");
  assertThrows(() => parseGenerated(JSON.stringify({ patterns: [pat({ claim: "  " })] }), l), Error, "no claim");
  assertThrows(() => parseGenerated(JSON.stringify({ patterns: [{ claim: "a", parts: ["p"], polarity: "mixed" }] }), l), Error, "cites no quotes array");
  assertThrows(() => parseGenerated(JSON.stringify({ patterns: [pat({ quotes: [] })] }), l), Error, "cites no quotes at all");
  // v2's spelling is still read rather than refused on a key name; the BOUNDS are what gate an answer
  assertEquals(parseGenerated(JSON.stringify({ patterns: [{ name: "a", parts: ["p"], polarity: "mixed", quotes: ["q1"] }] }), l)[0].name, "a");
});

// ── the judge: one quote, a verdict per part, and `supports` is OUR arithmetic ───────────────────
Deno.test("SP-502: the quote supports the pattern only when EVERY part states", () => {
  const Q = "the app logs me out every single time and nobody at support could fix it";
  const P = ["the app logs the customer out", "support does not fix it"];

  const both = parseJudgeOne(judged([
    { ordinal: 1, states: true, span: "logs me out every single time" },
    { ordinal: 2, states: true, span: "nobody at support could fix it" },
  ]), Q, P);
  assertEquals(both.supports, true);
  assertEquals(both.notStated, []);
  assertEquals(both.parts.map((p) => p.states), [true, true]);

  // ONE part short is a no, and the report says WHICH part
  const one = parseJudgeOne(judged([
    { ordinal: 1, states: true, span: "logs me out every single time" },
    { ordinal: 2, states: false, reason: "says nothing about support" },
  ]), Q, P);
  assertEquals(one.supports, false);
  assertEquals(one.notStated, ["support does not fix it"]);
  assertEquals(one.parts[0].states, true, "the part that DID state is still recorded as stated");
});

Deno.test("SP-494(1): a part's span that is not verbatim in the quote cannot carry that part", () => {
  const Q = "the app logs me out every single time I try to watch";
  const P = ["the app logs the customer out"];
  // THE MEASURED FAILURE, in miniature: the judge paraphrases the quote and asserts support
  const para = parseJudgeOne(judged([{ ordinal: 1, states: true, span: "the customer is logged out repeatedly" }]), Q, P);
  assertEquals(para.supports, false);
  assertEquals(para.parts[0].rejected, "span_not_verbatim");
  assertEquals(para.parts[0].span, "the customer is logged out repeatedly", "the bad span is still returned, so it can be stored and seen");
  // states:true with NO span is also a no
  const bare = parseJudgeOne(judged([{ ordinal: 1, states: true, span: "" }]), Q, P);
  assertEquals(bare.supports, false);
  assertEquals(bare.parts[0].rejected, "span_missing");
  // whitespace and case are forgiven, as the E4 predicate forgives them
  assertEquals(parseJudgeOne(judged([{ ordinal: 1, states: true, span: "  LOGS   me OUT every single time " }]), Q, P).supports, true);
});

Deno.test("SP-494: an UNANSWERED part is 'not shown', never assent", () => {
  const Q = "the app logs me out";
  const P = ["the app logs the customer out", "support does not fix it"];
  // part 2 missing from the answer entirely
  const half = parseJudgeOne(judged([{ ordinal: 1, states: true, span: "logs me out" }]), Q, P);
  assertEquals(half.supports, false);
  assertEquals(half.notStated, ["support does not fix it"]);
  // an out-of-range ordinal is not a verdict on any part
  const bogus = parseJudgeOne(judged([{ ordinal: 7, states: true, span: "logs me out" }]), Q, P);
  assertEquals(bogus.supports, false);
  assertEquals(bogus.notStated.length, 2);
  // no parts array at all, and the empty object
  for (const bad of ['{"belongs_to_this_need":true}', '{"parts":"yes"}', "{}"]) {
    const v = parseJudgeOne(bad, Q, P);
    assertEquals(v.supports, false, `${bad} must not read as assent`);
    assertEquals(v.notStated.length, 2, "and it must say which parts");
  }
  assertThrows(() => parseJudgeOne("the pattern looks fine to me", Q, P), Error, "no JSON object");
});

// SP-566 (2026-11-23) REPLACES the test that stood here. It pinned the opposite — "an absent or
// non-boolean answer is NOT read as a rejection" — which is fail-OPEN, under a comment in the module
// that said fail-closed. The ruling: only an explicit `true` counts as belonging.
Deno.test("SP-566: belongs_to_this_need fails CLOSED — only an explicit true belongs", () => {
  const Q = "the app logs me out";
  const P = ["the app logs the customer out"];
  const rows = [{ ordinal: 1, states: true, span: "logs me out" }];
  // true, and only true
  assertEquals(parseJudgeOne(judged(rows, { belongs_to_this_need: true }), Q, P).belongsToNeed, true);
  // false
  assertEquals(parseJudgeOne(judged(rows, { belongs_to_this_need: false }), Q, P).belongsToNeed, false);
  // missing — the key is not in the answer at all
  assertEquals(parseJudgeOne(JSON.stringify({ parts: rows, reason: "r" }), Q, P).belongsToNeed, false);
  // null
  assertEquals(parseJudgeOne(judged(rows, { belongs_to_this_need: null }), Q, P).belongsToNeed, false);
  // a string — "true" is not true, and neither is any other non-boolean
  assertEquals(parseJudgeOne(judged(rows, { belongs_to_this_need: "true" }), Q, P).belongsToNeed, false);
  assertEquals(parseJudgeOne(judged(rows, { belongs_to_this_need: 1 }), Q, P).belongsToNeed, false);
  // and the part verdicts are untouched by it: the quote still STATES the part, it is the claim that
  // is not shown to be this need's (which is what SP-523 lists)
  assertEquals(parseJudgeOne(JSON.stringify({ parts: rows, reason: "r" }), Q, P).supports, true);
});

Deno.test("SP-504 / SP-506: the keyword flag is gone, and no verdict ever depended on it", () => {
  // It fired on about two thirds of calls over two full runs (125/189 and 74/123) and never vetoed
  // anything, so removing it changed no stored row. This pins its absence: the module must not export
  // it again without a ruling, and JudgeVerdict must not carry it.
  const src = Deno.readTextFileSync(new URL("./needPatterns.ts", import.meta.url));
  assertEquals(/export function keywordOverlap/.test(src), false, "keywordOverlap must not be exported");
  assertEquals(/keywordFlagged/.test(src), false, "JudgeVerdict must not carry a keyword flag");
  const v = parseJudgeOne(judged([{ ordinal: 1, states: true, span: "logs me out" }]), "the app logs me out", ["the app logs the customer out"]);
  assertEquals(Object.keys(v).sort(), ["belongsField", "belongsToNeed", "notStated", "parts", "reason", "supports"]);   // SP-609 added belongsField
});

Deno.test("PCT-1: a pattern's identity is its need, its rubric version, its claim AND its parts", async () => {
  const a = await patternIdentity("need-1", "The app logs you out", ["it logs you out", "support does not fix it"]);
  const b = await patternIdentity("need-1", "  the   APP logs you out  ", ["IT  logs you out", "support does not fix it"]);
  const c = await patternIdentity("need-2", "The app logs you out", ["it logs you out", "support does not fix it"]);
  const d = await patternIdentity("need-1", "The app logs you out again", ["it logs you out", "support does not fix it"]);
  // SP-509: the PARTS are in the identity, so the same claim with different predicates is a different
  // pattern — and the runner's exact-duplicate collapse therefore only merges what is truly identical.
  const e = await patternIdentity("need-1", "The app logs you out", ["it logs you out"]);
  // but the generator REORDERING its own parts is not a new pattern
  const f = await patternIdentity("need-1", "The app logs you out", ["support does not fix it", "it logs you out"]);
  assertEquals(a, b, "case and whitespace do not change the identity");
  assertEquals(a === c, false, "the same sentence under a different need is a different pattern");
  assertEquals(a === d, false, "a different sentence is a different pattern");
  assertEquals(a === e, false, "the same claim with different parts is a different pattern");
  assertEquals(a, f, "the parts are sorted, so their order is not part of the identity");
  assertEquals(a.length, 64);
});

// ── SP-525: THE GENERIC-SUBJECT TEST IS GONE, and these parts must now PASS ─────────────────────
Deno.test("SP-525: a part opening with a generic customer subject is ACCEPTED", () => {
  // THE MEASURED COST OF THE OLD RULE. These are verbatim what the generator wrote for N14 and N15 on
  // 2026-11-21. Each one was refused, each need was refused with it, and both produced ZERO patterns —
  // 58 of 156 counted quotes, including the reference's single strongest finding. They must parse now.
  const live = ["customer is charged for full month", "Customers are charged for full month despite early",
    "Customers are charged for services they did not request", "People calling get no ring tone or busy signal"];
  const l = labels(qt("s1", "BBB"));
  for (const part of live) {
    assertEquals(parseGenerated(JSON.stringify({ patterns: [pat({ parts: [part] })] }), l)[0].parts, [part]);
  }
});

Deno.test("SP-525: the company-side subjects the generator writes are STILL accepted", () => {
  // These ten are verbatim what N13 produced. They passed under SP-515 and must keep passing — the
  // removal must not have moved the behaviour in the other direction.
  const live = ["representatives are unhelpful", "representatives are dismissive", "inconsistent information provided",
    "representatives hang up on customers", "representatives engage in upselling", "representatives do not resolve issues",
    "multiple calls required to resolve issue", "inadequate compensation offered", "agents are polite", "agents are helpful",
    "customer service is courteous", "customer support closes the ticket without a fix"];
  const l = labels(qt("s1", "BBB"));
  for (const part of live) {
    assertEquals(parseGenerated(JSON.stringify({ patterns: [pat({ parts: [part] })] }), l)[0].parts, [part]);
  }
});

Deno.test("SP-525: the bounds that REMAIN still refuse — the removal is one rule, not the gate", () => {
  // A part is still bounded by length and count, and the compound check still flags. Removing the
  // subject test must not have opened the others.
  const l = labels(qt("s1", "BBB"));
  const g = (over: Record<string, unknown>) => () => parseGenerated(JSON.stringify({ patterns: [pat(over)] }), l);
  assertEquals(refusalKind(g({ parts: ["Customers " + "x".repeat(MAX_PART_CHARS) ] })), "part_length");
  assertEquals(refusalKind(g({ parts: ["Customers are charged", "b", "c", "d"] })), "parts_count");
  // SP-536: a part containing "and" is LISTED for review and not refused, dropped or re-asked
  assertEquals(partsWithConjunction(parseGenerated(JSON.stringify({
    patterns: [pat({ parts: ["Customers are charged twice and not refunded"] })] }), l)).length, 1);
});

// ── SP-515(2): every refusal carries its KIND, and every kind has guidance ───────────────────────
Deno.test("SP-515: each refusal kind is distinguishable, so the re-ask can say what to fix", () => {
  const l = labels(qt("s1", "BBB"));
  const g = (over: Record<string, unknown>) => () => parseGenerated(JSON.stringify({ patterns: [pat(over)] }), l);
  assertEquals(refusalKind(g({ claim: "  " })), "claim_missing");
  assertEquals(refusalKind(g({ claim: "x".repeat(MAX_PATTERN_NAME_CHARS + 1) })), "claim_length");
  assertEquals(refusalKind(g({ parts: undefined })), "parts_missing");
  assertEquals(refusalKind(g({ parts: [] })), "parts_missing");
  assertEquals(refusalKind(g({ parts: ["a", "b", "c", "d"] })), "parts_count");
  assertEquals(refusalKind(g({ parts: ["x".repeat(MAX_PART_CHARS + 1)] })), "part_length");
  assertEquals(refusalKind(g({ polarity: "positive" })), "polarity");
  assertEquals(refusalKind(g({ quotes: ["q9"] })), "citation");
  assertEquals(refusalKind(g({ quotes: [] })), "no_quotes");
  assertEquals(refusalKind(() => parseGenerated("not json", l)), "schema");
  assertEquals(refusalKind(() => parseGenerated(JSON.stringify({ patterns: Array.from({ length: PATTERN_CEILING + 1 }, () => pat()) }), l)), "ceiling");
});

Deno.test("SP-515: every refusal kind has its OWN guidance, and none of it is the old blanket advice", () => {
  const kinds: RefusalKind[] = ["claim_missing", "claim_length", "parts_missing", "parts_count", "part_length",
    "polarity", "citation", "no_quotes", "ceiling", "schema", "duplicate_claim"];
  for (const k of kinds) {
    const text = REASK_GUIDANCE[k];
    assertEquals(typeof text === "string" && text.length > 10, true, `${k} needs guidance`);
  }
  // THE BUG this table exists for: a refusal answered with the wrong advice returns the identical
  // part. (The subject refusal that proved it is gone under SP-525; the rule it taught is not.)
  assertEquals(/shorten/i.test(REASK_GUIDANCE.claim_length), true);
  assertEquals(/merge/i.test(REASK_GUIDANCE.duplicate_claim), true);
  // every kind's guidance is distinct — a shared string is the blanket advice coming back
  assertEquals(new Set(kinds.map((k) => REASK_GUIDANCE[k])).size, kinds.length);
});

// ── SP-536: the conjunction list REPORTS and never gates ─────────────────────────────────────────
Deno.test("SP-536: a part containing and/or is LISTED, never refused, dropped or re-asked", () => {
  const l = labels(qt("s1", "BBB"));
  const made = parseGenerated(JSON.stringify({ patterns: [pat({ parts: ["is courteous and helpful"] })] }), l);
  // it PARSES unchanged — SP-536 removed the gate, so nothing is lost and no re-ask is owed
  assertEquals(made[0].parts, ["is courteous and helpful"]);
  const listed = partsWithConjunction(made);
  assertEquals(listed.length, 1);
  assertEquals(listed[0].ordinal, 1);
  assertEquals(listed[0].part, "is courteous and helpful");

  for (const conj of ["is courteous and helpful", "hangs up or transfers the call", "is billed in full AND not prorated"]) {
    assertEquals(CONJUNCTION_IN_PART.test(conj), true, `must be listed: ${conj}`);
  }
  // a word that merely CONTAINS "and"/"or" is not listed
  for (const single of ["is billed in full", "the standard rate applies", "no refund is offered",
                        "the order is cancelled", "andover branch closes", "the band is throttled"]) {
    assertEquals(CONJUNCTION_IN_PART.test(single), false, `must not be listed: ${single}`);
  }
  assertEquals(partsWithConjunction([]), []);
  // SP-536's measured reason: five of the seven it fired on were SINGLE predicates whose wording
  // contains "or". They are listed here and nothing happens to them.
  const falsePositives = ["Customers are charged for services they did not request or use.",
    "No proration for unused days or partial months."];
  for (const fp of falsePositives) assertEquals(CONJUNCTION_IN_PART.test(fp), true, fp);
  // and the gate is GONE, not renamed: a refusal kind for it no longer exists
  assertEquals(Object.hasOwn(REASK_GUIDANCE, "compound_part"), false);
});

// ── SP-537(a): two patterns in ONE answer may not share a claim ──────────────────────────────────
Deno.test("SP-537(a): a duplicate claim in one answer is refused", () => {
  const l = labels(qt("s1", "BBB"), qt("s2", "CCC"));
  const two = (a: string, b: string) => () => parseGenerated(JSON.stringify({
    patterns: [pat({ claim: a, parts: ["is charged in full"], quotes: ["q1"] }),
               pat({ claim: b, parts: ["is not prorated"], quotes: ["q2"], representative: "q2" })],
  }), l);
  // THE MEASURED CASE: run 2's N15 wrote one claim twice with one part each
  assertEquals(refusalKind(two("Unexpected charges appear on bills", "Unexpected charges appear on bills")), "duplicate_claim");
  // normalised for CASE and WHITESPACE, so a re-cased or re-spaced retype is the same claim
  assertEquals(refusalKind(two("Bills are not prorated", "bills   are not  PRORATED")), "duplicate_claim");
  // two genuinely different claims are fine
  assertEquals(refusalKind(two("Bills are not prorated", "Equipment is billed after return")), "");
  // ONE pattern can never trip it
  assertEquals(refusalKind(() => parseGenerated(JSON.stringify({ patterns: [pat()] }), l)), "");
});

// ── SP-535: THE ACCOUNTING — every pass quote is cited or left over, once ────────────────────────
Deno.test("SP-535: every quote in the pass is cited or left over, none missing, none twice", () => {
  const l = labels(qt("s1", "AAA"), qt("s2", "BBB"), qt("s3", "CCC"));
  const body = (quotes: string[], leftOver: unknown) => JSON.stringify({
    patterns: [pat({ parts: ["is charged in full"], quotes, representative: quotes[0] })],
    left_over: leftOver,
  });

  // (1) fully accounted: q1 cited, q2 and q3 left over with reasons
  let pass = parseGeneratedPass(body(["q1"], [{ quote: "q2", why: "about billing, not this need" }, { quote: "q3", why: "a single incident" }]), l);
  assertEquals(pass.leftOver.map((x) => x.label), ["q2", "q3"]);
  let acc = accountForQuotes(l, pass.patterns, pass.leftOver);
  assertEquals([acc.missing, acc.both, acc.duplicatedLeftOver, acc.noReason], [[], [], [], []]);
  assertEquals([acc.cited, acc.accounted], [1, 3]);

  // (2) NONE MISSING: a quote in neither list is reported — this is run 2's N15, 17 of 41 unassigned
  pass = parseGeneratedPass(body(["q1"], [{ quote: "q2", why: "off-need" }]), l);
  acc = accountForQuotes(l, pass.patterns, pass.leftOver);
  assertEquals(acc.missing, ["q3"]);
  assertEquals(acc.accounted, 2);

  // (3) NONE TWICE: cited AND left over is a contradiction, and is reported
  pass = parseGeneratedPass(body(["q1", "q3"], [{ quote: "q1", why: "cannot place" }, { quote: "q2", why: "off-need" }]), l);
  acc = accountForQuotes(l, pass.patterns, pass.leftOver);
  assertEquals([acc.missing, acc.both], [[], ["q1"]]);

  // (4) NONE TWICE: the same label listed twice in left_over is reported
  pass = parseGeneratedPass(body(["q1"], [{ quote: "q2", why: "a" }, { quote: "q2", why: "b" }, { quote: "q3", why: "c" }]), l);
  acc = accountForQuotes(l, pass.patterns, pass.leftOver);
  assertEquals([acc.duplicatedLeftOver, acc.missing], [["q2"], []]);

  // (5) a left-over entry with NO clause is reported, not silently accepted — SP-535 asks for a reason
  pass = parseGeneratedPass(body(["q1"], [{ quote: "q2", why: "   " }, { quote: "q3", why: "off-need" }]), l);
  acc = accountForQuotes(l, pass.patterns, pass.leftOver);
  assertEquals([acc.noReason, acc.missing], [["q2"], []]);

  // (6) a FABRICATED left-over label is refused, exactly as a fabricated citation is
  assertEquals(refusalKind(() => parseGeneratedPass(body(["q1"], [{ quote: "q9", why: "x" }]), l)), "citation");

  // (7) no `left_over` key at all: every uncited quote is reported missing, never assumed accounted
  pass = parseGeneratedPass(JSON.stringify({ patterns: [pat({ parts: ["x"], quotes: ["q1"] })] }), l);
  assertEquals(pass.leftOver, []);
  acc = accountForQuotes(l, pass.patterns, pass.leftOver);
  assertEquals([acc.missing, acc.accounted], [["q2", "q3"], 1]);

  // (8) a quote cited under TWO claims is legitimate and is NOT reported
  const twoClaims = JSON.stringify({
    patterns: [pat({ claim: "A claim", parts: ["x"], quotes: ["q1", "q2"], representative: "q1" }),
               pat({ claim: "B claim", parts: ["y"], quotes: ["q2", "q3"], representative: "q2" })],
    left_over: [],
  });
  pass = parseGeneratedPass(twoClaims, l);
  acc = accountForQuotes(l, pass.patterns, pass.leftOver);
  assertEquals([acc.missing, acc.both, acc.duplicatedLeftOver], [[], [], []]);
  assertEquals(acc.accounted, 3);

  // the re-ask text exists and asks for the account, not for a re-write of the claims
  assertEquals(/account/i.test(LEFT_OVER_REASK) && /left_over/.test(LEFT_OVER_REASK), true);
  assertEquals(/exactly once/i.test(LEFT_OVER_REASK), true);
});

// ── SP-514: ONE bounded span re-ask ──────────────────────────────────────────────────────────────
Deno.test("SP-514: a span that fails verbatim earns a re-ask; a missing span does too", () => {
  const Q = "it took 10 phone calls to get NOTHING done";
  const P = ["the problem is not resolved", "the call is repeated"];
  // THE MEASURED FAILURE, in miniature: "got NOTHING done" for a quote reading "to get NOTHING done".
  const v = parseJudgeOne(judged([
    { ordinal: 1, states: true, span: "got NOTHING done" },
    { ordinal: 2, states: true, span: "10 phone calls" },
  ]), Q, P);
  assertEquals(v.supports, false);
  assertEquals(v.parts[0].rejected, "span_not_verbatim");
  assertEquals(spanReaskOrdinals(v), [1], "only the part whose span failed is re-asked");

  // a missing span is the same defect — states asserted, evidence unusable — and is re-asked too
  const missing = parseJudgeOne(judged([{ ordinal: 1, states: true, span: "" }, { ordinal: 2, states: true, span: "10 phone calls" }]), Q, P);
  assertEquals(missing.parts[0].rejected, "span_missing");
  assertEquals(spanReaskOrdinals(missing), [1]);

  // a part the judge simply said NO to is NOT re-asked: there is nothing to re-transcribe
  const no = parseJudgeOne(judged([{ ordinal: 1, states: false }, { ordinal: 2, states: true, span: "10 phone calls" }]), Q, P);
  assertEquals(spanReaskOrdinals(no), []);
});

Deno.test("SP-514: the re-ask QUOTES THE FAILURE BACK and asks only about that part", () => {
  const Q = "it took 10 phone calls to get NOTHING done";
  const P = ["the problem is not resolved", "the call is repeated"];
  const v = parseJudgeOne(judged([{ ordinal: 1, states: true, span: "got NOTHING done" }, { ordinal: 2, states: true, span: "10 phone calls" }]), Q, P);
  const u = buildJudgeSpanReask("a need", "a claim", P, { signalId: "s1", quote: Q, site: "", eventDate: null, brand: "", polarity: null }, v);
  assertEquals(u.includes('"got NOTHING done"'), true, "it must show the judge its own rejected span");
  assertEquals(u.includes("do not appear in the quote"), true);
  assertEquals(u.includes("ONLY these part(s): 1"), true, "and ask about part 1 only");
  // it must NOT invite a span to be invented
  assertEquals(/do not invent a span/i.test(u), true);
});

Deno.test("SP-514: the merge takes the re-ask for re-asked parts ONLY, and a second failure is final", () => {
  const Q = "it took 10 phone calls to get NOTHING done";
  const P = ["the problem is not resolved", "the call is repeated"];
  const first = parseJudgeOne(judged([{ ordinal: 1, states: true, span: "got NOTHING done" }, { ordinal: 2, states: true, span: "10 phone calls" }]), Q, P);
  assertEquals(first.supports, false);

  // the re-ask copies correctly this time → the part is recovered and the quote now supports
  const fixed = parseJudgeOne(judged([{ ordinal: 1, states: true, span: "to get NOTHING done" }]), Q, P);
  const merged = mergeSpanReask(first, fixed, [1], P);
  assertEquals(merged.parts[0].states, true);
  assertEquals(merged.parts[1].states, true, "the part that was settled first time is untouched");
  assertEquals(merged.supports, true);
  assertEquals(merged.notStated, []);

  // a SECOND failure is final, and keeps the second answer's span so the report can show both tries
  const stillWrong = parseJudgeOne(judged([{ ordinal: 1, states: true, span: "nothing was done" }]), Q, P);
  const merged2 = mergeSpanReask(first, stillWrong, [1], P);
  assertEquals(merged2.parts[0].states, false);
  assertEquals(merged2.parts[0].rejected, "span_not_verbatim");
  assertEquals(merged2.parts[0].span, "nothing was done");
  assertEquals(merged2.supports, false);
  assertEquals(merged2.notStated, ["the problem is not resolved"]);
});

Deno.test("SP-514: the re-ask cannot OVERTURN a part it was not asked about", () => {
  const Q = "it took 10 phone calls to get NOTHING done";
  const P = ["the problem is not resolved", "the call is repeated"];
  const first = parseJudgeOne(judged([{ ordinal: 1, states: true, span: "got NOTHING done" }, { ordinal: 2, states: true, span: "10 phone calls" }]), Q, P);
  // the second answer volunteers a verdict on part 2, which was settled. It must be ignored.
  const meddling = parseJudgeOne(judged([
    { ordinal: 1, states: true, span: "to get NOTHING done" },
    { ordinal: 2, states: false, reason: "changed my mind" },
  ]), Q, P);
  const merged = mergeSpanReask(first, meddling, [1], P);
  assertEquals(merged.parts[1].states, true, "part 2 keeps its FIRST verdict");
  assertEquals(merged.supports, true);
});

Deno.test("SP-514 + SP-493: a false belongs_to_this_need from EITHER call rejects the pattern", () => {
  const Q = "it took 10 phone calls to get NOTHING done";
  const P = ["the problem is not resolved"];
  const first = parseJudgeOne(judged([{ ordinal: 1, states: true, span: "got NOTHING done" }]), Q, P);
  const second = parseJudgeOne(judged([{ ordinal: 1, states: true, span: "to get NOTHING done" }], { belongs_to_this_need: false }), Q, P);
  assertEquals(mergeSpanReask(first, second, [1], P).belongsToNeed, false);
  const ok = parseJudgeOne(judged([{ ordinal: 1, states: true, span: "to get NOTHING done" }]), Q, P);
  assertEquals(mergeSpanReask(first, ok, [1], P).belongsToNeed, true);
});

// ── SP-542: ONE REFUSED CLAIM IS DROPPED AND NAMED — THE NEED'S OTHERS PROCEED ───────────────────
//
// What this cost: run 3 lost N14 entirely to ONE 91-character claim against a cap of 90, with 15 of
// its 17 quotes covered in v2. The envelope checks stay absolute, because no single claim can be
// blamed for an unparseable answer.

Deno.test("SP-542: a refused claim is dropped and named, and the answer keeps its others", () => {
  const l = labels(qt("s1", "BBB"), qt("s2", "Trustpilot"), qt("s3", "Google"));
  const tooLong = "x".repeat(MAX_PATTERN_NAME_CHARS + 1);
  const out = parseGeneratedLenient(JSON.stringify({ patterns: [
    pat({ claim: "the first claim is sound", quotes: ["q1"], representative: "q1" }),
    pat({ claim: tooLong, quotes: ["q2"], representative: "q2" }),
    pat({ claim: "the third claim is sound", quotes: ["q3"], representative: "q3" }),
  ] }), l);
  // the sound claims survive, IN ORDER, and the need is not lost
  assertEquals(out.patterns.map((x) => x.name), ["the first claim is sound", "the third claim is sound"]);
  // and the dropped one is NAMED with its ordinal, its kind and its reason
  assertEquals(out.dropped.length, 1);
  assertEquals(out.dropped[0].ordinal, 2);
  assertEquals(out.dropped[0].kind, "claim_length");
  assertEquals(out.dropped[0].claim, tooLong);
  // SP-546: the reason MEASURES the failure, because the per-claim re-ask quotes it verbatim
  assertEquals(out.dropped[0].why.includes(`the claim is ${MAX_PATTERN_NAME_CHARS + 1} characters; the limit is ${MAX_PATTERN_NAME_CHARS}`), true);
  // the STRICT reading is unchanged — it is still the specification of each refusal kind
  assertEquals(refusalKind(() => parseGenerated(JSON.stringify({ patterns: [pat({ claim: tooLong })] }), l)), "claim_length");
});

Deno.test("SP-542: every per-claim refusal kind drops only its own claim", () => {
  const l = labels(qt("s1", "BBB"), qt("s2", "Trustpilot"));
  const good = pat({ claim: "a sound claim", quotes: ["q1"], representative: "q1" });
  const cases: Array<[string, Record<string, unknown>]> = [
    ["claim_missing", { claim: "  " }],
    ["claim_length", { claim: "x".repeat(MAX_PATTERN_NAME_CHARS + 1) }],
    ["parts_missing", { parts: [] }],
    ["parts_count", { parts: Array.from({ length: MAX_PARTS_PER_PATTERN + 1 }, (_, i) => `predicate ${i}`) }],
    ["part_length", { parts: ["y".repeat(MAX_PART_CHARS + 1)] }],
    ["polarity", { polarity: "sideways" }],
    ["citation", { quotes: ["q9"] }],
    ["no_quotes", { quotes: [] }],
  ];
  for (const [kind, over] of cases) {
    const out = parseGeneratedLenient(JSON.stringify({
      patterns: [good, pat({ claim: `bad ${kind}`, representative: "q2", ...over })],
    }), l);
    assertEquals(out.patterns.map((x) => x.name), ["a sound claim"], `${kind}: the sound claim must survive`);
    assertEquals(out.dropped.length, 1, `${kind}: exactly one claim dropped`);
    assertEquals(out.dropped[0].kind, kind);
    assertEquals(out.dropped[0].ordinal, 2);
  }
  // SP-537(a) is per-claim too: the SECOND copy is dropped, the first is kept
  const dup = parseGeneratedLenient(JSON.stringify({ patterns: [
    pat({ claim: "one claim", quotes: ["q1"], representative: "q1" }),
    pat({ claim: "One  Claim", quotes: ["q2"], representative: "q2" }),
  ] }), l);
  assertEquals(dup.patterns.map((x) => x.name), ["one claim"]);
  assertEquals(dup.dropped[0].kind, "duplicate_claim");
});

Deno.test("SP-542: the ENVELOPE still refuses the whole pass — no claim can be blamed for it", () => {
  const l = labels(qt("s1", "BBB"));
  // an unparseable or cut answer has nothing to salvage
  assertThrows(() => parseGeneratedLenient("no json here", l), GeneratorRefusal, "no JSON object");
  assertThrows(() => parseGeneratedLenient('{"patterns":[{"claim":"a",}]}', l), GeneratorRefusal, "unparseable JSON");
  assertThrows(() => parseGeneratedLenient('{"ok":true}', l), GeneratorRefusal, "no `patterns` array");
  // and the SP-469 ceiling is a property of the answer's LENGTH, not of any one claim
  assertEquals(refusalKind(() => parseGeneratedLenient(JSON.stringify({
    patterns: Array.from({ length: PATTERN_CEILING + 1 }, (_, i) => pat({ claim: `claim ${i}`, representative: "" })),
  }), l)), "ceiling");
  // a pass whose EVERY claim is dropped has no patterns — a refusal OF THE PASS, not a throw, so the
  // need's other polarity passes still run
  const all = parseGeneratedLenient(JSON.stringify({ patterns: [pat({ claim: "  " }), pat({ polarity: "sideways" })] }), l);
  assertEquals(all.patterns.length, 0);
  assertEquals(all.dropped.length, 2);
});

Deno.test("SP-542: parseGeneratedPass carries the dropped claims alongside left_over", () => {
  const l = labels(qt("s1", "BBB"), qt("s2", "Trustpilot"));
  const pass = parseGeneratedPass(JSON.stringify({
    patterns: [
      pat({ claim: "a sound claim", quotes: ["q1"], representative: "q1" }),
      pat({ claim: "x".repeat(MAX_PATTERN_NAME_CHARS + 1), quotes: ["q2"], representative: "q2" }),
    ],
    left_over: [{ quote: "q2", why: "its claim was refused" }],
  }), l);
  assertEquals(pass.patterns.length, 1);
  assertEquals(pass.dropped.length, 1);
  assertEquals(pass.dropped[0].kind, "claim_length");
  // SP-547: an entry with no `belongs_to` is `belongsTo: null` — it names no claim, so it stays left over
  assertEquals(pass.leftOver, [{ label: "q2", why: "its claim was refused", belongsTo: null }]);
});

// ── SP-543: near-synonym claims are MEASURED, never gated ────────────────────────────────────────
Deno.test("SP-543: near-synonym claims are measured and listed, never refused", () => {
  // run 3's measured P1 group — four claims that SP-537(a) could not see, because none REPEATS
  const p1 = [
    "Outages are not adequately addressed by customer service",
    "Outages are not properly resolved by Spectrum",
    "Outages are not properly communicated or resolved by the billing department",
    "Service credits are not consistently applied",
  ];
  // MEASURED, and the numbers are why this is not a gate: the closest real pair is 0.429, and an
  // UNRELATED pair scores the same 0.125 as a near-synonymous one.
  assertEquals(claimOverlap(p1[1], p1[2]).toFixed(3), "0.429");
  assertEquals(claimOverlap(p1[0], p1[1]).toFixed(3), "0.125");
  assertEquals(claimOverlap(p1[0], p1[3]).toFixed(3), "0.125");
  // at the calibrated threshold exactly the 0.429 pair is listed
  const near = nearSynonymClaims(p1);
  assertEquals(near.length, 1);
  assertEquals(near[0].a, p1[1]);
  assertEquals(near[0].b, p1[2]);
  assertEquals(near[0].overlap >= NEAR_SYNONYM_THRESHOLD, true);
  // stop words carry no distinction: the same content words is an overlap of 1
  assertEquals(claimOverlap("the agent does not resolve the problem", "an agent does not resolve a problem"), 1);
  // and nothing in common is 0 — the measurement does not drift toward reporting everything
  assertEquals(claimOverlap("outages last for hours", "the bill rises without notice"), 0);
  // IT IS NOT A GATE: the parser accepts two near-synonyms, because only EXACT repetition is refused
  const l = labels(qt("s1", "BBB"), qt("s2", "Trustpilot"));
  const out = parseGeneratedLenient(JSON.stringify({ patterns: [
    pat({ claim: p1[1], quotes: ["q1"], representative: "q1" }),
    pat({ claim: p1[2], quotes: ["q2"], representative: "q2" }),
  ] }), l);
  assertEquals(out.patterns.length, 2);
  assertEquals(out.dropped.length, 0);
  assertEquals(nearSynonymClaims(out.patterns.map((x) => x.name)).length, 1);
});

Deno.test("SP-543: two claims asserting the SAME PART are found — run 3's actual defect", () => {
  // run 3's P1, as measured: one part string under two different claims, and another under two more
  const pats = [
    { name: "Outages are not adequately addressed by customer service", parts: ["outages are reported", "customer service is unresponsive or unhelpful"] },
    { name: "Outages are not properly communicated or resolved by the billing department", parts: ["outages are reported", "customer service is unresponsive or unhelpful"] },
    { name: "Outages are not properly resolved by Spectrum", parts: ["technical support is unresponsive or unhelpful"] },
    { name: "Service credits are not consistently applied", parts: ["no credit is given for an outage"] },
  ];
  const shared = sharedPartClaims(pats);
  // the two shared parts are found, most-shared first; the credits claim shares nothing
  assertEquals(shared.length, 2);
  assertEquals(shared[0].claims.length, 2);
  assertEquals(shared.map((x) => x.part).includes("customer service is unresponsive or unhelpful"), true);
  assertEquals(shared.flatMap((x) => x.claims).includes("Service credits are not consistently applied"), false);
  // normalisation: the same predicate written with different case and spacing is ONE part
  assertEquals(sharedPartClaims([
    { name: "claim one", parts: ["The  Agent Does Not Resolve It"] },
    { name: "claim two", parts: ["the agent does not resolve it"] },
  ]).length, 1);
  // and a part under ONE claim is never reported
  assertEquals(sharedPartClaims([{ name: "only claim", parts: ["a", "b"] }]), []);
});

// ── SP-546: ONE RE-ASK PER REFUSED CLAIM, NAMING THE EXACT FAILURE ───────────────────────────────
Deno.test("SP-546: the refusal MEASURES the failure, in the words the re-ask will carry", () => {
  const l = labels(qt("s1", "BBB"));
  // 99 characters against a cap of 90 — run 3's actual N14 failure, which cost the whole need
  const long = "x".repeat(99);
  const dropped = parseGeneratedLenient(JSON.stringify({ patterns: [pat({ claim: long })] }), l).dropped;
  assertEquals(dropped.length, 1);
  assertEquals(dropped[0].kind, "claim_length");
  // the ruling's own shape: the measured length, then the limit
  assertEquals(dropped[0].why.startsWith("the claim is 99 characters; the limit is 90"), true);
  // a part over its cap names its ORDINAL too, because "part 2" is what has to be found to fix it
  const d2 = parseGeneratedLenient(JSON.stringify({ patterns: [pat({ parts: ["short", "y".repeat(81)] })] }), l).dropped;
  assertEquals(d2[0].kind, "part_length");
  assertEquals(d2[0].why.startsWith("part 2 is 81 characters; the limit is 80"), true);
});

Deno.test("SP-546: the re-ask asks about ONE claim and carries the exact failure", () => {
  const q1 = qt("s1", "BBB");
  const d = { ordinal: 3, claim: "a claim that is too long", kind: "claim_length", why: "the claim is 99 characters; the limit is 90" };
  const text = buildClaimReask("reduce the time to reach support", [q1], d, REASK_GUIDANCE.claim_length);
  assertEquals(text.includes("the claim is 99 characters; the limit is 90"), true);
  assertEquals(text.includes("number 3 in your answer"), true);
  assertEquals(text.includes(REASK_GUIDANCE.claim_length), true);
  // it must NOT ask for the pass again: the other claims already passed every gate
  assertEquals(text.includes("do NOT write them again"), true);
  assertEquals(text.includes("Return that ONE pattern"), true);
});

Deno.test("SP-546: a recovered claim faces the SAME gates, and the pass's others bound it", () => {
  const l = labels(qt("s1", "BBB"), qt("s2", "Trustpilot"));
  const existing = parseGeneratedLenient(JSON.stringify({ patterns: [pat({ claim: "the agent hangs up", quotes: ["q1"], representative: "q1" })] }), l).patterns;
  // the happy path: one claim, inside the caps, cited from this pass's own labels
  const ok = parseReaskedClaim(JSON.stringify({ patterns: [pat({ claim: "the hold time passes 60 minutes", quotes: ["q2"], representative: "q2" })] }), l, existing);
  assertEquals(ok.name, "the hold time passes 60 minutes");
  assertEquals(ok.citedLabels, ["q2"]);
  // SP-537(a) STILL HOLDS ACROSS THE RE-ASK: a recovered claim may not repeat an accepted one
  assertEquals(refusalKind(() => parseReaskedClaim(JSON.stringify({ patterns: [pat({ claim: "The  Agent Hangs Up", quotes: ["q2"], representative: "q2" })] }), l, existing)), "duplicate_claim");
  // SP-475(c) still holds: q1 is already the representative of the accepted claim, so it is dropped
  // to null here rather than being the representative of two patterns
  assertEquals(parseReaskedClaim(JSON.stringify({ patterns: [pat({ claim: "a second mechanism", quotes: ["q1", "q2"], representative: "q1" })] }), l, existing).representativeSignalId, null);
  // and the caps are not relaxed by being in a re-ask — SP-546 says they stay
  assertEquals(refusalKind(() => parseReaskedClaim(JSON.stringify({ patterns: [pat({ claim: "z".repeat(91), quotes: ["q2"] })] }), l, existing)), "claim_length");
  // an answer carrying more than one pattern is refused: the re-ask asked for exactly one
  assertEquals(refusalKind(() => parseReaskedClaim(JSON.stringify({ patterns: [pat({ claim: "one", quotes: ["q2"] }), pat({ claim: "two", quotes: ["q2"] })] }), l, existing)), "schema");
});

// ── SP-547: `belongs_to` IS A CITATION, AND IS READ AS A NUMBER ──────────────────────────────────
Deno.test("SP-547: a non-null belongs_to makes the quote a citation under that claim", () => {
  const l = labels(qt("s1", "BBB"), qt("s2", "Trustpilot"), qt("s3", "BBB"));
  const pass = parseGeneratedPass(JSON.stringify({
    patterns: [
      pat({ claim: "the agent hangs up", quotes: ["q1"], representative: "q1" }),
      pat({ claim: "the hold time passes 60 minutes", quotes: ["q2"], representative: "q2" }),
    ],
    left_over: [{ quote: "q3", why: "covered by the hold-time claim", belongs_to: 2 }],
  }), l);
  // it is NOT left over any more — it is cited under claim 2 and will be judged like any other citation
  assertEquals(pass.leftOver.length, 0);
  assertEquals(pass.promoted.length, 1);
  assertEquals(pass.promoted[0].resolved, true);
  assertEquals(pass.promoted[0].claim, "the hold time passes 60 minutes");
  assertEquals(pass.patterns[1].citedLabels, ["q2", "q3"]);
  assertEquals(pass.patterns[1].signalIds, ["s2", "s3"]);
  // and the accounting now counts it as CITED, which is the defect SP-547 fixes: brief 5 lost four
  // quotes to a prose reason of this exact shape while the pass reported a complete account
  const acc = accountForQuotes(l, pass.patterns, pass.leftOver);
  assertEquals(acc.accounted, 3);
  assertEquals(acc.missing, []);
  assertEquals(acc.both, []);
});

Deno.test("SP-547: belongs_to is read as a NUMBER and nothing else; null stays left over", () => {
  const l = labels(qt("s1", "BBB"), qt("s2", "Trustpilot"));
  const pass = (bt: unknown) => parseGeneratedPass(JSON.stringify({
    patterns: [pat({ claim: "the agent hangs up", quotes: ["q1"], representative: "q1" })],
    left_over: [{ quote: "q2", why: "about billing, not this need", belongs_to: bt }],
  }), l);
  // null, the ordinary case: a genuinely unplaced quote
  assertEquals(pass(null).leftOver.length, 1);
  assertEquals(pass(null).leftOver[0].belongsTo, null);
  assertEquals(pass(null).promoted.length, 0);
  // NO PARSING OF THE REASON TEXT (SP-547): a claim named in prose is not a citation
  assertEquals(pass("the agent hangs up").leftOver.length, 1);
  assertEquals(pass("the agent hangs up").promoted.length, 0);
  // 0 and a negative name no claim — the index is 1-based
  assertEquals(pass(0).leftOver[0].belongsTo, null);
  assertEquals(pass(-1).leftOver[0].belongsTo, null);
  // a digit string IS a number ("2" is how a JSON-mode model often writes one)
  const asString = parseGeneratedPass(JSON.stringify({
    patterns: [pat({ claim: "the agent hangs up", quotes: ["q1"], representative: "q1" })],
    left_over: [{ quote: "q2", why: "same mechanism", belongs_to: "1" }],
  }), l);
  assertEquals(asString.promoted[0].resolved, true);
  assertEquals(asString.patterns[0].citedLabels, ["q1", "q2"]);
  // an index naming NO KEPT CLAIM cannot be promoted — there is nothing to cite it under. It stays
  // left over and is reported unresolved, never silently dropped and never silently cited.
  const far = pass(9);
  assertEquals(far.promoted.length, 1);
  assertEquals(far.promoted[0].resolved, false);
  assertEquals(far.leftOver.length, 1);
  assertEquals(far.leftOver[0].belongsTo, 9);
});

Deno.test("SP-547 + SP-542: belongs_to counts the claims the GENERATOR wrote, not the survivors", () => {
  const l = labels(qt("s1", "BBB"), qt("s2", "Trustpilot"), qt("s3", "BBB"));
  // claim 1 is refused (99 chars) and dropped; `belongs_to: 2` still means the SECOND claim of the
  // answer. Reading it as an index into the surviving array would cite the quote under the wrong claim.
  const pass = parseGeneratedPass(JSON.stringify({
    patterns: [
      pat({ claim: "x".repeat(99), quotes: ["q1"], representative: "q1" }),
      pat({ claim: "the hold time passes 60 minutes", quotes: ["q2"], representative: "q2" }),
    ],
    left_over: [{ quote: "q3", why: "same mechanism", belongs_to: 2 }],
  }), l);
  assertEquals(pass.dropped.length, 1);
  assertEquals(pass.patterns.length, 1);
  assertEquals(pass.promoted[0].claim, "the hold time passes 60 minutes");
  assertEquals(pass.patterns[0].citedLabels, ["q2", "q3"]);
  // the ordinals are reported so this mapping is not reconstructed by a later reader
  assertEquals(parseGeneratedLenient(JSON.stringify({ patterns: [
    pat({ claim: "y".repeat(99) }), pat({ claim: "kept" }),
  ] }), l).ordinals, [2]);
});

// ── SP-544 / SP-545 / SP-547: the DEFAULTS are what the rulings say ──────────────────────────────
Deno.test("SP-545: the live judge prompt IS cure B, and the pre-545 prompt keeps its own name", () => {
  assertEquals(JUDGE_SYSTEM, JUDGE_SYSTEM_TIGHTENED);
  // cure B is the pre-545 prompt PLUS the four bullets, in that order — not a retyping of either
  assertEquals(JUDGE_SYSTEM_TIGHTENED.startsWith(JUDGE_SYSTEM_PRE545 + "\n\n"), true);
  assertEquals(JUDGE_SYSTEM_PRE545.length < JUDGE_SYSTEM.length, true);
  // the quantity rule the adoption is FOR
  assertEquals(JUDGE_SYSTEM.includes("A QUANTITY NAMED IN THE PART MUST BE SHOWN BY THE QUOTE, NEVER INFERRED FROM IT."), true);
  assertEquals(JUDGE_SYSTEM_PRE545.includes("A QUANTITY NAMED IN THE PART MUST BE SHOWN BY THE QUOTE"), false);
});

Deno.test("SP-547: the live generator prompt is G-new PLUS belongs_to, and G-new keeps its bytes", () => {
  assertEquals(GENERATOR_SYSTEM, GENERATOR_SYSTEM_NEW547);
  assertEquals(GENERATOR_SYSTEM_NEW547.includes('"belongs_to"'), true);
  assertEquals(GENERATOR_SYSTEM_NEW547.includes("do not write it"), true);
  // brief 5's arm D was measured on these exact bytes, so G-new may not drift
  assertEquals(GENERATOR_SYSTEM_NEW.includes("belongs_to"), false);
  assertEquals(GENERATOR_SYSTEM_NEW.includes("ACCOUNT FOR EVERY QUOTE (SP-535)"), true);
  // THE ONLY DIFFERENCE IS SP-547's CLAUSE AND THE JSON SHAPE — measured line by line, so a later
  // edit that slips another instruction into the live prompt cannot pass as "the belongs_to change".
  const a = GENERATOR_SYSTEM_NEW.split("\n"), b = GENERATOR_SYSTEM_NEW547.split("\n");
  const added = b.filter((l) => !a.includes(l)), removed = a.filter((l) => !b.includes(l));
  assertEquals(added.length, 7);
  // six lines of the clause, plus the JSON shape line that gained the field
  assertEquals(added[0].includes('"belongs_to": the NUMBER of the claim in your own "patterns"'), true);
  assertEquals(added[6], '  "left_over":[{"quote":"q7","why":"<one clause>","belongs_to":null}]}');
  // and exactly one line left: the JSON shape line without the field
  assertEquals(removed, ['  "left_over":[{"quote":"q7","why":"<one clause>"}]}']);
});

// ── SP-551: the ceiling fills IN TURN across the polarity passes ─────────────────────────────────
Deno.test("SP-551: the ceiling takes the next claim from each pass in turn, and names what it cut", () => {
  // N13's MEASURED shape on 2026-11-22 (brief 6 §14b): the 'not working' pass runs first because it
  // has 37 of the 44 quotes, and it alone proposed 12 claims. Under `slice(0, 12)` the 'working' and
  // 'mixed' passes were deleted entire — including e7397c95's claim, which no judge ever saw.
  const notWorking = Array.from({ length: 12 }, (_, i) => ({ polarity: "not working", name: `nw${i + 1}` }));
  const working = [{ polarity: "working", name: "Online support and app reduce trouble" }, { polarity: "working", name: "w2" }];
  const mixed = [{ polarity: "mixed", name: "m1" }];
  const { kept, cut } = fillCeiling([notWorking, working, mixed], PATTERN_CEILING);
  assertEquals(kept.length, 12);
  assertEquals(cut.length, 3);
  // ROUND 1 takes one from each pass, in the passes' own order
  assertEquals(kept.slice(0, 3).map((x) => x.name), ["nw1", "Online support and app reduce trouble", "m1"]);
  // round 2 has no mixed claim left, so it is nw2 then w2
  assertEquals(kept.slice(3, 5).map((x) => x.name), ["nw2", "w2"]);
  // every pass is represented, which is the whole ruling
  assertEquals([...new Set(kept.map((x) => x.polarity))].sort(), ["mixed", "not working", "working"]);
  // and what is cut is the TAIL of the biggest pass, not another pass's only claim
  assertEquals(cut.map((x) => x.name), ["nw10", "nw11", "nw12"]);
  assertEquals([...new Set(cut.map((x) => x.polarity))], ["not working"]);
});

Deno.test("SP-551: under the ceiling nothing is cut, and each pass keeps its own order", () => {
  const a = [{ name: "a1" }, { name: "a2" }, { name: "a3" }];
  const b = [{ name: "b1" }];
  const { kept, cut } = fillCeiling([a, b], PATTERN_CEILING);
  assertEquals(cut, []);
  assertEquals(kept.map((x) => x.name), ["a1", "b1", "a2", "a3"]);
  // an empty pass list, and a ceiling of 0, are both answerable rather than a crash
  assertEquals(fillCeiling([], 12), { kept: [], cut: [] });
  assertEquals(fillCeiling([a], 0).cut.length, 3);
});

// ── SP-552: a polarity mismatch is a NAMED refusal, never a silent skip ──────────────────────────
Deno.test("SP-552: a claim whose polarity is not its pass's is refused by name, measured in the message", () => {
  // N13's MEASURED case: the generator wrote a sound claim over the three `mixed` quotes and labelled
  // it "not working", so the old `own.length === 0 → continue` deleted it without a word.
  const mixedQuote = (id: string): PatternQuote => ({ ...qt(id, "s"), polarity: "mixed" });
  const polarityOf = (id: string) => (id === "m1" || id === "m2" ? "mixed" : "not working") as "mixed" | "not working";
  const claim = { name: "Support is quick but the fix does not hold", polarity: "not working" as const, signalIds: ["m1", "m2"] };
  const r = polarityRefusal(claim, "mixed", polarityOf);
  assertEquals(r?.kind, "polarity_mismatch");
  // the message MEASURES it — both polarities by name, so the re-ask can say what to fix
  assertEquals(r!.message.includes('"not working"'), true);
  assertEquals(r!.message.includes('"mixed"'), true);
  assertEquals(REASK_GUIDANCE.polarity_mismatch.length > 0, true);
  // the SECOND arm: the polarity is right, but no cited quote carries it
  const across = { name: "c", polarity: "mixed" as const, signalIds: ["n1", "n2"] };
  const r2 = polarityRefusal(across, "mixed", polarityOf);
  assertEquals(r2?.kind, "polarity_mismatch");
  assertEquals(r2!.message.includes("cites 2 quote(s)"), true);
  assertEquals(r2!.message.includes("not working"), true);
  // and a claim that matches its pass and owns at least one quote is NOT refused
  assertEquals(polarityRefusal({ name: "c", polarity: "mixed", signalIds: ["m1", "n1"] }, "mixed", polarityOf), null);
  assertEquals(mixedQuote("m1").polarity, "mixed");
});

// ── SP-553: the decomposition re-ask, triggered from the VERDICTS ────────────────────────────────
/** a judged quote in the shape the trigger reads: an id and one row per part. */
const jq = (signalId: string, states: boolean[]) =>
  ({ signalId, parts: states.map((st, i) => ({ ordinal: i + 1, states: st })) });

Deno.test("SP-553: every part stated, by DIFFERENT quotes, and no quote states all — it TRIGGERS", () => {
  // P1's MEASURED claim (brief 6 §14a): "Outages are not credited or compensated", parts
  // `automatic credits are not applied` and `statement credits never arrive`. Seven quotes, a true
  // claim, ZERO support — because each quote says one alternative or the other.
  const parts = ["automatic credits are not applied", "statement credits never arrive"];
  const split = decompositionTrigger(parts, [jq("a1", [true, false]), jq("a2", [true, false]), jq("b1", [false, true])]);
  assertEquals(split !== null, true);
  assertEquals(split!.unstated, []);                       // nothing is unsupported
  assertEquals(split!.stated.length, 2);                   // both parts are stated — by different quotes
  assertEquals(split!.stated[0], { ordinal: 1, part: parts[0], signalIds: ["a1", "a2"] });
  assertEquals(split!.stated[1], { ordinal: 2, part: parts[1], signalIds: ["b1"] });
});

Deno.test("SP-553: one part stated by NO quote — it triggers, and that part is named unstated", () => {
  // N13's MEASURED hold-time claim: p1 `customers wait over 60 minutes on hold` 3 of 3, p2
  // `customers spend hours on the phone` 0 of 3 — the same fact at another magnitude.
  const parts = ["customers wait over 60 minutes on hold", "customers spend hours on the phone"];
  const split = decompositionTrigger(parts, [jq("h1", [true, false]), jq("h2", [true, false]), jq("h3", [true, false])]);
  assertEquals(split !== null, true);
  assertEquals(split!.stated.map((x) => x.ordinal), [1]);
  assertEquals(split!.stated[0].signalIds, ["h1", "h2", "h3"]);
  assertEquals(split!.unstated, [{ ordinal: 2, part: parts[1] }]);
});

Deno.test("SP-553: NO part stated by any quote — it must NOT trigger", () => {
  // The generator wrote something the quotes do not say. Re-asking would invite it to invent a claim
  // that fits, so the claim is dropped and named (SP-542) and no re-ask is spent.
  const parts = ["the technician never arrived", "the appointment was cancelled twice"];
  assertEquals(decompositionTrigger(parts, [jq("x1", [false, false]), jq("x2", [false, false])]), null);
  // nor on a claim some quote SUPPORTS — there is nothing to repair
  assertEquals(decompositionTrigger(parts, [jq("x1", [true, true]), jq("x2", [true, false])]), null);
  // nor on a ONE-PART claim: if its single part were stated, that quote would support it. Arithmetic.
  assertEquals(decompositionTrigger(["only one part"], [jq("x1", [false]), jq("x2", [false])]), null);
  // and the empty cases answer rather than crash
  assertEquals(decompositionTrigger([], [jq("x1", [])]), null);
  assertEquals(decompositionTrigger(parts, []), null);
});

Deno.test("SP-553: the re-ask states which parts were stated by which quotes, and asks for the split", () => {
  const quotes = [qt("11111111-1111-4111-8111-111111111111", "google"), qt("22222222-2222-4222-8222-222222222222", "yelp")];
  const lbl = labels(...quotes);
  const parts = ["automatic credits are not applied", "statement credits never arrive"];
  const split = decompositionTrigger(parts, [jq(quotes[0].signalId, [true, false]), jq(quotes[1].signalId, [false, true])])!;
  const user = buildDecompositionReask("the outage is credited", quotes, { name: "Outages are not credited or compensated", parts, polarity: "not working" }, split, lbl);
  // which parts, and BY WHICH QUOTES — label and short id, the ruling's "quote ids"
  assertEquals(user.includes('part 1 "automatic credits are not applied" — STATED by q1 (id 11111111)'), true);
  assertEquals(user.includes('part 2 "statement credits never arrive" — STATED by q2 (id 22222222)'), true);
  // the two options the ruling names, and the contract that forces them
  assertEquals(user.includes("states EVERY one of its parts"), true);
  assertEquals(user.includes("DIFFERENT MECHANISMS"), true);
  assertEquals(user.includes("remove that part"), true);
  assertEquals(user.includes('polarity "not working"'), true);
  // a part no quote states is said to be so, in the prompt itself
  const one = decompositionTrigger(parts, [jq(quotes[0].signalId, [true, false])])!;
  const u2 = buildDecompositionReask("o", quotes, { name: "c", parts, polarity: "not working" }, one, lbl);
  assertEquals(u2.includes('part 2 "statement credits never arrive" — STATED BY NO QUOTE'), true);
});

Deno.test("SP-553: the rewrite faces every gate — the caps, SP-542, SP-547 and duplicate_claim", () => {
  const quotes = [qt("aaaaaaaa-1111-4111-8111-111111111111", "google"), qt("bbbbbbbb-2222-4222-8222-222222222222", "yelp")];
  const lbl = labels(...quotes);
  const already: ProposedPattern[] = [{
    name: "Automatic credits are not applied after an outage", parts: ["automatic credits are not applied"],
    polarity: "not working", signalIds: [quotes[0].signalId], representativeSignalId: quotes[0].signalId, citedLabels: ["q1"],
  }];
  // a rewrite that REPEATS a claim the need already carries is refused as duplicate_claim (SP-537(a)),
  // and SP-542 keeps the rewrite's other claim rather than losing the whole answer
  const answer = JSON.stringify({
    patterns: [
      { claim: "Automatic credits are not applied after an outage", parts: ["x happens"], polarity: "not working", quotes: ["q1"], representative: "q1" },
      { claim: "Statement credits never arrive", parts: ["statement credits never arrive"], polarity: "not working", quotes: ["q2"], representative: "q2" },
    ],
    left_over: [{ quote: "q1", why: "it is the first claim's", belongs_to: 2 }],
  });
  const pass = parseGeneratedPass(answer, lbl, already);
  assertEquals(pass.dropped.length, 1);
  assertEquals(pass.dropped[0].kind, "duplicate_claim");
  assertEquals(pass.patterns.length, 1);
  assertEquals(pass.patterns[0].name, "Statement credits never arrive");
  // SP-547 still applies inside a rewrite: belongs_to 2 names the answer's SECOND claim, which here
  // is the only survivor, so the quote becomes a citation under it
  assertEquals(pass.promoted, [{ label: "q1", belongsTo: 2, why: "it is the first claim's", resolved: true, claim: "Statement credits never arrive", alreadyCited: false }]);
  assertEquals(pass.patterns[0].citedLabels.includes("q1"), true);
  assertEquals(pass.leftOver, []);
  // the caps are the same caps
  const tooLong = JSON.stringify({ patterns: [{ claim: "c".repeat(MAX_PATTERN_NAME_CHARS + 1), parts: ["p"], polarity: "not working", quotes: ["q1"], representative: "q1" }] });
  assertEquals(parseGeneratedPass(tooLong, lbl, already).dropped[0].kind, "claim_length");
  // and the ORIGINAL is deliberately NOT seeded: option (b) keeps the claim and drops a part, so the
  // same claim with FEWER parts must be acceptable
  const optionB = JSON.stringify({ patterns: [{ claim: "Outages are not credited or compensated", parts: ["automatic credits are not applied"], polarity: "not working", quotes: ["q1"], representative: "q1" }] });
  assertEquals(parseGeneratedPass(optionB, lbl, already).patterns.length, 1);
});

// ── SP-557: the ceiling is per polarity pass ─────────────────────────────────────────────────────

Deno.test("SP-557: each pass gets its own ceiling, so a big pass cannot starve a small one", () => {
  // N13's measured shape in run 6: 12 'not working', 1 'working', 1 'mixed'. Under SP-551's single
  // budget the not-working pass spent 10 of the 12 and four of its claims were cut, one of them the
  // claim that answered SP-462 (d). Per pass, nothing is cut at all.
  const nw = Array.from({ length: 12 }, (_, i) => `nw${i + 1}`);
  const r = applyCeilingPerPass([nw, ["w1"], ["m1"]], PATTERN_CEILING);
  assertEquals(r.kept.length, 14);
  assertEquals(r.cut, []);
  assertEquals(r.perPass, [{ kept: 12, cut: 0 }, { kept: 1, cut: 0 }, { kept: 1, cut: 0 }]);
  // and the passes' own order is preserved inside the result
  assertEquals(r.kept.slice(0, 3), ["nw1", "nw2", "nw3"]);
  assertEquals(r.kept.slice(12), ["w1", "m1"]);
});

Deno.test("SP-557: a pass over its own ceiling is cut, and only that pass", () => {
  const big = Array.from({ length: 15 }, (_, i) => `b${i + 1}`);
  const r = applyCeilingPerPass([big, ["s1", "s2"]], PATTERN_CEILING);
  assertEquals(r.kept.length, 14);                       // 12 of the big pass + both of the small one
  assertEquals(r.cut, ["b13", "b14", "b15"]);            // the overflow is the big pass's TAIL
  assertEquals(r.perPass, [{ kept: 12, cut: 3 }, { kept: 2, cut: 0 }]);
  assertEquals(r.kept.includes("s1") && r.kept.includes("s2"), true);
});

Deno.test("SP-557: empty passes and a zero ceiling behave", () => {
  assertEquals(applyCeilingPerPass([], 12), { kept: [], cut: [], perPass: [] });
  assertEquals(applyCeilingPerPass([["a"], []], 12).kept, ["a"]);
  const zero = applyCeilingPerPass([["a", "b"]], 0);
  assertEquals(zero.kept, []);
  assertEquals(zero.cut, ["a", "b"]);                     // a zero ceiling cuts everything, visibly
});

// ── SP-556: one retry on an empty answer, then fail closed by name ───────────────────────────────

Deno.test("SP-556: an empty answer is recognised by its error, and nothing else is", () => {
  assertEquals(isEmptyAnswerError(new Error("claim-delta model call returned empty content (qwen3.6:35b)")), true);
  assertEquals(isEmptyAnswerError(new Error("pattern judge returned unparseable JSON")), false);
  assertEquals(isEmptyAnswerError(new Error("claim-delta model call failed: HTTP 500 (qwen3.6:35b)")), false);
  assertEquals(isEmptyAnswerError("returned empty content"), false);     // a string is not an Error
  assertEquals(isEmptyAnswerError(null), false);
});

const EMPTY = () => new Error("claim-delta model call returned empty content (qwen3.6:35b)");

Deno.test("SP-556: a first answer that arrives is returned, and no retry is made", async () => {
  const budgets: number[] = [];
  let onEmpty = 0;
  const out = await callJudgeWithEmptyRetry({
    system: "s", user: "u",
    call: (_s, _u, np) => { budgets.push(np); return Promise.resolve('{"parts":[]}'); },
    onEmpty: () => { onEmpty++; },
  });
  assertEquals(out, '{"parts":[]}');
  assertEquals(budgets, [JUDGE_NUM_PREDICT]);     // one call, at the first budget
  assertEquals(onEmpty, 0);
});

Deno.test("SP-556: an empty first answer earns ONE retry at the bigger budget, and is recovered", async () => {
  const budgets: number[] = [];
  const events: boolean[] = [];
  const out = await callJudgeWithEmptyRetry({
    system: "s", user: "u",
    call: (_s, _u, np) => { budgets.push(np); return np === JUDGE_NUM_PREDICT ? Promise.reject(EMPTY()) : Promise.resolve("ANSWER"); },
    onEmpty: (ev) => { events.push(ev.recovered); },
  });
  assertEquals(out, "ANSWER");
  assertEquals(budgets, [JUDGE_NUM_PREDICT, JUDGE_NUM_PREDICT_RETRY]);
  assertEquals(events, [true]);                   // reported as recovered, exactly once
});

Deno.test("SP-556: empty TWICE fails closed, is named, and retries no further", async () => {
  const budgets: number[] = [];
  const events: boolean[] = [];
  let threw = "";
  try {
    await callJudgeWithEmptyRetry({
      system: "s", user: "u",
      call: (_s, _u, np) => { budgets.push(np); return Promise.reject(EMPTY()); },
      onEmpty: (ev) => { events.push(ev.recovered); },
    });
  } catch (e) { threw = e instanceof Error ? e.message : String(e); }
  assertEquals(budgets.length, 2);                // ONE retry, not a loop
  assertEquals(events, [false]);                  // named as failed closed
  assertEquals(/returned empty content/.test(threw), true);
});

Deno.test("SP-556: a non-empty failure is NOT retried and propagates as itself", async () => {
  let calls = 0;
  let threw = "";
  try {
    await callJudgeWithEmptyRetry({
      system: "s", user: "u",
      call: () => { calls++; return Promise.reject(new Error("claim-delta model call failed: HTTP 503 (qwen3.6:35b)")); },
    });
  } catch (e) { threw = e instanceof Error ? e.message : String(e); }
  assertEquals(calls, 1);                          // a timeout or an HTTP fault is a different fault
  assertEquals(/HTTP 503/.test(threw), true);
});

Deno.test("SP-556: a NON-empty failure on the retry propagates as itself, not as an empty answer", async () => {
  const events: boolean[] = [];
  let threw = "";
  try {
    await callJudgeWithEmptyRetry({
      system: "s", user: "u",
      call: (_s, _u, np) => Promise.reject(np === JUDGE_NUM_PREDICT ? EMPTY() : new Error("claim-delta model call failed: HTTP 500 (x)")),
      onEmpty: (ev) => { events.push(ev.recovered); },
    });
  } catch (e) { threw = e instanceof Error ? e.message : String(e); }
  assertEquals(/HTTP 500/.test(threw), true);
  assertEquals(events, []);                        // NOT reported as an empty-twice failure
});

Deno.test("SP-555: the judge of record's call shape is named in one place", () => {
  assertEquals(PATTERN_JUDGE_THINK, true);
  assertEquals(JUDGE_NUM_PREDICT, 4_000);
  assertEquals(JUDGE_NUM_PREDICT_RETRY, 8_000);
  assertEquals(JUDGE_NUM_PREDICT_RETRY > JUDGE_NUM_PREDICT, true);
});

// ── SP-558: an arm column identical to the live column on every row is a bug ─────────────────────

Deno.test("SP-558: an identical arm column fails, a differing one passes", () => {
  // the shape brief 7 §9c measured: 54 rows, every one a copy
  const copied = Array.from({ length: 54 }, (_, i) => ({ live: i % 5, arm: i % 5 }));
  assertEquals(armColumnIsIdentical(copied), true);
  // the same table with ONE row differing is a result, not a copy
  const real = copied.map((r, i) => (i === 7 ? { live: 3, arm: 1 } : r));
  assertEquals(armColumnIsIdentical(real), false);
});

Deno.test("SP-558: one row proves nothing, so the guard needs at least two", () => {
  assertEquals(armColumnIsIdentical([{ live: 2, arm: 2 }]), false);
  assertEquals(armColumnIsIdentical([]), false);
  assertEquals(armColumnIsIdentical([{ live: 2, arm: 2 }, { live: 1, arm: 1 }]), true);
  // and the minimum is a parameter, so a caller that wants a stricter floor can say so
  assertEquals(armColumnIsIdentical([{ live: 2, arm: 2 }, { live: 1, arm: 1 }], 3), false);
});

// ── SP-569: `belongs_to` resolves AFTER the judge ────────────────────────────────────────────────

/** RUN 7's SIX `belongs_to` ENTRIES, as step5.log printed them, and the fate each named claim met.
 *  The run's own line was "6 became citations, 0 named no kept claim". Two of the six — N13 75d3e101
 *  and P1 04adf671 — had named a claim SP-493 then refused. */
const RUN7_ENTRIES: BelongsToEntry[] = [
  { need: "N13", polarity: "not working", label: "q19", signalId: "75d3e101", belongsTo: 10, claim: "Agents blame customers for billing errors", resolved: true, why: "cited for sales pressure, billing confusion is left" },
  { need: "P1", polarity: "not working", label: "q5", signalId: "04adf671", belongsTo: 3, claim: "Outages are not credited or compensated", resolved: true, why: "focuses on credit amount inadequacy" },
  { need: "P1", polarity: "not working", label: "q31", signalId: "d8376436", belongsTo: 1, claim: "Outages occur with high frequency or duration", resolved: true, why: "describes duration" },
  { need: "N15", polarity: "not working", label: "q15", signalId: "3af5feb4", belongsTo: 1, claim: "Customers are charged for a full month when canceling mid-cycle", resolved: true, why: "conflicting cancellation promises" },
  { need: "N15", polarity: "not working", label: "q17", signalId: "3c85b83e", belongsTo: 3, claim: "Monthly rates increase without clear notification or reason", resolved: true, why: "contract change increasing bill" },
  { need: "N15", polarity: "not working", label: "q25", signalId: "7dee5010", belongsTo: 3, claim: "Monthly rates increase without clear notification or reason", resolved: true, why: "sales rep misinformation" },
];
const SP493 = "SP-493: the claim states another need's problem";
const RUN7_FATES = new Map<string, ClaimFate>([
  [belongsToClaimKey("N13", "not working", "Agents blame customers for billing errors"),
    { kept: false, dropReason: SP493, judgedSignalIds: ["ebc71dc4"], supportingSignalIds: ["ebc71dc4"] }],
  [belongsToClaimKey("P1", "not working", "Outages are not credited or compensated"),
    { kept: false, dropReason: SP493, judgedSignalIds: ["74f316d3"], supportingSignalIds: [] }],
  [belongsToClaimKey("P1", "not working", "Outages occur with high frequency or duration"),
    { kept: true, dropReason: "", judgedSignalIds: ["a9adddec", "1c2e5e7f", "d8376436"], supportingSignalIds: ["1c2e5e7f", "d8376436"] }],
  [belongsToClaimKey("N15", "not working", "Customers are charged for a full month when canceling mid-cycle"),
    { kept: true, dropReason: "", judgedSignalIds: ["3af5feb4"], supportingSignalIds: ["3af5feb4"] }],
  [belongsToClaimKey("N15", "not working", "Monthly rates increase without clear notification or reason"),
    { kept: true, dropReason: "", judgedSignalIds: ["3c85b83e", "7dee5010"], supportingSignalIds: ["7dee5010"] }],
]);

Deno.test("SP-569: run 7's two cases — a quote that named a later-dropped claim is NOT a citation", () => {
  const out = resolveBelongsToAfterJudging(RUN7_ENTRIES, RUN7_FATES);
  const by = (id: string) => out.find((o) => o.signalId === id)!;
  // THE TWO: each names its claim and the reason the claim was dropped
  assertEquals(by("75d3e101").outcome, "claim_dropped");
  assertEquals(by("75d3e101").claim, "Agents blame customers for billing errors");
  assertEquals(by("75d3e101").dropReason, SP493);
  assertEquals(by("04adf671").outcome, "claim_dropped");
  assertEquals(by("04adf671").claim, "Outages are not credited or compensated");
  assertEquals(by("04adf671").dropReason, SP493);
  // the other four sit on KEPT claims — three support, one was judged and does not
  assertEquals(by("d8376436").outcome, "cited_supports");
  assertEquals(by("3af5feb4").outcome, "cited_supports");
  assertEquals(by("7dee5010").outcome, "cited_supports");
  assertEquals(by("3c85b83e").outcome, "cited_not_supporting");
  // THE PRINTED LINE IS TRUE AT THE END OF THE RUN: 4 and 2, where run 7 printed 6 and 0
  assertEquals(belongsToSummaryLine(out),
    "SP-547 / SP-569: 6 left-over entr(ies) named a claim with `belongs_to` — " +
    "4 became citations on a KEPT claim (3 support it, 1 do not) · 2 named a claim that was later dropped · 0 named no claim:");
});

Deno.test("SP-569: a claim that was never judged, a kept claim with no verdict, and an index naming no claim", () => {
  const e = (over: Partial<BelongsToEntry>): BelongsToEntry =>
    ({ need: "N1", polarity: "mixed", label: "q1", signalId: "s1", belongsTo: 1, claim: "c", resolved: true, why: "w", ...over });
  const fates = new Map<string, ClaimFate>([
    [belongsToClaimKey("N1", "mixed", "kept"), { kept: true, dropReason: "", judgedSignalIds: ["other"], supportingSignalIds: ["other"] }],
    [belongsToClaimKey("N1", "mixed", "zero"), { kept: false, dropReason: "judge kept 0 of 2", judgedSignalIds: ["a", "b"], supportingSignalIds: [] }],
  ]);
  const out = resolveBelongsToAfterJudging([
    e({ claim: "cut by the ceiling" }),               // no fate at all
    e({ claim: "kept", signalId: "s-empty" }),        // kept, but this quote has no verdict (empty answer)
    e({ claim: "zero" }),                             // dropped for keeping nothing of its own
    e({ claim: "", resolved: false, belongsTo: 9 }),  // the index named no claim
    // the SAME claim text under another polarity pass is a different claim, and has no fate
    e({ claim: "kept", polarity: "working" }),
  ], fates);
  assertEquals(out.map((o) => o.outcome), ["claim_dropped", "kept_no_verdict", "claim_dropped", "named_no_claim", "claim_dropped"]);
  assertEquals(out[0].dropReason, NEVER_JUDGED);
  assertEquals(out[2].dropReason, "judge kept 0 of 2");
  assertEquals(out[4].dropReason, NEVER_JUDGED);
  assertEquals(/0 became citations on a KEPT claim/.test(belongsToSummaryLine(out)), false, "a kept claim with no verdict still counts as on a kept claim");
  assertEquals(/1 got no verdict/.test(belongsToSummaryLine(out)), true);
  assertEquals(/3 named a claim that was later dropped · 1 named no claim:$/.test(belongsToSummaryLine(out)), true);
});

Deno.test("SP-569: a claim's own citations are judged first, the belongs_to nominations last", () => {
  // the nomination was appended by parseGeneratedPass, but the ORDER must not depend on that
  assertEquals(splitDeferredCitations(["n1", "a", "b", "n2"], new Set(["n1", "n2"])), { own: ["a", "b"], deferred: ["n1", "n2"] });
  assertEquals(splitDeferredCitations(["a", "b"], new Set()), { own: ["a", "b"], deferred: [] });
  // a claim whose ONLY citations are nominations has nothing of its own, so nothing can keep it
  assertEquals(splitDeferredCitations(["n1"], new Set(["n1"])).own, []);
});

Deno.test("SP-569: parseGeneratedPass says whether a belongs_to quote was already the claim's own citation", () => {
  const q1 = qt("s1", "a.com"), q2 = qt("s2", "b.com"), q3 = qt("s3", "c.com");
  const l = labels(q1, q2, q3);
  const pass = parseGeneratedPass(JSON.stringify({
    patterns: [pat({ quotes: ["q1", "q2"], representative: "q1" })],
    left_over: [
      { quote: "q3", why: "fits claim 1", belongs_to: 1 },      // reaches the claim through belongs_to ALONE
      { quote: "q2", why: "also listed here", belongs_to: 1 },  // already one of the claim's own citations
    ],
  }), l);
  assertEquals(pass.promoted.map((p) => [p.label, p.resolved, p.alreadyCited]), [["q3", true, false], ["q2", true, true]]);
});

// ── SP-578: a "not this need's" on a NOMINATED quote voids the nomination, never the claim ───────

/** The judge loop of `run-need-patterns.ts`, reduced to what SP-578 touches: the claim's own citations
 *  first, the nominations last (SP-569), each verdict passed through `belongsVerdictEffect`. The real
 *  loop cannot run without a model call, so the tests walk the same rule over given verdicts. */
type V578 = { id: string; nominated?: boolean; supports: boolean; belongsToNeed: boolean };
function walk578(quotes: V578[]): { dropped: boolean; fate: ClaimFate; notJudged: string[] } {
  const judged: V578[] = [], voided: string[] = [], notJudged: string[] = [];
  let dropped = false;
  for (const q of [...quotes.filter((x) => !x.nominated), ...quotes.filter((x) => x.nominated)]) {
    const ownSupporting = judged.filter((x) => x.supports).length;
    if (q.nominated && ownSupporting === 0) { notJudged.push(q.id); continue; }          // SP-569
    const effect = belongsVerdictEffect({ belongsToNeed: q.belongsToNeed, nominated: !!q.nominated, ownSupporting });
    if (effect === "void_nomination") { voided.push(q.id); continue; }
    judged.push(q);
    if (effect === "drop_claim") { dropped = true; break; }
  }
  const kept = !dropped && judged.some((x) => x.supports);
  return { dropped, notJudged, fate: {
    kept, dropReason: dropped ? SP493 : kept ? "" : `judge kept 0 of ${judged.length}`,
    judgedSignalIds: judged.map((x) => x.id), supportingSignalIds: judged.filter((x) => x.supports).map((x) => x.id), voidedSignalIds: voided,
  } };
}
const entry578 = (signalId: string): BelongsToEntry =>
  ({ need: "N13", polarity: "not working", label: "q19", signalId, belongsTo: 1, claim: "C", resolved: true, why: "w" });
const fates578 = (fate: ClaimFate) => new Map([[belongsToClaimKey("N13", "not working", "C"), fate]]);

Deno.test("SP-578 (1): a false on one of the claim's OWN citations still drops the claim — SP-493 unchanged", () => {
  assertEquals(belongsVerdictEffect({ belongsToNeed: false, nominated: false, ownSupporting: 2 }), "drop_claim");
  assertEquals(belongsVerdictEffect({ belongsToNeed: false, nominated: false, ownSupporting: 0 }), "drop_claim");
  const r = walk578([{ id: "a", supports: true, belongsToNeed: true }, { id: "b", supports: true, belongsToNeed: false }, { id: "c", supports: true, belongsToNeed: true }]);
  assertEquals([r.dropped, r.fate.kept, r.fate.dropReason], [true, false, SP493]);
  // and a true is never an effect, nominated or not
  assertEquals(belongsVerdictEffect({ belongsToNeed: true, nominated: true, ownSupporting: 1 }), "none");
  assertEquals(belongsVerdictEffect({ belongsToNeed: true, nominated: false, ownSupporting: 0 }), "none");
  // fail closed on the field itself (SP-566): anything but the boolean true is a false
  assertEquals(belongsVerdictEffect({ belongsToNeed: undefined as never, nominated: false, ownSupporting: 1 }), "drop_claim");
});

Deno.test("SP-578 (2): a false on a NOMINATED quote voids the nomination — the claim is kept and the fate lists it", () => {
  assertEquals(belongsVerdictEffect({ belongsToNeed: false, nominated: true, ownSupporting: 1 }), "void_nomination");
  // run 7's N13 case: the claim stood on ebc71dc4, and the nominated 75d3e101 said "not this need's"
  const r = walk578([{ id: "ebc71dc4", supports: true, belongsToNeed: true }, { id: "75d3e101", nominated: true, supports: false, belongsToNeed: false }]);
  assertEquals(r.dropped, false);
  assertEquals(r.fate, { kept: true, dropReason: "", judgedSignalIds: ["ebc71dc4"], supportingSignalIds: ["ebc71dc4"], voidedSignalIds: ["75d3e101"] });
  // the loop goes ON after a void: a later nomination is still judged, and can support
  const r2 = walk578([{ id: "a", supports: true, belongsToNeed: true }, { id: "n1", nominated: true, supports: true, belongsToNeed: false }, { id: "n2", nominated: true, supports: true, belongsToNeed: true }]);
  assertEquals([r2.fate.kept, r2.fate.voidedSignalIds, r2.fate.supportingSignalIds], [true, ["n1"], ["a", "n2"]]);
});

Deno.test("SP-578 (3): a voided nomination with EVERY part stated is still voided — never a citation that counts", () => {
  const r = walk578([{ id: "a", supports: true, belongsToNeed: true }, { id: "n", nominated: true, supports: true, belongsToNeed: false }]);
  assertEquals(r.fate.supportingSignalIds, ["a"]);
  assertEquals(r.fate.judgedSignalIds, ["a"]);
  assertEquals(resolveBelongsToAfterJudging([entry578("n")], fates578(r.fate))[0].outcome, "nomination_voided");
  // even a fate that (wrongly) listed the quote as supporting resolves to voided: void is tested first
  const wrong: ClaimFate = { kept: true, dropReason: "", judgedSignalIds: ["a", "n"], supportingSignalIds: ["a", "n"], voidedSignalIds: ["n"] };
  assertEquals(resolveBelongsToAfterJudging([entry578("n")], fates578(wrong))[0].outcome, "nomination_voided");
});

Deno.test("SP-578 (4): the resolver returns nomination_voided and the summary's counts add up to the entries", () => {
  const fates = new Map(RUN7_FATES);
  // run 7 again, as it would have gone under SP-578: N13's claim is KEPT on its own quote and 75d3e101 is voided
  fates.set(belongsToClaimKey("N13", "not working", "Agents blame customers for billing errors"),
    { kept: true, dropReason: "", judgedSignalIds: ["ebc71dc4"], supportingSignalIds: ["ebc71dc4"], voidedSignalIds: ["75d3e101"] });
  const out = resolveBelongsToAfterJudging(RUN7_ENTRIES, fates);
  assertEquals(out.find((o) => o.signalId === "75d3e101")!.outcome, "nomination_voided");
  const line = belongsToSummaryLine(out);
  assertEquals(line,
    "SP-547 / SP-569: 6 left-over entr(ies) named a claim with `belongs_to` — " +
    "4 became citations on a KEPT claim (3 support it, 1 do not) · 1 nomination(s) voided (SP-578) · 1 named a claim that was later dropped · 0 named no claim:");
  const nums = line.match(/— (\d+) became.*?· (\d+) nomination\(s\) voided.*?· (\d+) named a claim.*?· (\d+) named no claim/)!.slice(1).map(Number);
  assertEquals(nums.reduce((a, b) => a + b, 0), RUN7_ENTRIES.length);
  // with nothing voided the line is the one SP-569 has always printed
  assertEquals(/voided/.test(belongsToSummaryLine(resolveBelongsToAfterJudging(RUN7_ENTRIES, RUN7_FATES))), false);
  assertEquals(voidedNominationLine("75d3e101-aaaa", "about billing, not contact", 2),
    'SP-578 nomination 75d3e101 VOIDED — the judge says this quote is not this need\'s: "about billing, not contact". The claim stands on 2 supporting citation(s) of its own.');
});

Deno.test("SP-578 (5): a claim whose own citations keep nothing — the nomination is not judged, so there is nothing to void", () => {
  const r = walk578([{ id: "a", supports: false, belongsToNeed: true }, { id: "n", nominated: true, supports: true, belongsToNeed: false }]);
  assertEquals([r.notJudged, r.fate.voidedSignalIds, r.fate.kept, r.dropped], [["n"], [], false, false]);
  // the fail-safe: were such a nomination ever judged, its false is an ordinary SP-493 false, not a void
  assertEquals(belongsVerdictEffect({ belongsToNeed: false, nominated: true, ownSupporting: 0 }), "drop_claim");
  // and a dropped claim's entry reads "claim dropped" whatever its fate lists as voided
  const droppedFate: ClaimFate = { kept: false, dropReason: "judge kept 0 of 1", judgedSignalIds: ["a"], supportingSignalIds: [], voidedSignalIds: ["n"] };
  assertEquals(resolveBelongsToAfterJudging([entry578("n")], fates578(droppedFate))[0].outcome, "claim_dropped");
});

Deno.test("SP-578 (6): the runner decides through belongsVerdictEffect BEFORE SP-493's break, and lists a void under SP-578 only (SP-585)", () => {
  const src = Deno.readTextFileSync(new URL("../../../scripts/run-need-patterns.ts", import.meta.url).pathname);
  const effect = src.indexOf('belongsVerdictEffect({ belongsToNeed: v.belongsToNeed, nominated: nominated.has(qt.signalId), ownSupporting }) === "void_nomination") {\n        voided578.add(qt.signalId);');
  const sp523 = src.indexOf("sp523Disagreements.push(");
  // SP-638 (brief 18): SP-493's break is gone — every own citation is judged and a vote decides. The
  // void is still decided before the SP-523 listing and before the verdict is kept.
  const kept = src.indexOf("verdicts.push({ q: qt, supports: v.supports && v.belongsToNeed");
  assertEquals(effect > 0 && sp523 > effect && kept > sp523, true, "the void must be decided before the SP-523 listing and before the verdict is kept");
  // between the decision and the SP-523 listing the voided quote leaves the loop
  assertEquals(/sp578Voided\.push\([\s\S]*?continue;/.test(src.slice(effect, sp523)), true);
  // SP-638: no SP-493 break at all
  assertEquals(src.split("belongs = false; break;").length - 1, 0);
});

// ── SP-616: the two run 8 reporting lines ────────────────────────────────────────────────────────

/** RUN 8's NINE `belongs_to` ENTRIES and the fate each named claim met, from step8.log and
 *  run8-pairs.json. The run printed "4 named a claim that was later dropped"; one did (P1 04adf671).
 *  The three N15 entries came from SP-553 decomposition answers and named rewrite claims that were KEPT. */
const R8 = (need: string, signalId: string, claim: string, fromRewrite = false): BelongsToEntry =>
  ({ need, polarity: "not working", label: "q", signalId, belongsTo: 1, claim, resolved: true, why: "w", fromRewrite });
const R8_CONFLICT = "Agents provide conflicting information across multiple contacts";
const R8_RUDE = "Agents use rude, dismissive, or threatening behavior";
const R8_FAIL = "Agents fail to resolve issues and offer only ineffective workarounds";
const R8_FULLMONTH = "Customers are charged for a full month when canceling mid-cycle";
const R8_RATES = "Monthly rates increase without clear notification or reason";
const RUN8_ENTRIES: BelongsToEntry[] = [
  R8("N13", "485b1a30", R8_CONFLICT), R8("N13", "fb8c710d", R8_RUDE), R8("N13", "55fcf875", R8_CONFLICT), R8("N13", "c4e961c6", R8_FAIL),
  R8("P1", "04adf671", "Outages are not credited or compensated"), R8("P1", "d8376436", "Outages occur with high frequency or duration"),
  R8("N15", "3af5feb4", R8_FULLMONTH, true), R8("N15", "3c85b83e", R8_RATES, true), R8("N15", "7dee5010", R8_RATES, true),
];
const k8 = (need: string, claim: string) => belongsToClaimKey(need, "not working", claim);
const RUN8_FATES = new Map<string, ClaimFate>([
  [k8("N13", R8_CONFLICT), { kept: true, dropReason: "", judgedSignalIds: ["o1", "o2", "o3", "o4", "485b1a30"], supportingSignalIds: ["o1", "o2", "o3", "485b1a30"], voidedSignalIds: ["55fcf875"] }],
  [k8("N13", R8_RUDE), { kept: true, dropReason: "", judgedSignalIds: ["r1", "fb8c710d"], supportingSignalIds: ["r1"] }],
  [k8("N13", R8_FAIL), { kept: true, dropReason: "", judgedSignalIds: ["f1", "c4e961c6"], supportingSignalIds: ["f1"] }],
  [k8("P1", "Outages are not credited or compensated"), { kept: false, dropReason: SP493, judgedSignalIds: ["74f316d3"], supportingSignalIds: [] }],
  [k8("P1", "Outages occur with high frequency or duration"), { kept: true, dropReason: "", judgedSignalIds: ["a", "d8376436"], supportingSignalIds: ["a", "d8376436"] }],
]);
const RUN8_REWRITE_FATES = new Map<string, ClaimFate>([
  [k8("N15", R8_FULLMONTH), { kept: true, dropReason: "", judgedSignalIds: ["3af5feb4"], supportingSignalIds: ["3af5feb4"] }],
  [k8("N15", R8_RATES), { kept: true, dropReason: "", judgedSignalIds: ["3c85b83e", "7dee5010"], supportingSignalIds: ["7dee5010"] }],
]);

Deno.test("SP-616 (a): only a nomination whose claim was DROPPED counts as dropped; a kept rewrite is counted apart", () => {
  const out = resolveBelongsToAfterJudging(RUN8_ENTRIES, RUN8_FATES, RUN8_REWRITE_FATES);
  assertEquals(out.map((o) => o.outcome), ["cited_supports", "cited_not_supporting", "nomination_voided", "cited_not_supporting",
    "claim_dropped", "cited_supports", "rewrite_kept", "rewrite_kept", "rewrite_kept"]);
  assertEquals(out.filter((o) => o.outcome === "rewrite_kept").map((o) => o.rewriteVerdict), ["supports", "not_supporting", "supports"]);
  const line = belongsToSummaryLine(out);
  assertEquals(line,
    "SP-547 / SP-569: 9 left-over entr(ies) named a claim with `belongs_to` — " +
    "4 became citations on a KEPT claim (2 support it, 2 do not) · 1 nomination(s) voided (SP-578) · " +
    "3 named a KEPT rewrite claim (SP-553; 2 support it, 1 do not) · 1 named a claim that was later dropped · 0 named no claim:");
  // the counts on the line add up to the entries
  const nums = line.match(/— (\d+) became.*?· (\d+) nomination\(s\) voided.*?· (\d+) named a KEPT rewrite.*?· (\d+) named a claim that.*?· (\d+) named no claim/)!.slice(1).map(Number);
  assertEquals(nums.reduce((a, b) => a + b, 0), RUN8_ENTRIES.length);
  // THE RUN 8 DEFECT, pinned: without the rewrite fates the three read as dropped — 4, where 1 is true
  assertEquals(resolveBelongsToAfterJudging(RUN8_ENTRIES, RUN8_FATES).filter((o) => o.outcome === "claim_dropped").length, 4);
});

Deno.test("SP-616 (a): a rewrite entry is resolved against the REWRITE's fate, never its original's", () => {
  // the rewrite kept its original's claim text (SP-553 option b); the original was dropped, the rewrite kept
  const e = R8("N15", "s1", "same text", true);
  const originals = new Map([[k8("N15", "same text"), { kept: false, dropReason: "judge kept 0 of 4", judgedSignalIds: ["s1"], supportingSignalIds: [] } as ClaimFate]]);
  const rewrites = new Map([[k8("N15", "same text"), { kept: true, dropReason: "", judgedSignalIds: ["s1"], supportingSignalIds: ["s1"] } as ClaimFate]]);
  assertEquals(resolveBelongsToAfterJudging([e], originals, rewrites)[0].outcome, "rewrite_kept");
  // and an entry from the FIRST answer naming that text still reads the original's fate
  assertEquals(resolveBelongsToAfterJudging([{ ...e, fromRewrite: false }], originals, rewrites)[0].outcome, "claim_dropped");
  // a rewrite that was itself dropped, or never reached the judge, IS a dropped claim — with its reason
  const droppedRw = new Map([[k8("N15", "same text"), { kept: false, dropReason: "judge kept 0 of 2", judgedSignalIds: ["s1"], supportingSignalIds: [] } as ClaimFate]]);
  const d = resolveBelongsToAfterJudging([e], originals, droppedRw)[0];
  assertEquals([d.outcome, d.dropReason], ["claim_dropped", "judge kept 0 of 2"]);
  const never = resolveBelongsToAfterJudging([e], originals, new Map())[0];
  assertEquals([never.outcome, never.dropReason], ["claim_dropped", NEVER_JUDGED]);
  // a kept rewrite with no verdict on this quote says so on the line
  const nv = resolveBelongsToAfterJudging([R8("N15", "s-empty", "same text", true)], originals, rewrites);
  assertEquals(nv[0].rewriteVerdict, "no_verdict");
  assertEquals(/1 named a KEPT rewrite claim \(SP-553; 0 support it, 0 do not, 1 got no verdict\)/.test(belongsToSummaryLine(nv)), true);
  // with no rewrite entry the line is byte-for-byte the one SP-569 / SP-578 printed
  assertEquals(/rewrite/.test(belongsToSummaryLine(resolveBelongsToAfterJudging(RUN7_ENTRIES, RUN7_FATES))), false);
});

Deno.test("SP-616 (b): the void line counts the claim's OWN supporting citations apart from earlier nominations", () => {
  // run 8, "Agents provide conflicting information…": 4 own citations judged (3 support), then the
  // nomination 485b1a30 supported, then 55fcf875 was voided. The run printed "4 … of its own".
  const nominated = new Set(["485b1a30", "55fcf875"]);
  const verdicts = [{ signalId: "o1", supports: true }, { signalId: "o2", supports: true }, { signalId: "o3", supports: true },
    { signalId: "o4", supports: false }, { signalId: "485b1a30", supports: true }];
  assertEquals(supportingByOrigin(verdicts, nominated), { own: 3, nominated: 1 });
  assertEquals(voidedNominationLine("55fcf875-aaaa", "r", 3, 1),
    'SP-578 nomination 55fcf875 VOIDED — the judge says this quote is not this need\'s: "r". ' +
    "The claim stands on 3 supporting citation(s) of its own and 1 earlier nomination(s) that supported.");
  // nothing nominated has supported yet: the line is the one SP-578 has always printed
  assertEquals(supportingByOrigin(verdicts.slice(0, 4), nominated), { own: 3, nominated: 0 });
  assertEquals(/of its own\.$/.test(voidedNominationLine("55fcf875", "r", 3)), true);
  // a non-supporting nomination is in neither count
  assertEquals(supportingByOrigin([{ signalId: "485b1a30", supports: false }], nominated), { own: 0, nominated: 0 });
  // THE FAIL-SAFE MEANS WHAT IT SAYS: a claim standing only on a nomination has no own support, so a
  // false on a later nomination is an ordinary SP-493 false. (Unreachable through the runner — SP-569
  // judges no nomination before an own citation supports — which is why it is pinned here.)
  const onlyNom = supportingByOrigin([{ signalId: "o1", supports: false }, { signalId: "485b1a30", supports: true }], nominated);
  assertEquals(belongsVerdictEffect({ belongsToNeed: false, nominated: true, ownSupporting: onlyNom.own }), "drop_claim");
});

Deno.test("SP-616: the runner feeds both lines from the shared functions", () => {
  const src = Deno.readTextFileSync(new URL("../../../scripts/run-need-patterns.ts", import.meta.url).pathname);
  assertEquals(src.includes("const ownSupporting = sup616.own;"), true);
  assertEquals(src.includes("voidedNominationLine(qt.signalId, v.reason, ownSupporting, sup616.nominated)"), true);
  assertEquals(src.includes("resolveBelongsToAfterJudging(promotedQuotes, claimFates, rewriteFates)"), true);
  assertEquals(src.includes("(p.rewriteOf ? rewriteFates : claimFates).set(fateKey"), true);
  // every entry pushed from a decomposition answer is marked, and only those
  assertEquals(src.split("fromRewrite: true").length - 1, 1);
});

// ── SP-609: --pairs-json carries the judge's claim-level answer per pair, and every claim's outcome ──
Deno.test("SP-609 (1): belongs_field says WHICH answer the judge gave — true, false, missing or non-boolean", () => {
  const rows = [{ ordinal: 1, states: true, span: "hung up on me", reason: "r" }];
  const Q609 = "the agent hung up on me twice";
  const P609 = ["the agent hangs up"];
  const ask = (extra: Record<string, unknown>) => parseJudgeOne(JSON.stringify({ parts: rows, reason: "the claim is about billing", ...extra }), Q609, P609);
  assertEquals(ask({ belongs_to_this_need: true }).belongsField, "true");
  assertEquals(ask({ belongs_to_this_need: false }).belongsField, "false");
  assertEquals(ask({}).belongsField, "missing");
  for (const bad of [null, "true", "false", 1, 0, []]) assertEquals(ask({ belongs_to_this_need: bad }).belongsField, "non_boolean");
  assertEquals(belongsFieldOf(null), "missing");
  assertEquals(belongsFieldOf("not an object"), "missing");
  // SP-566 is unchanged by the recording: only an explicit true belongs, whatever the field says
  for (const extra of [{}, { belongs_to_this_need: null }, { belongs_to_this_need: "true" }, { belongs_to_this_need: false }]) {
    assertEquals(ask(extra).belongsToNeed, false);
  }
  // the three fields a pair row carries, with the judge's top-level reason as the belongs reason
  assertEquals(pairBelongsFields(ask({})), { belongs_to_this_need: false, belongs_field: "missing", belongs_reason: "the claim is about billing" });
  assertEquals(pairBelongsFields(ask({ belongs_to_this_need: true })), { belongs_to_this_need: true, belongs_field: "true", belongs_reason: "the claim is about billing" });
});

Deno.test("SP-609 (2): the span re-ask merge keeps the field of the answer that rejected", () => {
  const mk = (belongsToNeed: boolean, belongsField: JudgeVerdict["belongsField"]): JudgeVerdict =>
    ({ supports: true, parts: [{ ordinal: 1, states: true, span: "s", reason: "", rejected: "" }], belongsToNeed, belongsField, reason: "r", notStated: [] });
  assertEquals(mergeSpanReask(mk(true, "true"), mk(true, "true"), [1], ["p"]).belongsField, "true");
  assertEquals(mergeSpanReask(mk(false, "missing"), mk(true, "true"), [1], ["p"]).belongsField, "missing");
  assertEquals(mergeSpanReask(mk(true, "true"), mk(false, "false"), [1], ["p"]).belongsField, "false");
  assertEquals(mergeSpanReask(mk(false, "false"), mk(false, "missing"), [1], ["p"]).belongsField, "false");
});

Deno.test("SP-609 (3): every drop has exactly one class, and an unknown reason is refused, never filed", () => {
  assertEquals(claimDropClass("SP-493: the claim states another need's problem"), "sp493");
  assertEquals(claimDropClass("judge kept 0 of 3"), "kept_0");
  assertEquals(claimDropClass("judge kept 0 of 12"), "kept_0");
  assertEquals(claimDropClass("cited nothing"), "cited_nothing");
  assertEquals(claimDropClass("ceiling"), "ceiling");
  assertEquals(claimDropClass("generator refused: polarity_mismatch"), "generator_refused");
  assertThrows(() => claimDropClass(""), Error, "no class");
  assertThrows(() => claimDropClass("judge kept 0 of several"), Error, "no class");
  assertThrows(() => claimDropClass("dropped for some new reason"), Error, "no class");
});

Deno.test("SP-609 (4): a claim's outcome — kept with its strength, or dropped with its class and reason", () => {
  const base = { need: "N13", polarity: "not working", claim: "Agents hang up", identity: "abc", parts: ["the agent hangs up"] };
  assertEquals(claimOutcome({ ...base, kept: true, dropReason: "", cited: 4, judged: 4, supporting: 3, strength: "likely rule" }), {
    need: "N13", polarity: "not working", claim: "Agents hang up", pattern_identity: "abc", parts: ["the agent hangs up"], rewrite_of: null,
    outcome: "kept", drop_class: null, drop_reason: "", cited: 4, judged: 4, supporting: 3, strength: "likely rule",
    answer: null,
  });
  const dropped = claimOutcome({ ...base, rewriteOf: "Agents are unhelpful", kept: false, dropReason: "SP-493: the claim states another need's problem", cited: 5, judged: 2, supporting: 1, strength: "likely rule" });
  assertEquals([dropped.outcome, dropped.drop_class, dropped.rewrite_of, dropped.strength], ["dropped", "sp493", "Agents are unhelpful", null]);
  assertEquals(dropped.judged, 2);   // SP-493 stops the loop, so judged can be below cited — the record says so
  assertEquals(claimOutcome({ ...base, identity: null, parts: [], kept: false, dropReason: "ceiling", cited: 0, judged: 0, supporting: 0 }).drop_class, "ceiling");
  // a kept claim never carries a drop reason, and never has zero supporting quotes
  assertThrows(() => claimOutcome({ ...base, kept: true, dropReason: "cited nothing", cited: 1, judged: 1, supporting: 1 }), Error, "kept claim");
  assertThrows(() => claimOutcome({ ...base, kept: true, dropReason: "", cited: 1, judged: 1, supporting: 0 }), Error, "at least one");
});

Deno.test("SP-609 (5): the runner records an outcome at EVERY exit of the judge loop and writes both sets of fields", () => {
  const src = Deno.readTextFileSync(new URL("../../../scripts/run-need-patterns.ts", import.meta.url));
  // the four exits: cited nothing, SP-493, kept 0, kept
  assertEquals((src.match(/recordOutcome\(false, "cited nothing"/g) ?? []).length, 1);
  assertEquals((src.match(/recordOutcome\(false, "SP-493: the claim states another need's problem"/g) ?? []).length, 1);
  assertEquals((src.match(/recordOutcome\(false, `judge kept 0 of \$\{cited\.length\}`/g) ?? []).length, 1);
  assertEquals((src.match(/recordOutcome\(true, "", verdicts, cited\.length, strength\)/g) ?? []).length, 1);
  // each exit that sets a fate also records an outcome — setFate skips rewrites, recordOutcome must not
  assertEquals((src.match(/setFate\((true|false), /g) ?? []).length, (src.match(/recordOutcome\((true|false), /g) ?? []).length);
  // every judged pair carries the judge's claim-level answer: queued once, written by BOTH pair writers
  // (SP-638, brief 18: once again — the record-only queue of brief 17 is removed)
  assertEquals((src.match(/belongs: pairBelongsFields\(v\)/g) ?? []).length, 1);
  assertEquals((src.match(/\.\.\.item\.belongs,/g) ?? []).length, 2);
  // and the file carries the claims, with the never-judged ones (ceiling, generator door) added.
  // SP-618(c): the list is built ONCE, before the write, so the per-answer account reads the same list.
  const build = src.slice(src.indexOf("const allClaims: ClaimOutcome[] = ["), src.indexOf("const claimAccount ="));
  for (const needle of ["...claimOutcomes,", 'dropReason: "ceiling"', "dropReason: `generator refused: ${x.d.kind}`"]) {
    assertEquals(build.includes(needle), true, `allClaims does not carry ${needle}`);
  }
  const write = src.slice(src.indexOf("await Deno.writeTextFile(PAIRS_JSON"));
  assertEquals(write.includes("claims: allClaims,"), true, "--pairs-json does not write claims: allClaims");
});

Deno.test("SP-618: the runner never takes an accounting re-ask's claims, and fails a run that loses a claim", () => {
  const src = Deno.readTextFileSync(new URL("../../../scripts/run-need-patterns.ts", import.meta.url));
  const block = src.slice(src.indexOf('false, "account-reask");'), src.indexOf("// SP-628 + SP-635:"));   // SP-634 (brief 18): SP-546 now runs BEFORE the accounting
  // run 8's line — the second answer taken whole — is gone, and the merge stands in its place
  assertEquals(/proposed = re\.patterns/.test(src), false);
  assertEquals(/pass = re;/.test(src), false);
  assertEquals(block.includes("completeAccountFromReask(labels, pass, re)"), true);
  assertEquals(block.includes("pass = merged.pass; proposed = pass.patterns;"), true);
  // brief 18: the merge returns copies, so a recovered claim's answer follows it to its copy
  assertEquals(block.includes("if (a && proposed[i]) answerOf.set(proposed[i], a);"), true);
  // every claim the re-ask wrote is recorded, whether its answer parsed or not
  assertEquals((block.match(/recordAnswerClaims\(need\.key, polarity, "account-reask"/g) ?? []).length, 2);
  // every generator answer that can be discarded or replaced records its claims
  for (const needle of ["`answer refused: ${refusalKind}`", "`replaced by its re-ask: ${d.kind}`", '"replaced by its re-ask: polarity_mismatch"', '`decomp-${qi}`, d2.claim', "duplicate: identical (claim + parts)"]) {
    assertEquals(src.includes(needle), true, `the runner does not record ${needle}`);
  }
  // and the run FAILS on a claim with no outcome
  assertEquals(src.includes("run: FAIL (SP-618)"), true);
  assertEquals(src.includes("claimAccountByAnswer(genAnswers, allClaims)"), true);
});

// ── SP-618 (brief 16): the accounting re-ask fault, on run 8's own N13 answers ──────────────────────
const RUN8_N13 = JSON.parse(await Deno.readTextFile(new URL("./needPatterns.run8-n13.fixture.json", import.meta.url))) as { first: string; second: string };
const N13_LABELS = new Map(Array.from({ length: 49 }, (_, i) => [`q${i + 1}`, `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`] as const));
/** Run 8's reading of the first answer: the nested list dropped on the floor, so no account at all. */
function run8FirstAsRun8ReadIt(): string {
  const j = JSON.parse(RUN8_N13.first) as { patterns: unknown[] };
  return JSON.stringify({ patterns: j.patterns.filter((p) => typeof (p as { claim?: unknown }).claim === "string") });
}

Deno.test("SP-618 (a1): run 8's N13 first answer — the nested left_over is read, 7 claims, every quote accounted for", () => {
  const raw = JSON.parse(RUN8_N13.first) as { patterns: unknown[]; left_over?: unknown };
  assertEquals(raw.patterns.length, 8);          // the fixture really is the faulty shape
  assertEquals(raw.left_over, undefined);
  const pass = parseGeneratedPass(RUN8_N13.first, N13_LABELS);
  assertEquals(pass.nestedLeftOver, 1);
  assertEquals(pass.patterns.length, 7);
  assertEquals(pass.dropped.length, 0);          // the list is NOT a refused eighth claim
  assertEquals(pass.patterns[2].name, "Customers face excessive hold times and difficult contact methods");
  const acc = accountForQuotes(N13_LABELS, pass.patterns, pass.leftOver);
  assertEquals([acc.missing.length, acc.both.length, acc.duplicatedLeftOver.length, acc.accounted], [0, 0, 0, 49]);   // ⇒ no SP-535 re-ask fires
  // `belongs_to` counts CLAIMS: q42 named claim 3, the hold-time claim.
  const q42 = pass.promoted.find((x) => x.label === "q42")!;
  assertEquals([q42.resolved, q42.belongsTo, q42.claim], [true, 3, "Customers face excessive hold times and difficult contact methods"]);
  assertEquals(pass.promoted.every((x) => x.resolved), true);
  assertEquals(pass.leftOver.length + pass.promoted.length, 24);
});

Deno.test("SP-618 (a2): hoisting — only a claim-less item with a left_over array; a top-level list is joined; the ceiling counts claims", () => {
  const claim = (n: number) => ({ claim: `Claim number ${n} about something`, parts: [`thing ${n} happens`], polarity: "not working", quotes: ["q1"], representative: null });
  // nested + top-level are joined
  const both = hoistNestedLeftOver({ patterns: [claim(1), { left_over: [{ quote: "q2", why: "a" }] }], left_over: [{ quote: "q3", why: "b" }] });
  assertEquals([both.patterns!.length, both.leftOver!.length, both.nested], [1, 2, 1]);
  // an item WITH a claim is never lifted, even if it carries a left_over key
  const mixed = hoistNestedLeftOver({ patterns: [{ ...claim(1), left_over: [{ quote: "q2", why: "a" }] }] });
  assertEquals([mixed.patterns!.length, mixed.leftOver, mixed.nested], [1, null, 0]);
  // nothing nested: unchanged, and a missing list stays null (not an empty account)
  assertEquals(hoistNestedLeftOver({ patterns: [claim(1)] }), { patterns: [claim(1)], leftOver: null, nested: 0 });
  assertEquals(hoistNestedLeftOver({ nope: 1 }).patterns, null);
  // 12 claims + a nested list is 12 claims, not 13 — no ceiling refusal
  const twelve = JSON.stringify({ patterns: [...Array.from({ length: 12 }, (_, i) => claim(i + 1)), { left_over: [{ quote: "q2", why: "x", belongs_to: null }] }] });
  const pass = parseGeneratedPass(twelve, N13_LABELS);
  assertEquals([pass.patterns.length, pass.leftOver.length, pass.nestedLeftOver], [12, 1, 1]);
  // a nested list in the MIDDLE: belongs_to still counts claims
  const mid = JSON.stringify({ patterns: [claim(1), { left_over: [{ quote: "q2", why: "x", belongs_to: 2 }] }, claim(2)] });
  assertEquals(parseGeneratedPass(mid, N13_LABELS).promoted[0].claim, "Claim number 2 about something");
  // a fabricated label in a nested list still refuses the answer
  assertThrows(() => parseGeneratedPass(JSON.stringify({ patterns: [claim(1), { left_over: [{ quote: "q999", why: "x" }] }] }), N13_LABELS), Error, "not in this pass's input");
});

Deno.test("SP-618 (b1): run 8's N13 re-ask — the second answer's 12 claims are never taken; the first answer's 7 stand", () => {
  const first = parseGeneratedPass(run8FirstAsRun8ReadIt(), N13_LABELS);        // as run 8 read it
  const second = parseGeneratedPass(RUN8_N13.second, N13_LABELS);
  const before = accountForQuotes(N13_LABELS, first.patterns, first.leftOver);
  assertEquals([first.patterns.length, before.missing.length], [7, 24]);        // run 8's "24 unaccounted"
  assertEquals(second.patterns.length, 12);
  const snapshot = JSON.stringify(first);
  const m = completeAccountFromReask(N13_LABELS, first, second);
  assertEquals(JSON.stringify(first), snapshot);                                // `first` is not mutated
  // the claims, their parts and their own citations are the first answer's, in order
  assertEquals(m.pass.patterns.map((p) => p.name), first.patterns.map((p) => p.name));
  assertEquals(m.pass.patterns.map((p) => p.parts), first.patterns.map((p) => p.parts));
  m.pass.patterns.forEach((p, i) => assertEquals(p.citedLabels.slice(0, first.patterns[i].citedLabels.length), first.patterns[i].citedLabels));
  assertEquals(m.pass.patterns.some((p) => p.name === "Customers face excessive hold times and difficult contact methods"), true);
  assertEquals(m.pass.patterns.some((p) => p.name.startsWith("Agents fail to track")), false);
  // the two answers share NO claim text, so nothing can be nominated: every label is left over, an orphan, or missing
  assertEquals([m.secondSame.length, m.secondNew.length, m.nominated.length], [0, 12, 0]);
  assertEquals(m.adoptedLeftOver.length + m.orphaned.length + m.stillMissing.length, 24);
  assertEquals(m.stillMissing.length, 0);
  assertEquals(m.adoptedLeftOver.every((l) => l.belongsTo === null && l.why.length > 0), true);
  // an orphan points at a claim the first answer does not have, and stays unaccounted
  const after = accountForQuotes(N13_LABELS, m.pass.patterns, m.pass.leftOver);
  assertEquals(after.missing.sort(), m.orphaned.map((o) => o.label).sort());
  assertEquals(m.orphaned.every((o) => !first.patterns.some((p) => p.name === o.claim)), true);
  assertEquals(after.accounted, 25 + m.adoptedLeftOver.length);
});

Deno.test("SP-618 (b2): each way the re-ask can place an unaccounted label", () => {
  const labels = new Map([["q1", "s1"], ["q2", "s2"], ["q3", "s3"], ["q4", "s4"], ["q5", "s5"]]);
  const pat = (name: string, cited: string[]): ProposedPattern => ({ name, parts: ["a thing happens"], polarity: "not working", signalIds: cited.map((l) => labels.get(l)!), representativeSignalId: null, citedLabels: cited });
  const first: GeneratedPass = { patterns: [pat("Bills arrive late", ["q1"])], leftOver: [], dropped: [], promoted: [] };
  const second: GeneratedPass = {
    // same claim text (case and spacing aside) now also cites q2; a NEW claim cites q3; q4 is left over; q5 is nowhere
    patterns: [pat("bills  arrive late", ["q1", "q2"]), pat("Agents hang up", ["q3"])],
    leftOver: [{ label: "q4", why: "about pricing", belongsTo: null }], dropped: [], promoted: [],
  };
  const m = completeAccountFromReask(labels, first, second);
  assertEquals(m.pass.patterns.length, 1);                                       // "Agents hang up" is not taken
  assertEquals(m.pass.patterns[0].citedLabels, ["q1", "q2"]);                    // q2 nominated for the shared claim
  assertEquals(m.pass.promoted, [{ label: "q2", belongsTo: 1, why: "cited under this claim by the accounting re-ask (SP-618)", resolved: true, claim: "Bills arrive late", alreadyCited: false }]);
  assertEquals(m.orphaned, [{ label: "q3", claim: "Agents hang up" }]);
  assertEquals(m.adoptedLeftOver, [{ label: "q4", why: "about pricing", belongsTo: null }]);
  assertEquals(m.stillMissing, ["q5"]);
  assertEquals([m.secondSame, m.secondNew], [["bills  arrive late"], ["Agents hang up"]]);
  const acc = accountForQuotes(labels, m.pass.patterns, m.pass.leftOver);
  assertEquals([acc.accounted, acc.missing], [3, ["q3", "q5"]]);
  // a first answer that is already complete is returned with nothing added
  const whole: GeneratedPass = { patterns: [pat("Bills arrive late", ["q1", "q2", "q3", "q4", "q5"])], leftOver: [], dropped: [], promoted: [] };
  const m2 = completeAccountFromReask(labels, whole, second);
  assertEquals([m2.adoptedLeftOver.length, m2.nominated.length, m2.orphaned.length, m2.pass.patterns[0].citedLabels.length], [0, 0, 0, 5]);
});

Deno.test("SP-618 (c1): the new classes — replaced is its own outcome, and the answer is carried", () => {
  assertEquals(claimDropClass("duplicate: identical (claim + parts) to a pattern this need already carries"), "duplicate");
  assertEquals(claimDropClass("answer refused: ceiling"), "answer_refused");
  assertEquals(claimDropClass("replaced by its re-ask: polarity_mismatch"), "replaced_by_reask");
  assertEquals(claimDropClass("accounting re-ask: claims are never adopted (SP-618) — not in the first answer"), "reask_not_adopted");
  const base = { need: "N13", polarity: "not working", claim: "Agents hang up", identity: null, parts: [], cited: 0, judged: 0, supporting: 0 };
  const rep = claimOutcome({ ...base, kept: false, dropReason: "accounting re-ask: claims are never adopted (SP-618) — not in the first answer", answer: "account-reask" });
  assertEquals([rep.outcome, rep.drop_class, rep.answer], ["replaced", "reask_not_adopted", "account-reask"]);
  assertEquals(claimOutcome({ ...base, kept: false, dropReason: "replaced by its re-ask: claim_length", answer: "gen-1" }).outcome, "replaced");
  assertEquals(claimOutcome({ ...base, kept: false, dropReason: "answer refused: schema", answer: "gen-1" }).outcome, "dropped");
  assertEquals(claimOutcome({ ...base, kept: false, dropReason: "duplicate: identical", answer: "decomp-3" }).outcome, "dropped");
});

Deno.test("SP-618 (c2): claims written = kept + dropped + replaced per answer — and run 8's N13 fails that arithmetic", () => {
  assertEquals(rawClaimsWritten(RUN8_N13.first)!.length, 7);                     // the nested list is not a claim
  assertEquals(rawClaimsWritten(RUN8_N13.second)!.length, 12);
  assertEquals(rawClaimsWritten("no json here"), null);
  assertEquals(rawClaimsWritten('{"left_over":[]}'), null);
  const answers = [
    { need: "N13", polarity: "not working", attempt: "gen-1", content: RUN8_N13.first },
    { need: "N13", polarity: "not working", attempt: "account-reask", content: RUN8_N13.second },
  ];
  const mk = (claim: string, answer: string, kept: boolean, dropReason = ""): ClaimOutcome =>
    claimOutcome({ need: "N13", polarity: "not working", claim, identity: kept ? "id" : null, parts: [], kept, dropReason, cited: 1, judged: 1, supporting: kept ? 1 : 0, answer });
  const second = rawClaimsWritten(RUN8_N13.second)!.map((c) => c.claim);
  const first = rawClaimsWritten(RUN8_N13.first)!.map((c) => c.claim);
  // RUN 8 AS IT RAN: the 12 second-answer claims went on to the judge; the 7 first-answer claims have no record
  const run8 = second.map((c, i) => mk(c, "account-reask", i % 2 === 0, i % 2 === 0 ? "" : "judge kept 0 of 1"));
  const a8 = claimAccountByAnswer(answers, run8);
  assertEquals([a8[0].written, a8[0].kept + a8[0].dropped + a8[0].replaced, a8[0].ok], [7, 0, false]);   // the fault
  assertEquals(a8[1].ok, true);
  // AFTER THE FIX: the 7 are judged, the 12 are recorded as replaced — both answers add up
  const fixed = [
    ...first.map((c, i) => mk(c, "gen-1", i < 4, i < 4 ? "" : "SP-493: the claim states another need's problem")),
    ...second.map((c) => mk(c, "account-reask", false, "accounting re-ask: claims are never adopted (SP-618) — not in the first answer")),
  ];
  assertEquals(claimAccountByAnswer(answers, fixed).map((x) => [x.written, x.kept, x.dropped, x.replaced, x.ok]), [[7, 4, 3, 0, true], [12, 0, 0, 12, true]]);
  // an unreadable answer is reported, never counted as adding up
  assertEquals(claimAccountByAnswer([{ need: "N13", polarity: "mixed", attempt: "gen-1", content: "…" }], [])[0], { need: "N13", polarity: "mixed", attempt: "gen-1", written: null, kept: 0, dropped: 0, replaced: 0, ok: false,
    unreadable: "unreadable, no readable re-ask", textClaims: 0 });   // SP-636 (brief 18): the class is named
});

// ── brief 17: SP-620 / SP-626 / SP-627 the one-part variant, SP-628, SP-625, SP-631 ─────────────────
const md5of17 = async (t: string) => encodeHex17(new Uint8Array(await stdCrypto17.subtle.digest("MD5", new TextEncoder().encode(t))));
const SP626_SENTENCE = "A quote may be about several things. Cite it under a claim when ANY part of it states that claim's part; its other topics are not a reason to leave it out.";
const RUNNER_17 = Deno.readTextFileSync(new URL("../../../scripts/run-need-patterns.ts", import.meta.url));

Deno.test("SP-626 (a): the one-part prompt is variant B plus ONE sentence and the ceiling — nothing else", async () => {
  assertEquals(await md5of17(GENERATOR_SYSTEM_ONEPART), "5c794a8bd4ca2f7fa6579aa578759f54");
  const lines = GENERATOR_SYSTEM_ONEPART.split("\n");
  // the sentence, word for word, once, as the LAST line of the STAY INSIDE THE NEED paragraph
  assertEquals(lines.filter((l) => l === SP626_SENTENCE).length, 1);
  const at = lines.indexOf(SP626_SENTENCE);
  assertEquals(lines[at - 1], "widening the claim to fit it.");
  assertEquals(lines[at + 1], "");
  assertEquals(lines.slice(0, at).some((l) => l.startsWith("STAY INSIDE THE NEED.")), true);
  assertEquals(lines[at - 4].startsWith("STAY INSIDE THE NEED."), true);
  // take the sentence out and put the draft's placeholder ceiling back: that is variant B, byte for byte
  const backToB = lines.filter((l) => l !== SP626_SENTENCE).join("\n").replace(`Return at most ${ONEPART_CEILING} patterns`, "Return at most 20 patterns");
  assertEquals(await md5of17(backToB), "0719a72bed3227e1e7a143eaf67c5cdd");
  assertEquals(ONEPART_CEILING, 16);
  assertEquals(GENERATOR_SYSTEM_ONEPART.includes("Return at most 16 patterns, most-evidenced first."), true);
  // SP-621: no agent-flavored or need-flavored example is left
  for (const gone of ["the agent does not", "contacting support", "about billing, not this need", "the final month is billed in full", "1 to 3", "EVERY part"]) {
    assertEquals(GENERATOR_SYSTEM_ONEPART.includes(gone), false, `the one-part prompt still says ${gone}`);
  }
});

Deno.test("SP-620 (b): the generator-only rubric copy — JUDGE_SYSTEM and the three measured generator prompts keep their md5s", async () => {
  assertEquals(await md5of17(LIVE_JUDGE_SYSTEM), "ea00edaeee4f5c4e4b59e4b859e116d3");
  assertEquals(await md5of17(GS_OLD_17), "2a1c83ab043b65896d3bb3d3dbddf747");
  assertEquals(await md5of17(GS_NEW_17), "0528425f894eb5cfed208430e7ba2262");
  assertEquals(await md5of17(GS_547_17), "653d0ebb9b745a13b1c275f1b7bca628");
  assertEquals(LIVE_GENERATOR_SYSTEM, GS_547_17);                 // the live generator is NOT the new variant
  assertEquals(GENERATOR_SYSTEM_ONEPART.startsWith(GENERATOR_RUBRIC_TEXT_ONEPART + "\n"), true);
  // the judge never reads the one-part wording; it still reads "1 to 3"
  assertEquals(LIVE_JUDGE_SYSTEM.includes("ONE PART"), false);
  assertEquals(LIVE_JUDGE_SYSTEM.includes("The PARTS are 1 to 3 single predicates the claim asserts."), true);
  const fp = Deno.readTextFileSync(new URL("../../../scripts/judge-prompt-md5.ts", import.meta.url));
  assertEquals(fp.includes('"GENERATOR_SYSTEM_ONEPART"') && fp.includes('"GENERATOR_RUBRIC_TEXT_ONEPART"'), true);
  assertEquals(RUNNER_17.includes("onepart: GENERATOR_SYSTEM_ONEPART,"), true);
  assertEquals(RUNNER_17.includes('const GEN_PROMPT = arg("gen-prompt", "new547");'), true);   // the default is unchanged
});

const L17 = new Map(Array.from({ length: 20 }, (_, i) => [`q${i + 1}`, `id${i + 1}`] as const));
const claim17 = (n: number, parts: string[] = [`thing ${n} happens`]) => ({ claim: `Claim number ${n} about something`, parts, polarity: "not working", quotes: [`q${((n - 1) % 20) + 1}`], representative: null });

Deno.test("SP-620 (c): the one-part door — exactly 1 part, refused by its own kind with its own guidance", () => {
  const two = JSON.stringify({ patterns: [claim17(1), claim17(2, ["the bill rises", "no notice is given"])], left_over: [] });
  const pass = parseGeneratedPass(two, L17, [], ONEPART_GEN_LIMITS);
  assertEquals([pass.patterns.length, pass.dropped.length], [1, 1]);
  assertEquals(pass.dropped[0].kind, "one_part");
  assertEquals(pass.dropped[0].why.startsWith("the claim has 2 parts; this prompt allows exactly 1"), true);
  assertEquals(reaskGuidance("one_part", ONEPART_GEN_LIMITS), GUIDANCE_17.one_part);
  assertEquals(GUIDANCE_17.one_part.includes("exactly ONE part"), true);
  // the strict reading refuses the answer, and a re-asked claim faces the same door
  assertThrows(() => parseGenerated(two, L17, ONEPART_GEN_LIMITS), Error, "exactly 1");
  assertThrows(() => parseReaskedClaim(JSON.stringify({ patterns: [claim17(3, ["a", "b"])] }), L17, [], ONEPART_GEN_LIMITS), Error, "exactly 1");
  assertEquals(parseReaskedClaim(JSON.stringify({ patterns: [claim17(3)] }), L17, [], ONEPART_GEN_LIMITS).parts.length, 1);
  // every other variant is as it was: 2 and 3 parts pass, 4 is `parts_count`
  assertEquals(parseGeneratedPass(two, L17).dropped.length, 0);
  assertEquals(parseGeneratedPass(JSON.stringify({ patterns: [claim17(1, ["a", "b", "c", "d"])] }), L17).dropped[0].kind, "parts_count");
  assertEquals(DEFAULT_GEN_LIMITS, { maxParts: 3, ceiling: 12 });
  assertEquals(ONEPART_GEN_LIMITS, { maxParts: 1, ceiling: 16 });
});

Deno.test("SP-627 (d): the ceiling of 16 is the variant's value in all three places", () => {
  const n = (k: number) => JSON.stringify({ patterns: Array.from({ length: k }, (_, i) => claim17(i + 1)), left_over: [] });
  // 1 the prompt text — pinned in SP-626 (a).  2 the whole-answer refusal:
  assertEquals(parseGeneratedPass(n(16), L17, [], ONEPART_GEN_LIMITS).patterns.length, 16);
  assertThrows(() => parseGeneratedPass(n(17), L17, [], ONEPART_GEN_LIMITS), Error, "ceiling of 16");
  assertThrows(() => parseGeneratedPass(n(13), L17), Error, "ceiling of 12");       // the measured variants keep 12
  assertEquals(reaskGuidance("ceiling", ONEPART_GEN_LIMITS).startsWith("Return at most 16 patterns."), true);
  assertEquals(reaskGuidance("ceiling"), GUIDANCE_17.ceiling);
  // 3 the per-pass cut, and every line that prints the number, read the variant's value
  const cut = applyCeilingPerPass([Array.from({ length: 18 }, (_, i) => i)], ONEPART_GEN_LIMITS.ceiling);
  assertEquals([cut.kept.length, cut.cut.length], [16, 2]);
  // SP-635 (brief 18): the ceiling is applied to the claims as written; split halves ride outside it
  assertEquals(RUNNER_17.includes("applyCeilingPerPass(livePasses.map((ps) => ps.filter((c) => !c.splitFirst)), CEILING)"), true);
  assertEquals(RUNNER_17.includes('const GEN_LIMITS: GenLimits = GEN_PROMPT === "onepart" ? ONEPART_GEN_LIMITS : DEFAULT_GEN_LIMITS;'), true);
  const body = RUNNER_17.slice(RUNNER_17.indexOf("const routed = makeRoutedModel"));
  assertEquals(/\bPATTERN_CEILING\b/.test(body), false, "the runner still reads the fixed ceiling somewhere");
  for (const call of ["parseGeneratedPass(gen.content, labels, [], GEN_LIMITS)", "parseGeneratedPass(again.content, labels, [], GEN_LIMITS)", "parseGeneratedPass(again.content, labels, existingForGate, GEN_LIMITS)"]) {
    assertEquals(RUNNER_17.includes(call), true, `the runner does not pass the limits to ${call}`);
  }
  // SP-634 (brief 18): one whole-claim re-ask is left (a refusal about the quote list); the field
  // re-asks and the split read through their own parsers, with the same limits
  assertEquals((RUNNER_17.match(/parseReaskedClaim\([^\n]*GEN_LIMITS\)/g) ?? []).length, 1);
  assertEquals((RUNNER_17.match(/mergeFieldReask\([^\n]*GEN_LIMITS\)/g) ?? []).length, 2);
  assertEquals((RUNNER_17.match(/parseSplitReask\([^\n]*GEN_LIMITS\)/g) ?? []).length, 1);
});

Deno.test("SP-628 (e): a part that joins two things is re-asked once and the claim is never dropped", () => {
  const mk = (name: string, part: string): ProposedPattern => ({ name, parts: [part], polarity: "not working", signalIds: ["id1"], representativeSignalId: null, citedLabels: ["q1"] });
  const orig = mk("Calls are cut off", "the call is disconnected during transfer or conversation");
  assertEquals(CONJ_17.test(orig.parts[0]), true);
  // a rewrite that no longer joins two things replaces the claim
  assertEquals(conjunctionReaskOutcome(orig, mk("Calls are cut off", "the call is disconnected during transfer")), { outcome: "rewritten", adopt: true });
  // every other answer leaves the ORIGINAL standing
  assertEquals(conjunctionReaskOutcome(orig, mk("Calls are cut off", "the call is disconnected during transfer or conversation")), { outcome: "unchanged", adopt: false });
  assertEquals(conjunctionReaskOutcome(orig, mk("Calls drop", "the call drops and nobody calls back")), { outcome: "still_joined", adopt: false });
  assertEquals(conjunctionReaskOutcome(orig, null), { outcome: "refused", adopt: false });
  assertEquals(partConjunctionWhy("a or b"), 'the part joins two things with "and" or "or": "a or b"');
  assertEquals(PART_CONJUNCTION_GUIDANCE.includes("return the claim unchanged"), true);
  // the runner: the check is the one-part variant's, it re-asks ONCE per hit, and its block drops nothing
  const block = RUNNER_17.slice(RUNNER_17.indexOf("if (CONJUNCTION_REASK) {"), RUNNER_17.indexOf("const labelToId = labels;"));
  assertEquals(RUNNER_17.includes('const CONJUNCTION_REASK = GEN_PROMPT === "onepart";'), true);
  assertEquals((block.match(/await call\("generator"/g) ?? []).length, 1);
  assertEquals(block.includes("droppedClaims.push"), false);
  assertEquals(block.includes("continue;   //"), false);
  assertEquals(block.includes("conjunctionHits.push"), true);
  assertEquals(block.includes("`replaced by its re-ask: ${PART_CONJUNCTION_KIND}`") && block.includes("re-ask not adopted: ${res.outcome}"), true);
  assertEquals(claimDropClass("re-ask not adopted: unchanged — the original claim stands (SP-628)"), "reask_not_adopted");
  assertEquals(RUNNER_17.includes("SP-628: ${conjunctionHits.length} part(s) joined two things"), true);
});

// SP-625 (f), brief 17's record-only test, is REMOVED with the path it tested (SP-638, brief 18): every
// cited quote is now judged live. "SP-638 in the runner" below asserts the path is gone.

Deno.test("SP-631: the generator call and the pattern judge call both set num_ctx 8192 themselves", () => {
  assertEquals(RUNNER_17.includes("const PATTERN_NUM_CTX = 8192;"), true);
  assertEquals(RUNNER_17.includes("num_predict: PATTERN_NUM_PREDICT, num_ctx: PATTERN_NUM_CTX, think: false, keep_alive: 0 }"), true);
  assertEquals(RUNNER_17.includes("{ temperature: 0, seed: 42, num_predict: judgeNumPredictNow, num_ctx: PATTERN_NUM_CTX, think: JUDGE_THINK }"), true);
});

// ── brief 18 (2026-11-24): SP-634, SP-635, SP-636, SP-637, SP-638 ───────────────────────────────────
import {
  adoptNominationsForRecovered as adoptNoms18, buildFieldReask as buildFieldReask18, buildSplitReask as buildSplitReask18,
  belongsDecisionLine as voteLine18, claimAccountByAnswer as claimAccount18, decideBelongs as decide18,
  fieldReaskGuidance as fieldGuidance18, mergeFieldReask as mergeField18, parseFieldReask as parseField18,
  parseGeneratedPass as parsePass18, parseSplitReask as parseSplit18, reaskMayChange as mayChange18,
  reaskMayChangeText as mayChangeText18, ONEPART_GEN_LIMITS as ONEPART18, UNREADABLE_REASKED as UNREADABLE_REASKED18,
  UNREADABLE_NOT_REASKED as UNREADABLE_NOT18, JUDGE_SYSTEM as JUDGE_SYSTEM18, GENERATOR_SYSTEM_ONEPART as GS_ONEPART18,
  type ProposedPattern as Proposed18, type GeneratedPass as Pass18,
} from "./needPatterns.ts";
import { parseModelLoads as parseLoads18, callsByLoad as callsByLoad18 } from "../../../scripts/ollamaLoads.ts";

const RUN10 = JSON.parse(await Deno.readTextFile(new URL("./needPatterns.run10.fixture.json", import.meta.url))) as
  { labels: Record<string, Record<string, string>>; answers: Record<string, string> };
const RUNNER_18 = Deno.readTextFileSync(new URL("../../../scripts/run-need-patterns.ts", import.meta.url));
const labels18 = (k: string) => new Map(Object.entries(RUN10.labels[k]));
const id8 = (labels: Map<string, string>, ls: readonly string[]) => ls.map((l) => labels.get(l)!.slice(0, 8));

/** Run 10's N13 "not working" pass, taken the way the runner now takes it: the readable answer, then
 *  each refused claim's saved re-ask through the SP-634 merge. */
function n13PassAfterSp634(): { pass: Pass18; labels: Map<string, string>; recovered: Map<number, Proposed18> } {
  const labels = labels18("N13/not working");
  const pass = parsePass18(RUN10.answers["N13/not working/gen-2"], labels, [], ONEPART18);
  const recovered = new Map<number, Proposed18>();
  for (const d of pass.dropped) {
    const m = mergeField18(d.raw!, parseField18(RUN10.answers[`N13/not working/claim-reask-${d.ordinal}`]), d.kind, labels, pass.patterns, ONEPART18);
    pass.patterns = [...pass.patterns, m.pattern];
    adoptNoms18(pass, d.ordinal, m.pattern, labels);
    recovered.set(d.ordinal, m.pattern);
  }
  return { pass, labels, recovered };
}

Deno.test("SP-634: each per-claim re-ask may change one thing, and says which", () => {
  assertEquals(mayChange18("part_length"), ["parts"]);
  assertEquals(mayChange18("one_part"), ["parts"]);
  assertEquals(mayChange18("claim_length"), ["claim"]);
  assertEquals(mayChange18("polarity"), ["polarity"]);
  assertEquals(mayChange18("polarity_mismatch"), ["polarity", "claim", "parts"]);
  // a refusal that IS about the quote list has no original list to keep: the old whole-claim re-ask
  for (const k of ["citation", "no_quotes", "schema"]) assertEquals(mayChange18(k), ["quotes"]);
  assertEquals(mayChangeText18("part_length"), "the part");
  assertEquals(mayChangeText18("claim_length"), "the claim sentence");
  // the field guidance never tells the generator to change its quotes
  for (const k of ["part_length", "one_part", "claim_length", "polarity_mismatch", "duplicate_claim"]) {
    assertEquals(/cite only|quote labels|both sets of quotes/i.test(fieldGuidance18(k, ONEPART18, "mixed")), false, k);
  }
});

Deno.test("SP-634: the re-ask message asks for the one field, shows only the claim's own quotes, and forbids the rest", () => {
  const labels = labels18("N13/not working");
  const pass = parsePass18(RUN10.answers["N13/not working/gen-2"], labels, [], ONEPART18);
  const d = pass.dropped.find((x) => x.ordinal === 3)!;
  assertEquals(d.kind, "part_length");
  assertEquals(d.raw!.quotes.length, 4);
  const q = (l: string) => ({ label: l, quote: { signalId: labels.get(l)!, quote: `text of ${l}`, site: "", eventDate: null, brand: "", polarity: "not working" as const } });
  const msg = buildFieldReask18("NEED", d.raw!, d, fieldGuidance18(d.kind, ONEPART18), d.raw!.quotes.map(q));
  assertEquals(msg.includes('JSON only: {"parts":["<predicate>"]}'), true);
  assertEquals(msg.includes("Do NOT list quotes."), true);
  assertEquals(msg.includes('Do NOT write "left_over".'), true);
  assertEquals(msg.includes("THIS PATTERN'S OWN QUOTES, for reference only:"), true);
  // only the claim's own four quotes are in the message — not the pass's 49
  assertEquals((msg.match(/^q\d+ \[/gm) ?? []).length, 4);
  // the old example that run 10's answers copied ("quotes":["q1"]) is gone from the message
  assertEquals(msg.includes('"quotes":["q1"]'), false);
});

Deno.test("SP-634 on run 10's fixtures: the 11 quotes lost to length re-asks survive", () => {
  const { pass, labels, recovered } = n13PassAfterSp634();
  assertEquals(recovered.size, 9);
  const cited = new Set(pass.patterns.flatMap((p) => p.signalIds.map((s) => s.slice(0, 8))));
  for (const lost of ["2a89fcb5", "7b62d090", "dad3eab5", "7527c432", "d1be91ad", "806dbe70", "8a57e5fb", "cb400bff", "d4f5c99a", "afb7abc3", "c4e961c6"]) {
    assertEquals(cited.has(lost), true, `${lost} is cited by no claim after its length re-ask`);
  }
  // each recovered claim holds EXACTLY its original's quotes — the re-ask's own list is not read
  const first = parsePass18(RUN10.answers["N13/not working/gen-2"], labels, [], ONEPART18);
  for (const d of first.dropped) {
    const nominated = pass.promoted.filter((pr) => pr.resolved && pr.belongsTo === d.ordinal && !pr.alreadyCited).map((pr) => pr.label);
    assertEquals(recovered.get(d.ordinal)!.citedLabels.filter((l) => !nominated.includes(l)), d.raw!.quotes, `claim ${d.ordinal}`);
  }
  // claim 3 came back from run 10's re-ask citing only q1; it now holds its own four, and q1 is not among them
  assertEquals(id8(labels, recovered.get(3)!.citedLabels), ["2a89fcb5", "9457cd7a", "7b62d090", "dad3eab5"]);
  // only the part was taken: the claim sentence is the original's
  assertEquals(recovered.get(3)!.name, "Support fails to resolve the issue on the first contact");
  assertEquals(recovered.get(3)!.parts, ["the initial support interaction fails to fix the problem"]);
  assertEquals(recovered.get(8)!.name, "Automated systems and AI fail to connect users to help");
  assertEquals(id8(labels, recovered.get(8)!.citedLabels), ["7527c432", "d1be91ad"]);
  for (const p of recovered.values()) { assertEquals(p.parts.length, 1); assertEquals(p.parts[0].length <= 80, true); }
});

Deno.test("SP-634 on run 10's fixtures: the 4 nominations lost to length re-asks follow their claim", () => {
  const labels = labels18("N13/not working");
  const before = parsePass18(RUN10.answers["N13/not working/gen-2"], labels, [], ONEPART18);
  // as parsed, the four name a claim refused at the door: unresolved, and left over
  const lost = ["fb8c710d", "75d3e101", "d3866c50", "ccdb89cd"];
  const unresolved = before.promoted.filter((pr) => !pr.resolved).map((pr) => labels.get(pr.label)!.slice(0, 8)).sort();
  assertEquals(unresolved, [...lost].sort());
  const { pass, recovered } = n13PassAfterSp634();
  assertEquals(pass.promoted.filter((pr) => !pr.resolved).length, 0);
  const where = new Map(pass.promoted.map((pr) => [labels.get(pr.label)!.slice(0, 8), pr]));
  assertEquals(where.get("fb8c710d")!.claim, recovered.get(1)!.name);
  assertEquals(where.get("75d3e101")!.claim, recovered.get(1)!.name);
  assertEquals(where.get("d3866c50")!.claim, recovered.get(2)!.name);
  assertEquals(where.get("ccdb89cd")!.claim, recovered.get(7)!.name);
  for (const l of lost) {
    const pr = where.get(l)!;
    assertEquals(pr.resolved && !pr.alreadyCited, true);
    // nominated: on the claim's list, to be judged after its own citations
    assertEquals(recovered.get(pr.belongsTo)!.signalIds.some((s) => s.startsWith(l)), true);
    assertEquals(pass.leftOver.some((x) => labels.get(x.label)!.startsWith(l)), false, `${l} is still left over`);
  }
});

Deno.test("SP-634: the merge keeps the original's quotes, takes only the named field, and faces the same door", () => {
  const labels = new Map([["q1", "id-1"], ["q2", "id-2"], ["q3", "id-3"]]);
  const raw = { claim: "Calls drop during transfer", parts: ["x".repeat(81)], polarity: "not working", quotes: ["q2", "q3"], representative: "q3" };
  // the answer tries to change the claim and the quotes as well; only the part is taken
  const answer = parseField18('{"patterns":[{"claim":"Something else entirely","parts":["the call drops during transfer"],"polarity":"not working","quotes":["q1"],"representative":"q1"}]}');
  const m = mergeField18(raw, answer, "part_length", labels, [], ONEPART18);
  assertEquals(m.took, ["parts"]); assertEquals(m.widened, false);
  assertEquals(m.pattern.name, "Calls drop during transfer");
  assertEquals(m.pattern.parts, ["the call drops during transfer"]);
  assertEquals(m.pattern.citedLabels, ["q2", "q3"]);
  assertEquals(m.pattern.representativeSignalId, "id-3");
  // the asked-for shape is read too
  assertEquals(parseField18('{"parts":["the call drops"]}'), { parts: ["the call drops"] });
  assertEquals(parseField18('{"part":"the call drops"}'), { parts: ["the call drops"] });
  // a part that is still over the limit fails the same door: the claim is dropped and named, as before
  assertThrows(() => mergeField18(raw, { parts: ["y".repeat(81)] }, "part_length", labels, [], ONEPART18), Error, "the limit is 80");
  // an answer without the field it was asked for is refused
  assertThrows(() => mergeField18(raw, { claim: "only a claim" }, "part_length", labels, [], ONEPART18), Error, "did not return the parts");
  // WIDENED: the original's claim is ALSO over its bound, so the re-ask's claim is taken too — never its quotes
  const both = { ...raw, claim: "c".repeat(95) };
  const w = mergeField18(both, { claim: "Calls drop", parts: ["the call drops"] }, "part_length", labels, [], ONEPART18);
  assertEquals(w.widened, true); assertEquals(w.pattern.name, "Calls drop"); assertEquals(w.pattern.citedLabels, ["q2", "q3"]);
  // a whole-claim kind is not a field re-ask
  assertThrows(() => mergeField18(raw, {}, "citation", labels, [], ONEPART18), Error, "whole-claim re-ask");
  // the runner: SP-546 runs BEFORE the accounting, and both field re-asks go through the merge
  assertEquals(RUNNER_18.indexOf("for (const d of pass.dropped) {") < RUNNER_18.indexOf("let account = accountForQuotes(labels, proposed, pass.leftOver);"), true);
  assertEquals((RUNNER_18.match(/mergeFieldReask\(/g) ?? []).length, 2);
  assertEquals((RUNNER_18.match(/adoptNominationsForRecovered\(pass, d\.ordinal, recovered, labels\)/g) ?? []).length, 1);
});

/** A claim as the runner holds it when the "and"/"or" check runs. */
function asProposed(labels: Map<string, string>, name: string, part: string, ls: string[], rep: string | null = null): Proposed18 {
  return { name, parts: [part], polarity: "not working", signalIds: ls.map((l) => labels.get(l)!), representativeSignalId: rep ? labels.get(rep)! : null, citedLabels: [...ls] };
}

Deno.test("SP-635: one claim per predicate — a quote goes to one half, both, or (assigned to neither) every half", () => {
  const labels = new Map([["q1", "id-1"], ["q2", "id-2"], ["q3", "id-3"], ["q4", "id-4"], ["q5", "id-5"], ["q9", "id-9"]]);
  const orig = asProposed(labels, "Outages are frequent or long", "the service drops repeatedly or lasts for extended periods", ["q1", "q2", "q3", "q4", "q5"], "q2");
  const answer = JSON.stringify({ patterns: [
    { claim: "Outages are frequent", parts: ["the service drops repeatedly"], polarity: "working", quotes: ["q1", "q2", "q9"] },
    { claim: "Outages are long", parts: ["an outage lasts for an extended period"], polarity: "not working", quotes: ["q2", "q3"] },
  ] });
  // q4 is an OWN citation assigned to neither; q5 reached the original through `belongs_to` alone
  const r = parseSplit18(answer, labels, [], orig, ["q1", "q2", "q3", "q4"], ["q5"], ONEPART18);
  assertEquals([r.outcome, r.adopt, r.halves.length], ["split", true, 2]);
  const [a, b] = r.halves;
  assertEquals(a.assigned, ["q1", "q2"]); assertEquals(b.assigned, ["q2", "q3"]);       // q2 under both
  assertEquals(a.carried, ["q4"]); assertEquals(b.carried, ["q4"]);                     // q4 carried to every half
  assertEquals(a.nominated, ["q5"]); assertEquals(b.nominated, ["q5"]);                 // the nomination follows the same rule
  assertEquals(a.foreign, ["q9"]); assertEquals(a.pattern.citedLabels.includes("q9"), false);   // not the original's: ignored, named
  assertEquals(a.pattern.citedLabels, ["q1", "q2", "q4", "q5"]);
  assertEquals(b.pattern.citedLabels, ["q2", "q3", "q4", "q5"]);
  // every one of the original's quotes reaches the judge under some half
  assertEquals([...new Set([...a.pattern.citedLabels, ...b.pattern.citedLabels])].sort(), ["q1", "q2", "q3", "q4", "q5"]);
  // the polarity is the original's whatever the answer wrote, and the representative stays with the first half that holds it
  assertEquals([a.pattern.polarity, b.pattern.polarity], ["not working", "not working"]);
  assertEquals([a.pattern.representativeSignalId, b.pattern.representativeSignalId], ["id-2", null]);
  for (const h of r.halves) assertEquals(h.pattern.parts.length, 1);
  // a nomination the generator assigns to ONE half goes to that half only
  const r2 = parseSplit18(answer.replace('"quotes":["q2","q3"]', '"quotes":["q2","q3","q5"]'), labels, [], orig, ["q1", "q2", "q3", "q4"], ["q5"], ONEPART18);
  assertEquals([r2.halves[0].nominated, r2.halves[1].nominated], [[], ["q5"]]);
});

Deno.test("SP-635: still joined, unchanged, unreadable or refused — the ORIGINAL stands; nothing is dropped", () => {
  const labels = new Map([["q1", "id-1"], ["q2", "id-2"]]);
  const orig = asProposed(labels, "Repairs fail", "repairs or upgrades do not fix the problem", ["q1", "q2"]);
  const one = (claim: string, part: string) => JSON.stringify({ patterns: [{ claim, parts: [part], polarity: "not working", quotes: ["q1"] }] });
  assertEquals(parseSplit18(one("Repairs fail", "repairs or upgrades do not fix the problem"), labels, [], orig, ["q1", "q2"], [], ONEPART18).outcome, "unchanged");
  const sj = parseSplit18(one("Fixes fail", "repairs and swaps do not fix the problem"), labels, [], orig, ["q1", "q2"], [], ONEPART18);
  assertEquals([sj.outcome, sj.adopt], ["still_joined", false]);
  const cut = parseSplit18('{"patterns":[{"claim":"Repairs fa', labels, [], orig, ["q1", "q2"], [], ONEPART18);
  assertEquals([cut.outcome, cut.adopt, cut.halves.length], ["refused", false, 0]);
  // a half over the 80-character part limit refuses the split (the limit stays)
  assertEquals(parseSplit18(one("Repairs fail", "z".repeat(81)), labels, [], orig, ["q1", "q2"], [], ONEPART18).outcome, "refused");
  // a half whose claim another pattern of the pass already carries refuses the split
  const taken = asProposed(labels, "Fixes fail", "the fix does not hold", ["q1"]);
  assertEquals(parseSplit18(one("Fixes fail", "the repair does not fix the problem"), labels, [taken], orig, ["q1", "q2"], [], ONEPART18).outcome, "refused");
  // ONE claim back, no longer joined: a rewrite — and ALL of the original's quotes stay (q2 is carried)
  const rw = parseSplit18(one("Repairs fail", "the repair does not fix the problem"), labels, [], orig, ["q1", "q2"], [], ONEPART18);
  assertEquals([rw.outcome, rw.adopt], ["rewritten", true]);
  assertEquals(rw.halves[0].pattern.citedLabels, ["q1", "q2"]);
  assertEquals(rw.halves[0].carried, ["q2"]);
  // the runner's block: one generator call per hit, it drops nothing, and a refused answer leaves the original
  const block = RUNNER_18.slice(RUNNER_18.indexOf("if (CONJUNCTION_REASK) {"), RUNNER_18.indexOf("const labelToId = labels;"));
  assertEquals((block.match(/await call\("generator"/g) ?? []).length, 1);
  assertEquals(block.includes("droppedClaims.push"), false);
  assertEquals(block.includes("re-ask not adopted: ${res.outcome} — the original claim stands (SP-635)"), true);
  assertEquals(block.includes("ci += halves.length - 1;"), true);     // a half is never re-asked
});

Deno.test("SP-635 on run 10's fixtures: the 12 quotes lost to SP-628 rewrites each reach the judge under some claim", () => {
  const reach = new Set<string>();
  const take = (labels: Map<string, string>, orig: Proposed18, own: string[], noms: string[], saved: string, existing: Proposed18[] = []) => {
    const r = parseSplit18(saved, labels, existing, orig, own, noms, ONEPART18);
    const standing = r.adopt ? r.halves.map((h) => h.pattern) : [orig];
    for (const p of standing) for (const s of p.signalIds) reach.add(s.slice(0, 8));
    // whatever the answer did, every one of the original's quotes is still under a standing claim
    const after = new Set(standing.flatMap((p) => p.citedLabels));
    for (const l of [...own, ...noms]) assertEquals(after.has(l), true, `${l} of "${orig.name}" lost`);
    return r;
  };
  // N13: the pass as SP-634 leaves it, then run 10's three saved "and"/"or" answers that had dropped quotes
  const { pass, labels: n13, recovered } = n13PassAfterSp634();
  const nomsOf = (p: Proposed18) => pass.promoted.filter((pr) => pr.resolved && pr.claim === p.name && !pr.alreadyCited).map((pr) => pr.label);
  const split = (p: Proposed18, key: string) => { const n = nomsOf(p); return take(n13, p, p.citedLabels.filter((l) => !n.includes(l)), n, RUN10.answers[`N13/not working/${key}`], pass.patterns.filter((x) => x !== p)); };
  const hold = split(recovered.get(1)!, "conj-reask-8");
  assertEquals(hold.outcome, "rewritten");
  assertEquals(hold.halves[0].nominated.map((l) => n13.get(l)!.slice(0, 8)).sort(), ["75d3e101", "fb8c710d"]);   // both nominations carried
  split(pass.patterns.find((p) => p.name === "Support staff are rude, dismissive, or unhelpful")!, "conj-reask-2");
  split(pass.patterns.find((p) => p.name === "Disconnecting service results in unexpected charges or harassment")!, "conj-reask-3");
  // P1: the first answer's claims, then run 10's four saved answers
  const p1 = labels18("P1/not working");
  const p1pass = parsePass18(RUN10.answers["P1/not working/gen-1"], p1, [], ONEPART18);
  for (const [name, key] of [["Outages occur with high frequency or duration", "conj-reask-1"], ["Credits for outages are not applied or denied", "conj-reask-3"],
    ["Outages are caused by infrastructure or technician errors", "conj-reask-4"], ["Support fails to resolve or acknowledge outages", "conj-reask-5"]] as const) {
    const p = p1pass.patterns.find((x) => x.name === name)!;
    take(p1, p, [...p.citedLabels], [], RUN10.answers[`P1/not working/${key}`], p1pass.patterns.filter((x) => x !== p));
  }
  for (const lost of ["485b1a30", "ca8a4568", "55fcf875", "8c10efb7", "48695102", "524f4e7f", "92c0bc80", "f6417a07", "286ee926", "c5922dcc", "ccdb89cd", "cb400bff"]) {
    assertEquals(reach.has(lost), true, `${lost} reaches the judge under no claim`);
  }
});

Deno.test("SP-635: the split message names the pattern, its own quotes only, and the carry rule", () => {
  const q = (l: string) => ({ label: l, quote: { signalId: l, quote: `text of ${l}`, site: "", eventDate: null, brand: "", polarity: "not working" as const } });
  const msg = buildSplitReask18("NEED", { ordinal: 3, name: "A or B happens", part: "a happens or b happens", polarity: "not working" }, ["q4", "q7"].map(q));
  for (const needle of ["write ONE PATTERN PER THING", "A quote may go under more than one.", "A quote you put under none is kept under all of them", "return the pattern unchanged, as one pattern", 'Do NOT write "left_over".', "at most 80 characters"]) {
    assertEquals(msg.includes(needle), true, needle);
  }
  assertEquals((msg.match(/^q\d+ \[/gm) ?? []).length, 2);
  // split halves are outside the ceiling: the ceiling is applied to the claims as written
  assertEquals(RUNNER_18.includes("applyCeilingPerPass(livePasses.map((ps) => ps.filter((c) => !c.splitFirst)), CEILING)"), true);
});

Deno.test("SP-636: an unreadable first answer whose re-ask is readable carries its own class and passes the account", () => {
  const cut = RUN10.answers["N13/not working/gen-1"], ok = RUN10.answers["N13/not working/gen-2"];
  const a = (attempt: string, content: string) => ({ need: "N13", polarity: "not working", attempt, content });
  const both = claimAccount18([a("gen-1", cut), a("gen-2", ok)], []);
  assertEquals([both[0].written, both[0].unreadable, both[0].ok, both[0].textClaims], [null, UNREADABLE_REASKED18, true, 10]);
  assertEquals(UNREADABLE_REASKED18, "unreadable, re-asked");
  // the readable re-ask is still held to the arithmetic: 16 written, none recorded here → not ok
  assertEquals([both[1].written, both[1].unreadable, both[1].ok], [16, null, false]);
  // no readable re-ask → the class says so, and the account fails as before
  const alone = claimAccount18([a("gen-1", cut)], []);
  assertEquals([alone[0].unreadable, alone[0].ok], [UNREADABLE_NOT18, false]);
  const twice = claimAccount18([a("gen-1", cut), a("gen-2", cut)], []);
  assertEquals(twice.map((x) => x.ok), [false, false]);
  // only the pass's FIRST answer earns the class by a re-ask; an unreadable per-claim re-ask still fails
  assertEquals(claimAccount18([a("claim-reask-3", cut), a("gen-2", ok)], [])[0].ok, false);
  // SP-634: a field re-ask's answer wrote one claim
  const f = claimAccount18([{ ...a("claim-reask-3", '{"parts":["the call drops"]}'), field: true }], []);
  assertEquals([f[0].written, f[0].unreadable], [1, null]);
  assertEquals(RUNNER_18.includes("${a.unreadable.toUpperCase()} (SP-636)"), true);
});

Deno.test("SP-638: every quote is judged, a vote counts only from a quote that states the part, a majority of no refuses, a tie refuses", () => {
  const v = (statesAll: boolean, belongs: boolean | null, id = "s") => ({ signalId: id, statesAll, belongs });
  const d = (votes: ReturnType<typeof v>[]) => { const r = decide18(votes); return [r.yes, r.no, r.refused, r.tie, r.oldRefused, r.oldFirstNoAt]; };
  // a majority of yes keeps the claim although the first-no rule would have refused it
  assertEquals(d([v(true, true), v(true, false), v(true, true)]), [2, 1, false, false, true, 2]);
  // a majority of no refuses
  assertEquals(d([v(true, true), v(true, false), v(true, false)]), [1, 2, true, false, true, 2]);
  // A TIE refuses
  assertEquals(d([v(true, true), v(true, false)]), [1, 1, true, true, true, 2]);
  // A ONE-QUOTE CLAIM: its one counting vote decides it
  assertEquals(d([v(true, true)]), [1, 0, false, false, false, null]);
  assertEquals(d([v(true, false)]), [0, 1, true, false, true, 1]);
  // a one-quote claim whose quote does NOT state the part casts no vote: not refused by SP-493 —
  // it is decided as before by its kept quotes, and it keeps none
  const none = decide18([v(false, false, "x")]);
  assertEquals([none.yes, none.no, none.refused, none.oldRefused], [0, 0, false, true]);
  assertEquals(none.notCounted, [{ signalId: "x", why: "part not stated", belongs: false }]);
  // no verdict at all (empty twice, unreadable) is not a vote either
  assertEquals(decide18([v(false, null, "e"), v(true, true)]).notCounted, [{ signalId: "e", why: "no verdict", belongs: null }]);
  // run 10, "Support denies supervisor access or escalation options": yes on a quote that did not state
  // the part, no on another that did not, then two stating quotes that said yes → kept, 2 to 0
  assertEquals(d([v(false, true), v(false, false), v(true, true), v(true, true)]), [2, 0, false, false, true, 2]);
  // run 10, "Equipment provided is defective or ineffective": 1 stating yes, 1 non-stating no → kept
  assertEquals(d([v(true, true), v(false, false)]), [1, 0, false, false, true, 2]);
  // run 10, "Price increases are hidden or applied without notice": five stating quotes, five no → refused
  assertEquals(d(Array.from({ length: 5 }, () => v(true, false))), [0, 5, true, false, true, 1]);
  const line = voteLine18("A claim", decide18([v(true, true), v(true, false), v(false, false)]), "REFUSED on a tie", "refused at answered quote 2");
  assertEquals(line, 'SP-638 votes "A claim": yes 1 · no 1 (tie) · not counted 1 (1 part not stated, 1 of them said no) → REFUSED on a tie · first-no rule: refused at answered quote 2');
});

Deno.test("SP-638 in the runner: no stop at a no, the vote decides, the record-only path is gone, and --pairs-json carries the vote", async () => {
  assertEquals(RUNNER_18.includes("if (!v.belongsToNeed) { belongs = false; break; }"), false);
  assertEquals(RUNNER_18.includes("const belongs = !decision.refused;"), true);
  // support is the part stated AND the quote's own belongs answer yes
  assertEquals(RUNNER_18.includes("supports: v.supports && v.belongsToNeed, statesAll: v.supports, belongs: v.belongsToNeed, nominated: nominated.has(qt.signalId)"), true);
  // the vote is over the claim's OWN citations; nominations do not vote (SP-578 stands)
  assertEquals(RUNNER_18.includes("...verdicts.filter((x) => !x.nominated).map((x) => ({ signalId: x.q.signalId, statesAll: x.statesAll, belongs: x.belongs as boolean | null })),"), true);
  // SP-625's record-only path is REMOVED, not left unused
  for (const gone of ["RECORD_ONLY_SUFFIX", "recordOnlyQueue", "recordOnlyByClaim", "record_only: true", "-record-only", "RECORD-ONLY"]) {
    assertEquals(RUNNER_18.includes(gone), false, `${gone} is still in the runner`);
  }
  assertEquals(RUNNER_18.includes("...(voteRec ? { sp638: voteRec } : {}) });"), true);
  assertEquals(RUNNER_18.includes("new_rule: newOutcome, old_first_no_rule: oldOutcome };"), true);
  // JUDGE_SYSTEM and the one-part generator prompt did not move
  assertEquals(await md5of17(JUDGE_SYSTEM18), "ea00edaeee4f5c4e4b59e4b859e116d3");
  assertEquals(await md5of17(GS_ONEPART18), "5c794a8bd4ca2f7fa6579aa578759f54");
});

Deno.test("SP-637: every model load's batch size and free memory are read from the server's log, and calls are placed under their load", () => {
  const log = [
    'time=2026-11-24T09:34:24.339-08:00 level=INFO source=llama_server.go:433 msg="starting llama-server" cmd="/x/llama-server --model /m/sha256-d372de8e9348 --port 1 -c 8192 -np 1 --flash-attn auto -b 1024 -ub 1024 --keep 4"',
    'time=2026-11-24T09:34:24.340-08:00 level=INFO source=sched.go:613 msg="system memory" total="64.0 GiB" free="28.3 GiB" free_swap="0 B"',
    "llama_context: n_ctx         = 8192",
    "llama_context: n_batch       = 1024",
    'time=2026-11-24T09:35:07.901-08:00 level=INFO source=llama_server.go:433 msg="starting llama-server" cmd="/x/llama-server --model /m/sha256-d372de8e9348 --port 2 -c 8192 -np 1 --load-mode none --flash-attn auto -b 512 -ub 512 --keep 4"',
    'time=2026-11-24T09:35:07.903-08:00 level=INFO source=sched.go:613 msg="system memory" total="64.0 GiB" free="11.9 GiB" free_swap="0 B"',
    "llama_context: n_batch       = 512",
  ].join("\n");
  const loads = parseLoads18(log);
  assertEquals(loads.map((l) => [l.batch, l.freeGiB, l.mode, l.nCtx, l.model]), [[1024, 28.3, "mmap", 8192, "d372de8e"], [512, 11.9, "none", 8192, "d372de8e"]]);
  assertEquals(parseLoads18(log, Date.parse("2026-11-24T09:35:00-08:00")).length, 1);
  const per = callsByLoad18(loads, [{ role: "generator", endMs: Date.parse("2026-11-24T09:35:05-08:00") }, { role: "judge", endMs: Date.parse("2026-11-24T09:36:00-08:00") }, { role: "judge", endMs: Date.parse("2026-11-24T09:37:00-08:00") }]);
  assertEquals(per.map((x) => x.byRole), [{ generator: 1 }, { judge: 2 }]);
  // the runner prints it and sets no batch size anywhere
  assertEquals(RUNNER_18.includes("SP-637: ${loads.length} model load(s) served this run"), true);
  assertEquals(RUNNER_18.includes("num_batch"), false);
});

// ── brief 19 (2026-11-24): SP-647, the two print defects of run 11 ─────────────────────────────────
import { conjunctionSummary as conjunctionSummary19 } from "./needPatterns.ts";

Deno.test("SP-647: the SP-628 summary counts splits — run 11's 13 re-asks read 8 split, 0 rewritten, 5 left as written", () => {
  // run 11's thirteen outcomes, in the order the run printed them
  const run11 = ["split", "still_joined", "still_joined", "split", "split", "split", "still_joined",
    "split", "split", "split", "still_joined", "split", "refused"];
  const s = conjunctionSummary19(run11);
  assertEquals([s.split, s.rewritten, s.leftAsWritten], [8, 0, 5]);
  assertEquals(s.text, "8 split, 0 rewritten as one claim, 5 left as written");
  assertEquals(conjunctionSummary19(["rewritten", "unchanged", "unreadable"]).text, "0 split, 1 rewritten as one claim, 2 left as written");
  assertEquals(conjunctionSummary19([]).text, "0 split, 0 rewritten as one claim, 0 left as written");
  // the runner prints that summary, and no longer does the old arithmetic
  assertEquals(RUNNER_18.includes("conjunctionSummary(conjunctionHits.map((x) => x.outcome)).text"), true);
  assertEquals(RUNNER_18.includes('x.outcome !== "rewritten").length} left as written'), false);
});

Deno.test("SP-647: a load already in memory when the run began is listed, and the run's first call sits under it", () => {
  const line = (t: string, b: number, extra = "") => `time=${t} level=INFO source=llama_server.go:433 msg="starting llama-server" cmd="/x/llama-server --model /m/sha256-d372de8e9348 -c 8192 -b ${b}${extra}"\n` +
    `time=${t} level=INFO source=sched.go:613 msg="system memory" total="64.0 GiB" free="19.8 GiB" free_swap="0 B"`;
  const log = [line("2026-11-24T11:41:04.000-08:00", 512), line("2026-11-24T11:49:12.000-08:00", 512, " --load-mode none"),
    line("2026-11-24T12:02:30.584-08:00", 1024), line("2026-11-24T12:03:20.000-08:00", 512)].join("\n");
  const since = Date.parse("2026-11-24T12:01:33.000-08:00");
  // as before: only the loads that began in the run
  assertEquals(parseLoads18(log, since).map((l) => l.time.slice(11, 19)), ["12:02:30", "12:03:20"]);
  // with the prior load: the LAST one before the run, flagged, and only that one
  const loads = parseLoads18(log, since, true);
  assertEquals(loads.map((l) => [l.time.slice(11, 19), l.beforeRun === true, l.batch, l.mode]), [["11:49:12", true, 512, "none"], ["12:02:30", false, 1024, "mmap"], ["12:03:20", false, 512, "mmap"]]);
  // run 11's first three generator calls: the first ended before any load of the run began
  const ends = ["2026-11-24T12:02:30.500-08:00", "2026-11-24T12:03:19.900-08:00", "2026-11-24T12:03:28.000-08:00"].map((t) => ({ role: "generator", endMs: Date.parse(t) }));
  assertEquals(callsByLoad18(parseLoads18(log, since), ends).map((x) => x.byRole.generator ?? 0), [1, 1]);          // the defect: 2 of 3 placed
  assertEquals(callsByLoad18(loads, ends).map((x) => x.byRole.generator ?? 0), [1, 1, 1]);                          // all 3 placed
  // no load before the run → nothing is invented
  assertEquals(parseLoads18(log, Date.parse("2026-11-24T11:00:00.000-08:00"), true).some((l) => l.beforeRun), false);
  assertEquals(RUNNER_18.includes("readModelLoads(RUN_STARTED_MS - 2000, undefined, true)"), true);
});

// ── brief 20 (2026-11-24): SP-651 — the split re-ask may return up to 6 claims ─────────────────────
import {
  parseGeneratedPass as parsePass20, parseSplitReask as parseSplit20, mergeFieldReask as mergeField20,
  parseFieldReask as parseField20, adoptNominationsForRecovered as adoptNoms20, ONEPART_GEN_LIMITS as ONEPART20,
  SPLIT_MAX_HALVES as SPLIT_MAX20, type ProposedPattern as Proposed20,
} from "./needPatterns.ts";

const RUN12_N15 = JSON.parse(await Deno.readTextFile(new URL("./needPatterns.run12-n15.fixture.json", import.meta.url))) as
  { labels: Record<string, Record<string, string>>; answers: Record<string, string> };

/** Run 12's N15 pass as the runner left it before the split re-ask: the first answer, then the four
 *  claim-length re-asks through the SP-634 merge. Returns the joined claim and its own / nominated labels. */
function n15BeforeSplit() {
  const labels = new Map(Object.entries(RUN12_N15.labels["N15/not working"]));
  const pass = parsePass20(RUN12_N15.answers["N15/not working/gen-1"], labels, [], ONEPART20);
  for (const d of pass.dropped) {
    const m = mergeField20(d.raw!, parseField20(RUN12_N15.answers[`N15/not working/claim-reask-${d.ordinal}`]), d.kind, labels, pass.patterns, ONEPART20);
    pass.patterns = [...pass.patterns, m.pattern];
    adoptNoms20(pass, d.ordinal, m.pattern, labels);
  }
  const orig = pass.patterns.find((p) => p.name === "Charges appear for services or equipment not authorized by the customer.")!;
  const noms = pass.promoted.filter((pr) => pr.resolved && pr.claim === orig.name && !pr.alreadyCited).map((pr) => pr.label);
  const own = orig.citedLabels.filter((l) => !noms.includes(l));
  const existing: Proposed20[] = pass.patterns.filter((x) => x !== orig);
  return { labels, orig, own, noms, existing };
}

Deno.test("SP-651: the split re-ask takes 1 to 6 claims — run 12's saved N15 answer of 5 is no longer refused on the count", () => {
  assertEquals(SPLIT_MAX20, 6);
  const { labels, orig, own, noms, existing } = n15BeforeSplit();
  assertEquals([own.length, noms.length], [12, 2]);
  const r = parseSplit20(RUN12_N15.answers["N15/not working/split-reask-5"], labels, existing, orig, own, noms, ONEPART20);
  // the count door lets it through, and EVERY one of its five claims faced the per-claim door
  assertEquals(r.why.includes("it takes 1 to"), false);
  assertEquals(r.halves.length, 5);
  assertEquals(r.halves.map((h) => h.pattern.parts.length), [1, 1, 1, 1, 1]);
  // every one of the original's 14 quotes is under some returned claim (none had to be carried)
  assertEquals(new Set(r.halves.flatMap((h) => h.pattern.citedLabels)).size, 14);
  // WHAT THE SAME DOOR THEN DOES WITH THIS ANSWER: its first claim's part is "…missing or returned
  // equipment", which still joins two things, so the answer is not adopted and the original stands.
  assertEquals(r.halves[0].pattern.parts[0], "the bill includes charges for missing or returned equipment");
  assertEquals([r.outcome, r.adopt], ["still_joined", false]);
});

Deno.test("SP-651: the same five claims with no joined part are adopted as a split of 5; 7 claims are still refused", () => {
  const { labels, orig, own, noms, existing } = n15BeforeSplit();
  const saved = JSON.parse(RUN12_N15.answers["N15/not working/split-reask-5"]) as { patterns: Array<{ claim: string; parts: string[] }> };
  const fixed = structuredClone(saved);
  fixed.patterns[0].parts = ["the bill includes charges for returned equipment"];
  const r = parseSplit20(JSON.stringify(fixed), labels, existing, orig, own, noms, ONEPART20);
  assertEquals([r.outcome, r.adopt, r.halves.length], ["split", true, 5]);
  // the two nominations follow to the halves the answer put them under
  assertEquals(r.halves.map((h) => h.nominated), [[], [], ["q8"], [], ["q1"]]);
  const seven = structuredClone(fixed);
  seven.patterns.push({ ...fixed.patterns[4], claim: "A sixth claim", parts: ["a sixth thing happens"] }, { ...fixed.patterns[4], claim: "A seventh claim", parts: ["a seventh thing happens"] });
  const r7 = parseSplit20(JSON.stringify(seven), labels, existing, orig, own, noms, ONEPART20);
  assertEquals([r7.outcome, r7.adopt, r7.why], ["refused", false, "the split re-ask returned 7 patterns; it takes 1 to 6"]);
  const six = structuredClone(seven); six.patterns.pop();
  assertEquals(parseSplit20(JSON.stringify(six), labels, existing, orig, own, noms, ONEPART20).halves.length, 6);
});
