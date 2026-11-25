// ── SP-527(B): RE-JUDGE THE DISAGREEMENT SET UNDER THE TIGHTENED INSTRUCTION ─────────────────────
//
// MEASUREMENT ONLY. It writes no pattern, part or verdict row; it reads the SP-522 shadow JSON of a
// dry run and re-asks the JUDGE OF RECORD (llama3:70b) the same (quote, parts) questions under
// JUDGE_SYSTEM_TIGHTENED. The live judge prompt is untouched by this file existing.
//
// SCOPE (--scope). `disagree` re-judges only the (pattern, quote) groups carrying a pair the two
// judges read differently: that was right for cure B, which is a claim ABOUT those pairs, and it
// avoided ~80 min re-confirming 201 agreements. But it CANNOT separate arms on a pair both judges
// already kept — brief 3 measured that ceiling: 16 of live's 34 P1 keeps are agreed, credited to
// every arm, unreachable by any cure. SP-534 therefore asks for `all`: every pair under every part.
//
// SP-537(c): the arm's verdict is printed and written under ITS OWN NAME, never a fixed "cure B" /
// "tightened" label. Brief 3's files carry `tightened` for all three arms and a column header that
// says "cure B" whichever arm ran; those files are left as they are and new ones are written here.
//
// SP-518: every call writes a model_calls row, in a finally, local price $0 — that 0 is the record.
//
//   deno run -A scripts/sp527-disagreement-recheck.ts --shadow=<path> \
//     [--system=live|tightened|bprime1|bprime2|curec] [--scope=disagree|all] [--json=<path>]
import { armColumnIsIdentical, JUDGE_NUM_PREDICT, JUDGE_NUM_PREDICT_RETRY, PATTERN_JUDGE_THINK, callJudgeWithEmptyRetry, isEmptyAnswerError, JUDGE_SYSTEM_BPRIME1, JUDGE_SYSTEM_BPRIME2, JUDGE_SYSTEM_CUREC, JUDGE_SYSTEM_PRE545, JUDGE_SYSTEM_TIGHTENED, judgeAWithReask, type PatternQuote } from "../supabase/functions/_shared/needPatterns.ts";
import { callOllamaJson } from "../supabase/functions/_shared/claimDeltaSynthesis.ts";
import { LOCAL_PATTERN_JUDGE } from "../src/lib/modelRouter/resolveModel.ts";
import { ledgerLocalCall } from "./ledgerShim.ts";

const OLLAMA = Deno.env.get("OLLAMA_BASE_URL") ?? "http://127.0.0.1:11434/v1";
const arg = (n: string, d = "") => Deno.args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const SHADOW = arg("shadow");
const SYSTEM_MODE = arg("system", "tightened");
const CORPUS = arg("corpus", "/Users/fomomojodojo/dev/_diagnose-shots/2026-11-18/charter-need-labels-full.json");
// SP-555: the pattern judge of record. Re-judging an OLD llama3 shadow with it is now the normal
// direction of this instrument, which is why --allow-other-model exists.
const JUDGE_MODEL = arg("judge-model", LOCAL_PATTERN_JUDGE);
/** SP-554 (2026-11-22): THE THINKING JUDGE, MEASUREMENT ONLY — the same two knobs the runner and the
 *  other two instruments carry. SP-517: thinking on a judge-sized budget spends the whole allowance on
 *  `message.thinking` and returns an EMPTY `content`, so `think` and the budget move together. An
 *  invocation passing neither flag is unchanged: `think:false` at JUDGE_NUM_PREDICT. */
// SP-555: thinking ON by default; --judge-no-think is the way back for a comparison arm.
const JUDGE_THINK = Deno.args.includes("--judge-no-think") ? false : PATTERN_JUDGE_THINK;
const JUDGE_NUM_PREDICT_ARG = arg("judge-num-predict", "");
const JUDGE_NP = JUDGE_NUM_PREDICT_ARG ? Number(JUDGE_NUM_PREDICT_ARG) : JUDGE_NUM_PREDICT;
if (!Number.isFinite(JUDGE_NP) || JUDGE_NP <= 0) {
  console.error(`REFUSED: --judge-num-predict must be a positive integer; got ${JSON.stringify(JUDGE_NUM_PREDICT_ARG)}`);
  Deno.exit(1);
}
if (!SHADOW) { console.error("REFUSED: --shadow=<path to the SP-522 shadow JSON> is required"); Deno.exit(1); }
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
const SYSTEM_OVERRIDE = SYSTEM_BY_MODE[SYSTEM_MODE];
const SCOPE = arg("scope", "disagree");
if (SCOPE !== "disagree" && SCOPE !== "all") {
  console.error(`REFUSED: --scope must be "disagree" or "all" — not ${JSON.stringify(SCOPE)}`);
  Deno.exit(1);
}
/** SP-537(c): the arm names its own column and its own JSON key. */
/** SP-537(c): the arm is written under ITS OWN NAME. SP-554 adds a second axis — the MODEL and whether
 *  it was thinking — so an arm name of the prompt alone would file the thinking judge's verdicts under
 *  the same key as the judge of record's. */
const ARM = JUDGE_THINK ? `${SYSTEM_MODE}-${JUDGE_MODEL.replace(/[^a-z0-9]+/gi, "")}-think` : SYSTEM_MODE;
// SP-558, FOUND PROVING THE GUARD (2026-11-22): a run whose ARM key is the LIVE key, with the live
// model and the live prompt, is the judge of record re-judging itself at temperature 0 — it
// reproduces its own verdicts, so the arm column is identical BY CONSTRUCTION and the guard below
// fires on a run that was never a comparison. That is a REFUSAL, not a guard failure: nothing was
// measured, so there is nothing to report. (The same invocation with a different model or `--system`
// is a real arm and is allowed.)
if (ARM === "live" && JUDGE_MODEL === LOCAL_PATTERN_JUDGE && SYSTEM_MODE === "live" && !JUDGE_THINK) {
  console.error("REFUSED: this would re-judge the pairs with the judge of record's own model, prompt and call shape.");
  console.error("  At temperature 0 that reproduces the stored verdicts, so the arm column can only be a copy of the");
  console.error("  live one. Name an arm: a different --judge-model, a different --system, or the thinking call shape.");
  Deno.exit(1);
}

type Pair = {
  need: string; pattern: string; signal_id: string; quote: string; ordinal: number; part: string;
  /** SP-537(b): present in files written by the fixed runner; absent in run 2's. */
  pattern_identity?: string;
  judge_of_record: { states: boolean; span: string; reason: string; rejected: string };
  shadow: { model: string; states: boolean | null; span: string; reason: string; error: string };
};
const shadow = JSON.parse(await Deno.readTextFile(SHADOW)) as
  { company: string; judge_of_record: string; shadow_model: string; pairs: Pair[] };
const COMPANY = shadow.company;
// The guard below was written for a PROMPT arm: cure B is a change to the judge of record's
// instruction, so re-judging its pairs with a different MODEL would have measured two things at once
// and called the result the prompt's. SP-554 (2026-11-22) asks for exactly the case it forbids — a
// different model, think ON, on the same pairs, MEASUREMENT ONLY — so the door is opened by an
// explicit flag rather than by weakening the check. `--allow-other-model` has to be typed, the arm
// name already carries the model and the thinking flag (see ARM above), and the line below says in
// the output that this is not the judge of record.
const ALLOW_OTHER_MODEL = Deno.args.includes("--allow-other-model");
if (shadow.judge_of_record !== JUDGE_MODEL && !ALLOW_OTHER_MODEL) {
  console.error(`REFUSED: this shadow's judge of record is ${shadow.judge_of_record}, not ${JUDGE_MODEL} — a prompt arm must re-judge with the SAME model, or pass --allow-other-model to measure a DIFFERENT judge (SP-554)`);
  Deno.exit(1);
}
if (shadow.judge_of_record !== JUDGE_MODEL) {
  console.log(`SP-554: re-judging ${shadow.judge_of_record}'s pairs with ${JUDGE_MODEL} — A DIFFERENT JUDGE, measurement only. The judge of record is unchanged.`);
}

const corpus = JSON.parse(await Deno.readTextFile(CORPUS)) as { needs: Record<string, string> };

// ── TWO PATTERNS CAN SHARE A CLAIM, so (need, pattern) IS NOT A PATTERN KEY ─────────────────────
// SP-509 put the parts inside `patternIdentity`, so "two patterns with the same claim and different
// parts are different patterns" — and this run's N15 did exactly that, writing "Unexpected charges
// appear on bills without clear communication" twice with one part each. Keying on (need, pattern)
// merges them, which judges the WRONG part for one of the two and double-counts their quotes. The
// shadow JSON carries no pattern identity, so the split is reconstructed and ASSERTED, never assumed.
// SP-537(b): when the file CARRIES the identity, use it and reconstruct nothing. Reconstruction stays
// for run 2's file, which predates the fix.
const HAS_IDENTITY = shadow.pairs.length > 0 && shadow.pairs.every((p) => typeof p.pattern_identity === "string" && p.pattern_identity.length > 0);
if (HAS_IDENTITY) console.log(`note: this file carries pattern_identity per pair (SP-537b) — identities are READ, not reconstructed`);
const ordParts = new Map<string, Map<number, Set<string>>>();
for (const p of shadow.pairs) {
  const k = `${p.need}\u0000${p.pattern}`;
  const m = ordParts.get(k) ?? ordParts.set(k, new Map()).get(k)!;
  (m.get(p.ordinal) ?? m.set(p.ordinal, new Set()).get(p.ordinal)!).add(p.part);
}
/** the pattern key's third component: "" when the claim identifies one pattern, else the part itself. */
const splitBy = new Map<string, boolean>();
for (const [k, m] of ordParts) {
  if (HAS_IDENTITY) { splitBy.set(k, false); continue; }
  const collides = [...m.values()].some((s) => s.size > 1);
  if (!collides) { splitBy.set(k, false); continue; }
  // Only the single-part case can be reconstructed unambiguously: every pair at ordinal 1, so each
  // distinct part IS a pattern. Anything else and the JSON cannot say which part belongs with which.
  if (![...m.keys()].every((o) => o === 1)) {
    console.error(`REFUSED: ${k.split("\u0000")[0]} has two patterns sharing the claim ${JSON.stringify(k.split("\u0000")[1])} with MORE THAN ONE part each.`);
    console.error("  This shadow JSON carries no pattern identity, so their part-sets cannot be recovered.");
    console.error("  Fix run-need-patterns.ts to emit pattern_identity per pair and re-run the shadow.");
    Deno.exit(1);
  }
  splitBy.set(k, true);
  console.log(`note: ${k.split("\u0000")[0]} writes the claim ${JSON.stringify(k.split("\u0000")[1].slice(0, 46))} ${m.get(1)!.size} times — split by part`);
}
const patKey = (p: Pair) =>
  HAS_IDENTITY
    ? `${p.need}\u0000${p.pattern}\u0000${p.pattern_identity}`
    : `${p.need}\u0000${p.pattern}\u0000${splitBy.get(`${p.need}\u0000${p.pattern}`) ? p.part : ""}`;

// the full parts list per PATTERN, by ordinal
const partsOf = new Map<string, string[]>();
for (const p of shadow.pairs) {
  const k = patKey(p);
  const arr = partsOf.get(k) ?? partsOf.set(k, []).get(k)!;
  arr[p.ordinal - 1] = p.part;
}
// every (pattern, quote) that carries at least one DISAGREEING pair
const groups = new Map<string, Pair[]>();
for (const p of shadow.pairs) {
  const k = `${patKey(p)}\u0000${p.signal_id}`;
  (groups.get(k) ?? groups.set(k, []).get(k)!).push(p);
}
const disagreeing = (p: Pair) =>
  !p.shadow.error && p.shadow.states !== null && p.judge_of_record.states !== p.shadow.states;
const selected = [...groups.entries()]
  .filter(([, ps]) => SCOPE === "all" || ps.some(disagreeing))
  .sort((a, b) => a[0].localeCompare(b[0]));
// SP-532: a run that selects nothing is a FAILURE, not an empty pass.
if (selected.length === 0) {
  console.error(`REFUSED (SP-532): scope=${SCOPE} selected ZERO (pattern, quote) group(s) — nothing was re-judged, and "0 of 0" would read as a bar held.`);
  Deno.exit(1);
}

console.log(`RE-JUDGE — ${JUDGE_MODEL}, system=${SYSTEM_MODE}, arm=${ARM}, scope=${SCOPE}, temperature 0, seed 42, num_predict ${JUDGE_NP}, think ${JUDGE_THINK}`);
console.log(`shadow: ${SHADOW}`);
console.log(`${selected.length} (pattern, quote) group(s) of ${groups.size} · ${shadow.pairs.filter(disagreeing).length} disagreeing pair(s) in the file\n`);

type Verdict = { states: boolean; span: string; reason: string; rejected: string };
type Out = Pair & { pattern_identity: string; pattern_identity_key: string; [arm: string]: unknown };
const out: Out[] = [];
let calls = 0, ledgered = 0, failedCalls = 0, reasks = 0, recovered = 0, failedTwice = 0, unreadable = 0, seconds = 0;
// SP-556: both counts, reported whatever they are.
let emptyFirst = 0, emptyRecovered = 0;
const emptyFailed: string[] = [];
for (const [k, ps] of selected) {
  const [need, pattern, split, signalId] = k.split("\u0000");
  const parts = partsOf.get(`${need}\u0000${pattern}\u0000${split}`)!;
  const needStatement = corpus.needs[need];
  if (!needStatement) { console.error(`REFUSED: no need statement for ${need} in the corpus file`); Deno.exit(1); }
  const qt: PatternQuote = { signalId, quote: ps[0].quote, site: "", eventDate: null, brand: "", polarity: null };
  const t0 = performance.now();
  let res;
  try {
    res = await judgeAWithReask({
      needStatement, name: pattern, parts, quote: qt, system: SYSTEM_OVERRIDE,
      // SP-556: the one retry an empty answer earns, around the identical call.
      call: (system, user) => callJudgeWithEmptyRetry({
        system, user, first: JUDGE_NP, retry: JUDGE_NUM_PREDICT_RETRY,
        onEmpty: ({ recovered: rec }) => {
          emptyFirst++;
          if (rec) emptyRecovered++; else emptyFailed.push(`${need} ${signalId.slice(0, 8)}`);
        },
        call: async (sys, usr, np) => {
        calls++;
        try {
          return await callOllamaJson(OLLAMA, JUDGE_MODEL, sys, usr, 600_000,
            { temperature: 0, seed: 42, num_predict: np, think: JUDGE_THINK });
        } catch (e) { failedCalls++; throw e; } finally {
          ledgered += await ledgerLocalCall({ companyId: COMPANY, callSite: "sp527-disagreement-recheck:judge", model: JUDGE_MODEL, system: sys, user: usr }) ? 1 : 0;
        }
        },
      }),
    });
  } catch (e) {
    // SP-556: empty twice is its own fault, already named by onEmpty, and fails this group closed.
    if (isEmptyAnswerError(e)) { console.log(`  ${need} ${signalId.slice(0, 8)} EMPTY TWICE — failed closed (SP-556)`); continue; }
    unreadable++;
    console.log(`  ${need} ${signalId.slice(0, 8)} UNREADABLE — failed closed: ${String((e as Error).message).slice(0, 90)}`);
    continue;
  }
  seconds += (performance.now() - t0) / 1000;
  reasks += res.reasked.length; recovered += res.recovered; failedTwice += res.failedTwice;
  for (const p of ps) {
    const v = res.verdict.parts.find((x) => x.ordinal === p.ordinal);
    const verdict: Verdict = { states: !!v?.states, span: v?.span ?? "", reason: v?.reason ?? "", rejected: v?.rejected ?? "" };
    // SP-537(b/c): the arm's own key, plus the pattern identity the shadow JSON does not carry.
    // SP-558 (2026-11-22) — THE DEFECT BRIEF 7 §9c FOUND. This line overwrote `pattern_identity`
    // with the ‖-joined DISPLAY form, and `patKey()` reads that very field when the shadow carries
    // identities (`HAS_IDENTITY`). So the join in the support table below could never match, `rej` was
    // always empty, and the arm's column fell through to the judge of record's — a table that read
    // "this judge changes nothing" on a run where the two judges differed on 17 of 54 patterns. The
    // display form stays where every reader of this JSON expects it; the KEY the join needs is now its
    // own field, unmutated.
    out.push({ ...p, pattern_identity: patKey(p).replace(/\u0000/g, " ‖ "), pattern_identity_key: patKey(p), [ARM]: verdict });
  }
  const line = ps.sort((a, b) => a.ordinal - b.ordinal).map((p) => {
    const v = res!.verdict.parts.find((x) => x.ordinal === p.ordinal);
    const mark = (b: boolean | null) => b === null ? "?" : b ? "Y" : "n";
    return `p${p.ordinal} live ${mark(p.judge_of_record.states)} qwen ${mark(p.shadow.error ? null : p.shadow.states)} ${ARM} ${mark(!!v?.states)}`;
  }).join(" · ");
  console.log(`  ${need} ${signalId.slice(0, 8)} ${line}   ${pattern.slice(0, 44)}`);
}

// per-pattern support under the three regimes
const byPattern = new Map<string, { live: number; A: number; B: number }>();
for (const [k, ps] of groups) {
  const [need, pattern, split] = k.split("\u0000");
  const pk = `${need}\u0000${pattern}\u0000${split}`;
  const acc = byPattern.get(pk) ?? byPattern.set(pk, { live: 0, A: 0, B: 0 }).get(pk)!;
  const live = ps.every((p) => p.judge_of_record.states);
  const a = ps.every((p) => p.judge_of_record.states && p.shadow.states === true && !p.shadow.error);
  // SP-558: joined on the UNMUTATED key, not on `patKey(o)` over a field this loop's sibling rewrote.
  const rej = out.filter((o) => o.pattern_identity_key === pk && o.signal_id === ps[0].signal_id);
  // the ARM: the re-judged verdict where we have one, the live verdict where the group was not re-judged
  const b = rej.length
    ? ps.every((p) => ((rej.find((o) => o.ordinal === p.ordinal)?.[ARM] as Verdict | undefined)?.states ?? p.judge_of_record.states))
    : live;
  if (live) acc.live++; if (a) acc.A++; if (b) acc.B++;
}
const strength = (n: number) => n <= 1 ? "too thin" : n <= 4 ? "possible failure" : n <= 9 ? "likely rule" : "confirmed rule";
console.log(`\n── support per pattern: live llama3 · "both agree" (live ∧ qwen, derived, not an arm) · ${ARM} ──`);
let tl = 0, ta = 0, tb = 0;
for (const [pk, v] of [...byPattern.entries()].sort()) {
  tl += v.live; ta += v.A; tb += v.B;
  const [need, pattern, split] = pk.split("\u0000");
  const shown = split ? `${pattern.slice(0, 30)} ‖ ${split.slice(0, 34)}` : pattern.slice(0, 66);
  console.log(`  ${need.padEnd(4)} live ${String(v.live).padStart(3)} [${strength(v.live).padEnd(16)}] · agree ${String(v.A).padStart(3)} [${strength(v.A).padEnd(16)}] · ${ARM} ${String(v.B).padStart(3)} [${strength(v.B).padEnd(16)}]  ${shown}`);
}
console.log(`\ntotal supporting links: live ${tl} · agree ${ta} · ${ARM} ${tb}`);
console.log(`SP-514: ${reasks} span re-ask(s) — ${recovered} recovered, ${failedTwice} failed twice`);
console.log(`UNREADABLE: ${unreadable} group(s) failed closed`);
console.log(`SP-556 empty answers: ${emptyFirst} first attempt(s) empty \u00b7 ${emptyRecovered} recovered at ${JUDGE_NUM_PREDICT_RETRY} \u00b7 ${emptyFailed.length} failed closed${emptyFailed.length ? ` (${emptyFailed.join(", ")})` : ""}`);
console.log(`SP-518: ${ledgered} of ${calls} call(s) ledgered (${failedCalls} failed and are ledgered anyway) · ${seconds.toFixed(1)}s judge time`);
const json = arg("json");
if (json) {
  await Deno.writeTextFile(json, JSON.stringify({
    company: COMPANY, judge: JUDGE_MODEL, system: ARM, scope: SCOPE, shadow: SHADOW,
    // SP-537(c): say which key holds this arm's verdict, so no reader has to guess.
    verdict_key: ARM, groups_selected: selected.length, groups_total: groups.size, pairs: out,
  }, null, 1));
  console.log(`wrote ${json}  (verdict_key="${ARM}")`);
}

// ── SP-558, LAST, AFTER --json IS WRITTEN ────────────────────────────────────────────────────────
// The guard exits non-zero, and the per-pair verdicts are SOUND even when the table is not, so the
// file is written first. A guard that destroyed the evidence of its own failure would cost a re-run
// of the whole judge pass to see what happened.
// SP-558: AN ARM COLUMN IDENTICAL TO THE LIVE COLUMN ON EVERY ROW FAILS THE RUN.
// Not a warning. The defect this guards against produced a table that was WRONG in the one direction
// a reader would never question — "the second judge agrees with the first everywhere" — and the
// run that printed it exited 0. A second model judging real pairs does not agree on every row; if it
// appears to, the join is broken again, and no figure printed above can be trusted.
const armRows = [...byPattern.values()].map((v) => ({ live: v.live, arm: v.B }));
if (armColumnIsIdentical(armRows)) {
  console.error(`\nguard: FAIL (SP-558) — the ${ARM} column is identical to the live column on all ${armRows.length} row(s).`);
  console.error("  A second judge does not agree with the judge of record on every pattern. This is the brief 7 §9c");
  console.error("  defect or another like it: the per-pattern join is not matching, so the arm column is a copy.");
  console.error("  The per-pair verdicts in --json are unaffected; the TABLE above is not a result.");
  Deno.exit(1);
}
console.log(`guard: PASS (SP-558) — the ${ARM} column differs from the live column on ${armRows.filter((r) => r.live !== r.arm).length} of ${armRows.length} row(s)`);
