import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Claim, ClaimSignalRef, Signal } from "@/lib/evidenceDomain";

type EvidenceGraph = {
  signals: Signal[];
  claims: Claim[];
  refs: ClaimSignalRef[];
};

function sortNewestFirst<T extends { created_at: string }>(rows: T[]) {
  return [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function useEvidenceGraph(companyId?: string) {
  return useQuery({
    queryKey: ["evidence-graph", companyId],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<EvidenceGraph> => {
      if (!companyId) return { signals: [], claims: [], refs: [] };
      const [signalsRes, claimsRes, refsRes] = await Promise.all([
        supabase
          .from("signals")
          .select("*")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("claims")
          .select("*")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(300),
        supabase
          .from("claim_signal_refs")
          .select("*")
          .eq("company_id", companyId)
          .limit(1200),
      ]);

      if (signalsRes.error) throw new Error(signalsRes.error.message || "Failed to load signals.");
      if (claimsRes.error) throw new Error(claimsRes.error.message || "Failed to load claims.");
      if (refsRes.error) throw new Error(refsRes.error.message || "Failed to load claim refs.");

      return {
        signals: sortNewestFirst((signalsRes.data ?? []) as Signal[]),
        claims: sortNewestFirst((claimsRes.data ?? []) as Claim[]),
        refs: (refsRes.data ?? []) as ClaimSignalRef[],
      };
    },
  });
}
