// ── DOES THE JUDGE EARN ITS PLACE? (SP-461 / SP-491, 2026-11-20) ─────────────────────────────────
//
// A judge that approves whatever it is handed is worse than no judge: it costs time and it launders
// the generator's mistakes into a verdict. So it is fed answers that are WRONG BY CONSTRUCTION and
// counted on how many quotes it keeps.
//
//   HONEST    a real stored pattern with its own real quotes. The judge should keep most of them —
//             the control, without which a judge that says "no" to everything would pass.
//   SWAPPED   the same pattern name, with the quotes of a DIFFERENT need's pattern substituted.
//   INVENTED  this pattern's real quotes under a name no quote supports.
//
// SP-475(d): the judge rules on ONE quote per call, so each case is a run of single-quote calls.
//
// SP-491: EVERY KEPT QUOTE IS RECORDED — its signal id, its text, and whether `need_evidence` says it
// bears on the swapped-in pattern's OWN need. That last column is the one that settles the first
// swap result: the 2026-11-20 run kept 18 of 63, and 6 of the 31 quotes on each side genuinely bear
// on both needs, so a "swapped" quote is not necessarily foreign to the pattern it lands under.
// The rows go to `--out` as JSON; a tsx step masks them through the REAL displayQuote for the report
// (deno cannot import src/lib/reviewQuote.ts — it has an extensionless import).
//
// IT STORES NO FINDING — no pattern, no quote, no verdict. SP-518: it DOES write a model_calls row
// per judge call, because the spend is real and this harness burning 123 unledgered calls is exactly
// the gap SP-518 closes.
//
//   deno run -A scripts/pattern-judge-corruption.ts --out=<file>                       # top two, as before
//   deno run -A scripts/pattern-judge-corruption.ts --a="<name>" --b="<name>" --out=…  # a named pair
//   deno run -A scripts/pattern-judge-corruption.ts --judge-model=qwen3.6:35b --out=…  # SP-517
import { JUDGE_NUM_PREDICT, JUDGE_NUM_PREDICT_RETRY, PATTERN_JUDGE_THINK, callJudgeWithEmptyRetry, isEmptyAnswerError, JUDGE_SYSTEM_BPRIME1, JUDGE_SYSTEM_BPRIME2, JUDGE_SYSTEM_CUREC, JUDGE_SYSTEM_PRE545, JUDGE_SYSTEM_TIGHTENED, JudgeUnreadable, judgeAWithReask, type PartVerdict, type PatternQuote } from "../supabase/functions/_shared/needPatterns.ts";
import { callOllamaJson } from "../supabase/functions/_shared/claimDeltaSynthesis.ts";
import { LOCAL_PATTERN_JUDGE } from "../src/lib/modelRouter/resolveModel.ts";
// SP-518: this harness used to write no ledger row. Its judge time is real spend.
import { ledgerLocalCall, psqlJson, sqlQuote } from "./ledgerShim.ts";

const arg = (n: string, d = "") => Deno.args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const COMPANY = arg("company", "dd40ce2f-ff67-4111-bd3c-67943dde6717");
const OLLAMA = Deno.env.get("OLLAMA_BASE_URL") ?? "http://127.0.0.1:11434/v1";
const OUT = arg("out");
const WANT_A = arg("a");
const WANT_B = arg("b");
const LABEL = arg("label", "top-two");
/** SP-517: the judge MODEL is a parameter, so two models face the identical pairs. */
// SP-555: the pattern judge of record, so the SP-500 re-run measures what actually judges.
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

/** SP-502 made a pattern a claim PLUS PARTS, and v3's judge rules per part — but the stored clean
 *  pair is a pre-v3 row with no parts, and MINTING v3 rows is the five-need run, which is out of
 *  scope. So the pair's parts are supplied here, pipe-separated, and are RECORDED in the output and
 *  the report: a test whose inputs were written by hand must say so. Without them the pair is refused
 *  rather than judged on a claim alone, which would be asking v3's judge the v2 question. */
const PARTS_A = arg("parts-a").split("|").map((x) => x.trim()).filter(Boolean);
const PARTS_B = arg("parts-b").split("|").map((x) => x.trim()).filter(Boolean);
/** A claim nothing in a Charter complaint corpus can support: the opposite register, and a place that
 *  appears in no quote. If the judge keeps a quote under THIS, it is not reading the quotes. Its PARTS
 *  are invented too, and are predicates — a subject-opening part could not be generated (SP-501), so
 *  an invented one must not be either, or the case would test the parse gate instead of the judge. */
const INVENTED = "Customers praise the fibre rollout and the price in rural Idaho";
const INVENTED_PARTS = ["the fibre rollout is praised", "the price is called good value in rural Idaho"];

const q = sqlQuote;

type Row = { pattern_id: string; need_id: string; name: string; parts: string[] | null; outcome: string; signal_id: string; quote: string; url: string | null; date: string | null };
const rows = await psqlJson<Row>(`select p.id as pattern_id, p.need_id, p.name, n.desired_outcome as outcome,
    pq.signal_id, s.quote, s.source_url as url, to_char(s.event_date,'YYYY-MM-DD') as date,
    (select coalesce(json_agg(pp.predicate order by pp.ordinal), '[]'::json)
       from public.need_pattern_parts pp where pp.pattern_id = p.id) as parts
  from public.need_patterns p
  join public.need_pattern_quotes pq on pq.pattern_id = p.id and pq.bears
  join public.odi_needs n on n.id = p.need_id
  join public.signals s on s.id = pq.signal_id
  where p.company_id = ${q(COMPANY)} and p.superseded_at is null and s.quote is not null`);
if (rows.length === 0) { console.error("REFUSED: no stored patterns with supporting quotes"); Deno.exit(1); }

type Pat = { needId: string; name: string; parts: string[]; outcome: string; quotes: PatternQuote[] };
// `parts` is deliberately mutable: a pre-v3 row's parts may be supplied (see PARTS_A / PARTS_B).
const byPattern = new Map<string, Pat>();
for (const r of rows) {
  const e = byPattern.get(r.pattern_id) ?? byPattern.set(r.pattern_id, { needId: r.need_id, name: r.name, parts: r.parts ?? [], outcome: r.outcome, quotes: [] }).get(r.pattern_id)!;
  e.quotes.push({ signalId: r.signal_id, quote: r.quote, site: "", eventDate: r.date, brand: "", polarity: null });
}
const ordered = [...byPattern.values()].sort((x, y) => y.quotes.length - x.quotes.length);
const pick = (want: string, fallback: (p: Pat) => boolean): Pat => {
  const hit = want ? ordered.find((p) => p.name === want) : ordered.find(fallback);
  if (!hit) { console.error(`REFUSED: no live pattern named ${JSON.stringify(want)}`); Deno.exit(1); }
  return hit;
};
const A = pick(WANT_A, (p) => p.parts.length > 0 || PARTS_A.length > 0);
const B = pick(WANT_B, (p) => p.needId !== A.needId && (p.parts.length > 0 || PARTS_B.length > 0));
// Supplied parts win over stored ones only when the row HAS none; a stored v3 pattern is never
// overridden by a command line, because then the test would not be about the stored pattern.
if (A.parts.length === 0 && PARTS_A.length) A.parts = PARTS_A;
if (B.parts.length === 0 && PARTS_B.length) B.parts = PARTS_B;
const partsSuppliedA = A.parts === PARTS_A, partsSuppliedB = B.parts === PARTS_B;
if (A.needId === B.needId) { console.error("REFUSED: both patterns belong to one need — a swap would not be a swap"); Deno.exit(1); }
// A v2 row carries no parts, and v3's judge rules on parts: judging one would be asking the new judge
// the old question and reporting the answer as if it were the new one. REFUSED, not skipped silently.
for (const [label, p] of [["A", A], ["B", B]] as const) {
  if (p.parts.length === 0) {
    console.error(`REFUSED: ${label} "${p.name}" has no parts — it is a pre-v3 row and v3's judge rules per part.`);
    console.error(`         Supply them: --parts-${label.toLowerCase()}="first predicate|second predicate"`);
    Deno.exit(1);
  }
}

// SP-532: six cases are run over A's and B's quote sets. An empty set would make its case print a
// clean "kept 0 of 0" that reads exactly like a corruption bar being held. Refused BEFORE anything
// else touches the sets — it sits above the overlap query on purpose, because that query interpolates
// the ids into `in (...)` and dies on an empty set, and a crash is not this check being exercised.
for (const [label, pat] of [["A", A], ["B", B]] as const) {
  if (pat.quotes.length === 0) {
    console.error(`REFUSED (SP-532): pattern ${label} "${pat.name}" has ZERO supporting quotes — every case over it would select nothing and "kept 0 of 0" would read as a bar held.`);
    Deno.exit(1);
  }
}

// THE OVERLAP, from need_evidence — the frozen corpus, judged long before any of this.
const overlap = (await psqlJson<{ shared: number; a_on_b: number; b_on_a: number }>(`select
   (select count(*) from public.need_pattern_quotes x
      where x.signal_id in (${A.quotes.map((x) => q(x.signalId)).join(",")})
        and x.pattern_id in (select id from public.need_patterns where company_id=${q(COMPANY)} and superseded_at is null and name=${q(B.name)})
        and x.bears) as shared,
   (select count(*) from public.need_evidence e where e.company_id=${q(COMPANY)} and e.bears and e.need_id=${q(B.needId)}
        and e.signal_id in (${A.quotes.map((x) => q(x.signalId)).join(",")})) as a_on_b,
   (select count(*) from public.need_evidence e where e.company_id=${q(COMPANY)} and e.bears and e.need_id=${q(A.needId)}
        and e.signal_id in (${B.quotes.map((x) => q(x.signalId)).join(",")})) as b_on_a`))[0];

// which of the swapped-in quotes DO bear on the host pattern's own need
const bearsOnNeed = async (needId: string, quotes: PatternQuote[]) =>
  new Set((await psqlJson<{ signal_id: string }>(`select e.signal_id from public.need_evidence e
    where e.company_id=${q(COMPANY)} and e.bears and e.need_id=${q(needId)}
      and e.signal_id in (${quotes.map((x) => q(x.signalId)).join(",")})`)).map((r) => r.signal_id));

console.log(`judge: ${JUDGE_MODEL} (temperature 0, seed 42), system=${SYSTEM_MODE}, ONE quote per call (SP-475d) — ledgered (SP-518)`);
console.log(`label: ${LABEL}\n`);
console.log(`A = "${A.name}"  (${A.quotes.length} supporting quotes)`);
console.log(`     parts${partsSuppliedA ? " (SUPPLIED, not stored)" : ""}: ${A.parts.map((x, i) => `${i + 1}. ${x}`).join(" · ")}`);
console.log(`B = "${B.name}"  (${B.quotes.length} supporting quotes, a DIFFERENT need)`);
console.log(`     parts${partsSuppliedB ? " (SUPPLIED, not stored)" : ""}: ${B.parts.map((x, i) => `${i + 1}. ${x}`).join(" · ")}`);
console.log(`OVERLAP in need_evidence — shared supporting quotes: ${overlap.shared} · A's quotes bearing on B's need: ${overlap.a_on_b} · B's quotes bearing on A's need: ${overlap.b_on_a}\n`);

let calls = 0, seconds = 0, spanRejects = 0, ledgered = 0;
/** SP-514: the re-ask, counted separately per case so a lenient retry cannot hide in a total. */
let reasks = 0, recovered = 0, failedTwice = 0;
/** SP-517: answers that could not be read at all (cut JSON). Fail closed, counted, reported. */
let unreadable = 0;
// SP-556: both counts, reported whatever they are.
let emptyFirst = 0, emptyRecovered = 0;
const emptyFailed: string[] = [];
const unreadableDetail: string[] = [];
/** SP-518: calls that threw. Ledgered (the compute was spent) and counted. */
let failedCalls = 0;
type Kept = { case: string; pattern: string; parts: string[]; signalId: string; quote: string; bearsOnHostNeed: boolean;
  reason: string; partVerdicts: PartVerdict[]; notStated: string[] };
/** SP-498: EVERY honest rejection, so each one can be classified (a) judge too strict or
 *  (b) pattern overclaims. The honest set came from the earlier, lenient judge, so it is not a
 *  neutral control and its rejections have to be read one by one rather than counted. */
type Rejected = { case: string; pattern: string; parts: string[]; signalId: string; quote: string;
  reason: string; partVerdicts: PartVerdict[]; notStated: string[] };
const kept: Kept[] = [];
const rejectedHonest: Rejected[] = [];

/** Per-part counts across a case: how often each part was the one that failed. SP-502's whole claim is
 *  that the compound was the problem, so this is the number that tests it. */
type CaseStat = { kept: number; of: number; statedPerPart: number[] };

async function judge(caseLabel: string, host: Pat, quotes: PatternQuote[], patternName: string, parts: string[], hostBears: Set<string>): Promise<CaseStat> {
  let n = 0;
  const refusals: string[] = [];
  const statedPerPart = parts.map(() => 0);
  const t0 = performance.now();
  for (const qt of quotes) {
    // SP-514 is part of judge A, so the corruption test exercises the WHOLE judge. A re-ask is also
    // a corruption surface in its own right: if the retry talks a lenient judge into a span for a
    // SWAPPED quote, these numbers are where that shows up.
    const site = `pattern-judge-corruption:${caseLabel.split(" ")[0].toLowerCase()}`;
    let res;
    try {
      res = await judgeAWithReask({
        needStatement: host.outcome, name: patternName, parts, quote: qt, system: JUDGE_SYSTEM_OVERRIDE,
        // SP-556: the one retry an empty answer earns, around the identical call.
        call: (system, user) => callJudgeWithEmptyRetry({
          system, user, first: JUDGE_NP, retry: JUDGE_NUM_PREDICT_RETRY,
          onEmpty: ({ recovered }) => {
            emptyFirst++;
            if (recovered) emptyRecovered++;
            else emptyFailed.push(`${caseLabel} ${qt.signalId.slice(0, 8)}`);
          },
          call: async (sys, usr, np) => {
          // SP-518: ledgered in a FINALLY — a call that threw still happened. See sp507-part-check.ts.
          try {
            const content = await callOllamaJson(OLLAMA, JUDGE_MODEL, sys, usr, 600_000,
              // SP-555: thinking ON, `np` = the first budget or SP-556's retry budget.
              { temperature: 0, seed: 42, num_predict: np, think: JUDGE_THINK });
            return content;
          } catch (e) { failedCalls++; throw e; } finally {
            calls++;
            ledgered += await ledgerLocalCall({ companyId: COMPANY, callSite: site, model: JUDGE_MODEL, system: sys, user: usr }) ? 1 : 0;
          }
          },
        }),
      });
    } catch (e) {
      // AN UNREADABLE ANSWER FAILS THIS ONE QUOTE CLOSED AND IS COUNTED. It used to crash the run: a
      // single cut answer from qwen3.6:35b destroyed 100 completed calls. Failing closed is the right
      // direction — a verdict that cannot be read is not support — and the count is reported so a model
      // that cannot answer in the budget is visible rather than inferred from a short total.
      // SP-556: empty twice is its own fault, already named by onEmpty; this quote fails closed.
      if (isEmptyAnswerError(e)) continue;
      if (!(e instanceof JudgeUnreadable)) throw e;
      unreadable++;
      unreadableDetail.push(`${caseLabel} ${qt.signalId.slice(0, 8)}: ${e.message.slice(0, 90)}`);
      continue;
    }
    const v = res.verdict;
    if (res.reasked.length) { reasks++; recovered += res.recovered; failedTwice += res.failedTwice; }
    for (const pv of v.parts) { if (pv.rejected) spanRejects++; if (pv.states) statedPerPart[pv.ordinal - 1]++; }
    if (v.supports) {
      n++;
      kept.push({ case: caseLabel, pattern: patternName, parts, signalId: qt.signalId, quote: qt.quote,
                  bearsOnHostNeed: hostBears.has(qt.signalId), reason: v.reason,
                  partVerdicts: v.parts, notStated: v.notStated });
    } else {
      if (caseLabel.startsWith("HONEST")) {
        rejectedHonest.push({ case: caseLabel, pattern: patternName, parts, signalId: qt.signalId, quote: qt.quote,
          reason: v.reason, partVerdicts: v.parts, notStated: v.notStated });
      }
      if (refusals.length < 2 && (v.notStated[0] || v.reason)) refusals.push(v.notStated[0] || v.reason);
    }
  }
  const s = (performance.now() - t0) / 1000;
  seconds += s;
  console.log(`${caseLabel.padEnd(24)} kept ${String(n).padStart(2)} of ${String(quotes.length).padStart(2)}   ${s.toFixed(1)}s   refusals: "${refusals.join(" | ").slice(0, 70)}"`);
  console.log(`${" ".repeat(24)} per part stated: ${parts.map((pt, i) => `${statedPerPart[i]}/${quotes.length} "${pt.slice(0, 32)}"`).join(" · ")}`);
  return { kept: n, of: quotes.length, statedPerPart };
}

const none = new Set<string>();
const hA = await judge("HONEST A", A, A.quotes, A.name, A.parts, none);
const hB = await judge("HONEST B", B, B.quotes, B.name, B.parts, none);
// SP-491: for a swap, the host is the PATTERN's need and the quotes are the other one's, so the
// bearing column asks "does this swapped-in quote bear on the host pattern's own need?"
const sA = await judge("SWAPPED A<-B quotes", A, B.quotes, A.name, A.parts, await bearsOnNeed(A.needId, B.quotes));
const sB = await judge("SWAPPED B<-A quotes", B, A.quotes, B.name, B.parts, await bearsOnNeed(B.needId, A.quotes));
const iA = await judge("INVENTED name, A quotes", A, A.quotes, INVENTED, INVENTED_PARTS, none);
const iB = await judge("INVENTED name, B quotes", B, B.quotes, INVENTED, INVENTED_PARTS, none);

const honest = hA.kept + hB.kept, honestOf = hA.of + hB.of;
const swapped = sA.kept + sB.kept, swappedOf = sA.of + sB.of;
const invented = iA.kept + iB.kept, inventedOf = iA.of + iB.of;
console.log(`\n── RESULT (${LABEL}, system=${SYSTEM_MODE}) ─────────────────────────────────────`);
console.log(`HONEST    kept ${honest} of ${honestOf}`);
console.log(`SWAPPED   kept ${swapped} of ${swappedOf}`);
console.log(`INVENTED  kept ${invented} of ${inventedOf}`);
console.log(`${calls} judge call(s), ${seconds.toFixed(1)}s total, ${(seconds / Math.max(calls, 1)).toFixed(1)}s per call`);
console.log(`SP-514: ${reasks} quote(s) needed a span re-ask — ${recovered} part(s) recovered, ${failedTwice} failed twice`);
console.log(`UNREADABLE: ${unreadable} answer(s) could not be parsed and were failed closed`);
console.log(`SP-556 empty answers: ${emptyFirst} first attempt(s) empty \u00b7 ${emptyRecovered} recovered at ${JUDGE_NUM_PREDICT_RETRY} \u00b7 ${emptyFailed.length} failed closed`);
for (const f of emptyFailed) console.log(`        EMPTY TWICE ${f}`);
for (const u of unreadableDetail) console.log(`        ${u}`);
console.log(`SP-518: ${ledgered} of ${calls} call(s) ledgered (${failedCalls} of them failed and are ledgered anyway)`);
console.log(`SP-494: ${spanRejects} part verdict(s) rejected for an unverifiable span`);
console.log(`per-part stated, HONEST A: ${A.parts.map((pt, i) => `${hA.statedPerPart[i]}/${hA.of} "${pt.slice(0, 30)}"`).join(" · ")}`);
console.log(`per-part stated, HONEST B: ${B.parts.map((pt, i) => `${hB.statedPerPart[i]}/${hB.of} "${pt.slice(0, 30)}"`).join(" · ")}`);
const sw = kept.filter((k) => k.case.startsWith("SWAPPED"));
console.log(`of the ${sw.length} kept swap quote(s), ${sw.filter((k) => k.bearsOnHostNeed).length} DO bear on the host pattern's own need per need_evidence`);
console.log(`honest rejections recorded for classification (SP-498): ${rejectedHonest.length}`);

if (OUT) {
  await Deno.writeTextFile(OUT, JSON.stringify({
    label: LABEL, system: SYSTEM_MODE, judgeModel: JUDGE_MODEL, calls, ledgered,
    partsSupplied: { a: partsSuppliedA, b: partsSuppliedB },
    spanReask: { reasks, recovered, failedTwice },
    unreadable, unreadableDetail,
    emptyFirst, emptyRecovered, emptyFailed,
    a: A.name, aParts: A.parts, b: B.name, bParts: B.parts, invented: INVENTED, inventedParts: INVENTED_PARTS, overlap,
    perPart: { honestA: hA.statedPerPart, honestB: hB.statedPerPart, swappedA: sA.statedPerPart, swappedB: sB.statedPerPart, inventedA: iA.statedPerPart, inventedB: iB.statedPerPart },
    totals: { honest, honestOf, swapped, swappedOf, invented, inventedOf, calls, seconds: Number(seconds.toFixed(1)), spanRejects },
    kept, rejectedHonest,
  }, null, 2));
  console.log(`rows written to ${OUT}`);
}
