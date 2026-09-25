// ── The interview parser RULES (operator rulings PR1–PR6, signed 2026-09-22) ──────────────────────
//
// The design these serve is Part I, signed 2026-09-19: a LOCAL pipeline, separate from the Dify file
// analysis — segment the transcript into passages, find typed items (job, pain point, desire,
// outcome), convert each to framework form, let a judge annotate and never drop, and land every item
// once in interview_items.
//
// The version below is stamped on every row the parser writes. Bump it when any rule text changes:
// a row then says which rules produced it, and rows written under an older version stand as history
// rather than being re-interpreted under rules they never saw.
export const PARSER_RULES_VERSION = "2026-09-24.4";

/** R6 (operator ruling, 2026-09-23) — SUPERSESSION. Parsing a record whose live items carry an OLDER
 *  rules_version retracts every one of them first, with the reason below, then lands the new set; a
 *  same-version parse stays idempotent (rule 5). Retracted rows are kept: they are the history of what
 *  the older rules produced, and the audit reads the pair. */
export const supersededReason = (version: string = PARSER_RULES_VERSION): string => `superseded by rules ${version}`;
/** R7 — the one case where a SAME-version parse is not a no-op: our_speakers changed under it. */
export const SIDE_CHANGED_REASON = "speaker side changed";

/** The five rules, verbatim. interviewParserRules.test.ts pins each string and the count. */
export const PARSER_RULES = [
  "Breadth, never drop: every candidate item lands; the judge annotates with a reason on pass and on reject; a rejected item lands marked, never missing.",
  "Pointer over wording: a passage pointer is computed by the code (turn index, line range, passage sha256) against the record's stored text sha; the model never asserts offsets; trace verifies the pointer, not the words.",
  "The executor's words: raw words are stored verbatim with their speaker label; the framework statement is derived and judged under the current criterion (job statements under solution-agnostic v3 with the deterministic means layer; needs under the ODI canonical form); no hand-authored statement ever enters a row.",
  "Unvalidated and unreviewed on landing; \"Mark reviewed\" never sets validated; public-register and external writers never read items; local generators may.",
  "One landing per item, keyed by content identity so a re-parse is idempotent; retiring the record withdraws every item it produced.",
] as const;

/** Rule 2 is the one the P6 probe forced: asked for character offsets over a 12,000-char window, the
 *  local model returned 116 spans of which 34 fell outside the window or inverted. An offset a model
 *  asserts is not evidence, so the pointer is computed by the code and trace re-checks the pointer. */
export const POINTER_IS_CODE_COMPUTED = true;

/** Per-record strictness (a per-company admin setting, stored on each record). */
export const STRICTNESS = ["keep_and_mark", "located_only"] as const;
/** How a pointer's passage is matched back to the stored text when trace re-checks it. */
export const MATCH_TOLERANCE = ["exact", "ws", "fuzzy_0_85"] as const;
export type Strictness = (typeof STRICTNESS)[number];
export type MatchTolerance = (typeof MATCH_TOLERANCE)[number];

/** The 4e rulings (operator, signed 2026-09-24), verbatim. rulings4e.test.ts pins each string and the
 *  count. They amend the five rules above rather than replacing them: N6 is the one that narrows rule
 *  1, and it says so in its own words. */
export const PARSER_RULINGS_4E = [
  "N1 Remove the 4a \"no context in the words\" refusal branch and its reason string.",
  "N2 ODI need = direction + metric + object. The object must come from the passage's words. The metric is chosen from a closed set {time, likelihood, effort, number} and is form scaffolding, exempt from the judge like the direction verb. No other metric word may appear. This amends Sep 22 ruling A for interview needs only.",
  "N3 Typed-objection judge: the judge returns objections as JSON {type: added_object|added_metric|added_context|added_quantity|lost_object|lost_context|wrong_meaning, term}. Code drops any added_* objection whose term (case-insensitive, stem-matched) occurs in the passage. Surviving objections annotate with a reason built from type + term. Every dropped objection is counted in the run's audit row.",
  "N4 Read feedback is detected in code: if an item's raw_words shares a run of >=4 normalized words with the company's current first-read text, the item is kind ask, statement prefixed \"read feedback:\", plus any implied item it carries. The deterministic match wins over the model's kind.",
  "N5 raw_words is the located span cut from the record text by the pointer, never the model's quote. A quote may not cross a turn boundary. Each item records the locate rung that matched (exact, ws, punctuation-blind, neighbour, fuzzy).",
  "N6 A story (a past event narrated) or a reaction to us is never kind pain_point. It yields only its implied item, judged against the story, or nothing.",
  "N7 Finder step one enumerates every kind's slot: what they want, what they struggle with, what they are trying to get done, how they judge results, what they believe, how they reach people, what they stand for, what they ask of us.",
] as const;

/** N4: the prefix a read-feedback item carries. Named here so the parser, the guard and the sheet agree. */
export const READ_FEEDBACK_STATEMENT_PREFIX = "read feedback:";
/** N4: how long a shared run of normalized words must be before it counts as quoting the read. */
export const READ_OVERLAP_WORDS = 4;

/** The 4e-2 rulings (operator, signed 2026-09-24), verbatim. rulings4e2.test.ts pins each string and
 *  the count. N8-N10 are the stall; N11-N12 are the store; N13 is how the parse is run. */
export const PARSER_RULINGS_4E2 = [
  "N8 Every model call sends num_predict: finder 2048, convert:need / convert:job / solution_agnostic_v3 256, judge 512. Before each call, code checks measured prompt tokens + num_predict <= num_ctx and refuses the call as an error if not. done_reason \"length\" is an error: for the finder it fails the window with the cursor kept and lands no items from it; for a converter or judge it annotates the item \"output cap reached\". Every capped call is counted in the run's audit row.",
  "N9 The finder's eight-slot list (N7) becomes a per-passage checklist the model applies, not an output structure. The finder's output schema returns to the 2026-09-23.3 shape (items array only). N1-N6 unchanged. PARSER_RULES_VERSION 2026-09-24.2.",
  "N10 Single-writer lease on the parse run row: each pass writes a lease (pass id + heartbeat time) and refreshes the heartbeat after every window; a fresh call or a resume is refused 409 parse_in_flight while another pass's heartbeat is under STALE_AFTER_MS (5 min).",
  "N11 Migration: interview_items gains judge_objections jsonb NULL — the kept and dropped typed objections for the item, written at landing, added to the immutability trigger's guarded columns.",
  "N12 Migration: the immutability trigger refuses setting retracted_at or retracted_reason back to NULL once set, for every reason.",
  "N13 The parse runs only through the served interview-parser function and its self-fire. No local runner or driver script.",
] as const;

// ── N8: the output caps ──────────────────────────────────────────────────────────────────────────
//
// WHY THESE EXIST. Measured on 2026-09-24: the finder call on the kickoff's window 3 never terminated.
// A streaming probe ran past 13,563 tokens in 11 minutes at ~20 t/s and was still going; the same
// window under the 2026-09-23.3 prompt stopped at 347 tokens in 39 s. Nothing bounded it, because no
// call had ever sent num_predict. Generation ran past num_ctx, llama-server's --context-shift
// discarded the prompt 4,093 tokens at a time, and with -np 1 every later request queued behind it —
// which is what looked like a wedged server. A cap is the floor under all of that.
export const NUM_PREDICT_FINDER = 2048;
export const NUM_PREDICT_CONVERT = 256;
export const NUM_PREDICT_JUDGE = 512;

/** The cap for a call site's stage string. Converters and the solution-agnostic vote share one. */
export function numPredictFor(stage: string): number {
  if (stage === "finder") return NUM_PREDICT_FINDER;
  if (stage === "judge") return NUM_PREDICT_JUDGE;
  return NUM_PREDICT_CONVERT;
}

/** N8: a refusal BEFORE the call — the prompt plus its cap would not fit the context window. */
export const OVER_BUDGET_ERROR = "prompt_plus_cap_over_num_ctx";
/** N8: the model stopped because it hit the cap. An error, never a silent truncation. */
export const OUTPUT_CAP_ERROR = "output_cap_reached";
/** N8: what a converter or judge item is annotated with when its call hit the cap. */
export const OUTPUT_CAP_REASON = "output cap reached";

/**
 * N8: the prompt size the budget check uses. Ollama 0.34.0 exposes no tokenizer endpoint
 * (/api/tokenize is 404, /api/embed 501), so this is an ESTIMATE and is deliberately PESSIMISTIC:
 * 3.0 characters per token against a measured 3.80-3.92 on this model's real parser prompts
 * (finder window 3: 15,847 chars -> 4,171 tokens; the same window at 2026-09-23.3: 15,487 -> 3,947).
 * Over-estimating means the check refuses early rather than letting a call overrun, which is the
 * direction a guard should fail in. The largest real finder prompt measured (window 6, 17,210 chars)
 * estimates 5,737 + 2,048 = 7,785 against num_ctx 8,192 and passes.
 */
export const CHARS_PER_TOKEN_PESSIMISTIC = 3.0;
export const estimatePromptTokens = (text: string): number =>
  Math.ceil(String(text ?? "").length / CHARS_PER_TOKEN_PESSIMISTIC);

/** The 4e-3 rulings (operator, signed 2026-09-24), verbatim. rulings4e3.test.ts pins each string and
 *  the count. N14 undoes N9; N15 makes a capped finder survivable; N16-N20 are the operator's read of
 *  run 3456's twenty client items. */
export const PARSER_RULINGS_4E3 = [
  "N14 The finder system prompt returns to the 2026-09-24.1 text (N7 enumeration). N8 caps stay on every call.",
  "N15 Split on cap: a finder call ending with done_reason \"length\" is not an error on first occurrence. Its window is re-run as two halves split at the passage boundary nearest the middle; each half is its own cursor unit, run in order, each starting only when the pass clock allows. A half that caps again fails the run with the cursor kept. Splits are counted in the run row.",
  "N16 N3 as signed: the term check drops only added_* objections — added_metric whose term is in the closed metric set, and any added_* whose term occurs in the passage. wrong_meaning and every lost_* objection are never dropped.",
  "N17 Read reactions: (a) code — an item is read feedback when either of its two preceding turns is an our-side turn sharing a run of >=4 normalized words with the current first-read text (same index as N4); (b) finder prompt — a client turn reacting to what is on screen or to what we just read aloud is kind ask, \"read feedback:\". The deterministic match wins over the model's kind.",
  "N18 Finder item test: meeting logistics (screen, font, sharing or pulling up a page, reading along, scheduling, audio) are not items.",
  "N19 Finder: a turn listing several goals yields one item per goal, each quoting its own sentence.",
  "N20 Deterministic gate: a framework_statement containing I, me, my, mine, we, us, our or ours (whole words, any case) gets one re-prompt, then is annotated \"first-person words in the statement\".",
] as const;

// ── N15: THE PASS-START THRESHOLD ────────────────────────────────────────────────────────────────
//
// N15 requires that a unit only start when a WORST-CASE unit still finishes under the 400 s isolate
// wall. The worst case is a finder call that runs its full cap, so it is measured, not guessed:
//
//   generation rate   ~20.5 tokens/s   (llama-server `tg` in ~/.ollama/logs/server.log, run 3456)
//   prompt-eval rate  ~210 tokens/s    (derived: the 4,532-token prompt call took 40.4 s wall and
//                                       generated 386 tokens -> 18.8 s generating -> 21.6 s evaluating)
//   worst prompt       4,532 tokens    (the largest finder prompt of this record, window 6)
//
//   worst finder call = 4,532/210 + 2,048/20.5 = 21.6 + 99.9 = ~121.5 s
//
// WORST_UNIT_MS is 150,000: the 121.5 s finder call plus ~28 s of head-room for the unit's converters
// and judges, which are small calls (256 and 512 caps) and measured at 1-2 s each.
//
// THE THRESHOLD, STATED: a unit starts only while `elapsed + WORST_UNIT_MS <= TIME_BUDGET_MS`. With
// TIME_BUDGET_MS 300,000 the last unit may start at 150 s and finishes by 300 s in the worst case —
// 100 s clear of the 400 s wall. A unit that cannot start leaves the cursor where it is and the pass
// self-fires, which is the resumable path R4 already owns.
export const WORST_UNIT_MS = 150_000;
export const MEASURED_GEN_TOKENS_PER_S = 20.5;
export const MEASURED_PROMPT_TOKENS_PER_S = 210;

/** N15: a capped finder splits its unit at the passage boundary nearest the middle. A unit that has
 *  already been split once and caps again fails the run — this is the depth at which that happens. */
export const MAX_SPLIT_DEPTH = 1;
export const SPLIT_ON_CAP_REASON = "finder hit its cap — unit split in two";

/** The 4e-4 rulings (operator, signed 2026-09-24), verbatim. rulings4e4.test.ts pins each string and
 *  the count. R1 and R2 undo two of 4e-3's prompt changes on the ablation's evidence; N21 replaces
 *  what R2 removed with code that cannot be talked out of firing. */
export const PARSER_RULINGS_4E4 = [
  "R1 Remove N19 from the finder prompt.",
  "R2 Remove N17(b) from the finder prompt. N4 and N17(a) stay in code unchanged.",
  "N21 Read reactions captured by code: a client-side passage lands as kind ask, statement prefixed \"read feedback:\", raw_words = the whole passage cut from the record, no model call, trace_state located, judge_reason \"read reaction captured by code\", when its turn has >= 6 words and either (a) the turn shares a run of >= 4 normalized words with the current first-read text (N4 index), or (b) one of its two preceding turns is an our-side turn sharing a run of >= 4 normalized words with that text. Finder items on the same turn still land and are relabelled by N4 / N17(a) as today. One N21 item per passage; content identity prevents duplicates on re-parse. Counted in the run row as read_feedback_code_capture.",
] as const;

// ── N21: the code capture ────────────────────────────────────────────────────────────────────────
//
// Three prompt attempts failed to make the finder notice a read reaction, and the last one suppressed
// the very turn it was written for. N21 stops asking. A read reaction is identifiable from the
// TRANSCRIPT ALONE — either the client quotes our read, or our own preceding turn does — so the code
// lands it directly, with no model call and nothing for a prompt to talk it out of.
export const N21_MIN_TURN_WORDS = 6;
export const N21_REASON = "read reaction captured by code";
/** Which of N21's two routes caught it, recorded so the run row can be read by route. */
export const N21_ROUTES = ["a_turn_quotes_read", "b_preceded_by_our_read_turn"] as const;
export type N21Route = (typeof N21_ROUTES)[number];
/** N21 items are code captures, not located quotes — the rung says so rather than naming a ladder
 *  step that never ran. */
export const N21_RUNG = "code_capture";
