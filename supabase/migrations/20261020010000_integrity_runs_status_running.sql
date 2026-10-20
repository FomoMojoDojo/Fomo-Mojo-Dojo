-- R36 (b) (operator ruling 2026-10-20): a run's integrity row is opened as `running` before its first write and
-- finished at the end. The status check gains 'running'. Reversible: re-create the constraint without it once no
-- row carries it.
alter table public.integrity_runs drop constraint integrity_runs_status_check;
alter table public.integrity_runs add constraint integrity_runs_status_check
  check (status = any (array['completed'::text, 'failed'::text, 'skipped_empty_input'::text, 'planned'::text, 'rejected'::text, 'running'::text]));
