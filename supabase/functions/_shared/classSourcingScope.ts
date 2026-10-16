// ── SOURCING SCOPE — the (b) check searches the whole live record, not only the pool ──────────────
//
// Operator ruling, signed 2026-10-08. The class fact-check sources a specific against the rows a
// field CITES, and those come from the capped pool: 20 signals of ~200 live candidates, 25 own-words
// of 280. On the 2026-10-08 Edgewood run that cost a true claim: "over 90% of kinship youth remained
// in family settings" is in the record TWICE (signals 272f25cf, dfb6da68) and "recognized nationally"
// is in the own-words corpus (1b775321) — and none of the three survived the per-host breadth and the
// cap. The gate refused a claim the record plainly carries, because the pool is not the record.
//
// So: POOL FIRST, then the live record. A row found this way is not a silent justification — it is
// ADMITTED to the read's ledger as a cited row with its class, and appended to the field's citations,
// so the stored read cites what actually sourced it and every downstream guard sees it. A miss stays
// a miss: nothing is invented, and a specific no row carries still goes to the judge.
//
// NARROWING I HAD TO CHOOSE, and why. The ruling says "the company's live signals (class record or
// you …)" with no band restriction. This module restricts to signal_band='outside' anyway, because
// an 'organization'-band row is INTERNAL provenance: admitting one to a public read's ledger would
// put a non-public id in input_ledger.provenances and citationsLivePublic (guard 4) would refuse the
// whole kind — the public-only invariant of this generator outranks a wider search. Every row this
// module can admit is therefore public_observed, exactly like a pool row.
// G3 (operator ruling, 2026-10-13): PASS 2 asks the SAME question the gate asks, so it imports the
// gate's own second-chance function rather than re-deriving the rule. Two authorities on one rule is
// how a rule rots — the reason classOkFromVerdict was deleted from publicReadGuards.ts.
import { extractSpecifics, specificIsSourcedWithSecondChance, type Specific } from "./classFactCheck.ts";
import { isPublicSignalSourceType } from "./clientMaterial.ts";
import { isAnalysisRow } from "./voiceLabel.ts";

export type SourcingClass = "record" | "you";
export type SourcingRow = { id: string; kind: "signal" | "own_word"; text: string; cls: SourcingClass };
export type SourcingSearch = {
  /** every candidate row considered, for the report */
  searched: { signals: number; own_words: number };
  /** the rows that carried at least one specific, in the order they were first needed */
  hits: SourcingRow[];
  /** specific token → the row that carried it */
  bySpecific: Map<string, SourcingRow>;
};

// deno-lint-ignore no-explicit-any
type AnySupabase = { from: (t: string) => any };

// ── V1-R6 (operator ruling, 2026-10-13): ONE function builds a row's text ────────────────────────
//
// Row 9830 refused the Edgewood positioning stage with carried_span_drift on both carried rows, and
// nothing had drifted. Selection hashed a signal's text as `claim_text + " " + evidence_excerpt`
// (463 chars for dfb6da68); the drift re-read in generate-public-read hashed `claim_text` alone
// (231 chars). Two places assembled the same row's text, so the sha could never match and no carry
// could ever stage. Fail-closed worked exactly as designed — it was the question that was wrong.
//
// R6 removes the second question. rowTextOf is the only place a row's text is assembled, and
// ROW_TEXT_COLUMNS is the only statement of which columns that takes. The re-read derives its
// SELECT from the same constant (rowTextSelect), so a column added to a kind's text reaches both
// sides in one edit and cannot reach only one.
export type RowTextKind = "signal" | "own_word" | "finding";

/** The columns a kind's text is built from, in join order. The re-read's SELECT is derived from this
 *  — never written out a second time. */
export const ROW_TEXT_COLUMNS: Readonly<Record<RowTextKind, readonly string[]>> = {
  signal: ["claim_text", "evidence_excerpt"],
  own_word: ["quote"],
  finding: ["body"],
} as const;

/** The table each kind lives in. Used by the re-read, which is given ids and not kinds. */
export const ROW_TEXT_TABLES: ReadonlyArray<{ table: string; kind: RowTextKind }> = [
  { table: "signals", kind: "signal" },
  { table: "findings", kind: "finding" },
  { table: "own_words_candidates", kind: "own_word" },
] as const;

/** THE one assembly. Every caller — selection, PASS 2, the hedge question, the drift re-read —
 *  comes through here, so no two callers can disagree about what a row says. */
export function rowTextOf(kind: RowTextKind, row: Readonly<Record<string, unknown>>): string {
  // ── (operator ruling, 2026-10-16): ONLY DISTINCT COLUMNS ARE JOINED ───────────────────────────
  //
  // A signal's text was `claim_text + " " + evidence_excerpt`, unconditionally. On 2269 of 3175
  // signals — 1791 of 2067 pool-eligible rows — those two columns are BYTE-IDENTICAL, so the row
  // text handed to the model, to the drift re-read and to every gate was one sentence twice, joined
  // by a single space and no punctuation. The seam is not cosmetic: the clause splitter sees no
  // sentence end there, so a clause can run off the end of copy 1 into the start of copy 2. IAQM's
  // staged positioning carried exactly such a clause — span {102,214} over a seam at 175 — and the
  // line reads "...dry ice blasting, decontamination BBB accredited since September 7, 2005".
  //
  // So a column already said by an earlier column is dropped before the join. Containment, not
  // equality: a column that merely repeats part of an earlier one adds nothing either. The join
  // stays a single space, every column's own text is untouched, and a row whose columns differ is
  // unchanged. THIS IS THE ONE BUILDER — the pool, the drift re-read, the S1/N1 re-check, continuity
  // and the cost harness all read row text through here, so none of them can see a different text.
  const kept: string[] = [];
  for (const c of ROW_TEXT_COLUMNS[kind]) {
    const v = String(row[c] ?? "").trim();
    if (!v) continue;
    if (kept.some((k) => k.includes(v))) continue;
    kept.push(v);
  }
  return kept.join(" ").trim();
}

/** The SELECT list the re-read needs for a kind: the id plus every column rowTextOf reads. */
export function rowTextSelect(kind: RowTextKind): string {
  return ["id", ...ROW_TEXT_COLUMNS[kind]].join(", ");
}

/**
 * THE drift re-read. Given the row ids a carried block names, return each row's text as rowTextOf
 * builds it — the same function, over every column that function reads for that kind.
 *
 * A row that is present but now empty keeps its entry (""), so driftedSpans calls it sha_drift (the
 * row was emptied) rather than row_missing (the row is gone). Those are different facts.
 */
export async function reReadRowTexts(
  supabase: AnySupabase,
  rowIds: readonly string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (rowIds.length === 0) return out;
  for (const { table, kind } of ROW_TEXT_TABLES) {
    const { data } = await supabase.from(table).select(rowTextSelect(kind)).in("id", rowIds);
    for (const r of ((data ?? []) as Array<Record<string, unknown>>)) {
      out[String(r.id)] = rowTextOf(kind, r);
    }
  }
  return out;
}

/** The class of a live signal, by the standing rule: the analysis mark FIRST, then the voice label.
 *  An analysis row is OUR read and can never be sourcing evidence, so it is dropped, not classed. */
function sourcingClassOfSignal(s: { voice_class?: string | null; raw_payload?: unknown }): SourcingClass | null {
  if (isAnalysisRow(s)) return null;
  return s.voice_class === "client_voice" ? "you" : "record";
}

/**
 * Search the company's LIVE record for rows carrying any of `specifics`.
 *
 * QUERIES (both scoped to the company, both live-only):
 *   signals  .eq(company_id).eq(signal_band,'outside').is(superseded_at,null).is(held_at,null)
 *            then isAnalysisRow dropped, class by voice_class
 *   own_words_candidates .eq(company_id).eq(judge_keep,true), kept only where the row's
 *            content_identity has an ACTIVE own_words claim — the same authority the pool's O lane
 *            uses, so a quote the pool would refuse is not admitted here by a side door.
 *
 * `alreadyCited` holds the ids the field already cites, so a row that failed to source in the pool
 * pass is never re-offered as if it were new.
 */
/** V1-R4 (operator ruling, 2026-10-13): the candidate gathering, factored out UNCHANGED so the
 *  pre-generation span search sees exactly the rows PASS 2 sees. Extracted, not reimplemented —
 *  a second copy of this query is how the two searches would drift apart.
 *
 *  Every predicate is byte-identical to what searchLiveRecordForSpecifics ran before: outside band,
 *  live (not superseded, not held), a sourcing class, not already cited; own-words rows gated on an
 *  ACTIVE own_words claim's content_identity and judge_keep. */
export async function liveRecordCandidates(
  supabase: AnySupabase,
  companyId: string,
  alreadyCited: ReadonlySet<string>,
): Promise<{ candidates: SourcingRow[]; searched: { signals: number; own_words: number } }> {
  const searched = { signals: 0, own_words: 0 };
  const candidates: SourcingRow[] = [];

  const { data: sigRows } = await supabase
    .from("signals")
    .select("id, claim_text, evidence_excerpt, voice_class, raw_payload, source_type")
    .eq("company_id", companyId).eq("signal_band", "outside")
    .is("superseded_at", null).is("held_at", null);
  for (const r of ((sigRows ?? []) as Array<{ id: string; claim_text: string | null; evidence_excerpt: string | null; voice_class: string | null; raw_payload?: unknown; source_type?: unknown }>)) {
    searched.signals++;
    // W1: the SAME predicate selectPublicInputs applies — a row the pool may not hold is a row this
    // lane may not admit or carry either. A PASS 2 admission and a carried span both land in the
    // stored ledger, so this lane is a way into the read exactly as the pool is.
    if (!isPublicSignalSourceType(r.source_type)) continue;
    const cls = sourcingClassOfSignal(r);
    if (!cls || alreadyCited.has(r.id)) continue;
    const text = rowTextOf("signal", r);                    // R6: the ONE assembly
    if (text) candidates.push({ id: r.id, kind: "signal", text, cls });
  }

  const { data: owClaims } = await supabase
    .from("claims").select("raw_payload").eq("company_id", companyId).eq("claim_type", "own_words").eq("status", "active");
  const activeIdentities = new Set(
    ((owClaims ?? []) as Array<{ raw_payload?: { content_identity?: string } }>)
      .map((c) => c.raw_payload?.content_identity).filter((x): x is string => !!x),
  );
  const { data: owRows } = await supabase
    .from("own_words_candidates").select("id, quote, content_identity").eq("company_id", companyId).eq("judge_keep", true);
  for (const r of ((owRows ?? []) as Array<{ id: string; quote: string | null; content_identity: string | null }>)) {
    searched.own_words++;
    if (!r.content_identity || !activeIdentities.has(r.content_identity)) continue;
    if (alreadyCited.has(r.id)) continue;
    const text = rowTextOf("own_word", r);                   // R6: the ONE assembly
    if (text) candidates.push({ id: r.id, kind: "own_word", text, cls: "you" });
  }
  return { candidates, searched };
}

export async function searchLiveRecordForSpecifics(
  supabase: AnySupabase,
  companyId: string,
  specifics: readonly Specific[],
  alreadyCited: ReadonlySet<string>,
): Promise<SourcingSearch> {
  const out: SourcingSearch = { searched: { signals: 0, own_words: 0 }, hits: [], bySpecific: new Map() };
  if (specifics.length === 0) return out;

  const gathered = await liveRecordCandidates(supabase, companyId, alreadyCited);
  const candidates = gathered.candidates;
  out.searched = gathered.searched;

  // first match wins, in candidate order: a deterministic pick, and at most one new row per specific
  for (const sp of specifics) {
    const hit = candidates.find((c) => specificIsSourcedWithSecondChance(sp, [c.text]));
    if (!hit) continue;
    out.bySpecific.set(sp.token, hit);
    if (!out.hits.some((h) => h.id === hit.id)) out.hits.push(hit);
  }
  return out;
}

/**
 * Does ANY of OUR OWN rows carry this specific? Analysis signals and open findings — the rows that
 * are never sourcing evidence, because our read cannot source itself. Used only to tell two very
 * different failures apart (ruling 2026-10-08):
 *   carried by one of ours  → the claim is OURS to hedge; the judge decides whether we hedged it.
 *   carried by nothing      → UNSUPPORTED. There is nothing to cite and nothing to hedge, and the
 *                             field refuses at stage without a judgment.
 */
export async function specificsCarriedByOurOwnRows(
  supabase: AnySupabase,
  companyId: string,
  specifics: readonly Specific[],
): Promise<Set<string>> {
  const out = new Set<string>();
  if (specifics.length === 0) return out;
  const [sg, fd] = await Promise.all([
    supabase.from("signals").select("id, claim_text, evidence_excerpt, voice_class, raw_payload")
      .eq("company_id", companyId).is("superseded_at", null).is("held_at", null),
    supabase.from("findings").select("id, body").eq("company_id", companyId).eq("status", "open"),
  ]);
  const texts: string[] = [];
  for (const r of ((sg.data ?? []) as Array<{ claim_text: string | null; evidence_excerpt: string | null; voice_class: string | null; raw_payload?: unknown }>)) {
    if (!isAnalysisRow(r)) continue;                       // ours ONLY — the rest is sourcing evidence
    texts.push(rowTextOf("signal", r));                      // R6: the ONE assembly
  }
  for (const r of ((fd.data ?? []) as Array<{ body: string | null }>)) texts.push(rowTextOf("finding", r));
  // the same rule here too: whether a specific is ours to hedge must not depend on word order
  // either, or PASS 3 would call a figure our own rows plainly carry "unsupported" — which is final.
  for (const sp of specifics) if (texts.some((t) => specificIsSourcedWithSecondChance(sp, [t]))) out.add(sp.token);
  return out;
}

/** The specifics of a field text that a decision left unsourced — the search input. */
export function unsourcedSpecificsOf(text: string, unsourcedTokens: readonly string[]): Specific[] {
  const want = new Set(unsourcedTokens);
  return extractSpecifics(text).filter((s) => want.has(s.token));
}
