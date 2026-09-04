-- OUTSIDE RECRAWL REVIEW (operator ruling 2026-09-04): the operator gate between R2 (snapshots) and R3
-- (signal regeneration). One row per (company, run_id, source_url) written by the local runner's --review
-- mode; NOTHING merges into signals until operator_decision = 'approve' (extract-outside-evidence refuses
-- every other row for that run_id). Baseline = the newest snapshot for the URL whose run_id is NOT the
-- sentinel and which predates the review day — never bare newest (the vacuous-proof plant lives under the
-- sentinel run_id and must never become a baseline). Additive; applied with psql -f (repo convention).
create table public.outside_recrawl_review (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies(id),
  run_id               uuid not null,
  source_url           text not null,
  baseline_sha256      text,
  baseline_status      text,                       -- fetch_status of the baseline row (null = no baseline)
  new_sha256           text,
  fetch_status         public.outside_fetch_status not null,
  http_status          integer,
  fetch_path           text not null check (fetch_path in ('plain','headless')),
  disposition          text not null check (disposition in ('new','changed','unchanged','still_walled','gone','recovered')),
  dependent_signal_ids uuid[] not null default '{}',
  dependent_delta_ids  uuid[] not null default '{}',
  anchor_present       boolean,
  operator_decision    text check (operator_decision is null or operator_decision in ('approve','reject')),
  decided_at           timestamptz,
  decided_by           text,
  created_at           timestamptz not null default now(),
  unique (company_id, run_id, source_url)
);
create index outside_recrawl_review_company_run_idx on public.outside_recrawl_review (company_id, run_id);
alter table public.outside_recrawl_review enable row level security;
create policy "members and admins read outside recrawl review"
  on public.outside_recrawl_review for select
  to authenticated
  using (
    exists (select 1 from public.company_members cm where cm.company_id = outside_recrawl_review.company_id and cm.user_id = auth.uid())
    or exists (select 1 from public.companies c where c.id = outside_recrawl_review.company_id and c.created_by = auth.uid())
    or public.has_role(auth.uid(), 'admin'::app_role)
  );
-- No client write policy: the runner (audited psql channel) writes rows; the operator decides via a later door.
-- FREEZE: attach explicitly (RB-2 lesson).
create trigger enforce_company_freeze
  before insert or update or delete on public.outside_recrawl_review
  for each row execute function public.enforce_company_freeze();
