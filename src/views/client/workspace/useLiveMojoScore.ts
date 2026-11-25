// The LIVE Mojo Score — EXTRACTED verbatim from the home (ClientRefinePreviewView `liveMojoScore`,
// port 2a fix 1, 2026-09-11): computeMojoScore over the company's claims, routes (all levels) and
// needs (unscoped). One home: the home imports this hook and its rendered numerals stay byte-identical
// (spec g); the workspace Routes strip and Evidence-unlock band bind to the same value.
import { useEffect, useMemo, useState } from "react";
import type { ClaimRow } from "@/lib/claims/useCompanyClaims";
import type { RouteRow } from "@/hooks/useRoutes";
import type { OdiNeedRow } from "@/hooks/useOdiNeeds";
import type { MojoScoreResult } from "@/lib/mojoScore/types";
import { computeMojoScore } from "@/lib/mojoScore/computeMojoScore";
import { claimCounts, scoreInputSet } from "@/lib/mojoScore/types";
import { useCompanyClaims } from "@/lib/claims/useCompanyClaims";
import { useRoutes } from "@/hooks/useRoutes";
import { useOdiNeeds } from "@/hooks/useOdiNeeds";

/** ── THE SCORE'S CLOCK, AND THE ONE DOOR TESTS MAY OPEN IN IT ──────────────────────────────────
 *  The score is computed live, and one contributor — evidence_freshness — is a STEP FUNCTION on
 *  days-since-update (7 / 30 / 90 / 180 / 365). That is correct product behaviour: a score standing
 *  on stale evidence SHOULD fall on its own. It also means the number changes with no code and no
 *  data change, which no pinned test can survive: on 2026-09-24, 27 of Edgewood's 117 scored items
 *  crossed the 7-day step together and the pinned 28 became 27.
 *
 *  Freezing the BROWSER's clock was tried first and cannot work here: the page authenticates with a
 *  short-lived token validated against the real clock, so a fixed timestamp falls outside the usable
 *  window within about an hour and the page loads with no session at all.
 *
 *  So the score — and only the score — takes its `now` from a test-only override, and ONLY in a
 *  DEVELOPMENT BUILD. `import.meta.env.DEV` is the estate's development-build flag (already the
 *  gate on the window.supabase handle, the localhost auth door and the preview flag), and Vite
 *  replaces it with a literal `false` at build time, so in any built artefact the branch below is
 *  dead code and the real clock is the only clock. Auth, DAY and every other clock stay real even
 *  in dev; this decides `computedAt` and nothing else.
 *
 *  Precedent for both halves: strikePreview.ts takes `computedAt` as a parameter for exactly this
 *  determinism, and useJobMapGeneration.ts reads window.__FR_JOBMAP_GEN_BOUND_MS the same way. */
export const SCORE_NOW_OVERRIDE_KEY = "__FR_SCORE_NOW";

/** The instant the score is computed at. The override is honoured only in a development build, and
 *  only when it parses to a real date — a typo falls back to the real clock rather than to 1970. */
export function scoreComputedAt(): string {
  if (!import.meta.env.DEV) return new Date().toISOString();
  const raw = typeof window === "undefined"
    ? undefined
    : (window as unknown as Record<string, unknown>)[SCORE_NOW_OVERRIDE_KEY];
  if (typeof raw === "string" || typeof raw === "number") {
    const t = new Date(raw).getTime();
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  return new Date().toISOString();
}

/** The live score's claim set — struck out, minimized in. The rule itself is claimCounts, in the one
 *  definition of the score's inputs (src/lib/mojoScore/types.ts). */
export function excludeStruck<T extends { status?: string | null }>(claims: T[]): T[] {
  return claims.filter(claimCounts);
}

/** The rows the live score counts, out of what the page's three reads returned: the ONE input rule
 *  (scoreInputSet). Exported so a test can hold it against what the server's writer reads. */
export function liveScoreInputs(claimsMap: Map<string, ClaimRow>, routes: RouteRow[], needs: OdiNeedRow[] | undefined) {
  return scoreInputSet({ claims: Array.from(claimsMap.values()), routes, needs: needs ?? [] });
}

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
    // SP-478: the ONE input rule (scoreInputSet) — the same three predicates snapshotMojoScore
    // applies. STRIKE LAW (Gate A, 2026-09-14) is its claim predicate: struck claims stop counting
    // everywhere, minimized claims keep counting.
    const inputs = liveScoreInputs(claimsMap, routes, needs);
    return computeMojoScore({
      companyId,
      claims: inputs.claims.map((c) => ({
        id: c.id, state: c.state, claim_type: c.claim_type, topic: c.topic,
        outside_support_count: c.outside_support_count,
        organization_support_count: c.organization_support_count,
        customer_support_count: c.customer_support_count,
        updated_at: c.updated_at,
      })),
      routes: inputs.routes.map((r) => ({
        id: r.id, category: r.category, level: r.level ?? null, parent_id: r.parent_id ?? null,
        steps_json: (Array.isArray(r.steps_json) ? r.steps_json : null) as Array<{ id: string; title: string; status: string }> | null,
        evidence_json: (Array.isArray(r.evidence_json) ? r.evidence_json : null) as Array<{ id: string; title: string; status: string }> | null,
        why_this_matters_json: Array.isArray(r.why_this_matters_json) ? r.why_this_matters_json as string[] : null,
        rejected_alternatives: Array.isArray(r.rejected_alternatives) ? r.rejected_alternatives : null,
        what_would_have_to_be_true: Array.isArray(r.what_would_have_to_be_true) ? r.what_would_have_to_be_true : null,
        linked_need_ids: Array.isArray(r.linked_need_ids) ? r.linked_need_ids : null,
        updated_at: r.updated_at ?? null,
      })),
      needs: inputs.needs.map((n) => ({
        id: n.id, desired_outcome: n.desired_outcome, importance: n.importance,
        satisfaction: n.satisfaction, opportunity_score: n.opportunity_score,
        service_state: n.service_state, updated_at: n.updated_at ?? null,
      })),
      computedAt: scoreComputedAt(),
    });
  }, [companyId, claimsMap, routes, needs]);
}

/** SP-478 (SP-682 ruling 2): the live score for a surface that holds none of the three reads itself —
 *  the client decision view. It makes the same three reads the home makes (useCompanyClaims,
 *  useRoutes, useOdiNeeds) and binds them to the one hook, so it shows the number the home shows.
 *  `ready` is false until all three reads have returned: before that there is no score to show, and a
 *  score computed from a partly loaded set would be a wrong number on screen for a moment. */
export function useCompanyLiveMojoScore(companyId: string | undefined): { score: MojoScoreResult | null; ready: boolean } {
  const { claims: claimsMap, loading: claimsLoading } = useCompanyClaims(companyId);
  const { items: routes, loading: routesLoading } = useRoutes(companyId);
  const { needs, loading: needsLoading } = useOdiNeeds(companyId);
  const score = useLiveMojoScore(companyId, claimsMap, routes, needs);
  // "Not loading" is not "loaded": each read reports loading=false before its first request starts.
  // So ready means the reads were SEEN loading for this company and have since all returned.
  const loading = claimsLoading || routesLoading || needsLoading;
  const [sawLoadingFor, setSawLoadingFor] = useState<string | null>(null);
  const [settledFor, setSettledFor] = useState<string | null>(null);
  useEffect(() => {
    if (!companyId) return;
    if (loading) setSawLoadingFor(companyId);
    else if (sawLoadingFor === companyId) setSettledFor(companyId);
  }, [companyId, loading, sawLoadingFor]);
  const ready = Boolean(companyId) && settledFor === companyId && !loading;
  return { score: ready ? score : null, ready };
}
