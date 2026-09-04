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
import { listingMayCorroborate } from "./listingCorroboration.ts";
import { listingIdentityInput, type Listing } from "./listingDetect.ts";
import { isOwnDomainUrl, normalizeHost } from "./firstReadProvenance.ts";
import { FROZEN_COMPANY_IDS } from "./stepConditionsSynthesis.ts";

const DEFAULT_GEN_MODEL = "qwen2.5:14b-instruct";
const DEFAULT_JUDGE_MODEL = "llama3:70b";
export const GEN_TIMEOUT_MS = 180_000;
export const JUDGE_TIMEOUT_MS = 180_000;

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
  // PROOF GUARD (ruling 2026-08-19): proof-ladder class, orthogonal to provenance.
  // 'research_required' ⇒ excluded from pairing (only research-grade evidence can
  // answer it); NULL/absent ⇒ untyped, flows exactly as before (fail-direction law).
  claim_type?: string | null;
  proof_category?: string | null;
  // Public-side evidence class (from raw_payload.sample_signal), prompt context only.
  source_type?: string | null;
  // SELF-ECHO GATE: the page an own-words claim was read from (raw_payload.page_url) — the no-ref
  // resolution of the observed side's host when its signal refs are absent.
  page_url?: string | null;
  // ADMISSION CRITERION (2026-09-03): own_words claims carry declared_eligible; false ⇒ never the declared side.
  declared_eligible?: boolean | null;
  // LISTING CORROBORATION (2026-09-04): the declared side's judged kind — listingMayCorroborate reads it.
  statement_kind?: string | null;
  // LISTING PAIRS BY CONSTRUCTION (2026-09-04): the observed side's structured listing (raw_payload.listing).
  listing?: Listing | null;
};

export type ComputedDelta = {
  delta_type: "echoed" | "divergent" | "publicly_silent" | "internally_silent";
  declared_claim_id: string | null;
  public_claim_id: string | null;
  pairing_basis: "judge_confirmed" | "inferred" | "listing";
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
        // LISTING PAIRS BY CONSTRUCTION (2026-09-04): refused listing candidates; deterministic listing pairs formed.
        listing_corroboration_refused?: number; pairs_listing?: number;
        // SELF-ECHO GATE (2026-09-03): observed candidates refused at admission — own-host backed, and
        // (public kind) unresolvable (no refs, no page_url). Neither can corroborate; both are ledgered.
        own_host_excluded?: number; unbacked_excluded?: number;
        // ADMISSION CRITERION: own-words claims left off the declared side by kind.
        own_words_ineligible?: number;
        // SELF-VOICE EXCLUSION: public_observed claims dropped from the observed side because
        // their source signal is the company's own voice (voice_class='client_voice') — the
        // company's own words cannot count as the market confirming it. The claim ROW is
        // untouched; only its participation in this run's pairing is removed.
        self_voice_excluded: number;
        // PROOF GUARD: declared claims excluded from pairing because
        // proof_category='research_required' — public material can never answer
        // them, so they fall to publicly_silent (the true statement). A silent
        // guard is an invisible decision: the count lives here and the claim ids
        // in proof_guard_excluded_ids on the result.
        proof_guard_excluded: number;
      };
      proof_guard_excluded_ids: string[];
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
      // PROOF GUARD: guarded claims are absent from `claims` (the chunk packer
      // must never pack them); their exclusion is ledgered here.
      proof_guard_excluded: number;
      proof_guard_excluded_ids: string[];
    }
  | { ok: false; skipped: "frozen_company" | "no_declared_claims" }
  | { ok: false; error: string };

// GATE B-1 (operator ruling 2026-08-20, option a): the two delta reads live in ONE
// table, separated by pairing_kind. internal_vs_public = the founding Diagnose signal
// (declared side: internal_declared + client_attested — byte-identical behavior).
// public_vs_public = the First Read gap (declared side: the company's own PUBLIC voice —
// client-voice public claims; observed side: the market). Every state load, write,
// silence, sweep, and negative-cache row is kind-scoped, so a run of one kind is
// structurally incapable of touching the other's rows.
export type PairingKind = "internal_vs_public" | "public_vs_public";
export const PAIRING_KINDS: readonly PairingKind[] = ["internal_vs_public", "public_vs_public"];

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
  // GATE B-1: which read this run computes. Default internal_vs_public.
  pairingKind?: PairingKind;
  // ROUTER (2026-08-22): injected model caller resolved by input provenance (this file forbids
  // external imports — the edge fn builds it). Structural type, no import from modelRouter. When
  // present, the pair's [declared, observed] provenances pick the model (all-public → external;
  // internal_declared/client_attested → local, so internal_vs_public NEVER leaves the machine).
  routedCall?: (a: {
    role: "generator" | "judge";
    provenances: Array<string | null | undefined>;
    system: string;
    user: string;
  }) => Promise<{ content: string; provider: string; model: string }>;
};

// ── Identity keys (evidence law) ──────────────────────────────────────────────

// GATE B-1: the First Read gap's persisted integrity record. Written by the
// public_vs_public FINALIZE after the work (success with counts), and by the
// orchestrator's catch on a failed/skipped public finalize — so the gap beat can
// distinguish looked / not-yet / couldn't-check from a persisted row, never from
// an empty array. Reuses the existing integrity_runs pattern (useIntegrityRecord).
export const GAP_PAIRS_INTEGRITY_COMPONENT = "first_read_gap_pairs";

export async function writeGapPairsIntegrity(
  supabase: { from: (t: string) => any },
  companyId: string,
  outcome: {
    status: "completed" | "failed" | "skipped_empty_input";
    ranAtIso: string;
    examined?: number | null;
    admitted?: number | null;
    error?: string | null;
    runRef?: string | null;
    // SELF-ECHO GATE: per-rule admission counts (self_voice / own_host / unbacked), from the run totals.
    excludedByRule?: Record<string, number> | null;
  },
): Promise<void> {
  const { error } = await supabase.from("integrity_runs").insert({
    company_id: companyId,
    component: GAP_PAIRS_INTEGRITY_COMPONENT,
    surface_type: null,
    surface_id: null,
    ran_at: outcome.ranAtIso,
    status: outcome.status,
    examined: outcome.examined ?? null,
    admitted: outcome.admitted ?? null,
    excluded_by_rule: outcome.excludedByRule ?? null,
    error: outcome.error ?? null,
    run_ref: outcome.runRef ?? null,
  });
  if (error) throw new Error(`gap-pairs integrity insert failed: ${error.message}`);
}

// OPERATOR RELEVANCE OVERRIDE (operator ruling 2026-09-03): a live decision in
// claim_delta_relevance_overrides (superseded_by IS NULL, verdict relevant|orthogonal) is the
// operator's verdict on a PAIR IDENTITY. A pair row born for that identity carries the operator's
// columns from birth (never NULL, never a machine verdict) — the DB trigger apply_relevance_override
// enforces the same at the row boundary; this is the write-side courtesy so the row is honest on insert.
export type LiveRelevanceOverride = { verdict: "relevant" | "orthogonal"; reason: string; decided_at: string };
export function overrideColumnsFor(
  identity: string,
  overrides: Map<string, LiveRelevanceOverride>,
): Record<string, unknown> {
  const ov = overrides.get(identity);
  if (!ov) return {};
  return {
    relevance_verdict: ov.verdict,
    relevance_provider: "operator",
    relevance_model: "operator_override",
    relevance_reason: ov.reason,
    relevance_span: null,
    relevance_judged_at: ov.decided_at,
  };
}

/** LISTING PAIRS BY CONSTRUCTION (operator ruling 2026-09-04): identity = declared content identity + listing identity
 *  (host + product + price) — never the paraphrase text, so a re-typed title never re-keys the pair. */
export async function listingPairIdentity(declaredStatement: string, listing: Listing): Promise<string> {
  return await sha256Hex(`listingpair|${normalizeForHash(declaredStatement)}|${listingIdentityInput(listing)}`);
}
export const LISTING_PREDICATE_PROVIDER = "listing_predicate" as const;
export function listingPairReason(kind: string | null | undefined): string {
  return `listing corroborates a ${(kind ?? "untyped")} placement statement (listingMayCorroborate)`;
}

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

// Exported so the relevance backstop reuses the EXACT tokenizer that gates the
// deltas (no parallel tokenizer, no stemming) — its distinctiveOverlap must be
// computed on the same token set the prefilter/verdict reason about.
export function meaningfulTokens(text: string): Set<string> {
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
export const JUDGE_DETERMINISM = { temperature: 0, seed: 42 } as const;

export async function callOllamaJson(
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
  "(iv) CONFIDENT — true only when the subject match and relation are unambiguous; " +
  // CRITERION REV 2026-08-19 (proof-class, ruling Item c): criterion (v) added. The
  // structural control is the upstream proof-category guard — this criterion is the
  // complement, giving the judge the vocabulary to refuse class-mismatched evidence
  // that reaches it untyped.
  "(v) PROOF CLASS — the OBSERVED evidence must be of a class capable of ANSWERING the declared claim: a declared claim about missing or insufficient research or customer evidence cannot be echoed by directory listings, star ratings, reviews, or marketing material — such material is not research-grade evidence; when the evidence class cannot answer the claim, return relation null. " +
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

// PROOF GUARD Item (c) — prompt complement, belt to the guard's suspenders: the
// pair message now carries the declared claim_type and the observed evidence
// source_type so the models can weigh proof class. The HARD guard upstream is
// the sufficient control; this context only improves refusal reasons. Identity
// is unaffected (pairIdentity hashes statements only).
function buildPairUser(d: DeltaClaim, p: DeltaClaim): string {
  const dType = d.claim_type ? ` [claim_type: ${d.claim_type}]` : "";
  const pSrc = p.source_type ? ` [evidence source_type: ${p.source_type}]` : "";
  return `DECLARED (internal, authoritative about intent)${dType}: ${d.statement}\nOBSERVED (public)${pSrc}: ${p.statement}\nAre these the same subject, and if so does the public statement echo or diverge from the declared intent?`;
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
    .select("id, statement, topic, provenance, status, claim_type, proof_category, raw_payload, declared_eligible, statement_kind")
    .eq("company_id", args.companyId);
  if (claimsErr) return { ok: false, error: String(claimsErr.message ?? claimsErr) };

  // Strike law (Gate A): struck claims are excluded from pairing entirely —
  // their existing pair/silence rows go stale and the write phase deletes them
  // (rejected_pairing tombstones persist by design). Minimized claims keep
  // participating. JS-side filter so the fake-db unit tests can exercise it.
  const claims = ((claimRows ?? []) as Array<DeltaClaim & { status?: string; raw_payload?: { sample_signal?: { source_type?: unknown }; page_url?: unknown } | null }>)
    .filter((c) => c.status !== "struck")
    // Evidence class for prompt context (Item c): the sample signal's source_type.
    // Extracted here so raw_payload itself never travels further. page_url (own-words extractor) is
    // the no-ref host resolution for the observed-side admission below.
    .map((c) => ({
      ...c,
      source_type: String(c.raw_payload?.sample_signal?.source_type ?? "") || null,
      page_url: typeof c.raw_payload?.page_url === "string" ? c.raw_payload.page_url : null,
      // LISTING PAIRS: the listing block travels (structured fields only), raw_payload itself does not.
      listing: ((c.raw_payload as { listing?: Listing | null } | null | undefined)?.listing ?? null),
      raw_payload: undefined,
    }));
  const pairingKind: PairingKind = args.pairingKind ?? "internal_vs_public";
  const publicsAll = claims.filter((c) => c.provenance === "public_observed");

  // Declared side by kind (GATE B-1):
  //   internal_vs_public — the client-side corpus: operator-uploaded (internal_declared)
  //   PLUS room-attested First Read corrections (client_attested, FR-D1). Byte-identical
  //   to the pre-B1 behavior.
  //   public_vs_public — the company's own PUBLIC voice: public_observed claims backed by
  //   a client_voice signal (or a legacy NULL-voice signal on the company's own domain,
  //   same shared isOwnDomainUrl rule the stamping guard uses). 'analysis'-backed claims
  //   are EXCLUDED (our reading of the record is not the company speaking). Both sides of
  //   a public run are public_observed text, so no internal/upload/canvas content can
  //   reach the models on this path (privacy Option B holds by construction).
  // The company's own host — ONE resolution for both kinds (the declared-side voice rule below and the
  // observed-side admission), through the single shared predicate isOwnDomainUrl.
  const { data: coRow } = await args.supabase
    .from("companies").select("website").eq("id", args.companyId).maybeSingle();
  const website = (coRow as { website?: string | null } | null)?.website ?? null;
  let companyHost: string | null = null;
  if (website) {
    try {
      companyHost = normalizeHost(new URL(website.includes("://") ? website : `https://${website}`).hostname);
    } catch {
      companyHost = null;
    }
  }
  let declared: typeof claims;
  let publicVoiceDeclaredIds: Set<string> | null = null;
  let ownWordsIneligible = 0;
  if (pairingKind === "public_vs_public") {
    const { data: vSigRows } = await args.supabase
      .from("signals").select("id, voice_class, source_url").eq("company_id", args.companyId);
    const vSigs = (vSigRows ?? []) as Array<{ id: string; voice_class: string | null; source_url: string | null }>;
    const ownVoiceSigIds = new Set(
      vSigs.filter((s) =>
        s.voice_class === "client_voice" ||
        (s.voice_class === null && !!s.source_url && isOwnDomainUrl(s.source_url, companyHost)),
      ).map((s) => s.id),
    );
    const analysisSigIds = new Set(vSigs.filter((s) => s.voice_class === "analysis").map((s) => s.id));
    const { data: vRefRows } = await args.supabase
      .from("claim_signal_refs").select("claim_id, signal_id").eq("company_id", args.companyId);
    const ownVoiceClaims = new Set<string>();
    const analysisClaims = new Set<string>();
    for (const r of ((vRefRows ?? []) as Array<{ claim_id: string; signal_id: string }>)) {
      if (ownVoiceSigIds.has(r.signal_id)) ownVoiceClaims.add(r.claim_id);
      if (analysisSigIds.has(r.signal_id)) analysisClaims.add(r.claim_id);
    }
    const clientVoicePublics = publicsAll.filter((c) => ownVoiceClaims.has(c.id) && !analysisClaims.has(c.id));
    // OW-4 (2026-08-20): PREFER the company's OWN WORDS (verbatim self-assertions,
    // claim_type='own_words') as the declared side when the extractor has produced them; fall
    // back to the client-voice INFERENCE claims (our read of the channels) when it hasn't. Never
    // both — own words replace the inference, mirroring beat 3's lead/demote.
    // ADMISSION CRITERION (operator ruling 2026-09-03): only DECLARED-ELIGIBLE own words (kind ∈
    // positioning/offer/audience/proof) are "you say" statements. Ineligible kinds (instruction, slogan,
    // story, policy, …) stay as own-words record: never declared, never a publicly_silent row.
    const ownWordsAll = clientVoicePublics.filter((c) => c.claim_type === "own_words");
    const ownWordsPublics = ownWordsAll.filter((c) => c.declared_eligible !== false);
    ownWordsIneligible = ownWordsAll.length - ownWordsPublics.length;
    declared = ownWordsPublics.length > 0
      ? ownWordsPublics
      // RF ADMISSION (2026-09-04): the inference fallback honours the same mark — a FAILED inference claim
      // (declared_eligible=false) is never the declared side either.
      : clientVoicePublics.filter((c) => c.claim_type !== "own_words" && c.declared_eligible !== false);
    publicVoiceDeclaredIds = new Set(declared.map((c) => c.id));
  } else {
    declared = claims.filter(
      (c) => c.provenance === "internal_declared" || c.provenance === "client_attested",
    );
  }
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
  // 'analysis' (OUR reading of the outside record, not the market speaking) is excluded on the
  // SAME footing as 'client_voice': it produces no echo/divergence/internally_silent, so our
  // own analysis can never score as market confirmation in the delta compute.
  const { data: sigRows } = await args.supabase
    .from("signals").select("id, voice_class, source_url, evidence_class").eq("company_id", args.companyId);
  const allSigs = (sigRows ?? []) as Array<{ id: string; voice_class: string | null; source_url: string | null; evidence_class?: string | null }>;
  // LISTING CLASS (2026-09-04): observed claims backed by a listing signal pair ONLY where listingMayCorroborate
  // admits the declared side (offer/audience + placement token) — every other pairing is refused at synthesis.
  const listingSignalIds = new Set(allSigs.filter((s) => s.evidence_class === "listing").map((s) => s.id));
  const selfSignalIds = new Set(
    allSigs.filter((s) => s.voice_class === "client_voice" || s.voice_class === "analysis").map((s) => s.id),
  );
  const { data: refRows } = await args.supabase
    .from("claim_signal_refs").select("claim_id, signal_id").eq("company_id", args.companyId);
  const allRefs = (refRows ?? []) as Array<{ claim_id: string; signal_id: string }>;
  const selfVoiceClaimIds = new Set<string>();
  const listingBackedClaimIds = new Set<string>();
  for (const r of allRefs) {
    if (selfSignalIds.has(r.signal_id)) selfVoiceClaimIds.add(r.claim_id);
    if (listingSignalIds.has(r.signal_id)) listingBackedClaimIds.add(r.claim_id);
  }

  // ── OBSERVED-SIDE ADMISSION (self-echo gate, operator ruling 2026-09-03) ──────
  // "If it is them saying it on their own site that cannot be corroboration." The voice test above
  // is REF-KEYED: a claim whose refs are absent is invisible to it (CB2's own-words refs were wiped
  // by the RB-2 rebuild on 08-26, and 32 own-host pairs landed on the echo side). Admission is
  // therefore keyed on HOST, resolved structurally: every backing signal's URL via refs; if none,
  // the claim's own raw_payload.page_url; if still nothing, the claim is UNRESOLVABLE — an unbacked
  // claim cannot corroborate anything and is not admitted on the public kind (the internal kind
  // keeps its legacy no-ref publics: they are the client corpus's pairing pool, not corroboration
  // claims). Any own-host URL (the single shared isOwnDomainUrl predicate) ⇒ excluded from the
  // echo/divergent side: no pair forms, so nothing is stamped. Pairs that DO form carry
  // observed_own_host from the same predicate — false by construction after this gate; the column
  // exists for legacy rows and for the readers' one shared selector (isPairAdmissible).
  const sigUrlById = new Map(allSigs.filter((s) => !!s.source_url).map((s) => [s.id, s.source_url as string]));
  const urlsByClaim = new Map<string, string[]>();
  for (const r of allRefs) {
    const u = sigUrlById.get(r.signal_id);
    if (!u) continue;
    const list = urlsByClaim.get(r.claim_id);
    if (list) list.push(u); else urlsByClaim.set(r.claim_id, [u]);
  }
  const ownHostClaimIds = new Set<string>();
  const unbackedClaimIds = new Set<string>();
  for (const c of publicsAll) {
    let urls = urlsByClaim.get(c.id) ?? [];
    if (urls.length === 0 && c.page_url) urls = [c.page_url];
    if (urls.length === 0) {
      if (pairingKind === "public_vs_public") unbackedClaimIds.add(c.id);
      continue;
    }
    if (companyHost && urls.some((u) => isOwnDomainUrl(u, companyHost))) ownHostClaimIds.add(c.id);
  }
  const observedOwnHost = (publicClaimId: string | null | undefined): boolean =>
    !!publicClaimId && ownHostClaimIds.has(publicClaimId);

  // GATE B-1: in a public_vs_public run the declared set is carved OUT of the observed
  // side — a claim can never sit on both sides of its own pairing. (Self-voice exclusion
  // already removes client_voice/analysis-backed claims; this additionally removes the
  // NULL-voice own-domain declared rows the positive-only self-voice test leaves in.)
  /** LISTING PAIRS (parity): for a listing-backed observed claim, the structured listing when the declared side is
   *  admitted by listingMayCorroborate, "refused" when it is not, null for a prose observed claim. */
  const listingCandidate = (d: { statement: string; statement_kind?: string | null }, p: { id: string; listing?: Listing | null }): Listing | "refused" | null => {
    if (!listingBackedClaimIds.has(p.id) || !p.listing) return null;
    return listingMayCorroborate(d).ok ? p.listing : "refused";
  };
  const voiceOrDeclared = (c: { id: string }) => selfVoiceClaimIds.has(c.id) || (publicVoiceDeclaredIds?.has(c.id) ?? false);
  const publics = publicsAll.filter(
    (c) => !voiceOrDeclared(c) && !ownHostClaimIds.has(c.id) && !unbackedClaimIds.has(c.id),
  );
  // Ledger each admission rule separately (a claim is counted under the FIRST rule that refused it).
  const selfVoiceExcluded = publicsAll.filter((c) => voiceOrDeclared(c)).length;
  const ownHostExcluded = publicsAll.filter((c) => !voiceOrDeclared(c) && ownHostClaimIds.has(c.id)).length;
  const unbackedExcluded = publicsAll.filter((c) => !voiceOrDeclared(c) && !ownHostClaimIds.has(c.id) && unbackedClaimIds.has(c.id)).length;

  // Existing rows: identity → row. Tombstones ('rejected_pairing') are never
  // re-proposed; all other existing identities are kept verbatim (no re-roll).
  const { data: existingRows } = await args.supabase
    .from("claim_deltas")
    .select("id, content_identity, delta_type, operator_disposition")
    .eq("company_id", args.companyId)
    // GATE B-1: kind-scoped — the sweep below operates on `existing`, so a run of one
    // kind is structurally incapable of deleting (or even seeing) the other kind's rows.
    .eq("pairing_kind", pairingKind);
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
    .eq("company_id", args.companyId)
    .eq("pairing_kind", pairingKind); // GATE B-1: cache and its orphan-prune are per-kind
  type RejRow = { id: string; content_identity: string };
  const loadedRejections = (rejRows ?? []) as RejRow[];
  const rejectionByIdentity = new Map<string, string>(loadedRejections.map((r) => [r.content_identity, r.id]));

  // OPERATOR RELEVANCE OVERRIDES (2026-09-03): live decisions by pair identity, so a pair row born this
  // run for an overridden identity carries the operator's relevance columns (see overrideColumnsFor).
  const { data: ovRows } = await args.supabase
    .from("claim_delta_relevance_overrides")
    .select("content_identity, verdict, reason, decided_at, superseded_by")
    .eq("company_id", args.companyId)
    .eq("pairing_kind", pairingKind); // live = superseded_by IS NULL, filtered below (a handful of rows per company)
  const relevanceOverrides = new Map<string, LiveRelevanceOverride>();
  for (const o of ((ovRows ?? []) as Array<{ content_identity: string; verdict: string; reason: string; decided_at: string; superseded_by: string | null }>)) {
    if (o.superseded_by == null && (o.verdict === "relevant" || o.verdict === "orthogonal")) relevanceOverrides.set(o.content_identity, { verdict: o.verdict, reason: o.reason, decided_at: o.decided_at });
  }

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

  // ── PROOF-CATEGORY GUARD (operator ruling 2026-08-19) ────────────────────────
  // Provenance and proof are orthogonal axes. A claim typed research_required sits
  // on the proof ladder — only research-grade evidence (e.g. an ODI survey) can
  // answer it; public-site material can never echo OR contradict it (the Chamber
  // directory "echo" of "insufficient customer evidence" was the founding category
  // error). Guarded claims never reach the prefilter, the proposer, or the plan
  // manifest; the unscoped silence loop below still iterates the FULL declared
  // list, so a guarded claim lands publicly_silent — "we haven't found this in
  // public reading", which for a research question is exactly true. Fail-direction
  // law: only POSITIVELY-typed claims are guarded — NULL/untyped flows exactly as
  // before, so a mistyping can only cause normal flow, never a wrong silence.
  // A silent guard is an invisible decision: count + ids are ledgered on every
  // result (run totals + plan manifest).
  const preGuardScope = declaredIdSet ? declared.filter((d) => declaredIdSet.has(d.id)) : declared;
  // Ledger exactly what THIS run excluded (scoped runs report scope-local exclusions).
  const proofGuardExcludedIds = preGuardScope
    .filter((c) => c.proof_category === "research_required")
    .map((c) => c.id)
    .sort();
  const proofGuarded = new Set(proofGuardExcludedIds);
  const declaredScope = preGuardScope.filter((d) => !proofGuarded.has(d.id));

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
        // LISTING PAIRS BY CONSTRUCTION — plan/write PARITY: the SAME predicate call, in the SAME position as the
        // write loop. Refused listing candidates are not candidates at all (never fresh); admitted ones are a
        // deterministic pair keyed by listingPairIdentity (cached once written, fresh until then).
        const lst = listingCandidate(d, p);
        if (lst === "refused") continue;
        if (lst) {
          total++;
          const identity = await listingPairIdentity(d.statement, lst);
          if (tombstones.has(identity)) { tombstoned++; continue; }
          const kept = existing.get(identity);
          if (kept && kept.delta_type === "echoed") { cached++; continue; }
          continue; // fresh — the write creates it by construction (no proposer, no rejection cache)
        }
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
      proof_guard_excluded: proofGuardExcludedIds.length,
      proof_guard_excluded_ids: proofGuardExcludedIds,
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
    own_host_excluded: ownHostExcluded,
    unbacked_excluded: unbackedExcluded,
    own_words_ineligible: ownWordsIneligible,
    proof_guard_excluded: proofGuardExcludedIds.length,
    listing_corroboration_refused: 0,
    pairs_listing: 0,
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
      pairing_kind: pairingKind,
    });
    // Idempotent: a rejection already in the cache (a prior run, or a concurrent step of THIS
    // run) is exactly what the negative cache holds — a duplicate on the kind-scoped unique key
    // is a no-op, never a fatal throw. Any OTHER error still surfaces loudly.
    if (rejErr && !/duplicate key|unique constraint/i.test(rejErr.message)) {
      throw new Error(`claim-delta rejection insert failed: ${rejErr.message}`);
    }
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
      // LISTING PAIRS BY CONSTRUCTION (operator ruling 2026-09-04): a listing-backed observed claim admitted by
      // listingMayCorroborate forms its echoed pair deterministically — basis 'listing', provider
      // listing_predicate, verdict relevant — and NEVER enters the proposer, the rejection cache, or the router.
      // A refused listing candidate is refused in the SAME position plan mode refuses it (parity), counted.
      const lst = listingCandidate(d, p);
      if (lst === "refused") { totals.listing_corroboration_refused++; continue; }
      if (lst) {
        totals.candidates++;
        const identity = await listingPairIdentity(d.statement, lst);
        candidateIdentities.add(identity);
        if (tombstones.has(identity)) { totals.tombstones_respected++; continue; }
        const kept = existing.get(identity);
        if (kept && kept.delta_type === "echoed") { pairedDeclared.add(d.id); pairedPublic.add(p.id); keptPairIdentities.add(identity); continue; }
        pairedDeclared.add(d.id);
        pairedPublic.add(p.id);
        totals.pairs_listing++;
        const reason = listingPairReason(d.statement_kind);
        const pairRow: ComputedDelta = {
          delta_type: "echoed", declared_claim_id: d.id, public_claim_id: p.id, pairing_basis: "listing",
          judge_reason: reason, content_identity: identity, declared_statement: d.statement, public_statement: p.statement,
        };
        deltas.push(pairRow);
        if (args.write && !existing.has(identity) && !insertedThisRun.has(identity)) {
          const { error: insErr } = await args.supabase.from("claim_deltas").insert({
            company_id: args.companyId, declared_claim_id: d.id, public_claim_id: p.id,
            delta_type: "echoed", pairing_basis: "listing", judge_reason: reason, content_identity: identity,
            computed_at: args.nowIso, pairing_kind: pairingKind,
            model_provider: LISTING_PREDICATE_PROVIDER, model_name: "deterministic",
            observed_own_host: observedOwnHost(p.id),
            relevance_verdict: "relevant", relevance_provider: LISTING_PREDICATE_PROVIDER, relevance_model: LISTING_PREDICATE_PROVIDER,
            relevance_reason: reason, relevance_span: "", relevance_judged_at: args.nowIso,
            ...overrideColumnsFor(identity, relevanceOverrides),
          });
          if (insErr) throw new Error(`claim-delta listing-pair insert failed: ${insErr.message}`);
          insertedThisRun.add(identity);
          totals.rows_new++;
        }
        continue;
      }
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

      // Stage 2a: proposer — ROUTER picks qwen14b (local) or gpt-4.1-mini (external) by the pair's
      // provenances. internal_declared declared side → local (never leaves the machine).
      const pairProv = [d.provenance, p.provenance];
      const propRes = args.routedCall
        ? await args.routedCall({ role: "generator", provenances: pairProv, system: PROPOSE_SYSTEM, user: buildPairUser(d, p) })
        : { content: await callOllamaJson(args.ollamaUrl, genModel, PROPOSE_SYSTEM, buildPairUser(d, p), GEN_TIMEOUT_MS), provider: "local_ollama", model: genModel };
      const proposed = parseVerdict(propRes.content, "proposer");
      if (!proposed.same_subject || !proposed.relation) {
        totals.pairs_rejected++;
        await bankRejection(d, p, identity, "proposer", null, proposed.reason);
        continue;
      }

      // Stage 2b: judge — llama70b (local) or gpt-4.1-mini (external). Deterministic locally.
      const judgeRes = args.routedCall
        ? await args.routedCall({ role: "judge", provenances: pairProv, system: JUDGE_SYSTEM, user: buildPairUser(d, p) })
        : { content: await callOllamaJson(args.ollamaUrl, judgeModel, JUDGE_SYSTEM, buildPairUser(d, p), JUDGE_TIMEOUT_MS, JUDGE_DETERMINISM), provider: "local_ollama", model: judgeModel };
      const judged = parseVerdict(judgeRes.content, "judge");
      if (!judged.same_subject || !judged.relation) {
        totals.pairs_rejected++;
        await bankRejection(d, p, identity, "judge", judgeRes.model, judged.reason);
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
          d, p, identity, "judge", judgeRes.model,
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
          pairing_kind: pairingKind,
          model_provider: judgeRes.provider,
          model_name: judgeRes.model,
          // SELF-ECHO GATE: stamped from the same predicate that admitted the observed side (false by construction).
          observed_own_host: observedOwnHost(pairRow.public_claim_id),
          // OPERATOR OVERRIDE: born with the operator's relevance columns when a live decision exists.
          ...overrideColumnsFor(identity, relevanceOverrides),
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
    // Dedup WITHIN the fresh batch: two publics (or declared) sharing identical statement text
    // produce the same silence content_identity; insert each identity once (the kind-scoped
    // unique key would otherwise abort the whole finalize on the duplicate).
    const seenFresh = new Set<string>();
    for (const row of fresh) {
      if (seenFresh.has(row.content_identity)) continue;
      seenFresh.add(row.content_identity);
      const { error: insErr } = await args.supabase.from("claim_deltas").insert({
        company_id: args.companyId,
        declared_claim_id: row.declared_claim_id,
        public_claim_id: row.public_claim_id,
        delta_type: row.delta_type,
        pairing_basis: row.pairing_basis,
        judge_reason: row.judge_reason,
        content_identity: row.content_identity,
        computed_at: args.nowIso,
        pairing_kind: pairingKind,
        // Silences are DERIVED (absence), not judged — no model produced them.
        model_provider: "none",
        model_name: "deterministic",
        observed_own_host: observedOwnHost(row.public_claim_id),
      });
      if (insErr) throw new Error(`claim-delta insert failed: ${insErr.message}`);
      totals.rows_new++;
    }
    // Delete stale non-tombstone rows (their claims changed/pruned/got paired).
    const stale = [...existing.values()].filter(
      (r) => !producedIdentities.has(r.content_identity) && r.operator_disposition !== "rejected_pairing",
    );
    if (stale.length > 0) {
      // DELETE AUDIT (2026-09-03): never a bare delete — the sanctioned RPC sets the transaction-local
      // reason and the BEFORE DELETE trigger snapshots every row into claim_delta_removals. A bare
      // .delete() would now be REFUSED by the trigger (no reason set).
      const staleIds = stale.map((r) => r.id);
      const sweepReason = `stale_sweep:${pairingKind}:${args.nowIso}`;
      for (let i = 0; i < staleIds.length; i += 100) {
        const { error: delErr } = await (args.supabase as unknown as { rpc: (fn: string, a: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }> })
          .rpc("delete_claim_deltas_audited", { p_company_id: args.companyId, p_ids: staleIds.slice(i, i + 100), p_reason: sweepReason });
        if (delErr) throw new Error(`claim-delta stale-delete failed: ${delErr.message}`);
      }
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
      // Batch the delete — a large id list in a single .in() overruns PostgREST's URI limit.
      const orphanIds = orphanRejections.map((r) => r.id);
      for (let i = 0; i < orphanIds.length; i += 100) {
        const { error: pruneErr } = await args.supabase
          .from("claim_delta_rejections").delete().in("id", orphanIds.slice(i, i + 100));
        if (pruneErr) throw new Error(`claim-delta rejection prune failed: ${pruneErr.message}`);
      }
      totals.rejections_pruned = orphanRejections.length;
    }

    // GATE B-1: the public-kind finalize records that the gap comparison was LOOKED at —
    // written AFTER the work so a died run leaves no false "looked" row (the orchestrator's
    // catch writes the failed row instead).
    if (pairingKind === "public_vs_public") {
      await writeGapPairsIntegrity(args.supabase, args.companyId, {
        status: "completed",
        ranAtIso: args.nowIso,
        examined: totals.candidates,
        admitted: totals.pairs_confirmed + totals.pairs_inferred,
        runRef: args.nowIso,
        // SELF-ECHO GATE: the admission ledger — what this run refused on the observed side, per rule.
        excludedByRule: {
          self_voice: totals.self_voice_excluded,
          own_host: totals.own_host_excluded,
          unbacked: totals.unbacked_excluded,
          own_words_ineligible: totals.own_words_ineligible,
          proof_guard: totals.proof_guard_excluded,
        },
      });
    }
  }

  return { ok: true, scoped, deltas, totals, proof_guard_excluded_ids: proofGuardExcludedIds };
}
