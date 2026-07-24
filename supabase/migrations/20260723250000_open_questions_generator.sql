-- V2-4 — the post-findings open-question generator + publicly_silent unification.
--
-- first_read_open_questions gains provenance + a supersede lifecycle so ONE list holds
-- both finding-derived and silent-delta-derived questions, reconciled by content
-- identity (keep/add/supersede — never delete+insert):
--   • source_kind    — 'finding' (grounded in a persisted findings.body) | 'silent_delta'
--                      (a declared claim the public record doesn't echo). Provenance.
--   • anchor_identity — content identity of the dependency the question depends on
--                      (the finding body OR the claim_delta). NULL = linkless (honest).
--   • status         — 'live' | 'superseded'. A re-run supersedes a prior live question
--                      for the same anchor rather than deleting it (history survives).
-- finding_identity is KEPT (FR-FLOW-2b's set-aside shrink reads it) — set == anchor_identity
-- for a finding-derived link, NULL for silent-delta (no finding).

alter table public.first_read_open_questions
  add column if not exists source_kind     text not null default 'finding',
  add column if not exists anchor_identity text,
  add column if not exists status          text not null default 'live';

alter table public.first_read_open_questions
  drop constraint if exists fr_open_questions_source_kind_check;
alter table public.first_read_open_questions
  add constraint fr_open_questions_source_kind_check
  check (source_kind in ('finding', 'silent_delta'));

alter table public.first_read_open_questions
  drop constraint if exists fr_open_questions_status_check;
alter table public.first_read_open_questions
  add constraint fr_open_questions_status_check
  check (status in ('live', 'superseded'));

-- Act 5 reads the LIVE set for a company; supersede lookup is per-anchor within a run.
create index if not exists first_read_open_questions_company_status_idx
  on public.first_read_open_questions (company_id, status);
create index if not exists first_read_open_questions_anchor_idx
  on public.first_read_open_questions (company_id, run_id, anchor_identity);
