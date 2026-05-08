import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const WEAK_BASELINE_STATUSES = new Set(["ambiguous_public_evidence", "insufficient_public_evidence"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown) {
  return String(value ?? "").trim();
}

function listCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function baselineQualityScore(run: any) {
  const result = asRecord(run?.result_json);
  if (!result) return 0;

  const status = stringValue(result.status).toLowerCase();
  const weakPenalty = WEAK_BASELINE_STATUSES.has(status) ? -50 : 0;

  const category = stringValue(result.category_archetype).toLowerCase();
  const lens = asRecord(result.lens_card);
  const economic = stringValue(lens?.economic_engine).toLowerCase();
  const hypotheses = listCount(result.top_hypotheses);
  const questions = listCount(result.open_questions);
  const outsideSignals = listCount(result.outside_voice_signals);
  const ledger = listCount(result.evidence_ledger);

  const categoryScore = category && category !== "unknown" ? 15 : 0;
  const economicScore = economic && economic !== "unknown" ? 15 : 0;
  return weakPenalty + categoryScore + economicScore + hypotheses * 4 + questions + outsideSignals * 3 + ledger * 2;
}

function pickPreferredRun(runs: any[]) {
  if (!Array.isArray(runs) || runs.length === 0) return null;
  const latest = runs[0] ?? null;
  if (!latest) return null;

  const best = [...runs]
    .map((run) => ({ run, score: baselineQualityScore(run) }))
    .sort((a, b) => b.score - a.score)[0];

  if (!best) return latest;
  const latestScore = baselineQualityScore(latest);
  const latestOutsideSignals = listCount(asRecord(latest?.result_json)?.outside_voice_signals);
  const bestOutsideSignals = listCount(asRecord(best.run?.result_json)?.outside_voice_signals);

  // Keep the latest run only when it is not materially worse than the best recent run.
  // Zero-signal latest runs should not hide an older run with actual outside voice evidence.
  if (latestScore >= best.score - 6 && (latestOutsideSignals > 0 || bestOutsideSignals === 0)) {
    return latest;
  }
  return best.run;
}

export function usePublicBaseline(companyId?: string) {
  const [loading, setLoading] = useState(false);
  const [run, setRun] = useState<any | null>(null);
  const [preferredRun, setPreferredRun] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const companyIdRef = useRef<string | undefined>(companyId);
  companyIdRef.current = companyId;

  const fetchLatest = useCallback(async () => {
    const cid = companyIdRef.current;
    if (!cid) {
      setRun(null);
      setPreferredRun(null);
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
      .limit(12);

    if (error) {
      setError(error.message);
      setRun(null);
      setPreferredRun(null);
    } else {
      const rows = Array.isArray(data) ? data : [];
      setRun(rows[0] ?? null);
      setPreferredRun(pickPreferredRun(rows));
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    if (!companyId) {
      setRun(null);
      setPreferredRun(null);
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

  return { loading, run, preferredRun, error, refetch: fetchLatest };
}
