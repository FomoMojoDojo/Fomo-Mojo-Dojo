-- E1 (operator ruling 2026-10-21): related entities on the company record — a parent, subsidiary, acquired company,
-- brand, or the company a parent merged into. One row per (company, host); only status = 'confirmed' has any effect
-- (the shared resolver ownHostsFor reads confirmed rows only). Written ONLY by scripts/related-entities.ts (named mode
-- plan|write): write fetches source_url, asserts source_quote byte-present in the page text, stores that page in
-- company_related_entity_sources and an audit row in company_related_entity_audit — all in one transaction.
-- A related entity is never added by name alone: name, host and a cited source are all NOT NULL.
-- exclude_hosts: the per-entity exclude list (hosts that share the entity's name but are NOT it — e.g. Cox Enterprises,
-- Cox Automotive, Cox Media Group for Cox Communications); a proposal whose host is on it is refused by the writer.
create table public.company_related_entities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  host text not null check (host = lower(host) and host !~ '^www\.' and host ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  relation text not null check (relation in ('parent', 'subsidiary', 'acquired', 'brand', 'merged_into')),
  effective_from date,
  effective_basis text not null check (effective_basis in ('cited', 'crawl_date_provisional')),
  source_url text not null check (source_url ~ '^https?://'),
  source_quote text not null check (btrim(source_quote) <> ''),
  source_verified_at timestamptz,
  exclude_hosts text[] not null default '{}',
  proposed_by text not null,
  proposed_at timestamptz not null default now(),
  status text not null default 'proposed' check (status in ('proposed', 'confirmed', 'rejected', 'retired')),
  confirmed_by text,
  confirmed_at timestamptz,
  -- effective_from NULL = the relation holds for every row date ("always"); with basis cited that is a cited standing
  -- relation (a parent, a brand), with crawl_date_provisional it is uncited and shown "· date not confirmed".
  -- A confirmed row was confirmed by someone, at a time, against a verified source.
  check (status <> 'confirmed' or (confirmed_by is not null and confirmed_at is not null and source_verified_at is not null))
);
-- one confirmed row per company + host
create unique index company_related_entities_one_confirmed on public.company_related_entities (company_id, host) where status = 'confirmed';
create index company_related_entities_company on public.company_related_entities (company_id);

-- the page the writer fetched to verify source_quote (the evidence the confirm rests on)
create table public.company_related_entity_sources (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.company_related_entities(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  source_url text not null,
  fetched_at timestamptz not null default now(),
  http_status integer,
  clean_text text not null,
  text_sha256 text not null,
  quote_offset integer not null check (quote_offset >= 0)
);
create index company_related_entity_sources_entity on public.company_related_entity_sources (entity_id);

-- every write the writer makes, before → after
create table public.company_related_entity_audit (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid references public.company_related_entities(id) on delete set null,
  company_id uuid not null references public.companies(id) on delete cascade,
  action text not null check (action in ('propose', 'confirm', 'reject', 'retire')),
  actor text not null,
  at timestamptz not null default now(),
  before jsonb,
  after jsonb not null
);
create index company_related_entity_audit_company on public.company_related_entity_audit (company_id);

-- RLS: members (and the company's creator, and admins) read; the service role writes; anon holds nothing (grants g3)
alter table public.company_related_entities enable row level security;
alter table public.company_related_entity_sources enable row level security;
alter table public.company_related_entity_audit enable row level security;
create policy "members can read company related entities" on public.company_related_entities for select to authenticated using (
  exists (select 1 from public.company_members cm where cm.company_id = company_related_entities.company_id and cm.user_id = auth.uid())
  or exists (select 1 from public.companies c where c.id = company_related_entities.company_id and c.created_by = auth.uid())
  or public.has_role(auth.uid(), 'admin'::app_role));
create policy "service role full access on company related entities" on public.company_related_entities for all using (auth.role() = 'service_role'::text);
create policy "members can read company related entity sources" on public.company_related_entity_sources for select to authenticated using (
  exists (select 1 from public.company_members cm where cm.company_id = company_related_entity_sources.company_id and cm.user_id = auth.uid())
  or exists (select 1 from public.companies c where c.id = company_related_entity_sources.company_id and c.created_by = auth.uid())
  or public.has_role(auth.uid(), 'admin'::app_role));
create policy "service role full access on company related entity sources" on public.company_related_entity_sources for all using (auth.role() = 'service_role'::text);
create policy "admins can read company related entity audit" on public.company_related_entity_audit for select to authenticated using (public.has_role(auth.uid(), 'admin'::app_role));
create policy "service role full access on company related entity audit" on public.company_related_entity_audit for all using (auth.role() = 'service_role'::text);
revoke all on public.company_related_entities, public.company_related_entity_sources, public.company_related_entity_audit from anon;
revoke truncate, references, trigger on public.company_related_entities, public.company_related_entity_sources, public.company_related_entity_audit from authenticated;

-- FREEZE: a frozen company (CB1) never receives a related entity either
create trigger enforce_company_freeze before insert or update or delete on public.company_related_entities for each row execute function public.enforce_company_freeze();
create trigger enforce_company_freeze before insert or update or delete on public.company_related_entity_sources for each row execute function public.enforce_company_freeze();
create trigger enforce_company_freeze before insert or update or delete on public.company_related_entity_audit for each row execute function public.enforce_company_freeze();
