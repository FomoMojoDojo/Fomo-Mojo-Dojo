-- ONB-M1: Four-content-type provenance taxonomy
--
-- Adds provenance_type_enum + two columns to every table holding rendered
-- strategic content surfaced by the workshop views:
--   positioning_canvases, strategy_cascades, routes,
--   odi_market_definitions, odi_needs, opportunities
--
-- Backfill heuristics (confirmed by operator 2026-05-21):
--   source / source_path = 'system'        → public_research (legacy research-company)
--   source / source_path = 'research-company' → public_research
--   source / source_path LIKE 'manual_%'   → manual
--   source / source_path = 'public_research'  → public_research
--   opportunities (no source column)        → public_research
--
-- confidence left NULL on all rows — calibration is A80's job.
-- source / source_path columns untouched (additive only).

-- ─────────────────────────────────────────────────────────
-- 1. Enum
-- ─────────────────────────────────────────────────────────

CREATE TYPE provenance_type_enum AS ENUM (
  'public_research',
  'framework_adjudicated',
  'odi_survey',
  'manual'
);

-- ─────────────────────────────────────────────────────────
-- 2. Add columns (nullable first so backfill can run)
-- ─────────────────────────────────────────────────────────

ALTER TABLE positioning_canvases
  ADD COLUMN provenance_type provenance_type_enum,
  ADD COLUMN confidence      numeric(3,2);

ALTER TABLE strategy_cascades
  ADD COLUMN provenance_type provenance_type_enum,
  ADD COLUMN confidence      numeric(3,2);

ALTER TABLE routes
  ADD COLUMN provenance_type provenance_type_enum,
  ADD COLUMN confidence      numeric(3,2);

ALTER TABLE odi_market_definitions
  ADD COLUMN provenance_type provenance_type_enum,
  ADD COLUMN confidence      numeric(3,2);

ALTER TABLE odi_needs
  ADD COLUMN provenance_type provenance_type_enum,
  ADD COLUMN confidence      numeric(3,2);

ALTER TABLE opportunities
  ADD COLUMN provenance_type provenance_type_enum,
  ADD COLUMN confidence      numeric(3,2);

-- ─────────────────────────────────────────────────────────
-- 3. Backfill — tables with `source` column
-- ─────────────────────────────────────────────────────────

UPDATE positioning_canvases
SET provenance_type = CASE
  WHEN source = 'research-company' THEN 'public_research'::provenance_type_enum
  WHEN source = 'system'           THEN 'public_research'::provenance_type_enum
  WHEN source LIKE 'manual_%'      THEN 'manual'::provenance_type_enum
  ELSE                                  'manual'::provenance_type_enum
END;

UPDATE strategy_cascades
SET provenance_type = CASE
  WHEN source = 'research-company' THEN 'public_research'::provenance_type_enum
  WHEN source = 'system'           THEN 'public_research'::provenance_type_enum
  WHEN source LIKE 'manual_%'      THEN 'manual'::provenance_type_enum
  ELSE                                  'manual'::provenance_type_enum
END;

UPDATE routes
SET provenance_type = CASE
  WHEN source = 'research-company' THEN 'public_research'::provenance_type_enum
  WHEN source = 'system'           THEN 'public_research'::provenance_type_enum
  WHEN source LIKE 'manual_%'      THEN 'manual'::provenance_type_enum
  ELSE                                  'manual'::provenance_type_enum
END;

-- ─────────────────────────────────────────────────────────
-- 4. Backfill — tables with `source_path` column
-- ─────────────────────────────────────────────────────────

UPDATE odi_market_definitions
SET provenance_type = CASE
  WHEN source_path = 'research-company'  THEN 'public_research'::provenance_type_enum
  WHEN source_path = 'system'            THEN 'public_research'::provenance_type_enum
  WHEN source_path = 'public_research'   THEN 'public_research'::provenance_type_enum
  WHEN source_path LIKE 'manual_%'       THEN 'manual'::provenance_type_enum
  ELSE                                        'manual'::provenance_type_enum
END;

UPDATE odi_needs
SET provenance_type = CASE
  WHEN source_path = 'research-company'  THEN 'public_research'::provenance_type_enum
  WHEN source_path = 'system'            THEN 'public_research'::provenance_type_enum
  WHEN source_path = 'public_research'   THEN 'public_research'::provenance_type_enum
  WHEN source_path LIKE 'manual_%'       THEN 'manual'::provenance_type_enum
  ELSE                                        'manual'::provenance_type_enum
END;

-- ─────────────────────────────────────────────────────────
-- 5. Backfill — opportunities (no source column; all public_research)
-- ─────────────────────────────────────────────────────────

UPDATE opportunities
SET provenance_type = 'public_research'::provenance_type_enum;

-- ─────────────────────────────────────────────────────────
-- 6. Enforce NOT NULL + set DEFAULT after backfill
-- ─────────────────────────────────────────────────────────

ALTER TABLE positioning_canvases
  ALTER COLUMN provenance_type SET NOT NULL,
  ALTER COLUMN provenance_type SET DEFAULT 'manual';

ALTER TABLE strategy_cascades
  ALTER COLUMN provenance_type SET NOT NULL,
  ALTER COLUMN provenance_type SET DEFAULT 'manual';

ALTER TABLE routes
  ALTER COLUMN provenance_type SET NOT NULL,
  ALTER COLUMN provenance_type SET DEFAULT 'manual';

ALTER TABLE odi_market_definitions
  ALTER COLUMN provenance_type SET NOT NULL,
  ALTER COLUMN provenance_type SET DEFAULT 'manual';

ALTER TABLE odi_needs
  ALTER COLUMN provenance_type SET NOT NULL,
  ALTER COLUMN provenance_type SET DEFAULT 'manual';

ALTER TABLE opportunities
  ALTER COLUMN provenance_type SET NOT NULL,
  ALTER COLUMN provenance_type SET DEFAULT 'manual';

-- confidence stays nullable on all tables (no default — NULL = uncalibrated)
