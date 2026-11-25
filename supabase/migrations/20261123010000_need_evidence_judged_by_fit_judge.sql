-- ── SP-600: need_evidence.judged_by GAINS 'fit_judge_cc_read_unchecked' ──────────────────────────
--
-- WHY. Until 2026-11-23 every label in need_evidence came from one place: CC's read of a quote
-- against a need's wording, loaded from the frozen corpus (judged_by 'cc_read_unchecked'). When N13's
-- wording was edited in place (SP-591) its links had to be re-read against the NEW sentence, and that
-- was done by the local fit judge (qwen3.6:35b) with CC reading every changed verdict. None of the
-- three admitted values says that: 'cc_read_unchecked' hides that a model made the call first, and
-- the two operator values claim a check that did not happen.
--
-- The new value means exactly: the fit judge said so, CC read it and agreed, the operator has not
-- checked. It is written ONLY on a row where both hold (SP-602 — no link is written on the judge's
-- word alone). Which judge and which prompt are named in the row's own rubric_version / rubric_md5.
--
-- The constraint is replaced, not relaxed: four named values, and a fifth is still refused
-- (need-evidence-guard e1).
--
-- REVERSAL (only once no row carries the new value):
--   alter table public.need_evidence drop constraint need_evidence_judged_by_check;
--   alter table public.need_evidence add constraint need_evidence_judged_by_check check (
--     judged_by in ('cc_read_unchecked', 'operator', 'operator_confirmed_cc'));
alter table public.need_evidence drop constraint need_evidence_judged_by_check;
alter table public.need_evidence add constraint need_evidence_judged_by_check check (
  judged_by in ('cc_read_unchecked', 'operator', 'operator_confirmed_cc', 'fit_judge_cc_read_unchecked'));

comment on column public.need_evidence.judged_by is
  'Who judged the label. cc_read_unchecked: CC read it, no person checked. operator: the operator decided. operator_confirmed_cc: the operator confirmed CC''s read. fit_judge_cc_read_unchecked (SP-600): the local fit judge said so and CC read it and agreed; the judge and prompt are in rubric_version / rubric_md5; no person checked.';
