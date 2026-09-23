// The post-check locator, the kind router, the converters and the judge (parser commit 3, PR8–PR10).
// SYNTHETIC FIXTURES ONLY; every model call is a stub, so these run with no Ollama.
//
// Plants: (i) the locator disabled (always returns not_located) → the located tests red;
//         (ii) the identity skip removed → covered by the integration proof, not here.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { toPassages } from "./segment.ts";
import { locateQuote } from "./locate.ts";
import {
  FAITHFUL_SYSTEM, FINDER_SYSTEM, NOT_BUILT_REASON, buildFaithfulUser, buildFinderUser, convertItem,
  judgeFaithful, parseFinderOutput, routeKind, type Call,
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
  const raw = JSON.stringify({ items: [
    { passage_index: 0, kind: "pain_point", raw_words: "a real quote" },
    { passage_index: 1, kind: "not_a_kind", raw_words: "x" },
    { passage_index: 2, kind: "job" },
    { kind: "desire", raw_words: "no index" },
    { passage_index: 3, kind: "outcome", raw_words: "  " },
  ] });
  assertEquals(parseFinderOutput(raw).length, 1);
  assertEquals(parseFinderOutput("not json").length, 0);
  assertEquals(parseFinderOutput(JSON.stringify({ items: "nope" })).length, 0);
});

Deno.test("finder: raw_words is capped, and the user prompt numbers passages from the window offset", () => {
  const long = "x".repeat(900);
  assertEquals(parseFinderOutput(JSON.stringify({ items: [{ passage_index: 0, kind: "job", raw_words: long }] }))[0].raw_words.length, 400);
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
const GOOD_CANONICAL = "Minimize the time to reconcile intake records when a new family is referred";

function stubCall(map: Record<string, string>): Call {
  return ({ stage }) => Promise.resolve(map[stage] ?? map[stage.split(":")[0]] ?? "{}");
}

Deno.test("need: a valid canonical statement is judged and lands accepted with the judge's reason", async () => {
  const call = stubCall({
    "convert:need": JSON.stringify({ odi_canonical_statement: GOOD_CANONICAL }),
    judge: JSON.stringify({ ok: true, reason: "the statement keeps what the words were about" }),
  });
  const c = await convertItem({ call, kind: "pain_point", rawWords: "We lose two days every month reconciling by hand.", speaker: "Ada", jobExecutor: "families" });
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
  const call = stubCall({
    "convert:need": JSON.stringify({ odi_canonical_statement: GOOD_CANONICAL }),
    judge: JSON.stringify({ ok: false, reason: "the statement adds a deadline the words never mention" }),
  });
  const c = await convertItem({ call, kind: "outcome", rawWords: "We measure call-backs.", speaker: "Ada", jobExecutor: "families" });
  assertEquals(c.judge_state, "annotated");
  assertEquals(c.judge_reason, "the statement adds a deadline the words never mention");
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
  await convertItem({ call, kind: "pain_point", rawWords: "We lose two days.", speaker: "Ada", jobExecutor: "families" });
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
  assert(FAITHFUL_SYSTEM.includes("[verb] the [dimension] of [object] when [context]"));
  assert(FAITHFUL_SYSTEM.includes("verb + object + contextual clarifier"));
  assert(FAITHFUL_SYSTEM.includes("ADDS an object, a metric, a quantity, a context or a solution"));
  assert(FAITHFUL_SYSTEM.includes("LOSES the object or the context"));
  // rule 4 is unchanged: the reason is still mandatory on BOTH outcomes
  assert(FAITHFUL_SYSTEM.includes("ALWAYS state your reason"));
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
  for (const k of ITEM_KINDS) {
    assert(FINDER_SYSTEM.includes(`${k} (`), `the prompt must DEFINE the kind: ${k}`);
  }
  assert(FINDER_SYSTEM.includes('"kind":"job|pain_point|desire|outcome|route|step|positioning|cascade"'), "the schema line must offer all eight");
  const raw = JSON.stringify({ items: ITEM_KINDS.map((k, i) => ({ passage_index: i, kind: k, raw_words: `words for ${k}` })) });
  assertEquals(parseFinderOutput(raw).map((i) => i.kind), [...ITEM_KINDS], "every one of the eight must survive parsing");
  // and a kind that is not one of the eight is still dropped
  assertEquals(parseFinderOutput(JSON.stringify({ items: [{ passage_index: 0, kind: "vision", raw_words: "x" }] })).length, 0);
});

Deno.test({
  name: "RULING B (live): a planted POSITIONING phrase and a planted ROUTE phrase in one window are found under their kinds",
  ignore: !LIVE_JUDGE,
  fn: async () => {
    const window = [
      "Ada Lovelace | 00:00:04",
      "We are the only team in the county that takes referrals from schools directly, and that is what sets us apart from the hospital programme.",
      "",
      "Grace Hopper | 00:01:12",
      "The way we get a family seen is this: the school calls us, we triage that afternoon, and we book the first visit ourselves.",
      "",
      "Ada Lovelace | 00:02:30",
      "We lose two days every month reconciling the intake spreadsheet by hand.",
    ].join("\n");
    const ps = await toPassages(window);
    const found = parseFinderOutput(await liveCall({
      stage: "finder", system: FINDER_SYSTEM, user: buildFinderUser(ps, 0), model: Deno.env.get("PARSER_FINDER_MODEL") || JUDGE_MODEL_T,
    }));
    const kinds = new Set(found.map((f) => f.kind));
    assert(kinds.has("positioning"), `no positioning item found; kinds were: ${[...kinds].join(", ") || "(none)"}`);
    assert(kinds.has("route"), `no route item found; kinds were: ${[...kinds].join(", ") || "(none)"}`);
  },
});
