import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type StrategicDeltaSignal = {
  id: string;
  framework: string | null;
  claim_text: string;
  topic: string;
  source_id: string | null;
};

export type StrategicDelta = {
  internal: StrategicDeltaSignal[];
  public: StrategicDeltaSignal[];
};

// Direct signal reader — NOT claim-mediated. Queries:
//   internal: signal_band='organization', topic='strategy'
//   public:   signal_band='outside', source_type='public_baseline_run'
// The topic='strategy' gate is the quarantine — org-band discovery findings
// re-topiced by the D+A commit (82b7c7b) are excluded from the internal set.
export function useStrategicDelta(companyId?: string) {
  return useQuery({
    queryKey: ["strategic-delta", companyId],
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async (): Promise<StrategicDelta> => {
      if (!companyId) return { internal: [], public: [] };

      const [internalRes, publicRes] = await Promise.all([
        supabase
          .from("signals")
          .select("id, framework, claim_text, topic, source_id")
          .eq("company_id", companyId)
          .eq("signal_band", "organization")
          .eq("topic", "strategy")
          .order("created_at", { ascending: true }),
        supabase
          .from("signals")
          .select("id, framework, claim_text, topic, source_id")
          .eq("company_id", companyId)
          .eq("signal_band", "outside")
          .eq("source_type", "public_baseline_run")
          .order("created_at", { ascending: true }),
      ]);

      const toSignal = (r: {
        id: string;
        framework: string | null;
        claim_text: string;
        topic: string | null;
        source_id: string | null;
      }): StrategicDeltaSignal => ({
        id: String(r.id),
        framework: r.framework ?? null,
        claim_text: String(r.claim_text ?? ""),
        topic: String(r.topic ?? ""),
        source_id: r.source_id ? String(r.source_id) : null,
      });

      return {
        internal: (internalRes.data ?? []).map(toSignal),
        public: (publicRes.data ?? []).map(toSignal),
      };
    },
  });
}
