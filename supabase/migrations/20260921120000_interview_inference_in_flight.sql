-- Gate B commit 2b (operator rulings R19–R35, signed 2026-09-21): interview_inference_in_flight becomes real.
-- infer-interview-market keeps ONE integrity_runs row per run in status 'planned' (component
-- interview_market_inference, surface_type interview_records, surface_id = the record id) and bumps its
-- ran_at after every window. A planned row bumped within the last 5 minutes = a run in flight: the Inputs
-- page hides "Change speaker" and does not offer "Infer market"; correct_interview_speaker refuses (2a).
-- 5 minutes without a bump = the run is stopped: this predicate turns false (the row offers "Infer market"
-- again) and the next run marks the stale row failed (error stale_no_progress).
-- Before: the 2a stub `SELECT false`. After: the predicate below. No table or column changes.
BEGIN;
CREATE OR REPLACE FUNCTION public.interview_inference_in_flight(p_record_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.integrity_runs r
    WHERE r.component = 'interview_market_inference'
      AND r.surface_type = 'interview_records'
      AND r.surface_id = p_record_id
      AND r.status = 'planned'
      AND r.ran_at > now() - interval '5 minutes'
  );
$$;
COMMENT ON FUNCTION public.interview_inference_in_flight(uuid) IS
  'Commit 2b (2026-09-21): true while an infer-interview-market run has a planned integrity_runs row for the record bumped within 5 minutes.';
COMMIT;
