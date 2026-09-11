-- Gate 8b — a market definition can be RETRACTED without being deleted.
--
-- A def is born from a ruling. When the ruling turns out to have been made blind (Gate 8a), the def
-- must stop being treated as real by every surface that enumerates a company's markets — the client's
-- Who-you-serve groups, the discovery dedup universe and its capacity count, the fill's
-- already-discovered predicate, the options seed, frontier, council context, alignment claims, the
-- admin client-shaped lists, and marketCandidateDecided clause (1) — while the row itself, its lens,
-- its outcome row and its verdicts all stand as history (operator law: never delete).
--
-- WHY THE DEF AND NOT THE LENS. market_lens.portfolio_state (active / dormant / deferred) are
-- dispositions of a REAL market, and Who-you-serve does not read lens state to decide visibility —
-- it renders every public-register def and uses `active` only to sort. The state has to sit where
-- the enumerators already look. Nine enumerators, one filter each.
--
-- retracted (stored, generated) exists for ONE reader: the decided predicate's ExistsProbe is
-- equality-only by design (the rule's table names and match columns are its substance and are
-- covered by proofs), and "retracted_at IS NULL" is not an equality. `retracted = false` is. Every
-- SQL enumerator may use either spelling; they are the same fact.
--
-- The unique (company_id, journey_key) becomes PARTIAL over unretracted rows, so the complete
-- re-judge of a retracted group can take the clean key instead of a `-2` twin (operator ruling).
-- The immutability guards cover provenance_type and market_register only; the freeze trigger still
-- refuses any UPDATE on a frozen company's row. Operator-only, by data act; the worker never sets it.
alter table public.odi_market_definitions
  add column retracted_at timestamptz null,
  add column retracted_reason text null,
  add column retracted_from_outcome_id uuid null references public.market_candidate_outcomes(id) on delete set null,
  add column retracted boolean generated always as (retracted_at is not null) stored;

alter table public.odi_market_definitions
  drop constraint odi_market_definitions_company_journey_key;
create unique index odi_market_definitions_company_journey_key_live
  on public.odi_market_definitions (company_id, journey_key)
  where retracted_at is null;
create index odi_market_definitions_retracted_idx
  on public.odi_market_definitions (company_id, retracted);
