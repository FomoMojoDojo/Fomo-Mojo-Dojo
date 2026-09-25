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

/** The live score's claim set: the server's rule, verbatim — struck out, minimized in. */
export function excludeStruck<T extends { status?: string | null }>(claims: T[]): T[] {
  return claims.filter((c) => c.status !== "struck");
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
    return computeMojoScore({
      companyId,
      // STRIKE LAW (Gate A, 2026-09-14): struck claims stop counting EVERYWHERE — the home's live score
      // mirrors snapshotMojoScore exactly (.neq("status","struck")); minimized claims keep counting
      // (display-only de-emphasis). Before this the home counted every struck claim the server excluded.
      claims: excludeStruck(Array.from(claimsMap.values())).map((c) => ({
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
      computedAt: scoreComputedAt(),
    });
  }, [companyId, claimsMap, routes, needs]);
}
