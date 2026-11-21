-- ── SP-475(c): one representative quote per need, among LIVE patterns ───────────────────────────
--
-- SEPARATE FROM THE COLUMNS MIGRATION, AND APPLIED AFTER THE CHECKPOINT'S PATTERNS WERE SUPERSEDED,
-- because it could not be created over them: measured 2026-11-20, three quotes were already the
-- representative of more than one live pattern under the same need — one quote for **five** patterns
-- under "Increase clarity on billing and cancellation policies" (which is the N14 splitting problem
-- seen from another angle), four under P1's outage need and two under P2's.
--
-- That is the ruling working as intended: the constraint could not be added without the thing it
-- forbids being gone, so it names the defect rather than tolerating it.

drop index if exists public.need_patterns_one_representative;
create unique index need_patterns_one_representative
  on public.need_patterns (company_id, need_id, representative_signal_id)
  where superseded_at is null and representative_signal_id is not null;
