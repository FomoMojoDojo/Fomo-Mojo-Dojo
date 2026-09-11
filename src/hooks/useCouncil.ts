// useCouncil — the council reads lifted verbatim from CouncilPanel.tsx (load(), lines 183-185; operator
// ruling 5, 2026-09-11): council_recommendations, council_review_runs, strategic_decisions. Same three
// tables, same columns, same order/limit; no new read. CouncilPanel keeps its inline copy untouched.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CouncilRecStatus = "pending" | "accepted" | "ignored";

export interface CouncilRec {
  id: string;
  title: string;
  recommendation: string;
  rationale: string;
  category: string;
  priority: "high" | "medium" | "low";
  confidence: number;
  status: CouncilRecStatus;
  source_context_json: Record<string, unknown> | null;
  decided_at: string | null;
  created_at: string;
  decision_id?: string | null;
  decision_note?: string | null;
}

export interface CouncilDecisionSummary {
  id: string;
  title: string;
  decision_question: string | null;
  decision_state: string;
}

export interface CouncilRun {
  id: string;
  status: "running" | "completed" | "failed";
  summary: string;
  recommendation_count: number;
  source_snapshot_json: Record<string, unknown> | null;
  created_at: string;
}

export function useCouncil(companyId?: string) {
  const [loading, setLoading] = useState(Boolean(companyId));
  const [runs, setRuns] = useState<CouncilRun[]>([]);
  const [recs, setRecs] = useState<CouncilRec[]>([]);
  const [decisions, setDecisions] = useState<CouncilDecisionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) { setRuns([]); setRecs([]); setDecisions([]); setError(null); setLoading(false); return; }
    let cancelled = false;
    // Loose accessor, as in CouncilPanel: these tables sit outside the generated Database type.
    const sb = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [recRes, runRes, decRes] = await Promise.all([
          sb.from("council_recommendations").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(250),
          sb.from("council_review_runs").select("id, status, summary, recommendation_count, source_snapshot_json, created_at").eq("company_id", companyId).order("created_at", { ascending: false }).limit(40),
          sb.from("strategic_decisions").select("id, title, decision_question, decision_state").eq("company_id", companyId).neq("decision_state", "retired").limit(50),
        ]);
        if (cancelled) return;
        if (recRes.error) throw recRes.error;
        if (runRes.error) throw runRes.error;
        setRecs((recRes.data ?? []) as CouncilRec[]);
        setRuns((runRes.data ?? []) as CouncilRun[]);
        setDecisions((decRes.data ?? []) as CouncilDecisionSummary[]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load council data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  return { loading, runs, recs, decisions, error };
}
