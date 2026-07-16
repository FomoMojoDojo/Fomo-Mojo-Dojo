-- MPD-1f-1a — declared-market schema (design signed 2026-07-15,
-- MPD1F_DECLARED_MARKETS_DESIGN.md).
--
-- (1) declared_verbatim — the client's EXACT words for a declared market
--     (verbatim-or-nothing: this is the authoritative statement; the shaped
--     job_executor/jtbd fields are derived display and may never assert
--     anything the verbatim doesn't). declared_source_ref — the declared
--     artifact it came from ('positioning_canvases:<id>' / 'strategy_cascades:<id>').
--     NULL on both = generator-authored rows.
--
-- (2) provenance_type birth-immutability guard, mirroring
--     claims_provenance_immutable (INT-2 conflation guard): provenance ⊥ proof
--     only holds if provenance can never silently flip after birth. A
--     deliberate operator backfill must SET LOCAL app.provenance_backfill='on'
--     inside its transaction; nothing else may change it.

alter table public.odi_market_definitions
  add column declared_verbatim text,
  add column declared_source_ref text;

create or replace function public.odi_market_provenance_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.provenance_type is distinct from old.provenance_type then
    if current_setting('app.provenance_backfill', true) = 'on' then
      return new;
    end if;
    raise exception 'odi_market_definitions.provenance_type is immutable after birth (MPD-1f conflation guard) — def % cannot change % -> %',
      old.id, old.provenance_type, new.provenance_type;
  end if;
  return new;
end;
$$;

create trigger odi_market_provenance_immutable_guard
  before update on public.odi_market_definitions
  for each row
  execute function public.odi_market_provenance_immutable();
