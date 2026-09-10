-- Gate 5b — criterion_version: a judge criterion is a methodology; its verdicts are keyed by version.
--
-- WHY. market_discovery_verdicts is frozen by content identity — a verdict is never re-rolled. That is
-- the right law for one criterion, and it made a better criterion impossible: pair_identity hashes
-- content only, so a v2 judge would find every v1 verdict banked and never run. The Gate 3d census
-- showed the v1 solution-agnostic judge rejecting 11 of 20 candidates on DOMAIN words ("using AI",
-- "quantum error correction") that were the customers' field, not the company's product — and no
-- amount of prompt work could reach those rows. Council ruling (Living Memory 09-10): a criterion
-- change is a methodology change; verdicts are keyed by criterion version; old verdicts stand as
-- history under their version; surfaces show the current version; nothing is deleted.
--
-- MECHANICS. criterion_version int not null default 1 on both tables — the default IS the backfill:
-- every existing row reads 1 the instant the column lands, no data act. The verdict unique key widens
-- to (company_id, pair_identity, criterion_version), so a v1 and a v2 ruling on the same content sit
-- side by side. pair_identity itself is NOT re-hashed: v1 keys stay byte-identical (so existing rows
-- still resolve), and v≥2 keys carry the version inside the hash (solutionAgnosticKey) — a v2 lookup
-- can never find a v1 row by accident, and the never-re-roll law holds WITHIN each version.
-- market_candidate_outcomes keeps (run_id, candidate_index) unique and gains the version column so a
-- run's v1 and v2 rulings are distinguishable; the outcomes writer stamps CRITERION_VERSION.

alter table public.market_discovery_verdicts
  add column criterion_version integer not null default 1;
alter table public.market_candidate_outcomes
  add column criterion_version integer not null default 1;

alter table public.market_discovery_verdicts
  drop constraint market_discovery_verdicts_company_id_pair_identity_key;
alter table public.market_discovery_verdicts
  add constraint market_discovery_verdicts_company_pair_version_key
  unique (company_id, pair_identity, criterion_version);

create index market_candidate_outcomes_version_idx
  on public.market_candidate_outcomes (company_id, criterion_version);
