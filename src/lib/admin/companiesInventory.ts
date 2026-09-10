// ADMIN COMPANIES INVENTORY (Gate 1, 2026-09-10) — one truthful row per company.
//
// READ-ONLY BY CONSTRUCTION. This module runs SELECTs and nothing else. /preview/client-refine/* is
// the only operator surface; this page reports, it does not act.
//
// TWO FINDINGS FROM THE INVENTORY SHAPE THIS FILE:
//
// 1. `companies.mojo_score` is a CACHE and it is wrong. The outside-score writer inserts a
//    `mojo_scores` row and never updates the column, so 13 of 20 companies carry a stale cache —
//    Brand AI reads 0 there against a stored 20. This module never reads that column. The score is
//    the newest `mojo_scores` row, and "current methodology" means the methodology of that newest
//    row (comparing across methodologies would compare different scales).
//
// 2. FILL STATUS IS COMPUTED FROM ARTIFACTS, NEVER FROM LEDGER TERMINALS. Twelve of twenty companies
//    have four current reads and a score while their `fr_own_words` / `recurrence_step` ledger rows
//    read false, because they predate the chain. A ledger-first status would report most of a
//    healthy fleet as broken. Ledger terminals are still surfaced — as a secondary line in the
//    expander, where they explain history — but they never decide the cell.
import { supabase } from "@/integrations/supabase/client";
import { gapPairsStaleness } from "../../../supabase/functions/_shared/gapPairsFreshness";
import { scoreDelta, type ScoreDelta } from "@/lib/mojoScore/delta";
import { costCoverage, type CostCoverage } from "../../../supabase/functions/_shared/modelCallSites";

/** The four kinds the First Read renders. Mirrors PUBLIC_READ_KINDS in _shared/firstReadFill.ts. */
export const INVENTORY_READ_KINDS = ["positioning", "strategy", "promise", "offering"] as const;
export type InventoryReadKind = (typeof INVENTORY_READ_KINDS)[number];

/** Operator-facing fill-status wording. The complete set — nothing else is ever rendered. */
export const FILL_STATUS_STRINGS = {
  complete: "complete",
  noBaseline: "no baseline",
  ownWordsPending: "own-words pending",
  deltasStale: "deltas stale",
  /** `${n} of 4 reads`, with ` · ${kind} rejected` appended per rejected kind. */
  readsOf: (n: number) => `${n} of 4 reads`,
  rejectedSuffix: (kinds: string[]) => kinds.map((k) => ` · ${k} rejected`).join(""),
} as const;

export type ReadState = { kind: InventoryReadKind; current: boolean; rejected: boolean; guard: string | null };

export type FillStages = {
  baselineRuns: number;
  ownWordsClaims: number;
  deltas: number;
  deltasStale: boolean;
  deltasReason: string;
  reads: ReadState[];
  readsCurrent: number;
  recurrenceRows: number;
  scoreRows: number;
  /** SECONDARY ONLY — shown in the expander, never used to compute the cell. */
  ledger: { ownWordsTerminal: string | null; recurrenceTerminal: string | null };
};

export type CompanyInventoryRow = {
  id: string;
  name: string;
  website: string | null;
  frozen: boolean;
  score: { value: number; methodology: string; computedAt: string } | null;
  /** Gate 2. Null when the current methodology has a single row — renders "—", never 0. */
  delta: ScoreDelta | null;
  /** Newest integrity_runs.ran_at (operator ruling). Null → "never". */
  lastUpdate: string | null;
  /** Sum of usd for the newest run_id. Null when nothing was captured — NEVER 0. */
  lastRunCost: number | null;
  /** Sum of usd across every captured call. Null when nothing was captured. */
  totalCost: number | null;
  fillStatus: string;
  stages: FillStages;
};

type Row = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);
/** Newest-wins reducer keyed by company. */
function newestBy<T extends Row>(rows: T[], key: string, at: string): Map<string, T> {
  const out = new Map<string, T>();
  for (const r of rows) {
    const id = str(r[key]);
    if (!id) continue;
    const prev = out.get(id);
    if (!prev || str(r[at]) > str(prev[at])) out.set(id, r);
  }
  return out;
}
function countBy<T extends Row>(rows: T[], key: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    const id = str(r[key]);
    if (id) out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

/**
 * The fill-status CELL. Artifacts first, in dependency order, so the first thing actually missing is
 * what the operator is told. Recurrence and the score row are reported in the expander but do not
 * gate this wording — there is no signed string for them, and inventing one would be a new claim.
 */
export function fillStatusLabel(s: FillStages): string {
  if (s.baselineRuns === 0) return FILL_STATUS_STRINGS.noBaseline;
  if (s.ownWordsClaims === 0) return FILL_STATUS_STRINGS.ownWordsPending;
  if (s.deltasStale) return FILL_STATUS_STRINGS.deltasStale;
  if (s.readsCurrent < INVENTORY_READ_KINDS.length) {
    const rejected = s.reads.filter((r) => !r.current && r.rejected).map((r) => r.kind);
    return FILL_STATUS_STRINGS.readsOf(s.readsCurrent) + FILL_STATUS_STRINGS.rejectedSuffix(rejected);
  }
  return FILL_STATUS_STRINGS.complete;
}

/** Assemble the inventory from already-fetched rows. Pure, so the tests plant rows directly. */
export function buildInventory(input: {
  companies: Array<{ id: string; name: string; website?: string | null; frozen?: boolean | null }>;
  mojoScores: Array<{ company_id: string; total_score: number; methodology_version: string; computed_at: string }>;
  integrity: Array<{ company_id: string; component: string; status: string; ran_at: string; error?: string | null }>;
  ownWords: Array<{ company_id: string; created_at: string }>;
  deltas: Array<{ company_id: string; computed_at: string }>;
  reads: Array<{ company_id: string; kind: string; is_current: boolean }>;
  recurrence: Array<{ company_id: string }>;
  baselines: Array<{ company_id: string }>;
  ledger: Array<{ company_id: string; run_kind: string; status: string; started_at: string }>;
  modelCalls?: Array<{ company_id: string; run_id: string | null; usd: number | string | null; created_at: string }>;
}): CompanyInventoryRow[] {
  // COST — summed from model_calls. `lastRunCost` is the newest run_id's total; a call with a null
  // run_id (a site that has no long_runner row) still counts toward the company total but cannot be
  // attributed to a run, so it is excluded from "last run". Null means NOT CAPTURED, never zero
  // spend: no cost existed before this gate and the coverage label says how partial the ledger is.
  const calls = input.modelCalls ?? [];
  const costByCompany = new Map<string, { total: number; lastRun: number | null; any: boolean }>();
  for (const co of input.companies) {
    const mine = calls.filter((m) => m.company_id === co.id);
    if (mine.length === 0) { costByCompany.set(co.id, { total: 0, lastRun: null, any: false }); continue; }
    const total = mine.reduce((a, m) => a + (Number(m.usd) || 0), 0);
    const runScoped = mine.filter((m) => m.run_id);
    let lastRun: number | null = null;
    if (runScoped.length > 0) {
      const newest = runScoped.reduce((a, b) => (a.created_at > b.created_at ? a : b));
      lastRun = runScoped.filter((m) => m.run_id === newest.run_id).reduce((a, m) => a + (Number(m.usd) || 0), 0);
    }
    costByCompany.set(co.id, { total, lastRun, any: true });
  }

  const newestScore = newestBy(input.mojoScores as unknown as Row[], "company_id", "computed_at");
  const newestIntegrity = newestBy(input.integrity as unknown as Row[], "company_id", "ran_at");
  const newestOwnWords = newestBy(input.ownWords as unknown as Row[], "company_id", "created_at");
  const newestDelta = newestBy(input.deltas as unknown as Row[], "company_id", "computed_at");
  const ownWordsCount = countBy(input.ownWords as unknown as Row[], "company_id");
  const deltaCount = countBy(input.deltas as unknown as Row[], "company_id");
  const recurrenceCount = countBy(input.recurrence as unknown as Row[], "company_id");
  const baselineCount = countBy(input.baselines as unknown as Row[], "company_id");
  const scoreCount = countBy(input.mojoScores as unknown as Row[], "company_id");

  const newestLedger = new Map<string, Map<string, Row>>();
  for (const r of input.ledger as unknown as Row[]) {
    const cid = str(r.company_id); const kind = str(r.run_kind);
    if (!cid || !kind) continue;
    const byKind = newestLedger.get(cid) ?? new Map<string, Row>();
    const prev = byKind.get(kind);
    if (!prev || str(r.started_at) > str(prev.started_at)) byKind.set(kind, r);
    newestLedger.set(cid, byKind);
  }

  return input.companies.map((c) => {
    const currentKinds = new Set(
      input.reads.filter((r) => r.company_id === c.id && r.is_current).map((r) => r.kind),
    );
    const reads: ReadState[] = INVENTORY_READ_KINDS.map((kind) => {
      // A judge/guard reject is a DIFFERENT state from "never generated". The per-kind integrity row
      // (Gate B) is what tells them apart, and it carries the guard name.
      const rej = input.integrity
        .filter((i) => i.company_id === c.id && i.component === `first_read_public_read_${kind}`)
        .sort((a, b) => (a.ran_at < b.ran_at ? 1 : -1))[0];
      const rejected = !currentKinds.has(kind) && !!rej && rej.status === "rejected";
      const guard = rejected ? (/guard=([a-z_]+)/.exec(str(rej.error))?.[1] ?? null) : null;
      return { kind, current: currentKinds.has(kind), rejected, guard };
    });

    const freshness = gapPairsStaleness({
      newestOwnWordsAt: str(newestOwnWords.get(c.id)?.created_at) || null,
      newestDeltaAt: str(newestDelta.get(c.id)?.computed_at) || null,
    });
    const byKind = newestLedger.get(c.id);
    const stages: FillStages = {
      baselineRuns: baselineCount.get(c.id) ?? 0,
      ownWordsClaims: ownWordsCount.get(c.id) ?? 0,
      deltas: deltaCount.get(c.id) ?? 0,
      deltasStale: freshness.stale,
      deltasReason: freshness.reason,
      reads,
      readsCurrent: reads.filter((r) => r.current).length,
      recurrenceRows: recurrenceCount.get(c.id) ?? 0,
      scoreRows: scoreCount.get(c.id) ?? 0,
      ledger: {
        ownWordsTerminal: str(byKind?.get("fr_own_words")?.status) || null,
        recurrenceTerminal: str(byKind?.get("recurrence_step")?.status) || null,
      },
    };

    const sc = newestScore.get(c.id);
    return {
      id: c.id,
      name: c.name,
      website: c.website ?? null,
      frozen: c.frozen === true,
      score: sc ? { value: num(sc.total_score), methodology: str(sc.methodology_version), computedAt: str(sc.computed_at) } : null,
      // Gate 2 — computed from the SAME rows the score cell already uses. No second query.
      delta: scoreDelta(input.mojoScores.filter((m) => m.company_id === c.id)),
      lastUpdate: str(newestIntegrity.get(c.id)?.ran_at) || null,
      lastRunCost: costByCompany.get(c.id)?.lastRun ?? null,
      totalCost: costByCompany.get(c.id)?.any ? (costByCompany.get(c.id)!.total) : null,
      fillStatus: fillStatusLabel(stages),
      stages,
    };
  });
}

/** Fetch everything the inventory needs. Eight SELECTs, all small (~3.8k narrow rows fleet-wide). */
export async function fetchCompaniesInventory(): Promise<CompanyInventoryRow[]> {
  // deno-lint-ignore no-explicit-any
  const sb = supabase as any;
  const [companies, mojoScores, integrity, ownWords, deltas, reads, recurrence, baselines, ledger, modelCalls] = await Promise.all([
    sb.from("companies").select("id, name, website, frozen").order("name"),
    sb.from("mojo_scores").select("company_id, total_score, methodology_version, computed_at"),
    sb.from("integrity_runs").select("company_id, component, status, ran_at, error"),
    sb.from("claims").select("company_id, created_at").eq("claim_type", "own_words").eq("status", "active"),
    sb.from("claim_deltas").select("company_id, computed_at").eq("pairing_kind", "public_vs_public"),
    sb.from("public_reads").select("company_id, kind, is_current").eq("is_current", true),
    sb.from("finding_recurrence").select("company_id"),
    sb.from("public_baseline_runs").select("company_id"),
    sb.from("long_runner_runs").select("company_id, run_kind, status, started_at").in("run_kind", ["fr_own_words", "recurrence_step"]),
    sb.from("model_calls").select("company_id, run_id, usd, created_at"),
  ]);
  return buildInventory({
    companies: companies.data ?? [],
    mojoScores: mojoScores.data ?? [],
    integrity: integrity.data ?? [],
    ownWords: ownWords.data ?? [],
    deltas: deltas.data ?? [],
    reads: reads.data ?? [],
    recurrence: recurrence.data ?? [],
    baselines: baselines.data ?? [],
    ledger: ledger.data ?? [],
    modelCalls: modelCalls.data ?? [],
  });
}

/** Coverage is COMPUTED from the site registry — "partial" is a fact, not a maintained label. */
export function inventoryCostCoverage(): CostCoverage {
  return costCoverage();
}
