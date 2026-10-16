// ── NP (operator ruling, 2026-10-15): ONE BUILDER FOR EVERY RE-ASK, CONTINUITY AND NAMES ────────
//
// WHY. Wasabi's stage was refused twice in one run, each time by a gate that could only see half the
// problem (audits 10454 → 10455).
//
//   attempt 1  C1-S: the still-sourced AI-products line was dropped. C1-R re-asked, carrying the
//              line's text and the ids of the rows that still SOURCE it — 2242bdd1 and 7638775d.
//   attempt 2  the model obeyed exactly: it wrote the line back and cited those two rows. N1 then
//              refused it, because neither row states the names the line uses — "Wasabi Fire" and
//              "AI/ML". Both names WERE in the pool: 9373abfc states Wasabi Fire, c30e9189 states
//              AI/ML, each admitted by N2's name harvest. Nothing told the model they existed.
//
// The continuity prompt knew about sourcing rows; the names prompt (N1c) knew about name rows; the
// budget is one re-ask, and the line needed both. A line can be continued only if it can also be
// sourced — for its figures AND for its names — so the two facts belong in one block, built once.
//
//   THE RULE: one function builds re-ask feedback, for every refusal type, and it covers both
//   continuity and names for every line it names.
//
// A name with no supporting row is SAID SO rather than omitted: "stated in NO row of this ledger" is
// the one honest answer, and it tells the model to drop the name or the claim instead of guessing.
import {
  extractSpecifics, namesIn, reputationWordsIn, S1_POSITION_WORDS,
} from "./classFactCheck.ts";

/** U1: what a uuid looks like, so one can never be printed as if it were a citable token. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A pool row, as both the gate and the prompt see it. `cls` is the source class; `kind` matters
 *  because a finding is our own synthesis and may never source a name (S1/N1). */
export type SourceRow = { id: string; kind: string; cls: string; text: string };

/** One line the re-ask is about. Both dimensions are optional per line, but the BLOCK always states
 *  both: a line with no sourcing ids says so, and a line whose names are all sourced says so. */
export type FeedbackLine = {
  /** the field path, when the caller knows it. The BLOCK never prints it — a field path is the
   *  enforcer's business, not the prompt's — but a caller that has one may pass it for the record. */
  field?: string;
  text: string;
  /** C1-S: the ids that make this line still-sourced. Empty for a line the re-ask is about for
   *  another reason — the block then says it carries no surviving source. */
  sourcing_citations?: readonly string[];
  /** S1/N1: the specifics and names this line asserted that its OWN cited rows do not state. When
   *  absent, every name in the line is still listed with its support, because the model is being
   *  asked to write the line again and needs to know what it may cite. */
  unsourced?: readonly string[];
  /** NP2 (operator ruling, 2026-10-15): words this line asserts that NO row in the whole pool
   *  states verbatim — specifics (S1), names (N1) and reputation words (S1b), measured against
   *  every sourcing row, not just the line's own citations. A line whose words are nowhere in the
   *  pool cannot be continued as written at any citation, so the model is told BEFORE it writes
   *  rather than refused afterwards. */
  unsupported_by_pool?: readonly string[];
  /** CR (operator ruling, 2026-10-15): how many rows this line cited, when that exceeded the cap.
   *  CITE_RULE has always said "cite AT MOST 3 per claim" and nothing enforced it: Wasabi's attempt
   *  2 cited FOUR on one line and spent the slot it needed for the AI/ML row on a second row for a
   *  name already covered (audit 10494). A line told only "too many" cannot tell which to drop, so
   *  the entry keeps its name rows beside the count — the names say which citations are load-bearing. */
  over_cited?: { count: number; cap: number };
};

/** Rows that may source a name: class record or you, never a finding. The ruling bars a finding
 *  outright, so it is excluded by KIND as well as by class — a finding classed `you` would
 *  otherwise slip through. */
export function canSource(row: SourceRow): boolean {
  if (row.kind === "finding") return false;
  return row.cls === "record" || row.cls === "you";
}

/** The pool rows that state `token` VERBATIM and are allowed to source it. Capped: enough to choose
 *  from, not a dump of the ledger. */
export function nameSupport(
  token: string, pool: readonly SourceRow[], limit = 4,
): string[] {
  const out: string[] = [];
  for (const row of pool) {
    if (!canSource(row)) continue;
    if (!row.text.includes(token)) continue;
    out.push(row.id);
    if (out.length >= limit) break;
  }
  return out;
}

/** NP2: the words a line asserts that NO row in the pool states verbatim — specifics (S1's governed
 *  set), names (N1, own name excluded) and reputation words (S1b), measured against EVERY sourcing
 *  row rather than the line's own citations.
 *
 *  WHY IT IS HERE. Wasabi's strategy refused on "leading"/"unmatched" (audit 10653) and its offering
 *  on a label name (10655/10656) — in each case the model had written a word the pool could not
 *  support anywhere, and learned so only after spending its one re-ask. The still-sourced block
 *  already tells it which rows state each NAME; this tells it which words no row states at all.
 *  Same builder, one implementation. */
export function unsupportedByPool(
  text: string, pool: readonly SourceRow[], companyName: string,
): string[] {
  const sourcing = pool.filter(canSource);
  const states = (w: string) => sourcing.some((r) => r.text.includes(w));
  const words = [
    ...namesToSource(text, companyName),
    ...extractSpecifics(text)
      .filter((sp) => sp.kind === "figure" || (sp.kind === "exclusivity" && S1_POSITION_WORDS.has(sp.token.toLowerCase())))
      .map((sp) => sp.token),
    ...reputationWordsIn(text),
  ];
  return [...new Set(words)].filter((w) => !states(w));
}

/** The names in a line, minus the company's own name when that is the WHOLE name — the same
 *  exclusion N1 applies, so the block never asks the model to source "Wasabi". */
export function namesToSource(text: string, companyName: string): string[] {
  const own = new Set(String(companyName ?? "").toLowerCase().split(/\s+/).filter(Boolean));
  return namesIn(text).filter((n) =>
    !(own.size > 0 && n.toLowerCase().split(/[\s/]+/).every((w) => own.has(w))));
}

export type FeedbackEntry = {
  field?: string;
  text: string;
  /** CR: present only when this line cited more rows than the cap allows. */
  over_cited?: { count: number; cap: number };
  /** NP2: words no pool row states verbatim. */
  unsupported_by_pool?: readonly string[];
  /** the ids that still source the line (C1-S), translated to what the model may cite */
  sourcing: string[];
  /** every name the line must be able to source, with the rows that state it */
  names: Array<{ name: string; support: string[]; unsourced: boolean }>;
};

/** THE ONE BUILDER. Given the lines a refusal is about and the pool, state for each: its text, the
 *  rows that still source it, and for every name in it, the rows that state that name verbatim. */
export function reaskFeedback(args: {
  lines: readonly FeedbackLine[];
  pool: readonly SourceRow[];
  companyName: string;
  /** uuid → the ref token the model may cite. Ids pass through unchanged when absent. */
  refByUuid?: ReadonlyMap<string, string>;
}): FeedbackEntry[] {
  // ── U1 (operator ruling, 2026-10-15): BRACKETED TOKENS, AND NEVER A UUID ────────────────────
  // CITE_RULE tells the model the valid tokens are the ones "printed in square brackets at the
  // start of its line (e.g. [S1])", and that any other token INVALIDATES THE WHOLE RESPONSE. The
  // generation-time still-sourced block was built without refByUuid, so it named rows as raw uuids
  // — ids the model is forbidden to cite. It was pointing at evidence in a form that could not be
  // used, which is the mechanism NP and NP2 both rest on.
  //
  // An id with no mapping is DROPPED rather than printed: a uuid in a prompt is worse than a
  // missing one, because the model may copy it and lose the whole response.
  const tok = (id: string): string | null => {
    const ref = args.refByUuid?.get(id);
    if (ref) return `[${ref}]`;
    // already a ref token (no map given, or the caller passed tokens): bracket it as-is
    if (!UUID_RE.test(id)) return `[${id}]`;
    return null;
  };
  return args.lines.map((l) => {
    const refused = new Set(l.unsourced ?? []);
    return {
      field: l.field,
      text: l.text,
      over_cited: l.over_cited,
      unsupported_by_pool: l.unsupported_by_pool,
      sourcing: [...(l.sourcing_citations ?? [])].map(tok).filter((x): x is string => x !== null),
      names: namesToSource(l.text, args.companyName).map((name) => {
        const support = nameSupport(name, args.pool).map(tok).filter((x): x is string => x !== null);
        return { name, support, unsourced: support.length === 0 || refused.has(name) };
      }),
    };
  });
}

/** The block as the model reads it. Every entry states BOTH dimensions, always — a silence about one
 *  of them is how attempt 2 cited two rows that could not carry its names. */
export function reaskFeedbackBlock(args: {
  lines: readonly FeedbackLine[];
  pool: readonly SourceRow[];
  companyName: string;
  refByUuid?: ReadonlyMap<string, string>;
}): string {
  const entries = reaskFeedback(args);
  if (entries.length === 0) return "";
  return entries.map((e) => {
    const head = `  "${e.text}"`;
    const src = e.sourcing.length > 0
      ? `\n      still stated by: ${e.sourcing.join(", ")}`
      : `\n      still stated by: no row of this ledger — this line has no surviving source`;
    const names = e.names.length === 0
      ? `\n      names to source: none`
      : `\n      names to source: ` + e.names.map((n) =>
          n.support.length > 0
            ? `"${n.name}" -> ${n.support.join(", ")}`
            : `"${n.name}" -> stated in NO row of this ledger`).join(" | ");
    // NP2: the words the pool cannot support, in the ruling's own sentence. It sits with the line
    // it is about, so "drop them or cite a row that does" has an antecedent.
    // NP2 wording (operator ruling, 2026-10-15): "drop them" was read as DROP THE LINE. Wasabi's
    // re-asked strategy removed winning_aspiration entirely rather than the two words, and C1-S
    // refused it with the budget gone (10695 -> 10696). The sentence now says to keep the line
    // first, and names the remedy as removing the WORDS.
    const unsupported = (e.unsupported_by_pool ?? []).length > 0
      ? `\n      Keep this line. No row in the pool states: ${(e.unsupported_by_pool ?? []).map((w) => `"${w}"`).join(", ")}. Remove those words, or cite a row that states them.`
      : "";
    // CR: the count, next to the name rows that say which of its citations are load-bearing.
    const cap = e.over_cited
      ? `\n      too many citations: ${e.over_cited.count} cited, at most ${e.over_cited.cap} allowed — keep the rows named above and drop the rest`
      : "";
    return head + src + names + unsupported + cap;
  }).join("\n");
}
