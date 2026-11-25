// ── SP-562 (2026-11-23): PROPOSE A WORDING FOR ONE NEED — DRY ONLY ───────────────────────────────
//
//   deno run -A --no-lock scripts/propose-need-wording.ts --company=<uuid> --need-id=<uuid> --out=<dir> [...]
//
// WHAT IT DOES. Stage 1 (`--gen-only`, SP-573): a local generator reads the need's COUNTED quotes —
// and never its current wording — and states the one outcome most of them want. Stage 2: a local
// thinking judge reads every quote against every wording (the need as worded today, each candidate,
// a control need) and says whether the quote is evidence about it. The operator sees stage 1 before
// stage 2 is started.
//
// WHAT IT DOES NOT DO. It decides nothing and it stores nothing. There is no `--apply`. This file
// and `needWording.ts` hold only `select` statements (a test reads both sources and fails on any
// other kind); the one write of a run is each model call's ledger row (SP-518), made by
// `ledgerLocalCall`. Its files go to `--out`, which must be outside the repo.
//
//   --company=<uuid>           required
//   --need-id=<uuid>           required; by id, never by label (SP-565: the label lookup is exact-text)
//   --out=<dir>                required; refused inside the repo
//   --arms=1,2                 generator arms (default 1). Arm 2 adds the notes block (SP-572 (2))
//   --notes=<file>             arm 2: {signal_id: [note, ...]}, RAW; the SP-572 (3) trim is applied here
//   --runs=0:42,0.7:43         SP-589: one generator run per <temperature>:<seed> (default 0:42), arm by arm
//   --already-measured=<file>  a JSON list of statements measured before; an identical final statement is not judged again
//   --gen-only                 stop after the generator and the form gates (SP-573, stage 1)
//   --candidates-from=<file>   stage 2: judge the candidates of an earlier --gen-only run
//   --control-need-id=<uuid>   stage 2: the control wording
//   --no-baseline              stage 2: judge the candidates only (the baseline's verdicts are carried from an earlier run)
//   --extra-quotes=<file>      stage 2: {"<table name>": [signal ids]} — the side tables
//   --specificity=<file>       stage 2: the SP-574 set, judged under every wording but the control
//   --resume                   stage 2: reuse the verdicts already in <out>/fit-pairs.jsonl
//   --draw-specificity=<n>     NO model call: draw the SP-574 set by --seed (default 42), list it, stop
//   --notes-only               NO model call: print every arm 2 note before and after the trim, stop
//   --print-prompts            NO model call: print every prompt and its md5, stop
import { isCounted } from "../src/lib/needEvidenceCounting.ts";
import { LOCAL_PATTERN_GENERATOR, LOCAL_PATTERN_JUDGE } from "../src/lib/modelRouter/resolveModel.ts";
import { callOllamaJson } from "../supabase/functions/_shared/claimDeltaSynthesis.ts";
import { PATTERN_JUDGE_THINK, PATTERN_NUM_PREDICT, callJudgeWithEmptyRetry, isEmptyAnswerError } from "../supabase/functions/_shared/needPatterns.ts";
import { ledgerLocalCall, md5OfText, noResponseLedgerRow, psqlJson, sqlQuote as q } from "./ledgerShim.ts";
import {
  ALL_PROMPT_TEXT, FIT_JUDGE_SYSTEM, FIT_NUM_CTX, FIT_NUM_PREDICT, FIT_NUM_PREDICT_RETRY, WORDING_GENERATOR_SYSTEM,
  type FitSet, type FitVerdict, type FitWording, type FormCheck, type GeneratedWording, type WordingAccount, type WordingQuote,
  accountDetail, accountForWording, buildAccountReask, buildCombinedReask, buildFitUser, buildWordingUser,
  checkForm, collapse, containsAnd, distinctToJudge, drawBySeed, emptyStop, fitsContext, formFailures, gateFailureText, hasContext,
  labelQuotes, notesForQuote, outDirRefusal, parseFit, parseRuns, parseWording, planFitPairs, statementKey, trimNote, type GenRun,
} from "./needWording.ts";

const arg = (name: string, dflt = "") => (Deno.args.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${dflt}`).slice(name.length + 3);
const flag = (name: string) => Deno.args.includes(`--${name}`);
const refuse = (msg: string): never => { console.error(`REFUSED: ${msg}`); Deno.exit(1); };

if (Deno.args.some((a) => a === "--apply" || a.startsWith("--apply="))) refuse("this tool is dry-only (SP-562); it has no --apply");

const COMPANY = arg("company"), NEED_ID = arg("need-id"), OUT_ARG = arg("out");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
if (!UUID.test(COMPANY)) refuse("--company=<uuid> is required");
if (!UUID.test(NEED_ID)) refuse("--need-id=<uuid> is required (by id, never by label)");
if (!OUT_ARG) refuse("--out=<dir> is required");

// ── --out: resolved through its nearest existing ancestor, so a symlink cannot walk it into the repo ──
async function resolveOut(p: string): Promise<string> {
  const abs = p.startsWith("/") ? p : `${Deno.cwd()}/${p}`;
  const parts = abs.split("/").filter(Boolean);
  for (let i = parts.length; i >= 0; i--) {
    const head = "/" + parts.slice(0, i).join("/");
    try { const real = await Deno.realPath(head); return [real.replace(/\/$/, ""), ...parts.slice(i)].join("/"); } catch { /* not there yet */ }
  }
  return abs;
}
const REPO = await Deno.realPath(new URL("..", import.meta.url).pathname);
const OUT = await resolveOut(OUT_ARG);
{ const why = outDirRefusal(OUT, REPO); if (why) refuse(why); }
await Deno.mkdir(OUT, { recursive: true });

const logLines: string[] = [];
const say = (s = "") => { console.log(s); logLines.push(s); };
const writeOut = (name: string, text: string) => Deno.writeTextFile(`${OUT}/${name}`, text);
const flushLog = () => writeOut("run.log", logLines.join("\n") + "\n");

// ── --print-prompts ──────────────────────────────────────────────────────────────────────────────
if (flag("print-prompts")) {
  for (const [name, text] of Object.entries(ALL_PROMPT_TEXT)) {
    say(`── ${name} · md5 ${await md5OfText(text)} · ${text.length} chars`);
    say(text);
    say();
  }
  await flushLog();
  Deno.exit(0);
}

// ── the need and its COUNTED quotes, from stored rows ────────────────────────────────────────────
type NeedRow = { id: string; desired_outcome: string; status: string };
const needOf = async (id: string): Promise<NeedRow> => {
  const rows = await psqlJson<NeedRow>(`select n.id, n.desired_outcome, n.status from public.odi_needs n
    where n.company_id = ${q(COMPANY)} and n.id = ${q(id)}`);
  return rows[0] ?? refuse(`no need ${id} on company ${COMPANY}`);
};
const need = await needOf(NEED_ID);

type EvRow = { need_id: string; signal_id: string; brand: string; quote: string | null; date: string | null; polarity: string | null; bears: boolean };
const evRows = await psqlJson<EvRow>(
  `select e.need_id, e.signal_id, e.brand, s.quote, to_char(s.event_date,'YYYY-MM-DD') as date, e.polarity, e.bears
     from public.need_evidence e join public.signals s on s.id = e.signal_id
    where e.company_id = ${q(COMPANY)} order by e.signal_id, e.need_id`);
// the ONE counting authority, and a quote with no verified text has nothing to read
const counted = evRows.filter((r) => r.bears && isCounted({ brand: r.brand, eventDate: r.date || null }) && (r.quote ?? "").trim() !== "");
const quoteText = new Map(evRows.filter((r) => (r.quote ?? "").trim() !== "").map((r) => [r.signal_id, r.quote as string]));
const needQuotes: WordingQuote[] = counted.filter((r) => r.need_id === NEED_ID)
  .map((r) => ({ signalId: r.signal_id, quote: r.quote as string, polarity: r.polarity }));
if (!needQuotes.length) refuse(`need ${NEED_ID} has no counted quote`);
const labels = labelQuotes(needQuotes);
const labelOf = new Map([...labels].map(([l, x]) => [x.signalId, l]));

say(`SP-562 wording tool — DRY ONLY. company ${COMPANY}  need ${NEED_ID} (${need.status})`);
say(`counted quotes on this need: ${needQuotes.length}   out: ${OUT}`);

// ── --draw-specificity (SP-574): no model call ───────────────────────────────────────────────────
if (arg("draw-specificity")) {
  const n = Number(arg("draw-specificity")), seed = Number(arg("seed", "42"));
  if (!Number.isInteger(n) || n < 1 || !Number.isInteger(seed)) refuse("--draw-specificity=<n> and --seed=<int> must be integers");
  // "No link" is the stored fact: this need's row for the quote says it does not bear.
  const linkedHere = new Set(evRows.filter((r) => r.need_id === NEED_ID && r.bears).map((r) => r.signal_id));
  const pool = [...new Set(counted.map((r) => r.signal_id))].filter((id) => !linkedHere.has(id));
  const drawn = drawBySeed(pool, n, seed);
  const needsOf = (id: string) => [...new Set(counted.filter((r) => r.signal_id === id).map((r) => r.need_id))];
  say(`SP-574 specificity set: ${drawn.length} of ${pool.length} counted quote(s) with no link to this need, seed ${seed}`);
  for (const id of drawn) say(`  ${id}  needs: ${needsOf(id).join(", ")}`);
  await writeOut("specificity-set.json", JSON.stringify({ need_id: NEED_ID, seed, pool: pool.length, signal_ids: drawn, linked_needs: Object.fromEntries(drawn.map((id) => [id, needsOf(id)])) }, null, 2));
  await flushLog();
  Deno.exit(0);
}

// ── arm 2's notes: RAW from the file, trimmed here by the one rule (SP-572 (3)) ──────────────────
const ARMS = arg("arms", "1").split(",").map((s) => Number(s.trim()));
if (!ARMS.length || ARMS.some((a) => a !== 1 && a !== 2)) refuse(`--arms takes 1, 2 or 1,2; got ${JSON.stringify(arg("arms", "1"))}`);
let notes: Record<string, string[]> | undefined;
if (arg("notes")) {
  const raw = JSON.parse(await Deno.readTextFile(arg("notes"))) as Record<string, string[]>;
  notes = {};
  const outside: string[] = [];
  const table: Array<{ signal_id: string; label: string; before: string; after: string; passed: boolean }> = [];
  for (const [id, list] of Object.entries(raw)) {
    if (!labelOf.has(id)) { outside.push(id); continue; }
    notes[id] = notesForQuote(list);
    const seen: string[] = [];
    for (const before of list) {
      const after = trimNote(before);
      table.push({ signal_id: id, label: labelOf.get(id)!, before, after, passed: !seen.includes(after) && after.trim() !== "" });
      seen.push(after);
    }
  }
  table.sort((a, b) => Number(a.label.slice(1)) - Number(b.label.slice(1)));
  const passed = table.filter((t) => t.passed);
  say(`arm 2 notes: ${table.length} raw note(s) on ${Object.keys(notes).length} quote(s) → ${passed.length} passed after the trim and the once-per-quote rule` +
    (outside.length ? ` · ${outside.length} note key(s) are not counted quotes of this need and are ignored: ${outside.join(", ")}` : ""));
  await writeOut("arm2-notes.json", JSON.stringify({ rule: "cut from the first \", not \", \", no \" or \" rather than \" to the end; identical notes on a quote pass once", notes: table, ignored: outside }, null, 2));
  if (flag("notes-only")) {
    for (const t of table) {
      say(`  ${t.label} ${t.signal_id.slice(0, 8)}  BEFORE: ${t.before}`);
      say(`  ${" ".repeat(t.label.length)} ${" ".repeat(8)}  AFTER:  ${t.after}${t.passed ? "" : "   (same as an earlier note on this quote — passed once)"}`);
    }
    const WATCH = ["contact", "reach", "hold", "call"];
    const still = passed.filter((t) => WATCH.some((w) => t.after.toLowerCase().includes(w)));
    say(`\ntrimmed notes that still contain ${WATCH.map((w) => `"${w}"`).join(", ")}: ${still.length} of ${passed.length} (nothing is changed in them)`);
    for (const t of still) say(`  ${t.label} ${t.signal_id.slice(0, 8)}: ${t.after}`);
    await flushLog();
    Deno.exit(0);
  }
}
if (flag("notes-only")) refuse("--notes-only needs --notes=<file>");
if (ARMS.includes(2) && !notes && !arg("candidates-from")) refuse("arm 2 needs --notes=<file>");

// ── the model calls: local only, and every one ledgered (SP-518) ─────────────────────────────────
const OLLAMA = Deno.env.get("OLLAMA_BASE_URL") ?? "http://127.0.0.1:11434/v1";
let callsMade = 0, rowsWritten = 0;
const timings: Array<{ site: string; seconds: number; attempt: number; answered: boolean }> = [];

async function modelCall(site: "generator" | "fit-judge", model: string, system: string, user: string,
  options: { temperature: number; seed: number; num_predict: number; num_ctx: number; think: boolean; keep_alive?: number }, attempt: number): Promise<string> {
  // The prompt and the answer share num_ctx; past it the runtime shifts the oldest context out. Since
  // SP-583 the fit judge's retry (7,000) fits as well, so EVERY call is held to this, retries included.
  if (!fitsContext(system.length + user.length, options.num_predict, options.num_ctx)) {
    refuse(`the ${site} prompt (${system.length + user.length} chars, ~${Math.ceil((system.length + user.length) / 3)} tokens at 3 chars each) plus num_predict ${options.num_predict} may not fit num_ctx ${options.num_ctx}; nothing was sent`);
  }
  const callSite = `need-wording:${site}`;
  let served = "";
  const t0 = performance.now();
  callsMade++;
  try {
    const content = await callOllamaJson(OLLAMA, model, system, user, 600_000, options, (m) => { served = m; });
    timings.push({ site, seconds: (performance.now() - t0) / 1000, attempt, answered: true });
    if (await ledgerLocalCall({ companyId: COMPANY, callSite, model: served || model, system, user, attempt })) rowsWritten++;
    return content;
  } catch (e) {
    // SP-570: a call that threw is ledgered under the model that was REQUESTED, and marked.
    timings.push({ site, seconds: (performance.now() - t0) / 1000, attempt, answered: false });
    const row = noResponseLedgerRow({ callSite, requestedModel: model });
    if (await ledgerLocalCall({ companyId: COMPANY, callSite: row.callSite, model: row.usage.model, system, user, attempt })) rowsWritten++;
    throw e;
  }
}

function reconcileLedger(): void {
  say(`\nSP-518 ledger: ${callsMade} model call(s) made · ${rowsWritten} model_calls row(s) written · difference ${callsMade - rowsWritten}`);
  if (callsMade !== rowsWritten) { console.error("FAILED: a model call went unledgered (SP-518)"); Deno.exitCode = 1; }
}

// ── stage 1: the generator ───────────────────────────────────────────────────────────────────────
type Attempt = { attempt: number; why: string; user_md5: string; raw: string; statement: string; form: FormCheck | null; and: boolean; context: boolean; account: WordingAccount | null; error?: string };
type GenResult = {
  name: string; arm: number; temperature: number; seed: number; user_md5: string; system_md5: string;
  attempts: Attempt[];
  statement: string; form: FormCheck | null; has_and: boolean; has_context: boolean; account: WordingAccount | null; wording: GeneratedWording | null;
  /** SP-588: the failures the ONE combined form re-ask named, or "" when none was sent */
  form_reask: string; account_reask: string; dropped: string;
};
let RUNS: GenRun[] = [];
try { RUNS = parseRuns(arg("runs", "0:42")); } catch (e) { refuse(String(e instanceof Error ? e.message : e)); }

/** One run: the ask, then at most ONE form re-ask naming every failure (SP-588), then at most ONE
 *  account re-ask. Only a form gate can cost the candidate; "and", the context and the account never do. */
async function runCandidate(name: string, arm: number, run: GenRun, user: string): Promise<GenResult> {
  const res: GenResult = {
    name, arm, temperature: run.temperature, seed: run.seed, user_md5: await md5OfText(user), system_md5: await md5OfText(WORDING_GENERATOR_SYSTEM),
    attempts: [], statement: "", form: null, has_and: false, has_context: false, account: null, wording: null, form_reask: "", account_reask: "", dropped: "",
  };
  // SP-589: temperature and seed are the run's; every other option is as built.
  const opts = { temperature: run.temperature, seed: run.seed, num_predict: PATTERN_NUM_PREDICT, num_ctx: FIT_NUM_CTX, think: false, keep_alive: 0 };
  const ask = async (u: string, why: string) => {
    const a: Attempt = { attempt: res.attempts.length + 1, why, user_md5: await md5OfText(u), raw: "", statement: "", form: null, and: false, context: false, account: null };
    res.attempts.push(a);
    try {
      a.raw = await modelCall("generator", LOCAL_PATTERN_GENERATOR, WORDING_GENERATOR_SYSTEM, u, opts, a.attempt);
      const w = parseWording(a.raw);
      a.statement = w.statement; a.form = checkForm(w.statement); a.and = containsAnd(w.statement); a.context = hasContext(w.statement);
      a.account = accountForWording(labels.keys(), w);
      return w;
    } catch (e) { a.error = String(e instanceof Error ? e.message : e); return null; }
  };

  let w = await ask(user, "first ask");
  let asked = user;   // the prompt that produced the answer now standing
  if (!w) { res.dropped = `no readable answer: ${res.attempts.at(-1)?.error ?? "unknown"}`; return res; }
  const failures = formFailures(w.statement);
  if (failures.length) {
    res.form_reask = failures.map((f) => `${f.kind}: ${f.failure}`).join(" · ");
    const reask = buildCombinedReask(user, failures);
    await writeOut(`prompt-${name.replaceAll(" ", "-")}.form-reask.user.txt`, reask);
    const again = await ask(reask, `SP-588 form re-ask — ${res.form_reask}`);
    if (again) { w = again; asked = reask; }   // an unreadable re-ask leaves the first answer standing, reported as it is
  }
  const acct = accountForWording(labels.keys(), w);
  if (!acct.ok) {
    const detail = accountDetail(acct);
    res.account_reask = detail.replaceAll("\n", " · ");
    const again = await ask(buildAccountReask(asked, detail), `account re-ask — ${res.account_reask}`);
    // The account re-ask is about the account. Its answer stands only when it kept the statement it was
    // asked to keep; a different sentence here has been through no form check and no form re-ask, so the
    // earlier answer stays, with its incomplete account reported as it is.
    if (again && statementKey(again.statement) === statementKey(w.statement)) w = again;
    else if (again) res.account_reask += ` · THE RE-ASK CHANGED THE STATEMENT to ${JSON.stringify(again.statement)}; the earlier answer stands`;
  }
  res.wording = w; res.statement = w.statement; res.form = checkForm(w.statement);
  res.has_and = containsAnd(w.statement); res.has_context = hasContext(w.statement); res.account = accountForWording(labels.keys(), w);
  if (res.form.failed) res.dropped = `form gate "${res.form.failed}" failed after the re-ask: ${gateFailureText(res.form, w.statement)}`;
  return res;
}

const gatesLine = (f: FormCheck) => `direction ${f.gates.direction ? "pass" : "FAIL"} · 8 to 18 words ${f.gates.length ? "pass" : "FAIL"} · one sentence ${f.gates.one_sentence ? "pass" : "FAIL"}`;
function printCandidate(r: GenResult): void {
  say(`\n── ${r.name.toUpperCase()} ─ arm ${r.arm} · temperature ${r.temperature} · seed ${r.seed} · user prompt md5 ${r.user_md5} · system md5 ${r.system_md5}`);
  for (const a of r.attempts) {
    say(`  attempt ${a.attempt} (${a.why}): ${a.error ? `ERROR ${a.error}` : JSON.stringify(a.statement)}`);
    if (a.form) say(`      ${a.form.words} words · ${gatesLine(a.form)} · "and" ${a.and ? "YES" : "no"} · context ${a.context ? "yes" : "NO"} · account ${a.account?.ok ? "complete" : "INCOMPLETE"}`);
  }
  if (!r.wording || !r.form || !r.account) { say(`  DROPPED: ${r.dropped}`); return; }
  say(`  FINAL statement: ${r.statement}`);
  say(`  words: ${r.form.words}`);
  say(`  gates: ${gatesLine(r.form)}`);
  say(`  analyzeOutcomeQuality (printed, never a gate): weak=${r.form.quality.weak} issues=[${r.form.quality.issues.join(", ")}]`);
  say(`  SP-581 contains "and" (printed and re-asked, never a gate): ${r.has_and ? "YES" : "no"}`);
  say(`  SP-587 carries a context (printed and re-asked, never a gate): ${r.has_context ? "yes" : "NO"}`);
  say(`  covers: ${r.account.covered} — ${r.wording.covers.join(" ")}`);
  say(`  left_over: ${r.account.leftOver}`);
  for (const l of r.wording.leftOver) say(`    ${l.label} ${(labels.get(l.label)?.signalId ?? "????????").slice(0, 8)}: ${l.why}`);
  say(`  account: ${r.account.ok ? "complete" : "INCOMPLETE"} — neither [${r.account.missing.join(" ")}] · both [${r.account.both.join(" ")}] · twice [${r.account.twice.join(" ")}] · invented [${r.account.invented.join(" ")}] · no reason [${r.account.noReason.join(" ")}]`);
  say(`  form re-ask (SP-588): ${r.form_reask || "none"}`);
  say(`  account re-ask: ${r.account_reask || "none"}`);
  if (r.dropped) say(`  DROPPED: ${r.dropped}`);
}

type Candidate = { name: string; role: "candidate"; statement: string };
type ToJudge = { name: string; statement: string; runs: string[]; and: boolean; context: boolean };
let candidates: Candidate[] = [];
if (arg("candidates-from")) {
  const prior = JSON.parse(await Deno.readTextFile(arg("candidates-from"))) as { need_id: string; to_judge: ToJudge[] };
  if (prior.need_id !== NEED_ID) refuse(`--candidates-from is for need ${prior.need_id}, not ${NEED_ID}`);
  candidates = prior.to_judge.map((c) => ({ name: c.name, role: "candidate" as const, statement: c.statement }));
  say(`candidates from ${arg("candidates-from")}: ${candidates.map((c) => `${c.name} = ${JSON.stringify(c.statement)}`).join(" · ")}`);
} else {
  const results: GenResult[] = [];
  for (const arm of ARMS) {
    const user = buildWordingUser(labels, arm === 2 ? notes : undefined);
    await writeOut(`prompt-arm${arm}.user.txt`, user);
    for (const run of RUNS) {
      const name = `${ARMS.length > 1 ? `arm ${arm} ` : ""}run t${run.temperature} s${run.seed}`;
      const r = await runCandidate(name, arm, run, user);
      results.push(r); printCandidate(r);
    }
  }
  // brief 12 step 5: which distinct final statements are judged
  const measured: string[] = arg("already-measured") ? JSON.parse(await Deno.readTextFile(arg("already-measured"))) : [];
  const d = distinctToJudge(results.map((r) => ({ run: r.name, statement: r.statement, gateFailed: r.dropped })), measured);
  const toJudge: ToJudge[] = d.judge.map((j, i) => ({ name: `new ${i + 1}`, ...j }));
  say(`\ndistinct final statements: ${toJudge.length} to judge · ${d.droppedGate.length} run(s) dropped on a form gate · ${d.droppedMeasured.length} run(s) identical to a wording already measured`);
  for (const j of toJudge) say(`  ${j.name}: ${j.statement}\n      from ${j.runs.join(", ")} · "and" ${j.and ? "YES" : "no"} · context ${j.context ? "yes" : "NO"}`);
  for (const x of d.droppedGate) say(`  DROPPED (form gate): ${x.run}: ${JSON.stringify(x.statement)} — ${x.gateFailed}`);
  for (const x of d.droppedMeasured) say(`  NOT JUDGED AGAIN (identical to a wording already measured): ${x.run}: ${JSON.stringify(x.statement)}`);
  await writeOut("wording-gen.json", JSON.stringify({
    company: COMPANY, need_id: NEED_ID, quotes: needQuotes.length, labels: Object.fromEntries([...labels].map(([l, x]) => [l, x.signalId])),
    model: LOCAL_PATTERN_GENERATOR, runs: RUNS, options_as_built: { num_predict: PATTERN_NUM_PREDICT, num_ctx: FIT_NUM_CTX, think: false, keep_alive: 0 },
    candidates: results, to_judge: toJudge, dropped_gate: d.droppedGate, dropped_measured: d.droppedMeasured, timings,
  }, null, 2));
  candidates = toJudge.map((c) => ({ name: c.name, role: "candidate" as const, statement: c.statement }));
}

if (flag("gen-only")) {
  say("\n--gen-only (SP-573): stage 1 ends here. No fit judge call was made.");
  reconcileLedger();
  await flushLog();
  Deno.exit(Deno.exitCode ?? 0);
}

// ── stage 2: the fit judge ───────────────────────────────────────────────────────────────────────
const wordings: FitWording[] = flag("no-baseline") ? [] : [{ name: "baseline", role: "baseline", text: need.desired_outcome }];
for (const c of candidates) {
  const same = wordings.find((w) => statementKey(w.text) === statementKey(c.statement));
  if (same) { say(`${c.name} is the same statement as ${same.name}; judged once`); continue; }
  wordings.push({ name: c.name, role: c.role, text: c.statement });
}
if (!wordings.length) refuse("there is no wording to judge");
if (arg("control-need-id")) wordings.push({ name: "control", role: "control", text: (await needOf(arg("control-need-id"))).desired_outcome });

const known = (file: string, ids: string[]) => {
  const unknown = ids.filter((id) => !quoteText.has(id));
  if (unknown.length) refuse(`${file}: no stored quote for ${unknown.join(", ")}`);
  return ids;
};
const sets: FitSet[] = [{ name: "need", signalIds: needQuotes.map((x) => x.signalId), withControl: true }];
if (arg("extra-quotes")) {
  const j = JSON.parse(await Deno.readTextFile(arg("extra-quotes"))) as Record<string, string[]>;
  for (const [name, ids] of Object.entries(j)) sets.push({ name, signalIds: known(arg("extra-quotes"), ids), withControl: true });
}
if (arg("specificity")) {
  const j = JSON.parse(await Deno.readTextFile(arg("specificity"))) as { signal_ids: string[] };
  sets.push({ name: "specificity", signalIds: known(arg("specificity"), j.signal_ids), withControl: false });
}

type FitRow = {
  set: string; wording: string; role: string; signal_id: string;
  fits: boolean; kind: string; span: string; reason: string;
  rejected: FitVerdict["rejected"] | "empty_twice" | "call_failed";
  /** the verdict came from the ONE retry at the larger budget (SP-556 / SP-583) */
  retried: boolean;
  /** SP-586: this row reuses the verdict of the named set — no call was made for it */
  reused_from: string | null;
  seconds: number;
};
const plan = planFitPairs(wordings, sets);
const fitRows: FitRow[] = [];
const verdictOf = new Map<string, FitRow>();
const pairKey = (wording: string, signalId: string) => `${wording}\u0000${signalId}`;
const JSONL = `${OUT}/fit-pairs.jsonl`;
const wordingsMd5 = await md5OfText(JSON.stringify(wordings) + (await md5OfText(FIT_JUDGE_SYSTEM)));
if (flag("resume")) {
  let text = "";
  try { text = await Deno.readTextFile(JSONL); } catch { /* nothing to resume */ }
  for (const line of text.split("\n").filter(Boolean)) {
    const r = JSON.parse(line) as FitRow & { wordings_md5: string };
    if (r.wordings_md5 !== wordingsMd5) refuse(`${JSONL} was written for other wordings or another fit prompt; it cannot be resumed`);
    verdictOf.set(pairKey(r.wording, r.signal_id), r);
  }
  say(`--resume: ${verdictOf.size} verdict(s) already in ${JSONL}`);
} else {
  try { await Deno.stat(JSONL); refuse(`${JSONL} exists; pass --resume to continue it or choose another --out`); } catch (e) { if (!(e instanceof Deno.errors.NotFound)) throw e; }
}

const toCall = plan.filter((p) => !p.reuseOf && !verdictOf.has(pairKey(p.wording, p.signalId))).length;
say(`\nstage 2: ${wordings.length} wording(s), fit judge ${LOCAL_PATTERN_JUDGE} think ${PATTERN_JUDGE_THINK} · temperature 0 · seed 42 · num_ctx ${FIT_NUM_CTX} · num_predict ${FIT_NUM_PREDICT}, one retry at ${FIT_NUM_PREDICT_RETRY} · system md5 ${await md5OfText(FIT_JUDGE_SYSTEM)}`);
for (const w of wordings) say(`  ${w.name.padEnd(10)} ${w.text}`);
for (const s of sets) {
  const rows = plan.filter((p) => p.set === s.name);
  say(`  set ${s.name.padEnd(16)} ${String(s.signalIds.length).padStart(3)} quote(s) × ${s.withControl ? wordings.length : wordings.filter((w) => w.role !== "control").length} wording(s) = ${String(rows.length).padStart(3)} row(s), ${rows.filter((r) => r.reuseOf).length} reused (SP-586)`);
}
say(`  ${plan.length} row(s) · ${plan.filter((p) => !p.reuseOf).length} distinct (wording, quote) pair(s) · ${toCall} still to judge`);

let firstAttempts = 0, firstEmpties = 0, stopWhy = "";
const stage2T0 = performance.now();
async function judgePair(w: FitWording, signalId: string): Promise<Omit<FitRow, "set" | "reused_from">> {
  const quote = quoteText.get(signalId)!;
  const user = buildFitUser(w.text, quote);
  let retried = false;
  const t0 = performance.now();
  const base = { wording: w.name, role: w.role, signal_id: signalId };
  try {
    const content = await callJudgeWithEmptyRetry({
      system: FIT_JUDGE_SYSTEM, user, first: FIT_NUM_PREDICT, retry: FIT_NUM_PREDICT_RETRY,
      call: (sys, usr, np) => modelCall("fit-judge", LOCAL_PATTERN_JUDGE, sys, usr,
        { temperature: 0, seed: 42, num_predict: np, num_ctx: FIT_NUM_CTX, think: PATTERN_JUDGE_THINK }, np === FIT_NUM_PREDICT ? 1 : 2),
      onEmpty: () => { retried = true; },
    });
    firstAttempts++; if (retried) firstEmpties++;
    return { ...base, ...parseFit(content, quote), retried, seconds: (performance.now() - t0) / 1000 };
  } catch (e) {
    firstAttempts++; if (isEmptyAnswerError(e)) firstEmpties++;
    return { ...base, fits: false, kind: "", span: "", reason: String(e instanceof Error ? e.message : e),
      rejected: isEmptyAnswerError(e) ? "empty_twice" : "call_failed", retried: isEmptyAnswerError(e), seconds: (performance.now() - t0) / 1000 };
  }
}

for (const p of plan) {
  const w = wordings.find((x) => x.name === p.wording)!;
  const key = pairKey(p.wording, p.signalId);
  let v = verdictOf.get(key);
  let made = false;
  if (!v) {
    const r = await judgePair(w, p.signalId);
    v = { ...r, set: p.set, reused_from: null };
    verdictOf.set(key, v);
    await Deno.writeTextFile(JSONL, JSON.stringify({ ...v, wordings_md5: wordingsMd5 }) + "\n", { append: true });
    made = true;
  }
  const row: FitRow = { ...v, set: p.set, reused_from: p.reuseOf ?? (made || v.set === p.set ? null : v.set) };
  fitRows.push(row);
  say(`  ${String(fitRows.length).padStart(3)}/${plan.length} ${p.set.padEnd(16)} ${p.wording.padEnd(10)} ${p.signalId.slice(0, 8)}  ${row.fits ? `FITS ${row.kind}` : `no (${row.rejected})`}${row.retried ? "  [retried]" : ""}${row.reused_from ? `  [reused from ${row.reused_from}]` : made ? `  ${row.seconds.toFixed(0)}s` : "  [resumed]"}`);
  if (made && firstAttempts === 12) {
    const secs = timings.filter((t) => t.site === "fit-judge").map((t) => t.seconds);
    const perPair = (performance.now() - stage2T0) / 1000 / 12;
    const left = plan.filter((x) => !x.reuseOf).length - verdictOf.size;
    say(`\nSMOKE (first 12 fit calls): ${secs.length} model call(s), ${(secs.reduce((a, b) => a + b, 0) / secs.length).toFixed(1)}s per call (min ${Math.min(...secs).toFixed(0)}s, max ${Math.max(...secs).toFixed(0)}s) · ${perPair.toFixed(1)}s per pair, retries included · ${firstEmpties} of 12 empty on the first attempt`);
    say(`SMOKE revised estimate: ${left} pair(s) left × ${perPair.toFixed(1)}s = ${(left * perPair / 60).toFixed(0)} min more\n`);
    await flushLog();
  }
  if (made) { stopWhy = emptyStop(firstAttempts, firstEmpties) ?? ""; if (stopWhy) break; }
  if (made && fitRows.length % 10 === 0) await flushLog();
}

// ── what the run produced ────────────────────────────────────────────────────────────────────────
if (stopWhy) say(`\nSTOPPED: ${stopWhy}. ${fitRows.length} of ${plan.length} row(s) were reached; pass --resume to continue from them.`);
say(`\nrows: ${fitRows.length} of ${plan.length} planned · model calls for them: ${timings.filter((t) => t.site === "fit-judge").length} this run · first attempts ${firstAttempts}, empty ${firstEmpties}`);
for (const s of sets) {
  say(`\nset ${s.name} (${s.signalIds.length} quote(s))`);
  for (const w of wordings) {
    const rows = fitRows.filter((r) => r.set === s.name && r.wording === w.name);
    if (!rows.length) continue;
    const n = (f: (r: FitRow) => boolean) => rows.filter(f).length;
    say(`  ${w.name.padEnd(10)} rows ${rows.length} · FITS ${n((r) => r.fits)} (barrier ${n((r) => r.fits && r.kind === "barrier")}, help ${n((r) => r.fits && r.kind === "help")}, both ${n((r) => r.fits && r.kind === "both")})` +
      ` · not ${n((r) => !r.fits)} (answered false ${n((r) => r.rejected === "answered_false")}, kind invalid ${n((r) => r.rejected === "kind_invalid")}, span missing ${n((r) => r.rejected === "span_missing")}, span not verbatim ${n((r) => r.rejected === "span_not_verbatim")}, unreadable ${n((r) => r.rejected === "unreadable")}, empty twice ${n((r) => r.rejected === "empty_twice")}, call failed ${n((r) => r.rejected === "call_failed")})` +
      ` · from a retry ${n((r) => r.retried && r.rejected !== "empty_twice")} · reused ${n((r) => !!r.reused_from)}`);
  }
}

await writeOut("fit-pairs.json", JSON.stringify({
  company: COMPANY, need_id: NEED_ID, model: LOCAL_PATTERN_JUDGE, think: PATTERN_JUDGE_THINK, temperature: 0, seed: 42,
  num_ctx: FIT_NUM_CTX, num_predict: FIT_NUM_PREDICT, num_predict_retry: FIT_NUM_PREDICT_RETRY, system_md5: await md5OfText(FIT_JUDGE_SYSTEM),
  wordings, sets, planned_rows: plan.length, stopped: stopWhy, pairs: fitRows, timings,
}, null, 2));

const cell = (set: string, w: FitWording, id: string) => { const r = fitRows.find((x) => x.set === set && x.wording === w.name && x.signal_id === id); return !r ? "—" : `${r.fits ? "yes" : "no"}${r.retried ? "*" : ""}`; };
await writeOut("fit-table.md", [
  "# Fit table", "", ...wordings.map((w) => `- **${w.name}** (${w.role}): ${w.text}`), "", "`*` marks a verdict that came from the retry, or a pair that was empty twice.", "",
  ...sets.flatMap((s) => {
    const ws = wordings.filter((w) => s.withControl || w.role !== "control");
    return [`## ${s.name}`, "", `| quote | ${ws.map((w) => w.name).join(" | ")} |`, `|---|${ws.map(() => "---").join("|")}|`,
      ...s.signalIds.map((id) => `| \`${id.slice(0, 8)}\` | ${ws.map((w) => cell(s.name, w, id)).join(" | ")} |`),
      `| **fits** | ${ws.map((w) => `**${fitRows.filter((x) => x.set === s.name && x.wording === w.name && x.fits).length} of ${s.signalIds.length}**`).join(" | ")} |`, ""];
  }),
].join("\n"));

reconcileLedger();
await flushLog();
if (stopWhy) Deno.exit(3);
