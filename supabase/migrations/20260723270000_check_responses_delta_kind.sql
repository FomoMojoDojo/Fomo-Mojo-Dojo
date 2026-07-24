-- V2-7 — Act 4 say-vs-see puts the Check's four-button verdict control on claim_delta
-- items. Those verdicts persist to first_read_responses like any other check item, so the
-- item_kind CHECK must admit 'delta' (identity = the delta's content_identity, a distinct
-- construction from a finding's contentIdentity(text) — no natural collision). The feed
-- (feed-first-read-corrections) processes them unchanged, exactly like finding verdicts.
--
-- Prior CHECK: item_kind IN ('finding','market','differentiator').
alter table public.first_read_responses
  drop constraint if exists first_read_responses_item_kind_check;
alter table public.first_read_responses
  add constraint first_read_responses_item_kind_check
  check (item_kind = any (array['finding','market','differentiator','delta']));
