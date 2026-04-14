import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SolutionTestRow = {
  id: string;
  company_id: string;
  solution_idea_id: string;
  title: string;
  method: string;
  metric: string;
  success_threshold: string;
  timebox: string;
  frameworks_used: string[];
  sort_order: number;
  created_at?: string;
};

export function useSolutionTests(companyId?: string) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SolutionTestRow[]>([]);
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
        .from("solution_tests")
        .select(
          "id, company_id, solution_idea_id, title, method, metric, success_threshold, timebox, frameworks_used, sort_order, created_at",
        )
        .eq("company_id", companyId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(1600);

      if (cancelled) return;

      if (error) {
        const msg = String(error.message || "").toLowerCase();
        if (msg.includes("solution_tests") || msg.includes("could not find the table") || msg.includes("schema cache")) {
          setItems([]);
          setError(null);
        } else {
          setItems([]);
          setError(error.message);
        }
      } else {
        setItems(((data as SolutionTestRow[] | null) ?? []));
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return { loading, items, error };
}
