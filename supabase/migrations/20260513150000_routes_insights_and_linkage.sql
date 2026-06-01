-- Phase 79: Route Evidence Graph — add insight + linkage columns to routes
-- Adds evidence-graph fields without breaking existing structure.
-- All columns nullable with safe defaults.

ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS route_insights_json JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS source_file_ids     TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linked_tension_ids  UUID[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linked_need_ids     UUID[]  DEFAULT '{}';

-- route_insights_json shape:
-- {
--   "pressure":            string,     -- evidence cluster label (e.g. "Consistency Proof Pressure")
--   "pressure_short":      string,     -- 2-4 word form for badges
--   "evidence_snippets":   [{text, source_file_id, source_label, confidence: "direct"|"inferred"}],
--   "uncertainty":         string,     -- what we don't yet know
--   "weakening_conditions": string[],  -- conditions that would undermine this route
--   "prerequisites":       string[],   -- what must be true first
--   "customer_impact":     string,     -- customer outcome if route is resolved
--   "operational_impact":  string,     -- internal change implied
--   "confidence_posture":  string,     -- grounded assessment of how solid the signal is
--   "movement_condition":  string      -- what would visibly change the route's state
-- }

COMMENT ON COLUMN public.routes.route_insights_json IS
  'Evidence graph data: pressure label, snippets (with source_file_id), uncertainty, weakening conditions, prerequisites, customer/operational impact, confidence posture, movement condition.';

COMMENT ON COLUMN public.routes.source_file_ids IS
  'input_files.id values that contributed evidence to this route.';

COMMENT ON COLUMN public.routes.linked_tension_ids IS
  'strategic_tensions.id values this route is associated with.';

COMMENT ON COLUMN public.routes.linked_need_ids IS
  'odi_needs.id values this route addresses.';
