// ── SP-577 (2026-11-23): ONE diagnostic call on the quote the thinking judge cannot answer ───────
//
//   deno run -A --no-lock scripts/sp577-thinking-diagnostic.ts --out=<dir outside the repo>
//
// Run 7's judge came back EMPTY twice on quote c5922dcc under the one-part claim "Third-party work
// leaves lines cut" (prompt sha 9c08b5f7…): at 4,000 tokens and again at 8,000 it spent the whole
// budget in `message.thinking`. `callOllamaJson` keeps only `message.content`, so what the thinking
// was doing was never recorded (brief 9 §6).
//
// SP-577 named prompt 68dafede…. That one is the SP-514 SPAN RE-ASK of the three-part claim on the
// same quote: it quotes the judge's first answer back, and that answer was never stored, so it cannot
// be rebuilt without asking the first question again. The operator ruled (2026-11-23) that this
// one-part prompt is asked instead, and that num_ctx is raised so 16,000 tokens fit: at the judge's
// own 8,192 the thinking would be shifted out of context at about 7,300 tokens.
//
// This asks the SAME question once more — same model, same options as the judge of record — with
// `num_predict` 16,000 (and the larger num_ctx), and keeps what the shared caller throws away: `message.thinking`,
// `eval_count`, `prompt_eval_count` and `done_reason`. It is READ-ONLY apart from its ledger row
// (SP-518). The prompt is rebuilt from stored rows and REFUSED unless its md5 is the stored one, so
// this cannot quietly ask a different question.
import { LOCAL_PATTERN_JUDGE } from "../src/lib/modelRouter/resolveModel.ts";
import { JUDGE_SYSTEM, PATTERN_JUDGE_THINK, buildJudgeUser } from "../supabase/functions/_shared/needPatterns.ts";
import { ledgerLocalCall, md5OfText, noResponseLedgerRow, psqlJson, sqlQuote as q } from "./ledgerShim.ts";

const COMPANY = "dd40ce2f-ff67-4111-bd3c-67943dde6717";
const NEED_ID = "4c062d5c-4309-4330-a025-a8113d6bc20f";           // P1
const SIGNAL_ID = "c5922dcc-fc3f-415a-aad9-ee86c04ba0ca";
const CLAIM = "Third-party work leaves lines cut";
const PARTS = ["third-party work leaves lines cut"];
const STORED_PROMPT_SHA = "9c08b5f76cdf2d8269bc88c517c33b22";
const NUM_PREDICT = 16_000;
const NUM_CTX = 24_576;                                            // the judge of record runs at 8,192; raised by ruling

const OUT = (Deno.args.find((a) => a.startsWith("--out=")) ?? "").slice(6);
if (!OUT.startsWith("/")) { console.error("REFUSED: --out=<absolute dir> is required"); Deno.exit(1); }
await Deno.mkdir(OUT, { recursive: true });

const [need] = await psqlJson<{ desired_outcome: string }>(`select desired_outcome from public.odi_needs where id = ${q(NEED_ID)} and company_id = ${q(COMPANY)}`);
const [sig] = await psqlJson<{ quote: string }>(`select quote from public.signals where id = ${q(SIGNAL_ID)}`);
const user = buildJudgeUser(need.desired_outcome, CLAIM, PARTS, { signalId: SIGNAL_ID, quote: sig.quote } as never);
const sha = await md5OfText(`${JUDGE_SYSTEM}\n${user}`);
console.log(`prompt md5 ${sha}  (stored ${STORED_PROMPT_SHA})  JUDGE_SYSTEM md5 ${await md5OfText(JUDGE_SYSTEM)}`);
if (sha !== STORED_PROMPT_SHA) { console.error("REFUSED: the rebuilt prompt is not the stored one; nothing was sent"); Deno.exit(1); }

const OLLAMA = (Deno.env.get("OLLAMA_BASE_URL") ?? "http://127.0.0.1:11434/v1").replace(/\/v1\/?$/, "");
// The body `callOllamaJson` sends for the judge of record, field for field, but for num_predict and num_ctx.
const body = {
  model: LOCAL_PATTERN_JUDGE, format: "json", stream: false, think: PATTERN_JUDGE_THINK,
  options: { num_ctx: NUM_CTX, temperature: 0, seed: 42, num_predict: NUM_PREDICT },
  messages: [{ role: "system", content: JUDGE_SYSTEM }, { role: "user", content: user }],
};
const callSite = "sp577-diagnostic:judge";
const t0 = performance.now();
let data: Record<string, unknown>;
try {
  const resp = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer ollama" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(1_200_000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  data = await resp.json();
} catch (e) {
  const row = noResponseLedgerRow({ callSite, requestedModel: LOCAL_PATTERN_JUDGE });
  const ok = await ledgerLocalCall({ companyId: COMPANY, callSite: row.callSite, model: row.usage.model, system: JUDGE_SYSTEM, user });
  console.error(`call failed after ${((performance.now() - t0) / 1000).toFixed(1)}s: ${e}  — 1 call, ${ok ? 1 : 0} ledger row`);
  Deno.exit(1);
}
const seconds = (performance.now() - t0) / 1000;
const served = typeof data.model === "string" && data.model ? data.model : LOCAL_PATTERN_JUDGE;
const ledgered = await ledgerLocalCall({ companyId: COMPANY, callSite, model: served, system: JUDGE_SYSTEM, user });

const msg = (data.message ?? {}) as { content?: string; thinking?: string };
const thinking = String(msg.thinking ?? ""), content = String(msg.content ?? "");
await Deno.writeTextFile(`${OUT}/sp577-thinking.txt`, thinking);
await Deno.writeTextFile(`${OUT}/sp577-prompt.txt`, `--- SYSTEM ---\n${JUDGE_SYSTEM}\n--- USER ---\n${user}\n`);
await Deno.writeTextFile(`${OUT}/sp577-response.json`, JSON.stringify({ request: { ...body, messages: "see sp577-prompt.txt" }, seconds, response: data }, null, 2));

console.log(`model ${served}  ${seconds.toFixed(1)}s  done_reason ${data.done_reason}`);
console.log(`prompt_eval_count ${data.prompt_eval_count}  eval_count ${data.eval_count}  num_predict ${NUM_PREDICT}  num_ctx ${NUM_CTX}`);
console.log(`thinking ${thinking.length} chars  content ${content.length} chars`);
console.log(`content: ${content || "(empty)"}`);
console.log(`SP-518 ledger: 1 model call made · ${ledgered ? 1 : 0} model_calls row written`);
if (!ledgered) Deno.exitCode = 1;
