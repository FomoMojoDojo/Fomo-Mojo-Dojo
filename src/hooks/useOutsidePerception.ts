// V2-5 — the Act 3 "message" band source: how the OUTSIDE describes the company.
//
// Reads public_observed claims (provenance) — the public record's own words about the
// company, distinct from the company's declared tagline/value-prop (which is Act 4's
// say-vs-see job, never Act 3's). Register-locked at the boundary: the render applies
// isPublicProvenance so an internal_declared claim can never reach this public act.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PerceptionClaim {
  id: string;
  statement: string;
  topic: string | null;
  provenance: string;
}

export function useOutsidePerception(companyId?: string) {
  const [claims, setClaims] = useState<PerceptionClaim[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      if (!companyId) {
        if (!cancelled) { setClaims([]); setLoading(false); }
        return;
      }
      // Fetch by provenance here for efficiency; the render-boundary guard
      // (isPublicProvenance) is the authority that actually decides admission.
      const { data } = await supabase
        .from("claims")
        .select("id, statement, topic, provenance")
        .eq("company_id", companyId)
        .eq("provenance", "public_observed")
        .order("created_at", { ascending: true });
      if (!cancelled) {
        setClaims(((data as PerceptionClaim[] | null) ?? []).filter((c) => c.statement?.trim()));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  return { claims, loading };
}
