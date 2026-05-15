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

export function useCompanyClaims(companyId?: string) {
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
      console.warn("[useCompanyClaims]", {
        companyId,
        error: error?.message ?? null,
        claimCount: data?.length ?? 0,
        firstClaimId: data?.[0]?.id ?? null,
        firstClaimState: data?.[0]?.state ?? null,
      });
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
  }, [companyId]);

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
