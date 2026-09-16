-- Gate 3 (operator ruling 2026-09-16) — a retracted interview record's finding vanishes from every
-- surface. odi_needs.status admits 'active' | 'superseded' today; 'superseded' means REPLACED by
-- another row (superseded_by_id) and does not describe a retraction, so 'retracted' is added.
-- An AFTER UPDATE trigger on interview_records propagates the retraction to every need pointing at
-- the record. The gate-1 consistency trigger permits the status change (provenance_type and the
-- pointer stay immutable — the row keeps saying where it came from; it just no longer renders).

BEGIN;

ALTER TABLE public.odi_needs DROP CONSTRAINT odi_needs_status_check;
ALTER TABLE public.odi_needs ADD CONSTRAINT odi_needs_status_check
  CHECK (status = ANY (ARRAY['active'::text, 'superseded'::text, 'retracted'::text]));

CREATE OR REPLACE FUNCTION public.interview_records_retraction_propagates()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.retracted_at IS NULL AND NEW.retracted_at IS NOT NULL THEN
    UPDATE public.odi_needs
       SET status = 'retracted', updated_at = now()
     WHERE interview_record_id = NEW.id AND status <> 'retracted';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER interview_records_retraction_propagates
  AFTER UPDATE ON public.interview_records
  FOR EACH ROW EXECUTE FUNCTION public.interview_records_retraction_propagates();

COMMIT;
