// ── Public-read staging / promotion (operator ruling 6, signed 2026-09-18) ────────────────────────
//
// Two-phase acceptance: `stage` writes each kind's read NOT current (is_current=false, superseded_by NULL);
// `promote` flips it current and supersedes the prior current row. Before ruling 6 only a DIRECT write routed the
// strategy read's cascade gaps to the Questions beat (writeCascadeGaps) — promote flipped rows and left the prior
// live cascade_gap questions describing a strategy that was no longer current (Edgewood 913b716a). Now:
//
//   • stage keeps the strategy row's payload as the SPINE (what the preview renders) and adds `cascade_source`:
//     the raw five rungs, citations translated — the input the gap/tension derivation reads (deriveCascadeSpineAndGaps
//     grounds on the RAW payload and reads tensions from the verdict; a spine has incoherent rungs blanked, so
//     deriving from it alone would turn a tension into a gap). The judge's cascade_coherence stays on judge_verdict.
//   • promote of a STRATEGY row re-derives deriveCascadeSpineAndGaps(cascade_source ?? payload, judge_verdict.
//     cascade_coherence) and calls writeCascadeGaps — the prior live cascade_gap rows are superseded and the new
//     gaps inserted at promote time, exactly as the direct write does at write time. Other kinds touch no
//     cascade_gap row. A strategy that failed a guard was never staged (runKindsIsolated commits on accept only),
//     so promote finds no staged row and routes nothing — the same rule the direct write applies.
//   • FAIL CLOSED (amendment signed 2026-09-18): a staged strategy row WITHOUT cascade_source (staged before this
//     ruling) is never promoted from its payload — the spine would turn a tension into a gap. The promote of that
//     kind is refused with an error naming the read id; nothing is flipped, nothing is routed.
//
// Pure over a client shape ({ from }) so a fake client can exercise the whole promote path.
import { levelHits, levelItemsOfOfferingPayload, levelRefusalDetail, type LevelKind } from "./readLevel.ts";
import { deriveCascadeSpineAndGaps, type CascadeCoherence, type CascadeGapItem, type StrategyPayload } from "./cascadeRouting.ts";
// S1 (operator ruling, 2026-10-14): the stage gate runs AGAIN at promote. Same predicate, same
// module — a read that passed S1 when it was staged can fail it later, because the rows it cites are
// live and can be superseded, held or rewritten between the stage and the operator's acceptance.
import {
  namesIn, s1Detail, s1Unsourced, type S1Result, unsourcedLabelNames,
} from "./classFactCheck.ts";
import { reReadRowTexts } from "./classSourcingScope.ts";
import { citedSlotsOfStoredPayload, linesOfStoredPayload } from "./citedLines.ts";
import { pageWordsRefusalDetail, pageWordsVerdicts } from "./pageWordsRule.ts";
import { contradictionDetail, contradictionHits } from "./contradiction.ts";
import { insertIntegrityRun } from "./integrityWrite.ts";

// deno-lint-ignore no-explicit-any
type AnySupabase = { from: (t: string) => any };

export const CASCADE_SOURCE_KEY = "cascade_source" as const;
const RUNGS = ["winning_aspiration", "where_to_play", "how_to_win", "must_have_capabilities", "management_systems"] as const;

/** The raw rungs a staged strategy carries for promote-time routing (citations already translated by the caller). */
export function cascadeSourceOf(rawTranslated: Record<string, unknown>): StrategyPayload {
  const out: StrategyPayload = {};
  for (const r of RUNGS) if (r in rawTranslated) (out as Record<string, unknown>)[r] = rawTranslated[r];
  return out;
}

export class PromoteRefused extends Error {
  constructor(public readonly readId: string, public readonly kind: string, reason: string) {
    super(`promote refused (${kind}, read ${readId}): ${reason}`);
    this.name = "PromoteRefused";
  }
}

/** True iff the staged strategy row carries the raw rungs promote must derive from. */
export function hasCascadeSource(row: { payload?: Record<string, unknown> | null }): boolean {
  const src = row.payload?.[CASCADE_SOURCE_KEY];
  return !!src && typeof src === "object" && !Array.isArray(src);
}

/** The gap/tension set a promoted strategy row routes — from its cascade_source ONLY (fail closed: no payload fallback). */
export function cascadeItemsForPromotedStrategy(row: { id?: string; payload?: Record<string, unknown> | null; judge_verdict?: Record<string, unknown> | null }): CascadeGapItem[] {
  if (!hasCascadeSource(row)) throw new PromoteRefused(String(row.id ?? "?"), "strategy", "staged row has no cascade_source — cannot re-derive the cascade gaps; stage it again");
  const source = row.payload![CASCADE_SOURCE_KEY] as StrategyPayload;
  const coherence = (row.judge_verdict?.cascade_coherence ?? null) as CascadeCoherence | null;
  return deriveCascadeSpineAndGaps(source, coherence).items;
}

/** Stage B — route a strategy read's gaps + tensions to the Questions beat (idempotent): supersede every live
 *  cascade_gap row, insert the new set under one run id. Moved here from generate-public-read so the direct write and
 *  promote call the SAME function. */
export async function writeCascadeGaps(
  supabase: AnySupabase,
  companyId: string,
  items: CascadeGapItem[],
  model: { provider: string; model: string },
): Promise<{ superseded: number; inserted: number; run_id: string | null }> {
  const { data: prior } = await supabase.from("first_read_open_questions")
    .select("id").eq("company_id", companyId).eq("source_kind", "cascade_gap").eq("status", "live");
  const priorIds = ((prior ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (priorIds.length) {
    const { error } = await supabase.from("first_read_open_questions").update({ status: "superseded" }).in("id", priorIds);
    if (error) throw new Error(`cascade_gap supersede failed: ${error.message}`);
  }
  if (!items.length) return { superseded: priorIds.length, inserted: 0, run_id: null };
  const runId = `cascade:${crypto.randomUUID()}`;
  const rows = items.map((it) => ({
    company_id: companyId, run_id: runId, source_kind: "cascade_gap",
    question_text: it.question_text, question_identity: it.question_identity,
    anchor_identity: it.rung, status: "live",
    model_provider: model.provider, model_name: model.model,
  }));
  const { error } = await supabase.from("first_read_open_questions").insert(rows);
  if (error) throw new Error(`cascade_gap insert failed: ${error.message}`);
  return { superseded: priorIds.length, inserted: rows.length, run_id: runId };
}

export type Promoted = { kind: string; staged: string; superseded: string | null };
export type CascadeRouting = { superseded: number; inserted: number; run_id: string | null };

/** PROMOTE (accept): no generation, no model call. Per kind, flip the staged row current and supersede the prior
 *  current row; for a promoted STRATEGY, re-route the cascade gaps (ruling 6). */
/** S1 over ONE staged row, using its stored ledger for classes/kinds and a LIVE re-read for texts.
 *  Returns the refusal detail, or null to pass. */
export async function promoteS1Refusal(
  supabase: AnySupabase,
  row: { payload?: Record<string, unknown> | null; input_ledger?: Record<string, unknown> | null; company_id?: string },
): Promise<string | null> {
  // N1 at promote: the company's own name is excluded here exactly as at stage, so the two gates
  // cannot disagree about whether "Wasabi" is a name the record must state.
  let companyName = "";
  if (row.company_id) {
    const { data: co } = await supabase.from("companies").select("name").eq("id", row.company_id).maybeSingle();
    companyName = String((co as { name?: string } | null)?.name ?? "");
  }
  const payload = row.payload ?? null;
  const ledger = (row.input_ledger ?? {}) as Record<string, unknown>;
  const classes = (ledger.classes ?? {}) as Record<string, string>;
  // A row with NO classes map predates 1a-4; S1 has nothing to test a line against, and inventing a
  // class here would be guessing. Report-free pass, deliberately: the source-class guard already
  // holds those reads RED, which is the right place for that fact.
  if (!payload || Object.keys(classes).length === 0) return null;
  const byKind = (ledger.by_kind ?? {}) as Record<string, string[]>;
  const findingIds = new Set(byKind.finding ?? []);
  const lines = linesOfStoredPayload(payload);
  // ── O1 AT PROMOTE (operator ruling, 2026-10-15) ───────────────────────────────────────────────
  // linesOfStoredPayload takes a line's text from text|statement|promise|body — NEVER `label`. So
  // the re-check ran S1, N1 and S1b (which rides inside s1Unsourced) and labels were invisible to
  // it: a label could drift to a name its rows do not state between stage and promote and nothing
  // would catch it. The whole point of the re-check is that the ROWS are re-read live, so the half
  // it could not see was exactly the half most able to drift.
  const labelLines: Array<{ field: string; label: string; cls: string | null; refs: string[] }> = [];
  for (const [i, raw] of (Array.isArray((payload as Record<string, unknown>).items)
    ? (payload as Record<string, unknown>).items as unknown[] : []).entries()) {
    const it = (raw ?? {}) as Record<string, unknown>;
    const label = typeof it.label === "string" ? it.label : "";
    if (!label.trim()) continue;
    const refs = Array.isArray(it.citations) ? (it.citations as unknown[]).map(String)
      : Array.isArray(it.refs) ? (it.refs as unknown[]).map(String) : [];
    labelLines.push({ field: `items[${i}].label`, label, cls: typeof it.class === "string" ? it.class : null, refs });
  }
  const wanted = [...new Set([...lines.flatMap((l) => l.refs), ...labelLines.flatMap((l) => l.refs)])]
    .filter((id) => (classes[id] === "record" || classes[id] === "you") && !findingIds.has(id));
  const textNow = wanted.length ? await reReadRowTexts(supabase, wanted) : {};
  const results: S1Result[] = lines.map((l) => s1Unsourced({
    field: String(l.field ?? ""), text: l.text, cls: l.cls, companyName,   // N1 at promote too
    citedSourceTexts: l.refs
      .filter((id) => (classes[id] === "record" || classes[id] === "you") && !findingIds.has(id))
      .map((id) => textNow[id] ?? ""),
  }));
  // O1: each label against the rows ITS OWN item cites, re-read live. Same predicate as at stage,
  // same exclusions — record/you only, findings barred, the company's own name not demanded.
  for (const l of labelLines) {
    const bad = unsourcedLabelNames({
      field: l.field, label: l.label, cls: l.cls, companyName,
      citedSourceTexts: l.refs
        .filter((id) => (classes[id] === "record" || classes[id] === "you") && !findingIds.has(id))
        .map((id) => textNow[id] ?? ""),
    });
    results.push({
      field: l.field, cls: l.cls, examined: namesIn(l.label).length,
      unsourced: bad.map((n) => ({ kind: "name" as const, token: n })),
      unsourced_names: bad,
    });
  }
  return results.some((r) => r.unsourced.length > 0) ? s1Detail(results) : null;
}

/** Ruling 14 (2026-10-22): the LEVEL gate again at promote — the staged row's lines against the company's CURRENT
 *  offering read (re-read now: the catalogue may have moved since stage). Returns the refusal detail (L2–L4), or null. */
export async function promoteLevelRefusal(
  supabase: AnySupabase,
  companyId: string,
  kind: string,
  row: { payload?: Record<string, unknown> | null },
): Promise<string | null> {
  if (kind !== "positioning" && kind !== "promise" && kind !== "strategy") return null;
  if (!row.payload) return null;
  const { data: off } = await supabase.from("public_reads").select("payload").eq("company_id", companyId).eq("kind", "offering").eq("is_current", true).maybeSingle();
  const items = levelItemsOfOfferingPayload((off as { payload?: Record<string, unknown> } | null)?.payload ?? null);
  const { data: co } = await supabase.from("companies").select("name").eq("id", companyId).maybeSingle();
  const hits = levelHits(kind as LevelKind, linesOfStoredPayload(row.payload), items, String((co as { name?: string } | null)?.name ?? ""));
  return levelRefusalDetail(hits);
}

/** Ruling 39 (2026-10-22): the PAGE-WORDS rule again at promote — every stored record/you line against its cited rows'
 *  verified page words, RE-READ NOW. A line that fails was stamped record/you at stage and the record no longer carries
 *  its words: refuse. FAILS CLOSED — a re-read that cannot be made is a refusal, never a pass. */
export async function promotePageWordsRefusal(
  supabase: AnySupabase,
  companyId: string,
  row: { payload?: Record<string, unknown> | null },
): Promise<string | null> {
  if (!row.payload) return null;
  try {
    const refs = [...new Set(citedSlotsOfStoredPayload(row.payload).flatMap((x) => x.line.refs))];
    const rowText = refs.length ? await reReadRowTexts(supabase, refs) : {};
    const { data: co, error } = await supabase.from("companies").select("name").eq("id", companyId).maybeSingle();
    if (error) return `the company name could not be read (${error.message})`;
    return pageWordsRefusalDetail(pageWordsVerdicts(row.payload, rowText, String((co as { name?: string } | null)?.name ?? "")));
  } catch (e) {
    return `the cited rows could not be re-read (${(e as Error).message})`;
  }
}

/** Ruling 50 (2026-10-22): the CONTRADICTION check again at promote — every stored line against the staged read's own pool
 *  (its ledger ids, our read excluded), RE-READ NOW. FAILS CLOSED — a re-read that cannot be made is a refusal. */
export async function promoteContradictionRefusal(
  supabase: AnySupabase,
  row: { payload?: Record<string, unknown> | null; input_ledger?: Record<string, unknown> | null },
): Promise<string | null> {
  if (!row.payload) return null;
  try {
    const ledger = (row.input_ledger ?? {}) as { ids?: string[]; classes?: Record<string, string>; by_kind?: Record<string, string[]> };
    const ourRead = new Set([...Object.entries(ledger.classes ?? {}).filter(([, c]) => c === "our_read").map(([id]) => id), ...(ledger.by_kind?.finding ?? [])]);
    const lines = linesOfStoredPayload(row.payload);
    const ids = [...new Set([...(ledger.ids ?? []), ...lines.flatMap((l) => l.refs)])];
    const text = ids.length ? await reReadRowTexts(supabase, ids) : {};
    const pool = (ledger.ids ?? []).filter((id) => !ourRead.has(id) && text[id]).map((id) => ({ ref: id, text: text[id] }));
    return contradictionDetail(contradictionHits(lines, (r) => text[r] ?? "", pool));
  } catch (e) {
    return `the staged read's rows could not be re-read (${(e as Error).message})`;
  }
}

export async function promoteStagedReads(
  supabase: AnySupabase,
  companyId: string,
  kinds: readonly string[],
): Promise<{ promoted: Promoted[]; cascade_routing: CascadeRouting | null }> {
  const promoted: Promoted[] = [];
  let cascadeRouting: CascadeRouting | null = null;
  for (const kind of kinds) {
    const { data: staged } = await supabase.from("public_reads")
      .select("id, payload, input_ledger, judge_verdict, model_provider, model_name").eq("company_id", companyId).eq("kind", kind).eq("is_current", false).is("superseded_by", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const stagedRow = staged as { id?: string; payload?: Record<string, unknown> | null; input_ledger?: Record<string, unknown> | null; judge_verdict?: Record<string, unknown> | null; model_provider?: string | null; model_name?: string | null } | null;
    const stagedId = stagedRow?.id ?? null;
    if (!stagedId) { promoted.push({ kind, staged: "", superseded: null }); continue; }
    // FAIL CLOSED — decided BEFORE any write: a strategy row without cascade_source refuses the promote of this kind.
    if (kind === "strategy" && !hasCascadeSource(stagedRow!)) {
      throw new PromoteRefused(stagedId, kind, "staged row has no cascade_source — cannot re-derive the cascade gaps; stage it again");
    }
    // ── S1 AT PROMOTE (operator ruling, 2026-10-14) ───────────────────────────────────────────
    // Decided BEFORE any write, like the cascade_source check above it. The staged row's own ledger
    // says which class each cited id carries and which ids are findings; the row TEXTS are re-read
    // live through rowTextOf, because a stage-time pass is no promise about now.
    const s1 = await promoteS1Refusal(supabase, { ...stagedRow!, company_id: companyId });
    if (s1) throw new PromoteRefused(stagedId, kind, `S1: a record/you line asserts what its cited rows do not say — ${s1}`);
    // ── LEVEL AT PROMOTE (ruling 14) — decided before any write, like S1 ────────────────────────────────────────────
    const lvl = await promoteLevelRefusal(supabase, companyId, kind, stagedRow!);
    if (lvl) throw new PromoteRefused(stagedId, kind, `LEVEL: a line restates the offering where a ${kind} line belongs — ${lvl}`);
    // ── PAGE WORDS AT PROMOTE (ruling 39) — decided before any write, like S1 and level; fails closed ──────────────────
    const pw = await promotePageWordsRefusal(supabase, companyId, stagedRow!);
    if (pw) throw new PromoteRefused(stagedId, kind, `PAGE WORDS: a record/you line's words are not in its cited rows — ${pw}`);
    // ── CONTRADICTION AT PROMOTE (ruling 50) — decided before any write; fails closed ───────────────────────────────────
    const ct = await promoteContradictionRefusal(supabase, stagedRow!);
    if (ct) throw new PromoteRefused(stagedId, kind, `CONTRADICTION: a line claims a scope the record bounds — ${ct}`);

    const { data: prior } = await supabase.from("public_reads")
      .select("id").eq("company_id", companyId).eq("kind", kind).eq("is_current", true).maybeSingle();
    const priorId = (prior as { id?: string } | null)?.id ?? null;
    if (priorId) {
      const { error: e1 } = await supabase.from("public_reads").update({ is_current: false, superseded_by: stagedId }).eq("id", priorId);
      if (e1) throw new Error(`supersede-prior failed (${kind}): ${e1.message}`);
    }
    const { error: e2 } = await supabase.from("public_reads").update({ is_current: true }).eq("id", stagedId);
    if (e2) throw new Error(`promote-staged failed (${kind}): ${e2.message}`);
    promoted.push({ kind, staged: stagedId, superseded: priorId });
    // ruling 6: a promoted strategy re-routes its cascade gaps at promote time, the way the direct write does at write time
    if (kind === "strategy") {
      const items = cascadeItemsForPromotedStrategy(stagedRow!);
      cascadeRouting = await writeCascadeGaps(supabase, companyId, items, { provider: String(stagedRow?.model_provider ?? ""), model: String(stagedRow?.model_name ?? "") });
    }
  }
  return { promoted, cascade_routing: cascadeRouting };
}

// ── PROMOTE AUDIT (Part B, 2026-10-12) ───────────────────────────────────────────────────────────
//
// The promote branch returned before recordKindIntegrity was ever defined, so the one act that makes
// a staged read the company's live read left no integrity_runs row — the two Edgewood promotes of
// 2026-10-12 had to be backfilled by hand (rows 9428, 9429). recordKindIntegrity cannot simply be
// hoisted: it closes over `ledger`, which the promote path never builds. So promote gets its own
// writer with the same component name and the same `excluded_by_rule` shape, plus the ids and the
// reversal a promote needs to be undoable from its own row.
//
// WRITTEN AFTER THE FLIP, and never able to fail it: every error here is swallowed, exactly as the
// generation path's own audit writer does. An audit row that broke the act it describes would be a
// worse bug than a missing one.

/** The reversal a promoted kind carries. Names what re-flipping does NOT undo. */
export function promoteReversal(p: Promoted): { reversal_sql: string; reversal_note: string } {
  const notes = [
    "Re-flipping restores public_reads only.",
    "R6 (first_read_slots_supersede_on_read_change) fires on is_current true->false, so any slot superseded by this promote is NOT restored by the reverse flip — reset its superseded_at/superseded_reason explicitly.",
  ];
  if (p.kind === "strategy") {
    notes.push("A strategy promote also re-routed the cascade gaps (writeCascadeGaps): the reverse flip does not re-route them.");
  }
  return {
    reversal_sql: p.superseded
      ? `update public.public_reads set is_current=false where id='${p.staged}'; update public.public_reads set is_current=true, superseded_by=null where id='${p.superseded}';`
      : `update public.public_reads set is_current=false where id='${p.staged}';`,
    reversal_note: notes.join(" "),
  };
}

/** One integrity_runs row per kind the promote touched. Never throws. */
export async function recordPromoteIntegrity(
  supabase: AnySupabase,
  companyId: string,
  promoted: readonly Promoted[],
  cascadeRouting: CascadeRouting | null,
): Promise<void> {
  for (const p of promoted) {
    // A kind with no staged row was a no-op, not a promote: nothing was flipped, so nothing to audit.
    if (!p.staged) continue;
    const rev = promoteReversal(p);
    try {
      await insertIntegrityRun(supabase, {
        company_id: companyId,
        component: `first_read_public_read_${p.kind}`,
        surface_type: "public_reads",
        surface_id: companyId,
        status: "completed",
        examined: 1,
        admitted: 1,
        excluded_by_rule: {
          kind: p.kind, guard: null, detail: null, mode: "promote",
          staged_id: p.staged,
          superseded_id: p.superseded,
          cascade_run_id: p.kind === "strategy" ? (cascadeRouting?.run_id ?? null) : null,
          ...rev,
        },
      });
    } catch { /* observability must never break the act it describes */ }
  }
}

/** The refusal row a PromoteRefused leaves, so a refused promote is as visible as a completed one. */
export async function recordPromoteRefusal(
  supabase: AnySupabase,
  companyId: string,
  kind: string,
  readId: string,
  reason: string,
): Promise<void> {
  try {
    await insertIntegrityRun(supabase, {
      company_id: companyId,
      component: `first_read_public_read_${kind}`,
      surface_type: "public_reads",
      surface_id: companyId,
      status: "rejected",
      examined: 1,
      admitted: 0,
      excluded_by_rule: {
        kind, guard: "promote_refused", detail: reason, mode: "promote",
        read_id: readId,
        reversal_sql: null,
        reversal_note: "Nothing was flipped or routed — there is nothing to reverse.",
      },
      error: `guard=promote_refused detail=${reason}`,
    });
  } catch { /* observability must never break the refusal it describes */ }
}
