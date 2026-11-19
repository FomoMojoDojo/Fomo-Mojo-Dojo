-- SP-429 slice 3: need_evidence — which quote bears on which need, and WHO judged it.
--
-- WHY. The bearing labels and their polarity have lived only in a file
-- (~/dev/_diagnose-shots/2026-11-18/charter-need-labels-full.json, 7,590 rows), so every count that
-- rests on them — the brief's hotspots and thin spots — could only be produced by a script reading
-- that file. Nothing in the schema could say "this quote bears on this need".
--
-- NOTHING ABOUT COUNTING IS STORED. There is no `counted` column and no `meets_bar` column. The
-- SP-406 rules — undated Cox is not counted, Cox before 2026-08-20 is "under Cox" and not counted,
-- the bar is 3 counted reviews from 2 sites — are COMPUTED from two stored facts: this row's `brand`
-- and the signal's own `event_date`. So a recovered date (SP-408) or a changed counting ruling needs
-- no reload, and a stored verdict can never drift from the rule that produced it.
--
-- POLARITY IS THREE-VALUED. SP-405 (neutral as a fourth state) was WITHDRAWN by SP-416, and the
-- corpus holds zero neutral labels: the full read used working / not working / mixed. The CHECK
-- admits exactly those three, so a fourth value cannot appear quietly — reinstating neutral would be
-- a migration and a re-label, which is the honest cost.
--
-- WHO JUDGED IS NOT NULLABLE (SP-429). Today's labels load as 'cc_read_unchecked' — read by CC, not
-- checked by a person — so the brief can always say how a hotspot was judged. An operator pass later
-- moves a row to 'operator' or 'operator_confirmed_cc'.

-- The composite FK targets. Neither table had unique (id, company_id); this is the same move SP-51
-- made for subjects, and it is what makes a cross-company pair unrepresentable rather than merely
-- discouraged. Redundant as uniqueness claims (id is already the primary key of each).
alter table public.odi_needs add constraint odi_needs_id_company unique (id, company_id);
alter table public.signals  add constraint signals_id_company   unique (id, company_id);

create table public.need_evidence (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  need_id        uuid not null,
  signal_id      uuid not null,
  bears          boolean not null,
  polarity       text,
  brand          text not null,
  judged_by      text not null default 'cc_read_unchecked',
  judged_at      timestamptz not null default now(),
  rubric_version text not null,
  rubric_md5     text not null,
  label_source   text not null,
  created_at     timestamptz not null default now(),
  -- a label can never join a need to another company's signal
  constraint need_evidence_need_fk   foreign key (need_id, company_id)
    references public.odi_needs (id, company_id) on delete restrict,
  constraint need_evidence_signal_fk foreign key (signal_id, company_id)
    references public.signals (id, company_id) on delete restrict,
  -- polarity exists exactly when the quote bears, and is one of the three signed values
  constraint need_evidence_polarity_check check (
    (bears and polarity in ('working', 'not working', 'mixed')) or (not bears and polarity is null)
  ),
  constraint need_evidence_judged_by_check check (
    judged_by in ('cc_read_unchecked', 'operator', 'operator_confirmed_cc')
  ),
  constraint need_evidence_brand_check check (btrim(brand) <> ''),
  constraint need_evidence_label_source_check check (label_source in ('frozen_gold', 'full_read')),
  -- one label per (need, quote): a second read updates, never appends a rival label
  constraint need_evidence_one_label unique (need_id, signal_id)
);

create index need_evidence_company_need on public.need_evidence (company_id, need_id);
create index need_evidence_signal       on public.need_evidence (company_id, signal_id);

-- RLS, copied from the subjects shape (20261111234000_subjects.sql:39-42): members read their own
-- company's rows, only an admin or the service role writes one, and anon is revoked EXPLICITLY —
-- 77 public tables carry an anon grant from older blanket grants and a new table must not join them.
alter table public.need_evidence enable row level security;

create policy "members can read need_evidence" on public.need_evidence for select
  using (
    public.has_role(auth.uid(), 'admin'::app_role)
    or exists (select 1 from public.company_members m where m.company_id = need_evidence.company_id and m.user_id = auth.uid())
    or exists (select 1 from public.companies c where c.id = need_evidence.company_id and c.created_by = auth.uid())
  );
create policy "admins insert need_evidence" on public.need_evidence for insert
  with check (public.has_role(auth.uid(), 'admin'::app_role));
create policy "admins update need_evidence" on public.need_evidence for update
  using (public.has_role(auth.uid(), 'admin'::app_role));
create policy "admins delete need_evidence" on public.need_evidence for delete
  using (public.has_role(auth.uid(), 'admin'::app_role));
create policy "service role full access on need_evidence" on public.need_evidence for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

grant select on public.need_evidence to authenticated;
grant all    on public.need_evidence to service_role;
revoke all   on public.need_evidence from anon;
