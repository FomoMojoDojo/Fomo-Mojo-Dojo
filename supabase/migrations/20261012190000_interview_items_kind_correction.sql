-- ── Act 1 (signed 2026-10-08): interview_items.kind gains 'correction' ──────────────────────────
--
-- A client's FACT CORRECTION had no home. The ODI writer (record-interview-finding) demands a
-- direction verb and a job step, so "we're no longer level 14" could only be filed as an 'ask' —
-- the kind that means "recorded, not converted" (_shared/interviewItems.ts:85-87). An ask is a
-- request; a correction is a statement about the record being wrong. Conflating them meant the one
-- item that retires a term the read still prints was indistinguishable from a scheduling request.
--
-- 'correction' is a RECORDED kind like 'ask' and 'hypothesis': no converter, no framework_form, no
-- landing. NO existing row changes meaning and no reader needs a new branch to stay correct — the
-- parser's NO_CONVERTER_REASON already names whatever kind it is handed.
--
-- The wall is unchanged: interview_items stays readable only from the parser, its one shared module,
-- src/lib/interviewParser/ and the migrations (interviewItems.census.test.ts). This migration adds a
-- kind, not a reader.
alter table public.interview_items drop constraint if exists interview_items_kind_check;
alter table public.interview_items add constraint interview_items_kind_check
  check (kind = any (array[
    'job'::text, 'pain_point'::text, 'desire'::text, 'outcome'::text, 'route'::text,
    'step'::text, 'positioning'::text, 'cascade'::text, 'ask'::text, 'hypothesis'::text,
    'correction'::text
  ]));

comment on column public.interview_items.kind is
  'The parsed item kind. Converting kinds (job/pain_point/desire/outcome/route/step/positioning/cascade) carry a framework_form; RECORDED kinds (ask, hypothesis, correction) carry none and are filed with their raw words. correction (Act 1, 2026-10-08) is a client statement that the record itself is wrong — its writer is record-interview-correction, which mints one client_attested claim and never calls a model.';
