// ── THE PATTERN LAYER UNDER A NEED (rubric v3: SP-502 / SP-509 / SP-510, 2026-11-20) ────────────
//
// WHAT v1 GOT WRONG, measured against the hand-built brief. The generator split one rule into
// near-synonyms: N14's exit-billing rule — the brief's single strongest finding, 10+ of 17 quotes —
// came back as five patterns of 2 to 5, so it never reached `confirmed rule` and a reader could not
// see that it was the clearest thing in the data. The same hand showed up in the index SP-475(c) now
// forbids: one quote was the representative of FIVE patterns under that need, four under P1's.
// Coverage was a third (N13: 16 of 44 counted quotes), the 6-pattern cap bound on every need, and
// polarity never reached the generator at all, so a positive finding was unproducible.
//
// WHAT v2 GOT WRONG, measured on the corruption pairs. v2 named a pattern in one compound sentence
// and asked the judge a single question about the whole of it. A strict reader answered it literally —
// a particular instance never "states" a generalisation — so the honest control collapsed to 3 of 63
// while the corrupted sets sat at 0: a judge that rejects everything is not a judge. The measured
// driver was the COMPOUNDNESS of the name: a single-claim pattern kept 8 of 10, a two-part name kept
// almost nothing, a four-part name kept 1 of 31.
//
// SO v3 SPLITS THE CLAIM FROM ITS PARTS. A pattern is one claim plus 1 to 3 single predicates, the
// judge rules per part on one quote, and the compound is OUR arithmetic: the quote supports the
// pattern iff every part states with a verbatim span. The parts are rows (need_pattern_parts) with
// their own per-part verdicts (need_pattern_quote_parts), so "which part failed" is answerable from
// the table rather than from a prose reason.
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

/** Rubric v3 (SP-502 / SP-509). Bumped because the CONTRACT changed, not because the wording was
 *  tidied: a pattern is now a claim plus 1–3 single-predicate parts and the judge rules per part, so a
 *  v2 verdict and a v3 verdict answer different questions and must never read as the same judgement.
 *  Earlier rows are superseded, never deleted (D1). */
export const PATTERN_RUBRIC_VERSION = "need-pattern-rubric-v3";
/** SP-531: THE RUBRIC'S JUDGE-RELEVANT STATEMENTS.
 *
 *  What a pattern, a claim and a part ARE, plus the one rule that decides a verdict: a quote supports
 *  when its own words state or show EVERY part, and one customer's instance of a practice states that
 *  practice. A judge shown ONE claim and ONE quote can act on every statement here — the last is
 *  load-bearing and SP-507 depends on it.
 *
 *  The third keeps "Never a subject" although that clause is addressed to a writer: B′1 is a DELETION
 *  of whole statements and nothing else, and splitting a sentence would make it a rewrite. The clause
 *  is inert for a judge, which is why it stays. */
const RUBRIC_JUDGE_LINES = [
  "A PATTERN is the particular thing that keeps happening under a need: ONE CLAIM plus its PARTS.",
  "The CLAIM is one sentence in plain words. The PARTS are 1 to 3 single predicates the claim asserts.",
  "A PART is a PREDICATE — what happens. Never a subject: \"customers\" is not a part.",
  "A quote SUPPORTS a pattern when its own words state or show EVERY part. One customer's instance of a",
  "  practice states that practice; a quote need not repeat the wording.",
];

/** SP-531: THE RUBRIC'S GENERATION-ONLY STATEMENTS — five statements over six entries.
 *
 *  Each is an instruction to whoever WRITES the patterns, and none of them can inform the answer to
 *  "does THIS quote show THIS part". The judge is never choosing a pattern set, never assigning a
 *  polarity and never writing a claim. The coverage preference in particular can only push a per-part
 *  verdict toward yes, which is why `JUDGE_SYSTEM` opening with it was named as a cause of the
 *  leniency SP-527 measured. Kept here because the GENERATOR still needs every one of them. */
const RUBRIC_GENERATION_LINES = [
  "A pattern must be narrower than the need and wider than one quote.",
  "Prefer the FEWEST distinct patterns that cover the MOST quotes. Two sentences describing the same problem are ONE pattern.",
  "NAME THE MECHANISM. A claim says what goes wrong and how — the number, the named rule, the step — not",
  "  a restatement of the need and not a category.",
  "A pattern carries ONE polarity. What is working and what is not working are different patterns.",
  "Never invent a quote, a number, a date or a name.",
];

/** Unchanged: the same eleven entries in the same order. `judge-prompt-md5.ts` is the proof. */
export const PATTERN_RUBRIC_TEXT = [...RUBRIC_JUDGE_LINES, ...RUBRIC_GENERATION_LINES].join("\n");

/** SP-535 (2026-11-21): THE GENERATION LINES, REVISED — and ONLY for the generator.
 *
 *  WHAT CHANGED AND WHY, measured (v3-run2 §6.3–§6.4). "Prefer the FEWEST distinct patterns that
 *  cover the MOST quotes" is an instruction to write a catch-all, and the generator obeyed it: P1's
 *  "Frequent outages occur during regular usage." took 36 of 43 quotes under one claim, and N15 left
 *  17 of 41 quotes unassigned with no account of them at all. A coverage preference rewards one wide
 *  claim and never asks what happened to the rest. It is replaced by an ACCOUNTING requirement, which
 *  is the same pressure pointed the other way: the generator may write as many claims as the evidence
 *  needs, but every quote must be either cited or explained.
 *
 *  WHY THIS IS A SECOND ARRAY AND NOT AN EDIT. `PATTERN_RUBRIC_TEXT` is also the first thing the
 *  JUDGE reads, and this brief's acceptance pins `JUDGE_SYSTEM`'s md5. Editing the shared array in
 *  place would move the live judge prompt, which SP-533 and the OUT-OF-SCOPE both forbid. So the
 *  generator gets its own rubric and the judge's is untouched.
 *
 *  THE CONSEQUENCE, STATED: the JUDGE still reads "Prefer the FEWEST distinct patterns that cover the
 *  MOST quotes". v3-run2 §6.3 named that as a cause of the judge's leniency too, and it is NOT fixed
 *  here. It cannot be, without moving the live prompt. Flagged for the operator, not silently left. */
const RUBRIC_GENERATION_LINES_V2 = [
  "A pattern must be narrower than the need and wider than one quote.",
  "ACCOUNT FOR EVERY QUOTE. Every quote you are given is either cited under a claim or listed in",
  "  \"left_over\" with ONE clause saying why. A quote you cannot place is left over, never ignored.",
  "Two sentences describing the same problem are ONE pattern.",
  "A claim states ONE MECHANISM. If a quote shows one mechanism but not the other, they are TWO claims.",
  "NAME THE MECHANISM. A claim says what goes wrong and how — the number, the named rule, the step — not",
  "  a restatement of the need and not a category.",
  "A pattern carries ONE polarity. What is working and what is not working are different patterns.",
  "Never invent a quote, a number, a date or a name.",
];

/** SP-535: what the GENERATOR reads. The judge-relevant statements are the same five entries in the
 *  same order; only the generation statements differ, and `judge-prompt-md5.ts` prints both. */
export const GENERATOR_RUBRIC_TEXT = [...RUBRIC_JUDGE_LINES, ...RUBRIC_GENERATION_LINES_V2].join("\n");

/** SP-620 (2026-11-24): THE SHARED RUBRIC LINES, COPIED FOR THE ONE-PART GENERATOR ONLY.
 *
 *  `RUBRIC_JUDGE_LINES` is the first thing the JUDGE reads, so one part per claim cannot be said by
 *  editing it: JUDGE_SYSTEM's md5 would move. This is a separate array that the judge never reads.
 *  Three of its five entries differ from the shared ones (the first, the second and the fourth); the
 *  judge's "1 to 3 single predicates" stays true of a claim with one. */
const RUBRIC_JUDGE_LINES_ONEPART = [
  "A PATTERN is the particular thing that keeps happening under a need: ONE CLAIM plus its ONE PART.",
  "The CLAIM is one sentence in plain words. It has exactly ONE PART: the single predicate the claim asserts.",
  "A PART is a PREDICATE — what happens. Never a subject: \"customers\" is not a part.",
  "A quote SUPPORTS a pattern when its own words state or show its part. One customer's instance of a",
  "  practice states that practice; a quote need not repeat the wording.",
];
export const GENERATOR_RUBRIC_TEXT_ONEPART = [...RUBRIC_JUDGE_LINES_ONEPART, ...RUBRIC_GENERATION_LINES_V2].join("\n");

/** SP-469: a CEILING, not a target. 12 rather than 6, so the bound stops a runaway instead of
 *  shaping the answer — and `run_ceiling_hit` records when it bit. */
export const PATTERN_CEILING = 12;
export const MAX_PATTERN_NAME_CHARS = 90;
/** SP-502: 1 to 3 parts, and each part is a short predicate. Both are column constraints too
 *  (need_pattern_parts_ordinal_range, need_pattern_parts_predicate_len), so neither is a request. */
export const MAX_PARTS_PER_PATTERN = 3;
/** SP-620 / SP-627 (2026-11-24): what a generator prompt VARIANT allows — how many parts a claim may
 *  carry, and how many claims one pass may return. A value of the variant, read in every place the
 *  number is used: the prompt text, the whole-answer refusal, the per-claim door and the per-pass cut.
 *  The three measured variants keep 3 and 12. */
export type GenLimits = { maxParts: number; ceiling: number };
export const DEFAULT_GEN_LIMITS: GenLimits = { maxParts: MAX_PARTS_PER_PATTERN, ceiling: PATTERN_CEILING };
/** SP-627: 16 per pass, the largest ceiling that needs no generator setting change (brief 16 §9.5). */
export const ONEPART_CEILING = 16;
export const ONEPART_GEN_LIMITS: GenLimits = { maxParts: 1, ceiling: ONEPART_CEILING };
export const MAX_PART_CHARS = 80;
/** SP-525 (2026-11-21): THE GENERIC-SUBJECT TEST IS REMOVED. There is no `PART_SUBJECT_OPENER`.
 *
 *  WHY, and it is worth keeping because the rule read as obviously right for two briefs. SP-501/SP-502
 *  forbade a part opening with a generic customer subject, on the reasoning that "Customers are
 *  charged twice" is a GENERALISATION where a part should be a PREDICATE. Measured twice, it was never
 *  once right:
 *
 *    - 2026-11-20, N13: it refused NONE of the ten parts the generator actually wrote. Inert.
 *    - 2026-11-21, all five needs: it refused EVERY part on N14 and N15 and killed P1's `mixed` pass.
 *      Two entire needs produced zero patterns — 58 of 156 counted quotes, including the reference's
 *      single strongest finding (N14's "full month charged after cancelling mid-cycle", 10+ of 17).
 *
 *  The PREMISE is what was wrong. N14 and N15 are BILLING needs, and their findings are irreducibly
 *  about what is done TO the customer — "the customer is charged for the full month" IS the predicate,
 *  not a generalisation of one. The re-ask's own advice ("state it as `is charged …`") asks for a
 *  subjectless fragment, and the generator, given it twice, returned "customer is charged for full
 *  month" and was refused again.
 *
 *  WHAT STILL ENFORCES SP-502's REAL TARGET: the compound-part check below. On the same run it fired
 *  twice, split both, and left none standing — the half of SP-515 that works. A part stays bounded by
 *  MAX_PART_CHARS and MAX_PARTS_PER_PATTERN, and the judge answers it per part either way. */

/** ── SP-536 TOMBSTONE (2026-11-21) ───────────────────────────────────────────────────────────────
 *  `COMPOUND_PART_JOINER` and the compound-part CHECK are GONE, the same way SP-525 removed the
 *  generic-subject test. Not retained-and-unused: a gate nothing fires is a gate the next reader
 *  re-implements.
 *
 *  WHAT WAS MEASURED (v3-run2 §6.7): its precision was 2 of 7. It fired on five parts that are single
 *  predicates whose wording happens to contain "and" or "or" — "Customers are charged for services
 *  they did not request or use.", "No proration for unused days or partial months." — spent a re-ask
 *  on each, and kept all five unchanged, because there was nothing to split. The two true positives
 *  it did catch were already bounded by MAX_PART_CHARS and are answered per part by the judge either
 *  way.
 *
 *  WHAT REPLACES IT: `partsWithConjunction()` below, which REPORTS and never gates. Every part whose
 *  wording contains "and" or "or" is listed in the run's report for an operator to read. No re-ask is
 *  spent and no part is refused, dropped or re-written. */
/** SP-543: NEAR-SYNONYM CLAIMS, MEASURED AND NEVER GATED.
 *
 *  SP-537(a) refuses two claims that are byte-identical after normalising, and on run 3 it never
 *  fired once — because the defect that actually occurs is near-synonymy, not repetition. P1 wrote
 *  "Outages are not adequately addressed by customer service", "…not properly resolved by Spectrum"
 *  and "…not properly communicated or resolved by the billing department" as separate claims, three
 *  of them carrying an "X is unresponsive or unhelpful" part.
 *
 *  SP-543 is explicit that this is a MEASUREMENT: a gate here would refuse claims that are genuinely
 *  distinct, and the judge already decides what each claim's evidence supports. So this returns the
 *  pairs and their overlap, for the run's report to print.
 *
 *  The score is Jaccard overlap of CONTENT words — the stop list is the handful of words that carry
 *  no distinction in a claim, so "outages are not resolved by Spectrum" and "outages are not resolved
 *  by the billing department" are seen as near-identical, which they are. */
const CLAIM_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "being", "but", "by", "do", "does", "for", "from",
  "had", "has", "have", "in", "is", "it", "its", "not", "of", "on", "or", "that", "the", "their",
  "them", "there", "these", "this", "to", "was", "were", "when", "which", "with", "without",
]);

function claimWords(claim: string): Set<string> {
  return new Set(
    claim.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter((w) => w && !CLAIM_STOP_WORDS.has(w)),
  );
}

/** Jaccard overlap of two claims' content words, 0 to 1. Two claims with no content word in common
 *  score 0; two that differ only in stop words score 1. */
export function claimOverlap(a: string, b: string): number {
  const x = claimWords(a), y = claimWords(b);
  if (x.size === 0 || y.size === 0) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / (x.size + y.size - shared);
}

/** SP-543's default, chosen BY MEASUREMENT against run 3's P1 group — the case the ruling names.
 *
 *  I first set this to 0.6 and the instrument found nothing, because LEXICAL overlap is not what makes
 *  those claims near-synonymous. Measured on that group: "Outages are not adequately addressed by
 *  customer service" against "…not properly resolved by Spectrum" scores **0.125** — they share only
 *  the word "outages" — and an unrelated pair ("…addressed by customer service" against "Service
 *  credits are not consistently applied") scores **0.125** as well. The highest real pair is 0.429.
 *
 *  So claim overlap cannot separate a near-synonym from an unrelated claim at any threshold, and
 *  0.34 is set only to put the 0.429 pair on the list and keep the 0.125 pairs off it. THE LIST IS
 *  FOR AN EYE, NOT A VERDICT — which is the whole of why SP-543 forbids a gate here. The measurement
 *  that does find run 3's defect is `sharedPartClaims` below. */
export const NEAR_SYNONYM_THRESHOLD = 0.34;

/** SP-543, THE MEASUREMENT THAT FINDS THE DEFECT: two claims in one need that assert the SAME
 *  PREDICATE.
 *
 *  Run 3's P1 wrote `"customer service is unresponsive or unhelpful"` as a part under TWO different
 *  claims, and `"technical support is unresponsive or unhelpful"` under two more. Nothing saw it:
 *  SP-537(a) compares claims, SP-509's identity makes differing parts a different pattern, and the
 *  claims themselves share almost no words. A shared part is lexical, exact, and is the form in which
 *  near-synonymy actually shows up — so it is reported per run beside the claim overlap. */
export function sharedPartClaims(
  patterns: ReadonlyArray<{ name: string; parts: readonly string[] }>,
): Array<{ part: string; claims: string[] }> {
  const byPart = new Map<string, { part: string; claims: string[] }>();
  for (const p of patterns) {
    for (const part of new Set(p.parts.map((x) => normalizeForHash(x)))) {
      const e = byPart.get(part) ?? { part: p.parts.find((x) => normalizeForHash(x) === part) ?? part, claims: [] };
      if (!e.claims.includes(p.name)) e.claims.push(p.name);
      byPart.set(part, e);
    }
  }
  return [...byPart.values()].filter((e) => e.claims.length > 1)
    .sort((a, b) => b.claims.length - a.claims.length);
}

/** Every pair of claims in one need whose overlap is at or above the threshold, most alike first.
 *  Exact duplicates cannot appear: SP-537(a) refuses them before this is reached. */
export function nearSynonymClaims(
  claims: readonly string[],
  threshold = NEAR_SYNONYM_THRESHOLD,
): Array<{ a: string; b: string; overlap: number }> {
  const out: Array<{ a: string; b: string; overlap: number }> = [];
  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      const overlap = claimOverlap(claims[i], claims[j]);
      if (overlap >= threshold) out.push({ a: claims[i], b: claims[j], overlap });
    }
  }
  return out.sort((x, y) => y.overlap - x.overlap);
}

export const CONJUNCTION_IN_PART = /\s\b(and|or)\b\s/i;

/** SP-515(2): every refusal carries its KIND, so the one re-ask can say what to actually fix. The
 *  measured failure: a subject-opener refusal was answered with "shorten the wording", which is the
 *  right advice for the character cap and useless for a subject, so the generator returned the
 *  identical part and the pass died. */
export type RefusalKind =
  | "claim_missing" | "claim_length" | "parts_missing" | "parts_count" | "part_length"
  // SP-525: "generic_subject" is GONE, not retained-and-unused. A kind nothing throws is a kind the
  // next reader re-implements.
  | "polarity" | "citation" | "no_quotes" | "ceiling" | "schema"
  // SP-536: "compound_part" is GONE with the check that earned it. See the tombstone above.
  /** SP-537(a): two patterns in ONE answer may not share a claim. Thrown, hard. */
  | "duplicate_claim"
  /** SP-552 (2026-11-22): the claim's polarity is not the polarity of the pass that produced it, or
   *  not one of its quotes carries that polarity. Named, re-asked and printed — never skipped. */
  | "polarity_mismatch"
  /** SP-620: under the one-part variant a claim carries EXACTLY one part. More than one is refused at
   *  the door and re-asked once (SP-546), with its own guidance. */
  | "one_part";

export class GeneratorRefusal extends Error {
  constructor(readonly kind: RefusalKind, message: string) {
    super(message);
    this.name = "GeneratorRefusal";
  }
}

/** What to tell the generator, per refusal kind. One place, so a new refusal cannot be added without
 *  deciding what the re-ask should say. */
export const REASK_GUIDANCE: Record<RefusalKind, string> = {
  claim_missing: "Give each pattern a `claim`: ONE sentence naming the mechanism.",
  claim_length: `Shorten the claim to at most ${MAX_PATTERN_NAME_CHARS} characters. Keep the particulars — the number, the named rule, the step. Do not generalise it.`,
  parts_missing: `Give each pattern a \`parts\` array: 1 to ${MAX_PARTS_PER_PATTERN} single predicates.`,
  parts_count: `Use at most ${MAX_PARTS_PER_PATTERN} parts. Merge or drop the weakest, do not widen the claim.`,
  part_length: `Shorten the over-long part to at most ${MAX_PART_CHARS} characters. Keep what happens; drop the wording around it.`,
  polarity: `Give each pattern a \`polarity\` of exactly "not working", "working" or "mixed".`,
  citation: "Cite only the quote labels you were given (q1, q2, ...). Never an id, a uuid or a label that was not in your input.",
  no_quotes: "Every pattern must cite at least one quote label from its input.",
  ceiling: `Return at most ${PATTERN_CEILING} patterns. Merge near-synonyms rather than listing both.`,
  schema: "Answer with the JSON object exactly as specified, and nothing else.",
  polarity_mismatch:
    "This answer is about ONE polarity only, and it is named in your instructions. Give every pattern that " +
    "polarity, and cite only quotes carrying it. If the quotes you cited describe the opposite, write the " +
    "pattern about what those quotes DO say, under the polarity this pass asked for.",
  one_part:
    "Give this claim exactly ONE part: the single predicate the claim asserts. If the claim asserts two " +
    "things, keep the one most of its quotes state, cite only the quotes that state it, and drop the other. " +
    "Do not join two predicates with \"and\" or \"or\".",
  duplicate_claim: "Two patterns carry the SAME claim. Either they are one pattern — merge them and cite both sets of quotes — or they are two mechanisms, in which case give each its own claim naming its own mechanism.",
};

/** SP-627: the re-ask guidance for a refusal kind UNDER A VARIANT'S LIMITS — the ceiling's text names
 *  the variant's own number, not 12. Every other kind reads `REASK_GUIDANCE` unchanged. */
export function reaskGuidance(kind: string, limits: GenLimits = DEFAULT_GEN_LIMITS): string {
  if (kind === "ceiling" && limits.ceiling !== PATTERN_CEILING) return `Return at most ${limits.ceiling} patterns. Merge near-synonyms rather than listing both.`;
  return REASK_GUIDANCE[kind as RefusalKind] ?? "";
}

/** SP-628 (2026-11-24): "and" / "or" INSIDE A PART — CHECKED, PRINTED, RE-ASKED ONCE, NEVER DROPPED.
 *
 *  Under one part per claim, a conjunction is where a two-part claim hides: run 9's first N13 answer
 *  carried seven such parts ("the call is disconnected during transfer or conversation"). The rule is
 *  SP-581's: the claim gets ONE re-ask that names the part, and whatever comes back, the claim is
 *  never dropped for it — a rewrite that parses and no longer joins two things replaces the claim; an
 *  answer that is refused, unchanged or still joined leaves the ORIGINAL standing. The word test is
 *  `CONJUNCTION_IN_PART`; it cannot tell two predicates from two adjectives, so the re-ask says what
 *  to do in either case. This is a message of the runner, not part of any system prompt. */
export const PART_CONJUNCTION_KIND = "part_conjunction";
export function partConjunctionWhy(part: string): string {
  return `the part joins two things with "and" or "or": ${JSON.stringify(part)}`;
}
export const PART_CONJUNCTION_GUIDANCE =
  "A part is ONE predicate. Rewrite the part so it states one thing — the one most of this claim's quotes " +
  "state — and cite only the quotes that state it. If the word does not join two separate things, return " +
  "the claim unchanged.";
export type ConjunctionOutcome = "rewritten" | "unchanged" | "still_joined" | "refused";
/** SP-628: what the one re-ask did. `adopt` is true only for a rewrite whose part no longer joins two
 *  things; in every other case the original claim stands. */
export function conjunctionReaskOutcome(original: ProposedPattern, reasked: ProposedPattern | null): { outcome: ConjunctionOutcome; adopt: boolean } {
  if (!reasked) return { outcome: "refused", adopt: false };
  if (reasked.parts.some((p) => CONJUNCTION_IN_PART.test(p))) {
    const same = normalizeForHash(reasked.name) === normalizeForHash(original.name) && reasked.parts.join("\u0000") === original.parts.join("\u0000");
    return { outcome: same ? "unchanged" : "still_joined", adopt: false };
  }
  return { outcome: "rewritten", adopt: true };
}

/** SP-536: every part whose wording contains "and" or "or", FOR THE REPORT ONLY.
 *
 *  This is not a gate and must never become one. Its output goes in the run's report so an operator
 *  can read the list and judge; nothing in the pipeline branches on it. */
export function partsWithConjunction(patterns: readonly ProposedPattern[]): Array<{ name: string; ordinal: number; part: string }> {
  const out: Array<{ name: string; ordinal: number; part: string }> = [];
  for (const p of patterns) {
    p.parts.forEach((part, i) => {
      if (CONJUNCTION_IN_PART.test(part)) out.push({ name: p.name, ordinal: i + 1, part });
    });
  }
  return out;
}
/** SP-551 (2026-11-22): THE CEILING FILLS IN TURN ACROSS THE POLARITY PASSES.
 *
 *  WHAT IT COST BEFORE. The runner did `candidates.slice(0, PATTERN_CEILING)` over a flat list built
 *  pass by pass, with the passes walked largest-first (SP-470). On N13 that is 37 'not working' quotes
 *  before 4 'working' and 3 'mixed', so the not-working pass alone proposed 12 claims and filled the
 *  ceiling — and N13's ENTIRE working pass was cut before a single judge call, with no line of output
 *  saying so. The quote `e7397c95` ("online support and the app reduce trouble") was found, written as
 *  its own claim, and deleted by an array slice. A positive finding that the generator produced and
 *  nothing judged is the worst of both: we paid for it and cannot see it.
 *
 *  ROUND-ROBIN, in the passes' own order, each pass keeping its own order (most-evidenced first, as the
 *  prompt asks for). So a pass with one claim is never starved by a pass with twelve, and the thing
 *  that is cut is a 12th 'not working' claim rather than the only 'working' one.
 *
 *  It returns the CUT claims too, because SP-551 requires every one of them printed: a ceiling that
 *  silently deletes is the defect, not the ceiling itself. */
export function fillCeiling<T>(
  passes: ReadonlyArray<ReadonlyArray<T>>,
  ceiling: number,
): { kept: T[]; cut: T[] } {
  const kept: T[] = [];
  const cut: T[] = [];
  const longest = passes.reduce((m, p) => Math.max(m, p.length), 0);
  for (let round = 0; round < longest; round++) {
    for (const pass of passes) {
      if (round >= pass.length) continue;
      (kept.length < ceiling ? kept : cut).push(pass[round]);
    }
  }
  return { kept, cut };
}

/** SP-557 (2026-11-22): THE CEILING IS PER POLARITY PASS, NOT PER NEED.
 *
 *  WHAT SP-551'S CROSS-PASS FILL COST. Run 6 cut 4 of N13's claims, all four from the `not working`
 *  pass, and one of them was `AI tools fail to connect customers to live support` — the claim that
 *  answered SP-462 check (d). The round-robin did exactly what SP-551 asked (it saved the `working`
 *  and `mixed` passes, and `e7397c95`'s claim with them) and the price was a reference finding from
 *  the pass that had the most evidence. A per-need ceiling makes the three polarities compete for one
 *  budget, and there is no reason they should: they are answers to three different questions.
 *
 *  WHAT HAPPENED TO SP-551's IN-TURN FILL. `fillCeiling` is KEPT and is still the thing that applies
 *  the ceiling — this function calls it once per pass, with that pass as the only pass. So the
 *  round-robin is still the implementation (and still tested), it simply has nothing to interleave:
 *  one pass in, one pass out, the pass's own order preserved, the overflow returned as `cut`. Nothing
 *  was deleted, and if a later ruling puts the passes back on one budget, `fillCeiling(passes, n)` is
 *  the call that does it.
 *
 *  Every cut claim is still returned, because SP-551's other half — print every one — stands. */
export function applyCeilingPerPass<T>(
  passes: ReadonlyArray<ReadonlyArray<T>>,
  ceiling: number,
): { kept: T[]; cut: T[]; perPass: Array<{ kept: number; cut: number }> } {
  const kept: T[] = [];
  const cut: T[] = [];
  const perPass: Array<{ kept: number; cut: number }> = [];
  for (const pass of passes) {
    const one = fillCeiling([pass], ceiling);
    kept.push(...one.kept);
    cut.push(...one.cut);
    perPass.push({ kept: one.kept.length, cut: one.cut.length });
  }
  return { kept, cut, perPass };
}

/** SP-552 (2026-11-22): A CLAIM WHOSE POLARITY IS NOT ITS PASS'S IS REFUSED BY NAME, NEVER SKIPPED.
 *
 *  WHAT IT COST BEFORE. The runner read `const own = c.signalIds.filter(...); if (own.length === 0)
 *  continue;` — a bare `continue`, with no counter and no line. Brief 6 measured it firing on N13's
 *  `mixed` pass: the generator wrote a sound claim over the three mixed quotes and labelled it
 *  `"polarity": "not working"`, so every one of its quotes was "another polarity's" and the claim
 *  vanished. The run's output showed the mixed pass generating and then nothing at all.
 *
 *  Two distinct failures, one kind, each measured in its message:
 *    1. the claim's own `polarity` field is not the pass's — a mislabelling, the N13 case;
 *    2. the claim's polarity is right but not one of its cited quotes carries that polarity — which
 *       inside a per-polarity pass means it cited across the group, which it cannot do, so this arm is
 *       a floor rather than a filter and has never fired.
 *  Both earn the SP-546 re-ask, because both are things the generator can fix in one answer. */
export function polarityRefusal(
  p: { name: string; polarity: QuotePolarity; signalIds: readonly string[] },
  passPolarity: QuotePolarity,
  polarityOf: (signalId: string) => QuotePolarity | null,
): GeneratorRefusal | null {
  if (p.polarity !== passPolarity) {
    return new GeneratorRefusal(
      "polarity_mismatch",
      `the pattern's polarity is ${JSON.stringify(p.polarity)}, but this answer is the ${JSON.stringify(passPolarity)} pass ` +
        `and every pattern in it must carry that polarity`,
    );
  }
  const own = p.signalIds.filter((id) => polarityOf(id) === passPolarity);
  if (own.length === 0) {
    const carried = [...new Set(p.signalIds.map((id) => polarityOf(id) ?? "unlabelled"))];
    return new GeneratorRefusal(
      "polarity_mismatch",
      `the pattern cites ${p.signalIds.length} quote(s) and none of them carries this pass's polarity ` +
        `${JSON.stringify(passPolarity)} (they carry: ${carried.join(", ")})`,
    );
  }
  return null;
}

export const PATTERN_NUM_PREDICT = 2_400;
/** One quote per judge call, so its output is tiny and its latency is mostly the prompt's.
 *
 *  RAISED 200 → 400 (SP-517, measured 2026-11-20). llama3:70b emits ~180 tokens and stops, and parsed
 *  cleanly on 130 of 130 calls at 200. qwen3.6:35b writes much longer `reason` strings: most of its
 *  answers also finish inside 200 (179 tokens, measured), but one of the corruption pair's quotes drew
 *  an answer that was CUT mid-array — `Expected ',' or ']' after array element` — which is the SP-F43
 *  shape, a silently truncated answer. 400 is headroom, not a target: a model that stops naturally at
 *  180 is unaffected by the ceiling above it, which is why this does not change llama3's verdicts (and
 *  that was re-measured, not assumed). */
/** SP-555 (2026-11-22): RAISED 400 → 4,000, because the judge of record is now a THINKING model.
 *
 *  `message.thinking` and `content` share this one budget (ollama counts them together in
 *  `eval_count`), and SP-554's capability check measured 1,806 generated tokens on one judge call —
 *  ~1,704 of thinking for ~90 of answer. 400 would spend the whole budget before the answer began,
 *  which is SP-517's empty-`content` failure, not a cut answer. 4,000 is roughly 2.2× the median need
 *  and still not enough for the tail: 8 of 146 groups came back empty at this budget in run 6, which
 *  is what SP-556's retry is for.
 *
 *  It stays a CEILING, not a target: llama3:70b stops naturally at ~180 tokens, so this does not
 *  change its verdicts (re-measured under SP-517, not assumed), and the non-thinking shadow and
 *  comparison instruments that read this constant are unaffected for the same reason. */
export const JUDGE_NUM_PREDICT = 4_000;
/** SP-556 (2026-11-22): the budget for the ONE retry an empty answer earns. 8,000 — double the first
 *  attempt, because an answer that spent 4,000 tokens thinking and said nothing is one that needs room
 *  to finish, not a different question. If this is empty too, the pair fails closed and is NAMED. */
export const JUDGE_NUM_PREDICT_RETRY = 8_000;
/** SP-555: thinking is ON for the pattern judge of record. Named here rather than defaulted in the
 *  runner so the instruments that re-run SP-500 and SP-516 read the same call shape from one place. */
export const PATTERN_JUDGE_THINK = true;

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
  /** SP-502: the one sentence. Stored as need_patterns.name, so every existing reader keeps working. */
  name: string;
  /** SP-502: 1 to 3 single predicates the claim asserts. The judge rules on these, not on the claim. */
  parts: string[];
  polarity: QuotePolarity;
  signalIds: string[];
  /** SP-475(c): the generator's own pick of the quote that best fits the claim. */
  representativeSignalId: string | null;
  /** SP-535: the LABELS this pattern cited, kept so the accounting can be done in label space. The
   *  signal ids alone cannot do it: two labels in one pass may map to the same signal id. */
  citedLabels: string[];
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
export async function patternIdentity(needId: string, name: string, parts: readonly string[] = []): Promise<string> {
  // SP-509: the identity covers the PARTS as well as the claim — two patterns with the same claim and
  // different parts are different patterns. Sorted, so the generator reordering its own parts is not a
  // new pattern. TypeScript only (PCT-1); never computed in SQL.
  const partKey = [...parts].map(normalizeForHash).sort().join("\u0000");
  return await sha256Hex(`${PATTERN_RUBRIC_VERSION}\u0000${needId}\u0000${normalizeForHash(name)}\u0000${partKey}`);
}

/** SP-541: THE TWO GENERATOR PROMPTS, BOTH SELECTABLE.
 *
 *  "old" is the prompt runs 1 and 2 used (pre-SP-535): it carries `PATTERN_RUBRIC_TEXT`, whose
 *  generation lines include "Prefer the FEWEST distinct patterns that cover the MOST quotes" and
 *  "Merging two near-synonymous patterns into one is always better than listing both", and it asks
 *  for no account of the unplaced quotes.
 *
 *  "new" is SP-535's: its own `GENERATOR_RUBRIC_TEXT` (the same judge lines, generation lines
 *  replaced by the accounting requirement and "a claim states ONE MECHANISM"), and a `left_over`
 *  array in the JSON shape.
 *
 *  NOTHING IS REWORDED HERE (SP-541 forbids it). The two strings are the two prompts that have
 *  already been run, and `GENERATOR_SYSTEM` stays the "new" one so the default does not move.
 *  `GENERATOR_SYSTEM_OLD`'s md5 is pinned by `scripts/judge-prompt-md5.ts` against the value run 2
 *  recorded, which is what proves this is run 2's prompt and not a reconstruction of it. */
/** SP-547 adds a THIRD variant. "new547" is "new" plus the `belongs_to` field — the generator cannot
 *  carry a structured field nobody asked it for, so the ruling implies this one prompt change. "new"
 *  keeps its exact bytes (md5 `0528425f894eb5cfed208430e7ba2262`) so brief 5's four arms stay
 *  comparable, and "old" keeps run 2's. */
export type GenPromptVariant = "old" | "new" | "new547" | "onepart";

function generatorSystem(variant: GenPromptVariant): string {
  const isNew = variant !== "old";
  // SP-620 / SP-621 / SP-626 / SP-627: the one-part variant. It is `new547` with the exact
  // replacements brief 16 drafted as variant B, the SP-626 sentence, and its own ceiling.
  const one = variant === "onepart";
  const is547 = variant === "new547" || one;
  return [
    one ? GENERATOR_RUBRIC_TEXT_ONEPART : isNew ? GENERATOR_RUBRIC_TEXT : PATTERN_RUBRIC_TEXT,
    "",
    "You are given ONE customer need and the quotes already judged to bear on it. Each quote carries its",
    "own polarity: 'not working' (the outcome is being missed), 'working' (it is being met) or 'mixed'.",
    "",
    "STAY INSIDE THE NEED. The claim states the problem under THIS need. Another need's problem may appear",
    ...(one
      ? [
        "only as context, never as the claim. If a quote is really about another need's problem — for a",
        "need about delivery times, a quote that is really about the price — leave that quote out rather than",
        "widening the claim to fit it.",
        // SP-626, word for word.
        "A quote may be about several things. Cite it under a claim when ANY part of it states that claim's part; its other topics are not a reason to leave it out.",
      ]
      : [
        "only as context, never as the claim. If a quote is really about billing and the need is about",
        "contacting support, leave that quote out rather than widening the claim to fit it.",
      ]),
    "",
    ...(isNew
      ? [
        `Return at most ${one ? ONEPART_CEILING : PATTERN_CEILING} patterns, most-evidenced first. Write as many claims as the`,
        "evidence needs — a second mechanism is a second claim, not a wider first one.",
      ]
      : [
        `Return at most ${PATTERN_CEILING} patterns, most-evidenced first, but return FEWER if fewer cover the`,
        "quotes. Merging two near-synonymous patterns into one is always better than listing both.",
      ]),
    "",
    `Each pattern: "claim" is ONE sentence of at most ${MAX_PATTERN_NAME_CHARS} characters that NAMES THE`,
    "MECHANISM — what goes wrong and how, with the number, the named rule or the step in it. Do not",
    "restate the need and do not name a category.",
    ...(one
      ? [
        `"parts" is a list holding exactly ONE PREDICATE of at most ${MAX_PART_CHARS} characters: the one thing the claim`,
        'asserts. A predicate is what happens — "the order ships without its invoice", "the parcel arrives a',
        'week late". NEVER a subject: "customers" is not a part. If a claim would need two predicates, it is',
        "TWO claims: write each as its own claim, with its own one part and its own quotes.",
      ]
      : [
        `"parts" is 1 to ${MAX_PARTS_PER_PATTERN} single PREDICATES the claim asserts, each at most ${MAX_PART_CHARS}`,
        'characters. A predicate is what happens — "the final month is billed in full", "the agent does not',
        'resolve the problem". NEVER a subject: "customers" is not a part. Split a compound claim into its',
        "predicates; a claim that asserts one thing has one part.",
      ]),
    '"polarity" is one of "not working", "working", "mixed", and every quote you cite must carry it.',
    "Produce positive and mixed patterns separately from negative ones.",
    one
      ? '"quotes" lists the LABELS (q1, q2, ...) of the quotes whose own words state or show that part.'
      : '"quotes" lists the LABELS (q1, q2, ...) of the quotes whose own words state or show EVERY part.',
    '"representative" is the ONE label that best fits the claim. Use a different representative for every',
    "pattern — no label may be the representative of two patterns.",
    "",
    ...(isNew
      ? [
        "",
        'ACCOUNT FOR EVERY QUOTE (SP-535). "left_over" lists every label you did NOT cite under any claim,',
        one
          ? 'each with ONE clause saying why — "about another need, not this one", "a single incident, no pattern",'
          : 'each with ONE clause saying why — "about billing, not this need", "a single incident, no pattern",',
        '"too vague to place". Every label you were given appears exactly once: cited under a claim, or in',
        '"left_over". Do not leave a quote out of both and do not put a cited quote in "left_over" as well.',
        ...(is547
          ? [
            'Each "left_over" entry also carries "belongs_to": the NUMBER of the claim in your own "patterns"',
            'list (1 for the first, 2 for the second, ...) that the quote does belong under, or null if it',
            one
              ? 'belongs under none. Use a number only if the quote\'s own words state that claim\'s part —'
              : 'belongs under none. Use a number only if the quote\'s own words state EVERY part of that claim —',
            'the quote is then cited under it and judged exactly like your other citations. If your reason is',
            'that another claim already covers the quote, name that claim here as a number; do not write it',
            'in the reason text.',
          ]
          : []),
        "",
      ]
      : []),
    "Copy each label exactly as given. Never write an id, a uuid, or a label that was not given to you.",
    'JSON only: {"patterns":[{"claim":"<=90 chars","parts":["<predicate>"],"polarity":"not working",',
    ...(isNew
      ? [
        '  "quotes":["q1","q4"],"representative":"q1"}],',
        is547
          ? '  "left_over":[{"quote":"q7","why":"<one clause>","belongs_to":null}]}'
          : '  "left_over":[{"quote":"q7","why":"<one clause>"}]}',
      ]
      : ['  "quotes":["q1","q4"],"representative":"q1"}]}']),
  ].join("\n");
}

/** Run 2's generator prompt, pre-SP-535. */
export const GENERATOR_SYSTEM_OLD = generatorSystem("old");
/** SP-535's generator prompt, as runs 3 and 4 used it. Its md5 is pinned: brief 5's measurement of
 *  arm D rests on these exact bytes. */
export const GENERATOR_SYSTEM_NEW = generatorSystem("new");
/** SP-547: G-new plus the `belongs_to` field. */
export const GENERATOR_SYSTEM_NEW547 = generatorSystem("new547");
/** SP-620 / SP-626 / SP-627: one part per claim, ceiling 16. A MEASUREMENT variant, reachable only
 *  through `--gen-prompt=onepart`; the live `GENERATOR_SYSTEM` below is still `new547`. */
export const GENERATOR_SYSTEM_ONEPART = generatorSystem("onepart");
/** SP-544 + SP-547 (2026-11-22): THE DEFAULT GENERATOR PROMPT. SP-544 adopts G-new; SP-547 adds the
 *  one field it asks for, so the live prompt is G-new plus `belongs_to` and nothing else — the diff
 *  between `GENERATOR_SYSTEM_NEW` and this is exactly SP-547's clause and the JSON shape. */
export const GENERATOR_SYSTEM = GENERATOR_SYSTEM_NEW547;

/** SP-475(d) + SP-494 + SP-510 (judge A): ONE CALL PER QUOTE, A VERDICT PER PART.
 *
 * WHY THE SHAPE CHANGED AGAIN. v2.2 asked the negative question over a whole compound pattern, and a
 * strict reader answered it literally: a particular never "states" a generalisation, so the honest
 * control fell to 3 of 63 while the corruption sets went to 0. The parts make the question small
 * enough to answer — "does this quote show THIS predicate" — and the compound is then OUR arithmetic:
 * the quote supports the pattern iff every part states, each with a verbatim span.
 *
 * SP-510 chose A (one call per quote, verdict per part) over B (one call per part per quote): 196 calls
 * for the five needs against ~390–588, and it keeps SP-475(d)'s one-quote-per-call, which is what
 * removed the coupling v2's honest control exposed. B's argument — a part's verdict cannot bleed into
 * its neighbour's — is real, and SP-510 keeps it in reserve: if the SP-507 check fails under A, B runs
 * on N13 alone and the comparison is reported.
 *
 * SP-493 rides on the same call: `belongs_to_this_need` is a verdict about the PATTERN, not the quote,
 * so a false from any quote's call rejects the pattern. */
/** SP-531: everything the judge is told AFTER the rubric. Extracted so the live prompt and each
 *  measurement arm are the SAME body over a different rubric — a B′ arm cannot drift from the live
 *  prompt in any way except the lines it is defined to drop. */
const JUDGE_BODY = [
  "You are given ONE need, ONE claim with its numbered PARTS, and ONE quote.",
  "",
  "For EACH part, decide whether the quote's own words state or SHOW it. A quote that describes a",
  "specific INSTANCE of a part states that part; it does not have to repeat the wording (\"they hung up",
  'on me twice" shows "the agent dismisses the customer"). A quote about a DIFFERENT problem shows nothing.',
  "",
  'For each part return "states" and, when it is true, "span": the EXACT WORDS of the quote that show it —',
  "copied character for character from the quote, never a paraphrase and never your own words.",
  "",
  'Also answer "belongs_to_this_need": false if the CLAIM states a different need\'s problem than the need',
  "given. That is a judgement about the claim, not about this quote.",
  "",
  "Do not judge how strong the pattern is and do not name a strength.",
  'JSON only: {"parts":[{"ordinal":1,"states":true,"span":"<verbatim>","reason":"<short>"}],',
  '  "belongs_to_this_need":true,"reason":"<one short clause>"}',
];

/** THE PROMPT THAT WAS LIVE UNTIL SP-545 (2026-11-22): the same rubric then the same body, in the
 *  same order. `md5 48cd11f4a06e3e5ae1d3519ff17a4412`, 27 lines, 1895 chars — the value every report
 *  from brief 1 to brief 5 recorded as the live judge, which is why it keeps a name of its own
 *  instead of being reconstructed later from a diff. Every arm that was measured against "live"
 *  means THIS string, and `--system=pre545` still asks it. */
export const JUDGE_SYSTEM_PRE545 = [PATTERN_RUBRIC_TEXT, "", ...JUDGE_BODY].join("\n");

/** SP-531(B′1), MEASUREMENT ONLY. The live prompt with the five generation-only rubric statements
 *  REMOVED and NOTHING added. Reachable only through `judgeAWithReask({ system })`, which the runner
 *  never passes. */
export const JUDGE_SYSTEM_BPRIME1 = [RUBRIC_JUDGE_LINES.join("\n"), "", ...JUDGE_BODY].join("\n");

/** SP-527(B), MEASUREMENT ONLY (2026-11-21). The tightened judge instruction, as a SEPARATE constant.
 *
 *  `JUDGE_SYSTEM` above is the live prompt and this brief does not change it. This exists so the cure
 *  can be measured against the same bars before anyone adopts it, and it is reachable only through
 *  `judgeAWithReask({ system })`, which the runner never passes.
 *
 *  WHAT IT TARGETS, measured: on the five-need run llama3:70b kept 52 (quote, part) verdicts the
 *  shadow refused against 3 the other way, and on P1's part `outages happen multiple times a week` it
 *  gave the reason "specific instance of outage" on NINE of eighteen — answering whether the quote
 *  shows AN outage, not whether it shows outages at that rate. The same shape appears on duration in
 *  SP-500: a start time ("after midnight") and a window ("during business hours") read as "lasts for
 *  hours".
 *
 *  The fourth bullet is deliberate and is NOT a softening. qwen3.6:35b, the stricter reader, rejected
 *  "a nightly occurrence" for `multiple times a week` on the grounds that they are "distinct
 *  frequencies" — nightly ENTAILS weekly, and a cure that only tightens would import that error. */
/** SP-531: cure B's four bullets, extracted so B′2 is provably "B′1 plus cure B" and not a retyping. */
const TIGHTENED_BULLETS = [
  "A QUANTITY NAMED IN THE PART MUST BE SHOWN BY THE QUOTE, NEVER INFERRED FROM IT.",
  "- If the part says HOW OFTEN (frequently, repeatedly, multiple times a week, every month), ONE",
  '  incident does not state it. The quote must show recurrence itself: a count above one, a rate, or',
  '  words like "every time", "constantly", "weekly", "nightly", "again and again".',
  '- If the part says HOW LONG (for hours, all day, lasts for days), a START TIME ("after midnight"),',
  '  a TIME WINDOW ("during business hours") and a FREQUENCY ("almost weekly") do NOT state it. The',
  "  quote must show the duration itself.",
  '- A quantity LARGER than the part names is still a yes: "nightly" states "multiple times a week";',
  '  "two days without service" states "lasts for hours".',
  '- When the quote shows the KIND of thing but not the QUANTITY the part names, answer "states": false.',
];

/** CURE B. Unchanged by SP-531 or SP-545 — the pre-545 prompt plus the four bullets, in that order,
 *  so its md5 (`ea00edaeee4f5c4e4b59e4b859e116d3`) is the same string every brief measured. It is
 *  defined over `JUDGE_SYSTEM_PRE545` rather than over `JUDGE_SYSTEM`, because `JUDGE_SYSTEM` IS this
 *  constant from SP-545 on and the self-reference would be a different prompt. */
export const JUDGE_SYSTEM_TIGHTENED = [JUDGE_SYSTEM_PRE545, "", ...TIGHTENED_BULLETS].join("\n");

/** THE LIVE JUDGE PROMPT, SP-545 (2026-11-22): **cure B**.
 *
 *  Adopted on its own measurement and not on its promise. The condition SP-545 names is the SP-500
 *  corruption pair on EVERY pair at `--scope=all` — INVENTED 0, SWAPPED ≤1, (a) ≤10% — and cure B
 *  returned INVENTED **0 of 41**, SWAPPED **0 of 41**, (a) **0 of 41 = 0%** (124 ledgered calls,
 *  2026-11-21 23:51; all 19 honest rejections classified by hand in brief 6 §5c). SP-519's model
 *  choice stands: the judge is `llama3:70b`.
 *
 *  ITS KNOWN DEFECT, recorded with the adoption rather than discovered later: cure B keeps three
 *  quotes whose spans its own bullets list as non-answers — `74f316d3` "during business hours",
 *  `df1a2042` "had to rest my box almost weekly" and `c32c9015` "30 seconds". SP-500 has no leniency
 *  bar, so they did not block adoption; brief 6 §12's hand check measures them directly.
 *
 *  `deno run -A scripts/judge-prompt-md5.ts` prints every constant's md5 and is the proof of which
 *  string is live. */
export const JUDGE_SYSTEM = JUDGE_SYSTEM_TIGHTENED;

/** SP-531(B′2), MEASUREMENT ONLY. B′1 plus cure B's bullets: the generation-only statements removed
 *  AND the quantity rule added. The two arms differ by exactly `TIGHTENED_BULLETS`. */
export const JUDGE_SYSTEM_BPRIME2 = [JUDGE_SYSTEM_BPRIME1, "", ...TIGHTENED_BULLETS].join("\n");

/** SP-534 (2026-11-21), MEASUREMENT ONLY. Cure C's four rules, as the operator signed them.
 *
 *  WHY, measured (v3-judge-bprime §8): under cure B five keeps on P1's rate part remained, and all
 *  five answered a RATE with a frequency WORD ("often", "frequent signal loss", "spotty service for
 *  weeks") or with a rate BELOW the part's ("3rd outage this month"). Under the live prompt twelve of
 *  fifteen extra keeps were reasoned as "a specific instance". Cure B's bullets say one incident does
 *  not state a rate; these four say what DOES, and name the rubric clause that licenses the slip.
 *
 *  Rule 4 is the one that touches the rubric: the live line "One customer's instance of a practice
 *  states that practice" is correct for a practice ("they hung up on me") and is the licence the
 *  judge used to answer a rate with an instance. It is SCOPED here, not removed — SP-533 closed B′,
 *  which removed rubric lines and did not cure the leniency. */
const CUREC_RULES = [
  "HOW A RATE OR A DURATION IS SHOWN — these four rules override any reading above.",
  "- A part that states a RATE is shown only by words giving a COUNT and a PERIOD at or above that",
  "  rate. \"21 times in 2 weeks\", \"nightly\", \"every day\" state \"multiple times a week\";",
  "  \"often\", \"frequent\", \"spotty for weeks\", \"keeps going out\" do NOT — they name no period.",
  "- A part that states a DURATION is shown only by a stated LENGTH OF TIME.",
  "- ONE INCIDENT NEVER SHOWS A RATE.",
  "- \"One customer's instance of a practice states that practice\" applies to PRACTICE parts only —",
  "  what the company or its agents do. It NEVER applies to a rate part or a duration part.",
];

/** SP-534, MEASUREMENT ONLY. Cure B plus cure C's four rules, so cure C is provably "cure B plus the
 *  rules" and not a retyping. The live `JUDGE_SYSTEM` is untouched by this constant existing. */
export const JUDGE_SYSTEM_CUREC = [JUDGE_SYSTEM_TIGHTENED, "", ...CUREC_RULES].join("\n");

/** SP-609: the four things an answer can hold in `belongs_to_this_need`, plus `not_asked` for judge B
 *  (SP-510), which is given one part at a time and is never asked about the claim. */
export type BelongsField = "true" | "false" | "missing" | "non_boolean" | "not_asked";

/** SP-609: reads the field off the PARSED answer. A key that is absent is `missing`; a key that is
 *  present with anything but a JSON boolean (null, "true", 1) is `non_boolean`. Both read as "not this
 *  need's" under SP-566 — this says which it was, and decides nothing. */
export function belongsFieldOf(parsed: unknown): BelongsField {
  if (!parsed || typeof parsed !== "object" || !("belongs_to_this_need" in parsed)) return "missing";
  const raw = (parsed as { belongs_to_this_need?: unknown }).belongs_to_this_need;
  if (raw === true) return "true";
  if (raw === false) return "false";
  return "non_boolean";
}

/** SP-609: the three fields `--pairs-json` carries for every judged pair. */
export function pairBelongsFields(v: Pick<JudgeVerdict, "belongsToNeed" | "belongsField" | "reason">): {
  belongs_to_this_need: boolean; belongs_field: BelongsField; belongs_reason: string;
} {
  return { belongs_to_this_need: v.belongsToNeed, belongs_field: v.belongsField, belongs_reason: v.reason };
}

/** SP-609: why a claim is not in the kept set. `sp493` — the judge ruled the claim another need's;
 *  `kept_0` — it was judged and no quote stated every part; `cited_nothing` — it reached the judge loop
 *  with no quote to judge; `ceiling` — cut by the per-pass ceiling (SP-557), never judged;
 *  `generator_refused` — refused at the door on its own account (SP-542), never judged.
 *  SP-618(c): `duplicate` — identical (claim + parts) to a pattern the need already carries, merged or
 *  dropped; `answer_refused` — its whole answer was refused at the envelope; and the two REPLACED
 *  classes: `replaced_by_reask` — refused on its own account and its one re-ask returned the claim that
 *  stands in its place; `reask_not_adopted` — written by an accounting re-ask, whose claims are never
 *  taken (SP-618(b)). */
export type ClaimDropClass = "sp493" | "kept_0" | "cited_nothing" | "ceiling" | "generator_refused"
  | "duplicate" | "answer_refused" | "replaced_by_reask" | "reask_not_adopted";
export const REPLACED_CLASSES: ReadonlySet<ClaimDropClass> = new Set<ClaimDropClass>(["replaced_by_reask", "reask_not_adopted"]);

/** SP-609: the class of a drop, from the reason the runner already records for it. An unknown reason
 *  THROWS: a drop the comparison cannot class must not be filed under a class it does not belong to. */
export function claimDropClass(dropReason: string): ClaimDropClass {
  if (/^SP-493:/.test(dropReason)) return "sp493";
  if (/^judge kept 0 of \d+$/.test(dropReason)) return "kept_0";
  if (dropReason === "cited nothing") return "cited_nothing";
  if (dropReason === "ceiling") return "ceiling";
  if (/^generator refused: /.test(dropReason)) return "generator_refused";
  if (/^duplicate: /.test(dropReason)) return "duplicate";
  if (/^answer refused: /.test(dropReason)) return "answer_refused";
  if (/^replaced by its re-ask: /.test(dropReason)) return "replaced_by_reask";
  if (/^accounting re-ask: /.test(dropReason)) return "reask_not_adopted";
  // SP-628: a conjunction re-ask whose answer was not taken — the original claim stands.
  if (/^re-ask not adopted: /.test(dropReason)) return "reask_not_adopted";
  throw new Error(`claimDropClass: no class for the drop reason ${JSON.stringify(dropReason)}`);
}

/** SP-609: one claim's outcome, as `--pairs-json` carries it under `claims`. `pattern_identity` is null
 *  only for a claim that never became a pattern.
 *  SP-618(c): `outcome` is three-valued — a REPLACED claim is neither kept nor dropped on its merits —
 *  and `answer` names the generator answer that wrote the claim (`gen-1`, `account-reask`,
 *  `decomp-5`, …), so "claims written = kept + dropped + replaced" can be checked PER ANSWER. */
export type ClaimOutcome = {
  need: string; polarity: string; claim: string; pattern_identity: string | null; parts: string[];
  rewrite_of: string | null;
  outcome: "kept" | "dropped" | "replaced"; drop_class: ClaimDropClass | null; drop_reason: string;
  /** quotes up for judging · verdicts returned · verdicts that state every part */
  cited: number; judged: number; supporting: number;
  strength: string | null;
  answer: string | null;
  /** SP-638: the belongs vote over the claim's own citations — present for every claim the judge saw. */
  sp638?: { yes: number; no: number; tie: boolean;
    not_counted: Array<{ signal_id: string; why: string; belongs: boolean | null }>;
    new_rule: string; old_first_no_rule: string };
};

export function claimOutcome(a: {
  need: string; polarity: string; claim: string; identity: string | null; parts: readonly string[]; rewriteOf?: string | null;
  kept: boolean; dropReason: string; cited: number; judged: number; supporting: number; strength?: string | null;
  answer?: string | null;
}): ClaimOutcome {
  // kept and dropped are told apart by `kept` alone; a kept claim carries no drop class and a dropped
  // or replaced one always carries exactly one.
  if (a.kept && a.dropReason) throw new Error(`claimOutcome: a kept claim cannot carry a drop reason (${a.dropReason})`);
  if (a.kept && a.supporting < 1) throw new Error("claimOutcome: a kept claim has at least one supporting quote");
  const cls = a.kept ? null : claimDropClass(a.dropReason);
  return {
    need: a.need, polarity: a.polarity, claim: a.claim, pattern_identity: a.identity, parts: [...a.parts],
    rewrite_of: a.rewriteOf ?? null,
    outcome: a.kept ? "kept" : REPLACED_CLASSES.has(cls!) ? "replaced" : "dropped",
    drop_class: cls,
    drop_reason: a.kept ? "" : a.dropReason,
    cited: a.cited, judged: a.judged, supporting: a.supporting,
    strength: a.kept ? (a.strength ?? null) : null,
    answer: a.answer ?? null,
  };
}

/** SP-636: the class of a generator answer that carries no readable `patterns` array. */
export const UNREADABLE_REASKED = "unreadable, re-asked";
export const UNREADABLE_NOT_REASKED = "unreadable, no readable re-ask";
export type UnreadableAnswerClass = typeof UNREADABLE_REASKED | typeof UNREADABLE_NOT_REASKED;

/** SP-618(c): THE PER-ANSWER CLAIM ACCOUNT. For each generator answer: the claims it wrote (read from
 *  its own bytes by `rawClaimsWritten`) against the outcomes recorded for it. `ok` is false when a
 *  claim was written and no outcome names it — the run 8 fault, as arithmetic. An answer with no
 *  readable `patterns` array has `written: null` and is reported, not counted. */
export function claimAccountByAnswer(
  answers: ReadonlyArray<{ need: string; polarity: string; attempt: string; content: string; field?: boolean }>,
  claims: readonly ClaimOutcome[],
): Array<{ need: string; polarity: string; attempt: string; written: number | null; kept: number; dropped: number; replaced: number; ok: boolean;
  unreadable: UnreadableAnswerClass | null; textClaims: number }> {
  return answers.map((a) => {
    // SP-634: a FIELD re-ask's answer names one field of one claim, so it wrote one claim.
    const fieldOk = (() => { if (!a.field) return false; try { const f = parseFieldReask(a.content); return !!(f.claim || f.parts || f.polarity); } catch { return false; } })();
    const raw = fieldOk ? [{ claim: "", parts: [] }] : rawClaimsWritten(a.content);
    const mine = claims.filter((c) => c.need === a.need && c.polarity === a.polarity && c.answer === a.attempt);
    const n = (o: ClaimOutcome["outcome"]) => mine.filter((c) => c.outcome === o).length;
    const kept = n("kept"), dropped = n("dropped"), replaced = n("replaced");
    // SP-636: an unreadable answer is its own class. It passes when it was the pass's FIRST answer and
    // the pass's one re-ask (`gen-2`) is readable — its claims cannot be listed, and nothing of it was
    // taken. Any other unreadable answer still fails the account.
    const reasked = raw === null && a.attempt === "gen-1" &&
      answers.some((b) => b.need === a.need && b.polarity === a.polarity && b.attempt === "gen-2" && rawClaimsWritten(b.content) !== null);
    const unreadable: UnreadableAnswerClass | null = raw !== null ? null : reasked ? UNREADABLE_REASKED : UNREADABLE_NOT_REASKED;
    return { need: a.need, polarity: a.polarity, attempt: a.attempt, written: raw ? raw.length : null, kept, dropped, replaced,
      ok: raw !== null ? raw.length === kept + dropped + replaced : reasked,
      unreadable, textClaims: raw === null ? (a.content.match(/"claim"\s*:\s*"/g) ?? []).length : 0 };
  });
}

export type PartVerdict = { ordinal: number; states: boolean; span: string; reason: string; rejected: "" | "span_not_verbatim" | "span_missing" };
export type JudgeVerdict = {
  /** OURS, not the model's: true only when EVERY part states with a verified span. */
  supports: boolean;
  /** One verdict per part, in ordinal order, stored in need_pattern_quote_parts. */
  parts: PartVerdict[];
  /** SP-493: false ⇒ the CLAIM belongs to another need, and the pattern is not stored. */
  belongsToNeed: boolean;
  /** SP-609: what the judge's answer actually carried in `belongs_to_this_need`. `belongsToNeed` is
   *  false for three different answers (SP-566 fails closed), and a run must be able to tell a judge
   *  that SAID "not this need's" from one that left the field out. */
  belongsField: BelongsField;
  /** The judge's top-level reason. It is the reason for the `belongs_to_this_need` answer. */
  reason: string;
  /** The parts this quote does not show — kept for the report and for need_pattern_quotes.not_stated. */
  notStated: string[];
};

/** One quote's verdict across the pattern's parts. `supports` is COMPUTED here, never read from the
 *  model, and a span that is not verbatim in the quote cannot carry a part (SP-494.1). */
export class JudgeUnreadable extends Error {
  constructor(message: string) { super(message); this.name = "JudgeUnreadable"; }
}

export function parseJudgeOne(content: string, quote: string, parts: readonly string[]): JudgeVerdict {
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) throw new JudgeUnreadable("pattern judge returned no JSON object");
  // A CUT ANSWER IS A NAMED FAILURE. JSON.parse's own SyntaxError used to escape from here, so one
  // truncated answer took down a run that had already made a hundred good calls (measured on
  // qwen3.6:35b, 2026-11-20). The caller can now recognise it, fail that ONE quote closed, and carry on.
  let parsed: { parts?: unknown; belongs_to_this_need?: unknown; reason?: unknown };
  try {
    parsed = JSON.parse(m[0]) as typeof parsed;
  } catch (e) {
    throw new JudgeUnreadable(`pattern judge returned unparseable JSON (likely cut at num_predict=${JUDGE_NUM_PREDICT}): ${e instanceof Error ? e.message : e}`);
  }
  const reason = String(parsed.reason ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
  // SP-493 fails CLOSED: anything but an explicit true is "not this need's".
  // SP-566: the line below used to read `!== false`, which is the OPPOSITE of the comment above it —
  // a missing field, a null or the string "true" all read as belonging, so the rule failed OPEN.
  const belongsToNeed = parsed.belongs_to_this_need === true;
  const belongsField = belongsFieldOf(parsed);   // SP-609: recorded, never consulted for the verdict

  const byOrdinal = new Map<number, { states?: unknown; span?: unknown; reason?: unknown }>();
  if (Array.isArray(parsed.parts)) {
    for (const row of parsed.parts) {
      if (!row || typeof row !== "object") continue;
      const o = Number((row as { ordinal?: unknown }).ordinal);
      if (Number.isInteger(o) && o >= 1 && o <= parts.length) byOrdinal.set(o, row as never);
    }
  }

  const out: PartVerdict[] = [];
  const notStated: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const ord = i + 1;
    const row = byOrdinal.get(ord);
    const span = String(row?.span ?? "").replace(/\s+/g, " ").trim();
    const pReason = String(row?.reason ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
    // A part the judge did not answer for is NOT shown. An unanswered part read as assent is the
    // direction a fail-closed evidence rule must never fall.
    if (row?.states !== true) {
      out.push({ ordinal: ord, states: false, span, reason: pReason, rejected: "" });
      notStated.push(parts[i]);
      continue;
    }
    if (!span) { out.push({ ordinal: ord, states: false, span: "", reason: pReason, rejected: "span_missing" }); notStated.push(parts[i]); continue; }
    if (!verbatimOn(span, quote)) { out.push({ ordinal: ord, states: false, span, reason: pReason, rejected: "span_not_verbatim" }); notStated.push(parts[i]); continue; }
    out.push({ ordinal: ord, states: true, span, reason: pReason, rejected: "" });
  }
  return { supports: notStated.length === 0, parts: out, belongsToNeed, belongsField, reason, notStated };
}

/** SP-510 JUDGE B: ONE CALL PER PART PER QUOTE, held in reserve and now called on.
 *
 *  Judge A asks about every part in one call. Its argument was cost (196 calls for the five needs
 *  against ~390–588) and SP-475(d)'s one-quote-per-call, which is what removed v2's coupling. B's
 *  argument is the one A cannot answer: within a single call the parts are neighbours, so a verdict on
 *  part 2 can be shaped by what the model just said about part 1 — the same coupling SP-475(d) removed
 *  between QUOTES, one level down.
 *
 *  B is the same question with nothing else in the call: one need, one predicate, one quote. The
 *  compound stays OUR arithmetic either way, and the spans are verified by the same predicate, so A
 *  and B are directly comparable per (quote, part). */
export const JUDGE_B_SYSTEM = [
  PATTERN_RUBRIC_TEXT,
  "",
  "You are given ONE need, ONE claim for context, ONE PART of that claim, and ONE quote.",
  "Decide ONLY whether the quote's own words state or SHOW that ONE part. Ignore the rest of the claim.",
  "",
  "A quote that describes a specific INSTANCE of the part states it; it does not have to repeat the",
  'wording ("they hung up on me twice" shows "the agent dismisses the customer"). A quote about a',
  "DIFFERENT problem shows nothing.",
  "",
  'When "states" is true, return "span": the EXACT WORDS of the quote that show it — copied character',
  "for character from the quote, never a paraphrase and never your own words.",
  "",
  "Do not judge how strong the pattern is and do not name a strength.",
  'JSON only: {"states":true,"span":"<verbatim>","reason":"<one short clause>"}',
].join("\n");

/** One (quote, part) verdict from judge B. `states` is ours on the same terms as in A: true only with
 *  a span the E4 predicate confirms is verbatim in the quote. */
export function parseJudgeBOne(content: string, quote: string, ordinal: number): PartVerdict {
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("pattern judge B returned no JSON object");
  const parsed = JSON.parse(m[0]) as { states?: unknown; span?: unknown; reason?: unknown };
  const span = String(parsed.span ?? "").replace(/\s+/g, " ").trim();
  const reason = String(parsed.reason ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (parsed.states !== true) return { ordinal, states: false, span, reason, rejected: "" };
  if (!span) return { ordinal, states: false, span: "", reason, rejected: "span_missing" };
  if (!verbatimOn(span, quote)) return { ordinal, states: false, span, reason, rejected: "span_not_verbatim" };
  return { ordinal, states: true, span, reason, rejected: "" };
}

/** One need, one claim as context, ONE part, one quote (SP-510 judge B). */
export function buildJudgeBUser(needStatement: string, name: string, part: string, quote: PatternQuote): string {
  return [
    `NEED: ${needStatement}`,
    "",
    `CLAIM (context only): ${name}`,
    `THE ONE PART TO JUDGE: ${part}`,
    "",
    `QUOTE: "${quote.quote.replace(/\s+/g, " ").trim()}"`,
  ].join("\n");
}

/** SP-514: WHICH PARTS EARN THE ONE SPAN RE-ASK.
 *
 *  THE MEASURED FAILURE. On the SP-507 set the judge's only real error was transcription, not
 *  reasoning: for `ca8a4568` it asserted the part and cited the span "got NOTHING done" where the
 *  quote reads "to get NOTHING done". One word, and `verbatimOn` correctly refused it — so a part the
 *  quote plainly states was recorded as not stated. Over the full N13 run that was 1 part verdict in
 *  109 under judge A.
 *
 *  So the judge gets ONE more call, naming the spans that failed and asking for the exact characters.
 *  A second failure is final: the part is not stated, and it is REPORTED rather than quietly dropped.
 *
 *  BOTH span rejections qualify, which is a reading of SP-514 worth stating. SP-514 says "a part's
 *  span fails verbatimOn"; `span_missing` never reaches verbatimOn, because the judge asserted the
 *  part and returned no span at all. They are the same defect — states asserted, evidence unusable —
 *  and the same re-ask fixes both, so both are re-asked. */
export function spanReaskOrdinals(verdict: JudgeVerdict): number[] {
  return verdict.parts.filter((p) => p.rejected === "span_not_verbatim" || p.rejected === "span_missing").map((p) => p.ordinal);
}

/** SP-514: the re-ask, quoting the failure back. It asks ONLY about the parts that failed, and it
 *  shows the judge its own rejected span — a re-ask that does not name what was wrong is the bug
 *  SP-515(2) is about, one level over. */
export function buildJudgeSpanReask(
  needStatement: string, name: string, parts: readonly string[], quote: PatternQuote, verdict: JudgeVerdict,
): string {
  const failed = verdict.parts.filter((p) => spanReaskOrdinals(verdict).includes(p.ordinal));
  return [
    `NEED: ${needStatement}`,
    "",
    `CLAIM: ${name}`,
    `PARTS:`,
    ...parts.map((p, i) => `  ${i + 1}. ${p}`),
    "",
    `QUOTE: "${quote.quote.replace(/\s+/g, " ").trim()}"`,
    "",
    "YOUR PREVIOUS ANSWER CITED A SPAN THAT IS NOT IN THE QUOTE:",
    ...failed.map((p) => `  part ${p.ordinal}: you returned ${p.span ? JSON.stringify(p.span) : "no span at all"}` +
      (p.rejected === "span_not_verbatim" ? " — those exact words do not appear in the quote." : " — a stated part needs its span.")),
    "",
    `Answer again for ONLY these part(s): ${failed.map((p) => p.ordinal).join(", ")}.`,
    "Copy the span character for character from the QUOTE above. If the quote's own words do not show",
    'the part, answer "states": false — do not invent a span to make it fit.',
    'JSON only: {"parts":[{"ordinal":1,"states":true,"span":"<verbatim>","reason":"<short>"}],',
    '  "belongs_to_this_need":true,"reason":"<one short clause>"}',
  ].join("\n");
}

/** SP-514: merge the re-ask's answer over the first, for the re-asked ordinals ONLY.
 *
 *  A part that was settled on the first call is NOT revisited — the re-ask was not asked about it, so
 *  a stray verdict on it in the second answer is ignored rather than allowed to overturn the first.
 *  `supports` is recomputed from the merged parts on exactly the same terms. */
export function mergeSpanReask(first: JudgeVerdict, second: JudgeVerdict, reasked: readonly number[], parts: readonly string[]): JudgeVerdict {
  const set = new Set(reasked);
  const merged = first.parts.map((p) => {
    if (!set.has(p.ordinal)) return p;
    const redone = second.parts.find((x) => x.ordinal === p.ordinal);
    // A second failure is FINAL and keeps the second answer's own span and reason, so the report can
    // show what it tried twice.
    return redone ?? p;
  });
  const notStated = parts.filter((_, i) => !merged[i]?.states);
  return {
    supports: notStated.length === 0,
    parts: merged,
    // SP-493 is a judgement about the claim; a false from EITHER call rejects the pattern.
    belongsToNeed: first.belongsToNeed && second.belongsToNeed,
    // SP-609: the field of whichever answer rejected — the first one's unless only the second did.
    belongsField: first.belongsField !== "true" ? first.belongsField : second.belongsField,
    reason: first.reason || second.reason,
    notStated,
  };
}

/** JUDGE A, WHOLE: the call, the SP-514 span re-ask, and the merge, in ONE place.
 *
 *  WHY THIS FUNCTION EXISTS. The re-ask is part of what "judge A" now means. Before this, it lived in
 *  the runner only, so `sp507-part-check` and `pattern-judge-corruption` would have measured judge A
 *  WITHOUT its retry and reported the number as judge A's — and SP-507's own failing case
 *  (`ca8a4568`, a one-word mis-transcription) is exactly what the retry recovers. Three copies of a
 *  retry policy is the drift this module keeps warning about, so there is one.
 *
 *  The caller injects `call`, because this module never chooses a model (SP-460/468) and never knows
 *  about ollama, the ledger or the router. */
export async function judgeAWithReask(args: {
  call: (system: string, user: string) => Promise<string>;
  needStatement: string;
  name: string;
  parts: readonly string[];
  quote: PatternQuote;
  /** SP-527(B): the system prompt, for MEASUREMENT instruments only. Defaults to the live JUDGE_SYSTEM
   *  and the runner never passes it, so a cure can be measured through the identical retry policy
   *  without the live judge changing. */
  system?: string;
}): Promise<{ verdict: JudgeVerdict; calls: number; reasked: number[]; recovered: number; failedTwice: number }> {
  const { call, needStatement, name, parts, quote } = args;
  const system = args.system ?? JUDGE_SYSTEM;
  const first = parseJudgeOne(await call(system, buildJudgeUser(needStatement, name, parts, quote)), quote.quote, parts);
  // (A JudgeUnreadable from either call propagates to the caller, which fails that one quote closed and
  // records it — see the `unreadable` counters in the runner and the two instruments.)
  const reasked = spanReaskOrdinals(first);
  if (reasked.length === 0) return { verdict: first, calls: 1, reasked, recovered: 0, failedTwice: 0 };

  const second = parseJudgeOne(
    await call(system, buildJudgeSpanReask(needStatement, name, parts, quote, first)), quote.quote, parts);
  const verdict = mergeSpanReask(first, second, reasked, parts);
  const recovered = verdict.parts.filter((x) => reasked.includes(x.ordinal) && x.states).length;
  return { verdict, calls: 2, reasked, recovered, failedTwice: reasked.length - recovered };
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

/** One pattern, its numbered parts, one quote (SP-475d + SP-502). */
export function buildJudgeUser(needStatement: string, name: string, parts: readonly string[], quote: PatternQuote): string {
  return [
    `NEED: ${needStatement}`,
    "",
    `CLAIM: ${name}`,
    `PARTS:`,
    ...parts.map((p, i) => `  ${i + 1}. ${p}`),
    "",
    `QUOTE: "${quote.quote.replace(/\s+/g, " ").trim()}"`,
  ].join("\n");
}

/** Read a model's JSON answer, and REFUSE anything the schema does not allow rather than repairing it.
 *  A silently truncated or widened answer is a finding nobody can trace. */
/** SP-542: THE ENVELOPE CHECKS — the ones no single claim can be blamed for, so no claim can be
 *  dropped to satisfy them. An unparseable or cut answer has nothing to salvage, and the SP-469
 *  ceiling is a property of the answer's length. These still refuse the whole pass. */
/** SP-618(a) (2026-11-24): A `left_over` LIST THE MODEL NESTED INSIDE `patterns` IS READ.
 *
 *  THE MEASURED DEFECT (run 8, N13 "not working"). The first answer closed its seven claims and then
 *  wrote `{"left_over":[…24 entries…]}` as an EIGHTH ITEM of `patterns` instead of beside it. The
 *  runner read seven claims and no account, 24 quotes were "unaccounted", the SP-535 re-ask fired and
 *  the second answer replaced the first — seven claims, one of them the need's only hold-time claim,
 *  discarded with no drop class. The list was there all along, one bracket out of place.
 *
 *  An item of `patterns` that carries a `left_over` array and NO claim is that list, not a claim: it is
 *  lifted out and joined to the top-level list (if any). A `belongs_to` index therefore counts CLAIMS,
 *  which is what the generator was counting. An item with a claim is never touched. */
export function hoistNestedLeftOver(parsed: unknown): { patterns: unknown[] | null; leftOver: unknown[] | null; nested: number } {
  const top = parsed as { patterns?: unknown; left_over?: unknown; leftOver?: unknown } | null;
  const rawPatterns = top?.patterns;
  const topLeft = top?.left_over ?? top?.leftOver;
  if (!Array.isArray(rawPatterns)) return { patterns: null, leftOver: Array.isArray(topLeft) ? topLeft : null, nested: 0 };
  const patterns: unknown[] = [];
  const hoisted: unknown[] = [];
  let nested = 0;
  for (const item of rawPatterns) {
    const o = item as { claim?: unknown; name?: unknown; left_over?: unknown; leftOver?: unknown } | null;
    const inner = o && typeof o === "object" ? (o.left_over ?? o.leftOver) : undefined;
    const hasClaim = !!o && typeof o === "object" && (typeof o.claim === "string" || typeof o.name === "string");
    if (Array.isArray(inner) && !hasClaim) { nested++; hoisted.push(...inner); continue; }
    patterns.push(item);
  }
  const leftOver = Array.isArray(topLeft) || nested ? [...(Array.isArray(topLeft) ? topLeft : []), ...hoisted] : null;
  return { patterns, leftOver, nested };
}

function readEnvelope(content: string, limits: GenLimits = DEFAULT_GEN_LIMITS): { patterns: unknown[]; leftOver: unknown[] | null; nested: number } {
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) throw new GeneratorRefusal("schema", "pattern generator returned no JSON object");
  let parsed: unknown;
  try { parsed = JSON.parse(m[0]); } catch (e) { throw new GeneratorRefusal("schema", `pattern generator returned unparseable JSON: ${e instanceof Error ? e.message : e}`); }
  const env = hoistNestedLeftOver(parsed);
  if (env.patterns === null) throw new GeneratorRefusal("schema", "pattern generator returned no `patterns` array");
  const raw = env.patterns;
  if (raw.length > limits.ceiling) throw new GeneratorRefusal("ceiling", `pattern generator returned ${raw.length} patterns, over the ${limits.ceiling === PATTERN_CEILING ? "SP-469" : "SP-627"} ceiling of ${limits.ceiling}`);
  return { patterns: raw, leftOver: env.leftOver, nested: env.nested };
}
function parseEnvelope(content: string, limits: GenLimits = DEFAULT_GEN_LIMITS): unknown[] { return readEnvelope(content, limits).patterns; }

/** SP-618(c): the claims an answer WROTE, read with none of the bounds — for the per-answer account
 *  ("claims written = kept + dropped + replaced") and for recording the claims of an answer that was
 *  refused or not adopted. null when the answer carries no readable `patterns` array at all. */
export function rawClaimsWritten(content: string): Array<{ claim: string; parts: string[] }> | null {
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(m[0]); } catch { return null; }
  const env = hoistNestedLeftOver(parsed);
  if (env.patterns === null) return null;
  return env.patterns.map((p) => {
    const o = p as { claim?: unknown; name?: unknown; parts?: unknown } | null;
    const claim = String(o?.claim ?? o?.name ?? "").replace(/\s+/g, " ").trim() || "(no claim)";
    const parts = Array.isArray(o?.parts) ? (o!.parts as unknown[]).filter((x): x is string => typeof x === "string").map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean) : [];
    return { claim, parts };
  });
}

/** SP-542: ONE CLAIM, read and bounded. It throws a GeneratorRefusal naming what is wrong with THIS
 *  claim; the caller decides whether that refuses the answer (`parseGenerated`) or drops the claim
 *  and keeps the rest (`parseGeneratedLenient`). `usedRepresentatives` and `claimsSeen` are the
 *  caller's, because both are properties of the answer rather than of the claim. */
function parseOneClaim(
  p: unknown,
  labels: ReadonlyMap<string, string>,
  usedRepresentatives: Set<string>,
  claimsSeen: Map<string, string>,
  limits: GenLimits = DEFAULT_GEN_LIMITS,
): ProposedPattern {
  {
    // v3 answers "claim"; "name" is accepted as the older spelling so a stray v2-shaped answer is read
    // rather than refused on a key name — the bounds below are what actually gate it.
    const name = String((p as { claim?: unknown; name?: unknown })?.claim ?? (p as { name?: unknown })?.name ?? "").replace(/\s+/g, " ").trim();
    if (!name) throw new GeneratorRefusal("claim_missing", "pattern generator returned a pattern with no claim");
    // SP-546: THE MESSAGE IS THE RE-ASK'S TEXT, so it states the exact failure in the ruling's own
    // shape ("the claim is 99 characters; the limit is 90") rather than a category. One place: the
    // re-ask quotes this string verbatim, so a message that measures badly misleads the generator.
    if (name.length > MAX_PATTERN_NAME_CHARS) throw new GeneratorRefusal("claim_length", `the claim is ${name.length} characters; the limit is ${MAX_PATTERN_NAME_CHARS}: "${name.slice(0, 60)}…"`);

    // SP-537(a): TWO PATTERNS IN ONE ANSWER MAY NOT SHARE A CLAIM. Measured on run 2: N15 wrote
    // "Unexpected charges appear on bills without clear communication" twice, with one part each.
    // SP-509 makes those two DIFFERENT rows (the identity covers the parts), so nothing downstream
    // refused them — and every reader that keys a pattern by (need, claim) then merges them, judges
    // the wrong part for one of the two and double-counts their quotes. I made that exact mistake in
    // brief 2 and it changed a published number. It is refused at the door instead.
    const claimKey = normalizeForHash(name);
    const first = claimsSeen.get(claimKey);
    if (first !== undefined) {
      throw new GeneratorRefusal("duplicate_claim", `two patterns share the claim ${JSON.stringify(name.slice(0, 70))} — a claim identifies a pattern, so one answer may not write it twice`);
    }
    claimsSeen.set(claimKey, name);

    // SP-502: 1 to 3 single predicates. SP-501: a part is a PREDICATE, never a subject — refused at the
    // door rather than trusted to the prompt, because v2.2 proved a subject reaches the judge otherwise.
    const rawParts = (p as { parts?: unknown })?.parts;
    if (!Array.isArray(rawParts)) throw new GeneratorRefusal("parts_missing", `pattern "${name}" returned no parts array`);
    const parts = [...new Set(rawParts.filter((x): x is string => typeof x === "string").map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean))];
    if (parts.length === 0) throw new GeneratorRefusal("parts_missing", `pattern "${name}" returned no parts`);
    // SP-620: the one-part variant's door. Its own kind, so the SP-546 re-ask carries its own guidance.
    if (limits.maxParts === 1 && parts.length > 1) throw new GeneratorRefusal("one_part", `the claim has ${parts.length} parts; this prompt allows exactly 1: ${parts.map((x) => JSON.stringify(x.slice(0, 40))).join(", ")}`);
    if (parts.length > limits.maxParts) throw new GeneratorRefusal("parts_count", `pattern "${name}" returned ${parts.length} parts, over the SP-502 cap of ${MAX_PARTS_PER_PATTERN}`);
    parts.forEach((part, i) => {
      // SP-546: the ordinal too — "part 2" is what the generator has to find to fix it.
      if (part.length > MAX_PART_CHARS) throw new GeneratorRefusal("part_length", `part ${i + 1} is ${part.length} characters; the limit is ${MAX_PART_CHARS}: "${part.slice(0, 50)}…"`);
    });

    const pol = String((p as { polarity?: unknown })?.polarity ?? "").trim().toLowerCase();
    if (!QUOTE_POLARITIES.includes(pol as QuotePolarity)) {
      throw new GeneratorRefusal("polarity", `pattern "${name}" carries polarity ${JSON.stringify(pol)}, not one of ${QUOTE_POLARITIES.join(" / ")}`);
    }

    const rawQuotes = (p as { quotes?: unknown })?.quotes;
    if (!Array.isArray(rawQuotes)) throw new GeneratorRefusal("schema", `pattern "${name}" cites no quotes array`);
    const cited = [...new Set(rawQuotes.filter((x): x is string => typeof x === "string").map((s) => s.trim()))];
    // CITATION INTEGRITY, at the door: a label the call was never given is a fabrication, and it
    // rejects the whole answer rather than being dropped — a dropped citation is a pattern quietly
    // resting on less evidence than the row will claim.
    const unknown = cited.filter((l) => !labels.has(l));
    if (unknown.length) throw new GeneratorRefusal("citation", `pattern "${name}" cites ${unknown.length} label(s) that were not in its input: ${unknown.slice(0, 3).join(", ")}`);
    if (cited.length === 0) throw new GeneratorRefusal("no_quotes", `pattern "${name}" cites no quotes at all`);

    // SP-475(c): the generator's representative, validated here. A repeat within one answer is
    // dropped to null rather than refused — the runner then picks from the survivors, and the unique
    // index is the floor underneath both.
    const repLabel = String((p as { representative?: unknown })?.representative ?? "").trim();
    let representativeSignalId: string | null = null;
    if (repLabel && labels.has(repLabel) && cited.includes(repLabel) && !usedRepresentatives.has(repLabel)) {
      usedRepresentatives.add(repLabel);
      representativeSignalId = labels.get(repLabel)!;
    }

    return { name, parts, polarity: pol as QuotePolarity, signalIds: cited.map((l) => labels.get(l)!), representativeSignalId, citedLabels: cited };
  }
}

/** Read a model's JSON answer STRICTLY: the first offending claim refuses the whole answer. Kept as
 *  the specification of what each refusal kind means, and as the reading every existing caller had. */
export function parseGenerated(content: string, labels: ReadonlyMap<string, string>, limits: GenLimits = DEFAULT_GEN_LIMITS): ProposedPattern[] {
  const raw = parseEnvelope(content, limits);
  const usedRepresentatives = new Set<string>();
  const claimsSeen = new Map<string, string>();
  return raw.map((p) => parseOneClaim(p, labels, usedRepresentatives, claimsSeen, limits));
}

/** SP-542: ONE REFUSED CLAIM IS DROPPED AND NAMED — THE NEED'S OTHERS PROCEED.
 *
 *  WHAT THIS COST BEFORE. Run 3 (2026-11-21) lost N14 entirely: the generator's first claim was 91
 *  characters against a cap of 90, the one re-ask came back at 99, and the need was refused with
 *  nothing written — although its OTHER claims were sound and v2 covered 15 of its 17 quotes. A cap
 *  on one claim's wording is not a reason to publish nothing about a need.
 *
 *  The envelope still refuses the pass (see `parseEnvelope`), and a claim that is dropped is named in
 *  the run's report with its kind and reason, never silently discarded. If every claim is dropped the
 *  pass has no patterns — which is a refusal OF THE PASS, and the need's other polarity passes still
 *  run. */
export type DroppedClaim = { ordinal: number; claim: string; kind: string; why: string;
  /** SP-634: the refused claim AS THE GENERATOR WROTE IT, read with none of the bounds, so its one
   *  re-ask can change the one thing it was refused for and keep everything else. */
  raw?: RawClaim };

/** SP-634: one claim of an answer as written — its wording and its own quote labels, unbounded. */
export type RawClaim = { claim: string; parts: string[]; polarity: string; quotes: string[]; representative: string };
export function rawClaimOf(p: unknown): RawClaim {
  const o = (p ?? {}) as { claim?: unknown; name?: unknown; parts?: unknown; polarity?: unknown; quotes?: unknown; representative?: unknown };
  const strs = (x: unknown) => Array.isArray(x) ? [...new Set(x.filter((s): s is string => typeof s === "string").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean))] : [];
  return {
    claim: String(o.claim ?? o.name ?? "").replace(/\s+/g, " ").trim(),
    parts: strs(o.parts), polarity: String(o.polarity ?? "").trim().toLowerCase(),
    quotes: strs(o.quotes), representative: String(o.representative ?? "").trim(),
  };
}

/** SP-546 / SP-553: the two door-guards that span MORE THAN ONE ANSWER — SP-537(a) (no two patterns
 *  share a claim) and SP-475(c) (no label is the representative of two patterns) — seeded from the
 *  patterns a pass already holds. One implementation: a re-ask and a decomposition rewrite face the
 *  same two doors, and a second copy of this loop is the drift. */
function seedFromExisting(
  labels: ReadonlyMap<string, string>,
  existing: readonly ProposedPattern[],
): { usedRepresentatives: Set<string>; claimsSeen: Map<string, string> } {
  const usedRepresentatives = new Set<string>();
  const claimsSeen = new Map<string, string>();
  for (const e of existing) {
    claimsSeen.set(normalizeForHash(e.name), e.name);
    const rep = e.representativeSignalId;
    if (rep) for (const [l, id] of labels) if (id === rep && e.citedLabels.includes(l)) usedRepresentatives.add(l);
  }
  return { usedRepresentatives, claimsSeen };
}

export function parseGeneratedLenient(
  content: string,
  labels: ReadonlyMap<string, string>,
  /** SP-553: the patterns this pass ALREADY holds, so a rewrite cannot repeat one of them. Empty for
   *  a first answer, which is every pre-SP-553 caller. */
  existing: readonly ProposedPattern[] = [],
  limits: GenLimits = DEFAULT_GEN_LIMITS,
): { patterns: ProposedPattern[]; dropped: DroppedClaim[]; ordinals: number[] } {
  const raw = parseEnvelope(content, limits);
  const { usedRepresentatives, claimsSeen } = seedFromExisting(labels, existing);
  const patterns: ProposedPattern[] = [];
  const dropped: DroppedClaim[] = [];
  /** SP-547: the 1-based index IN THE ANSWER of each surviving pattern. `belongs_to` names a claim by
   *  its position in the answer the generator wrote, and SP-542 may drop one of those claims, so the
   *  surviving array's own indices are NOT the indices the generator counted with. */
  const ordinals: number[] = [];
  raw.forEach((p, i) => {
    try { patterns.push(parseOneClaim(p, labels, usedRepresentatives, claimsSeen, limits)); ordinals.push(i + 1); }
    catch (e) {
      // The claim as the model wrote it, for the report — read without any of the bounds, since the
      // bound is what it failed. An unreadable claim is named by its ordinal alone.
      const asWritten = String((p as { claim?: unknown; name?: unknown })?.claim ?? (p as { name?: unknown })?.name ?? "")
        .replace(/\s+/g, " ").trim();
      dropped.push({
        ordinal: i + 1,
        claim: asWritten || "(no claim)",
        kind: e instanceof GeneratorRefusal ? e.kind : "schema",
        why: e instanceof Error ? e.message : String(e),
        raw: rawClaimOf(p),
      });
    }
  });
  return { patterns, dropped, ordinals };
}

/** SP-546 (2026-11-22): ONE RE-ASK PER REFUSED CLAIM, NAMING THE EXACT FAILURE — FOR THAT CLAIM ONLY.
 *
 *  SP-542 stopped one bad claim from killing a need. It also skipped the recovery the pass-level
 *  re-ask used to attempt, and brief 5 measured what that costs: G-old's N14 went from run 2's 14 of
 *  17 quotes DOWN to 9 of 17, because run 2 recovered a better answer THROUGH the length re-ask that
 *  SP-542 drops straight past. 3 of the 4 drops in brief 5 were the 90/80-character caps — the most
 *  recoverable failure there is, and the caps stay (SP-546).
 *
 *  The re-ask asks about ONE claim, carries the refusal's own words (which now measure the failure:
 *  "the claim is 99 characters; the limit is 90"), and asks for the same claim fixed — not for a new
 *  answer, because the rest of the pass already passed every gate. One re-ask: if it fails again the
 *  claim is dropped and named, exactly as SP-542 leaves it. */
export function buildClaimReask(
  needStatement: string,
  quotes: readonly PatternQuote[],
  d: DroppedClaim,
  guidance: string,
): string {
  return [
    `CUSTOMER NEED: ${needStatement}`,
    "",
    "ONE of the patterns in your previous answer was refused. Every other pattern in it was accepted and",
    "is already recorded — do NOT write them again.",
    "",
    `THE REFUSED PATTERN (number ${d.ordinal} in your answer): ${JSON.stringify(d.claim)}`,
    `WHY IT WAS REFUSED: ${d.why}`,
    guidance ? `WHAT TO FIX: ${guidance}` : "",
    "",
    "Return that ONE pattern, fixed, and nothing else. Keep the same mechanism, the same polarity and the",
    "same quote labels; change only what the refusal names.",
    'JSON only: {"patterns":[{"claim":"<fixed>","parts":["<predicate>"],"polarity":"not working",',
    '  "quotes":["q1"],"representative":"q1"}]}',
    "",
    "THE QUOTES, for reference:",
    ...quotes.map((qt, i) => qline(qt, i)),
  ].filter((l) => l !== "").join("\n");
}

/** SP-546: read a re-ask's answer as ONE claim, under the SAME gates the first answer faced.
 *
 *  `existing` is what the pass already holds, so SP-537(a) (no two patterns share a claim) and
 *  SP-475(c) (no label is the representative of two patterns) still hold across the re-ask — a
 *  recovered claim that repeats an accepted one would otherwise walk straight past the door those two
 *  rulings guard. It throws a GeneratorRefusal naming what is still wrong, and the caller then drops
 *  the claim and names it (SP-542). An answer carrying MORE than one pattern is refused: the re-ask
 *  asked for one, and silently taking the first would accept an answer nobody asked for. */
export function parseReaskedClaim(
  content: string,
  labels: ReadonlyMap<string, string>,
  existing: readonly ProposedPattern[],
  limits: GenLimits = DEFAULT_GEN_LIMITS,
): ProposedPattern {
  const raw = parseEnvelope(content, limits);
  if (raw.length !== 1) throw new GeneratorRefusal("schema", `the claim re-ask returned ${raw.length} patterns; it asked for exactly 1`);
  const { usedRepresentatives, claimsSeen } = seedFromExisting(labels, existing);
  return parseOneClaim(raw[0], labels, usedRepresentatives, claimsSeen, limits);
}

// ── SP-634 (2026-11-24): A PER-CLAIM RE-ASK CHANGES ONLY WHAT IT WAS ASKED TO CHANGE ─────────────
//
// THE MEASURED DEFECT (run 10). A claim refused for an 87-character part was re-asked "fix that", and
// the answer was taken WHOLE — its wording and also its quote list, which the re-ask had no business
// changing. 11 of N13's citations and 4 of its nominations were lost that way; two claims came back
// citing only `q1`, the label in the message's own example.
//
// The rule: the runner keeps the original claim's quotes, representative and nominations, and takes
// from the re-ask ONLY the field its refusal names. The message asks for that field and nothing else,
// so the answer no longer re-lists every other quote of the pass.

/** What a re-ask may change. `quotes` is the old whole-claim re-ask: for a refusal that IS about the
 *  quote list (a fabricated label, no quotes, an unreadable claim) there is no original list to keep. */
export type ReaskField = "claim" | "parts" | "polarity" | "quotes";
export function reaskMayChange(kind: string): ReaskField[] {
  switch (kind) {
    case "part_length": case "one_part": case "parts_missing": case "parts_count": return ["parts"];
    case "claim_length": case "claim_missing": case "duplicate_claim": return ["claim"];
    case "polarity": return ["polarity"];
    // The label, and the wording that states it: a claim said under the wrong polarity may need re-saying.
    case "polarity_mismatch": return ["polarity", "claim", "parts"];
    default: return ["quotes"];
  }
}
/** In plain words, for the log and the report. */
export function reaskMayChangeText(kind: string): string {
  const f = reaskMayChange(kind);
  if (f.includes("quotes")) return "the whole claim (its quote list is what was refused)";
  if (kind === "polarity_mismatch") return "the polarity label, and the claim and part wording that states it";
  return f.map((x) => (x === "parts" ? "the part" : x === "claim" ? "the claim sentence" : "the polarity label")).join(", ");
}

/** SP-634: guidance for a FIELD re-ask. It never tells the generator to change its quotes. */
export function fieldReaskGuidance(kind: string, limits: GenLimits = DEFAULT_GEN_LIMITS, passPolarity = ""): string {
  if (kind === "one_part") return "Give this claim exactly ONE part: the single predicate the claim asserts. Do not join two predicates with \"and\" or \"or\".";
  if (kind === "duplicate_claim") return "Another pattern already carries this claim sentence. Give THIS pattern its own claim, naming its own mechanism.";
  if (kind === "polarity_mismatch") return `This pass is about ONE polarity only: "${passPolarity}". Give the pattern that polarity. Reword the claim and its part only as far as they must change to say what its quotes say under that polarity.`;
  // A model does not count characters reliably: the smoke run before run 11 got an 81-character part
  // back unchanged against a limit of 80, and the claim was dropped with its four quotes. The limit
  // stays; the advice names a margin.
  if (kind === "part_length") return `${reaskGuidance(kind, limits)} It must come back SHORTER than it is now: aim for ${MAX_PART_CHARS - 10} characters or fewer.`;
  if (kind === "claim_length") return `${reaskGuidance(kind, limits)} It must come back SHORTER than it is now: aim for ${MAX_PATTERN_NAME_CHARS - 10} characters or fewer.`;
  return reaskGuidance(kind, limits);
}

/** SP-634: the re-ask message for ONE field. It shows the claim as written and the claim's OWN quotes
 *  (never the pass's), and asks for the corrected field alone. */
export function buildFieldReask(
  needStatement: string,
  original: RawClaim,
  d: { ordinal: number; kind: string; why: string },
  guidance: string,
  ownQuotes: ReadonlyArray<{ label: string; quote: PatternQuote }>,
): string {
  const fields = reaskMayChange(d.kind);
  const answerShape = "{" + [
    fields.includes("polarity") ? '"polarity":"<the polarity>"' : "",
    fields.includes("claim") ? '"claim":"<the claim sentence>"' : "",
    fields.includes("parts") ? '"parts":["<predicate>"]' : "",
  ].filter(Boolean).join(",") + "}";
  const what = reaskMayChangeText(d.kind);
  return [
    `CUSTOMER NEED: ${needStatement}`,
    "",
    "ONE of the patterns in your previous answer was refused. Every other pattern in it was accepted and",
    "is already recorded — do NOT write them again.",
    "",
    `THE REFUSED PATTERN (number ${d.ordinal} in your answer):`,
    `  claim: ${JSON.stringify(original.claim)}`,
    `  parts: ${JSON.stringify(original.parts)}`,
    `  polarity: ${JSON.stringify(original.polarity)}`,
    `WHY IT WAS REFUSED: ${d.why}`,
    guidance ? `WHAT TO FIX: ${guidance}` : "",
    "",
    `Return ONLY ${what}, corrected. The pattern's quotes, its representative and everything else about`,
    "it are kept exactly as you wrote them. Do NOT list quotes. Do NOT write \"left_over\". Do NOT write any",
    "other pattern.",
    `JSON only: ${answerShape}`,
    "",
    ownQuotes.length ? "THIS PATTERN'S OWN QUOTES, for reference only:" : "",
    ...ownQuotes.map((x) => `${x.label} [${x.quote.polarity ?? "unlabelled"}]: "${x.quote.quote.replace(/\s+/g, " ").trim()}"`),
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").replace(/\n+$/, "");
}

/** SP-634: read a field re-ask's answer. The asked-for shape is `{"parts":[…]}` / `{"claim":…}` /
 *  `{"polarity":…}`; an answer that wrote the old one-pattern envelope instead is read for the same
 *  fields, so a model that ignores the shape still cannot change the quotes. */
export function parseFieldReask(content: string): { claim?: string; parts?: string[]; polarity?: string } {
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) throw new GeneratorRefusal("schema", "the claim re-ask returned no JSON object");
  let parsed: unknown;
  try { parsed = JSON.parse(m[0]); } catch (e) { throw new GeneratorRefusal("schema", `the claim re-ask returned unparseable JSON: ${e instanceof Error ? e.message : e}`); }
  let o = parsed as { patterns?: unknown; claim?: unknown; name?: unknown; parts?: unknown; part?: unknown; polarity?: unknown };
  if (Array.isArray(o?.patterns)) {
    const ps = hoistNestedLeftOver(parsed).patterns ?? [];
    if (ps.length !== 1) throw new GeneratorRefusal("schema", `the claim re-ask returned ${ps.length} patterns; it asked for one field of one pattern`);
    o = ps[0] as typeof o;
  }
  const out: { claim?: string; parts?: string[]; polarity?: string } = {};
  const claim = String(o?.claim ?? o?.name ?? "").replace(/\s+/g, " ").trim();
  if (claim) out.claim = claim;
  const partsRaw = Array.isArray(o?.parts) ? o.parts : typeof o?.part === "string" ? [o.part] : null;
  if (partsRaw) {
    const parts = [...new Set(partsRaw.filter((x): x is string => typeof x === "string").map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean))];
    if (parts.length) out.parts = parts;
  }
  const pol = String(o?.polarity ?? "").trim().toLowerCase();
  if (pol) out.polarity = pol;
  return out;
}

/** SP-634: THE MERGE. The original's quotes and representative, plus the re-ask's answer for the field
 *  the refusal named — then the SAME door every claim faces (`parseOneClaim`). If the door refuses the
 *  strict merge because ANOTHER field of the original is also over a bound, the re-ask's wording is
 *  taken for every wording field it gave (`widened: true`, printed by the runner). The quotes are the
 *  original's in both cases. A field the re-ask did not return fails the merge: the claim is dropped
 *  and named, as a failed re-ask always was. */
export function mergeFieldReask(
  original: RawClaim,
  answer: { claim?: string; parts?: string[]; polarity?: string },
  kind: string,
  labels: ReadonlyMap<string, string>,
  existing: readonly ProposedPattern[],
  limits: GenLimits = DEFAULT_GEN_LIMITS,
): { pattern: ProposedPattern; took: ReaskField[]; widened: boolean } {
  const fields = reaskMayChange(kind);
  if (fields.includes("quotes")) throw new Error(`mergeFieldReask: ${kind} is a whole-claim re-ask, not a field re-ask`);
  const need = fields.filter((f) => f !== "claim" && f !== "parts" || kind !== "polarity_mismatch");
  for (const f of need) if (answer[f as "claim" | "parts" | "polarity"] === undefined) throw new GeneratorRefusal("schema", `the claim re-ask did not return the ${f} it was asked for`);
  const build = (take: ReaskField[]) => {
    const { usedRepresentatives, claimsSeen } = seedFromExisting(labels, existing);
    return parseOneClaim({
      claim: take.includes("claim") && answer.claim !== undefined ? answer.claim : original.claim,
      parts: take.includes("parts") && answer.parts !== undefined ? answer.parts : original.parts,
      polarity: take.includes("polarity") && answer.polarity !== undefined ? answer.polarity : original.polarity,
      quotes: original.quotes, representative: original.representative,
    }, labels, usedRepresentatives, claimsSeen, limits);
  };
  try { return { pattern: build(fields), took: fields, widened: false }; }
  catch (e) {
    if (!(e instanceof GeneratorRefusal)) throw e;
    const all: ReaskField[] = (["claim", "parts", "polarity"] as ReaskField[]).filter((f) => answer[f as "claim" | "parts" | "polarity"] !== undefined);
    if (all.length <= fields.length && all.every((f) => fields.includes(f))) throw e;
    return { pattern: build(all), took: all, widened: true };
  }
}

/** SP-634: A NOMINATION FOLLOWS ITS CLAIM THROUGH A PER-CLAIM RE-ASK. `belongs_to` names a claim by its
 *  number in the answer; a claim refused at the door has no pattern yet, so `parseGeneratedPass` leaves
 *  the entry unresolved and left over. Once the claim's one re-ask has recovered it, the entries that
 *  named that number are bound to the recovered claim — nominated, exactly as for a claim that passed
 *  the door first time. Run 10 lost four this way, one of them SP-462 check 6's quote. */
export function adoptNominationsForRecovered(
  pass: GeneratedPass, ordinal: number, recovered: ProposedPattern, labels: ReadonlyMap<string, string>,
): string[] {
  const adopted: string[] = [];
  for (const pr of pass.promoted) {
    if (pr.resolved || pr.belongsTo !== ordinal) continue;
    pr.resolved = true; pr.claim = recovered.name;
    pr.alreadyCited = recovered.citedLabels.includes(pr.label);
    if (!pr.alreadyCited) { recovered.citedLabels.push(pr.label); recovered.signalIds.push(labels.get(pr.label)!); }
    adopted.push(pr.label);
  }
  if (adopted.length) pass.leftOver = pass.leftOver.filter((l) => !(l.belongsTo === ordinal && adopted.includes(l.label)));
  return adopted;
}

// ── SP-635 (2026-11-24): THE "AND" / "OR" RE-ASK RETURNS ONE CLAIM PER PREDICATE ─────────────────
//
// THE MEASURED DEFECT (run 10). SP-628's re-ask kept one of the two joined things and the quotes of the
// other had no claim to go to: 12 quotes across N13 and P1 ("…long hold times or repeated calls" became
// "…long hold times" and lost the repeated-call quotes; no duration claim and no technician-error
// claim existed at all on P1).
//
// The rule: the answer is one claim per predicate. The generator puts each of the ORIGINAL's quotes
// under one or both halves; a quote it puts under neither is CARRIED to every half and the judge
// decides. Nominations follow the same rule. An answer that still joins two things, or cannot be read,
// leaves the original standing — the claim is never dropped for this (SP-581's rule, kept).

// SP-651 (2026-11-24): 1 to 6, was 1 to 4. Run 12's N15 split answer returned 5 claims and was refused on the
// count alone. Nothing else about the door changed: each returned claim still faces parseOneClaim, and an
// answer in which any part still joins two things still leaves the original standing.
export const SPLIT_MAX_HALVES = 6;
export function buildSplitReask(
  needStatement: string,
  claim: { ordinal: number; name: string; part: string; polarity: string },
  ownQuotes: ReadonlyArray<{ label: string; quote: PatternQuote }>,
): string {
  return [
    `CUSTOMER NEED: ${needStatement}`,
    "",
    'ONE of the patterns in your previous answer has a part that joins two things with "and" or "or".',
    "Every other pattern in it was accepted and is already recorded — do NOT write them again.",
    "",
    `THE PATTERN (number ${claim.ordinal} in your answer):`,
    `  claim: ${JSON.stringify(claim.name)}`,
    `  part: ${JSON.stringify(claim.part)}`,
    `  polarity: ${JSON.stringify(claim.polarity)}`,
    "",
    "A part is ONE predicate. If this part states two different things, write ONE PATTERN PER THING:",
    `each with its own claim of at most ${MAX_PATTERN_NAME_CHARS} characters, its own ONE part of at most ${MAX_PART_CHARS} characters that does not`,
    'join two things with "and" or "or", and the same polarity.',
    "Then put each of THIS PATTERN'S QUOTES (listed below) under every pattern whose part its own words",
    "state. A quote may go under more than one. A quote you put under none is kept under all of them and",
    "judged there, so leave a quote out only when you cannot tell. Use only the labels listed below.",
    "If the word does not join two separate things, return the pattern unchanged, as one pattern.",
    'Do NOT write "left_over". Do NOT cite any quote that is not listed below.',
    'JSON only: {"patterns":[{"claim":"<the first thing>","parts":["<one predicate>"],"polarity":"<same>","quotes":["<label>"]},',
    '  {"claim":"<the second thing>","parts":["<one predicate>"],"polarity":"<same>","quotes":["<label>"]}]}',
    "",
    "THIS PATTERN'S QUOTES:",
    ...ownQuotes.map((x) => `${x.label} [${x.quote.polarity ?? "unlabelled"}]: "${x.quote.quote.replace(/\s+/g, " ").trim()}"`),
  ].join("\n");
}

export type SplitOutcome = "split" | "rewritten" | "unchanged" | "still_joined" | "refused";
export type SplitHalf = {
  pattern: ProposedPattern;
  /** the original's OWN citations this half holds, and how each got there */
  assigned: string[]; carried: string[];
  /** the original's NOMINATIONS that follow to this half (assigned or carried) */
  nominated: string[];
  /** labels the answer cited that were not the original's — ignored, and named */
  foreign: string[];
};
/** SP-635: read the split answer against the original claim. `ownLabels` are the original's own
 *  citations, `nominatedLabels` the quotes that reached it through `belongs_to` alone. */
export function parseSplitReask(
  content: string,
  labels: ReadonlyMap<string, string>,
  existing: readonly ProposedPattern[],
  original: ProposedPattern,
  ownLabels: readonly string[],
  nominatedLabels: readonly string[],
  limits: GenLimits = DEFAULT_GEN_LIMITS,
): { outcome: SplitOutcome; adopt: boolean; halves: SplitHalf[]; why: string } {
  let raw: unknown[];
  try { raw = parseEnvelope(content, limits); }
  catch (e) { return { outcome: "refused", adopt: false, halves: [], why: e instanceof Error ? e.message : String(e) }; }
  if (raw.length < 1 || raw.length > SPLIT_MAX_HALVES) return { outcome: "refused", adopt: false, halves: [], why: `the split re-ask returned ${raw.length} patterns; it takes 1 to ${SPLIT_MAX_HALVES}` };
  const mine = new Set([...ownLabels, ...nominatedLabels]);
  const raws = raw.map(rawClaimOf);
  const listed = raws.map((r) => r.quotes.filter((l) => mine.has(l)));
  const anywhere = new Set(listed.flat());
  const carriedAll = [...mine].filter((l) => !anywhere.has(l));
  const origRepLabel = [...labels].find(([l, id]) => id === original.representativeSignalId && original.citedLabels.includes(l))?.[0] ?? "";
  const { usedRepresentatives, claimsSeen } = seedFromExisting(labels, existing);
  const halves: SplitHalf[] = [];
  let repGiven = false;
  try {
    raws.forEach((r, i) => {
      const final = [...new Set([...listed[i], ...carriedAll])];
      const own = final.filter((l) => ownLabels.includes(l));
      const nominated = final.filter((l) => !ownLabels.includes(l));
      if (final.length === 0) throw new GeneratorRefusal("no_quotes", `the split pattern ${JSON.stringify(r.claim.slice(0, 60))} holds none of the original's quotes`);
      // The original's representative stays with the first half that holds it.
      const rep = !repGiven && origRepLabel && final.includes(origRepLabel) ? origRepLabel : r.representative;
      if (rep === origRepLabel && origRepLabel) repGiven = true;
      // The split was asked for the same polarity; the original's is kept whatever the answer wrote.
      const pattern = parseOneClaim({ claim: r.claim, parts: r.parts, polarity: original.polarity, quotes: [...own, ...nominated], representative: rep },
        labels, usedRepresentatives, claimsSeen, limits);
      halves.push({ pattern, assigned: listed[i].filter((l) => ownLabels.includes(l)), carried: carriedAll.filter((l) => ownLabels.includes(l)), nominated, foreign: r.quotes.filter((l) => !mine.has(l)) });
    });
  } catch (e) {
    return { outcome: "refused", adopt: false, halves: [], why: e instanceof Error ? e.message : String(e) };
  }
  if (halves.some((h) => h.pattern.parts.some((p) => CONJUNCTION_IN_PART.test(p)))) {
    const same = halves.length === 1 && normalizeForHash(halves[0].pattern.name) === normalizeForHash(original.name) && halves[0].pattern.parts.join("\u0000") === original.parts.join("\u0000");
    return { outcome: same ? "unchanged" : "still_joined", adopt: false, halves, why: "" };
  }
  return { outcome: halves.length === 1 ? "rewritten" : "split", adopt: true, halves, why: "" };
}

// ── SP-638 (2026-11-24): THE SP-493 RULE — EVERY QUOTE JUDGED, THEN A VOTE ───────────────────────
//
// What stood before: one `belongs_to_this_need = false` on any quote refused the claim and stopped its
// loop. Brief 17 measured the cost and the noise: in run 10, 3 of the 6 live "no" answers came on a
// quote that did not even state the claim's part, two of them ending a claim that had just drawn a
// "yes", and the same claim drew both answers on different quotes.
//
// The rule now: all of a claim's own cited quotes are judged BEFORE the claim is decided. A belongs
// vote COUNTS only from a quote that states every part of the claim. A majority of "no" refuses the
// claim; a tie refuses; a claim with no counting vote is decided as before by its kept quotes — it
// keeps none. JUDGE_SYSTEM is untouched: the votes are the field it already returns.
export type BelongsVote = { signalId: string; statesAll: boolean; belongs: boolean | null };
export type BelongsDecision = {
  yes: number; no: number;
  notCounted: Array<{ signalId: string; why: "part not stated" | "no verdict"; belongs: boolean | null }>;
  refused: boolean; tie: boolean;
  /** what the first-no rule would have done with the same answers, in the same order */
  oldRefused: boolean; oldFirstNoAt: number | null;
};
export function decideBelongs(votes: readonly BelongsVote[]): BelongsDecision {
  let yes = 0, no = 0;
  const notCounted: BelongsDecision["notCounted"] = [];
  for (const v of votes) {
    if (v.belongs === null) { notCounted.push({ signalId: v.signalId, why: "no verdict", belongs: null }); continue; }
    if (!v.statesAll) { notCounted.push({ signalId: v.signalId, why: "part not stated", belongs: v.belongs }); continue; }
    if (v.belongs) yes++; else no++;
  }
  const answered = votes.filter((v) => v.belongs !== null);
  const firstNo = answered.findIndex((v) => v.belongs === false);
  return { yes, no, notCounted, refused: no > 0 && no >= yes, tie: no > 0 && no === yes,
    oldRefused: firstNo >= 0, oldFirstNoAt: firstNo >= 0 ? firstNo + 1 : null };
}
/** SP-638: one line per claim, for the log. */
export function belongsDecisionLine(claim: string, d: BelongsDecision, newOutcome: string, oldOutcome: string): string {
  const pn = d.notCounted.filter((x) => x.why === "part not stated");
  const nv = d.notCounted.filter((x) => x.why === "no verdict");
  return `SP-638 votes "${claim.slice(0, 54)}": yes ${d.yes} · no ${d.no}${d.tie ? " (tie)" : ""} · not counted ${d.notCounted.length}` +
    (d.notCounted.length ? ` (${[pn.length ? `${pn.length} part not stated${pn.some((x) => x.belongs === false) ? `, ${pn.filter((x) => x.belongs === false).length} of them said no` : ""}` : "", nv.length ? `${nv.length} no verdict` : ""].filter(Boolean).join("; ")})` : "") +
    ` → ${newOutcome} · first-no rule: ${oldOutcome}`;
}

/** SP-535: one quote the generator did not place, with its one clause.
 *  SP-547: plus `belongsTo` — the 1-based index of a claim IN THE SAME ANSWER that the quote does
 *  belong under, or null. */
export type LeftOverQuote = { label: string; why: string; belongsTo: number | null };

/** SP-547: a left-over entry whose `belongs_to` named a claim, and what became of it. `resolved`
 *  false means the index named no surviving claim — out of range, or a claim SP-542 dropped. */
export type PromotedQuote = {
  label: string; belongsTo: number; why: string; resolved: boolean; claim: string;
  /** SP-569: true when the generator had ALSO cited this label under that claim itself. Such a quote
   *  is one of the claim's own citations and is judged with them; only a quote that reaches the claim
   *  through `belongs_to` ALONE is deferred until the claim is known to be kept. */
  alreadyCited: boolean;
};

/** SP-535: the generator's answer as a PASS — its patterns and its account of the rest.
 *  SP-547: `promoted` is the entries that became citations. */
export type GeneratedPass = {
  patterns: ProposedPattern[]; leftOver: LeftOverQuote[]; dropped: DroppedClaim[]; promoted: PromotedQuote[];
  /** SP-618(a): how many `left_over` lists were found nested inside `patterns` and lifted out. */
  nestedLeftOver?: number;
};

/** SP-535: parse an answer AND its `left_over`, through SP-542's lenient claim reading.
 *  `parseGenerated` above remains the STRICT reading and the specification of each refusal kind.
 *
 *  A left-over label the call was never given is a FABRICATION and refuses the answer, exactly as a
 *  fabricated citation does — "q9" invented in `left_over` would otherwise read as an account of a
 *  quote that does not exist. */
export function parseGeneratedPass(
  content: string,
  labels: ReadonlyMap<string, string>,
  /** SP-553: what the pass already holds. A decomposition rewrite is read through THIS function, so it
   *  faces SP-547's `belongs_to`, SP-542's per-claim drop and SP-537(a)'s duplicate gate exactly as a
   *  first answer does — which is what "the rewrite faces every gate" means mechanically. */
  existing: readonly ProposedPattern[] = [],
  limits: GenLimits = DEFAULT_GEN_LIMITS,
): GeneratedPass {
  // SP-542: the LENIENT reading — a refused claim is dropped and named, the pass keeps the rest.
  const { patterns, dropped, ordinals } = parseGeneratedLenient(content, labels, existing, limits);
  // SP-618(a): through the envelope, so a `left_over` list nested inside `patterns` is read.
  const env = readEnvelope(content, limits);
  const raw = env.leftOver;
  const entries: LeftOverQuote[] = [];
  if (Array.isArray(raw)) {
    for (const e of raw) {
      if (typeof e === "string") { entries.push({ label: e.trim(), why: "", belongsTo: null }); continue; }
      const label = String((e as { quote?: unknown; label?: unknown })?.quote ?? (e as { label?: unknown })?.label ?? "").trim();
      const why = String((e as { why?: unknown; reason?: unknown })?.why ?? (e as { reason?: unknown })?.reason ?? "").replace(/\s+/g, " ").trim();
      // SP-547: `belongs_to` is READ AS A NUMBER AND NOTHING ELSE. The ruling says no parsing of the
      // reason text, and that is the whole point of the field: brief 5 measured four quotes lost to a
      // left-over reason of the form "covered by <claim>" that nothing checked against the citations,
      // one of them SP-462 (c)'s own reference quote. A claim named in prose is not a citation; an
      // index is. A non-integer, zero or negative value is read as null — it names no claim.
      const btRaw = (e as { belongs_to?: unknown; belongsTo?: unknown })?.belongs_to ?? (e as { belongsTo?: unknown })?.belongsTo;
      const bt = typeof btRaw === "number" && Number.isInteger(btRaw) && btRaw > 0 ? btRaw
        : typeof btRaw === "string" && /^[1-9][0-9]*$/.test(btRaw.trim()) ? Number(btRaw.trim())
        : null;
      if (label) entries.push({ label, why, belongsTo: bt });
    }
  }
  const unknown = entries.map((l) => l.label).filter((l) => !labels.has(l));
  if (unknown.length) {
    throw new GeneratorRefusal("citation", `\`left_over\` names ${unknown.length} label(s) that were not in this pass's input: ${unknown.slice(0, 3).join(", ")}`);
  }

  // SP-547: A NON-NULL `belongs_to` IS A CITATION. The quote is added to that claim's cited labels and
  // is judged like any other citation — it is not a left-over quote at all, so it leaves `leftOver`
  // and the accounting counts it as cited. An index that names no surviving claim CANNOT be promoted
  // (there is nothing to cite it under); it stays left over, `resolved: false`, and is reported.
  const byOrdinal = new Map<number, ProposedPattern>();
  ordinals.forEach((o, i) => byOrdinal.set(o, patterns[i]));
  const promoted: PromotedQuote[] = [];
  const leftOver: LeftOverQuote[] = [];
  for (const e of entries) {
    if (e.belongsTo === null) { leftOver.push(e); continue; }
    const target = byOrdinal.get(e.belongsTo);
    if (!target) {
      promoted.push({ label: e.label, belongsTo: e.belongsTo, why: e.why, resolved: false, claim: "", alreadyCited: false });
      leftOver.push(e);
      continue;
    }
    const alreadyCited = target.citedLabels.includes(e.label);
    if (!alreadyCited) {
      target.citedLabels.push(e.label);
      target.signalIds.push(labels.get(e.label)!);
    }
    promoted.push({ label: e.label, belongsTo: e.belongsTo, why: e.why, resolved: true, claim: target.name, alreadyCited });
  }
  return { patterns, leftOver, dropped, promoted, nestedLeftOver: env.nested };
}

// ── SP-569: `belongs_to` RESOLVES AFTER THE JUDGE ────────────────────────────────────────────────
//
// THE MEASURED DEFECT (run 7, 2026-11-22). `parseGeneratedPass` above binds a left-over quote to the
// claim it names BEFORE anything is judged, and the run printed "6 became citations, 0 named no kept
// claim" from that binding. Two of the six (N13 75d3e101, P1 04adf671) had named a claim that SP-493
// then refused, so the citation was void and the quote went back to unassigned with nothing saying
// why: the line was true when it was written and false by the end of the run.
//
// SP-569: a left-over quote can only become a citation on a KEPT claim, and the printed count must be
// true at the end of the run. So the binding above is now a NOMINATION. The runner judges a claim on
// its OWN citations first (`splitDeferredCitations`), judges the nominated quotes only once the claim
// has a supporting quote of its own, and states what became of each one AFTER the judge
// (`resolveBelongsToAfterJudging`) — which is the only moment the answer is known.

/** What became of ONE claim once the judge had run. Recorded by the runner at every exit of its judge
 *  loop; a claim with no fate was never judged at all. */
export type ClaimFate = {
  kept: boolean;
  /** Why it was dropped, in the runner's own words ("SP-493: …", "judge kept 0 of 3"). "" when kept. */
  dropReason: string;
  /** The quotes the judge returned a verdict on under this claim. */
  judgedSignalIds: readonly string[];
  /** Of those, the ones where every part stated. */
  supportingSignalIds: readonly string[];
  /** SP-578: nominated quotes the judge read and said are not this need's. Each lost its nomination
   *  and nothing else: it is neither judged-under nor supporting, and the claim's fate is unmoved. */
  voidedSignalIds?: readonly string[];
};

export type BelongsToEntry = {
  need: string; polarity: string; label: string; signalId: string;
  belongsTo: number; claim: string; resolved: boolean; why: string;
  /** SP-616: true when the entry came from an SP-553 decomposition answer, so the claim it names is a
   *  REWRITE. A rewrite has no entry in the originals' fates (it never overwrites its original's), and
   *  run 8 read that absence as "later dropped" for three nominations whose rewrite claim was kept. */
  fromRewrite?: boolean;
};

/** - `cited_supports`       the claim was kept and this quote supports it — a citation that counts
 *  - `cited_not_supporting` the claim was kept, the quote was judged under it, and a part was not stated
 *  - `kept_no_verdict`      the claim was kept and the judge gave no readable verdict on this quote
 *  - `nomination_voided`    SP-578: the claim was kept on its own citations; the judge said THIS quote is
 *                           not this need's, so the nomination is void and the quote stays left over
 *  - `rewrite_kept`         SP-616: the quote named a KEPT SP-553 rewrite claim. A rewrite has no
 *                           nominations — the quote is one of its own citations and was judged as one —
 *                           so it is counted apart from the nominations on an original claim
 *  - `claim_dropped`        the quote named a claim that was LATER DROPPED — it is not a citation
 *  - `named_no_claim`       the index named no claim the generator wrote (out of range, or refused) */
export type BelongsToOutcome = "cited_supports" | "cited_not_supporting" | "kept_no_verdict" | "nomination_voided" | "rewrite_kept" | "claim_dropped" | "named_no_claim";
/** `rewriteVerdict` is set on `rewrite_kept` only: what the judge said of this quote under the rewrite. */
export type ResolvedBelongsTo = BelongsToEntry & { outcome: BelongsToOutcome; dropReason: string; rewriteVerdict?: "supports" | "not_supporting" | "no_verdict" };

export const belongsToClaimKey = (need: string, polarity: string, claim: string) => `${need}\u0000${polarity}\u0000${claim}`;

/** SP-569: a claim's citations, its OWN first and the `belongs_to` nominations last. The order is the
 *  rule: the judge loop reads them in this order, so by the time it reaches a nominated quote it knows
 *  whether the claim has a supporting quote of its own. */
export function splitDeferredCitations(
  signalIds: readonly string[], deferred: ReadonlySet<string>,
): { own: string[]; deferred: string[] } {
  return {
    own: signalIds.filter((id) => !deferred.has(id)),
    deferred: signalIds.filter((id) => deferred.has(id)),
  };
}

/** SP-578 (2026-11-23): WHAT ONE `belongs_to_this_need` ANSWER DOES TO THE JUDGE LOOP.
 *
 *  SP-493 stands: `belongs_to_this_need` is a verdict about the CLAIM, and one false on a quote the
 *  claim itself cited drops the claim. What SP-578 changes is whose false it is. A NOMINATED quote
 *  (SP-547 / SP-569) was put under the claim by the generator's left-over list, not by the claim's own
 *  citations, and SP-569 judges it only after the claim has a supporting quote of its own. Brief 9
 *  found that a false there still dropped the kept claim — a quote the claim never cited could undo
 *  the quotes it did. So a false on a nominated quote VOIDS THAT NOMINATION and nothing else.
 *
 *  `ownSupporting` is the fail-safe: the void applies only while the claim stands on its own
 *  citations. The runner never judges a nomination otherwise (SP-569), but if one ever were, its false
 *  is an ordinary SP-493 false — this function does not rely on the caller's ordering to stay safe.
 *
 *  A pure function, so the rule is testable: the judge loop cannot run without a model call. */
export type BelongsVerdictEffect = "none" | "void_nomination" | "drop_claim";
export function belongsVerdictEffect(a: { belongsToNeed: boolean; nominated: boolean; ownSupporting: number }): BelongsVerdictEffect {
  if (a.belongsToNeed === true) return "none";
  return a.nominated && a.ownSupporting > 0 ? "void_nomination" : "drop_claim";
}

/** SP-616: a claim's supporting quotes so far, its OWN citations apart from the nominations already
 *  judged. Run 8 printed "stands on 4 supporting citation(s) of its own" where 3 were the claim's own
 *  and 1 was an earlier nomination that supported: the runner counted every supporting verdict. The
 *  SP-578 fail-safe (`belongsVerdictEffect`'s `ownSupporting`) is fed from `own` here too, so it means
 *  what its name says. */
export function supportingByOrigin(
  verdicts: ReadonlyArray<{ signalId: string; supports: boolean }>, nominated: ReadonlySet<string>,
): { own: number; nominated: number } {
  const sup = verdicts.filter((v) => v.supports);
  const nom = sup.filter((v) => nominated.has(v.signalId)).length;
  return { own: sup.length - nom, nominated: nom };
}

/** SP-578: the line the run prints at the quote whose nomination was voided.
 *  SP-616: `ownSupporting` is the claim's own citations only; an earlier nomination that supported is
 *  named separately, and only when there is one. */
export function voidedNominationLine(signalId: string, reason: string, ownSupporting: number, nominatedSupporting = 0): string {
  return `SP-578 nomination ${signalId.slice(0, 8)} VOIDED — the judge says this quote is not this need's: ${JSON.stringify(reason)}. ` +
    `The claim stands on ${ownSupporting} supporting citation(s) of its own` +
    `${nominatedSupporting ? ` and ${nominatedSupporting} earlier nomination(s) that supported` : ""}.`;
}

export const NEVER_JUDGED = "never judged (cut by the ceiling, dropped before the judge, or a generate-only run)";

/** SP-569: the outcome of every `belongs_to` entry, computed from the claims' fates AFTER the judge.
 *  SP-616: an entry from a decomposition answer (`fromRewrite`) is resolved against `rewriteFates` and
 *  never against the originals' — a rewrite may carry its original's claim text, and the original was
 *  dropped. A kept rewrite is `rewrite_kept`; a dropped or never-judged one is `claim_dropped`. */
export function resolveBelongsToAfterJudging(
  entries: readonly BelongsToEntry[], fates: ReadonlyMap<string, ClaimFate>,
  rewriteFates: ReadonlyMap<string, ClaimFate> = new Map(),
): ResolvedBelongsTo[] {
  return entries.map((e) => {
    if (!e.resolved) return { ...e, outcome: "named_no_claim" as const, dropReason: "" };
    if (e.fromRewrite) {
      const rf = rewriteFates.get(belongsToClaimKey(e.need, e.polarity, e.claim));
      if (!rf) return { ...e, outcome: "claim_dropped" as const, dropReason: NEVER_JUDGED };
      if (!rf.kept) return { ...e, outcome: "claim_dropped" as const, dropReason: rf.dropReason };
      const rewriteVerdict = rf.supportingSignalIds.includes(e.signalId) ? "supports" as const
        : rf.judgedSignalIds.includes(e.signalId) ? "not_supporting" as const : "no_verdict" as const;
      return { ...e, outcome: "rewrite_kept" as const, dropReason: "", rewriteVerdict };
    }
    const fate = fates.get(belongsToClaimKey(e.need, e.polarity, e.claim));
    if (!fate) return { ...e, outcome: "claim_dropped" as const, dropReason: NEVER_JUDGED };
    if (!fate.kept) return { ...e, outcome: "claim_dropped" as const, dropReason: fate.dropReason };
    // SP-578: tested BEFORE support, so a voided quote can never read as a citation that counts.
    if (fate.voidedSignalIds?.includes(e.signalId)) return { ...e, outcome: "nomination_voided" as const, dropReason: "" };
    if (fate.supportingSignalIds.includes(e.signalId)) return { ...e, outcome: "cited_supports" as const, dropReason: "" };
    if (fate.judgedSignalIds.includes(e.signalId)) return { ...e, outcome: "cited_not_supporting" as const, dropReason: "" };
    return { ...e, outcome: "kept_no_verdict" as const, dropReason: "" };
  });
}

/** SP-569: the one summary line, built from the outcomes and from nothing else — so it cannot say
 *  something the per-entry lines under it do not. */
export function belongsToSummaryLine(resolved: readonly ResolvedBelongsTo[]): string {
  const n = (o: BelongsToOutcome) => resolved.filter((r) => r.outcome === o).length;
  const onKept = n("cited_supports") + n("cited_not_supporting") + n("kept_no_verdict");
  return `SP-547 / SP-569: ${resolved.length} left-over entr(ies) named a claim with \`belongs_to\` — ` +
    `${onKept} became citations on a KEPT claim (${n("cited_supports")} support it, ${n("cited_not_supporting")} do not` +
    `${n("kept_no_verdict") ? `, ${n("kept_no_verdict")} got no verdict` : ""}) · ` +
    `${n("nomination_voided") ? `${n("nomination_voided")} nomination(s) voided (SP-578) · ` : ""}` +
    // SP-616: counted apart, and printed only when there is one — the line is otherwise SP-569's.
    `${n("rewrite_kept") ? `${n("rewrite_kept")} named a KEPT rewrite claim (SP-553; ` +
      `${resolved.filter((r) => r.rewriteVerdict === "supports").length} support it, ` +
      `${resolved.filter((r) => r.rewriteVerdict === "not_supporting").length} do not` +
      `${resolved.some((r) => r.rewriteVerdict === "no_verdict") ? `, ${resolved.filter((r) => r.rewriteVerdict === "no_verdict").length} got no verdict` : ""}) · ` : ""}` +
    `${n("claim_dropped")} named a claim that was later dropped · ${n("named_no_claim")} named no claim:`;
}

/** SP-535: THE ACCOUNTING. Every label in the pass is cited under a claim or left over — once.
 *
 *  Reporting only, never a gate: it returns what is wrong so the runner can spend ONE re-ask and then
 *  print what still fails. A quote cited under TWO claims is fine and is not reported — a quote can
 *  support two patterns. What is not fine is a quote in neither list, a quote in both, or a quote
 *  listed twice in `left_over`. */
export function accountForQuotes(
  labels: ReadonlyMap<string, string>,
  patterns: readonly ProposedPattern[],
  leftOver: readonly LeftOverQuote[],
): { missing: string[]; both: string[]; duplicatedLeftOver: string[]; noReason: string[]; cited: number; accounted: number } {
  const cited = new Set<string>();
  for (const p of patterns) for (const l of p.citedLabels) cited.add(l);
  const loCount = new Map<string, number>();
  for (const l of leftOver) loCount.set(l.label, (loCount.get(l.label) ?? 0) + 1);
  const all = [...labels.keys()];
  return {
    missing: all.filter((l) => !cited.has(l) && !loCount.has(l)),
    both: all.filter((l) => cited.has(l) && loCount.has(l)),
    duplicatedLeftOver: [...loCount.entries()].filter(([, n]) => n > 1).map(([l]) => l),
    noReason: leftOver.filter((l) => !l.why).map((l) => l.label),
    cited: cited.size,
    accounted: all.filter((l) => cited.has(l) || loCount.has(l)).length,
  };
}

/** SP-535: what to tell the generator when its accounting does not add up. Not a `RefusalKind`: it is
 *  never thrown, and SP-525's lesson is that a kind nothing throws gets re-implemented. */
export const LEFT_OVER_REASK =
  "Your answer does not account for every quote. Every label you were given must appear exactly once: cited under a claim, or in `left_over` with one clause saying why. Keep the same claims and the same citations; only complete the account.";


/** SP-618(b) (2026-11-24): THE ACCOUNTING RE-ASK GIVES AN ACCOUNT, NEVER CLAIMS.
 *
 *  THE MEASURED DEFECT (run 8, N13). `LEFT_OVER_REASK` says "Keep the same claims and the same
 *  citations; only complete the account". The second answer did not: it wrote 12 new claims, and the
 *  runner — which took the second answer WHOLE when its account was better — discarded the first
 *  answer's 7. N15's re-ask also returned different claims (12 against 10); it was not taken only
 *  because its account happened to be worse.
 *
 *  So the first answer's claims and citations ALWAYS stand, and the second answer is read for one
 *  thing: where it puts each label the first answer left unaccounted.
 *    - left over in the second answer            → left over here, with the second answer's reason
 *    - cited (or `belongs_to`) under a claim the first answer ALSO has (same claim text)
 *                                                → NOMINATED for that claim (SP-569: judged last, and
 *                                                  only if the claim keeps a quote of its own)
 *    - cited only under claims the first answer does NOT have
 *                                                → stays UNACCOUNTED and is reported as an orphan with
 *                                                  the claim it pointed to. No claim is taken from the
 *                                                  second answer to hold it.
 *    - not in the second answer either           → stays unaccounted
 *  A label the first answer both cited and left over, or listed twice, is left as it is and reported.
 *  `first` is not mutated. */
export type ReaskAccountMerge = {
  pass: GeneratedPass;
  adoptedLeftOver: LeftOverQuote[];
  nominated: Array<{ label: string; claim: string }>;
  orphaned: Array<{ label: string; claim: string }>;
  stillMissing: string[];
  /** the second answer's claims, by whether the first answer has the same claim text */
  secondSame: string[]; secondNew: string[];
};

export function completeAccountFromReask(
  labels: ReadonlyMap<string, string>,
  first: GeneratedPass,
  second: GeneratedPass,
): ReaskAccountMerge {
  const patterns: ProposedPattern[] = first.patterns.map((p) => ({ ...p, parts: [...p.parts], signalIds: [...p.signalIds], citedLabels: [...p.citedLabels] }));
  const byClaim = new Map(patterns.map((p, i) => [normalizeForHash(p.name), { p, ordinal: i + 1 }] as const));
  const leftOver = [...first.leftOver];
  const promoted = [...first.promoted];
  const before = accountForQuotes(labels, patterns, leftOver);
  const adoptedLeftOver: LeftOverQuote[] = [];
  const nominated: Array<{ label: string; claim: string }> = [];
  const orphaned: Array<{ label: string; claim: string }> = [];
  const stillMissing: string[] = [];
  for (const label of before.missing) {
    const citing = second.patterns.filter((p) => p.citedLabels.includes(label));
    const shared = citing.map((p) => byClaim.get(normalizeForHash(p.name))).filter((x): x is { p: ProposedPattern; ordinal: number } => !!x);
    if (shared.length) {
      for (const t of shared) {
        t.p.citedLabels.push(label);
        t.p.signalIds.push(labels.get(label)!);
        const why = second.promoted.find((x) => x.label === label && x.resolved)?.why || "cited under this claim by the accounting re-ask (SP-618)";
        promoted.push({ label, belongsTo: t.ordinal, why, resolved: true, claim: t.p.name, alreadyCited: false });
        nominated.push({ label, claim: t.p.name });
      }
      continue;
    }
    if (citing.length) { orphaned.push({ label, claim: citing[0].name }); continue; }
    const lo = second.leftOver.find((l) => l.label === label);
    if (lo) { const e = { label, why: lo.why, belongsTo: null }; leftOver.push(e); adoptedLeftOver.push(e); continue; }
    stillMissing.push(label);
  }
  const firstClaims = new Set(first.patterns.map((p) => normalizeForHash(p.name)));
  return {
    pass: { patterns, leftOver, dropped: [...first.dropped], promoted, nestedLeftOver: first.nestedLeftOver ?? 0 },
    adoptedLeftOver, nominated, orphaned, stillMissing,
    secondSame: second.patterns.filter((p) => firstClaims.has(normalizeForHash(p.name))).map((p) => p.name),
    secondNew: second.patterns.filter((p) => !firstClaims.has(normalizeForHash(p.name))).map((p) => p.name),
  };
}

/** SP-553 (2026-11-22): THE DECOMPOSITION RE-ASK — READ FROM THE VERDICTS, NEVER FROM THE WORDS.
 *
 *  WHAT IT IS FOR, measured in brief 6 §14a. v3's contract is that a quote supports a pattern only if
 *  it states EVERY part. P1's three biggest claims then kept nothing at all while all 31 of their part
 *  verdicts were CORRECT, because their parts are alternatives rather than conjuncts: *"Outages are not
 *  credited or compensated"* was split into `automatic credits are not applied` and `statement credits
 *  never arrive`, and a quote says one or the other. Seven quotes, a true claim, zero support. The same
 *  shape cost N13 its hold-time claim (part 1 stated 3 of 3, part 2 `customers spend hours on the phone`
 *  0 of 3 — the same fact at another magnitude) and P2 its video claim.
 *
 *  THE TRIGGER IS THE VERDICT TABLE. I proposed gating claims whose text contains "or"; SP-553 declined
 *  it, and the ruling is better: a claim's wording is the generator's business, and "or" appears in
 *  claims that judge perfectly well. What is observable is the shape of the failure — no quote states
 *  all the parts, but some quote states some part. That is read here from the per-part rows and nothing
 *  else; `name` is never inspected.
 *
 *  WHAT DOES NOT TRIGGER, and why each matters:
 *    - a claim some quote supports: it is kept, there is nothing to repair;
 *    - a claim NO part of which is stated anywhere: the generator wrote something the quotes do not
 *      say, and re-asking would invite it to invent a claim that fits. It is dropped and named, as
 *      SP-542 leaves it;
 *    - a one-part claim: if its single part were stated by any quote, that quote would support it, so
 *      a dropped one-part claim always has `stated` empty. The arithmetic, not a special case.
 *  One round only: a rewrite is not itself decomposed. */
export type PartSupport = { ordinal: number; part: string; signalIds: string[] };
export type DecompositionSplit = {
  /** parts some quote states, with the quotes that state them. Never empty when this is non-null. */
  stated: PartSupport[];
  /** parts no quote states. May be empty — the "alternatives" case has every part stated, by
   *  DIFFERENT quotes, and no single quote stating all of them. */
  unstated: Array<{ ordinal: number; part: string }>;
};

export function decompositionTrigger(
  parts: readonly string[],
  verdicts: ReadonlyArray<{ signalId: string; parts: ReadonlyArray<{ ordinal: number; states: boolean }> }>,
): DecompositionSplit | null {
  if (parts.length === 0 || verdicts.length === 0) return null;
  const states = (v: { parts: ReadonlyArray<{ ordinal: number; states: boolean }> }, ordinal: number) =>
    v.parts.find((x) => x.ordinal === ordinal)?.states === true;
  // `supports` as the contract defines it, recomputed here rather than taken from a caller's boolean:
  // this function is the trigger's whole definition and must not depend on someone else's arithmetic.
  if (verdicts.some((v) => parts.every((_, i) => states(v, i + 1)))) return null;
  const stated: PartSupport[] = [];
  const unstated: Array<{ ordinal: number; part: string }> = [];
  parts.forEach((part, i) => {
    const ids = verdicts.filter((v) => states(v, i + 1)).map((v) => v.signalId);
    if (ids.length) stated.push({ ordinal: i + 1, part, signalIds: ids });
    else unstated.push({ ordinal: i + 1, part });
  });
  if (stated.length === 0) return null;
  return { stated, unstated };
}

/** SP-553: the re-ask itself. It states WHICH parts were stated BY WHICH QUOTES and which by none, and
 *  asks for separate claims or for the unsupported part to be removed.
 *
 *  Quotes are named by their LABEL and their short signal id together. The ruling says "quote ids"; the
 *  generator's own vocabulary is labels, and the citation gate refuses anything else (`parseOneClaim`),
 *  so the label is what it can act on and the id is there to make the prompt readable against the run's
 *  own report. It is told nothing about which rewrite to prefer beyond the ruling's two options. */
export function buildDecompositionReask(
  needStatement: string,
  quotes: readonly PatternQuote[],
  p: { name: string; parts: readonly string[]; polarity: QuotePolarity },
  split: DecompositionSplit,
  labels: ReadonlyMap<string, string>,
): string {
  const labelOf = new Map<string, string>();
  for (const [label, id] of labels) if (!labelOf.has(id)) labelOf.set(id, label);
  const cite = (id: string) => `${labelOf.get(id) ?? "?"} (id ${id.slice(0, 8)})`;
  const byOrdinal = new Map<number, PartSupport>(split.stated.map((x) => [x.ordinal, x]));
  return [
    `CUSTOMER NEED: ${needStatement}`,
    "",
    "A pattern is supported by a quote ONLY IF that quote states EVERY one of its parts. One of your",
    "patterns was judged against each of its quotes and NO quote stated all of its parts, so it was",
    "dropped — but parts of it ARE stated:",
    "",
    `THE DROPPED PATTERN: ${JSON.stringify(p.name)}`,
    ...p.parts.map((part, i) => {
      const hit = byOrdinal.get(i + 1);
      return hit
        ? `  part ${i + 1} ${JSON.stringify(part)} — STATED by ${hit.signalIds.map(cite).join(", ")}`
        : `  part ${i + 1} ${JSON.stringify(part)} — STATED BY NO QUOTE`;
    }),
    "",
    "Rewrite it so that every pattern you return is supported by at least one quote that states ALL of",
    "its parts. Either:",
    "  (a) the parts are DIFFERENT MECHANISMS — return them as separate patterns, one mechanism each,",
    "      each citing only the quotes that state it; or",
    "  (b) a part is stated by no quote — remove that part, and keep the claim the quotes do support.",
    "Do not widen the claim to cover both, and do not keep a part no quote states.",
    "",
    `Return 1 to ${MAX_PARTS_PER_PATTERN} patterns and nothing else. Every one carries polarity ${JSON.stringify(p.polarity)}.`,
    "Cite only the quote labels you were given (q1, q2, ...). Every pattern you return replaces the",
    "dropped one; the need's other patterns are already recorded — do NOT write them again.",
    `JSON only: {"patterns":[{"claim":"<=${MAX_PATTERN_NAME_CHARS} chars","parts":["<predicate>"],"polarity":${JSON.stringify(p.polarity)},`,
    '  "quotes":["q1"],"representative":"q1"}],"left_over":[]}',
    "",
    "THE QUOTES, for reference:",
    ...quotes.map((qt, i) => qline(qt, i)),
  ].join("\n");
}

// ── SP-556: AN EMPTY JUDGE ANSWER EARNS ONE RETRY, AND A SECOND EMPTY IS NAMED ──────────────────

/** An empty answer arrives as a THROWN Error, not as `""`. `callOllamaJson` raises
 *  `"<lane> model call returned empty content (<model>)"` the moment `message.content` is blank —
 *  deliberately, because a silent empty string would parse as an unreadable verdict and be indexed
 *  as a judgement. So the retry has to be built on the error, and it must not swallow any OTHER
 *  error: an HTTP failure, a timeout and a cut answer are all different faults with different
 *  remedies, and retrying them at a bigger budget would hide them. */
export function isEmptyAnswerError(e: unknown): boolean {
  return e instanceof Error && /returned empty content/.test(e.message);
}

/** SP-556 (2026-11-22): ONE retry at a bigger budget, then fail closed BY NAME.
 *
 *  WHY IT EXISTS. The judge of record thinks (SP-555), and `message.thinking` shares the `num_predict`
 *  budget with the answer. Run 6 measured the consequence at 4,000: 8 of 146 groups (5.5%) spent the
 *  whole budget thinking and returned no answer at all. Those 8 were dropped from the arm's figures —
 *  which is the safe direction, but it is 5.5% of the evidence silently absent from a measurement,
 *  and on a run that WROTE rows it would be 5.5% of the layer missing with no record of why.
 *
 *  ONE retry, not a loop: the empty answer is a budget fault, so a second attempt with room is a fair
 *  question and a third is a worse way of asking a question that does not fit. A pair that is empty
 *  twice fails CLOSED — no verdict, no support — and `onEmpty` is handed the fact so the caller can
 *  name the quote in its output. Both counts are reported (SP-556's own words).
 *
 *  Each attempt is a real model call: the caller's `call` ledgers it, so a retry is its own row in
 *  `model_calls` and SP-518's reconciliation sees two calls, never one. */
export async function callJudgeWithEmptyRetry(args: {
  call: (system: string, user: string, numPredict: number) => Promise<string>;
  system: string;
  user: string;
  first?: number;
  retry?: number;
  onEmpty?: (ev: { recovered: boolean }) => void;
}): Promise<string> {
  const first = args.first ?? JUDGE_NUM_PREDICT;
  const retry = args.retry ?? JUDGE_NUM_PREDICT_RETRY;
  try {
    return await args.call(args.system, args.user, first);
  } catch (e) {
    if (!isEmptyAnswerError(e)) throw e;
    let out: string;
    try {
      out = await args.call(args.system, args.user, retry);
    } catch (e2) {
      // Empty twice: fail closed, and say so. A non-empty failure on the retry is re-thrown as
      // itself — the caller must not read a timeout as "the judge had nothing to say".
      if (isEmptyAnswerError(e2)) args.onEmpty?.({ recovered: false });
      throw e2;
    }
    args.onEmpty?.({ recovered: true });
    return out;
  }
}

// ── SP-558: AN ARM COLUMN IDENTICAL TO THE LIVE COLUMN ON EVERY ROW IS A BUG, NOT A RESULT ──────

/** SP-558 (2026-11-22): the guard for the defect brief 7 §9c found.
 *
 *  `sp527-disagreement-recheck.ts` printed a second judge's per-pattern support as a verbatim copy of
 *  the judge of record's, on all 54 rows, because one line overwrote the field the join read. The
 *  numbers in its JSON were right; the table a reader would quote was wrong, and it said "this judge
 *  changes nothing" on a run where the two judges differed on 17 of 54 patterns.
 *
 *  The symptom is cheap to assert: a second model, judging real pairs, does not agree with the first
 *  on every single row. One row proves nothing (two judges agreeing once is ordinary), so this needs
 *  at least two rows before it will fail, and a table where every row is identical fails the RUN. */
export function armColumnIsIdentical(
  rows: ReadonlyArray<{ live: number; arm: number }>,
  minRows = 2,
): boolean {
  if (rows.length < minRows) return false;
  return rows.every((r) => r.live === r.arm);
}

/** SP-647 (2026-11-24): the one summary of what the "and"/"or" re-asks did. Run 11 printed the SP-628
 *  line with the pre-SP-635 arithmetic — "0 rewritten, 13 left as written" beside 8 splits. An outcome
 *  is `split`, `rewritten`, or anything else (still_joined, unchanged, refused, unreadable), which
 *  leaves the original as written. */
export function conjunctionSummary(outcomes: readonly string[]): { split: number; rewritten: number; leftAsWritten: number; text: string } {
  const split = outcomes.filter((o) => o === "split").length;
  const rewritten = outcomes.filter((o) => o === "rewritten").length;
  const leftAsWritten = outcomes.length - split - rewritten;
  return { split, rewritten, leftAsWritten, text: `${split} split, ${rewritten} rewritten as one claim, ${leftAsWritten} left as written` };
}
