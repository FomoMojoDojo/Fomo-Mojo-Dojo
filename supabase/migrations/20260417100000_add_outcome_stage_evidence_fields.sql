-- Add stage-aware, evidence-aware fields to managed_outcomes
-- All columns are nullable so existing rows and old insert paths degrade gracefully.

ALTER TABLE managed_outcomes
  ADD COLUMN IF NOT EXISTS stage TEXT
    CHECK (stage IN ('outside', 'diagnose', 'focus', 'flow')),

  ADD COLUMN IF NOT EXISTS evidence_level TEXT
    CHECK (evidence_level IN ('external_only', 'internal_partial', 'validated', 'strong_validated')),

  ADD COLUMN IF NOT EXISTS why_this_level TEXT,
  ADD COLUMN IF NOT EXISTS why_behavioral  TEXT,

  ADD COLUMN IF NOT EXISTS leading_indicators        TEXT[],
  ADD COLUMN IF NOT EXISTS lagging_indicators        TEXT[],
  ADD COLUMN IF NOT EXISTS related_opportunity_areas TEXT[];

-- Default stage for any existing rows that pre-date this migration
UPDATE managed_outcomes
SET stage = 'outside'
WHERE stage IS NULL;
