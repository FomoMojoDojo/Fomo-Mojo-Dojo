-- V2-3b — retire the parseable-shape machinery. The declared path is now render-side
-- verbatim (no row, no model), so headline+points are gone. supporting_points and its
-- cap check are dropped. status stays: the site-inference fallback keeps its
-- signed/pending lifecycle.
alter table public.first_read_stated_problem
  drop constraint if exists fr_stated_problem_points_cap;
alter table public.first_read_stated_problem
  drop column if exists supporting_points;
