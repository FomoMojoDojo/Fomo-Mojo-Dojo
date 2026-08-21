// ── signalRecurrence ──────────────────────────────────────────────────────────
//
// CV-2d-1: the CONSISTENT computation — does the same fact about this company
// recur across INDEPENDENT outside sources? (Design signed 2026-07-14.)
//
// Hybrid mechanism:
//   Stage 1 (deterministic, auditable): candidate pairs = same company, outside
//     band, both third-party (registrable domain ≠ own), non-syndicated,
//     DIFFERENT registrable domains, and ≥ RECURRENCE_MIN_SHARED_TOKENS shared
//     meaningful tokens. candidate_basis records the trigger.
//   Stage 2 (70b judge — judge duty is 70b-only; this pipeline has NO 14b
//     generation stage at all): pairwise "same underlying fact about THIS
//     company?" verdict, banked INLINE per pair (accepted|rejected + verbatim
//     reason), frozen by order-normalized pair identity, never re-rolled.
//
// Canonical run shape (chunk-run-finalize):
//   plan:true  → manifest only (candidate pairs classified frozen/fresh; ids +
//                counts only, no hashes leave the core; zero model calls/writes)
//   pairs:[..] → scoped judge chunk (inline banking; nothing else touched)
//   neither    → unscoped FINALIZE: prune orphaned verdicts (statement identity
//                no longer present), union-find over accepted verdicts,
//                reconcile finding_recurrence in place (update-on-change /
//                insert / delete — a no-change rerun is byte-identical
//                INCLUDING computed_at).

import { normalizeForHash, sha256Hex } from "./contentIdentity.ts";
import { FROZEN_COMPANY_IDS } from "./stepConditionsSynthesis.ts";
import { signalProvenance } from "../../../src/lib/modelRouter/resolveModel.ts";
import type { RoutedJudge } from "./modelRouter.ts";

export const DEFAULT_JUDGE_MODEL = "llama3:70b";
export const JUDGE_TIMEOUT_MS = 180_000;

// TUNING (measured 2026-07-14 on the two known real clusters, CV-2d-1):
// genuine cross-host same-fact pairs are heavy paraphrase — Jaccard 0.02–0.08,
// 1–2 shared meaningful tokens ("one-person advisory practice" vs "solo-scale"
// share exactly one: "solo") — while unrelated pairs reach J≈0.29. NO higher
// floor separates them: sharedTokens≥2 drops the FMD solo cluster's only
// eligible cross-domain pair entirely. So the prefilter floor is the loosest
// lexical anchor (≥1 shared meaningful token; measured volume FMD 32 / EDGE 208
// candidate pairs) and PRECISION IS THE JUDGE'S JOB — that is the point of the
// hybrid. Shared-topic as an OR-basis was REJECTED: signals.topic is band-level
// ("market" covers half the band) and would admit nearly every pair.
export const RECURRENCE_MIN_SHARED_TOKENS = 1;

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is",
  "are", "was", "be", "by", "as", "at", "that", "this", "it", "its", "their",
  "they", "we", "our", "you", "your", "not", "no", "but", "from", "have", "has",
]);

function meaningfulTokens(text: string): Set<string> {
  return new Set(
    String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter((t) => t.length > 2 && !STOP_WORDS.has(t)),
  );
}

export function sharedTokenCount(a: string, b: string): number {
  const ta = meaningfulTokens(a);
  const tb = meaningfulTokens(b);
  let n = 0;
  for (const t of ta) if (tb.has(t)) n++;
  return n;
}

// Registrable domain (independence unit, design Q3). Approximation: last two
// labels, or three when the TLD is a common two-part suffix. Mirrors the
// own-domain conventions of CV-1/2c; full PSL resolution is out of scope.
const TWO_PART_TLDS = new Set(["co.uk", "com.au", "co.nz", "co.jp", "com.br", "co.in", "org.uk", "ac.uk"]);
export function registrableDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url.includes("://") ? url : `https://${url}`).hostname.toLowerCase();
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "");
  const labels = host.split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".") || null;
  const lastTwo = labels.slice(-2).join(".");
  return TWO_PART_TLDS.has(lastTwo) ? labels.slice(-3).join(".") : lastTwo;
}

// Order-normalized pair identity — A·B ≡ B·A. normalizeForHash (contentIdentity)
// is the single hashing authority; punctuation preserved by design.
export async function recurrencePairIdentity(a: string, b: string): Promise<string> {
  const na = normalizeForHash(a);
  const nb = normalizeForHash(b);
  const [x, y] = na <= nb ? [na, nb] : [nb, na];
  return await sha256Hex(`recur|${x}|${y}`);
}

// ── 70b judge ─────────────────────────────────────────────────────────────────

// The single authority for the same-fact criterion (CV-2d-2a). Shared verbatim
// by the signal↔signal judge and the finding↔cluster judge (R1) so the rule can
// never drift between the two join paths. R2 (operator ruling 2026-07-14): the
// negative examples target the two observed weak-accept failure modes on FMD
// ("both mention <company> as a company" / "both mention <location>").
export const SAME_FACT_CRITERION =
  "Criteria: (i) both must state substantially the same specific fact — a shared theme, industry pattern, or buzzword overlap is NOT the same fact; " +
  "(ii) generic industry commentary that is not specifically about this company is NEVER the same fact as a company-specific statement; " +
  "(iii) different facets of a broad theme (e.g. pay level vs turnover vs management style) are DIFFERENT facts. " +
  "NEGATIVE EXAMPLES — none of these is the same fact on its own: " +
  "merely sharing the company name is NOT the same fact; " +
  "merely sharing a location (city, region, headquarters) is NOT the same fact; " +
  "merely sharing an industry, sector, or theme is NOT the same fact. " +
  "Never force a match.";

const JUDGE_SYSTEM =
  "You compare TWO statements gathered from independent public sources about the same company. " +
  "Decide whether they assert the SAME underlying fact about THIS company. " +
  SAME_FACT_CRITERION + " " +
  'JSON only: {"same_fact":true|false,"reason":"<one short clause citing words from BOTH statements>"}.';

// R1 (CV-2d-2b): the finding↔cluster join judge. Same criterion authority,
// adapted framing — a finding is a synthesized second-person statement, the
// cluster member is source-gathered text.
const FINDING_JOIN_SYSTEM =
  "You compare a FINDING (a synthesized statement about a company, written in the second person) " +
  "with ONE statement gathered from a public source about the same company. " +
  "Decide whether they assert the SAME underlying fact about THIS company. " +
  SAME_FACT_CRITERION + " " +
  'JSON only: {"same_fact":true|false,"reason":"<one short clause citing words from BOTH statements>"}.';

function buildFindingJoinUser(companyName: string, findingStatement: string, signalStatement: string): string {
  return `COMPANY: ${companyName}\nFINDING: ${findingStatement}\nPUBLIC STATEMENT: ${signalStatement}\nDo the finding and the public statement assert the same underlying fact about ${companyName}?`;
}

function buildJudgeUser(companyName: string, a: string, b: string): string {
  return `COMPANY: ${companyName}\nSTATEMENT A: ${a}\nSTATEMENT B: ${b}\nDo A and B assert the same underlying fact about ${companyName}?`;
}

export async function callOllamaJson(
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
    // require_model: any transport failure is a LOUD abort, never a fallback.
    if (!resp.ok) throw new Error(`signal-recurrence judge call failed: HTTP ${resp.status} (${model})`);
    const data = await resp.json().catch(() => ({}));
    const content = String((data as { message?: { content?: unknown } })?.message?.content ?? "");
    if (!content) throw new Error(`signal-recurrence judge returned empty content (${model})`);
    return content;
  } finally {
    clearTimeout(t);
  }
}

// require_model parsing: unparseable output throws — no defaults, no fallback.
function parseJudgeVerdict(raw: string): { same_fact: boolean; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`signal-recurrence judge output unparseable (strict): ${raw.slice(0, 140)}`);
  }
  const p = parsed as Record<string, unknown>;
  if (typeof p.same_fact !== "boolean") {
    throw new Error(`signal-recurrence judge output missing same_fact (strict): ${raw.slice(0, 140)}`);
  }
  return { same_fact: p.same_fact, reason: String(p.reason ?? "").trim() };
}

// ── Types ─────────────────────────────────────────────────────────────────────

type EligibleSignal = { id: string; claim_text: string; url: string; domain: string; identity: string; provenance: string | null };

export type RecurrenceComputeArgs = {
  supabase: { from: (t: string) => any };
  companyId: string;
  ollamaUrl: string;
  nowIso: string;
  judgeModel?: string;
  write: boolean;
  pairs?: Array<{ a: string; b: string }>;
  /** Injected router judge (edge fn builds it). When present, the pair's provenances decide the
   *  model (all-public → external). When absent, the local judge below runs (back-compat). */
  routedJudge?: RoutedJudge;
};

export type RecurrencePlanPair = {
  signal_a_id: string;
  signal_b_id: string;
  status: "frozen" | "fresh";
  basis: string;
};

export type RecurrencePlanResult =
  | {
    ok: true;
    plan: true;
    candidates_total: number;
    candidates_frozen: number;
    candidates_fresh: number;
    eligible_signals: number;
    pairs: RecurrencePlanPair[];
  }
  | { ok: false; skipped: "frozen_company" }
  | { ok: false; error: string };

export type RecurrenceRunResult =
  | {
    ok: true;
    scoped: boolean;
    totals: {
      requested: number;
      judged: number;
      accepted: number;
      rejected: number;
      cached: number;
      skipped_ineligible: number;
      verdicts_pruned: number;
      clusters: number;
      finding_rows_written: number;
      finding_rows_deleted: number;
      finding_rows_unchanged: number;
      // R1 finding↔cluster join path (CV-2d-2b)
      finding_joins_via_origin: number;
      finding_joins_via_judge: number;
      finding_judge_calls: number;
      finding_pairs_cached: number;
      fc_verdicts_pruned: number;
    };
    verdicts: Array<{ signal_a_id: string; signal_b_id: string; verdict: string; reason: string }>;
  }
  | { ok: false; skipped: "frozen_company" }
  | { ok: false; error: string };

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadEligibleSignals(
  supabase: RecurrenceComputeArgs["supabase"],
  companyId: string,
): Promise<{ signals: EligibleSignal[]; companyName: string }> {
  const { data: company, error: cErr } = await supabase
    .from("companies").select("name, website").eq("id", companyId).maybeSingle();
  if (cErr) throw new Error(`companies load failed: ${cErr.message}`);
  const ownDomain = registrableDomain((company as { website?: string } | null)?.website ?? null);
  const companyName = String((company as { name?: string } | null)?.name ?? "this company");

  const { data, error } = await supabase
    .from("signals")
    .select("id, claim_text, source_url, syndicated_from_client, voice_class")
    .eq("company_id", companyId)
    .eq("signal_band", "outside");
  if (error) throw new Error(`signals load failed: ${error.message}`);

  const signals: EligibleSignal[] = [];
  for (const row of (data ?? []) as Array<{ id: string; claim_text: string; source_url: string | null; syndicated_from_client: boolean | null; voice_class: string | null }>) {
    if (row.syndicated_from_client === true) continue; // design Q3
    const domain = registrableDomain(row.source_url);
    if (!domain) continue;
    if (ownDomain && domain === ownDomain) continue; // own-domain excluded
    if (!String(row.claim_text ?? "").trim()) continue;
    signals.push({
      id: row.id,
      claim_text: row.claim_text,
      url: String(row.source_url),
      domain,
      identity: await sha256Hex(normalizeForHash(row.claim_text)),
      // Provenance for the model router: outside-band PUBLIC voices are public; analysis/NULL → local.
      provenance: signalProvenance("outside", row.voice_class),
    });
  }
  return { signals, companyName };
}

function buildCandidates(signals: EligibleSignal[]): Array<{ a: EligibleSignal; b: EligibleSignal; basis: string }> {
  const out: Array<{ a: EligibleSignal; b: EligibleSignal; basis: string }> = [];
  for (let i = 0; i < signals.length; i++) {
    for (let j = i + 1; j < signals.length; j++) {
      const a = signals[i];
      const b = signals[j];
      if (a.domain === b.domain) continue; // independence: cross-domain only
      const shared = sharedTokenCount(a.claim_text, b.claim_text);
      if (shared < RECURRENCE_MIN_SHARED_TOKENS) continue;
      out.push({ a, b, basis: `shared_tokens:${shared}` });
    }
  }
  // Deterministic order (plan stability): by id pair.
  out.sort((x, y) => (x.a.id + x.b.id).localeCompare(y.a.id + y.b.id));
  return out;
}

async function loadVerdicts(
  supabase: RecurrenceComputeArgs["supabase"],
  companyId: string,
): Promise<Array<{ id: string; pair_identity: string; statement_a_identity: string; statement_b_identity: string; verdict: string }>> {
  const { data, error } = await supabase
    .from("signal_recurrence_verdicts")
    .select("id, pair_identity, statement_a_identity, statement_b_identity, verdict")
    .eq("company_id", companyId);
  if (error) throw new Error(`verdicts load failed: ${error.message}`);
  return (data ?? []) as Array<{ id: string; pair_identity: string; statement_a_identity: string; statement_b_identity: string; verdict: string }>;
}

// ── Compute ───────────────────────────────────────────────────────────────────

export async function computeRecurrenceForCompany(args: RecurrenceComputeArgs & { plan: true }): Promise<RecurrencePlanResult>;
export async function computeRecurrenceForCompany(args: RecurrenceComputeArgs & { plan?: false | undefined }): Promise<RecurrenceRunResult>;
export async function computeRecurrenceForCompany(
  args: RecurrenceComputeArgs & { plan?: boolean },
): Promise<RecurrencePlanResult | RecurrenceRunResult> {
  if (FROZEN_COMPANY_IDS.has(args.companyId)) return { ok: false, skipped: "frozen_company" };
  const judgeModel = args.judgeModel ?? DEFAULT_JUDGE_MODEL;

  const { signals, companyName } = await loadEligibleSignals(args.supabase, args.companyId);
  const byId = new Map(signals.map((s) => [s.id, s]));
  const verdicts = await loadVerdicts(args.supabase, args.companyId);
  const verdictByIdentity = new Map(verdicts.map((v) => [v.pair_identity, v]));

  // ── PLAN: manifest only ──
  if (args.plan) {
    const candidates = buildCandidates(signals);
    const pairs: RecurrencePlanPair[] = [];
    let frozen = 0;
    for (const c of candidates) {
      const identity = await recurrencePairIdentity(c.a.claim_text, c.b.claim_text);
      const isFrozen = verdictByIdentity.has(identity);
      if (isFrozen) frozen++;
      pairs.push({
        signal_a_id: c.a.id,
        signal_b_id: c.b.id,
        status: isFrozen ? "frozen" : "fresh",
        basis: c.basis,
      });
    }
    return {
      ok: true,
      plan: true,
      candidates_total: candidates.length,
      candidates_frozen: frozen,
      candidates_fresh: candidates.length - frozen,
      eligible_signals: signals.length,
      pairs,
    };
  }

  const totals = {
    requested: 0,
    judged: 0,
    accepted: 0,
    rejected: 0,
    cached: 0,
    skipped_ineligible: 0,
    verdicts_pruned: 0,
    clusters: 0,
    finding_rows_written: 0,
    finding_rows_deleted: 0,
    finding_rows_unchanged: 0,
    finding_joins_via_origin: 0,
    finding_joins_via_judge: 0,
    finding_judge_calls: 0,
    finding_pairs_cached: 0,
    fc_verdicts_pruned: 0,
  };
  const reported: Array<{ signal_a_id: string; signal_b_id: string; verdict: string; reason: string }> = [];
  const scoped = Array.isArray(args.pairs) && args.pairs.length > 0;

  // ── SCOPED CHUNK: judge the requested pairs, inline banking, nothing else ──
  if (scoped) {
    for (const p of args.pairs!) {
      totals.requested++;
      const a = byId.get(p.a);
      const b = byId.get(p.b);
      if (!a || !b || a.domain === b.domain) {
        totals.skipped_ineligible++;
        continue;
      }
      const identity = await recurrencePairIdentity(a.claim_text, b.claim_text);
      if (verdictByIdentity.has(identity)) {
        totals.cached++;
        continue;
      }
      const jUser = buildJudgeUser(companyName, a.claim_text, b.claim_text);
      // ROUTER: the pair's two signal provenances decide the model — all-public → external judge.
      const jr = args.routedJudge
        ? await args.routedJudge({ provenances: [a.provenance, b.provenance], system: JUDGE_SYSTEM, user: jUser })
        : { content: await callOllamaJson(args.ollamaUrl, judgeModel, JUDGE_SYSTEM, jUser, JUDGE_TIMEOUT_MS), provider: "local_ollama" as const, model: judgeModel };
      const v = parseJudgeVerdict(jr.content);
      totals.judged++;
      const verdict = v.same_fact ? "accepted" : "rejected";
      if (v.same_fact) totals.accepted++;
      else totals.rejected++;
      reported.push({ signal_a_id: a.id, signal_b_id: b.id, verdict, reason: v.reason });
      if (args.write) {
        // Inline banking: the verdict is durable the moment it exists.
        const { error } = await args.supabase.from("signal_recurrence_verdicts").insert({
          company_id: args.companyId,
          pair_identity: identity,
          signal_a_id: a.id,
          signal_b_id: b.id,
          statement_a_identity: a.identity,
          statement_b_identity: b.identity,
          verdict,
          judge_model: jr.model,
          judge_reason: v.reason,
          candidate_basis: `shared_tokens:${sharedTokenCount(a.claim_text, b.claim_text)}`,
          model_provider: jr.provider,
          model_name: jr.model,
        });
        // Unique violation ⇒ a concurrent run banked it first — frozen wins.
        if (error && !String(error.message ?? "").includes("duplicate")) {
          throw new Error(`verdict insert failed: ${error.message}`);
        }
        verdictByIdentity.set(identity, {
          id: "", pair_identity: identity, statement_a_identity: a.identity, statement_b_identity: b.identity, verdict,
        });
      }
    }
    return { ok: true, scoped: true, totals, verdicts: reported };
  }

  // ── UNSCOPED FINALIZE ──
  // 1. Prune orphaned verdicts: a verdict whose statement identities are no
  //    longer both present among eligible signals is unreconstructible (text
  //    changed or signal removed) — the evidence self-invalidated.
  const currentIdentities = new Set(signals.map((s) => s.identity));
  for (const v of verdicts) {
    if (!currentIdentities.has(v.statement_a_identity) || !currentIdentities.has(v.statement_b_identity)) {
      if (args.write) {
        const { error } = await args.supabase.from("signal_recurrence_verdicts").delete().eq("id", v.id);
        if (error) throw new Error(`verdict prune failed: ${error.message}`);
      }
      totals.verdicts_pruned++;
    }
  }
  const liveVerdicts = verdicts.filter((v) =>
    currentIdentities.has(v.statement_a_identity) && currentIdentities.has(v.statement_b_identity)
  );

  // 2. Union-find over ACCEPTED verdicts, on statement-identity nodes (identity
  //    is the durable join — signal ids may churn across re-ingests).
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = x;
    while (parent.get(c) !== c) {
      const next = parent.get(c)!;
      parent.set(c, r);
      c = next;
    }
    return r;
  };
  const union = (x: string, y: string) => {
    if (!parent.has(x)) parent.set(x, x);
    if (!parent.has(y)) parent.set(y, y);
    const rx = find(x);
    const ry = find(y);
    if (rx !== ry) parent.set(rx, ry);
  };
  for (const v of liveVerdicts) {
    if (v.verdict === "accepted") union(v.statement_a_identity, v.statement_b_identity);
  }

  // 3. Clusters: identity-root → member signals (all eligible signals whose
  //    statement identity is in the accepted component).
  const clusters = new Map<string, EligibleSignal[]>();
  for (const s of signals) {
    if (!parent.has(s.identity)) continue;
    const root = find(s.identity);
    const arr = clusters.get(root) ?? [];
    arr.push(s);
    clusters.set(root, arr);
  }
  totals.clusters = clusters.size;

  // 4. Desired finding_recurrence rows — TWO join paths (R1, CV-2d-2b):
  //    PRIMARY: origin_signal_id membership (signed 2d design, unchanged).
  //    SECOND:  judge-assisted finding-statement ↔ cluster-member-statement
  //             join, verdicts frozen in finding_cluster_verdicts (sibling
  //             store — its prune invariant differs from the signal store's).
  const { data: findingRows, error: fErr } = await args.supabase
    .from("findings")
    .select("id, origin_signal_id, body, beats")
    .eq("company_id", args.companyId)
    .eq("status", "open");
  if (fErr) throw new Error(`findings load failed: ${fErr.message}`);
  type FindingRow = { id: string; origin_signal_id: string | null; body: string; beats: { observe?: string } | null };
  const openFindings = ((findingRows ?? []) as FindingRow[])
    .slice().sort((a, b) => a.id.localeCompare(b.id));
  // Finding statement = the render convention since CV-1: beats.observe ?? body.
  const findingStatement = (f: FindingRow) => String(f.beats?.observe ?? f.body ?? "").trim();

  const acceptedByPair = liveVerdicts.filter((v) => v.verdict === "accepted");
  type DesiredRow = { cluster_signal_ids: string[]; distinct_host_count: number; host_list: string[]; verdict_count: number };
  const desired = new Map<string, DesiredRow>(); // finding_id → row

  const desiredRowForRoot = (root: string): DesiredRow | null => {
    const members = (clusters.get(root) ?? []).slice().sort((a, b) => a.id.localeCompare(b.id));
    if (members.length < 2) return null;
    const hosts = [...new Set(members.map((m) => m.domain))].sort();
    const memberIdentities = new Set(members.map((m) => m.identity));
    const verdictCount = acceptedByPair.filter((v) =>
      memberIdentities.has(v.statement_a_identity) && memberIdentities.has(v.statement_b_identity)
    ).length;
    return {
      cluster_signal_ids: members.map((m) => m.id),
      distinct_host_count: hosts.length,
      host_list: hosts,
      verdict_count: verdictCount,
    };
  };

  // Pass 1 — PRIMARY join: origin_signal_id.
  for (const f of openFindings) {
    if (!f.origin_signal_id) continue;
    const origin = byId.get(f.origin_signal_id);
    if (!origin || !parent.has(origin.identity)) continue;
    const row = desiredRowForRoot(find(origin.identity));
    if (!row) continue;
    desired.set(f.id, row);
    totals.finding_joins_via_origin++;
  }

  // 4b. Load the sibling verdict store + prune with its OWN invariant:
  //     finding-side identity must exist among OPEN findings' statements,
  //     signal-side among eligible signals. (The signal store's prune would
  //     wrongly orphan every row of this family — hence the sibling table.)
  const { data: fcRows, error: fcErr } = await args.supabase
    .from("finding_cluster_verdicts")
    .select("id, pair_identity, finding_statement_identity, signal_statement_identity, verdict")
    .eq("company_id", args.companyId);
  if (fcErr) throw new Error(`finding_cluster_verdicts load failed: ${fcErr.message}`);
  type FcVerdict = { id: string; pair_identity: string; finding_statement_identity: string; signal_statement_identity: string; verdict: string };
  const findingIdentityById = new Map<string, string>();
  for (const f of openFindings) {
    const stmt = findingStatement(f);
    if (stmt) findingIdentityById.set(f.id, await sha256Hex(normalizeForHash(stmt)));
  }
  const currentFindingIdentities = new Set(findingIdentityById.values());
  const fcLive: FcVerdict[] = [];
  for (const v of (fcRows ?? []) as FcVerdict[]) {
    if (!currentFindingIdentities.has(v.finding_statement_identity) || !currentIdentities.has(v.signal_statement_identity)) {
      if (args.write) {
        const { error } = await args.supabase.from("finding_cluster_verdicts").delete().eq("id", v.id);
        if (error) throw new Error(`finding_cluster_verdicts prune failed: ${error.message}`);
      }
      totals.fc_verdicts_pruned++;
      continue;
    }
    fcLive.push(v);
  }
  const fcByIdentity = new Map(fcLive.map((v) => [v.pair_identity, v]));

  // Pass 2 — SECOND join: judge-assisted, for findings not already clustered.
  // Deterministic candidate order: clusters by root, members by id. Per member:
  // frozen accept → join (no call); frozen reject → next; unbanked → judge,
  // bank inline, join on accept. Stops at the first accepted member per
  // finding (bounded calls; resume = frozen verdicts skip, zero re-judge).
  const clusterRoots = [...clusters.keys()].sort();
  for (const f of openFindings) {
    if (desired.has(f.id)) continue;
    const stmt = findingStatement(f);
    if (!stmt) continue;
    let joined = false;
    for (const root of clusterRoots) {
      if (joined) break;
      const row = desiredRowForRoot(root);
      if (!row) continue;
      const members = (clusters.get(root) ?? []).slice().sort((a, b) => a.id.localeCompare(b.id));
      for (const m of members) {
        // Same deterministic prefilter floor as the signal-pair stage.
        const shared = sharedTokenCount(stmt, m.claim_text);
        if (shared < RECURRENCE_MIN_SHARED_TOKENS) continue;
        const identity = await recurrencePairIdentity(stmt, m.claim_text);
        const banked = fcByIdentity.get(identity);
        if (banked) {
          totals.finding_pairs_cached++;
          if (banked.verdict === "accepted") {
            desired.set(f.id, row);
            totals.finding_joins_via_judge++;
            joined = true;
            break;
          }
          continue;
        }
        const fjUser = buildFindingJoinUser(companyName, stmt, m.claim_text);
        // ROUTER: finding (public_inferred) + signal provenance decide the model.
        const fjr = args.routedJudge
          ? await args.routedJudge({ provenances: ["public_inferred", m.provenance], system: FINDING_JOIN_SYSTEM, user: fjUser })
          : { content: await callOllamaJson(args.ollamaUrl, judgeModel, FINDING_JOIN_SYSTEM, fjUser, JUDGE_TIMEOUT_MS), provider: "local_ollama" as const, model: judgeModel };
        const v = parseJudgeVerdict(fjr.content);
        totals.finding_judge_calls++;
        const verdict = v.same_fact ? "accepted" : "rejected";
        if (args.write) {
          const { error } = await args.supabase.from("finding_cluster_verdicts").insert({
            company_id: args.companyId,
            pair_identity: identity,
            finding_id: f.id,
            signal_id: m.id,
            finding_statement_identity: findingIdentityById.get(f.id),
            signal_statement_identity: m.identity,
            verdict,
            judge_model: fjr.model,
            judge_reason: v.reason,
            candidate_basis: `shared_tokens:${shared}`,
            model_provider: fjr.provider,
            model_name: fjr.model,
          });
          if (error && !String(error.message ?? "").includes("duplicate")) {
            throw new Error(`finding_cluster_verdicts insert failed: ${error.message}`);
          }
        }
        fcByIdentity.set(identity, {
          id: "", pair_identity: identity,
          finding_statement_identity: findingIdentityById.get(f.id) ?? "",
          signal_statement_identity: m.identity, verdict,
        });
        if (v.same_fact) {
          desired.set(f.id, row);
          totals.finding_joins_via_judge++;
          joined = true;
          break;
        }
      }
    }
  }

  // 5. Reconcile in place (byte-identical on no-change rerun, incl computed_at).
  const { data: existingRows, error: eErr } = await args.supabase
    .from("finding_recurrence")
    .select("finding_id, cluster_signal_ids, distinct_host_count, host_list, verdict_count")
    .eq("company_id", args.companyId);
  if (eErr) throw new Error(`finding_recurrence load failed: ${eErr.message}`);
  const existing = new Map(
    ((existingRows ?? []) as Array<{ finding_id: string; cluster_signal_ids: unknown; distinct_host_count: number; host_list: unknown; verdict_count: number }>)
      .map((r) => [r.finding_id, r]),
  );

  const canon = (r: DesiredRow) => JSON.stringify([r.cluster_signal_ids, r.distinct_host_count, r.host_list, r.verdict_count]);
  for (const [findingId, row] of desired) {
    const ex = existing.get(findingId);
    const exCanon = ex
      ? JSON.stringify([ex.cluster_signal_ids, ex.distinct_host_count, ex.host_list, ex.verdict_count])
      : null;
    if (exCanon === canon(row)) {
      totals.finding_rows_unchanged++;
      continue;
    }
    if (args.write) {
      const payload = {
        finding_id: findingId,
        company_id: args.companyId,
        cluster_signal_ids: row.cluster_signal_ids,
        distinct_host_count: row.distinct_host_count,
        host_list: row.host_list,
        verdict_count: row.verdict_count,
        computed_at: args.nowIso,
      };
      const { error } = await args.supabase.from("finding_recurrence").upsert(payload, { onConflict: "finding_id" });
      if (error) throw new Error(`finding_recurrence upsert failed: ${error.message}`);
    }
    totals.finding_rows_written++;
  }
  for (const [findingId] of existing) {
    if (desired.has(findingId)) continue;
    if (args.write) {
      const { error } = await args.supabase.from("finding_recurrence").delete().eq("finding_id", findingId);
      if (error) throw new Error(`finding_recurrence delete failed: ${error.message}`);
    }
    totals.finding_rows_deleted++;
  }

  return { ok: true, scoped: false, totals, verdicts: reported };
}
