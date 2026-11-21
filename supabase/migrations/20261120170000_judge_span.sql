-- ── SP-494: the judge's verdict shows its work ───────────────────────────────────────────────────
--
-- Measured 2026-11-20: asked "do the quote's own words state the pattern?", the judge sometimes
-- answered with a DESCRIPTION OF THE QUOTE and supports=true, without testing it against the pattern.
-- Three of N14's exit-billing quotes were kept under "Customers praise the fibre rollout and the price
-- in rural Idaho", reasoned "quote states unclear billing policy". Four swap errors were the same
-- shape — "multi-hour" matched "HOURS on the phone".
--
-- So the verdict now carries two things, and BOTH ARE STORED, because a verdict nobody can inspect is
-- a verdict nobody can correct:
--
--   states_span   the VERBATIM span of the quote the judge says states the pattern, verified in
--                 TypeScript with the E4 predicate (excerptBlanking.verbatimOn). SP-494 is explicit
--                 that this proves the span is REAL and not that it states the pattern — its value is
--                 traceability: a person can see what the judge was looking at.
--   not_stated    every part of the pattern the judge says the quote does NOT state. `bears` is true
--                 only when this list is empty AND the span verified, and `supports` is computed by us
--                 rather than taken from the model.
--   keyword_flag  RETIRED by SP-504 before it was ever useful: it fired on about two thirds of calls
--                 over two full runs and informed nothing. The column is kept, unused and unwritten,
--                 and SP-506 drops it in the NEXT migration that touches this table.
--
-- Nullable throughout: a rubric-v2 row predates the contract and carries none of them, which is
-- honest — NULL means "this verdict was given under the older question".

alter table public.need_pattern_quotes
  add column if not exists states_span  text,
  add column if not exists not_stated   jsonb,
  add column if not exists keyword_flag boolean;

comment on column public.need_pattern_quotes.states_span is
  'SP-494: the verbatim span of the quote the judge cited; verified as a substring before bears=true.';
comment on column public.need_pattern_quotes.not_stated is
  'SP-494: the parts of the pattern the judge says this quote does not state. Empty array ⇒ it states all of them.';
comment on column public.need_pattern_quotes.keyword_flag is
  'SP-494: true when the pattern name and the quote share no content word. Reported, never a veto.';
