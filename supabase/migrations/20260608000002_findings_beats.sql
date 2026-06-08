-- Insight-anchored beats (2a, write-side): per-finding three-beat framing —
-- Observe (Ulwick-precise restatement of the body), Name-the-tension (Martin
-- what-would-have-to-be-true, held open), Open (provisional, evidence-seeking
-- discussion question; gentle). Generated at capture from the finding body + the
-- company's current signal-band profile, and backfilled for existing seeds.
-- Render-side (Next Turn) is a separate item (2b) — no render changes here.
--
-- Shape: { "observe": text, "name_tension": text, "open": text }. NULL until generated.
-- find_primary_finding RETURNS SETOF public.findings, so SELECT * carries this column
-- through with no resolver change.
ALTER TABLE public.findings ADD COLUMN IF NOT EXISTS beats jsonb NULL;
COMMENT ON COLUMN public.findings.beats IS
  'Insight three-beat (generated): {observe, name_tension, open}. NULL until beat-gen runs.';
