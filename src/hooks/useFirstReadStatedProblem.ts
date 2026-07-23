// V2-2 — reads the persisted Act 1 stated problem (client_voice own-domain distillation).
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface StatedProblemRow {
  statement: string;
  quote: string | null;
  quote_source_text: string | null;
  register: string;
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
        .select("statement, quote, quote_source_text, register")
        .eq("company_id", companyId)
        .maybeSingle();
      if (!cancelled) { setData((row as StatedProblemRow | null) ?? null); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  return { data, loading };
}
