-- ── R-A3 (operator ruling, 2026-10-12): set_interview_date — fill a missing interview date ──────
--
-- Act 1's chip owes a date: "You told us · {name} · {date}". Record ed055835 (the Edgewood kickoff)
-- carries no interviewed_at, and interview_records_immutable listed that column among the values
-- fixed at birth, so there was no way to supply it. R-A3 rules that FILLING a blank is a different
-- act from CHANGING a value, and gives the fill a narrow door.
--
-- Two layers, deliberately:
--   1. The TRIGGER now permits NULL -> a timestamp and refuses everything else on that column —
--      value -> other value, and value -> NULL. The invariant therefore holds on every path, not
--      just through the RPC. v_correcting is NOT widened (R-A3 said not to): the speaker-correction
--      door is untouched and still gates only speaker_role / content_identity / speaker_history.
--   2. set_interview_date is the sanctioned caller, on the correct_interview_speaker pattern:
--      SECURITY DEFINER, admin actor only, row locked FOR UPDATE, refuses a retracted record, a
--      record that already has a date, and a NULL/absent date; writes one integrity_runs row
--      carrying its own reversal.
--
-- REVERSAL is honest about what is possible: once filled, the trigger forbids clearing it, so the
-- audit row says the reversal needs the trigger suspended inside a transaction rather than offering
-- SQL that would fail. (The same discipline as R-A1's first audit row, which R-A4 later made real.)
CREATE OR REPLACE FUNCTION public.interview_records_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
  THEN
    RAISE EXCEPTION 'interview record % is immutable after birth — only journey_key / market_state / market_basis / review_state / our_speakers, the parse stamp (forward only), the retraction triple, and (through correct_interview_speaker) speaker_role / content_identity / speaker_history may change', OLD.id;
  END IF;
  -- ── R-A3 (operator ruling, 2026-10-12): interviewed_at may be FILLED, never changed ──────────
  -- It left the hard-immutable list above and got its own rule instead, because filling a blank is
  -- not the same act as changing a value. NULL -> a timestamp is allowed (the date was never
  -- recorded at birth; a kickoff record carries several speakers and often no single date). A set
  -- value -> anything else is refused, and so is clearing it back to NULL. The invariant lives HERE
  -- so every path obeys it, not only the RPC; set_interview_date is the admin-gated, audited caller.
  -- v_correcting is deliberately NOT consulted: R-A3 said not to widen the speaker-correction door.
  IF NEW.interviewed_at IS DISTINCT FROM OLD.interviewed_at AND OLD.interviewed_at IS NOT NULL THEN
    RAISE EXCEPTION 'interview record % — interviewed_at is already recorded (%); it may be filled when NULL but never changed or cleared', OLD.id, OLD.interviewed_at;
  END IF;

  -- R6: forward only. NULL -> a time is a first parse; time -> a later time is a re-parse.
  IF OLD.parsed_at IS NOT NULL AND (NEW.parsed_at IS NULL OR NEW.parsed_at < OLD.parsed_at) THEN
    RAISE EXCEPTION 'interview record % — parsed_at only moves forward; it is never cleared or wound back', OLD.id;
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
$function$;


CREATE OR REPLACE FUNCTION public.set_interview_date(p_record_id uuid, p_interviewed_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_rec public.interview_records%ROWTYPE;
  v_now timestamptz := now();
  v_audit_id bigint;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'set_interview_date: no authenticated caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.has_role(v_actor, 'admin'::app_role) THEN
    RAISE EXCEPTION 'set_interview_date: caller is not an admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_interviewed_at IS NULL THEN
    RAISE EXCEPTION 'set_interview_date: interviewed_at is required — this RPC fills a missing date, it never clears one' USING ERRCODE = 'check_violation';
  END IF;
  IF p_interviewed_at > v_now THEN
    RAISE EXCEPTION 'set_interview_date: % is in the future — an interview date is a date it happened', p_interviewed_at USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_rec FROM public.interview_records WHERE id = p_record_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'set_interview_date: no interview record %', p_record_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_rec.retracted_at IS NOT NULL THEN
    RAISE EXCEPTION 'set_interview_date: record % is withdrawn', p_record_id USING ERRCODE = 'check_violation';
  END IF;
  IF v_rec.interviewed_at IS NOT NULL THEN
    RAISE EXCEPTION 'set_interview_date: record % already has interviewed_at (%) — it is filled once and never changed', p_record_id, v_rec.interviewed_at USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.interview_records SET interviewed_at = p_interviewed_at WHERE id = p_record_id;

  INSERT INTO public.integrity_runs (company_id, component, surface_type, surface_id, ran_at, status, examined, admitted, excluded_by_rule, run_ref)
  VALUES (v_rec.company_id, 'interview_date_filled', 'interview_records', p_record_id, v_now, 'completed', 1, 1,
    jsonb_build_object(
      'mode', 'write',
      'act', 'R-A3 — fill a missing interview date so the attested chip can carry one',
      'record_id', p_record_id,
      'interviewed_at_before', NULL,
      'interviewed_at_after', p_interviewed_at,
      'actor', v_actor,
      'reversal_sql', NULL,
      'reversal_note', 'NO WORKING REVERSAL BY DESIGN. The trigger interview_records_immutable permits NULL -> a timestamp on interviewed_at and refuses every other transition, so clearing it back to NULL raises. Reversing this fill needs the trigger suspended inside a single transaction (ALTER TABLE ... DISABLE TRIGGER interview_records_immutable; UPDATE ... SET interviewed_at = NULL; ENABLE; all in one transaction), which is an operator act. The date filled here was operator-supplied, not derived, so a wrong value is a wrong input rather than a bad computation.'),
    'set_interview_date')
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object('ok', true, 'record_id', p_record_id, 'interviewed_at', p_interviewed_at, 'audit_id', v_audit_id);
END;
$$;
REVOKE ALL ON FUNCTION public.set_interview_date(uuid, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.set_interview_date(uuid, timestamptz) TO authenticated, service_role;
COMMENT ON FUNCTION public.set_interview_date(uuid, timestamptz) IS 'R-A3 (2026-10-12): fill a missing interviewed_at on an interview record — admin actor only, NULL -> a timestamp only, never a change or a clear, one audit row. The same invariant is enforced in interview_records_immutable so every path obeys it.';
