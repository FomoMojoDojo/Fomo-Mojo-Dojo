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
  // 4e-3 N14 (operator ruling, 2026-09-24): STEP ONE RETURNS TO THE N7 ENUMERATION.
  //
  // N9 rewrote these eight slots as a checklist to stop the finder looping, and it worked — but the
  // replay measured what it cost: under N9 the finder returns NO OUTPUT AT ALL for kickoff turns 62
  // and 226, where the N7 wording found both and N4 fired on 226. The recall loss was entirely at the
  // finder, not at any gate. N8's cap is now the backstop the loop needed, and N15 makes a capped
  // finder a SPLIT rather than a failure, so the enumeration can come back and pay its own way.
  "STEP ONE: go through EVERY SLOT BELOW, IN ORDER, and list what this passage carries for it — each " +
  "as an OBJECT of at most six words, using the passage's own words: " +
  "(1) what they WANT; (2) what they STRUGGLE WITH; (3) what they are TRYING TO GET DONE; " +
  "(4) how they JUDGE RESULTS; (5) what they BELIEVE; (6) how they REACH PEOPLE; " +
  "(7) what they STAND FOR against the alternatives; (8) what they ASK OF US. " +
  "A slot this passage says nothing about yields nothing for that slot — go to the next one. " +
  "If the passage carries none of the eight, list none and move on. " +
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
  // 4e-4 R2 (operator ruling, 2026-09-24): N17(b) IS REMOVED. The ablation measured it: telling the
  // finder about the on-screen walkthrough SUPPRESSED turn 226 on its own — the archetypal read
  // reaction it was written to catch — and removing it alone took kept items from 34 to 45 and
  // accepted client jobs from 1 to 7. Read reactions are captured by CODE instead (N4, N17(a) and
  // N21), which needs no instruction and cannot be talked out of firing.
  "When such a reaction ALSO implies a need of their own, give a SECOND entry for that need under its " +
  "own kind. " +
  "A NARRATED FACT IS NOT AN ITEM. A schedule, a headcount, a date, a piece of history, or a " +
  "description of what the company does is not an item, however clearly it is stated. " +
  // 4e-3 N18: run 3456 landed meeting logistics as asks on turns 173 and 178.
  "MEETING LOGISTICS ARE NOT ITEMS. Sharing or pulling up a page, the screen, the font size, reading " +
  "along, who can see what, scheduling the next session, and audio or connection trouble are how the " +
  "meeting is being run — never a want, a struggle, a goal, or a request about the work. " +
  "SCOPE, per object: \"market\" when it is about donors, funders, clients, partners or the outside " +
  "world; \"internal\" when it is about the speaker's own organization, team, staffing, process or tools. " +
  `raw_words is one or more COMPLETE SENTENCES, at most ${MAX_RAW_WORDS} characters, copied exactly. ` +
  "passage_index is the number of the passage the quote came from. " +
  // 4e-4 R1 (operator ruling, 2026-09-24): N19 IS REMOVED. The ablation measured it: asking for one
  // sentence per quote strips the executor framing the job writer keys on ("we need to…"), and the
  // "no executor goal in the words" refusal rate went 90% with it to 22% without it, accepted client
  // jobs 1 to 6. One item per goal is not worth nine jobs in ten.
  "Do not invent objects the passage does not carry, and do not reuse one quote for two objects. " +
  'JSON only: {"items":[{"passage_index":<int>,"object":"<= 6 words from the passage>","kind":"job|pain_point|desire|outcome|route|step|positioning|cascade|ask|hypothesis","scope":"market|internal","raw_words":"<verbatim sentence(s) containing the object>"}]}.';

/** 4d R5 / 4e N4: an item that reacts to the document on screen carries this prefix, so the operator
 *  can tell feedback on the read from a request for work. The string lives in rules.ts now — N4 makes
 *  it a signed rule rather than a prompt detail — and is re-exported here for the callers that had it. */
export { READ_FEEDBACK_STATEMENT_PREFIX as READ_FEEDBACK_PREFIX } from "./rules.ts";

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

// ── N20: NO FIRST-PERSON WORDS IN A DERIVED STATEMENT (operator ruling, 2026-09-24) ─────────────
//
// Measured on run 3456: need statement 364fbe10 copied the speaker's first-person words straight into
// the derived form. A framework statement says what is to be achieved, not who is speaking — the same
// reason R2 keeps a person's NAME out of it. This is decidable, so the code decides it: one re-prompt
// carrying the reason, then the item lands annotated with the statement kept beside it.
export const FIRST_PERSON_REASON = "first-person words in the statement";
export const FIRST_PERSON_WORDS = ["i", "me", "my", "mine", "we", "us", "our", "ours"] as const;
const FIRST_PERSON_RE = new RegExp(`\\b(${FIRST_PERSON_WORDS.join("|")})\\b`, "i");

/** Every first-person word the statement carries, in list order — the retry's feedback. */
export function firstPersonHits(statement: string): string[] {
  const t = String(statement ?? "");
  return FIRST_PERSON_WORDS.filter((w) => new RegExp(`\\b${w}\\b`, "i").test(t));
}
export const hasFirstPerson = (statement: string): boolean => FIRST_PERSON_RE.test(String(statement ?? ""));

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

// ── N6: A STORY IS NOT A PAIN POINT (operator ruling, 2026-09-24) ───────────────────────────────
//
// Two of the eleven live client needs on the 2026-09-23.3 run were STORIES — a past event narrated —
// landed as pain_point. A story is evidence, and it is often evidence OF a pain; it is not itself a
// thing the speaker struggles with, and reading it as one produces a "need" that is really a summary
// of an anecdote. N6: a story yields ONLY THE ITEM IT IMPLIES, judged against the story, or nothing.
//
// Detection is deliberately conservative and entirely in code — two independent signals must both be
// present, so a present-tense complaint that happens to contain one past-tense verb ("the report took
// a week again this quarter" is still a complaint) is untouched:
//   (a) a NARRATIVE ANCHOR — a moment in time the speaker is placing the events at, or an explicit
//       past-habit marker; and
//   (b) at least two PAST-TENSE VERBS, so a single "said" inside a present-tense sentence is not a story.
export const STORY_NOT_PAIN_REASON = "a story is not a pain point — only the item it implies stands";

/** Phrases that place a narrative at a moment, or mark a habit the speaker has left behind. */
export const NARRATIVE_ANCHORS = [
  "last week", "last month", "last year", "last night", "last friday", "last monday",
  "last tuesday", "last wednesday", "last thursday", "last saturday", "last sunday",
  "years ago", "months ago", "weeks ago", "days ago", "a while back", "back in", "back then",
  "used to", "at the time", "that day", "one day", "the other day", "this one time",
  "when we were", "when i was", "when they were", "ended up", "had just", "a few years",
  "a couple of years", "there was a time", "we had a", "i had a", "a family called",
] as const;

/** Irregular past forms that no "-ed" test would catch. Short and common on purpose. */
const IRREGULAR_PAST = new Set([
  "was", "were", "had", "did", "went", "came", "got", "said", "told", "took", "gave", "made",
  "saw", "found", "left", "kept", "sent", "brought", "thought", "knew", "ran", "began", "felt",
  "put", "held", "lost", "won", "paid", "sat", "stood", "spoke", "wrote", "drove", "called",
]);

/** How many past-tense verbs the words carry, counting "-ed" forms and the irregulars above. */
export function pastTenseCount(text: string): number {
  const words = String(text ?? "").toLowerCase().split(/[^\p{L}\p{N}']+/u).filter(Boolean);
  let n = 0;
  for (const w of words) {
    if (IRREGULAR_PAST.has(w)) { n++; continue; }
    if (/[a-z]{3,}ed$/.test(w) && !/(need|speed|indeed|exceed|proceed|succeed|agreed|embed)$/.test(w)) n++;
  }
  return n;
}

/** The narrative anchors the words carry, in list order. */
export function narrativeAnchors(text: string): string[] {
  const t = String(text ?? "").toLowerCase();
  return NARRATIVE_ANCHORS.filter((a) => t.includes(a));
}

/** N6: is this a past event narrated? Both signals must fire. */
export function isNarratedStory(rawWords: string): boolean {
  return narrativeAnchors(rawWords).length > 0 && pastTenseCount(rawWords) >= 2;
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
  /** N3: what survived the term check, and what it threw away. Both travel to the run's audit row. */
  objections_kept?: Objection[];
  objections_dropped?: Array<Objection & { why: string }>;
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
  // 4e-3 N20
  "NEVER use I, me, my, mine, we, us, our or ours. The statement says what is to be achieved, not who " +
  "is speaking. " +
  "A job statement names what the executor is trying to get done, in the executor's own words. " +
  "It never names a provider, program, service line, facility, treatment setting, or category of supplier the executor would shop for. " +
  "Form: transitive verb + object + contextual clarifier. " +
  `NEVER use these words (they name a means, not a goal): ${MARKET_MEANS_TERMS.join(", ")}, program, service, services, therapy, facility, organizations that provide. ` +
  "Never name a company, brand or vendor. Do not invent anything the quoted words do not support. " +
  'JSON only: {"jtbd":"<one sentence>"} — or {"no_executor_goal":true}.';

export function buildJobFromWordsUser(rawWords: string, speaker: string | null): string {
  return `SPEAKER: ${speaker ?? "unknown"}\nTHEIR WORDS, verbatim:\n"""${rawWords}"""\nState the job they are trying to get done.`;
}

// ── N1/N2: the ODI writer for an INTERVIEW NEED (operator rulings, 2026-09-24) ───────────────────
//
// N1 REMOVES the 4a "no context in the words" refusal. It was written when the form still had a
// when-clause and the writer needed a way out of inventing one; 4d took the clause away, and the
// branch outlived its reason. Measured on the 2026-09-23.3 run it refused 5 of the 11 live client
// needs — including needs whose object was sitting in the passage — so the escape hatch had become
// the single largest cause of a need never being written at all. There is no no_context answer now.
//
// N2 gives the form a CLOSED METRIC SET. An ODI need is direction + metric + object; the object must
// come from the passage's words, and the metric is chosen from {time, likelihood, effort, number}.
// The metric is FORM SCAFFOLDING — the writer picks the one that fits, the same way it picks the
// direction verb — so it is exempt from the judge exactly as the direction verb is. That amends the
// Sep 22 ruling A for interview needs only. What it stops is what the operator read on 0aa2ab49:
// the writer reaching for "ambiguity" and "clarity", metric words nobody said, which then read as the
// speaker's own measure.

// ── N2/N3: STEM MATCHING, the one notion of "this word is in the text" ──────────────────────────
//
// Both new rules ask the same question — does this word occur in the speaker's words? — and both must
// answer it the same way, or an objection N3 drops would be a violation N2 raises. So the test lives
// once. It is deliberately crude: lowercase, strip a short list of English suffixes, compare stems.
// "retention" matches "retain" and "retaining"; "placements" matches "placement". It does NOT do
// synonyms, and it is not meant to: the rule is that the WORD is there, not that the idea is.
const SUFFIXES = ["ization", "isation", "ations", "ation", "ments", "ment", "ness", "ities", "ity",
  "ingly", "edly", "ing", "ies", "ied", "ers", "er", "ors", "or", "ed", "es", "s", "ly", "al"];

/** The crude stem of one word. Never shorter than 3 characters — trimming past that turns unrelated
 *  words into the same stem, which is how a term check starts forgiving inventions. */
export function stemOf(word: string): string {
  let w = String(word ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  for (const suf of SUFFIXES) {
    if (w.length - suf.length >= 3 && w.endsWith(suf)) { w = w.slice(0, -suf.length); break; }
  }
  // The silent e, which is what separates "reconcile" from "reconciling" once "ing" is gone. Without
  // this the two are different stems and the term check calls the speaker's own verb an invention.
  if (w.length >= 4 && w.endsWith("e")) w = w.slice(0, -1);
  return w;
}

/** Every stem in a text, as a set. */
export function stemsOf(text: string): Set<string> {
  return new Set(String(text ?? "").split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(stemOf).filter(Boolean));
}

/** Does `term` occur in `text`? Every word of the term must be there, stem-matched, case-insensitive. */
export function termOccursIn(term: string, text: string): boolean {
  const words = String(term ?? "").split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(stemOf).filter(Boolean);
  if (!words.length) return false;
  const hay = stemsOf(text);
  return words.every((w) => hay.has(w));
}

// ── N2: the closed metric set and the guards that hold the form to it ───────────────────────────

/** N2: the four measures an interview need may use. Form scaffolding — the writer chooses one the way
 *  it chooses the direction verb, and the judge is told both are the form's, not the speaker's. */
export const NEED_METRICS = ["time", "likelihood", "effort", "number"] as const;
export type NeedMetric = (typeof NEED_METRICS)[number];
const METRIC_SET = new Set<string>(NEED_METRICS);

/** The direction verbs the form allows, named here so the prompt, the guard and the judge agree. */
export const NEED_DIRECTIONS = ["minimize", "minimise", "maximize", "maximise", "reduce", "increase"] as const;

/** N2: measure words the writer reaches for when it is inventing one. Not exhaustive and not meant to
 *  be — it is the list the operator actually read coming out of the writer, plus the near neighbours
 *  of those. A term here is a violation only when the SPEAKER did not say it. */
export const OFF_SET_METRIC_TERMS = [
  "ambiguity", "clarity", "quality", "accuracy", "visibility", "efficiency", "effectiveness",
  "speed", "frequency", "cost", "level", "degree", "extent", "amount", "rate", "ease", "burden",
  "complexity", "consistency", "reliability", "satisfaction", "transparency", "alignment",
  "confusion", "uncertainty", "difficulty", "readiness", "strength", "depth", "breadth",
] as const;

export const NEED_FORM_REASON = "not in the interview need form";
export const OFF_SET_METRIC_REASON = "metric outside the closed set";
export const INVENTED_METRIC_REASON = "adds a measure the words do not carry";
export const OBJECT_NOT_IN_WORDS_REASON = "the object is not in the speaker's words";

/** The connector the shared ODI form allows between the metric and the object. N2 closes the METRIC;
 *  it does not touch the connector, which stays exactly as odiCanonical.ts has always spelled it —
 *  and the form is often written with none at all ("the time SPENT reconciling…"), so the parse takes
 *  the head noun after "the" as the metric and everything after it as the object. */
export const NEED_CONNECTORS = ["to", "of", "in"] as const;
const NEED_FORM_RE = new RegExp(
  `^\\s*(${NEED_DIRECTIONS.join("|")})\\s+the\\s+([\\p{L}]+)\\b\\s*(.*?)\\s*\\.?\\s*$`, "iu");

export type NeedParts = { direction: string; metric: string; object: string };

/** Split a statement into the form's three slots, or null when it is not in the form at all. */
export function needParts(statement: string): NeedParts | null {
  const m = NEED_FORM_RE.exec(String(statement ?? ""));
  if (!m) return null;
  return { direction: m[1].toLowerCase(), metric: m[2].toLowerCase(), object: m[3].trim() };
}

/** N2, decided by the CODE: the metric slot is one of the four, the object's words are the speaker's,
 *  and no other measure word appears unless the speaker said it. Returns "" when the statement is
 *  clean, else the reason to re-prompt with. No model call is spent on any of it. */
export function needFormViolation(statement: string, rawWords: string): string {
  const st = String(statement ?? "").trim();
  if (!st) return NEED_FORM_REASON;
  const parts = needParts(st);
  if (!parts) return `${NEED_FORM_REASON}: expected "[Minimize/Maximize/Reduce/Increase] the [${NEED_METRICS.join("/")}] of [object]"`;
  if (!METRIC_SET.has(parts.metric)) {
    return `${OFF_SET_METRIC_REASON}: ${parts.metric} (use one of ${NEED_METRICS.join(", ")})`;
  }
  // every content word of the object must be the speaker's
  if (!String(parts.object).trim()) return `${NEED_FORM_REASON}: the statement names no object`;
  // No other measure word anywhere in the statement, unless the speaker used it. This runs BEFORE the
  // object check because an invented measure almost always sits INSIDE the object slot, and "the
  // object is not in the speaker's words: clarity" buries the rule that actually fired. N2's whole
  // point is that the writer reached for a measure nobody offered it, so the reason says that.
  const invented = OFF_SET_METRIC_TERMS
    .filter((t) => termOccursIn(t, st) && !termOccursIn(t, rawWords));
  if (invented.length) return `${INVENTED_METRIC_REASON}: ${invented.join(", ")}`;
  const missing = String(parts.object).split(/[^\p{L}\p{N}]+/u).filter(Boolean)
    .filter((w) => !OBJECT_STOPWORDS.has(w.toLowerCase()))
    .filter((w) => !termOccursIn(w, rawWords));
  if (missing.length) return `${OBJECT_NOT_IN_WORDS_REASON}: ${[...new Set(missing)].join(", ")}`;
  return "";
}

/** Function words and FORM GLUE inside an object slot. The rule is that the speaker owns what the
 *  statement is ABOUT — the nouns — not that they uttered every connective the form needs to hang
 *  them on. "Reduce the time SPENT reconciling the intake spreadsheet" is the speaker's object with
 *  the form's own participle in front of it; demanding "spent" be in the quoted words would reject a
 *  faithful statement, and that is the failure mode this list exists to avoid. */
const OBJECT_STOPWORDS = new Set([
  "the", "a", "an", "of", "for", "to", "in", "on", "at", "by", "with", "and", "or", "from", "into", "per",
  "our", "their", "its", "his", "her", "your", "my", "we", "they", "it", "that", "this", "these", "those",
  // form glue: the participles and light verbs the ODI frame hangs an object on
  "spent", "spend", "spending", "taken", "take", "takes", "taking", "needed", "required", "involved",
  "getting", "doing", "making", "having", "being", "used", "given", "when", "while", "each", "every",
]);

/** Appended to ODI_CANONICAL_SYSTEM; the shared formula prompt itself is untouched, because three
 *  other callers depend on it byte-for-byte. */
export const ODI_CONTEXT_RULE =
  // 4d R1 (operator review, 2026-09-23). The when-clause is GONE from this form. 4a/4c made it
  // conditional and the writer kept reaching for it anyway — a form with a slot invites something to
  // fill the slot. An interview need is the verb, the dimension and the object, and it stops.
  " N2 (2026-09-24) — THE FORM FOR AN INTERVIEW NEED IS EXACTLY THIS, AND NOTHING MORE: " +
  "\"[Minimize/Maximize/Reduce/Increase] the [metric] of [object]\". " +
  `THE [metric] IS ONE OF EXACTLY FOUR WORDS AND NOTHING ELSE: ${NEED_METRICS.join(", ")}. ` +
  "Choose the one that fits what the speaker wants more or less of: " +
  "time (how long something takes or how long they wait), " +
  "likelihood (how often something happens, or the chance that it does), " +
  "effort (how much work, hassle or cost it takes), " +
  "number (how many of something there are). " +
  "NEVER write any other measure word in the statement — not \"ambiguity\", not \"clarity\", not " +
  "\"quality\", not \"visibility\", not \"accuracy\", not \"level\", not \"degree\" — unless the speaker " +
  "said that word themselves. The four words above are the form's, and they are the only measures you have. " +
  "THE [object] IS THE SPEAKER'S, IN THE SPEAKER'S OWN WORDS, taken from the quoted words in front of you. " +
  "There is NO \"when\" clause. Do not write one. Never use the words \"when\" or \"whenever\" anywhere in the statement. " +
  "End the statement at the object. " +
  "NEVER name the executor, and never write \"the interviewee\" or \"the interviewer\" — the statement says what is to be " +
  "achieved, not who is achieving it. " +
  // R2
  "NEVER use a person's name. Not the speaker's, not anyone they mention. " +
  // 4e-3 N20
  "NEVER use I, me, my, mine, we, us, our or ours. " +
  // the dimension/object rule, carried forward from 4a R2
  "THE OBJECT COMES FROM THE SPEAKER, NOT FROM YOU. " +
  "The [object] must be what the words are actually about, and its words must be the speaker's. " +
  "Never introduce a thing the words do not carry. " +
  // 4c R6 — the anecdote rule
  "WHEN THE WORDS TELL A STORY, state the need the story implies. What the speaker was up against, and " +
  "what they were trying to achieve, are carried by the story as a whole; you do not need a sentence that " +
  "states the need outright. Do not add anything the story does not support. " +
  "ALWAYS answer with a statement. There is no refusal: every set of words handed to you carries " +
  "something the speaker wants more of or less of, and your job is to say what it is in this form.";

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
  // 4e N2 amends ruling A for interview needs: the METRIC is scaffolding too. The writer picks one of
  // four words the way it picks the direction verb, so objecting to it is objecting to the form.
  "For FORM odi_need the direction verb (Minimize, Maximize, Reduce, Increase), THE METRIC WORD " +
  '(time, likelihood, effort, number) and the frame "[verb] the [metric] of [object]" belong to the FORM, ' +
  "not to the speaker: none of them can on their own make a statement unfaithful, even when the speaker " +
  "never said a direction verb and never said the metric word. " +
  "NEVER object to time, likelihood, effort or number as an added metric — they are the only four the form has. " +
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
  "'introduces' the direction verb (Minimize, Maximize, Reduce, Increase), the metric word (time, " +
  "likelihood, effort, number), the formula frame, or the verb + object + clarifier shape — those are " +
  "the form's and are never a fault. " +
  "If the ONLY thing you could object to is the direction verb, the metric word, or the form's shape, answer ok=true. " +
  // 4e N3 (operator ruling, 2026-09-24): the objection is TYPED and NAMES ITS TERM, because the code
  // then checks that term against the passage itself. Measured on the 2026-09-23.3 run, three of the
  // eleven client needs were rejected for a word that is sitting in the passage — the judge asserting
  // "not mentioned" about words the speaker said. A free-sentence reason cannot be checked; a term can.
  "WHEN YOU REJECT, LIST YOUR OBJECTIONS ONE BY ONE. Each objection has a TYPE and a TERM. " +
  "The TERM is the exact word or short phrase you are objecting to, copied from the DERIVED STATEMENT. " +
  "Never put a whole sentence in the term, and never put a word that is not in the statement. " +
  "The types: " +
  "added_object (the statement names a thing the words do not carry); " +
  "added_metric (it measures something the words do not measure); " +
  "added_context (it adds a circumstance the words do not carry); " +
  "added_quantity (it adds a number or amount the words do not carry); " +
  "lost_object (the speaker's own subject is gone); " +
  "lost_context (the circumstance the speaker gave is gone); " +
  "wrong_meaning (the statement says something the words do not mean). " +
  "ok=true means NO objections: answer with an empty list. " +
  'JSON only: {"ok":true|false,"objections":[{"type":"<one of the seven>","term":"<word or short phrase from the statement>"}]}.';

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

// ── N3: TYPED OBJECTIONS (operator ruling, 2026-09-24) ──────────────────────────────────────────
//
// The judge no longer writes a sentence; it lists objections, each with a TYPE and the TERM it is
// objecting to. That one change makes the verdict CHECKABLE: an `added_*` objection is a claim that a
// word is not in the speaker's words, and the code can simply look. Measured on the 2026-09-23.3 run,
// three of eleven client needs (90d8c7ef, 065ee3a0, e3c24524) were rejected for a term the passage
// plainly contains, and nothing downstream could tell that from a real rejection.
//
// The check is against the PASSAGE, not the quote: the quote is a sentence or two cut out of a turn,
// and a speaker who names the object in one sentence and states the want in the next is not adding
// anything. Every dropped objection is counted on the run row, so the rule's effect is legible.
export const OBJECTION_TYPES = [
  "added_object", "added_metric", "added_context", "added_quantity",
  "lost_object", "lost_context", "wrong_meaning",
] as const;
export type ObjectionType = (typeof OBJECTION_TYPES)[number];
export type Objection = { type: ObjectionType; term: string };
const OBJECTION_SET = new Set<string>(OBJECTION_TYPES);
/** Only an `added_*` objection is a claim about what the words contain, so only those are checkable. */
export const isAddedObjection = (t: ObjectionType): boolean => t.startsWith("added_");

const OBJECTION_PHRASE: Record<ObjectionType, string> = {
  added_object: "adds the object",
  added_metric: "adds the measure",
  added_context: "adds the context",
  added_quantity: "adds the quantity",
  lost_object: "loses the object",
  lost_context: "loses the context",
  wrong_meaning: "changes the meaning of",
};

/** The reason a surviving objection set becomes. Built from type + term, never from model prose. */
export function objectionReason(kept: readonly Objection[]): string {
  return kept.map((o) => `${OBJECTION_PHRASE[o.type]} "${o.term}"`).join("; ");
}

/** N16: the CLOSED METRIC SET is the only scaffolding the term check may drop an objection for, and
 *  only when the objection is `added_metric`. The direction verbs are deliberately NOT here: the judge
 *  is already told never to object to them, and N16 says the drop rule is the metric set. */
const CLOSED_METRICS = new Set<string>(NEED_METRICS);

export type Sifted = { kept: Objection[]; dropped: Array<Objection & { why: string }> };

/**
 * N3, decided by the CODE. An `added_*` objection whose term is in the passage is dropped — the judge
 * asserted the words do not carry it and the words do. An objection about the form's own scaffolding
 * is dropped for the same reason ruling A exempted it. Everything else survives and annotates.
 */
export function siftObjections(
  objections: readonly Objection[],
  passageText: string,
  form: FrameworkForm | null,
): Sifted {
  const kept: Objection[] = [];
  const dropped: Array<Objection & { why: string }> = [];
  for (const o of objections) {
    const term = String(o.term ?? "").trim();
    if (!term) { dropped.push({ ...o, term, why: "the objection named no term" }); continue; }
    // ── N16 (operator ruling, 2026-09-24): ONLY an added_* objection may be dropped ───────────────
    // Measured on run 3456: item c35a6aba was ACCEPTED because a wrong_meaning objection was thrown
    // away for naming a scaffolding term. That is outside N3 as signed. A wrong_meaning says the
    // statement does not mean what the words mean, and a lost_* says the speaker's own subject is
    // gone — neither is a claim about what the passage CONTAINS, so neither is checkable by a term
    // and neither may be dropped, whatever term it happens to name.
    if (!isAddedObjection(o.type)) { kept.push({ type: o.type, term }); continue; }
    if (o.type === "added_metric" && form === "odi_need" && CLOSED_METRICS.has(term.toLowerCase())) {
      dropped.push({ ...o, term, why: "the term is one of the form's four metrics" });
      continue;
    }
    if (termOccursIn(term, passageText)) {
      dropped.push({ ...o, term, why: "the term occurs in the passage" });
      continue;
    }
    kept.push({ type: o.type, term });
  }
  return { kept, dropped };
}

/** Read the judge's answer. A malformed answer is not a pass: it survives as one wrong_meaning
 *  objection, so rule 1 still lands the item and rule 4 still gives it a reason. */
export function parseObjections(raw: string): { ok: boolean; objections: Objection[]; parsed: boolean } {
  let p: { ok?: unknown; objections?: unknown };
  try { p = JSON.parse(raw) as typeof p; } catch {
    return { ok: false, objections: [{ type: "wrong_meaning", term: "the judge's answer could not be parsed" }], parsed: false };
  }
  const list = Array.isArray(p?.objections) ? p.objections : [];
  const objections: Objection[] = [];
  for (const raw2 of list) {
    const o = raw2 as Record<string, unknown>;
    const type = String(o?.type ?? "");
    const term = String(o?.term ?? "").trim();
    if (!OBJECTION_SET.has(type) || !term) continue;
    objections.push({ type: type as ObjectionType, term });
  }
  return { ok: p?.ok === true, objections, parsed: true };
}

export type FaithfulVerdict = { ok: boolean; reason: string; kept: Objection[]; dropped: Array<Objection & { why: string }> };

/** The judge, on every converted statement. Nothing is dropped — a reject lands annotated. The kind
 *  and the form travel with the call (ruling A): without the form the judge cannot know which
 *  scaffolding is exempt, and the exemption is the whole of the ruling. N3: the VERDICT is the code's,
 *  taken from the objections that survive the term check, not from the model's ok flag. */
export async function judgeFaithful(
  call: Call,
  args: {
    rawWords: string; statement: string; kind: ItemKind; form: FrameworkForm; model?: string;
    /** N3: the whole passage the quote was cut from — what an `added_*` term is checked against. */
    passageText?: string;
  },
): Promise<FaithfulVerdict> {
  const raw = await call({ stage: "judge", system: FAITHFUL_SYSTEM, user: buildFaithfulUser(args), model: args.model });
  const v = parseObjections(raw);
  // The model said ok with objections listed, or not-ok with none: the OBJECTIONS are the verdict.
  const asserted = v.ok && v.objections.length === 0 ? [] : v.objections;
  const haystack = args.passageText && args.passageText.trim() ? args.passageText : args.rawWords;
  const { kept, dropped } = siftObjections(asserted, haystack, args.form);
  // A judge that rejects but names no checkable term has given us nothing to check — and nothing to
  // drop either. It is not a pass: rule 1 lands the item, rule 4 gives it a reason, and the reason
  // says exactly what happened rather than borrowing a verdict the model never supported.
  if (!v.ok && asserted.length === 0 && v.parsed) {
    return { ok: false, reason: "the judge rejected it without naming a term", kept, dropped };
  }
  if (kept.length === 0) {
    const note = dropped.length
      ? `every objection was about words the passage carries (${dropped.length} dropped)`
      : "the statement is faithful to the words";
    return { ok: true, reason: note, kept, dropped };
  }
  return { ok: false, reason: objectionReason(kept), kept, dropped };
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
  /** N3: the whole passage the quote was cut from — an `added_*` term is checked against this. */
  passageText?: string;
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
      let parsed: { odi_canonical_statement?: unknown } = {};
      try { parsed = JSON.parse(raw) as typeof parsed; } catch { parsed = {}; }
      // N1: there is no no_context branch. The writer always answers with a statement.
      statement = String(parsed.odi_canonical_statement ?? "").trim();
      // Every reason is cleared at the top of the attempt. guardReason was NOT, so a retry that fixed
      // the clarifier still landed annotated carrying the reason it had just fixed — the job loop
      // below always reset both of its own. N2 makes the retry load-bearing, so the reset matters.
      formatReason = ""; numericReason = ""; guardReason = "";
      // R8: the shared guard still checks empty / identical / missing formula verb. Its "missing when"
      // reject is OFF for interview items: the when-clause is conditional now, so demanding one is
      // exactly what drove the writer to invent circumstances. The shared module is untouched — three
      // other callers depend on it — and the reject is filtered here, where the rule applies.
      const check = isValidCanonical(statement, args.rawWords);
      if (!check.ok && !isMissingWhenReject(check.reason)) { formatReason = check.reason ?? "invalid canonical form"; continue; }
      // 4d R1: no clarifier, no executor under another name. This runs BEFORE N2 so a statement that
      // still carries a when-clause is told exactly that, rather than told its object is not in the
      // words because the trailing clause was read as part of the object.
      const clar = clarifierHits(statement);
      if (clar.length) { guardReason = `${CLARIFIER_REASON}: ${clar.join(", ")}`; continue; }
      // 4d R2: no person's name.
      const named = nameHits(statement, personNames(args.speakerLabels ?? [], args.rawWords));
      if (named.length) { guardReason = `${NAMES_PERSON_REASON}: ${named.join(", ")}`; continue; }
      // 4e-3 N20: no first-person words.
      const fp = firstPersonHits(statement);
      if (fp.length) { guardReason = `${FIRST_PERSON_REASON}: ${fp.join(", ")}`; continue; }
      const invented = inventedNumbers(statement, args.rawWords);   // R3: decided by the code, no call
      if (invented.length) { numericReason = numericInventionReason(invented); continue; }
      // 4e N2: the closed metric set, the speaker's own object, no invented measure. All code, no call.
      const n2 = needFormViolation(statement, args.rawWords);
      if (n2) { guardReason = n2; continue; }
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
    const j = await judgeFaithful(args.call, { rawWords: args.rawWords, statement, kind: args.kind, form: "odi_need", model: args.judgeModel, passageText: args.passageText });
    return { framework_statement: statement, framework_form: "odi_need", judge_state: j.ok ? "accepted" : "annotated", judge_reason: j.reason, objections_kept: j.kept, objections_dropped: j.dropped };
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
    // 4e-3 N20: no first-person words, on a job statement as on a need.
    const fpJ = firstPersonHits(statement);
    if (fpJ.length) { jobGuardReason = `${FIRST_PERSON_REASON}: ${fpJ.join(", ")}`; continue; }
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
    const jc = await judgeFaithful(args.call, { rawWords: args.rawWords, statement, kind: args.kind, form: "job_statement", model: args.judgeModel, passageText: args.passageText });
    return { framework_statement: statement, framework_form: "job_statement", judge_state: jc.ok ? "accepted" : "annotated", judge_reason: jc.reason, objections_kept: jc.kept, objections_dropped: jc.dropped };
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
  const j = await judgeFaithful(args.call, { rawWords: args.rawWords, statement, kind: args.kind, form: "job_statement", model: args.judgeModel, passageText: args.passageText });
  return { framework_statement: statement, framework_form: "job_statement", judge_state: j.ok ? "accepted" : "annotated", judge_reason: j.reason, objections_kept: j.kept, objections_dropped: j.dropped };
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
