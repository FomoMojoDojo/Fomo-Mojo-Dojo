// SP-562 / SP-572..SP-575: the dry-only wording tool. Run through the SP-532 wrapper:
//   bash scripts/deno-test-nonvacuous.sh --no-lock scripts/needWording.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { JUDGE_NUM_PREDICT_RETRY, JUDGE_SYSTEM } from "../supabase/functions/_shared/needPatterns.ts";
import {
  AND_FAILURE, AND_GUIDANCE, CONTEXT_FAILURE, CONTEXT_GUIDANCE, WORDING_GENERATOR_SYSTEM, buildCombinedReask, distinctToJudge, formFailures, hasContext, parseRuns, statementKey,
  FIT_JUDGE_SYSTEM, FIT_NUM_CTX, FIT_NUM_PREDICT, FIT_NUM_PREDICT_RETRY, FIT_SPAN_SENTENCE,
  containsAnd, emptyStop, fitsContext, planFitPairs, type FitWording,
  ALL_PROMPT_TEXT, ARM2_NOTES_HEADER, ODI_DIRECTION, WORDING_USER_LAST_LINE,
  accountForWording, analyzeOutcomeQuality, arm2NoteLines, buildFitUser, buildWordingUser, checkForm,
  drawBySeed, labelQuotes, notesForQuote, outDirRefusal, parseFit, parseWording, trimNote,
} from "./needWording.ts";

const here = (rel: string) => new URL(rel, import.meta.url).pathname;
const read = (rel: string) => Deno.readTextFileSync(here(rel));

// ── dry-only ─────────────────────────────────────────────────────────────────────────────────────

Deno.test("SP-562: neither source file holds a statement that writes — no insert, update or delete, in any case", () => {
  for (const f of ["./propose-need-wording.ts", "./needWording.ts"]) {
    const src = read(f);
    for (const word of ["insert", "update", "delete"]) {
      const at = src.toLowerCase().indexOf(word);
      assert(at < 0, `${f} contains "${word}" at offset ${at}: ${JSON.stringify(src.slice(Math.max(0, at - 40), at + 40))}`);
    }
    assert(!/--apply\b(?!")/.test(src.replace(/no `--apply`|has no --apply|"--apply"|"--apply="/g, "")), `${f} mentions an --apply path`);
  }
});

Deno.test("SP-562: --out refuses the repo, any path inside it, and a relative path; a path outside passes", () => {
  const repo = "/Users/x/dev/repo";
  assert(outDirRefusal("/Users/x/dev/repo", repo));
  assert(outDirRefusal("/Users/x/dev/repo/", repo));
  assert(outDirRefusal("/Users/x/dev/repo/backups/run1", repo));
  assert(outDirRefusal("backups/run1", repo));
  assertEquals(outDirRefusal("/Users/x/dev/repo-notes/run1", repo), null);   // a sibling that shares the prefix
  assertEquals(outDirRefusal("/Users/x/dev/_diagnose-shots/run1", repo), null);
});

// ── SP-575: the copies have not drifted from the two served functions ────────────────────────────

/** The text from a line starting `start` to the first line that is exactly `end`, inclusive. */
function block(src: string, start: string, end: string): string {
  const lines = src.split("\n");
  const a = lines.findIndex((l) => l.startsWith(start));
  assert(a >= 0, `no line starts with ${JSON.stringify(start)}`);
  const b = lines.findIndex((l, i) => i >= a && l === end);
  assert(b >= a, `no closing ${JSON.stringify(end)} after ${JSON.stringify(start)}`);
  return lines.slice(a, b + 1).join("\n");
}

Deno.test("SP-575: the copies of ODI_DIRECTION and analyzeOutcomeQuality match their source files, text for text", () => {
  const copy = read("./needWording.ts");
  const handler = read("../supabase/functions/record-interview-finding/handler.ts");
  const research = read("../supabase/functions/research-company/index.ts");

  const line = (src: string) => block(src, "const ODI_DIRECTION = ", src.split("\n").find((l) => l.startsWith("const ODI_DIRECTION = ")) ?? "");
  assertEquals(line(copy), line(handler), "ODI_DIRECTION has drifted from record-interview-finding/handler.ts");

  for (const [start, end] of [
    ["const WEAK_OUTCOME_STARTERS = [", "];"],
    ["const WEAK_OUTCOME_TERMS = [", "];"],
    ["function analyzeOutcomeQuality(", "}"],
  ]) {
    assertEquals(block(copy, start, end), block(research, start, end), `${start} … has drifted from research-company/index.ts`);
  }
  // and the copies are the ones in use: the exported names are these very blocks
  assert(ODI_DIRECTION.test("Reduce the time it takes"));
  assertEquals(analyzeOutcomeQuality("Reduce the time it takes to get a billing error corrected").issues, []);
});

// ── the quote accounting ─────────────────────────────────────────────────────────────────────────

const L = ["q1", "q2", "q3", "q4"];
const lo = (...xs: string[]) => xs.map((label) => ({ label, why: "about something else" }));

Deno.test("SP-535 accounting: complete; a label missing; in both lists; twice; an invented label; no reason", () => {
  assertEquals(accountForWording(L, { covers: ["q1", "q4"], leftOver: lo("q2", "q3") }).ok, true);

  const missing = accountForWording(L, { covers: ["q1"], leftOver: lo("q2", "q3") });
  assertEquals([missing.ok, missing.missing], [false, ["q4"]]);

  const both = accountForWording(L, { covers: ["q1", "q2", "q4"], leftOver: lo("q2", "q3") });
  assertEquals([both.ok, both.both, both.missing], [false, ["q2"], []]);

  const twiceLeft = accountForWording(L, { covers: ["q1", "q4"], leftOver: lo("q2", "q3", "q3") });
  assertEquals([twiceLeft.ok, twiceLeft.twice], [false, ["q3"]]);
  const twiceCov = accountForWording(L, { covers: ["q1", "q1", "q4"], leftOver: lo("q2", "q3") });
  assertEquals([twiceCov.ok, twiceCov.twice], [false, ["q1"]]);

  const invented = accountForWording(L, { covers: ["q1", "q4", "q9"], leftOver: lo("q2", "q3", "q44") });
  assertEquals([invented.ok, invented.invented.sort(), invented.covered, invented.leftOver], [false, ["q44", "q9"], 2, 2]);

  const noReason = accountForWording(L, { covers: ["q1", "q4"], leftOver: [{ label: "q2", why: "" }, { label: "q3", why: "x" }] });
  assertEquals([noReason.ok, noReason.noReason], [false, ["q2"]]);
});

Deno.test("the generator's answer is read as it stands: a missing list is empty and the account names every label", () => {
  const w = parseWording('{"statement":" Reduce  the time it takes\\n to fix a bill ","covers":"q1"}');
  assertEquals(w.statement, "Reduce the time it takes to fix a bill");
  assertEquals([w.covers, w.leftOver], [[], []]);
  assertEquals(accountForWording(L, w).missing, L);
});

// ── the form gates ───────────────────────────────────────────────────────────────────────────────

Deno.test("SP-572 (4): the gates are direction, 8 to 18 words and one sentence — each fails alone", () => {
  const ok = checkForm("Reduce the time it takes to get a billing error corrected");
  assertEquals([ok.failed, ok.words, ok.gates], [null, 11, { direction: true, length: true, one_sentence: true }]);

  assertEquals(checkForm("Get a billing error corrected in less time than it takes today").failed, "direction");
  assertEquals(checkForm("Reduce time to correct a bill").failed, "length");                                  // 6 words
  assertEquals(checkForm("Reduce " + "very ".repeat(17) + "long").failed, "length");                        // 19 words
  assertEquals(checkForm("Reduce the " + "very ".repeat(15) + "long").failed, null);                        // 18 words
  assertEquals(checkForm("Reduce the time it takes to fix a bill. Avoid being charged twice for it.").failed, "one_sentence");
  assertEquals(checkForm("Reduce the time it takes to get a billing error corrected.").failed, null);        // a closing full stop is one sentence
});

Deno.test("SP-572 (4): analyzeOutcomeQuality is printed with every issue and CANNOT drop a candidate", () => {
  // "information" trips `form` by substring, and "number" is not in its dimension list: two issues,
  // so it calls this sound statement weak. Every gate passes, and the gates are all that decide.
  const c = checkForm("Reduce the number of times a customer must repeat account information to get help");
  assertEquals(c.quality.weak, true);
  assertEquals(c.quality.issues, ["contains_solution_language", "missing_measurable_dimension"]);
  assertEquals(c.failed, null);
  // and no issue it can raise changes `failed` when the three gates pass
  for (const s of [
    "Increase the dashboard portal feature tool campaign workflow form program website",
    "Improve the tool so that the portal and the dashboard both load",
  ]) {
    const x = checkForm(s);
    assert(x.quality.issues.length >= 2, s);
    assertEquals(x.failed, null, s);
  }
});

// ── the fit judge parse ──────────────────────────────────────────────────────────────────────────

const QUOTE = "I was on hold for 90 minutes and then the call dropped, so I had to start over.";
const fit = (o: unknown) => parseFit(typeof o === "string" ? o : JSON.stringify(o), QUOTE);

Deno.test("fit parse FAILS CLOSED: only fits === true with a valid kind and a verbatim span is a fit", () => {
  const good = fit({ fits: true, kind: "barrier", span: "on hold for 90 minutes", reason: "a long wait" });
  assertEquals([good.fits, good.rejected], [true, ""]);
  for (const kind of ["help", "both"]) assertEquals(fit({ fits: true, kind, span: "the call dropped" }).fits, true);

  // `fits` must be the boolean true — missing, null, a string, 1 and false are all not a fit
  for (const fits of [undefined, null, "true", 1, false, "yes"]) {
    const v = fit({ fits, kind: "barrier", span: "on hold for 90 minutes" });
    assertEquals([v.fits, v.rejected], [false, "answered_false"], `fits=${JSON.stringify(fits)}`);
  }
  for (const kind of ["none", "", "Barrier", "obstacle", undefined, 3]) {
    const v = fit({ fits: true, kind, span: "on hold for 90 minutes" });
    assertEquals([v.fits, v.rejected], [false, "kind_invalid"], `kind=${JSON.stringify(kind)}`);
  }
  for (const span of ["", "   ", undefined, null, 7]) {
    assertEquals(fit({ fits: true, kind: "barrier", span }).rejected, "span_missing", `span=${JSON.stringify(span)}`);
  }
  const para = fit({ fits: true, kind: "barrier", span: "waited on hold for an hour and a half" });
  assertEquals([para.fits, para.rejected], [false, "span_not_verbatim"]);
  for (const junk of ["", "no json here", "{not json}", "[1,2]", "null"]) {
    assertEquals(fit(junk).fits, false, junk);
    assertEquals(fit(junk).rejected, "unreadable", junk);
  }
});

Deno.test("the fit judge is given the wording and the quote and nothing that says which wording it is", () => {
  assertEquals(buildFitUser("Reduce  the time\nto reach an agent", ' I was "on hold" \n for hours '),
    'OUTCOME: Reduce the time to reach an agent\n\nQUOTE: "I was "on hold" for hours"');
});

// ── SP-572 (3): the one trim rule, on run 7's real notes (step5.log, N13) ────────────────────────

Deno.test("SP-572 (3): cut from the first \", not \", \", no \" or \" rather than \" to the end; no match passes unchanged", () => {
  const cases: Array<[string, string]> = [
    ["about billing and cancellation process, not contacting support", "about billing and cancellation process"],
    ["general complaint about provider, no specific support mechanism", "general complaint about provider"],
    ["about unresolved service issues, not the difficulty of contacting", "about unresolved service issues"],
    ["describes successful resolution, not a barrier to contact", "describes successful resolution"],
    ["mixed billing and hold times, no single mechanism for this need", "mixed billing and hold times"],
    ["about price hike and hang-ups, not hold times or duration", "about price hike and hang-ups"],
    ["about chat failure, not phone hold/duration", "about chat failure"],
    ["about billing error and hold times, no single mechanism for this need", "about billing error and hold times"],
    ["about harassment and billing, no support interaction details", "about harassment and billing"],
    ["about AI failure and broken promise to connect, not contact ease", "about AI failure and broken promise to connect"],
  ];
  for (const [before, after] of cases) assertEquals(trimNote(before), after);
  // no match: unchanged, to the character
  for (const s of ["about upselling instead of fixing", "about a note with nothing to cut", "not a leading negation, kept"]) {
    assertEquals(trimNote(s), s);
  }
  // the three marks, and the FIRST one wins
  assertEquals(trimNote("about a fix rather than a wait, not contact ease"), "about a fix");
  assertEquals(trimNote("about cost, no detail, not contact ease"), "about cost");
  // the rule is the literal marks: no comma, no cut
  assertEquals(trimNote("about nothing at all not contact ease"), "about nothing at all not contact ease");
});

Deno.test("SP-572 (3): identical notes on the same quote pass once — run 7's 3af5feb4 and 82c8722b", () => {
  // two readings of one quote that differ only after the cut
  assertEquals(notesForQuote([
    "about billing dispute after disconnect, not the contact process",
    "about billing dispute after disconnect, not contact ease",
  ]), ["about billing dispute after disconnect"]);
  // two readings that still differ are both passed, in order
  assertEquals(notesForQuote([
    "about unauthorized billing charges, not support contact",
    "about billing charges, not contact ease",
  ]), ["about unauthorized billing charges", "about billing charges"]);
});

// ── the prompts ──────────────────────────────────────────────────────────────────────────────────

Deno.test("SP-572 (2): arm 2 is arm 1 plus the notes block before the last line, and the block reads as ruled", () => {
  const labels = labelQuotes([
    { signalId: "a", quote: "first  quote", polarity: "not working" },
    { signalId: "b", quote: "second quote", polarity: "working" },
    { signalId: "c", quote: "third quote", polarity: null },
  ]);
  const arm1 = buildWordingUser(labels);
  assertEquals(arm1, [
    "QUOTES (3: 1 not working, 1 working, 0 mixed):",
    'q1 [not working]: "first quote"', 'q2 [working]: "second quote"', 'q3 [unlabelled]: "third quote"',
    "", WORDING_USER_LAST_LINE,
  ].join("\n"));
  const notes = { c: ["about a refund"], a: ["about a late fee", "about an agent"], z: ["not a quote of this need"] };
  assertEquals(arm2NoteLines(labels, notes), ["q1: about a late fee", "q1: about an agent", "q3: about a refund"]);
  assertEquals(buildWordingUser(labels, notes), [
    ...arm1.split("\n").slice(0, -1),
    "NOTES FROM AN EARLIER READING",
    "An earlier reader noted what each of these quotes is about. The notes do not say what the need is.",
    "q1: about a late fee", "q1: about an agent", "q3: about a refund",
    "", WORDING_USER_LAST_LINE,
  ].join("\n"));
  assertEquals(ARM2_NOTES_HEADER.length, 2);
});

Deno.test("SP-572 (1): US spelling in every prompt and guidance line", () => {
  const british = /neighbour|generalis|recognis|organis|summaris|categoris|prioritis|emphasis[ei]|analys[ei]|behaviour|colour|favour|honour|labour|judgement|centre\b|programme|labelled|cancelled|whilst|towards\b|grey\b/i;
  for (const [name, text] of Object.entries(ALL_PROMPT_TEXT)) {
    const m = text.match(british);
    assert(!m, `${name}: British spelling ${JSON.stringify(m?.[0])}`);
  }
  assert(ALL_PROMPT_TEXT["fit judge system"].includes("a neighboring outcome"));
  assert(ALL_PROMPT_TEXT["re-ask guidance: length / one sentence"].includes("do not generalize it"));
});

// ── SP-574 ───────────────────────────────────────────────────────────────────────────────────────

Deno.test("SP-574: the draw is fixed by its seed and not by the order of the pool", () => {
  const pool = Array.from({ length: 60 }, (_, i) => `id-${String(i).padStart(2, "0")}`);
  const a = drawBySeed(pool, 20, 42);
  assertEquals(a.length, 20);
  assertEquals(new Set(a).size, 20);
  assertEquals(drawBySeed([...pool].reverse(), 20, 42), a);
  assert(drawBySeed(pool, 20, 43).join() !== a.join());
  assertEquals(drawBySeed(pool.slice(0, 5), 20, 42).length, 5);
});

// ── brief 11: SP-581, SP-582, SP-583, SP-586 ─────────────────────────────────────────────────────

Deno.test("SP-581: \"and\" is found as a WORD and is never a gate (its re-ask is SP-588's now)", () => {
  assertEquals(containsAnd("Reduce the time and effort needed to resolve service issues and billing disputes"), true);
  assertEquals(containsAnd("Reduce the time needed. And nothing else"), true);
  for (const s of ["Reduce the time a brand takes to hand back a refund on demand", "Reduce the time needed to resolve a billing dispute", "Avoid errands when standing in a sandy place"]) {
    assertEquals(containsAnd(s), false, s);
  }
  // it never drops: a statement with "and" passes every gate it passed without the check
  assertEquals(checkForm("Reduce the time and effort needed to resolve service issues and billing disputes").failed, null);
});

Deno.test("SP-587: a context is one of five words, as a WORD; the check never gates and never drops", () => {
  for (const s of [
    "Reduce the time needed to get a billing error corrected when calling support",
    "Reduce the effort of fixing an outage While working from home",
    "Avoid losing service during an outage", "Reduce surprises before subscribing", "Reduce the wait after reporting a fault",
  ]) assertEquals(hasContext(s), true, s);
  for (const s of [
    "Reduce the time and effort needed to resolve service issues and billing disputes",   // brief 11's candidate
    "Reduce the whenever-it-suits delays of afterthought billing",                          // "whenever-…" and "afterthought" are not the words
    "Increase ease of contacting customer support for service issues",
  ]) assertEquals(hasContext(s), false, s);
  // no context is not a gate: the three gates all pass and `failed` is null
  assertEquals(checkForm("Reduce the time needed to resolve a billing dispute with support").failed, null);
  // and the runner can only drop on a form gate — `dropped` is set from `form.failed` and "no readable answer", nothing else
  const runner = read("./propose-need-wording.ts");
  const sets = [...runner.matchAll(/res\.dropped = `([^`]*)`/g)].map((m) => m[1].slice(0, 20));
  assertEquals(sets, ["no readable answer: ", 'form gate "${res.for']);
  assert(!/has_(and|context)\)\s*res\.dropped/.test(runner));
});

Deno.test("SP-588: ONE form re-ask names every failure at once, each with its guidance line, in the SP-546 frame", () => {
  const both = formFailures("Reduce the time and effort needed to resolve service issues and billing disputes");
  assertEquals(both.map((f) => f.kind), ["and", "context"]);
  // exactly as it is sent for a statement that fails both "and" and context
  assertEquals(buildCombinedReask("{user}", both), [
    "{user}", "",
    'YOUR PREVIOUS ANSWER WAS REFUSED: the statement joins two things with "and"; the statement does not say when or where the customer is trying to do this.',
    'Do not join two things with "and". State the one that most quotes share.',
    'The statement must say when or where the customer is trying to do this. Add that context from the quotes, using "when", "while", "during", "before" or "after".',
    "Answer again, fixing only that.",
  ].join("\n"));
  assertEquals([AND_FAILURE, AND_GUIDANCE, CONTEXT_FAILURE, CONTEXT_GUIDANCE], [
    'the statement joins two things with "and"', 'Do not join two things with "and". State the one that most quotes share.',
    "the statement does not say when or where the customer is trying to do this",
    'The statement must say when or where the customer is trying to do this. Add that context from the quotes, using "when", "while", "during", "before" or "after".',
  ]);
  // a form gate joins the same re-ask, first, and two gates that share a guidance line send it once
  const all = formFailures("Get billing errors and outages fixed. Do it fast.");
  assertEquals(all.map((f) => f.kind), ["direction", "one_sentence", "and", "context"]);
  const text = buildCombinedReask("{user}", all);
  assertEquals(text.split("\n")[2], 'YOUR PREVIOUS ANSWER WAS REFUSED: the statement starts with "Get", which is not a direction verb; the statement is more than one sentence; the statement joins two things with "and"; the statement does not say when or where the customer is trying to do this.');
  assertEquals(text.split("\n").length, 2 + 1 + 4 + 1);
  const twoGates = formFailures("Reduce it now. Avoid it when asked.");                   // 7 words, two sentences
  assertEquals(twoGates.map((f) => f.kind), ["length", "one_sentence"]);
  assertEquals(buildCombinedReask("u", twoGates).split("\n").filter((l) => l.startsWith("The statement must be ONE sentence")).length, 1);
  // nothing to re-ask
  assertEquals(formFailures("Reduce the time needed to get a billing error corrected when calling support"), []);
  // one of each per answer: the runner sends at most one combined form re-ask and one account re-ask per run
  const runner = read("./propose-need-wording.ts");
  const body = runner.slice(runner.indexOf("async function runCandidate("), runner.indexOf("const gatesLine"));
  assertEquals(body.split("await ask(").length - 1, 3);
  assertEquals([body.split("buildCombinedReask(").length - 1, body.split("buildAccountReask(").length - 1], [1, 1]);
  assert(!/\b(while|for)\s*\(/.test(body), "no loop around a re-ask");
});

Deno.test("SP-589: --runs gives one generator run per temperature:seed; the system prompt is the same text for every run", () => {
  assertEquals(parseRuns("0:42,0.7:43,0.7:44,0.7:45,0.7:46"), [
    { temperature: 0, seed: 42 }, { temperature: 0.7, seed: 43 }, { temperature: 0.7, seed: 44 }, { temperature: 0.7, seed: 45 }, { temperature: 0.7, seed: 46 },
  ]);
  assertEquals(parseRuns("0:42"), [{ temperature: 0, seed: 42 }]);
  for (const bad of ["", "0.7", "0.7:", ":43", "hot:43", "0.7:43,0.7:43", "3:1", "0.7:4.5", "-1:3"]) {
    let threw = false; try { parseRuns(bad); } catch { threw = true; }
    assert(threw, `--runs=${JSON.stringify(bad)} must be refused`);
  }
  // the run's temperature and seed reach the call; every other option is as built
  const runner = read("./propose-need-wording.ts");
  assert(runner.includes("const opts = { temperature: run.temperature, seed: run.seed, num_predict: PATTERN_NUM_PREDICT, num_ctx: FIT_NUM_CTX, think: false, keep_alive: 0 };"));
  assert(runner.includes('modelCall("generator", LOCAL_PATTERN_GENERATOR, WORDING_GENERATOR_SYSTEM, u, opts, a.attempt)'));
  // the fit judge is NOT moved by --runs
  assert(runner.includes("{ temperature: 0, seed: 42, num_predict: np, num_ctx: FIT_NUM_CTX, think: PATTERN_JUDGE_THINK }"));
  assert(WORDING_GENERATOR_SYSTEM.startsWith("You write ONE customer need as a desired-outcome statement"));
});

Deno.test("brief 12 step 5: which distinct final statements are judged", () => {
  assertEquals(statementKey("  Reduce   the time.  "), statementKey("reduce the Time"));
  assert(statementKey("Reduce the time") !== statementKey("Reduce the times"));
  const d = distinctToJudge([
    { run: "r1", statement: "Reduce the time and effort needed to resolve service issues and billing disputes.", gateFailed: "" },   // brief 11's
    { run: "r2", statement: "Reduce the time needed to get a billing error fixed when calling support", gateFailed: "" },
    { run: "r3", statement: "reduce the time needed to get a billing error fixed when calling support.", gateFailed: "" },          // the same as r2
    { run: "r4", statement: "Get it fixed", gateFailed: 'form gate "direction" failed after the re-ask' },
    { run: "r5", statement: "Reduce the effort and time of getting an outage fixed", gateFailed: "" },                               // "and", no context: still judged
    { run: "r6", statement: "", gateFailed: "no readable answer" },
  ], ["Reduce the time and effort needed to resolve service issues and billing disputes"]);
  assertEquals(d.judge.map((j) => [j.runs, j.and, j.context]), [[["r2", "r3"], false, true], [["r5"], true, false]]);
  assertEquals(d.judge[0].statement, "Reduce the time needed to get a billing error fixed when calling support");
  assertEquals([d.droppedGate.map((x) => x.run), d.droppedMeasured.map((x) => x.run)], [["r4"], ["r1"]]);
});

Deno.test("SP-582: the fit judge's span rule carries the one sentence, once; the pattern judge's prompt does not", () => {
  assertEquals(FIT_SPAN_SENTENCE, "The span is ONE unbroken run of words; if the evidence is in two places, copy the single most telling one.");
  assertEquals(FIT_JUDGE_SYSTEM.split(FIT_SPAN_SENTENCE).length - 1, 1);
  const bullet = FIT_JUDGE_SYSTEM.split("\n").find((l) => l.startsWith("- The evidence must be in the quote."))!;
  assert(bullet.endsWith(`never a paraphrase and never your own words. ${FIT_SPAN_SENTENCE}`), bullet);
  assertEquals(JUDGE_SYSTEM.includes("unbroken run"), false);
});

Deno.test("SP-583: the fit judge retries at 7,000, which fits num_ctx 8,192; the pattern judge's 8,000 is untouched", () => {
  assertEquals([FIT_NUM_CTX, FIT_NUM_PREDICT, FIT_NUM_PREDICT_RETRY], [8192, 4000, 7000]);
  assertEquals(JUDGE_NUM_PREDICT_RETRY, 8000);
  // the longest prompt this measurement can send: the system prompt, an 18-word wording, an 805-char quote
  const longest = FIT_JUDGE_SYSTEM.length + buildFitUser("word ".repeat(18), "x".repeat(805)).length;
  assertEquals(fitsContext(longest, FIT_NUM_PREDICT_RETRY), true);
  assertEquals(fitsContext(longest, 8000), false);                  // why 8,000 could not stay
  assertEquals(fitsContext(3 * 1192, 7000), true);
  assertEquals(fitsContext(3 * 1192 + 1, 7000), false);
  // the runner retries the FIT judge at the fit budget, and holds every call to the context
  const runner = read("./propose-need-wording.ts");
  assert(runner.includes("first: FIT_NUM_PREDICT, retry: FIT_NUM_PREDICT_RETRY"));
  assertEquals(runner.includes("JUDGE_NUM_PREDICT"), false);
});

Deno.test("SP-586: a (wording, quote) pair is judged once — a quote in two sets reuses its verdict; the control skips the specificity set", () => {
  const ws: FitWording[] = [
    { name: "baseline", role: "baseline", text: "b" }, { name: "candidate", role: "candidate", text: "c" },
    { name: "narrow", role: "narrow", text: "n" }, { name: "control", role: "control", text: "x" },
  ];
  const plan = planFitPairs(ws, [
    { name: "need", signalIds: ["n1", "n2"], withControl: true },
    { name: "side", signalIds: ["n2", "s1", "s2"], withControl: true },       // n2 is also one of the need's own quotes
    { name: "specificity", signalIds: ["s2", "p1", "p1"], withControl: false }, // s2 is also in the side table; p1 listed twice
  ]);
  const rows = (set: string) => plan.filter((p) => p.set === set);
  assertEquals([rows("need").length, rows("side").length, rows("specificity").length], [8, 12, 6]);
  assertEquals(plan.filter((p) => !p.reuseOf).length, 8 + 8 + 3);            // the calls: 2×4, then s1 and s2 ×4, then p1 ×3
  assertEquals(rows("side").filter((p) => p.signalId === "n2").map((p) => p.reuseOf), ["need", "need", "need", "need"]);
  assertEquals(rows("specificity").filter((p) => p.signalId === "s2").map((p) => [p.wording, p.reuseOf]), [["baseline", "side"], ["candidate", "side"], ["narrow", "side"]]);
  assertEquals(rows("specificity").some((p) => p.wording === "control"), false);
  // every (set, wording, quote) appears exactly once, and every pair has exactly one row that is a call
  assertEquals(new Set(plan.map((p) => `${p.set}|${p.wording}|${p.signalId}`)).size, plan.length);
  const calls = plan.filter((p) => !p.reuseOf).map((p) => `${p.wording}|${p.signalId}`);
  assertEquals(new Set(calls).size, calls.length);
  assertEquals(new Set(plan.map((p) => `${p.wording}|${p.signalId}`)).size, calls.length);
  // the first 12 calls are 3 quotes × 4 wordings — the smoke
  assertEquals(plan.slice(0, 4).map((p) => p.signalId), ["n1", "n1", "n1", "n1"]);
});

Deno.test("brief 11 stop rules: more than 3 of the first 12 empty; past 15% at any point after 60", () => {
  assertEquals(emptyStop(12, 3), null);
  assert(emptyStop(12, 4));
  assertEquals(emptyStop(11, 11), null);          // the smoke is read at 12, not before
  assertEquals(emptyStop(60, 30), null);          // "after 60"
  assertEquals(emptyStop(61, 9), null);           // 14.8%
  assert(emptyStop(61, 10));                      // 16.4%
  assertEquals(emptyStop(200, 30), null);         // exactly 15% has not passed it
  assert(emptyStop(200, 31));
});
