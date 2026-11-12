-- subjects — WHO a row of evidence is ABOUT (SP-11, SP-26, SP-40, SP-50, SP-51, SP-52; C1, C2).
--
-- Today a signal, claim or need says only which COMPANY it belongs to and, through voice_class, who
-- SPOKE. It cannot say who it is ABOUT. For a single-entity client that is the same question; for an
-- account with a parent, subsidiaries and named buyer groups it is not, and the evidence of all of
-- them merges into one pool. journey_key cannot separate them: research synthesis hardcodes
-- journey_key: "customer" (supabase/functions/_shared/researchSynthesisWrite.ts:318), so every
-- publicly-derived need of every subject lands on the same key.
--
-- THE CLIENT HAS NO ROW (C1). subject_id IS NULL means "about the client", read from the companies
-- row exactly as every reader already does. There is deliberately no 'self' role: a self row would
-- be a second place the client's own name and host live, free to disagree with companies.name and
-- companies.website, and every existing reader would have had to learn to prefer one. NULL costs
-- nothing and cannot drift. This is also why the referencing FKs are RESTRICT and not SET NULL
-- (SP-40): SET NULL would silently re-attribute a subject's evidence TO THE CLIENT on delete, which
-- is the one wrong answer. Retirement is retired_at; deletion of a referenced subject is refused.
--
-- SPEAKER AND SUBJECT ARE TWO AXES (C2, SP-22). voice_class keeps its present meaning and is not
-- touched by this slice. A client document about the account is client_voice with
-- subject_id = the account; an outside document about the account is outside_voice_about_client with
-- the same subject_id. They do not compete for one field, so there is no precedence rule to get
-- wrong. "The account's own voice" is the PAIR (subject_id = account, self-assertion verdict), not a
-- new label.
--
-- WHY host's CHECK LOOKS LIKE IT FORGOT NULL. The expression is copied verbatim from
-- company_related_entities_host_check so the two tables can never disagree about what a host is —
-- subjects-guard.sh (check b) compares the two pg_get_constraintdef strings and fails if they
-- diverge by a byte. There is no `host is null or` arm because none is needed: a CHECK refuses a row
-- only when it evaluates to FALSE, and every arm of this one evaluates to NULL when host is NULL, so
-- a hostless subject is admitted. Check b' proves that rather than asserting it.
--
-- unique (id, company_id) exists only to be the target of the composite foreign keys added in the
-- next migration (SP-51): it is what lets signals/claims/odi_needs declare
-- (subject_id, company_id) -> subjects (id, company_id), so a row can never point at a subject of
-- another company. It is redundant as a uniqueness claim — id is already the primary key.
--
-- WRITES ARE ADMIN-ONLY FOR NOW (SP-26, SP-52). Members read their own company's subjects through
-- the same three-way test their siblings use; nobody but an admin or the service role writes one.
-- anon is revoked explicitly: 77 public tables carry an anon grant from older blanket grants, and a
-- new table must not quietly join them.

create table public.subjects (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  role        text not null,
  name        text not null,
  host        text,
  anchors     text[] not null default '{}',
  retired_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint subjects_role_check check (role in ('account', 'account_related', 'buyers')),
  constraint subjects_name_check check (btrim(name) <> ''),
  constraint subjects_host_check
    check ((host = lower(host)) and (host !~ '^www\.') and (host ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$')),
  constraint subjects_id_company unique (id, company_id)
);

create unique index subjects_one_host on public.subjects (company_id, host) where host is not null;
create index subjects_company on public.subjects (company_id);

comment on table public.subjects is
  'SP-11: who a row of evidence is ABOUT, within one company. The client itself has NO row - subject_id IS NULL means the client (C1). Writes are admin-only (SP-52); retire with retired_at rather than deleting (SP-40).';
comment on column public.subjects.role is
  'account | account_related | buyers. No self role (C1): the client is subject_id IS NULL.';
comment on column public.subjects.host is
  'Optional. CHECK is copied verbatim from company_related_entities_host_check; NULL is admitted because every arm evaluates to NULL, not FALSE.';
comment on column public.subjects.anchors is
  'Per-subject anchor strings. buildAnchors stays unchanged; what changes is that the matched anchor SET is recorded as subject_id (C2).';
comment on column public.subjects.retired_at is
  'SP-40: how a subject leaves service. A subject that any row points at cannot be deleted - the composite FKs are ON DELETE RESTRICT, because SET NULL would re-attribute its evidence to the client.';
comment on constraint subjects_id_company on public.subjects is
  'SP-51: the target of the (subject_id, company_id) composite foreign keys. Redundant as uniqueness (id is the PK); it exists so a row cannot point at another company''s subject.';

-- the freeze trigger, exactly as every sibling carries it
create trigger enforce_company_freeze
  before insert or update or delete on public.subjects
  for each row execute function public.enforce_company_freeze();

-- updated_at is maintained by the house trigger. company_related_entities has no updated_at column
-- at all and odi_needs has one with no trigger, so there was no sibling convention to copy; six
-- tables (inputs, mojo_maps, client_portal_links, methodology_pages and two more) use
-- update_updated_at_column, and a timestamp nothing maintains is worse than no timestamp.
create trigger subjects_updated_at
  before update on public.subjects
  for each row execute function public.update_updated_at_column();

alter table public.subjects enable row level security;

-- SELECT: the same single-company test the siblings use - a member of the company, the company's
-- creator, or an admin (copied from "members can read company related entities").
create policy "members can read subjects"
  on public.subjects for select to authenticated
  using (
    exists (select 1 from public.company_members cm where cm.company_id = subjects.company_id and cm.user_id = auth.uid())
    or exists (select 1 from public.companies c where c.id = subjects.company_id and c.created_by = auth.uid())
    or public.has_role(auth.uid(), 'admin'::public.app_role)
  );

create policy "admins insert subjects"
  on public.subjects for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));

create policy "admins update subjects"
  on public.subjects for update to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));

create policy "admins delete subjects"
  on public.subjects for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role));

create policy "service role full access on subjects"
  on public.subjects for all
  using (auth.role() = 'service_role');

grant select, insert, update, delete on public.subjects to authenticated;
grant select, insert, update, delete, references, trigger, truncate on public.subjects to service_role;
revoke all on public.subjects from anon;
