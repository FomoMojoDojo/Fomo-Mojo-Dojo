// ── SP-632: THE REPEATABILITY PROBE (brief 17, 2026-11-24) ──────────────────────────────────────────
//
// Run 8 refused "App denies outage reports to block credits" on quote 96d317fe and run 9 kept it —
// the same claim, parts, quote and prompt, at temperature 0 and seed 42. This asks the live judge the
// same three (claim, quote) questions again, in a fixed order, and records every answer. It changes
// nothing: no pattern, no verdict, no setting. Every call is printed and ledgered (SP-518).
//
// The call is the runner's own: the live JUDGE_SYSTEM, `buildJudgeUser`, `judgeAWithReask` (so a span
// re-ask would be made exactly as in a run), the SP-556 empty-answer retry, temperature 0, seed 42,
// thinking on, num_predict 4,000 / retry 8,000, num_ctx 8,192 (SP-631).
//
//   deno run -A --no-lock scripts/sp632-repeat-probe.ts --out=<dir>
import { ledgerLocalCall, md5OfText, noResponseLedgerRow, psqlJson } from "./ledgerShim.ts";
import { callOllamaJson } from "../supabase/functions/_shared/claimDeltaSynthesis.ts";
import {
  JUDGE_SYSTEM, JUDGE_NUM_PREDICT, JUDGE_NUM_PREDICT_RETRY, PATTERN_JUDGE_THINK, buildJudgeUser,
  callJudgeWithEmptyRetry, isEmptyAnswerError, judgeAWithReask, type PatternQuote,
} from "../supabase/functions/_shared/needPatterns.ts";
import { LOCAL_PATTERN_JUDGE } from "../src/lib/modelRouter/resolveModel.ts";

const arg = (n: string, d = "") => Deno.args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const OUT = arg("out");
if (!OUT) { console.error("REFUSED: --out=<dir> is required"); Deno.exit(1); }
const COMPANY = "dd40ce2f-ff67-4111-bd3c-67943dde6717";
const NEED_ID = "ee245737-38e2-4573-a815-191b04a7ceae";
const OLLAMA = Deno.env.get("OLLAMA_BASE_URL") ?? "http://127.0.0.1:11434/v1";
const NUM_CTX = 8192;
// SP-637 (brief 18): `--force-batch=512,1024` asks the flipped pair `--reps` times under each batch
// size IN TURN, with `num_batch` forced on the call. This is the ONLY place a batch size is forced; the
// default mode (no flag) is brief 17's probe, unchanged.
const FORCE_BATCH = arg("force-batch").split(",").map((x) => Number(x.trim())).filter((x) => Number.isInteger(x) && x > 0);
const REPS = Number(arg("reps", "5"));
let batchNow: number | null = null;

const PAIRS = [
  { key: "A", claim: "App denies outage reports to block credits", parts: ["app denies reported outages", "credits are blocked"], id8: "96d317fe" },
  { key: "B", claim: "Agents diagnose issues and offer resolution options", parts: ["the agent diagnoses the problem", "the agent offers a resolution option"], id8: "135b3964" },
  { key: "C", claim: "Online support and apps reduce effort for users", parts: ["online support is available", "apps save user trouble"], id8: "e7397c95" },
] as const;

const [{ desired_outcome: NEED }] = await psqlJson<{ desired_outcome: string }>(`select desired_outcome from public.odi_needs where id = '${NEED_ID}'`);
const rows = await psqlJson<{ signal_id: string; quote: string; polarity: string | null }>(
  `select e.signal_id, s.quote, e.polarity from public.need_evidence e join public.signals s on s.id = e.signal_id
   where e.need_id = '${NEED_ID}' and e.bears and (${PAIRS.map((p) => `e.signal_id::text like '${p.id8}%'`).join(" or ")})`);
const quoteOf = (id8: string): PatternQuote => {
  const r = rows.find((x) => x.signal_id.startsWith(id8));
  if (!r) { console.error(`REFUSED: no bearing N13 quote ${id8}`); Deno.exit(1); }
  return { signalId: r.signal_id, quote: r.quote, site: "", eventDate: null, brand: "", polarity: null };
};
console.log(`judge ${LOCAL_PATTERN_JUDGE} · prompt md5 ${await md5OfText(JUDGE_SYSTEM)} · temperature 0 · seed 42 · think ${PATTERN_JUDGE_THINK} · num_predict ${JUDGE_NUM_PREDICT} (retry ${JUDGE_NUM_PREDICT_RETRY}) · num_ctx ${NUM_CTX}`);
console.log(`need: ${NEED}`);
for (const p of PAIRS) console.log(`pair ${p.key}: "${p.claim}" [${p.parts.join(" | ")}] × ${p.id8} · user md5 ${await md5OfText(buildJudgeUser(NEED, p.claim, p.parts, quoteOf(p.id8)))}`);

let callsMade = 0, rowsWritten = 0;
async function modelCall(system: string, user: string, np: number): Promise<string> {
  let served = "";
  const t0 = performance.now();
  callsMade++;
  const n = callsMade;
  try {
    const content = await callOllamaJson(OLLAMA, LOCAL_PATTERN_JUDGE, system, user, 600_000,
      { temperature: 0, seed: 42, num_predict: np, num_ctx: NUM_CTX, think: PATTERN_JUDGE_THINK, ...(batchNow ? { num_batch: batchNow } : {}) } as never, (m) => { served = m; });
    if (await ledgerLocalCall({ companyId: COMPANY, callSite: "repeat-probe:judge", model: served || LOCAL_PATTERN_JUDGE, system, user, attempt: np === JUDGE_NUM_PREDICT ? 1 : 2 })) rowsWritten++;
    console.log(`    call ${String(n).padStart(2)} judge ${served || LOCAL_PATTERN_JUDGE} np ${np} ${((performance.now() - t0) / 1000).toFixed(1)}s ${content.length} chars`);
    return content;
  } catch (e) {
    const row = noResponseLedgerRow({ callSite: "repeat-probe:judge", requestedModel: LOCAL_PATTERN_JUDGE });
    if (await ledgerLocalCall({ companyId: COMPANY, callSite: row.callSite, model: row.usage.model, system, user, attempt: np === JUDGE_NUM_PREDICT ? 1 : 2 })) rowsWritten++;
    console.log(`    call ${String(n).padStart(2)} judge ${LOCAL_PATTERN_JUDGE} np ${np} ${((performance.now() - t0) / 1000).toFixed(1)}s THREW: ${(e instanceof Error ? e.message : String(e)).slice(0, 70)}`);
    throw e;
  }
}

type Row = { step: string; pair: string; first_call: number; calls: number; parts: Array<{ ordinal: number; states: boolean; span: string; reason: string; rejected: string }>; supports: boolean; belongs: boolean | null; belongs_field: string; reason: string; raw: string[]; error: string };
const out: Row[] = [];
async function ask(step: string, key: "A" | "B" | "C"): Promise<void> {
  const p = PAIRS.find((x) => x.key === key)!;
  const firstCall = callsMade + 1;
  const raw: string[] = [];
  const row: Row = { step, pair: key, first_call: firstCall, calls: 0, parts: [], supports: false, belongs: null, belongs_field: "", reason: "", raw, error: "" };
  try {
    const res = await judgeAWithReask({
      needStatement: NEED, name: p.claim, parts: p.parts, quote: quoteOf(p.id8),
      call: (system, user) => callJudgeWithEmptyRetry({
        system, user, first: JUDGE_NUM_PREDICT, retry: JUDGE_NUM_PREDICT_RETRY,
        call: async (sys, usr, np) => { const c = await modelCall(sys, usr, np); raw.push(c); return c; },
      }),
    });
    const v = res.verdict;
    row.parts = v.parts.map((x) => ({ ordinal: x.ordinal, states: x.states, span: x.span, reason: x.reason, rejected: x.rejected }));
    row.supports = v.supports; row.belongs = v.belongsToNeed; row.belongs_field = v.belongsField; row.reason = v.reason;
  } catch (e) {
    row.error = isEmptyAnswerError(e) ? "empty twice" : (e instanceof Error ? e.message : String(e)).slice(0, 120);
  }
  row.calls = callsMade - firstCall + 1;
  out.push(row);
  console.log(`  ${step.padEnd(8)} pair ${key}  parts ${row.parts.map((x) => (x.states ? "Y" : "n")).join("") || "--"}  belongs ${row.belongs}  ${row.error ? "ERROR " + row.error : `"${row.reason}"`}`);
}

if (FORCE_BATCH.length) {
  for (const b of FORCE_BATCH) {
    batchNow = b;
    console.log(`\nSP-637: the flipped pair, ${REPS} call(s) with num_batch FORCED to ${b}`);
    for (let i = 1; i <= REPS; i++) await ask(`batch${b}-${i}`, "A");
  }
  batchNow = null;
} else {
  console.log("\n(a) the flipped pair, 10 calls back to back");
  for (let i = 1; i <= 10; i++) await ask(`a${i}`, "A");
  console.log("\n(b) 5 rounds: the flipped pair, then 135b3964's pair, then e7397c95's pair");
  for (let r = 1; r <= 5; r++) { await ask(`b${r}-A`, "A"); await ask(`b${r}-B`, "B"); await ask(`b${r}-C`, "C"); }
}

console.log(`\nSP-518 ledger: ${callsMade} model call(s) made · ${rowsWritten} model_calls row(s) written · difference ${callsMade - rowsWritten}`);
await Deno.writeTextFile(`${OUT}/${FORCE_BATCH.length ? "probe-batch.json" : "probe.json"}`, JSON.stringify({ need: NEED, judge: LOCAL_PATTERN_JUDGE, judge_system_md5: await md5OfText(JUDGE_SYSTEM), pairs: PAIRS, results: out, calls: { made: callsMade, ledgered: rowsWritten } }, null, 1) + "\n");
console.log(`written: ${OUT}/${FORCE_BATCH.length ? "probe-batch.json" : "probe.json"}`);
if (callsMade !== rowsWritten) { console.error("FAILED: a model call went unledgered (SP-518)"); Deno.exit(1); }
