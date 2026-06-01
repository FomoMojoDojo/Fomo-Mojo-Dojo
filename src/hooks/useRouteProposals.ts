import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type RouteProposalRow = {
  id: string;
  surface_id: string;
  company_id: string;
  current_state: Record<string, unknown>;
  proposed_state: Record<string, unknown>;
  reason: string | null;
  created_at: string;
  status: string;
};

// Returns a Map<routeId, RouteProposalRow> of all pending proposals for this company's routes.
// Only the most-recent pending proposal per route_id is kept (order by created_at DESC).
export function useRouteProposals(companyId?: string, refreshKey = 0) {
  const [loading, setLoading] = useState(false);
  const [proposals, setProposals] = useState<Map<string, RouteProposalRow>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setProposals(new Map());
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
        .eq("surface_type", "route")
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (fetchError) {
        const msg = fetchError.message.toLowerCase();
        if (msg.includes("load failed") || msg.includes("networkerror") || msg.includes("failed to fetch")) {
          setProposals(new Map());
          setError(null);
        } else {
          setError(fetchError.message);
          setProposals(new Map());
        }
      } else {
        const map = new Map<string, RouteProposalRow>();
        for (const row of (data as RouteProposalRow[] | null ?? [])) {
          if (!map.has(row.surface_id)) {
            map.set(row.surface_id, row);
          }
        }
        setProposals(map);
      }

      setLoading(false);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, refreshKey]);

  return { loading, proposals, error };
}
