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
  service_state: "underserved" | "served" | "overserved" | string;
  source_path: string;
  frameworks_used: string[];
  created_at: string;
};

export function useOdiNeeds(companyId?: string) {
  const [loading, setLoading] = useState(false);
  const [marketDefinition, setMarketDefinition] = useState<OdiMarketDefinitionRow | null>(null);
  const [needs, setNeeds] = useState<OdiNeedRow[]>([]);
  const [error, setError] = useState<string | null>(null);

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
      setLoading(true);
      setError(null);

      const [marketRes, needsRes] = await Promise.all([
        supabase
          .from("odi_market_definitions")
          .select("*")
          .eq("company_id", companyId)
          .maybeSingle(),
        supabase
          .from("odi_needs")
          .select("*")
          .eq("company_id", companyId)
          .order("tier", { ascending: true })
          .order("opportunity_score", { ascending: false }),
      ]);

      if (cancelled) return;

      if (marketRes.error) {
        setError(marketRes.error.message);
        setMarketDefinition(null);
        setNeeds([]);
      } else if (needsRes.error) {
        setError(needsRes.error.message);
        setMarketDefinition(null);
        setNeeds([]);
      } else {
        setMarketDefinition((marketRes.data as OdiMarketDefinitionRow | null) ?? null);
        setNeeds((needsRes.data as OdiNeedRow[]) ?? []);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return { loading, marketDefinition, needs, error };
}
