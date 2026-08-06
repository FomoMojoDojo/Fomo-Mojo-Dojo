// INT-3 — claim-delta synthesis core: the internal-declared vs public-observed
// comparison (the product's founding signal), computed per company.
//
// Three-stage pairing (operator-signed design):
//   1. LEXICAL PREFILTER — deterministic shared-token floor produces candidate
//      declared×public pairs (scoreClaimToNeedMatch precedent).
//   2. qwen2.5:14b-instruct PROPOSES a pair verdict; llama3:70b JUDGES it
//      (judge-only law). judge-confident ⇒ pairing_basis='judge_confirmed';
//      judge-uncertain ⇒ 'inferred' (rendered visibly labeled — tri-state law);
//      judge-rejected ⇒ no pair.
//   3. OPERATOR override persists in claim_deltas.operator_disposition —
//      'rejected_pairing' rows are tombstones this core NEVER re-proposes.
//
// Delta taxonomy (minimal honest set): echoed / divergent (judged pairs),
// publicly_silent (declared with no echo — an OPEN QUESTION, absence ≠
// contradiction), internally_silent (market speaks, nothing declared).
// NO auto-reconciliation of any kind.
//
// Evidence law: every row is keyed by content_identity (hash of the normalized
// statements) — recompute keeps identical rows and every operator disposition;
// only new/orphaned identities generate work. Stale non-tombstone rows are
// deleted (their claims changed or were pruned).
//
// CH-2a persistence timing: PAIR rows (echoed/divergent) are written INLINE,
// the moment their judge verdict lands — a killed run banks its verdicts and
// the next run's identity cache skips them (true convergence, not just
// completed-run convergence). SILENCE rows and the stale-sweep remain
// end-of-run: both need full-company pairing knowledge.
//
// CH-2b-1 scoping + plan: `declaredIds` (presence-gated) narrows the DECLARED
// side of the pairing loop — a scoped run writes PAIR ROWS ONLY and runs
// neither the silence loops nor the stale-sweep, because both need
// full-company pairing knowledge (a scoped sweep would delete every other
// claim's rows). The guard is STRUCTURAL: the same parameter that narrows the
// iteration disables the sweep, so they cannot disagree — and it is
// presence-based, not coverage-based (ids covering 100% of declared claims
// still write pairs only; a full run is requested by OMITTING the param).
// `plan` returns the chunk-packing manifest (per-declared-claim candidate
// counts) BEFORE the model stage: zero model calls, zero writes. The manifest
// carries counts and claim ids only — never a hash (PCT-1: callers must never
// need normalizeForHash). The unscoped run doubles as the FINALIZE pass after
// chunked runs: every chunk-written pair identity hits the kept path, so the
// sweep's producedIdentities is complete and nothing chunk-written is swept.
//
// NEG-CACHE (operator-signed 2026-07-12, closes F1): model rejections now
// persist to claim_delta_rejections, identity-keyed, FREEZE-ON-REJECT — the
// first verdict binds, exactly like positive verdicts; no TTL, models stored
// as provenance only. Cached rejections skip BOTH model calls and leave the
// paired sets untouched (the claims stay on their silence rails, unchanged
// semantics). Scoped runs write VERDICT rows (pairs + rejections — the signed
// law amendment) but still never silences/sweep/prune. The finalize owns the
// rejection ORPHAN-PRUNE: rows whose identity is no longer a candidate
// (claims changed/removed/struck) are deleted with full-company knowledge.
// Content change self-invalidates the cache (new statement ⇒ new identity ⇒
// miss); operator rejected_pairing tombstones are a separate, permanent,
// prune-exempt mechanism in claim_deltas and are checked FIRST.
//
// OPTION B (structural): this module compares INTERNAL content and can only
// speak to a local Ollama endpoint passed in by its caller — there is no
// external-API import in this file and never may be. require_model discipline:
// a failed or unparseable model call THROWS and aborts the run loudly — no
// template fallback, no synthesized verdicts, no silent degradation.

import { normalizeForHash, sha256Hex } from "./contentIdentity.ts";
import { FROZEN_COMPANY_IDS } from "./stepConditionsSynthesis.ts";

const DEFAULT_GEN_MODEL = "qwen2.5:14b-instruct";
const DEFAULT_JUDGE_MODEL = "llama3:70b";
const GEN_TIMEOUT_MS = 180_000;
const JUDGE_TIMEOUT_MS = 180_000;

// Prefilter floor: the prefilter's ONLY job is to skip zero-overlap pairs —
// subject-match judgment belongs to the models (14b propose + 70b judge), not
// to token counting. A floor of 2 proved too aggressive on real data: FMD's
// public tagline ("Counterintuitive strategies…") shares exactly one meaningful
// token with the declared identity statements, and the expected divergence
// never reached the judge.
const PREFILTER_MIN_SHARED_TOKENS = 1;

export type DeltaClaim = {
  id: string;
  statement: string;
  topic: string | null;
  provenance: "internal_declared" | "public_observed" | "client_attested";
};

export type ComputedDelta = {
  delta_type: "echoed" | "divergent" | "publicly_silent" | "internally_silent";
  declared_claim_id: string | null;
  public_claim_id: string | null;
  pairing_basis: "judge_confirmed" | "inferred";
  judge_reason: string | null;
  content_identity: string;
  declared_statement?: string;
  public_statement?: string;
};

export type DeltaRunResult =
  | {
      ok: true;
      // CH-2b-1 (design-gate F4): a scoped (pairs-only) result self-marks so a
      // partial can never be misread as a full-run result. In scoped runs the
      // silence totals are structurally 0 and rows_deleted is structurally 0.
      scoped: boolean;
      deltas: ComputedDelta[];
      totals: {
        declared: number; public: number; candidates: number;
        pairs_confirmed: number; pairs_inferred: number; pairs_rejected: number;
        publicly_silent: number; internally_silent: number;
        rows_new: number; rows_kept: number; rows_deleted: number; tombstones_respected: number;
        // NEG-CACHE: candidates skipped via a banked rejection (no model call),
        // and orphaned rejection rows deleted by this finalize (0 when scoped).
        rejections_cached: number; rejections_pruned: number;
        // SPAN GATE: pairs left UNJUDGED because the judge's span was not in the OBSERVED
        // text (or absent) — a mechanical failure, NOT a verdict. NEVER written (no rejection,
        // no pair), so the pair stays revisitable and asserts neither echo nor no-echo.
        spans_unjudged: number;
        // SELF-VOICE EXCLUSION: public_observed claims dropped from the observed side because
        // their source signal is the company's own voice (voice_class='client_voice') — the
        // company's own words cannot count as the market confirming it. The claim ROW is
        // untouched; only its participation in this run's pairing is removed.
        self_voice_excluded: number;
      };
    }
  | { ok: false; skipped: "frozen_company" | "no_declared_claims" }
  | { ok: false; error: string };

// CH-2b-1 plan manifest: per-declared-claim candidate accounting the client
// packs chunks from. candidates_fresh = total − cached − tombstoned − rejected
// = the MODEL-WORK count. NEG-CACHE: candidates_rejected counts banked model
// rejections (single bucket — the proposer/judge split lives in the table,
// not the manifest); they cost nothing and re-propose never (freeze-on-reject).
export type DeltaPlanClaim = {
  declared_claim_id: string;
  candidates_total: number;
  candidates_cached: number;
  candidates_tombstoned: number;
  candidates_rejected: number;
  candidates_fresh: number;
};

export type DeltaPlanResult =
  | {
      ok: true;
      plan: true;
      declared_total: number;
      public_total: number;
      claims: DeltaPlanClaim[];
      fresh_total: number;
      rejected_total: number;
    }
  | { ok: false; skipped: "frozen_company" | "no_declared_claims" }
  | { ok: false; error: string };

export type DeltaComputeArgs = {
  supabase: { from: (t: string) => any };
  companyId: string;
  ollamaUrl: string;
  nowIso: string;
  genModel?: string;
  judgeModel?: string;
  write: boolean;
  // CH-2b-1: presence-gated scoping. Non-empty ⇒ pair ONLY these declared
  // claims (against ALL publics) and write pair rows only — no silences, no
  // sweep. Absent/undefined ⇒ full run (the finalize pass). Never pass [].
  declaredIds?: string[];
  // CH-2b-1: plan mode — return the packing manifest before the model stage.
  plan?: boolean;
};

// ── Identity keys (evidence law) ──────────────────────────────────────────────

export async function pairIdentity(declaredStatement: string, publicStatement: string): Promise<string> {
  return await sha256Hex(`pair|${normalizeForHash(declaredStatement)}|${normalizeForHash(publicStatement)}`);
}

export async function silenceIdentity(
  type: "publicly_silent" | "internally_silent",
  statement: string,
): Promise<string> {
  return await sha256Hex(`${type}|${normalizeForHash(statement)}`);
}

// ── Stage 1: lexical prefilter ────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is",
  "are", "was", "be", "by", "as", "at", "that", "this", "it", "its", "their",
  "they", "we", "our", "you", "your", "not", "no", "but", "from", "have", "has",
]);

function meaningfulTokens(text: string): Set<string> {
  return new Set(
    normalizeForHash(text)
      .split(/[^a-z0-9]+/)
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

// ── Local Ollama call (native /api/chat, JSON) — sibling-module pattern ───────

// Determinism knob for the authoritative judge call (temperature 0 + fixed seed):
// a re-judge of the same pair under the same criterion returns the same verdict.
// The proposer stays at its default sampling (this is opt-in per call).
const JUDGE_DETERMINISM = { temperature: 0, seed: 42 } as const;

async function callOllamaJson(
  ollamaUrl: string,
  model: string,
  system: string,
  user: string,
  timeoutMs: number,
  optionOverrides?: { temperature?: number; seed?: number },
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
        options: { num_ctx: 8192, temperature: 0.2, ...optionOverrides },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: ctrl.signal,
    });
    // require_model: any transport failure is a LOUD abort, never a fallback.
    if (!resp.ok) throw new Error(`claim-delta model call failed: HTTP ${resp.status} (${model})`);
    const data = await resp.json().catch(() => ({}));
    const content = String((data as { message?: { content?: unknown } })?.message?.content ?? "");
    if (!content) throw new Error(`claim-delta model call returned empty content (${model})`);
    return content;
  } finally {
    clearTimeout(t);
  }
}

// ── Stage 2a: 14b pair proposal ───────────────────────────────────────────────

const PROPOSE_SYSTEM =
  "You compare ONE internally-DECLARED strategy statement with ONE publicly-OBSERVED statement about the same company. " +
  "Decide whether the OBSERVED statement speaks to the SPECIFIC assertion the declared statement makes — not merely the shared topic. " +
  "Shared subject matter, shared buzzwords, or general theme overlap are NOT sufficient: an observed statement that would equally confirm many unrelated declared claims is NOT an echo of any of them. " +
  "If (and only if) it speaks to the specific assertion, decide whether the public statement ECHOES the declared intent (consistent with it) or DIVERGES from it (contradicts or materially mis-states it). " +
  "Never invent facts. Never force a match. " +
  'JSON only: {"same_subject":true|false,"relation":"echo"|"divergent"|null,"reason":"<one short clause citing words from BOTH statements when same_subject>"}.';

// ── Stage 2b: 70b judge (judge-only law) ──────────────────────────────────────

// SPAN GATE (design gate CLOSED): the loose criterion returned echo on mere
// shared subject matter — generic observed lines confirmed everything, and those
// verdicts freeze by content identity. The judge must now cite a VERBATIM span of
// the OBSERVED statement that carries the specific confirmation/contradiction, and
// verifyObservedSpan() checks in CODE that the span is a real substring of the
// observed text and clears the minimum. No valid span ⇒ NOT a pairing, whatever
// the judge concluded. Prompt wording alone is not the fix; the structural check is.
const JUDGE_SYSTEM =
  "You are a strict reviewer of a proposed pairing between an internally-DECLARED strategy statement and a publicly-OBSERVED statement. " +
  "Criteria: (i) SPECIFIC — the OBSERVED statement must speak to the SPECIFIC assertion the declared statement makes, not merely a shared topic; shared buzzwords or general theme overlap are NOT sufficient; an observed statement that would equally confirm many unrelated declared claims is NOT an echo of any of them; " +
  "(ii) RELATION — 'echo' means the public statement is consistent with the declared intent; 'divergent' means it contradicts or materially mis-states it; " +
  "(iii) SPAN — you MUST copy, VERBATIM, a span of words FROM THE OBSERVED STATEMENT that carries the confirmation or contradiction; the span must be text that actually appears in the OBSERVED statement (not the declared one, not a paraphrase). If no such specific span exists, there is no pairing: return relation null; " +
  "(iv) CONFIDENT — true only when the subject match and relation are unambiguous. " +
  "Reject vibes-pairings. Never force a match. " +
  'JSON only: {"same_subject":true|false,"relation":"echo"|"divergent"|null,"confident":true|false,"span":"<verbatim words copied from the OBSERVED statement>","reason":"<one short clause>"}.';

// STRUCTURAL SPAN VERIFICATION (in code, not the prompt). The judge's span must be
// a real substring of the OBSERVED text. Normalization: lowercase (case-fold ON —
// the model may re-case sentence-initial words when copying) + collapse internal
// whitespace + trim, applied to BOTH sides; then a plain substring test. The
// observed text is byte-identical at judge time and verify time (same in-memory
// claims.statement passed to buildPairUser and to this check), so this is an exact
// containment test modulo trivial reformatting — never a fuzzy/semantic match.
// MINIMUM: a span of "the" or "care" verifies structurally and proves nothing, so a
// span must be >= MIN_SPAN_CHARS characters AND >= MIN_SPAN_TOKENS whitespace tokens
// (after normalization). Chosen so the specific "crisis stabilization" echo clears
// it (20 chars / 2 tokens) while single generic words cannot.
export const MIN_SPAN_CHARS = 8;
export const MIN_SPAN_TOKENS = 2;

const normalizeSpan = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();

// The span check has TWO distinct failure modes, and collapsing them was the defect this
// gate corrects:
//   • not_in_observed / no_span — the judge concluded a relation but cited text that is NOT in
//     the OBSERVED statement (typically copied from the DECLARED side) or cited nothing. This is
//     a MECHANICAL FAILURE: the machine did not answer the question we asked. It is NOT evidence
//     of "no echo" and must never be banked as a rejection (which freezes by content identity).
//   • below_minimum — the judge cited a REAL observed span that is too short/generic to ground a
//     specific echo (< MIN_SPAN_CHARS or < MIN_SPAN_TOKENS). This IS a substantive not-an-echo
//     verdict — the genericness threshold — and is banked exactly as before.
export type SpanVerdict = "valid" | "below_minimum" | "not_in_observed" | "no_span";

export function classifyObservedSpan(span: string | undefined, observed: string): SpanVerdict {
  if (!span) return "no_span";
  const nSpan = normalizeSpan(span);
  if (nSpan.length < MIN_SPAN_CHARS || nSpan.split(" ").filter(Boolean).length < MIN_SPAN_TOKENS) return "below_minimum";
  return normalizeSpan(observed).includes(nSpan) ? "valid" : "not_in_observed";
}

// Kept as the boolean predicate for callers that only need admit/reject (e.g. a harness).
export function verifyObservedSpan(span: string | undefined, observed: string): boolean {
  return classifyObservedSpan(span, observed) === "valid";
}

function buildPairUser(declared: string, publicStmt: string): string {
  return `DECLARED (internal, authoritative about intent): ${declared}\nOBSERVED (public): ${publicStmt}\nAre these the same subject, and if so does the public statement echo or diverge from the declared intent?`;
}

// require_model parsing: unparseable output throws — no defaults, no fallback.
function parseVerdict(raw: string, who: string): { same_subject: boolean; relation: "echo" | "divergent" | null; confident?: boolean; span?: string; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`claim-delta ${who} output unparseable (strict): ${raw.slice(0, 140)}`);
  }
  const p = parsed as Record<string, unknown>;
  if (typeof p.same_subject !== "boolean") {
    throw new Error(`claim-delta ${who} output missing same_subject (strict): ${raw.slice(0, 140)}`);
  }
  const relation = p.relation === "echo" || p.relation === "divergent" ? p.relation : null;
  return {
    same_subject: p.same_subject,
    relation,
    confident: typeof p.confident === "boolean" ? p.confident : undefined,
    // The judge's verbatim OBSERVED span (structurally verified before a pair is
    // banked). Optional in the parser so the proposer output — which carries no
    // span — parses unchanged; the gate below enforces it on the judge stage.
    span: typeof p.span === "string" ? p.span : undefined,
    reason: String(p.reason ?? "").trim(),
  };
}

// ── Company-level compute ─────────────────────────────────────────────────────

export async function computeDeltasForCompany(args: DeltaComputeArgs & { plan: true }): Promise<DeltaPlanResult>;
export async function computeDeltasForCompany(args: DeltaComputeArgs & { plan?: false | undefined }): Promise<DeltaRunResult>;
export async function computeDeltasForCompany(args: DeltaComputeArgs): Promise<DeltaRunResult | DeltaPlanResult> {
  // Frozen fixtures are never computed for, let alone written (CB1 stale by law).
  if (FROZEN_COMPANY_IDS.has(args.companyId)) return { ok: false, skipped: "frozen_company" };

  const genModel = args.genModel ?? DEFAULT_GEN_MODEL;
  const judgeModel = args.judgeModel ?? DEFAULT_JUDGE_MODEL;

  const { data: claimRows, error: claimsErr } = await args.supabase
    .from("claims")
    .select("id, statement, topic, provenance, status")
    .eq("company_id", args.companyId);
  if (claimsErr) return { ok: false, error: String(claimsErr.message ?? claimsErr) };

  // Strike law (Gate A): struck claims are excluded from pairing entirely —
  // their existing pair/silence rows go stale and the write phase deletes them
  // (rejected_pairing tombstones persist by design). Minimized claims keep
  // participating. JS-side filter so the fake-db unit tests can exercise it.
  const claims = ((claimRows ?? []) as Array<DeltaClaim & { status?: string }>).filter(
    (c) => c.status !== "struck",
  );
  // Declared side = the client-side corpus: operator-uploaded (internal_declared)
  // PLUS room-attested First Read corrections (client_attested, FR-D1). Both are
  // "things the client declared"; the observed side stays public_observed only.
  const declared = claims.filter(
    (c) => c.provenance === "internal_declared" || c.provenance === "client_attested",
  );
  const publicsAll = claims.filter((c) => c.provenance === "public_observed");
  if (declared.length === 0) return { ok: false, skipped: "no_declared_claims" };

  // ── SELF-VOICE EXCLUSION (operator ruling, Stage 1) ───────────────────────────
  // A public_observed claim whose SOURCE signal is the company's own voice
  // (voice_class='client_voice') is the company's own website/marketing returning as a
  // "public" claim — NOT the market. Echo-matching it against the company's DECLARATIONS
  // scored the same voice on both sides as market confirmation (all six Edgewood false
  // echoes were client_voice from edgewood.org; both genuine echoes were outside_voice).
  // Exclude it from the observed side entirely: it produces NO echo, NO divergence, and NO
  // internally_silent (it is not the market speaking). A declared claim whose only candidate
  // was self-voice therefore falls to publicly_silent — "we haven't found this repeated",
  // which is now TRUE. The claim ROW and any existing deltas are UNTOUCHED and fully
  // queryable; only its participation in THIS run's pairing is removed (future compute only).
  // NULL/unknown voice is NOT excluded — only the positively-identified 'client_voice'; a NULL
  // row that is actually self-voice would keep a false echo (surfaced to the operator; Stage-2
  // review catches it) rather than convert an unclassified row into a false absence.
  const { data: sigRows } = await args.supabase
    .from("signals").select("id, voice_class").eq("company_id", args.companyId);
  const selfSignalIds = new Set(
    ((sigRows ?? []) as Array<{ id: string; voice_class: string | null }>)
      .filter((s) => s.voice_class === "client_voice").map((s) => s.id),
  );
  const selfVoiceClaimIds = new Set<string>();
  if (selfSignalIds.size > 0) {
    const { data: refRows } = await args.supabase
      .from("claim_signal_refs").select("claim_id, signal_id").eq("company_id", args.companyId);
    for (const r of ((refRows ?? []) as Array<{ claim_id: string; signal_id: string }>)) {
      if (selfSignalIds.has(r.signal_id)) selfVoiceClaimIds.add(r.claim_id);
    }
  }
  const publics = publicsAll.filter((c) => !selfVoiceClaimIds.has(c.id));
  const selfVoiceExcluded = publicsAll.length - publics.length;

  // Existing rows: identity → row. Tombstones ('rejected_pairing') are never
  // re-proposed; all other existing identities are kept verbatim (no re-roll).
  const { data: existingRows } = await args.supabase
    .from("claim_deltas")
    .select("id, content_identity, delta_type, operator_disposition")
    .eq("company_id", args.companyId);
  type ExistingRow = { id: string; content_identity: string; delta_type: string; operator_disposition: string | null };
  const existing = new Map<string, ExistingRow>(
    ((existingRows ?? []) as ExistingRow[]).map((r) => [r.content_identity, r]),
  );
  const tombstones = new Set(
    [...existing.values()].filter((r) => r.operator_disposition === "rejected_pairing").map((r) => r.content_identity),
  );

  // NEG-CACHE: banked model rejections, identity → row id (freeze-on-reject).
  // Loaded company-wide like `existing` so scoped chunks see prior banks. The
  // id is kept for the finalize's orphan-prune; rows banked THIS run enter the
  // set with a placeholder id — their identities are candidates by
  // construction, so they are never prune targets in the run that banked them.
  const { data: rejRows } = await args.supabase
    .from("claim_delta_rejections")
    .select("id, content_identity")
    .eq("company_id", args.companyId);
  type RejRow = { id: string; content_identity: string };
  const loadedRejections = (rejRows ?? []) as RejRow[];
  const rejectionByIdentity = new Map<string, string>(loadedRejections.map((r) => [r.content_identity, r.id]));

  // CH-2b-1: mode is PRESENCE-GATED on declaredIds — the same parameter that
  // narrows the iteration disables the silence loops and the sweep below, so
  // they cannot disagree. Presence-based, NOT coverage-based: ids covering
  // every declared claim still write pairs only. Scoping narrows the DECLARED
  // side only — publics and existing rows stay company-wide (each chunk pairs
  // against ALL publics and sees prior chunks' inline rows via the kept path).
  // The struck filter ran above, before this subset is taken — a scoped run
  // cannot select a struck claim.
  const scoped = Array.isArray(args.declaredIds) && args.declaredIds.length > 0;
  const declaredIdSet = scoped ? new Set(args.declaredIds) : null;
  const declaredScope = declaredIdSet ? declared.filter((d) => declaredIdSet.has(d.id)) : declared;

  // CH-2b-1 PLAN MODE: prefilter + identity classification only — the manifest
  // the client packs chunks from. Returns HERE, before the model stage: zero
  // model calls and zero writes by construction (args.write is never read on
  // this path; the first callOllamaJson below is unreachable). Counts and
  // claim ids only — no hash/identity ever leaves the core (PCT-1).
  if (args.plan) {
    const planClaims: DeltaPlanClaim[] = [];
    let freshTotal = 0, rejectedTotal = 0;
    for (const d of declaredScope) {
      let total = 0, cached = 0, tombstoned = 0, rejected = 0;
      for (const p of publics) {
        if (sharedTokenCount(d.statement, p.statement) < PREFILTER_MIN_SHARED_TOKENS) continue;
        total++;
        const identity = await pairIdentity(d.statement, p.statement);
        // Classification order (signed): tombstoned → cached → rejected → fresh.
        if (tombstones.has(identity)) { tombstoned++; continue; }
        const kept = existing.get(identity);
        if (kept && (kept.delta_type === "echoed" || kept.delta_type === "divergent")) { cached++; continue; }
        if (rejectionByIdentity.has(identity)) rejected++;
      }
      const fresh = total - cached - tombstoned - rejected;
      freshTotal += fresh;
      rejectedTotal += rejected;
      planClaims.push({
        declared_claim_id: d.id,
        candidates_total: total,
        candidates_cached: cached,
        candidates_tombstoned: tombstoned,
        candidates_rejected: rejected,
        candidates_fresh: fresh,
      });
    }
    return {
      ok: true,
      plan: true,
      declared_total: declared.length,
      public_total: publics.length,
      claims: planClaims,
      fresh_total: freshTotal,
      rejected_total: rejectedTotal,
    };
  }

  const totals = {
    declared: declaredScope.length, public: publics.length, candidates: 0,
    pairs_confirmed: 0, pairs_inferred: 0, pairs_rejected: 0,
    publicly_silent: 0, internally_silent: 0,
    rows_new: 0, rows_kept: 0, rows_deleted: 0, tombstones_respected: 0,
    rejections_cached: 0, rejections_pruned: 0,
    spans_unjudged: 0,
    self_voice_excluded: selfVoiceExcluded,
  };

  // NEG-CACHE: every identity that survives the prefilter THIS run — the
  // finalize's orphan-prune keeps exactly these and deletes the rest. Only a
  // full run populates the complete set, which is why the prune (like the
  // sweep) is gated on !scoped below.
  const candidateIdentities = new Set<string>();

  // NEG-CACHE: bank a model rejection the moment it lands (CH-2a discipline —
  // a killed run keeps its rejections). Insert-only, identity-keyed; the map
  // add makes an intra-run identity re-encounter (two claim pairs sharing
  // statement text) a no-op, and the table's UNIQUE(company_id,
  // content_identity) is the loud backstop.
  const bankRejection = async (
    d: DeltaClaim, p: DeltaClaim, identity: string,
    rejectedBy: "proposer" | "judge", judgeModelUsed: string | null, reason: string,
  ) => {
    if (!args.write || rejectionByIdentity.has(identity)) return;
    const { error: rejErr } = await args.supabase.from("claim_delta_rejections").insert({
      company_id: args.companyId,
      declared_claim_id: d.id,
      public_claim_id: p.id,
      content_identity: identity,
      rejected_by: rejectedBy,
      gen_model: genModel,
      judge_model: judgeModelUsed,
      reject_reason: reason || null,
      computed_at: args.nowIso,
    });
    if (rejErr) throw new Error(`claim-delta rejection insert failed: ${rejErr.message}`);
    rejectionByIdentity.set(identity, "");
  };

  const deltas: ComputedDelta[] = [];
  const pairedDeclared = new Set<string>();
  const pairedPublic = new Set<string>();
  // Identities produced THIS run (fresh + kept-verbatim) — anything existing
  // outside this set (except tombstones) is stale and deleted on write.
  const keptPairIdentities = new Set<string>();
  // CH-2a: identities whose pair row was inserted INLINE this run — the
  // end-of-run write must not insert them again, and an intra-run re-encounter
  // of the same identity (possible only when two claim pairs share identical
  // statement text — identity hashes statements, not ids) must not double-insert.
  const insertedThisRun = new Set<string>();

  for (const d of declaredScope) {
    for (const p of publics) {
      if (sharedTokenCount(d.statement, p.statement) < PREFILTER_MIN_SHARED_TOKENS) continue;
      totals.candidates++;
      const identity = await pairIdentity(d.statement, p.statement);
      candidateIdentities.add(identity);

      if (tombstones.has(identity)) {
        // Operator said "not a pair" — respected forever; both claims fall
        // through to their silence rails below.
        totals.tombstones_respected++;
        continue;
      }

      const kept = existing.get(identity);
      if (kept && (kept.delta_type === "echoed" || kept.delta_type === "divergent")) {
        // Identity unchanged ⇒ statements unchanged ⇒ verdict stands (no re-roll).
        pairedDeclared.add(d.id);
        pairedPublic.add(p.id);
        keptPairIdentities.add(identity);
        continue;
      }

      // NEG-CACHE: a banked rejection is a frozen verdict — skip BOTH model
      // calls. Deliberately does NOT touch pairedDeclared/pairedPublic: the
      // claims stay on their silence rails, exactly as a live rejection would
      // leave them.
      if (rejectionByIdentity.has(identity)) {
        totals.rejections_cached++;
        continue;
      }

      // Stage 2a: 14b proposes.
      const proposedRaw = await callOllamaJson(args.ollamaUrl, genModel, PROPOSE_SYSTEM, buildPairUser(d.statement, p.statement), GEN_TIMEOUT_MS);
      const proposed = parseVerdict(proposedRaw, "proposer");
      if (!proposed.same_subject || !proposed.relation) {
        totals.pairs_rejected++;
        await bankRejection(d, p, identity, "proposer", null, proposed.reason);
        continue;
      }

      // Stage 2b: 70b judges. Deterministic (temperature 0, fixed seed) so a
      // re-judge of the same pair is reproducible — the proposer keeps its own
      // options, only the authoritative judge call is pinned.
      const judgedRaw = await callOllamaJson(args.ollamaUrl, judgeModel, JUDGE_SYSTEM, buildPairUser(d.statement, p.statement), JUDGE_TIMEOUT_MS, JUDGE_DETERMINISM);
      const judged = parseVerdict(judgedRaw, "judge");
      if (!judged.same_subject || !judged.relation) {
        totals.pairs_rejected++;
        await bankRejection(d, p, identity, "judge", judgeModel, judged.reason);
        continue;
      }

      // SPAN GATE: the judge must ground the pairing in a VERBATIM span of the OBSERVED
      // statement, verified in code. Its two failure modes are NOT the same event:
      const spanVerdict = classifyObservedSpan(judged.span, p.statement);
      if (spanVerdict === "not_in_observed" || spanVerdict === "no_span") {
        // MECHANICAL FAILURE — the judge cited text not in the OBSERVED statement (or nothing).
        // We cannot verify the answer, so we record NOTHING: no rejection (which would freeze a
        // not-an-echo by content identity and be respected forever), no pair. The pair stays
        // UNJUDGED and revisitable, asserting neither echo nor no-echo. Deliberately does NOT add
        // to pairedDeclared/pairedPublic — the claims fall to their silence rails as an OPEN
        // QUESTION, which is honest (we have not confirmed an echo), and is recomputed fresh each
        // run rather than frozen. A deterministic re-ask (temp 0, seed 42) returns the identical
        // wrong span, so a plain retry is pointless — recording it unjudged is the only honest move.
        totals.spans_unjudged++;
        continue;
      }
      if (spanVerdict === "below_minimum") {
        // SUBSTANTIVE — the judge cited a REAL observed span too short/generic to ground a
        // specific echo (the genericness threshold). This is a not-an-echo verdict, banked as
        // before (frozen), exactly as a relation-null rejection would be.
        totals.pairs_rejected++;
        await bankRejection(
          d, p, identity, "judge", judgeModel,
          `span gate: span below minimum ("${judged.span?.slice(0, 60) ?? ""}") — ${judged.reason}`.slice(0, 400),
        );
        continue;
      }
      // spanVerdict === "valid" — the span is a real substring of the OBSERVED statement.

      const basis: ComputedDelta["pairing_basis"] = judged.confident === true ? "judge_confirmed" : "inferred";
      if (basis === "judge_confirmed") totals.pairs_confirmed++; else totals.pairs_inferred++;
      pairedDeclared.add(d.id);
      pairedPublic.add(p.id);
      const pairRow: ComputedDelta = {
        delta_type: judged.relation === "echo" ? "echoed" : "divergent",
        declared_claim_id: d.id,
        public_claim_id: p.id,
        pairing_basis: basis,
        judge_reason: judged.reason || proposed.reason || null,
        content_identity: identity,
        declared_statement: d.statement,
        public_statement: p.statement,
      };
      deltas.push(pairRow);

      // CH-2a: INLINE PAIR PERSISTENCE — bank the verdict the moment it exists.
      // The old end-of-run-only write meant an isolate kill persisted NOTHING,
      // so a company whose full compute exceeds the wall-clock made zero
      // progress per invocation, forever ("convergence" only held across
      // COMPLETED runs). A pair row needs no full-company knowledge (its fields
      // are the two claims + the verdict), so it is written here, identity-keyed
      // and insert-only. SILENCES and the STALE-SWEEP stay end-of-run below —
      // both require knowing every pairing. A run that dies mid-loop leaves a
      // valid table: some pairs present, no silences yet, no sweep yet — the
      // next run's identity cache skips the banked pairs and finishes the rest.
      if (args.write && !existing.has(identity) && !insertedThisRun.has(identity)) {
        const { error: insErr } = await args.supabase.from("claim_deltas").insert({
          company_id: args.companyId,
          declared_claim_id: pairRow.declared_claim_id,
          public_claim_id: pairRow.public_claim_id,
          delta_type: pairRow.delta_type,
          pairing_basis: pairRow.pairing_basis,
          judge_reason: pairRow.judge_reason,
          content_identity: pairRow.content_identity,
          computed_at: args.nowIso,
        });
        if (insErr) throw new Error(`claim-delta inline insert failed: ${insErr.message}`);
        insertedThisRun.add(identity);
        totals.rows_new++;
      }
    }
  }

  // CH-2b-1 STRUCTURAL GUARD: silences AND the end-of-run write/sweep need
  // FULL-COMPANY pairing knowledge — a scoped run computes neither. A scoped
  // sweep would delete every other claim's rows (the design-gate danger case);
  // gating the whole block on !scoped makes that state unrepresentable.
  if (!scoped) {
    // Silences — absence ≠ contradiction: publicly_silent renders as OPEN QUESTION.
    for (const d of declared) {
      if (pairedDeclared.has(d.id)) continue;
      totals.publicly_silent++;
      deltas.push({
        delta_type: "publicly_silent",
        declared_claim_id: d.id,
        public_claim_id: null,
        pairing_basis: "judge_confirmed", // deterministic finding, not an inference
        judge_reason: null,
        content_identity: await silenceIdentity("publicly_silent", d.statement),
        declared_statement: d.statement,
      });
    }
    for (const p of publics) {
      if (pairedPublic.has(p.id)) continue;
      totals.internally_silent++;
      deltas.push({
        delta_type: "internally_silent",
        declared_claim_id: null,
        public_claim_id: p.id,
        pairing_basis: "judge_confirmed",
        judge_reason: null,
        content_identity: await silenceIdentity("internally_silent", p.statement),
        declared_statement: undefined,
        public_statement: p.statement,
      });
    }
  }

  if (args.write && !scoped) {
    const producedIdentities = new Set([...deltas.map((x) => x.content_identity), ...keptPairIdentities]);
    // Insert only NEW identities — existing rows (and their dispositions) stand.
    // Pair rows were inserted INLINE at verdict time (CH-2a) and are skipped
    // here; what remains fresh at end-of-run is the silence rows.
    const fresh = deltas.filter((x) => !existing.has(x.content_identity) && !insertedThisRun.has(x.content_identity));
    for (const row of fresh) {
      const { error: insErr } = await args.supabase.from("claim_deltas").insert({
        company_id: args.companyId,
        declared_claim_id: row.declared_claim_id,
        public_claim_id: row.public_claim_id,
        delta_type: row.delta_type,
        pairing_basis: row.pairing_basis,
        judge_reason: row.judge_reason,
        content_identity: row.content_identity,
        computed_at: args.nowIso,
      });
      if (insErr) throw new Error(`claim-delta insert failed: ${insErr.message}`);
      totals.rows_new++;
    }
    // Delete stale non-tombstone rows (their claims changed/pruned/got paired).
    const stale = [...existing.values()].filter(
      (r) => !producedIdentities.has(r.content_identity) && r.operator_disposition !== "rejected_pairing",
    );
    if (stale.length > 0) {
      const { error: delErr } = await args.supabase
        .from("claim_deltas")
        .delete()
        .in("id", stale.map((r) => r.id));
      if (delErr) throw new Error(`claim-delta stale-delete failed: ${delErr.message}`);
      totals.rows_deleted = stale.length;
    }
    totals.rows_kept = [...existing.values()].filter(
      (r) => producedIdentities.has(r.content_identity) || r.operator_disposition === "rejected_pairing",
    ).length;

    // NEG-CACHE ORPHAN-PRUNE (finalize-owned, mirrors the sweep): a loaded
    // rejection whose identity is no longer a candidate means its claims
    // changed, were removed, or were struck — the cache row is dead weight and
    // is deleted. Rows banked THIS run carry candidate identities by
    // construction and are untouched. Operator tombstones live in claim_deltas
    // and are not in scope here at all. Content change needs no prune to
    // invalidate (new identity ⇒ cache miss); this is purely hygiene.
    const orphanRejections = loadedRejections.filter((r) => !candidateIdentities.has(r.content_identity));
    if (orphanRejections.length > 0) {
      const { error: pruneErr } = await args.supabase
        .from("claim_delta_rejections")
        .delete()
        .in("id", orphanRejections.map((r) => r.id));
      if (pruneErr) throw new Error(`claim-delta rejection prune failed: ${pruneErr.message}`);
      totals.rejections_pruned = orphanRejections.length;
    }
  }

  return { ok: true, scoped, deltas, totals };
}
