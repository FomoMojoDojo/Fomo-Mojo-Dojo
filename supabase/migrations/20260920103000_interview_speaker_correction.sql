-- Gate B commit 2a, C2-4 (operator rulings R14, R22, R24, signed 2026-09-20): the speaker on an upload record
-- is correctable until the transcript is parsed, with append-only history.
--   * parsed_at timestamptz NULL (the parser gate sets it later); speaker_history jsonb NOT NULL DEFAULT '[]'.
--   * ONE identity formula: interview_content_identity(company_id, speaker_role, verbatim) — used by the birth
--     trigger (interview_records_identity, unchanged result) AND by the correction (never copied).
--   * interview_records_immutable replaced: speaker_role / content_identity / speaker_history may change ONLY
--     when the transaction-local GUC app.interview_correction names the row (set inside the RPC); speaker_history
--     and market_basis are append-only; everything else as before.
--   * correct_interview_speaker(p_record_id, p_speaker_role): SECURITY DEFINER, actor = auth.uid() (NULL or
--     non-admin refused); refuses a retracted row, a parsed row, the same role, or an in-flight inference
--     (interview_inference_in_flight — returns false until commit 2b). Customer → Stakeholder: per_item,
--     journey_key NULL, market_basis history kept. Stakeholder → Customer: unplaced; an old override is NOT
--     re-applied (R24). A live-identity collision (interview_records_company_identity_live) surfaces as the
--     named error speaker_identity_collision (P2) and the row stays byte-identical.
BEGIN;
ALTER TABLE public.interview_records
  ADD COLUMN IF NOT EXISTS parsed_at timestamptz,
  ADD COLUMN IF NOT EXISTS speaker_history jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.interview_records
  ADD CONSTRAINT interview_records_speaker_history_array CHECK (jsonb_typeof(speaker_history) = 'array');
COMMENT ON COLUMN public.interview_records.parsed_at IS 'Set by the parser gate; while NULL the speaker may be corrected (R14).';
COMMENT ON COLUMN public.interview_records.speaker_history IS 'Append-only history of speaker corrections: [{from, to, by, at}] (R14).';

CREATE OR REPLACE FUNCTION public.interview_content_identity(p_company_id uuid, p_speaker_role text, p_verbatim text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT encode(extensions.digest(
    'interview-records-2026-09:' || p_company_id::text || ':' || p_speaker_role || ':' ||
    btrim(regexp_replace(lower(coalesce(p_verbatim, '')), '\s+', ' ', 'g')), 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.interview_records_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.content_identity := public.interview_content_identity(NEW.company_id, NEW.speaker_role, NEW.verbatim);
  IF NEW.market_state IS NULL THEN
    NEW.market_state := CASE WHEN NEW.journey_key IS NOT NULL THEN 'placed'
                             WHEN NEW.speaker_role = 'client_stakeholder' THEN 'per_item'
                             ELSE 'unplaced' END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.interview_inference_in_flight(p_record_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT false; -- commit 2b: a young integrity_runs 'planned' row of component interview_market_inference for the record
$$;

CREATE OR REPLACE FUNCTION public.interview_records_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  i int;
  v_correcting boolean := (current_setting('app.interview_correction', true) = OLD.id::text);
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = OLD.company_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'interview records are retracted, never deleted — record %', OLD.id;
  END IF;
  IF OLD.retracted_at IS NOT NULL THEN
    RAISE EXCEPTION 'interview record % is retracted and can no longer change (retracted % — %)',
      OLD.id, OLD.retracted_at, coalesce(OLD.retracted_reason, 'no reason recorded');
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.person_name IS DISTINCT FROM OLD.person_name
     OR NEW.person_role IS DISTINCT FROM OLD.person_role
     OR NEW.interviewed_at IS DISTINCT FROM OLD.interviewed_at
     OR NEW.interviewer IS DISTINCT FROM OLD.interviewer
     OR NEW.consent_basis IS DISTINCT FROM OLD.consent_basis
     OR NEW.verbatim IS DISTINCT FROM OLD.verbatim
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.input_file_id IS DISTINCT FROM OLD.input_file_id
     OR NEW.file_sha256 IS DISTINCT FROM OLD.file_sha256
     OR NEW.file_bytes IS DISTINCT FROM OLD.file_bytes
     OR NEW.text_sha256 IS DISTINCT FROM OLD.text_sha256
     OR NEW.extraction_method IS DISTINCT FROM OLD.extraction_method
     OR NEW.extraction_version IS DISTINCT FROM OLD.extraction_version
     OR (NEW.parsed_at IS DISTINCT FROM OLD.parsed_at AND OLD.parsed_at IS NOT NULL)
  THEN
    RAISE EXCEPTION 'interview record % is immutable after birth — only journey_key / market_state / market_basis / review_state, the retraction triple, and (through correct_interview_speaker) speaker_role / content_identity / speaker_history may change', OLD.id;
  END IF;
  IF (NEW.speaker_role IS DISTINCT FROM OLD.speaker_role
      OR NEW.content_identity IS DISTINCT FROM OLD.content_identity
      OR NEW.speaker_history IS DISTINCT FROM OLD.speaker_history)
     AND NOT v_correcting THEN
    RAISE EXCEPTION 'interview record % — speaker_role / content_identity / speaker_history change only through correct_interview_speaker', OLD.id;
  END IF;
  IF jsonb_array_length(NEW.market_basis) < jsonb_array_length(OLD.market_basis) THEN
    RAISE EXCEPTION 'interview record % market_basis is append-only history — an entry was removed', OLD.id;
  END IF;
  FOR i IN 0 .. jsonb_array_length(OLD.market_basis) - 1 LOOP
    IF NEW.market_basis -> i IS DISTINCT FROM OLD.market_basis -> i THEN
      RAISE EXCEPTION 'interview record % market_basis is append-only history — entry % was changed', OLD.id, i;
    END IF;
  END LOOP;
  IF jsonb_array_length(NEW.speaker_history) < jsonb_array_length(OLD.speaker_history) THEN
    RAISE EXCEPTION 'interview record % speaker_history is append-only history — an entry was removed', OLD.id;
  END IF;
  FOR i IN 0 .. jsonb_array_length(OLD.speaker_history) - 1 LOOP
    IF NEW.speaker_history -> i IS DISTINCT FROM OLD.speaker_history -> i THEN
      RAISE EXCEPTION 'interview record % speaker_history is append-only history — entry % was changed', OLD.id, i;
    END IF;
  END LOOP;
  IF NEW.retracted_at IS NOT NULL AND (NEW.retracted_reason IS NULL OR length(btrim(NEW.retracted_reason)) = 0) THEN
    RAISE EXCEPTION 'interview record % cannot be retracted without retracted_reason', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.correct_interview_speaker(p_record_id uuid, p_speaker_role text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
  IF p_speaker_role NOT IN ('client_stakeholder', 'market_participant') THEN
    RAISE EXCEPTION 'correct_interview_speaker: speaker_role must be client_stakeholder or market_participant' USING ERRCODE = 'check_violation';
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
  v_state := CASE WHEN p_speaker_role = 'client_stakeholder' THEN 'per_item' ELSE 'unplaced' END;
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
$$;
REVOKE ALL ON FUNCTION public.correct_interview_speaker(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.correct_interview_speaker(uuid, text) TO authenticated, service_role;
COMMENT ON FUNCTION public.correct_interview_speaker(uuid, text) IS 'C2-4 (2026-09-20): correct the speaker of an unparsed upload record — one identity formula, append-only history, admin actor only.';
COMMIT;
