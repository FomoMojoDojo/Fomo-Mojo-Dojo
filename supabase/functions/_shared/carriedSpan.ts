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
import { VERBATIM_MAX_CHARS } from "./readSlots.ts";

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

/** A2 (amendment 2026-10-13) — RENDER ONLY. A leading date phrase and the company's own name may be
 *  dropped for display. The STORED text is untouched, so verbatimProvable against the span still
 *  holds; this is the same display-only licence the slot path has for sentence casing. */
export function renderCarried(stored: string, companyName: string): string {
  let out = stored;
  // a leading date phrase: "in 1993 ", "since 1993 ", "in January 2014 "
  out = out.replace(/^(?:in|since|from|as of)\s+(?:[A-Z][a-z]+\s+)?\d{4},?\s+/i, "");
  // the company's own name, once, at the start of what remains
  const n = companyName.trim();
  if (n) out = out.replace(new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i"), "");
  return out.trim();
}

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
