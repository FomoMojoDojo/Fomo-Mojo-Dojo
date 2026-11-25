// ── SP-554 CAPABILITY CHECK: CAN qwen3.6:35b JUDGE WITH THINKING ON, AND AT WHAT BUDGET? ─────────
//
// MEASUREMENT ONLY. One judge call on a KNOWN pair, taken from a run's --pairs-json so the question is
// one the judge of record has already answered and the two verdicts are comparable.
//
// WHY IT EXISTS AT ALL. SP-517 measured that a thinking model with `think` on spends its whole
// `num_predict` on `message.thinking` and returns an EMPTY `content` — at 200 tokens and again at
// 1,400 — which reads as a broken model rather than an unbudgeted one. SP-554 therefore asks for the
// budget to be sized BEFORE the arm runs, and that cannot be done through `callOllamaJson`, which
// returns the content and discards `message.thinking` and the token counts. So this talks to
// /api/chat directly and prints what the other callers throw away.
//
// SP-518: the call is ledgered, local price $0, because that 0 is a record and not an absence.
//
//   deno run -A scripts/sp554-capability.ts --pairs=<path> [--model=qwen3.6:35b] [--num-predict=4000]
//     [--index=0] [--think=true|false]
import { JUDGE_SYSTEM, buildJudgeUser, parseJudgeOne, type PatternQuote } from "../supabase/functions/_shared/needPatterns.ts";
import { ledgerLocalCall, md5OfText } from "./ledgerShim.ts";

const arg = (n: string, d = "") => Deno.args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const OLLAMA = (Deno.env.get("OLLAMA_BASE_URL") ?? "http://127.0.0.1:11434/v1").replace(/\/v1\/?$/, "");
const PAIRS = arg("pairs");
const MODEL = arg("model", "qwen3.6:35b");
const NUM_PREDICT = Number(arg("num-predict", "4000"));
const THINK = arg("think", "true") !== "false";
const INDEX = Number(arg("index", "0"));
const COMPANY = arg("company", "dd40ce2f-ff67-4111-bd3c-67943dde6717");
if (!PAIRS) { console.error("REFUSED: --pairs=<path to a run's --pairs-json> is required"); Deno.exit(1); }

type Pair = {
  need: string; pattern: string; signal_id: string; quote: string; ordinal: number; part: string;
  judge_of_record: { model: string; states: boolean; span: string };
};
const file = JSON.parse(await Deno.readTextFile(PAIRS)) as { needs?: Record<string, string>; pairs: Pair[] };
// ONE (pattern, quote) GROUP — the judge is asked about every part of a claim in one call (judge A),
// so a single pair would ask a question the arm never asks.
const first = file.pairs[INDEX];
const group = file.pairs.filter((p) => p.pattern === first.pattern && p.signal_id === first.signal_id)
  .sort((a, b) => a.ordinal - b.ordinal);
const parts = group.map((p) => p.part);
const needStatement = (file.needs ?? {})[first.need] ?? first.need;
const quote: PatternQuote = { signalId: first.signal_id, quote: first.quote, site: "", eventDate: null, brand: "", polarity: null };
const user = buildJudgeUser(needStatement, first.pattern, parts, quote);

console.log(`SP-554 capability check`);
console.log(`  model        ${MODEL}   think ${THINK}   num_predict ${NUM_PREDICT}   temperature 0, seed 42`);
console.log(`  prompt       JUDGE_SYSTEM (cure B) md5 ${await md5OfText(JUDGE_SYSTEM)}`);
console.log(`  pair         ${first.need} "${first.pattern}" × ${first.signal_id.slice(0, 8)}, ${parts.length} part(s)`);
console.log(`  of record    ${first.judge_of_record.model}: ${group.map((p) => `p${p.ordinal} ${p.judge_of_record.states}`).join(" · ")}`);

const t0 = performance.now();
const resp = await fetch(`${OLLAMA}/api/chat`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer ollama" },
  body: JSON.stringify({
    model: MODEL, format: "json", stream: false, think: THINK,
    messages: [{ role: "system", content: JUDGE_SYSTEM }, { role: "user", content: user }],
    options: { temperature: 0, seed: 42, num_predict: NUM_PREDICT },
  }),
});
const seconds = (performance.now() - t0) / 1000;
const body = await resp.json() as {
  message?: { content?: string; thinking?: string };
  eval_count?: number; prompt_eval_count?: number; done_reason?: string;
};
await ledgerLocalCall({ companyId: COMPANY, callSite: "need-patterns:sp554-capability", model: MODEL, system: JUDGE_SYSTEM, user });

const thinking = body.message?.thinking ?? "";
const content = body.message?.content ?? "";
// ollama reports ONE eval_count for the whole generation (thinking + answer), so the split below is by
// CHARACTERS, measured, with the token total named separately. Saying otherwise would be a guess.
console.log(`\n  per-call time        ${seconds.toFixed(1)}s`);
console.log(`  prompt tokens        ${body.prompt_eval_count ?? "?"}`);
console.log(`  generated tokens     ${body.eval_count ?? "?"}   (ollama counts thinking + answer together)`);
console.log(`  done_reason          ${body.done_reason ?? "?"}`);
console.log(`  thinking             ${thinking.length} chars` + (thinking ? `  ≈${Math.round(thinking.length / 4)} tokens` : "  (EMPTY)"));
console.log(`  answer (content)     ${content.length} chars` + (content ? `  ≈${Math.round(content.length / 4)} tokens` : "  (EMPTY — SP-517's failure)"));
if (thinking) console.log(`\n  --- thinking, first 600 chars ---\n${thinking.slice(0, 600)}`);
console.log(`\n  --- answer ---\n${content.slice(0, 900)}`);

let verdict = "";
try {
  const v = parseJudgeOne(content, quote.quote, parts);
  verdict = `READABLE — ${v.parts.map((p) => `p${p.ordinal} states=${p.states}${p.rejected ? ` REJECTED(${p.rejected})` : ""}`).join(" · ")}  belongs_to_need=${v.belongsToNeed}`;
} catch (e) {
  verdict = `UNREADABLE — ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`;
}
console.log(`\n  parse                ${verdict}`);
console.log(`\nVERDICT: ${content && verdict.startsWith("READABLE") ? "USABLE" : "NOT USABLE"} at num_predict=${NUM_PREDICT} with think=${THINK}`);
