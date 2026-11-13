import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

// 'withheld' (SP-108, 2026-11-12): the assessment was DECLINED, not made — the surface's new
// evidence held a non-public row, so no outside model judged it and there is no verdict. It is
// neither aligned nor drift, and it carries NO score (check_withheld_has_no_score).
export type DriftState = "aligned" | "slight_drift" | "material_drift" | "withheld";

export type DriftAssessmentSignal = {
  signal_id: string;
  claim_text?: string | null;
  signal_created_at?: string | null;
};

export type DriftAssessmentBasis = {
  new_signals: DriftAssessmentSignal[];
};

export type DriftAssessment = {
  id: string;
  company_id: string;
  surface_type: string;
  surface_id: string;
  /** NULL exactly when drift_state is 'withheld' — enforced by check_withheld_has_no_score. */
  drift_score: number | null;
  drift_state: DriftState;
  llm_confirmation: string | null;
  assessment_basis: DriftAssessmentBasis | null;
  last_assessed_at: string;
  created_at: string;
  operator_seen_at: string | null;
  accepted_as_aligned_at: string | null;
};

export function useDriftAssessment(
  surfaceType: string | null,
  surfaceId: string | null,
  refreshKey = 0,
): {
  assessment: DriftAssessment | null;
  isLoading: boolean;
  error: string | null;
  markSeen: () => Promise<void>;
  acceptAsAligned: () => Promise<void>;
  setAssessment: (a: DriftAssessment | null) => void;
} {
  const [assessment, setAssessment] = useState<DriftAssessment | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!surfaceType || !surfaceId) {
      setAssessment(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    supabase
      .from("surface_drift_assessments")
      .select("*")
      .eq("surface_type", surfaceType)
      .eq("surface_id", surfaceId)
      .order("last_assessed_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error: err }) => {
        setIsLoading(false);
        if (err) {
          setError(err.message);
          return;
        }
        setAssessment(data as DriftAssessment | null);
      });
  }, [surfaceType, surfaceId, refreshKey]);

  const markSeen = useCallback(async () => {
    if (!assessment || assessment.operator_seen_at) return;
    const { data, error: err } = await supabase
      .from("surface_drift_assessments")
      .update({ operator_seen_at: new Date().toISOString() })
      .eq("id", assessment.id)
      .select()
      .maybeSingle();
    if (!err && data) {
      setAssessment(data as DriftAssessment);
    }
  }, [assessment]);

  const acceptAsAligned = useCallback(async () => {
    if (!assessment) throw new Error("No assessment to accept");
    const { data, error: err } = await supabase
      .from("surface_drift_assessments")
      .update({ accepted_as_aligned_at: new Date().toISOString() })
      .eq("id", assessment.id)
      .select()
      .maybeSingle();
    if (err) throw new Error(err.message);
    if (data) setAssessment(data as DriftAssessment);
  }, [assessment]);

  return { assessment, isLoading, error, markSeen, acceptAsAligned, setAssessment };
}
