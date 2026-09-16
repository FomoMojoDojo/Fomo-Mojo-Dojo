-- Gate 2 (operator ruling 2026-09-16) — two amendments to gate 1.
--
-- 1. interview_records_immutable: the DELETE branch permits a delete ONLY when the parent company
--    is already gone (the ON DELETE CASCADE from companies) — a direct DELETE stays refused.
-- 2. record_interview_finding(...): the ONE sanctioned write path for an interview finding —
--    interview record + odi_needs row in one transaction (SECURITY DEFINER), refusing a second
--    need on the same (record, journey_key, step_number). The edge function calls this and nothing
--    else writes.

BEGIN;

-- ── 1. cascade-aware delete guard ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.interview_records_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- The only lawful delete is the cascade from a deleted company (the parent row is gone).
    IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = OLD.company_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'interview records are retracted, never deleted — record % (%)', OLD.id, OLD.person_name;
  END IF;

  -- Retraction is set-once: a retracted record can never change again, including its retraction.
  IF OLD.retracted_at IS NOT NULL THEN
    RAISE EXCEPTION 'interview record % is retracted and can no longer change (retracted % — %)',
      OLD.id, OLD.retracted_at, coalesce(OLD.retracted_reason, 'no reason recorded');
  END IF;

  -- Every column except the three retraction columns is immutable after birth.
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.speaker_role IS DISTINCT FROM OLD.speaker_role
     OR NEW.person_name IS DISTINCT FROM OLD.person_name
     OR NEW.person_role IS DISTINCT FROM OLD.person_role
     OR NEW.journey_key IS DISTINCT FROM OLD.journey_key
     OR NEW.interviewed_at IS DISTINCT FROM OLD.interviewed_at
     OR NEW.interviewer IS DISTINCT FROM OLD.interviewer
     OR NEW.consent_basis IS DISTINCT FROM OLD.consent_basis
     OR NEW.verbatim IS DISTINCT FROM OLD.verbatim
     OR NEW.content_identity IS DISTINCT FROM OLD.content_identity
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'interview record % is immutable after birth — only retracted_at / retracted_reason / retracted_by may be set, once', OLD.id;
  END IF;

  IF NEW.retracted_at IS NOT NULL AND (NEW.retracted_reason IS NULL OR length(btrim(NEW.retracted_reason)) = 0) THEN
    RAISE EXCEPTION 'interview record % cannot be retracted without retracted_reason', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

-- ── 2. the atomic write ──────────────────────────────────────────────────────────────────────
-- Inputs are already validated by the edge function (live definition, live step ≥ 1, local-model
-- statement). This function re-checks what it can cheaply re-check and does the two inserts in
-- one transaction. Reuse: p_interview_record_id names an existing LIVE record of the same company;
-- otherwise a new record is inserted from p_record (jsonb). The record's speaker_role decides the
-- need's provenance_type (the gate-1 consistency trigger re-verifies the pairing on insert).
CREATE OR REPLACE FUNCTION public.record_interview_finding(
  p_company_id uuid,
  p_user_id uuid,
  p_journey_key text,
  p_step_number integer,
  p_step_label text,
  p_statement text,
  p_interview_record_id uuid DEFAULT NULL,
  p_record jsonb DEFAULT NULL
)
RETURNS TABLE (record_id uuid, need_id uuid, reused_record boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record_id uuid;
  v_reused boolean := false;
  v_role text;
  v_record_key text;
  v_provenance public.provenance_type_enum;
  v_need_id uuid;
  v_statement text;
  v_identity text;
BEGIN
  v_statement := btrim(coalesce(p_statement, ''));
  IF length(v_statement) = 0 THEN
    RAISE EXCEPTION 'record_interview_finding: statement is required';
  END IF;
  IF p_step_number IS NULL OR p_step_number < 1 THEN
    RAISE EXCEPTION 'record_interview_finding: step_number must be >= 1 (never step 0)';
  END IF;

  -- the record: reuse a live one, or insert
  IF p_interview_record_id IS NOT NULL THEN
    SELECT id, speaker_role, journey_key INTO v_record_id, v_role, v_record_key
      FROM public.interview_records
     WHERE id = p_interview_record_id AND company_id = p_company_id AND retracted_at IS NULL;
    IF v_record_id IS NULL THEN
      RAISE EXCEPTION 'record_interview_finding: interview record % is not a live record of this company', p_interview_record_id;
    END IF;
    v_reused := true;
  ELSE
    IF p_record IS NULL THEN
      RAISE EXCEPTION 'record_interview_finding: either interview_record_id or a new record is required';
    END IF;
    INSERT INTO public.interview_records
      (company_id, speaker_role, person_name, person_role, journey_key, interviewed_at, interviewer, consent_basis, verbatim, created_by)
    VALUES
      (p_company_id,
       p_record->>'speaker_role',
       p_record->>'person_name',
       nullif(btrim(coalesce(p_record->>'person_role', '')), ''),
       nullif(btrim(coalesce(p_record->>'journey_key', '')), ''),
       (p_record->>'interviewed_at')::timestamptz,
       p_record->>'interviewer',
       p_record->>'consent_basis',
       p_record->>'verbatim',
       p_user_id)
    RETURNING id, speaker_role, journey_key INTO v_record_id, v_role, v_record_key;
  END IF;

  -- a market participant's finding attaches only to that participant's own market
  IF v_role = 'market_participant' AND v_record_key IS DISTINCT FROM p_journey_key THEN
    RAISE EXCEPTION 'record_interview_finding: a market_participant record for % cannot attach a finding to %', v_record_key, p_journey_key;
  END IF;

  v_provenance := CASE v_role
    WHEN 'client_stakeholder' THEN 'client_attested'::public.provenance_type_enum
    WHEN 'market_participant' THEN 'market_interviewed'::public.provenance_type_enum
  END;
  IF v_provenance IS NULL THEN
    RAISE EXCEPTION 'record_interview_finding: unknown speaker_role %', v_role;
  END IF;

  -- one finding per (record, market, step)
  IF EXISTS (SELECT 1 FROM public.odi_needs
              WHERE interview_record_id = v_record_id AND journey_key = p_journey_key AND step_number = p_step_number) THEN
    RAISE EXCEPTION 'record_interview_finding: record % already has a finding on % step %', v_record_id, p_journey_key, p_step_number;
  END IF;

  -- PCT-1 identity: sha256 of the normalized desired_outcome (contentIdentity.ts: lower, collapse whitespace, trim)
  v_identity := encode(extensions.digest(btrim(regexp_replace(lower(v_statement), '\s+', ' ', 'g')), 'sha256'), 'hex');

  INSERT INTO public.odi_needs
    (company_id, user_id, provenance_type, interview_record_id, tier, desired_outcome, odi_canonical_statement,
     journey_key, step_number, step_label, importance, satisfaction, opportunity_score, service_state,
     source_path, frameworks_used, validation_state, content_identity, status)
  VALUES
    (p_company_id, p_user_id, v_provenance, v_record_id, 'need', v_statement, v_statement,
     p_journey_key, p_step_number, coalesce(p_step_label, ''), 0, 0, 0, 'served',
     'interview', ARRAY['interview', 'JTBD', 'ODI']::text[], 'unvalidated', v_identity, 'active')
  RETURNING id INTO v_need_id;

  record_id := v_record_id; need_id := v_need_id; reused_record := v_reused;
  RETURN NEXT;
END;
$$;

-- service role only: the edge function is the single caller.
REVOKE ALL ON FUNCTION public.record_interview_finding(uuid, uuid, text, integer, text, text, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_interview_finding(uuid, uuid, text, integer, text, text, uuid, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_interview_finding(uuid, uuid, text, integer, text, text, uuid, jsonb) TO service_role;

COMMIT;
