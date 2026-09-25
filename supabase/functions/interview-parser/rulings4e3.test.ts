// ── The 4e-3 rulings N14–N20 (operator, signed 2026-09-24) ──────────────────────────────────────
// Unit level. N15's split and N17(a)'s preceding-turn rule are exercised through the handler in
// handler4e2.test.ts and handler4e3.test.ts against the real database.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  FINDER_SYSTEM, FIRST_PERSON_REASON, FIRST_PERSON_WORDS, JOB_FROM_WORDS_SYSTEM, ODI_CONTEXT_RULE,
  convertItem, firstPersonHits, hasFirstPerson, siftObjections, type Call,
} from "./convert.ts";
import {
  MAX_SPLIT_DEPTH, MEASURED_GEN_TOKENS_PER_S, MEASURED_PROMPT_TOKENS_PER_S, NUM_PREDICT_FINDER,
  PARSER_RULES_VERSION, PARSER_RULINGS_4E3, WORST_UNIT_MS,
} from "./rules.ts";
import { TIME_BUDGET_MS } from "./handler.ts";

const PASS_OK = JSON.stringify({ ok: true, objections: [] });

Deno.test("4e-3: the version moved and the seven rulings are exported verbatim", () => {
  assertEquals(PARSER_RULES_VERSION, "2026-09-24.4");
  assertEquals(PARSER_RULINGS_4E3.length, 7);
  for (const [i, prefix] of ["N14 ", "N15 ", "N16 ", "N17 ", "N18 ", "N19 ", "N20 "].entries()) {
    assert(PARSER_RULINGS_4E3[i].startsWith(prefix), `ruling ${i + 14} is out of order`);
  }
});

// ── N14 ──────────────────────────────────────────────────────────────────────────────────────────
Deno.test("N14: the finder is back on the N7 enumeration, and the caps stay", () => {
  assert(FINDER_SYSTEM.includes("STEP ONE: go through EVERY SLOT BELOW, IN ORDER"));
  assert(!FINDER_SYSTEM.includes("CHECKLIST FOR YOUR OWN READING"));
  assertEquals(NUM_PREDICT_FINDER, 2048, "N8's cap is what makes the enumeration safe to restore");
});

// ── N15 ──────────────────────────────────────────────────────────────────────────────────────────
Deno.test("N15: the stated threshold keeps a worst-case unit inside the isolate wall", () => {
  // The worst case is a finder that runs its full cap: prompt eval + 2048 generated, at the measured
  // rates. The threshold must leave room for it, and the whole thing must clear the 400 s wall.
  const worstPromptTokens = 4532;                       // the largest finder prompt of this record
  const worstCallMs = (worstPromptTokens / MEASURED_PROMPT_TOKENS_PER_S) * 1000
                    + (NUM_PREDICT_FINDER / MEASURED_GEN_TOKENS_PER_S) * 1000;
  assert(worstCallMs < WORST_UNIT_MS, `the worst call ${Math.round(worstCallMs)}ms must fit WORST_UNIT_MS ${WORST_UNIT_MS}`);
  const lastStart = TIME_BUDGET_MS - WORST_UNIT_MS;
  assert(lastStart > 0, "a unit must be able to start at all");
  assertEquals(lastStart, 150_000, "the last start is 150 s");
  assert(lastStart + WORST_UNIT_MS <= 300_000, "worst finish is 300 s");
  assert(lastStart + WORST_UNIT_MS < 400_000, "and 100 s clear of the 400 s isolate wall");
  assertEquals(MAX_SPLIT_DEPTH, 1, "a half that caps again fails; it never splits a third time");
});

// ── N16 ──────────────────────────────────────────────────────────────────────────────────────────
Deno.test("N16: a wrong_meaning objection is never dropped, whatever term it names", () => {
  // The c35a6aba case: a wrong_meaning naming a scaffolding term was dropped and the item was
  // ACCEPTED on the strength of it. A wrong_meaning is not a claim about what the passage contains,
  // so no term can answer it.
  const passage = "we talk about effort and the intake spreadsheet every single week";
  const { kept, dropped } = siftObjections(
    [{ type: "wrong_meaning", term: "effort" }], passage, "odi_need");
  assertEquals(dropped.length, 0, "a wrong_meaning may never be dropped");
  assertEquals(kept.length, 1);
  assertEquals(kept[0].type, "wrong_meaning");
});

Deno.test("N16: a lost_ objection is never dropped, even when its term is in the passage", () => {
  const passage = "we talk about effort and the intake spreadsheet every single week";
  const { kept, dropped } = siftObjections([
    { type: "lost_context", term: "intake spreadsheet" },   // the term IS in the passage
    { type: "lost_object", term: "effort" },                // and this one is a form metric
  ], passage, "odi_need");
  assertEquals(dropped.length, 0, "a lost_* says something is MISSING; a term cannot answer that");
  assertEquals(kept.length, 2);
});

Deno.test("N16: an added_metric naming one of the four IS dropped; other added_* still need the passage", () => {
  const passage = "the intake spreadsheet takes days";
  const a = siftObjections([{ type: "added_metric", term: "time" }], passage, "odi_need");
  assertEquals(a.dropped.length, 1);
  assertEquals(a.dropped[0].why, "the term is one of the form's four metrics");
  // an added_metric naming something else falls through to the passage test
  const b = siftObjections([{ type: "added_metric", term: "clarity" }], passage, "odi_need");
  assertEquals(b.kept.length, 1, "not a form metric and not in the passage -> kept");
  const c = siftObjections([{ type: "added_object", term: "intake spreadsheet" }], passage, "odi_need");
  assertEquals(c.dropped.length, 1);
  assertEquals(c.dropped[0].why, "the term occurs in the passage");
});

// ── N17(b), N18, N19: prompt-only rulings ───────────────────────────────────────────────────────
Deno.test("4e-4 R1/R2 removed two of the three; N18 stays", () => {
  // The ablation attributed the regression and 4e-4 acted on it: N17(b) suppressed turn 226 on its
  // own, N19 drove the job refusals from 22% to 90%. N18 is the one that earned its place — it is
  // what removed the logistics asks on turns 173 and 178 — so it stays.
  assert(!FINDER_SYSTEM.includes("THIS MEETING INCLUDED AN ON-SCREEN WALKTHROUGH"), "R2 removed N17(b)");
  assert(!FINDER_SYSTEM.includes("A TURN THAT LISTS SEVERAL GOALS YIELDS ONE ITEM PER GOAL"), "R1 removed N19");
  assert(FINDER_SYSTEM.includes("MEETING LOGISTICS ARE NOT ITEMS"), "N18 stays");
});

// ── N20 ──────────────────────────────────────────────────────────────────────────────────────────
Deno.test("N20: the eight first-person words, whole-word and case-insensitive", () => {
  assertEquals([...FIRST_PERSON_WORDS], ["i", "me", "my", "mine", "we", "us", "our", "ours"]);
  assertEquals(FIRST_PERSON_REASON, "first-person words in the statement");
  assert(hasFirstPerson("Minimize the time of OUR intake"));
  assert(hasFirstPerson("Reduce the effort I spend"));
  assertEquals(firstPersonHits("Minimize the time we spend on our intake"), ["we", "our"]);
  // whole word only: these must not trip it
  for (const clean of ["Minimize the time of intake", "Reduce the effort of mining", "Increase the number of ourselves"]) {
    assertEquals(hasFirstPerson(clean), false, `false positive: ${clean}`);
  }
  assert(ODI_CONTEXT_RULE.includes("NEVER use I, me, my, mine, we, us, our or ours"));
  assert(JOB_FROM_WORDS_SYSTEM.includes("NEVER use I, me, my, mine, we, us, our or ours"));
});

Deno.test("N20: a first-person statement re-prompts ONCE, then lands annotated with the statement kept", async () => {
  let writes = 0;
  const call: Call = ({ stage }) => {
    if (stage === "convert:need") { writes++; return Promise.resolve(JSON.stringify({ odi_canonical_statement: "Minimize the time of our intake process" })); }
    return Promise.resolve(PASS_OK);
  };
  const w = "The intake process takes us far too long every single month.";
  const c = await convertItem({ call, kind: "pain_point", rawWords: w, speaker: "A", jobExecutor: "", passageText: w });
  assertEquals(writes, 2, "exactly one retry");
  assertEquals(c.judge_state, "annotated");
  assert(c.judge_reason.startsWith(FIRST_PERSON_REASON), c.judge_reason);
  assert(c.judge_reason.includes("our"));
  assertEquals(c.framework_statement, "Minimize the time of our intake process", "kept beside the annotation");
});

Deno.test("N20: the retry SUCCEEDING lands the item normally", async () => {
  let writes = 0;
  const call: Call = ({ stage }) => {
    if (stage === "convert:need") {
      writes++;
      return Promise.resolve(JSON.stringify({ odi_canonical_statement: writes === 1
        ? "Minimize the time of our intake process"
        : "Minimize the time of the intake process" }));
    }
    return Promise.resolve(PASS_OK);
  };
  const w = "The intake process takes us far too long every single month.";
  const c = await convertItem({ call, kind: "pain_point", rawWords: w, speaker: "A", jobExecutor: "", passageText: w });
  assertEquals(writes, 2);
  assertEquals(c.judge_state, "accepted");
  assert(!c.judge_reason.includes("first-person"));
});
