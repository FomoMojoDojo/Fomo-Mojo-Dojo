// ── The FINDER prompt, the KIND ROUTER, the CONVERTERS and the JUDGE (parser commit 3, PR8–PR10) ──
//
// Pure except where a call function is injected: every model call is a `Call` the caller supplies, so
// these are unit-testable without a model and the served function owns the ledger.
import { ODI_CANONICAL_SYSTEM, buildOdiCanonicalUser, isValidCanonical } from "../_shared/odiCanonical.ts";
import { MARKET_MEANS_TERMS, marketMeansHits, marketMeansReason } from "../_shared/marketMeansTerms.ts";
import {
  SOLUTION_AGNOSTIC_SYSTEM, buildSolutionAgnosticUser, judgeSolutionAgnosticMajority, CRITERION_VERSION,
} from "../_shared/solutionAgnosticJudge.ts";
import {
  ITEM_KINDS, NEAR_DUPLICATE_REASON, NO_CONVERTER_REASON, SCOPES,
  type FrameworkForm, type ItemKind, type Scope,
} from "../_shared/interviewItems.ts";
import { MAX_PASSAGE_CHARS, type Passage } from "./segment.ts";

/** One model call. The served function passes a ledgering implementation; tests pass a stub. */
export type Call = (args: { stage: string; system: string; user: string; model?: string }) => Promise<string>;

/** R1 (operator review, 2026-09-23): a quote is whole sentences, so the cap is the passage cap — a
 *  400-character ceiling was cutting sentences in half, which is the defect R1 names. Any cut this
 *  code makes happens at a sentence boundary (see clampToSentences). */
export const MAX_RAW_WORDS = MAX_PASSAGE_CHARS;
/** R1: a quote under this many words is a fragment; the finder was told to extend it to the sentence
 *  that completes it, and one that arrives short anyway is dropped rather than landed as a clause. */
export const MIN_RAW_WORDS = 6;

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
  "laying out a chain of intent — where they will play, how they intend to win, what they will not do (kind cascade); " +
  // R4 (operator review, 2026-09-23)
  "making a request, handing over a task, or giving feedback on this work or this read (kind ask); " +
  "or stating a belief about why something is the way it is, or about themselves (kind hypothesis). " +
  "A NARRATED FACT IS NOT AN ITEM. A schedule, a headcount, a date, a piece of history, or a description of what the " +
  "company does is not an item, however clearly it is stated. " +
  "\"There is a handover meeting every fortnight\" is a schedule, not a step. " +
  "\"The team has grown by three people since the spring\" is a headcount, not an item of any kind. " +
  "If a passage contains no item, RETURN NOTHING FOR IT. Returning nothing for a whole window is a correct answer " +
  "when the window is narration. Do not pad the list. " +
  // R2 (operator review): the finder had been returning one item per passage and losing the rest.
  "EVERY ITEM IN THE PASSAGE. A passage often carries more than one. If a speaker names three separate " +
  "difficulties, that is THREE pain_point items with THREE different quotes — never one item covering all three, " +
  "and never the same quote twice. Read the whole passage before you answer it. " +
  // R1 (operator review): quotes had been clauses, unreadable on their own.
  "WHOLE SENTENCES ONLY. raw_words is one or more COMPLETE SENTENCES copied verbatim from the passage — " +
  "start at a capital letter and end at the full stop, question mark or exclamation mark. " +
  "Never a clause, never a fragment, never a sentence with its beginning or its end cut off. " +
  "If the thought runs across two sentences, quote both. " +
  `At most ${MAX_RAW_WORDS} characters; if the sentences would exceed that, quote fewer whole sentences. ` +
  "Copy exactly, including punctuation. " +
  "passage_index is the number of the passage the quote came from. " +
  // R5 (operator review)
  "SCOPE. Every item says what it is ABOUT: \"market\" when it is about donors, funders, clients, partners or the " +
  "outside world; \"internal\" when it is about the speaker's own organization, team, staffing, process or tools. " +
  "Do not merge two items into one and do not invent items the words do not support. " +
  'JSON only: {"items":[{"passage_index":<int>,"kind":"job|pain_point|desire|outcome|route|step|positioning|cascade|ask|hypothesis","scope":"market|internal","raw_words":"<one or more complete sentences, verbatim>"}]}.';

export function buildFinderUser(passages: readonly Passage[], offset: number): string {
  return passages
    .map((p, i) => `[${offset + i}] ${p.speaker_label ?? "unknown speaker"}: ${p.text}`)
    .join("\n\n");
}

export type FoundItem = { passage_index: number; kind: ItemKind; scope: Scope; raw_words: string };

/** R1: cut only at a sentence boundary. Returns the longest run of WHOLE sentences that fits, or ""
 *  when even the first sentence does not — a half sentence is never a quote. */
export function clampToSentences(text: string, max = MAX_RAW_WORDS): string {
  const t = String(text ?? "").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  // a sentence ends at . ? or ! followed by whitespace or the end
  const ends: number[] = [];
  const re = /[.?!]+(?=\s|$)/g;
  for (const m of t.matchAll(re)) ends.push(m.index! + m[0].length);
  let best = "";
  for (const e of ends) { if (e <= max) best = t.slice(0, e).trim(); else break; }
  return best;
}

/** Whitespace/case/punctuation-insensitive, for the R2 same-quote check and R9's dedup. */
export const normalizeQuote = (s: string): string =>
  String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();

/** R1: the word count a quote must reach to be an item at all. */
export const wordCount = (text: string): number => String(text ?? "").trim().split(/\s+/).filter(Boolean).length;

/** Parse the finder's answer defensively: a malformed entry is dropped, never guessed at. */
export function parseFinderOutput(raw: string): FoundItem[] {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return []; }
  const items = (parsed as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  const KINDS = new Set<string>(ITEM_KINDS); // every kind, taken from the store's own list
  const SCOPESET = new Set<string>(SCOPES);
  const out: FoundItem[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const o = it as Record<string, unknown>;
    const kind = String(o?.kind ?? "");
    const idx = Number(o?.passage_index);
    if (!KINDS.has(kind) || !Number.isFinite(idx)) continue;
    // R1: whole sentences, cut at a boundary, and never a fragment.
    const words = clampToSentences(String(o?.raw_words ?? ""));
    if (!words || wordCount(words) < MIN_RAW_WORDS) continue;
    // R2: three needs in a passage means three DIFFERENT quotes — the same quote twice is one item.
    const key = `${Math.trunc(idx)}|${kind}|${normalizeQuote(words)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // R5: an unusable scope is not guessed at — market is the reading the operator's own backfill took.
    const scope = SCOPESET.has(String(o?.scope ?? "")) ? (String(o.scope) as Scope) : "market";
    out.push({ passage_index: Math.trunc(idx), kind: kind as ItemKind, scope, raw_words: words });
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
/** R4: these two are not "not built yet" — they are RECORDED BY DESIGN. An ask is a job for us, not a
 *  job for the market; a hypothesis is a belief, not a need. Neither has a framework form to convert
 *  into, so the reason names the kind rather than promising a converter that is coming. */
export const RECORDED_KINDS: ReadonlySet<ItemKind> = new Set(["ask", "hypothesis"]);

export type Conversion = {
  framework_statement: string | null;
  framework_form: FrameworkForm | null;
  judge_state: "accepted" | "annotated";
  judge_reason: string;
};

/** Which converter a kind takes. */
export function routeKind(kind: ItemKind): "need" | "job" | "recorded" | "not_built" {
  if (NEED_KINDS.has(kind)) return "need";
  if (JOB_KINDS.has(kind)) return "job";
  if (RECORDED_KINDS.has(kind)) return "recorded";
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
  // R3 (operator review, 2026-09-23). The refusal was firing on plain statements of intent — "we need
  // to expand our donor base" is an executor with a goal, and it was being refused as having neither.
  "\"We need to…\", \"we have to…\", \"I want to…\", \"we should…\", \"let us…\", and an instruction the speaker " +
  "addresses to their own team ALL name an actor with a goal. So does a story whose teller is plainly the one acting. " +
  "The actor may be \"we\", \"I\", the team, or the organisation itself. " +
  "REFUSE ONLY when the words name NO actor at all — a bare schedule, a headcount, a date, a statistic standing alone. " +
  'If and only if there is no actor, answer {"no_executor_goal":true} and nothing else — do not invent an actor. ' +
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
  // R6 (operator review): a kickoff is mostly stories. The need a story implies IS in the words —
  // it is simply not in any one clause of them.
  "WHEN THE WORDS TELL A STORY, state the need the story implies. What the speaker was up against, and " +
  "what they were trying to achieve, are carried by the story as a whole; you do not need a sentence that " +
  "states the need outright. Do not add anything the story does not support. " +
  "The [dimension] must be something the quoted words actually name or measure, and the [context] after \"when\" " +
  "must be a circumstance the quoted words actually describe. " +
  // R8 (operator review, restated): the when-clause is OPTIONAL. A statement with no circumstance is
  // complete without one; an invented circumstance is the defect the kickoff was full of.
  "The \"when\" clause is present ONLY when the words carry a circumstance. If they carry none, leave it out " +
  "entirely and end the statement at the object — a statement with no when-clause is correct and complete. " +
  "NEVER name the executor anywhere in the statement: not as the object, not in the when-clause, not as \"when the " +
  "interviewee\" or \"for the team\". The statement says what is to be achieved, not who is achieving it. " +
  "Never introduce a metric, a dimension or a circumstance the words do not carry. " +
  'If the quoted words carry NO circumstance you could put after "when", answer {"no_context":true} and nothing else — do not invent one.';

export const ODI_CANONICAL_SYSTEM_R2 = ODI_CANONICAL_SYSTEM + ODI_CONTEXT_RULE;

/** R8: the one reject of the shared format guard that does not apply to interview items. Matched on
 *  the guard's own wording, so a change there surfaces as a test failure rather than silently
 *  re-enabling the rule. */
export const MISSING_WHEN_REASON = "missing 'when' clause";
export const isMissingWhenReject = (reason: string | undefined): boolean => reason === MISSING_WHEN_REASON;

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
  // R6 (operator review, 2026-09-23). The judge was reading a story clause by clause: given "a family
  // called on a Friday and waited the whole weekend", it called "time to respond" an added metric,
  // because no clause said "time" or "respond". A story CARRIES its need; the test is the story, not
  // any one sentence of it.
  "WHEN THE QUOTED WORDS TELL A STORY, judge the statement against what the STORY carries, not against " +
  "any single clause of it. A story about a family waiting all weekend carries delay and response as its " +
  "subject even though it never uses those words. Naming what the story is plainly about is NOT an addition. " +
  "It is an addition only when the story does not support it at all. " +
  "So ask only this: is every OBJECT, METRIC, QUANTITY and CONTEXT in the statement carried by the quoted words — taken as a whole — and is the speaker's own object and context still there? " +
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
  /** R7: whose side said it, and what it is about. Together they decide whether the MEANS test applies. */
  side?: "client" | "ours";
  scope?: Scope;
  judgeModel?: string;
  /** Injected so the proof can vote without a model; defaults to the real 3-call majority. */
  solutionAgnostic?: (statement: string) => Promise<{ solutionFree: boolean; tally: string; reason: string }>;
}): Promise<Conversion> {
  const route = routeKind(args.kind);
  if (route === "not_built") {
    return { framework_statement: null, framework_form: null, judge_state: "annotated", judge_reason: NOT_BUILT_REASON };
  }
  // R4: recorded by design — no form, no converter, no model call.
  if (route === "recorded") {
    return { framework_statement: null, framework_form: null, judge_state: "annotated", judge_reason: NO_CONVERTER_REASON(args.kind) };
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
      // R8: the shared guard still checks empty / identical / missing formula verb. Its "missing when"
      // reject is OFF for interview items: the when-clause is conditional now, so demanding one is
      // exactly what drove the writer to invent circumstances. The shared module is untouched — three
      // other callers depend on it — and the reject is filtered here, where the rule applies.
      const check = isValidCanonical(statement, args.rawWords);
      if (!check.ok && !isMissingWhenReject(check.reason)) { formatReason = check.reason ?? "invalid canonical form"; continue; }
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
  // ── R7 (operator review, 2026-09-23): the MEANS test is about a market executor shopping for a
  // supplier. A CLIENT-side item is the company talking about its OWN work, where "the programme",
  // "our clinicians", "the service we run" are the legitimate object of the job — not a means the
  // executor would shop for. Applying the market test there rejected the company's own work as a
  // supplier category. So both means layers apply only to MARKET-scope items from a non-company
  // executor; internal-scope and client-side items skip them and go straight to faithfulness.
  const meansApplies = args.scope !== "internal" && args.side !== "client";
  if (!meansApplies) {
    const jc = await judgeFaithful(args.call, { rawWords: args.rawWords, statement, kind: args.kind, form: "job_statement", model: args.judgeModel });
    return { framework_statement: statement, framework_form: "job_statement", judge_state: jc.ok ? "accepted" : "annotated", judge_reason: jc.reason };
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

// ── R9: CONCEPT DEDUP (operator review, 2026-09-23) ──────────────────────────────────────────────
//
// Two passages can say the same thing, and the writer turns both into near-identical statements. Rule
// 1 forbids dropping either, so neither is dropped: the LATER one keeps its row and is annotated with
// the id of the one it repeats. The operator sees a pair, not a silent deletion, and the pointer of
// each still leads to the passage it came from.
//
// "Near-duplicate" is length-matched Dice ≥ 0.85 on the normalized statement — the same measure the
// locator uses, so there is one notion of similarity in this pipeline, not two.
import { bestLocalSimilarity } from "./locate.ts";

export const DEDUP_THRESHOLD = 0.85;

export type DedupCandidate = { id: string; framework_statement: string | null; created_at?: string };
export type DedupVerdict = { id: string; duplicate_of: string; similarity: number; reason: string };

/** The items that repeat an EARLIER item's statement. Order is the order given — the caller hands them
 *  in landing order, so "later" means later in that order. An item with no statement never matches. */
export function findNearDuplicates(items: readonly DedupCandidate[], threshold = DEDUP_THRESHOLD): DedupVerdict[] {
  const out: DedupVerdict[] = [];
  const kept: Array<{ id: string; norm: string }> = [];
  for (const it of items) {
    const norm = normalizeQuote(it.framework_statement ?? "");
    if (!norm) continue;
    let best: { id: string; s: number } | null = null;
    for (const k of kept) {
      // symmetric: compare each against the other length-matched and take the stronger reading
      const s = Math.max(bestLocalSimilarity(norm, k.norm), bestLocalSimilarity(k.norm, norm));
      if (!best || s > best.s) best = { id: k.id, s };
    }
    if (best && best.s >= threshold) {
      out.push({ id: it.id, duplicate_of: best.id, similarity: best.s, reason: NEAR_DUPLICATE_REASON(best.id) });
      continue; // a duplicate is not itself a yardstick for the next one
    }
    kept.push({ id: it.id, norm });
  }
  return out;
}
