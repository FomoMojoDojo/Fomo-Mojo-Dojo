// ── SP-562 (2026-11-23): THE DRY-ONLY WORDING TOOL — everything that is not I/O ──────────────────
//
// `scripts/propose-need-wording.ts` proposes a wording for ONE need from its counted quotes and
// measures how the quotes fit it. It decides nothing and stores nothing: SP-562 makes it dry-only, so
// there is no `--apply`, and neither this file nor the script holds a statement that writes a table.
// The one write of a run is the ledger row of each model call (SP-518), made by `ledgerShim.ts`.
//
// This file is the pure half — prompts, parsing, gates, accounting — so a test can import it without
// starting a run. The prompts were approved as brief 9 §8 with the four changes of SP-572.
import { verbatimOn } from "../supabase/functions/_shared/excerptBlanking.ts";

export type WordingQuote = { signalId: string; quote: string; polarity: string | null };

export const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

// ── the generator ────────────────────────────────────────────────────────────────────────────────

/** Approved by SP-572. The form line is `record-interview-finding/handler.ts`'s, with "metric"
 *  written "dimension" as `research-company` writes it. The current wording, the job step and the
 *  other needs are NOT shown (brief 9 §8b): a generator shown the sentence repairs the sentence. */
export const WORDING_GENERATOR_SYSTEM = `You write ONE customer need as a desired-outcome statement, from customer quotes.

You are given QUOTES. Each is a customer's own words about a product or service. Each has a label (q1, q2, ...) and a polarity: "not working" (the customer did not get what they wanted), "working" (they did), or "mixed".
The quotes were gathered because a reader judged that they bear on one need. You are not told what that need was called. Find the one outcome that most of these customers want, and state it.

THE STATEMENT
- ONE sentence, 8 to 18 words, in plain everyday words.
- Form: a direction verb (Minimize / Reduce / Increase / Improve / Maximize / Avoid) + a measurable dimension (time, effort, likelihood, frequency, number, risk) + the object of control + the context.
- It states what the CUSTOMER wants for themselves. It never states what a provider should build, offer or do, and it is never a feature, a fix or a recommendation.
- It states the OUTCOME the customer is after, not a step they take on the way to it. Ask of each quote: what did this customer want to be true when they were done?
- It names no company, brand, product or person.
- It is grounded ONLY in the quotes. Add no fact, number, cause or wish the customers did not voice.
- ONE outcome. If the quotes hold two different outcomes, state the one that the most quotes share and leave the others out. Do not join two outcomes with "and".
- Do not widen the statement until it fits everything. A statement that any complaint would fit is wrong.

THE ACCOUNT
Every quote is accounted for EXACTLY ONCE: either it is evidence about your statement, or it is left out with a reason.
- "covers": the label of every quote that gives evidence about your statement — as a barrier to the outcome, as the outcome achieved, or both.
- "left_over": every other quote, each with "why": one short clause saying what the quote is about instead.
- No label in both lists. No label in neither. No label twice. Use only the labels you were given.

Answer with JSON only, in exactly this shape:
{"statement":"<one sentence>","covers":["q1","q4"],"left_over":[{"quote":"q2","why":"<one short clause>"}]}`;

export const WORDING_USER_LAST_LINE = "Write the one desired-outcome statement and account for every quote.";

/** SP-572 (2): the whole arm 2 introduction. It no longer says the quotes were set aside, or under
 *  what — that sentence told the generator the old wording existed. */
export const ARM2_NOTES_HEADER = [
  "NOTES FROM AN EARLIER READING",
  "An earlier reader noted what each of these quotes is about. The notes do not say what the need is.",
] as const;

export const polarityShown = (p: string | null) => p ?? "unlabelled";

/** The labels of a run: q1..qN in the order the quotes are given. One call sees every polarity. */
export function labelQuotes(quotes: readonly WordingQuote[]): Map<string, WordingQuote> {
  return new Map(quotes.map((q, i) => [`q${i + 1}`, q]));
}

/** SP-572 (3): ONE mechanical rule, no hand edit. Cut from the first ", not ", ", no " or
 *  " rather than " to the end of the note. A note with no match passes unchanged. */
export const NOTE_CUT_MARKS = [", not ", ", no ", " rather than "] as const;
export function trimNote(note: string): string {
  let cut = -1;
  for (const m of NOTE_CUT_MARKS) {
    const i = note.indexOf(m);
    if (i >= 0 && (cut < 0 || i < cut)) cut = i;
  }
  return cut < 0 ? note : note.slice(0, cut);
}

/** SP-572 (3): identical notes on the same quote are passed once. "Identical" is read AFTER the
 *  trim, because the trim is what makes two of run 7's notes on one quote the same words. */
export function notesForQuote(raw: readonly string[]): string[] {
  const out: string[] = [];
  for (const r of raw) {
    const t = trimNote(r);
    if (t.trim() !== "" && !out.includes(t)) out.push(t);
  }
  return out;
}

/** The arm 2 block's note lines, in label order. `notes` is keyed by signal id and already trimmed. */
export function arm2NoteLines(labels: ReadonlyMap<string, WordingQuote>, notes: Readonly<Record<string, readonly string[]>>): string[] {
  const lines: string[] = [];
  for (const [label, q] of labels) for (const n of notes[q.signalId] ?? []) lines.push(`${label}: ${n}`);
  return lines;
}

export function buildWordingUser(
  labels: ReadonlyMap<string, WordingQuote>,
  notes?: Readonly<Record<string, readonly string[]>>,
): string {
  const qs = [...labels.values()];
  const by = (p: string) => qs.filter((q) => q.polarity === p).length;
  const head = [
    `QUOTES (${qs.length}: ${by("not working")} not working, ${by("working")} working, ${by("mixed")} mixed):`,
    ...[...labels].map(([l, q]) => `${l} [${polarityShown(q.polarity)}]: "${collapse(q.quote)}"`),
    "",
  ];
  const block = notes ? [...ARM2_NOTES_HEADER, ...arm2NoteLines(labels, notes), ""] : [];
  return [...head, ...block, WORDING_USER_LAST_LINE].join("\n");
}

// ── the form gates ───────────────────────────────────────────────────────────────────────────────
//
// SP-575: COPIES. `ODI_DIRECTION` is a private constant of a served function and
// `analyzeOutcomeQuality` a private function of a file that starts a server when imported, so
// neither can be imported and neither file is edited for this tool. The text between the two marker
// lines below is the source text, and `needWording.test.ts` reads both origin files and fails when a
// copy has drifted. Change nothing between the markers by hand: copy it again from the origin.

// SP-575-COPY-BEGIN record-interview-finding/handler.ts
const ODI_DIRECTION = /^(minimize|reduce|increase|improve|maximize|avoid)\b/i;
// SP-575-COPY-END

// SP-575-COPY-BEGIN research-company/index.ts
const WEAK_OUTCOME_STARTERS = [
  "build ",
  "create ",
  "add ",
  "launch ",
  "implement ",
  "improve the ",
  "design ",
  "develop ",
  "roll out ",
  "introduce ",
  "use ",
];

const WEAK_OUTCOME_TERMS = [
  "dashboard",
  "portal",
  "feature",
  "tool",
  "campaign",
  "workflow",
  "form",
  "program",
  "website",
  "crm",
  "integration",
];

function analyzeOutcomeQuality(outcome: string) {
  const text = String(outcome || "").trim().toLowerCase();
  const issues: string[] = [];

  if (!text) issues.push("missing_text");
  if (text.split(/\s+/).length < 7) issues.push("too_short");
  if (WEAK_OUTCOME_STARTERS.some((starter) => text.startsWith(starter))) issues.push("starts_like_output");
  if (WEAK_OUTCOME_TERMS.some((term) => text.includes(term))) issues.push("contains_solution_language");
  if (!/^(minimize|reduce|increase|improve|maximize|avoid)\b/.test(text)) issues.push("missing_directional_verb");
  if (!/\b(time|effort|likelihood|confidence|consistency|clarity|risk|delay|drop-off|completion|cost|burden|visibility|follow-through|continuity|conversion|retention|readiness|access)\b/.test(text)) {
    issues.push("missing_measurable_dimension");
  }

  return {
    weak: issues.length >= 2,
    issues,
  };
}
// SP-575-COPY-END

export { ODI_DIRECTION, analyzeOutcomeQuality };

export const WORDS_MIN = 8;
export const WORDS_MAX = 18;
export const wordCount = (s: string) => (s.trim() === "" ? 0 : s.trim().split(/\s+/).length);
/** One sentence: no line break, and no sentence end with more text after it. */
export const isOneSentence = (s: string) => s.trim() !== "" && !/[\r\n]/.test(s.trim()) && !/[.!?]["')\]]?\s+\S/.test(s.trim());

export type GateName = "direction" | "length" | "one_sentence";
export type FormCheck = {
  words: number;
  gates: Record<GateName, boolean>;
  /** The first gate that failed, or null. Only a gate can earn a re-ask or cost a candidate. */
  failed: GateName | null;
  /** SP-572 (4): printed in full, every time, and never read by anything that decides. */
  quality: { weak: boolean; issues: string[] };
};

/** SP-572 (4): the gates are `ODI_DIRECTION`, 8 to 18 words, and one sentence — those three.
 *  `analyzeOutcomeQuality` is reported beside them and CANNOT fail a candidate here: it matches by
 *  substring ("information" trips `form`) and its dimension list lacks "frequency" and "number", so
 *  a sound statement can be called weak. `failed` is computed from `gates` alone. */
export function checkForm(statement: string): FormCheck {
  const s = statement.trim();
  const words = wordCount(s);
  const gates: Record<GateName, boolean> = {
    direction: ODI_DIRECTION.test(s),
    length: words >= WORDS_MIN && words <= WORDS_MAX,
    one_sentence: isOneSentence(s),
  };
  const failed = (["direction", "length", "one_sentence"] as const).find((g) => !gates[g]) ?? null;
  return { words, gates, failed, quality: analyzeOutcomeQuality(s) };
}

/** What the re-ask is told went wrong, in the exact words of the failure. */
export function gateFailureText(c: FormCheck, statement: string): string {
  if (c.failed === "direction") return `the statement starts with "${statement.trim().split(/\s+/)[0] ?? ""}", which is not a direction verb`;
  if (c.failed === "length") return `the statement is ${c.words} words; it must be ${WORDS_MIN} to ${WORDS_MAX}`;
  if (c.failed === "one_sentence") return "the statement is more than one sentence";
  return "";
}

/** The guidance line of a re-ask, one per gate. Brief 9 §8e carried two more, for a missing
 *  dimension and for solution language; SP-572 (4) left nothing that can trigger them, so they are
 *  not built — a prompt line no path can send is a line nobody has read in a run. */
export const REASK_GUIDANCE_BY_GATE: Record<GateName, string> = {
  direction: "The statement must START with one of these words: Minimize, Reduce, Increase, Improve, Maximize, Avoid.",
  length: "The statement must be ONE sentence of 8 to 18 words. Shorten the wording; do not generalize it.",
  one_sentence: "The statement must be ONE sentence of 8 to 18 words. Shorten the wording; do not generalize it.",
};

// ── SP-581 / SP-587 / SP-588 (2026-11-23): THE TWO CHECKS THAT PRINT AND RE-ASK, AND NEVER DROP ──
//
// SP-581: the generator is told not to join two outcomes with "and", and no gate tested it (SP-572 (4)
// kept the gates to three). Brief 10's candidate was "…to resolve service issues and billing disputes".
// SP-587: the ODI form the prompt asks for ends in a CONTEXT (direction + dimension + object +
// context), and that candidate had none, which is part of why it fit 8 of 20 quotes that are not this
// need's. The mechanical test is one of five words.
//
// Neither is a gate. Both are printed with the statement, both earn the re-ask, and a statement that
// still fails either is judged all the same with the flag beside it — only the three form gates can
// cost a candidate.
//
// SP-588: ONE form re-ask per answer, naming EVERY failure at once — a failed gate, "and", no context —
// each with its guidance line, in the SP-546 frame. Brief 11 sent the "and" re-ask alone and got the
// same sentence back; a second re-ask for the context would have been a third call asking the model
// to fix one thing while free to break the other. The account re-ask stays separate (it is not about
// the statement). SP-588 supersedes SP-581's own re-ask text and its separate "narrow" candidate.
export const containsAnd = (statement: string) => /\band\b/i.test(statement);
export const CONTEXT_WORDS = ["when", "while", "during", "before", "after"] as const;
export const hasContext = (statement: string) => new RegExp(`\\b(${CONTEXT_WORDS.join("|")})\\b`, "i").test(statement);

export const AND_FAILURE = 'the statement joins two things with "and"';
export const AND_GUIDANCE = 'Do not join two things with "and". State the one that most quotes share.';
export const CONTEXT_FAILURE = "the statement does not say when or where the customer is trying to do this";
export const CONTEXT_GUIDANCE = 'The statement must say when or where the customer is trying to do this. Add that context from the quotes, using "when", "while", "during", "before" or "after".';

export type FormFailure = { kind: GateName | "and" | "context"; failure: string; guidance: string };

/** Every reason an answer earns the form re-ask, in a fixed order: the failed gates, then "and", then
 *  the context. Empty when there is nothing to re-ask. */
export function formFailures(statement: string): FormFailure[] {
  const c = checkForm(statement);
  const out: FormFailure[] = (["direction", "length", "one_sentence"] as const).filter((g) => !c.gates[g])
    .map((g) => ({ kind: g, failure: gateFailureText({ ...c, failed: g }, statement), guidance: REASK_GUIDANCE_BY_GATE[g] }));
  if (containsAnd(statement)) out.push({ kind: "and", failure: AND_FAILURE, guidance: AND_GUIDANCE });
  if (!hasContext(statement)) out.push({ kind: "context", failure: CONTEXT_FAILURE, guidance: CONTEXT_GUIDANCE });
  return out;
}

/** SP-588: the one combined re-ask. The failures share the REFUSED line; each guidance line is its own
 *  line, once (two gates share one line). */
export function buildCombinedReask(user: string, failures: readonly FormFailure[]): string {
  return buildFormReask(user, failures.map((f) => f.failure).join("; ") + ".", [...new Set(failures.map((f) => f.guidance))].join("\n"));
}

// ── SP-589: several generator runs, and which of their statements are judged ─────────────────────

export type GenRun = { temperature: number; seed: number };
/** `--runs=0:42,0.7:43` → one run per `temperature:seed`. Refuses anything it cannot read exactly. */
export function parseRuns(spec: string): GenRun[] {
  const runs = spec.split(",").map((x) => x.trim()).filter(Boolean).map((x) => {
    const m = x.match(/^(\d+(?:\.\d+)?):(\d+)$/);
    if (!m) throw new Error(`--runs: ${JSON.stringify(x)} is not <temperature>:<seed>`);
    const temperature = Number(m[1]), seed = Number(m[2]);
    if (temperature > 2) throw new Error(`--runs: temperature ${temperature} is above 2`);
    return { temperature, seed };
  });
  if (!runs.length) throw new Error("--runs names no run");
  if (new Set(runs.map((r) => `${r.temperature}:${r.seed}`)).size !== runs.length) throw new Error("--runs names the same run twice");
  return runs;
}

/** Two statements are the same if they match after trimming whitespace and a final full stop,
 *  ignoring case (brief 12, step 5). */
export const statementKey = (s: string) => collapse(s).replace(/\.$/, "").trim().toLowerCase();

export type FinalStatement = { run: string; statement: string; gateFailed: string };
/** Brief 12 step 5: the distinct final statements that are judged. A statement that fails a form gate
 *  after its re-ask is named and not judged; so is one identical to a wording already measured. Every
 *  other distinct statement IS judged, whatever its "and" and context flags say. */
export function distinctToJudge(finals: readonly FinalStatement[], alreadyMeasured: readonly string[]): {
  judge: Array<{ statement: string; runs: string[]; and: boolean; context: boolean }>;
  droppedGate: FinalStatement[]; droppedMeasured: FinalStatement[];
} {
  const measured = new Set(alreadyMeasured.map(statementKey));
  const judge = new Map<string, { statement: string; runs: string[]; and: boolean; context: boolean }>();
  const droppedGate: FinalStatement[] = [], droppedMeasured: FinalStatement[] = [];
  for (const f of finals) {
    if (!f.statement.trim()) continue;
    if (f.gateFailed) { droppedGate.push(f); continue; }
    const k = statementKey(f.statement);
    if (measured.has(k)) { droppedMeasured.push(f); continue; }
    const seen = judge.get(k);
    if (seen) seen.runs.push(f.run);
    else judge.set(k, { statement: f.statement, runs: [f.run], and: containsAnd(f.statement), context: hasContext(f.statement) });
  }
  return { judge: [...judge.values()], droppedGate, droppedMeasured };
}

/** `LEFT_OVER_REASK` (needPatterns.ts) in this tool's shape: one statement, `covers`, `left_over`. */
export const ACCOUNT_REASK =
  "Your answer does not account for every quote. Every label you were given must appear exactly once: in `covers`, or in `left_over` with one clause saying why. Keep the same statement; only complete the account.";

/** The re-ask, in the SP-546 shape of `run-need-patterns.ts`. */
export function buildFormReask(user: string, failure: string, guidance: string): string {
  return `${user}\n\nYOUR PREVIOUS ANSWER WAS REFUSED: ${failure}\n${guidance}\nAnswer again, fixing only that.`;
}
export function buildAccountReask(user: string, detail: string): string {
  return `${user}\n\nYOUR PREVIOUS ANSWER'S ACCOUNT IS INCOMPLETE:\n${detail}\n${ACCOUNT_REASK}`;
}

// ── the generator's answer and its account ───────────────────────────────────────────────────────

export type GeneratedWording = { statement: string; covers: string[]; leftOver: Array<{ label: string; why: string }> };

/** Reads the answer as it stands. Nothing is repaired: a list that is not a list is an empty list,
 *  and the accounting then names every label it failed to place. */
export function parseWording(content: string): GeneratedWording {
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("wording generator returned no JSON object");
  const o = JSON.parse(m[0]) as Record<string, unknown>;
  const statement = typeof o.statement === "string" ? collapse(o.statement) : "";
  const covers = Array.isArray(o.covers) ? o.covers.filter((x): x is string => typeof x === "string").map((x) => x.trim()) : [];
  const leftOver = Array.isArray(o.left_over)
    ? o.left_over.filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map((x) => ({ label: typeof x.quote === "string" ? x.quote.trim() : "", why: typeof x.why === "string" ? x.why.trim() : "" }))
    : [];
  return { statement, covers, leftOver };
}

export type WordingAccount = {
  missing: string[]; both: string[]; twice: string[]; invented: string[]; noReason: string[];
  covered: number; leftOver: number; ok: boolean;
};

/** SP-535, in this tool's shape: every label given is in `covers` or in `left_over`, exactly once.
 *  Reporting only — it never gates the statement. */
export function accountForWording(labels: Iterable<string>, w: Pick<GeneratedWording, "covers" | "leftOver">): WordingAccount {
  const given = [...labels];
  const known = new Set(given);
  const count = (xs: string[]) => { const m = new Map<string, number>(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return m; };
  const cov = count(w.covers), lo = count(w.leftOver.map((l) => l.label));
  const missing = given.filter((l) => !cov.has(l) && !lo.has(l));
  const both = given.filter((l) => cov.has(l) && lo.has(l));
  const twice = given.filter((l) => (cov.get(l) ?? 0) > 1 || (lo.get(l) ?? 0) > 1);
  const invented = [...new Set([...cov.keys(), ...lo.keys()])].filter((l) => !known.has(l));
  const noReason = w.leftOver.filter((l) => known.has(l.label) && !l.why).map((l) => l.label);
  return {
    missing, both, twice, invented, noReason,
    covered: given.filter((l) => cov.has(l)).length, leftOver: given.filter((l) => lo.has(l)).length,
    ok: !missing.length && !both.length && !twice.length && !invented.length && !noReason.length,
  };
}

export function accountDetail(a: WordingAccount): string {
  return [
    a.missing.length ? `in neither list: ${a.missing.join(", ")}` : "",
    a.both.length ? `in both lists: ${a.both.join(", ")}` : "",
    a.twice.length ? `listed twice: ${a.twice.join(", ")}` : "",
    a.invented.length ? `labels you were not given: ${a.invented.join(", ")}` : "",
    a.noReason.length ? `left over with no reason: ${a.noReason.join(", ")}` : "",
  ].filter(Boolean).join("\n");
}

// ── the fit judge ────────────────────────────────────────────────────────────────────────────────

/** SP-582 (2026-11-23): the one sentence the fit judge's span rule gained. Brief 10's diagnostic call
 *  (SP-577) showed the thinking judge deciding in 2,200 tokens and then spending 14,000 more failing
 *  to choose a span, because the evidence sat in two places and it wanted to join them with an
 *  ellipsis. FIT JUDGE ONLY: `JUDGE_SYSTEM`, the pattern judge's prompt, does not carry it. */
export const FIT_SPAN_SENTENCE = "The span is ONE unbroken run of words; if the evidence is in two places, copy the single most telling one.";

/** SP-583: the fit judge's budgets. The retry is 7,000 and not the pattern judge's 8,000, so that the
 *  prompt plus the whole retry fits `num_ctx` 8,192 — past it the runtime shifts the oldest context
 *  out from under the thinking. The pattern judge's retry (`JUDGE_NUM_PREDICT_RETRY`) is not touched. */
export const FIT_NUM_CTX = 8192;
export const FIT_NUM_PREDICT = 4_000;
export const FIT_NUM_PREDICT_RETRY = 7_000;
/** Whether a prompt and its whole budget fit the context, at a deliberately pessimistic 3 characters
 *  per token (the judge's measured 835 tokens for 3,400 characters is nearer 4). */
export function fitsContext(promptChars: number, numPredict: number, numCtx = FIT_NUM_CTX): boolean {
  return Math.ceil(promptChars / 3) + numPredict <= numCtx;
}

/** Approved by SP-572. A new prompt and not the pattern judge's: that one asks whether a quote
 *  STATES a claim, and a complaint never states a desired outcome — it is evidence about one. What
 *  is kept from the pattern judge is its discipline: a verbatim span and fail-closed parsing. */
export const FIT_JUDGE_SYSTEM = `You decide whether ONE customer quote gives evidence about ONE desired outcome.

You are given an OUTCOME, a sentence saying what customers want, and a QUOTE, a customer's own words.

The quote gives evidence about the outcome when the customer describes, from their own experience, either:
- a BARRIER: something that kept them from that outcome, or made it slower, harder or less likely; or
- a HELP: the outcome achieved, or something that got them to it.

Rules:
- Judge the quote against the outcome AS WORDED. Do not widen the outcome, and do not judge against a neighboring outcome that it reminds you of.
- The evidence must be in the quote. "span" is the exact words that show it, copied character for character from the quote, never a paraphrase and never your own words. The span is ONE unbroken run of words; if the evidence is in two places, copy the single most telling one.
- A quote about the same company, the same department or the same topic is NOT evidence unless it bears on THIS outcome.
- A quote that only gives a feeling ("terrible", "great") and says nothing about the outcome is not evidence.
- A quote may be about several things. It is evidence if ANY part of it bears on this outcome; the other parts do not count against it.
- If you are not sure, answer false.

Answer with JSON only, in exactly this shape:
{"fits":true,"kind":"barrier","span":"<exact words from the quote>","reason":"<one short clause>"}
"kind" is "barrier", "help" or "both" when "fits" is true, and "none" when "fits" is false. When "fits" is false, "span" is "".`;

/** The judge is never told which wording is the baseline, a candidate or the control. */
export function buildFitUser(wording: string, quote: string): string {
  return `OUTCOME: ${collapse(wording)}\n\nQUOTE: "${collapse(quote)}"`;
}

export const FIT_KINDS = ["barrier", "help", "both"] as const;
export type FitRejection = "" | "answered_false" | "kind_invalid" | "span_missing" | "span_not_verbatim" | "unreadable";
export type FitVerdict = { fits: boolean; kind: string; span: string; reason: string; rejected: FitRejection };

/** FAIL CLOSED (the SP-566 rule): a quote fits only when `fits` is the boolean true, `kind` is one of
 *  the three, and `span` is non-empty and verbatim in the quote. Everything else is not a fit, and
 *  says by class why not — so "the judge said no" is never confused with "the answer was unusable". */
export function parseFit(content: string, quote: string): FitVerdict {
  let o: Record<string, unknown>;
  try {
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) return { fits: false, kind: "", span: "", reason: "", rejected: "unreadable" };
    o = JSON.parse(m[0]);
    if (!o || typeof o !== "object") return { fits: false, kind: "", span: "", reason: "", rejected: "unreadable" };
  } catch {
    return { fits: false, kind: "", span: "", reason: "", rejected: "unreadable" };
  }
  const kind = typeof o.kind === "string" ? o.kind.trim() : "";
  const span = typeof o.span === "string" ? o.span.trim() : "";
  const reason = typeof o.reason === "string" ? o.reason.trim() : "";
  const no = (rejected: FitRejection): FitVerdict => ({ fits: false, kind, span, reason, rejected });
  if (o.fits !== true) return no("answered_false");
  if (!(FIT_KINDS as readonly string[]).includes(kind)) return no("kind_invalid");
  if (!span) return no("span_missing");
  if (!verbatimOn(span, quote)) return no("span_not_verbatim");
  return { fits: true, kind, span, reason, rejected: "" };
}

// ── SP-586: the plan of stage 2 — every (set, wording, quote) row, and which rows are a model call ──

export type FitWording = { name: string; role: "baseline" | "candidate" | "narrow" | "control"; text: string };
export type FitSet = { name: string; signalIds: readonly string[]; withControl: boolean };
export type FitPlanRow = { set: string; wording: string; signalId: string; reuseOf: string | null };

/** Every row the report needs, in the order the calls are made (quote by quote, wording by wording
 *  within a quote), with `reuseOf` naming the set whose verdict a row reuses. A (wording, quote) pair
 *  is judged ONCE: the judge is given the wording and the quote and nothing else (temperature 0, a
 *  fixed seed), so asking again is the same question — a quote that sits in the side tables and the
 *  specificity set, or in the need's own quotes and a side table, costs one call per wording. */
export function planFitPairs(wordings: readonly FitWording[], sets: readonly FitSet[]): FitPlanRow[] {
  const first = new Map<string, string>();
  const rows: FitPlanRow[] = [];
  for (const set of sets) {
    for (const signalId of [...new Set(set.signalIds)]) {
      for (const w of wordings) {
        if (w.role === "control" && !set.withControl) continue;
        const key = `${w.name}\u0000${signalId}`;
        rows.push({ set: set.name, wording: w.name, signalId, reuseOf: first.get(key) ?? null });
        if (!first.has(key)) first.set(key, set.name);
      }
    }
  }
  return rows;
}

/** Brief 11's two stop rules, on FIRST attempts only (a retry is not a second sample of the same fault).
 *  The smoke: more than 3 of the first 12 empty. The run: past 15% at any point after 60. */
export function emptyStop(firstAttempts: number, firstEmpties: number): string | null {
  if (firstAttempts === 12 && firstEmpties > 3) return `smoke: ${firstEmpties} of the first 12 fit calls came back empty on the first attempt (limit 3)`;
  if (firstAttempts > 60 && firstEmpties / firstAttempts > 0.15) return `${firstEmpties} of ${firstAttempts} first attempts empty (${(100 * firstEmpties / firstAttempts).toFixed(1)}%), past 15%`;
  return null;
}

// ── the specificity set (SP-574) and the --out rule ──────────────────────────────────────────────

/** mulberry32 — a fixed seed gives the same draw on every machine. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** SP-574: `n` ids by fixed seed. The pool is sorted first, so the draw does not depend on the order
 *  the database happened to return rows in. */
export function drawBySeed(ids: readonly string[], n: number, seed: number): string[] {
  const pool = [...new Set(ids)].sort();
  const rnd = seededRng(seed);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

/** Why an `--out` directory is refused, or null. Both paths must already be absolute and resolved:
 *  the tool's files are run records, and a run record inside the repo is one `git add -A` from a
 *  commit nobody meant. */
export function outDirRefusal(outAbs: string, repoAbs: string): string | null {
  const norm = (p: string) => p.replace(/\/+$/, "");
  const out = norm(outAbs), repo = norm(repoAbs);
  if (!out.startsWith("/")) return `--out must be an absolute path; got ${JSON.stringify(outAbs)}`;
  if (out === repo || out.startsWith(repo + "/")) return `--out is inside the repo (${repo}); choose a directory outside it`;
  return null;
}

/** Every string this tool can send to a model as an instruction, for the spelling test and the md5s. */
export const ALL_PROMPT_TEXT: Record<string, string> = {
  "generator system": WORDING_GENERATOR_SYSTEM,
  "generator user, last line": WORDING_USER_LAST_LINE,
  "arm 2 block, introduction": ARM2_NOTES_HEADER.join("\n"),
  "re-ask guidance: direction": REASK_GUIDANCE_BY_GATE.direction,
  "re-ask guidance: length / one sentence": REASK_GUIDANCE_BY_GATE.length,
  "re-ask: account": ACCOUNT_REASK,
  "combined re-ask (SP-588), for a statement that fails both \"and\" and context": buildCombinedReask("{user}", [
    { kind: "and", failure: AND_FAILURE, guidance: AND_GUIDANCE }, { kind: "context", failure: CONTEXT_FAILURE, guidance: CONTEXT_GUIDANCE },
  ]),
  "re-ask frame (form)": buildFormReask("{user}", "{failure}", "{guidance}"),
  "re-ask frame (account)": buildAccountReask("{user}", "{detail}"),
  "fit judge system": FIT_JUDGE_SYSTEM,
  "fit judge user": buildFitUser("{wording}", "{quote}"),
};
