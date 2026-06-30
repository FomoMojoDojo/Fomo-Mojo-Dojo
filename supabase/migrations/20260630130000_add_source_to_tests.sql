-- generate-leg-tests (Gate 3) writes `source: "generate-leg-tests:<date>"` and
-- preserves operator edits via `source LIKE 'manual_%'` — the exact origin-merge
-- predicate Gate 2 uses for legs (routeLegSynthesis.ts). But the `tests` table
-- never had a `source` column, so the preserve predicate could not discriminate
-- operator-edited rows from generated rows and a re-roll would overwrite edits.
-- Add the column the generator assumes, mirroring add_source_to_spine_tables.
-- tests is operationally empty and CB1/CB2 hold zero test rows, so the backfilled
-- default writes no reference-company data.

ALTER TABLE public.tests
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'system';

-- Ask PostgREST to refresh its schema cache so the new column is visible.
NOTIFY pgrst, 'reload schema';
