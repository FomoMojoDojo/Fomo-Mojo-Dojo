-- Add review metadata columns to companies table.
-- Non-destructive: adds missing columns only.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS human_decision text,
  ADD COLUMN IF NOT EXISTS review_status text,
  ADD COLUMN IF NOT EXISTS review_source text;

COMMENT ON COLUMN public.companies.human_decision IS
  'Optional human adjudication outcome (e.g. approved, rejected, needs_revision).';

COMMENT ON COLUMN public.companies.review_status IS
  'Latest review lifecycle state for the company-level research output.';

COMMENT ON COLUMN public.companies.review_source IS
  'Where the review decision came from (e.g. system, human, mixed).';
