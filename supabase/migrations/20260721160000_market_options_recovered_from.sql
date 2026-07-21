-- MO-2g — provenance for a RECOVERY chain.
--
-- A recovered option is not a revision. revision_of carries the shape constraint
-- (attempt=1 AND revision_of IS NULL) OR (attempt IN (2,3) AND revision_of IS
-- NOT NULL), because a revision is a further attempt at the SAME proposal and
-- inherits its attempt budget. A recovery is the opposite: the row it replaces
-- was never rejected — it PASSED, wrongly — and the recovered statement enters as
-- a genuinely fresh proposal that must be judged from attempt 1 with a full
-- budget of its own. Forcing it onto revision_of would either breach that shape
-- or silently spend attempts the recovery is entitled to.
--
-- So the link gets its own column, and the two stay semantically distinct:
--   revision_of     = another attempt at the same proposal   (attempts 2, 3)
--   recovered_from  = a fresh proposal replacing a MISREAD   (always attempt 1)
--   superseded_by_id = the display-side retirement link       (MO-2f)
--
-- recovered_from is deliberately NOT constrained to attempt=1 rows only in
-- shape: the constraint below fixes the direction that matters (a recovery is
-- always an attempt-1 origin) without over-specifying what may be recovered.
--
-- No verdict is rewritten by any of this. The misread row keeps its judged
-- verdict exactly; MO-2f's supersession then annotates it, and this column
-- records which fresh chain did the replacing.

ALTER TABLE public.market_options
  ADD COLUMN recovered_from uuid REFERENCES public.market_options(id) ON DELETE SET NULL;

-- A recovery is always a fresh attempt-1 origin, never a revision of something
-- else: the two provenance links are mutually exclusive.
ALTER TABLE public.market_options
  ADD CONSTRAINT market_options_recovery_shape
  CHECK (
    recovered_from IS NULL
    OR (attempt = 1 AND revision_of IS NULL)
  );

-- A row cannot recover itself.
ALTER TABLE public.market_options
  ADD CONSTRAINT market_options_recovery_not_self
  CHECK (recovered_from IS NULL OR recovered_from <> id);
