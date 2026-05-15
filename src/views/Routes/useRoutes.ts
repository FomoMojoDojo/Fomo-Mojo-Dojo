import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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
};

export function useRoutes(companyId?: string) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<RouteRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setItems([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      setLoading(true);
      setError(null);

      let { data, error } = await supabase
        .from("routes")
        .select("*")
        .abortSignal(controller.signal)
        .eq("company_id", companyId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(500);

      if (cancelled) return;
      if (controller.signal.aborted) return;

      if (error) {
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
        const routeRows = ((data as RouteRow[]) ?? []).map((route) => ({
          ...route,
          assumptions_json: route.assumptions_json ?? null,
          dependency_state: route.dependency_state ?? null,
          validation_state: route.validation_state ?? null,
          evidence_state: route.evidence_state ?? null,
          stale_reason: route.stale_reason ?? null,
          updated_at: route.updated_at ?? null,
        }));

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
  }, [companyId]);

  return { loading, items, error };
}
