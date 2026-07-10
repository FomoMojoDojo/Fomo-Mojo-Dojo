// Strike Gate B: the −N score preview shown in the strike confirm.
//
// READ-ONLY and faithful by construction: the same three selects
// snapshotMojoScore issues (including the Gate A `.neq("status","struck")`
// claims filter) fed into the same computeMojoScore, run twice — as-is vs
// without the target claim. No write, no snapshot, no history row.
import { computeMojoScore } from "./computeMojoScore";
import type { ClaimInput, NeedInput, RouteInput } from "./types";

// Minimal structural client so tests can hand in a fake.
type QueryResult = { data: unknown; error: { message: string } | null };
type Query = PromiseLike<QueryResult> & {
  eq(col: string, v: unknown): Query;
  neq(col: string, v: unknown): Query;
};
type Db = { from(table: string): { select(cols: string): Query } };

export type StrikeScorePreview = {
  before: number;
  after: number;
  /** after − before; ≤ 0 whenever the claim was contributing. */
  delta: number;
};

export async function previewStrikeScoreDelta(
  db: Db,
  companyId: string,
  claimId: string,
): Promise<StrikeScorePreview> {
  const [claimsRes, routesRes, needsRes] = await Promise.all([
    db.from("claims")
      .select("id, state, claim_type, topic, outside_support_count, organization_support_count, customer_support_count, updated_at")
      .eq("company_id", companyId)
      .neq("status", "struck"),
    db.from("routes")
      .select("id, category, level, parent_id, claim_id, steps_json, evidence_json, why_this_matters_json, rejected_alternatives, what_would_have_to_be_true, linked_need_ids, updated_at")
      .eq("company_id", companyId),
    db.from("odi_needs")
      .select("id, desired_outcome, importance, satisfaction, opportunity_score, service_state, updated_at")
      .eq("company_id", companyId),
  ]);
  for (const r of [claimsRes, routesRes, needsRes]) {
    if (r.error) throw new Error(r.error.message);
  }
  const claims = (claimsRes.data ?? []) as ClaimInput[];
  const routes = (routesRes.data ?? []) as RouteInput[];
  const needs = (needsRes.data ?? []) as NeedInput[];
  const computedAt = new Date().toISOString();
  const before = computeMojoScore({ companyId, claims, routes, needs, computedAt }).total_score;
  const after = computeMojoScore({
    companyId,
    claims: claims.filter((c) => c.id !== claimId),
    routes,
    needs,
    computedAt,
  }).total_score;
  return { before, after, delta: after - before };
}
