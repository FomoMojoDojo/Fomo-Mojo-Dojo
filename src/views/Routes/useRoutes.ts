import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type RouteRow = {
  id: string;
  company_id: string;
  category: "fix" | "improve" | "create" | string;
  title: string;
  short_description?: string | null;
  frameworks_used?: string[] | null;
  pts_value?: number | null;
  effort?: string | null;
  type?: string | null;
  sort_order?: number | null;
  created_at?: string;
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

    (async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("routes")
        .select(
          "id, company_id, category, title, short_description, frameworks_used, pts_value, effort, type, sort_order, created_at"
        )
        .eq("company_id", companyId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(500);

      if (cancelled) return;

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
                `Derived from opportunity score ${opp.opportunity_score ?? "?"}; importance ${opp.importance ?? "?"}, satisfaction ${opp.satisfaction ?? "?"}.`,
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
        const routeRows = (data as RouteRow[]) ?? [];

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
                  `Derived from opportunity score ${opp.opportunity_score ?? "?"}; importance ${opp.importance ?? "?"}, satisfaction ${opp.satisfaction ?? "?"}.`,
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
    };
  }, [companyId]);

  return { loading, items, error };
}
