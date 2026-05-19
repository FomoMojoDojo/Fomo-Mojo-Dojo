-- A69: strategy-alignment evaluation columns on odi_needs
ALTER TABLE odi_needs ADD COLUMN IF NOT EXISTS strategy_alignment TEXT NULL;
ALTER TABLE odi_needs ADD CONSTRAINT odi_needs_strategy_alignment_check
  CHECK (strategy_alignment IN ('aligned', 'off_strategy', 'unknown'));
ALTER TABLE odi_needs ADD COLUMN IF NOT EXISTS strategy_alignment_reason TEXT NULL;
ALTER TABLE odi_needs ADD COLUMN IF NOT EXISTS strategy_alignment_evaluated_at TIMESTAMPTZ NULL;
