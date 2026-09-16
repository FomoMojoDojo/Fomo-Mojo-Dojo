-- No-public-site onramp (operator direction 2026-09-16). A company can declare that it has NO public
-- site: the fact is stored, and every site hunt (public-baseline crawl/search, research-company birth)
-- refuses by name rather than by a missing field. A company cannot both have a website and declare none.
BEGIN;
ALTER TABLE public.companies
  ADD COLUMN no_public_site boolean NOT NULL DEFAULT false;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_no_public_site_excludes_website
  CHECK (NOT (no_public_site AND coalesce(website, '') <> ''));
COMMIT;

-- The onramp records a refused birth as a ledger row, never silently: long_runner_runs gains a
-- 'skipped' terminal (run_kind 'birth', error_text = the reason).
BEGIN;
ALTER TABLE public.long_runner_runs DROP CONSTRAINT long_runner_runs_status_check;
ALTER TABLE public.long_runner_runs ADD CONSTRAINT long_runner_runs_status_check
  CHECK (status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'skipped'::text]));
COMMIT;
