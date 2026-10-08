// ── THE CLASS FACT-CHECK (operator ruling, signed 2026-10-07, tightening 1a-4) ───────────────────
//
// S2 is unchanged and stays verbatim. What changed is the ENFORCEMENT: on the first live Edgewood run
// the judge cleared "sole Level 14 residential facility in Northern California" as "appropriately
// framed as an openly-held reading", with the same boilerplate reason on every field. A label that
// clears anything protects nothing.
//
// So an `our_read` field now passes class_ok only if ONE of these holds:
//   (b) SOURCED — every SPECIFIC in it is verbatim-sourced in a cited row of class `record` or `you`.
//       Deterministic, free, and it runs FIRST: the judge is asked only about fields that fail it.
//   (a) HEDGED — the judge finds it written as an openly-held reading.
// Unhedged AND unsourced is refused, naming the unsourced specifics.
//
// 3A STAYS REFUSED and this is not it. There is no banned-word list and nothing is forbidden by
// vocabulary: a specific is a TRIGGER FOR A SOURCING REQUIREMENT, never a prohibition. "The only
// youth CSU in the Bay Area" is admitted the moment a record row says so; it is refused only when we
// are the ones who said it first. That distinction is the whole point — the September run called
// Edgewood "one of very few level-14 facilities", the September-11 run called it "sole", and no
// source changed in between. "sole" is what this check catches; "level 14 residential facility" and
// "northern california" are sourced to the mightycause row and pass.
//
// VERBATIM is not re-implemented here: verbatimProvable (ownWordsExtract.ts:101, the Sep-18
// deterministic guard) is the one authority, normalizing both sides through normalizeForHash.
import { verbatimProvable } from "./ownWordsExtract.ts";

export type SpecificKind = "exclusivity" | "figure" | "reach" | "unresolved";
export type Specific = {
  kind: SpecificKind;
  /** the word or phrase that makes the sentence a factual assertion */
  token: string;
  /** the probes tried against the cited rows, longest first. NEVER one word alone: a bare "only"
   *  appears in half the corpus and would make the check pass trivially. */
  probes: string[];
};

// Words that assert a position rather than describe one. Matched whole-word, any case.
const EXCLUSIVITY = [
  "only", "sole", "solely", "first", "largest", "biggest", "smallest", "best", "leading",
  "premier", "foremost", "unmatched", "unrivaled", "unrivalled", "unique", "exclusive",
];
// Scope words that make a claim about REACH on their own.
const REACH = ["statewide", "nationwide", "countywide", "citywide", "regionwide", "nationally"];

const EXCL_RE = new RegExp(`\\b(${EXCLUSIVITY.join("|")})\\b`, "gi");
const REACH_RE = new RegExp(`\\b(${REACH.join("|")})\\b`, "gi");
const FIGURE_RE = /\b(\d[\d,.]*\+?%?)\b/g;
// A REACH CLAIM is a named place reached through SCOPE language — "in the Bay Area", "across
// California", "serving Northern California". A capitalised phrase on its own is NOT a reach claim:
// "Crisis Stabilization Unit" is a service name and naming it asserts no reach, so matching every
// capitalised phrase would make the unsourced list noise instead of evidence. The operator's four
// categories are superlatives, figures, reach claims and exclusivity words — nothing else.
// A lowercase MODIFIER before the capitalised head is allowed: the record writes "in northern
// California" and our read writes "in Northern California", and a check that saw only one of them
// would refuse the sourced case. A phrase with no capitalised head is not a place ("in the record").
const SCOPE_PLACE_RE = /\b(in|across|throughout|within|serving|for|covering)\s+(?:the\s+)?((?:[a-z]+\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;

const WORD_RE = /[A-Za-z0-9][A-Za-z0-9'’\-]*/g;
function wordsFrom(text: string, fromIndex: number): string[] {
  const tail = text.slice(fromIndex);
  return (tail.match(WORD_RE) ?? []).slice(0, 8);
}

/** The probes for a token at `at`: the token plus its next 1-3 words, longest first. A probe is
 *  never shorter than two words, so no single word can source itself. */
function probesFor(text: string, at: number, token: string): string[] {
  const after = wordsFrom(text, at + token.length);
  const out: string[] = [];
  for (const n of [3, 2, 1]) {
    if (after.length >= n) out.push([token, ...after.slice(0, n)].join(" "));
  }
  return out;
}

/** Every SPECIFIC in a line: the exclusivity words, the figures, the reach words and the named
 *  places. Order is stable (position in the text) so a report reads in sentence order. */
export function extractSpecifics(text: string): Specific[] {
  const t = String(text ?? "");
  const out: Specific[] = [];
  const push = (kind: SpecificKind, token: string, at: number, probes?: string[]) => {
    out.push({ kind, token, probes: probes ?? probesFor(t, at, token) });
  };
  for (const m of t.matchAll(EXCL_RE)) push("exclusivity", m[1], m.index ?? 0);
  for (const m of t.matchAll(FIGURE_RE)) push("figure", m[1], m.index ?? 0);
  for (const m of t.matchAll(REACH_RE)) push("reach", m[1], m.index ?? 0, [m[1]]);
  // the PLACE is the token; the probes are the scope phrase as written and, when the place itself is
  // two words or more, the place alone (so "in the Bay Area" also sources against "the Bay Area").
  for (const m of t.matchAll(SCOPE_PLACE_RE)) {
    const place = m[2];
    const probes = [m[0], ...(place.trim().split(/\s+/).length >= 2 ? [place] : [])];
    push("reach", place, m.index ?? 0, probes);
  }
  return out.sort((a, b) => t.indexOf(a.token) - t.indexOf(b.token));
}

/** A specific is SOURCED when one of its probes appears verbatim in one of the cited texts. */
export function specificIsSourced(s: Specific, citedTexts: readonly string[]): boolean {
  return s.probes.some((p) => citedTexts.some((c) => verbatimProvable(p, c)));
}

export type FieldClassInput = {
  field: string;
  /** the inherited class — only `our_read` is fact-checked; record and you are not our assertion */
  cls: string | null | undefined;
  text: string;
  /** the texts of the cited rows whose class is `record` or `you` — our own rows prove nothing */
  citedSourceTexts: readonly string[];
};
export type FieldClassDecision = {
  field: string;
  cls: string | null;
  /** sourced → (b) cleared it deterministically; judge_required → (b) failed, the judge decides;
   *  not_applicable → the field is not our_read, or carries no text/class */
  branch: "sourced" | "judge_required" | "not_applicable";
  /** the specifics (b) could not source — named in the refusal */
  unsourced: Array<{ kind: SpecificKind; token: string }>;
  /** every specific found, for the report */
  examined: number;
};

/** (b), deterministic and FIRST. A field clears without a judge call when every specific in it is
 *  verbatim-sourced in a cited record/you row. A field with NO specifics clears too: there is no
 *  assertion in it to source. */
export function decideFieldClass(input: FieldClassInput): FieldClassDecision {
  const { field, text } = input;
  const cls = input.cls ?? null;
  // not our assertion ⇒ nothing to fact-check
  if (cls !== "our_read") return { field, cls, branch: "not_applicable", unsourced: [], examined: 0 };
  // FAIL CLOSED on an our_read field whose text we could not resolve. The cited-or-omitted rule means
  // a field that cites always has text, so a blank here is a plumbing fault, not an empty field — and
  // a plumbing fault must never clear a field silently. That is precisely how the first version of
  // this check passed every positioning differentiator with "specifics=0".
  if (!String(text ?? "").trim()) {
    return { field, cls, branch: "judge_required", unsourced: [{ kind: "unresolved", token: "(field text could not be resolved)" }], examined: 0 };
  }
  const specifics = extractSpecifics(text);
  const unsourced = specifics
    .filter((s) => !specificIsSourced(s, input.citedSourceTexts))
    .map((s) => ({ kind: s.kind, token: s.token }));
  return {
    field, cls,
    branch: unsourced.length === 0 ? "sourced" : "judge_required",
    unsourced, examined: specifics.length,
  };
}

/** THE COMBINED VERDICT per field: (b) first, then the judge. `judgeHedged` is the judge's class_ok
 *  for this field — consulted ONLY when (b) failed, so a sourced field costs no judgment and a
 *  judge that clears everything cannot rescue an unsourced one it was never asked about. */
export function fieldClassOk(d: FieldClassDecision, judgeHedged: boolean | undefined): boolean {
  if (d.branch === "not_applicable" || d.branch === "sourced") return true;
  return judgeHedged === true;
}

/** The refusal detail: which fields failed, and the specifics that were neither sourced nor hedged. */
export function classRefusals(
  decisions: readonly FieldClassDecision[],
  judgeHedgedByField: Readonly<Record<string, boolean | undefined>>,
): Array<{ field: string; cls: string | null; unsourced: string; reason: string }> {
  return decisions
    .filter((d) => !fieldClassOk(d, judgeHedgedByField[d.field]))
    .map((d) => ({
      field: d.field,
      cls: d.cls,
      unsourced: d.unsourced.map((u) => `${u.token} (${u.kind})`).join(", "),
      reason: `states ${d.unsourced.length} specific(s) no cited record/you row carries, and the judge did not find it written as an openly-held reading`,
    }));
}
