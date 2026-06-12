-- Gate 3a (operator-approved): coexistence keying for strategy artifacts.
-- artifact_role: market_read | declared_direction. source_direction_key: the
-- journey_key of the job-step set a declared artifact derives from; '' sentinel
-- (NOT NULL) for market_read — NULLs never collide in UNIQUE constraints and
-- PostgREST upserts cannot target partial/expression indexes, so the sentinel is
-- what makes both uniqueness and onConflict targeting real. Defaults are dropped
-- after backfill: future writers state their role explicitly or fail loudly.

alter table public.positioning_canvases
  add column if not exists artifact_role text not null default 'market_read';
alter table public.positioning_canvases
  add constraint check_positioning_canvases_artifact_role
  check (artifact_role in ('market_read','declared_direction'));
alter table public.positioning_canvases
  add column if not exists source_direction_key text not null default '';
alter table public.positioning_canvases
  add constraint check_positioning_canvases_role_direction
  check ((artifact_role = 'market_read'        and source_direction_key = '')
      or (artifact_role = 'declared_direction' and source_direction_key <> ''));
alter table public.positioning_canvases drop constraint positioning_canvases_company_id_key;
alter table public.positioning_canvases
  add constraint positioning_canvases_company_role_direction_key
  unique (company_id, artifact_role, source_direction_key);
alter table public.positioning_canvases alter column artifact_role drop default;
alter table public.positioning_canvases alter column source_direction_key drop default;

alter table public.strategy_cascades
  add column if not exists artifact_role text not null default 'market_read';
alter table public.strategy_cascades
  add constraint check_strategy_cascades_artifact_role
  check (artifact_role in ('market_read','declared_direction'));
alter table public.strategy_cascades
  add column if not exists source_direction_key text not null default '';
alter table public.strategy_cascades
  add constraint check_strategy_cascades_role_direction
  check ((artifact_role = 'market_read'        and source_direction_key = '')
      or (artifact_role = 'declared_direction' and source_direction_key <> ''));
alter table public.strategy_cascades drop constraint strategy_cascades_company_id_key;
alter table public.strategy_cascades
  add constraint strategy_cascades_company_role_direction_key
  unique (company_id, artifact_role, source_direction_key);
alter table public.strategy_cascades alter column artifact_role drop default;
alter table public.strategy_cascades alter column source_direction_key drop default;
