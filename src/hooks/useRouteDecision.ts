// ROUTE DECISION — the choose / clear bodies MOVED out of RoutesOrgPanel (handleSelectRoute /
// handleClearDecision, Routes Tier 1 lift, 2026-09-12): the same summary build (why reasons, evidence,
// step statuses → buildDecisionBullets), the same event-type choice (selected | changed | cleared) and
// the same two writes through lib/routeDecision (companies selection columns + route_decision_events).
// RoutesOrgPanel and the workspace Routes page both call this hook; no new write path exists.
import { useCallback, useEffect, useState } from "react";
import type { Company } from "@/hooks/useCompany";
import type { RouteRow } from "@/hooks/useRoutes";
import { deriveClientEvidence } from "@/lib/routeClientNarrative";
import { deriveClientWhyReasons } from "@/views/client/routes/shared";
import {
  buildDecisionBullets,
  clearSelectedRouteDecision,
  insertRouteDecisionEvent,
  persistSelectedRouteDecision,
} from "@/lib/routeDecision";

export type RouteDecision = {
  /** The chosen path (the panel's local mirror of companies.selected_route_id). */
  selectedRouteId: string | null;
  /** When the decision was saved (companies.selected_route_updated_at, or the click). */
  savedAt: string | null;
  /** Choose this route; choosing the already-chosen route clears it (the panel's toggle). */
  chooseRoute: (route: RouteRow) => Promise<void>;
  /** Clear the chosen path. */
  clearRoute: () => Promise<void>;
};

export function useRouteDecision(activeCompany: Company | null | undefined): RouteDecision {
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [decisionSavedAt, setDecisionSavedAt] = useState<string | null>(null);

  // Seeded from the company row — on a company switch, and whenever the row's own selection changes
  // (a caller that re-reads the row after the write sees the marker follow the read).
  useEffect(() => {
    setSelectedRouteId(activeCompany?.selected_route_id ?? null);
    setDecisionSavedAt(activeCompany?.selected_route_updated_at ?? null);
  }, [activeCompany?.id, activeCompany?.selected_route_id, activeCompany?.selected_route_updated_at]);

  const clearRoute = useCallback(async () => {
    const priorRouteId = selectedRouteId;
    const priorSummary = activeCompany?.selected_route_summary_json ?? {};
    setSelectedRouteId(null);
    setDecisionSavedAt(null);
    if (!activeCompany?.id) return;
    await clearSelectedRouteDecision(activeCompany.id);
    await insertRouteDecisionEvent(activeCompany.id, priorRouteId, "cleared", priorSummary);
  }, [activeCompany?.id, activeCompany?.selected_route_summary_json, selectedRouteId]);

  const chooseRoute = useCallback(async (route: RouteRow) => {
    if (selectedRouteId === route.id) { await clearRoute(); return; }
    const eventType = selectedRouteId ? "changed" : "selected";
    const now = new Date().toISOString();
    setSelectedRouteId(route.id);
    setDecisionSavedAt(now);
    if (!activeCompany?.id) return;
    const why      = deriveClientWhyReasons(route);
    const evidence = deriveClientEvidence(route);
    const steps    = (Array.isArray(route.steps_json) ? route.steps_json : []) as Array<{ status: string }>;
    const summary  = { bullets: buildDecisionBullets({ whyThisMatters: why, evidence, steps }, null), route_title: route.title, route_category: route.category };
    await persistSelectedRouteDecision(activeCompany.id, route.id, summary, now);
    await insertRouteDecisionEvent(activeCompany.id, route.id, eventType, summary);
  }, [activeCompany?.id, clearRoute, selectedRouteId]);

  return { selectedRouteId, savedAt: decisionSavedAt, chooseRoute, clearRoute };
}
