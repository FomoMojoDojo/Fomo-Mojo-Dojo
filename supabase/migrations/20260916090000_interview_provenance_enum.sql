-- Gate 1 (operator ruling 2026-09-16), migration A — ENUM ONLY.
--
-- Interview findings enter odi_needs under two new provenance_type values:
--   client_attested    — a client stakeholder's own words (client voice, counted on the declared side)
--   market_interviewed — a market participant (e.g. a donor) reached through a private channel:
--                        a NEW origin, customer-evidence grade, never a verdict on its own.
-- Both point at an interview record (migration B). Kept in its own file because a value added to an
-- enum cannot be referenced in the transaction that adds it.
ALTER TYPE public.provenance_type_enum ADD VALUE IF NOT EXISTS 'client_attested';
ALTER TYPE public.provenance_type_enum ADD VALUE IF NOT EXISTS 'market_interviewed';
