// ── Mojo Score Snapshot + Companies Write-back ───────────────────────────────
//
// Reads current claims/routes/needs, computes the live mojo score, inserts a
// history row into mojo_scores, and writes the fresh headline numbers back to
// companies so every consumer that reads companies.mojo_score (the compass,
// analytics, client views, admin panels) immediately reflects the live value.
//
// Errors are caught and logged; a snapshot failure is non-fatal.
//
// Potential/projected are recomputed from the live total using the same caps as
// src/lib/scoring/mojoScore.ts::computePotentialProjected — inlined here because
// that file uses extensionless imports that Deno cannot resolve.
//
// Call from any edge function that mutates claims, routes, or needs:
//   await snapshotMojoScore(supabase, companyId);

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeMojoScore } from "../../../src/lib/mojoScore/computeMojoScore.ts";
import type { ClaimInput, RouteInput, NeedInput } from "../../../src/lib/mojoScore/types.ts";

type SupabaseClient = ReturnType<typeof createClient>;

// ── Evidence band from claim states ──────────────────────────────────────────
// Mirrors stateDistributionToBand in src/lib/claimState/distribution.ts exactly.

type EvidenceBand =
  | "hypothesis_only"
  | "directional_not_validated"
  | "customer_evidenced"
  | "market_validated"
  | "proven_path"
  | "sustained_performance";

function bandFromClaims(claims: Array<{ state: string }>): EvidenceBand {
  if (!claims.length) return "hypothesis_only";
  let focusCount = 0, flowCount = 0, diagnoseCount = 0;
  for (const c of claims) {
    if (c.state === "flow") flowCount++;
    else if (c.state === "focus") focusCount++;
    else if (c.state === "diagnose") diagnoseCount++;
  }
  const total = claims.length;
  const focusOrFlow = (focusCount + flowCount) / total;
  const flow = flowCount / total;
  const diagnoseOrAbove = (diagnoseCount + focusCount + flowCount) / total;
  if (focusOrFlow > 0.5 && flow > 0.3) return "proven_path";
  if (focusOrFlow > 0.5) return "customer_evidenced";
  if (focusOrFlow > 0.2 || diagnoseOrAbove > 0.5) return "directional_not_validated";
  return "hypothesis_only";
}

// ── Potential / projected computation ────────────────────────────────────────
// Mirrors computePotentialProjected in src/lib/scoring/mojoScore.ts exactly.
// Constants mirror BAND_REACHABLE_CAP / BAND_UNLOCKABLE_CAP in evidenceBands.ts.

const BAND_REACHABLE_CAP: Record<EvidenceBand, number> = {
  hypothesis_only: 5,
  directional_not_validated: 12,
  customer_evidenced: 18,
  market_validated: 22,
  proven_path: 22,
  sustained_performance: 22,
};

const BAND_UNLOCKABLE_CAP: Record<EvidenceBand, number> = {
  hypothesis_only: 10,
  directional_not_validated: 22,
  customer_evidenced: 32,
  market_validated: 38,
  proven_path: 42,
  sustained_performance: 42,
};

function clampN(n: number, min: number, max: number) { return Math.min(max, Math.max(min, n)); }

function computePotentialProjected(mojoScore: number, band: EvidenceBand) {
  const current = clampN(mojoScore, 0, 100);
  const headroom = 100 - current;
  const reachableCap = BAND_REACHABLE_CAP[band];
  const unlockableCap = BAND_UNLOCKABLE_CAP[band];
  const potential_score = Math.round(clampN(current + Math.min(reachableCap, headroom * 0.35), 0, 100));
  const projected_score = Math.round(clampN(
    Math.max(potential_score + Math.min(5, headroom * 0.1), current + Math.min(unlockableCap, headroom * 0.62)),
    0,
    100,
  ));
  return { potential_score, projected_score };
}

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
        .select("id, category, level, parent_id, steps_json, evidence_json, why_this_matters_json, rejected_alternatives, what_would_have_to_be_true, linked_need_ids, updated_at")
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

    // mojo_scores is not in the edge-function schema type; cast to bypass.
    await (supabase as ReturnType<typeof createClient> & { from: (t: string) => unknown })
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
    // potential_score / projected_score are recomputed anchored to the new
    // live total so the compass never shows a live current beside a
    // legacy-scale potential.
    const band = bandFromClaims(claims);
    const { potential_score, projected_score } = computePotentialProjected(result.total_score, band);

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
        `[snapshotMojoScore] company: ${companyId} | live score: ${result.total_score} | potential: ${potential_score} | projected: ${projected_score} | band: ${band}`,
      );
    }
  } catch (err) {
    console.error("[snapshotMojoScore] failed (non-fatal):", String((err as Error)?.message ?? err));
  }
}
