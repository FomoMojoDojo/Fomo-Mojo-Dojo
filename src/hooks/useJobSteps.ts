import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

function isJobStepEvidenceColumnError(message: string) {
  const lower = String(message || "").toLowerCase();
  return (
    lower.includes("evidence_status") ||
    lower.includes("evidence_basis") ||
    lower.includes("evidence_confidence")
  );
}

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
  evidence_status: "evidenced" | "implied" | "unclear" | string | null;
  evidence_basis: string | null;
  evidence_confidence: number | null;
  gap_note: string | null;
  created_at?: string;
};

export function useJobSteps(companyId?: string) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<JobStepRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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

      let { data, error } = await supabase
        .from("job_steps")
        .select(
          "id, company_id, user_id, journey_key, journey_title, journey_subtitle, step_number, step_label, description, designed, has_gap, evidence_status, evidence_basis, evidence_confidence, gap_note, created_at"
        )
        .eq("company_id", companyId)
        .order("journey_key", { ascending: true })
        .order("step_number", { ascending: true })
        .limit(400);

      if (error && isJobStepEvidenceColumnError(error.message || "")) {
        const fallback = await supabase
          .from("job_steps")
          .select(
            "id, company_id, user_id, journey_key, journey_title, journey_subtitle, step_number, step_label, description, designed, has_gap, gap_note, created_at"
          )
          .eq("company_id", companyId)
          .order("journey_key", { ascending: true })
          .order("step_number", { ascending: true })
          .limit(400);

        data = fallback.data as any[] | null;
        error = fallback.error;

        if (!fallback.error) {
          data = ((fallback.data as any[]) ?? []).map((row) => ({
            ...row,
            evidence_status: row?.designed ? "implied" : "unclear",
            evidence_basis: row?.designed
              ? "Legacy row without explicit evidence basis; inferred from designed step."
              : "Legacy row without explicit evidence basis.",
            evidence_confidence: row?.designed ? 55 : 0,
          }));
        }
      }

      if (cancelled) return;

      if (error) {
        setError(error.message);
        setItems([]);
      } else {
        setItems((data as JobStepRow[]) ?? []);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId, refreshKey]);

  return {
    loading,
    items,
    error,
    refetch: () => setRefreshKey((current) => current + 1),
  };
}
