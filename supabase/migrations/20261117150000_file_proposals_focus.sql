-- F-3 (2026-11-17, Proposal A decisions 3/4): what focus an analysis RAN UNDER, stamped once when its
-- framework pass first starts (supabase/functions/_shared/focusMarkets.ts focusForRun). NULL = the row
-- predates F-3; [] = ran unfocused (no focus signed); otherwise the ordered snapshot
-- [{rank, market_definition_id, journey_key, job_executor, jtbd, signed_at}]. A later re-sign never
-- re-interprets an old run. F-4's items_other_party counts the findings about another party that were
-- not queued (decision 5).
alter table public.file_proposals add column if not exists focus_markets jsonb;
alter table public.file_proposals add column if not exists items_other_party integer;
alter table public.file_proposals drop constraint if exists file_proposals_focus_markets_is_array;
alter table public.file_proposals add constraint file_proposals_focus_markets_is_array
  check (focus_markets is null or jsonb_typeof(focus_markets) = 'array');
alter table public.file_proposals drop constraint if exists file_proposals_items_other_party_nonneg;
alter table public.file_proposals add constraint file_proposals_items_other_party_nonneg
  check (items_other_party is null or items_other_party >= 0);
