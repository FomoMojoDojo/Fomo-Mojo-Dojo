// ── V1 (operator ruling, 2026-10-13, amended A1/A2): the read CARRIES the record's words ─────────
//
// Three runs in a row the model hedged a fact its own cited row stated plainly: "nationally
// pioneering kinship program" where dfb6da68 says "in 1993 Edgewood established the first kinship
// program in the country". The prompt forbade that string by name; C2 refused it. Prose instruction
// and refusal both leave the model free to try again.
//
// V1 removes the choice instead. For a line whose cited record/you row already states the claim in
// usable words, the read CARRIES those words byte-exact — no generation for that line, so the hedge
// is unreachable rather than refused. This is the slot path's verbatim mode (signed 2026-10-05,
// VERBATIM_MAX_CHARS=140) applied one level up, with a SPAN instead of a whole field.
//
// WHY A SPAN AND NOT A ROW. dfb6da68's claim_text is 231 characters and four clauses. Only the
// second is the kinship claim; the third is "over 90% of youth served stayed in family settings to
// age 18" — a DIFFERENT measure. Carrying the row would import a retention statistic nobody asked
// the carry to make. So the unit is a clause span, and provability is bounded to it: "first" is
// provable inside the chosen span, "90%" is not, exactly as the Sep-18 registry pattern bounds a
// registry quote to its own section span (registryOwnWords.RegistryOrigin, extract-own-words C3b).
import { extractSpecifics } from "./classFactCheck.ts";
import { verbatimProvable } from "./ownWordsExtract.ts";
import { normalizeForHash, sha256Hex } from "./contentIdentity.ts";
import { DIFFERENTIATORS_MIN, VERBATIM_MAX_CHARS } from "./readSlots.ts";

/** The refusal when a carried span's source text moved under it. Fail closed: a row whose text
 *  changed is not a carry any more. Mirrors extract-own-words' snapshot_drift. */
export const CARRIED_DRIFT_GUARD = "carried_span_drift" as const;

/** A span of one row's text, in the Sep-18 {sha, start, end} shape. */
export type CarriedSpan = {
  row_id: string;
  /** sha256 of the FULL row text the offsets are relative to — the drift anchor. */
  row_sha: string;
  start: number;
  end: number;
  /** record | you. Never our_read: a carried line takes its span's class (A-ruling V1). */
  cls: "record" | "you";
  clause_index: number;
  /** the span's text, byte-exact */
  text: string;
  /** the specifics provable INSIDE the span */
  specifics: string[];
};

export type SpanRejection =
  | "not_a_clause"
  | "class_our_read"
  | "over_cap"
  | "no_specific"
  | "specific_not_provable_in_span"
  | "not_self_contained";

/** Clause boundaries: ';' and '. ' and ': '. Punctuation decides the cut, never a model. */
export function clausesOf(text: string): Array<{ start: number; end: number; text: string; index: number }> {
  const out: Array<{ start: number; end: number; text: string; index: number }> = [];
  const re = /;|\.\s|:\s/g;
  let from = 0, idx = 0, m: RegExpExecArray | null;
  const push = (s: number, e: number) => {
    const raw = text.slice(s, e);
    const lead = raw.length - raw.replace(/^\s+/, "").length;
    const trail = raw.length - raw.replace(/\s+$/, "").length;
    const a = s + lead, b = e - trail;
    if (b > a) out.push({ start: a, end: b, text: text.slice(a, b), index: idx++ });
  };
  while ((m = re.exec(text))) { push(from, m.index); from = m.index + m[0].length; }
  push(from, text.length);
  return out;
}

/** Words that make a lifted span read as a fragment. */
const FRAGMENT_OPENERS = new Set([
  "it", "its", "they", "their", "which", "who", "that", "this", "these", "those",
  "and", "but", "also", "or", "so", "then", "there",
]);
/** Verbs that report ON a page rather than state a fact ("highlights the…", "lists Edgewood as…"). */
const REPORTING_OPENERS = new Set([
  "highlights", "lists", "confirms", "shows", "notes", "states", "mentions", "describes", "indicates", "reports",
]);

/** THE FIVE USABILITY RULES. Deterministic; returns the span or the rule it failed. */
export function spanUsable(args: {
  rowId: string; rowSha: string; cls: string;
  clause: { start: number; end: number; text: string; index: number };
}): { ok: true; span: CarriedSpan } | { ok: false; reason: SpanRejection } {
  const { clause } = args;
  // (2) class — an our_read row is OUR prose; carrying it would launder a finding into the record's voice
  if (args.cls !== "record" && args.cls !== "you") return { ok: false, reason: "class_our_read" };
  // (3) the slot path's own threshold, reused rather than re-chosen
  if (clause.text.length > VERBATIM_MAX_CHARS) return { ok: false, reason: "over_cap" };
  // (5) self-contained — a fragment or a page-report verb is not a statement of fact
  const first = (clause.text.match(/[A-Za-z']+/)?.[0] ?? "").toLowerCase();
  if (FRAGMENT_OPENERS.has(first) || REPORTING_OPENERS.has(first)) return { ok: false, reason: "not_self_contained" };
  // (4) at least one specific, and EVERY specific provable inside the span alone
  const specs = extractSpecifics(clause.text);
  if (specs.length === 0) return { ok: false, reason: "no_specific" };
  if (!specs.every((s) => verbatimProvable(s.token, clause.text))) {
    return { ok: false, reason: "specific_not_provable_in_span" };
  }
  return {
    ok: true,
    span: {
      row_id: args.rowId, row_sha: args.rowSha,
      start: clause.start, end: clause.end, cls: args.cls,
      clause_index: clause.index, text: clause.text,
      specifics: specs.map((s) => s.token),
    },
  };
}

/** Every usable span of one row, with the rejections for the rest (reported, never guessed). */
export async function usableSpansOf(
  rowId: string, rowText: string, cls: string,
): Promise<{ spans: CarriedSpan[]; rejected: Array<{ clause_index: number; reason: SpanRejection; text: string }> }> {
  const sha = await sha256Hex(rowText);
  const spans: CarriedSpan[] = [];
  const rejected: Array<{ clause_index: number; reason: SpanRejection; text: string }> = [];
  for (const clause of clausesOf(rowText)) {
    const r = spanUsable({ rowId, rowSha: sha, cls, clause });
    if (r.ok) spans.push(r.span);
    else rejected.push({ clause_index: clause.index, reason: r.reason, text: clause.text });
  }
  return { spans, rejected };
}

// ── V1-R1 / V1-R2 (operator rulings, 2026-10-13): RELEVANCE IS A GATE ──────────────────────────
//
// The dry run over Edgewood's live pool disproved the first candidate rule twice over.
//
//   Candidates restricted to rows the line ALREADY CITES could not reach dfb6da68 at all: the
//   current line 02 cites only 99037383, and dfb6da68 entered the read through PASS 2. The carry the
//   ruling names was unreachable, and the line went back to the generator — the path that hedged
//   three times.
//
//   And the four-key order, handed both kinship clauses, chose {116,176} ("over 90% of youth served
//   stayed in family settings to age 18") over {45,114} ("in 1993 Edgewood established the first
//   kinship program in the country"). Both are class record with two specifics, so key 3 — shorter
//   first — decided, on 60 chars against 69. The order has no notion of what the line is ABOUT.
//
// So candidates are pool rows of class record/you whose span shares a 3-word content run with the
// line being written, and the span's row is ADDED to that line's citations (as PASS 2 admits a
// sourcing row). The same N=3 test C2 uses, for the same reason: at 2 it matches generic runs like
// "bay area", and relevance must mean the same thing in both checks.
//
// R2 — a GATE, never a fifth key. As a key it would RANK rather than exclude, which re-admits the
// non-sequiturs the dry run produced ("only CSU serving youth under 12 in Bay Area, over 15 programs
// in 6 locations") instead of refusing them.
const STOPWORDS = new Set(
  "the a an of in to and or for with its it is are as at by on that this we our you your their".split(" "),
);
function contentRuns(text: string, n = 3): Set<string> {
  const w = normalizeForHash(text).split(/[^a-z0-9%+.\-]+/).filter((x) => x && !STOPWORDS.has(x));
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
}
/** R1: does this span share a 3-word content run with the line being written? */
export function spanRelevantTo(span: Pick<CarriedSpan, "text">, lineText: string, n = 3): boolean {
  const line = contentRuns(lineText, n);
  for (const r of contentRuns(span.text, n)) if (line.has(r)) return true;
  return false;
}
/** R2: the gate, applied BEFORE the four-key order. */
export function relevantSpans(cands: readonly CarriedSpan[], lineText: string, n = 3): CarriedSpan[] {
  return cands.filter((c) => spanRelevantTo(c, lineText, n));
}

/** THE FOUR-KEY CHOICE ORDER, first match wins. No model call, and reproducible across runs.
 *  Runs over the RELEVANCE-GATED set only (R2) — never over the raw pool. */
export function chooseSpan(cands: readonly CarriedSpan[]): CarriedSpan | null {
  if (cands.length === 0) return null;
  const rank = (s: CarriedSpan) => (s.cls === "record" ? 0 : 1);
  return [...cands].sort((a, b) =>
    rank(a) - rank(b) ||                                   // 1. record before you
    b.specifics.length - a.specifics.length ||             // 2. more specifics first
    a.text.length - b.text.length ||                       // 3. shorter first
    a.row_id.localeCompare(b.row_id)                       // 4. reproducible tie-break
  )[0];
}

/** A1 (amendment 2026-10-13): a SECOND span may be appended ONLY when it adds a specific the
 *  primary lacks. Both byte-exact, both recorded. A second span that adds no specific adds only
 *  words, and a carry is not an opportunity to write more. */
export function chooseSecondSpan(
  primary: CarriedSpan, cands: readonly CarriedSpan[], lineText: string, n = 3,
): CarriedSpan | null {
  const have = new Set(primary.specifics.map((s) => s.toLowerCase()));
  // R1 applied to A1: RELEVANT **and** adds a specific. "Adds a specific" alone admitted
  // page navigation — the dry run appended "Why Edgewood Edgewood has served youth since its
  // founding days more than 170 years ago" to a 1851 line because it carried the token "170".
  const adds = relevantSpans(cands, lineText, n).filter((c) =>
    !(c.row_id === primary.row_id && c.clause_index === primary.clause_index) &&
    c.specifics.some((s) => !have.has(s.toLowerCase()))
  );
  return chooseSpan(adds);
}

/** The joined line. ", " unless the second opens on a preposition-led measure, then " with ". */
export function joinSpans(primary: CarriedSpan, second: CarriedSpan | null): string {
  if (!second) return primary.text;
  const joiner = /^(with|at|over|under|across)\b/i.test(second.text) ? " " : " with ";
  return `${primary.text},${joiner}${second.text}`.replace(/\s+/g, " ").trim();
}

// ── A2: the render lives in its own module ─────────────────────────────────────────────────────
// renderCarried is a pure string function with no dependencies, and D2 wires it on the READ RENDER
// path — which is browser code. This module imports readSlots.ts, which touches Deno.*, so pulling
// carriedSpan into the client bundle to reach one string function would drag a Deno-targeted module
// in with it. The function therefore lives in ./carriedRender.ts and is re-exported here, so there
// is still exactly ONE renderCarried and both sides import the same one.
export { renderCarried } from "./carriedRender.ts";


/** The ledger block. Records the span(s) AND what each field was chosen over. */
export type CarriedBlock = Record<string, {
  primary: Omit<CarriedSpan, "text">;
  second: Omit<CarriedSpan, "text"> | null;
  stored_text: string;
  chosen_over: Array<{ row_id: string; clause_index: number; reason: SpanRejection | "lost_choice_order" | "not_relevant" }>;
}>;

/** Fail closed on drift: the row text must still hash to row_sha AND still contain the span at its
 *  offsets, byte-exact. Returns the offending spans; empty ⇒ every carry still holds. */
export async function driftedSpans(
  block: CarriedBlock,
  rowTextNow: Readonly<Record<string, string>>,
): Promise<Array<{ field: string; row_id: string; why: "row_missing" | "sha_drift" | "span_mismatch" }>> {
  const bad: Array<{ field: string; row_id: string; why: "row_missing" | "sha_drift" | "span_mismatch" }> = [];
  for (const [field, c] of Object.entries(block)) {
    for (const s of [c.primary, c.second].filter(Boolean) as Array<Omit<CarriedSpan, "text">>) {
      const now = rowTextNow[s.row_id];
      if (now === undefined) { bad.push({ field, row_id: s.row_id, why: "row_missing" }); continue; }
      if (await sha256Hex(now) !== s.row_sha) { bad.push({ field, row_id: s.row_id, why: "sha_drift" }); continue; }
      if (!c.stored_text.includes(now.slice(s.start, s.end))) {
        bad.push({ field, row_id: s.row_id, why: "span_mismatch" });
      }
    }
  }
  return bad;
}

/** One field's carry decision. */
export type FieldCarry = {
  field: string;
  primary: CarriedSpan;
  second: CarriedSpan | null;
  /** the stored text: byte-exact span(s), joined. NEVER any generated prose (V1-R3). */
  stored_text: string;
  /** the rows to ADD to this field's citations (R1) */
  add_refs: string[];
  chosen_over: Array<{ row_id: string; clause_index: number; reason: "lost_choice_order" | "not_relevant" }>;
};

/** THE SELECTION, for one line. Deterministic end to end: relevance gate (R2), four-key order,
 *  then A1's relevant-and-adds-a-specific second span. Returns null when nothing qualifies — that
 *  line stays GENERATED, which is the honest outcome and not a failure. */
export function carryForLine(
  field: string, lineText: string, pool: readonly CarriedSpan[], n = 3,
): FieldCarry | null {
  const gated = relevantSpans(pool, lineText, n);
  if (gated.length === 0) return null;
  const primary = chooseSpan(gated)!;
  const second = chooseSecondSpan(primary, gated, lineText, n);
  const keep = new Set([primary, second].filter(Boolean).map((s) => `${s!.row_id}:${s!.clause_index}`));
  const chosen_over: FieldCarry["chosen_over"] = [
    ...gated.filter((c) => !keep.has(`${c.row_id}:${c.clause_index}`))
      .map((c) => ({ row_id: c.row_id, clause_index: c.clause_index, reason: "lost_choice_order" as const })),
    ...pool.filter((c) => !gated.includes(c))
      .map((c) => ({ row_id: c.row_id, clause_index: c.clause_index, reason: "not_relevant" as const })),
  ];
  return {
    field, primary, second,
    // V1-R3: the stored text is the span(s) and nothing else. No generated prose is mixed in, so a
    // carried line is verbatimProvable against its span by construction — which is what puts it
    // outside the gate, C1 and C2 rather than inside them with an exemption.
    stored_text: joinSpans(primary, second),
    add_refs: [...new Set([primary.row_id, ...(second ? [second.row_id] : [])])],
    chosen_over,
  };
}

/** The ledger block for a set of carries. */
export function carriedBlockOf(carries: readonly FieldCarry[]): CarriedBlock {
  const out: CarriedBlock = {};
  for (const c of carries) {
    const strip = (s: CarriedSpan) => { const { text: _t, ...rest } = s; return rest; };
    out[c.field] = {
      primary: strip(c.primary),
      second: c.second ? strip(c.second) : null,
      stored_text: c.stored_text,
      chosen_over: c.chosen_over,
    };
  }
  return out;
}

// ── V1-R4 (operator ruling, 2026-10-13): the PRE-GENERATION span search ─────────────────────────
//
// The first V1 build carried from the base selection only, and the span it most needed was not
// there: dfb6da68 reaches a read through PASS 2, which runs inside stampAndDecide AFTER generation.
// So the carry and PASS 2 were hunting the same rows on opposite sides of the model call, and the
// carry always lost. Refusal 9791 is that defect: the line was generated, the model hedged, C2
// caught it, and no carry had been attempted.
//
// R4 closes it with a NARROW admission. Before generation, for each differentiator line of the
// current read, search the live record for a row that wins a USABLE, RELEVANT span for THAT line.
// Only a winner is admitted — a row that is merely relevant, or merely a sourcing candidate, is not.
// The admission goes through the caller's own admitSourcingRow, so the row lands in the catalogue,
// the ledger, and admitted_from_live_record exactly as a PASS 2 admission does.
//
// It shares PASS 2's candidate gathering (classSourcingScope.liveRecordCandidates, extracted
// unchanged) so the two searches see the same rows. What differs is the test: PASS 2 asks "does this
// row source this unsourced specific?", R4 asks "does this row hold a usable span relevant to this
// line?".

export type SpanSearchHit = {
  field: string;
  row: { id: string; kind: "signal" | "own_word"; text: string; cls: "record" | "you" };
  span: CarriedSpan;
};

/** For each line, the row+span that wins it. Deterministic: candidate order, then the four keys.
 *  `candidates` comes from liveRecordCandidates — this function never queries. */
export async function searchLiveRecordForSpans(
  lines: ReadonlyArray<{ field: string; text: string }>,
  candidates: ReadonlyArray<{ id: string; kind: "signal" | "own_word"; text: string; cls: string }>,
  n = 3,
): Promise<SpanSearchHit[]> {
  const out: SpanSearchHit[] = [];
  for (const line of lines) {
    const pool: CarriedSpan[] = [];
    const rowOf = new Map<string, typeof candidates[number]>();
    for (const c of candidates) {
      if (c.cls !== "record" && c.cls !== "you") continue;      // rule 2, before any clause work
      const { spans } = await usableSpansOf(c.id, c.text, c.cls);
      // R4's narrowness: only spans RELEVANT to THIS line make the row a winner.
      const rel = relevantSpans(spans, line.text, n);
      if (rel.length === 0) continue;
      pool.push(...rel);
      rowOf.set(c.id, c);
    }
    const won = chooseSpan(pool);
    if (!won) continue;
    const row = rowOf.get(won.row_id)!;
    out.push({ field: line.field, row: { ...row, cls: row.cls as "record" | "you" }, span: won });
  }
  return out;
}

// ── S1 (operator ruling, 2026-10-13): unique_attributes is assembled BY PATH ───────────────────
//
// The old splice indexed into the model's own array: `attrs[i] = carry` at each carried index. That
// assumed the model's array is index-aligned with the field paths, and the prompt guarantees it is
// not — `takenBlock` tells the model "these lines are carried … Do not write them, and write every
// other line as usual", and GEN_POSITIONING asks for a list with no count. A model that complies
// returns only the lines it DID write, at indices 0, 1, … — exactly where the carries land. On run
// 9868 that overwrote every line the model returned: two class decisions, both carried, no generated
// differentiator at all, and the current read's third line dropped with nothing to continue it.
//
// S1: a carried path takes its carry. The remaining paths take the model's returned lines IN ORDER,
// never by the model's index. So a model that returns one line while two paths are carried yields
// three entries, its line at [2] — the slot no carry owns.
//
// What this trusts: that the model did not also restate a carried line. If it does, that restatement
// is a line it wrote and is placed as one — it is not silently dropped. The prompt forbids it, C2
// would see a softened restatement of a record row, and C1 can only be helped by an extra line.
export type CarryPlacement = { field: string; text: string; citations: string[] };

/** The assembled lines, plus WHERE each carry actually landed.
 *
 *  `placedAt` exists because a JSON array has no holes. If a slot is owned by no carry and there is
 *  no generated line left to fill it, every later carry shifts down one — so a carry selected for
 *  unique_attributes[2] can end up stored at index 1. The carried block, the drift check and C1-A's
 *  anchor all key off the field path, so they must be told the path the line is actually AT, not the
 *  path it was chosen for. Returning the map is cheaper than letting three consumers guess. */
export type AssembledAttributes = {
  lines: Array<Record<string, unknown>>;
  /** the field path a carry was SELECTED for → the field path it is STORED at */
  placedAt: Record<string, string>;
  /** D1: the generated lines removed as restatements of a carried line, for the ledger */
  restated: Array<{ generated_text: string; carried_path: string }>;
};

// ── D1 (operator ruling, 2026-10-13): a generated line that restates a carry is REMOVED ──────────
//
// Staged read dbdf897c said each differentiator twice. The prompt tells the model the carried lines
// are already written and not to restate their facts; it restated both anyway — line 04 byte-
// identical to the stored text of the carry at unique_attributes[1], line 03 differing from the
// carry at [0] only by the quote marks. Before S1 those restatements were the thing the index splice
// silently overwrote. S1 keeps everything the model returns, which is right, so the duplication had
// to be answered here instead.
//
// A restatement is BOTH: it carries every specific token of a carried line (so it is making the same
// factual claim, not a neighbouring one) AND it shares a 3-word content run with it (so it is the
// same sentence, not a different claim that happens to share a figure). Either test alone is wrong:
// specifics alone would eat a line about a different aspect of the same number, and a shared run
// alone would eat a line that merely talks about the same subject.
//
// REMOVED, never refused. The read is better without the duplicate and no worse for its absence —
// refusing the whole kind over a line the model should not have written would spend an operator's
// run on a defect we can simply undo. The ledger records every removal with the carry it duplicated.
const RESTATEMENT_RUN_WORDS = 3;

/** The carried line this generated line restates, or null. */
function restatementOf(
  generated: string, placements: readonly CarryPlacement[],
): CarryPlacement | null {
  if (!generated.trim()) return null;
  for (const c of placements) {
    const specifics = extractSpecifics(c.text);
    if (specifics.length === 0) continue;              // a usable span always has one; never vacuous
    if (!specifics.every((sp) => verbatimProvable(sp.token, generated))) continue;
    if (!spanRelevantTo({ text: c.text }, generated, RESTATEMENT_RUN_WORDS)) continue;
    return c;
  }
  return null;
}

export function assembleByPath(
  modelLines: ReadonlyArray<Record<string, unknown>>,
  placements: readonly CarryPlacement[],
): AssembledAttributes {
  const byIndex = new Map<number, { line: Record<string, unknown>; field: string }>();
  for (const p of placements) {
    const m = /^unique_attributes\[(\d+)\]$/.exec(p.field);
    if (!m) continue;
    byIndex.set(Number(m[1]), { line: { text: p.text, citations: p.citations }, field: p.field });
  }
  if (byIndex.size === 0) return { lines: [...modelLines], placedAt: {}, restated: [] };

  // D1: restatements come out BEFORE placement, so the lines that survive fill the free slots in
  // order and no gap is left where a duplicate used to sit.
  const restated: Array<{ generated_text: string; carried_path: string }> = [];
  const kept: Array<Record<string, unknown>> = [];
  for (const line of modelLines) {
    const text = String(line?.text ?? "");
    const dup = restatementOf(text, placements);
    if (dup) { restated.push({ generated_text: text, carried_path: dup.field }); continue; }
    kept.push(line);
  }
  modelLines = kept;

  const maxCarried = Math.max(...byIndex.keys());
  const total = Math.max(maxCarried + 1, byIndex.size + modelLines.length);
  const lines: Array<Record<string, unknown>> = [];
  const placedAt: Record<string, string> = {};
  let g = 0;
  for (let i = 0; i < total; i++) {
    const carry = byIndex.get(i);
    if (carry) {
      placedAt[carry.field] = `unique_attributes[${lines.length}]`;
      lines.push(carry.line);
      continue;
    }
    if (g < modelLines.length) lines.push(modelLines[g++]);
    // else: a slot no carry owns and no generated line fills — left out, never stored as a hole
  }
  while (g < modelLines.length) lines.push(modelLines[g++]);   // a carry indexed past the array
  return { lines, placedAt, restated };
}

/** Re-key a carried block to the paths its lines are STORED at. Identity when nothing shifted. */
export function rekeyCarriedBlock(block: CarriedBlock, placedAt: Readonly<Record<string, string>>): CarriedBlock {
  const out: CarriedBlock = {};
  for (const [field, carry] of Object.entries(block)) out[placedAt[field] ?? field] = carry;
  return out;
}

// ── Q2 (operator ruling, 2026-10-13): how many MORE differentiators the model is asked for ──────
//
// The prompt never said a number. GEN_POSITIONING shows an array with one example element,
// CITE_RULE explicitly licenses returning it empty, and clause (7) pointed at the company's current
// read — a document the prompt does not contain (Q1 fixed that half). With the carried lines named
// as ALREADY WRITTEN, a model that writes nothing else is obeying every instruction it was given.
// Runs 9941 and 9976 did exactly that: every line they returned was a restatement of a carry.
//
// N = what the read would lose. The current read's differentiator count minus the number of lines
// already carried, floored at zero — ask for the lines the carries do NOT cover, and no more. A
// company with no current read has nothing to lose, so it gets the slot path's own floor instead.
export function furtherDifferentiatorCount(
  currentDifferentiators: number, carriedCount: number, noCurrentReadFloor = DIFFERENTIATORS_MIN,
): number {
  if (currentDifferentiators === 0) return noCurrentReadFloor;   // no current read ⇒ the floor
  return Math.max(0, currentDifferentiators - carriedCount);
}
