-- GATE (2026-08-22): the model router stamps every judge/generator output with the provider + model
-- that produced it. Additive columns on the three stamped tables; backfill EVERY pre-router row to
-- the local models that made them (recurrence + delta + question verdicts were all local llama3:70b
-- judge work). The frozen CB1 (58b2b15b) has ZERO rows in all three tables (verified) and is excluded
-- from the backfill regardless — no CB1 write.
ALTER TABLE public.signal_recurrence_verdicts
  ADD COLUMN IF NOT EXISTS model_provider text,
  ADD COLUMN IF NOT EXISTS model_name text;
ALTER TABLE public.claim_deltas
  ADD COLUMN IF NOT EXISTS model_provider text,
  ADD COLUMN IF NOT EXISTS model_name text;
ALTER TABLE public.first_read_open_questions
  ADD COLUMN IF NOT EXISTS model_provider text,
  ADD COLUMN IF NOT EXISTS model_name text;
ALTER TABLE public.finding_cluster_verdicts
  ADD COLUMN IF NOT EXISTS model_provider text,
  ADD COLUMN IF NOT EXISTS model_name text;

-- Backfill: all pre-router verdicts came from the local llama3:70b judge. Never touch frozen CB1.
UPDATE public.signal_recurrence_verdicts
  SET model_provider = 'local_ollama', model_name = 'llama3:70b'
  WHERE model_provider IS NULL AND company_id <> '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc';
UPDATE public.claim_deltas
  SET model_provider = 'local_ollama', model_name = 'llama3:70b'
  WHERE model_provider IS NULL AND company_id <> '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc';
UPDATE public.first_read_open_questions
  SET model_provider = 'local_ollama', model_name = 'llama3:70b'
  WHERE model_provider IS NULL AND company_id <> '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc';
UPDATE public.finding_cluster_verdicts
  SET model_provider = 'local_ollama', model_name = 'llama3:70b'
  WHERE model_provider IS NULL AND company_id <> '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc';
