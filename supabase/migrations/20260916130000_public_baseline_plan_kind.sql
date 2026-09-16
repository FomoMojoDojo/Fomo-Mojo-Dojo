-- Gate B (operator direction 2026-09-16) — a public-baseline run records WHICH plan produced it:
--   domain    — today's plan: queries embed the company's domain; own-site crawl + site-mint run.
--   name_only — a company with no public site: queries by name only, no domain terms, no own-site
--               crawl, no site-mint; the fallback crawl over result hosts still runs.
BEGIN;
ALTER TABLE public.public_baseline_runs
  ADD COLUMN plan_kind text NOT NULL DEFAULT 'domain'
  CHECK (plan_kind IN ('domain', 'name_only'));
COMMIT;
