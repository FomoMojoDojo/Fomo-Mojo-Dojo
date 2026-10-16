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

// N1 (2026-10-14): `name` joins the kinds, so a refusal can say WHICH sort of specific was missing.
export type SpecificKind = "exclusivity" | "figure" | "reach" | "unresolved" | "name" | "reputation";
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
// ── G1 (operator ruling, 2026-10-13): the figure token, with its value attached ────────────────
// WAS /\b(\d[\d,.]*\+?%?)\b/g, and the trailing \b was the whole defect: no word boundary sits
// between '%' (or '+') and a following space, so the engine backtracked and discarded the suffix.
// "90%+" captured as "90", probesFor then sliced past the bare digits, and WORD_RE skipped the
// '%+' — so the probe read "90 family-placement…" while the cited row read "90%+ family-placement…".
// normalizeForHash preserves punctuation, so the two could never match: EVERY percentage in the
// record was unsourceable, and the generator learned to drop percentages rather than be refused.
//
// Four parts, each load-bearing:
//   (?<![\d.,\-])   a figure cannot START mid-number — this is what keeps 2025-02-01 from yielding
//                   "02-01" once the range arm exists.
//   \d(?:[\d,]*\d)?(?:\.\d+)?   the core NEVER ends on a separator; the old one captured "1."
//                                from "$1.2M" and a sentence-final "12." as "12.".
//   [-–—]\d{1,3}(?![\d-])   a RANGE, and only a small one: "3-21" and "5-17" are ages, while a
//                           four-digit left side is a year. ISO dates therefore collapse to the
//                           year alone, which the operator ruled acceptable (year-only, 2026-10-07).
//   (?:%|\+|bn\b|[kmKM]\b)*   the value suffixes, any run of them: "90%+", "170+", "$1.2M", "$350K".
// ── F1 (operator ruling, 2026-10-14): a digit run preceded by a LETTER is not a figure ─────────
// C1 refused Wasabi's positioning (audit 10190) partly on the "specific" 3 — extracted from "S3
// compatibility". The same defect reads a figure out of B2B, B2C, B2B2C, H4, H6, Q2, Q4 and H100.
// None of those is a quantity, and a check that demands the record carry "3" verbatim for a line
// saying "S3" refuses a line the record supports perfectly.
//
// The second lookbehind sits AFTER the optional `$` and immediately before the digit, which is what
// "immediately preceded by a letter" means. Putting it before `\$?` instead would have dropped
// US$100, where the letter precedes the currency mark and not the digit.
// A hyphen was already excluded by the first lookbehind, so COVID-19 was never a figure.
// A TRAILING letter still counts: 3x, 10M and 5k are quantities and keep their figure status.
const FIGURE_RE = /(?<![\d.,\-])\$?(?<![A-Za-z])\d(?:[\d,]*\d)?(?:\.\d+)?(?:[-–—]\d{1,3}(?![\d-]))?(?:%|\+|bn\b|[kmKM]\b)*/g;
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
/** The words immediately BEFORE `at`, in reading order, at most three. */
function wordsBefore(text: string, at: number): string[] {
  const head = (text.slice(0, at).match(WORD_RE) ?? []);
  return head.slice(Math.max(0, head.length - 3));
}

/** The probes for a token at `at`: the token plus its next 1-3 words, longest first. A probe is
 *  never shorter than two words, so no single word can source itself.
 *
 *  LEFT-WINDOW FALLBACK (operator ruling, signed 2026-10-08). A specific at the END of a sentence
 *  has no right-hand window, so this built ZERO probes for it and `specificIsSourced` returned false
 *  for every cited row — a specific that could never be sourced, however plainly the record carried
 *  it. "…serving children under 12" failed on the figure 12 against a row reading "youth under 12".
 *  When there is no right-hand window the probes are built LEFTWARD instead: the preceding one to
 *  three words plus the token. Still never one word, so nothing can source itself; and the fallback
 *  applies ONLY when the rightward window is empty, so every probe that worked before still works
 *  exactly as it did. */
function probesFor(text: string, at: number, token: string): string[] {
  const after = wordsFrom(text, at + token.length);
  const out: string[] = [];
  for (const n of [3, 2, 1]) {
    if (after.length >= n) out.push([token, ...after.slice(0, n)].join(" "));
  }
  if (out.length === 0) {
    const before = wordsBefore(text, at);
    for (const n of [3, 2, 1]) {
      if (before.length >= n) out.push([...before.slice(before.length - n), token].join(" "));
    }
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
  // G1: FIGURE_RE has no capture group (the suffix run is a repetition, not a group), so the token
  // is the whole match. A match with no digit cannot occur — the core requires one — but the filter
  // states the invariant rather than relying on the reader to re-derive it.
  for (const m of t.matchAll(FIGURE_RE)) if (/\d/.test(m[0])) push("figure", m[0], m.index ?? 0);
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

/** ── G2 (operator ruling, 2026-10-13): THE FIGURE-ONLY SECOND CHANCE ──────────────────────────
 *
 *  probesFor builds a contiguous word run in OUR order, so a true record fact written in a
 *  different order was declared unsourced: the row says "in 1993 Edgewood established the first
 *  kinship program in the country; over 90% of youth served stayed…", our line says "…since 1993,
 *  with over 90% of youth staying…", and no probe of ours appears in that row. The fact is there;
 *  the window cannot reach it.
 *
 *  So after the windowed probes fail, a FIGURE clears if its token appears in ONE single cited
 *  record/you row. Three constraints keep this from loosening the gate:
 *
 *    FIGURES ONLY. probesFor's own rule — "NEVER one word alone: a bare 'only' appears in half the
 *    corpus" — is about low-entropy English words. A figure is the opposite: "90%+", "3-21",
 *    "$350K", "1993" are high-entropy tokens whose bare presence in a row the field ALREADY CITES
 *    is the sourcing. Exclusivity words and reach claims still require a window, so nothing the
 *    original rule protected is weakened. (Test 8 is the standing proof.)
 *
 *    ONE ROW, NEVER ASSEMBLED. The token must be in a single row. Concatenating the cited rows
 *    would let two rows jointly "source" a figure neither of them states. (Test 7.)
 *
 *    SECOND, NOT INSTEAD. The windowed probes run first and still decide `sourced`; this only
 *    rescues what they miss, so every field that sourced before sources the same way now.
 *
 *  It lives BESIDE specificIsSourced rather than inside it: voiceLabel.test.ts:182 pins that call
 *  line verbatim, and PASS 2 (classSourcingScope) must get the IDENTICAL rule — which it does, by
 *  importing this function rather than re-deriving it (G3). One rule, one authority.
 */
export function specificIsSourcedWithSecondChance(s: Specific, citedTexts: readonly string[]): boolean {
  if (specificIsSourced(s, citedTexts)) return true;
  if (s.kind !== "figure") return false;
  return citedTexts.some((c) => verbatimProvable(s.token, c));
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
  /** sourced        → (b) cleared it deterministically; no judgment is asked.
   *  judge_required  → a specific is stated ONLY in one of OUR OWN rows (a finding, an analysis
   *                    row). It is ours to hedge, and the judge decides whether we hedged it.
   *  unsupported     → a specific is in NO row of the company's record at all — not a cited one, not
   *                    an uncited one, not even one of ours. There is nothing to hedge and nothing
   *                    to cite, so the field REFUSES and the judge is never asked (ruling
   *                    2026-10-08: the promote fact-check became the stage gate, because the class
   *                    judge cleared "unique" and "exclusive" on a row where neither word appears
   *                    anywhere in 253 signals and 258 own-words rows).
   *  not_applicable  → the field is not our_read, or carries no text/class. */
  branch: "sourced" | "judge_required" | "unsupported" | "not_applicable";
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
    .filter((s) => !specificIsSourcedWithSecondChance(s, input.citedSourceTexts))
    .map((s) => ({ kind: s.kind, token: s.token }));
  return {
    field, cls,
    branch: unsourced.length === 0 ? "sourced" : "judge_required",
    unsourced, examined: specifics.length,
  };
}

// ── S1 (operator ruling, 2026-10-14): THE STAGE GATE FOR RECORD- AND YOU-CLASSED LINES ─────────
//
// THE HOLE IT CLOSES. decideFieldClass returns not_applicable for every line that is not our_read
// (line 208 above), and C2 gates the same way. So nothing tested a rendered specific for verbatim
// sourcing on a record- or you-classed line, at stage or at promote — which is what the Sep 18
// promote law requires. Wasabi's refused run is the measurement: all six fields classed record or
// you, every one examined: 0. A record-classed line could assert a figure that appears in none of
// its cited rows and only a model judgment stood between it and a staged read.
//
// WHY A SEPARATE FUNCTION AND NOT A WIDENED decideFieldClass. (b) answers "did WE write this as our
// reading" — its branches (sourced / judge_required / unsupported) feed a judge call and a bounded
// re-ask. S1 answers a different question with a different consequence: a record line claiming what
// the record does not say is REFUSED, never re-asked and never rewritten, because rewriting it would
// be us writing the record's words for it. Widening (b) would have fed these into the re-ask.
//
// NO SECOND IMPLEMENTATION. The sourcing test is specificIsSourcedWithSecondChance — the same
// predicate (b) uses, so "sourced" means one thing in both gates and the G2 figure second chance
// and F1 ride along for free.
//
// A FINDING IS NEVER A SOURCE: the caller passes only record/you rows, and findings are our_read, so
// they are excluded by class. The caller excludes them by kind as well — belt and brace, because a
// finding is our synthesis and our synthesis cannot license the record's words.

// ── N1 (operator ruling, 2026-10-14): S1 ALSO CHECKS NAMES ──────────────────────────────────────
//
// WHY. Wasabi's third staged read (2322e6db, audit 10303) named "Wasabi Fire" and "AI/ML" in a
// record-classed differentiator whose only cited row (2242bdd1) states neither — it quotes Liverpool
// FC on Wasabi AiR and nothing else. S1 passed it because S1's scope was figures plus four position
// words, so a product name went unchecked. C1-S makes this worse before it makes it better: it
// carries pre-rules lines forward word for word, so a name the old read invented travels into the
// new one with the operator's own continuation rule behind it.
//
// WHAT COUNTS AS A NAME, and the FALSE POSITIVES the literal reading produced. Measured over the 10
// classed current reads plus 2322e6db, the ruling's words taken literally extracted 100 tokens, of
// which the great majority were not names: 23 read as unsourced. Four shapes of noise, four fixes,
// all of them narrowing:
//
//   (a) SUB-TOKENS of a run. "San Francisco" also emitted "San" and "Francisco"; "Therapeutic
//       Behavioral Services" emitted all three words. Only the MAXIMAL run is a name — a token
//       contained in a longer emitted token at the same position is dropped.
//   (b) SINGLE LETTERS. "U.S." emitted "U" and "S" (9x and 8x). A name is at least two characters.
//   (c) ORDINARY CAPITALIZED WORDS mid-sentence: "The", "To", "Small", "Clients", "Ability",
//       "Expertise", "Youth". A lone capitalized word is a name only when its SHAPE says so —
//       all-caps 2+, genuinely mixed case, or carrying a slash or digit. A plain Capitalized word
//       on its own is not.
//   (d) DOTTED ABBREVIATIONS. "U.S." is one name, not two letters; matched as a unit first.
//   (e) HYPHENATED CATEGORY ADJECTIVES: AI-powered, AI-driven, AI-focused, AI-first, AI-fueled,
//       AI-savvy. These are the same kind of word as "regulated", which the ruling leaves to the
//       judge. The ABBREVIATION inside them ("AI") is still checked on its own, so nothing is lost.
//
// Those four fixes take 100 tokens to 59 and the unsourced set from 23 to 5, and the 5 that remain
// are real: San Francisco and Therapeutic Behavioral Services on Edgewood's strategy, Wasabi Fire
// and AI/ML on the Wasabi read this ruling exists to catch, and "Deliver AI" — the ONE residual
// false positive, a verb phrase at the start of a line, filed for a ruling rather than guessed at.
// It fails SAFE: a false positive refuses a stage, it does not pass an unsourced claim.
//
// THE COMPANY'S OWN NAME is excluded, and only when it is the whole name: "Wasabi" alone is not
// checked, "Wasabi Fire" is.

/** A token whose SHAPE makes it a name on its own: an abbreviation, a genuinely mixed-case word, or
 *  one carrying a slash or digit. A plain Capitalized word fails this deliberately — fix (c). */
export function nameShaped(tok: string): boolean {
  if (tok.length < 2) return false;                                    // fix (b)
  // ── N1a (operator ruling, 2026-10-14): TWO LETTERS IS NOT A NAME ────────────────────────────
  // Wasabi's stage was refused (audit 10341) on `value (you): AI [name]` — the line said "backups
  // and AI datasets", and none of its three cited rows states "AI" though ten rows in the pool do.
  // A two-letter abbreviation names a CATEGORY, not a thing, exactly as "regulated" does, and a
  // category claim belongs to the judge's grounding check. THREE letters or more stays a name —
  // CRM, SMBs, JRVS, NVMe identify something specific enough to be stated or not.
  if (/^[A-Z]{3,}$/.test(tok)) return true;                            // CRM, SMBs
  if (/^[A-Z]{2}$/.test(tok)) return false;                            // N1a: AI, TV, ML, UX
  if (/[\/\d]/.test(tok)) return true;                                 // AI/ML, S3, Medi-Cal/Medicare
  // mixed case, but NOT a plain Capitalized word (SunRise and FedRAMP yes, "Small" no)
  return /[a-z]/.test(tok) && /[A-Z]/.test(tok) && !/^[A-Z][a-z]+$/.test(tok);
}

/** Every NAME in a line, per N1 with the four narrowing fixes applied. */
/** N1d: words that are capitalized only because they open a sentence or a question. A capitalized
 *  run starting with one of these drops it — the name is what follows. Closed set, signed. */
export const SENTENCE_OPENERS: ReadonlySet<string> = new Set([
  "is", "are", "was", "were", "do", "does", "did", "has", "have", "had",
  "can", "could", "will", "would", "should",
  "how", "what", "why", "when", "where", "who", "which",
]);

export function namesIn(text: string): string[] {
  const t = String(text ?? "");
  const hits: Array<{ tok: string; at: number }> = [];
  const starts = new Set<number>([0]);
  for (const m of t.matchAll(/[.!?]\s+/g)) starts.add((m.index ?? 0) + m[0].length);
  // (d) a dotted abbreviation is ONE name
  for (const m of t.matchAll(/\b(?:[A-Z]\.){2,}/g)) hits.push({ tok: m[0], at: m.index ?? 0 });
  // a MULTI-WORD capitalized run is a name by construction
  // ── N1d (operator ruling, 2026-10-15): A SENTENCE-OPENING AUXILIARY IS NOT PART OF THE NAME ──
  // Wasabi's offering refused TWICE on `open_questions[0] (record): Is Wasabi [name]` (audits 10613,
  // 10614). The question reads "Is Wasabi's data corruption incident ... still an ongoing issue?" —
  // "Is" is capitalized because it opens the question, so the run regex swallowed it and minted the
  // name "Is Wasabi". The own-name exclusion could not fire: the token was not "Wasabi". The single
  // re-ask was spent and the kind could not stage. It generalises — "Does Wasabi…" gives
  // "Does Wasabi", "Has Edgewood…" gives "Has Edgewood" — so every open question phrased as a
  // question about the company was unstageable.
  //
  // The single-token path already skips a plain word opening a sentence; the RUN path never did.
  // Only the listed words are dropped, and only at a sentence start: "Will Smith" mid-sentence is a
  // name, and a run whose first word is not in the set is untouched.
  for (const m of t.matchAll(/\b[A-Z][a-zA-Z]+(?:\s*[A-Z][a-zA-Z]+)+\b/g)) {
    const at = m.index ?? 0;
    let tok = m[0];
    if (starts.has(at)) {
      const firstSpace = tok.search(/\s/);
      const head = firstSpace > 0 ? tok.slice(0, firstSpace) : "";
      if (head && SENTENCE_OPENERS.has(head.toLowerCase())) {
        const restAt = at + tok.length - tok.slice(firstSpace).trimStart().length;
        tok = tok.slice(firstSpace).trimStart();
        if (!tok || !/\s/.test(tok)) {
          // what remains is a SINGLE token — it re-enters by the single-token path below, which
          // applies nameShaped and the own-name exclusion, so emitting it here would double-count.
          if (tok) hits.push({ tok, at: restAt });
          continue;
        }
        hits.push({ tok, at: restAt });
        continue;
      }
    }
    hits.push({ tok, at });
  }
  // single tokens, only when the shape says name
  for (const m of t.matchAll(/\b[A-Za-z][\w\/.\-]*\b/g)) {
    const tok = m[0], at = m.index ?? 0;
    if (starts.has(at) && /^[A-Z][a-z]+$/.test(tok)) continue;         // a plain word opening a sentence
    // (e) a category adjective is not a name — but the ABBREVIATION inside it still is, and the
    // token regex swallows the whole compound, so it has to be emitted here or it is lost entirely.
    const compound = /^([A-Za-z]{2,})-[a-z]+$/.exec(tok);
    if (compound) {
      if (nameShaped(compound[1])) hits.push({ tok: compound[1], at });
      continue;
    }
    if (!nameShaped(tok)) continue;                                    // (b) + (c)
    hits.push({ tok, at });
  }
  // (a) keep only MAXIMAL runs
  const keep = hits.filter((h, i) => !hits.some((o, j) =>
    j !== i && o.at <= h.at && (o.at + o.tok.length) >= (h.at + h.tok.length) && o.tok.length > h.tok.length));
  return [...new Set(keep.map((h) => h.tok))];
}

/** N1: the names a record/you line asserts that none of its cited source rows states verbatim.
 *  `companyName` is excluded when it IS the whole name — "Wasabi" is not checked, "Wasabi Fire" is. */
export function unsourcedNames(input: {
  text: string; cls: string | null; citedSourceTexts: readonly string[]; companyName?: string;
}): string[] {
  // ── N1b (operator ruling, 2026-10-14): our_read LINES ARE CHECKED TOO ───────────────────────
  // On the refused run, ua[2] came back classed our_read because it cites a finding, and N1 never
  // looked at it — so "Wasabi Fire" and "AI/ML", the exact names this ruling exists to catch, went
  // unexamined. Calling a line our read licenses the READING, not the invention of a product name.
  // The caller passes only NON-FINDING cited rows as sources: a finding is our own synthesis, so a
  // name that appears only there is a name we gave ourselves.
  if (input.cls !== "record" && input.cls !== "you" && input.cls !== "our_read") return [];
  const own = new Set(String(input.companyName ?? "").toLowerCase().split(/\s+/).filter(Boolean));
  return namesIn(input.text)
    .filter((n) => !(own.size > 0 && n.toLowerCase().split(/[\s\/]+/).every((w) => own.has(w))))
    .filter((n) => !input.citedSourceTexts.some((srcText) => srcText.includes(n)));
}

// ── O1 (operator ruling, 2026-10-15): AN ITEM'S LABEL IS CHECKED LIKE ITS STATEMENT ────────────
//
// An offering item stamps as `items[n]` with its STATEMENT as the text, so the LABEL was read by
// nothing. Wasabi's refused offering carried "Wasabi GovCloud with FedRAMP Ready status" and
// "Wasabi AiR AI recognition technology" — names asserted in a field no gate looked at. A label's
// names must be stated by the rows the ITEM cites: the same refs its statement cites.
//
// It lives here, beside the other name checks, rather than inline in the gate closure, so it can be
// CALLED by a test. Inline it could only be tested by reading the source, and a source test passes
// on a function body that has been short-circuited.
export type LabelCheck = { field: string; label: string; cls: string | null; citedSourceTexts: readonly string[] };

/** The names an item's label asserts that none of the item's own cited rows states. */
export function unsourcedLabelNames(input: LabelCheck & { companyName?: string }): string[] {
  if (!String(input.label ?? "").trim()) return [];
  return unsourcedNames({
    text: input.label, cls: input.cls, citedSourceTexts: input.citedSourceTexts,
    companyName: input.companyName,
  });
}

/** S1's position words. A deliberate SUBSET of EXCLUSIVITY: the ruling names these four. */
export const S1_POSITION_WORDS: ReadonlySet<string> = new Set(["only", "sole", "first", "largest"]);

// ── S1b (operator ruling, 2026-10-15): A REPUTATIONAL CLAIM IS STILL A CLAIM ────────────────────
//
// Wasabi's staged strategy said "To be the leading global cloud storage provider ... unmatched
// ...", class `you`, and NEITHER word appears in any of its three cited rows. S1 cleared it with
// examined:0, correctly under the rules as they stood: it governs figures plus the four position
// words (only/sole/first/largest), and C2 deliberately treats reputational words as what a company
// says about itself. But the read was ATTRIBUTING those words to the company's own voice with no
// row saying them — the same fault S1 refuses for the four words it does govern.
//
// These words now have to appear VERBATIM in one of the line's own cited rows. Same function
// family, same refusal, same single re-ask, at stage and at promote. C2 is unchanged: it still
// asks whether WE softened a row's position word, which is a different question.
export const S1B_REPUTATION_WORDS: ReadonlySet<string> = new Set([
  "leading", "best", "premier", "foremost", "top",
  "unmatched", "unparalleled", "world-class", "superior", "number one",
]);

/** The S1b words a line asserts. Matched on word boundaries, case-insensitively, over the line's
 *  own text; "number one" is two words, so the set is matched as alternatives rather than by
 *  splitting on spaces. */
export function reputationWordsIn(text: string): string[] {
  const t = String(text ?? "");
  const alts = [...S1B_REPUTATION_WORDS].map((w) => w.replace(/[-\s]/g, "[-\\s]")).join("|");
  const re = new RegExp(`\\b(?:${alts})\\b`, "gi");
  return [...new Set((t.match(re) ?? []).map((w) => w.toLowerCase().replace(/\s+/g, " ")))];
}

/** S1b: the reputational words this line asserts that none of its cited rows states. */
export function unsourcedReputation(input: {
  text: string; cls: string | null; citedSourceTexts: readonly string[];
}): string[] {
  if (input.cls !== "record" && input.cls !== "you") return [];   // our_read is (b)'s business
  return reputationWordsIn(input.text).filter((w) =>
    !input.citedSourceTexts.some((src) => reputationWordsIn(src).includes(w)));
}

export type S1Result = {
  field: string;
  cls: string | null;
  /** N1 (2026-10-14): the names this line asserts that no cited row states verbatim. */
  unsourced_names?: string[];
  /** how many specifics S1 tested — 0 means the line asserts nothing S1 governs */
  examined: number;
  /** the specifics no cited source row carries verbatim. Empty ⇒ the line passes. */
  unsourced: Array<{ kind: SpecificKind; token: string }>;
};

/** S1: the specifics a record- or you-classed line asserts that none of ITS OWN cited source rows
 *  carries verbatim. Figures (so G1-G3 and F1 apply) plus the four position words.
 *  `citedSourceTexts` must already be restricted to that line's record/you rows, findings removed. */
export function s1Unsourced(input: {
  field: string; text: string; cls: string | null; citedSourceTexts: readonly string[];
  /** N1: the company's own name, so "Wasabi" alone is not demanded of the record. */
  companyName?: string;
}): S1Result {
  const cls = input.cls ?? null;
  // S1's FIGURES and position words govern the record speaking and the company speaking; on an
  // our_read line those are (b)'s business. N1b adds NAMES to an our_read line, so that branch
  // returns the name result rather than an empty one. An unclassed line cites nothing and stays out.
  if (cls === "our_read") {
    const ourNames = unsourcedNames({ text: String(input.text ?? ""), cls, citedSourceTexts: input.citedSourceTexts, companyName: input.companyName });
    return {
      field: input.field, cls, examined: namesIn(String(input.text ?? "")).length,
      unsourced: ourNames.map((n) => ({ kind: "name" as SpecificKind, token: n })),
      unsourced_names: ourNames,
    };
  }
  if (cls !== "record" && cls !== "you") return { field: input.field, cls, examined: 0, unsourced: [] };
  const text = String(input.text ?? "").trim();
  // FAIL CLOSED, for the same reason (b) does: the cited-or-omitted rule means a field that cites
  // always has text, so a blank here is a plumbing fault and must not clear a line silently.
  if (!text) {
    return { field: input.field, cls, examined: 0, unsourced: [{ kind: "unresolved", token: "(field text could not be resolved)" }] };
  }
  const specs = extractSpecifics(text).filter((s) =>
    s.kind === "figure" || (s.kind === "exclusivity" && S1_POSITION_WORDS.has(s.token.toLowerCase())));
  const unsourced = specs
    .filter((s) => !specificIsSourcedWithSecondChance(s, input.citedSourceTexts))
    .map((s) => ({ kind: s.kind, token: s.token }));
  // S1b (2026-10-15): the reputational words ride in the SAME result and the SAME refusal. They are
  // their own kind so a reader can tell "leading with no row behind it" from a missing figure.
  for (const w of unsourcedReputation({ text, cls, citedSourceTexts: input.citedSourceTexts })) {
    unsourced.push({ kind: "reputation", token: w });
  }
  // N1: names ride in the SAME result and the SAME refusal. They are reported separately so a reader
  // can tell a missing figure from a missing product name, but either refuses the line.
  const names = unsourcedNames({ text, cls, citedSourceTexts: input.citedSourceTexts, companyName: input.companyName });
  return {
    field: input.field, cls,
    examined: specs.length + namesIn(text).length,
    unsourced: [...unsourced, ...names.map((n) => ({ kind: "name" as SpecificKind, token: n }))],
    unsourced_names: names,
  };
}

/** The refusal detail S1 writes: every field that failed, with the specifics it could not source. */
export function s1Detail(results: readonly S1Result[]): string {
  return results.filter((r) => r.unsourced.length > 0)
    .map((r) => `${r.field} (${r.cls}): ${r.unsourced.map((u) => `${u.token} [${u.kind}]`).join(", ")}`)
    .join("; ");
}

/** THE COMBINED VERDICT per field: (b) first, then the judge. `judgeHedged` is the judge's class_ok
 *  for this field — consulted ONLY when (b) failed, so a sourced field costs no judgment and a
 *  judge that clears everything cannot rescue an unsourced one it was never asked about. */
export function fieldClassOk(d: FieldClassDecision, judgeHedged: boolean | undefined): boolean {
  if (d.branch === "not_applicable" || d.branch === "sourced") return true;
  // UNSUPPORTED is final: a specific the record does not carry anywhere cannot be hedged into
  // existence, so no judgment can clear it.
  if (d.branch === "unsupported") return false;
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
      reason: d.branch === "unsupported"
        ? `states ${d.unsourced.length} specific(s) found NOWHERE in the company's record — not citable and not hedgeable`
        : `states ${d.unsourced.length} specific(s) carried only by our own rows, and the judge did not find it written as an openly-held reading`,
    }));
}
