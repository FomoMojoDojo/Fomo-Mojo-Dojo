// V2-2 / V2-3 / V2-3b — reads the Act 1 stated problem.
//
// V2-3b SOURCE-DIRECT DECLARED PATH: when the company has a stated problem on file
// (companies.strategic_problem_brief), Act 1 renders it VERBATIM — no model, no row, no
// distillation. The hook reads the brief straight from the company and returns it as the
// statement with verbatim=true. ONLY when the brief is blank does it fall back to the
// site-inference row in first_read_stated_problem (public_observed, model-generated,
// status='signed'). The declared path never touches that table.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface StatedProblemRow {
  statement: string;
  verbatim: boolean; // true → the client's own words (declared brief), rendered exactly
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

      // ── DECLARED (preferred): the client's own stated problem, verbatim ──────────
      const { data: company } = await supabase
        .from("companies")
        .select("strategic_problem_brief")
        .eq("id", companyId)
        .maybeSingle();
      const brief = (company as { strategic_problem_brief?: string | null } | null)?.strategic_problem_brief ?? "";
      if (brief.trim().length > 0) {
        if (!cancelled) {
          setData({
            statement: brief, // rendered EXACTLY (verbatim) — no transformation
            verbatim: true,
            quote: null,
            quote_source_text: null,
            register: "internal_declared",
            descriptive_fallback: false,
          });
          setLoading(false);
        }
        return;
      }

      // ── FALLBACK: the site-inferred signed row (public_observed) ─────────────────
      const { data: row } = await supabase
        .from("first_read_stated_problem")
        .select("statement, quote, quote_source_text, register, descriptive_fallback")
        .eq("company_id", companyId)
        .eq("status", "signed") // client sees the signed shape only; pending stays hidden
        .maybeSingle();
      if (!cancelled) {
        setData(
          row
            ? {
                statement: row.statement,
                verbatim: false,
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
