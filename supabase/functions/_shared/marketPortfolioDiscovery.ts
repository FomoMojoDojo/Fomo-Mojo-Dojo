// ── marketPortfolioDiscovery ──────────────────────────────────────────────────
//
// MPD-1b: multi-market DISCOVERY — the set of distinct markets (executor + the
// job they're getting done, Ulwick) a company plausibly serves, read from its
// SIGNALS (outside + organization bands; steps exist only for the customer
// journey, so unlike MH-5 the corpus here is signal text). Design signed
// 2026-07-15 (MARKET_PORTFOLIO_DISCOVERY_DESIGN.md).
//
// Laws in force:
// - customer is the SPINE member: never re-keyed, updated, or deleted here —
//   discovery folds it in by identity/judge dedup (keep/ADD only).
// - a2b / internal journey keys are test/ops artifacts: ignored entirely.
// - Each discovered market: buyer-framed + solution-agnostic + distinct
//   executor, provenance_type 'internal_hypothesis', source_path
//   'market_portfolio_discovery', emergent relationship_kind + basis.
// - CHOOSING IS PROMOTION: every discovered lens is portfolio_role 'support'.
// - Verdicts freeze by content identity in market_discovery_verdicts (never
//   re-rolled; judge_model provenance only). Identity via contentIdentity.ts —
//   the single hashing authority.
// - Privacy: internal content goes to the local Ollama ONLY (wrapper guards
//   the URL); gen = qwen2.5:14b-instruct, judges = llama3:70b.
//
// Run shape (canonical, sized for the 150s gateway):
//   plan:true   → ONE 14b gen call produces ≤MAX_CANDIDATES candidates; each is
//                 classified against banked verdicts + existing defs; returns
//                 the candidate manifest. ZERO writes, ZERO judge calls. (The
//                 gen call at plan time is a documented deviation from the
//                 zero-model-call plan convention: chunked judging needs the
//                 candidate TEXTS, and only the gen can produce them.)
//                 If discovery output already exists and !force → skipped
//                 ('already_discovered') — the rerun-idempotence law.
//   candidates  → scoped judge chunk (1-2 candidates: up to 3×70b judgments
//                 each): buyer-perspective → solution-agnostic → same-market
//                 dedup; every verdict banked inline; a candidate passing ALL
//                 gates writes its def + lens INLINE (CH-2a precedent).
//   neither     → FINALIZE: prune orphaned verdicts (own invariant, see the
//                 migration) + return the portfolio census.

import { normalizeForHash, sha256Hex } from "./contentIdentity.ts";
import { FROZEN_COMPANY_IDS } from "./stepConditionsSynthesis.ts";
import { judgeConditionPerspectives } from "./stepPerspectiveJudge.ts";

const DEFAULT_GEN_MODEL = "qwen2.5:14b-instruct";
const DEFAULT_JUDGE_MODEL = "llama3:70b";
const GEN_TIMEOUT_MS = 180_000;
const JUDGE_TIMEOUT_MS = 180_000;
export const MAX_CANDIDATES = 6;
const MAX_ACCEPTED = 5; // design cap 3–6 accepted incl. the folded-in customer

// ── identities ────────────────────────────────────────────────────────────────

export async function marketIdentity(executor: string, jtbd: string): Promise<string> {
  return await sha256Hex(normalizeForHash(`${executor}|${jtbd}`));
}

export async function solutionAgnosticKey(executor: string, jtbd: string): Promise<string> {
  return await sha256Hex(`mktsolagn|${normalizeForHash(`${executor}|${jtbd}`)}`);
}

export async function sameMarketKey(identityA: string, identityB: string): Promise<string> {
  const [x, y] = identityA <= identityB ? [identityA, identityB] : [identityB, identityA];
  return await sha256Hex(`mktsame|${x}|${y}`);
}

// ── ollama (sibling-module pattern; require_model: loud fail, no fallback) ────

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
    if (!resp.ok) throw new Error(`market-discovery model call failed: HTTP ${resp.status} (${model})`);
    const data = await resp.json().catch(() => ({}));
    const content = String((data as { message?: { content?: unknown } })?.message?.content ?? "");
    if (!content) throw new Error(`market-discovery model call returned empty content (${model})`);
    return content;
  } finally {
    clearTimeout(t);
  }
}

// ── prompts ───────────────────────────────────────────────────────────────────

// Inherits MH-5's GEN_SYSTEM hard rules verbatim (buyer's-own-job, never
// seller/acquisition framing, never name a company/brand/vendor, who+what
// sentence shape, no canned filler) — extended for multi-market + the emergent
// relationship texture.
const GEN_SYSTEM =
  "You identify the DISTINCT MARKETS a company plausibly serves, from evidence about it. " +
  "A market = WHO the job executor is + the JOB they are getting done — in the executor's OWN terms. " +
  "Hard rules: " +
  "(1) Describe the executor's own job, NEVER a seller or acquisition goal — never 'increase the percentage who choose/buy X', never the company's growth or sales. " +
  "(2) NEVER name a company, brand, or vendor — not even the company under analysis. " +
  "(3) job_executor = a SINGLE clause naming WHO the executor is AND the job they are getting done. Form exemplar (match the SHAPE, not the facts): 'Independent cafe operators sourcing a specialty coffee offering for their venue.' jtbd = ONE sentence with the deeper detail of the progress they are trying to make. chooser = who makes the choice. " +
  "(4) Each market must have a DISTINCT executor — do not restate the same market in different words. " +
  "(5) relationship_kind = the executor's relationship to the company as the evidence shows it (e.g. recipient, buyer, funder, referrer, partner) — in the evidence's own terms, one or two lowercase words. relationship_basis = one short clause citing the evidence for that relationship. " +
  "(6) Ground every market in the evidence given. No invented audiences. Fewer, well-grounded markets beat many speculative ones. " +
  'JSON only: {"markets":[{"job_executor":"...","jtbd":"...","chooser":"...","relationship_kind":"...","relationship_basis":"..."}]}.';

function buildGenUser(companyName: string, outsideLines: string[], orgLines: string[]): string {
  return (
    `COMPANY UNDER ANALYSIS: ${companyName}\n\n` +
    `PUBLIC EVIDENCE (outside voices):\n${outsideLines.map((l) => `- ${l}`).join("\n")}\n\n` +
    `ORGANIZATION EVIDENCE (the company's own materials):\n${orgLines.map((l) => `- ${l}`).join("\n")}\n\n` +
    `Identify up to ${MAX_CANDIDATES} distinct markets this company plausibly serves.`
  );
}

const SOLUTION_AGNOSTIC_SYSTEM =
  "You judge whether a market definition is SOLUTION-AGNOSTIC. " +
  "The job must be stated entirely in the executor's own world — a job that names, presupposes, or is only meaningful in terms of the company's product, service, or solution FAILS. " +
  "The job existed before this company and would exist without it. " +
  'JSON only: {"solution_free":true|false,"reason":"<one short clause>"}.';

function buildSolutionAgnosticUser(companyName: string, executor: string, jtbd: string): string {
  return `COMPANY: ${companyName}\nCANDIDATE MARKET — executor: ${executor}\njob: ${jtbd}\nIs this job free of ${companyName}'s product/solution?`;
}

// The single authority for the same-market criterion (MPD-1d — mirrors the
// SAME_FACT_CRITERION precedent). The negative examples target the observed
// 1c failure: a funder/donor executor was merged with the families executor on
// "both involve youth mental health services" — shared-theme reasoning across
// DIFFERENT executors.
export const SAME_MARKET_CRITERION =
  "Same market = substantially the same job executor getting substantially the same job done, merely reworded. " +
  "A different executor, or a genuinely different job, is a DIFFERENT market. " +
  "NEGATIVE EXAMPLES — none of these makes two markets the same: " +
  "a shared theme, service area, industry, or beneficiary population is NOT the same market; " +
  "DIFFERENT job executor means DIFFERENT market, always — never merge two candidates with different executors even when their jobs touch the same domain.";

const SAME_MARKET_SYSTEM =
  "You judge whether two market definitions are the SAME market. " +
  SAME_MARKET_CRITERION + " " +
  'JSON only: {"same_market":true|false,"reason":"<one short clause citing words from BOTH>"}.';

function buildSameMarketUser(a: { executor: string; jtbd: string }, b: { executor: string; jtbd: string }): string {
  return `MARKET A — executor: ${a.executor}\njob: ${a.jtbd}\nMARKET B — executor: ${b.executor}\njob: ${b.jtbd}\nAre A and B the same market?`;
}

function parseBool(raw: string, field: string, who: string): { value: boolean; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`market-discovery ${who} output unparseable (strict): ${raw.slice(0, 140)}`);
  }
  const p = parsed as Record<string, unknown>;
  if (typeof p[field] !== "boolean") {
    throw new Error(`market-discovery ${who} output missing ${field} (strict): ${raw.slice(0, 140)}`);
  }
  return { value: p[field] as boolean, reason: String(p.reason ?? "").trim() };
}

// ── types ─────────────────────────────────────────────────────────────────────

export type MarketCandidate = {
  job_executor: string;
  jtbd: string;
  chooser: string;
  relationship_kind: string;
  relationship_basis: string;
};

export type DiscoveryComputeArgs = {
  supabase: { from: (t: string) => any };
  companyId: string;
  ollamaUrl: string;
  nowIso: string;
  genModel?: string;
  judgeModel?: string;
  write: boolean;
  force?: boolean;
  candidates?: MarketCandidate[];
};

export type DiscoveryPlanResult =
  | {
    ok: true;
    plan: true;
    candidates: MarketCandidate[];
    candidates_total: number;
    existing_defs: number;
    corpus_outside: number;
    corpus_org: number;
  }
  | { ok: false; skipped: "frozen_company" | "already_discovered" | "no_signals"; existing_discovered?: number }
  | { ok: false; error: string };

export type DiscoveryRunResult =
  | {
    ok: true;
    scoped: boolean;
    totals: {
      requested: number;
      judged_buyer: number;
      judged_solution: number;
      judged_same_market: number;
      verdicts_cached: number;
      accepted: number;
      rejected_buyer: number;
      rejected_solution: number;
      deduped_same_market: number;
      defs_written: number;
      verdicts_pruned: number;
    };
    results: Array<{
      job_executor: string;
      jtbd: string;
      relationship_kind: string;
      relationship_basis: string;
      outcome: "accepted" | "rejected_buyer" | "rejected_solution" | "deduped" | "cap_reached";
      journey_key?: string;
      judge_reasons: Record<string, string>;
    }>;
  }
  | { ok: false; skipped: "frozen_company" }
  | { ok: false; error: string };

// ── data loading ──────────────────────────────────────────────────────────────

type ExistingDef = { id: string; journey_key: string; job_executor: string; jtbd: string; user_id: string; identity: string };

// The dedup universe: the spine (customer) + prior discovered (mkt-*) defs.
// a2b / internal keys are test/ops artifacts — never read as markets.
async function loadDedupUniverse(supabase: DiscoveryComputeArgs["supabase"], companyId: string): Promise<ExistingDef[]> {
  const { data, error } = await supabase
    .from("odi_market_definitions")
    .select("id, journey_key, job_executor, jtbd, user_id")
    .eq("company_id", companyId);
  if (error) throw new Error(`market defs load failed: ${error.message}`);
  const out: ExistingDef[] = [];
  for (const row of (data ?? []) as Array<{ id: string; journey_key: string; job_executor: string; jtbd: string; user_id: string }>) {
    const key = String(row.journey_key ?? "");
    if (key !== "customer" && !key.startsWith("mkt-")) continue;
    out.push({ ...row, identity: await marketIdentity(row.job_executor ?? "", row.jtbd ?? "") });
  }
  return out.sort((a, b) => a.journey_key.localeCompare(b.journey_key));
}

async function loadCompanyName(supabase: DiscoveryComputeArgs["supabase"], companyId: string): Promise<string> {
  const { data } = await supabase.from("companies").select("name").eq("id", companyId).maybeSingle();
  return String((data as { name?: string } | null)?.name ?? "this company");
}

function slugify(executor: string): string {
  const slug = executor.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
  return `mkt-${slug || "market"}`;
}

// ── compute ───────────────────────────────────────────────────────────────────

export async function computeMarketDiscovery(args: DiscoveryComputeArgs & { plan: true }): Promise<DiscoveryPlanResult>;
export async function computeMarketDiscovery(args: DiscoveryComputeArgs & { plan?: false | undefined }): Promise<DiscoveryRunResult>;
export async function computeMarketDiscovery(
  args: DiscoveryComputeArgs & { plan?: boolean },
): Promise<DiscoveryPlanResult | DiscoveryRunResult> {
  if (FROZEN_COMPANY_IDS.has(args.companyId)) return { ok: false, skipped: "frozen_company" };
  const genModel = args.genModel ?? DEFAULT_GEN_MODEL;
  const judgeModel = args.judgeModel ?? DEFAULT_JUDGE_MODEL;

  const universe = await loadDedupUniverse(args.supabase, args.companyId);
  const companyName = await loadCompanyName(args.supabase, args.companyId);

  // ── PLAN: one gen call → candidate manifest (zero writes, zero judges) ──
  if (args.plan) {
    const discovered = universe.filter((d) => d.journey_key.startsWith("mkt-"));
    if (discovered.length > 0 && !args.force) {
      return { ok: false, skipped: "already_discovered", existing_discovered: discovered.length };
    }

    const { data: sigRows, error: sigErr } = await args.supabase
      .from("signals")
      .select("signal_band, claim_text")
      .eq("company_id", args.companyId)
      .in("signal_band", ["outside", "organization"])
      .order("created_at", { ascending: true });
    if (sigErr) return { ok: false, error: `signals load failed: ${sigErr.message}` };
    const rows = (sigRows ?? []) as Array<{ signal_band: string; claim_text: string }>;
    const outside = rows.filter((r) => r.signal_band === "outside" && String(r.claim_text ?? "").trim()).map((r) => r.claim_text).slice(0, 40);
    const org = rows.filter((r) => r.signal_band === "organization" && String(r.claim_text ?? "").trim()).map((r) => r.claim_text).slice(0, 40);
    if (outside.length + org.length === 0) return { ok: false, skipped: "no_signals" };

    const raw = await callOllamaJson(args.ollamaUrl, genModel, GEN_SYSTEM, buildGenUser(companyName, outside, org), GEN_TIMEOUT_MS);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, error: `market-discovery generator unparseable (strict): ${raw.slice(0, 160)}` };
    }
    const list = (parsed as { markets?: unknown }).markets;
    if (!Array.isArray(list)) return { ok: false, error: "market-discovery generator returned no markets array (strict)" };
    const candidates: MarketCandidate[] = [];
    for (const m of list.slice(0, MAX_CANDIDATES)) {
      const c = m as Record<string, unknown>;
      const cand: MarketCandidate = {
        job_executor: String(c.job_executor ?? "").trim(),
        jtbd: String(c.jtbd ?? "").trim(),
        chooser: String(c.chooser ?? "").trim(),
        relationship_kind: String(c.relationship_kind ?? "").trim().toLowerCase(),
        relationship_basis: String(c.relationship_basis ?? "").trim(),
      };
      if (cand.job_executor && cand.jtbd) candidates.push(cand);
    }
    if (candidates.length === 0) return { ok: false, error: "market-discovery generator produced zero usable candidates (strict)" };
    return {
      ok: true,
      plan: true,
      candidates,
      candidates_total: candidates.length,
      existing_defs: universe.length,
      corpus_outside: outside.length,
      corpus_org: org.length,
    };
  }

  const totals = {
    requested: 0,
    judged_buyer: 0,
    judged_solution: 0,
    judged_same_market: 0,
    verdicts_cached: 0,
    accepted: 0,
    rejected_buyer: 0,
    rejected_solution: 0,
    deduped_same_market: 0,
    defs_written: 0,
    verdicts_pruned: 0,
  };
  const results: Array<{
    job_executor: string; jtbd: string; relationship_kind: string; relationship_basis: string;
    outcome: "accepted" | "rejected_buyer" | "rejected_solution" | "deduped" | "cap_reached";
    journey_key?: string; judge_reasons: Record<string, string>;
  }> = [];

  // Banked verdicts for this company.
  const { data: vRows, error: vErr } = await args.supabase
    .from("market_discovery_verdicts")
    .select("id, pair_identity, verdict_kind, market_a_identity, market_b_identity, verdict, judge_reason")
    .eq("company_id", args.companyId);
  if (vErr) return { ok: false, error: `verdicts load failed: ${vErr.message}` };
  type Verdict = { id: string; pair_identity: string; verdict_kind: string; market_a_identity: string; market_b_identity: string | null; verdict: string; judge_reason: string };
  const verdicts = (vRows ?? []) as Verdict[];
  const verdictByKey = new Map(verdicts.map((v) => [v.pair_identity, v]));

  const bankVerdict = async (row: Omit<Verdict, "id">) => {
    if (verdictByKey.has(row.pair_identity)) return;
    if (args.write) {
      const { error } = await args.supabase.from("market_discovery_verdicts").insert({ company_id: args.companyId, judge_model: judgeModel, ...row });
      if (error && !String(error.message ?? "").includes("duplicate")) {
        throw new Error(`verdict insert failed: ${error.message}`);
      }
    }
    verdictByKey.set(row.pair_identity, { id: "", ...row });
  };

  const scoped = Array.isArray(args.candidates) && args.candidates.length > 0;

  // ── SCOPED JUDGE CHUNK: gates + inline def writes ──
  if (scoped) {
    const liveUniverse = [...universe]; // grows as candidates are accepted
    for (const cand of args.candidates!) {
      totals.requested++;
      const identity = await marketIdentity(cand.job_executor, cand.jtbd);
      const reasons: Record<string, string> = {};

      const discoveredCount = liveUniverse.filter((d) => d.journey_key.startsWith("mkt-")).length;
      if (discoveredCount >= MAX_ACCEPTED) {
        results.push({ ...cand, outcome: "cap_reached", judge_reasons: reasons });
        continue;
      }

      // Gate (a): buyer perspective — reuse the b-ii executor judge (its own
      // verdict-by-content-identity store makes re-runs free).
      const pv = await judgeConditionPerspectives({
        supabase: args.supabase,
        companyId: args.companyId,
        stepLabel: `market-discovery:${slugify(cand.job_executor)}`,
        conditions: [cand.jtbd],
        executorBrief: cand.job_executor,
        ollamaUrl: args.ollamaUrl,
        judgeModel,
        persist: args.write,
      });
      totals.judged_buyer++;
      reasons.buyer = String(pv[0]?.verdict ?? "unknown");
      if (pv[0]?.verdict !== "buyer") {
        totals.rejected_buyer++;
        results.push({ ...cand, outcome: "rejected_buyer", judge_reasons: reasons });
        continue;
      }

      // Gate (b): solution-agnostic — HARD gate, banked.
      const saKey = await solutionAgnosticKey(cand.job_executor, cand.jtbd);
      const saBanked = verdictByKey.get(saKey);
      let solutionFree: boolean;
      if (saBanked) {
        totals.verdicts_cached++;
        solutionFree = saBanked.verdict === "accepted";
        reasons.solution_agnostic = `${saBanked.verdict} (frozen): ${saBanked.judge_reason}`;
      } else {
        const raw = await callOllamaJson(args.ollamaUrl, judgeModel, SOLUTION_AGNOSTIC_SYSTEM, buildSolutionAgnosticUser(companyName, cand.job_executor, cand.jtbd), JUDGE_TIMEOUT_MS);
        const v = parseBool(raw, "solution_free", "solution-agnostic judge");
        totals.judged_solution++;
        solutionFree = v.value;
        reasons.solution_agnostic = `${v.value ? "accepted" : "rejected"}: ${v.reason}`;
        await bankVerdict({
          pair_identity: saKey,
          verdict_kind: "solution_agnostic",
          market_a_identity: identity,
          market_b_identity: null,
          verdict: v.value ? "accepted" : "rejected",
          judge_reason: v.reason,
        });
      }
      if (!solutionFree) {
        totals.rejected_solution++;
        results.push({ ...cand, outcome: "rejected_solution", judge_reasons: reasons });
        continue;
      }

      // Gate (c): same-market dedup vs the live universe (customer + mkt-*).
      // Exact-identity fast path (signed design): a candidate whose identity
      // already IS a def folds in with zero judge calls.
      let duplicate = liveUniverse.some((d) => d.identity === identity);
      if (duplicate) reasons.same_market_exact = "identical content identity — folded into the existing def";
      for (const existing of duplicate ? [] : liveUniverse) {
        const key = await sameMarketKey(identity, existing.identity);
        const banked = verdictByKey.get(key);
        let same: boolean;
        let reason: string;
        if (banked) {
          totals.verdicts_cached++;
          same = banked.verdict === "accepted";
          reason = `${banked.verdict} (frozen): ${banked.judge_reason}`;
        } else {
          const raw = await callOllamaJson(args.ollamaUrl, judgeModel, SAME_MARKET_SYSTEM, buildSameMarketUser({ executor: cand.job_executor, jtbd: cand.jtbd }, { executor: existing.job_executor, jtbd: existing.jtbd }), JUDGE_TIMEOUT_MS);
          const v = parseBool(raw, "same_market", "same-market judge");
          totals.judged_same_market++;
          same = v.value;
          reason = `${v.value ? "accepted" : "rejected"}: ${v.reason}`;
          await bankVerdict({
            pair_identity: key,
            verdict_kind: "same_market",
            market_a_identity: identity < existing.identity ? identity : existing.identity,
            market_b_identity: identity < existing.identity ? existing.identity : identity,
            verdict: v.value ? "accepted" : "rejected",
            judge_reason: v.reason,
          });
        }
        reasons[`same_market_vs_${existing.journey_key}`] = reason;
        if (same) {
          duplicate = true;
          break;
        }
      }
      if (duplicate) {
        totals.deduped_same_market++;
        results.push({ ...cand, outcome: "deduped", judge_reasons: reasons });
        continue;
      }

      // All gates passed → inline write (def + lens). NONE chosen.
      let journeyKey = slugify(cand.job_executor);
      if (liveUniverse.some((d) => d.journey_key === journeyKey)) journeyKey = `${journeyKey}-2`;
      // Ownership inherits from the spine (customer) def — discovered rows
      // belong to the same operator, never a synthetic zero UUID.
      const ownerUserId = liveUniverse.find((d) => d.journey_key === "customer")?.user_id
        ?? liveUniverse.find((d) => d.user_id)?.user_id;
      if (!ownerUserId) return { ok: false, error: "no owning user_id resolvable (no customer def?) — refusing to write" };
      if (args.write) {
        const { error: defErr } = await args.supabase.from("odi_market_definitions").insert({
          company_id: args.companyId,
          user_id: ownerUserId,
          journey_key: journeyKey,
          job_executor: cand.job_executor,
          jtbd: cand.jtbd,
          chooser: cand.chooser,
          relationship_kind: cand.relationship_kind || null,
          relationship_basis: cand.relationship_basis || null,
          provenance_type: "internal_hypothesis",
          source_path: "market_portfolio_discovery",
          frameworks_used: ["JTBD", "ODI", "local_ollama", "market_portfolio_discovery"],
          updated_at: args.nowIso,
        });
        if (defErr) return { ok: false, error: `market def insert failed: ${defErr.message}` };
        const { error: lensErr } = await args.supabase.from("market_lens").insert({
          company_id: args.companyId,
          journey_key: journeyKey,
          title: cand.job_executor,
          portfolio_state: "active",
          portfolio_role: "support", // choosing is promotion — never chosen here
        });
        if (lensErr) return { ok: false, error: `market lens insert failed: ${lensErr.message}` };
        totals.defs_written++;
      }
      liveUniverse.push({ id: "", journey_key: journeyKey, job_executor: cand.job_executor, jtbd: cand.jtbd, user_id: ownerUserId, identity });
      totals.accepted++;
      results.push({ ...cand, outcome: "accepted", journey_key: journeyKey, judge_reasons: reasons });
    }
    return { ok: true, scoped: true, totals, results };
  }

  // ── FINALIZE: prune orphaned verdicts (own invariant) ──
  const defIdentities = new Set(universe.map((d) => d.identity));
  for (const v of verdicts) {
    const aLive = defIdentities.has(v.market_a_identity);
    const bLive = v.market_b_identity === null || defIdentities.has(v.market_b_identity);
    // same_market: orphaned unless BOTH sides are current defs.
    // solution_agnostic: orphaned unless the candidate became a def.
    const live = v.verdict_kind === "same_market" ? (aLive && bLive) : aLive;
    if (!live) {
      if (args.write) {
        const { error } = await args.supabase.from("market_discovery_verdicts").delete().eq("id", v.id);
        if (error) return { ok: false, error: `verdict prune failed: ${error.message}` };
      }
      totals.verdicts_pruned++;
    }
  }
  return { ok: true, scoped: false, totals, results };
}
