-- Add level, actor, action columns to managed_outcomes
-- level: primary (selection/conviction), secondary (value realization), tertiary (scale/expansion)
-- actor: who changes behavior (e.g. "qualified prospects", "clients")
-- action: what they do differently — must be observable (e.g. "book a call", "commit to a decision")

ALTER TABLE managed_outcomes
  ADD COLUMN IF NOT EXISTS level TEXT
    CHECK (level IS NULL OR level IN ('primary', 'secondary', 'tertiary')),
  ADD COLUMN IF NOT EXISTS actor TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS action TEXT NOT NULL DEFAULT '';

-- Backfill level from is_primary flag where possible
UPDATE managed_outcomes
SET level = 'primary'
WHERE is_primary = true AND level IS NULL;

COMMENT ON COLUMN managed_outcomes.level IS 'Outcome level: primary (selection/conviction), secondary (value realization), tertiary (scale/expansion)';
COMMENT ON COLUMN managed_outcomes.actor IS 'Who changes behavior — e.g. qualified prospects, clients, product teams';
COMMENT ON COLUMN managed_outcomes.action IS 'Observable action — e.g. book a call, commit to a decision, adopt a feature';
