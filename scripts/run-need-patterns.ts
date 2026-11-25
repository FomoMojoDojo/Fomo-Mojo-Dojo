// ── RUN THE PATTERN LAYER FOR A COMPANY'S BAR-MEETING NEEDS (SP-465, 2026-11-20) ─────────────────
//
// The driver. Everything that decides anything lives elsewhere, on purpose:
//   the LANE          src/lib/modelRouter/resolveModel.ts   (SP-460 lineage, SP-468 this one consumer)
//   the PROMPTS,
//   the SCHEMA bound,
//   the STRENGTH      supabase/functions/_shared/needPatterns.ts
//   the COUNTING      src/lib/needEvidenceCounting.ts       (which quotes count, and the bar)
//   the LEDGER        supabase/functions/_shared/recordModelCall.ts
//   the SPEND CAP     supabase/functions/_shared/spendCap.ts (before every PAID call)
// This file reads rows, calls the model through the router, and writes what came back.
//
// WHY A SCRIPT AND NOT AN EDGE FUNCTION. A new function directory is not served until the stack is
// recreated — an operator-approved step — and this slice's other data acts (load-need-evidence,
// materialise-proposed-needs) are scripts for the same reason. The compute is in _shared so an edge
// function can call it later without a second copy.
//
// WALL-CLOCK SECONDS ARE PRINTED FOR EVERY CALL. model_calls has no duration column and this brief
// does not add one, so the timings live in the run's own output and in the report.
//
//   deno run -A scripts/run-need-patterns.ts --needs=N13,P1 [--company=<uuid>]          # dry run
//   deno run -A scripts/run-need-patterns.ts --needs=N13,P1 --apply
//   deno run -A scripts/run-need-patterns.ts --needs=N13 --apply --tag=run2             # a re-run
//   deno run -A scripts/run-need-patterns.ts --needs=N13 --judge=b                      # SP-510 judge B
import { isCounted, siteOf } from "../src/lib/needEvidenceCounting.ts";
import { makeLedgerShim, md5OfText, modelSentFor, noResponseLedgerRow, psql, psqlJson, sqlQuote } from "./ledgerShim.ts";
import { readModelLoads, callsByLoad, loadLine } from "./ollamaLoads.ts";
import { JudgeReplay, LedgerProof, ReplayRefusal, applyNeedSql, bindingTexts, type NeedBinding } from "./judgeReplay.ts";
import { LOCAL_PATTERN_GENERATOR, LOCAL_PATTERN_JUDGE, patternRouteProvenance, resolveModel } from "../src/lib/modelRouter/resolveModel.ts";
import { callOllamaJson } from "../supabase/functions/_shared/claimDeltaSynthesis.ts";
import { crypto as stdCrypto } from "jsr:@std/crypto@1.0.3/crypto";
import { encodeHex } from "jsr:@std/encoding@1.0.5/hex";
import { companyHasClientProvidedMaterial } from "../supabase/functions/_shared/clientMaterial.ts";
import { makeRoutedModel } from "../supabase/functions/_shared/modelRouter.ts";
import { openaiRecord, recordModelCall } from "../supabase/functions/_shared/recordModelCall.ts";
import { DEFAULT_NEED_KEYS, loadNeedKeys } from "./needKeys.ts";
import { makeSpendCap, projectOpenAIUsd, assertSpendable, SPEND_CAP_CEILING_USD } from "../supabase/functions/_shared/spendCap.ts";
import {
  GENERATOR_SYSTEM_NEW, GENERATOR_SYSTEM_NEW547, GENERATOR_SYSTEM_OLD, JUDGE_SYSTEM, JUDGE_SYSTEM_PRE545, JUDGE_B_SYSTEM, JUDGE_NUM_PREDICT, PATTERN_CEILING, PATTERN_NUM_PREDICT,
  PATTERN_RUBRIC_TEXT, PATTERN_RUBRIC_VERSION, QUOTE_POLARITIES,
  CONJUNCTION_IN_PART, GeneratorRefusal, JudgeUnreadable, LEFT_OVER_REASK, REASK_GUIDANCE, accountForQuotes, buildClaimReask, buildGeneratorUser, buildJudgeBUser, parseReaskedClaim,
  // brief 7: SP-551 the round-robin ceiling, SP-552 the named polarity refusal, SP-553 the decomposition re-ask.
  polarityRefusal, decompositionTrigger, buildDecompositionReask, type DecompositionSplit,
  // brief 8: SP-555 the thinking judge of record, SP-556 the one retry on an empty answer, SP-557 the per-pass ceiling.
  JUDGE_NUM_PREDICT_RETRY, PATTERN_JUDGE_THINK, applyCeilingPerPass, callJudgeWithEmptyRetry, isEmptyAnswerError,
  type DroppedClaim, nearSynonymClaims, sharedPartClaims, NEAR_SYNONYM_THRESHOLD,
  judgeAWithReask, buildJudgeUser, parseGeneratedPass, parseJudgeBOne, partsWithConjunction, patternIdentity, patternStrength, type ProposedPattern,
  quoteLabels, type JudgeVerdict, type PartVerdict, type PatternQuote, type QuotePolarity,
  // brief 9: SP-569 `belongs_to` resolves AFTER the judge.
  belongsToClaimKey, belongsToSummaryLine, resolveBelongsToAfterJudging, splitDeferredCitations, type ClaimFate,
  // brief 11: SP-578 a false on a NOMINATED quote voids the nomination, never the claim.
  belongsVerdictEffect, voidedNominationLine, supportingByOrigin,
  claimOutcome, pairBelongsFields, type BelongsField, type ClaimOutcome,
  // brief 16: SP-618 the accounting re-ask gives an account, never claims; every claim has a class.
  completeAccountFromReask, rawClaimsWritten, claimAccountByAnswer,
  // brief 17: SP-620/SP-626/SP-627 the one-part variant and its limits; SP-628 the conjunction re-ask.
  GENERATOR_SYSTEM_ONEPART, ONEPART_GEN_LIMITS, DEFAULT_GEN_LIMITS, reaskGuidance, type GenLimits,
  PART_CONJUNCTION_KIND, partConjunctionWhy,
  // brief 18: SP-634 a per-claim re-ask changes only its own field; SP-635 the split; SP-638 the vote.
  reaskMayChange, reaskMayChangeText, fieldReaskGuidance, buildFieldReask, parseFieldReask, mergeFieldReask,
  adoptNominationsForRecovered, buildSplitReask, parseSplitReask, decideBelongs, belongsDecisionLine, conjunctionSummary,
  type RawClaim, type SplitHalf, type BelongsDecision,
} from "../supabase/functions/_shared/needPatterns.ts";

const arg = (n: string, d = "") => Deno.args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const COMPANY = arg("company", "dd40ce2f-ff67-4111-bd3c-67943dde6717");
const APPLY = Deno.args.includes("--apply");
const TAG = arg("tag", "run1");
const CALL_SITE = "need-patterns";
const WANT = arg("needs").split(",").map((s) => s.trim()).filter(Boolean);
/** SP-510: which judge. A = one call per quote, a verdict per part (the default). B = one call per
 *  part per quote. Generation is at temperature 0, so the same needs produce the same claims and parts
 *  under either, and two dry runs differing only in this flag are a PAIRED comparison of the judges. */
const JUDGE_MODE = (arg("judge", "a").toLowerCase() === "b" ? "b" : "a") as "a" | "b";
/** SP-517: the judge MODEL is a parameter so two models face the identical test. The GENERATOR is
 *  unchanged (qwen2.5:14b-instruct) and is chosen by the router, not here. */
const JUDGE_MODEL_OVERRIDE = arg("judge-model", "");
/** SP-555 (2026-11-22): THINKING IS ON BY DEFAULT, BECAUSE THE JUDGE OF RECORD IS NOW THE THINKING
 *  JUDGE — `qwen3.6:35b`, `think: true`, `num_predict` 4,000, cure B (`JUDGE_SYSTEM`, md5 unchanged).
 *
 *  THE DEFAULTS INVERTED HERE, named because an inverted default is the kind of change that is read
 *  wrong a month later:
 *    before (SP-554, measurement only)   after (SP-555, the judge of record)
 *      model        llama3:70b             qwen3.6:35b           (LOCAL_PATTERN_JUDGE)
 *      think        false                  true                  (--judge-no-think turns it off)
 *      num_predict  400                    4,000                 (JUDGE_NUM_PREDICT)
 *      empty answer dropped the pair       ONE retry at 8,000, then named (SP-556)
 *
 *  `--judge-think` is kept as a no-op-by-default flag so brief 7's invocations still read truthfully,
 *  and `--judge-no-think` is the way back to a non-thinking judge for a comparison arm. SP-517's
 *  finding is the reason the two knobs are still tied together: thinking ON at a small budget spends
 *  the whole budget on `message.thinking` and returns an EMPTY `content`, which reads as a broken
 *  model rather than an unbudgeted one. */
const JUDGE_NO_THINK = Deno.args.includes("--judge-no-think");
const JUDGE_THINK = JUDGE_NO_THINK ? false : PATTERN_JUDGE_THINK;
const JUDGE_NUM_PREDICT_ARG = arg("judge-num-predict", "");
const JUDGE_NP = JUDGE_NUM_PREDICT_ARG ? Number(JUDGE_NUM_PREDICT_ARG) : JUDGE_NUM_PREDICT;
if (!Number.isFinite(JUDGE_NP) || JUDGE_NP <= 0) {
  console.error(`REFUSED: --judge-num-predict must be a positive integer; got ${JSON.stringify(JUDGE_NUM_PREDICT_ARG)}`);
  Deno.exit(1);
}
/** Step 3 of this brief: report WHAT THE GENERATOR WROTE and which gate fired, without paying for the
 *  judge. Generation is the thing SP-515 changed; judging it would add ~20 minutes and tell us nothing
 *  about the gate. */
const GENERATE_ONLY = Deno.args.includes("--generate-only");
/** SP-522: a SHADOW judge. A second model answers the IDENTICAL (quote, part) question beside the
 *  judge of record, for MEASUREMENT ONLY — it writes no pattern, part or verdict row, and its answer
 *  can never change what is kept or what a reader sees. Its verdicts go to a JSON file, and its calls
 *  are ledgered at their own call site because a local call is priced 0 and that 0 is a record, not an
 *  absence (SP-518). It is the leniency check on the judge of record: the judge is chosen by a ruling
 *  (SP-519), and a ruling wants a standing measurement beside it rather than a one-off comparison. */
const SHADOW_MODEL = arg("shadow-model", "");
/** SP-541: which generator PROMPT and which generator MODEL this arm uses. Both default to what the
 *  working tree already ran, so an invocation without them is run 3's arm exactly. */
// SP-544 + SP-547: the DEFAULT is now the adopted arm — G-new plus `belongs_to`. "new" (SP-535's
// exact bytes) and "old" (run 2's) stay reachable, so brief 5's four arms can still be re-asked.
const GEN_PROMPT = arg("gen-prompt", "new547");
const GEN_SYSTEM_BY_PROMPT: Record<string, string> = {
  old: GENERATOR_SYSTEM_OLD, new: GENERATOR_SYSTEM_NEW, new547: GENERATOR_SYSTEM_NEW547,
  // SP-620 / SP-626 / SP-627: one part per claim, ceiling 16. A measurement variant, never the default.
  onepart: GENERATOR_SYSTEM_ONEPART,
};
if (!Object.hasOwn(GEN_SYSTEM_BY_PROMPT, GEN_PROMPT)) {
  console.error(`REFUSED: --gen-prompt must be "old" (run 2, pre-SP-535), "new" (SP-535), "new547" (SP-547, the default) or "onepart" (SP-620, one part per claim); got ${JSON.stringify(GEN_PROMPT)}`);
  Deno.exit(1);
}
const GEN_SYSTEM = GEN_SYSTEM_BY_PROMPT[GEN_PROMPT];
/** SP-627: the variant's limits — parts per claim and claims per pass — read in every place the
 *  number is used. The three measured variants keep 3 and 12. */
const GEN_LIMITS: GenLimits = GEN_PROMPT === "onepart" ? ONEPART_GEN_LIMITS : DEFAULT_GEN_LIMITS;
const CEILING = GEN_LIMITS.ceiling;
/** SP-628: the conjunction check and its one re-ask belong to the one-part variant only, so the three
 *  measured variants run exactly as they were measured. */
const CONJUNCTION_REASK = GEN_PROMPT === "onepart";
const GEN_MODEL_OVERRIDE = arg("gen-model", "");
/** SP-544: the generator model, as a DEFAULT rather than an override — the lane's `LOCAL_GENERATOR`
 *  stays qwen2.5:14b-instruct for every other consumer (see the constant's own note). */
const GEN_MODEL_DEFAULT = LOCAL_PATTERN_GENERATOR;
/** SP-545: the live judge prompt IS cure B. `--judge-system=pre545` asks the prompt that was live
 *  until 2026-11-22 instead — FOR COMPARISON ONLY, and it is printed and recorded in the run's JSON,
 *  so no number can be read as the live judge's by accident. */
const JUDGE_SYSTEM_MODE = arg("judge-system", "live");
const JUDGE_SYSTEM_BY_MODE: Record<string, string | undefined> = {
  live: undefined,          // judgeAWithReask defaults to the live JUDGE_SYSTEM (cure B, SP-545)
  pre545: JUDGE_SYSTEM_PRE545,
};
if (!Object.hasOwn(JUDGE_SYSTEM_BY_MODE, JUDGE_SYSTEM_MODE)) {
  console.error(`REFUSED: --judge-system must be "live" (cure B, SP-545) or "pre545"; got ${JSON.stringify(JUDGE_SYSTEM_MODE)}`);
  Deno.exit(1);
}
const JUDGE_SYSTEM_OVERRIDE = JUDGE_SYSTEM_BY_MODE[JUDGE_SYSTEM_MODE];
/** THE OPERATOR'S ADDITION (2026-11-22): runs 1 to 3 generated at temperature 0 and NO seed, so their
 *  determinism was assumed. `--gen-seed=none` reproduces that older call exactly, so "was temperature 0
 *  alone deterministic?" is a measurement rather than a belief. A knob on the call, not on the prompt. */
const GEN_SEED_ARG = arg("gen-seed", "42");
const GEN_SEED: number | undefined = GEN_SEED_ARG === "none" ? undefined : Number(GEN_SEED_ARG);
if (GEN_SEED !== undefined && !Number.isFinite(GEN_SEED)) {
  console.error(`REFUSED: --gen-seed must be an integer or "none"; got ${JSON.stringify(GEN_SEED_ARG)}`);
  Deno.exit(1);
}
const GEN_SYSTEM_MD5 = encodeHex(new Uint8Array(
  await stdCrypto.subtle.digest("MD5", new TextEncoder().encode(GEN_SYSTEM))));
const SHADOW_JSON = arg("shadow-json", "");
/** SP-537(b): the judge of record's pairs, written whether or not a shadow model ran. */
const PAIRS_JSON = arg("pairs-json", "");
/** 2026-11-22: THE RAW GENERATOR ANSWERS, written down. Runs 1 to 3 persisted only JUDGED pairs, so
 *  the generator's own bytes were never kept and no later run can be compared with them byte for
 *  byte. Every arm from here writes them. */
const GEN_JSON = arg("gen-json", "");
type GenAnswer = { need: string; polarity: string; attempt: string; model: string; system_md5: string; content: string; field?: boolean };
const genAnswers: GenAnswer[] = [];
/** 2026-11-22, brief 6 step 7: REPLAY THE GENERATOR'S ANSWERS FROM A PREVIOUS RUN'S `--gen-json`.
 *
 *  The brief asks for the SAME PAIRS judged by two prompts. Re-generating them would rest on the
 *  generator being deterministic — which brief 5 measured for qwen2.5:14b and NOT for qwen3.6:35b —
 *  so the second pass reads the first pass's bytes instead and the two judge passes are provably
 *  facing one set of patterns. A replayed call is NOT a model call: it is not ledgered (there is no
 *  spend to record) and it is counted and printed separately.
 *
 *  It REFUSES rather than falling back to a live call: a replay that quietly generates something new
 *  is the one thing it must not do, because the comparison would then be of two different answers. */
const GEN_FROM = arg("gen-from", "");
const replay = new Map<string, GenAnswer>();
let replayedCalls = 0;
/** SP-652 (2026-11-24): THE JUDGE REPLAY. `--judge-from=<pairs.json>` replays the judge's saved verdicts
 *  the way `--gen-from` replays the generator's saved answers, so the two together run the whole
 *  runner with ZERO model calls. The rules are in scripts/judgeReplay.ts; every refusal exits 1.
 *  `--judge-from-md5` and `--gen-from-md5` are REQUIRED with it: the operator names the exact files.
 *  `--bind-by-ledger=<start>,<end>` binds a file written before bindings existed to today's rows, by
 *  the saved run's own ledger rows (see LedgerProof). */
const JUDGE_FROM = arg("judge-from", "");
const JUDGE_FROM_MD5 = arg("judge-from-md5", "");
const GEN_FROM_MD5 = arg("gen-from-md5", "");
const BIND_BY_LEDGER = arg("bind-by-ledger", "");
function refuseReplay(e: unknown): never {
  if (e instanceof ReplayRefusal) console.error(`REFUSED (SP-652, ${e.kind}): ${e.message}`);
  else console.error(`REFUSED (SP-652): ${e instanceof Error ? e.message : String(e)}`);
  Deno.exit(1);
}
if (JUDGE_FROM && !GEN_FROM) { console.error("REFUSED (SP-652): --judge-from needs --gen-from — saved verdicts are only replayed against the saved generator answers they judged"); Deno.exit(1); }
if (JUDGE_FROM && !GEN_FROM_MD5) { console.error("REFUSED (SP-652): --judge-from needs --gen-from-md5=<md5 of the generations file>"); Deno.exit(1); }
// A replay flag with no file to go with it is refused: `--judge-from-md5` alone used to be ignored, and the
// run then judged LIVE (brief 20: a refusal test of mine made 3 live N14 judge calls this way).
if (JUDGE_FROM_MD5 && !JUDGE_FROM) { console.error("REFUSED (SP-652): --judge-from-md5 was given with no --judge-from — a replay flag without its file would judge live"); Deno.exit(1); }
if (GEN_FROM_MD5 && !GEN_FROM) { console.error("REFUSED (SP-652): --gen-from-md5 was given with no --gen-from — a replay flag without its file would generate live"); Deno.exit(1); }
if (BIND_BY_LEDGER && !JUDGE_FROM) { console.error("REFUSED (SP-652): --bind-by-ledger is only read with --judge-from"); Deno.exit(1); }
let genFromMd5 = "";
if (GEN_FROM) {
  const genFromText = await Deno.readTextFile(GEN_FROM);
  genFromMd5 = await md5OfText(genFromText);
  if (GEN_FROM_MD5 && GEN_FROM_MD5.toLowerCase() !== genFromMd5) { console.error(`REFUSED (SP-652, file_md5): the generations file's md5 is ${genFromMd5}, the command line gave ${GEN_FROM_MD5}`); Deno.exit(1); }
  const loaded = JSON.parse(genFromText) as { answers?: GenAnswer[] };
  for (const a of loaded.answers ?? []) replay.set(`${a.need}/${a.polarity}#${a.attempt}`, a);
  if (replay.size === 0) { console.error(`REFUSED: --gen-from=${GEN_FROM} carries no answers`); Deno.exit(1); }
  console.log(`--gen-from ${GEN_FROM}: ${replay.size} stored generator answer(s) will be REPLAYED (no generator call, no ledger row) · file md5 ${genFromMd5}${GEN_FROM_MD5 ? " (as given)" : ""}`);
}
const NEED_KEYS = arg("keys", DEFAULT_NEED_KEYS);

// SP-518: the psql helpers and the supabase stand-in now live in ONE place (scripts/ledgerShim.ts),
// because the three read-only instruments need the same ledger path and a second copy of this shim
// would be the drift the module warns about. `q`/`qn` stay local: they are SQL spelling, not ledger.
const q = sqlQuote;
const qn = (s: string | null) => (s == null ? "null" : q(s));
const sbShim = makeLedgerShim();

// ── the lane, resolved ONCE for the whole run (SP-460 / SP-468) ──────────────────────────────────
// companyHasClientProvidedMaterial issues head+count selects, which `sbShim` above does not serve;
// this is that one query shape, with the same named join patternLane.ts documents.
function makeCountQuery(table: string) {
  const f: string[] = [];
  const api = {
    select: (_c: string, _o?: unknown) => api,
    eq(c: string, v: unknown) { if (c === "inputs.company_id") { f.push(`__join__${v}`); } else { f.push(`t.${c} = ${q(String(v))}`); } return api; },
    in(c: string, v: string[]) { f.push(`t.${c} in (${v.map(q).join(", ")})`); return api; },
    not(c: string, _o: string, _v: unknown) { f.push(`t.${c} is not null`); return api; },
    then(ok: (r: unknown) => unknown, bad?: (e: unknown) => unknown) {
      const join = f.find((x) => x.startsWith("__join__"));
      const where = f.filter((x) => !x.startsWith("__join__"));
      const from = join ? `public.input_files t join public.inputs i on i.id = t.input_id` : `public.${table} t`;
      if (join) where.push(`i.company_id = ${q(join.slice(8))}`);
      return psql(`select count(*) from ${from}${where.length ? " where " + where.join(" and ") : ""}`)
        .then((r) => ({ count: Number(r[0][0]), error: null }))
        .catch((e) => ({ count: null, error: { message: String(e) } }))
        .then(ok as never, bad as never);
    },
  };
  return api;
}
// deno-lint-ignore no-explicit-any
const laneShim: any = { from: (t: string) => makeCountQuery(t) };
const material = await companyHasClientProvidedMaterial(laneShim, COMPANY);

// ── the needs and their COUNTED quotes, from stored rows ─────────────────────────────────────────
// SP-565: a need's KEY comes from the key file, by row id. It used to come from matching the row's
// sentence against the corpus, so a need whose wording was edited in place lost its key ("—") and
// `--needs=N13` refused with "no need row".
const needKeys = await loadNeedKeys(COMPANY, NEED_KEYS);

const needRows = await psql(`select n.id, n.desired_outcome, n.status, coalesce(n.source_path,'')
  from public.odi_needs n where n.company_id = ${q(COMPANY)} and n.status in ('active','proposed')`);
// JSON, not the tab-separated form the other reads use: a verified quote carries newlines and tabs of
// its own (a reviewer's line breaks), and splitting such a row on "\t" silently shears it into the
// wrong columns — which is how the first run of this script died, on an undefined `quote`.
const evRows = await psqlJson<{ need_id: string; signal_id: string; brand: string; quote: string | null; url: string | null; date: string | null; polarity: string | null }>(
  `select e.need_id, e.signal_id, e.brand, s.quote, s.source_url as url,
     to_char(s.event_date,'YYYY-MM-DD') as date, e.polarity
   from public.need_evidence e join public.signals s on s.id = e.signal_id
   where e.company_id = ${q(COMPANY)} and e.bears`);

const quotesByNeed = new Map<string, PatternQuote[]>();
for (const { need_id: needId, signal_id: signalId, brand, quote: rawQuote, url: rawUrl, date, polarity } of evRows) {
  const quote = rawQuote ?? "";
  const url = rawUrl ?? "";
  const eventDate = date || null;
  if (!isCounted({ brand, eventDate })) continue;      // the ONE counting authority
  if (!quote.trim()) continue;                          // no verified quote, nothing to read
  (quotesByNeed.get(needId) ?? quotesByNeed.set(needId, []).get(needId)!)
    .push({
      signalId, quote, site: siteOf(url), eventDate, brand,
      // SP-470: the quote's own polarity reaches the generator. An unrecognised or NULL value is
      // passed through as null and shown as "unlabelled" rather than guessed into a polarity.
      polarity: QUOTE_POLARITIES.includes(polarity as QuotePolarity) ? (polarity as QuotePolarity) : null,
    });
}

const needs = needRows
  .map(([id, outcome, status, sourcePath]) => ({ id, outcome, status, sourcePath, key: needKeys.label(id) }))
  .filter((n) => (WANT.length ? WANT.includes(n.key) : true))
  .sort((a, b) => (quotesByNeed.get(b.id)?.length ?? 0) - (quotesByNeed.get(a.id)?.length ?? 0));

// SP-565: prints which row each key resolves to and stops — before the lane's model is resolved and
// before any call. It is how "the script still finds N13" is checked without spending a model call.
if (Deno.args.includes("--resolve-only")) {
  if (WANT.length) {
    const missing = WANT.filter((k) => !needs.some((n) => n.key === k));
    if (missing.length) { console.error(`REFUSED: no need row for ${missing.join(", ")} on this company`); Deno.exit(1); }
  }
  for (const n of needs) console.log(`resolve-only: ${n.key} → ${n.id} · ${n.outcome}`);
  Deno.exit(0);
}

if (APPLY && JUDGE_MODE === "b") {
  console.error("REFUSED: --judge=b is a comparison instrument (SP-510) and has no stored shape of its own.");
  console.error("         A row judged by B would read as a row judged by A. Run it without --apply.");
  Deno.exit(1);
}
if (WANT.length) {
  const missing = WANT.filter((k) => !needs.some((n) => n.key === k));
  if (missing.length) { console.error(`REFUSED: no need row for ${missing.join(", ")} on this company`); Deno.exit(1); }
}

const provenance = patternRouteProvenance({
  hasClientMaterial: material.has,
  signalSourceTypes: (await psql(`select distinct coalesce(s.source_type,'') from public.signals s
    join public.need_evidence e on e.signal_id = s.id and e.company_id = s.company_id
    where s.company_id = ${q(COMPANY)}`)).map((r) => r[0]),
  needSourcePaths: [...new Set(needs.map((n) => n.sourcePath))],
});
const lane = resolveModel({ role: "generator", inputs: [{ provenance }] });
const judgeLane = resolveModel({ role: "judge", inputs: [{ provenance }] });
const JUDGE_PROVIDER = judgeLane.provider;
// SP-517: the override names the judge MODEL only. The LANE is still the router's decision — a local
// company stays local — so this can pick between local judges and can never open an external one.
// SP-555: the judge of record for THIS layer is LOCAL_PATTERN_JUDGE, exactly as SP-544 made the
// generator LOCAL_PATTERN_GENERATOR. The router still owns the LANE (a non-local company refuses the
// local judge below), and `--judge-model` still overrides the model for an arm.
const JUDGE_MODEL_DEFAULT = LOCAL_PATTERN_JUDGE;
const JUDGE_MODEL = JUDGE_MODEL_OVERRIDE || JUDGE_MODEL_DEFAULT || judgeLane.model;
if (JUDGE_MODEL_OVERRIDE && judgeLane.provider !== "local_ollama") {
  console.error(`REFUSED: --judge-model is for choosing between LOCAL judges; this company's judge lane is ${judgeLane.provider}`);
  Deno.exit(1);
}
// SP-522: the shadow is held to the SAME lane rule as the judge of record, and for the same reason —
// it is a second model on this company's evidence, so it can never be an external one. It also needs
// somewhere to put its answers: a shadow whose verdicts are not written down has spent the time and
// kept nothing.
if (SHADOW_MODEL && judgeLane.provider !== "local_ollama") {
  console.error(`REFUSED: --shadow-model is for a LOCAL shadow judge; this company's judge lane is ${judgeLane.provider}`);
  Deno.exit(1);
}
if (SHADOW_MODEL && !SHADOW_JSON) {
  console.error("REFUSED: --shadow-model needs --shadow-json=<path>; a shadow verdict that is not written down is spend with nothing to show.");
  Deno.exit(1);
}
if (SHADOW_MODEL && JUDGE_MODE === "b") {
  console.error("REFUSED: the shadow pairs per (quote, part) against JUDGE A's call shape (SP-522). Under --judge=b there is no A verdict to pair with.");
  Deno.exit(1);
}
if (SHADOW_MODEL) console.log(`shadow: ${SHADOW_MODEL} (SP-522 — measurement only, writes no verdict/part/pattern row)`);
console.log(`lane: ${lane.provider}  generator=${GEN_MODEL_OVERRIDE || lane.model}  judge=${judgeLane.model}`);
console.log(`SP-544 arm: generator prompt "${GEN_PROMPT}" (md5 ${GEN_SYSTEM_MD5})` +
  `  generator model ${GEN_MODEL_OVERRIDE ? `${GEN_MODEL_OVERRIDE} (--gen-model)` : `${GEN_MODEL_DEFAULT} (SP-544 default; the lane's own is ${lane.model})`}` +
  `  seed ${GEN_SEED ?? "none (--gen-seed=none, as runs 1-3 ran)"}`);
// SP-555: of-record is now model+think+budget together, so the line says which of the three moved.
const OF_RECORD_SHAPE = JUDGE_MODEL === LOCAL_PATTERN_JUDGE && JUDGE_THINK === PATTERN_JUDGE_THINK && JUDGE_NP === JUDGE_NUM_PREDICT;
console.log(`SP-555 judge call: model ${JUDGE_MODEL}  think ${JUDGE_THINK}  num_predict ${JUDGE_NP}` +
  ` (retry ${JUDGE_NUM_PREDICT_RETRY} on an empty answer, SP-556)` +
  `${OF_RECORD_SHAPE ? "  — the judge of record" : "  — NOT the judge of record's call shape (measurement only)"}`);
console.log(`SP-545 judge: prompt "${JUDGE_SYSTEM_MODE}" (md5 ${await md5OfText(JUDGE_SYSTEM_OVERRIDE ?? JUDGE_SYSTEM)})` +
  `${JUDGE_SYSTEM_MODE === "live" ? " — cure B, the live prompt" : " — THE PRE-SP-545 PROMPT, comparison only"}`);
console.log(`      client material: ${material.has ? material.found.map((f) => `${f.kind}=${f.count}`).join(" ") : "none"}`);
console.log(`rubric: ${PATTERN_RUBRIC_VERSION}  md5 ${await md5OfText(PATTERN_RUBRIC_TEXT)}  judge ${JUDGE_MODE.toUpperCase()} (SP-510)`);
console.log(`needs: ${needs.map((n) => `${n.key}(${quotesByNeed.get(n.id)?.length ?? 0})`).join(" ")}\n`);

const RUBRIC_MD5 = await md5OfText(PATTERN_RUBRIC_TEXT);

// ── SP-652: the judge replay is opened here, once the prompts, the rubric and the judge are known ──
let judgeReplay: JudgeReplay | null = null;
let ledgerProof: LedgerProof | null = null;
let judgeReplayed = 0;
let judgeFromMd5 = "";
/** Every need's binding as THIS run sees it — written into --pairs-json and --gen-json from now on. */
const runBindings: Record<string, NeedBinding> = {};
const bindingSource: Record<string, "file" | "ledger"> = {};
if (JUDGE_FROM) {
  if (JUDGE_MODE === "b" || SHADOW_MODEL || GENERATE_ONLY) { console.error("REFUSED (SP-652): --judge-from replays judge A's verdicts of record; it does not combine with --judge=b, --shadow-model or --generate-only"); Deno.exit(1); }
  const text = await Deno.readTextFile(JUDGE_FROM);
  judgeFromMd5 = await md5OfText(text);
  try {
    judgeReplay = new JudgeReplay(text, JUDGE_FROM_MD5, judgeFromMd5, {
      judgeSystemMd5: await md5OfText(JUDGE_SYSTEM_OVERRIDE ?? JUDGE_SYSTEM), genSystemMd5: GEN_SYSTEM_MD5,
      rubricVersion: PATTERN_RUBRIC_VERSION, rubricMd5: RUBRIC_MD5, judgeModel: JUDGE_MODEL,
    });
  } catch (e) { refuseReplay(e); }
  console.log(`--judge-from ${JUDGE_FROM}: ${judgeReplay.pairCount} stored judge verdict(s) will be REPLAYED (no judge call, no ledger row) · file md5 ${judgeFromMd5} (as given)`);
  console.log(`      bindings in the file: ${judgeReplay.bindings ? Object.keys(judgeReplay.bindings).join(" ") : "NONE — written before SP-652"}`);
  if (BIND_BY_LEDGER) {
    const [from, to] = BIND_BY_LEDGER.split(",").map((x) => x.trim());
    if (!from || !to) { console.error("REFUSED (SP-652): --bind-by-ledger=<start>,<end> — two timestamps, the saved run's own window"); Deno.exit(1); }
    const rows = await psql(`select call_site, prompt_sha from public.model_calls
      where company_id = ${q(COMPANY)} and created_at >= ${q(from)}::timestamptz and created_at <= ${q(to)}::timestamptz
        and call_site in (${q(`${CALL_SITE}:generator`)}, ${q(`${CALL_SITE}:judge`)}) and prompt_sha is not null`);
    ledgerProof = new LedgerProof(rows.map(([site, sha]) => ({ role: site.endsWith(":generator") ? "generator" as const : "judge" as const, sha })), `${from} to ${to}`);
    console.log(`--bind-by-ledger: ${ledgerProof.rows} ledger row(s) of the saved run in ${from} to ${to} — every replayed prompt must be one of them`);
  }
}

// ── the routed caller: local stays local, and a PAID call is projected and checked before it is sent ──
const OLLAMA = Deno.env.get("OLLAMA_BASE_URL") ?? "http://127.0.0.1:11434/v1";
const spendCap = makeSpendCap({ capUsd: SPEND_CAP_CEILING_USD, companyId: COMPANY, since: new Date().toISOString(), supabase: sbShim as never });
let usage: { prompt_tokens: number; completion_tokens: number } | null = null;
const timings: Array<{ need: string; role: string; model: string; seconds: number; outChars: number }> = [];
/** SP-556: the budget the NEXT judge call will use. `JUDGE_NP` for a first attempt, the retry budget
 *  for the one retry an empty answer earns. Reset by the retry wrapper in a `finally`, so a throw can
 *  never leave the bigger budget in place for an unrelated call. */
let judgeNumPredictNow = JUDGE_NP;
let failedCalls = 0;            // SP-518: calls that THREW — ledgered anyway, counted here
let judgeEmptyFirst = 0;        // first attempts that came back empty
let judgeEmptyRecovered = 0;    // of those, the ones the retry answered
const judgeEmptyFailed: Array<{ need: string; signalId: string; pattern: string }> = [];

/** SP-631 (2026-11-24): THE CONTEXT SIZE IS SET HERE, ON BOTH CALLS, AND NOT INHERITED.
 *  Until now both calls ran at 8,192 only because `callOllamaJson` defaults `num_ctx` to it — a default
 *  in a module this layer does not own. Named at the call site, a change there cannot move it. The
 *  value is the one every run so far used, so no verdict moves. */
const PATTERN_NUM_CTX = 8192;
/** SP-637: when each call ended, so it can be placed under the model load it ran on. */
const callEnds: Array<{ role: string; endMs: number }> = [];
const RUN_STARTED_MS = Date.now();
const routed = makeRoutedModel({
  // SP-541 + 2026-11-22, both operator-approved:
  //   - `seed: 42` — runs 1 to 3 generated with temperature 0 and NO seed, so their determinism was
  //     assumed rather than set. SP-526 rests on it (the dry output is what --apply would store).
  //   - `think: false` — SP-517's measured finding: a thinking model with thinking ON spends the whole
  //     num_predict budget on `message.thinking` and returns an EMPTY `content`. qwen3.6:35b returned
  //     nothing at num_predict 200 and nothing at 1,400, and answered in 4.3s with think:false. The
  //     generator call never passed it, so the qwen3.6 arm would have read as a broken model.
  //   - `keep_alive: 0` — unload the generator the moment it answers; see callOllamaJson.
  // SP-544: the generator model is `LOCAL_PATTERN_GENERATOR` (qwen3.6:35b) unless an arm overrides it.
  // SP-549: `onServed` carries the model the RESPONSE named back out, and the caller returns it with
  // the content so `makeRoutedModel` can hand it to the ledger.
  callLocalGenerator: async (model, system, user) => {
    let servedModel = "";
    const content = await callOllamaJson(OLLAMA, GEN_MODEL_OVERRIDE || GEN_MODEL_DEFAULT || model, system, user, 600_000,
      { temperature: 0, ...(GEN_SEED !== undefined ? { seed: GEN_SEED } : {}), num_predict: PATTERN_NUM_PREDICT, num_ctx: PATTERN_NUM_CTX, think: false, keep_alive: 0 },
      (m) => { servedModel = m; });
    return { content, servedModel };
  },
  // SP-428's strengths are OURS, not the judge's; the judge still runs at temperature 0 so a re-judge
  // of the same pattern returns the same verdict.
  // SP-517: the override replaces the model the router named, for the judge role only.
  callLocalJudge: async (model, system, user) => {
    let servedModel = "";
    // SP-554: `think` and the budget are the only two things an arm may move here. Temperature 0 and
    // seed 42 stay, so a thinking judge and the judge of record face the identical question.
    // SP-556: the BUDGET is read from `judgeNumPredictNow` rather than the constant, because the one
    // retry an empty answer earns is the same question at a bigger budget. It is a module-level `let`
    // and not a new parameter on purpose: `callLocalJudge`'s shape is `makeRoutedModel`'s contract,
    // shared with every other routed consumer in `_shared/modelRouter.ts`, and widening it there to
    // thread a budget this layer alone varies would change a fleet-wide signature for one caller.
    // It is safe to hold it here: this script is single-threaded and awaits each call before the next.
    const content = await callOllamaJson(OLLAMA, JUDGE_MODEL_OVERRIDE || JUDGE_MODEL_DEFAULT || model, system, user, 600_000,
      { temperature: 0, seed: 42, num_predict: judgeNumPredictNow, num_ctx: PATTERN_NUM_CTX, think: JUDGE_THINK }, (m) => { servedModel = m; });
    return { content, servedModel };
  },
  openaiKey: Deno.env.get("OPENAI_API_KEY") ?? "",
  onUsage: (u) => { usage = u; },
  externalTemperature: 0,
  externalSeed: 42,
  externalMaxTokens: PATTERN_NUM_PREDICT,
  // SP-464: wired for the companies where the external lane CAN fire. On Charter it never does.
  beforeExternal: (c) => assertSpendable(spendCap, {
    site: CALL_SITE, model: c.model,
    projectedUsd: projectOpenAIUsd(c.model, { promptChars: c.system.length + c.user.length, maxOutputTokens: PATTERN_NUM_PREDICT }),
  }),
});

/** FOUND 2026-11-22 IN THE MIDDLE OF SP-541, RULED ON BY SP-549 — THE LEDGER NAMED THE LANE, NOT THE
 *  MODEL THAT ANSWERED.
 *
 *  `routed()` returns the model the ROUTER resolved (`lane.model`), and `--gen-model` / `--judge-model`
 *  replaced it only INSIDE the local caller. So every line and every ledger row of brief 5's
 *  qwen3.6:35b arms read `qwen2.5:14b-instruct` while qwen3.6:35b was in fact answering — proved
 *  independently by ollama's own load log for the window (33 qwen3.6:35b loads, 10 llama3:70b, ZERO
 *  qwen2.5). Every call WAS ledgered (SP-518 held); the model NAME on 31 of those rows was the lane's,
 *  and those 31 rows are corrected under SP-549 with their ids in brief 6 §8b.
 *
 *  SP-549's fix is NOT this function: it is `servedModel` coming back from the RESPONSE
 *  (`callOllamaJson`'s `onServed` → `makeRoutedModel`). A name taken from the request can only ever
 *  repeat what the caller already believed. This chain stays underneath it as a fallback for a
 *  response that names no model, and is reported when the two disagree. */
function requestedModel(role: "generator" | "judge", routerModel: string): string {
  if (role === "generator") return GEN_MODEL_OVERRIDE || GEN_MODEL_DEFAULT || routerModel;
  if (role === "judge" && JUDGE_MODEL_OVERRIDE) return JUDGE_MODEL_OVERRIDE;
  return routerModel;
}
/** SP-549: every case where the response's model differed from the one we asked for, for the report. */
const servedDisagreements: Array<{ need: string; role: string; requested: string; served: string }> = [];

/** SP-638 removed the record-only judge call (SP-625): every cited quote is now judged live, so no call
 *  carries a call_site suffix any more. */
async function call(role: "generator" | "judge", need: string, system: string, user: string, quiet = false, replayKey = "") {
  const siteSuffix = "";
  // THE REPLAY, before anything else: a replayed answer is not a call, so it is not timed, not
  // ledgered and not counted as one.
  if (role === "generator" && replay.size > 0) {
    if (!replayKey) { console.error(`REFUSED: --gen-from is set but a generator call carries no replay key (${need})`); Deno.exit(1); }
    const hit = replay.get(`${need}#${replayKey}`);
    if (!hit) { console.error(`REFUSED: --gen-from has no answer for ${need}#${replayKey} — a replay that generates something new is not a replay`); Deno.exit(1); }
    if (hit.system_md5 !== GEN_SYSTEM_MD5) {
      console.error(`REFUSED: ${need}#${replayKey} was generated under prompt md5 ${hit.system_md5}, this run's is ${GEN_SYSTEM_MD5}`);
      Deno.exit(1);
    }
    // SP-652: the prompt this replayed answer answers must be a prompt the saved run SENT.
    if (ledgerProof) { try { ledgerProof.consume("generator", await md5OfText(system + "\n" + user), `${need}#${replayKey}`); } catch (e) { refuseReplay(e); } }
    replayedCalls++;
    if (!quiet) console.log(`    ${"replay".padEnd(9)} ${hit.model.padEnd(22)} ${replayKey}  ${hit.content.length} chars (no call, no ledger row)`);
    return { content: hit.content, provider: "local_ollama" as const, model: hit.model, servedModel: hit.model };
  }
  // SP-652: under --judge-from NOTHING reaches a model. A call that gets here is a replay gone wrong.
  if (judgeReplay) refuseReplay(new ReplayRefusal("live_call", `a live ${role} call was about to be made for ${need} — a replay makes none`));
  usage = null;
  const t0 = performance.now();
  let r;
  try {
    r = await routed({ role, provenances: [provenance], system, user });
  } catch (e) {
    // SP-518, FOUND WHILE ADOPTING THE THINKING JUDGE (SP-555). This ledger row used to be written
    // only after `routed()` RETURNED, so a call that threw spent the compute and left no row — and
    // under llama3 that practically never happened, because a non-thinking judge at 400 tokens does
    // not come back empty. The thinking judge does, on about 5% of calls, so an unledgered throw
    // would have put the brief's reconciliation out by exactly the number of empty answers. The
    // failed call is ledgered here with what is known about it, and counted.
    failedCalls++;
    // SP-570: there is no response, so there is no served model — the row names the model that was
    // REQUESTED and is marked as such. This used to be `requestedModel(role, "")`, which ignores the
    // layer's default judge and so wrote "" on all 11 of run 7's empty answers.
    const noResponse = noResponseLedgerRow({
      callSite: `${CALL_SITE}:${role}${siteSuffix}`,
      requestedModel: modelSentFor(role, {
        genOverride: GEN_MODEL_OVERRIDE, genDefault: GEN_MODEL_DEFAULT,
        judgeOverride: JUDGE_MODEL_OVERRIDE, judgeDefault: JUDGE_MODEL_DEFAULT,
        laneModel: role === "generator" ? lane.model : judgeLane.model,
      }),
    });
    await recordModelCall(sbShim as never, {
      companyId: COMPANY, callSite: noResponse.callSite, usage: noResponse.usage,
      promptSha: await md5OfText(system + "\n" + user),
    });
    throw e;
  }
  const seconds = (performance.now() - t0) / 1000;
  // SP-549: THE MODEL THAT ANSWERED, FROM THE RESPONSE — not a reconstruction of what we asked for.
  // `requestedModel` is what we asked, kept only so a disagreement can be SEEN rather than averaged
  // away: if ollama ever serves something other than the model requested, that is the finding.
  const asked = requestedModel(role, r.model);
  const served = r.servedModel || asked;
  if (served !== asked) servedDisagreements.push({ need, role, requested: asked, served });
  timings.push({ need, role: `${role}${siteSuffix}`, model: served, seconds, outChars: r.content.length });
  callEnds.push({ role, endMs: Date.now() });
  if (!quiet) console.log(`    ${`${role}${siteSuffix}`.padEnd(9)} ${served.padEnd(22)} ${seconds.toFixed(1)}s  ${r.content.length} chars`);
  // the ledger, on EVERY call — a local call is priced 0, and that 0 is a record, not an absence
  await recordModelCall(sbShim as never, {
    companyId: COMPANY, callSite: `${CALL_SITE}:${role}${siteSuffix}`,
    usage: r.provider === "external_openai"
      ? openaiRecord(r.servedModel || r.model, usage)
      : { provider: r.provider, model: served, prompt_tokens: null, completion_tokens: null, usd: 0 },
    promptSha: await md5OfText(system + "\n" + user),
  });
  return { ...r, model: served };
}

// ── SP-522: THE SHADOW JUDGE ─────────────────────────────────────────────────────────────────────
// Its own caller, deliberately NOT the routed one: the router resolves one judge per role, and the
// shadow is a second model on the same question, not a re-resolution of the lane. It goes straight to
// the local runtime with the judge's own options — same temperature, same seed, same num_predict
// (SP-524), same `think:false` (SP-517) — so a disagreement is the MODEL and nothing else.
const shadowTimings: number[] = [];
let shadowCalls = 0, shadowFailedCalls = 0, shadowUnreadable = 0, shadowReasks = 0;
/** One paired record per (quote, part) pair, written to --shadow-json / --pairs-json and to nothing
 *  else.
 *
 *  SP-537(b): `pattern_identity` is EMITTED, not left to be reconstructed. Run 2's JSON carried only
 *  (need, claim, part), and N15 wrote one claim twice with one part each — so every reader keying on
 *  (need, claim) merged two different patterns, judged the wrong part for one of them and
 *  double-counted their quotes. I made that mistake in brief 2 and it changed a published number.
 *  The identity is the row's own key (SP-509, parts included), so no reader has to guess again. */
type ShadowPair = {
  need: string; pattern: string; pattern_identity: string; signal_id: string; quote: string;
  ordinal: number; part: string;
  judge_of_record: { model: string; states: boolean; span: string; reason: string; rejected: string };
  shadow: { model: string; states: boolean | null; span: string; reason: string; rejected: string; error: string };
  /** SP-578: this pair was judged (and ledgered) under a nomination the judge then voided. It is in the
   *  record because the call was made; it is not a citation and is never stored. */
  nomination_voided?: boolean;
  /** SP-609: the judge's claim-level answer for this (claim, quote) call — the SP-568 gap. It is the
   *  same on every part row of one pair, because the judge gives it once per call. */
  belongs_to_this_need: boolean; belongs_field: BelongsField; belongs_reason: string;
};
const shadowPairs: ShadowPair[] = [];
/** SP-609: every claim's outcome, kept or dropped with its drop class — written under `claims` in
 *  --pairs-json. Until now this existed only as `keep` / `drop` log lines. */
const claimOutcomes: ClaimOutcome[] = [];
/** The (claim, parts, quote) triples the judge of record actually judged, in the order it judged them.
 *  Patterns the run later DROPPED are in here too, on purpose: a leniency check that looked only at
 *  kept patterns could not see a pattern the shadow would have kept. */
const shadowQueue: Array<{ need: string; needStatement: string; name: string; identity: string; parts: string[]; quote: PatternQuote; recordParts: PartVerdict[]; nominationVoided?: boolean; belongs: ReturnType<typeof pairBelongsFields> }> = [];
async function shadowCall(system: string, user: string): Promise<string> {
  const t0 = performance.now();
  try {
    const content = await callOllamaJson(OLLAMA, SHADOW_MODEL, system, user, 600_000,
      { temperature: 0, seed: 42, num_predict: JUDGE_NUM_PREDICT, think: false });
    shadowCalls++;
    shadowTimings.push((performance.now() - t0) / 1000);
    return content;
  } catch (e) {
    // SP-518's own lesson: a call that THREW still spent the compute. It is counted here and ledgered
    // in the `finally` below, never silently dropped.
    shadowFailedCalls++;
    throw e;
  } finally {
    await recordModelCall(sbShim as never, {
      companyId: COMPANY, callSite: `${CALL_SITE}:shadow-judge`,
      usage: { provider: "local_ollama", model: SHADOW_MODEL, prompt_tokens: null, completion_tokens: null, usd: 0 },
      promptSha: await md5OfText(system + "\n" + user),
    });
  }
}

let patternsWritten = 0, patternsDropped = 0, quotesWritten = 0, partsWritten = 0;
/** SP-523: the ONE structural disagreement the judge's schema can express — every part stated, and
 *  the claim's own top-level boolean saying the claim is not this need's. Counted and listed; it is
 *  already fail-closed by SP-493, which drops the pattern. No reason text is parsed (SP-523). */
const sp523Disagreements: Array<{ need: string; pattern: string; signal_id: string; reason: string }> = [];
/** SP-578: every nomination the judge voided. Listed HERE and never under SP-523 (SP-585): that list
 *  says "already fail-closed by SP-493", and a voided nomination drops nothing. */
const sp578Voided: Array<{ need: string; pattern: string; signal_id: string; reason: string }> = [];
/** SP-536: every part whose wording contains "and" or "or", LISTED for review. Never a gate. */
const conjunctionParts: string[] = [];
/** SP-543: every claim this run KEPT, by need, for the near-synonym measurement. */
const keptClaims: Array<{ need: string; claim: string; parts: string[] }> = [];
/** SP-535: the accounting — left-over quotes with their clauses, and what did not add up. */
let leftOverReasks = 0;
const leftOverAll: string[] = [];
const accountingGaps: string[] = [];
/** SP-514: span re-asks made, and how many recovered a part the first answer mis-transcribed. */
let spanReasks = 0, spanReaskRecovered = 0, spanReaskFailedTwice = 0;
/** SP-517: judge answers that could not be parsed. Failed closed, counted, reported. */
let unreadableVerdicts = 0;
/** SP-494, now per PART: how often a part's span failed to verify. (The keyword flag was removed by
 *  SP-504 and the column dropped by SP-506.) */
let spanRejects = 0;
/** SP-493: patterns dropped because the judge ruled the CLAIM states another need's problem. */
let foreignNeedDrops = 0;
/** SP-507: per-part verdict rows written, and how many of them said the part is stated. */
let partVerdicts = 0, partVerdictsStated = 0;
const refusedNeeds: Array<{ key: string; why: string }> = [];
/** SP-542: every claim dropped on its own account, named with its kind and reason. A dropped claim is
 *  a finding about the generator, so it is reported per run — never a silent discard and never, since
 *  SP-542, a reason to lose the need. */
const droppedClaims: Array<{ need: string; polarity: string; d: DroppedClaim; reaskWhy: string; answer: string }> = [];
/** SP-618(c): record claims that never reach the judge loop — the claims of an answer that was refused
 *  or not adopted, a claim its re-ask replaced, an exact duplicate — so no claim leaves the run without
 *  a class. `answer` is the generator answer that wrote it. */
const recordUnjudged = (need: string, polarity: string, answer: string, claim: string, parts: readonly string[], dropReason: string) => {
  claimOutcomes.push(claimOutcome({ need, polarity, claim, identity: null, parts, kept: false, dropReason, cited: 0, judged: 0, supporting: 0, answer }));
};
const recordAnswerClaims = (need: string, polarity: string, answer: string, content: string, dropReason: (claim: string) => string): number => {
  const raw = rawClaimsWritten(content);
  if (raw === null) { console.log(`           SP-618: answer ${answer} carries no readable \`patterns\` array — no claim of it can be listed`); return 0; }
  for (const c of raw) recordUnjudged(need, polarity, answer, c.claim, c.parts, dropReason(c.claim));
  return raw.length;
};
/** SP-634: a FIELD re-ask's answer names one claim's field, so it wrote one claim — recorded under the
 *  claim it was about when its answer could not be taken. */
const recordFieldAnswer = (need: string, polarity: string, answer: string, content: string, claim: string, dropReason: string) => {
  try { parseFieldReask(content); } catch { console.log(`           SP-618: answer ${answer} is not readable — nothing of it can be listed`); return; }
  recordUnjudged(need, polarity, answer, claim, [], dropReason);
};
/** SP-618(b): what each accounting re-ask did, for the report. */
const accountReasks: Array<{ need: string; polarity: string; adopted: boolean; before: number; after: number; of: number;
  adoptedLeftOver: number; nominated: number; orphaned: Array<{ label: string; signalId: string; claim: string }>; secondSame: number; secondNew: number }> = [];
let nestedLeftOverAnswers = 0;
/** SP-628: every part that joined two things with "and"/"or", and what its one re-ask did. */
const conjunctionHits: Array<{ need: string; polarity: string; claim: string; part: string; outcome: string; after: string; afterPart: string; why: string }> = [];
/** SP-634: every per-claim re-ask, with the field it was allowed to change and what was taken. */
const fieldReasks: Array<{ need: string; polarity: string; attempt: string; kind: string; mayChange: string; took: string; widened: boolean; quotesKept: number; nominationsKept: number; before: string; after: string; ok: boolean }> = [];
/** SP-635: every split — the original, its halves, and where each of the original's quotes went. */
const splitRecords: Array<{ need: string; polarity: string; attempt: string; original: string; originalPart: string; outcome: string; why: string;
  halves: Array<{ claim: string; part: string; assigned: string[]; carried: string[]; nominated: string[]; foreign: string[] }> }> = [];
/** SP-638: every judged claim's vote, and every quote that stated the part of a KEPT claim while its
 *  own belongs answer was no — outvoted, and not counted as support. */
const sp638Decisions: Array<{ need: string; claim: string; d: BelongsDecision; newOutcome: string; oldOutcome: string }> = [];
const sp638Outvoted: Array<{ need: string; claim: string; signalId: string; reason: string }> = [];
/** SP-635: split halves added per pass, outside the ceiling. */
const splitAdds: Array<{ need: string; polarity: string; added: number }> = [];
/** SP-546: the per-claim re-asks — how many were spent, how many recovered the claim. */
let claimReasks = 0, claimReaskRecovered = 0, claimReaskFailed = 0;
const recoveredClaims: Array<{ need: string; polarity: string; kind: string; before: string; after: string }> = [];
/** SP-547: every left-over entry whose `belongs_to` named a claim, resolved or not. */
const promotedQuotes: Array<{ need: string; polarity: string; label: string; signalId: string; belongsTo: number; claim: string; resolved: boolean; why: string; fromRewrite?: boolean }> = [];
/** SP-569: the quotes that reach a claim through `belongs_to` ALONE, per claim. They are judged LAST,
 *  and only once the claim has a supporting quote of its own — a left-over quote can only become a
 *  citation on a kept claim. Keyed by `belongsToClaimKey(need, polarity, claim)`. */
const deferredByClaim = new Map<string, Set<string>>();
/** SP-569: what became of every claim the judge loop saw, recorded at each of its exits. The SP-547
 *  summary is computed from THIS at the end of the run, so its counts are true when they are printed.
 *  A decomposition rewrite (SP-553) is a different claim and never overwrites its original's fate. */
const claimFates = new Map<string, ClaimFate>();
/** SP-616: the fate of every REWRITE the judge loop saw, kept apart so it cannot overwrite its
 *  original's. A `belongs_to` entry from a decomposition answer is resolved against this map. */
const rewriteFates = new Map<string, ClaimFate>();
/** SP-551: every claim the ceiling CUT, with its polarity and its text. Brief 6 measured a whole
 *  polarity pass deleted by `slice` with no line of output; a cut is now a reported fact of the run. */
const ceilingCuts: Array<{ need: string; polarity: string; claim: string; parts: string[]; answer: string }> = [];
/** SP-552: every claim whose polarity was not its pass's, and what became of it after the one re-ask. */
const polarityMismatches: Array<{ need: string; polarity: string; claim: string; why: string; recovered: boolean; after: string }> = [];
/** SP-553: every decomposition re-ask — the original, the split the verdicts showed, the rewrite. */
type Decomposition = {
  need: string; polarity: string; original: string; originalParts: string[];
  stated: Array<{ ordinal: number; part: string; signalIds: string[] }>;
  unstated: Array<{ ordinal: number; part: string }>;
  rewrite: Array<{ claim: string; parts: string[]; cited: number }>;
  dropped: Array<{ claim: string; why: string }>;
  failWhy: string;
};
const decompositions: Decomposition[] = [];
/** SP-553: what the judge then said about each rewrite. Filled at the keep/drop sites below, so the
 *  report can say "recovered or not" from the verdicts rather than from the fact a rewrite parsed. */
const decompositionOutcomes: Array<{ need: string; rewriteOf: string; claim: string; parts: string[]; kept: boolean; supporting: number; cited: number; byPart: string }> = [];
let decompositionReasks = 0, decompositionRecovered = 0, decompositionFailed = 0, decompositionNoTrigger = 0;
let genProvider = "", genModel = "";
const perNeed: Array<{ key: string; counted: number; patterns: number; ceilingHit: boolean; proposed: number; assigned: number; unassigned: number; polarities: Record<string, number> }> = [];
/** SP-532: needs the operator named that turned out to have nothing to judge. A non-empty list is a
 *  failing run, not a run with a note. */
const emptyNeeds: string[] = [];
const runStart = performance.now();

for (const need of needs) {
  const quotes = quotesByNeed.get(need.id) ?? [];
  console.log(`${need.key}  ${quotes.length} counted quote(s)  ${need.outcome.slice(0, 58)}`);
  // SP-532: a need with no counted quotes was SKIPPED here and the run still reported success. A run
  // that selects zero items for a need the operator named is a vacuous pass: it proves nothing about
  // that need and reads as if it did. It is now counted, and the run FAILS at the end if any named
  // need produced nothing to judge.
  if (quotes.length === 0) {
    console.log("    FAIL (SP-532): no counted quotes — this need was NAMED and nothing was selected for it\n");
    emptyNeeds.push(need.key);
    continue;
  }
  // SP-652: this need's binding — its row, its wording, its counted quotes in order — as this run sees
  // it. A replay checks it against the saved run's before anything is replayed.
  {
    const bt = bindingTexts(need.outcome, quotes);
    const today: NeedBinding = { need_id: need.id, wording_md5: await md5OfText(bt.wording), counted_md5: await md5OfText(bt.counted), counted: quotes.length };
    runBindings[need.key] = today;
    if (judgeReplay) {
      try {
        const src = judgeReplay.checkBinding(need.key, today);
        if (src === "absent" && !ledgerProof) throw new ReplayRefusal("binding_absent", `${need.key}: the pairs file records no binding for this need (it was written before SP-652) and no --bind-by-ledger window was given — it cannot be bound to today's wording and counted quotes`);
        bindingSource[need.key] = src === "file" ? "file" : "ledger";
      } catch (e) { refuseReplay(e); }
      console.log(`    SP-652 binding: ${bindingSource[need.key] === "file" ? "the file's binding matches today's" : "no binding in the file — every prompt is checked against the saved run's ledger rows"} · wording md5 ${today.wording_md5} · ${today.counted} counted quotes md5 ${today.counted_md5}`);
    }
  }
  // ── SP-470: ONE PASS PER POLARITY ─────────────────────────────────────────────────────────────
  // "positive and mixed patterns are produced separately" read as its strongest sense: their OWN
  // generator call, over their own quotes. The single-pass v2 run proved the weaker reading does not
  // work — asked for all three polarities at once over N13's 44 quotes, the generator returned seven
  // 'not working' patterns and nothing else, leaving all 4 working and all 3 mixed quotes unassigned.
  // A model given 37 complaints and 4 compliments writes about the complaints.
  //
  // Measured polarity on the five needs: 202 'not working', 16 'working', 5 'mixed', 0 unlabelled.
  // A quote with NO stored polarity would get no pass and stay unassigned — reported, not guessed
  // into a polarity it does not carry.
  const byPolarity = new Map<QuotePolarity, PatternQuote[]>();
  for (const qt of quotes) {
    if (qt.polarity == null) continue;
    (byPolarity.get(qt.polarity) ?? byPolarity.set(qt.polarity, []).get(qt.polarity)!).push(qt);
  }
  const unlabelled = quotes.filter((x) => x.polarity == null);
  if (unlabelled.length) console.log(`    note   ${unlabelled.length} quote(s) carry no polarity — no pass covers them`);

  const byId = new Map(quotes.map((x) => [x.signalId, x]));
  /** SP-618(c): `answer` is the generator answer that wrote the claim. */
  type Candidate = { name: string; parts: string[]; polarity: QuotePolarity; signalIds: string[]; representativeSignalId: string | null; identity: string; answer: string;
    /** SP-635: a half ADDED by a split rides with its first half and is not counted against the ceiling. */
    splitFirst?: Candidate };
  const candidates: Candidate[] = [];
  /** SP-551: the candidates OF EACH PASS, in the pass's own order and in the order the passes ran.
   *  The flat list cannot answer "whose claim was cut", which is the whole of SP-551. */
  const passCandidates: Candidate[][] = [];
  const byIdentity = new Map<string, Candidate>();
  let proposedTotal = 0;
  let collapsed = 0;
  let needRefused = "";

  for (const [polarity, pQuotes] of [...byPolarity].sort((a, b) => b[1].length - a[1].length)) {
    const labels = quoteLabels(pQuotes);
    const thisPass: Candidate[] = [];
    passCandidates.push(thisPass);
    // ONE BOUNDED RE-ASK per pass, and SP-515(2): THE RE-ASK SAYS WHAT TO FIX. The schema gate stays
    // absolute — a cut or over-long answer is a finding nobody can trace — but a single refusal must
    // not take the other needs with it: the first v2 run died on a 99-character name before P1, N15,
    // N14 and P2 ran at all.
    //
    // THE MEASURED BUG SP-515(2) FIXES: the old re-ask always said "shorten the wording, do not
    // generalise it". Against a subject-opener refusal that is useless advice, so the generator
    // returned the identical part and N13's whole `mixed` pass died — three mixed quotes unassigned
    // for a prompt bug. The guidance is now chosen by the refusal's KIND.
    let gen: Awaited<ReturnType<typeof call>> | null = null;
    let pass: ReturnType<typeof parseGeneratedPass> | null = null;
    let refusal = "", refusalKind = "";
    /** SP-618(c): the answer the pass's claims came from, and the claims a re-ask wrote in their place. */
    let passAnswer = "gen-1";
    const answerOf = new Map<ProposedPattern, string>();
    const candOf = new Map<ProposedPattern, Candidate>();
    for (let attempt = 1; attempt <= 2 && pass === null; attempt++) {
      const base = buildGeneratorUser(need.outcome, pQuotes);
      const guidance = refusalKind ? reaskGuidance(refusalKind, GEN_LIMITS) : "";
      const user = attempt === 1 ? base
        : `${base}\n\nYOUR PREVIOUS ANSWER WAS REFUSED: ${refusal}\n${guidance}\nAnswer again, fixing only that.`;
      gen = await call("generator", `${need.key}/${polarity}`, GEN_SYSTEM, user, false, `gen-${attempt}`);
      genAnswers.push({ need: need.key, polarity, attempt: `gen-${attempt}`, model: gen.model, system_md5: GEN_SYSTEM_MD5, content: gen.content });
      try { pass = parseGeneratedPass(gen.content, labels, [], GEN_LIMITS); passAnswer = `gen-${attempt}`; }
      catch (e) {
        refusal = e instanceof Error ? e.message : String(e);
        refusalKind = e instanceof GeneratorRefusal ? e.kind : "schema";
        // SP-618(c): the refused answer's claims are listed, not lost.
        recordAnswerClaims(need.key, polarity, `gen-${attempt}`, gen.content, () => `answer refused: ${refusalKind}`);
        console.log(`    ${attempt === 1 ? "re-ask" : "REFUSED"} ${polarity} (attempt ${attempt}) [${refusalKind}]: ${refusal.slice(0, 92)}`);
        if (attempt === 1) console.log(`           guidance: ${reaskGuidance(refusalKind, GEN_LIMITS).slice(0, 100)}`);
      }
    }
    if (pass === null || gen === null) { needRefused = refusal; continue; }
    let proposed = pass.patterns;
    // SP-618(a): a `left_over` list the model nested inside `patterns` was read — said so, every time.
    if (pass.nestedLeftOver) {
      nestedLeftOverAnswers++;
      console.log(`    SP-618(a): this answer nested its \`left_over\` list inside \`patterns\` (${pass.nestedLeftOver} list(s)) — read as the account, not as a claim`);
    }

    // SP-546: EACH refused claim gets ONE re-ask that names the exact failure, for that claim alone.
    // Measured reason (brief 5): SP-542's bare drop cost G-old's N14 five quotes against run 2, which
    // had recovered a better answer THROUGH the re-ask SP-542 skips, and 3 of brief 5's 4 drops were
    // the character caps — the most recoverable failure there is. The caps stay (SP-546); the claim
    // gets one chance to meet them. A recovered claim is a normal pattern from here on; one that
    // fails twice is dropped and named, exactly as SP-542 leaves it.
    // SP-634: the re-ask changes ONLY the field its refusal names. The claim's own quotes, its
    // representative and its nominations are the original's. It now runs BEFORE the accounting below:
    // a claim refused for its wording still holds its quotes, so they are accounted for — run 10
    // counted 22 of them "unaccounted" and spent an accounting re-ask on a wording fault.
    for (const d of pass.dropped) {
      const fieldReask = !reaskMayChange(d.kind).includes("quotes") && !!d.raw;
      const guidance = fieldReask ? fieldReaskGuidance(d.kind, GEN_LIMITS, polarity) : reaskGuidance(d.kind, GEN_LIMITS);
      const attemptKey = `claim-reask-${d.ordinal}`;
      claimReasks++;
      console.log(`    SP-546 re-ask claim ${d.ordinal} [${d.kind}] "${d.claim.slice(0, 48)}" — ${d.why.slice(0, 70)}`);
      console.log(`           SP-634: may change ${reaskMayChangeText(d.kind)}${fieldReask ? " — quotes, representative and nominations stay the original's" : ""}`);
      let recovered: ProposedPattern | null = null;
      let reaskContent: string | null = null;
      let took = "the whole claim", widened = false;
      try {
        const ownQ = fieldReask ? d.raw!.quotes.filter((l) => labels.has(l)).map((l) => ({ label: l, quote: byId.get(labels.get(l)!)! })).filter((x) => x.quote) : [];
        const again = await call("generator", `${need.key}/${polarity}`, GEN_SYSTEM,
          fieldReask ? buildFieldReask(need.outcome, d.raw!, d, guidance, ownQ) : buildClaimReask(need.outcome, pQuotes, d, guidance), false, attemptKey);
        genAnswers.push({ need: need.key, polarity, attempt: attemptKey, model: again.model, system_md5: GEN_SYSTEM_MD5, content: again.content, ...(fieldReask ? { field: true } : {}) });
        reaskContent = again.content;
        if (fieldReask) {
          const m = mergeFieldReask(d.raw!, parseFieldReask(again.content), d.kind, labels, proposed, GEN_LIMITS);
          recovered = m.pattern; took = m.took.join(" + "); widened = m.widened;
        } else recovered = parseReaskedClaim(again.content, labels, proposed, GEN_LIMITS);
      } catch (e) {
        const why = e instanceof Error ? e.message : String(e);
        claimReaskFailed++;
        droppedClaims.push({ need: need.key, polarity, d, reaskWhy: why, answer: passAnswer });
        // SP-618(c): what the failed re-ask itself wrote is listed too.
        if (reaskContent !== null) {
          if (fieldReask) recordFieldAnswer(need.key, polarity, attemptKey, reaskContent, d.claim, `generator refused: ${e instanceof GeneratorRefusal ? e.kind : "schema"}`);
          else recordAnswerClaims(need.key, polarity, attemptKey, reaskContent, () => `generator refused: ${e instanceof GeneratorRefusal ? e.kind : "schema"}`);
        }
        fieldReasks.push({ need: need.key, polarity, attempt: attemptKey, kind: d.kind, mayChange: reaskMayChangeText(d.kind), took: "", widened: false, quotesKept: 0, nominationsKept: 0, before: d.claim, after: "", ok: false });
        console.log(`           SP-546 re-ask FAILED [${e instanceof GeneratorRefusal ? e.kind : "schema"}]: ${why.slice(0, 84)} — claim DROPPED`);
        continue;
      }
      claimReaskRecovered++;
      // SP-618(c): the refused original is REPLACED by its re-ask's claim, and recorded as that.
      recordUnjudged(need.key, polarity, passAnswer, d.claim, [], `replaced by its re-ask: ${d.kind}`);
      answerOf.set(recovered, attemptKey);
      proposed = [...proposed, recovered];
      pass.patterns = proposed;
      const ownKept = recovered.citedLabels.length;
      // SP-634: the nominations that named this claim by its number follow it to the recovered claim.
      const adopted = adoptNominationsForRecovered(pass, d.ordinal, recovered, labels);
      fieldReasks.push({ need: need.key, polarity, attempt: attemptKey, kind: d.kind, mayChange: reaskMayChangeText(d.kind), took, widened, quotesKept: ownKept, nominationsKept: adopted.length, before: d.claim, after: recovered.name, ok: true });
      console.log(`           SP-546 RECOVERED: "${recovered.name}" (${recovered.name.length} chars, ${recovered.parts.length} part(s), ${ownKept} quote(s)${fieldReask ? " — the original's" : ""}${adopted.length ? `, ${adopted.length} nomination(s) follow it: ${adopted.join(" ")}` : ""})`);
      console.log(`           SP-634: took ${took}${widened ? " — WIDENED: another field of the original was also over a bound, so the re-ask's wording was taken for it too" : ""} · part "${recovered.parts.join(" · ")}"`);
      recoveredClaims.push({ need: need.key, polarity, kind: d.kind, before: d.claim, after: recovered.name });
    }
    // SP-535: THE ACCOUNTING EARNS ONE RE-ASK, then is reported as it stands. Never a gate on the
    // patterns: an answer that placed its quotes well and accounted badly keeps its patterns.
    let account = accountForQuotes(labels, proposed, pass.leftOver);
    if (account.missing.length || account.both.length || account.duplicatedLeftOver.length) {
      console.log(`    accounting incomplete: ${account.missing.length} unaccounted, ${account.both.length} in both, ${account.duplicatedLeftOver.length} listed twice — one re-ask (SP-535)`);
      const detail = [
        account.missing.length ? `  NOT accounted for: ${account.missing.join(", ")}` : "",
        account.both.length ? `  cited AND left over: ${account.both.join(", ")}` : "",
        account.duplicatedLeftOver.length ? `  listed twice in left_over: ${account.duplicatedLeftOver.join(", ")}` : "",
      ].filter(Boolean).join("\n");
      leftOverReasks++;
      const again: Awaited<ReturnType<typeof call>> = await call("generator", `${need.key}/${polarity}`, GEN_SYSTEM,
        `${buildGeneratorUser(need.outcome, pQuotes)}\n\nYOUR PREVIOUS ANSWER'S ACCOUNT IS INCOMPLETE:\n${detail}\n${LEFT_OVER_REASK}`,
        false, "account-reask");
      genAnswers.push({ need: need.key, polarity, attempt: "account-reask", model: again.model, system_md5: GEN_SYSTEM_MD5, content: again.content });
      // SP-618(b): THE RE-ASK GIVES AN ACCOUNT, NEVER CLAIMS. The first answer's claims and citations
      // stand whatever the second answer wrote; the second answer is read only for where it puts each
      // label the first left unaccounted (`completeAccountFromReask`). Run 8 took the second answer
      // WHOLE and lost N13's seven first-answer claims with no drop class.
      try {
        const re = parseGeneratedPass(again.content, labels, [], GEN_LIMITS);
        const merged = completeAccountFromReask(labels, pass, re);
        const reAcc = accountForQuotes(labels, merged.pass.patterns, merged.pass.leftOver);
        const adopted = reAcc.accounted > account.accounted;
        accountReasks.push({ need: need.key, polarity, adopted, before: account.accounted, after: reAcc.accounted, of: labels.size,
          adoptedLeftOver: merged.adoptedLeftOver.length, nominated: merged.nominated.length,
          orphaned: merged.orphaned.map((o) => ({ label: o.label, signalId: labels.get(o.label) ?? "", claim: o.claim })),
          secondSame: merged.secondSame.length, secondNew: merged.secondNew.length });
        console.log(`           SP-618(b): the re-ask wrote ${re.patterns.length + re.dropped.length} claim(s) — ${merged.secondSame.length} with a first-answer claim's text, ${merged.secondNew.length} new. NONE is taken; the first answer's ${pass.patterns.length} claim(s) stand.`);
        console.log(`           SP-618(b): account ${account.accounted} → ${reAcc.accounted} of ${labels.size}: ${merged.adoptedLeftOver.length} left over with the re-ask's reason · ${merged.nominated.length} nominated for a claim both answers have · ${merged.orphaned.length} cited only under a claim the first answer does not have (stay unaccounted) · ${merged.stillMissing.length} in neither answer`);
        for (const o of merged.orphaned) console.log(`           SP-618(b) ORPHAN ${o.label} ${(labels.get(o.label) ?? "").slice(0, 8)} — the re-ask cited it under "${o.claim.slice(0, 70)}", which the first answer does not have`);
        if (adopted) {
          // The merge returns COPIES of the patterns. A claim recovered by its SP-546 re-ask (which now
          // runs before this) keeps the answer it came from.
          const prev = proposed;
          pass = merged.pass; proposed = pass.patterns; account = reAcc;
          prev.forEach((old, i) => { const a = answerOf.get(old); if (a && proposed[i]) answerOf.set(proposed[i], a); });
        }
        else console.log(`           re-ask completed nothing (${reAcc.accounted} of ${labels.size}, not better than ${account.accounted}) — the first answer stands as it was`);
        // SP-618(c): every claim the re-ask wrote is recorded as REPLACED — it was written and not taken.
        const firstClaims = new Set(merged.secondSame);
        recordAnswerClaims(need.key, polarity, "account-reask", again.content,
          (claim) => `accounting re-ask: claims are never adopted (SP-618) — ${firstClaims.has(claim) ? "same claim text as the first answer's" : "not in the first answer"}`);
      } catch (e) {
        console.log(`           accounting re-ask refused (${e instanceof Error ? e.message.slice(0, 70) : e}); keeping the first answer`);
        recordAnswerClaims(need.key, polarity, "account-reask", again.content, () => `answer refused: ${e instanceof GeneratorRefusal ? e.kind : "schema"}`);
      }
    }
    if (account.missing.length || account.both.length || account.duplicatedLeftOver.length) {
      accountingGaps.push(`${need.key}/${polarity}: ${account.accounted}/${labels.size} accounted · unaccounted [${account.missing.join(" ")}] · both [${account.both.join(" ")}] · twice [${account.duplicatedLeftOver.join(" ")}]`);
    }
    // SP-628 + SP-635: "and" / "or" inside a part — checked, printed, re-asked ONCE, and the claim is
    // NEVER dropped for it (the SP-581 rule). SP-635: the re-ask returns ONE CLAIM PER PREDICATE and
    // puts each of the original's quotes under one or both; a quote it puts under neither is carried
    // to every half and the judge decides. Nominations follow the same rule. Refused, unchanged or
    // still joined, the ORIGINAL stands. Split halves are not counted against the ceiling.
    const splitExtraOf = new Map<ProposedPattern, ProposedPattern>();   // an added half → the first half
    if (CONJUNCTION_REASK) {
      let added = 0;
      for (let ci = 0; ci < proposed.length; ci++) {
        const c = proposed[ci];
        const joined = c.parts.find((pt) => CONJUNCTION_IN_PART.test(pt));
        if (joined === undefined) continue;
        const attemptKey = `split-reask-${ci + 1}`;
        const noms = pass.promoted.filter((pr) => pr.resolved && pr.claim === c.name);
        const nominatedLabels = noms.filter((pr) => !pr.alreadyCited).map((pr) => pr.label);
        const ownLabels = c.citedLabels.filter((l) => !nominatedLabels.includes(l));
        const ownQ = [...ownLabels, ...nominatedLabels].map((l) => ({ label: l, quote: byId.get(labels.get(l)!)! })).filter((x) => x.quote);
        console.log(`    SP-628 hit, claim ${ci + 1} "${c.name}" — part "${joined}" — one re-ask (SP-635: one claim per predicate); the claim is never dropped`);
        console.log(`           ${partConjunctionWhy(joined)} · ${ownLabels.length} own quote(s), ${nominatedLabels.length} nomination(s)`);
        let reaskContent: string | null = null;
        let res: ReturnType<typeof parseSplitReask> = { outcome: "refused", adopt: false, halves: [], why: "" };
        try {
          const again = await call("generator", `${need.key}/${polarity}`, GEN_SYSTEM,
            buildSplitReask(need.outcome, { ordinal: ci + 1 - added, name: c.name, part: joined, polarity: c.polarity }, ownQ), false, attemptKey);
          genAnswers.push({ need: need.key, polarity, attempt: attemptKey, model: again.model, system_md5: GEN_SYSTEM_MD5, content: again.content });
          reaskContent = again.content;
          res = parseSplitReask(again.content, labels, proposed.filter((_, j) => j !== ci), c, ownLabels, nominatedLabels, GEN_LIMITS);
        } catch (e) {
          res = { outcome: "refused", adopt: false, halves: [], why: e instanceof Error ? e.message : String(e) };
        }
        const halves: SplitHalf[] = res.halves;
        if (res.adopt) {
          recordUnjudged(need.key, polarity, answerOf.get(c) ?? passAnswer, c.name, c.parts, `replaced by its re-ask: ${PART_CONJUNCTION_KIND}`);
          // Nominations: the entries that named the original are replaced by one per half that holds the quote.
          pass.promoted = pass.promoted.filter((pr) => !noms.includes(pr));
          halves.forEach((h, hi) => {
            answerOf.set(h.pattern, attemptKey);
            if (hi > 0) splitExtraOf.set(h.pattern, halves[0].pattern);
            for (const pr of noms) {
              if (pr.alreadyCited ? h.pattern.citedLabels.includes(pr.label) && !halves.slice(0, hi).some((x) => x.pattern.citedLabels.includes(pr.label))
                                  : h.nominated.includes(pr.label)) {
                pass.promoted.push({ ...pr, claim: h.pattern.name });
              }
            }
          });
          proposed = [...proposed.slice(0, ci), ...halves.map((h) => h.pattern), ...proposed.slice(ci + 1)];
          pass.patterns = proposed;
          added += halves.length - 1;
          ci += halves.length - 1;   // a half is not checked again: one re-ask
        } else if (reaskContent !== null) {
          recordAnswerClaims(need.key, polarity, attemptKey, reaskContent,
            () => (res.outcome === "refused" ? "generator refused: schema" : `re-ask not adopted: ${res.outcome} — the original claim stands (SP-635)`));
        }
        conjunctionHits.push({ need: need.key, polarity, claim: c.name, part: joined, outcome: res.outcome,
          after: res.adopt ? halves.map((h) => h.pattern.name).join(" | ") : "", afterPart: res.adopt ? halves.map((h) => h.pattern.parts.join(" · ")).join(" | ") : "", why: res.why });
        splitRecords.push({ need: need.key, polarity, attempt: attemptKey, original: c.name, originalPart: joined, outcome: res.outcome, why: res.why,
          halves: halves.map((h) => ({ claim: h.pattern.name, part: h.pattern.parts.join(" · "),
            assigned: h.assigned.map((l) => (labels.get(l) ?? l).slice(0, 8)), carried: h.carried.map((l) => (labels.get(l) ?? l).slice(0, 8)),
            nominated: h.nominated.map((l) => (labels.get(l) ?? l).slice(0, 8)), foreign: h.foreign })) });
        if (res.adopt) {
          console.log(`           SP-635 ${res.outcome === "split" ? `SPLIT into ${halves.length}` : "REWRITTEN as one claim (all of the original's quotes stay)"}:`);
          for (const h of halves) {
            console.log(`             → "${h.pattern.name}" — part "${h.pattern.parts.join(" · ")}"`);
            console.log(`               assigned ${h.assigned.length} [${h.assigned.map((l) => (labels.get(l) ?? l).slice(0, 8)).join(" ")}] · carried ${h.carried.length} [${h.carried.map((l) => (labels.get(l) ?? l).slice(0, 8)).join(" ")}] · nominations ${h.nominated.length} [${h.nominated.map((l) => (labels.get(l) ?? l).slice(0, 8)).join(" ")}]${h.foreign.length ? ` · IGNORED ${h.foreign.length} label(s) that were not the original's: ${h.foreign.join(" ")}` : ""}`);
          }
        } else {
          console.log(`           SP-635 re-ask: ${res.outcome === "unchanged" ? "returned UNCHANGED — the original claim stands"
            : res.outcome === "still_joined" ? `still joins two things (${halves.map((h) => `"${h.pattern.parts.join(" · ")}"`).join(", ")}) — the ORIGINAL claim stands`
            : `REFUSED: ${res.why.slice(0, 90)} — the ORIGINAL claim stands`}`);
        }
      }
      if (added) splitAdds.push({ need: need.key, polarity, added });
    }
    const labelToId = labels;
    // SP-547: a left-over entry that named a claim is NOMINATED for that claim — `parseGeneratedPass`
    // has added it to the claim's cited labels. One that named a claim the generator never wrote (out
    // of range, or a claim SP-542/SP-546 dropped) stays left over, marked unresolved.
    // SP-569: a nomination is NOT yet a citation. Run 7 printed "→ cited under" here for two quotes
    // whose claim SP-493 then refused. The quote is deferred: judged after the claim's own citations,
    // and only if one of those supports the claim. What became of it is printed at the END of the run.
    for (const pr of pass.promoted) {
      const signalId = labelToId.get(pr.label) ?? "";
      promotedQuotes.push({
        need: need.key, polarity, label: pr.label, signalId,
        belongsTo: pr.belongsTo, claim: pr.claim, resolved: pr.resolved, why: pr.why,
      });
      if (pr.resolved && !pr.alreadyCited && signalId) {
        const k = belongsToClaimKey(need.key, polarity, pr.claim);
        (deferredByClaim.get(k) ?? deferredByClaim.set(k, new Set()).get(k)!).add(signalId);
      }
      console.log(`    SP-547 belongs_to ${pr.belongsTo} ${pr.resolved ? "→ NOMINATED for" : "UNRESOLVED (no such claim) —"} ` +
        `${pr.resolved ? `"${pr.claim.slice(0, 48)}"` : "left over"}  ${pr.label} ${signalId.slice(0, 8)}` +
        `${pr.resolved ? (pr.alreadyCited ? "  (already one of its own citations)" : "  (SP-569: judged only if the claim keeps a quote of its own)") : ""}`);
    }
    for (const l of pass.leftOver) {
      leftOverAll.push(`${need.key}/${polarity} ${(labelToId.get(l.label) ?? "").slice(0, 8)} ${l.label}` +
        `${l.belongsTo === null ? "" : ` [belongs_to ${l.belongsTo}, UNRESOLVED]`}: ${l.why || "(NO REASON GIVEN)"}`);
    }
    // SP-536: the and/or parts are LISTED, never gated. No re-ask is spent on them.
    for (const c of partsWithConjunction(proposed)) {
      conjunctionParts.push(`${need.key}/${polarity} "${c.name.slice(0, 44)}" part ${c.ordinal}: "${c.part}"`);
    }
    genProvider = gen.provider; genModel = gen.model;
    proposedTotal += proposed.length;

    for (let ci = 0; ci < proposed.length; ci++) {
      let c = proposed[ci];
      // SP-552: THE POLARITY MISMATCH IS NAMED, PRINTED AND RE-ASKED — never a bare `continue`.
      //
      // What stood here was `const own = …filter(…); if (own.length === 0) continue;`, justified as a
      // floor that could not fire. It fired. Brief 6 measured N13's `mixed` pass writing a sound claim
      // over its three mixed quotes and labelling it `"polarity": "not working"`, so every quote it
      // cited was "another polarity's" and the claim disappeared without a word. The check is kept —
      // a pattern carries ONE polarity (SP-470) — and it now earns the SP-546 re-ask like any other
      // fixable refusal, with the claim dropped and named if the re-ask fails too.
      const mismatch = polarityRefusal(c, polarity, (id) => byId.get(id)?.polarity ?? null);
      if (mismatch) {
        const d: DroppedClaim = { ordinal: ci + 1, claim: c.name, kind: mismatch.kind, why: mismatch.message };
        console.log(`    SP-552 polarity refusal, claim ${d.ordinal} [${mismatch.kind}] "${c.name.slice(0, 48)}"`);
        console.log(`           ${mismatch.message.slice(0, 118)}`);
        claimReasks++;
        let recovered: ProposedPattern | null = null;
        let failWhy = "", failKind = "schema";
        let reaskContent: string | null = null;
        // SP-634: the polarity re-ask may change the label and the wording that states it. The claim's
        // quotes, representative and nominations are kept.
        const repLabel = [...labels].find(([l, id]) => id === c.representativeSignalId && c.citedLabels.includes(l))?.[0] ?? "";
        const rawC: RawClaim = { claim: c.name, parts: [...c.parts], polarity: c.polarity, quotes: [...c.citedLabels], representative: repLabel };
        console.log(`           SP-634: may change ${reaskMayChangeText("polarity_mismatch")} — quotes, representative and nominations stay the original's`);
        try {
          const again = await call("generator", `${need.key}/${polarity}`, GEN_SYSTEM,
            buildFieldReask(need.outcome, rawC, d, fieldReaskGuidance("polarity_mismatch", GEN_LIMITS, polarity),
              c.citedLabels.map((l) => ({ label: l, quote: byId.get(labels.get(l)!)! })).filter((x) => x.quote)), false, `polarity-reask-${d.ordinal}`);
          genAnswers.push({ need: need.key, polarity, attempt: `polarity-reask-${d.ordinal}`, model: again.model, system_md5: GEN_SYSTEM_MD5, content: again.content, field: true });
          reaskContent = again.content;
          const merged = mergeFieldReask(rawC, parseFieldReask(again.content), "polarity_mismatch", labels, proposed.filter((_, j) => j !== ci), GEN_LIMITS);
          const cand = merged.pattern;
          fieldReasks.push({ need: need.key, polarity, attempt: `polarity-reask-${d.ordinal}`, kind: "polarity_mismatch", mayChange: reaskMayChangeText("polarity_mismatch"), took: merged.took.join(" + "), widened: merged.widened, quotesKept: cand.citedLabels.length, nominationsKept: 0, before: c.name, after: cand.name, ok: true });
          // The re-ask faces the SAME gate it failed. A rewrite that is still the wrong polarity is
          // not a recovery, and accepting it would put the mismatch back in silently.
          const still = polarityRefusal(cand, polarity, (id) => byId.get(id)?.polarity ?? null);
          if (still) throw still;
          recovered = cand;
        } catch (e) {
          failWhy = e instanceof Error ? e.message : String(e);
          failKind = e instanceof GeneratorRefusal ? e.kind : "schema";
        }
        if (!recovered) {
          claimReaskFailed++;
          droppedClaims.push({ need: need.key, polarity, d, reaskWhy: failWhy, answer: answerOf.get(c) ?? passAnswer });
          if (reaskContent !== null) recordFieldAnswer(need.key, polarity, `polarity-reask-${d.ordinal}`, reaskContent, c.name, `generator refused: ${failKind}`);
          polarityMismatches.push({ need: need.key, polarity, claim: c.name, why: mismatch.message, recovered: false, after: "" });
          console.log(`           SP-552 re-ask FAILED: ${failWhy.slice(0, 96)} — claim DROPPED`);
          continue;
        }
        claimReaskRecovered++;
        recoveredClaims.push({ need: need.key, polarity, kind: "polarity_mismatch", before: c.name, after: recovered.name });
        polarityMismatches.push({ need: need.key, polarity, claim: c.name, why: mismatch.message, recovered: true, after: recovered.name });
        console.log(`           SP-552 RECOVERED: "${recovered.name}" [${recovered.polarity}] (${recovered.parts.length} part(s), ${recovered.citedLabels.length} quote(s))`);
        // SP-618(c): the mislabelled original is REPLACED by its re-ask's claim, and recorded as that.
        recordUnjudged(need.key, polarity, answerOf.get(c) ?? passAnswer, c.name, c.parts, "replaced by its re-ask: polarity_mismatch");
        answerOf.set(recovered, `polarity-reask-${d.ordinal}`);
        // SP-634: a nomination named the claim, not its wording — it follows a renamed claim.
        if (recovered.name !== c.name) {
          const kOld = belongsToClaimKey(need.key, polarity, c.name), kNew = belongsToClaimKey(need.key, polarity, recovered.name);
          const dset = deferredByClaim.get(kOld);
          if (dset) { deferredByClaim.delete(kOld); deferredByClaim.set(kNew, dset); }
          for (const pq of promotedQuotes) if (pq.need === need.key && pq.polarity === polarity && pq.claim === c.name) pq.claim = recovered.name;
        }
        if (splitExtraOf.has(c)) { splitExtraOf.set(recovered, splitExtraOf.get(c)!); }
        for (const [k, v] of splitExtraOf) if (v === c) splitExtraOf.set(k, recovered);
        c = recovered;
      }
      const own = c.signalIds.filter((id) => byId.get(id)?.polarity === polarity);
      const cAnswer = answerOf.get(c) ?? passAnswer;
      if (own.length === 0) { recordUnjudged(need.key, polarity, cAnswer, c.name, c.parts, "cited nothing"); continue; }   // unreachable after the gate above; kept as the floor it was
      // SP-509: the identity covers the parts, so two patterns with the same claim and different
      // predicates are two patterns — and the collapse below only merges what is genuinely identical.
      const identity = await patternIdentity(need.id, c.name, c.parts);
      const seen = byIdentity.get(identity);
      if (seen) {
        // EXACT DUPLICATE COLLAPSE. Two patterns with the same normalised name ARE one pattern —
        // that is what pattern_identity means — so they are merged by unioning their quotes rather
        // than written twice. The first v2 run proved this is not hypothetical: P1's generator
        // returned "Outages are frequent and can last for days…" THREE times, with the same 20
        // citations, and the unique index on pattern_identity refused the second insert and killed
        // the run. This is not SP-471's merge step: that is about distinct names describing one rule,
        // and this is the same name twice.
        collapsed++;
        recordUnjudged(need.key, polarity, cAnswer, c.name, c.parts, "duplicate: identical (claim + parts) to a pattern this need already carries — merged into it");
        seen.signalIds = [...new Set([...seen.signalIds, ...own])];
        seen.representativeSignalId ??= c.representativeSignalId;
        continue;
      }
      const firstHalf = splitExtraOf.get(c);
      const cand: Candidate = { name: c.name, parts: c.parts, polarity, signalIds: own, representativeSignalId: c.representativeSignalId, identity, answer: cAnswer,
        ...(firstHalf && candOf.get(firstHalf) ? { splitFirst: candOf.get(firstHalf)! } : {}) };
      candOf.set(c, cand);
      byIdentity.set(identity, cand);
      candidates.push(cand);
      thisPass.push(cand);   // SP-551
    }
  }
  if (collapsed) console.log(`    note   ${collapsed} exact-duplicate pattern(s) collapsed by identity`);
  if (candidates.length === 0) {
    console.log(`    NEED REFUSED — no pattern survived the schema gate for ${need.key}\n`);
    refusedNeeds.push({ key: need.key, why: needRefused || "no pattern proposed" });
    continue;
  }
  if (GENERATE_ONLY) {
    console.log(`    GENERATE ONLY — ${candidates.length} candidate pattern(s), no judge call made:`);
    for (const c of candidates) {
      console.log(`      [${c.polarity}] "${c.name}"`);
      c.parts.forEach((pt, i) => console.log(`         part ${i + 1}: ${pt}${CONJUNCTION_IN_PART.test(pt) ? "   · contains and/or (listed, NOT gated — SP-536)" : ""}`));
      console.log(`         cites ${c.signalIds.length} quote(s)`);
    }
    const polCounts: Record<string, number> = {};
    for (const c of candidates) polCounts[c.polarity] = (polCounts[c.polarity] ?? 0) + 1;
    console.log(`    polarity passes that landed: ${JSON.stringify(polCounts)}`);
    // SP-557: per PASS here too, so the generation-only path reports the same fact as the judged one.
    perNeed.push({ key: need.key, counted: quotes.length, patterns: candidates.length,
      ceilingHit: Object.values(polCounts).some((n) => n >= CEILING),
      proposed: proposedTotal, assigned: 0, unassigned: quotes.length, polarities: polCounts });
    console.log("");
    continue;
  }
  // SP-557: THE CEILING IS PER POLARITY PASS, NOT PER NEED. `ceilingHit` is still recorded, and it
  // now means "some pass was at or over its own ceiling" — stored because it cannot be recovered
  // afterwards: 12 kept patterns and "the generator wanted more" look identical in the table.
  const livePasses = passCandidates.filter((x) => x.length > 0);
  // SP-635: the ceiling counts the claims as the generator wrote them. A half ADDED by a split is not
  // counted: it rides with its first half — kept if that is kept, cut if that is cut.
  const fillBase = applyCeilingPerPass(livePasses.map((ps) => ps.filter((c) => !c.splitFirst)), CEILING);
  const keptBase = new Set(fillBase.kept);
  const fill = {
    kept: livePasses.flatMap((ps) => ps.filter((c) => (c.splitFirst ? keptBase.has(c.splitFirst) : keptBase.has(c)))),
    cut: livePasses.flatMap((ps) => ps.filter((c) => !(c.splitFirst ? keptBase.has(c.splitFirst) : keptBase.has(c)))),
    perPass: fillBase.perPass,
  };
  const ceilingHit = fill.perPass.some((x) => x.kept + x.cut >= CEILING);
  const proposed = fill.kept;
  const splitAddedHere = livePasses.map((ps) => ps.filter((c) => c.splitFirst).length);
  console.log(`    SP-557 ceiling, PER PASS (${CEILING} each): ${proposed.length} kept of ${candidates.length} candidate(s) across ${livePasses.length} pass(es) — ` +
    fill.perPass.map((x, i) => `[${livePasses[i][0]?.polarity}] ${x.kept} kept${x.cut ? ` / ${x.cut} cut` : ""}${splitAddedHere[i] ? ` + ${splitAddedHere[i]} split half/halves outside the ceiling (SP-635)` : ""}`).join(" \u00b7 "));
  if (ceilingHit) console.log(`    \u26a0 ceiling: a pass proposed ${Math.max(...fill.perPass.map((x) => x.kept + x.cut))} patterns, at or over its own ceiling of ${CEILING}`);
  // SP-551's other half stands: every cut claim is printed, with its polarity and its claim text.
  if (fill.cut.length) {
    console.log(`    SP-557: ${fill.cut.length} claim(s) CUT by the per-pass ceiling of ${CEILING}:`);
    for (const c of fill.cut) {
      console.log(`           CUT [${c.polarity}] "${c.name}"  (${c.signalIds.length} quote(s) cited)`);
      ceilingCuts.push({ need: need.key, polarity: c.polarity, claim: c.name, parts: [...c.parts], answer: c.answer });
    }
  }

  // SP-656 (2026-11-24): the retire of this need's live patterns USED TO RUN HERE, before the judge loop,
  // in a statement of its own. A refusal or an error anywhere after it left the need with no live
  // pattern at all. It now runs inside the same begin … commit as the inserts (see `applyNeedSql`
  // below), so until the whole need is judged and checked NOTHING of the need's live set has moved.

  const assigned = new Set<string>();
  const usedRepresentative = new Set<string>();
  let keptHere = 0;   // per-need, not the run total — the summary below is per need
  const polarities: Record<string, number> = {};
  const writes: string[] = [];

  // SP-553: the patterns to judge are a QUEUE, not a fixed list. A decomposition rewrite is appended
  // and judged by THIS loop on a later turn — the alternative was a second copy of the judge call, the
  // span re-ask, the shadow queue and the SP-493 handling, which is exactly the drift _shared exists
  // to prevent. `rewriteOf` carries the original's claim, and is what makes "one round only"
  // mechanical: a pattern that is itself a rewrite is never decomposed again.
  type Judgeable = Candidate & { rewriteOf?: string };
  const queue: Judgeable[] = [...proposed];
  for (let qi = 0; qi < queue.length; qi++) {
    const p = queue[qi];
    // SP-569: the claim's OWN citations first, the `belongs_to` nominations last. A rewrite (SP-553)
    // is a new claim with its own citations, so it has no nominations of its own.
    const fateKey = belongsToClaimKey(need.key, p.polarity, p.name);
    const nominated = p.rewriteOf ? new Set<string>() : (deferredByClaim.get(fateKey) ?? new Set<string>());
    const split569 = splitDeferredCitations(p.signalIds, nominated);
    let cited = [...split569.own, ...split569.deferred].map((id) => byId.get(id)!).filter(Boolean);
    const notJudged569 = new Set<string>();
    const voided578 = new Set<string>();
    /** SP-569: record this claim's fate at whichever exit it takes. SP-616: a rewrite's goes to
     *  `rewriteFates`, never to `claimFates`. */
    const setFate = (kept: boolean, dropReason: string, vs: ReadonlyArray<{ q: PatternQuote; supports: boolean }>) => {
      (p.rewriteOf ? rewriteFates : claimFates).set(fateKey, { kept, dropReason, judgedSignalIds: vs.map((v) => v.q.signalId), supportingSignalIds: vs.filter((v) => v.supports).map((v) => v.q.signalId), voidedSignalIds: [...voided578] });
    };
    /** SP-609: this claim's outcome for --pairs-json, at whichever exit it takes — rewrites included. */
    /** SP-638: this claim's vote, set once its own citations are judged; null for a claim never judged. */
    let voteRec: ClaimOutcome["sp638"] | null = null;
    const recordOutcome = (kept: boolean, dropReason: string, vs: ReadonlyArray<{ supports: boolean }>, citedN: number, strength: string | null = null) => {
      claimOutcomes.push({ ...claimOutcome({ need: need.key, polarity: p.polarity, claim: p.name, identity: p.identity, parts: p.parts, rewriteOf: p.rewriteOf ?? null,
        kept, dropReason, cited: citedN, judged: vs.length, supporting: vs.filter((x) => x.supports).length, strength, answer: p.answer }),
        ...(voteRec ? { sp638: voteRec } : {}) });
    };
    if (cited.length === 0) { patternsDropped++; setFate(false, "cited nothing", []); recordOutcome(false, "cited nothing", [], 0); console.log(`    drop   (cited nothing)  "${p.name.slice(0, 44)}"`); continue; }

    // SP-475(d): ONE quote per judge call. The judge never sees the pattern's other quotes, so its
    // verdict on this quote cannot depend on them. SP-502: and within that call, a verdict per PART.
    // SP-638: `supports` is the EFFECTIVE support — every part stated AND the judge's own belongs answer
    // on this quote is yes. `statesAll` and `belongs` are the two answers it is made of.
    const verdicts: Array<{ q: PatternQuote; supports: boolean; statesAll: boolean; belongs: boolean; nominated: boolean; reason: string; notStated: string[]; parts: PartVerdict[] }> = [];
    const noVerdict638: string[] = [];
    /** SP-638: the vote over the claim's OWN citations judged so far. */
    const voteNow = () => decideBelongs([
      ...verdicts.filter((x) => !x.nominated).map((x) => ({ signalId: x.q.signalId, statesAll: x.statesAll, belongs: x.belongs as boolean | null })),
      ...noVerdict638.map((id) => ({ signalId: id, statesAll: false, belongs: null })),
    ]);
    for (const qt of cited) {
      // SP-569: a nominated quote is judged only once the claim has a supporting quote OF ITS OWN.
      // The nominations come last in `cited`, so every own citation has its verdict by now. A claim
      // that keeps nothing of its own is dropped below with the nomination never judged — it cannot
      // be the quote that makes the claim, because it can only become a citation on a kept claim.
      // SP-638: the nominations come after every own citation, so the claim's vote is complete by
      // now. A claim the vote refuses judges no nomination either.
      if (nominated.has(qt.signalId) && (!verdicts.some((x) => x.supports) || voteNow().refused)) {
        notJudged569.add(qt.signalId);
        console.log(`           SP-569 nomination ${qt.signalId.slice(0, 8)} NOT judged — ${voteNow().refused ? "the claim is refused on its own citations (SP-638)" : "the claim kept none of its own citations"}`);
        continue;
      }
      let v: JudgeVerdict;
      if (JUDGE_MODE === "b") {
        // SP-510 judge B: one call per part, nothing else in the call. `belongsToNeed` is not asked —
        // it is a judgement about the CLAIM, and B is given one part at a time, so it is not in a
        // position to answer it. It stays true here rather than being inferred from a part's verdict.
        const parts: PartVerdict[] = [];
        for (let i = 0; i < p.parts.length; i++) {
          const jb = await call("judge", need.key, JUDGE_B_SYSTEM, buildJudgeBUser(need.outcome, p.name, p.parts[i], qt), true);
          parts.push(parseJudgeBOne(jb.content, qt.quote, i + 1));
        }
        const notStated = p.parts.filter((_, i) => !parts[i].states);
        v = { supports: notStated.length === 0, parts, belongsToNeed: true, belongsField: "not_asked", reason: parts.find((x) => x.states)?.reason ?? "", notStated };
      } else {
        // SP-494 + SP-514, as ONE policy in _shared (judgeAWithReask): the call, the bounded span
        // re-ask, and the merge. `supports` is still COMPUTED from the per-part verdicts and a
        // verbatim check on each span — never read off the model's answer. The runner and the two
        // instruments share this one implementation; three copies of a retry would be the drift.
        let res;
        try {
          if (judgeReplay) {
            // SP-652: the saved verdict, in place of the call. No span re-ask and no empty retry happen
            // here — the saved verdict is already the merged result of whichever of them the saved run made.
            let hit: ReturnType<JudgeReplay["verdict"]>;
            try {
              hit = judgeReplay.verdict({ need: need.key, identity: p.identity, signalId: qt.signalId, claim: p.name, parts: p.parts, quote: qt.quote });
              if (ledgerProof) ledgerProof.consume("judge", await md5OfText((JUDGE_SYSTEM_OVERRIDE ?? JUDGE_SYSTEM) + "\n" + buildJudgeUser(need.outcome, p.name, p.parts, qt)), `${need.key} "${p.name.slice(0, 40)}" / ${qt.signalId.slice(0, 8)}`);
            } catch (e) { refuseReplay(e); }
            judgeReplayed++;
            res = { verdict: hit.verdict, calls: 0, reasked: [] as number[], recovered: 0, failedTwice: 0 };
          } else
          res = await judgeAWithReask({
            needStatement: need.outcome, name: p.name, parts: p.parts, quote: qt,
            // SP-556: every judge call of this pair — the first one and the SP-514 span re-ask alike —
            // goes through the empty-answer retry, because either can come back empty. Each attempt is
            // a real `call(...)`, so each has its own ledger row and its own line.
            call: (system, user) => callJudgeWithEmptyRetry({
              system, user, first: JUDGE_NP, retry: JUDGE_NUM_PREDICT_RETRY,
              call: async (sys, usr, np) => {
                judgeNumPredictNow = np;
                try { return (await call("judge", need.key, sys, usr, true)).content; }
                finally { judgeNumPredictNow = JUDGE_NP; }
              },
              onEmpty: ({ recovered }) => {
                judgeEmptyFirst++;
                if (recovered) {
                  judgeEmptyRecovered++;
                  console.log(`           SP-556 EMPTY answer on ${qt.signalId.slice(0, 8)} — RECOVERED by the one retry at num_predict ${JUDGE_NUM_PREDICT_RETRY}`);
                } else {
                  judgeEmptyFailed.push({ need: need.key, signalId: qt.signalId, pattern: p.name });
                  console.log(`           SP-556 EMPTY answer on ${qt.signalId.slice(0, 8)} TWICE — FAILED CLOSED: "${p.name.slice(0, 54)}"`);
                }
              },
            }),
            // SP-545: absent ⇒ the LIVE prompt (cure B). `--judge-system=pre545` asks the prompt that
            // was live until 2026-11-22, for comparison only.
            ...(JUDGE_SYSTEM_OVERRIDE ? { system: JUDGE_SYSTEM_OVERRIDE } : {}),
          });
        } catch (e) {
          // SP-556: empty twice. `onEmpty` has already named it and pushed it to `judgeEmptyFailed`,
          // so this quote fails CLOSED here — no verdict, no support — and the run continues. It is
          // NOT counted as an unreadable verdict: an answer that was never given and an answer that
          // could not be parsed are different faults, and both are reported.
          if (isEmptyAnswerError(e)) { if (!nominated.has(qt.signalId)) noVerdict638.push(qt.signalId); continue; }
          // An unreadable (cut) answer fails THIS quote closed and is counted, rather than taking the
          // whole run with it. A verdict that cannot be read is not support.
          if (!(e instanceof JudgeUnreadable)) throw e;
          unreadableVerdicts++;
          if (!nominated.has(qt.signalId)) noVerdict638.push(qt.signalId);
          console.log(`           UNREADABLE verdict for ${qt.signalId.slice(0, 8)}: ${e.message.slice(0, 80)}`);
          continue;
        }
        v = res.verdict;
        if (res.reasked.length) {
          spanReasks++; spanReaskRecovered += res.recovered; spanReaskFailedTwice += res.failedTwice;
          console.log(`           SP-514 span re-ask on part(s) ${res.reasked.join(", ")} of ${qt.signalId.slice(0, 8)}: ` +
            `${res.recovered} recovered, ${res.failedTwice} failed twice`);
        }
        // SP-522: the shadow is QUEUED here and run in ONE pass after every need, never interleaved.
        // MEASURED REASON, not a preference: this machine has 69 GB of unified memory, llama3:70b is
        // 40 GB resident and qwen3.6:35b 22.6 GB, and the Supabase stack holds several more. The two
        // judges do not fit at once, so alternating them per quote would make ollama evict and reload
        // a 40 GB model twice per quote — minutes of loading for seconds of judging. Queued, each
        // model is loaded once. The PAIRS are identical either way: same claim, same parts, same
        // quote, same prompt builder, same temperature 0 / seed 42 / num_predict 400 / think:false.
        // SP-537(b): queued UNCONDITIONALLY. The queue is the record of what the judge of record
        // judged; the shadow pass is one optional consumer of it, and --pairs-json is another.
        shadowQueue.push({ need: need.key, needStatement: need.outcome, name: p.name, identity: p.identity, parts: [...p.parts], quote: qt, recordParts: v.parts, belongs: pairBelongsFields(v) });
      }
      for (const pv of v.parts) { if (pv.rejected) spanRejects++; partVerdicts++; if (pv.states) partVerdictsStated++; }
      // SP-578: a false on a NOMINATED quote voids that nomination and nothing else. It is decided
      // before the SP-523 listing and before the verdict is kept, so a voided quote is in neither: it
      // cannot count as support even with every part stated, and it is listed under SP-578 only
      // (SP-585). SP-493 below is untouched for the claim's own citations.
      // SP-616: the claim's OWN supporting citations, apart from earlier nominations that supported.
      const sup616 = supportingByOrigin(verdicts.map((x) => ({ signalId: x.q.signalId, supports: x.supports })), nominated);
      const ownSupporting = sup616.own;
      if (belongsVerdictEffect({ belongsToNeed: v.belongsToNeed, nominated: nominated.has(qt.signalId), ownSupporting }) === "void_nomination") {
        voided578.add(qt.signalId);
        sp578Voided.push({ need: need.key, pattern: p.name, signal_id: qt.signalId, reason: v.reason });
        const queued = shadowQueue.at(-1);
        if (queued && queued.quote === qt && queued.identity === p.identity) queued.nominationVoided = true;
        console.log(`           ${voidedNominationLine(qt.signalId, v.reason, ownSupporting, sup616.nominated)}`);
        continue;
      }
      // SP-523, the ONLY form of overall/part disagreement this schema can carry: every part stated
      // with a verified span, and the claim's own top-level boolean saying the claim is not this
      // need's. It is ALREADY fail-closed — SP-493 drops the pattern below — so this counts and lists
      // it rather than adding a second rule. Nothing parses the reason text (SP-523).
      if (v.supports && !v.belongsToNeed) {
        sp523Disagreements.push({ need: need.key, pattern: p.name, signal_id: qt.signalId, reason: v.reason });
        console.log(`           SP-523 disagreement: every part stated, belongs_to_this_need=false  ${qt.signalId.slice(0, 8)}`);
      }
      // SP-638: NO STOP at a "no". Every own citation is judged, then the claim is decided by the vote
      // below. A quote that states every part while its own belongs answer is no is NOT support.
      // SP-652: a pair the saved run marked as a voided nomination is never kept for storing.
      if (judgeReplay) { try { judgeReplay.assertStorable(need.key, p.identity, qt.signalId); } catch (e) { refuseReplay(e); } }
      verdicts.push({ q: qt, supports: v.supports && v.belongsToNeed, statesAll: v.supports, belongs: v.belongsToNeed, nominated: nominated.has(qt.signalId), reason: v.reason, notStated: v.notStated, parts: v.parts });
    }
    // ── SP-638: THE VOTE ──────────────────────────────────────────────────────────────────────────
    // A belongs vote counts only from an OWN citation that states every part. A majority of "no"
    // refuses the claim; a tie refuses; a claim with no counting vote is decided as before by its kept
    // quotes — it keeps none.
    const decision = voteNow();
    const belongs = !decision.refused;
    {
      const ownV = verdicts.filter((x) => !x.nominated);
      const newOutcome = decision.refused ? `REFUSED${decision.tie ? " on a tie" : ""}` : verdicts.some((x) => x.supports) ? "kept" : "kept 0";
      const oldOutcome = decision.oldRefused ? `refused at answered quote ${decision.oldFirstNoAt}` : ownV.some((x) => x.statesAll) ? "kept" : "kept 0";
      voteRec = { yes: decision.yes, no: decision.no, tie: decision.tie,
        not_counted: decision.notCounted.map((x) => ({ signal_id: x.signalId, why: x.why, belongs: x.belongs })),
        new_rule: newOutcome, old_first_no_rule: oldOutcome };
      sp638Decisions.push({ need: need.key, claim: p.name, d: decision, newOutcome, oldOutcome });
      console.log(`           ${belongsDecisionLine(p.name, decision, newOutcome, oldOutcome)}`);
      if (!decision.refused) for (const x of ownV) if (x.statesAll && !x.belongs) {
        sp638Outvoted.push({ need: need.key, claim: p.name, signalId: x.q.signalId, reason: x.reason });
        console.log(`           SP-638 outvoted: ${x.q.signalId.slice(0, 8)} states the part and its own belongs answer is no — the claim stands, this quote is NOT counted as support`);
      }
    }
    // SP-569: the counts below are of the quotes that were UP FOR JUDGING. A nomination that was never
    // judged is not one of them — "kept 0 of 3" must not count a quote the judge never saw.
    if (notJudged569.size) cited = cited.filter((x) => !notJudged569.has(x.signalId));
    // SP-578: nor is a voided nomination — it was judged, and it is no longer one of this claim's quotes.
    if (voided578.size) cited = cited.filter((x) => !voided578.has(x.signalId));
    if (!belongs) {
      patternsDropped++; foreignNeedDrops++;
      setFate(false, "SP-493: the claim states another need's problem", verdicts);
      recordOutcome(false, "SP-493: the claim states another need's problem", verdicts, cited.length);
      console.log(`    drop   (SP-493: the claim states another need's problem)  "${p.name.slice(0, 44)}"`);
      continue;
    }
    const supporting = verdicts.filter((v) => v.supports).map((v) => v.q);
    if (supporting.length === 0) {
      patternsDropped++;
      setFate(false, `judge kept 0 of ${cited.length}`, verdicts);
      recordOutcome(false, `judge kept 0 of ${cited.length}`, verdicts, cited.length);
      // WHICH PART failed is the thing v2 could not answer. It is counted here from the per-part rows.
      const byPart = p.parts.map((_, i) => verdicts.filter((v) => v.parts[i]?.states).length);
      console.log(`    drop   (judge kept 0 of ${String(cited.length).padStart(2)})    "${p.name.slice(0, 54)}"`);
      console.log(`           parts stated: ${p.parts.map((pt, i) => `${byPart[i]}/${cited.length} "${pt.slice(0, 34)}"`).join(" · ")}`);
      if (p.rewriteOf) {
        decompositionOutcomes.push({ need: need.key, rewriteOf: p.rewriteOf, claim: p.name, parts: [...p.parts], kept: false,
          supporting: 0, cited: cited.length, byPart: p.parts.map((pt, i) => `${byPart[i]}/${cited.length} "${pt}"`).join(" · ") });
      }
      // ── SP-553: THE DECOMPOSITION RE-ASK ────────────────────────────────────────────────────
      // The trigger is the verdict table and nothing else (the ruling is explicit, and it declined my
      // proposal to gate claims whose text contains "or"): no quote stated every part, but some quote
      // stated some part. `decompositionTrigger` owns that arithmetic.
      const split: DecompositionSplit | null = p.rewriteOf
        ? null   // one round only — a rewrite is not decomposed again
        : decompositionTrigger(p.parts, verdicts.map((v) => ({ signalId: v.q.signalId, parts: v.parts })));
      if (!split) {
        if (!p.rewriteOf) {
          decompositionNoTrigger++;
          console.log(`           SP-553: no trigger — no part of this claim is stated by any quote, so there is nothing to decompose`);
        } else {
          console.log(`           SP-553: this pattern IS a rewrite — one round only, so it is dropped here`);
        }
        continue;
      }
      const pQuotes = byPolarity.get(p.polarity) ?? [];
      const labels = quoteLabels(pQuotes);
      const labelById = new Map<string, string>();
      for (const [l, id] of labels) if (!labelById.has(id)) labelById.set(id, l);
      decompositionReasks++;
      console.log(`    SP-553 decomposition re-ask "${p.name.slice(0, 54)}"`);
      for (const st of split.stated) console.log(`           part ${st.ordinal} STATED by ${st.signalIds.map((id) => `${labelById.get(id) ?? "?"}/${id.slice(0, 8)}`).join(" ")}  "${st.part.slice(0, 44)}"`);
      for (const un of split.unstated) console.log(`           part ${un.ordinal} stated by NO quote  "${un.part.slice(0, 44)}"`);
      const rec: Decomposition = {
        need: need.key, polarity: p.polarity, original: p.name, originalParts: [...p.parts],
        stated: split.stated.map((x) => ({ ordinal: x.ordinal, part: x.part, signalIds: [...x.signalIds] })),
        unstated: split.unstated.map((x) => ({ ...x })), rewrite: [], dropped: [], failWhy: "",
      };
      decompositions.push(rec);
      // The other patterns of this need, so the rewrite faces SP-537(a) and SP-475(c) across answers.
      // The ORIGINAL is deliberately NOT among them: SP-553's option (b) is to keep the claim and drop
      // the unsupported part, and a duplicate gate seeded with the original would refuse exactly that.
      const existingForGate: ProposedPattern[] = queue
        .filter((_, j) => j !== qi)
        .map((x) => ({
          name: x.name, parts: x.parts, polarity: x.polarity, signalIds: x.signalIds,
          representativeSignalId: x.representativeSignalId,
          citedLabels: x.signalIds.map((id) => labelById.get(id) ?? "").filter(Boolean),
        }));
      let rewrite: ReturnType<typeof parseGeneratedPass> | null = null;
      let decompContent: string | null = null;
      try {
        const again = await call("generator", `${need.key}/${p.polarity}`, GEN_SYSTEM,
          buildDecompositionReask(need.outcome, pQuotes, p, split, labels), false, `decomp-${qi}`);
        genAnswers.push({ need: need.key, polarity: p.polarity, attempt: `decomp-${qi}`, model: again.model, system_md5: GEN_SYSTEM_MD5, content: again.content });
        decompContent = again.content;
        rewrite = parseGeneratedPass(again.content, labels, existingForGate, GEN_LIMITS);
      } catch (e) {
        rec.failWhy = e instanceof Error ? e.message : String(e);
        decompositionFailed++;
        if (decompContent !== null) recordAnswerClaims(need.key, p.polarity, `decomp-${qi}`, decompContent, () => `answer refused: ${e instanceof GeneratorRefusal ? e.kind : "schema"}`);
        console.log(`           SP-553 re-ask REFUSED [${e instanceof GeneratorRefusal ? e.kind : "schema"}]: ${rec.failWhy.slice(0, 96)}`);
        continue;
      }
      // SP-542 inside the rewrite: a claim of it that failed a gate is named, the others proceed.
      for (const d2 of rewrite.dropped) {
        rec.dropped.push({ claim: d2.claim, why: d2.why });
        recordUnjudged(need.key, p.polarity, `decomp-${qi}`, d2.claim, [], `generator refused: ${d2.kind}`);
        console.log(`           SP-553 rewrite claim ${d2.ordinal} DROPPED [${d2.kind}]: ${d2.why.slice(0, 88)}`);
      }
      for (const pr of rewrite.promoted) {
        promotedQuotes.push({ need: need.key, polarity: p.polarity, label: pr.label, signalId: labels.get(pr.label) ?? "",
          belongsTo: pr.belongsTo, claim: pr.claim, resolved: pr.resolved, why: pr.why, fromRewrite: true });
      }
      for (const l of rewrite.leftOver) {
        leftOverAll.push(`${need.key}/${p.polarity} (SP-553 rewrite) ${(labels.get(l.label) ?? "").slice(0, 8)} ${l.label}` +
          `${l.belongsTo === null ? "" : ` [belongs_to ${l.belongsTo}, UNRESOLVED]`}: ${l.why || "(NO REASON GIVEN)"}`);
      }
      for (const c2 of rewrite.patterns) {
        const mism = polarityRefusal(c2, p.polarity, (id) => byId.get(id)?.polarity ?? null);
        if (mism) {
          // One round only, so this one is named and dropped rather than re-asked again.
          rec.dropped.push({ claim: c2.name, why: mism.message });
          recordUnjudged(need.key, p.polarity, `decomp-${qi}`, c2.name, c2.parts, "generator refused: polarity_mismatch");
          console.log(`           SP-553 rewrite "${c2.name.slice(0, 48)}" DROPPED [polarity_mismatch]: ${mism.message.slice(0, 80)}`);
          continue;
        }
        const own2 = c2.signalIds.filter((id) => byId.get(id)?.polarity === p.polarity);
        const id2 = await patternIdentity(need.id, c2.name, c2.parts);
        if (byIdentity.has(id2)) {
          rec.dropped.push({ claim: c2.name, why: "the rewrite is identical (claim + parts) to a pattern this need already carries" });
          recordUnjudged(need.key, p.polarity, `decomp-${qi}`, c2.name, c2.parts, "duplicate: identical (claim + parts) to a pattern this need already carries");
          console.log(`           SP-553 rewrite "${c2.name.slice(0, 48)}" DROPPED: identical to a pattern already proposed for this need`);
          continue;
        }
        const cand2: Judgeable = { name: c2.name, parts: c2.parts, polarity: p.polarity, signalIds: own2,
          representativeSignalId: c2.representativeSignalId, identity: id2, rewriteOf: p.name, answer: `decomp-${qi}` };
        byIdentity.set(id2, cand2);
        queue.push(cand2);
        rec.rewrite.push({ claim: c2.name, parts: [...c2.parts], cited: own2.length });
        console.log(`           SP-553 rewrite QUEUED "${c2.name}" (${c2.parts.length} part(s), ${own2.length} quote(s)) — judged below`);
      }
      continue;
    }

    setFate(true, "", verdicts);
    const strength = patternStrength(supporting);
    recordOutcome(true, "", verdicts, cited.length, strength);
    const identity = p.identity;
    const sites = new Set(supporting.map((x) => x.site));
    // SP-475(c): the generator's pick when it survived the judge and is not already a representative
    // of another pattern in this need; otherwise the first survivor that is free. null only when every
    // survivor is already spoken for, which the unique index then permits.
    const rep = [p.representativeSignalId, ...supporting.map((x) => x.signalId)]
      .find((id) => id && supporting.some((x) => x.signalId === id) && !usedRepresentative.has(id)) ?? null;
    if (rep) usedRepresentative.add(rep);
    for (const x of supporting) assigned.add(x.signalId);
    polarities[p.polarity] = (polarities[p.polarity] ?? 0) + 1;

    keptClaims.push({ need: need.key, claim: p.name, parts: [...p.parts] });
    console.log(`    keep   ${p.polarity.padEnd(11)} ${strength.padEnd(16)} ${String(supporting.length).padStart(2)}/${sites.size} of ${String(cited.length).padStart(2)} cited  "${p.name.slice(0, 44)}"`);
    console.log(`           parts: ${p.parts.map((pt, i) => `${verdicts.filter((v) => v.parts[i]?.states).length}/${cited.length} "${pt.slice(0, 40)}"`).join(" · ")}`);
    patternsWritten++; keptHere++;
    if (p.rewriteOf) {
      decompositionOutcomes.push({ need: need.key, rewriteOf: p.rewriteOf, claim: p.name, parts: [...p.parts], kept: true,
        supporting: supporting.length, cited: cited.length,
        byPart: p.parts.map((pt, i) => `${verdicts.filter((v) => v.parts[i]?.states).length}/${cited.length} "${pt}"`).join(" · ") });
    }
    quotesWritten += cited.length;
    partsWritten += p.parts.length;
    const firstReason = (verdicts.find((v) => v.supports)?.reason) || null;
    // The quote-level span is the FIRST stated part's — a convenience for the readers that predate the
    // parts table. The per-part rows are authoritative, and both are verified by the same predicate, so
    // a non-empty need_pattern_quotes.states_span is still verbatim in its quote.
    const firstSpan = (v: { parts: PartVerdict[] }) => v.parts.find((x) => x.states && x.span)?.span ?? null;
    // ONE STATEMENT, so a pattern can never exist without its parts and a verdict can never point at a
    // part that was not written. The per-part verdicts join back through (signal_id, ordinal) — the two
    // things this run knows — and the database resolves them to the row ids it just minted.
    writes.push(`with ins as (
        insert into public.need_patterns (company_id, need_id, name, strength, polarity, judge_reason,
          representative_signal_id, pattern_identity, rubric_version, rubric_md5,
          model_provider, model_name, judge_provider, judge_model, judged_at, run_ref,
          run_ceiling_hit, run_proposed_count, belongs_to_need)
        values (${q(COMPANY)}, ${q(need.id)}, ${q(p.name)}, ${q(strength)}, ${q(p.polarity)}, ${qn(firstReason)},
          ${rep ? q(rep) : "null"}, ${q(identity)}, ${q(PATTERN_RUBRIC_VERSION)}, ${q(RUBRIC_MD5)},
          ${q(genProvider)}, ${q(genModel)}, ${q(JUDGE_PROVIDER)}, ${q(JUDGE_MODEL)}, now(), ${q(TAG)},
          ${ceilingHit}, ${proposed.length}, true)
        returning id),
      prt as (
        insert into public.need_pattern_parts (company_id, pattern_id, ordinal, predicate)
        select ${q(COMPANY)}, ins.id, t.ord, t.pred
          from ins, (values ${p.parts.map((pt, i) => `(${i + 1}::smallint, ${q(pt)})`).join(", ")}) as t(ord, pred)
        returning id, ordinal),
      qt as (
        insert into public.need_pattern_quotes (company_id, pattern_id, signal_id, bears, judge_reason,
            states_span, not_stated)
        select ${q(COMPANY)}, ins.id, v.sid, v.bears, v.reason, v.span, v.notstated::jsonb
          from ins, (values ${verdicts.map((v) => `(${q(v.q.signalId)}::uuid, ${v.supports}, ${qn(v.reason || null)}, ${qn(firstSpan(v))}, ${q(JSON.stringify(v.notStated))})`).join(", ")}) as v(sid, bears, reason, span, notstated)
        returning id, signal_id)
      insert into public.need_pattern_quote_parts (company_id, quote_row_id, part_id, states, states_span, reason)
      select ${q(COMPANY)}, qt.id, prt.id, w.states, w.span, w.reason
        from (values ${verdicts.flatMap((v) => v.parts.map((pv) =>
          `(${q(v.q.signalId)}::uuid, ${pv.ordinal}::smallint, ${pv.states}::boolean, ${qn(pv.span || null)}::text, ${qn(pv.reason || pv.rejected || null)}::text)`)).join(", ")}) as w(sid, ord, states, span, reason)
        join qt  on qt.signal_id = w.sid
        join prt on prt.ordinal  = w.ord`);
  }
  // SP-652: every saved verdict of this need must have been asked for, or the replay did not retrace
  // the saved run. Checked BEFORE the write.
  if (judgeReplay) { try { judgeReplay.assertAllUsed(need.key); } catch (e) { refuseReplay(e); } }
  if (APPLY) {
    // SP-656: ONE transaction per need — retire the live set, then write the new one. The retire comes
    // first inside it (the two unique indexes on live patterns are checked per statement), and it
    // cannot touch the rows the same transaction then inserts. Any error rolls the whole need back.
    const live = await psql(`select count(*) from public.need_patterns where company_id = ${q(COMPANY)} and need_id = ${q(need.id)} and superseded_at is null`);
    const retire = `update public.need_patterns
        set superseded_at = now(), superseded_reason = ${q("superseded by " + PATTERN_RUBRIC_VERSION + " run " + TAG)}
      where company_id = ${q(COMPANY)} and need_id = ${q(need.id)} and superseded_at is null`;
    await psql(applyNeedSql(retire, writes));
    console.log(`    SP-656 one transaction: superseded ${live[0][0]} earlier pattern(s) of this need and wrote ${writes.length}`);
  }

  // SP-469: every counted quote under NO surviving pattern is listed.
  const unassigned = quotes.filter((x) => !assigned.has(x.signalId));
  console.log(`    coverage ${assigned.size} of ${quotes.length} counted quotes under a pattern · ${unassigned.length} unassigned` +
    (ceilingHit ? " · CEILING HIT" : ""));
  if (unassigned.length) {
    console.log(`    unassigned: ${unassigned.map((x) => `${x.signalId.slice(0, 8)}[${x.polarity ?? "unlabelled"}]`).join(" ")}`);
  }
  perNeed.push({
    key: need.key, counted: quotes.length, patterns: keptHere, ceilingHit, proposed: proposedTotal,
    assigned: assigned.size, unassigned: unassigned.length, polarities,
  });
  console.log("");
}

const total = (performance.now() - runStart) / 1000;
console.log(`── ${APPLY ? "APPLIED" : "DRY RUN"} ───────────────────────────────────────────────`);
console.log(`patterns kept ${patternsWritten} · dropped ${patternsDropped} · quote rows ${quotesWritten} · part rows ${partsWritten}`);
console.log(`SP-494: ${spanRejects} part verdict(s) rejected for an unverifiable span, of ${partVerdicts} judged (${partVerdictsStated} stated)`);
console.log(`SP-493: ${foreignNeedDrops} pattern(s) dropped — the claim states another need's problem (SP-638: by a majority or a tie of counting votes; the first-no rule would have dropped ${sp638Decisions.filter((x) => x.d.oldRefused).length})`);
console.log(`SP-514: ${spanReasks} span re-ask(s) — ${spanReaskRecovered} part(s) recovered, ${spanReaskFailedTwice} failed twice`);
console.log(`UNREADABLE: ${unreadableVerdicts} judge answer(s) could not be parsed and were failed closed`);
console.log(`SP-523: ${sp523Disagreements.length} quote(s) where every part stated AND belongs_to_this_need=false (SP-638: each is a counting "no" vote, and is never counted as support)`);
for (const d of sp523Disagreements) console.log(`        ${d.need} ${d.signal_id.slice(0, 8)} "${d.pattern.slice(0, 44)}" — ${d.reason.slice(0, 90)}`);
console.log(`SP-578: ${sp578Voided.length} nomination(s) voided — the judge said the quote is not this need's; the claim it named was NOT dropped`);
for (const d of sp578Voided) console.log(`        ${d.need} ${d.signal_id.slice(0, 8)} "${d.pattern.slice(0, 44)}" — ${d.reason.slice(0, 90)}`);
// SP-536: listed for review, never gated. SP-535: the account of every quote.
console.log(`SP-546: ${claimReasks} per-claim re-ask(s) — ${claimReaskRecovered} recovered, ${claimReaskFailed} failed twice:`);
for (const r of recoveredClaims) {
  console.log(`        RECOVERED ${r.need}/${r.polarity} [${r.kind}] "${r.before.slice(0, 54)}" (${r.before.length})`);
  console.log(`                → "${r.after}" (${r.after.length})`);
}
console.log(`SP-542 + SP-546: ${droppedClaims.length} claim(s) dropped after their one re-ask — the need kept its others:`);
for (const x of droppedClaims) {
  console.log(`        ${x.need}/${x.polarity} claim ${x.d.ordinal} [${x.d.kind}] "${x.d.claim.slice(0, 60)}": ${x.d.why.slice(0, 90)}`);
  console.log(`              re-ask also failed: ${x.reaskWhy.slice(0, 100)}`);
}
{
  // SP-547: the structured `belongs_to`. SP-569: resolved HERE, after every claim has been judged,
  // from the fate each claim actually met — so the counts on this line are true at the end of the run.
  // Run 7 printed "6 became citations, 0 named no kept claim" from the pre-judge binding; two of the
  // six had named a claim SP-493 then refused.
  const outcomes = resolveBelongsToAfterJudging(promotedQuotes, claimFates, rewriteFates);
  console.log(belongsToSummaryLine(outcomes));
  for (const x of outcomes) {
    const head = `${x.need}/${x.polarity} ${x.label} ${x.signalId.slice(0, 8)} → claim ${x.belongsTo}`;
    if (x.outcome === "cited_supports") console.log(`        CITED, SUPPORTS      ${head} "${x.claim.slice(0, 54)}"  (${x.why.slice(0, 50)})`);
    else if (x.outcome === "cited_not_supporting") console.log(`        CITED, NOT SUPPORTING ${head} "${x.claim.slice(0, 54)}" — kept, but a part is not stated by this quote  (${x.why.slice(0, 50)})`);
    else if (x.outcome === "kept_no_verdict") console.log(`        NO VERDICT           ${head} "${x.claim.slice(0, 54)}" — kept, but the judge gave no readable answer on this quote`);
    else if (x.outcome === "nomination_voided") console.log(`        VOIDED               ${head} "${x.claim.slice(0, 54)}"  (the quote stays left over)`);
    else if (x.outcome === "rewrite_kept") console.log(`        NAMED A KEPT REWRITE  ${head} "${x.claim.slice(0, 54)}" — one of the rewrite's own citations; ${x.rewriteVerdict === "supports" ? "supports it" : x.rewriteVerdict === "not_supporting" ? "a part is not stated by this quote" : "the judge gave no readable answer on this quote"}  (${x.why.slice(0, 50)})`);
    else if (x.outcome === "claim_dropped") console.log(`        NAMED A CLAIM THAT WAS LATER DROPPED  ${head} "${x.claim}" — ${x.dropReason} — the quote is NOT a citation  (${x.why.slice(0, 50)})`);
    else console.log(`        NAMED NO CLAIM       ${head} (the generator wrote no such claim)  (${x.why.slice(0, 50)})`);
  }
}
// ── SP-551 / SP-552 / SP-553, as facts of the run ───────────────────────────────────────────────
console.log(`SP-557: ${ceilingCuts.length} claim(s) cut by the PER-PASS ceiling of ${CEILING} (SP-551's cross-pass fill retired \u2014 see applyCeilingPerPass):`);
for (const c of ceilingCuts) console.log(`        CUT ${c.need} [${c.polarity}] "${c.claim}"  parts: ${c.parts.map((x) => `"${x}"`).join(" · ")}`);
{
  const rec = polarityMismatches.filter((x) => x.recovered);
  console.log(`SP-552: ${polarityMismatches.length} claim(s) whose polarity was not their pass's — ${rec.length} recovered by the re-ask, ${polarityMismatches.length - rec.length} dropped:`);
  for (const x of polarityMismatches) {
    console.log(`        ${x.recovered ? "RECOVERED" : "DROPPED  "} ${x.need}/${x.polarity} "${x.claim.slice(0, 56)}"`);
    console.log(`              ${x.why.slice(0, 112)}`);
    if (x.recovered) console.log(`              → "${x.after}"`);
  }
}
{
  const recoveredOriginals = new Set(decompositionOutcomes.filter((o) => o.kept).map((o) => `${o.need}/${o.rewriteOf}`));
  console.log(`SP-553: ${decompositionReasks} decomposition re-ask(s) — ${recoveredOriginals.size} original claim(s) recovered at least one kept pattern, ` +
    `${decompositionFailed} re-ask(s) refused outright; ${decompositionNoTrigger} dropped claim(s) did NOT trigger (no part stated by any quote):`);
  for (const d of decompositions) {
    const outs = decompositionOutcomes.filter((o) => o.need === d.need && o.rewriteOf === d.original);
    console.log(`        ${d.need}/${d.polarity} ORIGINAL "${d.original}"`);
    for (const st of d.stated) console.log(`              part ${st.ordinal} stated by ${st.signalIds.length} quote(s) [${st.signalIds.map((x) => x.slice(0, 8)).join(" ")}]  "${st.part}"`);
    for (const un of d.unstated) console.log(`              part ${un.ordinal} stated by NO quote  "${un.part}"`);
    if (d.failWhy) console.log(`              RE-ASK REFUSED: ${d.failWhy.slice(0, 110)}`);
    for (const r of d.rewrite) console.log(`              REWRITE "${r.claim}" (${r.parts.length} part(s), ${r.cited} quote(s)): ${r.parts.map((x) => `"${x}"`).join(" · ")}`);
    for (const r of d.dropped) console.log(`              REWRITE DROPPED "${r.claim.slice(0, 54)}": ${r.why.slice(0, 90)}`);
    for (const o of outs) console.log(`              VERDICT ${o.kept ? "KEPT" : "DROPPED"} "${o.claim.slice(0, 54)}" ${o.supporting}/${o.cited} — ${o.byPart}`);
  }
}
console.log(`SP-549: ${servedDisagreements.length} call(s) where the model that ANSWERED differed from the model requested:`);
for (const d of servedDisagreements) console.log(`        ${d.need} ${d.role}: asked ${d.requested}, answered ${d.served}`);
{
  // SP-543: a MEASUREMENT per run, never a gate. Computed per need over the claims this run proposed.
  const byNeed = new Map<string, typeof keptClaims>();
  for (const w of keptClaims) byNeed.set(w.need, [...(byNeed.get(w.need) ?? []), w]);
  let pairs = 0, shared = 0;
  const pairLines: string[] = [], sharedLines: string[] = [];
  for (const [needKey, ks] of [...byNeed].sort()) {
    for (const n of nearSynonymClaims(ks.map((k) => k.claim))) {
      pairs++;
      pairLines.push(`        ${needKey} ${(n.overlap * 100).toFixed(0)}% "${n.a.slice(0, 50)}" ≈ "${n.b.slice(0, 50)}"`);
    }
    for (const sp of sharedPartClaims(ks.map((k) => ({ name: k.claim, parts: k.parts })))) {
      shared++;
      sharedLines.push(`        ${needKey} part "${sp.part}" asserted by ${sp.claims.length} claims:`);
      for (const c of sp.claims) sharedLines.push(`              "${c.slice(0, 74)}"`);
    }
  }
  console.log(`SP-543: ${shared} part(s) asserted by MORE THAN ONE claim in a need — MEASURED, never gated:`);
  for (const l of sharedLines) console.log(l);
  console.log(`SP-543: ${pairs} claim pair(s) at or above ${(NEAR_SYNONYM_THRESHOLD * 100).toFixed(0)}% content-word overlap (lexical — for an eye, not a verdict):`);
  for (const l of pairLines) console.log(l);
}
console.log(`SP-536: ${conjunctionParts.length} part(s) contain "and" or "or" — LISTED for review, never gated:`);
for (const c of conjunctionParts) console.log(`        ${c}`);
console.log(`SP-535: ${leftOverAll.length} quote(s) left over with a reason, after ${leftOverReasks} accounting re-ask(s):`);
for (const l of leftOverAll) console.log(`        ${l}`);
console.log(`SP-535: ${accountingGaps.length} pass(es) whose account STILL does not add up:`);
for (const g of accountingGaps) console.log(`        ${g}`);
// ── SP-628 and SP-625, as facts of the run ──────────────────────────────────────────────────────
console.log(`SP-628: ${conjunctionHits.length} part(s) joined two things with "and"/"or" — each re-asked once, none dropped: ` +
  `${conjunctionSummary(conjunctionHits.map((x) => x.outcome)).text}${CONJUNCTION_REASK ? "" : " (the check runs under --gen-prompt=onepart only)"}`);
for (const h of conjunctionHits) {
  console.log(`        ${h.need}/${h.polarity} "${h.claim}" — part "${h.part}" → ${h.outcome}${h.after ? `: "${h.after}" — part "${h.afterPart}"` : ""}${h.why ? ` (${h.why.slice(0, 70)})` : ""}`);
}
console.log(`SP-634: ${fieldReasks.length} per-claim re-ask(s) — each may change one thing; the claim's quotes, representative and nominations are kept:`);
for (const r of fieldReasks) {
  console.log(`        ${r.ok ? "OK    " : "FAILED"} ${r.need}/${r.polarity} ${r.attempt} [${r.kind}] may change ${r.mayChange}${r.ok ? ` · took ${r.took}${r.widened ? " (WIDENED)" : ""} · ${r.quotesKept} quote(s) kept · ${r.nominationsKept} nomination(s) follow` : ""}`);
  console.log(`              "${r.before.slice(0, 70)}"${r.ok ? ` → "${r.after.slice(0, 70)}"` : ""}`);
}
console.log(`SP-635: ${splitRecords.length} "and"/"or" re-ask(s) — ${splitRecords.filter((x) => x.outcome === "split").length} split, ${splitRecords.filter((x) => x.outcome === "rewritten").length} rewritten as one claim, ${splitRecords.filter((x) => !["split", "rewritten"].includes(x.outcome)).length} left as written · halves added outside the ceiling: ${splitAdds.map((x) => `${x.need}/${x.polarity} +${x.added}`).join(", ") || "none"}`);
for (const s of splitRecords) {
  console.log(`        ${s.need}/${s.polarity} ${s.attempt} ${s.outcome.toUpperCase()} "${s.original}" — part "${s.originalPart}"${s.why ? ` (${s.why.slice(0, 80)})` : ""}`);
  for (const h of s.halves) console.log(`              ${["split", "rewritten"].includes(s.outcome) ? "→" : "✗"} "${h.claim}" — part "${h.part}" · assigned [${h.assigned.join(" ")}] · carried [${h.carried.join(" ")}] · nominations [${h.nominated.join(" ")}]${h.foreign.length ? ` · ignored [${h.foreign.join(" ")}]` : ""}`);
}
{
  const changed = sp638Decisions.filter((x) => x.d.oldRefused !== x.d.refused);
  console.log(`SP-638: ${sp638Decisions.length} claim(s) voted on · ${sp638Decisions.filter((x) => x.d.refused).length} refused (${sp638Decisions.filter((x) => x.d.tie).length} on a tie) · the first-no rule would have refused ${sp638Decisions.filter((x) => x.d.oldRefused).length} · ${changed.length} decided differently · ${sp638Outvoted.length} quote(s) outvoted and not counted as support:`);
  for (const x of sp638Decisions) if (x.d.no > 0 || x.d.oldRefused || x.d.refused) console.log(`        ${x.need} ${belongsDecisionLine(x.claim, x.d, x.newOutcome, x.oldOutcome).slice(13)}`);
  for (const o of sp638Outvoted) console.log(`        OUTVOTED ${o.need} ${o.signalId.slice(0, 8)} "${o.claim.slice(0, 50)}" — ${o.reason.slice(0, 80)}`);
}
// ── SP-618: the accounting re-ask, and the per-answer claim account ──────────────────────────────
console.log(`SP-618(a): ${nestedLeftOverAnswers} answer(s) nested \`left_over\` inside \`patterns\` — read as the account`);
console.log(`SP-618(b): ${accountReasks.length} accounting re-ask(s) — claims NEVER adopted; ${accountReasks.filter((x) => x.adopted).length} completed the first answer's account:`);
for (const r of accountReasks) {
  console.log(`        ${r.need}/${r.polarity} account ${r.before} → ${r.after} of ${r.of}${r.adopted ? "" : " (nothing completed; first answer unchanged)"} · ${r.adoptedLeftOver} left over · ${r.nominated} nominated · ${r.orphaned.length} orphan(s) · re-ask claims: ${r.secondSame} same text, ${r.secondNew} new`);
  for (const o of r.orphaned) console.log(`              ORPHAN ${o.label} ${o.signalId.slice(0, 8)} → "${o.claim}"`);
}
/** SP-609 + SP-618(c): every claim the run's generator answers wrote, with its outcome and class. */
const allClaims: ClaimOutcome[] = [
  ...claimOutcomes,
  ...ceilingCuts.map((c) => claimOutcome({ need: c.need, polarity: c.polarity, claim: c.claim, identity: null, parts: c.parts,
    kept: false, dropReason: "ceiling", cited: 0, judged: 0, supporting: 0, answer: c.answer })),
  ...droppedClaims.map((x) => claimOutcome({ need: x.need, polarity: x.polarity, claim: x.d.claim, identity: null, parts: [],
    kept: false, dropReason: `generator refused: ${x.d.kind}`, cited: 0, judged: 0, supporting: 0, answer: x.answer })),
];
const claimAccount = GENERATE_ONLY ? [] : claimAccountByAnswer(genAnswers, allClaims);
const claimAccountBad = claimAccount.filter((x) => !x.ok);
console.log(`SP-618(c): claims written = kept + dropped + replaced, per generator answer — ${claimAccount.length - claimAccountBad.length} of ${claimAccount.length} answer(s) add up:`);
for (const a of claimAccount) {
  // SP-636: an unreadable answer carries its own class; it passes only when its re-ask was readable.
  if (a.unreadable) console.log(`        ${a.ok ? "OK      " : "MISMATCH"} ${a.need}/${a.polarity} ${a.attempt.padEnd(18)} ${a.unreadable.toUpperCase()} (SP-636) — no claim of it can be listed (${a.textClaims} claim(s) begun, by text search); nothing of it was taken`);
  else console.log(`        ${a.ok ? "OK      " : "MISMATCH"} ${a.need}/${a.polarity} ${a.attempt.padEnd(18)} wrote ${a.written} = kept ${a.kept} + dropped ${a.dropped} + replaced ${a.replaced}`);
}
// ── SP-637: the batch size of every model load of this run ───────────────────────────────────────
{
  // SP-647: with the load already in memory when the run began, if one served a call of this run.
    const allLoads = await readModelLoads(RUN_STARTED_MS - 2000, undefined, true);
    const loads = allLoads === null ? null : callsByLoad(allLoads, callEnds).filter((x) => !x.load.beforeRun || Object.keys(x.byRole).length > 0).map((x) => x.load);
  if (loads === null) console.log("SP-637: the model server's log could not be read — batch sizes unknown for this run");
  else {
    const per = callsByLoad(loads, callEnds);
    console.log(`SP-637: ${loads.length} model load(s) served this run${loads.some((l) => l.beforeRun) ? " (1 was already in memory when it began)" : ""}, from the model server's own log. The server picks the batch size from free memory at load; nothing here sets it:`);
    for (const x of per) console.log(`        ${loadLine(x.load)}  →  ${Object.entries(x.byRole).map(([r, n]) => `${n} ${r}`).join(", ") || "no call"}`);
    const byBatch = (role: string) => { const m = new Map<string, number>(); for (const x of per) if (x.byRole[role]) m.set(String(x.load.batch ?? "?"), (m.get(String(x.load.batch ?? "?")) ?? 0) + x.byRole[role]); return [...m].map(([b, n]) => `${n} at ${b}`).join(", ") || "none"; };
    console.log(`SP-637: judge calls by batch size: ${byBatch("judge")} · generator calls: ${byBatch("generator")} · every load n_ctx ${[...new Set(loads.map((l) => l.nCtx))].join("/")}`);
  }
}
console.log("\nper need:");
for (const n of perNeed) {
  console.log(`  ${n.key.padEnd(4)} counted ${String(n.counted).padStart(2)} · patterns ${String(n.patterns).padStart(2)}` +
    ` · proposed ${String(n.proposed).padStart(2)} · ceiling ${n.ceilingHit ? "HIT" : "no "}` +
    ` · coverage ${n.assigned}/${n.counted} · unassigned ${n.unassigned}` +
    ` · polarity ${JSON.stringify(n.polarities)}`);
}
if (judgeReplay) {
  console.log(`SP-652 replay: ${replayedCalls} generator answer(s) and ${judgeReplayed} judge verdict(s) replayed from the saved files · ${timings.length + failedCalls} model call(s) made`);
  console.log(`        pairs file ${JUDGE_FROM} md5 ${judgeFromMd5} · generations file ${GEN_FROM} md5 ${genFromMd5}`);
  if (ledgerProof) console.log(`        ledger proof: ${ledgerProof.matched.generator} generator prompt(s) and ${ledgerProof.matched.judge} judge prompt(s) rebuilt from today's rows, each matched to its own ledger row of the saved run (${ledgerProof.rows} row(s) in ${ledgerProof.window})`);
  for (const [k, b] of Object.entries(runBindings)) console.log(`        ${k.padEnd(4)} bound by ${bindingSource[k] === "file" ? "the file's binding" : "the saved run's ledger rows"} · need ${b.need_id} · wording md5 ${b.wording_md5} · ${b.counted} counted quotes md5 ${b.counted_md5}`);
}
console.log(`model calls ${timings.length}${failedCalls ? ` (+${failedCalls} that THREW — ledgered anyway, SP-518)` : ""} · total local time ${total.toFixed(1)}s`);
// SP-556: both counts, always — a zero here is the record that no answer came back empty.
console.log(`SP-556 empty answers: ${judgeEmptyFirst} first attempt(s) empty · ${judgeEmptyRecovered} recovered by the retry at ${JUDGE_NUM_PREDICT_RETRY} · ${judgeEmptyFailed.length} failed closed`);
for (const f of judgeEmptyFailed) console.log(`        FAILED CLOSED ${f.need} ${f.signalId.slice(0, 8)}  "${f.pattern.slice(0, 60)}"`);
for (const t of timings) console.log(`  ${t.need.padEnd(4)} ${t.role.padEnd(9)} ${t.model.padEnd(22)} ${t.seconds.toFixed(1)}s`);
if (refusedNeeds.length) {
  console.log(`\nNEEDS REFUSED (${refusedNeeds.length}) — the schema gate held and nothing was written for them:`);
  for (const r of refusedNeeds) console.log(`  ${r.key}: ${r.why}`);
}
if (spendCap.refusals.length) console.log(`spend cap refusals: ${JSON.stringify(spendCap.refusals)}`);

// ── SP-522: THE SHADOW PASS, after every need ────────────────────────────────────────────────────
// One model load, the identical (quote, part) questions, and the SAME judgeAWithReask policy — because
// "judge A" MEANS the call plus its bounded span re-ask (SP-514), and a shadow measured without the
// retry would be compared against something the judge of record is not.
if (SHADOW_MODEL && shadowQueue.length) {
  console.log(`\n── SP-522 SHADOW PASS ── ${SHADOW_MODEL} over ${shadowQueue.length} quote(s) the judge of record judged`);
  const t0 = performance.now();
  let done = 0;
  for (const item of shadowQueue) {
    let sv: JudgeVerdict | null = null;
    let sErr = "";
    try {
      const sres = await judgeAWithReask({
        needStatement: item.needStatement, name: item.name, parts: item.parts, quote: item.quote,
        call: (system, user) => shadowCall(system, user),
        // The shadow faces the IDENTICAL question, so it reads whatever prompt the judge of record read.
        ...(JUDGE_SYSTEM_OVERRIDE ? { system: JUDGE_SYSTEM_OVERRIDE } : {}),
      });
      sv = sres.verdict;
      if (sres.reasked.length) shadowReasks++;
    } catch (e) {
      // An unreadable or failed shadow answer fails THAT PAIR closed in the JSON and is counted. It
      // cannot affect the stored run — there is nothing of the shadow's in the stored run.
      if (e instanceof JudgeUnreadable) shadowUnreadable++;
      sErr = e instanceof Error ? `${e.name}: ${e.message.slice(0, 160)}` : String(e);
      console.log(`    shadow FAILED on ${item.quote.signalId.slice(0, 8)}: ${sErr.slice(0, 90)}`);
    }
    for (const pv of item.recordParts) {
      const spv = sv?.parts.find((x) => x.ordinal === pv.ordinal) ?? null;
      shadowPairs.push({
        need: item.need, pattern: item.name, pattern_identity: item.identity, signal_id: item.quote.signalId, quote: item.quote.quote,
        ordinal: pv.ordinal, part: item.parts[pv.ordinal - 1] ?? "",
        judge_of_record: { model: JUDGE_MODEL, states: pv.states, span: pv.span, reason: pv.reason, rejected: pv.rejected },
        shadow: { model: SHADOW_MODEL, states: spv ? spv.states : null, span: spv?.span ?? "", reason: spv?.reason ?? "", rejected: spv?.rejected ?? "", error: sErr },
        ...(item.nominationVoided ? { nomination_voided: true } : {}),
        ...item.belongs,
      });
    }
    done++;
    if (done % 25 === 0) console.log(`    ${done}/${shadowQueue.length} quote(s) · ${((performance.now() - t0) / 1000).toFixed(0)}s`);
  }
}

if (SHADOW_MODEL) {
  const paired = shadowPairs.filter((x) => x.shadow.states !== null);
  const disagree = paired.filter((x) => x.shadow.states !== x.judge_of_record.states);
  const recordOnly = disagree.filter((x) => x.judge_of_record.states).length;
  const shadowOnly = disagree.filter((x) => x.shadow.states).length;
  const sTotal = shadowTimings.reduce((a, b) => a + b, 0);
  console.log(`\nSP-522 shadow ${SHADOW_MODEL} — MEASUREMENT ONLY, no verdict/part/pattern row written`);
  console.log(`  pairs ${shadowPairs.length} · paired ${paired.length} · unpaired ${shadowPairs.length - paired.length} (shadow failed or unreadable)`);
  console.log(`  agree ${paired.length - disagree.length} of ${paired.length}` +
    (paired.length ? ` (${((paired.length - disagree.length) / paired.length * 100).toFixed(1)}%)` : "") +
    ` · ${JUDGE_MODEL}-only keeps ${recordOnly} · ${SHADOW_MODEL}-only keeps ${shadowOnly}`);
  console.log(`  calls ${shadowCalls} ok · ${shadowFailedCalls} failed · ${shadowUnreadable} unreadable · ${shadowReasks} span re-ask(s)`);
  console.log(`  ${sTotal.toFixed(1)}s total · ${shadowCalls ? (sTotal / shadowCalls).toFixed(1) : "0"}s per call`);
  await Deno.writeTextFile(SHADOW_JSON, JSON.stringify({
    company: COMPANY, needs: WANT, judge_of_record: JUDGE_MODEL, shadow_model: SHADOW_MODEL,
    rubric_version: PATTERN_RUBRIC_VERSION, rubric_md5: RUBRIC_MD5, applied: APPLY,
    judge_num_predict: JUDGE_NUM_PREDICT,
    totals: {
      pairs: shadowPairs.length, paired: paired.length, agree: paired.length - disagree.length,
      disagree: disagree.length, judge_of_record_only_keeps: recordOnly, shadow_only_keeps: shadowOnly,
      shadow_calls: shadowCalls, shadow_failed_calls: shadowFailedCalls,
      shadow_unreadable: shadowUnreadable, shadow_span_reasks: shadowReasks,
      shadow_seconds: Number(sTotal.toFixed(1)),
    },
    pairs: shadowPairs,
  }, null, 2) + "\n");
  console.log(`  verdicts written to ${SHADOW_JSON} (JSON only)`);
}

// ── SP-537(b): THE JUDGE OF RECORD'S PAIRS, with their pattern identities ────────────────────────
// Written with no shadow model at all, so a second judging arm can be measured on exactly the pairs
// this run judged. The `shadow` object is present and NULL-valued so a reader built for the SP-522
// shape (the recheck instrument) reads this file unchanged; `shadow.model` is "" and its error says
// why, rather than a null that reads as a failed call.
if (PAIRS_JSON) {
  if (!SHADOW_MODEL) {
    for (const item of shadowQueue) {
      for (const pv of item.recordParts) {
        shadowPairs.push({
          need: item.need, pattern: item.name, pattern_identity: item.identity,
          signal_id: item.quote.signalId, quote: item.quote.quote,
          ordinal: pv.ordinal, part: item.parts[pv.ordinal - 1] ?? "",
          judge_of_record: { model: JUDGE_MODEL, states: pv.states, span: pv.span, reason: pv.reason, rejected: pv.rejected },
          shadow: { model: "", states: null, span: "", reason: "", rejected: "", error: "no shadow pass in this run" },
          ...(item.nominationVoided ? { nomination_voided: true } : {}),
          ...item.belongs,
        });
      }
    }
  }
  // SP-532: a pairs file with no pairs is not an empty success.
  if (shadowPairs.length === 0) {
    console.log(`\nrun: FAIL (SP-532) --pairs-json was asked for and the run judged ZERO pairs — nothing was written`);
    Deno.exit(1);
  }
  await Deno.writeTextFile(PAIRS_JSON, JSON.stringify({
    company: COMPANY, needs: WANT, judge_of_record: JUDGE_MODEL, shadow_model: SHADOW_MODEL || null,
    // SP-545: the judge PROMPT, beside the judge model. Two runs of this file differ by exactly this.
    judge_system: JUDGE_SYSTEM_MODE, judge_system_md5: await md5OfText(JUDGE_SYSTEM_OVERRIDE ?? JUDGE_SYSTEM),
    gen_prompt: GEN_PROMPT, gen_system_md5: GEN_SYSTEM_MD5, replayed_from: GEN_FROM || null,
    // SP-652: what a later replay binds to — each need's row, wording and ordered counted quotes.
    judge_replayed_from: JUDGE_FROM || null, judge_replayed_from_md5: judgeFromMd5 || null, bindings: runBindings,
    rubric_version: PATTERN_RUBRIC_VERSION, rubric_md5: RUBRIC_MD5, applied: APPLY,
    judge_num_predict: JUDGE_NUM_PREDICT,
    // SP-609: every claim's outcome. The judged claims are recorded where the judge loop decides them;
    // a claim cut by the ceiling or refused at the generator's door was never judged and is added here,
    // so a reader sees every claim the run proposed and why each one is or is not in the kept set.
    claims: allClaims,
    pairs: shadowPairs,
  }, null, 1) + "\n");
  console.log(`\nSP-537(b): ${shadowPairs.length} pair(s) over ${new Set(shadowPairs.map((x) => x.pattern_identity)).size} pattern identity(ies) written to ${PAIRS_JSON}`);
}
if (GEN_JSON) {
  if (!genAnswers.length) {
    console.log(`\nrun: FAIL (SP-532) --gen-json was asked for and the run made ZERO generator calls — nothing was written`);
    Deno.exit(1);
  }
  await Deno.writeTextFile(GEN_JSON, JSON.stringify({
    company: COMPANY, needs: WANT, gen_prompt: GEN_PROMPT, gen_system_md5: GEN_SYSTEM_MD5,
    gen_model: GEN_MODEL_OVERRIDE || GEN_MODEL_DEFAULT || lane.model, temperature: 0, seed: GEN_SEED ?? null, think: false,
    // SP-545: which judge prompt judged these patterns, in the file, so a pairs/gen JSON can never be
    // read as the live judge's when it was the comparison arm's.
    judge_system: JUDGE_SYSTEM_MODE, judge_system_md5: await md5OfText(JUDGE_SYSTEM_OVERRIDE ?? JUDGE_SYSTEM),
    replayed_from: GEN_FROM || null, replayed_calls: replayedCalls, bindings: runBindings,
    num_predict: PATTERN_NUM_PREDICT, answers: genAnswers,
  }, null, 1));
  console.log(`\n${genAnswers.length} raw generator answer(s) written to ${GEN_JSON}`);
}
if (!APPLY) console.log("nothing written — re-run with --apply");

// ── SP-532: THE RUN'S OWN VERDICT ────────────────────────────────────────────────────────────────
// Printed AND exited on, so a caller that keys on the exit code and a reader that keys on the printed
// line agree. A run whose needs selected nothing is RED even though every call it did make succeeded.
if (emptyNeeds.length) {
  console.log(`\nrun: FAIL (SP-532) ${emptyNeeds.length} named need(s) selected ZERO quotes: ${emptyNeeds.join(", ")}`);
  Deno.exit(1);
}
if (needs.length === 0) {
  console.log("\nrun: FAIL (SP-532) no need was selected at all — a run over nothing is not a run");
  Deno.exit(1);
}
// SP-618(c): a claim written and never classed is the run 8 fault. It fails the run.
if (claimAccountBad.length) {
  console.log(`\nrun: FAIL (SP-618) ${claimAccountBad.length} generator answer(s) wrote a claim that no outcome records: ${claimAccountBad.map((x) => `${x.need}/${x.polarity} ${x.attempt}`).join(", ")}`);
  Deno.exit(1);
}
console.log(`\nrun: PASS ${needs.length} need(s) selected quotes and were judged`);
