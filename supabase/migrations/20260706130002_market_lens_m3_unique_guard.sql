-- Market-lens layer M3 — uniqueness guard on positioning/cascade per-lens artifacts.
-- Formalizes the proto-scoping that already exists (artifact_role +
-- source_direction_key): one market_read per company (the corporate core, key NULL)
-- and at most one artifact per (company, role, direction key).
--
-- NOTE: 20260612000004_artifact_role_keying.sql already created unique indexes
-- named <table>_company_role_direction_key on the RAW columns. Those treat NULL
-- source_direction_key as distinct, so they do NOT prevent two corporate
-- market_read rows (key NULL) for the same company — the exact hole this guard
-- closes. The coalesced variants below are added ADDITIVELY under distinct names;
-- the June-12 indexes are left untouched (this gate drops nothing).
-- PRE-CHECK REQUIRED before apply: no duplicates may exist under coalesce
-- semantics (if dupes are found the gate STOPS; they are not force-resolved).
-- Rollback: DROP INDEX both coalesced indexes.

create unique index positioning_canvases_company_role_direction_coalesced
  on public.positioning_canvases (company_id, artifact_role, coalesce(source_direction_key, ''));

create unique index strategy_cascades_company_role_direction_coalesced
  on public.strategy_cascades (company_id, artifact_role, coalesce(source_direction_key, ''));
