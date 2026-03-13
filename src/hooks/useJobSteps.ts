import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type JobStepRow = {
  id: string;
  company_id: string;
  user_id: string;
  journey_key: "customer" | "revenue" | "operations" | string;
  journey_title: string | null;
  journey_subtitle: string | null;
  step_number: number | null;
  step_label: string | null;
  description: string | null;
  designed: boolean | null;
  has_gap: boolean | null;
  gap_note: string | null;
  created_at?: string;
};

export function useJobSteps(companyId?: string) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<JobStepRow[]>([]);
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
        .from("job_steps")
        .select(
          "id, company_id, user_id, journey_key, journey_title, journey_subtitle, step_number, step_label, description, designed, has_gap, gap_note, created_at"
        )
        .eq("company_id", companyId)
        .order("journey_key", { ascending: true })
        .order("step_number", { ascending: true })
        .limit(400);

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