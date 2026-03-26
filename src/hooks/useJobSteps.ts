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

function isMissingTableError(message: string, tableName: string) {
  const lower = String(message || "").toLowerCase();
  return (
    lower.includes("could not find the table") &&
    lower.includes(`public.${tableName}`.toLowerCase())
  ) || (lower.includes(tableName.toLowerCase()) && lower.includes("schema cache"));
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
  const [removingJourneyKey, setRemovingJourneyKey] = useState<string | null>(null);
  const [updatingStepId, setUpdatingStepId] = useState<string | null>(null);

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

        data = fallback.data as unknown as JobStepRow[] | null;
        error = fallback.error;

        if (!fallback.error) {
          const fallbackRows = (fallback.data ?? []) as Array<Partial<JobStepRow>>;
          data = fallbackRows.map((row) => ({
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
    removingJourneyKey,
    updatingStepId,
    updateStepText: async (stepId: string, values: { step_label?: string; description?: string }) => {
      if (!companyId) throw new Error("No active company selected.");
      const id = String(stepId || "").trim();
      if (!id) throw new Error("Missing step id.");

      const nextLabel = typeof values.step_label === "string" ? values.step_label.trim() : "";
      const nextDescription = typeof values.description === "string" ? values.description.trim() : "";
      if (!nextLabel) throw new Error("Step label cannot be empty.");

      setUpdatingStepId(id);
      try {
        const { error: updateError } = await supabase
          .from("job_steps")
          .update({
            step_label: nextLabel,
            description: nextDescription || null,
          })
          .eq("company_id", companyId)
          .eq("id", id);

        if (updateError) throw new Error(updateError.message || "Failed to update job step.");

        setItems((current) =>
          current.map((row) =>
            row.id === id
              ? {
                  ...row,
                  step_label: nextLabel,
                  description: nextDescription || null,
                }
              : row,
          ),
        );
      } finally {
        setUpdatingStepId(null);
      }
    },
    removeJourneyMap: async (journeyKey: string) => {
      if (!companyId) {
        throw new Error("No active company selected.");
      }
      const key = String(journeyKey || "").trim().toLowerCase();
      if (!key) {
        throw new Error("Missing journey key.");
      }

      setRemovingJourneyKey(key);
      try {
        const errors: string[] = [];

        const { error: stepsError } = await supabase
          .from("job_steps")
          .delete()
          .eq("company_id", companyId)
          .eq("journey_key", key);
        if (stepsError && !isMissingTableError(stepsError.message || "", "job_steps")) {
          errors.push(`job_steps: ${stepsError.message}`);
        }

        const { error: oppsError } = await supabase
          .from("opportunities")
          .delete()
          .eq("company_id", companyId)
          .eq("journey_key", key);
        if (oppsError && !isMissingTableError(oppsError.message || "", "opportunities")) {
          errors.push(`opportunities: ${oppsError.message}`);
        }

        const { error: needsError } = await supabase
          .from("odi_needs")
          .delete()
          .eq("company_id", companyId)
          .eq("journey_key", key);
        if (needsError && !isMissingTableError(needsError.message || "", "odi_needs")) {
          errors.push(`odi_needs: ${needsError.message}`);
        }

        const { error: outcomesError } = await supabase
          .from("managed_outcomes")
          .delete()
          .eq("company_id", companyId)
          .eq("journey_key", key);
        if (outcomesError && !isMissingTableError(outcomesError.message || "", "managed_outcomes")) {
          errors.push(`managed_outcomes: ${outcomesError.message}`);
        }

        if (key === "customer") {
          const { error: routesError } = await supabase
            .from("routes")
            .delete()
            .eq("company_id", companyId);
          if (routesError && !isMissingTableError(routesError.message || "", "routes")) {
            errors.push(`routes: ${routesError.message}`);
          }
        }

        if (errors.length > 0) {
          throw new Error(`Failed to remove job map artifacts (${errors.join(" | ")})`);
        }
        setRefreshKey((current) => current + 1);
      } finally {
        setRemovingJourneyKey(null);
      }
    },
    refetch: () => setRefreshKey((current) => current + 1),
  };
}
