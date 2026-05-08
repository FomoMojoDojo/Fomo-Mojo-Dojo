import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type OdiMarketDefinitionRow = {
  id: string;
  company_id: string;
  job_executor: string;
  chooser: string;
  jtbd: string;
  source_path: string;
  frameworks_used: string[];
  innovation_strategy?: string | null;
  created_at: string;
  updated_at: string;
};

export type OdiNeedRow = {
  id: string;
  company_id: string;
  tier: "need" | "want" | "desire" | string;
  desired_outcome: string;
  journey_key: "customer" | "revenue" | "operations" | string;
  step_number: number;
  step_label: string;
  importance: number;
  satisfaction: number;
  opportunity_score: number;
  sort_order?: number | null;
  service_state: "underserved" | "served" | "overserved" | string;
  source_path: string;
  source_url?: string | null;
  notes?: string | null;
  social_extraction_json?: unknown | null;
  frameworks_used: string[];
  created_at: string;
};

export function useOdiNeeds(companyId?: string, refreshKey = 0) {
  const [loading, setLoading] = useState(false);
  const [marketDefinition, setMarketDefinition] = useState<OdiMarketDefinitionRow | null>(null);
  const [needs, setNeeds] = useState<OdiNeedRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [updatingScoresId, setUpdatingScoresId] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setMarketDefinition(null);
      setNeeds([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setMarketDefinition(null);
      setNeeds([]);
      setLoading(true);
      setError(null);

      const [marketRes, needsRes] = await Promise.all([
        supabase
          .from("odi_market_definitions")
          .select("*")
          .eq("company_id", companyId)
          .order("updated_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("odi_needs")
          .select("*")
          .eq("company_id", companyId)
          .order("tier", { ascending: true })
          .order("sort_order", { ascending: true, nullsFirst: false })
          .order("opportunity_score", { ascending: false }),
      ]);

      if (cancelled) return;

      const errors: string[] = [];
      if (marketRes.error) errors.push(`Market definition: ${marketRes.error.message}`);
      if (needsRes.error) errors.push(`Needs: ${needsRes.error.message}`);

      setMarketDefinition(marketRes.error ? null : ((marketRes.data as OdiMarketDefinitionRow | null) ?? null));
      setNeeds(needsRes.error ? [] : ((needsRes.data as OdiNeedRow[]) ?? []));
      setError(errors.length > 0 ? errors.join(" | ") : null);

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId, refreshKey]);

  async function updateMarketDefinition(patch: Partial<Pick<OdiMarketDefinitionRow, "innovation_strategy">>) {
    if (!companyId) throw new Error("Select a company first.");

    const { error } = await supabase
      .from("odi_market_definitions")
      .update(patch)
      .eq("company_id", companyId);

    if (error) throw new Error(error.message || "Failed to update market definition.");

    setMarketDefinition((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  async function updateNeedScores(needId: string, importance: number, satisfaction: number) {
    const imp = Math.max(0, Math.min(10, Math.round(importance)));
    const sat = Math.max(0, Math.min(10, Math.round(satisfaction)));
    const opportunityScore = imp + Math.max(0, imp - sat);
    const serviceState: OdiNeedRow["service_state"] =
      opportunityScore >= 10 ? "underserved" : sat > imp + 1 ? "overserved" : "served";

    setUpdatingScoresId(needId);
    try {
      const { error } = await supabase
        .from("odi_needs")
        .update({ importance: imp, satisfaction: sat, opportunity_score: opportunityScore, service_state: serviceState })
        .eq("id", needId);

      if (error) throw new Error(error.message || "Failed to update scores.");

      setNeeds((prev) =>
        prev.map((n) =>
          n.id === needId ? { ...n, importance: imp, satisfaction: sat, opportunity_score: opportunityScore, service_state: serviceState } : n,
        ),
      );
    } finally {
      setUpdatingScoresId(null);
    }
  }

  return { loading, marketDefinition, needs, error, updatingScoresId, updateNeedScores, updateMarketDefinition };
}
