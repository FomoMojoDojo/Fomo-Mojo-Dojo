// ── SP-614 / SP-623: N13's REFERENCE ENTRIES, PROPOSED FOR SIGN-OFF (brief 16, 2026-11-24) ──────────
//
// One generator call reads N13's counted quotes under its current wording and proposes reference
// entries; one judge call per (entry, cited quote) confirms or rejects each citation. The result is a
// PROPOSAL: this script writes a JSON file and a log and nothing else. It never touches
// `scripts/pattern-reference-compare.ts` — the operator signs first.
//
// THE TWO PROMPTS ARE NOT TYPED HERE. SP-623 approved them "as written" in brief 15 §5.3 and §5.4, so
// they are READ from that report's own code blocks, byte for byte, and their md5s are printed. A copy
// retyped into this file could differ from what was approved by one character and nobody would know.
//
// Settings are brief 15 §5.2's: local qwen3.6:35b for both; generator temperature 0, seed 42, thinking
// off, num_predict 2,400; judge temperature 0, seed 42, thinking on, num_predict 4,000, one retry at
// 7,000 on an empty answer. Every call is printed and ledgered (SP-518); printed must equal ledgered.
//
//   deno run -A --no-lock scripts/sp614-reference-entries.ts --report=<brief 15 report.md> --out=<dir>
import { isCounted, siteOf } from "../src/lib/needEvidenceCounting.ts";
import { ledgerLocalCall, md5OfText, noResponseLedgerRow, psql, psqlJson, sqlQuote } from "./ledgerShim.ts";
import { callOllamaJson } from "../supabase/functions/_shared/claimDeltaSynthesis.ts";
import { verbatimOn } from "../supabase/functions/_shared/excerptBlanking.ts";
import { loadNeedKeys, DEFAULT_NEED_KEYS } from "./needKeys.ts";
import {
  buildGeneratorUser, isEmptyAnswerError, QUOTE_POLARITIES, type PatternQuote, type QuotePolarity,
} from "../supabase/functions/_shared/needPatterns.ts";

const arg = (n: string, d = "") => Deno.args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const COMPANY = arg("company", "dd40ce2f-ff67-4111-bd3c-67943dde6717");
const NEED_KEY = arg("need", "N13");
const REPORT = arg("report");
const OUT = arg("out");
if (!REPORT || !OUT) { console.error("REFUSED: --report=<brief 15 report.md> and --out=<dir> are required"); Deno.exit(1); }
const MODEL = "qwen3.6:35b";
const GEN_OPTS = { temperature: 0, seed: 42, num_predict: 2_400, think: false, keep_alive: 0 };
const JUDGE_FIRST = 4_000, JUDGE_RETRY = 7_000;
const OLLAMA = Deno.env.get("OLLAMA_BASE_URL") ?? "http://127.0.0.1:11434/v1";

// ── the approved prompts, from the report ────────────────────────────────────────────────────────
function systemBlock(report: string, heading: string): string {
  const at = report.indexOf(heading);
  if (at < 0) throw new Error(`the report has no heading ${JSON.stringify(heading)}`);
  const sys = report.indexOf("\nSystem:\n", at);
  const open = report.indexOf("```\n", sys);
  const close = report.indexOf("\n```", open + 4);
  if (sys < 0 || open < 0 || close < 0) throw new Error(`no System code block under ${JSON.stringify(heading)}`);
  return report.slice(open + 4, close);
}
const report = await Deno.readTextFile(REPORT);
const GEN_SYSTEM_APPROVED = systemBlock(report, "### 5.3 Generator prompt, in full");
// ── SP-640 (brief 18): EXACTLY TWO EDITS to the generator prompt, applied to the approved text ────
// `--edits=sp640` turns them on. The approved text must still be md5 1ea16940… or the run refuses; each
// edit must apply exactly once; the changed lines, a diff and the new md5 are printed before any call.
const EDITS = arg("edits");
const SP640_OLD_RULE = `If you need "and" to join two different things, write two entries.`;
const SP640_NEW_RULE = `If you need "and" or "or" to join two different things, write two entries.`;
const SP640_ANCHOR = `A "working" or "mixed" entry may rest on 1 quote.`;
const SP640_ADDED = `- Write a "working" or "mixed" entry when a quote of that polarity describes something. Do not leave a quote over only because of its polarity.`;
let GEN_SYSTEM = GEN_SYSTEM_APPROVED;
if (EDITS === "sp640") {
  const approvedMd5 = await md5OfText(GEN_SYSTEM_APPROVED);
  if (!approvedMd5.startsWith("1ea16940")) { console.error(`REFUSED: the approved generator prompt is md5 ${approvedMd5}, not 1ea16940…`); Deno.exit(1); }
  const count = (s: string, x: string) => s.split(x).length - 1;
  if (count(GEN_SYSTEM, SP640_OLD_RULE) !== 1 || count(GEN_SYSTEM, SP640_ANCHOR) !== 1) { console.error("REFUSED: an SP-640 edit does not apply exactly once"); Deno.exit(1); }
  const lines = GEN_SYSTEM.replace(SP640_OLD_RULE, SP640_NEW_RULE).split("\n");
  const at = lines.findIndex((l) => l.includes(SP640_ANCHOR));
  lines.splice(at + 1, 0, SP640_ADDED);
  GEN_SYSTEM = lines.join("\n");
  // The diff, computed here and checked: one line changed, one line added, nothing else.
  const a = GEN_SYSTEM_APPROVED.split("\n"), b = GEN_SYSTEM.split("\n");
  const changed = a.map((l, i) => ({ i, l })).filter(({ i, l }) => (i <= at ? b[i] : b[i + 1]) !== l);
  console.log(`SP-640: approved generator prompt md5 ${approvedMd5} (${a.length} lines) → edited md5 ${await md5OfText(GEN_SYSTEM)} (${b.length} lines)`);
  console.log("SP-640 diff against the approved prompt:");
  for (const c of changed) { console.log(`  ${c.i + 1}c${c.i + 1}`); console.log(`  < ${c.l}`); console.log(`  > ${c.i <= at ? b[c.i] : b[c.i + 1]}`); }
  console.log(`  ${at + 1}a${at + 2}`); console.log(`  > ${b[at + 1]}`);
  if (changed.length !== 1 || b.length !== a.length + 1 || b[at + 1] !== SP640_ADDED) { console.error("STOP: the edited prompt differs from the approved one by more than the two SP-640 edits"); Deno.exit(1); }
} else if (EDITS) { console.error(`REFUSED: unknown --edits=${EDITS}`); Deno.exit(1); }
const JUDGE_SYSTEM_614 = systemBlock(report, "### 5.4 Judge prompt, in full");
console.log(`report ${REPORT}  md5 ${await md5OfText(report)}`);
console.log(`SP-614 generator prompt  md5 ${await md5OfText(GEN_SYSTEM)}  ${GEN_SYSTEM.split("\n").length} lines  ${GEN_SYSTEM.length} chars`);
console.log(`SP-614 judge prompt      md5 ${await md5OfText(JUDGE_SYSTEM_614)}  ${JUDGE_SYSTEM_614.split("\n").length} lines  ${JUDGE_SYSTEM_614.length} chars`);

// ── the need and its counted quotes — the runner's own read, so the labels are the runner's ─────
const q = sqlQuote;
const keys = await loadNeedKeys(COMPANY, DEFAULT_NEED_KEYS);
const needRows = await psql(`select n.id, n.desired_outcome from public.odi_needs n where n.company_id = ${q(COMPANY)} and n.status in ('active','proposed')`);
const need = needRows.map(([id, outcome]) => ({ id, outcome, key: keys.label(id) })).find((n) => n.key === NEED_KEY);
if (!need) { console.error(`REFUSED: no need row for ${NEED_KEY}`); Deno.exit(1); }
const evRows = await psqlJson<{ need_id: string; signal_id: string; brand: string; quote: string | null; url: string | null; date: string | null; polarity: string | null }>(
  `select e.need_id, e.signal_id, e.brand, s.quote, s.source_url as url,
     to_char(s.event_date,'YYYY-MM-DD') as date, e.polarity
   from public.need_evidence e join public.signals s on s.id = e.signal_id
   where e.company_id = ${q(COMPANY)} and e.bears`);
const quotes: PatternQuote[] = [];
for (const r of evRows) {
  if (r.need_id !== need.id) continue;
  const quote = r.quote ?? "";
  if (!isCounted({ brand: r.brand, eventDate: r.date || null })) continue;
  if (!quote.trim()) continue;
  quotes.push({ signalId: r.signal_id, quote, site: siteOf(r.url ?? ""), eventDate: r.date || null, brand: r.brand,
    polarity: QUOTE_POLARITIES.includes(r.polarity as QuotePolarity) ? (r.polarity as QuotePolarity) : null });
}
const labels = new Map<string, PatternQuote>(quotes.map((x, i) => [`q${i + 1}`, x]));
console.log(`need ${need.key} ${need.id}\nwording: ${need.outcome}\ncounted quotes: ${quotes.length}`);
if (quotes.length === 0) { console.error("REFUSED (SP-532): no counted quotes"); Deno.exit(1); }

// ── the calls: local only, each printed and ledgered ─────────────────────────────────────────────
let callsMade = 0, rowsWritten = 0;
const timings: Array<{ site: string; seconds: number; np: number; answered: boolean }> = [];
async function modelCall(site: "generator" | "judge", system: string, user: string, opts: Record<string, unknown>, attempt: number, what: string): Promise<string> {
  const callSite = `reference-entries:${site}`;
  let served = "";
  const t0 = performance.now();
  callsMade++;
  try {
    const content = await callOllamaJson(OLLAMA, MODEL, system, user, 600_000, opts as never, (m) => { served = m; });
    const s = (performance.now() - t0) / 1000;
    timings.push({ site, seconds: s, np: Number(opts.num_predict), answered: true });
    if (await ledgerLocalCall({ companyId: COMPANY, callSite, model: served || MODEL, system, user, attempt })) rowsWritten++;
    console.log(`  call ${String(callsMade).padStart(3)} ${site.padEnd(9)} ${(served || MODEL).padEnd(12)} np ${opts.num_predict} ${s.toFixed(1).padStart(6)}s  ${content.length} chars  ${what}`);
    return content;
  } catch (e) {
    const s = (performance.now() - t0) / 1000;
    timings.push({ site, seconds: s, np: Number(opts.num_predict), answered: false });
    const row = noResponseLedgerRow({ callSite, requestedModel: MODEL });
    if (await ledgerLocalCall({ companyId: COMPANY, callSite: row.callSite, model: row.usage.model, system, user, attempt })) rowsWritten++;
    console.log(`  call ${String(callsMade).padStart(3)} ${site.padEnd(9)} ${MODEL.padEnd(12)} np ${opts.num_predict} ${s.toFixed(1).padStart(6)}s  THREW: ${(e instanceof Error ? e.message : String(e)).slice(0, 80)}  ${what}`);
    throw e;
  }
}

// ── stage 1: the generator ───────────────────────────────────────────────────────────────────────
const genUser = buildGeneratorUser(need.outcome, quotes);
console.log(`\nstage 1: generator · ${MODEL} · temperature 0 · seed 42 · think off · num_predict ${GEN_OPTS.num_predict} · user ${genUser.length} chars md5 ${await md5OfText(genUser)}`);
const genRaw = await modelCall("generator", GEN_SYSTEM, genUser, GEN_OPTS, 1, `${quotes.length} quotes`);
type Entry = { entry: string; polarity: string; quotes: string[] };
type LeftOver = { quote: string; why: string };
let entries: Entry[] = [], leftOver: LeftOver[] = [];
const shapeNotes: string[] = [];
{
  const m = genRaw.match(/\{[\s\S]*\}/);
  if (!m) { console.error("FAILED: the generator returned no JSON object"); await Deno.writeTextFile(`${OUT}/sp614-generator-raw.txt`, genRaw); Deno.exit(1); }
  const parsed = JSON.parse(m[0]) as { entries?: unknown; left_over?: unknown };
  const rawEntries = Array.isArray(parsed.entries) ? parsed.entries : [];
  let rawLeft: unknown[] = Array.isArray(parsed.left_over) ? parsed.left_over : [];
  for (const e of rawEntries) {
    const o = e as { entry?: unknown; polarity?: unknown; quotes?: unknown; left_over?: unknown };
    // SP-618(a)'s lesson: a left_over list nested inside the entries array is read, and said so.
    if (typeof o?.entry !== "string" && Array.isArray(o?.left_over)) { rawLeft = [...rawLeft, ...o.left_over]; shapeNotes.push("the answer nested `left_over` inside `entries` — read as the account"); continue; }
    entries.push({
      entry: String(o?.entry ?? "").replace(/\s+/g, " ").trim(),
      polarity: String(o?.polarity ?? "").trim().toLowerCase(),
      quotes: Array.isArray(o?.quotes) ? [...new Set((o.quotes as unknown[]).filter((x): x is string => typeof x === "string").map((x) => x.trim()))] : [],
    });
  }
  leftOver = rawLeft.map((l) => ({ quote: String((l as { quote?: unknown })?.quote ?? "").trim(), why: String((l as { why?: unknown })?.why ?? "").replace(/\s+/g, " ").trim() })).filter((l) => l.quote);
}
// The prompt's own rules, CHECKED AND REPORTED — never repaired. An entry that breaks one is still shown.
const citedCount = new Map<string, number>();
for (const e of entries) for (const l of e.quotes) citedCount.set(l, (citedCount.get(l) ?? 0) + 1);
const ruleNotes: string[] = [...shapeNotes];
if (entries.length > 8) ruleNotes.push(`${entries.length} entries, over the cap of 8`);
entries.forEach((e, i) => {
  if (!e.entry) ruleNotes.push(`entry ${i + 1} has no text`);
  if (e.entry.length > 80) ruleNotes.push(`entry ${i + 1} is ${e.entry.length} characters, over 80`);
  if (/\band\b/i.test(e.entry)) ruleNotes.push(`entry ${i + 1} contains "and": "${e.entry}"`);
  if (EDITS === "sp640" && /\bor\b/i.test(e.entry)) ruleNotes.push(`entry ${i + 1} contains "or": "${e.entry}"`);
  if (!QUOTE_POLARITIES.includes(e.polarity as QuotePolarity)) ruleNotes.push(`entry ${i + 1} carries polarity ${JSON.stringify(e.polarity)}`);
  const unknown = e.quotes.filter((l) => !labels.has(l));
  if (unknown.length) ruleNotes.push(`entry ${i + 1} cites label(s) that were not given: ${unknown.join(", ")}`);
  const wrongPol = e.quotes.filter((l) => labels.has(l) && labels.get(l)!.polarity !== e.polarity);
  if (wrongPol.length) ruleNotes.push(`entry ${i + 1} [${e.polarity}] cites quote(s) of another polarity: ${wrongPol.join(", ")}`);
  if (e.polarity === "not working" && e.quotes.filter((l) => labels.has(l)).length < 2) ruleNotes.push(`entry ${i + 1} is "not working" with fewer than 2 quotes`);
});
for (const [l, n] of citedCount) if (n > 2) ruleNotes.push(`${l} is cited under ${n} entries, over the limit of 2`);
const unknownLeft = leftOver.filter((l) => !labels.has(l.quote)).map((l) => l.quote);
if (unknownLeft.length) ruleNotes.push(`left_over names label(s) that were not given: ${unknownLeft.join(", ")}`);
const loSet = new Set(leftOver.map((l) => l.quote));
const missing = [...labels.keys()].filter((l) => !citedCount.has(l) && !loSet.has(l));
const both = [...labels.keys()].filter((l) => citedCount.has(l) && loSet.has(l));
if (missing.length) ruleNotes.push(`NOT accounted for (in no entry and not left over): ${missing.join(", ")}`);
if (both.length) ruleNotes.push(`cited AND left over: ${both.join(", ")}`);
console.log(`generator: ${entries.length} entr(ies), ${citedCount.size} quote(s) cited, ${leftOver.length} left over, ${missing.length} unaccounted, ${both.length} in both`);
console.log(`rule notes (${ruleNotes.length}) — reported, never repaired; no re-ask is sent (no re-ask text was approved):`);
for (const n of ruleNotes) console.log(`  · ${n}`);

// ── stage 2: one judge call per (entry, cited quote) ─────────────────────────────────────────────
type Verdict = { entry: number; label: string; signal_id: string; describes: boolean; answered: boolean | null; span: string; within_need: boolean | null; reason: string; rejected: string; retried: boolean; raw: string };
const verdicts: Verdict[] = [];
const pairs = entries.flatMap((e, i) => e.quotes.filter((l) => labels.has(l)).map((l) => ({ i, e, l })));
console.log(`\nstage 2: judge · ${MODEL} · temperature 0 · seed 42 · think on · num_predict ${JUDGE_FIRST}, one retry at ${JUDGE_RETRY} on an empty answer · ${pairs.length} (entry, quote) pair(s)`);
let emptyFirst = 0, emptyRecovered = 0, emptyTwice = 0;
for (const { i, e, l } of pairs) {
  const qt = labels.get(l)!;
  const user = `NEED: ${need.outcome}\n\nENTRY: ${e.entry}\n\nQUOTE: "${qt.quote.replace(/\s+/g, " ").trim()}"`;
  const what = `entry ${i + 1} × ${l} ${qt.signalId.slice(0, 8)}`;
  let raw = "", retried = false, failed = "";
  try {
    raw = await modelCall("judge", JUDGE_SYSTEM_614, user, { temperature: 0, seed: 42, num_predict: JUDGE_FIRST, think: true }, 1, what);
  } catch (err) {
    if (!isEmptyAnswerError(err)) failed = err instanceof Error ? err.message : String(err);
    else {
      emptyFirst++; retried = true;
      try { raw = await modelCall("judge", JUDGE_SYSTEM_614, user, { temperature: 0, seed: 42, num_predict: JUDGE_RETRY, think: true }, 2, `${what} (retry)`); emptyRecovered++; }
      catch (err2) { if (isEmptyAnswerError(err2)) emptyTwice++; failed = err2 instanceof Error ? err2.message : String(err2); }
    }
  }
  const v: Verdict = { entry: i + 1, label: l, signal_id: qt.signalId, describes: false, answered: null, span: "", within_need: null, reason: "", rejected: "", retried, raw };
  if (failed) v.rejected = `no answer: ${failed.slice(0, 80)}`;
  else {
    try {
      const o = JSON.parse(raw.match(/\{[\s\S]*\}/)![0]) as Record<string, unknown>;
      v.answered = o.describes === true;
      v.span = typeof o.span === "string" ? o.span.trim() : "";
      v.within_need = typeof o.within_need === "boolean" ? o.within_need : null;
      v.reason = typeof o.reason === "string" ? o.reason.trim() : "";
      // `describes` is COMPUTED: the model's true counts only with a span that is verbatim in the quote.
      if (o.describes !== true) v.rejected = "answered false";
      else if (!v.span) v.rejected = "span missing";
      else if (!verbatimOn(v.span, qt.quote)) v.rejected = "span not verbatim";
      else v.describes = true;
    } catch { v.rejected = "unreadable"; }
  }
  verdicts.push(v);
}

// ── the proposal ─────────────────────────────────────────────────────────────────────────────────
console.log(`\nPROPOSED ENTRIES — a proposal for sign-off; nothing is written to scripts/pattern-reference-compare.ts`);
entries.forEach((e, i) => {
  const vs = verdicts.filter((v) => v.entry === i + 1);
  const wn = vs.filter((v) => v.within_need === false).length;
  console.log(`\n${i + 1}. [${e.polarity}] ${e.entry}   — ${vs.filter((v) => v.describes).length} of ${vs.length} cited quote(s) confirmed${wn ? ` · within_need FALSE on ${wn}` : ""}`);
  for (const v of vs) {
    console.log(`     ${v.describes ? "YES" : "no "} ${v.label.padEnd(4)} ${v.signal_id.slice(0, 8)} within_need=${v.within_need}${v.retried ? " (retried)" : ""}${v.rejected && !v.describes ? ` [${v.rejected}]` : ""}`);
    if (v.span) console.log(`          span: "${v.span}"`);
    console.log(`          reason: ${v.reason || "(none)"}`);
  }
});
console.log(`\nLEFT OVER (${leftOver.length}):`);
for (const l of leftOver) console.log(`  ${l.quote.padEnd(4)} ${(labels.get(l.quote)?.signalId ?? "????????").slice(0, 8)} [${labels.get(l.quote)?.polarity ?? "?"}] ${l.why || "(NO REASON GIVEN)"}`);

const secs = (site: string) => timings.filter((t) => t.site === site).reduce((a, t) => a + t.seconds, 0);
console.log(`\ncalls: ${callsMade} made = ${timings.filter((t) => t.site === "generator").length} generator (${secs("generator").toFixed(1)}s) + ${timings.filter((t) => t.site === "judge").length} judge (${secs("judge").toFixed(1)}s)`);
console.log(`empty answers: ${emptyFirst} first attempt(s) empty · ${emptyRecovered} recovered by the retry at ${JUDGE_RETRY} · ${emptyTwice} empty twice`);
console.log(`SP-518 ledger: ${callsMade} model call(s) made · ${rowsWritten} model_calls row(s) written · difference ${callsMade - rowsWritten}`);
await Deno.writeTextFile(`${OUT}/sp614-proposal.json`, JSON.stringify({
  what: "SP-614 proposal — N13 reference entries for sign-off. NOT written to scripts/pattern-reference-compare.ts.",
  company: COMPANY, need: need.key, need_id: need.id, wording: need.outcome, model: MODEL,
  edits: EDITS || null,
  generator: { system_md5: await md5OfText(GEN_SYSTEM), system: GEN_SYSTEM, user_md5: await md5OfText(genUser), options: GEN_OPTS, raw: genRaw },
  judge: { system_md5: await md5OfText(JUDGE_SYSTEM_614), num_predict: JUDGE_FIRST, num_predict_retry: JUDGE_RETRY, think: true, temperature: 0, seed: 42 },
  quotes: [...labels].map(([label, x]) => ({ label, signal_id: x.signalId, polarity: x.polarity, site: x.site, date: x.eventDate, quote: x.quote })),
  entries: entries.map((e, i) => ({ n: i + 1, ...e })), left_over: leftOver, rule_notes: ruleNotes,
  verdicts, calls: { made: callsMade, ledgered: rowsWritten, timings },
}, null, 1) + "\n");
console.log(`written: ${OUT}/sp614-proposal.json`);
if (callsMade !== rowsWritten) { console.error("FAILED: a model call went unledgered (SP-518)"); Deno.exit(1); }
