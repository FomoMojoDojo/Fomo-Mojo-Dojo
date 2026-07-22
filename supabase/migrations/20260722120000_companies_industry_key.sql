-- FD-3a — companies.industry_key: the sole auto-select source for the
-- front-door standard job-map act (FrontDoorMapAct, FD-3).
--
-- Nullable, NO DEFAULT, and DELIBERATELY no FK/CHECK against the published set.
-- The published set (industry_reference_job_maps where is_published=true) grows
-- over time, so validity is a READ-time property, not a constraint: FD-3 renders
-- a map ONLY on an EXACT match against a published industry_key, and anything
-- else (a stale key, a not-yet-published key, NULL) falls back — never fuzzy,
-- never a wrong map. A CHECK/FK here would either freeze the taxonomy or block
-- an operator from setting a key ahead of publishing; both are wrong for this
-- field. The column is operator-set only; no code writes it.
--
-- NOT related to companies.manual_industry_vocab, which holds research EXCLUSION
-- terms — a different field with a different job. Named apart on purpose.

ALTER TABLE public.companies ADD COLUMN industry_key text;

COMMENT ON COLUMN public.companies.industry_key IS
  'Published industry_reference_job_maps key for the front-door standard map. Operator-set. Exact-match-or-fallback at read; never fuzzy-matched. NOT related to manual_industry_vocab (exclusion terms).';
