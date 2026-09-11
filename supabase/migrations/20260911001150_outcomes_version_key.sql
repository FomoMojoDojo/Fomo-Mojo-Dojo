-- Gate 5c — outcome rulings are keyed by criterion version.
--
-- Gate 5b gave market_candidate_outcomes a criterion_version column but left the unique key at
-- (run_id, candidate_index). The first v2 re-fire (Riverlane) proved what that does: the writer's
-- upsert on that key REPLACED the v1 rulings for #1, #3 and #4 with their v2 rulings, and the
-- history the column was added to keep — "v1 rows stand as history" — was destroyed by the first
-- write. A ruling under one criterion must never be overwritten by a ruling under another; the
-- version belongs in the key, exactly as it does on market_discovery_verdicts.
alter table public.market_candidate_outcomes
  drop constraint market_candidate_outcomes_run_id_candidate_index_key;
alter table public.market_candidate_outcomes
  add constraint market_candidate_outcomes_run_index_version_key
  unique (run_id, candidate_index, criterion_version);
