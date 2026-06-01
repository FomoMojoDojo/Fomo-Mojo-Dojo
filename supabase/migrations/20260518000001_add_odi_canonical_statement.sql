-- A54: Add odi_canonical_statement to odi_needs.
-- Stores the strict ODI canonical form alongside the human-readable desired_outcome.
-- NULL for rows generated before this migration; populated by backfill + future pipeline runs.
ALTER TABLE public.odi_needs
  ADD COLUMN odi_canonical_statement TEXT NULL;
