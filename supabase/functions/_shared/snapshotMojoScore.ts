// ── Mojo Score Snapshot + Companies Write-back ───────────────────────────────
//
// Reads current claims/routes/needs, computes the live mojo score, inserts a
// history row into mojo_scores, and writes the fresh headline numbers back to
// companies so every consumer that reads companies.mojo_score (the compass,
// analytics, client views, admin panels) immediately reflects the live value.
//
// Errors are caught and logged; a snapshot failure is non-fatal.
//
// SCORE-2 projection unification — one meaning per column:
//   companies.potential_score = REACHABLE   (computeReachableScore: what
//     internal foundation work alone can add, contributor-headroom based)
//   companies.projected_score = DESTINATION (computeUnlockableScore: reachable
//     plus what customer research unlocks)
// These are the SAME definitions the surfaces render and explain
// (MojoScoreStrip, HomepageHierarchy), replacing the old evidence-band-cap
// formula that gave the columns a second, unexplained meaning.
//
// Call from any edge function that mutates claims, routes, or needs:
//   await snapshotMojoScore(supabase, companyId);

import { computeMojoScore } from "../../../src/lib/mojoScore/computeMojoScore.ts";
import {
  computeReachableScore,
  computeUnlockableScore,
} from "../../../src/lib/mojoScore/projections.ts";
import type { ClaimInput, RouteInput, NeedInput } from "../../../src/lib/mojoScore/types.ts";

// Structural client type (matches the sibling _shared modules): the generated
// DB types don't cover mojo_scores/companies mutations from this path, and the
// generic supabase-js client degrades those calls to `never`.
// deno-lint-ignore no-explicit-any
type SupabaseClient = { from: (table: string) => any };

// ── Main snapshot function ────────────────────────────────────────────────────

export async function snapshotMojoScore(
  supabase: SupabaseClient,
  companyId: string,
): Promise<void> {
  try {
    const [claimsResult, routesResult, needsResult] = await Promise.all([
      supabase
        .from("claims")
        .select("id, state, claim_type, topic, outside_support_count, organization_support_count, customer_support_count, updated_at")
        .eq("company_id", companyId),
      supabase
        .from("routes")
        .select("id, category, level, parent_id, claim_id, steps_json, evidence_json, why_this_matters_json, rejected_alternatives, what_would_have_to_be_true, linked_need_ids, updated_at")
        .eq("company_id", companyId),
      supabase
        .from("odi_needs")
        .select("id, desired_outcome, importance, satisfaction, opportunity_score, service_state, updated_at")
        .eq("company_id", companyId),
    ]);

    const claims = (claimsResult.data ?? []) as ClaimInput[];
    const routes = (routesResult.data ?? []) as RouteInput[];
    const needs  = (needsResult.data  ?? []) as NeedInput[];

    const result = computeMojoScore({ companyId, claims, routes, needs, computedAt: new Date().toISOString() });

    // ── Insert history row into mojo_scores ───────────────────────────────────
    const componentScores: Record<string, unknown> = {};
    const explanationPayload: Record<string, unknown> = {};
    for (const c of result.contributors) {
      componentScores[c.key] = { score: c.score, weight: c.weight, weighted: c.weighted, sub_scores: c.sub_scores ?? {} };
      explanationPayload[c.key] = { label: c.label, explanation: c.explanation };
    }
    explanationPayload["projected_raisers"] = result.projected_raisers;
    explanationPayload["engagement_state"]  = result.engagement_state;

    await supabase
      .from("mojo_scores")
      .insert({
        company_id:          result.company_id,
        computed_at:         result.computed_at,
        total_score:         result.total_score,
        component_scores:    componentScores,
        explanation:         explanationPayload,
        methodology_version: result.methodology_version,
      });

    // ── Write-back to companies ───────────────────────────────────────────────
    // companies.mojo_score is now the live value so every consumer that reads
    // it (compass, analytics, client views, admin panels) reflects the honest
    // grounded score without any hook changes.
    //
    // SCORE-2: potential_score = REACHABLE, projected_score = DESTINATION —
    // the projections.ts contributor-headroom definitions, identical to what
    // the score surfaces compute and explain.
    const potential_score = computeReachableScore(result);
    const projected_score = computeUnlockableScore(potential_score, result);

    const { error: writeErr } = await supabase
      .from("companies")
      .update({
        mojo_score:      result.total_score,
        potential_score,
        projected_score,
      })
      .eq("id", companyId);

    if (writeErr) {
      console.error("[snapshotMojoScore] companies write-back failed:", writeErr.message);
    } else {
      console.log(
        `[snapshotMojoScore] company: ${companyId} | live score: ${result.total_score} | reachable→potential: ${potential_score} | destination→projected: ${projected_score}`,
      );
    }

    // ── Write claim_evidence_pct into area_scores_json (RMW, preserves all keys) ─
    // Weights: outside_view=0, diagnose=33, focus=67, flow=100.
    // Written here from the claims already loaded; only claim_evidence_pct is added
    // (claim_state_distribution is intentionally NOT persisted from this path).
    const claimTotal = claims.length;
    let nDiagnose = 0, nFocus = 0, nFlow = 0;
    for (const c of claims) {
      if (c.state === "diagnose") nDiagnose++;
      else if (c.state === "focus") nFocus++;
      else if (c.state === "flow") nFlow++;
    }
    const claimEvidencePct: number | null = claimTotal > 0
      ? Math.round((nDiagnose * 33 + nFocus * 67 + nFlow * 100) / claimTotal)
      : null;

    if (claimEvidencePct !== null) {
      const { data: companyRow } = await supabase
        .from("companies")
        .select("area_scores_json")
        .eq("id", companyId)
        .maybeSingle();

      const existing =
        companyRow && typeof companyRow === "object" && "area_scores_json" in companyRow
          ? ((companyRow as { area_scores_json: unknown }).area_scores_json ?? {})
          : {};

      const merged = {
        ...(typeof existing === "object" && existing !== null ? existing : {}),
        claim_evidence_pct: claimEvidencePct,
      };

      const { error: asjErr } = await supabase
        .from("companies")
        .update({ area_scores_json: merged })
        .eq("id", companyId);

      if (asjErr) {
        console.error("[snapshotMojoScore] claim_evidence_pct write failed:", asjErr.message);
      } else {
        console.log(`[snapshotMojoScore] claim_evidence_pct=${claimEvidencePct} written for ${companyId}`);
      }
    }
  } catch (err) {
    console.error("[snapshotMojoScore] failed (non-fatal):", String((err as Error)?.message ?? err));
  }
}
