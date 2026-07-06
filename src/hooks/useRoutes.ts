import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchLensRouteRefs } from "@/lib/lensResolution";

type StoredDetailItem = {
  id: string;
  title: string;
  status: "complete" | "in_progress" | "missing";
};

export type RouteAssumption = {
  id: string;
  statement: string;
  status: "unproven" | "partial" | "supported";
  layer: "outside" | "org" | "customer" | "market";
  critical?: boolean;
  evidence_refs?: string[];
};

export type RouteEvidenceSnippet = {
  text: string;
  source_file_id?: string | null;
  source_label?: string | null;
  confidence?: "direct" | "inferred";
};

export type RouteInsightsJson = {
  pressure?: string | null;
  pressure_short?: string | null;
  evidence_snippets?: RouteEvidenceSnippet[] | null;
  uncertainty?: string | null;
  weakening_conditions?: string[] | null;
  prerequisites?: string[] | null;
  customer_impact?: string | null;
  operational_impact?: string | null;
  confidence_posture?: string | null;
  movement_condition?: string | null;
};

export type RouteRow = {
  id: string;
  company_id: string;
  category: "fix" | "improve" | "create" | string;
  title: string;
  short_description?: string | null;
  claim_id?: string | null;
  frameworks_used?: string[] | null;
  pts_value?: number | null;
  effort?: string | null;
  type?: string | null;
  sort_order?: number | null;
  steps_json?: StoredDetailItem[] | null;
  evidence_json?: StoredDetailItem[] | null;
  why_this_matters_json?: string[] | null;
  assumptions_json?: RouteAssumption[] | null;
  dependency_state?: string | null;
  validation_state?: string | null;
  evidence_state?: string | null;
  stale_reason?: string | null;
  updated_at?: string | null;
  created_at?: string;
  // Phase 79 evidence graph fields
  route_insights_json?: RouteInsightsJson | null;
  source_file_ids?: string[] | null;
  linked_tension_ids?: string[] | null;
  linked_need_ids?: string[] | null;
  // A5 hierarchy fields
  level?: 'route' | 'leg' | 'action' | string | null;
  parent_id?: string | null;
  relevance_state?: 'active' | 'deprioritized' | string | null;
  rejected_alternatives?: Array<{ alternative_title: string; rejection_reason: string; considered_at?: string }> | null;
  what_would_have_to_be_true?: Array<{ condition: string; satisfied_flag: boolean; evidence_refs?: string[] }> | null;
  primary_desired_outcome_id?: string | null;
  provenance_type?: string | null;
  // A67 strategy-alignment evaluation
  strategy_alignment?: "aligned" | "off_strategy" | "unknown" | null;
  strategy_alignment_reason?: string | null;
  strategy_alignment_evaluated_at?: string | null;
};

// focusJourneyKey (lens reads gate): when a lens focus is passed AND the company
// has a lens row for it, items are scoped to that lens's route_lens_refs (legs ride
// with their referenced parent route). lensRouteState tells the consumer which
// regime it got:
//   "no-lens"    — no focus, or no lens row for the key ⇒ legacy company pool
//   "scoped"     — lens focus active, items = the lens's referenced routes
//   "unassessed" — lens exists but has ZERO refs ⇒ items=[] and the surface must
//                  render an honest "no routes assessed for this market yet",
//                  NEVER the company pool.
export function useRoutes(companyId?: string, refreshKey = 0, focusJourneyKey?: string) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<RouteRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lensRouteState, setLensRouteState] = useState<"no-lens" | "scoped" | "unassessed">("no-lens");

  useEffect(() => {
    if (!companyId) {
      setItems([]);
      setError(null);
      setLoading(false);
      setLensRouteState("no-lens");
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      setLoading(true);
      setError(null);

      // Resolve the focused lens's referenced route ids up front (read-only).
      const lensRefs = focusJourneyKey
        ? await fetchLensRouteRefs(companyId, focusJourneyKey)
        : null;
      if (cancelled) return;

      let { data, error } = await supabase
        .from("routes")
        .select("*")
        .abortSignal(controller.signal)
        .eq("company_id", companyId)
        .eq("relevance_state", "active")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(500);

      if (cancelled) return;
      if (controller.signal.aborted) return;

      if (error) {
        // DB-error fallback path is NOT lens-scoped — report no-lens so consumers
        // render it as the legacy pool, not as a lens's routes.
        setLensRouteState("no-lens");
        const { data: opps, error: oppError } = await supabase
          .from("opportunities")
          .select(
            "id, company_id, outcome, step_number, step_label, journey_key, opportunity_score, priority_tier, importance, satisfaction, created_at"
          )
          .eq("company_id", companyId)
          .order("opportunity_score", { ascending: false })
          .limit(18);

        if (cancelled) return;

        if (oppError) {
          setError(error.message);
          setItems([]);
        } else {
          const derived = ((opps ?? []) as Array<{
            id: string;
            company_id: string;
            outcome: string;
            step_number: number | null;
            step_label: string | null;
            journey_key: string;
            opportunity_score: number | null;
            priority_tier: string;
            importance: number | null;
            satisfaction: number | null;
            created_at?: string;
          }>).map((opp, index) => {
            const category =
              opp.priority_tier === "focus"
                ? "fix"
                : opp.priority_tier === "monitor"
                  ? "improve"
                  : "create";

            const effort =
              (opp.opportunity_score ?? 0) >= 13
                ? "high"
                : (opp.opportunity_score ?? 0) >= 9
                  ? "medium"
                  : "low";

            return {
              id: `derived-${opp.id}`,
              company_id: opp.company_id,
              category,
              title: opp.outcome || "Untitled route",
              short_description:
                `${opp.journey_key} journey` +
                (opp.step_label ? `, step ${opp.step_number ?? "?"}: ${opp.step_label}. ` : ". ") +
                `Derived from opp score ${opp.opportunity_score ?? "?"}; importance ${opp.importance ?? "?"}, satisfaction ${opp.satisfaction ?? "?"}.`,
              pts_value: Math.max(1, Math.min(10, Math.round((opp.opportunity_score ?? 1) / 2))),
              effort,
              type: category === "fix" ? "Fix" : category === "create" ? "Create" : "Improve",
              sort_order: index + 1,
              created_at: opp.created_at,
            } satisfies RouteRow;
          });

          setItems(derived);
          setError(null);
        }
      } else {
        let routeRows = ((data as RouteRow[]) ?? []).map((route) => ({
          ...route,
          assumptions_json: route.assumptions_json ?? null,
          dependency_state: route.dependency_state ?? null,
          validation_state: route.validation_state ?? null,
          evidence_state: route.evidence_state ?? null,
          stale_reason: route.stale_reason ?? null,
          updated_at: route.updated_at ?? null,
        }));

        // Lens scoping: keep routes referenced into the focused lens, plus their
        // legs (parent_id riding along — R2: one route row, one leg tree). A lens
        // with zero refs yields the honest empty state, never the company pool
        // and never the opportunities fallback (those are unassessed too).
        if (lensRefs?.lens && lensRefs.referencedRouteIds) {
          const refIds = lensRefs.referencedRouteIds;
          routeRows = routeRows.filter(
            (r) => refIds.has(String(r.id)) || (r.parent_id && refIds.has(String(r.parent_id))),
          );
          setLensRouteState(refIds.size === 0 ? "unassessed" : "scoped");
          setItems(routeRows);
          setError(null);
          setLoading(false);
          return;
        }
        setLensRouteState("no-lens");

        if (routeRows.length > 0) {
          setItems(routeRows);
        } else {
          const { data: opps, error: oppError } = await supabase
            .from("opportunities")
            .select(
              "id, company_id, outcome, step_number, step_label, journey_key, opportunity_score, priority_tier, importance, satisfaction, created_at"
            )
            .eq("company_id", companyId)
            .order("opportunity_score", { ascending: false })
            .limit(18);

          if (cancelled) return;

          if (oppError) {
            setItems([]);
          } else {
            const derived = ((opps ?? []) as Array<{
              id: string;
              company_id: string;
              outcome: string;
              step_number: number | null;
              step_label: string | null;
              journey_key: string;
              opportunity_score: number | null;
              priority_tier: string;
              importance: number | null;
              satisfaction: number | null;
              created_at?: string;
            }>).map((opp, index) => {
              const category =
                opp.priority_tier === "focus"
                  ? "fix"
                  : opp.priority_tier === "monitor"
                    ? "improve"
                    : "create";

              const effort =
                (opp.opportunity_score ?? 0) >= 13
                  ? "high"
                  : (opp.opportunity_score ?? 0) >= 9
                    ? "medium"
                    : "low";

              return {
                id: `derived-${opp.id}`,
                company_id: opp.company_id,
                category,
                title: opp.outcome || "Untitled route",
                short_description:
                  `${opp.journey_key} journey` +
                  (opp.step_label ? `, step ${opp.step_number ?? "?"}: ${opp.step_label}. ` : ". ") +
                  `Derived from opp score ${opp.opportunity_score ?? "?"}; importance ${opp.importance ?? "?"}, satisfaction ${opp.satisfaction ?? "?"}.`,
                pts_value: Math.max(1, Math.min(10, Math.round((opp.opportunity_score ?? 1) / 2))),
                effort,
                type: category === "fix" ? "Fix" : category === "create" ? "Create" : "Improve",
                sort_order: index + 1,
                created_at: opp.created_at,
              } satisfies RouteRow;
            });

            setItems(derived);
          }
        }
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, refreshKey, focusJourneyKey]);

  return { loading, items, error, lensRouteState };
}
