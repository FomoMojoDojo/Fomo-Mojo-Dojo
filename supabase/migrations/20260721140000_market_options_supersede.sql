-- MO-2f (3) — SUPERSESSION for market options whose verdict was a misread.
--
-- MO-2e found 2 live Act A cards passing executor_group on reasons that are
-- factually untrue of their own text (clause-(f) misapplication):
--   329bf478  "People who support youth initiatives"        judged "verb-free"
--   57de177f  "People working for nonprofit organizations"  judged "verb-free"
--
-- These are NOT duplicates. duplicate_of would be a lie: a duplicate says "the
-- same market, said twice" and here the WHO genuinely differs — the replacement
-- names a role the misread never named. Reusing that column to mean two
-- different things would corrupt the one signal it currently carries.
--
-- So: a third status, with its own link.
--   'duplicate'  = same market, said twice        -> duplicate_of
--   'superseded' = replaced by a better-formed
--                  reading of the SAME market     -> superseded_by_id
--
-- AUDIT LAW, unchanged: the superseded row keeps its verdict EXACTLY as judged.
-- Nothing here rewrites criterion_* or rejected_criterion. The misread stays in
-- the record permanently, annotated by the supersession rather than erased —
-- that record is the evidence for any future criteria conversation.
--
-- ORDERING LAW (operator ruling): a row supersedes only AFTER its replacement
-- exists. The FK enforces that structurally — superseded_by_id must point at a
-- real row, so there is no interval in which a card is retired into nothing.

ALTER TABLE public.market_options
  ADD COLUMN superseded_by_id uuid REFERENCES public.market_options(id) ON DELETE SET NULL;

ALTER TABLE public.market_options DROP CONSTRAINT market_options_status_check;
ALTER TABLE public.market_options
  ADD CONSTRAINT market_options_status_check
  CHECK (status = ANY (ARRAY['candidate'::text, 'rejected'::text, 'duplicate'::text, 'superseded'::text]));

-- A superseded row is a PASSING option withdrawn from display, exactly like a
-- duplicate: all three criteria TRUE, no rejected_criterion. Only 'rejected' may
-- name a failing criterion.
ALTER TABLE public.market_options DROP CONSTRAINT market_options_verdict_shape;
ALTER TABLE public.market_options
  ADD CONSTRAINT market_options_verdict_shape
  CHECK (
    ((status = ANY (ARRAY['candidate'::text, 'duplicate'::text, 'superseded'::text]))
      AND (criterion_executor_group IS TRUE)
      AND (criterion_odi_form IS TRUE)
      AND (criterion_solution_agnostic IS TRUE)
      AND (rejected_criterion IS NULL))
    OR ((status = 'rejected'::text) AND (rejected_criterion IS NOT NULL))
  );

-- superseded_by_id is set if and only if the row is superseded: no dangling
-- links, and no silently-retired card.
ALTER TABLE public.market_options
  ADD CONSTRAINT market_options_supersede_shape
  CHECK (
    ((status = 'superseded'::text) AND (superseded_by_id IS NOT NULL))
    OR ((status <> 'superseded'::text) AND (superseded_by_id IS NULL))
  );

-- A row cannot supersede itself.
ALTER TABLE public.market_options
  ADD CONSTRAINT market_options_supersede_not_self
  CHECK (superseded_by_id IS NULL OR superseded_by_id <> id);
