-- integrity_runs: admit the status 'rejected' (2026-09-09).
--
-- WHY: generate-public-read now writes one integrity row per public-read kind
-- (component first_read_public_read_<kind>). A guard reject is NOT a crash and not an
-- empty input — it is a judged/guarded refusal to admit a generated read. The existing
-- CHECK allowed only completed / failed / skipped_empty_input / planned, which forced a
-- guard reject to masquerade as 'failed'.
--
-- The function is written to survive this migration being ABSENT: it attempts 'rejected'
-- and falls back to 'failed' (guard preserved in `error`) if the CHECK refuses. Applying
-- this migration is what makes the reject rows read honestly.
--
-- Reversible: drop the constraint and re-add it without 'rejected'. No data is rewritten.

ALTER TABLE public.integrity_runs DROP CONSTRAINT IF EXISTS integrity_runs_status_check;

ALTER TABLE public.integrity_runs
  ADD CONSTRAINT integrity_runs_status_check
  CHECK (status = ANY (ARRAY['completed'::text, 'failed'::text, 'skipped_empty_input'::text, 'planned'::text, 'rejected'::text]));
