// ── The 4e-2 rulings N8–N13 (operator, signed 2026-09-24) ───────────────────────────────────────
//
// N8-N10 are the stall and the writer race; N11-N12 are the store. Unit level here; the handler-level
// halves (a finder cap failing a window, a lease refusing a resume, judge_objections on a row) are in
// handler4e2.test.ts against the real database.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CHARS_PER_TOKEN_PESSIMISTIC, NUM_PREDICT_CONVERT, NUM_PREDICT_FINDER, NUM_PREDICT_JUDGE,
  OUTPUT_CAP_ERROR, OUTPUT_CAP_REASON, OVER_BUDGET_ERROR, PARSER_RULES_VERSION, PARSER_RULINGS_4E2,
  estimatePromptTokens, numPredictFor,
} from "./rules.ts";
import { FINDER_SYSTEM, buildFinderUser } from "./convert.ts";
import { NUM_CTX, ParserCallError } from "./handler.ts";
import { detectShape, toPassages, toWindows } from "./segment.ts";

Deno.test("4e-2: the version moved and the six rulings are exported verbatim", () => {
  assertEquals(PARSER_RULES_VERSION, "2026-09-24.4");
  assertEquals(PARSER_RULINGS_4E2.length, 6);
  for (const [i, prefix] of ["N8 ", "N9 ", "N10 ", "N11 ", "N12 ", "N13 "].entries()) {
    assert(PARSER_RULINGS_4E2[i].startsWith(prefix), `ruling ${i + 8} is out of order`);
  }
});

// ── N8 ───────────────────────────────────────────────────────────────────────────────────────────
Deno.test("N8: every call site has the signed cap, and nothing is left uncapped", () => {
  assertEquals(NUM_PREDICT_FINDER, 2048);
  assertEquals(NUM_PREDICT_CONVERT, 256);
  assertEquals(NUM_PREDICT_JUDGE, 512);
  assertEquals(numPredictFor("finder"), 2048);
  assertEquals(numPredictFor("judge"), 512);
  assertEquals(numPredictFor("convert:need"), 256);
  assertEquals(numPredictFor("convert:job"), 256);
  assertEquals(numPredictFor("convert:job:solution_agnostic_v3"), 256);
  // an unknown stage is capped too — the default is a cap, never "no cap"
  assert(numPredictFor("something:new") > 0);
});

Deno.test("N8: the budget estimate is PESSIMISTIC against the measured ratio", () => {
  // measured on this model's real parser prompts: 15,847 chars -> 4,171 tokens (3.80 chars/token) and
  // 15,487 -> 3,947 (3.92). The estimator must over-count, so a guard errs toward refusing.
  assertEquals(CHARS_PER_TOKEN_PESSIMISTIC, 3.0);
  assert(estimatePromptTokens("x".repeat(15847)) > 4171, "must over-estimate the measured finder prompt");
  assertEquals(estimatePromptTokens(""), 0);
  assertEquals(estimatePromptTokens("abc"), 1);
});

Deno.test("N8: every real kickoff window fits its finder prompt plus the 2048 cap", async () => {
  // The guard is only useful if it does not refuse the work it exists to protect. Every window of the
  // record that caused the stall must pass the check with the cap in place.
  const rec = JSON.parse(await Deno.readTextFile(
    "/tmp/claude-501/-Users-fomomojodojo/29f41d3f-7718-4229-a1b8-dffddd4a1479/scratchpad/rec.json"));
  const text: string = rec.verbatim;
  const ps = await toPassages(text, detectShape(text));
  const ws = toWindows(ps);
  const ours = new Set((rec.our_speakers ?? []).map((s: string) => s.trim().toLowerCase()));
  const sideOf = (l: string | null): "client" | "ours" => (l && ours.has(String(l).trim().toLowerCase()) ? "ours" : "client");
  let worst = 0;
  for (let i = 0; i < ws.length; i++) {
    const slice = ps.slice(ws[i].start_passage, ws[i].end_passage + 1);
    const u = buildFinderUser(slice, ws[i].start_passage, { all: ps, start: ws[i].start_passage, sideOf });
    const total = estimatePromptTokens(FINDER_SYSTEM) + estimatePromptTokens(u) + NUM_PREDICT_FINDER;
    worst = Math.max(worst, total);
    assert(total <= NUM_CTX, `window ${i} would be refused: ${total} > ${NUM_CTX}`);
  }
  assert(worst > NUM_CTX * 0.8, `the worst window should be tight enough to be worth checking, got ${worst}`);
});

Deno.test("N8: the two refusals are distinct, typed, and name their stage", () => {
  assertEquals(OVER_BUDGET_ERROR, "prompt_plus_cap_over_num_ctx");
  assertEquals(OUTPUT_CAP_ERROR, "output_cap_reached");
  assertEquals(OUTPUT_CAP_REASON, "output cap reached");
  assert(String(OVER_BUDGET_ERROR) !== String(OUTPUT_CAP_ERROR), "refused-before and capped-during are different faults");
  const e = new ParserCallError(OUTPUT_CAP_ERROR, "finder", "done_reason=length at num_predict 2048");
  assertEquals(e.code, OUTPUT_CAP_ERROR);
  assertEquals(e.stage, "finder");
  assertEquals(e.name, "ParserCallError");
  assert(e instanceof Error);
});

// ── N9 ───────────────────────────────────────────────────────────────────────────────────────────
Deno.test("N9: the output schema is the 2026-09-23.3 shape — one items array, nothing per slot", () => {
  const schema = FINDER_SYSTEM.slice(FINDER_SYSTEM.lastIndexOf("JSON only"));
  assert(schema.includes('{"items":['), "one flat items array");
  assertEquals(schema.split('"items"').length - 1, 1, "exactly one items key");
  for (const slotWord of ["WANT", "STRUGGLE", "BELIEVE", "STAND FOR"]) {
    assert(!schema.includes(slotWord), `the schema must not carry the slot ${slotWord}`);
  }
  assert(schema.includes('"kind":"job|pain_point|desire|outcome|route|step|positioning|cascade|ask|hypothesis"'));
});
