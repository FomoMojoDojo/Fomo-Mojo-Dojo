-- First-read marks, commit 2 of 4 (2026-09-22): ONE live mark of each kind per anchor. A second create of the same
-- kind on the same (company, anchor_kind, anchor_key) while the first is live is refused by this partial unique
-- index (the UI reopens the existing mark instead); a withdrawn mark frees the slot, its record stays.
-- Before: no uniqueness on the anchor. After: the index below. No column or function change.
BEGIN;
CREATE UNIQUE INDEX first_read_marks_one_live_per_anchor
  ON public.first_read_marks (company_id, anchor_kind, anchor_key, kind)
  WHERE withdrawn_at IS NULL;
COMMENT ON INDEX public.first_read_marks_one_live_per_anchor IS 'FM commit 2 (2026-09-22): one live mark of each kind per anchor; withdrawn marks do not count.';
COMMIT;
