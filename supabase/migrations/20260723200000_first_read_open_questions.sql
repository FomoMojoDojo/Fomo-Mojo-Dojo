-- FR-FLOW-2a — persist open questions as ROWS with a content-identity link to the
-- finding(s) they depend on. The prerequisite for FR-FLOW-2b's live-shrink: a
-- set-aside verdict on a finding can then demote the questions that depend on it.
--
-- CURRENT SHAPE (confirmed): open questions exist ONLY as free-text strings in
-- public_baseline_runs.result_json.open_questions[] — no rows, no linkage. This
-- gate gives them rows + a link.
--
-- LINK BY CONTENT IDENTITY (evidence law): finding_identity is the content identity
-- of the finding the question depends on — NOT a row id (ids self-heal / churn on
-- regen; identity survives). No FK on it, for the same reason claim_deltas /
-- first_read_responses link by identity, not row. The link is populated AT
-- GENERATION time (in ingestPublicBaselineSignals) and verified against the run's
-- real finding identities — a question whose declared dependency doesn't match a
-- real finding is stored LINKLESS (finding_identity NULL), never fabricated
-- (absence-isn't-a-verdict).

create table public.first_read_open_questions (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  run_id            text not null,              -- public_baseline_run id (provenance); NO FK (runs churn)
  question_text     text not null,              -- verbatim question as generated
  question_identity text not null,              -- contentIdentity(question_text)
  finding_identity  text,                       -- contentIdentity(depended-on finding); NULL = linkless (honest)
  created_at        timestamptz not null default now(),
  unique (company_id, run_id, question_identity)
);

create index first_read_open_questions_company_idx  on public.first_read_open_questions (company_id);
-- FR-FLOW-2b shrink lookup: "which questions depend on this set-aside finding?"
create index first_read_open_questions_finding_idx  on public.first_read_open_questions (finding_identity);

alter table public.first_read_open_questions enable row level security;

create policy "Users can view company first_read_open_questions"
  on public.first_read_open_questions for select
  to authenticated
  using (
    exists (
      select 1 from public.company_members cm
      where cm.company_id = first_read_open_questions.company_id and cm.user_id = auth.uid()
    )
    or public.has_role(auth.uid(), 'admin')
  );

create policy "Admins can manage all first_read_open_questions"
  on public.first_read_open_questions for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
