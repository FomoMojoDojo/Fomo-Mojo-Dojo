-- ── SP-469 / SP-470 / SP-475: the pattern layer's revision ───────────────────────────────────────
--
-- THREE COLUMNS AND ONE INDEX. Everything else the revision needs is DERIVED, as before.
--
-- `polarity` (SP-470): a pattern carries ONE polarity, so a positive pattern and a negative one are
-- separate rows rather than one row with a mixed bag of quotes under it. The four values are
-- need_evidence's own three plus nothing: a pattern whose quotes disagree is 'mixed', which is a
-- statement, not a fallback.
--
-- `run_ceiling_hit` + `run_proposed_count` (SP-469): the ceiling becomes 12 and **hitting it is
-- counted and reported**. Neither fact is derivable from the stored rows — 12 patterns and "the
-- generator wanted 15 and was cut to 12" look identical afterwards — so they are the only run facts
-- stored. They repeat across the patterns of one run by design: a separate runs table would be a
-- second place a run is named, and `run_ref` already names it.
--
-- Deliberately NOT stored, because they ARE derivable and SP-463 forbids a stored count:
--   coverage          counted quotes vs those under a surviving pattern — both from need_evidence
--                     and need_pattern_quotes
--   unassigned quotes the counted quotes with no surviving need_pattern_quotes row
--   supporting / site counts as before
--
-- `need_patterns_one_representative` (SP-475c): within one need, a quote may be the representative of
-- at most one live pattern. Unrepresentable rather than merely discouraged.

alter table public.need_patterns
  add column if not exists polarity            text,
  add column if not exists run_ceiling_hit     boolean not null default false,
  add column if not exists run_proposed_count  integer,
  -- D1: a superseded row says WHY. The checkpoint's own patterns were superseded under SP-473
  -- ("machinery accepted, content not accepted"), and a supersede with no reason is a deletion with
  -- extra steps.
  add column if not exists superseded_reason   text;

alter table public.need_patterns drop constraint if exists need_patterns_polarity_check;
alter table public.need_patterns add constraint need_patterns_polarity_check
  check (polarity is null or polarity = any (array['working'::text, 'not working'::text, 'mixed'::text]));
