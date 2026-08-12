import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type IntakeResponseRow = Database["public"]["Tables"]["intake_responses"]["Row"];

// Structured intake capture for a company, newest submission first (a company can submit more than
// once over time). submitted_at is the client clock (may be null on backfill) → fall back to created_at.
export function useIntakeResponses(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ["intake-responses", companyId],
    queryFn: async (): Promise<IntakeResponseRow[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("intake_responses")
        .select("*")
        .eq("company_id", companyId)
        .order("submitted_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as IntakeResponseRow[];
    },
    enabled: !!companyId,
  });
}
