-- MPD-1g — separate capacity from curation: a discovered market that passes
-- every quality judge but exceeds the active-portfolio capacity is RECORDED
-- with an explicit disposition, never silently dropped (absence must be
-- visible and conversational — the standing principle). 'deferred' =
-- discovered-and-judged-real, not in the active client-facing set until the
-- choose gate promotes it. Distinct from 'dormant' (an active-set member
-- parked later) — the two must not be conflated.

alter table public.market_lens
  drop constraint market_lens_portfolio_state_check;

alter table public.market_lens
  add constraint market_lens_portfolio_state_check
  check (portfolio_state in ('active', 'dormant', 'deferred'));
