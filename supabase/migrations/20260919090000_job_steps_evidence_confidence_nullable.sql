-- job_steps.evidence_confidence: NULL = not measured (operator ruling M2 + P2, signed 2026-09-19).
-- A MARKET run of local-jobmap-synthesis writes evidence_basis = "industry_anchor:<industry_key>",
-- evidence_status "unclear" and NO confidence — the model's percentage was an invented number on a
-- map whose steps are hypotheses (the funder map, run b0f0b0b8, rendered "Unclear · 0%"). The column
-- was integer NOT NULL DEFAULT 0 (20260313113000), so NULL could not be stored at all.
--
--   * NOT NULL is dropped; DEFAULT 0 stays (P2 — a customer run is unchanged, no row is backfilled).
--
-- Readers (census in the 2026-09-19 report): the drawers guard on typeof number and render no
-- percentage for NULL; the score/band readers (`?? 100` threshold checks) give a NULL row no
-- confidence-derived term; the two coercions to 0 (JobSteps badge, isDraftPlaceholderStep) and the
-- insert/brief builders (jobMapRegeneration, contextBuilders) were made NULL-safe in the same gate.
alter table public.job_steps alter column evidence_confidence drop not null;
comment on column public.job_steps.evidence_confidence is
  'Confidence 0..100 that the step is grounded in evidence; NULL = not measured (a market map written by local-jobmap-synthesis carries no invented percentage — ruling M2, 2026-09-19).';
