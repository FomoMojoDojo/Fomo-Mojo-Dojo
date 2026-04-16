-- Add innovation_strategy column to odi_market_definitions
-- Stores the selected innovation strategy: differentiated, dominant, disruptive, or discrete

ALTER TABLE public.odi_market_definitions
  ADD COLUMN IF NOT EXISTS innovation_strategy text;
