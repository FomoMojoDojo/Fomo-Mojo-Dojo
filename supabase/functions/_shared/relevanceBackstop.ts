// RELEVANCE BACKSTOP core (design gate approved 2026-08-26) — a verdict-level relevance
// judgment that sits BESIDE the verbatim-span structural check. The delta verdict already
// asked "is the judge's quote really in the source?" (classifyObservedSpan). It never asked
// "is the source actually ABOUT the specific assertion, or only about the same company/topic?"
// A source about a different subject supplies a valid ≥2-token span and scores as a CONFIRMED
// echo. This module answers that missing question and records it as a REVERSIBLE OVERLAY on
// claim_deltas (relevance_verdict = 'relevant' | 'orthogonal' | NULL), never altering delta_type.
//
// Two stages (design gate candidate iii):
//   STAGE A — deterministic router (no model call). distinctiveOverlap = shared meaningful
//     tokens MINUS the company-name/alias tokens MINUS a generic-word set. In public_vs_public
//     BOTH sides are about the same company by construction, so the company name is shared in
//     nearly every pair and carries zero discriminating power; ≥2 remaining distinctive tokens
//     is strong evidence of a specific match → auto-SPARE ('relevant'). ≤1 → Stage B.
//   STAGE B — the relevance judge (external gpt-4.1-mini for public_vs_public, routed by
//     provenance via the injected routedCall — never hardcoded). Judge-only authority: the
//     router never OVERTURNS a verdict, it only decides who needs the judge. temp0/seed42.
//
// Persistence law: this module ONLY runs UPDATE on the six overlay columns of existing
// claim_deltas rows. It NEVER inserts or deletes a claim_deltas row and NEVER calls
// generate-claim-deltas. The overlay survives the identity-keyed delta recompute because the
// delta keep-path (identity unchanged ⇒ verdict stands) leaves the row — and its overlay —
// untouched, exactly like operator_disposition. relevance_verdict is machine-authored and is
// SEPARATE from operator_disposition (operator-only); neither writes the other's field.
//
// Frozen law: FROZEN_COMPANY_IDS refusal here + the DB enforce_company_freeze trigger. CB1 has
// zero claim_deltas rows anyway; the backstop is never pointed at a frozen company.
//
// Scope (this gate): pairing_kind = 'public_vs_public' only. Both sides public ⇒ every judge
// call routes external — no local-model path is exercised. internal_vs_public is a separate
// surface, carried to a follow-up.

import { meaningfulTokens } from "./claimDeltaSynthesis.ts";
import { FROZEN_COMPANY_IDS } from "./stepConditionsSynthesis.ts";

// ── Stage A: distinctive-overlap router ───────────────────────────────────────

// Generic / high-frequency business words that survive the delta tokenizer's small STOP set
// but carry no subject-specificity. Kept as a curated constant (deterministic, no corpus pass):
// a shared generic word is never evidence that two statements make the SAME specific assertion.
export const GENERIC_TOKENS: ReadonlySet<string> = new Set([
  "all", "use", "using", "used", "one", "get", "got", "out", "can", "will", "help", "helps",
  "offer", "offered", "offers", "provide", "provides", "provided", "more", "than", "most",
  "other", "others", "company", "companies", "service", "services", "business", "businesses",
  "product", "products", "solution", "solutions", "customer", "customers", "client", "clients",
  "team", "teams", "people", "work", "works", "make", "makes", "made", "new", "best", "top",
  "leading", "trusted", "quality", "experience", "experienced", "professional", "expert",
  "experts", "provider", "providers", "based", "including", "included", "well", "also", "into",
]);

// The company-name / alias tokens to subtract. Derived deterministically from the company row:
// the meaningful tokens of its name, plus an acronym of those tokens (SIAA, IAQM — the acronym
// is the dominant orthogonal token in the corpus and is NOT a name token itself), plus the
// meaningful tokens of the website host minus its TLD. No external lookup, no stemming.
export function entityTokens(companyName: string | null | undefined, website: string | null | undefined): Set<string> {
  const out = new Set<string>();
  const nameToks = [...meaningfulTokens(companyName ?? "")];
  for (const t of nameToks) out.add(t);
  // Acronym of the significant name words (e.g. "Indoor Air Quality Management" → "iaqm").
  if (nameToks.length >= 2) {
    const acr = nameToks.map((t) => t[0]).join("");
    if (acr.length >= 2) out.add(acr);
  }
  // Website host tokens (drop scheme, path, and the final TLD label).
  if (website) {
    try {
      const host = new URL(website.includes("://") ? website : `https://${website}`).hostname;
      const labels = host.replace(/^www\./, "").split(".");
      const hostCore = labels.length > 1 ? labels.slice(0, -1).join(" ") : labels.join(" ");
      for (const t of meaningfulTokens(hostCore)) out.add(t);
    } catch { /* malformed website — name/acronym tokens still apply */ }
  }
  return out;
}

export type StageADecision =
  | { verdict: "relevant"; distinctiveOverlap: number; distinctiveTokens: string[]; routeToJudge: false }
  | { verdict: null; distinctiveOverlap: number; distinctiveTokens: string[]; routeToJudge: true };

// distinctiveOverlap ≥ 2 ⇒ auto-spare; ≤ 1 ⇒ route to the judge. The router NEVER returns
// 'orthogonal' — it cannot strike, only spare-or-defer (judge-only authority).
export function stageARoute(
  declared: string,
  observed: string,
  entities: Set<string>,
): StageADecision {
  const td = meaningfulTokens(declared);
  const to = meaningfulTokens(observed);
  const distinctive: string[] = [];
  for (const t of td) {
    if (to.has(t) && !entities.has(t) && !GENERIC_TOKENS.has(t)) distinctive.push(t);
  }
  const n = distinctive.length;
  if (n >= 2) return { verdict: "relevant", distinctiveOverlap: n, distinctiveTokens: distinctive.sort(), routeToJudge: false };
  return { verdict: null, distinctiveOverlap: n, distinctiveTokens: distinctive.sort(), routeToJudge: true };
}

// ── Stage B: the relevance judge (routed, external for public_vs_public) ───────

export const RELEVANCE_JUDGE_SYSTEM =
  "You judge whether a publicly-OBSERVED statement is RELEVANT to a specific DECLARED assertion about the same company. " +
  "The two statements already share some wording and both concern the same company — that is NOT enough. " +
  "Decide RELEVANT only if the OBSERVED statement speaks to the SPECIFIC assertion the DECLARED statement makes (the same claim, offer, capability, scale, or fact). " +
  "Decide ORTHOGONAL if the only connection is that both mention the same company, the same broad topic, or a generic word — an OBSERVED statement that would equally 'confirm' many unrelated declared claims is ORTHOGONAL to all of them. " +
  "When ORTHOGONAL, span must be an empty string. When RELEVANT, span MUST be a verbatim run of words copied from the OBSERVED statement that carries the specific link. " +
  "Never force relevance; when unsure, answer orthogonal. " +
  'JSON only: {"relevance":"relevant"|"orthogonal","reason":"<one short clause>","span":"<verbatim words from the OBSERVED statement, or empty>"}.';

export function buildRelevanceUser(declared: string, observed: string): string {
  return `DECLARED (the specific assertion): ${declared}\nOBSERVED (public statement already found to share wording): ${observed}\nIs the OBSERVED statement relevant to the SPECIFIC declared assertion, or only about the same company/topic?`;
}

export type RelevanceParsed = { relevance: "relevant" | "orthogonal"; reason: string; span: string };

// Strict parse — an unparseable / malformed judge answer THROWS (require_model: no silent
// default, the run aborts loudly and the row stays NULL/unjudged, revisitable next run).
export function parseRelevance(raw: string): RelevanceParsed {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`relevance judge output unparseable (strict): ${raw.slice(0, 140)}`);
  }
  const p = parsed as Record<string, unknown>;
  if (p.relevance !== "relevant" && p.relevance !== "orthogonal") {
    throw new Error(`relevance judge output missing relevance (strict): ${raw.slice(0, 140)}`);
  }
  return {
    relevance: p.relevance,
    reason: String(p.reason ?? "").trim(),
    span: typeof p.span === "string" ? p.span : "",
  };
}

// ── Company-level compute ─────────────────────────────────────────────────────

export const RELEVANCE_INTEGRITY_COMPONENT = "first_read_relevance_backstop";

export type RelevanceRow = {
  id: string;
  declared_statement: string;
  public_statement: string;
  delta_type: string;
};

export type RelevanceArgs = {
  supabase: { from: (t: string) => any };
  companyId: string;
  nowIso: string;
  write: boolean;
  // Injected provenance-routed model caller (built at the edge fn from _shared/modelRouter.ts).
  // For public_vs_public every pair is all-public ⇒ external gpt-4.1-mini.
  routedCall: (a: {
    role: "generator" | "judge";
    provenances: Array<string | null | undefined>;
    system: string;
    user: string;
  }) => Promise<{ content: string; provider: string; model: string }>;
  // Isolate-ceiling guard: process at most this many judge-needing rows per invocation.
  // undefined ⇒ no cap (used by the scratch proof, which has ~2 rows). The stepper passes a cap.
  maxJudge?: number;
  pairingKind?: "public_vs_public";
};

export type RelevanceResult =
  | {
      ok: true;
      totals: {
        examined: number;      // verdict rows loaded (unjudged this run)
        auto_relevant: number; // Stage A auto-spared
        judged_relevant: number;
        judged_orthogonal: number;
        remaining: number;     // left unjudged this invocation (isolate cap) — resumable
      };
    }
  | { ok: false; skipped: "frozen_company" }
  | { ok: false; error: string };

export async function computeRelevanceForCompany(args: RelevanceArgs): Promise<RelevanceResult> {
  if (FROZEN_COMPANY_IDS.has(args.companyId)) return { ok: false, skipped: "frozen_company" };
  const pairingKind = args.pairingKind ?? "public_vs_public";

  // Company identity for entity-token derivation.
  const { data: coRow, error: coErr } = await args.supabase
    .from("companies").select("name, website").eq("id", args.companyId).maybeSingle();
  if (coErr) return { ok: false, error: String(coErr.message ?? coErr) };
  const entities = entityTokens(
    (coRow as { name?: string | null } | null)?.name ?? null,
    (coRow as { website?: string | null } | null)?.website ?? null,
  );

  // Load the VERDICT rows (echoed/divergent pairings) that are not yet relevance-judged.
  // Overlay is keyed on the delta row id; we need both statements — join through claims.
  const { data: deltaRows, error: dErr } = await args.supabase
    .from("claim_deltas")
    .select("id, delta_type, declared_claim_id, public_claim_id, relevance_verdict")
    .eq("company_id", args.companyId)
    .eq("pairing_kind", pairingKind)
    .in("delta_type", ["echoed", "divergent"])
    .is("relevance_verdict", null);
  if (dErr) return { ok: false, error: String(dErr.message ?? dErr) };
  const rows = (deltaRows ?? []) as Array<{
    id: string; delta_type: string; declared_claim_id: string; public_claim_id: string; relevance_verdict: string | null;
  }>;

  const totals = { examined: rows.length, auto_relevant: 0, judged_relevant: 0, judged_orthogonal: 0, remaining: 0 };
  if (rows.length === 0) {
    // Nothing left to judge for this company/kind — record the drained (completed) state.
    if (args.write) await writeRelevanceIntegrity(args.supabase, args.companyId, args.nowIso, totals);
    return { ok: true, totals };
  }

  // Fetch the statement text for every referenced claim in one shot.
  const claimIds = [...new Set(rows.flatMap((r) => [r.declared_claim_id, r.public_claim_id]))];
  const { data: claimRows, error: cErr } = await args.supabase
    .from("claims").select("id, statement").in("id", claimIds);
  if (cErr) return { ok: false, error: String(cErr.message ?? cErr) };
  const stmt = new Map<string, string>(
    ((claimRows ?? []) as Array<{ id: string; statement: string }>).map((c) => [c.id, c.statement]),
  );

  let judgedCount = 0;
  for (const r of rows) {
    const declared = stmt.get(r.declared_claim_id) ?? "";
    const observed = stmt.get(r.public_claim_id) ?? "";

    // STAGE A — deterministic auto-spare.
    const routeA = stageARoute(declared, observed, entities);
    if (!routeA.routeToJudge) {
      await stampRelevance(args, r.id, {
        verdict: "relevant",
        reason: `distinctive-overlap>=2 {${routeA.distinctiveTokens.join(",")}}`.slice(0, 400),
        span: "",
        model: "router",
        provider: "deterministic",
      });
      totals.auto_relevant++;
      continue;
    }

    // Isolate-ceiling guard for the judged rows only (Stage A costs nothing).
    if (args.maxJudge !== undefined && judgedCount >= args.maxJudge) { totals.remaining++; continue; }

    // STAGE B — the routed relevance judge (external for public_vs_public).
    const provenances = ["public_observed", "public_observed"]; // pairing_kind guarantees both public
    const res = await args.routedCall({
      role: "judge",
      provenances,
      system: RELEVANCE_JUDGE_SYSTEM,
      user: buildRelevanceUser(declared, observed),
    });
    const parsed = parseRelevance(res.content);
    judgedCount++;
    await stampRelevance(args, r.id, {
      verdict: parsed.relevance,
      reason: parsed.reason.slice(0, 400) || null,
      span: parsed.relevance === "relevant" ? (parsed.span || null) : null,
      model: res.model,
      provider: res.provider,
    });
    if (parsed.relevance === "relevant") totals.judged_relevant++;
    else totals.judged_orthogonal++;
  }

  // Ledger only a fully-drained company (remaining === 0) as 'completed' — mirrors the
  // gap-pairs integrity pattern (written after the work). A capped/partial invocation writes
  // no integrity row; the next invocation that drains the company records the completion.
  if (args.write && totals.remaining === 0) {
    await writeRelevanceIntegrity(args.supabase, args.companyId, args.nowIso, totals);
  }
  return { ok: true, totals };
}

async function stampRelevance(
  args: RelevanceArgs,
  deltaId: string,
  v: { verdict: "relevant" | "orthogonal"; reason: string | null; span: string | null; model: string; provider: string },
): Promise<void> {
  if (!args.write) return;
  // UPDATE of overlay columns ONLY — never insert/delete a claim_deltas row.
  const { error } = await args.supabase.from("claim_deltas").update({
    relevance_verdict: v.verdict,
    relevance_reason: v.reason,
    relevance_span: v.span,
    relevance_model: v.model,
    relevance_provider: v.provider,
    relevance_judged_at: args.nowIso,
  }).eq("id", deltaId);
  if (error) throw new Error(`relevance overlay update failed (${deltaId}): ${error.message}`);
}

async function writeRelevanceIntegrity(
  supabase: { from: (t: string) => any },
  companyId: string,
  nowIso: string,
  totals: { examined: number; auto_relevant: number; judged_relevant: number; judged_orthogonal: number; remaining: number },
): Promise<void> {
  const { error } = await supabase.from("integrity_runs").insert({
    company_id: companyId,
    component: RELEVANCE_INTEGRITY_COMPONENT,
    surface_type: null,
    surface_id: null,
    ran_at: nowIso,
    status: "completed", // only called on a fully-drained company (see caller guard)
    examined: totals.examined,
    admitted: totals.judged_orthogonal, // 'admitted' reused as: rows the backstop struck orthogonal
    excluded_by_rule: { // jsonb: how the spared rows were spared, + the struck count
      spared: totals.auto_relevant + totals.judged_relevant,
      auto_relevant: totals.auto_relevant,
      judged_relevant: totals.judged_relevant,
      judged_orthogonal: totals.judged_orthogonal,
    },
    error: null,
    run_ref: nowIso,
  });
  if (error) throw new Error(`relevance integrity insert failed: ${error.message}`);
}
