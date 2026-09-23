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
  // 4d R3: the window now shows, for each passage, the two turns before it and whose side they were.
  "Each passage is shown with the TWO TURNS BEFORE IT and whose side each was — [client] or [ours]. " +
  "[ours] is the consultant running the session; [client] is the person being interviewed. " +
  "Read the context before you judge the passage: the same sentence means different things as an " +
  "unprompted statement and as an answer. " +
  "AN ANSWER IS NOT AN ITEM. When a client passage answers a question our side just asked, confirms a " +
  "fact, or asks a clarifying question back, it yields NOTHING — unless it ALSO states a want, a " +
  "struggle, a goal or a result of its own, in which case that part is the item. " +
  // 4d R4: the two-step output
  "WORK IN TWO STEPS, per passage. " +
  "STEP ONE: list the WANTS, STRUGGLES, GOALS and RESULTS the passage carries, each as an OBJECT of at " +
  "most six words, using the passage's own words. If the passage carries none, list none and move on. " +
  "STEP TWO: for each object, give the VERBATIM SENTENCE OR SENTENCES from that passage that carry it — " +
  "complete sentences, copied exactly, and each one must actually contain the object's words. " +
  "One entry per object. Two objects means two entries with two different quotes. " +
  "kind, per object: " +
  "job (something they are trying to get done); " +
  "pain_point (something hard, slow, costly or frustrating); " +
  "desire (something they want to be true); " +
  "outcome (a result they judge by); " +
  "route (how they reach customers); " +
  "step (a stage of a process toward a job); " +
  "positioning (what they stand for against the alternatives); " +
  "cascade (where they will play, how they will win, what they will not do); " +
  // 4d R3/R5
  "ask (a request, a task, or feedback aimed at us, at this work, or at the document on screen); " +
  "hypothesis (a belief about why something is the way it is, or about themselves). " +
  "A CLIENT REQUEST AIMED AT US OR AT MOJOMAP IS AN ASK. So is a reaction to the read on screen — a " +
  "comment on the first read, a paragraph, a claim or a chip is an ask, whether it agrees or disagrees. " +
  "When such a reaction ALSO implies a need of their own, give a SECOND entry for that need under its " +
  "own kind. " +
  "A NARRATED FACT IS NOT AN ITEM. A schedule, a headcount, a date, a piece of history, or a " +
  "description of what the company does is not an item, however clearly it is stated. " +
  "SCOPE, per object: \"market\" when it is about donors, funders, clients, partners or the outside " +
  "world; \"internal\" when it is about the speaker's own organization, team, staffing, process or tools. " +
  `raw_words is one or more COMPLETE SENTENCES, at most ${MAX_RAW_WORDS} characters, copied exactly. ` +
  "passage_index is the number of the passage the quote came from. " +
  "Do not invent objects the passage does not carry, and do not reuse one quote for two objects. " +
  'JSON only: {"items":[{"passage_index":<int>,"object":"<= 6 words from the passage>","kind":"job|pain_point|desire|outcome|route|step|positioning|cascade|ask|hypothesis","scope":"market|internal","raw_words":"<verbatim sentence(s) containing the object>"}]}.';

/** 4d R5: an ask that is a reaction to the document on screen carries this prefix on its reason, so
 *  the operator can tell feedback on the read from a request for work. */
export const READ_FEEDBACK_PREFIX = "read feedback:";

/**
 * 4d R3: the window is rendered as the CONVERSATION it is — each passage on its own line, tagged with
 * whose side spoke it, in order. Every passage therefore already has its two preceding turns directly
 * above it; the only ones that would not are the first two of a window, so up to two passages from
 * BEFORE the window are prepended as context and marked as context.
 *
 * WHY NOT REPEAT THE TWO PREDECESSORS UNDER EACH PASSAGE: measured. That rendering turned a 12,000
 * character window into a 47,698 character prompt — roughly 12,000 tokens against num_ctx 8192 — so
 * Ollama silently truncated it and the finder returned 4 items for an 18k transcript that had been
 * yielding a hundred. Linear rendering gives the model the same context at no size cost.
 *
 * `all` is the whole transcript's passages, `start` is where this window begins in it, and `sideOf`
 * answers client|ours for a speaker label.
 */
export function buildFinderUser(
  passages: readonly Passage[],
  offset: number,
  ctx?: { all: readonly Passage[]; start: number; sideOf: (label: string | null) => "client" | "ours" },
): string {
  if (!ctx) {
    return passages.map((p, i) => `[${offset + i}] ${p.speaker_label ?? "unknown speaker"}: ${p.text}`).join("\n\n");
  }
  const body = (p: Passage) => {
    // the passage text repeats its own header line; the tagged label above it is what the model reads
    const lines = String(p.text).split("\n");
    const first = lines[0] ?? "";
    const rest = /\|\s*\d{1,2}:\d{2}/.test(first) ? lines.slice(1) : lines;
    return rest.join("\n").trim() || String(p.text).trim();
  };
  const tagged = (p: Passage) => `[${ctx.sideOf(p.speaker_label)}] ${p.speaker_label ?? "unknown speaker"}: ${body(p)}`;
  const lead = ctx.all.slice(Math.max(0, ctx.start - 2), ctx.start)
    .map((p) => `(context, before this window — do not take items from it) ${tagged(p)}`);
  const head = ctx.start === 0
    ? ["(start of transcript)"]
    : (lead.length ? lead : []);
  return [...head, ...passages.map((p, i) => `[${offset + i}] ${tagged(p)}`)].join("\n\n");
}

export type FoundItem = { passage_index: number; kind: ItemKind; scope: Scope; raw_words: string; object: string };

/** 4d R4: why an entry was dropped, counted so a run can report how much the two-step check refused. */
export type FinderDrops = {
  object_not_in_passage: number; quote_without_object: number; fragment: number; malformed: number; duplicate: number;
  /** Not a drop: the object was found, but in a DIFFERENT passage of the window than the model named.
   *  Counted because it measures how often the model's index is wrong — which rule 2 already assumes. */
  object_in_other_passage: number;
};
export const MAX_OBJECT_WORDS = 6;

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
/** `passageTexts` turns on R4's two-step check: without it (a unit test with no transcript) the
 *  object rules are skipped and the rest of the parsing is unchanged. `drops` counts the refusals. */
export function parseFinderOutput(
  raw: string,
  passageTexts?: ReadonlyMap<number, string>,
  drops?: FinderDrops,
): FoundItem[] {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return []; }
  const items = (parsed as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  const KINDS = new Set<string>(ITEM_KINDS); // every kind, taken from the store's own list
  const SCOPESET = new Set<string>(SCOPES);
  const out: FoundItem[] = [];
  const seen = new Set<string>();
  const d = drops ?? { object_not_in_passage: 0, quote_without_object: 0, fragment: 0, malformed: 0, duplicate: 0, object_in_other_passage: 0 };
  for (const it of items) {
    const o = it as Record<string, unknown>;
    const kind = String(o?.kind ?? "");
    const idx = Number(o?.passage_index);
    if (!KINDS.has(kind) || !Number.isFinite(idx)) { d.malformed++; continue; }
    // 4c R1: whole sentences, cut at a boundary, and never a fragment.
    const words = clampToSentences(String(o?.raw_words ?? ""));
    if (!words || wordCount(words) < MIN_RAW_WORDS) { d.fragment++; continue; }
    // ── 4d R4: the two-step check. Both halves are decided by the CODE, never by the model. ──
    const object = String(o?.object ?? "").trim();
    const objNorm = normalizeQuote(object);
    if (passageTexts) {
      const objWords = objNorm.split(" ").filter(Boolean);
      if (!objWords.length || objWords.length > MAX_OBJECT_WORDS) { d.object_not_in_passage++; continue; }
      // (a) every word of the object must occur in the passage it was drawn from.
      //
      // RULE 2 APPLIES HERE TOO: the model's passage_index is a hint, never a pointer — measured, it
      // comes back off by one often enough that keying the check on it alone dropped every item of a
      // one-passage window. So the named passage is tried FIRST, and a miss falls back to the rest of
      // the window the model was actually shown. An object that is in NO passage of the window is
      // invented, which is what this rule exists to refuse.
      const named = normalizeQuote(passageTexts.get(Math.trunc(idx)) ?? "");
      const inNamed = named.length > 0 && objWords.every((w) => named.includes(w));
      if (!inNamed) {
        const elsewhere = [...passageTexts.values()].some((t) => {
          const hay = normalizeQuote(t);
          return objWords.every((w) => hay.includes(w));
        });
        if (!elsewhere) { d.object_not_in_passage++; continue; }
        d.object_in_other_passage++;
      }
      // (b) the quote must carry the object it was given for — this one needs no index at all.
      //
      // WORD MEMBERSHIP, not a contiguous substring. Measured: asked for an object of six words or
      // fewer, the model COMPRESSES — "rebuild funder report" for a sentence reading "The funder
      // report takes a full week every quarter because we rebuild it by hand." Every word is there
      // and the quote plainly carries the object; a substring test refuses it and refused every item
      // of the fixture. The passage check above is worded the same way for the same reason.
      const quoteNorm = normalizeQuote(words);
      if (!objWords.every((w) => quoteNorm.includes(w))) { d.quote_without_object++; continue; }
    }
    // 4c R2: three needs in a passage means three DIFFERENT quotes — the same quote twice is one item.
    const key = `${Math.trunc(idx)}|${kind}|${normalizeQuote(words)}`;
    if (seen.has(key)) { d.duplicate++; continue; }
    seen.add(key);
    // 4c R5: an unusable scope is not guessed at — market is the reading the operator's backfill took.
    const scope = SCOPESET.has(String(o?.scope ?? "")) ? (String(o.scope) as Scope) : "market";
    out.push({ passage_index: Math.trunc(idx), kind: kind as ItemKind, scope, raw_words: words, object });
  }
  return out;
}

// ── 4d R1/R2/R6: the DETERMINISTIC STATEMENT GUARDS (operator review, 2026-09-23) ────────────────
//
// Three things the operator found reading all 57 client-side items at rules 2026-09-23.2, each of
// which a machine can decide without a judge, so a machine decides it and no judge call is spent:
//
//   R1  NO CLARIFIER. An interview need is "[verb] the [dimension] of [object]" and stops there. The
//       when-clause was still arriving — sometimes as the dangling "when the interviewee" — because
//       the FORM invited one. There is no clause to invent if the form has no slot for it.
//   R2  NO NAMES. A derived statement is about work, not about a person. A speaker's own name landing
//       inside the statement makes it unusable as a market need and identifies a person besides.
//   R6  BARE VERB. A job statement starts with the verb. "We need to do a better job of explaining X"
//       is "Explain X"; the modal scaffolding is the speaker's hedging, not the job.
//
// All three follow the R3 shape: reject, re-prompt ONCE carrying the reason, then land annotated with
// the signed reason and the statement kept beside it.

export const CLARIFIER_REASON = "clarifier or executor named";
export const NAMES_PERSON_REASON = "names a person";
export const BARE_VERB_REASON = "starts with a modal or auxiliary, not a verb";

/** R1: the words that may not appear in an interview need. "when"/"whenever" are the clarifier;
 *  "interviewee"/"interviewer" are the executor arriving under another name. Whole word, any case. */
export const CLARIFIER_TOKENS = ["when", "whenever", "interviewee", "interviewer"] as const;
const CLARIFIER_RE = new RegExp(`\\b(${CLARIFIER_TOKENS.join("|")})\\b`, "i");

/** Every clarifier token the statement carries, in list order — the retry's feedback. */
export function clarifierHits(statement: string): string[] {
  const t = String(statement ?? "");
  return CLARIFIER_TOKENS.filter((w) => new RegExp(`\\b${w}\\b`, "i").test(t));
}
export const hasClarifier = (statement: string): boolean => CLARIFIER_RE.test(String(statement ?? ""));

/** Capitalized tokens that are NOT names, however they look. Kept deliberately short: the reliable
 *  signal is the speaker labels, and this list only stops the obvious false positives. */
const NOT_A_NAME = new Set([
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "may", "june", "july",
  "august", "september", "october", "november", "december",
  "i", "we", "they", "it", "the", "a", "an",
]);

/** R2: the person-names to keep out of a statement — every word of every speaker label, plus every
 *  capitalized token in the raw words that is not sentence-initial and is not on the stoplist. The
 *  second half is a heuristic and is documented as one; the speaker labels are exact. */
export function personNames(speakerLabels: readonly string[], rawWords: string): string[] {
  const out = new Set<string>();
  for (const label of speakerLabels ?? []) {
    for (const w of String(label ?? "").split(/[^\p{L}'-]+/u)) {
      const t = w.trim();
      if (t.length >= 2 && !NOT_A_NAME.has(t.toLowerCase())) out.add(t.toLowerCase());
    }
  }
  // a capitalized token mid-sentence in the speaker's own words
  const text = String(rawWords ?? "");
  for (const sentence of text.split(/(?<=[.?!])\s+/)) {
    const tokens = sentence.trim().split(/\s+/);
    for (let i = 1; i < tokens.length; i++) {           // skip the sentence-initial token
      const bare = tokens[i].replace(/[^\p{L}'-]/gu, "");
      if (bare.length < 2) continue;
      if (bare !== bare.toUpperCase() && /^\p{Lu}/u.test(bare) && !NOT_A_NAME.has(bare.toLowerCase())) {
        out.add(bare.toLowerCase());
      }
    }
  }
  return [...out];
}

/** The names the statement carries. Whole word, any case. */
export function nameHits(statement: string, names: readonly string[]): string[] {
  const t = String(statement ?? "");
  return names.filter((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(t));
}

/** R6: a job statement may not open with one of these. "need"/"want"/"try" are here because the
 *  writer is told to strip exactly those hedges; a statement that still opens with one did not. */
export const NON_VERB_OPENERS = [
  "be", "am", "is", "are", "was", "were", "being", "been",
  "have", "has", "had", "having",
  "do", "does", "did", "doing",
  "will", "would", "shall", "should", "can", "could", "may", "might", "must", "ought",
  "need", "needs", "needing", "want", "wants", "wanting", "try", "tries", "trying",
  "the", "a", "an", "our", "their", "we", "they", "i", "it", "there",
] as const;
const OPENERS = new Set<string>(NON_VERB_OPENERS);

/** The opener a job statement starts with, when that opener is not a verb — else "". */
export function badOpener(statement: string): string {
  const first = String(statement ?? "").trim().split(/\s+/)[0] ?? "";
  const bare = first.replace(/[^\p{L}'-]/gu, "").toLowerCase();
  return OPENERS.has(bare) ? bare : "";
}

/** The hedges R6 tells the writer to strip, named once so the prompt and the test agree. */
export const JOB_HEDGES = [
  "do a better job of", "do a better job at", "get better at",
  "need to", "needs to", "have to", "has to", "be able to", "want to", "wants to", "try to", "trying to",
  "would like to", "should", "must",
] as const;

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
  // 4d R6 (operator review, 2026-09-23)
  "START WITH THE VERB. The statement begins with the action itself — \"Explain the intake process to a new funder\", " +
  "not \"We need to explain…\" and not \"Be able to explain…\". " +
  `STRIP the speaker's hedging entirely: ${JOB_HEDGES.map((h) => `"${h}"`).join(", ")} and any variant of them. ` +
  "\"We need to do a better job of explaining what we do\" is \"Explain what we do\". " +
  "Never begin with a modal or an auxiliary (be, is, are, have, do, will, would, can, could, should, must, need, want, try) " +
  "and never begin with an article or a pronoun. " +
  // R2
  "NEVER use a person's name in the statement. " +
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
  // 4d R1 (operator review, 2026-09-23). The when-clause is GONE from this form. 4a/4c made it
  // conditional and the writer kept reaching for it anyway — a form with a slot invites something to
  // fill the slot. An interview need is the verb, the dimension and the object, and it stops.
  " R1 (2026-09-23) — THE FORM FOR AN INTERVIEW NEED IS EXACTLY THIS, AND NOTHING MORE: " +
  "\"[Minimize/Maximize/Reduce/Increase] the [dimension] of [object]\". " +
  "There is NO \"when\" clause. Do not write one. Never use the words \"when\" or \"whenever\" anywhere in the statement. " +
  "End the statement at the object. " +
  "NEVER name the executor, and never write \"the interviewee\" or \"the interviewer\" — the statement says what is to be " +
  "achieved, not who is achieving it. " +
  // R2
  "NEVER use a person's name. Not the speaker's, not anyone they mention. " +
  // the dimension/object rule, carried forward from 4a R2
  "THE DIMENSION AND THE OBJECT COME FROM THE SPEAKER, NOT FROM YOU. " +
  "The [dimension] must be something the quoted words actually name or measure, and the [object] must be what the words " +
  "are actually about. Never introduce a metric, a dimension or a thing the words do not carry. " +
  // 4c R6 — the anecdote rule
  "WHEN THE WORDS TELL A STORY, state the need the story implies. What the speaker was up against, and " +
  "what they were trying to achieve, are carried by the story as a whole; you do not need a sentence that " +
  "states the need outright. Do not add anything the story does not support. " +
  'If the quoted words carry no need you can state in this form, answer {"no_context":true} and nothing else.';

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
  /** 4d R2: every speaker label on the record, so a person's name can be kept out of the statement. */
  speakerLabels?: readonly string[];
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
    let guardReason = "";                                   // 4d R1/R2, sharing the one retry
    for (let attempt = 0; attempt < 2; attempt++) {
      const prior = formatReason || numericReason || guardReason;
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
      // 4d R1: no clarifier, no executor under another name.
      const clar = clarifierHits(statement);
      if (clar.length) { guardReason = `${CLARIFIER_REASON}: ${clar.join(", ")}`; continue; }
      // 4d R2: no person's name.
      const named = nameHits(statement, personNames(args.speakerLabels ?? [], args.rawWords));
      if (named.length) { guardReason = `${NAMES_PERSON_REASON}: ${named.join(", ")}`; continue; }
      break;
    }
    if (formatReason) {
      return { framework_statement: statement || null, framework_form: "odi_need", judge_state: "annotated", judge_reason: `ODI format rejected after one retry: ${formatReason}` };
    }
    if (numericReason) {
      return { framework_statement: statement || null, framework_form: "odi_need", judge_state: "annotated", judge_reason: numericReason };
    }
    if (guardReason) {
      return { framework_statement: statement || null, framework_form: "odi_need", judge_state: "annotated", judge_reason: guardReason };
    }
    const j = await judgeFaithful(args.call, { rawWords: args.rawWords, statement, kind: args.kind, form: "odi_need", model: args.judgeModel });
    return { framework_statement: statement, framework_form: "odi_need", judge_state: j.ok ? "accepted" : "annotated", judge_reason: j.reason };
  }

  // job: write it, then the DETERMINISTIC means layer, then solution-agnostic v3, then faithfulness.
  let statement = "";
  let jobNumericReason = "";
  let jobGuardReason = "";                                  // 4d R2/R6, sharing the one retry
  for (let attempt = 0; attempt < 2; attempt++) {
    const prior = jobNumericReason || jobGuardReason;
    const user = buildJobFromWordsUser(args.rawWords, args.speaker) +
      (prior ? `\nYour previous attempt was rejected: ${prior}. Fix exactly that.\n` : "");
    const raw = await args.call({ stage: "convert:job", system: JOB_FROM_WORDS_SYSTEM, user });
    let parsed: { jtbd?: unknown; no_executor_goal?: unknown } = {};
    try { parsed = JSON.parse(raw) as typeof parsed; } catch { parsed = {}; }
    // R2: the writer was asked to decide this first, on the call it was already making.
    if (parsed.no_executor_goal === true) {
      return { framework_statement: null, framework_form: "job_statement", judge_state: "annotated", judge_reason: NO_EXECUTOR_GOAL_REASON };
    }
    statement = String(parsed.jtbd ?? "").trim();
    if (!statement) break;
    jobNumericReason = ""; jobGuardReason = "";
    const invented = inventedNumbers(statement, args.rawWords);     // R3 again, same rule, no call
    if (invented.length) { jobNumericReason = numericInventionReason(invented); continue; }
    // 4d R6: the statement starts with the verb, not with the speaker's hedging.
    const opener = badOpener(statement);
    if (opener) { jobGuardReason = `${BARE_VERB_REASON}: ${opener}`; continue; }
    // 4d R2: no person's name.
    const namedJ = nameHits(statement, personNames(args.speakerLabels ?? [], args.rawWords));
    if (namedJ.length) { jobGuardReason = `${NAMES_PERSON_REASON}: ${namedJ.join(", ")}`; continue; }
    break;
  }
  if (!statement) {
    return { framework_statement: null, framework_form: "job_statement", judge_state: "annotated", judge_reason: "the job writer returned nothing usable" };
  }
  if (jobNumericReason) {
    return { framework_statement: statement, framework_form: "job_statement", judge_state: "annotated", judge_reason: jobNumericReason };
  }
  if (jobGuardReason) {
    return { framework_statement: statement, framework_form: "job_statement", judge_state: "annotated", judge_reason: jobGuardReason };
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
