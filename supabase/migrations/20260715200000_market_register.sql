-- OOD-1 — market_register: register becomes an explicit birth-stamped fact
-- (design signed 2026-07-15, OUTSIDE_ONLY_DISCOVERY_DESIGN.md).
--
-- LAW: REGISTER (public vs internal) is a property of a market's evidence
-- CORPUS, not its authorship provenance. Act A (Outside, client-facing)
-- filters on the STORED register — never a re-traced corpus (the
-- provenance-label trap must not recur).
--
--   public_inferred    — generated under the outside-only discovery mode
--                        (pure public-band corpus, OOD-2+).
--   publicly_declared  — company-stated on its own public channels (future).
--   internal_inferred  — generated with internal/mixed corpus (org-band /
--                        upload-fed steps — every generated def to date).
--   internal_declared  — declared via uploaded/internal artifacts (dmk-*).
--
-- HONEST BACKFILL BASIS: generation is holistic; no existing def can PROVE a
-- pure-public corpus, therefore none receives a public tag. This records
-- ABSENCE-OF-PROVABLE-PUBLIC, not a claim of contamination. dmk-* rows
-- (declaredMarketIngest, uploaded declared_direction artifacts) →
-- internal_declared; all other existing rows (mkt-*, b2b-buyer, every MH-5
-- customer def) → internal_inferred.
--
-- Birth-immutability mirrors the provenance_type guard: register cannot
-- change after insert; a deliberate operator backfill must SET LOCAL
-- app.register_backfill = 'on' inside its transaction.

begin;

alter table public.odi_market_definitions
  add column market_register text;

create or replace function public.odi_market_register_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.market_register is distinct from old.market_register then
    if current_setting('app.register_backfill', true) = 'on' then
      return new;
    end if;
    raise exception 'odi_market_definitions.market_register is immutable after birth (OOD-1 register law) — def % cannot change % -> %',
      old.id, old.market_register, new.market_register;
  end if;
  return new;
end;
$$;

create trigger odi_market_register_immutable_guard
  before update on public.odi_market_definitions
  for each row
  execute function public.odi_market_register_immutable();

-- One-time deliberate backfill (the escape is exercised on purpose so the
-- guard's escape path is proven at birth).
set local app.register_backfill = 'on';

update public.odi_market_definitions
  set market_register = 'internal_declared'
  where journey_key like 'dmk-%';

update public.odi_market_definitions
  set market_register = 'internal_inferred'
  where market_register is null;

alter table public.odi_market_definitions
  alter column market_register set not null;

alter table public.odi_market_definitions
  add constraint odi_market_definitions_register_check
  check (market_register in ('public_inferred','publicly_declared','internal_inferred','internal_declared'));

commit;
