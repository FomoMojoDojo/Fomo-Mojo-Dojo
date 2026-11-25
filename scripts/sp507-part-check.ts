// ── SP-507: DOES JUDGE A RULE CORRECTLY ON THE SIX NAMED QUOTES? ──────────────────────────────────
//
// THE GATE FOR THE WHOLE v3 SHAPE. The six quotes named in the brief (04adf671, 8c10efb7, c4e961c6,
// ca8a4568, d3866c50, dad3eab5) are the supporting quotes of ONE live pattern:
//
//   "Customer service representatives are unhelpful and dismissive, failing to resolve issues"
//
// which is the measured worst case of v2's shape. Asked as one compound question, v2.2's judge kept
// almost none of them, and its stated reason was that a particular customer's experience does not
// state a generalisation about "Customers". v3's claim is that the question was the problem: split
// into single predicates, each of these quotes DOES show each predicate, and the compound becomes our
// arithmetic rather than the model's.
//
// PASS = 6 of 6 supported. If it fails, SP-510's fallback (judge B — one call per part per quote) runs
// on N13 alone and the comparison is reported; nothing proceeds on a judge that cannot do this.
//
// LOCAL ONLY, AND IT STORES NO FINDING. Charter's lane is closed (pattern-lane-guard l5), so the judge
// is the local one. SP-518: it DOES write a model_calls row per call — it stores no pattern, part or
// verdict, but the judge time it spends is real and the ledger is the only record of it.
//
// SP-516: the pass bar is 6 of 6 on the "unhelpful" part. The other part is judged on its merits and
// reported — c4e961c6 not showing "dismissive" is a CORRECT verdict about an overclaiming v1 compound,
// and a bar that counted it as a judge failure was measuring the pattern, not the judge.
//
//   deno run -A scripts/sp507-part-check.ts [--judge-model=qwen3.6:35b]
import { JUDGE_NUM_PREDICT, JUDGE_NUM_PREDICT_RETRY, PATTERN_JUDGE_THINK, callJudgeWithEmptyRetry, isEmptyAnswerError, JUDGE_SYSTEM_BPRIME1, JUDGE_SYSTEM_BPRIME2, JUDGE_SYSTEM_CUREC, JUDGE_SYSTEM_PRE545, JUDGE_SYSTEM_TIGHTENED, JudgeUnreadable, judgeAWithReask, type PatternQuote } from "../supabase/functions/_shared/needPatterns.ts";
import { callOllamaJson } from "../supabase/functions/_shared/claimDeltaSynthesis.ts";
import { LOCAL_PATTERN_JUDGE } from "../src/lib/modelRouter/resolveModel.ts";
// SP-518: an instrument's calls are real spend and are ledgered like any other.
import { ledgerLocalCall, psqlJson } from "./ledgerShim.ts";

const OLLAMA = Deno.env.get("OLLAMA_BASE_URL") ?? "http://127.0.0.1:11434/v1";
const SIX = ["04adf671", "8c10efb7", "c4e961c6", "ca8a4568", "d3866c50", "dad3eab5"];
const arg = (n: string, d = "") => Deno.args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
/** SP-517: the judge MODEL is a parameter, so two models face the identical test. */
// SP-555: the pattern judge of record, so the SP-516 re-run measures what actually judges.
const JUDGE_MODEL = arg("judge-model", LOCAL_PATTERN_JUDGE);
/** SP-554 (2026-11-22): THE THINKING JUDGE, MEASUREMENT ONLY. `--judge-think` turns ollama's
 *  top-level `think` on and `--judge-num-predict` sizes the budget for thinking PLUS the answer —
 *  the two go together, because SP-517 measured that thinking on a judge-sized budget spends the
 *  whole allowance on `message.thinking` and returns an EMPTY `content`, which reads as a broken
 *  model rather than an unbudgeted one. Neither flag changes the judge of record: an invocation
 *  passing neither gets `think:false` at JUDGE_NUM_PREDICT, exactly as before. */
// SP-555: thinking ON by default; --judge-no-think is the way back for a comparison arm.
const JUDGE_THINK = Deno.args.includes("--judge-no-think") ? false : PATTERN_JUDGE_THINK;
const JUDGE_NUM_PREDICT_ARG = arg("judge-num-predict", "");
const JUDGE_NP = JUDGE_NUM_PREDICT_ARG ? Number(JUDGE_NUM_PREDICT_ARG) : JUDGE_NUM_PREDICT;
if (!Number.isFinite(JUDGE_NP) || JUDGE_NP <= 0) {
  console.error(`REFUSED: --judge-num-predict must be a positive integer; got ${JSON.stringify(JUDGE_NUM_PREDICT_ARG)}`);
  Deno.exit(1);
}


// SP-527(B), MEASUREMENT ONLY: --system=tightened swaps in JUDGE_SYSTEM_TIGHTENED. Default is the LIVE
// judge prompt, so every earlier number from this instrument remains comparable, and the live judge is
// unchanged by this flag existing.
const SYSTEM_MODE = arg("system", "live");
// SP-531: the two B′ arms join the flag. Each is MEASUREMENT ONLY and reachable only from here —
// `run-need-patterns.ts` passes no `system` at all, so the live prompt cannot be displaced by accident.
const SYSTEM_BY_MODE: Record<string, string | undefined> = {
  // SP-545 (2026-11-22): "live" STILL MEANS WHATEVER IS LIVE — and the live prompt is now cure B, so
  // `live` and `tightened` are the same string from here on. Every number this instrument recorded as
  // "live" before 2026-11-22 was the PRE-545 prompt, which keeps its own name and its own mode below:
  // a comparison against the old live judge is asked for with `--system=pre545`, not by reading an
  // older report's column.
  live: undefined,                        // judgeAWithReask defaults to the live JUDGE_SYSTEM (cure B)
  pre545: JUDGE_SYSTEM_PRE545,            // the prompt that was live until SP-545 (md5 48cd11f4…)
  tightened: JUDGE_SYSTEM_TIGHTENED,      // cure B
  bprime1: JUDGE_SYSTEM_BPRIME1,          // B′1: generation-only rubric lines removed, nothing added
  bprime2: JUDGE_SYSTEM_BPRIME2,          // B′2: B′1 plus cure B's bullets
  curec: JUDGE_SYSTEM_CUREC,              // SP-534 cure C: cure B plus the four rate/duration rules
};
if (!Object.hasOwn(SYSTEM_BY_MODE, SYSTEM_MODE)) {
  console.error(`REFUSED: --system must be one of ${Object.keys(SYSTEM_BY_MODE).join(", ")} — not ${JSON.stringify(SYSTEM_MODE)}`);
  Deno.exit(1);
}
const JUDGE_SYSTEM_OVERRIDE = SYSTEM_BY_MODE[SYSTEM_MODE];

const COMPANY = arg("company", "dd40ce2f-ff67-4111-bd3c-67943dde6717");
/** SP-516: the part the bar is set on, by its ordinal. */
const BAR_PART = 1;

// The claim and its parts. The CLAIM is the stored v1/v2 sentence, unchanged, so this measures the
// SHAPE OF THE QUESTION and nothing else. The PARTS are its two predicates, written as predicates
// (SP-501: never a subject — "Customers" is exactly the word v2.2 demanded the quotes generalise to).
const CLAIM = "Customer service representatives are unhelpful and dismissive";
const PARTS = ["the agent does not resolve the customer's problem", "the agent is dismissive of the customer"];

const rows = await psqlJson<{ id: string; quote: string; outcome: string }>(
  `select distinct s.id, s.quote, n.desired_outcome as outcome
     from public.signals s
     join public.need_pattern_quotes pq on pq.signal_id = s.id
     join public.need_patterns p on p.id = pq.pattern_id
     join public.odi_needs n on n.id = p.need_id
    where p.superseded_at is null and p.name like 'Customer service representatives are unhelpful%'
      and left(s.id::text, 8) in (${SIX.map((x) => `'${x}'`).join(",")})`);

// NON-VACUITY: six named quotes, and a check that finds five of them is not this check.
if (rows.length !== SIX.length) {
  console.error(`REFUSED: found ${rows.length} of the ${SIX.length} named quotes — this check is about those six and no others`);
  console.error(`  found: ${rows.map((r) => r.id.slice(0, 8)).sort().join(" ")}`);
  Deno.exit(1);
}
const NEED = rows[0].outcome;

console.log(`judge: ${JUDGE_MODEL} (temperature 0, seed 42), system=${SYSTEM_MODE}, one call per quote, a verdict per part — ledgered (SP-518)`);
console.log(`NEED:  ${NEED}`);
console.log(`CLAIM: ${CLAIM}`);
PARTS.forEach((p, i) => console.log(`PART ${i + 1}: ${p}`));
console.log("");

let supported = 0;
const statedPerPart = PARTS.map(() => 0);
let seconds = 0;
let calls = 0, ledgered = 0, reasks = 0, recovered = 0, failedTwice = 0, unreadable = 0;
// SP-556: both counts, reported whatever they are.
let emptyFirst = 0, emptyRecovered = 0;
const emptyFailed: string[] = [];
/** SP-518: calls that threw. They are ledgered (the compute was spent) and counted here. */
let failedCalls = 0;
for (const r of rows.sort((a, b) => a.id.localeCompare(b.id))) {
  const qt: PatternQuote = { signalId: r.id, quote: r.quote, site: "", eventDate: null, brand: "", polarity: null };
  const t0 = performance.now();
  // SP-514 is PART OF judge A, so the instrument uses the whole of it. Measuring the judge without
  // its own retry and reporting that as "judge A" would be the wrong measurement — and this check's
  // one failing case (ca8a4568, a one-word mis-transcription) is exactly what the retry recovers.
  let res;
  try {
    res = await judgeAWithReask({
    needStatement: NEED, name: CLAIM, parts: PARTS, quote: qt, system: JUDGE_SYSTEM_OVERRIDE,
    // SP-556: the retry an empty answer earns, around the SAME call this instrument always made.
    call: (system, user) => callJudgeWithEmptyRetry({
      system, user, first: JUDGE_NP, retry: JUDGE_NUM_PREDICT_RETRY,
      onEmpty: ({ recovered }) => {
        emptyFirst++;
        if (recovered) emptyRecovered++; else emptyFailed.push(`${r.id.slice(0, 8)} empty twice`);
      },
      call: async (sys, usr, np) => {
      // SP-518: the ledger row is written in a FINALLY, because a call that threw still happened and
      // still burned compute. qwen3.6:35b's empty-content failure was a real call that wrote no row
      // under the previous ordering. model_calls has no status column, so a failed call is ledgered at
      // its own call site and COUNTED here, where the run output can say how many failed.
      try {
        const content = await callOllamaJson(OLLAMA, JUDGE_MODEL, sys, usr, 600_000,
          // SP-555: thinking is ON and the budget is sized for thinking PLUS the answer; `np` is the
          // first attempt's budget or SP-556's retry budget, never a third value.
          { temperature: 0, seed: 42, num_predict: np, think: JUDGE_THINK });
        return content;
      } catch (e) { failedCalls++; throw e; } finally {
        calls++;
        ledgered += await ledgerLocalCall({ companyId: COMPANY, callSite: "sp507-part-check:judge", model: JUDGE_MODEL, system: sys, user: usr }) ? 1 : 0;
      }
      },
    }),
    });
  } catch (e) {
    // An answer that cannot be read fails THIS quote closed and is counted (see the corruption
    // harness for why this is not a crash).
    // SP-556: empty twice is its own fault, named, and fails this quote closed.
    if (isEmptyAnswerError(e)) { console.log(`${r.id.slice(0, 8)}  EMPTY TWICE  failed closed (SP-556)`); continue; }
    if (!(e instanceof JudgeUnreadable)) throw e;
    unreadable++;
    console.log(`${r.id.slice(0, 8)}  UNREADABLE   ${e.message.slice(0, 100)}`);
    continue;
  }
  const v = res.verdict;
  const s = (performance.now() - t0) / 1000;
  seconds += s;
  reasks += res.reasked.length ? 1 : 0; recovered += res.recovered; failedTwice += res.failedTwice;
  if (v.supports) supported++;
  for (const pv of v.parts) if (pv.states) statedPerPart[pv.ordinal - 1]++;
  console.log(`${r.id.slice(0, 8)}  ${v.supports ? "SUPPORTS    " : "not supported"}  ${s.toFixed(1)}s`);
  console.log(`          quote: ${r.quote.replace(/\s+/g, " ").trim().slice(0, 150)}`);
  for (const pv of v.parts) {
    console.log(`          part ${pv.ordinal}: ${pv.states ? "STATED" : pv.rejected ? `NOT STATED (${pv.rejected})` : "NOT STATED"}` +
      `  span=${pv.span ? JSON.stringify(pv.span.slice(0, 70)) : "(none)"}${pv.reason ? `  — ${pv.reason.slice(0, 80)}` : ""}`);
  }
  if (!v.belongsToNeed) console.log(`          SP-493: the judge says this CLAIM belongs to another need`);
  if (res.reasked.length) console.log(`          SP-514 span re-ask on part(s) ${res.reasked.join(", ")}: ${res.recovered} recovered, ${res.failedTwice} failed twice`);
}

console.log(`\n── SP-507 RESULT (${JUDGE_MODEL}, system=${SYSTEM_MODE}) ──────────────────────────`);
console.log(`every part supported: ${supported} of ${rows.length}   (${seconds.toFixed(1)}s total, ${(seconds / Math.max(calls, 1)).toFixed(1)}s per call over ${calls} call(s))`);
PARTS.forEach((p, i) => console.log(`  part ${i + 1} stated ${statedPerPart[i]} of ${rows.length}: "${p}"`));
console.log(`SP-514: ${reasks} quote(s) needed a span re-ask — ${recovered} part(s) recovered, ${failedTwice} failed twice`);
console.log(`UNREADABLE: ${unreadable} answer(s) could not be parsed and were failed closed`);
console.log(`SP-556 empty answers: ${emptyFirst} first attempt(s) empty \u00b7 ${emptyRecovered} recovered at ${JUDGE_NUM_PREDICT_RETRY} \u00b7 ${emptyFailed.length} failed closed${emptyFailed.length ? ` (${emptyFailed.join(", ")})` : ""}`);
console.log(`SP-518: ${ledgered} of ${calls} call(s) ledgered (${failedCalls} of them failed and are ledgered anyway)`);
// SP-516: the BAR is part 1 alone. Part 2 is reported above and is not the bar, because one of the six
// quotes genuinely does not show it — counting that as a judge failure would measure the pattern.
const bar = statedPerPart[BAR_PART - 1];
if (bar === rows.length) {
  console.log(`PASS (SP-516): part ${BAR_PART} "${PARTS[BAR_PART - 1]}" stated on ${bar} of ${rows.length}.`);
} else {
  console.log(`FAIL (SP-516): part ${BAR_PART} stated on only ${bar} of ${rows.length}.`);
  Deno.exit(1);
}
