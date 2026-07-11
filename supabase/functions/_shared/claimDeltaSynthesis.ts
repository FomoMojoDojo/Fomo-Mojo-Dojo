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
  provenance: "internal_declared" | "public_observed";
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
      deltas: ComputedDelta[];
      totals: {
        declared: number; public: number; candidates: number;
        pairs_confirmed: number; pairs_inferred: number; pairs_rejected: number;
        publicly_silent: number; internally_silent: number;
        rows_new: number; rows_kept: number; rows_deleted: number; tombstones_respected: number;
      };
    }
  | { ok: false; skipped: "frozen_company" | "no_declared_claims" }
  | { ok: false; error: string };

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
  "Decide whether they are genuinely about the SAME SUBJECT (the same specific aspect of the business — shared buzzwords are NOT the same subject), " +
  "and if so whether the public statement ECHOES the declared intent (consistent with it) or DIVERGES from it (contradicts or materially mis-states it). " +
  "Never invent facts. Never force a match. " +
  'JSON only: {"same_subject":true|false,"relation":"echo"|"divergent"|null,"reason":"<one short clause citing words from BOTH statements when same_subject>"}.';

// ── Stage 2b: 70b judge (judge-only law) ──────────────────────────────────────

const JUDGE_SYSTEM =
  "You are a strict reviewer of a proposed pairing between an internally-DECLARED strategy statement and a publicly-OBSERVED statement. " +
  "Criteria: (i) SAME SUBJECT — the two statements must concern the same specific aspect of the business; shared buzzwords or general theme overlap are NOT sufficient; " +
  "(ii) RELATION — 'echo' means the public statement is consistent with the declared intent; 'divergent' means it contradicts or materially mis-states it; your reason must quote or closely reference evidence from BOTH statements; " +
  "(iii) CONFIDENT — true only when the subject match and relation are unambiguous. " +
  "Reject vibes-pairings. Never force a match. " +
  'JSON only: {"same_subject":true|false,"relation":"echo"|"divergent"|null,"confident":true|false,"reason":"<one short clause>"}.';

function buildPairUser(declared: string, publicStmt: string): string {
  return `DECLARED (internal, authoritative about intent): ${declared}\nOBSERVED (public): ${publicStmt}\nAre these the same subject, and if so does the public statement echo or diverge from the declared intent?`;
}

// require_model parsing: unparseable output throws — no defaults, no fallback.
function parseVerdict(raw: string, who: string): { same_subject: boolean; relation: "echo" | "divergent" | null; confident?: boolean; reason: string } {
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
    reason: String(p.reason ?? "").trim(),
  };
}

// ── Company-level compute ─────────────────────────────────────────────────────

export async function computeDeltasForCompany(args: {
  supabase: { from: (t: string) => any };
  companyId: string;
  ollamaUrl: string;
  nowIso: string;
  genModel?: string;
  judgeModel?: string;
  write: boolean;
}): Promise<DeltaRunResult> {
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
  const declared = claims.filter((c) => c.provenance === "internal_declared");
  const publics = claims.filter((c) => c.provenance === "public_observed");
  if (declared.length === 0) return { ok: false, skipped: "no_declared_claims" };

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

  const totals = {
    declared: declared.length, public: publics.length, candidates: 0,
    pairs_confirmed: 0, pairs_inferred: 0, pairs_rejected: 0,
    publicly_silent: 0, internally_silent: 0,
    rows_new: 0, rows_kept: 0, rows_deleted: 0, tombstones_respected: 0,
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

  for (const d of declared) {
    for (const p of publics) {
      if (sharedTokenCount(d.statement, p.statement) < PREFILTER_MIN_SHARED_TOKENS) continue;
      totals.candidates++;
      const identity = await pairIdentity(d.statement, p.statement);

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

      // Stage 2a: 14b proposes.
      const proposedRaw = await callOllamaJson(args.ollamaUrl, genModel, PROPOSE_SYSTEM, buildPairUser(d.statement, p.statement), GEN_TIMEOUT_MS);
      const proposed = parseVerdict(proposedRaw, "proposer");
      if (!proposed.same_subject || !proposed.relation) { totals.pairs_rejected++; continue; }

      // Stage 2b: 70b judges.
      const judgedRaw = await callOllamaJson(args.ollamaUrl, judgeModel, JUDGE_SYSTEM, buildPairUser(d.statement, p.statement), JUDGE_TIMEOUT_MS);
      const judged = parseVerdict(judgedRaw, "judge");
      if (!judged.same_subject || !judged.relation) { totals.pairs_rejected++; continue; }

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

  if (args.write) {
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
  }

  return { ok: true, deltas, totals };
}
