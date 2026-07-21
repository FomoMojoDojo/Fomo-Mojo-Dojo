import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/*
 * MO-1 — displayable market OPTIONS for Act A.
 *
 * DISPLAY LAW: status='candidate' ONLY. A candidate is an option that passed
 * ALL THREE form criteria (executor is a group of people / job is verb + object
 * + contextual clarifier / job is solution-agnostic). Rejected options and
 * still-failing revisions are stored for the negative cache and are NEVER
 * displayed — the filter below is the single place that is enforced on the
 * client, and it must not be relaxed.
 *
 * Options are hypotheses by proof law (market_options.proof_tier is pinned to
 * 'hypothesis' by CHECK). Nothing here ranks, scores, sorts by quality, or
 * marks one option as chosen — the choose/promotion arc is a separate act.
 *
 * Order is created_at ASC — the order they were decided in. Never a computed
 * or quality sort.
 *
 * CRITERIA VERSION: a candidate is only displayable if it passed under the
 * CURRENT criteria. When a criterion is tightened, verdicts from the superseded
 * version stay in the table for audit but must never reach the client — a
 * stale pass riding behind a content-identity cache hit is exactly the failure
 * the versioning exists to prevent. Criterion (1) was tightened in v2 (the
 * executor must also be verb-free), which retired two v1 passes.
 */

/**
 * KEEP IN SYNC with MO1_CRITERIA_VERSION in
 * supabase/functions/_shared/marketOptionSynthesis.ts. Duplicated rather than
 * imported because that module is Deno-only and must not enter the browser
 * bundle (same precedent as src/lib/phaseFrameworks.ts).
 */
export const MO1_CRITERIA_VERSION = 2;

export type MarketOption = {
  id: string;
  executor_statement: string;
  job_statement: string;
  basis: string | null;
};

export function useMarketOptions(companyId?: string) {
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState<MarketOption[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    const mySeq = ++seq.current;
    if (!companyId) {
      setOptions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("market_options")
        .select("id, executor_statement, job_statement, basis")
        .eq("company_id", companyId)
        .eq("status", "candidate") // DISPLAY LAW — see header
        .eq("criteria_version", MO1_CRITERIA_VERSION) // never show a superseded pass
        .order("created_at", { ascending: true });
      // Stale-response guard: a company switch mid-flight must not paint.
      if (mySeq !== seq.current) return;
      setOptions(error || !data ? [] : (data as MarketOption[]));
      setLoading(false);
    })();
  }, [companyId]);

  return { loading, options };
}
