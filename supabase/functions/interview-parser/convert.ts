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
  "THE ITEM TEST. An item is a passage where a speaker is " +
  "trying to get something done (kind job); " +
  "struggling with or losing something (kind pain_point); " +
  "wanting something (kind desire); " +
  "naming a result they judge by (kind outcome); " +
  "stating how they reach customers (kind route); " +
  "naming a step they take toward a job (kind step); " +
  "saying what they stand for against the alternatives (kind positioning); " +
  "or laying out a chain of intent — where they will play, how they intend to win, what they will not do (kind cascade). " +
  "A NARRATED FACT IS NOT AN ITEM. A schedule, a headcount, a date, a piece of history, or a description of what the " +
  "company does is not an item, however clearly it is stated. " +
  "\"There is a handover meeting every fortnight\" is a schedule, not a step. " +
  "\"The team has grown by three people since the spring\" is a headcount, not an item of any kind. " +
  "\"Funding is reviewed at the end of each quarter\" is a schedule, not a job. " +
  "\"The referral came through on a Tuesday\" is a narrated fact, not a step. " +
  "If a passage contains no item, RETURN NOTHING FOR IT. Returning nothing for a whole window is a correct answer " +
  "when the window is narration. Do not pad the list. " +
  "raw_words MUST be a VERBATIM quote copied from the passage — never a paraphrase, never your own " +
  `words, at most ${MAX_RAW_WORDS} characters. Copy it exactly, including punctuation. ` +
  "passage_index is the number of the passage the quote came from. " +
  "Do not merge two items into one and do not invent items the words do not support. " +
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

// ── R3: the NUMERIC INVENTION guard (operator ruling, 2026-09-22) ────────────────────────────────
//
// Measured on the commit-3 re-proof: given "We lose two whole days every month reconciling the intake
// spreadsheet by hand", the ODI writer returned "Reduce the time spent reconciling the intake
// spreadsheet TO TWO DAYS PER MONTH" — a target the speaker never set, built out of a quantity they
// used to describe the loss. The judge caught it, but only after a judge call was spent, and only
// because it happened to notice. A digit is decidable, so the code decides it.
//
// THE RULE: every digit sequence in the framework statement must occur in the raw words. Nothing is
// inferred about meaning — "48" in the statement when the words say "forty eight" is a VIOLATION, and
// deliberately so: the writer was told to keep the executor's words, and a numeral the speaker never
// typed is the writer's, not theirs. A violation re-prompts ONCE carrying the reason, then lands
// annotated. No model call is spent on the check itself.
export const NUMERIC_INVENTION_REASON = "adds a quantity the words do not carry";

/** Every digit run, thousands separators removed and leading zeros kept (they can be meaningful). */
export function numbersIn(text: string): string[] {
  const out: string[] = [];
  for (const m of String(text ?? "").matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    out.push(m[0].replace(/,/g, ""));
  }
  return out;
}

/** The numbers the statement carries that the raw words do not. Empty array = the statement is clean. */
export function inventedNumbers(statement: string, rawWords: string): string[] {
  const carried = new Set(numbersIn(rawWords));
  const seen = new Set<string>();
  return numbersIn(statement).filter((n) => !carried.has(n) && !seen.has(n) && (seen.add(n), true));
}

/** The re-prompt's reason line — it names the offending numbers so the retry can fix exactly that. */
export function numericInventionReason(invented: readonly string[]): string {
  return `${NUMERIC_INVENTION_REASON}: ${invented.join(", ")}`;
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
export const NO_EXECUTOR_GOAL_REASON = "no executor goal in the words";

export const JOB_FROM_WORDS_SYSTEM =
  "You restate what a person said as ONE job-to-be-done statement, in their own terms. " +
  // R2 (operator ruling, 2026-09-22). A job item names an ACTOR and a GOAL. The commit-3 re-proof
  // landed 29 "jobs" whose words were "Funding for the programme is reviewed at the end of each
  // quarter" — a schedule with no actor trying to get anything done, restated as a job because the
  // writer was only ever asked to restate. The refusal rides on the call the writer already makes, so
  // it costs nothing: the writer answers with no_executor_goal instead of inventing an actor.
  "FIRST decide whether the words name an ACTOR who is trying to GET SOMETHING DONE. " +
  "A schedule, a headcount, a narrated fact, or a description of what an organisation does names no actor with a goal. " +
  'If the words name no such actor and goal, answer {"no_executor_goal":true} and nothing else — do not invent an actor, and do not restate the fact as a job. ' +
  "A job statement names what the executor is trying to get done, in the executor's own words. " +
  "It never names a provider, program, service line, facility, treatment setting, or category of supplier the executor would shop for. " +
  "Form: transitive verb + object + contextual clarifier. " +
  `NEVER use these words (they name a means, not a goal): ${MARKET_MEANS_TERMS.join(", ")}, program, service, services, therapy, facility, organizations that provide. ` +
  "Never name a company, brand or vendor. Do not invent anything the quoted words do not support. " +
  'JSON only: {"jtbd":"<one sentence>"} — or {"no_executor_goal":true}.';

export function buildJobFromWordsUser(rawWords: string, speaker: string | null): string {
  return `SPEAKER: ${speaker ?? "unknown"}\nTHEIR WORDS, verbatim:\n"""${rawWords}"""\nState the job they are trying to get done.`;
}

// ── R2: the ODI writer's CONTEXT rule (operator ruling, 2026-09-23) ──────────────────────────────
//
// Measured on Edgewood's kickoff: 40 of 43 need items landed annotated, and 35 of those 40 rejections
// were the writer ADDING a dimension or a context the words never carried — "when the interviewee",
// "when handling inquiries", "the visibility of". The writer had been handed a job_executor string to
// fill the when-clause with, and when the record carried no journey_key that string was the literal
// fallback "the interviewee", which is not a context at all.
//
// R2: the dimension and the when-context must both come from the RAW WORDS. If the words carry no
// context, the writer says so instead of inventing one, and the item lands annotated with the signed
// reason. The refusal rides on the call the writer already makes — the same shape as R2 of commit 3b —
// so it costs nothing, and the "the interviewee" fallback is gone from handler.ts.
export const NO_CONTEXT_REASON = "no context in the words";

/** Appended to ODI_CANONICAL_SYSTEM; the shared formula prompt itself is untouched, because three
 *  other callers depend on it byte-for-byte. */
export const ODI_CONTEXT_RULE =
  " R2 (2026-09-23) — THE DIMENSION AND THE CONTEXT COME FROM THE SPEAKER, NOT FROM YOU. " +
  "The [dimension] must be something the quoted words actually name or measure, and the [context] after \"when\" " +
  "must be a circumstance the quoted words actually describe. " +
  "Never fill the when-clause with a description of who the speaker is; that is not a context. " +
  "Never introduce a metric, a dimension or a circumstance the words do not carry. " +
  'If the quoted words carry NO circumstance you could put after "when", answer {"no_context":true} and nothing else — do not invent one.';

export const ODI_CANONICAL_SYSTEM_R2 = ODI_CANONICAL_SYSTEM + ODI_CONTEXT_RULE;

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
  // R3 (operator ruling, 2026-09-23). Ruling A exempted the scaffolding but the judge kept CITING it:
  // 21 of Edgewood's 40 need rejections named a direction verb inside the reason, alongside whatever
  // the real objection was. A reason that names the exempt scaffolding is unreadable as an objection,
  // so the rule is now explicit in both directions — never cite it, and if it is the ONLY thing you
  // could object to, the verdict is ok=true.
  "NEVER CITE THE EXEMPT SCAFFOLDING AS AN OBJECTION. Do not write that the statement 'adds' or " +
  "'introduces' the direction verb (Minimize, Maximize, Reduce, Increase), the formula frame, or the " +
  "verb + object + clarifier shape — those are the form's and are never a fault. " +
  "If the ONLY thing you could object to is the direction verb or the form's shape, answer ok=true. " +
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
    // R3 rides in the SAME loop as the format guard: whichever of the two fails, the one retry carries
    // its reason. A numeric violation is not a format error, so it keeps its own signed reason.
    let numericReason = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const prior = formatReason || numericReason;
      const user = buildOdiCanonicalUser(args.rawWords, args.jobExecutor) + (prior ? `\nYour previous attempt was rejected: ${prior}. Fix exactly that.\n` : "");
      const raw = await args.call({ stage: "convert:need", system: ODI_CANONICAL_SYSTEM_R2, user });
      let parsed: { odi_canonical_statement?: unknown; no_context?: unknown } = {};
      try { parsed = JSON.parse(raw) as typeof parsed; } catch { parsed = {}; }
      // R2: the writer was asked to decide this on the call it was already making.
      if (parsed.no_context === true) {
        return { framework_statement: null, framework_form: "odi_need", judge_state: "annotated", judge_reason: NO_CONTEXT_REASON };
      }
      statement = String(parsed.odi_canonical_statement ?? "").trim();
      formatReason = ""; numericReason = "";
      const check = isValidCanonical(statement, args.rawWords);
      if (!check.ok) { formatReason = check.reason ?? "invalid canonical form"; continue; }
      const invented = inventedNumbers(statement, args.rawWords);   // R3: decided by the code, no call
      if (invented.length) { numericReason = numericInventionReason(invented); continue; }
      break;
    }
    if (formatReason) {
      return { framework_statement: statement || null, framework_form: "odi_need", judge_state: "annotated", judge_reason: `ODI format rejected after one retry: ${formatReason}` };
    }
    if (numericReason) {
      return { framework_statement: statement || null, framework_form: "odi_need", judge_state: "annotated", judge_reason: numericReason };
    }
    const j = await judgeFaithful(args.call, { rawWords: args.rawWords, statement, kind: args.kind, form: "odi_need", model: args.judgeModel });
    return { framework_statement: statement, framework_form: "odi_need", judge_state: j.ok ? "accepted" : "annotated", judge_reason: j.reason };
  }

  // job: write it, then the DETERMINISTIC means layer, then solution-agnostic v3, then faithfulness.
  let statement = "";
  let jobNumericReason = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const user = buildJobFromWordsUser(args.rawWords, args.speaker) +
      (jobNumericReason ? `\nYour previous attempt was rejected: ${jobNumericReason}. Fix exactly that.\n` : "");
    const raw = await args.call({ stage: "convert:job", system: JOB_FROM_WORDS_SYSTEM, user });
    let parsed: { jtbd?: unknown; no_executor_goal?: unknown } = {};
    try { parsed = JSON.parse(raw) as typeof parsed; } catch { parsed = {}; }
    // R2: the writer was asked to decide this first, on the call it was already making.
    if (parsed.no_executor_goal === true) {
      return { framework_statement: null, framework_form: "job_statement", judge_state: "annotated", judge_reason: NO_EXECUTOR_GOAL_REASON };
    }
    statement = String(parsed.jtbd ?? "").trim();
    if (!statement) break;
    const invented = inventedNumbers(statement, args.rawWords);     // R3 again, same rule, no call
    jobNumericReason = invented.length ? numericInventionReason(invented) : "";
    if (!jobNumericReason) break;
  }
  if (!statement) {
    return { framework_statement: null, framework_form: "job_statement", judge_state: "annotated", judge_reason: "the job writer returned nothing usable" };
  }
  if (jobNumericReason) {
    return { framework_statement: statement, framework_form: "job_statement", judge_state: "annotated", judge_reason: jobNumericReason };
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
