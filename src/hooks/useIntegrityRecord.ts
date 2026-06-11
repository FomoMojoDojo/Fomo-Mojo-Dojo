// Reviewer-integrity logging — read side.
// Fetches the latest integrity_runs record for (company, component[, surface]) so
// nothing-to-report surfaces can prove the looking happened. Three downstream states:
// record completed → "looked", no record → "never looked", record failed or query
// error → "couldn't check". The hook NEVER collapses error into null.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type IntegrityRunRecord = {
  id: number;
  company_id: string;
  component: string;
  surface_type: string | null;
  surface_id: string | null;
  ran_at: string;
  status: "completed" | "failed" | "skipped_empty_input";
  examined: number | null;
  admitted: number | null;
  excluded_by_rule: Record<string, unknown> | null;
  error: string | null;
  run_ref: string | null;
};

export function useIntegrityRecord(
  companyId: string | null | undefined,
  component: string,
  surfaceId?: string | null,
): { record: IntegrityRunRecord | null; error: string | null; loading: boolean } {
  const [record, setRecord] = useState<IntegrityRunRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyId && !surfaceId) {
      // Record-scope law: with neither a company nor a surface in scope we CANNOT
      // claim anything was checked — record stays null ("not yet checked", never
      // a bare all-clear).
      setRecord(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const run = async () => {
      let query = supabase
        .from("integrity_runs")
        .select("*")
        .eq("component", component)
        .order("ran_at", { ascending: false })
        .limit(1);
      if (companyId) query = query.eq("company_id", companyId);
      if (surfaceId) query = query.eq("surface_id", surfaceId);
      const { data, error: qErr } = await query.maybeSingle();
      if (cancelled) return;
      if (qErr) {
        setError(qErr.message);
        setRecord(null);
      } else {
        setError(null);
        setRecord((data as IntegrityRunRecord | null) ?? null);
      }
      setLoading(false);
    };
    void run();
    return () => { cancelled = true; };
  }, [companyId, component, surfaceId]);

  return { record, error, loading };
}
