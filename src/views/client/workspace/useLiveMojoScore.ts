// The LIVE Mojo Score — EXTRACTED verbatim from the home (ClientRefinePreviewView `liveMojoScore`,
// port 2a fix 1, 2026-09-11): computeMojoScore over the company's claims, routes (all levels) and
// needs (unscoped). One home: the home imports this hook and its rendered numerals stay byte-identical
// (spec g); the workspace Routes strip and Evidence-unlock band bind to the same value.
import { useMemo } from "react";
import type { ClaimRow } from "@/lib/claims/useCompanyClaims";
import type { RouteRow } from "@/hooks/useRoutes";
import type { OdiNeedRow } from "@/hooks/useOdiNeeds";
import type { MojoScoreResult } from "@/lib/mojoScore/types";
import { computeMojoScore } from "@/lib/mojoScore/computeMojoScore";

export function useLiveMojoScore(
  companyId: string | undefined,
  claimsMap: Map<string, ClaimRow>,
  routes: RouteRow[],
  needs: OdiNeedRow[] | undefined,
): MojoScoreResult | null {
  return useMemo((): MojoScoreResult | null => {
    // Score computes for every company now (computeMojoScore handles empty data);
    // null only when there is no active company.
    if (!companyId) return null;
    return computeMojoScore({
      companyId,
      claims: Array.from(claimsMap.values()).map((c) => ({
        id: c.id, state: c.state, claim_type: c.claim_type, topic: c.topic,
        outside_support_count: c.outside_support_count,
        organization_support_count: c.organization_support_count,
        customer_support_count: c.customer_support_count,
        updated_at: c.updated_at,
      })),
      routes: routes.map((r) => ({
        id: r.id, category: r.category, level: r.level ?? null, parent_id: r.parent_id ?? null,
        steps_json: (Array.isArray(r.steps_json) ? r.steps_json : null) as Array<{ id: string; title: string; status: string }> | null,
        evidence_json: (Array.isArray(r.evidence_json) ? r.evidence_json : null) as Array<{ id: string; title: string; status: string }> | null,
        why_this_matters_json: Array.isArray(r.why_this_matters_json) ? r.why_this_matters_json as string[] : null,
        rejected_alternatives: Array.isArray(r.rejected_alternatives) ? r.rejected_alternatives : null,
        what_would_have_to_be_true: Array.isArray(r.what_would_have_to_be_true) ? r.what_would_have_to_be_true : null,
        linked_need_ids: Array.isArray(r.linked_need_ids) ? r.linked_need_ids : null,
        updated_at: r.updated_at ?? null,
      })),
      needs: (needs ?? []).map((n) => ({
        id: n.id, desired_outcome: n.desired_outcome, importance: n.importance,
        satisfaction: n.satisfaction, opportunity_score: n.opportunity_score,
        service_state: n.service_state, updated_at: n.updated_at ?? null,
      })),
      computedAt: new Date().toISOString(),
    });
  }, [companyId, claimsMap, routes, needs]);
}
