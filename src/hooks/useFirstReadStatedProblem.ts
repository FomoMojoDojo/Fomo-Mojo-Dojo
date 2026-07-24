// V2-2 / V2-3 — reads the persisted Act 1 stated problem. Reads the SIGNED row only
// (status='signed'); a regenerated shape sits as a 'pending' row until the operator
// signs it, and is never shown to the client. For a long brief the signed row carries
// a headline (`statement`) + up to 4 `supporting_points`; a short brief has none.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface StatedProblemRow {
  statement: string;
  supporting_points: string[]; // ≤4 for a long brief; [] for a short one
  quote: string | null;
  quote_source_text: string | null;
  register: string; // 'internal_declared' (the brief) | 'public_observed' (the site)
  descriptive_fallback: boolean;
}

export function useFirstReadStatedProblem(companyId?: string) {
  const [data, setData] = useState<StatedProblemRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      if (!companyId) {
        if (!cancelled) { setData(null); setLoading(false); }
        return;
      }
      const { data: row } = await supabase
        .from("first_read_stated_problem")
        .select("statement, supporting_points, quote, quote_source_text, register, descriptive_fallback")
        .eq("company_id", companyId)
        .eq("status", "signed") // client sees the signed shape only; pending stays hidden
        .maybeSingle();
      if (!cancelled) {
        setData(
          row
            ? {
                statement: row.statement,
                supporting_points: Array.isArray(row.supporting_points) ? (row.supporting_points as string[]) : [],
                quote: row.quote,
                quote_source_text: row.quote_source_text,
                register: row.register,
                descriptive_fallback: row.descriptive_fallback,
              }
            : null,
        );
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  return { data, loading };
}
