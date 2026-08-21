-- GATE S3 (2026-08-20): first_read_open_questions admits a 'status_conflict' kind — a deterministic
-- open question raised when an authoritative source reports a location closed while others still
-- list it open. It carries both source sets (conflict_sources jsonb) and the location string
-- (conflict_location) that the render uses to mark disputed rows. Additive, idempotent.

-- Two source_kind checks exist historically (first_read_open_questions_* and fr_open_questions_*);
-- both must admit the new kind.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='first_read_open_questions_source_kind_check') THEN
    ALTER TABLE public.first_read_open_questions DROP CONSTRAINT first_read_open_questions_source_kind_check;
  END IF;
  ALTER TABLE public.first_read_open_questions ADD CONSTRAINT first_read_open_questions_source_kind_check
    CHECK (source_kind IN ('finding', 'silent_delta', 'status_conflict'));
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fr_open_questions_source_kind_check') THEN
    ALTER TABLE public.first_read_open_questions DROP CONSTRAINT fr_open_questions_source_kind_check;
    ALTER TABLE public.first_read_open_questions ADD CONSTRAINT fr_open_questions_source_kind_check
      CHECK (source_kind IN ('finding', 'silent_delta', 'status_conflict'));
  END IF;
END $$;

ALTER TABLE public.first_read_open_questions ADD COLUMN IF NOT EXISTS conflict_sources jsonb;
ALTER TABLE public.first_read_open_questions ADD COLUMN IF NOT EXISTS conflict_location text;
