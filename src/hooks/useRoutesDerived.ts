import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type RouteRow = {
  id: string;
  company_id: string;

  // grouping
  category: "fix" | "improve" | "create" | string;

  // display
  title: string;
  short_description?: string | null;

  // scoring/metadata (optional)
  pts_value?: number | null;
  effort?: string | null; // low | medium | high, etc
  type?: string | null;   // Fix | Improve | Create, etc
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
          "id, company_id, category, title, short_description, pts_value, effort, type, sort_order, created_at"
        )
        .eq("company_id", companyId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(500);

      if (cancelled) return;

      if (error) {
        setError(error.message);
        setItems([]);
      } else {
        setItems((data as any[]) ?? []);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return { loading, items, error };
}
