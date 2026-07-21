// ── MO-1 · ODI-form market OPTIONS ────────────────────────────────────────────
//
// Generates PRELIMINARY market options in strict ODI form from the company's
// outside record, and judges each against THREE INDEPENDENT criteria. Options
// are hypotheses by proof law (market_options.proof_tier is pinned to
// 'hypothesis' by CHECK) and never auto-promote.
//
// WHY THIS EXISTS: odi_market_definitions holds BLENDED statements — its birth
// prompt instructs the generator to fold WHO and JOB into one job_executor
// clause ("Independent cafe operators sourcing a specialty coffee offering for
// their venue"). Of Edgewood's 6 live public market cards, 0 pass ODI form and
// 4 are solution-bound. Those rows are also immutable after birth. So options
// are NEW rows in a NEW table; nothing here reads for mutation, updates, or
// deletes odi_market_definitions.
//
// THREE CRITERIA — all must pass, judged independently, short-circuiting:
//   (1) executor_group    — the executor is a GROUP OF PEOPLE. Never a company,
//                           brand, industry, sector, or abstraction.
//                           "Pediatricians" passes; "healthcare" fails.
//   (2) odi_form          — the job is VERB + OBJECT OF THE VERB + CONTEXTUAL
//                           CLARIFIER, structurally separable into three parts.
//   (3) solution_agnostic — the job names no product, service, channel,
//                           provider, or offering category. EXTENDS the
//                           existing SOLUTION_AGNOSTIC_SYSTEM judge (imported,
//                           not copied). A statement can be perfectly
//                           well-formed under (2) and still fail (3): "Select a
//                           residential treatment provider for a youth in
//                           crisis" is verb+object+clarifier AND solution-bound.
//
// NEGATIVE CACHE FROM BIRTH: judge-rejected candidates are STORED
// (status='rejected'), so a re-run never re-pays the model tax on a candidate
// already ruled out. Freeze-on-reject, keyed by content_identity alone, models
// are provenance only, no TTL. Content change self-invalidates.
//
// require_model: every model call is strict. Unparseable or missing fields
// throw; there is no canned fallback, no template substitution, and no default
// verdict. A model failure aborts loudly with zero further writes — the rows
// already banked stay banked.
//
// LOCAL-ONLY (Option B): qwen2.5:14b-instruct gen + llama3:70b judge on a
// localhost Ollama. Zero OpenAI.

import { normalizeForHash, sha256Hex } from "./contentIdentity.ts";
import { SOLUTION_AGNOSTIC_SYSTEM, buildSolutionAgnosticUser } from "./marketPortfolioDiscovery.ts";

const DEFAULT_GEN_MODEL = "qwen2.5:14b-instruct";
const DEFAULT_JUDGE_MODEL = "llama3:70b";
const GEN_TIMEOUT_MS = 180_000;
const JUDGE_TIMEOUT_MS = 180_000;

export const MAX_OPTIONS = 6;
/** Judge chunk cap. 3 judge calls per candidate worst case vs the ~150s edge wall. */
export const DEFAULT_CHUNK = 2;

export const RUN_KIND = "market_options";

/**
 * CRITERIA VERSION — bump whenever ANY criterion's definition changes.
 *
 * A verdict is only valid for the criteria that produced it. Verdicts banked
 * under an older version STOP counting as cached: the option is re-judged under
 * the current criteria and lands as a new row at the new version. Old rows are
 * kept — history is history, and a rejection's audit trail must survive.
 *
 *   v1 — executor is a group of people | ODI form | solution-agnostic
 *   v2 — v1 + executor must be VERB-FREE (no job content embedded in WHO)
 *
 * KEEP IN SYNC with MO1_CRITERIA_VERSION in src/hooks/useMarketOptions.ts,
 * which must not display a candidate judged under superseded criteria.
 */
export const MO1_CRITERIA_VERSION = 2;

export type MarketOptionCandidate = {
  executor_statement: string;
  job_statement: string;
  basis?: string;
  /** Set only on a revision: the id of the attempt-1 row this rewrites. */
  revision_of?: string;
};

type Criterion = "executor_group" | "odi_form" | "solution_agnostic";

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
    if (!resp.ok) throw new Error(`market-options model call failed: HTTP ${resp.status} (${model})`);
    const data = await resp.json().catch(() => ({}));
    const content = String((data as { message?: { content?: unknown } })?.message?.content ?? "");
    if (!content) throw new Error(`market-options model call returned empty content (${model})`);
    return content;
  } finally {
    clearTimeout(t);
  }
}

/** Strict boolean parse — throws rather than defaulting. require_model law. */
function parseBool(raw: string, field: string, who: string): { value: boolean; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`market-options ${who} output unparseable (strict): ${raw.slice(0, 140)}`);
  }
  const p = parsed as Record<string, unknown>;
  if (typeof p[field] !== "boolean") {
    throw new Error(`market-options ${who} output missing ${field} (strict): ${raw.slice(0, 140)}`);
  }
  return { value: p[field] as boolean, reason: String(p.reason ?? "").trim() };
}

// ── generation ───────────────────────────────────────────────────────────────

const GEN_SYSTEM =
  "You propose PRELIMINARY MARKET OPTIONS for a company, from evidence about it. " +
  "A market = a GROUP OF PEOPLE + the JOB they are trying to get done. " +
  "You MUST return the two parts SEPARATELY — never fold the job into the executor. " +
  "executor_statement = WHO, and ONLY who: a group of people, in their own terms. " +
  "It must name people, not an organisation, brand, industry, sector, or abstraction. " +
  "'Pediatricians' is valid; 'healthcare', 'the referral market', 'schools' as an institution are NOT. " +
  "It must contain NO verb describing what they are doing — that belongs in the job. " +
  "job_statement = VERB + OBJECT OF THE VERB + CONTEXTUAL CLARIFIER, in that order, one clause. " +
  "Example SHAPE (match the shape, not the facts): 'Restore a young person's stability after an acute crisis.' " +
  "-> verb 'restore', object \"a young person's stability\", clarifier 'after an acute crisis'. " +
  "The job MUST be solution-agnostic: it names no product, service, programme, channel, provider, vendor, or category of offering, " +
  "and it must NOT describe buying, choosing, finding, selecting, or sourcing anything — those are purchase acts, not jobs. " +
  "The job existed before this company and would exist without it. " +
  "NEVER name a company, brand, or vendor — not even the company under analysis. " +
  "basis = one short clause citing the evidence this option is drawn from. " +
  "Ground every option in the evidence given. Fewer, well-grounded options beat many speculative ones. " +
  'JSON only: {"options":[{"executor_statement":"...","job_statement":"...","basis":"..."}]}.';

// INPUT REFRAME (operator amendment after the run-1 all-rejected result): the
// FINDINGS are the substance the options are built from. The existing market
// defs may only say WHO is already in the picture — their JOBS are blended and
// solution-bound, and in run 1 handing them over as context poisoned every job
// the generator produced (5 of 6 rejections were odi_form, mostly inherited
// phrasing). So only the executor half is passed, explicitly labelled as
// not-a-template.
function buildGenUser(companyName: string, evidence: string, knownWho: string, max: number): string {
  return (
    `COMPANY: ${companyName}\n\n` +
    `EVIDENCE — THE OUTSIDE RECORD. Build the options from THIS:\n${evidence}\n\n` +
    `GROUPS ALREADY KNOWN TO BE IN THE PICTURE (names only — these are NOT job templates, ` +
    `and their phrasing must NOT be reused for job_statement):\n${knownWho}\n\n` +
    `For each option, decompose explicitly:\n` +
    `  1. WHO — a group of people, named as people, with no verb.\n` +
    `  2. THE JOB — verb + object of the verb + contextual clarifier, one clause, solution-agnostic.\n` +
    `Derive the job from what the evidence shows those people are trying to achieve — ` +
    `never from how this company describes its own services.\n\n` +
    `Propose at most ${max} preliminary market options.`
  );
}

// ── refinement: ONE rewrite cycle for a rejected candidate ───────────────────
//
// The generator is handed the candidate plus the judge's NAMED failing
// criterion and its rationale, as a targeted instruction. Most run-1 failures
// were near-misses in FORM (a missing clarifier), not bad readings — the fix is
// to refine the statement, never to loosen the judge. The revision re-enters
// the FULL three-criteria judge; one cycle only.
//
// require_model: the revision is MODEL output. There is no template patching —
// nothing here appends a clarifier or rewrites a statement in code.
const REVISE_SYSTEM =
  "You REVISE a single market option that failed a form check. " +
  "You are given the option and the exact criterion it failed, with the judge's reason. " +
  "Fix ONLY that failure while keeping the reading intact — the same people, the same underlying progress. " +
  "Do not invent a different market. Do not broaden or narrow WHO unless WHO is what failed. " +
  "executor_statement = a group of people, named as people, containing no verb. " +
  "job_statement = VERB + OBJECT OF THE VERB + CONTEXTUAL CLARIFIER, one clause. " +
  "The clarifier states the circumstance (when / under what condition / for whom) and is REQUIRED. " +
  "The job must name no product, service, provider, or offering category, and must not be a " +
  "buying, choosing, finding, selecting or sourcing act. " +
  "State the progress the people are trying to make, as it would read if no supplier existed. " +
  'JSON only: {"executor_statement":"...","job_statement":"...","basis":"..."}.';

function buildReviseUser(executor: string, job: string, criterion: string, reason: string): string {
  const named = criterion === "executor_group"
    ? "WHO is not a group of people"
    : criterion === "odi_form"
    ? "THE JOB is not verb + object + contextual clarifier"
    : "THE JOB names a solution, provider, or offering, or is a purchase act";
  return (
    `OPTION AS WRITTEN —\n  WHO: ${executor}\n  THE JOB: ${job}\n\n` +
    `FAILED CRITERION: ${criterion} — ${named}.\n` +
    `JUDGE'S REASON: ${reason || "(none given)"}\n\n` +
    `Rewrite the option so it passes, keeping the same reading.`
  );
}

function parseRevision(raw: string): MarketOptionCandidate {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`market-options reviser output unparseable (strict): ${raw.slice(0, 200)}`);
  }
  const p = parsed as Record<string, unknown>;
  const executor = String(p.executor_statement ?? "").trim();
  const job = String(p.job_statement ?? "").trim();
  // require_model: a half-missing revision is a loud failure, never patched.
  if (!executor || !job) {
    throw new Error(`market-options reviser returned an incomplete option (strict): ${raw.slice(0, 200)}`);
  }
  return { executor_statement: executor, job_statement: job, basis: String(p.basis ?? "").trim() || undefined };
}

function parseOptions(raw: string): MarketOptionCandidate[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`market-options generator output unparseable (strict): ${raw.slice(0, 200)}`);
  }
  const arr = (parsed as { options?: unknown })?.options;
  if (!Array.isArray(arr)) {
    throw new Error(`market-options generator output missing options[] (strict): ${raw.slice(0, 200)}`);
  }
  const out: MarketOptionCandidate[] = [];
  for (const o of arr) {
    const executor = String((o as { executor_statement?: unknown })?.executor_statement ?? "").trim();
    const job = String((o as { job_statement?: unknown })?.job_statement ?? "").trim();
    if (!executor || !job) continue; // an option missing a half is not an option
    out.push({
      executor_statement: executor,
      job_statement: job,
      basis: String((o as { basis?: unknown })?.basis ?? "").trim() || undefined,
    });
  }
  return out.slice(0, MAX_OPTIONS);
}

// ── criterion (1): executor is a group of people ─────────────────────────────

// TIGHTENED v1 -> v2: the executor must ALSO be verb-free. GEN_SYSTEM always
// demanded it ("no verb describing what they are doing — that belongs in the
// job"), but the judge did not enforce it, so an executor carrying job content
// could pass: "Direct care staff SEEKING BETTER WORKING CONDITIONS". That is
// the blend problem re-entering through the WHO half, and it destroys the
// two-half card's teaching value — the card claims WHO and THE JOB are
// separable, so WHO must not contain a job.
const EXECUTOR_GROUP_SYSTEM =
  "You judge whether a market EXECUTOR is a GROUP OF PEOPLE, stated WITHOUT any job content. " +
  "PASS only if BOTH hold. " +
  "(A) It names people — a role, profession, or population that a human being could belong to. " +
  "(B) It is VERB-FREE: it says only WHO they are, never what they are doing, seeking, wanting, or trying to achieve. " +
  "FAIL (B) if it contains a verb or participle describing an activity, goal, or need — " +
  "'Direct care staff seeking better working conditions' FAILS (the job is inside the WHO); " +
  "'Direct care staff' PASSES. " +
  "'Community organizations raising funds' FAILS on both counts. " +
  "FAIL if it names a company, brand, vendor, or named organisation. " +
  "FAIL if it names an industry, sector, market, or field ('healthcare', 'education', 'the referral market'). " +
  "FAIL if it is an institution or entity rather than the people in it ('schools', 'agencies', 'hospitals') — " +
  "unless it names the people ('school counsellors', 'agency caseworkers'). " +
  "FAIL if it is an abstraction, a segment label, or a demographic bucket with no human referent. " +
  "A bare descriptive qualifier is fine ('at-risk youth aged 5-26', 'county social workers') — " +
  "it is ACTIVITY or GOAL language that fails (B). " +
  'JSON only: {"is_group_of_people":true|false,"reason":"<one short clause>"}.';

function buildExecutorGroupUser(executor: string): string {
  return `EXECUTOR: ${executor}\nIs this a group of people?`;
}

// ── criterion (2): job is verb + object + contextual clarifier ───────────────

const ODI_FORM_SYSTEM =
  "You judge whether a JOB STATEMENT is in strict ODI form: VERB + OBJECT OF THE VERB + CONTEXTUAL CLARIFIER. " +
  "PASS only if all three parts are present and structurally separable: " +
  "a single action verb, the thing that verb acts on, and a clarifier giving the circumstance. " +
  "FAIL if any part is missing, if there is no clarifier, if it is a noun phrase with no verb, " +
  "if it chains multiple jobs together, or if it is a sentence of prose rather than one clause. " +
  "Judge FORM ONLY here — do not judge whether the job mentions a product or solution; another judge does that. " +
  'JSON only: {"odi_form":true|false,"verb":"<the verb>","object":"<the object>","clarifier":"<the clarifier>","reason":"<one short clause>"}.';

function buildOdiFormUser(job: string): string {
  return `JOB STATEMENT: ${job}\nIs this verb + object of the verb + contextual clarifier?`;
}

// ── criterion (3), part B: no generic offering, no purchase act ──────────────
//
// The imported SOLUTION_AGNOSTIC_SYSTEM asks a NARROWER question than criterion
// (3) requires: it asks whether the job is free of THIS COMPANY's product or
// solution. Criterion (3) as specified is broader — the job must name no
// product, service, channel, provider, or offering category, from ANY supplier.
//
// Proven live, not assumed: the probe "Select a residential treatment provider
// for a young person after an acute episode" PASSED the imported judge, whose
// reason was "the job exists independently of Edgewood Center's specific
// services" — true, and beside the point. It names a provider category and is a
// purchase act, so criterion (3) must reject it.
//
// So criterion (3) = imported judge AND this one. Both must pass. The shared
// judge is NOT modified: generate-market-discovery depends on its current
// behaviour, and this is a composition, not a rewrite.
const NO_OFFERING_SYSTEM =
  "You judge whether a JOB STATEMENT is free of SOLUTIONS — from any supplier, not just one company. " +
  "FAIL if it names a product, service, programme, treatment, facility, channel, platform, tool, " +
  "or a PROVIDER / VENDOR / SUPPLIER of any of those, or a CATEGORY of such an offering. " +
  "FAIL if the job is a PURCHASE OR PROCUREMENT ACT: buying, choosing, selecting, finding, sourcing, " +
  "procuring, hiring, contracting, or evaluating a provider or offering. Those describe shopping for a " +
  "solution, not the underlying progress the person is trying to make. " +
  "PASS only if the job describes the progress itself, in the executor's own world — the outcome they " +
  "want, stated so that it would be true even if no supplier existed. " +
  "Example FAIL: 'Select a residential treatment provider for a young person after an acute episode' — " +
  "names a provider category and is a selection act. " +
  "Example PASS: \"Restore a young person's stability after an acute mental health episode.\" " +
  'JSON only: {"offering_free":true|false,"reason":"<one short clause>"}.';

function buildNoOfferingUser(job: string): string {
  return `JOB STATEMENT: ${job}\nIs this free of any named offering, provider, or purchase act?`;
}

// ── identity ─────────────────────────────────────────────────────────────────

/**
 * Content identity of an option. Namespaced like the sibling market keys, over
 * the SEPARATE halves. Uses the single TS hashing authority — never SQL.
 */
export async function optionIdentity(executor: string, job: string): Promise<string> {
  return await sha256Hex(`mktopt|${normalizeForHash(`${executor}|${job}`)}`);
}

// ── core ─────────────────────────────────────────────────────────────────────

type Supa = { from: (t: string) => any };

export type MarketOptionArgs = {
  supabase: Supa;
  companyId: string;
  ollamaUrl: string;
  nowIso: string;
  genModel?: string;
  judgeModel?: string;
  write?: boolean;
  plan?: boolean;
  revise?: boolean;
  candidates?: MarketOptionCandidate[];
  runId?: string | null;
};

export type MarketOptionResult =
  | { ok: true; plan: { candidates: MarketOptionCandidate[]; fresh: number; cached: number; gen_calls: number } }
  | {
    ok: true;
    scoped: boolean;
    totals: {
      considered: number;
      cached: number;
      written_candidates: number;
      written_rejections: number;
      terminal: number;
      judge_calls: number;
      gen_calls: number;
    };
    results: Array<Record<string, unknown>>;
  }
  | { ok: false; skipped: "no_evidence" | "frozen_company"; detail?: string }
  | { ok: false; error: string };

async function loadCompanyName(supabase: Supa, companyId: string): Promise<string> {
  const { data } = await supabase.from("companies").select("name").eq("id", companyId).single();
  return String((data as { name?: unknown } | null)?.name ?? "").trim() || "the company";
}

/** Identity -> status for every option already banked (candidates AND rejections). */
/**
 * Identity -> status for options banked UNDER THE CURRENT CRITERIA VERSION.
 * Verdicts from a superseded version are deliberately NOT loaded: they must not
 * satisfy a cache lookup, or a stale pass would ride forever.
 */
async function loadBanked(supabase: Supa, companyId: string): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("market_options")
    .select("content_identity, status")
    .eq("company_id", companyId)
    .eq("criteria_version", MO1_CRITERIA_VERSION);
  const rows = (data ?? []) as Array<{ content_identity: string; status: string }>;
  return new Map(rows.map((r) => [r.content_identity, r.status]));
}

export async function computeMarketOptions(args: MarketOptionArgs): Promise<MarketOptionResult> {
  const genModel = args.genModel ?? DEFAULT_GEN_MODEL;
  const judgeModel = args.judgeModel ?? DEFAULT_JUDGE_MODEL;
  const write = args.write !== false;
  const companyName = await loadCompanyName(args.supabase, args.companyId);
  const banked = await loadBanked(args.supabase, args.companyId);

  // ── PLAN: one 14b gen call → candidate manifest. ZERO writes, ZERO judges. ──
  if (args.plan) {
    const { data: findingRows } = await args.supabase
      .from("findings")
      .select("kind, body, beats")
      .eq("company_id", args.companyId)
      .eq("status", "open");
    const findings = (findingRows ?? []) as Array<{ kind: string; body: string; beats: Record<string, unknown> | null }>;
    if (findings.length === 0) return { ok: false, skipped: "no_evidence", detail: "no open findings" };

    const evidence = findings
      .map((f) => `- [${f.kind}] ${String((f.beats as { observe?: unknown })?.observe ?? f.body ?? "").trim()}`)
      .filter((l) => l.length > 6)
      .join("\n");

    // WHO ONLY. jtbd is deliberately NOT selected — see buildGenUser.
    const { data: defRows } = await args.supabase
      .from("odi_market_definitions")
      .select("id, job_executor")
      .eq("company_id", args.companyId);
    const allDefs = (defRows ?? []) as Array<{ id: string; job_executor: string }>;
    const knownWho = allDefs.map((d) => `- ${d.job_executor}`).join("\n") || "(none on file)";

    const raw = await callOllamaJson(
      args.ollamaUrl,
      genModel,
      GEN_SYSTEM,
      buildGenUser(companyName, evidence, knownWho, MAX_OPTIONS),
      GEN_TIMEOUT_MS,
    );
    const proposed = parseOptions(raw);

    // Dedup within the manifest and against everything already banked.
    const seen = new Set<string>();
    const fresh: MarketOptionCandidate[] = [];
    let cached = 0;
    for (const c of proposed) {
      const id = await optionIdentity(c.executor_statement, c.job_statement);
      if (seen.has(id)) continue;
      seen.add(id);
      if (banked.has(id)) { cached++; continue; } // frozen verdict — never re-judged
      fresh.push(c);
    }
    return { ok: true, plan: { candidates: fresh, fresh: fresh.length, cached, gen_calls: 1 } };
  }

  // ── REVISE: ONE rewrite cycle per rejected attempt-1 option. 14b ONLY. ─────
  // Zero judge calls, zero writes — returns a manifest the driver feeds back to
  // the judge chunk. Keeping this its own phase preserves model-phase batching:
  // plan and revise are the 14b phases, every chunk is 70b-only, so a model
  // swap happens once per phase instead of once per candidate.
  if (args.revise) {
    const { data: rejRows } = await args.supabase
      .from("market_options")
      .select("id, executor_statement, job_statement, status, attempt, rejected_criterion, criterion_executor_reason, criterion_odi_form_reason, criterion_solution_agnostic_reason")
      .eq("company_id", args.companyId)
      .eq("status", "rejected")
      .eq("attempt", 1)
      .eq("criteria_version", MO1_CRITERIA_VERSION);
    const rejected = (rejRows ?? []) as Array<Record<string, unknown>>;

    // One rewrite per original: skip any that already has a revision.
    const { data: revRows } = await args.supabase
      .from("market_options")
      .select("revision_of")
      .eq("company_id", args.companyId)
      .eq("attempt", 2)
      .eq("criteria_version", MO1_CRITERIA_VERSION);
    const alreadyRevised = new Set(
      ((revRows ?? []) as Array<{ revision_of: string | null }>).map((r) => String(r.revision_of ?? "")),
    );

    const revisions: MarketOptionCandidate[] = [];
    let genCalls = 0;
    let skipped = 0;
    for (const r of rejected) {
      const originalId = String(r.id);
      if (alreadyRevised.has(originalId)) { skipped++; continue; }
      const criterion = String(r.rejected_criterion ?? "");
      const reason = criterion === "executor_group"
        ? String(r.criterion_executor_reason ?? "")
        : criterion === "odi_form"
        ? String(r.criterion_odi_form_reason ?? "")
        : String(r.criterion_solution_agnostic_reason ?? "");
      const raw = await callOllamaJson(
        args.ollamaUrl,
        genModel,
        REVISE_SYSTEM,
        buildReviseUser(String(r.executor_statement), String(r.job_statement), criterion, reason),
        GEN_TIMEOUT_MS,
      );
      genCalls++;
      const rev = parseRevision(raw);
      const identity = await optionIdentity(rev.executor_statement, rev.job_statement);
      // A revision identical to something already judged is a frozen verdict —
      // don't spend judge calls re-deciding it.
      if (banked.has(identity)) { skipped++; continue; }
      revisions.push({ ...rev, revision_of: originalId });
    }
    return { ok: true, plan: { candidates: revisions, fresh: revisions.length, cached: skipped, gen_calls: genCalls } };
  }

  // ── SCOPED CHUNK: judge the given candidates, bank verdicts INLINE. ─────────
  if (args.candidates && args.candidates.length > 0) {
    const totals = { considered: 0, cached: 0, written_candidates: 0, written_rejections: 0, terminal: 0, judge_calls: 0, gen_calls: 0 };
    const results: Array<Record<string, unknown>> = [];

    for (const cand of args.candidates) {
      totals.considered++;
      const identity = await optionIdentity(cand.executor_statement, cand.job_statement);

      // FREEZE-ON-REJECT / dedup: a banked verdict is final. Zero model calls.
      if (banked.has(identity)) {
        totals.cached++;
        totals.terminal++;
        results.push({ executor_statement: cand.executor_statement, job_statement: cand.job_statement, outcome: `cached_${banked.get(identity)}` });
        continue;
      }

      let passExec: boolean | null = null, reasonExec = "";
      let passForm: boolean | null = null, reasonForm = "";
      let passSol: boolean | null = null, reasonSol = "";
      let rejected: Criterion | null = null;

      // (1) executor is a group of people.
      {
        const raw = await callOllamaJson(args.ollamaUrl, judgeModel, EXECUTOR_GROUP_SYSTEM, buildExecutorGroupUser(cand.executor_statement), JUDGE_TIMEOUT_MS);
        const v = parseBool(raw, "is_group_of_people", "executor-group judge");
        totals.judge_calls++;
        passExec = v.value; reasonExec = v.reason;
        if (!v.value) rejected = "executor_group";
      }

      // (2) verb + object + contextual clarifier. Short-circuits on (1).
      if (!rejected) {
        const raw = await callOllamaJson(args.ollamaUrl, judgeModel, ODI_FORM_SYSTEM, buildOdiFormUser(cand.job_statement), JUDGE_TIMEOUT_MS);
        const v = parseBool(raw, "odi_form", "odi-form judge");
        totals.judge_calls++;
        passForm = v.value; reasonForm = v.reason;
        if (!v.value) rejected = "odi_form";
      }

      // (3) solution-agnostic — TWO parts, both must pass. Part A is the
      // EXISTING judge (imported, not copied): is the job free of THIS
      // company's solution. Part B is MO-1's extension: is it free of ANY
      // named offering, provider, or purchase act. Part A alone lets
      // "Select a residential treatment provider ..." through — proven live.
      if (!rejected) {
        const rawA = await callOllamaJson(args.ollamaUrl, judgeModel, SOLUTION_AGNOSTIC_SYSTEM, buildSolutionAgnosticUser(companyName, cand.executor_statement, cand.job_statement), JUDGE_TIMEOUT_MS);
        const a = parseBool(rawA, "solution_free", "solution-agnostic judge");
        totals.judge_calls++;
        if (!a.value) {
          passSol = false;
          reasonSol = `company-solution: ${a.reason}`;
          rejected = "solution_agnostic";
        } else {
          const rawB = await callOllamaJson(args.ollamaUrl, judgeModel, NO_OFFERING_SYSTEM, buildNoOfferingUser(cand.job_statement), JUDGE_TIMEOUT_MS);
          const b = parseBool(rawB, "offering_free", "no-offering judge");
          totals.judge_calls++;
          passSol = b.value;
          reasonSol = b.value
            ? `company-solution: ${a.reason} | offering-free: ${b.reason}`
            : `offering/purchase-act: ${b.reason}`;
          if (!b.value) rejected = "solution_agnostic";
        }
      }

      const status = rejected ? "rejected" : "candidate";
      if (write) {
        const { error } = await args.supabase.from("market_options").insert({
          company_id: args.companyId,
          executor_statement: cand.executor_statement,
          job_statement: cand.job_statement,
          basis: cand.basis ?? null,
          status,
          criterion_executor_group: passExec,
          criterion_executor_reason: reasonExec || null,
          criterion_odi_form: passForm,
          criterion_odi_form_reason: reasonForm || null,
          criterion_solution_agnostic: passSol,
          criterion_solution_agnostic_reason: reasonSol || null,
          rejected_criterion: rejected,
          content_identity: identity,
          criteria_version: MO1_CRITERIA_VERSION,
          attempt: cand.revision_of ? 2 : 1,
          revision_of: cand.revision_of ?? null,
          gen_model: genModel,
          judge_model: judgeModel,
          run_id: args.runId ?? null,
          created_at: args.nowIso,
        });
        // UNIQUE(company_id, content_identity) is the loud backstop; a concurrent
        // duplicate is benign (same frozen verdict), anything else throws.
        if (error && !String(error.message ?? "").includes("duplicate")) {
          throw new Error(`market-options insert failed: ${error.message}`);
        }
      }
      banked.set(identity, status);
      if (status === "candidate") totals.written_candidates++; else totals.written_rejections++;
      // LEDGER ACCOUNTING: target_count counts OPTIONS to decide, not model
      // rounds. An attempt-1 rejection is NOT terminal — its revision is still
      // owed, and counting it here would overshoot target by the number of
      // refinement cycles. Terminal = passed first time, or judged at attempt 2,
      // or already frozen in the cache.
      const isTerminal = status === "candidate" || cand.revision_of != null;
      if (isTerminal) totals.terminal++;

      results.push({
        executor_statement: cand.executor_statement,
        job_statement: cand.job_statement,
        attempt: cand.revision_of ? 2 : 1,
        revision_of: cand.revision_of ?? null,
        status,
        rejected_criterion: rejected,
        criteria: {
          executor_group: { pass: passExec, reason: reasonExec },
          odi_form: { pass: passForm, reason: reasonForm },
          solution_agnostic: { pass: passSol, reason: reasonSol },
        },
      });
    }
    return { ok: true, scoped: true, totals, results };
  }

  // ── FINALIZE: census only. No prune — candidates and rejections share the
  // table, so a rejection is never orphaned from its option content. ──────────
  const { data: allRows } = await args.supabase
    .from("market_options")
    .select("id, executor_statement, job_statement, status, rejected_criterion, attempt, revision_of")
    .eq("company_id", args.companyId)
    .eq("criteria_version", MO1_CRITERIA_VERSION);
  const rows = (allRows ?? []) as Array<Record<string, unknown>>;
  return {
    ok: true,
    scoped: false,
    totals: {
      considered: rows.length,
      cached: rows.length,
      written_candidates: rows.filter((r) => r.status === "candidate").length,
      written_rejections: rows.filter((r) => r.status === "rejected").length,
      terminal: rows.length,
      judge_calls: 0,
      gen_calls: 0,
    },
    results: rows,
  };
}
