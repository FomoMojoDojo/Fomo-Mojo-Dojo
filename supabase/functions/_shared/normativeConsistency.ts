// ── normativeConsistency ──────────────────────────────────────────────────────
//
// ACT-C-2: the 5th C measured per NORMATIVE STEP. Re-scope of the CONSISTENT
// computation (signalRecurrence, CV-2d-1) to the FINDING↔SOURCE (R1) shape: a
// discovered normative step (normative_job_steps) is a FIXED anchor judged
// independently against each industry source (normative_industry_sources) —
// "does this independent industry source describe THIS step?" — and rolled up by
// DISTINCT registrable_domain. NO union-find, NO clustering.
//
// This module IMPORTS the recurrence independence + prefilter + criterion
// authorities and NEVER mutates the finding machinery. The 70b judge transport
// is re-implemented locally only because signalRecurrence's callOllamaJson is not
// exported and that file must not be edited — the INDEPENDENCE metric and the
// content hash are imported, never re-invented.
//
// SOURCE-RUN BINDING = RUN-BOUND: a step scores ONLY against sources with the
// same source_run_id (deterministic snapshot). The frozen verdict is
// content-keyed (pair_identity = step_sha × source_sha), so an identical
// (step, source) judged once is cached across runs — never re-paid.
//
// OWN-DOMAIN + SYNDICATED EXCLUDED AT LOAD: a source on the company's own
// registrable domain, or syndicated-from-client, NEVER counts toward independence
// — self-corroboration is structurally impossible.

import { normalizeForHash, sha256Hex } from "./contentIdentity.ts";
import { FROZEN_COMPANY_IDS } from "./stepConditionsSynthesis.ts";
import {
  DEFAULT_JUDGE_MODEL,
  RECURRENCE_MIN_SHARED_TOKENS,
  registrableDomain,
  SAME_FACT_CRITERION,
  sharedTokenCount,
} from "./signalRecurrence.ts";

const JUDGE_TIMEOUT_MS = 180_000;

// ── Tiering — a SINGLE pure function of the distinct-domain count so the
// boundary moves without touching stored data. Defaults are operator-signed at
// acceptance; NOT final here.
export type ConsistencyTier = "strongly_repeated" | "lightly_attested" | "inferred_from_standard";
export const TIER_STRONG_MIN = 2; // operator-signed at C-2 acceptance
export function tierForCount(distinctHostCount: number): ConsistencyTier {
  if (distinctHostCount >= TIER_STRONG_MIN) return "strongly_repeated";
  if (distinctHostCount === 1) return "lightly_attested";
  return "inferred_from_standard";
}

// ── Step↔source judge (reuses SAME_FACT_CRITERION; framing re-aimed) ────────────
const STEP_SOURCE_JUDGE_SYSTEM =
  "You compare a JOB STEP (one stage in how a job is typically done in an industry) " +
  "with ONE statement gathered from an independent industry source. " +
  "Decide whether the source DESCRIBES THIS step of how the job performer gets the job done. " +
  SAME_FACT_CRITERION + " " +
  'JSON only: {"attested":true|false,"reason":"<one short clause citing words from BOTH the step and the source>"}.';

function buildStepSourceUser(executor: string, jtbd: string, stepStatement: string, sourceText: string): string {
  return (
    `JOB PERFORMER: ${executor}\nJOB: ${jtbd}\n` +
    `STEP: ${stepStatement}\nINDUSTRY SOURCE: ${sourceText}\n` +
    `Does the industry source describe THIS step of how ${executor} gets the job done?`
  );
}

async function callOllamaJson(ollamaUrl: string, model: string, system: string, user: string, timeoutMs: number): Promise<string> {
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
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`normative-consistency judge call failed: HTTP ${resp.status} (${model})`);
    const data = await resp.json().catch(() => ({}));
    const content = String((data as { message?: { content?: unknown } })?.message?.content ?? "");
    if (!content) throw new Error(`normative-consistency judge returned empty content (${model})`);
    return content;
  } finally {
    clearTimeout(t);
  }
}

function parseAttested(raw: string): { attested: boolean; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`normative-consistency judge output unparseable (strict): ${raw.slice(0, 140)}`);
  }
  const p = parsed as Record<string, unknown>;
  if (typeof p.attested !== "boolean") {
    throw new Error(`normative-consistency judge output missing 'attested' (strict): ${raw.slice(0, 140)}`);
  }
  return { attested: p.attested, reason: String(p.reason ?? "").trim() };
}

// Content-keyed pair identity — asymmetric (step vs source have distinct roles,
// so NO order-normalization). Uses the shared hash authority only.
export async function stepSourcePairIdentity(stepSha: string, sourceSha: string): Promise<string> {
  return await sha256Hex(`nrmstep|${stepSha}|${sourceSha}`);
}

// ── types ───────────────────────────────────────────────────────────────────
type Sb = { from: (t: string) => any };
type NormStep = { id: string; content_sha: string; step_number: number; step_key: string; statement: string };
type NormSource = { id: string; content_sha: string; source_text: string; registrable_domain: string; host: string | null };

export type NormConsistencyArgs = {
  supabase: Sb;
  companyId: string;
  sourceRunId: string;
  ollamaUrl: string;
  nowIso: string;
  judgeModel?: string;
  write: boolean;
  pairs?: Array<{ a: string; b: string }>; // a = step_id, b = source_id
};

export type NormPlanPair = { step_id: string; source_id: string; status: "frozen" | "fresh"; basis: string };
export type NormPlanResult =
  | { ok: true; plan: true; source_run_id: string; eligible_steps: number; eligible_sources: number; candidates_total: number; candidates_frozen: number; candidates_fresh: number; pairs: NormPlanPair[] }
  | { ok: false; skipped: "frozen_company" | "no_map" }
  | { ok: false; error: string };
export type NormRunResult =
  | {
    ok: true;
    scoped: boolean;
    totals: { requested: number; judged: number; attested: number; not_attested: number; cached: number; skipped_ineligible: number; sources_pruned: number; rollup_written: number; rollup_unchanged: number };
    steps?: Array<{ step_id: string; step_number: number; distinct_host_count: number; tier: ConsistencyTier; host_list: string[] }>;
  }
  | { ok: false; skipped: "frozen_company" | "no_map" }
  | { ok: false; error: string };

// ── data loading (run-bound; own-domain + syndicated excluded) ──────────────────
async function loadRunBound(supabase: Sb, companyId: string, sourceRunId: string): Promise<{ steps: NormStep[]; sources: NormSource[]; executor: string; jtbd: string; ownDomain: string | null }> {
  const { data: company } = await supabase.from("companies").select("website").eq("id", companyId).maybeSingle();
  const ownDomain = registrableDomain((company as { website?: string } | null)?.website ?? null);

  const { data: stepRows, error: sErr } = await supabase
    .from("normative_job_steps")
    .select("id, content_sha, step_number, step_key, step_label, description, executor_context")
    .eq("company_id", companyId).eq("source_run_id", sourceRunId).order("step_number", { ascending: true });
  if (sErr) throw new Error(`normative_job_steps load failed: ${sErr.message}`);
  const steps: NormStep[] = ((stepRows ?? []) as any[]).map((r) => ({
    id: r.id, content_sha: r.content_sha, step_number: r.step_number, step_key: r.step_key,
    statement: `${String(r.step_label || "")}. ${String(r.description || "")}`.trim(),
  }));
  // executor/jtbd for the judge framing — from the run's executor_context snapshot.
  const ctx = String(((stepRows ?? [])[0] as any)?.executor_context || "");
  const [executor, jtbd] = ctx.includes(" — ") ? [ctx.split(" — ")[0], ctx.split(" — ").slice(1).join(" — ")] : [ctx, ""];

  const { data: srcRows, error: srcErr } = await supabase
    .from("normative_industry_sources")
    .select("id, content_sha, source_text, registrable_domain, host, syndicated")
    .eq("company_id", companyId).eq("source_run_id", sourceRunId);
  if (srcErr) throw new Error(`normative_industry_sources load failed: ${srcErr.message}`);
  const sources: NormSource[] = [];
  for (const r of ((srcRows ?? []) as any[])) {
    if (r.syndicated === true) continue; // syndicated-from-client excluded
    const domain = String(r.registrable_domain || "");
    if (!domain) continue; // no independence unit
    if (ownDomain && domain === ownDomain) continue; // own-domain excluded — self-corroboration impossible
    if (!String(r.source_text || "").trim()) continue;
    sources.push({ id: r.id, content_sha: r.content_sha, source_text: r.source_text, registrable_domain: domain, host: r.host ?? null });
  }
  return { steps, sources, executor, jtbd, ownDomain };
}

function buildCandidates(steps: NormStep[], sources: NormSource[]): Array<{ step: NormStep; source: NormSource; basis: string }> {
  const out: Array<{ step: NormStep; source: NormSource; basis: string }> = [];
  for (const step of steps) {
    for (const source of sources) {
      const shared = sharedTokenCount(step.statement, source.source_text);
      if (shared < RECURRENCE_MIN_SHARED_TOKENS) continue;
      out.push({ step, source, basis: `shared_tokens:${shared}` });
    }
  }
  out.sort((x, y) => (x.step.id + x.source.id).localeCompare(y.step.id + y.source.id));
  return out;
}

async function loadVerdicts(supabase: Sb, companyId: string, sourceRunId: string): Promise<Map<string, { verdict: string; step_id: string; source_id: string }>> {
  const { data, error } = await supabase
    .from("normative_step_source_verdicts")
    .select("pair_identity, verdict, step_id, source_id")
    .eq("company_id", companyId).eq("source_run_id", sourceRunId);
  if (error) throw new Error(`verdicts load failed: ${error.message}`);
  return new Map(((data ?? []) as any[]).map((v) => [v.pair_identity, { verdict: v.verdict, step_id: v.step_id, source_id: v.source_id }]));
}

// ── compute ─────────────────────────────────────────────────────────────────
export async function computeNormativeConsistency(args: NormConsistencyArgs & { plan: true }): Promise<NormPlanResult>;
export async function computeNormativeConsistency(args: NormConsistencyArgs & { plan?: false | undefined }): Promise<NormRunResult>;
export async function computeNormativeConsistency(args: NormConsistencyArgs & { plan?: boolean }): Promise<NormPlanResult | NormRunResult> {
  if (FROZEN_COMPANY_IDS.has(args.companyId)) return { ok: false, skipped: "frozen_company" };
  const judgeModel = args.judgeModel ?? DEFAULT_JUDGE_MODEL;
  const { steps, sources, executor, jtbd } = await loadRunBound(args.supabase, args.companyId, args.sourceRunId);
  if (steps.length === 0) return { ok: false, skipped: "no_map" };
  const stepById = new Map(steps.map((s) => [s.id, s]));
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const verdictByIdentity = await loadVerdicts(args.supabase, args.companyId, args.sourceRunId);

  // ── PLAN ──
  if (args.plan) {
    const candidates = buildCandidates(steps, sources);
    const pairs: NormPlanPair[] = [];
    let frozen = 0;
    for (const c of candidates) {
      const identity = await stepSourcePairIdentity(c.step.content_sha, c.source.content_sha);
      const isFrozen = verdictByIdentity.has(identity);
      if (isFrozen) frozen++;
      pairs.push({ step_id: c.step.id, source_id: c.source.id, status: isFrozen ? "frozen" : "fresh", basis: c.basis });
    }
    return { ok: true, plan: true, source_run_id: args.sourceRunId, eligible_steps: steps.length, eligible_sources: sources.length, candidates_total: candidates.length, candidates_frozen: frozen, candidates_fresh: candidates.length - frozen, pairs };
  }

  const totals = { requested: 0, judged: 0, attested: 0, not_attested: 0, cached: 0, skipped_ineligible: 0, sources_pruned: 0, rollup_written: 0, rollup_unchanged: 0 };
  const scoped = Array.isArray(args.pairs) && args.pairs.length > 0;

  // ── SCOPED CHUNK: judge requested pairs, inline-bank (content-frozen) ──
  if (scoped) {
    for (const p of args.pairs!) {
      totals.requested++;
      const step = stepById.get(p.a);
      const source = sourceById.get(p.b);
      if (!step || !source) { totals.skipped_ineligible++; continue; } // excluded (own-domain/syndicated) or missing
      const identity = await stepSourcePairIdentity(step.content_sha, source.content_sha);
      if (verdictByIdentity.has(identity)) { totals.cached++; continue; }
      const raw = await callOllamaJson(args.ollamaUrl, judgeModel, STEP_SOURCE_JUDGE_SYSTEM, buildStepSourceUser(executor, jtbd, step.statement, source.source_text), JUDGE_TIMEOUT_MS);
      const v = parseAttested(raw);
      totals.judged++;
      const verdict = v.attested ? "attested" : "not_attested";
      if (v.attested) totals.attested++; else totals.not_attested++;
      if (args.write) {
        const { error } = await args.supabase.from("normative_step_source_verdicts").insert({
          company_id: args.companyId, source_run_id: args.sourceRunId, step_id: step.id, source_id: source.id,
          pair_identity: identity, step_identity: step.content_sha, source_identity: source.content_sha,
          verdict, judge_model: judgeModel, judge_reason: v.reason, candidate_basis: `shared_tokens:${sharedTokenCount(step.statement, source.source_text)}`,
        });
        if (error && !String(error.message ?? "").includes("duplicate")) throw new Error(`verdict insert failed: ${error.message}`);
        verdictByIdentity.set(identity, { verdict, step_id: step.id, source_id: source.id });
      }
    }
    return { ok: true, scoped: true, totals };
  }

  // ── FINALIZE: orphan-prune (with audit) + rollup rebuild ──
  // 1. Orphan-prune: industry sources whose source_run_id matches NO map. Audited.
  const { data: mapRunRows } = await args.supabase.from("normative_job_steps").select("source_run_id").eq("company_id", args.companyId);
  const mappedRuns = new Set(((mapRunRows ?? []) as any[]).map((r) => String(r.source_run_id)));
  const { data: allSrc } = await args.supabase.from("normative_industry_sources").select("id, source_run_id, registrable_domain, content_sha").eq("company_id", args.companyId);
  for (const r of ((allSrc ?? []) as any[])) {
    if (mappedRuns.has(String(r.source_run_id))) continue; // bound to a map — keep
    totals.sources_pruned++;
    if (args.write) {
      const { error: aErr } = await args.supabase.from("normative_source_removals").insert({
        company_id: args.companyId, source_run_id: String(r.source_run_id), removed_source_id: r.id,
        registrable_domain: r.registrable_domain ?? null, content_sha: r.content_sha ?? null,
        reason: "orphan: source_run_id has no normative_job_steps map",
      });
      if (aErr) throw new Error(`prune audit insert failed: ${aErr.message}`); // audit BEFORE delete
      const { error: dErr } = await args.supabase.from("normative_industry_sources").delete().eq("id", r.id);
      if (dErr) throw new Error(`orphan prune delete failed: ${dErr.message}`);
    }
  }

  // 2. Rollup rebuild — per step, DISTINCT registrable_domain among ATTESTED
  //    verdicts of this run. No union-find. Update-on-change preserves computed_at.
  const { data: existingRollups } = await args.supabase.from("normative_step_recurrence").select("id, step_id, distinct_host_count, host_list, verdict_count").eq("company_id", args.companyId).eq("source_run_id", args.sourceRunId);
  const rollupByStep = new Map(((existingRollups ?? []) as any[]).map((r) => [r.step_id, r]));
  const reported: Array<{ step_id: string; step_number: number; distinct_host_count: number; tier: ConsistencyTier; host_list: string[] }> = [];

  for (const step of steps) {
    const domains = new Set<string>();
    let verdictCount = 0;
    for (const [, v] of verdictByIdentity) {
      if (v.step_id !== step.id || v.verdict !== "attested") continue;
      const src = sourceById.get(v.source_id);
      if (!src) continue; // source excluded/pruned — not counted
      domains.add(src.registrable_domain);
      verdictCount++;
    }
    const hostList = [...domains].sort();
    const distinct = hostList.length;
    reported.push({ step_id: step.id, step_number: step.step_number, distinct_host_count: distinct, tier: tierForCount(distinct), host_list: hostList });

    const existing = rollupByStep.get(step.id);
    const sameHosts = existing && JSON.stringify(existing.host_list ?? []) === JSON.stringify(hostList) && Number(existing.distinct_host_count) === distinct && Number(existing.verdict_count) === verdictCount;
    if (sameHosts) { totals.rollup_unchanged++; continue; } // byte-identical: leave computed_at
    if (args.write) {
      if (existing) {
        const { error } = await args.supabase.from("normative_step_recurrence").update({ distinct_host_count: distinct, host_list: hostList, verdict_count: verdictCount, computed_at: args.nowIso }).eq("id", existing.id);
        if (error) throw new Error(`rollup update failed: ${error.message}`);
      } else {
        const { error } = await args.supabase.from("normative_step_recurrence").insert({ step_id: step.id, company_id: args.companyId, source_run_id: args.sourceRunId, distinct_host_count: distinct, host_list: hostList, verdict_count: verdictCount, computed_at: args.nowIso });
        if (error && !String(error.message ?? "").includes("duplicate")) throw new Error(`rollup insert failed: ${error.message}`);
      }
    }
    totals.rollup_written++;
  }

  return { ok: true, scoped: false, totals, steps: reported };
}
