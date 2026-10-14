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
}): ContinuitySplit {
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
    missing.push({
      statement: old.text,
      specifics: tokens,
      citations: [...old.refs],
      field: old.field,
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
export function continuityDetail(missing: MissingLine[]): string {
  return missing.map((m) => `"${m.statement}"`).join("; ");
}
