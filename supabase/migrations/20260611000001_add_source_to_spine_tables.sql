-- refresh-positioning and refresh-cascade insert `source: "system"` and filter
-- manual edits via `source LIKE 'manual_%'`, but the `source` column was never
-- added to positioning_canvases / strategy_cascades. Without it, both leaves
-- fail with PGRST204 ("Could not find the 'source' column ... in the schema
-- cache") and never write — surfaced when a cold-start research-company run
-- first reached the leaves. Add the column the leaf code already assumes.

ALTER TABLE public.positioning_canvases
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'system';

ALTER TABLE public.strategy_cascades
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'system';

-- research-company's §7 clear deletes routes via `.not("source","like","manual_%")`
-- and route manual-preservation depends on the same column. routes likewise never
-- had a `source` column, so the routes clear silently failed and re-runs accumulated
-- duplicate routes. Add it here too.
ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'system';

-- Ask PostgREST to refresh its schema cache so the new column is visible.
NOTIFY pgrst, 'reload schema';
