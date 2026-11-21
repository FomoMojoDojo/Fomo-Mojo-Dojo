// ── THE PATTERN LAYER UNDER A NEED (rubric v2: SP-469 / SP-470 / SP-475, 2026-11-20) ─────────────
//
// WHAT v1 GOT WRONG, measured against the hand-built brief. The generator split one rule into
// near-synonyms: N14's exit-billing rule — the brief's single strongest finding, 10+ of 17 quotes —
// came back as five patterns of 2 to 5, so it never reached `confirmed rule` and a reader could not
// see that it was the clearest thing in the data. The same hand showed up in the index SP-475(c) now
// forbids: one quote was the representative of FIVE patterns under that need, four under P1's.
// Coverage was a third (N13: 16 of 44 counted quotes), the 6-pattern cap bound on every need, and
// polarity never reached the generator at all, so a positive finding was unproducible.
//
// SO THE INSTRUCTION IS INVERTED. v1 asked for patterns and got as many as the cap allowed. v2 asks
// for the FEWEST DISTINCT patterns that cover the MOST quotes (SP-469), with near-synonyms merged and
// one pattern per distinct problem, and the ceiling is raised to 12 so that the bound is a backstop
// rather than the thing shaping the answer — and when it IS reached, that is counted and reported.
//
// POLARITY (SP-470): each quote's own `need_evidence.polarity` goes into the prompt, each pattern
// carries ONE polarity, and a positive or mixed pattern is a separate pattern. A pattern cannot be
// "mostly complaints with a compliment in it".
//
// THE JUDGE RULES ON ONE QUOTE PER CALL (SP-475d). v1 handed it a pattern and all its cited quotes
// and asked which survived; the honest-control re-run then kept 11 of the 15 it had kept before,
// from a different cited set — the verdict on a quote depended on its neighbours. One quote per call
// removes that coupling. It costs about 160 judge calls for the five needs instead of 30, and that
// is the price of a verdict that is a property of the quote.
//
// STILL TRUE FROM v1: the strength is assigned HERE from the surviving quotes and never by the model
// (SP-428, and no supporting ÷ total ratio anywhere); no count is stored (SP-463); the lane is
// resolved once by the caller through `patternRouteProvenance` (SP-460/468) and this module never
// chooses a model.
import { normalizeForHash, sha256Hex } from "./contentIdentity.ts";
// SP-494(1): the span the judge returns is verified with the E4 predicate, imported. A second
// substring implementation here would be the drift this module keeps warning about.
import { verbatimOn } from "./excerptBlanking.ts";

/** Rubric v2. Bumped because the instruction changed, not because the wording was tidied: a v1 row
 *  and a v2 row are answers to different questions and must not read as the same judgement. */
// v2.2 (SP-497). Still not "v3": SP-493 reserves that for the pattern slice (names, need boundaries).
// v2.1 asked the negative question and nothing else, and a strict reader answered it literally — a
// particular never "states" a generalisation, so the honest control fell to 6 of 63. v2.2 keeps the
// negative framing and tells the judge, PER PART, that an instance of a part states that part.
// A v2.1 verdict and a v2.2 verdict are answers to different questions, so the version moves with it.
export const PATTERN_RUBRIC_VERSION = "need-pattern-rubric-v2.2";
export const PATTERN_RUBRIC_TEXT = [
  "A PATTERN is the particular thing that keeps happening under a need, stated as one sentence in plain words.",
  "A quote SUPPORTS a pattern only when the quote's own words state it. A quote about the same topic does not support it.",
  "A pattern must be narrower than the need and wider than one quote.",
  "Prefer the FEWEST distinct patterns that cover the MOST quotes. Two sentences describing the same problem are ONE pattern.",
  "One pattern per distinct problem. A pattern keeps the particulars: the numbers, the named rule, the mechanism.",
  "A pattern carries ONE polarity. What is working and what is not working are different patterns.",
  "Never invent a quote, a number, a date or a name.",
].join("\n");

/** SP-469: a CEILING, not a target. 12 rather than 6, so the bound stops a runaway instead of
 *  shaping the answer — and `run_ceiling_hit` records when it bit. */
export const PATTERN_CEILING = 12;
export const MAX_PATTERN_NAME_CHARS = 90;
export const PATTERN_NUM_PREDICT = 2_400;
/** One quote per judge call, so its output is tiny and its latency is the prompt's. */
export const JUDGE_NUM_PREDICT = 200;

export type QuotePolarity = "working" | "not working" | "mixed";
export const QUOTE_POLARITIES: readonly QuotePolarity[] = ["working", "not working", "mixed"];

export type PatternQuote = {
  signalId: string;
  /** signals.quote — the VERIFIED sentence (SP-452), never evidence_excerpt. */
  quote: string;
  site: string;
  eventDate: string | null;
  brand: string;
  /** need_evidence.polarity for THIS quote under THIS need (SP-470). */
  polarity: QuotePolarity | null;
};

export type ProposedPattern = {
  name: string;
  polarity: QuotePolarity;
  signalIds: string[];
  /** SP-475(c): the generator's own pick of the quote that best fits the name. */
  representativeSignalId: string | null;
};
/** SP-428: the four strengths, and only these. */
export type PatternStrength = "confirmed rule" | "likely rule" | "possible failure" | "too thin";

/** SP-428, assigned from the SURVIVING quotes, never by the model. Unchanged from v1. */
export function patternStrength(supporting: ReadonlyArray<{ site: string }>): PatternStrength {
  const n = supporting.length;
  const sites = new Set(supporting.map((q) => q.site)).size;
  if (n >= 8 && sites >= 3) return "confirmed rule";
  if (n >= 5 && sites >= 2) return "likely rule";
  if (n >= 2) return "possible failure";
  return "too thin";
}

/** PCT-1: computed in TypeScript only. The rubric version is IN the identity, so a v1 pattern and a
 *  v2 pattern of the same words are different rows — which is what supersede-never-delete means when
 *  the question changed. */
export async function patternIdentity(needId: string, name: string): Promise<string> {
  return await sha256Hex(`${PATTERN_RUBRIC_VERSION}\u0000${needId}\u0000${normalizeForHash(name)}`);
}

export const GENERATOR_SYSTEM = [
  PATTERN_RUBRIC_TEXT,
  "",
  "You are given ONE customer need and the quotes already judged to bear on it. Each quote carries its",
  "own polarity: 'not working' (the outcome is being missed), 'working' (it is being met) or 'mixed'.",
  "",
  "STAY INSIDE THE NEED. A pattern must be about THIS need. If a quote is really about billing and the",
  "need is about contacting support, leave that quote out rather than widening the pattern to fit it.",
  "",
  `Return at most ${PATTERN_CEILING} patterns, most-evidenced first, but return FEWER if fewer cover the`,
  "quotes. Merging two near-synonymous patterns into one is always better than listing both.",
  "",
  `Each pattern: "name" is ONE sentence of at most ${MAX_PATTERN_NAME_CHARS} characters that KEEPS THE`,
  "PARTICULARS — the number, the named rule, the mechanism — not a generalisation of them.",
  '"polarity" is one of "not working", "working", "mixed", and every quote you cite for it must carry',
  "that polarity. Produce positive and mixed patterns separately from negative ones.",
  '"quotes" lists the LABELS (q1, q2, ...) of the quotes whose own words state it.',
  '"representative" is the ONE label that best fits the name. Use a different representative for every',
  "pattern — no label may be the representative of two patterns.",
  "",
  "Copy each label exactly as given. Never write an id, a uuid, or a label that was not given to you.",
  'JSON only: {"patterns":[{"name":"<=90 chars","polarity":"not working","quotes":["q1","q4"],"representative":"q1"}]}',
].join("\n");

/** SP-475(d) + SP-494: ONE quote, one verdict — and the verdict must show its work.
 *
 * WHY THE CONTRACT CHANGED. Measured 2026-11-20: asked "do the quote's own words state the pattern?",
 * the judge sometimes answered with a DESCRIPTION OF THE QUOTE and `supports: true`, without ever
 * testing it against the pattern. Three of N14's exit-billing quotes were kept under "Customers praise
 * the fibre rollout and the price in rural Idaho" with the reasons "quote states unclear billing
 * policy", "mentions a specific issue with cancellation and billing policies", "mentions a specific
 * billing policy". Four swap errors were the same shape: "multi-hour" matched "HOURS on the phone",
 * "disruptions" matched "disruptions due to incorrect information".
 *
 * So the question is INVERTED (SP-494.2): naming what is MISSING cannot be satisfied by describing the
 * quote, and `supports` is then OURS to compute — true only when that list is empty. And the answer
 * must carry a VERBATIM SPAN of the quote (SP-494.1), checked in code.
 *
 * SP-494 is explicit that the span proves the span is REAL, not that it states the pattern: its value
 * is traceability, and it is stored with the verdict so a person can see what the judge was looking at. */
export const JUDGE_SYSTEM = [
  PATTERN_RUBRIC_TEXT,
  "",
  "You are given ONE proposed pattern and ONE quote.",
  "",
  "Break the pattern into its PARTS and judge each part separately.",
  "",
  "A quote that describes a specific INSTANCE of a part of the pattern STATES that part; it does not",
  "have to repeat the pattern's wording (\"they hung up on me twice\" states \"representatives are",
  'dismissive"). EVERY part of the pattern must be stated, or shown by an instance. A quote that',
  "describes a DIFFERENT problem states nothing.",
  "",
  'List in "not_stated" EVERY part of the pattern this quote neither states nor shows by an instance.',
  "Return an empty list ONLY if every part is stated or shown. Topic overlap is not an instance.",
  "",
  'In "states", copy the EXACT WORDS of the quote that state or show the pattern — a verbatim span,',
  "copied character for character from the quote, not a paraphrase and not your own words. If the quote",
  'shows nothing, leave "states" empty.',
  "",
  "Do not judge how strong the pattern is and do not name a strength.",
  'JSON only: {"not_stated":["<part>"],"states":"<verbatim span or empty>","reason":"<one short clause>"}',
].join("\n");

// SP-504 (2026-11-20): THE KEYWORD FLAG IS REMOVED. It compared the pattern name's content words with
// the quote's and flagged a verdict with no overlap. Measured over two full corruption runs it fired on
// 125 of 189 and 74 of 123 calls — about two thirds — and told nobody anything, because a Charter
// pattern name and a Charter review share most of their vocabulary whatever the verdict. With the four
// domain words put back per SP-499 the rate fell from 86% to 66% and was still noise.
//
// It never vetoed a verdict, so nothing it ever said changed a stored row. SP-506 (signed 2026-11-20):
// `need_pattern_quotes.keyword_flag` STAYS, unused and unwritten, and is dropped by the next migration
// that touches that table — not by one of its own, because a column drop is destructive and the one run
// that wrote it is on the record. `pattern-citation-guard` (c9) asserts no v2.2 row writes it.

export type JudgeVerdict = {
  /** OURS, not the model's: true only when `not_stated` is empty AND the span verifies. */
  supports: boolean;
  /** The verbatim span, stored with the verdict (SP-494.1). "" when none verified. */
  states: string;
  /** Every part of the pattern the judge says the quote does not state (SP-494.2), stored. */
  notStated: string[];
  reason: string;
  /** Why `supports` is false when the judge's own list was empty. */
  rejected: "" | "span_not_verbatim" | "span_missing";
};

/** One quote's verdict (SP-475d / SP-494). `supports` is COMPUTED here, never taken from the model. */
export function parseJudgeOne(content: string, quote: string): JudgeVerdict {
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("pattern judge returned no JSON object");
  const parsed = JSON.parse(m[0]) as { not_stated?: unknown; states?: unknown; reason?: unknown };
  const notStated = (Array.isArray(parsed.not_stated) ? parsed.not_stated : [])
    .filter((x): x is string => typeof x === "string").map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
  const states = String(parsed.states ?? "").replace(/\s+/g, " ").trim();
  const reason = String(parsed.reason ?? "").replace(/\s+/g, " ").trim().slice(0, 400);

  // The judge's own list decides first. A NON-EMPTY list is a NO, whatever else it said; and a missing
  // list reads as "every part is unstated" rather than as assent — the fail-closed direction.
  if (!Array.isArray(parsed.not_stated) || notStated.length > 0) {
    return { supports: false, states: "", notStated: Array.isArray(parsed.not_stated) ? notStated : ["(the judge returned no not_stated list)"], reason, rejected: "" };
  }
  // The list is empty, so the judge is asserting the quote states the pattern. Now the span must back it.
  if (!states) return { supports: false, states: "", notStated, reason, rejected: "span_missing" };
  if (!verbatimOn(states, quote)) {
    return { supports: false, states, notStated, reason, rejected: "span_not_verbatim" };
  }
  return { supports: true, states, notStated, reason, rejected: "" };
}

// ── QUOTES ARE LABELLED q1..qN, NOT BY UUID (measured 2026-11-20) ───────────────────────────────
// The first v1 run handed qwen2.5:14b-instruct 44 raw uuids and it returned
// "a76c4a80-5b4d-9b68-f62e97d19115" — four groups, not five: a real id with a group dropped. The
// citation gate refused the whole answer, correctly, and the run stopped. The gate was not the
// problem; the surface was. `q1`..`q44` is a label a model can copy, and an out-of-range or invented
// label is STILL refused by the same gate. Stored rows carry real signal ids throughout.
export function quoteLabels(quotes: readonly PatternQuote[]): Map<string, string> {
  return new Map(quotes.map((qt, i) => [`q${i + 1}`, qt.signalId]));
}

const qline = (q: PatternQuote, i: number) =>
  `q${i + 1} [${q.polarity ?? "unlabelled"}] site=${q.site} date=${q.eventDate ?? "unknown"}: "${q.quote.replace(/\s+/g, " ").trim()}"`;

export function buildGeneratorUser(needStatement: string, quotes: readonly PatternQuote[]): string {
  const byPol = (p: QuotePolarity) => quotes.filter((q) => q.polarity === p).length;
  return [
    `NEED: ${needStatement}`,
    "",
    `QUOTES (${quotes.length}: ${byPol("not working")} not working, ${byPol("working")} working, ${byPol("mixed")} mixed):`,
    ...quotes.map(qline),
  ].join("\n");
}

/** One pattern, one quote (SP-475d). */
export function buildJudgeUser(needStatement: string, name: string, quote: PatternQuote): string {
  return [
    `NEED: ${needStatement}`,
    "",
    `PROPOSED PATTERN: ${name}`,
    "",
    `QUOTE: "${quote.quote.replace(/\s+/g, " ").trim()}"`,
  ].join("\n");
}

/** Read a model's JSON answer, and REFUSE anything the schema does not allow rather than repairing it.
 *  A silently truncated or widened answer is a finding nobody can trace. */
export function parseGenerated(content: string, labels: ReadonlyMap<string, string>): ProposedPattern[] {
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("pattern generator returned no JSON object");
  let parsed: unknown;
  try { parsed = JSON.parse(m[0]); } catch (e) { throw new Error(`pattern generator returned unparseable JSON: ${e instanceof Error ? e.message : e}`); }
  const raw = (parsed as { patterns?: unknown })?.patterns;
  if (!Array.isArray(raw)) throw new Error("pattern generator returned no `patterns` array");
  if (raw.length > PATTERN_CEILING) throw new Error(`pattern generator returned ${raw.length} patterns, over the SP-469 ceiling of ${PATTERN_CEILING}`);
  const out: ProposedPattern[] = [];
  const usedRepresentatives = new Set<string>();
  for (const p of raw) {
    const name = String((p as { name?: unknown })?.name ?? "").replace(/\s+/g, " ").trim();
    if (!name) throw new Error("pattern generator returned a pattern with no name");
    if (name.length > MAX_PATTERN_NAME_CHARS) throw new Error(`pattern name is ${name.length} chars, over the cap of ${MAX_PATTERN_NAME_CHARS}: "${name.slice(0, 60)}…"`);

    const pol = String((p as { polarity?: unknown })?.polarity ?? "").trim().toLowerCase();
    if (!QUOTE_POLARITIES.includes(pol as QuotePolarity)) {
      throw new Error(`pattern "${name}" carries polarity ${JSON.stringify(pol)}, not one of ${QUOTE_POLARITIES.join(" / ")}`);
    }

    const rawQuotes = (p as { quotes?: unknown })?.quotes;
    if (!Array.isArray(rawQuotes)) throw new Error(`pattern "${name}" cites no quotes array`);
    const cited = [...new Set(rawQuotes.filter((x): x is string => typeof x === "string").map((s) => s.trim()))];
    // CITATION INTEGRITY, at the door: a label the call was never given is a fabrication, and it
    // rejects the whole answer rather than being dropped — a dropped citation is a pattern quietly
    // resting on less evidence than the row will claim.
    const unknown = cited.filter((l) => !labels.has(l));
    if (unknown.length) throw new Error(`pattern "${name}" cites ${unknown.length} label(s) that were not in its input: ${unknown.slice(0, 3).join(", ")}`);
    if (cited.length === 0) throw new Error(`pattern "${name}" cites no quotes at all`);

    // SP-475(c): the generator's representative, validated here. A repeat within one answer is
    // dropped to null rather than refused — the runner then picks from the survivors, and the unique
    // index is the floor underneath both.
    const repLabel = String((p as { representative?: unknown })?.representative ?? "").trim();
    let representativeSignalId: string | null = null;
    if (repLabel && labels.has(repLabel) && cited.includes(repLabel) && !usedRepresentatives.has(repLabel)) {
      usedRepresentatives.add(repLabel);
      representativeSignalId = labels.get(repLabel)!;
    }

    out.push({ name, polarity: pol as QuotePolarity, signalIds: cited.map((l) => labels.get(l)!), representativeSignalId });
  }
  return out;
}

