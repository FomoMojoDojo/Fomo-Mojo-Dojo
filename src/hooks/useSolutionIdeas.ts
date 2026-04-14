import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SolutionIdeaRow = {
  id: string;
  company_id: string;
  opportunity_id: string;
  route_id: string | null;
  title: string;
  description: string;
  category: string;
  effort: string;
  confidence: number;
  frameworks_used: string[];
  sort_order: number;
  created_at?: string;
};

export function useSolutionIdeas(companyId?: string) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SolutionIdeaRow[]>([]);
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
        .from("solution_ideas")
        .select(
          "id, company_id, opportunity_id, route_id, title, description, category, effort, confidence, frameworks_used, sort_order, created_at",
        )
        .eq("company_id", companyId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(800);

      if (cancelled) return;

      if (error) {
        const msg = String(error.message || "").toLowerCase();
        if (msg.includes("solution_ideas") || msg.includes("could not find the table") || msg.includes("schema cache")) {
          setItems([]);
          setError(null);
        } else {
          setItems([]);
          setError(error.message);
        }
      } else {
        setItems(((data as SolutionIdeaRow[] | null) ?? []));
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return { loading, items, error };
}
