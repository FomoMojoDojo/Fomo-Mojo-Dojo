-- Gate B commit 2a, C2-2 (operator rulings R11 + R22, signed 2026-09-20): the ONE write path that withdraws
-- an interview upload. SECURITY DEFINER; the actor is auth.uid() — refused when NULL or not an admin. One
-- transaction: lock the record, refuse if already retracted, set the retraction triple (reason
-- operator_withdrew_upload), archive the file (archive_reason interview_withdrawn, archive_source
-- withdraw_interview), one integrity_runs row (component interview_withdrawn) with the pre-values embedded.
-- The retraction itself is irreversible by design (set-once); the audit row records what was withdrawn.
BEGIN;
CREATE OR REPLACE FUNCTION public.withdraw_interview_upload(p_record_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_rec public.interview_records%ROWTYPE;
  v_file public.input_files%ROWTYPE;
  v_now timestamptz := now();
  v_audit_id bigint;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'withdraw_interview_upload: no authenticated caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.has_role(v_actor, 'admin'::app_role) THEN
    RAISE EXCEPTION 'withdraw_interview_upload: caller is not an admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_rec FROM public.interview_records WHERE id = p_record_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdraw_interview_upload: no interview record %', p_record_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_rec.input_file_id IS NULL THEN
    RAISE EXCEPTION 'withdraw_interview_upload: record % is not an upload record', p_record_id USING ERRCODE = 'check_violation';
  END IF;
  IF v_rec.retracted_at IS NOT NULL THEN
    RAISE EXCEPTION 'withdraw_interview_upload: record % is already withdrawn (retracted % — %)', p_record_id, v_rec.retracted_at, coalesce(v_rec.retracted_reason, '-') USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_file FROM public.input_files WHERE id = v_rec.input_file_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdraw_interview_upload: input_files row % is missing', v_rec.input_file_id USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.interview_records
     SET retracted_at = v_now, retracted_reason = 'operator_withdrew_upload', retracted_by = v_actor
   WHERE id = p_record_id;
  UPDATE public.input_files
     SET archived_at = coalesce(archived_at, v_now),
         archived_by = coalesce(archived_by, v_actor),
         archive_reason = 'interview_withdrawn',
         archive_source = 'withdraw_interview'
   WHERE id = v_rec.input_file_id;

  INSERT INTO public.integrity_runs (company_id, component, surface_type, surface_id, ran_at, status, examined, admitted, excluded_by_rule, run_ref)
  VALUES (v_rec.company_id, 'interview_withdrawn', 'interview_records', p_record_id, v_now, 'completed', 1, 1,
    jsonb_build_object(
      'ruling', 'R11 (2026-09-20): withdraw interview upload — the record is retracted (set-once, irreversible by design) and the file archived; nothing from it is used.',
      'record_id', p_record_id, 'input_file_id', v_rec.input_file_id, 'file_name', v_file.file_name, 'actor', v_actor,
      'before', jsonb_build_object('record', jsonb_build_object('speaker_role', v_rec.speaker_role, 'market_state', v_rec.market_state, 'journey_key', v_rec.journey_key, 'retracted_at', v_rec.retracted_at),
                                   'file', jsonb_build_object('archived_at', v_file.archived_at, 'archive_reason', v_file.archive_reason, 'archive_source', v_file.archive_source)),
      'after', jsonb_build_object('retracted_reason', 'operator_withdrew_upload', 'archive_reason', 'interview_withdrawn', 'archive_source', 'withdraw_interview'),
      'reversal', 'The retraction is set-once and cannot be reversed; the file row can be un-archived only by an operator with the trigger trg_input_files_refuse_interview_restore disabled — not offered.'
    ), 'withdraw_interview_upload')
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object('ok', true, 'record_id', p_record_id, 'input_file_id', v_rec.input_file_id, 'audit_id', v_audit_id, 'retracted_at', v_now);
END;
$$;
REVOKE ALL ON FUNCTION public.withdraw_interview_upload(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.withdraw_interview_upload(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.withdraw_interview_upload(uuid) IS 'C2-2 (2026-09-20): withdraw an interview upload — retraction triple + file archive + audit row, one transaction, admin actor only (auth.uid()).';
COMMIT;
