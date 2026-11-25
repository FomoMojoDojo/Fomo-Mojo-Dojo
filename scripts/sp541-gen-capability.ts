// ── SP-541: CAN qwen3.6:35b GENERATE AT ALL? ─────────────────────────────────────────────────────
//
// A model-swap arm that fails for a plumbing reason reads as a model that cannot do the job, so this
// runs ONE generation on ONE need and prints what the runner's own ledger cannot: ollama's token
// counts and `done_reason`. That is the whole point of it — a local call is ledgered with
// prompt_tokens NULL, so a BUDGET failure (the answer cut at num_predict, or the input truncated at
// num_ctx) is invisible from the ledger and looks like a bad answer.
//
// SP-517 is why `think` is here: a thinking model with thinking ON spends the whole num_predict
// budget on `message.thinking` and returns an EMPTY `content`. qwen3.6:35b returned nothing at
// num_predict 200 and nothing at 1,400, and answered in 4.3s with think:false.
//
//   deno run -A scripts/sp541-gen-capability.ts --need=N14 [--gen-prompt=new] [--model=qwen3.6:35b]
//                                               [--num-predict=2400] [--num-ctx=8192] [--think=false]
// Read-only apart from its ONE ledger row (SP-518). No pattern, part or verdict row is ever written.
import { makeLedgerShim, md5OfText, psql, psqlJson, sqlQuote as q } from "./ledgerShim.ts";
import { recordModelCall } from "../supabase/functions/_shared/recordModelCall.ts";
import { DEFAULT_NEED_KEYS, loadNeedKeys } from "./needKeys.ts";
import {
  GENERATOR_SYSTEM_NEW, GENERATOR_SYSTEM_OLD, PATTERN_NUM_PREDICT, QUOTE_POLARITIES,
  buildGeneratorUser, parseGeneratedPass, quoteLabels, accountForQuotes,
  type PatternQuote, type QuotePolarity,
} from "../supabase/functions/_shared/needPatterns.ts";

const arg = (n: string, d = "") => (Deno.args.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=")) ?? d;
const COMPANY = arg("company", "dd40ce2f-ff67-4111-bd3c-67943dde6717");
const NEED = arg("need", "N14");
const GEN_PROMPT = arg("gen-prompt", "new");
const MODEL = arg("model", "qwen3.6:35b");
const NUM_PREDICT = Number(arg("num-predict", String(PATTERN_NUM_PREDICT)));
const NUM_CTX = Number(arg("num-ctx", "8192"));
const THINK = arg("think", "false") === "true";
const OLLAMA = Deno.env.get("OLLAMA_URL") ?? "http://127.0.0.1:11434";
if (GEN_PROMPT !== "old" && GEN_PROMPT !== "new") {
  console.error(`REFUSED: --gen-prompt must be "old" or "new"`); Deno.exit(1);
}
const SYSTEM = GEN_PROMPT === "old" ? GENERATOR_SYSTEM_OLD : GENERATOR_SYSTEM_NEW;

// the need KEY comes from the key file, exactly as the runner derives it — `source_path` is the
// row's provenance ("public_research"), not its label, and reading it as the key finds no need at all.
// SP-565: by row id, never by the need's sentence.
const needKeys = await loadNeedKeys(COMPANY, arg("keys", DEFAULT_NEED_KEYS));
const needRows = await psql(`select n.id, n.desired_outcome
  from public.odi_needs n where n.company_id = ${q(COMPANY)} and n.status in ('active','proposed')`);
const need = needRows.map((r) => ({ id: r[0], outcome: r[1], key: needKeys.label(r[0]) }))
  .find((n) => n.key === NEED);
if (!need) { console.error(`REFUSED: need ${NEED} not found on this company`); Deno.exit(1); }
// SP-565: the resolution alone, before any model call.
if (Deno.args.includes("--resolve-only")) { console.log(`resolve-only: ${need.key} → ${need.id} · ${need.outcome}`); Deno.exit(0); }

const evRows = await psqlJson<{ need_id: string; signal_id: string; brand: string; quote: string | null; url: string | null; date: string | null; polarity: string | null }>(
  `select e.need_id, e.signal_id, e.brand, s.quote, s.source_url as url,
     to_char(s.event_date,'YYYY-MM-DD') as date, e.polarity
   from public.need_evidence e join public.signals s on s.id = e.signal_id
   where e.company_id = ${q(COMPANY)} and e.bears and e.need_id = ${q(need.id)}`);
const siteOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "unknown"; } };
const quotes: PatternQuote[] = evRows
  .filter((r) => (r.quote ?? "").trim())
  .map((r) => ({
    signalId: r.signal_id, quote: r.quote!, site: siteOf(r.url ?? ""), eventDate: r.date || null, brand: r.brand,
    polarity: QUOTE_POLARITIES.includes(r.polarity as QuotePolarity) ? (r.polarity as QuotePolarity) : null,
  }));
// the generator is called PER POLARITY, so the capability check uses the largest group — the one that
// most nearly matches a real pass.
const groups = new Map<string, PatternQuote[]>();
for (const x of quotes) groups.set(x.polarity ?? "unlabelled", [...(groups.get(x.polarity ?? "unlabelled") ?? []), x]);
const [polarity, pQuotes] = [...groups].sort((a, b) => b[1].length - a[1].length)[0] ?? ["", []];
if (!pQuotes.length) { console.error(`REFUSED (SP-532): need ${NEED} selected ZERO quotes`); Deno.exit(1); }

const labels = quoteLabels(pQuotes);
const user = buildGeneratorUser(need.outcome, pQuotes);
console.log(`SP-541 capability check — ${MODEL}, generator prompt "${GEN_PROMPT}" (md5 ${await md5OfText(SYSTEM)})`);
console.log(`  need ${NEED} · polarity "${polarity}" · ${pQuotes.length} quote(s) of ${quotes.length} on the need`);
console.log(`  options: temperature 0, seed 42, num_predict ${NUM_PREDICT}, num_ctx ${NUM_CTX}, think ${THINK}, keep_alive 0`);
console.log(`  prompt chars: system ${SYSTEM.length} + user ${user.length} = ${SYSTEM.length + user.length}`);

const t0 = performance.now();
const resp = await fetch(`${OLLAMA.replace(/\/v1\/?$/, "")}/api/chat`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: MODEL, format: "json", stream: false, think: THINK, keep_alive: 0,
    options: { num_ctx: NUM_CTX, temperature: 0, seed: 42, num_predict: NUM_PREDICT },
    messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }],
  }),
});
const seconds = (performance.now() - t0) / 1000;
if (!resp.ok) { console.error(`FAIL: HTTP ${resp.status} from ollama`); Deno.exit(1); }
const data = await resp.json() as {
  message?: { content?: string; thinking?: string };
  prompt_eval_count?: number; eval_count?: number; done_reason?: string;
};
const content = data.message?.content ?? "";
const thinking = data.message?.thinking ?? "";

// the ledger, before any verdict on the answer (SP-518)
const sb = makeLedgerShim();
await recordModelCall(sb as never, {
  companyId: COMPANY, callSite: "sp541-gen-capability:generator",
  usage: { provider: "local_ollama", model: MODEL, prompt_tokens: data.prompt_eval_count ?? null, completion_tokens: data.eval_count ?? null, usd: 0 },
  promptSha: await md5OfText(SYSTEM + "\n" + user),
});

console.log(`\n  ${seconds.toFixed(1)}s · done_reason ${JSON.stringify(data.done_reason ?? "")}`);
console.log(`  TOKENS: prompt_eval_count ${data.prompt_eval_count ?? "?"} / num_ctx ${NUM_CTX}` +
  `   eval_count ${data.eval_count ?? "?"} / num_predict ${NUM_PREDICT}`);
console.log(`  content ${content.length} chars · thinking ${thinking.length} chars`);
if (data.prompt_eval_count !== undefined && data.prompt_eval_count >= NUM_CTX) {
  console.log(`  ⚠ THE INPUT FILLED num_ctx — quotes were silently dropped from the prompt`);
}
if (data.done_reason === "length") console.log(`  ⚠ THE ANSWER WAS CUT at num_predict`);
if (!content.trim()) {
  console.log(`\nFAIL: the model returned an EMPTY content (${thinking.length} chars of thinking).` +
    (THINK ? " SP-517: this is what thinking ON does to a generator budget." : ""));
  Deno.exit(1);
}
try {
  const pass = parseGeneratedPass(content, labels);
  const acc = accountForQuotes(labels, pass.patterns, pass.leftOver);
  console.log(`\nPASS — the answer parses: ${pass.patterns.length} pattern(s), ${pass.leftOver.length} left over, ${pass.dropped.length} claim(s) dropped (SP-542)`);
  for (const p of pass.patterns) console.log(`    [${p.polarity}] "${p.name}"\n        parts: ${p.parts.map((x) => `"${x}"`).join(" · ")}\n        cites ${p.citedLabels.length}: ${p.citedLabels.join(" ")}`);
  for (const d of pass.dropped) console.log(`    DROPPED claim ${d.ordinal} [${d.kind}] "${d.claim.slice(0, 60)}": ${d.why.slice(0, 90)}`);
  for (const l of pass.leftOver) console.log(`    left over ${l.label}: ${l.why || "(NO REASON GIVEN)"}`);
  console.log(`  accounting: ${acc.accounted} of ${labels.size} · unaccounted [${acc.missing.join(" ")}] · both [${acc.both.join(" ")}]`);
} catch (e) {
  console.log(`\nFAIL: the answer does not parse — ${e instanceof Error ? e.message : e}`);
  console.log(`  first 600 chars: ${content.slice(0, 600)}`);
  Deno.exit(1);
}
