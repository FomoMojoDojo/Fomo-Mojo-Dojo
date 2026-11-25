// ── SP-510: JUDGE A vs JUDGE B, PAIRED ON THE SAME (QUOTE, PART) ──────────────────────────────────
//
// The SP-507 check failed under judge A (4 of 6), so SP-510's reserve is called on. A asks about every
// part in ONE call; B asks about ONE part in one call, with nothing else in it. The question is whether
// A's misses are caused by the parts being neighbours in a single call.
//
// PAIRED, NOT TWO RUNS. Both judges see the same need, the same claim, the same part and the same
// quote, at temperature 0 and seed 42, and both have their span verified by the same E4 predicate. So
// a disagreement is the SHAPE OF THE CALL and nothing else — which is the only thing SP-510 is asking.
//
// It WRITES NOTHING: no row, no model_calls record. It is an instrument reading two judges, like
// pattern-judge-corruption.ts, and it is Charter, whose lane is closed (pattern-lane-guard l5).
//
//   deno run -A scripts/judge-b-compare.ts --set=sp507
import {
  JUDGE_NUM_PREDICT, JUDGE_SYSTEM, JUDGE_B_SYSTEM,
  buildJudgeUser, buildJudgeBUser, parseJudgeOne, parseJudgeBOne, type PatternQuote,
} from "../supabase/functions/_shared/needPatterns.ts";
import { callOllamaJson } from "../supabase/functions/_shared/claimDeltaSynthesis.ts";
import { LOCAL_JUDGE } from "../src/lib/modelRouter/resolveModel.ts";
import { ledgerLocalCall, psqlJson, sqlQuote } from "./ledgerShim.ts";

const arg = (n: string, d = "") => Deno.args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const OLLAMA = Deno.env.get("OLLAMA_BASE_URL") ?? "http://127.0.0.1:11434/v1";
const SET = arg("set", "sp507");
const OUT = arg("out");
const JUDGE_MODEL = arg("judge-model", LOCAL_JUDGE);
const COMPANY = arg("company", "dd40ce2f-ff67-4111-bd3c-67943dde6717");
let ledgered = 0, calls = 0;

const q = sqlQuote;

// The SP-507 case, verbatim from that check so the two are comparable: the v1 compound claim, split
// into its two predicates (SP-501: predicates, never "Customers").
const SP507 = {
  claim: "Customer service representatives are unhelpful and dismissive",
  parts: ["the agent does not resolve the customer's problem", "the agent is dismissive of the customer"],
  where: `p.name like 'Customer service representatives are unhelpful%'
            and left(s.id::text, 8) in ('04adf671','8c10efb7','c4e961c6','ca8a4568','d3866c50','dad3eab5')`,
};
// --set=n13 WAS a branch here and has been REMOVED rather than left as a trap. It built each case
// from a stored v1/v2 pattern name as a SINGLE part, and with one part A and B ask the same question:
// A's prompt lists one numbered predicate and B's lists one predicate. The comparison would have run,
// printed 100% agreement, and measured nothing about the shape of the call — which is the only thing
// SP-510 asks. The honest path for "judge B on N13" is the real pipeline with the judge swapped:
//
//   deno run -A scripts/run-need-patterns.ts --needs=N13              # judge A, dry
//   deno run -A scripts/run-need-patterns.ts --needs=N13 --judge=b    # judge B, dry
//
// Generation is at temperature 0, so both runs propose the same claims and the same parts, and the
// per-part lines they print are paired. --apply is refused under --judge=b.

type Case = { claim: string; parts: string[]; quotes: Array<{ id: string; quote: string }>; need: string };
let cases: Case[] = [];

if (SET === "sp507") {
  const rows = await psqlJson<{ id: string; quote: string; outcome: string }>(
    `select distinct s.id, s.quote, n.desired_outcome as outcome
       from public.signals s
       join public.need_pattern_quotes pq on pq.signal_id = s.id
       join public.need_patterns p on p.id = pq.pattern_id
       join public.odi_needs n on n.id = p.need_id
      where p.superseded_at is null and ${SP507.where}`);
  if (rows.length !== 6) { console.error(`REFUSED: found ${rows.length} of the 6 named quotes`); Deno.exit(1); }
  cases = [{ claim: SP507.claim, parts: SP507.parts, need: rows[0].outcome, quotes: rows.map((r) => ({ id: r.id, quote: r.quote })) }];
} else if (SET === "n13") {
  console.error("REFUSED: --set=n13 would compare A and B on SINGLE-part claims, where they ask the");
  console.error("         same question. Use the real pipeline with the judge swapped instead:");
  console.error("           deno run -A scripts/run-need-patterns.ts --needs=N13");
  console.error("           deno run -A scripts/run-need-patterns.ts --needs=N13 --judge=b");
  Deno.exit(1);
} else { console.error(`REFUSED: unknown --set=${SET}`); Deno.exit(1); }

console.log(`judge: ${JUDGE_MODEL} (temperature 0, seed 42) — A and B on the SAME (quote, part) pairs, ledgered (SP-518)`);
console.log(`set: ${SET} · ${cases.length} claim(s) · ${cases.reduce((n, c) => n + c.quotes.length * c.parts.length, 0)} pair(s)\n`);

type PairRow = {
  claim: string; ordinal: number; part: string; signalId: string; quote: string;
  a: { states: boolean; span: string; rejected: string; reason: string };
  b: { states: boolean; span: string; rejected: string; reason: string };
};
const pairs: PairRow[] = [];
let aSec = 0, bSec = 0;

for (const c of cases) {
  console.log(`CLAIM: ${c.claim}`);
  c.parts.forEach((p, i) => console.log(`  part ${i + 1}: ${p}`));
  for (const qrow of c.quotes.sort((x, y) => x.id.localeCompare(y.id))) {
    const qt: PatternQuote = { signalId: qrow.id, quote: qrow.quote, site: "", eventDate: null, brand: "", polarity: null };

    // A: one call, every part.
    let t0 = performance.now();
    const aSystem = JUDGE_SYSTEM, aUser = buildJudgeUser(c.need, c.claim, c.parts, qt);
    const aContent = await callOllamaJson(OLLAMA, JUDGE_MODEL, aSystem, aUser, 600_000,
      { temperature: 0, seed: 42, num_predict: JUDGE_NUM_PREDICT, think: false });
    aSec += (performance.now() - t0) / 1000;
    calls++; ledgered += await ledgerLocalCall({ companyId: COMPANY, callSite: "judge-b-compare:judge-a", model: JUDGE_MODEL, system: aSystem, user: aUser }) ? 1 : 0;
    const aV = parseJudgeOne(aContent, qrow.quote, c.parts);

    // B: one call per part.
    const bParts = [];
    for (let i = 0; i < c.parts.length; i++) {
      t0 = performance.now();
      const bSystem = JUDGE_B_SYSTEM, bUser = buildJudgeBUser(c.need, c.claim, c.parts[i], qt);
      const bContent = await callOllamaJson(OLLAMA, JUDGE_MODEL, bSystem, bUser, 600_000,
        { temperature: 0, seed: 42, num_predict: JUDGE_NUM_PREDICT, think: false });
      bSec += (performance.now() - t0) / 1000;
      calls++; ledgered += await ledgerLocalCall({ companyId: COMPANY, callSite: "judge-b-compare:judge-b", model: JUDGE_MODEL, system: bSystem, user: bUser }) ? 1 : 0;
      bParts.push(parseJudgeBOne(bContent, qrow.quote, i + 1));
    }

    const aSup = aV.supports;
    const bSup = bParts.every((x) => x.states);
    const flag = aSup === bSup ? "   " : " ! ";
    console.log(`${flag}${qrow.id.slice(0, 8)}  A ${aSup ? "SUPPORTS" : "no      "}  B ${bSup ? "SUPPORTS" : "no      "}`);
    for (let i = 0; i < c.parts.length; i++) {
      const a = aV.parts[i], b = bParts[i];
      const mark = a.states === b.states ? " " : "*";
      console.log(`     ${mark} part ${i + 1}  A ${a.states ? "stated    " : (a.rejected || "not stated").padEnd(10)}  B ${b.states ? "stated    " : (b.rejected || "not stated").padEnd(10)}`);
      if (a.span !== b.span) {
        console.log(`             A span ${a.span ? JSON.stringify(a.span.slice(0, 60)) : "(none)"}`);
        console.log(`             B span ${b.span ? JSON.stringify(b.span.slice(0, 60)) : "(none)"}`);
      }
      pairs.push({ claim: c.claim, ordinal: i + 1, part: c.parts[i], signalId: qrow.id, quote: qrow.quote,
        a: { states: a.states, span: a.span, rejected: a.rejected, reason: a.reason },
        b: { states: b.states, span: b.span, rejected: b.rejected, reason: b.reason } });
    }
  }
  console.log("");
}

const agree = pairs.filter((x) => x.a.states === x.b.states).length;
const aOnly = pairs.filter((x) => x.a.states && !x.b.states).length;
const bOnly = pairs.filter((x) => !x.a.states && x.b.states).length;
const aSpanRej = pairs.filter((x) => x.a.rejected).length;
const bSpanRej = pairs.filter((x) => x.b.rejected).length;
console.log(`── SP-510 A vs B ────────────────────────────────────────`);
console.log(`pairs ${pairs.length} · agree ${agree} (${((agree / pairs.length) * 100).toFixed(1)}%) · A-only-stated ${aOnly} · B-only-stated ${bOnly}`);
console.log(`span rejections: A ${aSpanRej} · B ${bSpanRej}`);
console.log(`calls: A ${pairs.length / (cases[0]?.parts.length || 1)} · B ${pairs.length}`);
console.log(`time: A ${aSec.toFixed(1)}s · B ${bSec.toFixed(1)}s  (B/A = ${(bSec / Math.max(aSec, 0.001)).toFixed(2)}x)`);
console.log(`SP-518: ${ledgered} of ${calls} call(s) ledgered`);
if (OUT) { await Deno.writeTextFile(OUT, JSON.stringify({ set: SET, pairs, aSec, bSec }, null, 2)); console.log(`rows written to ${OUT}`); }
