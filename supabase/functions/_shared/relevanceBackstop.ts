// RELEVANCE BACKSTOP core (design gate approved 2026-08-26) — a verdict-level relevance
// judgment that sits BESIDE the verbatim-span structural check. The delta verdict already
// asked "is the judge's quote really in the source?" (classifyObservedSpan). It never asked
// "is the source actually ABOUT the specific assertion, or only about the same company/topic?"
// A source about a different subject supplies a valid ≥2-token span and scores as a CONFIRMED
// echo. This module answers that missing question and records it as a REVERSIBLE OVERLAY on
// claim_deltas (relevance_verdict = 'relevant' | 'orthogonal' | NULL), never altering delta_type.
//
// PRE-ROUTER (apply-gate-v3) — deterministic partition by distinctiveOverlap = shared meaningful
// tokens MINUS company-name/alias MINUS generic words. In public_vs_public both sides are about
// the same company by construction, so the company name carries zero discriminating power.
//   dov>=2 → auto-SPARE 'relevant' (strong same-subject overlap), deterministic, no model.
//   dov=0  → deterministic 'orthogonal' (entity-only co-mention), no model, HONEST router reason.
//            The judge proved a coin-flip on this call (148/117 over 265), so the router owns it.
//   dov=1  → the V3 relevance JUDGE (the ONLY pairs it sees; external gpt-4.1-mini for public,
//            temp0, routed by provenance via the injected routedCall — never hardcoded), where
//            it reliably separates same-subject (DFW-style, relevant) from different-subject
//            co-mention (funding/listing/incident, orthogonal). Judge never makes the dov=0 call.
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

// V1 (RETAINED FOR AUDIT ONLY — not used). The apply-gate dry-run showed V1 slid from RELEVANCE
// (is OBSERVED about the assertion?) to SUFFICIENCY (does OBSERVED fully prove the assertion /
// its scope / range / superlative?). Sufficiency is the proof ladder's job, not the relevance
// backstop's — V1 wrongly struck genuine weak-evidence-toward matches (e.g. a mold-remediation
// DFW source vs a "small-residential-to-full-commercial remediation" claim). Superseded by
// RELEVANCE_JUDGE_SYSTEM below. Kept as a named constant so the calibration change is auditable.
export const RELEVANCE_JUDGE_SYSTEM_SUFFICIENCY_V1 =
  "You judge whether a publicly-OBSERVED statement is RELEVANT to a specific DECLARED assertion about the same company. " +
  "The two statements already share some wording and both concern the same company — that is NOT enough. " +
  "Decide RELEVANT only if the OBSERVED statement speaks to the SPECIFIC assertion the DECLARED statement makes (the same claim, offer, capability, scale, or fact). " +
  "Decide ORTHOGONAL if the only connection is that both mention the same company, the same broad topic, or a generic word — an OBSERVED statement that would equally 'confirm' many unrelated declared claims is ORTHOGONAL to all of them. " +
  "When ORTHOGONAL, span must be an empty string. When RELEVANT, span MUST be a verbatim run of words copied from the OBSERVED statement that carries the specific link. " +
  "Never force relevance; when unsure, answer orthogonal. " +
  'JSON only: {"relevance":"relevant"|"orthogonal","reason":"<one short clause>","span":"<verbatim words from the OBSERVED statement, or empty>"}.';

// V2 (RETAINED FOR AUDIT ONLY — not used). Corrected V1's sufficiency slide (DFW-style same-subject
// partial support restored to relevant) but OVER-CORRECTED the other way: run uniformly it spared
// dov=0 entity-only co-mentions — the model rationalized "both mention IAQM in the context of home
// services" as a subject match, so "found IAQM on Angie's list" / an SBA PPP loan / a named technician
// came back 'relevant'. It held only ONE edge. Superseded by V3 below.
export const RELEVANCE_JUDGE_SYSTEM_ABOUTNESS_V2 =
  "You judge whether a publicly-OBSERVED statement is ABOUT THE SAME subject as a DECLARED assertion about the same company — the same product, service, market, capability, or topic. " +
  "The two already share some wording. " +
  "Answer 'relevant' if OBSERVED speaks to the SAME subject as DECLARED, EVEN IF it does not confirm the full scope, range, degree, or superlative that DECLARED claims — partial, weak, or merely topical support IS relevant. " +
  "Do NOT require OBSERVED to prove or fully confirm the claim: sufficiency of evidence is NOT your job, only ABOUTNESS. A source that supports the claim weakly, or covers only part of it, is RELEVANT. " +
  "Answer 'orthogonal' ONLY if OBSERVED is about a DIFFERENT subject and the connection is merely the shared company name or a generic word (a source that would attach equally to many unrelated claims). " +
  "When genuinely unsure whether the subject matches, answer 'relevant'. " +
  "When 'relevant', span MUST be a verbatim run of words copied from OBSERVED that shows the shared subject. When 'orthogonal', span must be an empty string. " +
  'JSON only: {"relevance":"relevant"|"orthogonal","reason":"<one short clause>","span":"<verbatim words from the OBSERVED statement, or empty>"}.';

// ACTIVE (V3, apply-gate re-calibration). Must hold BOTH edges V1 and V2 each held only one:
//   • dov=0 entity-only / generic-only co-mention (Angie's-list, SBA loan, named technician,
//     directory listing) → ORTHOGONAL — a DIFFERENT specific matter that merely names the company.
//   • dov>=1 same specific offering/service/market, partial or weak → RELEVANT (the DFW case).
// The lever is the STRIP-THE-NAME test: remove the company name from OBSERVED; if what remains is
// still about the same specific thing DECLARED asserts, relevant; if what remains is about some
// other matter (a price, a person, a loan, a listing, a discovery story), orthogonal. Sharing the
// broad INDUSTRY is not sharing the SUBJECT.
export const RELEVANCE_JUDGE_SYSTEM =
  "You judge whether a publicly-OBSERVED statement is about the SAME SPECIFIC SUBJECT as a DECLARED assertion about the same company — the same specific offering, service, product, market, or claim. " +
  "The company name appears in both; that is NOT a subject match. Sharing the same broad INDUSTRY is NOT a subject match either. " +
  "Answer 'orthogonal' when OBSERVED's only real tie to DECLARED is the company name (or an alias, or a generic word) and OBSERVED is actually about a DIFFERENT specific matter — for example: how a customer found or contacted the company, a price or cost remark, a named employee or technician, a loan or financial filing, a directory or listing entry, a contract or legal dispute, an employment experience, or hours/scheduling. These co-mention the company but are not about the declared offering. " +
  "Answer 'relevant' when OBSERVED describes, reviews, confirms, disputes, or otherwise speaks to the SAME specific offering/service/product/market/claim as DECLARED — EVEN IF it covers only part of it, supports it weakly, or does not confirm the full scope, range, degree, or superlative DECLARED claims. Same-subject partial or weak support is RELEVANT; sufficiency of evidence is not your concern. " +
  "DECISIVE TEST: mentally strip the company name from OBSERVED. If what remains is still about the same specific thing DECLARED asserts, answer 'relevant'. If what remains is about some other matter (a price, a person, a loan, a listing, a discovery story, a legal dispute), answer 'orthogonal'. " +
  "When 'relevant', span MUST be a verbatim run of words copied from OBSERVED that names the shared subject. When 'orthogonal', span must be an empty string. " +
  'JSON only: {"relevance":"relevant"|"orthogonal","reason":"<one short clause>","span":"<verbatim words from the OBSERVED statement, or empty>"}.';

export function buildRelevanceUser(declared: string, observed: string): string {
  return `DECLARED (the assertion): ${declared}\nOBSERVED (public statement already found to share wording): ${observed}\nStrip the company name from OBSERVED: is what remains about the SAME specific offering/service/market/claim as DECLARED (relevant, even if partial), or about a DIFFERENT matter that merely co-mentions the company (orthogonal)?`;
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
  // GATE-BEFORE-ARTIFACT: report-only mode. Runs Stage A + Stage B and RETURNS the proposed
  // verdicts (in `proposals`) but writes NOTHING to claim_deltas and does NOT touch the integrity
  // ledger. maxJudge is ignored (a review needs every proposal). Judge calls run with bounded
  // concurrency (no writes ⇒ order-independent) so a large company stays under the isolate ceiling.
  // Reusable by CB2's separate gate. Never stamps.
  dryRun?: boolean;
  // Concurrency for the dry-run judge calls (default 6). Ignored in stamp mode (sequential writes).
  dryRunConcurrency?: number;
  // Optional integrity-ledger run_ref (e.g. an apply-gate tag). Defaults to nowIso.
  runRef?: string;
};

// A single proposed relevance verdict — the unit of the review table (gate-before-artifact).
export type RelevanceProposal = {
  id: string;                 // claim_deltas.id
  delta_type: string;         // 'echoed' | 'divergent' (the PRIOR verdict being reviewed)
  declared: string;           // declared/own-words statement
  observed: string;           // paired public source statement
  proposed_verdict: "relevant" | "orthogonal";
  stage: "A" | "B" | "O";     // A = deterministic auto-spare; B = the routed judge; O = operator override (never routed)
  distinctive_overlap: number;
  distinctive_tokens: string[];
  reason: string | null;      // Stage-B judge reason (the over-strike watch-item)
  span: string;               // judge's verbatim observed span for a 'relevant' verdict ("" otherwise)
  model: string;
  provider: string;
};

export type RelevanceResult =
  | {
      ok: true;
      totals: {
        examined: number;         // verdict rows loaded (unjudged this run)
        overridden: number;       // OPERATOR OVERRIDE (2026-09-03): stamped from claim_delta_relevance_overrides, never routed/judged
        auto_relevant: number;    // Stage A auto-spared (dov>=2), deterministic
        router_orthogonal: number; // PRE-ROUTER dov=0 struck deterministically (no judge)
        judged_relevant: number;  // dov=1 judge → relevant
        judged_orthogonal: number; // dov=1 judge → orthogonal
        remaining: number;        // left unjudged this invocation (isolate cap) — resumable
      };
      // Populated in dryRun (every row); in stamp mode carries the rows acted on this invocation.
      proposals: RelevanceProposal[];
      dry_run: boolean;
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
    .select("id, delta_type, declared_claim_id, public_claim_id, relevance_verdict, content_identity")
    .eq("company_id", args.companyId)
    .eq("pairing_kind", pairingKind)
    .in("delta_type", ["echoed", "divergent"])
    .is("relevance_verdict", null);
  if (dErr) return { ok: false, error: String(dErr.message ?? dErr) };
  const rows = (deltaRows ?? []) as Array<{
    id: string; delta_type: string; declared_claim_id: string; public_claim_id: string; relevance_verdict: string | null; content_identity: string;
  }>;

  // OPERATOR OVERRIDES (operator ruling 2026-09-03): a LIVE decision in claim_delta_relevance_overrides
  // (superseded_by IS NULL, verdict relevant|orthogonal) wins over the machine — such a pair is stamped
  // from the override here and NEVER sent to the router or the judge (no spend, no machine verdict).
  // The DB trigger apply_relevance_override enforces the same at the row boundary; this is the spend gate.
  const { data: ovRows, error: ovErr } = await args.supabase
    .from("claim_delta_relevance_overrides")
    .select("content_identity, verdict, reason, decided_at, superseded_by")
    .eq("company_id", args.companyId)
    .eq("pairing_kind", pairingKind); // live = superseded_by IS NULL, filtered below (a handful of rows per company)
  if (ovErr) return { ok: false, error: String(ovErr.message ?? ovErr) };
  const overrides = new Map<string, { verdict: "relevant" | "orthogonal"; reason: string; decided_at: string }>();
  for (const o of (ovRows ?? []) as Array<{ content_identity: string; verdict: string; reason: string; decided_at: string; superseded_by: string | null }>) {
    if (o.superseded_by == null && (o.verdict === "relevant" || o.verdict === "orthogonal")) overrides.set(o.content_identity, { verdict: o.verdict, reason: o.reason, decided_at: o.decided_at });
  }

  const totals = { examined: rows.length, overridden: 0, auto_relevant: 0, router_orthogonal: 0, judged_relevant: 0, judged_orthogonal: 0, remaining: 0 };
  const proposals: RelevanceProposal[] = [];
  const dryRun = args.dryRun === true;
  if (rows.length === 0) {
    // Nothing left to judge for this company/kind — record the drained (completed) state.
    if (args.write && !dryRun) await writeRelevanceIntegrity(args.supabase, args.companyId, args.nowIso, pairingKind, args.runRef);
    return { ok: true, totals, proposals, dry_run: dryRun };
  }

  // Fetch the statement text for every referenced claim in one shot.
  const claimIds = [...new Set(rows.flatMap((r) => [r.declared_claim_id, r.public_claim_id]))];
  const { data: claimRows, error: cErr } = await args.supabase
    .from("claims").select("id, statement").in("id", claimIds);
  if (cErr) return { ok: false, error: String(cErr.message ?? cErr) };
  const stmt = new Map<string, string>(
    ((claimRows ?? []) as Array<{ id: string; statement: string }>).map((c) => [c.id, c.statement]),
  );

  // ── PRE-ROUTER — deterministic partition (cheap, no model), three ways by distinctiveOverlap:
  //   dov>=2  → auto-spare 'relevant' (strong same-subject overlap; unchanged Stage-A behavior).
  //   dov=0   → deterministic 'orthogonal' — zero distinctive tokens shared after stripping the
  //             company name/alias + generic words means the ONLY tie is the company itself (the
  //             entity-only co-mention class). The judge proved UNRELIABLE on this call (a 148/117
  //             coin-flip over 265 pairs — struck "Angie's list" but spared "GovCloud/FedRAMP"),
  //             so the router owns it: no judge call, an HONEST router reason (never a fabricated
  //             judge sentence). Rare pure-synonym same-subject dov=0 pairs are over-struck here —
  //             a bounded, reviewable, reversible set surfaced for human review before a LIVE
  //             client's strikes stand (the CB2 capability).
  //   dov=1   → the V3 judge (the ONLY thing it sees), where it judges same-subject-vs-different-
  //             subject reliably (keeps the DFW case relevant, catches funding/listing co-mentions).
  const ROUTER_DOV0_REASON = "no distinctive token shared with the claim";
  type Job = { r: typeof rows[number]; declared: string; observed: string; overlap: number; tokens: string[] };
  const judgeJobs: Job[] = [];
  for (const r of rows) {
    const declared = stmt.get(r.declared_claim_id) ?? "";
    const observed = stmt.get(r.public_claim_id) ?? "";
    // OPERATOR OVERRIDE wins — stamped from the decision, never routed, never judged.
    const ov = overrides.get(r.content_identity);
    if (ov) {
      if (!dryRun) {
        await stampRelevance(args, r.id, { verdict: ov.verdict, reason: ov.reason, span: "", model: "operator_override", provider: "operator", judgedAt: ov.decided_at });
      }
      totals.overridden++;
      proposals.push({
        id: r.id, delta_type: r.delta_type, declared, observed,
        proposed_verdict: ov.verdict, stage: "O",
        distinctive_overlap: 0, distinctive_tokens: [],
        reason: ov.reason, span: "", model: "operator_override", provider: "operator",
      });
      continue;
    }
    const routeA = stageARoute(declared, observed, entities);
    if (routeA.distinctiveOverlap >= 2) {
      const reason = `distinctive-overlap>=2 {${routeA.distinctiveTokens.join(",")}}`.slice(0, 400);
      if (!dryRun) {
        await stampRelevance(args, r.id, { verdict: "relevant", reason, span: "", model: "router", provider: "deterministic" });
      }
      totals.auto_relevant++;
      proposals.push({
        id: r.id, delta_type: r.delta_type, declared, observed,
        proposed_verdict: "relevant", stage: "A",
        distinctive_overlap: routeA.distinctiveOverlap, distinctive_tokens: routeA.distinctiveTokens,
        reason, span: "", model: "router", provider: "deterministic",
      });
      continue;
    }
    if (routeA.distinctiveOverlap === 0) {
      if (!dryRun) {
        await stampRelevance(args, r.id, { verdict: "orthogonal", reason: ROUTER_DOV0_REASON, span: "", model: "router", provider: "deterministic" });
      }
      totals.router_orthogonal++;
      proposals.push({
        id: r.id, delta_type: r.delta_type, declared, observed,
        proposed_verdict: "orthogonal", stage: "A",
        distinctive_overlap: 0, distinctive_tokens: [],
        reason: ROUTER_DOV0_REASON, span: "", model: "router", provider: "deterministic",
      });
      continue;
    }
    // dov === 1 → the judge (the only pairs it ever sees).
    judgeJobs.push({ r, declared, observed, overlap: routeA.distinctiveOverlap, tokens: routeA.distinctiveTokens });
  }

  const provenances = ["public_observed", "public_observed"]; // pairing_kind guarantees both public
  const judgeOne = async (j: Job): Promise<RelevanceProposal> => {
    const res = await args.routedCall({ role: "judge", provenances, system: RELEVANCE_JUDGE_SYSTEM, user: buildRelevanceUser(j.declared, j.observed) });
    const parsed = parseRelevance(res.content);
    return {
      id: j.r.id, delta_type: j.r.delta_type, declared: j.declared, observed: j.observed,
      proposed_verdict: parsed.relevance, stage: "B",
      distinctive_overlap: j.overlap, distinctive_tokens: j.tokens,
      reason: parsed.reason.slice(0, 400) || null,
      span: parsed.relevance === "relevant" ? (parsed.span || "") : "",
      model: res.model, provider: res.provider,
    };
  };

  if (dryRun) {
    // ── STAGE B (report-only) — bounded concurrency, NO writes, NO cap: judge every row. ──
    const limit = Math.max(1, Math.min(args.dryRunConcurrency ?? 6, judgeJobs.length));
    let next = 0;
    const workers = Array.from({ length: limit }, async () => {
      for (;;) {
        const i = next++;
        if (i >= judgeJobs.length) return;
        const p = await judgeOne(judgeJobs[i]);
        proposals.push(p);
        if (p.proposed_verdict === "relevant") totals.judged_relevant++; else totals.judged_orthogonal++;
      }
    });
    await Promise.all(workers);
    return { ok: true, totals, proposals, dry_run: true };
  }

  // ── STAGE B (stamp) — sequential (writes), isolate-cap via maxJudge, resumable. ──
  let judgedCount = 0;
  for (const j of judgeJobs) {
    if (args.maxJudge !== undefined && judgedCount >= args.maxJudge) { totals.remaining++; continue; }
    const p = await judgeOne(j);
    judgedCount++;
    await stampRelevance(args, j.r.id, {
      verdict: p.proposed_verdict,
      reason: p.reason,
      span: p.proposed_verdict === "relevant" ? (p.span || null) : null,
      model: p.model, provider: p.provider,
    });
    proposals.push(p);
    if (p.proposed_verdict === "relevant") totals.judged_relevant++; else totals.judged_orthogonal++;
  }

  // Ledger only a fully-drained company (remaining === 0) as 'completed' — mirrors the
  // gap-pairs integrity pattern (written after the work). A capped/partial invocation writes
  // no integrity row; the next invocation that drains the company records the completion.
  if (args.write && totals.remaining === 0) {
    await writeRelevanceIntegrity(args.supabase, args.companyId, args.nowIso, pairingKind, args.runRef);
  }
  return { ok: true, totals, proposals, dry_run: false };
}

async function stampRelevance(
  args: RelevanceArgs,
  deltaId: string,
  v: { verdict: "relevant" | "orthogonal"; reason: string | null; span: string | null; model: string; provider: string; judgedAt?: string },
): Promise<void> {
  if (!args.write) return;
  // UPDATE of overlay columns ONLY — never insert/delete a claim_deltas row.
  const { error } = await args.supabase.from("claim_deltas").update({
    relevance_verdict: v.verdict,
    relevance_reason: v.reason,
    relevance_span: v.span,
    relevance_model: v.model,
    relevance_provider: v.provider,
    relevance_judged_at: v.judgedAt ?? args.nowIso,
  }).eq("id", deltaId);
  if (error) throw new Error(`relevance overlay update failed (${deltaId}): ${error.message}`);
}

// CUMULATIVE ledger: written only when a company is fully drained (remaining === 0), so it queries
// the company's ACTUAL stamped counts from claim_deltas rather than this invocation's local totals —
// a chunked company (many invocations) then gets ONE honest company-wide row, not the last chunk's.
async function writeRelevanceIntegrity(
  supabase: { from: (t: string) => any },
  companyId: string,
  nowIso: string,
  pairingKind: string,
  runRef?: string,
): Promise<void> {
  const { data: rows, error: qErr } = await supabase
    .from("claim_deltas")
    .select("relevance_verdict, relevance_model, relevance_provider")
    .eq("company_id", companyId)
    .eq("pairing_kind", pairingKind)
    .in("delta_type", ["echoed", "divergent"]);
  if (qErr) throw new Error(`relevance integrity count query failed: ${qErr.message}`);
  const r = (rows ?? []) as Array<{ relevance_verdict: string | null; relevance_model: string | null; relevance_provider: string | null }>;
  const examined = r.length;
  const isOp = (x: { relevance_provider: string | null }) => x.relevance_provider === "operator";
  const operatorRelevant = r.filter((x) => isOp(x) && x.relevance_verdict === "relevant").length;
  const operatorOrthogonal = r.filter((x) => isOp(x) && x.relevance_verdict === "orthogonal").length;
  const routerOrthogonal = r.filter((x) => !isOp(x) && x.relevance_verdict === "orthogonal" && x.relevance_model === "router").length;
  const judgedOrthogonal = r.filter((x) => !isOp(x) && x.relevance_verdict === "orthogonal" && x.relevance_model !== "router").length;
  const autoRelevant = r.filter((x) => !isOp(x) && x.relevance_verdict === "relevant" && x.relevance_model === "router").length;
  const judgedRelevant = r.filter((x) => !isOp(x) && x.relevance_verdict === "relevant" && x.relevance_model !== "router").length;
  const orthogonal = routerOrthogonal + judgedOrthogonal + operatorOrthogonal;
  const { error } = await supabase.from("integrity_runs").insert({
    company_id: companyId,
    component: RELEVANCE_INTEGRITY_COMPONENT,
    surface_type: null,
    surface_id: null,
    ran_at: nowIso,
    status: "completed", // only called on a fully-drained company (see caller guard)
    examined,
    admitted: orthogonal, // 'admitted' reused as: rows struck orthogonal (router dov=0 + judge dov=1)
    excluded_by_rule: { // jsonb: the company-wide strike/spare breakdown by stage
      orthogonal,
      router_orthogonal: routerOrthogonal, // deterministic dov=0
      judged_orthogonal: judgedOrthogonal,  // dov=1 judge strikes
      spared: autoRelevant + judgedRelevant + operatorRelevant,
      auto_relevant: autoRelevant,          // dov>=2 auto-spare
      judged_relevant: judgedRelevant,      // dov=1 judge spares
      // OPERATOR OVERRIDE (2026-09-03): decisions from claim_delta_relevance_overrides, never routed/judged
      overridden: operatorRelevant + operatorOrthogonal,
      operator_relevant: operatorRelevant,
      operator_orthogonal: operatorOrthogonal,
    },
    error: null,
    run_ref: runRef ?? nowIso,
  });
  if (error) throw new Error(`relevance integrity insert failed: ${error.message}`);
}
