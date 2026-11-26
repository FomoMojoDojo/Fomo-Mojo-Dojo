// The outside score's own record of WHY a company has, or has not, an outside score (SP-685 / SP-686
// ruling 4, 2026-11-25) — read side.
//
// The outside scorer (supabase/functions/outside-score) leaves one integrity_runs row per verdict,
// component 'first_read_outside_score', with excluded_by_rule.state:
//   "scored"      a score row was written
//   "ineligible"  the scorer ran and too few outside-voice signals cleared its floor
//   (no row)      the scorer never ran for this company
// The First Read already grounds its empty note in this record (useFirstReadPreviewData), never in
// "did a baseline run". The client story's score card and the First Read export now do the same,
// through this hook, so one company reads the same note on every surface.
//
// integrity_runs is readable by a company's own members (its row-level policy), so a member login
// sees the right note — not only an admin.
//
// `settled` exists because "not loading" is not "loaded": the read reports loading=false before its
// first request starts. A surface that picked its note before the read returned would show the
// wrong one for a moment.
import { useEffect, useRef, useState } from "react";
import { useIntegrityRecord } from "./useIntegrityRecord";

export const OUTSIDE_SCORE_RECORD_COMPONENT = "first_read_outside_score";
export type OutsideScoreState = "scored" | "ineligible";

export function outsideScoreStateFromRecord(
  record: { excluded_by_rule: Record<string, unknown> | null } | null,
): OutsideScoreState | null {
  const s = record?.excluded_by_rule?.state;
  return s === "scored" || s === "ineligible" ? s : null;
}

export function useOutsideScoreState(companyId: string | null | undefined): {
  state: OutsideScoreState | null; settled: boolean; loading: boolean; error: string | null;
} {
  const { record, error, loading } = useIntegrityRecord(companyId, OUTSIDE_SCORE_RECORD_COMPONENT);
  const sawLoading = useRef(false);
  const [settledFor, setSettledFor] = useState<string | null>(null);
  useEffect(() => { sawLoading.current = false; }, [companyId]);
  useEffect(() => {
    if (!companyId) return;
    if (loading) sawLoading.current = true;
    else if (sawLoading.current) setSettledFor(companyId);
  }, [companyId, loading]);
  return { state: outsideScoreStateFromRecord(record), settled: Boolean(companyId) && settledFor === companyId && !loading, loading, error };
}
