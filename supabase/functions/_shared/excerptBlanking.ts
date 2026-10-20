// ── EXCERPT BLANKING — backfill act b2 (operator ruling 2026-10-16) ──────────────────────────────
//
// THE LAW (signed 2026-10-16): claim_text may be our summary; evidence_excerpt is the page's words or
// absent. The mint guard now enforces it forward (applyMintExcerptGuard). This module brings the
// ALREADY-STORED rows in line, the way restamp-aggregator-self-voice brought voice_class in line:
// plan (zero writes), apply a REVIEWED plan (one audit row BEFORE each signal is touched), revert by
// run_ref. Mirrors planRestamp / applyRestamp / revertRestamp in aggregatorAuthorship.ts.
//
// WHICH ROWS. A live outside row (superseded_at and held_at null) with a non-empty evidence_excerpt
// and a url, whose url has at least one ok snapshot, whose excerpt is verbatim (normalizeForHash
// substring) on NONE of those snapshots, and not on its quote_source_text either — quote_source_text
// is the page or cited_text the extractor saw at mint, which the law counts as a verified basis. The
// diagnostic of 2026-10-16 measured this set at 714 rows / 301 urls / 17 companies, 64 of them analysis.
//
//   action 'blanked'       evidence_excerpt → '' ; claim_text untouched ;
//                          raw_payload.excerpt_guard := { basis:'page_snapshot', traced:false,
//                            reason:'not_on_retained_page', basis_sha, basis_at, guard_version,
//                            unverified_excerpt, backfill_run_ref }
//   action 'stamped_only'  an analysis row (voice_class='analysis'): the 2026-09-02 carve-out — OUR
//                          reading, never asserted as the page's words — is stamped with
//                          analysis_carve_out:true and its text is left alone.
//
// Rows whose excerpt is verbatim on a snapshot (93) or on quote_source_text (193) are VERIFIED and are
// never planned; rows with no snapshot at all are b4's (crawl first), never planned here.
//
// APPLY REFUSES, before any write: no reviewed plan; a plan not confirmed with the flag named in THIS
// FILE (BLANKING_APPLY_FLAG); any planned row of a frozen company; a plan whose id set or actions differ
// from a fresh re-plan of the same companies (the operator reviewed THAT plan; a drifted record is
// re-planned, not applied). Per row the current excerpt must still hash to the plan's; a drifted row is
// skipped and reported. Audit row first, signal second — an audit row exists for every changed row.
//
// Deterministic. ZERO model calls. The store is injected (supabase-js for the edge; a psql session for
// the local runner, which can wrap a whole apply + revert in one rolled-back transaction).
import { normalizeForHash, sha256Hex } from "./contentIdentity.ts";
import { FROZEN_COMPANY_IDS } from "./frozenCompanies.ts";
import { EXCERPT_GUARD_VERSION } from "./excerptVerification.ts";

/** The ONE switch that lets apply write. The runner accepts `--${BLANKING_APPLY_FLAG}` and nothing else;
 *  a caller that does not pass this exact string gets a dry run. Named here so the flag is read from
 *  source, never typed from memory. */
export const BLANKING_APPLY_FLAG = "apply-excerpt-blanking";
export const BLANKING_REASON = "not_on_retained_page" as const;
export const BLANKING_BASIS_KIND = "page_snapshot" as const;

export class BlankingRefusedError extends Error {
  status = 403;
  /** which refusal, so a guard can tell a frozen refusal from a plan-mismatch refusal */
  code: "no_plan" | "not_confirmed" | "frozen_company" | "plan_drift" | "malformed_plan";
  constructor(code: BlankingRefusedError["code"], msg: string) {
    super(msg);
    this.name = "BlankingRefusedError";
    this.code = code;
  }
}

export type BlankingCompany = { id: string; name: string; frozen: boolean };
export type BlankingSignal = {
  id: string;
  company_id: string;
  source_url: string | null;
  voice_class: string | null;
  claim_text: string | null;
  evidence_excerpt: string | null;
  quote_source_text: string | null;
  raw_payload: Record<string, unknown> | null;
};
export type BlankingSnapshot = { company_id: string; source_url: string; clean_text: string; text_sha256: string; crawled_at: string | null };
export type BlankingAuditRow = {
  id: string;
  company_id: string;
  signal_id: string;
  run_ref: string;
  action: "blanked" | "stamped_only";
  old_evidence_excerpt: string;
  old_excerpt_guard: Record<string, unknown> | null;
  new_excerpt_guard: Record<string, unknown>;
  reverted_at: string | null;
};

export type BlankingStore = {
  loadCompanies(): Promise<BlankingCompany[]>;
  /** live outside rows with a non-empty excerpt and a url, for these companies */
  loadCandidateSignals(companyIds: string[]): Promise<BlankingSignal[]>;
  /** every ok snapshot (clean_text non-null) for these (company, url) pairs */
  loadSnapshots(pairs: Array<{ company_id: string; source_url: string }>): Promise<BlankingSnapshot[]>;
  loadSignalsById(ids: string[]): Promise<BlankingSignal[]>;
  insertAudit(row: Omit<BlankingAuditRow, "id" | "reverted_at"> & { basis_kind: string; basis_sha: string; basis_at: string | null; source_url: string | null; voice_class: string | null }): Promise<string>;
  writeSignal(id: string, patch: { evidence_excerpt: string; raw_payload: Record<string, unknown> }): Promise<void>;
  loadAudit(runRef: string): Promise<BlankingAuditRow[]>;
  markReverted(auditId: string): Promise<void>;
};

export type BlankingPlanRow = {
  signal_id: string;
  company_id: string;
  company_name: string;
  action: "blanked" | "stamped_only";
  voice_class: string | null;
  source_url: string;
  /** sha256(normalizeForHash(evidence_excerpt)) at plan time — apply skips a row that moved */
  excerpt_sha: string;
  excerpt_len: number;
  basis_sha: string;
  basis_at: string | null;
  /** how many ok snapshots of the url were tested (all of them) */
  snapshots_tested: number;
};

export type BlankingPlan = {
  rows: BlankingPlanRow[];
  scanned: number;
  skipped_frozen: string[];
  verified_by_snapshot: number;
  verified_by_quote_source_text: number;
  no_snapshot: number;
  /** rows already carrying a backfill stamp from an earlier run — this act's past, never re-planned */
  already_stamped: number;
  per_company: Array<{ company_id: string; company_name: string; blanked: number; stamped_only: number; urls: number }>;
};

export function isFrozenCompany(co: BlankingCompany | undefined): boolean {
  return !!co && (co.frozen || FROZEN_COMPANY_IDS.has(co.id));
}

/** The planner's one test: is the excerpt verbatim on this basis text? */
export function verbatimOn(excerpt: string, basis: string | null | undefined): boolean {
  const e = normalizeForHash(excerpt);
  if (!e) return false;
  return normalizeForHash(String(basis ?? "")).includes(e);
}

export async function excerptSha(excerpt: string): Promise<string> {
  return await sha256Hex(normalizeForHash(excerpt));
}

/** The stamp apply writes. Pure, so the test and the guard can assert its shape. */
export function blankingStamp(args: { row: BlankingPlanRow; excerpt: string; runRef: string; at: string }): Record<string, unknown> {
  const base = {
    basis: BLANKING_BASIS_KIND, traced: false, reason: BLANKING_REASON,
    basis_sha: args.row.basis_sha, basis_at: args.row.basis_at, guard_version: EXCERPT_GUARD_VERSION,
    backfill_run_ref: args.runRef, backfill_at: args.at,
  };
  return args.row.action === "stamped_only"
    ? { ...base, analysis_carve_out: true }
    : { ...base, unverified_excerpt: args.excerpt };
}

export async function planExcerptBlanking(
  store: BlankingStore,
  opts: { companyId?: string; log?: (s: string) => void } = {},
): Promise<BlankingPlan> {
  const companies = await store.loadCompanies();
  const byId = new Map(companies.map((c) => [c.id, c]));
  if (opts.companyId) {
    const co = byId.get(opts.companyId);
    if (!co) throw new Error(`company not found: ${opts.companyId}`);
    if (isFrozenCompany(co)) throw new BlankingRefusedError("frozen_company", `blanking refused: company ${co.name} (${co.id}) is frozen`);
  }
  const skippedFrozen = companies.filter(isFrozenCompany).map((c) => c.id);
  const scope = (opts.companyId ? [byId.get(opts.companyId)!] : companies).filter((c) => !isFrozenCompany(c));
  const signals = await store.loadCandidateSignals(scope.map((c) => c.id));
  const pairs = [...new Map(signals.map((s) => [`${s.company_id}|${s.source_url}`, { company_id: s.company_id, source_url: String(s.source_url) }])).values()];
  const snaps = await store.loadSnapshots(pairs);
  const snapsByPair = new Map<string, BlankingSnapshot[]>();
  for (const sn of snaps) {
    const k = `${sn.company_id}|${sn.source_url}`;
    const a = snapsByPair.get(k) ?? [];
    a.push(sn);
    snapsByPair.set(k, a);
  }
  const rows: BlankingPlanRow[] = [];
  let verifiedSnap = 0, verifiedQst = 0, noSnap = 0, alreadyStamped = 0;
  for (const s of signals) {
    const co = byId.get(s.company_id);
    if (!co || isFrozenCompany(co)) continue; // belt-and-braces
    const excerpt = String(s.evidence_excerpt ?? "");
    if (!normalizeForHash(excerpt)) continue;
    // ALREADY HANDLED BY A RUN (found by the guard's first post-apply run, 2026-10-16): a stamped_only
    // analysis row keeps its excerpt, so without this it was re-planned after the fleet apply and a
    // second apply would have stamped it twice. A row carrying a backfill stamp is this act's past, not
    // its plan; revert removes the stamp and the row becomes plannable again.
    const guard = (s.raw_payload as Record<string, unknown> | null)?.excerpt_guard as Record<string, unknown> | undefined;
    if (guard && typeof guard.backfill_run_ref === "string" && guard.backfill_run_ref) { alreadyStamped++; continue; }
    const list = snapsByPair.get(`${s.company_id}|${s.source_url}`) ?? [];
    if (list.length === 0) { noSnap++; continue; }                       // b4's rows: crawl first
    if (list.some((sn) => verbatimOn(excerpt, sn.clean_text))) { verifiedSnap++; continue; }
    if (verbatimOn(excerpt, s.quote_source_text)) { verifiedQst++; continue; }
    const newest = [...list].sort((a, b) => String(b.crawled_at ?? "").localeCompare(String(a.crawled_at ?? "")))[0];
    const action = s.voice_class === "analysis" ? "stamped_only" : "blanked";
    rows.push({
      signal_id: s.id, company_id: s.company_id, company_name: co.name, action, voice_class: s.voice_class,
      source_url: String(s.source_url), excerpt_sha: await excerptSha(excerpt), excerpt_len: excerpt.length,
      basis_sha: newest.text_sha256, basis_at: newest.crawled_at, snapshots_tested: list.length,
    });
    opts.log?.(`${co.name} ${s.id.slice(0, 8)} ${action} (${list.length} snapshot${list.length === 1 ? "" : "s"} tested)`);
  }
  const per = new Map<string, { company_id: string; company_name: string; blanked: number; stamped_only: number; urls: Set<string> }>();
  for (const r of rows) {
    const p = per.get(r.company_id) ?? { company_id: r.company_id, company_name: r.company_name, blanked: 0, stamped_only: 0, urls: new Set<string>() };
    p[r.action]++;
    p.urls.add(r.source_url);
    per.set(r.company_id, p);
  }
  return {
    rows, scanned: signals.length, skipped_frozen: skippedFrozen,
    verified_by_snapshot: verifiedSnap, verified_by_quote_source_text: verifiedQst, no_snapshot: noSnap, already_stamped: alreadyStamped,
    per_company: [...per.values()].map((p) => ({ company_id: p.company_id, company_name: p.company_name, blanked: p.blanked, stamped_only: p.stamped_only, urls: p.urls.size }))
      .sort((a, b) => (b.blanked + b.stamped_only) - (a.blanked + a.stamped_only)),
  };
}

/** Plan rows compared by id AND action. Returns the differences; empty ⇒ the same plan. */
export function planDiff(reviewed: readonly BlankingPlanRow[], fresh: readonly BlankingPlanRow[]): { missing_in_fresh: string[]; new_in_fresh: string[]; action_changed: string[] } {
  const r = new Map(reviewed.map((x) => [x.signal_id, x.action]));
  const f = new Map(fresh.map((x) => [x.signal_id, x.action]));
  return {
    missing_in_fresh: [...r.keys()].filter((id) => !f.has(id)).sort(),
    new_in_fresh: [...f.keys()].filter((id) => !r.has(id)).sort(),
    action_changed: [...r.keys()].filter((id) => f.has(id) && f.get(id) !== r.get(id)).sort(),
  };
}

export type BlankingApplyResult = {
  run_ref: string;
  blanked: number;
  stamped_only: number;
  audit_rows: number;
  skipped: Array<{ signal_id: string; reason: string }>;
};

/** Apply the REVIEWED plan. See the header for every refusal. */
export async function applyExcerptBlanking(
  store: BlankingStore,
  opts: { plan: BlankingPlanRow[]; confirm: string; runRef?: string; now?: () => string; log?: (s: string) => void },
): Promise<BlankingApplyResult> {
  if (!Array.isArray(opts.plan) || opts.plan.length === 0) throw new BlankingRefusedError("no_plan", "apply refused: a non-empty REVIEWED plan (from a dry run) is required");
  if (opts.confirm !== BLANKING_APPLY_FLAG) throw new BlankingRefusedError("not_confirmed", `apply refused: confirm with the flag named in excerptBlanking.ts (BLANKING_APPLY_FLAG)`);
  for (const p of opts.plan) {
    if (!p || typeof p.signal_id !== "string" || (p.action !== "blanked" && p.action !== "stamped_only") || typeof p.excerpt_sha !== "string" || typeof p.company_id !== "string") {
      throw new BlankingRefusedError("malformed_plan", `apply refused: malformed plan row ${JSON.stringify(p).slice(0, 160)}`);
    }
  }
  const companies = await store.loadCompanies();
  const coById = new Map(companies.map((c) => [c.id, c]));
  // FROZEN GUARD — before ANY write, on the plan's own company ids and on the rows as stored.
  const signals = await store.loadSignalsById(opts.plan.map((p) => p.signal_id));
  const byId = new Map(signals.map((s) => [s.id, s]));
  for (const p of opts.plan) {
    const cid = byId.get(p.signal_id)?.company_id ?? p.company_id;
    const co = coById.get(cid) ?? { id: cid, name: cid, frozen: false };
    if (isFrozenCompany(co)) throw new BlankingRefusedError("frozen_company", `apply refused: planned row ${p.signal_id} belongs to frozen company ${co.name}`);
  }
  // RE-PLAN — the plan the operator reviewed must still be the plan the record yields, by id and action.
  const fresh: BlankingPlanRow[] = [];
  for (const cid of new Set(opts.plan.map((p) => p.company_id))) fresh.push(...(await planExcerptBlanking(store, { companyId: cid })).rows);
  const d = planDiff(opts.plan, fresh);
  if (d.missing_in_fresh.length || d.new_in_fresh.length || d.action_changed.length) {
    throw new BlankingRefusedError("plan_drift", `apply refused: the reviewed plan differs from a re-plan — missing_in_fresh=${d.missing_in_fresh.length} new_in_fresh=${d.new_in_fresh.length} action_changed=${d.action_changed.length}; re-plan and review again`);
  }
  const runRef = opts.runRef ?? crypto.randomUUID();
  const now = opts.now ?? (() => new Date().toISOString());
  const out: BlankingApplyResult = { run_ref: runRef, blanked: 0, stamped_only: 0, audit_rows: 0, skipped: [] };
  for (const p of opts.plan) {
    const s = byId.get(p.signal_id);
    if (!s) { out.skipped.push({ signal_id: p.signal_id, reason: "signal not found" }); continue; }
    const excerpt = String(s.evidence_excerpt ?? "");
    if ((await excerptSha(excerpt)) !== p.excerpt_sha) { out.skipped.push({ signal_id: p.signal_id, reason: "drifted: the excerpt changed since the plan" }); continue; }
    const rp = (s.raw_payload && typeof s.raw_payload === "object" ? s.raw_payload : {}) as Record<string, unknown>;
    const oldGuard = rp.excerpt_guard && typeof rp.excerpt_guard === "object" ? (rp.excerpt_guard as Record<string, unknown>) : null;
    const at = now();
    const stamp = blankingStamp({ row: p, excerpt, runRef, at });
    // AUDIT FIRST. The audit row is the reversal record; a signal is never touched without one.
    await store.insertAudit({
      company_id: s.company_id, signal_id: s.id, run_ref: runRef, action: p.action,
      old_evidence_excerpt: excerpt, old_excerpt_guard: oldGuard, new_excerpt_guard: stamp,
      basis_kind: BLANKING_BASIS_KIND, basis_sha: p.basis_sha, basis_at: p.basis_at, source_url: s.source_url, voice_class: s.voice_class,
    });
    out.audit_rows++;
    await store.writeSignal(s.id, {
      evidence_excerpt: p.action === "blanked" ? "" : excerpt,
      raw_payload: { ...rp, excerpt_guard: stamp },
    });
    out[p.action]++;
    opts.log?.(`${p.action} ${s.id}`);
  }
  return out;
}

/** Reverse one run by run_ref: restore old_evidence_excerpt and old_excerpt_guard on every un-reverted
 *  audit row whose signal still carries this run's stamp; mark each audit row reverted. The audit row is
 *  never deleted. Frozen refusal before any write. */
export async function revertExcerptBlanking(
  store: BlankingStore,
  opts: { runRef: string; now?: () => string; log?: (s: string) => void },
): Promise<{ run_ref: string; reverted: number; skipped: Array<{ signal_id: string; reason: string }> }> {
  const audit = (await store.loadAudit(opts.runRef)).filter((a) => !a.reverted_at);
  const companies = await store.loadCompanies();
  const coById = new Map(companies.map((c) => [c.id, c]));
  for (const a of audit) {
    if (isFrozenCompany(coById.get(a.company_id))) throw new BlankingRefusedError("frozen_company", `revert refused: ${a.signal_id} belongs to a frozen company`);
  }
  const signals = await store.loadSignalsById(audit.map((a) => a.signal_id));
  const byId = new Map(signals.map((s) => [s.id, s]));
  const now = opts.now ?? (() => new Date().toISOString());
  let reverted = 0;
  const skipped: Array<{ signal_id: string; reason: string }> = [];
  for (const a of audit) {
    const s = byId.get(a.signal_id);
    if (!s) { skipped.push({ signal_id: a.signal_id, reason: "signal not found" }); continue; }
    const rp = (s.raw_payload && typeof s.raw_payload === "object" ? s.raw_payload : {}) as Record<string, unknown>;
    const g = rp.excerpt_guard as Record<string, unknown> | undefined;
    if (!g || g.backfill_run_ref !== opts.runRef) { skipped.push({ signal_id: a.signal_id, reason: "drifted since blanking: the row no longer carries this run's stamp" }); continue; }
    const { excerpt_guard: _drop, ...rest } = rp;
    const restored: Record<string, unknown> = a.old_excerpt_guard ? { ...rest, excerpt_guard: a.old_excerpt_guard } : rest;
    await store.writeSignal(s.id, {
      evidence_excerpt: a.old_evidence_excerpt,
      raw_payload: { ...restored, excerpt_blanking_reverted: { run_ref: opts.runRef, at: now() } },
    });
    await store.markReverted(a.id);
    reverted++;
    opts.log?.(`reverted ${s.id}`);
  }
  return { run_ref: opts.runRef, reverted, skipped };
}

// ── supabase-backed store (the edge / PostgREST path) ────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
type SupabaseLike = { from: (t: string) => any };
const SIGNAL_COLS = "id, company_id, source_url, voice_class, claim_text, evidence_excerpt, quote_source_text, raw_payload";
const PAGE = 1000;
const ID_IN_CHUNK = 200;
/** urls are long; an `.in()` of 200 of them overflows the GET query string (measured 2026-10-16). */
const URL_IN_CHUNK = 25;

async function pageAll<T>(build: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export function makeSupabaseBlankingStore(supabase: SupabaseLike): BlankingStore {
  return {
    async loadCompanies() {
      const { data, error } = await supabase.from("companies").select("id, name, frozen, fixture_hold");
      if (error) throw new Error(`companies read failed: ${error.message}`);
      // R40: a held company (fixture_hold non-null) is outside every sweep
      return ((data ?? []) as Array<{ id: string; name: string; frozen: boolean | null; fixture_hold?: string | null }>).filter((c) => !c.fixture_hold).map((c) => ({ id: c.id, name: c.name, frozen: !!c.frozen }));
    },
    async loadCandidateSignals(companyIds) {
      const rows: BlankingSignal[] = [];
      for (let i = 0; i < companyIds.length; i += ID_IN_CHUNK) {
        const chunk = companyIds.slice(i, i + ID_IN_CHUNK);
        rows.push(...await pageAll<BlankingSignal>((from, to) =>
          supabase.from("signals").select(SIGNAL_COLS).in("company_id", chunk).eq("signal_band", "outside")
            .is("superseded_at", null).is("held_at", null).neq("evidence_excerpt", "").not("source_url", "is", null)
            .order("created_at", { ascending: true }).order("id", { ascending: true }).range(from, to)));
      }
      return rows.filter((s) => normalizeForHash(String(s.evidence_excerpt ?? "")) && String(s.source_url ?? "").trim());
    },
    async loadSnapshots(pairs) {
      const out: BlankingSnapshot[] = [];
      const urls = [...new Set(pairs.map((p) => p.source_url))];
      const wanted = new Set(pairs.map((p) => `${p.company_id}|${p.source_url}`));
      for (let i = 0; i < urls.length; i += URL_IN_CHUNK) {
        const slice = urls.slice(i, i + URL_IN_CHUNK);
        const { data, error } = await supabase.from("outside_page_snapshots")
          .select("company_id, source_url, clean_text, text_sha256, crawled_at").eq("fetch_status", "ok").not("clean_text", "is", null).in("source_url", slice);
        if (error) throw new Error(`snapshot read failed (${slice.length} urls): ${error.message}`);
        for (const r of ((data ?? []) as BlankingSnapshot[])) if (wanted.has(`${r.company_id}|${r.source_url}`)) out.push(r);
      }
      return out;
    },
    async loadSignalsById(ids) {
      const rows: BlankingSignal[] = [];
      for (let i = 0; i < ids.length; i += ID_IN_CHUNK) {
        const { data, error } = await supabase.from("signals").select(SIGNAL_COLS).in("id", ids.slice(i, i + ID_IN_CHUNK));
        if (error) throw new Error(`signals read failed: ${error.message}`);
        rows.push(...((data ?? []) as BlankingSignal[]));
      }
      return rows;
    },
    async insertAudit(row) {
      const { data, error } = await supabase.from("signal_excerpt_blankings").insert(row).select("id").single();
      if (error) throw new Error(`audit insert failed: ${error.message}`);
      return String((data as { id: string }).id);
    },
    async writeSignal(id, patch) {
      const { error } = await supabase.from("signals").update(patch).eq("id", id);
      if (error) throw new Error(`signal write failed: ${error.message}`);
    },
    async loadAudit(runRef) {
      const { data, error } = await supabase.from("signal_excerpt_blankings").select("id, company_id, signal_id, run_ref, action, old_evidence_excerpt, old_excerpt_guard, new_excerpt_guard, reverted_at").eq("run_ref", runRef).order("applied_at", { ascending: true });
      if (error) throw new Error(`audit read failed: ${error.message}`);
      return (data ?? []) as BlankingAuditRow[];
    },
    async markReverted(auditId) {
      const { error } = await supabase.from("signal_excerpt_blankings").update({ reverted_at: new Date().toISOString() }).eq("id", auditId);
      if (error) throw new Error(`audit mark failed: ${error.message}`);
    },
  };
}
