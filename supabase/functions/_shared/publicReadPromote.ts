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
import { deriveCascadeSpineAndGaps, type CascadeCoherence, type CascadeGapItem, type StrategyPayload } from "./cascadeRouting.ts";

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
export async function promoteStagedReads(
  supabase: AnySupabase,
  companyId: string,
  kinds: readonly string[],
): Promise<{ promoted: Promoted[]; cascade_routing: CascadeRouting | null }> {
  const promoted: Promoted[] = [];
  let cascadeRouting: CascadeRouting | null = null;
  for (const kind of kinds) {
    const { data: staged } = await supabase.from("public_reads")
      .select("id, payload, judge_verdict, model_provider, model_name").eq("company_id", companyId).eq("kind", kind).eq("is_current", false).is("superseded_by", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const stagedRow = staged as { id?: string; payload?: Record<string, unknown> | null; judge_verdict?: Record<string, unknown> | null; model_provider?: string | null; model_name?: string | null } | null;
    const stagedId = stagedRow?.id ?? null;
    if (!stagedId) { promoted.push({ kind, staged: "", superseded: null }); continue; }
    // FAIL CLOSED — decided BEFORE any write: a strategy row without cascade_source refuses the promote of this kind.
    if (kind === "strategy" && !hasCascadeSource(stagedRow!)) {
      throw new PromoteRefused(stagedId, kind, "staged row has no cascade_source — cannot re-derive the cascade gaps; stage it again");
    }
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
