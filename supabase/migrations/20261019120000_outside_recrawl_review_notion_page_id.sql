-- R11 (operator ruling 2026-10-18): the b3 review path.
--   1. --from-snapshots writes review rows with disposition 'b3_from_snapshot' and fetch_path 'snapshot'
--      (no fetch happened; the basis is the stored snapshot) — both CHECK lists gain the value.
--   2. the decide script records WHICH Notion page carried the operator's verdict — notion_page_id, nullable.
-- Additive; the decision columns and the upsert's preserved set are unchanged.
-- NOT APPLIED on 2026-10-18 — written beside the scripts; applying it is a database write for the next brief.
-- Until it is applied, --from-snapshots --write is refused by the database (the guard's write leg says so) and
-- --live decide refuses to run.
alter table public.outside_recrawl_review drop constraint if exists outside_recrawl_review_disposition_check;
alter table public.outside_recrawl_review add constraint outside_recrawl_review_disposition_check
  check (disposition in ('new','changed','unchanged','still_walled','gone','recovered','b3_from_snapshot'));
alter table public.outside_recrawl_review drop constraint if exists outside_recrawl_review_fetch_path_check;
alter table public.outside_recrawl_review add constraint outside_recrawl_review_fetch_path_check
  check (fetch_path in ('plain','headless','snapshot'));
alter table public.outside_recrawl_review add column if not exists notion_page_id text;
comment on column public.outside_recrawl_review.notion_page_id is 'R11: the Notion review page whose Verdict set operator_decision (null when decided outside Notion).';
