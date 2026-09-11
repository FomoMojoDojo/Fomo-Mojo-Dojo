-- Gate 6e — a verdict judged without its inputs is not a ruling.
--
-- Gotham (2026-09-11): the fill fired discovery before the public-reads stage had produced the
-- offering read, so the v2 judge ran with NO solution line and banked four verdicts by content
-- identity — which the cache and the decided predicate would then have served forever as rulings.
-- inputs_complete records whether the judge saw everything the criterion requires (for v2: the
-- offering read). false rows are kept as history, never served from cache, never count as decided,
-- and are replaced in place by the next complete judge of the same identity.
alter table public.market_discovery_verdicts
  add column inputs_complete boolean not null default true;
