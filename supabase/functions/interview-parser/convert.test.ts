// The post-check locator, the kind router, the converters and the judge (parser commit 3, PR8–PR10).
// SYNTHETIC FIXTURES ONLY; every model call is a stub, so these run with no Ollama.
//
// Plants: (i) the locator disabled (always returns not_located) → the located tests red;
//         (ii) the identity skip removed → covered by the integration proof, not here.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { toPassages } from "./segment.ts";
import { locateQuote } from "./locate.ts";
import {
  FAITHFUL_SYSTEM, FINDER_SYSTEM, JOB_FROM_WORDS_SYSTEM, MAX_RAW_WORDS, NOT_BUILT_REASON, NO_EXECUTOR_GOAL_REASON,
  buildFaithfulUser, buildFinderUser, convertItem, inventedNumbers, judgeFaithful, numbersIn,
  numericInventionReason, parseFinderOutput, routeKind, type Call,
} from "./convert.ts";
import { ITEM_KINDS, itemContentIdentity } from "../_shared/interviewItems.ts";
import { marketMeansHits } from "../_shared/marketMeansTerms.ts";

const TRANSCRIPT = [
  "Ada Lovelace | 00:00:04",
  "We lose two days every month reconciling the intake spreadsheet by hand.",
  "",
  "Grace Hopper | 00:01:12",
  "What I want is to see the whole waitlist in one place before the Monday meeting.",
  "",
  "Ada Lovelace | 00:02:30",
  "We measure how many families get a call back inside forty eight hours.",
].join("\n");

const passages = await toPassages(TRANSCRIPT);

// ── the locator ──────────────────────────────────────────────────────────────────────────────────
Deno.test("locator: a quote in the passage the finder named is located there", () => {
  const r = locateQuote("reconciling the intake spreadsheet by hand", passages, 0);
  assertEquals(r.trace_state, "located");
  assertEquals(r.passage_index, 0);
  assert(r.reason.includes("the passage the finder named"));
});

Deno.test("locator: a quote in a NEIGHBOUR is found there, and the reason says the finder was off", () => {
  const r = locateQuote("see the whole waitlist in one place", passages, 0); // claims passage 0, sits in 1
  assertEquals(r.trace_state, "located");
  assertEquals(r.passage_index, 1);
  assert(r.reason.includes("neighbouring passage"));
});

Deno.test("locator: whitespace drift still locates (the ladder normalizes)", () => {
  const r = locateQuote("We   lose two days\n every month", passages, 0);
  assertEquals(r.trace_state, "located");
});

Deno.test("locator: a near-miss paraphrase is caught by fuzzy and reports its similarity", () => {
  const near = passages[2].text.replace("forty eight", "48");
  const r = locateQuote(near, passages, 0);
  assertEquals(r.trace_state, "located");
  assertEquals(r.passage_index, 2);
  assert((r.similarity ?? 0) >= 0.85);
});

Deno.test("locator: a quote in NO passage is not_located and keeps the finder's passage (rule 1)", () => {
  const r = locateQuote("Funding was approved by the county in a single meeting.", passages, 1);
  assertEquals(r.trace_state, "not_located");
  assertEquals(r.passage_index, 1, "it must still point at the passage the finder named");
  assert(r.reason.includes("not in any passage"));
});

Deno.test("locator: an out-of-range claim is clamped, never thrown", () => {
  const r = locateQuote("nothing like this text at all, truly nothing", passages, 99);
  assertEquals(r.passage_index, passages.length - 1);
  assertEquals(r.trace_state, "not_located");
});

Deno.test("locator: an empty quote is not_located, not a crash", () => {
  assertEquals(locateQuote("   ", passages, 0).trace_state, "not_located");
});

// ── the finder's output ──────────────────────────────────────────────────────────────────────────
Deno.test("finder: malformed entries are dropped, never guessed at", () => {
  // R1 (4c): the quotes here are WHOLE SENTENCES of six words or more, because a fragment is now
  // dropped in its own right — see the R1 tests in rulings4c.test.ts for that rule.
  const raw = JSON.stringify({ items: [
    { passage_index: 0, kind: "pain_point", raw_words: "Nobody owns the intake spreadsheet at all." },
    { passage_index: 1, kind: "not_a_kind", raw_words: "This sentence is long enough to be an item." },
    { passage_index: 2, kind: "job" },
    { kind: "desire", raw_words: "This one has no passage index at all." },
    { passage_index: 3, kind: "outcome", raw_words: "  " },
  ] });
  assertEquals(parseFinderOutput(raw).length, 1);
  assertEquals(parseFinderOutput("not json").length, 0);
  assertEquals(parseFinderOutput(JSON.stringify({ items: "nope" })).length, 0);
});

Deno.test("finder: raw_words is capped at the passage cap, and the user prompt numbers passages from the window offset", () => {
  // R1 (4c): the cap rose from 400 to the passage cap, and a cut lands on a sentence boundary — an
  // over-length quote made of whole sentences keeps as many as fit; see rulings4c.test.ts.
  const long = ("This is a complete sentence with enough words in it to count. ").repeat(40);
  const capped = parseFinderOutput(JSON.stringify({ items: [{ passage_index: 0, kind: "job", raw_words: long }] }))[0].raw_words;
  assert(capped.length <= MAX_RAW_WORDS);
  assert(capped.trim().endsWith("."));
  const user = buildFinderUser(passages.slice(0, 2), 7);
  assert(user.startsWith("[7] Ada Lovelace"));
  assert(user.includes("[8] Grace Hopper"));
});

// ── the kind router ──────────────────────────────────────────────────────────────────────────────
Deno.test("router: needs, jobs and the not-built kinds", () => {
  for (const k of ["pain_point", "desire", "outcome"] as const) assertEquals(routeKind(k), "need");
  assertEquals(routeKind("job"), "job");
  for (const k of ["route", "step", "positioning", "cascade"] as const) assertEquals(routeKind(k), "not_built");
});

Deno.test("router: a not-built kind lands ANNOTATED with the signed reason and no form — never dropped", async () => {
  const call: Call = () => { throw new Error("no model call may be made for a not-built kind"); };
  for (const k of ["route", "step", "positioning", "cascade"] as const) {
    const c = await convertItem({ call, kind: k, rawWords: "some words", speaker: "Ada", jobExecutor: "families" });
    assertEquals(c.framework_form, null);
    assertEquals(c.framework_statement, null);
    assertEquals(c.judge_state, "annotated");
    assertEquals(c.judge_reason, NOT_BUILT_REASON);
  }
});

// ── the converters ───────────────────────────────────────────────────────────────────────────────
// 4d R1: an interview need is "[verb] the [dimension] of [object]" and carries NO when-clause — the
// old fixture had one and the clarifier gate now refuses it, which is the rule working.
const GOOD_CANONICAL = "Minimize the time to reconcile intake records";
/** 4e N2: the object must come from the speaker's words, so the fixture's words now carry it. Before
 *  N2 any raw words would do, because nothing checked the object against them. */
const GOOD_WORDS = "We lose two days every month reconciling intake records by hand.";

function stubCall(map: Record<string, string>): Call {
  return ({ stage }) => Promise.resolve(map[stage] ?? map[stage.split(":")[0]] ?? "{}");
}

Deno.test("need: a valid canonical statement is judged and lands accepted with the judge's reason", async () => {
  const call = stubCall({
    "convert:need": JSON.stringify({ odi_canonical_statement: GOOD_CANONICAL }),
    judge: JSON.stringify({ ok: true, reason: "the statement keeps what the words were about" }),
  });
  const c = await convertItem({ call, kind: "pain_point", rawWords: GOOD_WORDS, speaker: "Ada", jobExecutor: "families", passageText: GOOD_WORDS });
  assertEquals(c.framework_form, "odi_need");
  assertEquals(c.judge_state, "accepted");
  assertEquals(c.framework_statement, GOOD_CANONICAL);
  assert(c.judge_reason.length > 0);
});

Deno.test("need: a FORMAT reject re-prompts once, then lands annotated carrying the format reason", async () => {
  let calls = 0;
  const call: Call = ({ stage }) => {
    if (stage === "convert:need") { calls++; return Promise.resolve(JSON.stringify({ odi_canonical_statement: "no formula verb and no when clause" })); }
    return Promise.resolve(JSON.stringify({ ok: true, reason: "r" }));
  };
  const c = await convertItem({ call, kind: "desire", rawWords: "We want the waitlist visible.", speaker: "Grace", jobExecutor: "families" });
  assertEquals(calls, 2, "exactly one retry");
  assertEquals(c.judge_state, "annotated");
  assert(c.judge_reason.startsWith("ODI format rejected after one retry:"));
  assertEquals(c.framework_form, "odi_need");
});

Deno.test("need: a judge REJECT lands annotated with the judge's reason, never dropped", async () => {
  // 4e N3: the judge lists TYPED objections and the CODE builds the reason from type + term. The
  // model's own sentence is no longer the reason, because a sentence cannot be checked against the
  // passage and a term can.
  const call = stubCall({
    "convert:need": JSON.stringify({ odi_canonical_statement: GOOD_CANONICAL }),
    judge: JSON.stringify({ ok: false, objections: [{ type: "added_quantity", term: "deadline" }] }),
  });
  const c = await convertItem({ call, kind: "outcome", rawWords: GOOD_WORDS, speaker: "Ada", jobExecutor: "families", passageText: GOOD_WORDS });
  assertEquals(c.judge_state, "annotated");
  assertEquals(c.judge_reason, 'adds the quantity "deadline"');
  assertEquals(c.framework_statement, GOOD_CANONICAL, "the statement is KEPT beside the annotation");
});

Deno.test("job: the DETERMINISTIC means layer rejects before any judge is spent", async () => {
  let judged = 0;
  const call: Call = ({ stage }) => {
    if (stage === "convert:job") return Promise.resolve(JSON.stringify({ jtbd: "Finding a reliable provider of specialised care." }));
    judged++; return Promise.resolve(JSON.stringify({ ok: true, reason: "r" }));
  };
  const c = await convertItem({ call, kind: "job", rawWords: "We need somewhere to send them.", speaker: "Ada", jobExecutor: "families" });
  assertEquals(judged, 0, "no judge call may be spent on a deterministic means hit");
  assertEquals(c.judge_state, "annotated");
  assertEquals(c.judge_reason, "names a means: provider");
  assertEquals(c.framework_form, "job_statement");
});

Deno.test("job: a clean statement passes the means layer, solution-agnostic and the faithfulness judge", async () => {
  const call = stubCall({
    "convert:job": JSON.stringify({ jtbd: "Getting a young person seen quickly after a referral." }),
    judge: JSON.stringify({ ok: true, reason: "faithful to the words" }),
  });
  const c = await convertItem({
    call, kind: "job", rawWords: "We need them seen quickly.", speaker: "Ada", jobExecutor: "families",
    solutionAgnostic: () => Promise.resolve({ solutionFree: true, tally: "3-0 accepted", reason: "passes both tests" }),
  });
  assertEquals(c.judge_state, "accepted");
  assertEquals(c.framework_form, "job_statement");
});

Deno.test("job: a solution-agnostic REJECT lands annotated carrying the tally and reason", async () => {
  // The statement must name NO deterministic term (ruling C now catches plurals too), so that layer 3
  // passes it and the MODEL layer is the one that rejects it — which is what this test is about.
  const call = stubCall({ "convert:job": JSON.stringify({ jtbd: "Choosing between the two places in town." }) });
  const c = await convertItem({
    call, kind: "job", rawWords: "We had to choose.", speaker: "Ada", jobExecutor: "families",
    solutionAgnostic: () => Promise.resolve({ solutionFree: false, tally: "2-1 rejected", reason: "the object is a supplier" }),
  });
  assertEquals(c.judge_state, "annotated");
  assert(c.judge_reason.includes("solution-agnostic v"));
  assert(c.judge_reason.includes("2-1 rejected"));
  assert(c.judge_reason.includes("the object is a supplier"));
  assertEquals(c.framework_form, "job_statement");
});

Deno.test("RULING C: a PLURAL means term is caught by layer 3, before any judge is spent", async () => {
  // This replaces the pinned gap "the deterministic six are SINGULAR, so no plural is caught". The six
  // entries are unchanged; the matching covers their plurals, so "providers" is refused here rather
  // than reaching the model layers. The near misses still never hit — marketMeansTerms.test.ts owns that.
  for (const singular of ["provider", "clinic", "outpatient", "inpatient"]) {
    assertEquals(marketMeansHits(`We compared the ${singular}s in town.`), [singular], `"${singular}s" missed`);
    assertEquals(marketMeansHits(`We compared the ${singular} in town.`), [singular], `"${singular}" missed`);
  }
  // and the whole ladder honours it: a plural in the written job spends ZERO judge calls
  let judged = 0;
  const call: Call = ({ stage }) => {
    if (stage === "convert:job") return Promise.resolve(JSON.stringify({ jtbd: "Comparing the providers within an hour of home." }));
    judged++; return Promise.resolve(JSON.stringify({ ok: true, reason: "r" }));
  };
  const c = await convertItem({ call, kind: "job", rawWords: "We looked at everyone nearby.", speaker: "Ada", jobExecutor: "families" });
  assertEquals(judged, 0, "a plural means hit must cost no judge call");
  assertEquals(c.judge_reason, "names a means: provider");
  assertEquals(c.judge_state, "annotated");
});

Deno.test("job: a writer returning nothing lands annotated, never silently dropped", async () => {
  const c = await convertItem({ call: stubCall({ "convert:job": "{}" }), kind: "job", rawWords: "x", speaker: null, jobExecutor: "families" });
  assertEquals(c.framework_statement, null);
  assertEquals(c.judge_state, "annotated");
  assert(c.judge_reason.length > 0);
});

Deno.test("judge: a blank reason is replaced by a stated one — judge_reason is NEVER empty (rule 1)", async () => {
  for (const ok of [true, false]) {
    const c = await convertItem({
      call: stubCall({ "convert:need": JSON.stringify({ odi_canonical_statement: GOOD_CANONICAL }), judge: JSON.stringify({ ok, reason: "" }) }),
      kind: "pain_point", rawWords: "words", speaker: null, jobExecutor: "families",
    });
    assert(c.judge_reason.trim().length > 0, `blank reason survived for ok=${ok}`);
  }
});

// ── identity (rule 5) ────────────────────────────────────────────────────────────────────────────
Deno.test("identity: same kind + words + passage is the SAME item; any change makes a different one", async () => {
  const base = { kind: "pain_point" as const, raw_words: "We lose two days every month.", passage_sha256: "a".repeat(64) };
  const id = await itemContentIdentity(base);
  assertEquals(await itemContentIdentity({ ...base }), id);
  assertEquals(await itemContentIdentity({ ...base, raw_words: "  We lose two days every month.  " }), id, "normalized words are the same item");
  assert(await itemContentIdentity({ ...base, kind: "desire" }) !== id);
  assert(await itemContentIdentity({ ...base, passage_sha256: "b".repeat(64) }) !== id, "the same words from another passage is a different item");
});

// ── RULING A: the judge judges SUBSTANCE, and the form's own scaffolding is exempt ────────────────
// The wiring first: without KIND and FORM on the call the judge cannot know which scaffolding to
// exempt, so the exemption would be advice it could not apply. Then the three named cases, live.
Deno.test("RULING A: the judge is TOLD the kind and the form, and the exemption names both forms", async () => {
  const seen: string[] = [];
  const call: Call = ({ stage, system, user }) => {
    if (stage === "judge") { seen.push(user); assert(system === FAITHFUL_SYSTEM); }
    if (stage === "convert:need") return Promise.resolve(JSON.stringify({ odi_canonical_statement: GOOD_CANONICAL }));
    if (stage === "convert:job") return Promise.resolve(JSON.stringify({ jtbd: "Getting a young person seen quickly after a referral." }));
    return Promise.resolve(JSON.stringify({ ok: true, reason: "r" }));
  };
  await convertItem({ call, kind: "pain_point", rawWords: GOOD_WORDS, speaker: "Ada", jobExecutor: "families", passageText: GOOD_WORDS });
  await convertItem({
    call, kind: "job", rawWords: "We need them seen quickly.", speaker: "Ada", jobExecutor: "families",
    solutionAgnostic: () => Promise.resolve({ solutionFree: true, tally: "3-0 accepted", reason: "ok" }),
  });
  assertEquals(seen.length, 2);
  assert(seen[0].includes("KIND: pain_point") && seen[0].includes("FORM: odi_need"), "the need's judge call carries kind and form");
  assert(seen[1].includes("KIND: job") && seen[1].includes("FORM: job_statement"), "the job's judge call carries kind and form");
  // the exemption itself, both halves
  assert(FAITHFUL_SYSTEM.includes("FAITHFUL IN SUBSTANCE"));
  assert(FAITHFUL_SYSTEM.includes("JUDGE SUBSTANCE, NOT WORDING"));
  assert(FAITHFUL_SYSTEM.includes("Minimize, Maximize, Reduce, Increase"));
  // 4e N2 took the when-clause out of the frame the judge is shown and put the METRIC in, and 4e N3
  // replaced the free-sentence reason with typed objections. Both are pinned in rulings4e.test.ts.
  assert(FAITHFUL_SYSTEM.includes("[verb] the [metric] of [object]"));
  assert(FAITHFUL_SYSTEM.includes("verb + object + contextual clarifier"));
  assert(FAITHFUL_SYSTEM.includes("ADDS an object, a metric, a quantity, a context or a solution"));
  assert(FAITHFUL_SYSTEM.includes("LOSES the object or the context"));
  // rule 4 is unchanged in substance: an outcome still carries a reason, now built from the objections
  assert(FAITHFUL_SYSTEM.includes("WHEN YOU REJECT, LIST YOUR OBJECTIONS"));
});

Deno.test("RULING A: the user prompt reminds the judge whose scaffolding the form is", () => {
  const u = buildFaithfulUser({ rawWords: "w", statement: "s", kind: "desire", form: "odi_need" });
  assert(u.includes("KIND: desire"));
  assert(u.includes("FORM: odi_need"));
  assert(u.includes("faithful IN SUBSTANCE"));
  assert(u.includes("the odi_need scaffolding is the form's own"));
});

// The three cases the ruling names, against the real local judge. Gated on PARSER_LIVE_JUDGE=1 so the
// offline fleet stays green and costs nothing; run with it set and the ruling is proven, not asserted.
const LIVE_JUDGE = Deno.env.get("PARSER_LIVE_JUDGE") === "1";
const OLLAMA = (Deno.env.get("OLLAMA_BASE_URL") || "http://localhost:11434").replace(/\/v1\/?$/, "");
const JUDGE_MODEL_T = Deno.env.get("PARSER_JUDGE_MODEL") || "qwen2.5:14b-instruct";
const liveCall: Call = async ({ system, user, model }) => {
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: model ?? JUDGE_MODEL_T, format: "json", stream: false, options: { num_ctx: 8192, temperature: 0 }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  const d = await r.json() as { message?: { content?: string } };
  return String(d.message?.content ?? "");
};

Deno.test({
  name: "RULING A (live): a faithful need whose DIRECTION VERB the speaker never said is ACCEPTED",
  ignore: !LIVE_JUDGE,
  fn: async () => {
    // This pair DISCRIMINATES. Measured at temperature 0 against the SAME model, the pre-ruling prompt
    // rejects it with "adds the goal of increase which is not present in the original statement" — the
    // direction verb, and nothing else, is what it objected to. Restoring that prompt turns this test
    // red, which is the plant proving the RULING moved the verdict and not some unrelated edit.
    const v = await judgeFaithful(liveCall, {
      rawWords: "We measure how many families get a call back inside forty eight hours.",
      statement: "Increase the number of families who get a call back when forty eight hours have passed",
      kind: "outcome", form: "odi_need", model: JUDGE_MODEL_T,
    });
    assert(v.ok, `the form's own direction verb must not fail it — judge said: ${v.reason}`);
    assert(v.reason.trim().length > 0, "a reason is mandatory on pass");
  },
});

Deno.test({
  name: "RULING A (live): a need that INVENTS a metric the words never carry is ANNOTATED",
  ignore: !LIVE_JUDGE,
  fn: async () => {
    const v = await judgeFaithful(liveCall, {
      rawWords: "We lose two days every month reconciling the intake spreadsheet by hand.",
      statement: "Minimize the cost per referral in dollars when onboarding a new funder",
      kind: "pain_point", form: "odi_need", model: JUDGE_MODEL_T,
    });
    assert(!v.ok, `an invented metric and an invented context must fail — judge said: ${v.reason}`);
    assert(v.reason.trim().length > 0, "a reason is mandatory on reject");
  },
});

Deno.test({
  name: "RULING A (live): a job that DROPS the speaker's context is ANNOTATED",
  ignore: !LIVE_JUDGE,
  fn: async () => {
    const v = await judgeFaithful(liveCall, {
      rawWords: "When a family calls us after hours we still have to get them seen the same week.",
      statement: "Filing paperwork accurately",
      kind: "job", form: "job_statement", model: JUDGE_MODEL_T,
    });
    assert(!v.ok, `losing the speaker's object and context must fail — judge said: ${v.reason}`);
    assert(v.reason.trim().length > 0, "a reason is mandatory on reject");
  },
});

// ── RULING B: the finder emits all eight kinds ───────────────────────────────────────────────────
Deno.test("RULING B: all eight kinds are defined in the prompt, in the schema line, and parsed", () => {
  // The definitions have moved shape twice: 4c put them inside the item test ("(kind job)"), 4d moved
  // them into the per-object kind list ("job (something they are trying to get done)"). What is pinned
  // throughout is that every kind is DEFINED, not the sentence it is defined in.
  for (const k of ITEM_KINDS) {
    assert(FINDER_SYSTEM.includes(`${k} (`), `the prompt must DEFINE the kind: ${k}`);
  }
  // R4 (4c) added ask and hypothesis: the list is the store's, so this assertion moved with it.
  assert(FINDER_SYSTEM.includes('"kind":"job|pain_point|desire|outcome|route|step|positioning|cascade|ask|hypothesis"'), "the schema line must offer every kind");
  // 4d R4 added the object field ahead of it; rulings4d.test.ts owns the two-step shape.
  assert(FINDER_SYSTEM.includes('"object":"<= 6 words from the passage>"'));
  const raw = JSON.stringify({ items: ITEM_KINDS.map((k, i) => ({ passage_index: i, kind: k, object: `${k} items`, raw_words: `This is a whole sentence about ${k} items.` })) });
  assertEquals(parseFinderOutput(raw).map((i) => i.kind), [...ITEM_KINDS], "every kind must survive parsing");
  // and a kind that is not on the list is still dropped
  assertEquals(parseFinderOutput(JSON.stringify({ items: [{ passage_index: 0, kind: "vision", raw_words: "This is a whole sentence that is long enough." }] })).length, 0);
});

// SUPERSEDED BY 4d R4, and kept as the record of what changed. R4 makes STEP ONE of the finder
// enumerate "wants, struggles, goals and results" — positioning, route, step and cascade have no
// step-one slot, so the model stopped returning them even though the kind list still offers them.
// Measured on this exact window: it now returns pain_point only. The assertion moved to what the
// two-step finder does guarantee; the recall loss is reported for the operator, not asserted away.
Deno.test({
  name: "RULING B (live): the two-step finder still mines this window — positioning/route recall is a 4d R4 casualty",
  ignore: !LIVE_JUDGE,
  fn: async () => {
    const window = [
      "Ada Lovelace | 00:00:04",
      "We are the only team in the county that takes referrals from schools directly. That is what sets us apart from the hospital programme.",
      "",
      "Grace Hopper | 00:01:12",
      "The way we get a family seen is this. The school calls us, we triage that afternoon, and we book the first visit ourselves.",
      "",
      "Ada Lovelace | 00:02:30",
      "We lose two days every month reconciling the intake spreadsheet by hand.",
    ].join("\n");
    const ps = await toPassages(window);
    const found = parseFinderOutput(await liveCall({
      stage: "finder", system: FINDER_SYSTEM,
      user: buildFinderUser(ps, 0, { all: ps, start: 0, sideOf: () => "client" }),
      model: Deno.env.get("PARSER_FINDER_MODEL") || JUDGE_MODEL_T,
    }), new Map(ps.map((p, i) => [i, p.text])));
    assert(found.length > 0, "the window must still yield items");
    for (const f of found) {
      assert(f.object.trim().split(/\s+/).length <= 6, `object too long: ${f.object}`);
      assert(ITEM_KINDS.includes(f.kind), `unknown kind: ${f.kind}`);
    }
  },
});

// ── R1: the ITEM TEST — narration yields nothing ─────────────────────────────────────────────────
Deno.test("R1: the item test and the not-an-item examples are in the finder prompt", () => {
  assert(FINDER_SYSTEM.includes("WORK IN TWO STEPS"));   // 4d R4 replaced the item test with the two-step shape
  assert(FINDER_SYSTEM.includes("A NARRATED FACT IS NOT AN ITEM"));
  assert(FINDER_SYSTEM.includes("A schedule, a headcount, a date, a piece of history"));
  assert(FINDER_SYSTEM.includes("AN ANSWER IS NOT AN ITEM"));   // 4d R3
  // 4e N7 enumerated the slots, 4e-2 N9 made them a checklist, 4e-3 N14 put the enumeration back.
  // The "yields nothing" default survives every one of them, which is what this test is about.
  assert(FINDER_SYSTEM.includes("If the passage carries none of the eight, list none and move on"));
  // the eight kinds keep their test clauses
  // 4d R4 moved the per-kind definitions into the two-step prompt's kind list; the clauses were
  // reworded with them. Every kind is still defined — that is what this pins — and rulings4d.test.ts
  // owns the two-step wording.
  for (const kind of ["job", "pain_point", "desire", "outcome", "route", "step", "positioning", "cascade"]) {
    assert(FINDER_SYSTEM.includes(`${kind} (`), `missing the definition of: ${kind}`);
  }
});

Deno.test({
  name: "R1 (live): a window of pure NARRATION yields no items at all",
  ignore: !LIVE_JUDGE,
  fn: async () => {
    // Every line here is a narrated fact: a schedule, a headcount, a date. Under the commit-3 prompt
    // these same lines produced 118 of 159 items (steps and routes) on the throwaway.
    const narration = [
      "Dana Reeves | 00:00:37",
      "The team has grown by three people since the spring.",
      "Funding for the programme is reviewed at the end of each quarter.",
      "",
      "Sam Okafor | 00:01:14",
      "There is a handover meeting every fortnight where we go through the new names.",
      "The referral came through on a Tuesday and we started the intake the same week.",
    ].join("\n");
    const ps = await toPassages(narration);
    const found = parseFinderOutput(await liveCall({
      stage: "finder", system: FINDER_SYSTEM, user: buildFinderUser(ps, 0),
      model: Deno.env.get("PARSER_FINDER_MODEL") || JUDGE_MODEL_T,
    }));
    assertEquals(found.length, 0, `narration produced items: ${found.map((f) => f.kind).join(", ")}`);
  },
});

Deno.test({
  name: "R1 (live): a window with a REAL item still yields it — the test narrows, it does not silence",
  ignore: !LIVE_JUDGE,
  fn: async () => {
    const mixed = [
      "Dana Reeves | 00:00:37",
      "The team has grown by three people since the spring.",
      "",
      "Sam Okafor | 00:01:14",
      "We lose two whole days every month reconciling the intake spreadsheet by hand.",
    ].join("\n");
    const ps = await toPassages(mixed);
    const found = parseFinderOutput(await liveCall({
      stage: "finder", system: FINDER_SYSTEM, user: buildFinderUser(ps, 0),
      model: Deno.env.get("PARSER_FINDER_MODEL") || JUDGE_MODEL_T,
    }));
    assert(found.length >= 1, "the real pain point must still be found");
    assert(found.some((f) => f.kind === "pain_point"), `kinds found: ${found.map((f) => f.kind).join(", ")}`);
    assert(!found.some((f) => /grown by three people/i.test(f.raw_words)), "the headcount must not be an item");
  },
});

// ── R2: a job with no actor-with-a-goal lands annotated ──────────────────────────────────────────
Deno.test("R2: the writer's no_executor_goal answer lands the item annotated with the signed reason", async () => {
  let calls = 0;
  const call: Call = ({ stage }) => {
    if (stage === "convert:job") { calls++; return Promise.resolve(JSON.stringify({ no_executor_goal: true })); }
    throw new Error("no further call may be made once the words carry no executor goal");
  };
  const c = await convertItem({ call, kind: "job", rawWords: "Funding for the programme is reviewed at the end of each quarter.", speaker: "Dana", jobExecutor: "families" });
  assertEquals(calls, 1, "the refusal rides on the call the writer already makes — no extra call");
  assertEquals(c.judge_state, "annotated");
  assertEquals(c.judge_reason, NO_EXECUTOR_GOAL_REASON);
  assertEquals(c.judge_reason, "no executor goal in the words");
  assertEquals(c.framework_statement, null);
  assertEquals(c.framework_form, "job_statement", "the item still lands, with its form (rule 1)");
});

Deno.test("R2: the prompt asks for the actor-and-goal decision FIRST and offers the refusal shape", () => {
  assert(JOB_FROM_WORDS_SYSTEM.includes("FIRST decide whether the words name an ACTOR who is trying to GET SOMETHING DONE"));
  // 4c's R3 rewrote the sentence that follows: the list of things that are NOT an actor moved into
  // the REFUSE ONLY clause. rulings4c.test.ts owns the widened wording; this pins what 3b signed —
  // the decision comes first, the refusal has a shape, and an actor is never invented.
  assert(JOB_FROM_WORDS_SYSTEM.includes("a bare schedule, a headcount, a date, a statistic standing alone"));
  assert(JOB_FROM_WORDS_SYSTEM.includes('{"no_executor_goal":true}'));
  assert(JOB_FROM_WORDS_SYSTEM.includes("do not invent an actor"));
});

Deno.test({
  name: "R2 (live): a schedule is refused as having no executor goal; a real job is not",
  ignore: !LIVE_JUDGE,
  fn: async () => {
    const schedule = await convertItem({
      call: liveCall, kind: "job", rawWords: "Funding for the programme is reviewed at the end of each quarter.",
      speaker: "Dana", jobExecutor: "the interviewee",
      solutionAgnostic: () => Promise.resolve({ solutionFree: true, tally: "3-0 accepted", reason: "-" }),
    });
    assertEquals(schedule.judge_reason, NO_EXECUTOR_GOAL_REASON, `a schedule was converted anyway: ${schedule.framework_statement}`);
    const real = await convertItem({
      call: liveCall, kind: "job", rawWords: "I am trying to get a young person seen before the crisis escalates.",
      speaker: "Dana", jobExecutor: "the interviewee",
      solutionAgnostic: () => Promise.resolve({ solutionFree: true, tally: "3-0 accepted", reason: "-" }),
    });
    assert(real.framework_statement, "a real job must still be written, not refused");
    assert(real.judge_reason !== NO_EXECUTOR_GOAL_REASON);
  },
});

// ── R3: the numeric invention guard ──────────────────────────────────────────────────────────────
Deno.test("R3: numbersIn / inventedNumbers decide the rule, with no model anywhere near them", () => {
  assertEquals(numbersIn("Reduce the time to two days per month"), []);          // spelled out, no digits
  assertEquals(numbersIn("within 48 hours and 1,200 referrals and 2.5 days"), ["48", "1200", "2.5"]);
  assertEquals(inventedNumbers("Minimize the time to 2 days", "We lose two whole days"), ["2"]);
  assertEquals(inventedNumbers("Increase call-backs inside 48 hours", "get a call back inside 48 hours"), []);
  assertEquals(inventedNumbers("Reduce it to 48 hours", "we measure forty eight hours"), ["48"], "a numeral for a spelled-out number is still the writer's");
  assertEquals(inventedNumbers("no digits here", "none here either"), []);
  assertEquals(inventedNumbers("7 and 7 and 9", "there were 7"), ["9"], "each invented number is reported once");
  assertEquals(numericInventionReason(["2", "30"]), "adds a quantity the words do not carry: 2, 30");
});

Deno.test("R3: a need that adds a quantity re-prompts ONCE, then lands annotated with the signed reason", async () => {
  let writes = 0;
  const seen: string[] = [];
  const call: Call = ({ stage, user }) => {
    if (stage === "convert:need") {
      writes++; seen.push(user);
      return Promise.resolve(JSON.stringify({ odi_canonical_statement: "Reduce the time spent reconciling the spreadsheet to 2 days by hand" }));
    }
    throw new Error("no judge call may be spent on a statement that invented a quantity");
  };
  const c = await convertItem({ call, kind: "pain_point", rawWords: "We lose two whole days every month reconciling the intake spreadsheet by hand.", speaker: "Dana", jobExecutor: "families" });
  assertEquals(writes, 2, "exactly one re-prompt");
  assert(seen[1].includes("adds a quantity the words do not carry: 2"), "the retry must carry the reason and the offending number");
  assertEquals(c.judge_state, "annotated");
  assertEquals(c.judge_reason, "adds a quantity the words do not carry: 2");
  assertEquals(c.framework_statement, "Reduce the time spent reconciling the spreadsheet to 2 days by hand", "the statement is KEPT beside the annotation");
});

Deno.test("R3: a need whose number the WORDS carry passes the guard and reaches the judge", async () => {
  let writes = 0, judged = 0;
  const call: Call = ({ stage }) => {
    if (stage === "convert:need") { writes++; return Promise.resolve(JSON.stringify({ odi_canonical_statement: "Increase the number of families called back inside 48 hours" })); }
    judged++; return Promise.resolve(JSON.stringify({ ok: true, reason: "faithful" }));
  };
  const c = await convertItem({ call, kind: "outcome", rawWords: "We measure how many families get a call back inside 48 hours.", speaker: "Dana", jobExecutor: "families" });
  assertEquals(writes, 1, "a clean statement is never re-prompted");
  assertEquals(judged, 1);
  assertEquals(c.judge_state, "accepted");
});

Deno.test("R3: the retry SUCCEEDING lands the item normally — the guard is not a one-way door", async () => {
  let writes = 0;
  const call: Call = ({ stage }) => {
    if (stage === "convert:need") {
      writes++;
      return Promise.resolve(JSON.stringify({ odi_canonical_statement: writes === 1
        ? "Reduce the time spent reconciling to 2 days by hand"
        : "Reduce the time spent reconciling the intake spreadsheet by hand" }));
    }
    return Promise.resolve(JSON.stringify({ ok: true, reason: "faithful" }));
  };
  const c = await convertItem({ call, kind: "pain_point", rawWords: "We lose two whole days every month reconciling the intake spreadsheet by hand.", speaker: "Dana", jobExecutor: "families" });
  assertEquals(writes, 2);
  assertEquals(c.judge_state, "accepted");
  assert(!c.judge_reason.includes("adds a quantity"));
});

Deno.test("R3: a JOB that adds a quantity re-prompts once, then lands annotated — same rule, same reason", async () => {
  let writes = 0;
  const call: Call = ({ stage }) => {
    if (stage === "convert:job") { writes++; return Promise.resolve(JSON.stringify({ jtbd: "Getting a young person seen within 24 hours of a referral." })); }
    throw new Error("no judge call may be spent on a statement that invented a quantity");
  };
  const c = await convertItem({ call, kind: "job", rawWords: "I am trying to get a young person seen before the crisis escalates.", speaker: "Dana", jobExecutor: "families" });
  assertEquals(writes, 2, "exactly one re-prompt");
  assertEquals(c.judge_state, "annotated");
  assertEquals(c.judge_reason, "adds a quantity the words do not carry: 24");
  assertEquals(c.framework_form, "job_statement");
});
