// ── The 4e rulings N1–N7 (operator, signed 2026-09-24) ───────────────────────────────────────────
//
// One test block per ruling, on SYNTHETIC fixtures. The Edgewood items that forced each ruling are
// named in the comments by id; none of their text is reproduced here.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  FAITHFUL_SYSTEM, FINDER_SYSTEM, NEED_METRICS, OBJECTION_TYPES, ODI_CONTEXT_RULE,
  OFF_SET_METRIC_TERMS, convertItem, isNarratedStory, judgeFaithful, narrativeAnchors,
  needFormViolation, needParts, objectionReason, parseObjections, pastTenseCount, siftObjections,
  stemOf, termOccursIn, type Call, type Objection,
} from "./convert.ts";
import {
  PARSER_RULES, PARSER_RULES_VERSION, PARSER_RULINGS_4E, READ_FEEDBACK_STATEMENT_PREFIX,
  READ_OVERLAP_WORDS,
} from "./rules.ts";
import { LOCATE_RUNGS, cutLocatedWords, locateQuote, snapSpanToSentences } from "./locate.ts";
import { buildReadIndex, ngrams, normalizedWords, prosePartsOf, sharedReadRun } from "./readFeedback.ts";
import { toPassages } from "./segment.ts";

const PASS_OK = JSON.stringify({ ok: true, objections: [] });
const words = (t: string) => t;

// ── the version and the signed text ──────────────────────────────────────────────────────────────
Deno.test("4e: the version moved and the seven rulings are exported verbatim", () => {
  assertEquals(PARSER_RULES_VERSION, "2026-09-24.4");   // N14 moved it again
  assertEquals(PARSER_RULINGS_4E.length, 7);
  assertEquals(PARSER_RULES.length, 5, "the five rules are amended, not replaced");
  for (const [i, prefix] of ["N1 ", "N2 ", "N3 ", "N4 ", "N5 ", "N6 ", "N7 "].entries()) {
    assert(PARSER_RULINGS_4E[i].startsWith(prefix), `ruling ${i + 1} is out of order`);
  }
});

// ── N1: the refusal branch is GONE ───────────────────────────────────────────────────────────────
Deno.test("N1: nothing in the writer's prompt offers a refusal, and the reason string is gone", () => {
  assert(!ODI_CONTEXT_RULE.includes("no_context"));
  assert(!ODI_CONTEXT_RULE.includes("no context in the words"));
  assert(ODI_CONTEXT_RULE.includes("ALWAYS answer with a statement"));
  assert(ODI_CONTEXT_RULE.includes("There is no refusal"));
});

Deno.test("N1: a writer that still answers no_context is simply retried, never refused", async () => {
  let writes = 0;
  const call: Call = ({ stage }) => {
    if (stage === "convert:need") {
      writes++;
      return Promise.resolve(writes === 1
        ? JSON.stringify({ no_context: true })
        : JSON.stringify({ odi_canonical_statement: "Reduce the effort of chasing referrals" }));
    }
    return Promise.resolve(PASS_OK);
  };
  const w = "Chasing referrals takes so much effort out of us every week.";
  const c = await convertItem({ call, kind: "pain_point", rawWords: w, speaker: "A", jobExecutor: "", passageText: w });
  assertEquals(writes, 2, "the empty answer is retried, not accepted as a refusal");
  assertEquals(c.framework_statement, "Reduce the effort of chasing referrals");
  assertEquals(c.judge_state, "accepted");
  assert(c.judge_reason !== "no context in the words");
});

// ── N2: direction + metric + object ──────────────────────────────────────────────────────────────
Deno.test("N2: the metric set is closed, and the form names it", () => {
  assertEquals([...NEED_METRICS], ["time", "likelihood", "effort", "number"]);
  assert(ODI_CONTEXT_RULE.includes("[Minimize/Maximize/Reduce/Increase] the [metric] of [object]"));
  assert(ODI_CONTEXT_RULE.includes("THE [metric] IS ONE OF EXACTLY FOUR WORDS"));
  assert(ODI_CONTEXT_RULE.includes("THE OBJECT COMES FROM THE SPEAKER, NOT FROM YOU"));
});

Deno.test("N2: the three slots are parsed out of a statement", () => {
  assertEquals(needParts("Minimize the time of intake reconciliation"),
    { direction: "minimize", metric: "time", object: "of intake reconciliation" });
  // the form is written without a connector just as often — "the time SPENT reconciling"
  assertEquals(needParts("Reduce the time spent reconciling the spreadsheet")?.metric, "time");
  assertEquals(needParts("a sentence that is not in the form at all"), null);
});

Deno.test("N2: a metric outside the closed set is refused — the 0aa2ab49 case", () => {
  // The writer reached for "ambiguity" and "clarity", measure words nobody said, which then read as
  // the speaker's own measure. Neither is in the set, so neither survives.
  for (const bad of ["Reduce the ambiguity of the strategy", "Increase the clarity of the plan"]) {
    const v = needFormViolation(bad, "The strategy is hard to follow and the plan is muddled.");
    assert(v.startsWith("metric outside the closed set"), `${bad} -> ${v}`);
  }
  assertEquals(needFormViolation("Reduce the effort of following the strategy",
    "The strategy is hard to follow and takes effort."), "");
});

Deno.test("N2: the object's words must be the speaker's", () => {
  const v = needFormViolation("Minimize the time to reconcile intake records", "We lose two days reconciling by hand.");
  assert(v.startsWith("the object is not in the speaker's words"));
  assert(v.includes("intake") && v.includes("records"));
  // the FORM's own glue is not the speaker's object and is never demanded of them
  assertEquals(needFormViolation("Reduce the time spent reconciling the spreadsheet",
    "We lose two days reconciling the spreadsheet by hand."), "");
});

Deno.test("N2: an off-set measure word anywhere is refused unless the speaker used it", () => {
  assert(OFF_SET_METRIC_TERMS.includes("ambiguity") && OFF_SET_METRIC_TERMS.includes("clarity"));
  // the speaker DID say it: then it is theirs, and it stands
  assertEquals(needFormViolation("Increase the number of quality reviews",
    "We want more quality reviews each month."), "");
  // the speaker did not: the writer invented a measure
  const v = needFormViolation("Increase the number of quality reviews", "We want more reviews each month.");
  assert(v.startsWith("adds a measure the words do not carry"), v);
});

Deno.test("N2: the retry is load-bearing — a fixed statement lands clean, not annotated", async () => {
  // guardReason was never cleared at the top of an attempt, so a retry that FIXED the fault still
  // landed annotated carrying the reason it had just fixed. N2 makes the retry matter.
  let writes = 0;
  const call: Call = ({ stage }) => {
    if (stage === "convert:need") {
      writes++;
      return Promise.resolve(JSON.stringify({ odi_canonical_statement: writes === 1
        ? "Reduce the ambiguity of the intake process"
        : "Reduce the effort of the intake process" }));
    }
    return Promise.resolve(PASS_OK);
  };
  const w = "The intake process takes far more effort than it should.";
  const c = await convertItem({ call, kind: "pain_point", rawWords: w, speaker: "A", jobExecutor: "", passageText: w });
  assertEquals(writes, 2);
  assertEquals(c.judge_state, "accepted");
  assertEquals(c.framework_statement, "Reduce the effort of the intake process");
  assert(!c.judge_reason.includes("ambiguity"), "the fixed fault does not follow the item into the row");
});

// ── N3: typed objections ─────────────────────────────────────────────────────────────────────────
Deno.test("N3: the seven types are the signed ones, and the judge is told the shape", () => {
  assertEquals([...OBJECTION_TYPES], [
    "added_object", "added_metric", "added_context", "added_quantity",
    "lost_object", "lost_context", "wrong_meaning",
  ]);
  assert(FAITHFUL_SYSTEM.includes("WHEN YOU REJECT, LIST YOUR OBJECTIONS ONE BY ONE"));
  assert(FAITHFUL_SYSTEM.includes("Each objection has a TYPE and a TERM"));
  assert(FAITHFUL_SYSTEM.includes('"objections":[{"type"'));
});

Deno.test("N3: stem matching is case-insensitive and forgives the ordinary suffixes", () => {
  assertEquals(stemOf("Retention"), stemOf("retention"));
  assertEquals(stemOf("reconcile"), stemOf("reconciling"));
  assertEquals(stemOf("placements"), stemOf("placement"));
  assert(termOccursIn("family placement", "We talk about high family placements every week."));
  assert(!termOccursIn("deadline", "We talk about high family placements every week."));
});

Deno.test("N3: an added_* objection whose term is in the PASSAGE is dropped and counted", () => {
  // The 90d8c7ef / 065ee3a0 / e3c24524 case: the judge objected to a word the passage plainly carries.
  const passage = "Oh, high family placement retention. We don't, that is not a thing anymore with us.";
  const objections: Objection[] = [
    { type: "added_metric", term: "retention" },
    { type: "added_object", term: "high family placement" },
    { type: "added_object", term: "waiting list" },
  ];
  const { kept, dropped } = siftObjections(objections, passage, "odi_need");
  assertEquals(dropped.length, 2);
  assertEquals(kept.length, 1);
  assertEquals(kept[0].term, "waiting list");
  for (const d of dropped) assertEquals(d.why, "the term occurs in the passage");
});

Deno.test("N3: a LOST_* objection is never dropped by the term check — only added_* is checkable", () => {
  const passage = "We talk about retention every week.";
  const { kept, dropped } = siftObjections(
    [{ type: "lost_object", term: "retention" }, { type: "wrong_meaning", term: "retention" }],
    passage, "odi_need",
  );
  assertEquals(dropped.length, 0);
  assertEquals(kept.length, 2, "a claim that something is MISSING is not a claim about what is present");
});

Deno.test("N3 as narrowed by N16: only an added_metric naming one of the four metrics is scaffolding", () => {
  // 4e-3 N16 narrowed this deliberately. The four metrics are still dropped — they are the form's.
  // A DIRECTION VERB is no longer auto-dropped: N16 names the closed metric set and nothing else, and
  // the judge is already told never to object to a direction verb, so one arriving is a signal.
  const { kept, dropped } = siftObjections(
    [{ type: "added_metric", term: "effort" }, { type: "added_metric", term: "Minimize" }],
    "nothing here at all", "odi_need",
  );
  assertEquals(dropped.length, 1);
  assertEquals(dropped[0].term, "effort");
  assertEquals(dropped[0].why, "the term is one of the form's four metrics");
  assertEquals(kept.length, 1);
  assertEquals(kept[0].term, "Minimize");
  // ...and only for the form that has that scaffolding
  assertEquals(siftObjections([{ type: "added_metric", term: "effort" }], "nothing here", "job_statement").kept.length, 1);
});

Deno.test("N3: the reason is BUILT from type and term, never taken from model prose", () => {
  assertEquals(objectionReason([{ type: "added_object", term: "waiting list" }]), 'adds the object "waiting list"');
  assertEquals(
    objectionReason([{ type: "lost_context", term: "after a referral" }, { type: "added_quantity", term: "48 hours" }]),
    'loses the context "after a referral"; adds the quantity "48 hours"',
  );
});

Deno.test("N3: the verdict is the CODE's — every objection dropped means accepted", async () => {
  const passage = "We keep losing time on the intake spreadsheet every single month.";
  const call: Call = () => Promise.resolve(JSON.stringify({
    ok: false, objections: [{ type: "added_object", term: "intake spreadsheet" }],
  }));
  const v = await judgeFaithful(call, {
    rawWords: passage, statement: "Reduce the time of the intake spreadsheet",
    kind: "pain_point", form: "odi_need", passageText: passage,
  });
  assertEquals(v.ok, true, "the model said reject; the passage says the term is there");
  assertEquals(v.dropped.length, 1);
  assertEquals(v.kept.length, 0);
  assert(v.reason.includes("1 dropped"));
});

Deno.test("N3: a surviving objection annotates, and an unparseable answer is not a pass", async () => {
  const keep: Call = () => Promise.resolve(JSON.stringify({ ok: false, objections: [{ type: "added_quantity", term: "48 hours" }] }));
  const v = await judgeFaithful(keep, { rawWords: "We call families back.", statement: "s", kind: "outcome", form: "odi_need", passageText: "We call families back." });
  assertEquals(v.ok, false);
  assertEquals(v.reason, 'adds the quantity "48 hours"');

  const junk: Call = () => Promise.resolve("not json at all");
  const j = await judgeFaithful(junk, { rawWords: "w", statement: "s", kind: "outcome", form: "odi_need", passageText: "w" });
  assertEquals(j.ok, false);
  assertEquals(parseObjections("not json").parsed, false);
});

// ── N4: read feedback, in code ───────────────────────────────────────────────────────────────────
Deno.test("N4: the overlap is measured on NORMALIZED words, which is what a hyphen needs", () => {
  assertEquals(READ_OVERLAP_WORDS, 4);
  assertEquals(READ_FEEDBACK_STATEMENT_PREFIX, "read feedback:");
  // the live strategy read stores this hyphenated; the speaker says it unhyphenated
  const index = buildReadIndex([{ must_have_capabilities: "a programme with high family-placement retention." }]);
  assertEquals(sharedReadRun("Oh, high family placement retention. We don't.", index), "high family placement retention");
  assertEquals(sharedReadRun("We talk about something else entirely here today.", index), null);
});

Deno.test("N4: a run of three words is not enough; four is", () => {
  const index = buildReadIndex([{ how_to_win: "maintaining strong government payer relationships" }]);
  assertEquals(sharedReadRun("strong government payer", index), null);
  assertEquals(sharedReadRun("we are maintaining strong government payer relationships now", index),
    "maintaining strong government payer");
  assertEquals(ngrams(normalizedWords("a b c"), 4), []);
});

Deno.test("N4: citation lists and the internal cascade copy are not prose the client reads", () => {
  const parts = prosePartsOf({
    how_to_win: "we win by doing the work",
    how_to_win_citations: ["a02ce9da-4b74-4f60-98f7-43f110cdeb6d"],
    cascade_source: { how_to_win: "an internal copy nobody renders" },
  });
  assertEquals(parts, ["we win by doing the work"]);
  assertEquals(buildReadIndex([{ x_citations: ["one two three four"] }]).size, 0);
});

Deno.test("N4: an empty index never fires — a company with no current read is untouched", () => {
  assertEquals(buildReadIndex([]).size, 0);
  assertEquals(sharedReadRun("anything at all goes here", buildReadIndex([])), null);
});

// ── N5: the words are the record's ───────────────────────────────────────────────────────────────
const ZOOM = [
  "Ada Lovelace | 00:01",
  "We keep losing the referral. It goes to the wrong inbox every time.",
  "",
  "Bob Skubic | 00:02",
  "And then what happens to it?",
].join("\n");

Deno.test("N5: the five rungs are named, and an exact hit says so", async () => {
  assertEquals([...LOCATE_RUNGS], ["exact", "ws", "neighbour", "punctuation-blind", "fuzzy"]);
  const passages = await toPassages(ZOOM);
  const out = locateQuote("We keep losing the referral.", passages, 0);
  assertEquals(out.rung, "exact");
  assertEquals(out.trace_state, "located");
  assert(out.span !== null);
});

Deno.test("N5: a MISQUOTE is located by the fuzzy rung and the RECORD's words are cut — the 9f5f32ba case", async () => {
  const passages = await toPassages(ZOOM);
  // one substituted letter: punctuation-blindness cannot save it, the fuzzy rung finds the place
  const out = locateQuote("We keep losing the referal. It goes to the wrong inbox every time.", passages, 0);
  assertEquals(out.rung, "fuzzy");
  const cut = cutLocatedWords(passages[out.passage_index].text, out.span);
  assert(cut.includes("referral"), "the record spells it correctly and the cut carries the record's spelling");
  assert(!cut.includes("referal"), "the model's misspelling never reaches the row");
  assert(passages[out.passage_index].text.includes(cut), "what is cut is a substring of the passage");
});

Deno.test("N5: the cut is whole sentences and never crosses a turn", async () => {
  const passages = await toPassages(ZOOM);
  // a quote that runs off the end of Ada's turn and into Bob's
  const out = locateQuote("It goes to the wrong inbox every time. And then what happens to it?", passages, 0);
  const cut = cutLocatedWords(passages[out.passage_index].text, out.span);
  assert(!cut.includes("And then what happens"), "the next speaker's turn is never part of the cut");
  assert(passages[out.passage_index].text.includes(cut));
  // snapping widens to the sentence, it never returns an empty range
  const t = "One sentence here. A second one follows.";
  assertEquals(snapSpanToSentences(t, { start: 5, end: 9 }), { start: 0, end: 19 });
});

// ── N6: a story is not a pain point ──────────────────────────────────────────────────────────────
Deno.test("N6: both signals must fire — an anchor alone, or a past verb alone, is not a story", () => {
  assert(isNarratedStory("Last week a family called and we told them to wait until Monday."));
  assert(narrativeAnchors("Last week a family called").length >= 1);
  assert(pastTenseCount("a family called and we told them") >= 2);
  // present-tense complaint with one past verb: not a story
  assert(!isNarratedStory("The funder report takes a week and it always did."));
  // an anchor with no narration: not a story
  assert(!isNarratedStory("Last week is always the busiest week for us."));
  // "need"/"speed" are not past tense however they end
  assertEquals(pastTenseCount("we need speed and we proceed"), 0);
});

Deno.test("N6: the reason string is signed", () => {
  assert(PARSER_RULINGS_4E[5].startsWith("N6 A story"));
  assert(PARSER_RULINGS_4E[5].includes("never kind pain_point"));
});

// ── N7: every kind's slot ────────────────────────────────────────────────────────────────────────
Deno.test("N7, restored by N14: step one enumerates all eight slots, in order", () => {
  // N9 made these a checklist and the finder stopped finding turns 62 and 226 at all; N14 put the
  // enumeration back, with N8's cap and N15's split as the backstop the loop needed.
  assert(FINDER_SYSTEM.includes("STEP ONE: go through EVERY SLOT BELOW, IN ORDER"));
  assert(!FINDER_SYSTEM.includes("CHECKLIST FOR YOUR OWN READING"), "N14 removed the checklist framing");
  const slots = [
    "(1) what they WANT", "(2) what they STRUGGLE WITH", "(3) what they are TRYING TO GET DONE",
    "(4) how they JUDGE RESULTS", "(5) what they BELIEVE", "(6) how they REACH PEOPLE",
    "(7) what they STAND FOR", "(8) what they ASK OF US",
  ];
  let at = -1;
  for (const slot of slots) {
    const i = FINDER_SYSTEM.indexOf(slot);
    assert(i > at, `slot missing or out of order after N14: ${slot}`);
    at = i;
  }
  assert(FINDER_SYSTEM.includes("STEP TWO: for each object"), "the two-step shape 4d signed survives");
  assertEquals(words(""), "");
});
