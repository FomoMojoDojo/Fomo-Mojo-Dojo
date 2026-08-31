-- Stage B — the 5-rung public Playing-to-Win cascade routes its ungrounded rungs (gap) and its
-- grounded-but-incoherent rungs (tension) to the First Read Questions beat as first_read_open_questions
-- rows tagged source_kind='cascade_gap'. Relax the source_kind CHECK to admit that value.
--
-- There are TWO redundant source_kind CHECK constraints on the table (a prior duplicate); both must be
-- widened or an insert still fails the stricter one. Idempotent: drop-if-exists then re-add.

ALTER TABLE public.first_read_open_questions
  DROP CONSTRAINT IF EXISTS first_read_open_questions_source_kind_check;
ALTER TABLE public.first_read_open_questions
  DROP CONSTRAINT IF EXISTS fr_open_questions_source_kind_check;

ALTER TABLE public.first_read_open_questions
  ADD CONSTRAINT first_read_open_questions_source_kind_check
  CHECK (source_kind = ANY (ARRAY['finding'::text, 'silent_delta'::text, 'status_conflict'::text, 'cascade_gap'::text]));
