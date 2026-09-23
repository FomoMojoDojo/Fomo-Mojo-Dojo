// ── The FINDER prompt, the KIND ROUTER, the CONVERTERS and the JUDGE (parser commit 3, PR8–PR10) ──
//
// Pure except where a call function is injected: every model call is a `Call` the caller supplies, so
// these are unit-testable without a model and the served function owns the ledger.
import { ODI_CANONICAL_SYSTEM, buildOdiCanonicalUser, isValidCanonical } from "../_shared/odiCanonical.ts";
import { MARKET_MEANS_TERMS, marketMeansHits, marketMeansReason } from "../_shared/marketMeansTerms.ts";
import {
  SOLUTION_AGNOSTIC_SYSTEM, buildSolutionAgnosticUser, judgeSolutionAgnosticMajority, CRITERION_VERSION,
} from "../_shared/solutionAgnosticJudge.ts";
import { ITEM_KINDS, type FrameworkForm, type ItemKind } from "../_shared/interviewItems.ts";
import type { Passage } from "./segment.ts";

/** One model call. The served function passes a ledgering implementation; tests pass a stub. */
export type Call = (args: { stage: string; system: string; user: string; model?: string }) => Promise<string>;

export const MAX_RAW_WORDS = 400;

// ── the finder ───────────────────────────────────────────────────────────────────────────────────
// RULING B (operator, 2026-09-22): the finder emits ALL EIGHT kinds, each with a one-line definition.
// Before this it emitted four, so route / step / positioning / cascade could not be found at all and
// the router's not-built branch was unreachable from a real parse. The four new kinds still land
// ANNOTATED with no model call spent (routeKind -> "not_built", rule 1): finding them is this commit,
// converting them is a later one.
export const FINDER_SYSTEM =
  "You read one window of an interview transcript and list the TYPED ITEMS it contains. " +
  "The window is given as numbered passages; each passage carries its speaker. " +
  "kind is one of: " +
  "job (a job the speaker is trying to get done); " +
  "pain_point (something that is hard, slow, costly or frustrating for them); " +
  "desire (something they want to be true); " +
  "outcome (a result they measure or would measure); " +
  "route (a way they go about getting something done, or an approach they took or considered); " +
  "step (one stage of a process they describe, in the order it happens); " +
  "positioning (how they describe who they are, who they serve, or how they differ from the alternatives); " +
  "cascade (a strategic choice — where they will play, how they intend to win, or what they will not do). " +
  "raw_words MUST be a VERBATIM quote copied from the passage — never a paraphrase, never your own " +
  `words, at most ${MAX_RAW_WORDS} characters. Copy it exactly, including punctuation. ` +
  "passage_index is the number of the passage the quote came from. " +
  "List every item you find; do not merge two items into one and do not invent items the words do not " +
  "support. If a passage contains nothing of these kinds, list nothing for it. " +
  'JSON only: {"items":[{"passage_index":<int>,"kind":"job|pain_point|desire|outcome|route|step|positioning|cascade","raw_words":"<verbatim quote>"}]}.';

export function buildFinderUser(passages: readonly Passage[], offset: number): string {
  return passages
    .map((p, i) => `[${offset + i}] ${p.speaker_label ?? "unknown speaker"}: ${p.text}`)
    .join("\n\n");
}

export type FoundItem = { passage_index: number; kind: ItemKind; raw_words: string };

/** Parse the finder's answer defensively: a malformed entry is dropped, never guessed at. */
export function parseFinderOutput(raw: string): FoundItem[] {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return []; }
  const items = (parsed as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  const KINDS = new Set<string>(ITEM_KINDS); // ruling B: all eight, taken from the store's own list
  const out: FoundItem[] = [];
  for (const it of items) {
    const o = it as Record<string, unknown>;
    const kind = String(o?.kind ?? "");
    const words = String(o?.raw_words ?? "").trim();
    const idx = Number(o?.passage_index);
    if (!KINDS.has(kind) || !words || !Number.isFinite(idx)) continue;
    out.push({ passage_index: Math.trunc(idx), kind: kind as ItemKind, raw_words: words.slice(0, MAX_RAW_WORDS) });
  }
  return out;
}

// ── the kind router (PR9) ────────────────────────────────────────────────────────────────────────
export const NEED_KINDS: ReadonlySet<ItemKind> = new Set(["pain_point", "desire", "outcome"]);
export const JOB_KINDS: ReadonlySet<ItemKind> = new Set(["job"]);
/** The kinds whose converter is not built yet — they land annotated, never dropped (rule 1). */
export const NOT_BUILT_KINDS: ReadonlySet<ItemKind> = new Set(["route", "step", "positioning", "cascade"]);
export const NOT_BUILT_REASON = "conversion for this kind is not built yet";

export type Conversion = {
  framework_statement: string | null;
  framework_form: FrameworkForm | null;
  judge_state: "accepted" | "annotated";
  judge_reason: string;
};

/** Which converter a kind takes. */
export function routeKind(kind: ItemKind): "need" | "job" | "not_built" {
  if (NEED_KINDS.has(kind)) return "need";
  if (JOB_KINDS.has(kind)) return "job";
  return "not_built";
}

// ── the job-statement writer: a raw-words variant of GEN_SYSTEM carrying the v3 rule ─────────────
export const JOB_FROM_WORDS_SYSTEM =
  "You restate what a person said as ONE job-to-be-done statement, in their own terms. " +
  "A job statement names what the executor is trying to get done, in the executor's own words. " +
  "It never names a provider, program, service line, facility, treatment setting, or category of supplier the executor would shop for. " +
  "Form: transitive verb + object + contextual clarifier. " +
  `NEVER use these words (they name a means, not a goal): ${MARKET_MEANS_TERMS.join(", ")}, program, service, services, therapy, facility, organizations that provide. ` +
  "Never name a company, brand or vendor. Do not invent anything the quoted words do not support. " +
  'JSON only: {"jtbd":"<one sentence>"}.';

export function buildJobFromWordsUser(rawWords: string, speaker: string | null): string {
  return `SPEAKER: ${speaker ?? "unknown"}\nTHEIR WORDS, verbatim:\n"""${rawWords}"""\nState the job they are trying to get done.`;
}

// ── the faithfulness judge (PR10, rewritten under RULING A, operator 2026-09-22) ─────────────────
//
// WHAT THE FIRST VERSION GOT WRONG, measured on the commit-3 throwaway: it asked whether the derived
// statement "says something the quoted words do not support", with no idea which FORM the statement had
// been written in. PR9 sends every need through the ODI canonical form, whose entire job is to add a
// direction verb (Minimize / Reduce / Maximize / Increase) and a "when" clause. The judge read that
// direction verb as an addition and rejected it — 9 of 9 items landed annotated, 0 accepted, and
// llama3:70b behaved the same way (1 of 4). Two signed rules were in tension, so `accepted` was
// unreachable for needs and the accepted/annotated distinction carried no signal.
//
// RULING A: the judge judges SUBSTANCE, and the FORM's own scaffolding is exempt as the form's, not the
// speaker's. It is told the item's kind and the form the statement was written in so it can apply that
// exemption to the right shape. Rule 4 is unchanged: a reason is mandatory on pass and on reject.
export const FAITHFUL_SYSTEM =
  "You judge whether a derived statement is FAITHFUL IN SUBSTANCE to the words it came from. " +
  "You are told the item's KIND and the FORM the statement was written in. " +
  "ok=false when the statement ADDS an object, a metric, a quantity, a context or a solution that the quoted words do not carry, " +
  "or LOSES the object or the context the speaker was actually talking about, " +
  "or names a provider, program, service line, facility, treatment setting or category of supplier as the thing being sought. " +
  "ok=true otherwise. " +
  "JUDGE SUBSTANCE, NOT WORDING. The FORM's own scaffolding is never an addition. " +
  "For FORM odi_need the direction verb (Minimize, Maximize, Reduce, Increase) and the frame " +
  "\"[verb] the [dimension] of [object] when [context]\" belong to the form, not to the speaker: they can never on their own make a statement unfaithful, " +
  "even when the speaker never said a direction verb and never said \"when\". " +
  "For FORM job_statement the verb + object + contextual clarifier shape belongs to the form in the same way. " +
  "So ask only this: is every OBJECT, METRIC, QUANTITY and CONTEXT in the statement carried by the quoted words, and is the speaker's own object and context still there? " +
  "ALWAYS state your reason — on pass (why it is faithful) and on reject (what it added, lost or named). " +
  'JSON only: {"ok":true|false,"reason":"one sentence — always present"}.';

export function buildFaithfulUser(args: { rawWords: string; statement: string; kind: ItemKind; form: FrameworkForm }): string {
  return `KIND: ${args.kind}\nFORM: ${args.form}\n` +
    `THEIR WORDS, verbatim:\n"""${args.rawWords}"""\nDERIVED STATEMENT:\n"""${args.statement}"""\n` +
    `Is the statement faithful IN SUBSTANCE to the words? Remember the ${args.form} scaffolding is the form's own.`;
}

const parseOkReason = (raw: string): { ok: boolean; reason: string } => {
  try {
    const p = JSON.parse(raw) as { ok?: unknown; reason?: unknown };
    return { ok: p.ok === true, reason: String(p.reason ?? "").trim() };
  } catch { return { ok: false, reason: "the judge's answer could not be parsed" }; }
};

/** The judge, on every converted statement. Nothing is dropped — a reject lands annotated. The kind
 *  and the form travel with the call (ruling A): without the form the judge cannot know which
 *  scaffolding is exempt, and the exemption is the whole of the ruling. */
export async function judgeFaithful(
  call: Call,
  args: { rawWords: string; statement: string; kind: ItemKind; form: FrameworkForm; model?: string },
): Promise<{ ok: boolean; reason: string }> {
  const raw = await call({ stage: "judge", system: FAITHFUL_SYSTEM, user: buildFaithfulUser(args), model: args.model });
  const v = parseOkReason(raw);
  return { ok: v.ok, reason: v.reason || (v.ok ? "the judge passed it without a stated reason" : "the judge rejected it without a stated reason") };
}

// ── conversion ───────────────────────────────────────────────────────────────────────────────────
/**
 * Convert one found item to framework form. Never throws and never returns an empty reason: rule 1
 * says every candidate lands and rule 4 says the reason is mandatory both ways.
 */
export async function convertItem(args: {
  call: Call;
  kind: ItemKind;
  rawWords: string;
  speaker: string | null;
  jobExecutor: string;
  judgeModel?: string;
  /** Injected so the proof can vote without a model; defaults to the real 3-call majority. */
  solutionAgnostic?: (statement: string) => Promise<{ solutionFree: boolean; tally: string; reason: string }>;
}): Promise<Conversion> {
  const route = routeKind(args.kind);
  if (route === "not_built") {
    return { framework_statement: null, framework_form: null, judge_state: "annotated", judge_reason: NOT_BUILT_REASON };
  }

  if (route === "need") {
    // ODI canonical form, with ONE re-prompt carrying the format reason (PR9).
    let statement = "";
    let formatReason = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const user = buildOdiCanonicalUser(args.rawWords, args.jobExecutor) + (formatReason ? `\nYour previous attempt was rejected: ${formatReason}. Fix exactly that.\n` : "");
      const raw = await args.call({ stage: "convert:need", system: ODI_CANONICAL_SYSTEM, user });
      try { statement = String((JSON.parse(raw) as { odi_canonical_statement?: unknown })?.odi_canonical_statement ?? "").trim(); }
      catch { statement = ""; }
      const check = isValidCanonical(statement, args.rawWords);
      if (check.ok) { formatReason = ""; break; }
      formatReason = check.reason ?? "invalid canonical form";
    }
    if (formatReason) {
      return { framework_statement: statement || null, framework_form: "odi_need", judge_state: "annotated", judge_reason: `ODI format rejected after one retry: ${formatReason}` };
    }
    const j = await judgeFaithful(args.call, { rawWords: args.rawWords, statement, kind: args.kind, form: "odi_need", model: args.judgeModel });
    return { framework_statement: statement, framework_form: "odi_need", judge_state: j.ok ? "accepted" : "annotated", judge_reason: j.reason };
  }

  // job: write it, then the DETERMINISTIC means layer, then solution-agnostic v3, then faithfulness.
  const raw = await args.call({ stage: "convert:job", system: JOB_FROM_WORDS_SYSTEM, user: buildJobFromWordsUser(args.rawWords, args.speaker) });
  let statement = "";
  try { statement = String((JSON.parse(raw) as { jtbd?: unknown })?.jtbd ?? "").trim(); } catch { statement = ""; }
  if (!statement) {
    return { framework_statement: null, framework_form: "job_statement", judge_state: "annotated", judge_reason: "the job writer returned nothing usable" };
  }
  const hits = marketMeansHits(statement);
  if (hits.length) {
    return { framework_statement: statement, framework_form: "job_statement", judge_state: "annotated", judge_reason: marketMeansReason(hits) };
  }
  const sa = args.solutionAgnostic
    ? await args.solutionAgnostic(statement)
    : await judgeSolutionAgnosticMajority(async () => {
        const r = await args.call({ stage: `convert:job:solution_agnostic_v${CRITERION_VERSION}`, system: SOLUTION_AGNOSTIC_SYSTEM, user: buildSolutionAgnosticUser("", args.jobExecutor, statement), model: args.judgeModel });
        const p = parseOkReason(r);
        try {
          const j = JSON.parse(r) as { solution_free?: unknown; reason?: unknown };
          return { solutionFree: j.solution_free === true, reason: String(j.reason ?? "").trim() };
        } catch { return { solutionFree: false, reason: p.reason }; }
      });
  if (!sa.solutionFree) {
    return { framework_statement: statement, framework_form: "job_statement", judge_state: "annotated", judge_reason: `solution-agnostic v${CRITERION_VERSION} rejected (${sa.tally}): ${sa.reason}` };
  }
  const j = await judgeFaithful(args.call, { rawWords: args.rawWords, statement, kind: args.kind, form: "job_statement", model: args.judgeModel });
  return { framework_statement: statement, framework_form: "job_statement", judge_state: j.ok ? "accepted" : "annotated", judge_reason: j.reason };
}
