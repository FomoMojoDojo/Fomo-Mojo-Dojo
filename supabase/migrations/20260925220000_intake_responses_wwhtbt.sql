-- W1 (intake gate 2026-09-25) — the assumption the client stated at intake.
--
-- The quiz has asked "What would have to be true for that to work?" since the 8-beat port and
-- sends it as what_would_have_to_be_true, but the importer's IntakeRequest never carried the
-- field, so every import dropped it on the floor. The Vercel relay email did not print it either
-- (only the DreamHost PHP fallback did), so on the live path nobody ever saw it. This column is
-- the verbatim record.
--
-- WHY HERE AND NOT strategy_assumptions: this is what they SAID, once, at a moment in time —
-- the same class of thing as explicit_strategic_problem and success_definition, which already sit
-- on this row. intake_responses holds one row per submission, so a later submission ADDS its own
-- assumption instead of overwriting the earlier one. Promoting it to a first-class, editable
-- strategy_assumptions row is a separate decision (it would enter the cascade/positioning
-- generators, and from there an external model) and is NOT made here.
--
-- NOT in the .extracted.txt sidecar: the markdown is the human artifact, the sidecar is the
-- model-facing one. Same ruling as the contact columns (C2, 20260925190000).
--
-- RLS: nothing to add. The table's policies are table-level (20260812210000) — admin-manages-all
-- plus the four own-row policies — and a new column inherits them.
--
-- Additive only. No existing row changes. NO BACKFILL: the hosted mailbox is empty and the single
-- imported submission (CB2, the Cafe Barra email backfill) never carried the field, so NULL is
-- the honest record of every row that exists today.

BEGIN;

ALTER TABLE public.intake_responses
  ADD COLUMN IF NOT EXISTS what_would_have_to_be_true text;

COMMENT ON COLUMN public.intake_responses.what_would_have_to_be_true IS
  'Verbatim answer to the quiz question "What would have to be true for that to work?". Optional; may be NULL. A client-stated assumption at intake — not a validated one, and not an entry in strategy_assumptions.';

COMMIT;
