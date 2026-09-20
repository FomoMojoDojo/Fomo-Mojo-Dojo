-- Gate B commit 2a, C2-1 (operator rulings signed 2026-09-20, R11): a withdrawn interview upload stays
-- withdrawn. An input_files row that is_interview whose record is retracted cannot have archived_at set
-- back to NULL (the workspace "Restore" path). Non-destructive; BEFORE UPDATE trigger only.
BEGIN;
CREATE OR REPLACE FUNCTION public.input_files_refuse_interview_restore()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.is_interview AND OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL
     AND EXISTS (SELECT 1 FROM public.interview_records r WHERE r.input_file_id = OLD.id AND r.retracted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'interview upload % is withdrawn — it cannot be restored', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_input_files_refuse_interview_restore ON public.input_files;
CREATE TRIGGER trg_input_files_refuse_interview_restore
  BEFORE UPDATE OF archived_at ON public.input_files
  FOR EACH ROW EXECUTE FUNCTION public.input_files_refuse_interview_restore();
COMMENT ON FUNCTION public.input_files_refuse_interview_restore() IS 'C2-1 (2026-09-20): a withdrawn interview upload (retracted record) can never be un-archived.';
COMMIT;
