import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CascadeProposalRow = {
  id: string;
  surface_id: string | null;
  company_id: string;
  current_state: Record<string, unknown>;
  proposed_state: Record<string, unknown>;
  reason: string | null;
  created_at: string;
  status: string;
};

export function useCascadeProposal(companyId?: string, refreshKey = 0) {
  const [loading, setLoading] = useState(false);
  const [proposal, setProposal] = useState<CascadeProposalRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setProposal(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("surface_proposals")
        .select("id, surface_id, company_id, current_state, proposed_state, reason, created_at, status")
        .eq("company_id", companyId)
        .eq("surface_type", "cascade")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if (fetchError) {
        const msg = fetchError.message.toLowerCase();
        if (msg.includes("load failed") || msg.includes("networkerror") || msg.includes("failed to fetch")) {
          setProposal(null);
          setError(null);
        } else {
          setError(fetchError.message);
          setProposal(null);
        }
      } else {
        setProposal(data as CascadeProposalRow | null);
      }

      setLoading(false);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, refreshKey]);

  return { loading, proposal, error };
}
