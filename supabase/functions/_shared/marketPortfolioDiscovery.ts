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
//   neither     → FINALIZE: return the portfolio census. NO PRUNE (Gate 3b — see below).

import { normalizeForHash, sha256Hex } from "./contentIdentity.ts";
import { FROZEN_COMPANY_IDS } from "./stepConditionsSynthesis.ts";
import { judgeConditionPerspectives } from "./stepPerspectiveJudge.ts";
// Gate 2 — the vocabulary the generator is SHOWN. Examples only: relationship_kind is free text by
// law (20260715120000) and this prompt must never read as a closed list. Sharing the array with the
// renderer is what stops the model reaching for a word the surface then has to mislabel — Riverlane's
// VCs became `funder` because `investor` existed nowhere the model could see it.
import { KNOWN_RELATIONSHIP_KINDS } from "./relationshipKinds.ts";
// Gate 3b — the DECIDED predicate (written def, or a banked gate-(b)/(c) verdict). The worker asks it
// before spending model calls on a candidate a judge has already ruled on.
import { marketCandidateDecided, type ExistsProbe } from "./marketCandidateAccounted.ts";

const DEFAULT_GEN_MODEL = "qwen2.5:14b-instruct";
const DEFAULT_JUDGE_MODEL = "llama3:70b";
const GEN_TIMEOUT_MS = 180_000;
const JUDGE_TIMEOUT_MS = 180_000;
export const MAX_CANDIDATES = 6;
// MPD-1g: capacity is NOT curation. Every candidate is judged (full chain)
// regardless of capacity; a candidate that passes every judge but exceeds the
// active-set capacity is written with lens portfolio_state='deferred' —
// recorded, never silently dropped. MAX_ACTIVE bounds only the ACTIVE
// client-facing set (Act A breadth sanity); 6 = above the organic per-round
// yield (≤6 candidates) so deferral is the exception. OOD-2: the cap is
// PER-REGISTER — public actives (pmk-*) bound the public set; internal
// actives are not counted against it. Quality judges unchanged and binding.
export const MAX_ACTIVE = 6;

// ── OOD-2: outside-only corpus (register purity by construction) ─────────────
// REGISTER LAW: register is a property of the evidence CORPUS. This discovery
// mode reads ONLY provably-public outside-band signals, so every def it
// writes is market_register='public_inferred' BY CONSTRUCTION (stamped at
// birth; OOD-1 trigger makes it immutable). Existing internal_* defs are
// frozen — this mode ADDS public rows, never mutates or re-keys.
//
// The public predicate (signed design Q2): outside band, not syndicated
// (public content that matches the client's own uploads carries origin
// ambiguity), and source_type outside the upload/internal family. Negative
// lists fail OPEN, so a TRIPWIRE closes them: a corpus signal whose
// source_type is neither recognized-public nor known-excluded ABORTS the run
// loudly — a new unclassified source must stop discovery, not slip onto a
// client-facing public surface. (Reality check that motivated it: 20 historic
// outside-band rows carry source_type='uploaded_file' — the band alone is not
// a guarantee.)
export const PUBLIC_OUTSIDE_SOURCE_TYPES = new Set(["public_baseline_run", "competitor_discovery_run"]);
export const EXCLUDED_INTERNAL_SOURCE_TYPES = new Set(["file", "uploaded_file", "file_proposal", "manual_note", "mojo_analysis"]);
const PUBLIC_CORPUS_CAP = 80;
// Public-register defs live in their own key namespace — register visible in
// the key, and a public twin of an internal market is always a NEW row.
const PUBLIC_KEY_PREFIX = "pmk-";

// ── identities ────────────────────────────────────────────────────────────────

/** The integrity_runs component the per-candidate ERROR TERMINAL is written under (Gate 1b). The
 *  row is keyed run_ref = marketIdentity(executor, jtbd); _shared/marketCandidateAccounted.ts reads
 *  it as clause (4). Declared here, beside the writer, and imported by the reader — one direction. */
export const CANDIDATE_ERROR_COMPONENT = "market_discovery_candidate";

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
  "(5) relationship_kind = the executor's relationship to the company as the evidence shows it — in the evidence's own terms, one or two lowercase words. " +
  `Kinds we already know, as EXAMPLES and not a closed list: ${KNOWN_RELATIONSHIP_KINDS.join(", ")}. A kind outside them is fine when the evidence calls for it. ` +
  "Do not confuse the two money words: investor = an equity or venture backer who bought a stake; funder = a grant, philanthropic or public-money funder who did not. " +
  "relationship_basis = one short clause citing the evidence for that relationship. " +
  "(6) Ground every market in the evidence given. No invented audiences. Fewer, well-grounded markets beat many speculative ones. " +
  'JSON only: {"markets":[{"job_executor":"...","jtbd":"...","chooser":"...","relationship_kind":"...","relationship_basis":"..."}]}.';

// OOD-2: the gen sees PUBLIC evidence only — register purity by construction.
function buildGenUser(companyName: string, outsideLines: string[]): string {
  return (
    `COMPANY UNDER ANALYSIS: ${companyName}\n\n` +
    `PUBLIC EVIDENCE (outside voices — the only evidence you have):\n${outsideLines.map((l) => `- ${l}`).join("\n")}\n\n` +
    `Identify up to ${MAX_CANDIDATES} distinct markets this company plausibly serves, grounded ONLY in this public evidence.`
  );
}

// Exported for MO-1 (_shared/marketOptionSynthesis.ts), which EXTENDS this
// judge as its third criterion rather than duplicating the criterion text.
// Export only — the prompt and its user builder are unchanged.
export const SOLUTION_AGNOSTIC_SYSTEM =
  "You judge whether a market definition is SOLUTION-AGNOSTIC. " +
  "The job must be stated entirely in the executor's own world — a job that names, presupposes, or is only meaningful in terms of the company's product, service, or solution FAILS. " +
  "The job existed before this company and would exist without it. " +
  'JSON only: {"solution_free":true|false,"reason":"<one short clause>"}.';

export function buildSolutionAgnosticUser(companyName: string, executor: string, jtbd: string): string {
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

// Exported (MPD-1f-1b): the declared-market ingest reuses the SAME judge for
// cross-provenance reconciliation (pairing, never rejection).
export const SAME_MARKET_SYSTEM =
  "You judge whether two market definitions are the SAME market. " +
  SAME_MARKET_CRITERION + " " +
  'JSON only: {"same_market":true|false,"reason":"<one short clause citing words from BOTH>"}.';

export function buildSameMarketUser(a: { executor: string; jtbd: string }, b: { executor: string; jtbd: string }): string {
  return `MARKET A — executor: ${a.executor}\njob: ${a.jtbd}\nMARKET B — executor: ${b.executor}\njob: ${b.jtbd}\nAre A and B the same market?`;
}

// ── MPD-1e reframe round ──────────────────────────────────────────────────────
// Rescues GENERATED candidates rejected for WORDING (seller-framed or
// solution-bound jobs) — the executor is real; the generator stated their job
// in the company's terms. ONE reframe attempt, executor FIXED, job restated in
// the executor's own world; the reframed candidate re-enters the FULL
// unchanged judge chain (new content identity ⇒ fresh verdicts, frozen as
// always). ANTI-FABRICATION RAIL: a reframe that still fails perspective or
// solution-agnostic is DROPPED — no second attempt, no relaxation; never
// invent a job the evidence doesn't support. Dedup drops are NEVER reframed.
// SCOPE: generator-authored candidates only — declared markets never enter
// this pipeline (they appear solely as dedup targets, kept untouched).

const REFRAME_SYSTEM =
  "You restate a job-to-be-done in the JOB EXECUTOR'S OWN terms. The executor is FIXED — do not change who they are. " +
  "If the problem is 'seller-framed': the job was stated as some provider's acquisition or growth goal — restate it as the progress the EXECUTOR is trying to make in their own world. " +
  "If the problem is 'solution-bound': the job named or presupposed a specific provider's services — restate the underlying job free of ANY provider's product, service, or solution language. " +
  "Hard rules: never name a company, brand, vendor, or specific service offering; the job existed before any provider and must read that way; " +
  "do not invent facts beyond the substance already present in the original job. " +
  'JSON only: {"jtbd":"<one sentence, the executor\'s own job>"}.';

function buildReframeUser(executor: string, originalJtbd: string, problem: "seller-framed" | "solution-bound"): string {
  return `EXECUTOR (fixed): ${executor}\nORIGINAL JOB (rejected as ${problem}): ${originalJtbd}\nRestate this executor's own job.`;
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
  /** Gate 4b — the manifest row these candidates belong to, and the chunk's global offset. Absent on a
   *  manual/dry call: the judging is identical, only the outcome filing is skipped. */
  runId?: string;
  candidateOffset?: number;
};

export type DiscoveryPlanResult =
  | {
    ok: true;
    plan: true;
    candidates: MarketCandidate[];
    candidates_total: number;
    existing_defs: number;
    corpus_outside: number;
    corpus_by_source_type: Record<string, number>;
    corpus_excluded_upload_family: number;
    corpus_excluded_syndicated: number;
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
      accepted_deferred: number;
      rejected_buyer: number;
      rejected_solution: number;
      deduped_same_market: number;
      defs_written: number;
      verdicts_pruned: number;
      // MPD-1e reframe round
      reframe_attempts: number;
      reframe_rescued: number;
      reframe_rail_dropped: number;
      // Gate 1b — candidates whose judge chain THREW and got an honest per-candidate terminal.
      errored: number;
      // Gate 3b — candidates skipped because a judge had already ruled on them.
      decided: number;
    };
    results: Array<{
      job_executor: string;
      jtbd: string;
      relationship_kind: string;
      relationship_basis: string;
      outcome: "accepted" | "accepted_deferred" | "rejected_buyer" | "rejected_solution" | "deduped" | "error" | "already_decided";
      journey_key?: string;
      judge_reasons: Record<string, string>;
      reframed?: boolean;
      original_jtbd?: string;
      dedup_target_identity?: string;
    }>;
  }
  | { ok: false; skipped: "frozen_company" }
  | { ok: false; error: string };

// ── data loading ──────────────────────────────────────────────────────────────

type ExistingDef = { id: string; journey_key: string; job_executor: string; jtbd: string; user_id: string; market_register: string; identity: string };

// The dedup universe: the spine (customer) + prior discovered (mkt-*/pmk-*)
// + declared (dmk-*) defs, register carried for cross-register dedup rules.
// a2b / internal keys are test/ops artifacts — never read as markets.
async function loadDedupUniverse(supabase: DiscoveryComputeArgs["supabase"], companyId: string): Promise<ExistingDef[]> {
  const { data, error } = await supabase
    .from("odi_market_definitions")
    .select("id, journey_key, job_executor, jtbd, user_id, market_register")
    .eq("company_id", companyId);
  if (error) throw new Error(`market defs load failed: ${error.message}`);
  const out: ExistingDef[] = [];
  for (const row of (data ?? []) as Array<{ id: string; journey_key: string; job_executor: string; jtbd: string; user_id: string; market_register: string }>) {
    const key = String(row.journey_key ?? "");
    if (key !== "customer" && !key.startsWith("mkt-") && !key.startsWith("pmk-") && !key.startsWith("dmk-")) continue;
    out.push({ ...row, identity: await marketIdentity(row.job_executor ?? "", row.jtbd ?? "") });
  }
  return out.sort((a, b) => a.journey_key.localeCompare(b.journey_key));
}

// Public register = the two Act-A-legal values (stored fact, OOD-1).
const isPublicRegister = (r: string) => r === "public_inferred" || r === "publicly_declared";

async function loadCompanyName(supabase: DiscoveryComputeArgs["supabase"], companyId: string): Promise<string> {
  const { data } = await supabase.from("companies").select("name").eq("id", companyId).maybeSingle();
  return String((data as { name?: string } | null)?.name ?? "this company");
}

function slugify(executor: string): string {
  const slug = executor.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
  // OOD-2: discovery writes public-register defs in their own namespace.
  return `${PUBLIC_KEY_PREFIX}${slug || "market"}`;
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
    // OOD-2 skip-law keys on PUBLIC discovery output (pmk-*) — existing
    // internal mkt-* defs must never block the first outside-only run.
    const discovered = universe.filter((d) => d.journey_key.startsWith(PUBLIC_KEY_PREFIX));
    if (discovered.length > 0 && !args.force) {
      return { ok: false, skipped: "already_discovered", existing_discovered: discovered.length };
    }

    // OOD-2 corpus: outside band ONLY, through the public predicate + tripwire.
    const { data: sigRows, error: sigErr } = await args.supabase
      .from("signals")
      .select("signal_band, claim_text, source_type, syndicated_from_client")
      .eq("company_id", args.companyId)
      .eq("signal_band", "outside")
      .order("created_at", { ascending: true });
    if (sigErr) return { ok: false, error: `signals load failed: ${sigErr.message}` };
    const rows = (sigRows ?? []) as Array<{ signal_band: string; claim_text: string; source_type: string; syndicated_from_client: boolean | null }>;
    const outside: string[] = [];
    const corpusBySourceType: Record<string, number> = {};
    let excludedUpload = 0;
    let excludedSyndicated = 0;
    for (const r of rows) {
      if (!String(r.claim_text ?? "").trim()) continue;
      const st = String(r.source_type ?? "");
      if (EXCLUDED_INTERNAL_SOURCE_TYPES.has(st)) {
        excludedUpload++;
        continue;
      }
      if (!PUBLIC_OUTSIDE_SOURCE_TYPES.has(st)) {
        // TRIPWIRE — fail LOUD, never fail open: an unclassified source_type
        // must stop the run, not slip into a public-register corpus.
        throw new Error(
          `outside-only corpus tripwire: unrecognized outside-band source_type '${st}' — ` +
            `classify it as public (PUBLIC_OUTSIDE_SOURCE_TYPES) or internal (EXCLUDED_INTERNAL_SOURCE_TYPES) before discovery may run`,
        );
      }
      if (r.syndicated_from_client === true) {
        excludedSyndicated++;
        continue;
      }
      if (outside.length >= PUBLIC_CORPUS_CAP) continue;
      outside.push(r.claim_text);
      corpusBySourceType[st] = (corpusBySourceType[st] ?? 0) + 1;
    }
    if (outside.length === 0) return { ok: false, skipped: "no_signals" };

    const raw = await callOllamaJson(args.ollamaUrl, genModel, GEN_SYSTEM, buildGenUser(companyName, outside), GEN_TIMEOUT_MS);
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
      corpus_by_source_type: corpusBySourceType,
      corpus_excluded_upload_family: excludedUpload,
      corpus_excluded_syndicated: excludedSyndicated,
    };
  }

  const totals = {
    requested: 0,
    judged_buyer: 0,
    judged_solution: 0,
    judged_same_market: 0,
    verdicts_cached: 0,
    accepted: 0,
    accepted_deferred: 0,
    rejected_buyer: 0,
    rejected_solution: 0,
    deduped_same_market: 0,
    defs_written: 0,
    verdicts_pruned: 0,
    reframe_attempts: 0,
    reframe_rescued: 0,
    reframe_rail_dropped: 0,
    errored: 0,
    decided: 0,
  };
  const results: Array<{
    job_executor: string; jtbd: string; relationship_kind: string; relationship_basis: string;
    outcome: "accepted" | "accepted_deferred" | "rejected_buyer" | "rejected_solution" | "deduped" | "error" | "already_decided";
    journey_key?: string; judge_reasons: Record<string, string>;
    reframed?: boolean; original_jtbd?: string;
    /** Gate 4b — for a fold, the identity of the def it folded into. */
    dedup_target_identity?: string;
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

  // ── SCOPED JUDGE CHUNK: gates + reframe round + inline def writes ──
  if (scoped) {
    const liveUniverse = [...universe]; // grows as candidates are accepted

    // The FULL, UNCHANGED gate chain (buyer → solution-agnostic → dedup) for
    // one attempt. Extracted (MPD-1e) so a reframed candidate re-enters it
    // verbatim — judges are never relaxed for a reframe.
    type GateOutcome = "accepted" | "rejected_buyer" | "rejected_solution" | "deduped";
    // Gate 4b — set by gate (c) when a candidate FOLDS, so the outcome row can name the def it folded
    // into. Reset per candidate by the loop below; read only when the outcome is "deduped".
    let foldTarget: string | null = null;
    const runGates = async (
      cand: MarketCandidate,
      reasons: Record<string, string>,
      tag: string,
    ): Promise<GateOutcome> => {
      const identity = await marketIdentity(cand.job_executor, cand.jtbd);

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
      reasons[`buyer${tag}`] = String(pv[0]?.verdict ?? "unknown");
      if (pv[0]?.verdict !== "buyer") return "rejected_buyer";

      // Gate (b): solution-agnostic — HARD gate, banked.
      const saKey = await solutionAgnosticKey(cand.job_executor, cand.jtbd);
      const saBanked = verdictByKey.get(saKey);
      let solutionFree: boolean;
      if (saBanked) {
        totals.verdicts_cached++;
        solutionFree = saBanked.verdict === "accepted";
        reasons[`solution_agnostic${tag}`] = `${saBanked.verdict} (frozen): ${saBanked.judge_reason}`;
      } else {
        const raw = await callOllamaJson(args.ollamaUrl, judgeModel, SOLUTION_AGNOSTIC_SYSTEM, buildSolutionAgnosticUser(companyName, cand.job_executor, cand.jtbd), JUDGE_TIMEOUT_MS);
        const v = parseBool(raw, "solution_free", "solution-agnostic judge");
        totals.judged_solution++;
        solutionFree = v.value;
        reasons[`solution_agnostic${tag}`] = `${v.value ? "accepted" : "rejected"}: ${v.reason}`;
        await bankVerdict({
          pair_identity: saKey,
          verdict_kind: "solution_agnostic",
          market_a_identity: identity,
          market_b_identity: null,
          verdict: v.value ? "accepted" : "rejected",
          judge_reason: v.reason,
        });
      }
      if (!solutionFree) return "rejected_solution";

      // Gate (c): same-market dedup vs the live universe (customer + mkt-* +
      // pmk-* + dmk-*). OOD-2 cross-register rule: dedup-DROP only WITHIN the
      // same register. A public candidate that same-markets an INTERNAL def is
      // PAIRED (verdict banked, both kept) and written anyway — silently
      // dropping it would erase the only public-register copy and Act A loses
      // the market. Candidates from this mode are public_inferred.
      // Exact-identity fast path: identical to a PUBLIC def → fold (drop);
      // identical to an INTERNAL def → pairing note, keep going.
      let duplicate = false;
      for (const d of liveUniverse) {
        if (d.identity !== identity) continue;
        if (isPublicRegister(d.market_register)) {
          duplicate = true;
          foldTarget = d.identity;
          reasons[`same_market_exact${tag}`] = "identical content identity — folded into the existing public def";
          break;
        }
        reasons[`cross_register_exact_vs_${d.journey_key}${tag}`] = "identical content identity — cross-register twin (internal def kept, public row written)";
      }
      for (const existing of duplicate ? [] : liveUniverse) {
        if (existing.identity === identity) continue; // exact cases handled above
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
        const crossRegister = !isPublicRegister(existing.market_register);
        reasons[`same_market_vs_${existing.journey_key}${tag}`] = crossRegister && same
          ? `${reason} (cross-register pairing — internal def kept, public row written)`
          : reason;
        if (same && !crossRegister) {
          duplicate = true;
          foldTarget = existing.identity;
          break;
        }
      }
      return duplicate ? "deduped" : "accepted";
    };

    // MPD-1g: capacity check happens AFTER the full judge chain, never before —
    // no candidate is dropped unjudged. OOD-2: capacity is PER-REGISTER — this
    // mode writes public defs (pmk-*), so only PUBLIC actives count against
    // MAX_ACTIVE; internal actives (mkt-*) bound their own surface.
    const { data: lensRows, error: lensLoadErr } = await args.supabase
      .from("market_lens")
      .select("journey_key, portfolio_state")
      .eq("company_id", args.companyId)
      .like("journey_key", `${PUBLIC_KEY_PREFIX}%`);
    if (lensLoadErr) return { ok: false, error: `market_lens load failed: ${lensLoadErr.message}` };
    let activeDiscovered = ((lensRows ?? []) as Array<{ portfolio_state: string }>)
      .filter((l) => l.portfolio_state === "active").length;

    // The DECIDED probe, in the same equality shape the confirm-poll uses (one authority, one rule).
    const decidedProbe: ExistsProbe = async (table, match) => {
      let q = args.supabase.from(table).select("id");
      for (const [col, val] of Object.entries(match)) q = q.eq(col, val);
      const { data } = await q.limit(1).maybeSingle();
      return !!data;
    };

    for (const original of args.candidates!) {
      totals.requested++;
      const reasons: Record<string, string> = {};
      foldTarget = null;

      // ── ALREADY DECIDED (Gate 3b) — do not re-judge what a judge has already ruled on. ─────────
      // A replay re-fires a manifest from cursor 0, so candidates that already produced a def or a
      // banked gate-(b)/(c) verdict come back round. Re-judging them is neither free nor safe: gate
      // (a) replays its banked verdict, but the MPD-1e reframe then makes a FRESH 14b call at
      // temperature 0.2, and only an EXACT content-identity match folds the restatement back into
      // the existing def. Any other wording that the same-market judge calls "different" is WRITTEN,
      // landing a duplicate audience under the `-2` journey key (line ~692). Skipping here is the
      // guard; the `-2` suffix is only a collision handler and was never one.
      //
      // An ERROR terminal is deliberately NOT a decision — that candidate has no ruling and must be
      // retried. marketCandidateAccounted (the confirm-poll's question) counts it; this does not.
      if (await marketCandidateDecided({ exists: decidedProbe, companyId: args.companyId, candidate: original })) {
        totals.decided++;
        results.push({
          ...original,
          outcome: "already_decided",
          judge_reasons: { decided: "written def or banked gate-(b)/(c) verdict — not re-judged" },
        });
        continue;
      }

      try {
        let cand = original;
        let reframed = false;
        let outcome = await runGates(cand, reasons, "");

        // MPD-1e reframe round: rescue GENERATED candidates rejected for WORDING
        // — (a) seller-framed or (b) solution-bound ONLY; dedup drops are never
        // reframed. Exactly ONE attempt; executor FIXED; job restated in the
        // executor's own terms; relationship kind/basis carry over untouched
        // (model-discovered at generation, never seeded here).
        if (outcome === "rejected_buyer" || outcome === "rejected_solution") {
          const problem = outcome === "rejected_buyer" ? "seller-framed" : "solution-bound";
          totals.reframe_attempts++;
          const raw = await callOllamaJson(args.ollamaUrl, genModel, REFRAME_SYSTEM, buildReframeUser(original.job_executor, original.jtbd, problem), GEN_TIMEOUT_MS);
          let newJtbd = "";
          try {
            newJtbd = String((JSON.parse(raw) as { jtbd?: unknown })?.jtbd ?? "").trim();
          } catch { /* unparseable reframe = failed attempt, rail below */ }
          if (newJtbd && normalizeForHash(newJtbd) !== normalizeForHash(original.jtbd)) {
            reframed = true;
            reasons.reframe = `(${problem}) job restated in the executor's own terms`;
            cand = { ...original, jtbd: newJtbd };
            outcome = await runGates(cand, reasons, "_reframed");
            // ANTI-FABRICATION RAIL (hard): still failing perspective or
            // solution-agnostic ⇒ the executor is genuinely solution-defined —
            // DROP. No second reframe, no relaxation.
            if (outcome === "rejected_buyer" || outcome === "rejected_solution") {
              totals.reframe_rail_dropped++;
            } else if (outcome === "accepted") {
              totals.reframe_rescued++;
            }
          } else {
            reasons.reframe = `(${problem}) reframe produced no usable restatement — dropped (rail)`;
            totals.reframe_rail_dropped++;
          }
        }

        if (outcome === "rejected_buyer") {
          totals.rejected_buyer++;
          results.push({ ...cand, outcome, judge_reasons: reasons, ...(reframed ? { reframed, original_jtbd: original.jtbd } : {}) });
          continue;
        }
        if (outcome === "rejected_solution") {
          totals.rejected_solution++;
          results.push({ ...cand, outcome, judge_reasons: reasons, ...(reframed ? { reframed, original_jtbd: original.jtbd } : {}) });
          continue;
        }
        if (outcome === "deduped") {
          totals.deduped_same_market++;
          results.push({
            ...cand, outcome, judge_reasons: reasons,
            ...(foldTarget ? { dedup_target_identity: foldTarget } : {}),
            ...(reframed ? { reframed, original_jtbd: original.jtbd } : {}),
          });
          continue;
        }

        // All gates passed → inline write (def + lens). NONE chosen. MPD-1g:
        // capacity decides ACTIVE vs DEFERRED membership only — the market is
        // recorded either way (executor, job, kind, basis, verdicts all kept);
        // a deferred market waits for the choose gate, it is never lost.
        const overCapacity = activeDiscovered >= MAX_ACTIVE;
        const lensState = overCapacity ? "deferred" : "active";
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
            // OOD-2: register stamped at birth — public BY CONSTRUCTION (the
            // corpus predicate + tripwire guarantee it); OOD-1 trigger makes it
            // immutable.
            market_register: "public_inferred",
            source_path: "market_portfolio_discovery:outside_only",
            frameworks_used: ["JTBD", "ODI", "local_ollama", "market_portfolio_discovery", "outside_only"],
            updated_at: args.nowIso,
          });
          if (defErr) return { ok: false, error: `market def insert failed: ${defErr.message}` };
          const { error: lensErr } = await args.supabase.from("market_lens").insert({
            company_id: args.companyId,
            journey_key: journeyKey,
            title: cand.job_executor,
            portfolio_state: lensState,
            portfolio_role: "support", // choosing is promotion — never chosen here
          });
          if (lensErr) return { ok: false, error: `market lens insert failed: ${lensErr.message}` };
          totals.defs_written++;
        }
        liveUniverse.push({
          id: "", journey_key: journeyKey, job_executor: cand.job_executor, jtbd: cand.jtbd,
          user_id: ownerUserId, market_register: "public_inferred",
          identity: await marketIdentity(cand.job_executor, cand.jtbd),
        });
        if (overCapacity) {
          totals.accepted_deferred++;
          reasons.capacity = `active set full (${MAX_ACTIVE}) — recorded deferred; the choose gate promotes`;
        } else {
          activeDiscovered++;
          totals.accepted++;
        }
        results.push({
          ...cand,
          outcome: overCapacity ? "accepted_deferred" : "accepted",
          journey_key: journeyKey,
          judge_reasons: reasons,
          ...(reframed ? { reframed, original_jtbd: original.jtbd } : {}),
        });
      } catch (err) {
        // ANTI-SILENT-LOSS (Gate 1b). Before this, ONE candidate's throw — a 180s judge timeout, an
        // isolate cut mid-call — killed the whole chunk request and every candidate behind it. The
        // confirm-poll then found the candidate's gate-(a) verdict, called it accounted, and advanced
        // the cursor past work that had never finished: 16 of 42 fleet candidates lost that way, in
        // runs that closed status='completed' done_count=target. A status written before the work it
        // describes is not a status, and failure must be able to set it — so the terminal is RECORDED,
        // BEFORE the continue, keyed by the same content identity the rest of the chain uses, where
        // marketCandidateAccounted clause (4) can see it. No new table, no new column: integrity_runs
        // is already the fleet's honest-terminal store.
        //
        // The record is BEST-EFFORT by design. If the ledger write itself fails, the candidate stays
        // unaccounted and the chunk re-judges it next fire — the safe direction. The only unsafe
        // direction is claiming a terminal that did not happen.
        const message = err instanceof Error ? err.message : String(err);
        const errorText = message.slice(0, 500);
        totals.errored++;
        reasons.error = errorText;
        if (args.write) {
          try {
            await args.supabase.from("integrity_runs").insert({
              company_id: args.companyId,
              component: CANDIDATE_ERROR_COMPONENT,
              status: "failed",
              run_ref: await marketIdentity(original.job_executor, original.jtbd),
              error: errorText,
            });
          } catch { /* best-effort: an unrecorded failure simply stays unaccounted */ }
        }
        results.push({ ...original, outcome: "error", judge_reasons: reasons });
        continue;
      }
    }
    // ── PERSIST THE PER-CANDIDATE OUTCOMES (Gate 4b) ────────────────────────────────────────────
    // Before the caller advances its cursor. The worker has always known what happened to every
    // candidate — outcome, judge_reasons, the reframed jtbd, the dedup target — and returned it in
    // the HTTP response, where it was thrown away. That is why the surface cannot say why a group is
    // absent, why the census could tie only 9 of 20 rulings to an executor, and why a rail-dropped
    // candidate is re-judged forever. Filing it here makes the ruling durable and makes clause (3)
    // of marketCandidateDecided possible.
    //
    // The write is NOT best-effort, unlike the Gate 1b error terminal. It returns ok:false on
    // failure, which the stepper reads as a not-ok chunk, so the CURSOR DOES NOT ADVANCE and the
    // chunk re-judges next fire. A cursor that moves past an unrecorded ruling is the exact defect
    // Gate 1b closed; this is the same law applied to a different record.
    if (args.write && args.runId) {
      const offset = args.candidateOffset ?? 0;
      const rows = [];
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const originalJtbd = r.original_jtbd ?? r.jtbd;   // reframed rows carry the original alongside
        const reframed = r.reframed === true;
        rows.push({
          company_id: args.companyId,
          run_id: args.runId,
          candidate_index: offset + i + 1,
          job_executor: r.job_executor,
          relationship_kind: r.relationship_kind || null,
          original_jtbd: originalJtbd,
          original_identity: await marketIdentity(r.job_executor, originalJtbd),
          reframed_jtbd: reframed ? r.jtbd : null,
          reframed_identity: reframed ? await marketIdentity(r.job_executor, r.jtbd) : null,
          outcome: r.outcome === "accepted" ? "accepted_active" : r.outcome,
          judge_reasons: r.judge_reasons,
          dedup_target_identity: r.dedup_target_identity ?? null,
          journey_key: r.journey_key ?? null,
          // Written by the run that made the ruling. Stated explicitly so an upsert over a
          // reconstructed row CLEARS the flag — a column left out of the payload is left out of the
          // ON CONFLICT SET list, which is how Geniant's rows stayed reconstructed=true after being
          // rewritten first-hand.
          reconstructed: false,
        });
      }
      // A CANDIDATE THAT WAS RULED ON STAYS RULED ON (Gate 4d, operator ruling).
      //
      // `already_decided` is not a ruling — it is a statement that a ruling exists somewhere. The
      // first live replay proved what happens when it is allowed to upsert over one: Geniant #2's
      // `rejected_solution` and #4's `deduped` were both replaced by `already_decided`, the census
      // dropped from 7 rows to 6, and the record of WHY those groups are absent — the whole reason
      // this table exists — was destroyed by the very skip that was meant to protect them.
      //
      // So a skipped candidate never overwrites a terminal row. It still writes when the existing row
      // is 'error' (no ruling) or itself 'already_decided' (nothing to lose), and when no row exists
      // at all, so a first pass still records that the candidate was seen and skipped.
      const keep = new Set<number>();
      for (const row of rows) {
        if (row.outcome !== "already_decided") continue;
        const { data: existing } = await args.supabase
          .from("market_candidate_outcomes")
          .select("outcome")
          .eq("run_id", row.run_id).eq("candidate_index", row.candidate_index)
          .limit(1).maybeSingle();
        const prior = String((existing as { outcome?: string } | null)?.outcome ?? "");
        if (prior && prior !== "error" && prior !== "already_decided") keep.add(row.candidate_index);
      }
      const toWrite = rows.filter((r) => !keep.has(r.candidate_index));
      if (toWrite.length > 0) {
        const { error: outErr } = await args.supabase
          .from("market_candidate_outcomes")
          .upsert(toWrite, { onConflict: "run_id,candidate_index" });
        if (outErr) return { ok: false, error: `candidate outcome write failed: ${outErr.message}` };
      }
    }

    return { ok: true, scoped: true, totals, results };
  }

  // ── FINALIZE: the portfolio census. NO VERDICT PRUNE (Gate 3b, 2026-09-10). ──────────────────────
  //
  // THE LAW: content identity is the unit of evidence; a verdict persists by it and is never
  // re-rolled. A judged rejection is EVIDENCE — the record of why an audience the model proposed is
  // not on the surface — and it is worth exactly as much as a judged acceptance.
  //
  // The prune that stood here deleted every verdict whose market_a_identity was not a CURRENT DEF
  // (and, for same_market, unless BOTH sides were). That is precisely the set of rulings about
  // candidates that did NOT become defs: every rejected_solution, every dedup fold. So the store kept
  // the verdicts nobody needs to look up — the accepted ones, whose answer is visible as a def — and
  // destroyed the ones that explain an absence. The migration header (20260715120000) described the
  // rule as sparing "a candidate of the current run"; the code only ever checked defIdentities, so it
  // never did. Riverlane is the case: its buyer group was proposed, dropped, and left no explanation
  // anywhere, and a prune at finalize would have erased the explanation even if one had been banked.
  //
  // Deleting them also broke the never-re-roll law by the back door: a pruned rejection re-judges on
  // the next run, at model cost, and may answer differently. Keeping it makes the bank authoritative.
  //
  // ORPHANS. A verdict whose identity has no def is not garbage — it is the reason there is no def.
  // The only true orphan moment is a def DELETE, and there is exactly one in the codebase:
  // research-company/index.ts:7072 (`.delete().eq("company_id", company_id)`), the wholesale re-seed.
  // market_discovery_verdicts has ONE foreign key, company_id → companies ON DELETE CASCADE; there is
  // no key to odi_market_definitions (identities are sha256 hashes, not references), so that DELETE
  // does NOT cascade or clean the verdicts of the defs it removes. Cleanup belongs THERE, scoped to
  // that path, where the intent to discard is explicit — not here, where the intent is to finish a
  // run. Not built in this gate; recorded so it is a decision and not an oversight.
  //
  // `verdicts_pruned` stays in the totals shape, always 0, so no caller's contract changes.
  return { ok: true, scoped: false, totals, results };
}
