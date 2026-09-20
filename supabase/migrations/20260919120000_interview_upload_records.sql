-- Gate B commit 1 — interview upload (operator rulings signed 2026-09-19: A1–A5, R1–R8).
-- Non-destructive. Widens interview_records so ONE row can be a transcript record (a saved file is the
-- authority; the record's copy must hash-equal it), keys the fence on the FILE (input_files.is_interview),
-- and replaces interview_records_immutable so ONLY journey_key, market_state, market_basis, review_state
-- and the retraction triple may change, and only on a non-retracted row.
--
--   * person_name / consent_basis: NOT NULL + CHECK dropped (no consent field, no invented person name).
--   * interviewer: NOT NULL dropped (no invented interviewer; created_by records the uploader).
--   * interview_records_market_needs_key dropped (a customer transcript may be unplaced: journey_key NULL).
--   * input_file_id (FK RESTRICT), file_sha256, file_bytes, text_sha256, extraction_method,
--     extraction_version — the transcript identity (R1); one record per file.
--   * market_state placed | unplaced | per_item — (market_state = 'placed') = (journey_key IS NOT NULL);
--     derived at INSERT when not supplied, so the quote path (record-interview-finding) is unchanged.
--     Existing rows: placed when they carry a key, per_item for a client_stakeholder, else unplaced.
--   * market_basis jsonb append-only history (R4); review_state unreviewed | reviewed.
--   * input_files.is_interview boolean NOT NULL DEFAULT false (A1) — set in the same insert as the row.
BEGIN;

ALTER TABLE public.input_files ADD COLUMN IF NOT EXISTS is_interview boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.input_files.is_interview IS 'A1 (2026-09-19): an interview transcript. The fence refuses analysis, the client-voice corpus and every sidecar path on this flag OR a matching interview_records.input_file_id.';

ALTER TABLE public.interview_records ALTER COLUMN person_name DROP NOT NULL;
ALTER TABLE public.interview_records DROP CONSTRAINT IF EXISTS interview_records_person_name_check;
ALTER TABLE public.interview_records ALTER COLUMN consent_basis DROP NOT NULL;
ALTER TABLE public.interview_records DROP CONSTRAINT IF EXISTS interview_records_consent_basis_check;
ALTER TABLE public.interview_records ALTER COLUMN interviewer DROP NOT NULL;
ALTER TABLE public.interview_records DROP CONSTRAINT IF EXISTS interview_records_market_needs_key;

ALTER TABLE public.interview_records
  ADD COLUMN IF NOT EXISTS input_file_id uuid REFERENCES public.input_files(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS file_sha256 text,
  ADD COLUMN IF NOT EXISTS file_bytes bigint,
  ADD COLUMN IF NOT EXISTS text_sha256 text,
  ADD COLUMN IF NOT EXISTS extraction_method text,
  ADD COLUMN IF NOT EXISTS extraction_version text,
  ADD COLUMN IF NOT EXISTS market_state text,
  ADD COLUMN IF NOT EXISTS market_basis jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS review_state text NOT NULL DEFAULT 'unreviewed';

-- Existing rows (2 retracted Edgewood client_stakeholder quotes, journey_key NULL → per_item). A retracted
-- row can never change (interview_records_immutable), so the backfill of the NEW column runs with that
-- trigger disabled for exactly this statement; the identity trigger is BEFORE INSERT only and is untouched.
ALTER TABLE public.interview_records DISABLE TRIGGER interview_records_immutable;
UPDATE public.interview_records
   SET market_state = CASE WHEN journey_key IS NOT NULL THEN 'placed'
                           WHEN speaker_role = 'client_stakeholder' THEN 'per_item'
                           ELSE 'unplaced' END
 WHERE market_state IS NULL;
ALTER TABLE public.interview_records ENABLE TRIGGER interview_records_immutable;
ALTER TABLE public.interview_records ALTER COLUMN market_state SET NOT NULL;

ALTER TABLE public.interview_records
  ADD CONSTRAINT interview_records_market_state_check CHECK (market_state IN ('placed', 'unplaced', 'per_item')),
  ADD CONSTRAINT interview_records_review_state_check CHECK (review_state IN ('unreviewed', 'reviewed')),
  ADD CONSTRAINT interview_records_market_state_key CHECK ((market_state = 'placed') = (journey_key IS NOT NULL)),
  ADD CONSTRAINT interview_records_transcript_identity CHECK (
    input_file_id IS NULL
    OR (file_sha256 ~ '^[0-9a-f]{64}$' AND file_bytes > 0 AND text_sha256 ~ '^[0-9a-f]{64}$'
        AND length(btrim(extraction_method)) > 0 AND length(btrim(extraction_version)) > 0)
  ),
  ADD CONSTRAINT interview_records_market_basis_array CHECK (jsonb_typeof(market_basis) = 'array');

CREATE UNIQUE INDEX IF NOT EXISTS interview_records_one_per_file ON public.interview_records (input_file_id) WHERE input_file_id IS NOT NULL;

-- Birth: content identity (unchanged) + market_state derived when the writer did not supply it.
CREATE OR REPLACE FUNCTION public.interview_records_identity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  normalized text;
BEGIN
  normalized := btrim(regexp_replace(lower(coalesce(NEW.verbatim, '')), '\s+', ' ', 'g'));
  NEW.content_identity := encode(
    extensions.digest('interview-records-2026-09:' || NEW.company_id::text || ':' || NEW.speaker_role || ':' || normalized, 'sha256'),
    'hex');
  IF NEW.market_state IS NULL THEN
    NEW.market_state := CASE WHEN NEW.journey_key IS NOT NULL THEN 'placed'
                             WHEN NEW.speaker_role = 'client_stakeholder' THEN 'per_item'
                             ELSE 'unplaced' END;
  END IF;
  RETURN NEW;
END;
$$;

-- R2: only journey_key, market_state, market_basis, review_state and the retraction triple may change, and
-- only on a non-retracted row. market_basis is append-only (R4): every existing entry stays in place.
CREATE OR REPLACE FUNCTION public.interview_records_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  i int;
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
     OR NEW.speaker_role IS DISTINCT FROM OLD.speaker_role
     OR NEW.person_name IS DISTINCT FROM OLD.person_name
     OR NEW.person_role IS DISTINCT FROM OLD.person_role
     OR NEW.interviewed_at IS DISTINCT FROM OLD.interviewed_at
     OR NEW.interviewer IS DISTINCT FROM OLD.interviewer
     OR NEW.consent_basis IS DISTINCT FROM OLD.consent_basis
     OR NEW.verbatim IS DISTINCT FROM OLD.verbatim
     OR NEW.content_identity IS DISTINCT FROM OLD.content_identity
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.input_file_id IS DISTINCT FROM OLD.input_file_id
     OR NEW.file_sha256 IS DISTINCT FROM OLD.file_sha256
     OR NEW.file_bytes IS DISTINCT FROM OLD.file_bytes
     OR NEW.text_sha256 IS DISTINCT FROM OLD.text_sha256
     OR NEW.extraction_method IS DISTINCT FROM OLD.extraction_method
     OR NEW.extraction_version IS DISTINCT FROM OLD.extraction_version
  THEN
    RAISE EXCEPTION 'interview record % is immutable after birth — only journey_key / market_state / market_basis / review_state and retracted_at / retracted_reason / retracted_by may change', OLD.id;
  END IF;
  IF jsonb_array_length(NEW.market_basis) < jsonb_array_length(OLD.market_basis) THEN
    RAISE EXCEPTION 'interview record % market_basis is append-only history — an entry was removed', OLD.id;
  END IF;
  FOR i IN 0 .. jsonb_array_length(OLD.market_basis) - 1 LOOP
    IF NEW.market_basis -> i IS DISTINCT FROM OLD.market_basis -> i THEN
      RAISE EXCEPTION 'interview record % market_basis is append-only history — entry % was changed', OLD.id, i;
    END IF;
  END LOOP;
  IF NEW.retracted_at IS NOT NULL AND (NEW.retracted_reason IS NULL OR length(btrim(NEW.retracted_reason)) = 0) THEN
    RAISE EXCEPTION 'interview record % cannot be retracted without retracted_reason', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON COLUMN public.interview_records.market_state IS 'placed (journey_key set) | unplaced (a customer transcript, no market yet) | per_item (a stakeholder transcript: markets are inferred per item after parsing). CHECK interview_records_market_state_key.';
COMMENT ON COLUMN public.interview_records.market_basis IS 'Append-only history (R4): [{kind:"original", result:"none"|…, at}, {kind:"operator_override", journey_key, by, at}, …]. Never overwritten — enforced by interview_records_immutable.';
COMMIT;
