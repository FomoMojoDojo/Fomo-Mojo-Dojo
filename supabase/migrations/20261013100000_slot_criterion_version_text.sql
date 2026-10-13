-- ── P3 (operator ruling, 2026-10-13): criterion_version holds the GENERATION RULES version ──────
--
-- first_read_slots.criterion_version was created as `integer` by the Gate-5b pattern, where a judge
-- criterion was numbered (market_discovery_verdicts still works that way and is untouched here).
-- The slot path never wrote it: all 5 existing rows are NULL, and no code reads the column.
--
-- P3 stamps GEN_RULES_VERSION onto every slot, and that is a dated string ("2026-10-13.1") rather
-- than a counter — the same shape as PARSER_RULES_VERSION, so a reader can tell at a glance WHEN the
-- rules changed rather than having to find a mapping from 3 to a date. So the column becomes text.
--
-- Lossless: every value is NULL, so the cast cannot drop or mangle anything.
-- NOTE: src/integrations/supabase/types.ts still declares this column as `number`. It is generated,
-- and no client code reads it on this table, so it is stale rather than wrong — regenerate when the
-- types are next refreshed.
alter table public.first_read_slots
  alter column criterion_version type text using criterion_version::text;

comment on column public.first_read_slots.criterion_version is
  'P3 (2026-10-13): the GEN_RULES_VERSION the slot was generated under (_shared/genRulesVersion.ts) — attribution only. It retracts nothing and gates nothing, unlike PARSER_RULES_VERSION. NULL = written before the ruling.';
