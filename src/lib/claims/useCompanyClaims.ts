import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ClaimState } from "@/lib/claimState";

export type ClaimRow = {
  id: string;
  state: ClaimState;
  claim_type: string | null;
  topic: string | null;
  statement: string | null;
  outside_support_count: number;
  organization_support_count: number;
  customer_support_count: number;
  updated_at: string | null;
};

export function useCompanyClaims(companyId?: string, refreshKey = 0) {
  const [claims, setClaims] = useState<Map<string, ClaimRow>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyId) {
      setClaims(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("claims")
        .select(
          "id, state, claim_type, topic, statement, outside_support_count, organization_support_count, customer_support_count, updated_at",
        )
        .eq("company_id", companyId);

      if (cancelled) return;
      const map = new Map(
        (data ?? []).map((r) => [r.id, r as ClaimRow]),
      );
      setClaims(map);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, refreshKey]);

  return { claims, loading };
}

// Finds a claim by topic + statement text match — used for canvas/cascade fields
// where the claim ID is a deterministic hash not re-computable in browsers.
export function findClaimByTopicAndStatement(
  claims: Map<string, ClaimRow>,
  topic: string,
  statementText: string | null | undefined,
): ClaimRow | null {
  if (!statementText?.trim()) return null;
  const normalized = statementText.trim();
  for (const claim of claims.values()) {
    if (claim.topic === topic && claim.statement?.trim() === normalized) {
      return claim;
    }
  }
  return null;
}
