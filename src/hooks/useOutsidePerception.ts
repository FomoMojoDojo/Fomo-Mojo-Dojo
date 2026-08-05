// V2-5 — the Act 3 "message" band source: how the OUTSIDE describes the company.
//
// Reads public_observed claims (provenance) — the public record's own words about the
// company, distinct from the company's declared tagline/value-prop (which is Act 4's
// say-vs-see job, never Act 3's). Register-locked at the boundary: the render applies
// isPublicProvenance so an internal_declared claim can never reach this public act.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ASYNC_READ_DEADLINE_MS } from "@/hooks/useAsyncRead";

export interface PerceptionClaim {
  id: string;
  statement: string;
  topic: string | null;
  provenance: string;
}

// GATE B — `error` is ADDITIVE, for OutsideMessageBand to render the signed error via
// <ActData> instead of the signed honest-absence line on a failed / never-returning read.
//
// DELIBERATELY does NOT bound `loading`: ExportButton gates its export on `!loading`, so a
// hung perception read must keep the export DISABLED (blocked), never enable it with an
// empty perception section — that export harm is Gate D. So the 10s deadline sets `error`
// while `loading` stays true on a hang; a returning error sets `error` + `loading=false`.
// For the other consumer (ExportButton), `claims` / `loading` are byte-identical in every
// case — success, zero-row, returning error (claims=[] / loading=false, the old swallow),
// AND hang (loading stays true forever). Only the new, ignored `error` field is added.
const DEADLINE_ERROR = `async-read deadline exceeded (${ASYNC_READ_DEADLINE_MS}ms)`;

export function useOutsidePerception(companyId?: string) {
  const [claims, setClaims] = useState<PerceptionClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Deadline sets `error` only — `loading` is left for the fetch resolution (which never
    // arrives on a hang), so ExportButton's blocked-export behaviour is preserved.
    const deadline = setTimeout(() => { if (!cancelled) setError(DEADLINE_ERROR); }, ASYNC_READ_DEADLINE_MS);
    (async () => {
      if (!companyId) {
        if (!cancelled) { setClaims([]); setLoading(false); }
        clearTimeout(deadline);
        return;
      }
      // Fetch by provenance here for efficiency; the render-boundary guard
      // (isPublicProvenance) is the authority that actually decides admission.
      const { data, error: qErr } = await supabase
        .from("claims")
        .select("id, statement, topic, provenance")
        .eq("company_id", companyId)
        .eq("provenance", "public_observed")
        .order("created_at", { ascending: true });
      if (cancelled) return;
      clearTimeout(deadline);
      if (qErr) { setError(qErr.message); setLoading(false); return; }
      setClaims(((data as PerceptionClaim[] | null) ?? []).filter((c) => c.statement?.trim()));
      setLoading(false);
    })();
    return () => { cancelled = true; clearTimeout(deadline); };
  }, [companyId]);

  return { claims, loading, error };
}
