import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type DesiredOutcomeRow = {
  id: string;
  company_id: string;
  statement: string;
  importance_score: number | null;
  satisfaction_score: number | null;
  metric: string | null;
  is_primary: boolean;
  created_at?: string;
  updated_at?: string;
};

export function useDesiredOutcomes(companyId?: string) {
  const [primary, setPrimary] = useState<DesiredOutcomeRow | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyId) {
      setPrimary(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from("desired_outcomes")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_primary", true)
      .limit(1)
      .then(({ data }) => {
        if (!cancelled) {
          setPrimary((data?.[0] as DesiredOutcomeRow | undefined) ?? null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return { primary, loading };
}
