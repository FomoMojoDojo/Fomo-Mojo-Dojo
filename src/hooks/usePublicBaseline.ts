import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function usePublicBaseline(companyId?: string) {
  const [loading, setLoading] = useState(false);
  const [run, setRun] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const companyIdRef = useRef<string | undefined>(companyId);
  companyIdRef.current = companyId;

  const fetchLatest = useCallback(async () => {
    const cid = companyIdRef.current;
    if (!cid) {
      setRun(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("public_baseline_runs")
      .select(
        "id, created_at, company_id, company_name, website, sources_json, result_json"
      )
      .eq("company_id", cid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      setError(error.message);
      setRun(null);
    } else {
      setRun(data ?? null);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    if (!companyId) {
      setRun(null);
      setError(null);
      setLoading(false);
      return;
    }
    setRun(null);
    setError(null);
    fetchLatest();
  }, [companyId, fetchLatest]);

  // Realtime refresh when a new baseline run is inserted/updated for this company
  useEffect(() => {
    if (!companyId) return;

    const channel = supabase
      .channel(`public_baseline_runs:${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "public_baseline_runs",
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          fetchLatest();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, fetchLatest]);

  return { loading, run, error, refetch: fetchLatest };
}
