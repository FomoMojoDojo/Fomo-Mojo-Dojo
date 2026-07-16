// ── declaredMarketIngest ──────────────────────────────────────────────────────
//
// MPD-1f-1b: client-DECLARED markets land as odi_market_definitions rows at
// their honest provenance (design signed 2026-07-15). Declared ≠ generated:
//
// - Sources: declared_direction artifacts ONLY — positioning_canvases
//   .best_fit_customers and strategy_cascades.where_to_play with
//   artifact_role='declared_direction'. NOT claims (operator-ruled
//   market-adjacent, not declarations). NOT the discovery generator.
// - NO reality judges: no buyer-perspective, no solution-agnostic, no
//   reframe, no rail. The client authored it; a declared market is NEVER
//   rejected for lack of evidence (provenance ⊥ proof — the un-evidenced
//   declared market is the Act-A conversation).
// - Verbatim-or-nothing: declared_verbatim holds the client's exact words and
//   is the authoritative statement. job_executor/jtbd hold a FORMAT-ONLY 14b
//   restatement so the row participates in identity/dedup machinery — the
//   shaping may never assert anything the verbatim doesn't (CV-1
//   formatStatement discipline applied to structure). If shaping fails, the
//   verbatim carries the fields — never invent.
// - Cross-provenance reconcile = PAIRING, never rejection: exact-identity
//   fast path, then the UNCHANGED same-market judge (MPD-1c/1d) vs all
//   existing non-test defs; an accepted pairing is banked in
//   market_discovery_verdicts and IS the twin link (both rows kept — freeze
//   law). The declared row is written regardless of pairing outcome.
// - Keys: dmk-<slug> namespace; lens active/support (choosing is promotion).
// - Idempotence: a source whose declared_source_ref already has a def is
//   skipped (re-run = zero model calls, zero writes).

import { normalizeForHash, sha256Hex } from "./contentIdentity.ts";
import { FROZEN_COMPANY_IDS } from "./stepConditionsSynthesis.ts";
import {
  buildSameMarketUser,
  marketIdentity,
  SAME_MARKET_SYSTEM,
  sameMarketKey,
} from "./marketPortfolioDiscovery.ts";

const DEFAULT_GEN_MODEL = "qwen2.5:14b-instruct";
const DEFAULT_JUDGE_MODEL = "llama3:70b";
const GEN_TIMEOUT_MS = 180_000;
const JUDGE_TIMEOUT_MS = 180_000;

// Test/ops journey keys — never part of any market universe.
const NON_MARKET_KEYS = new Set(["a2b", "internal"]);

async function callOllamaJson(
  ollamaUrl: string,
  model: string,
  system: string,
  user: string,
  timeoutMs: number,
): Promise<string> {
  const nativeBase = ollamaUrl.replace(/\/v1\/?$/, "");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(`${nativeBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer ollama" },
      body: JSON.stringify({
        model,
        format: "json",
        stream: false,
        options: { num_ctx: 8192, temperature: 0.2 },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`declared-ingest model call failed: HTTP ${resp.status} (${model})`);
    const data = await resp.json().catch(() => ({}));
    const content = String((data as { message?: { content?: unknown } })?.message?.content ?? "");
    if (!content) throw new Error(`declared-ingest model call returned empty content (${model})`);
    return content;
  } finally {
    clearTimeout(t);
  }
}

// FORMAT-ONLY shaping: restructure the client's words into executor+job form.
// Hard non-strengthening rules; the verbatim stays authoritative regardless.
const SHAPE_SYSTEM =
  "You RESTRUCTURE a client's own market statement into two fields, WITHOUT changing its meaning. " +
  "job_executor = a single clause naming WHO the client says they serve and what those people are doing (drawn ONLY from the statement's own words). " +
  "jtbd = one sentence restating the progress those people seek, in the statement's own vocabulary. " +
  "chooser = who chooses, if the statement says; else empty. " +
  "HARD RULES: use only words, facts, and qualifiers present in the statement; NEVER add, strengthen, broaden, or narrow a claim; NEVER add locations, segments, sizes, or motivations the statement doesn't contain; when unsure, quote the statement's own phrasing. " +
  'JSON only: {"job_executor":"...","jtbd":"...","chooser":"..."}.';

function buildShapeUser(verbatim: string): string {
  return `CLIENT'S OWN MARKET STATEMENT (authoritative, do not alter meaning):\n${verbatim}\n\nRestructure into executor + job.`;
}

function slugify(text: string): string {
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
  return `dmk-${slug || "declared-market"}`;
}

// ── types ─────────────────────────────────────────────────────────────────────

type DeclaredSource = { ref: string; verbatim: string; user_id: string };

export type DeclaredIngestArgs = {
  supabase: { from: (t: string) => any };
  companyId: string;
  ollamaUrl: string;
  nowIso: string;
  genModel?: string;
  judgeModel?: string;
  write: boolean;
};

export type DeclaredIngestPlan =
  | {
    ok: true;
    plan: true;
    sources_total: number;
    sources_already_ingested: number;
    sources_fresh: number;
    sources: Array<{ ref: string; verbatim: string; status: "already_ingested" | "fresh" }>;
  }
  | { ok: false; skipped: "frozen_company" | "no_declared_sources" }
  | { ok: false; error: string };

export type DeclaredIngestResult =
  | {
    ok: true;
    totals: {
      sources: number;
      already_ingested: number;
      defs_written: number;
      pairings_accepted: number;
      pairings_rejected: number;
      pairing_judge_calls: number;
      pairings_cached: number;
      shape_calls: number;
      shape_fallbacks: number;
    };
    results: Array<{
      ref: string;
      verbatim: string;
      journey_key?: string;
      shaped: { job_executor: string; jtbd: string; chooser: string } | null;
      pairings: Array<{ vs_journey_key: string; verdict: string; reason: string }>;
      status: "ingested" | "already_ingested";
    }>;
  }
  | { ok: false; skipped: "frozen_company" | "no_declared_sources" }
  | { ok: false; error: string };

// ── data loading ──────────────────────────────────────────────────────────────

async function loadDeclaredSources(supabase: DeclaredIngestArgs["supabase"], companyId: string): Promise<DeclaredSource[]> {
  const out: DeclaredSource[] = [];
  const { data: canvases, error: cErr } = await supabase
    .from("positioning_canvases")
    .select("id, user_id, best_fit_customers")
    .eq("company_id", companyId)
    .eq("artifact_role", "declared_direction");
  if (cErr) throw new Error(`positioning_canvases load failed: ${cErr.message}`);
  for (const row of (canvases ?? []) as Array<{ id: string; user_id: string; best_fit_customers: string }>) {
    const v = String(row.best_fit_customers ?? "").trim();
    if (v) out.push({ ref: `positioning_canvases:${row.id}`, verbatim: v, user_id: row.user_id });
  }
  const { data: cascades, error: sErr } = await supabase
    .from("strategy_cascades")
    .select("id, user_id, where_to_play")
    .eq("company_id", companyId)
    .eq("artifact_role", "declared_direction");
  if (sErr) throw new Error(`strategy_cascades load failed: ${sErr.message}`);
  for (const row of (cascades ?? []) as Array<{ id: string; user_id: string; where_to_play: string }>) {
    const v = String(row.where_to_play ?? "").trim();
    if (v) out.push({ ref: `strategy_cascades:${row.id}`, verbatim: v, user_id: row.user_id });
  }
  return out.sort((a, b) => a.ref.localeCompare(b.ref));
}

type ExistingDef = { id: string; journey_key: string; job_executor: string; jtbd: string; declared_source_ref: string | null; identity: string };

// Reconcile universe: ALL real market defs, any provenance, excluding
// test/ops keys — the ingest pairs against generated AND declared rows.
async function loadReconcileUniverse(supabase: DeclaredIngestArgs["supabase"], companyId: string): Promise<ExistingDef[]> {
  const { data, error } = await supabase
    .from("odi_market_definitions")
    .select("id, journey_key, job_executor, jtbd, declared_source_ref")
    .eq("company_id", companyId);
  if (error) throw new Error(`market defs load failed: ${error.message}`);
  const out: ExistingDef[] = [];
  for (const row of (data ?? []) as Array<{ id: string; journey_key: string; job_executor: string; jtbd: string; declared_source_ref: string | null }>) {
    if (NON_MARKET_KEYS.has(String(row.journey_key ?? ""))) continue;
    out.push({ ...row, identity: await marketIdentity(row.job_executor ?? "", row.jtbd ?? "") });
  }
  return out.sort((a, b) => a.journey_key.localeCompare(b.journey_key));
}

// ── compute ───────────────────────────────────────────────────────────────────

export async function computeDeclaredIngest(args: DeclaredIngestArgs & { plan: true }): Promise<DeclaredIngestPlan>;
export async function computeDeclaredIngest(args: DeclaredIngestArgs & { plan?: false | undefined }): Promise<DeclaredIngestResult>;
export async function computeDeclaredIngest(
  args: DeclaredIngestArgs & { plan?: boolean },
): Promise<DeclaredIngestPlan | DeclaredIngestResult> {
  if (FROZEN_COMPANY_IDS.has(args.companyId)) return { ok: false, skipped: "frozen_company" };
  const genModel = args.genModel ?? DEFAULT_GEN_MODEL;
  const judgeModel = args.judgeModel ?? DEFAULT_JUDGE_MODEL;

  const sources = await loadDeclaredSources(args.supabase, args.companyId);
  if (sources.length === 0) return { ok: false, skipped: "no_declared_sources" };
  const universe = await loadReconcileUniverse(args.supabase, args.companyId);
  const ingestedRefs = new Set(universe.map((d) => d.declared_source_ref).filter(Boolean));

  if (args.plan) {
    const annotated = sources.map((s) => ({
      ref: s.ref,
      verbatim: s.verbatim,
      status: ingestedRefs.has(s.ref) ? "already_ingested" as const : "fresh" as const,
    }));
    const fresh = annotated.filter((s) => s.status === "fresh").length;
    return {
      ok: true,
      plan: true,
      sources_total: sources.length,
      sources_already_ingested: sources.length - fresh,
      sources_fresh: fresh,
      sources: annotated,
    };
  }

  const totals = {
    sources: sources.length,
    already_ingested: 0,
    defs_written: 0,
    pairings_accepted: 0,
    pairings_rejected: 0,
    pairing_judge_calls: 0,
    pairings_cached: 0,
    shape_calls: 0,
    shape_fallbacks: 0,
  };
  const results: Array<{
    ref: string; verbatim: string; journey_key?: string;
    shaped: { job_executor: string; jtbd: string; chooser: string } | null;
    pairings: Array<{ vs_journey_key: string; verdict: string; reason: string }>;
    status: "ingested" | "already_ingested";
  }> = [];

  // Banked verdicts (pairing cache).
  const { data: vRows, error: vErr } = await args.supabase
    .from("market_discovery_verdicts")
    .select("pair_identity, verdict, judge_reason")
    .eq("company_id", args.companyId)
    .eq("verdict_kind", "same_market");
  if (vErr) return { ok: false, error: `verdicts load failed: ${vErr.message}` };
  const verdictByKey = new Map(
    ((vRows ?? []) as Array<{ pair_identity: string; verdict: string; judge_reason: string }>).map((v) => [v.pair_identity, v]),
  );

  const liveUniverse = [...universe];
  for (const source of sources) {
    if (ingestedRefs.has(source.ref)) {
      totals.already_ingested++;
      results.push({ ref: source.ref, verbatim: source.verbatim, shaped: null, pairings: [], status: "already_ingested" });
      continue;
    }

    // FORMAT-ONLY shaping (never strengthens; verbatim stays authoritative).
    let shaped: { job_executor: string; jtbd: string; chooser: string } | null = null;
    try {
      const raw = await callOllamaJson(args.ollamaUrl, genModel, SHAPE_SYSTEM, buildShapeUser(source.verbatim), GEN_TIMEOUT_MS);
      totals.shape_calls++;
      const p = JSON.parse(raw) as { job_executor?: unknown; jtbd?: unknown; chooser?: unknown };
      const je = String(p.job_executor ?? "").trim();
      const jt = String(p.jtbd ?? "").trim();
      if (je && jt) shaped = { job_executor: je, jtbd: jt, chooser: String(p.chooser ?? "").trim() };
    } catch { /* fall through to verbatim-carries fallback */ }
    if (!shaped) {
      // Never invent: the verbatim carries the fields.
      totals.shape_fallbacks++;
      shaped = { job_executor: source.verbatim, jtbd: source.verbatim, chooser: "" };
    }

    // Cross-provenance reconcile: PAIRING, never rejection. The declared row
    // is written regardless of the outcome.
    const identity = await marketIdentity(shaped.job_executor, shaped.jtbd);
    const pairings: Array<{ vs_journey_key: string; verdict: string; reason: string }> = [];
    for (const existing of liveUniverse) {
      if (existing.identity === identity) {
        pairings.push({ vs_journey_key: existing.journey_key, verdict: "accepted", reason: "identical content identity (exact fast path)" });
        totals.pairings_accepted++;
        continue;
      }
      const key = await sameMarketKey(identity, existing.identity);
      const banked = verdictByKey.get(key);
      if (banked) {
        totals.pairings_cached++;
        pairings.push({ vs_journey_key: existing.journey_key, verdict: `${banked.verdict} (frozen)`, reason: banked.judge_reason });
        if (banked.verdict === "accepted") totals.pairings_accepted++;
        else totals.pairings_rejected++;
        continue;
      }
      const raw = await callOllamaJson(args.ollamaUrl, judgeModel, SAME_MARKET_SYSTEM, buildSameMarketUser({ executor: shaped.job_executor, jtbd: shaped.jtbd }, { executor: existing.job_executor, jtbd: existing.jtbd }), JUDGE_TIMEOUT_MS);
      let same: boolean;
      let reason: string;
      try {
        const v = JSON.parse(raw) as { same_market?: unknown; reason?: unknown };
        if (typeof v.same_market !== "boolean") throw new Error("missing same_market");
        same = v.same_market;
        reason = String(v.reason ?? "").trim();
      } catch {
        return { ok: false, error: `declared-ingest same-market judge unparseable (strict): ${raw.slice(0, 140)}` };
      }
      totals.pairing_judge_calls++;
      if (same) totals.pairings_accepted++;
      else totals.pairings_rejected++;
      pairings.push({ vs_journey_key: existing.journey_key, verdict: same ? "accepted" : "rejected", reason });
      if (args.write) {
        const { error } = await args.supabase.from("market_discovery_verdicts").insert({
          company_id: args.companyId,
          pair_identity: key,
          verdict_kind: "same_market",
          market_a_identity: identity < existing.identity ? identity : existing.identity,
          market_b_identity: identity < existing.identity ? existing.identity : identity,
          verdict: same ? "accepted" : "rejected",
          judge_model: judgeModel,
          judge_reason: reason,
        });
        if (error && !String(error.message ?? "").includes("duplicate")) {
          return { ok: false, error: `pairing verdict insert failed: ${error.message}` };
        }
        verdictByKey.set(key, { pair_identity: key, verdict: same ? "accepted" : "rejected", judge_reason: reason });
      }
    }

    // Write the declared def + lens (ALWAYS — pairing never rejects declared).
    let journeyKey = slugify(shaped.job_executor);
    if (liveUniverse.some((d) => d.journey_key === journeyKey)) journeyKey = `${journeyKey}-2`;
    if (args.write) {
      const { error: defErr } = await args.supabase.from("odi_market_definitions").insert({
        company_id: args.companyId,
        user_id: source.user_id,
        journey_key: journeyKey,
        job_executor: shaped.job_executor,
        jtbd: shaped.jtbd,
        chooser: shaped.chooser,
        declared_verbatim: source.verbatim,
        declared_source_ref: source.ref,
        provenance_type: "internal_declared",
        // OOD-1 register law: register is a birth-stamped fact of the evidence
        // corpus — declared ingest is internal by construction. The column is
        // NOT NULL with no default; the immutability trigger blocks updates.
        market_register: "internal_declared",
        source_path: `declared_market_ingest:${source.ref.split(":")[0]}`,
        frameworks_used: ["JTBD", "declared_market_ingest"],
        updated_at: args.nowIso,
      });
      if (defErr) return { ok: false, error: `declared def insert failed: ${defErr.message}` };
      const { error: lensErr } = await args.supabase.from("market_lens").insert({
        company_id: args.companyId,
        journey_key: journeyKey,
        title: shaped.job_executor,
        portfolio_state: "active",
        portfolio_role: "support", // choosing is promotion — never chosen here
      });
      if (lensErr) return { ok: false, error: `declared lens insert failed: ${lensErr.message}` };
      totals.defs_written++;
    }
    liveUniverse.push({ id: "", journey_key: journeyKey, job_executor: shaped.job_executor, jtbd: shaped.jtbd, declared_source_ref: source.ref, identity });
    results.push({ ref: source.ref, verbatim: source.verbatim, journey_key: journeyKey, shaped, pairings, status: "ingested" });
  }

  return { ok: true, totals, results };
}
