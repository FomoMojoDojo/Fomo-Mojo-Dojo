// ── C1 / C2 (operator rulings, 2026-10-13): two STAGE-TIME checks that REFUSE ────────────────────
//
// The specifics rules of P1/P2 told the model two things nothing could enforce, and on the first two
// runs after the figure-gate fix it disregarded both:
//
//   clause (2) — a sourced specific is stated as its row states it. The model wrote "nationally
//     pioneering kinship program" where its own cited row dfb6da68 says "the first kinship program
//     in the country". The fact-check cleared it, correctly: every specific LEFT in the sentence was
//     sourced. Softening is invisible to a gate that asks "is what you wrote supported?" — it
//     removes nothing the gate looks for.
//
//   clause (7) — keep the differentiators the current read carries. A line went missing and nothing
//     noticed, because no check compares a staged read to the one it would replace.
//
// Both checks here REFUSE and never rewrite, and neither gets a re-ask: the re-ask exists to repair
// a CLASS refusal (generate-public-read reaskOnClassRefusal, which returns null for any other
// fault), and a dropped or softened line is an editorial fault, not an unsourced one.
//
// They live in their own module rather than in classFactCheck.ts on purpose. That module answers one
// question — is this specific sourced — and these answer a different one: did we lose something the
// record gave us. Keeping them apart is what lets voiceLabel.test.ts's pins on the gate stay meaningful.
import { decideFieldClass, extractSpecifics } from "./classFactCheck.ts";
import { reaskFeedbackBlock, type SourceRow } from "./reaskFeedback.ts";
import { verbatimProvable } from "./ownWordsExtract.ts";
import { normalizeForHash } from "./contentIdentity.ts";

/** The refusal strings, in the `guard` shape generate-public-read already uses. */
export const CONTINUITY_GUARD = "continuity_line_dropped" as const;
export const SOFTENING_GUARD = "specific_softened" as const;

export type CitedLine = {
  /** the field path, when the caller knows it. C1/C2 ignore it; V1's carry selection needs it to
   *  know WHICH line it is choosing a span for. */
  field?: string;
  /** the rendered statement */
  text: string;
  /** the inherited source class; only our_read is softening-checked */
  cls: string | null;
  /** the citation ids as the field carries them */
  refs: string[];
};

// ── C2: POSITION words only ─────────────────────────────────────────────────────────────────────
// classFactCheck's EXCLUSIVITY list mixes two kinds of word, and only one of them can be softened.
//
//   POSITION claims — only, sole, first, largest … — assert a fact about where the company stands.
//     Dropping one while keeping the rest of the sentence misreports the record.
//   REPUTATIONAL judgements — best, leading, premier, foremost — are what a company says about
//     itself in its own copy ("we are a leading nonprofit provider"). A read that declines to repeat
//     those is doing the right thing, and they appear in nearly every own-words row: measured over
//     the 10 classed live reads, including them made the check refuse reads a human had accepted,
//     on generic overlap like "mental healthcare provider".
export const POSITION_WORDS = [
  "only", "sole", "solely", "first", "largest", "biggest", "smallest",
  "unmatched", "unrivaled", "unrivalled", "unique", "exclusive",
] as const;
export const REPUTATIONAL_WORDS = ["best", "leading", "premier", "foremost"] as const;
const POSITION_RE = new RegExp(`\\b(${POSITION_WORDS.join("|")})\\b`, "gi");

/** N = 3. Measured: N=2 refused the current live read on runs like "bay area"; N=4 missed the real
 *  f794c846 hedge because "90%" vs "90%+" broke the fourth word. Three is the value that refused
 *  both hedged reads and none of the ten live ones. */
export const SHARED_RUN_WORDS = 3;

const STOPWORDS = new Set(
  "the a an of in to and or for with its it is are as at by on that this we our you your their".split(" "),
);
/** Content words of a text, normalized the way the gate normalizes (so '90%+' survives). */
function contentWords(text: string): string[] {
  return normalizeForHash(text).split(/[^a-z0-9%+.\-]+/).filter((w) => w && !STOPWORDS.has(w));
}
function runsOf(text: string, n: number): Set<string> {
  const w = contentWords(text);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
}
/** The first shared content run of exactly n words, or null. This is the "same specific" test. */
export function sharedRun(a: string, b: string, n: number = SHARED_RUN_WORDS): string | null {
  const A = runsOf(a, n);
  for (const r of runsOf(b, n)) if (A.has(r)) return r;
  return null;
}

export type SofteningHit = { ref: string; word: string; shared_run: string };

/** C2 — one field against the rows IT cites. A row that carries a POSITION word the field does not,
 *  where row and field share a content run, is a softened sourced fact.
 *  Deterministic by construction: regex plus a set intersection, no model. */
export function softenedSpecifics(
  line: CitedLine,
  textByRef: Readonly<Record<string, string>>,
  classByRef: Readonly<Record<string, string>>,
  n: number = SHARED_RUN_WORDS,
): SofteningHit[] {
  if (line.cls !== "our_read") return [];      // not our assertion — nothing of ours to soften
  const lineWords = new Set(normalizeForHash(line.text).split(/[^a-z0-9%+.\-]+/).filter(Boolean));
  const seen = new Set<string>();
  const hits: SofteningHit[] = [];
  for (const ref of line.refs) {
    const cls = classByRef[ref];
    if (cls !== "record" && cls !== "you") continue;   // only the record can be softened
    const row = textByRef[ref] ?? "";
    for (const m of row.matchAll(POSITION_RE)) {
      const word = m[1].toLowerCase();
      if (lineWords.has(word)) continue;               // the field carries it — nothing lost
      const shared = sharedRun(row, line.text, n);
      if (!shared) continue;                           // a position claim about something else
      const key = `${ref}:${word}`;
      if (seen.has(key)) continue;                     // a row's text can repeat the word
      seen.add(key);
      hits.push({ ref, word, shared_run: shared });
    }
  }
  return hits;
}

export type MissingLine = {
  statement: string; specifics: string[]; reason: string;
  /** P2: a dropped line names the rows it rested on, so the cause is checkable without a re-query. */
  citations?: string[]; field?: string;
  /** C1-S: true when at least one citation is a record/you signal or own_word in the new pool. Such
   *  a drop refuses whatever the predecessor's gen_rules_version. */
  still_sourced?: boolean;
  /** C1-S: exactly which of its citations made it still-sourced. */
  sourcing_citations?: string[];
};

/** C1 — the staged read against the read it would replace.
 *
 *  A GENERATED staged line continues a current line when it shares at least one citation AND
 *  carries every specific token of that line. Deliberately not normalizeForHash equality and not
 *  verbatim containment: both refuse an IMPROVED line, and improving a line is the point of
 *  regenerating (adding the 90% to the kinship statement would have been blocked by either).
 *
 *  C1-A (operator ruling, 2026-10-13): a CARRIED line continues BY ANCHOR, not by citation. R3 makes
 *  a carried line's citations its span's row — they REPLACE the model's, so a carried line can never
 *  share a citation with the current line it was carried for even when both state the same fact.
 *  Refusal 9868 was exactly that: current unique_attributes[1] cites 99037383, the line carried for
 *  it cites dfb6da68, and the shared-citation half of the test could not be satisfied by any carry.
 *  So for a carried line the anchor IS the test: it continues the current line at its own field path
 *  — the path R4 searched on, the one tagged carry:<path> — and it must still carry every specific
 *  token of that current line. The carriage half is unchanged and does the discriminating: on
 *  dfb6da68 only the span the carry chose ({45,114}) carries `first`; the 90% clause and the
 *  30-years clause do not, so neither can pass itself off as a continuation of that line.
 *
 *  A current line must be continued UNLESS clause (7) licenses the drop: its cited rows have left
 *  the ledger, or it no longer passes the specifics check against what remains. Both are decided
 *  here by re-running the gate, never by guessing. */
export function droppedLines(args: {
  currentLines: readonly CitedLine[];
  stagedLines: readonly CitedLine[];
  newLedgerIds: ReadonlySet<string>;
  textByRef: Readonly<Record<string, string>>;
  classByRef: Readonly<Record<string, string>>;
  /** C1-A: the field paths this run CARRIED. A staged line at one of these is the record's own
   *  words, spliced over whatever the model wrote, with its citations replaced by the span's row. */
  carriedFields?: ReadonlySet<string>;
}): MissingLine[] {
  return classifyContinuity(args).dropped;
}

// ── C1-S (operator ruling, 2026-10-14): A STILL-SOURCED LINE MUST BE CONTINUED ──────────────────
//
// WHY. Wasabi's second staged read (31f2bba2, discarded as audit 10266) dropped the FedRAMP
// differentiator while cc5707ad — the row it cites — was IN the pool: P1 had just put it there. So
// the evidence was in front of the model and the line still went. The reason is that the generation
// prompt never showed the model the current read's lines: C1 was enforcing continuation of lines the
// model could not see, and C1-P's report-only mode meant it could not even refuse.
//
// C1-S separates two different situations that C1 had been treating alike:
//
//   STILL-SOURCED — at least one of the line's citations is a record- or you-class SIGNAL or
//     OWN_WORD in the new pool. The evidence is there, the line is shown to the model in the prompt,
//     and dropping it is a real loss. C1 REFUSES, whatever the predecessor's gen_rules_version: the
//     C1-P licence exists because a pre-rules read is not comparable, and a line whose own source is
//     sitting in the pool is comparable on any rules.
//
//   NOT STILL-SOURCED — nothing it cites survives into the pool as a usable source. Here the
//     predecessor's rules still decide, exactly as C1-P ruled: report-only against a pre-rules read.
//
// FINDINGS AND DELTAS DO NOT COUNT. A finding is our own synthesis and a delta is a composed pair;
// neither is a row the model can be shown and asked to continue from, and admitting them here would
// make a line "still-sourced" on evidence P1 deliberately will not admit. Measured over the 22
// current positioning reads: 94 of 104 lines are still-sourced, so C1 becomes enforcing for the
// great majority while the 10 that are not keep their licence.
export type PoolRowForSourcing = { id: string; kind: string; source_class: string };

/** C1-S: the ids a still-sourced test may count — record/you signals and own_words in the pool. */
export function sourcingIdsOf(pool: readonly PoolRowForSourcing[]): Set<string> {
  return new Set(pool
    .filter((r) => (r.kind === "signal" || r.kind === "own_word") &&
                   (r.source_class === "record" || r.source_class === "you"))
    .map((r) => r.id));
}

/** C1-S: is this current line still sourced — does it cite at least one usable pool row? */
export function isStillSourced(line: Pick<CitedLine, "refs">, sourcingIds: ReadonlySet<string>): boolean {
  return line.refs.some((r) => sourcingIds.has(r));
}

/** C1-S: the prompt block. TEXT AND CITATION IDS ONLY — no class, no reason, no specifics, no
 *  instruction about what to do with them beyond the heading. The model is being shown what the
 *  current read says and which rows say it, nothing more: anything else here is the enforcer's
 *  business leaking into the prompt, which is what Q1 took out of clause (7). */
export function stillSourcedPromptBlock(
  currentLines: readonly CitedLine[], sourcingIds: ReadonlySet<string>,
  // ── NP (operator ruling, 2026-10-15): THE NAME ROWS TRAVEL WITH THE LINE ──────────────────────
  // The block used to carry the line's text and its sourcing ids. A line can be continued only if it
  // can also be SOURCED, and a name is sourced by whichever row states it verbatim — which is often
  // not one of the rows that source the line. Wasabi's attempt 2 continued the AI-products line from
  // exactly the two ids this block named and was refused by N1 on "Wasabi Fire" and "AI/ML", both of
  // which were in the pool on other rows. So the pool and the company name come in, and the block is
  // built by the ONE re-ask feedback builder — the same one both re-ask branches use.
  pool: readonly SourceRow[] = [], companyName = "",
): string {
  const keep = currentLines.filter((l) => l.text.trim() && isStillSourced(l, sourcingIds));
  if (keep.length === 0) return "";
  const body = reaskFeedbackBlock({
    lines: keep.map((l) => ({
      field: l.field, text: l.text,
      sourcing_citations: l.refs.filter((r) => sourcingIds.has(r)),
    })),
    pool, companyName,
  });
  // The heading is the ruling's own phrase. The entries carry text, sourcing ids and name rows —
  // and no gate vocabulary: no class, no field path, no reason.
  return `\n\nCURRENT LINES TO CONTINUE OR IMPROVE — the read you are replacing states these, and the rows they cite are in the ledger above:\n` + body;
}

// ── P2 (operator ruling, 2026-10-14): THREE COUNTS, NEVER ARITHMETIC ────────────────────────────
//
// The block reported `continued = required - missing.length`, and on Wasabi that read "continued: 2"
// when exactly ONE line had continued. The other was the FedRAMP differentiator, LICENSED away
// because both of its sources had left the pool — a different fact, and the one that mattered: it is
// how a regeneration can lose a line and have the report call it continued. A licensed drop is not a
// continuation and must never be counted as one.
//
// So every current line lands in exactly one bucket, each carrying its own lines with text,
// citations and cause, and the counts are the bucket sizes.
export type ContinuityLine = { statement: string; citations: string[]; specifics: string[]; reason: string; field?: string };
export type ContinuitySplit = {
  continued: ContinuityLine[];
  licensed: ContinuityLine[];
  dropped: MissingLine[];
};

export function classifyContinuity(args: {
  currentLines: readonly CitedLine[];
  stagedLines: readonly CitedLine[];
  newLedgerIds: ReadonlySet<string>;
  textByRef: Readonly<Record<string, string>>;
  classByRef: Readonly<Record<string, string>>;
  carriedFields?: ReadonlySet<string>;
  /** C1-S: the record/you signal+own_word ids in the new pool. A dropped line that cites one of
   *  these is still-sourced, and refuses on any rules. Omitted ⇒ nothing is still-sourced, which is
   *  the pre-C1-S behaviour. */
  sourcingIds?: ReadonlySet<string>;
}): ContinuitySplit {
  const sourcing = args.sourcingIds ?? new Set<string>();
  const carried = args.carriedFields ?? new Set<string>();
  const missing: MissingLine[] = [];
  const continuedLines: ContinuityLine[] = [];
  const licensed: ContinuityLine[] = [];
  for (const old of args.currentLines) {
    if (!old.text.trim()) continue;
    const base = { statement: old.text, citations: [...old.refs], field: old.field };
    const present = old.refs.filter((r) => args.newLedgerIds.has(r));
    if (present.length === 0) {
      // LICENSED, cause 1: nothing it cited is in the new pool, so there is no evidence to continue
      // it from. P1 exists to make this rare: it admits the predecessor's citations ahead of the
      // ordinary selection ceiling, so a line loses its sources only when they truly left the record.
      licensed.push({ ...base, specifics: [], reason: "licensed: none of its citations is in the new ledger — its sources left the pool" });
      continue;
    }
    const cited = present
      .filter((r) => args.classByRef[r] === "record" || args.classByRef[r] === "you")
      .map((r) => args.textByRef[r] ?? "");
    const d = decideFieldClass({ field: "continuity", cls: old.cls, text: old.text, citedSourceTexts: cited });
    if (d.branch === "judge_required" || d.branch === "unsupported") {
      // LICENSED, cause 2: the line would not pass the fact-check today, so requiring it would be
      // requiring an unsourced line.
      licensed.push({ ...base, specifics: extractSpecifics(old.text).map((x) => x.token),
        reason: `licensed: the line is ${d.branch} against the new ledger — it would not pass the fact-check today` });
      continue;
    }
    const tokens = extractSpecifics(old.text).map((s) => s.token);
    const continued = args.stagedLines.some((n) => {
      // CARRIAGE — the same test for both kinds of line, and the only test C1-A relaxes around.
      if (!tokens.every((t) => verbatimProvable(t, n.text))) return false;
      // C1-A: a carried line answers for its OWN field path and nothing else. Not a free pass —
      // a carry at another path cannot continue this line, and it still had to carry the specifics.
      if (n.field !== undefined && carried.has(n.field)) return n.field === old.field;
      // a GENERATED line is unchanged: it must share a citation with the line it continues.
      return n.refs.some((r) => old.refs.includes(r));
    });
    if (continued) {
      const byAnchor = old.field !== undefined && carried.has(old.field);
      continuedLines.push({ ...base, specifics: tokens,
        reason: byAnchor
          ? `continued by CARRY ANCHOR at ${old.field} — the carried line holds every specific`
          : `continued by a staged line sharing a citation and holding every specific [${tokens.join(", ")}]` });
      continue;
    }
    const anchorCarried = old.field !== undefined && carried.has(old.field);
    const stillSourced = isStillSourced(old, sourcing);
    missing.push({
      statement: old.text,
      specifics: tokens,
      citations: [...old.refs],
      field: old.field,
      // C1-S: which of the two situations this drop is. The refusal reads this, not the predecessor's
      // stamp, for a line whose own source is in the pool.
      still_sourced: stillSourced,
      sourcing_citations: old.refs.filter((r) => sourcing.has(r)),
      reason: anchorCarried
        ? `dropped: the line carried at ${old.field} does not carry [${tokens.join(", ")}]`
        : `dropped: no staged line shares a citation and carries [${tokens.join(", ")}]`,
    });
  }
  return { continued: continuedLines, licensed, dropped: missing };
}

/** The block stored on integrity_runs — on ACCEPTANCE too, so a clean run is distinguishable from a
 *  vacuous one (no current read, nothing to continue). */
export type ContinuityBlock = {
  required: number;
  /** P2 (2026-10-14): the COUNT of lines that actually continued — never required minus missing. */
  continued: number;
  /** P2: the count of lines C1 licensed, which is NOT a continuation. */
  licensed_count: number;
  /** P2: the count of lines that dropped. required = continued + licensed_count + dropped_count. */
  dropped_count: number;
  /** P2: the three sets, each line with its text, citations and cause. */
  continued_lines: ContinuityLine[];
  licensed_lines: ContinuityLine[];
  missing: MissingLine[];
  softened: Array<{ field: string } & SofteningHit>;
  /** C1-S (2026-10-14): how many current lines were still-sourced — shown to the model and
   *  enforced on any rules — and which they were. */
  still_sourced_count?: number;
  still_sourced_lines?: Array<{ field: string; text: string; citations: string[] }>;
  /** C1-P (operator ruling, 2026-10-14): which mode C1 ran in for this kind. `enforced` refuses on a
   *  drop; `report_only` computes and records every drop but does not refuse, because the predecessor
   *  predates rules 2026-10-13.1 and a drop against it is not a comparable fact. Absent on blocks
   *  written before the ruling. */
  c1_mode?: "enforced" | "report_only";
  /** The predecessor's gen_rules_version, or null when it carried none — the fact that decided the mode. */
  predecessor_gen_rules_version?: string | null;
};
/** P2: the block is built from the SPLIT, so the three counts are bucket sizes and cannot disagree
 *  with the lines beside them. The old signature (required, missing, softened) computed `continued`
 *  by subtraction and that is exactly what the ruling removes. */
export function continuityBlock(
  split: ContinuitySplit, softened: Array<{ field: string } & SofteningHit>,
): ContinuityBlock {
  const required = split.continued.length + split.licensed.length + split.dropped.length;
  return {
    required,
    continued: split.continued.length,
    licensed_count: split.licensed.length,
    dropped_count: split.dropped.length,
    continued_lines: split.continued,
    licensed_lines: split.licensed,
    missing: split.dropped,
    softened,
  };
}
/** The `detail` string a refusal carries, in the ref:word:shared_run shape C2 names.
 *
 *  V2 (operator ruling, 2026-10-13): `field` is the FULL refused text, never a slice. The first
 *  specific_softened row (9712) stored only its first 60 characters, and because the refusal happens
 *  before the payload is built, the rest was gone — a refusal that cannot say what it refused is not
 *  an audit. publicReadPerKind.reject passes this through to excluded_by_rule.detail uncapped; only
 *  the log line and the `error` column keep the 200-char cap. */
export function softeningDetail(hits: Array<{ field: string } & SofteningHit>): string {
  return hits.map((h) => `"${h.field}" ${h.ref.slice(0, 8)}:${h.word}:"${h.shared_run}"`).join("; ");
}
/** C1-S: the dropped lines that were still-sourced — the ones that refuse on any rules. */
export function stillSourcedDrops(split: ContinuitySplit): MissingLine[] {
  return split.dropped.filter((d) => d.still_sourced === true);
}

export function continuityDetail(missing: MissingLine[]): string {
  return missing.map((m) => `"${m.statement}"`).join("; ");
}
