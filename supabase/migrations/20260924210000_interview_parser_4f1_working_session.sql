-- ── 4f-1: A THIRD RECORD TYPE — "working session" (operator rulings F1, 2026-09-24) ──────────────
--
-- Skoobs reframed the Edgewood kickoff: it was a first-read REVIEW MEETING, not a stakeholder
-- interview. The two record types the estate has — client_stakeholder and market_participant — both
-- assume someone is being interviewed about their own world. A working session is neither: our side
-- and theirs are in the room together, reading our document.
--
-- This migration adds ONLY the record type. Segments, the boundary proposer, read-review landing,
-- the need holder and the optional metric are later 4f commits and are not touched here.
--
-- F1: a working-session item takes provenance client_attested. It is still the client attesting to
-- their own world; what distinguishes these rows is the HOLDER (4f-6), not the provenance verb. So
-- no new provenance_type_enum value is added, and market_interviewed stays bound to
-- market_participant alone.
--
-- REVERSAL. Everything here is additive: a widened CHECK, a third arm in two CASEs, and one
-- OR in a trigger. To reverse, narrow the CHECK back (which requires no working_session rows to
-- exist) and restore the three routines from 20260916090100 / 20260916100000 / 20260920103000.

BEGIN;

-- ── 1. the record type itself ────────────────────────────────────────────────────────────────────
-- market_state stays governed by interview_records_market_state_key: a working session is per_item,
-- so journey_key is NULL and 'placed' is never reachable for it.
ALTER TABLE public.interview_records DROP CONSTRAINT IF EXISTS interview_records_speaker_role_check;
ALTER TABLE public.interview_records
  ADD CONSTRAINT interview_records_speaker_role_check
  CHECK (speaker_role IN ('client_stakeholder', 'market_participant', 'working_session'));

-- ── 2. re-typing: correct_interview_speaker gains the third arm ──────────────────────────────────
-- The whitelist and the market-state CASE both grow. Every other guard is unchanged and still
-- applies: admin only, upload records only, not withdrawn, NOT AFTER PARSING, no inference in
-- flight, and the content-identity collision (identity mixes the role in, so the same transcript may
-- exist once per role).
CREATE OR REPLACE FUNCTION public.correct_interview_speaker(p_record_id uuid, p_speaker_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_rec public.interview_records%ROWTYPE;
  v_now timestamptz := now();
  v_identity text;
  v_state text;
  v_audit_id bigint;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'correct_interview_speaker: no authenticated caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.has_role(v_actor, 'admin'::app_role) THEN
    RAISE EXCEPTION 'correct_interview_speaker: caller is not an admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_speaker_role NOT IN ('client_stakeholder', 'market_participant', 'working_session') THEN
    RAISE EXCEPTION 'correct_interview_speaker: speaker_role must be client_stakeholder, market_participant or working_session' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_rec FROM public.interview_records WHERE id = p_record_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'correct_interview_speaker: no interview record %', p_record_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_rec.input_file_id IS NULL THEN
    RAISE EXCEPTION 'correct_interview_speaker: record % is not an upload record' , p_record_id USING ERRCODE = 'check_violation';
  END IF;
  IF v_rec.retracted_at IS NOT NULL THEN
    RAISE EXCEPTION 'correct_interview_speaker: record % is withdrawn', p_record_id USING ERRCODE = 'check_violation';
  END IF;
  IF v_rec.parsed_at IS NOT NULL THEN
    RAISE EXCEPTION 'correct_interview_speaker: record % is parsed — the speaker is fixed', p_record_id USING ERRCODE = 'check_violation';
  END IF;
  IF v_rec.speaker_role = p_speaker_role THEN
    RAISE EXCEPTION 'correct_interview_speaker: record % already has speaker %', p_record_id, p_speaker_role USING ERRCODE = 'check_violation';
  END IF;
  IF public.interview_inference_in_flight(p_record_id) THEN
    RAISE EXCEPTION 'correct_interview_speaker: record % has a market inference in flight', p_record_id USING ERRCODE = 'check_violation';
  END IF;

  v_identity := public.interview_content_identity(v_rec.company_id, p_speaker_role, v_rec.verbatim);
  -- 4f-1: a working session is placed PER ITEM, exactly like a stakeholder transcript — its items
  -- each name their own market (or none). Only a market_participant record is placed as a whole.
  v_state := CASE WHEN p_speaker_role = 'market_participant' THEN 'unplaced' ELSE 'per_item' END;
  PERFORM set_config('app.interview_correction', p_record_id::text, true);
  BEGIN
    UPDATE public.interview_records
       SET speaker_role = p_speaker_role,
           content_identity = v_identity,
           market_state = v_state,
           journey_key = NULL,
           speaker_history = speaker_history || jsonb_build_array(jsonb_build_object('from', v_rec.speaker_role, 'to', p_speaker_role, 'by', v_actor, 'at', v_now))
     WHERE id = p_record_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'speaker_identity_collision' USING ERRCODE = 'unique_violation',
      DETAIL = 'This transcript is already recorded with that speaker.', HINT = p_record_id::text;
  END;
  PERFORM set_config('app.interview_correction', '', true);

  INSERT INTO public.integrity_runs (company_id, component, surface_type, surface_id, ran_at, status, examined, admitted, excluded_by_rule, run_ref)
  VALUES (v_rec.company_id, 'interview_speaker_corrected', 'interview_records', p_record_id, v_now, 'completed', 1, 1,
    jsonb_build_object('record_id', p_record_id, 'from', v_rec.speaker_role, 'to', p_speaker_role, 'actor', v_actor,
                       'market_state_before', v_rec.market_state, 'journey_key_before', v_rec.journey_key, 'market_state_after', v_state,
                       'reversal', 'correct_interview_speaker back to the previous role (a new history entry; the identity recomputes).'),
    'correct_interview_speaker')
  RETURNING id INTO v_audit_id;
  RETURN jsonb_build_object('ok', true, 'record_id', p_record_id, 'speaker_role', p_speaker_role, 'market_state', v_state, 'audit_id', v_audit_id);
END;
$function$;

-- ── 3. findings: working_session maps to client_attested (F1) ────────────────────────────────────
-- Only the CASE changes. The market-key guard above it still names market_participant alone,
-- because only a market_participant record is bound to one market as a whole.
CREATE OR REPLACE FUNCTION public.record_interview_finding_provenance(p_role text)
 RETURNS public.provenance_type_enum
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE p_role
    WHEN 'client_stakeholder' THEN 'client_attested'::public.provenance_type_enum
    WHEN 'working_session'    THEN 'client_attested'::public.provenance_type_enum
    WHEN 'market_participant' THEN 'market_interviewed'::public.provenance_type_enum
  END;
$function$;

COMMENT ON FUNCTION public.record_interview_finding_provenance(text) IS
  '4f-1: the one place a speaker_role becomes a provenance_type. A working session is the client attesting, so it takes client_attested (ruling F1); what separates it from a stakeholder interview is the need HOLDER, not the provenance verb.';

-- ── 4. record_interview_finding now reads the mapping instead of carrying its own copy ───────────
CREATE OR REPLACE FUNCTION public.record_interview_finding(p_company_id uuid, p_user_id uuid, p_journey_key text, p_step_number integer, p_step_label text, p_statement text, p_interview_record_id uuid DEFAULT NULL::uuid, p_record jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(record_id uuid, need_id uuid, reused_record boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- 4f-1: ONE mapping, in one place. Inlining it here is how client_stakeholder and
  -- market_participant came to be written out in three separate routines.
  v_provenance := public.record_interview_finding_provenance(v_role);
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
$function$;

-- ── 5. the odi_needs pairing rule accepts client_attested from a working session (F1) ────────────
-- The trigger odi_needs_interview_consistency on public.odi_needs is unchanged; only its function
-- body moves. Everything else it enforces stands: provenance <-> pointer both ways, same company,
-- never service_state underserved, and the pairing immutable once born.
CREATE OR REPLACE FUNCTION public.odi_needs_interview_consistency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  is_interview boolean;
  rec_role text;
  rec_company uuid;
BEGIN
  IF current_setting('app.provenance_backfill', true) = 'on' THEN
    RETURN NEW;
  END IF;

  is_interview := NEW.provenance_type::text IN ('client_attested', 'market_interviewed');

  -- provenance ⇔ pointer, both directions
  IF is_interview AND NEW.interview_record_id IS NULL THEN
    RAISE EXCEPTION 'odi_needs.provenance_type % requires interview_record_id — a "you told us" need must point at its interview record', NEW.provenance_type;
  END IF;
  IF NOT is_interview AND NEW.interview_record_id IS NOT NULL THEN
    RAISE EXCEPTION 'odi_needs.interview_record_id is only valid with provenance_type client_attested or market_interviewed (got %)', NEW.provenance_type;
  END IF;

  IF is_interview THEN
    SELECT speaker_role, company_id INTO rec_role, rec_company
      FROM public.interview_records WHERE id = NEW.interview_record_id;
    IF rec_role IS NULL THEN
      RAISE EXCEPTION 'odi_needs.interview_record_id % does not name an interview record', NEW.interview_record_id;
    END IF;
    IF rec_company IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'interview record % belongs to another company', NEW.interview_record_id;
    END IF;
    -- 4f-1: the provenance a record's role yields is the SAME mapping record_interview_finding
    -- uses, asked the other way round. client_stakeholder AND working_session both yield
    -- client_attested (ruling F1); market_interviewed stays bound to market_participant alone; an
    -- unknown role yields NULL and is refused rather than waved through.
    IF public.record_interview_finding_provenance(rec_role) IS DISTINCT FROM NEW.provenance_type THEN
      RAISE EXCEPTION '% requires an interview record whose speaker_role yields it (record % is %)',
        NEW.provenance_type, NEW.interview_record_id, rec_role;
    END IF;
    -- an interview finding is evidence, never an ODI verdict
    IF lower(coalesce(NEW.service_state, '')) IN ('underserved', 'under_served') THEN
      RAISE EXCEPTION 'an interview-sourced need (%) can never carry service_state underserved — findings are evidence, not verdicts', NEW.provenance_type;
    END IF;
  END IF;

  -- once born as an interview need, the pairing is immutable
  IF TG_OP = 'UPDATE' AND OLD.provenance_type::text IN ('client_attested', 'market_interviewed') THEN
    IF NEW.provenance_type IS DISTINCT FROM OLD.provenance_type THEN
      RAISE EXCEPTION 'odi_needs.provenance_type is immutable for an interview-sourced need — % cannot change % -> %', OLD.id, OLD.provenance_type, NEW.provenance_type;
    END IF;
    IF NEW.interview_record_id IS DISTINCT FROM OLD.interview_record_id THEN
      RAISE EXCEPTION 'odi_needs.interview_record_id is immutable for an interview-sourced need — % cannot change % -> %', OLD.id, OLD.interview_record_id, NEW.interview_record_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;
