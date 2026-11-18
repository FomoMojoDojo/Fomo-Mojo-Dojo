-- V2 (2026-11-18; the Charter voice research, ruling 1): THE LEAD STORE. A forum thread the paid page fetch cannot read
-- (Reddit: the fetcher's user agent is refused; DSLReports: url_not_allowed — measured 2026-11-18) is kept only as a
-- LEAD: the search engine's own summary of the page, its URL and date, labelled "search summary, not checked against the
-- page". A lead is NOT a signal and carries no quote: no table references it, no signal is made from it, and it never
-- counts toward a verdict or toward the 3-reviews-from-2-sites bar (search-lead-guard).
-- Brand by the same rule as the review lane (the reviewed page list): r/Spectrum → Spectrum, r/CoxCommunications → Cox,
-- anything else "brand not recorded"; `forum` keeps the subreddit or forum name from the URL, uninterpreted.

create table public.search_leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  url text not null check (url ~ '^https?://'),
  title text not null default '',
  snippet text not null check (btrim(snippet) <> ''),
  published_date date,
  about_entity_id uuid references public.company_related_entities(id) on delete restrict,
  about_entity_page text,
  forum text,
  basis text not null default 'search_summary_unchecked' check (basis = 'search_summary_unchecked'),
  basis_label text not null default 'search summary, not checked against the page'
    check (basis_label = 'search summary, not checked against the page'),
  engine text not null,
  query text not null,
  found_at timestamptz not null default now(),
  retired_at timestamptz,
  retired_reason text,
  constraint search_leads_entity_shape check ((about_entity_id is null) = (about_entity_page is null)),
  constraint search_leads_one_url unique (company_id, url)
);
create index search_leads_company on public.search_leads (company_id);

create or replace function public.search_leads_entity_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.about_entity_id is not null and not exists (
       select 1 from public.company_related_entities e
        where e.id = new.about_entity_id and e.company_id = new.company_id and e.status = 'confirmed') then
    raise exception 'search_leads: about_entity_id must be a confirmed related entity of the lead''s company';
  end if;
  return new;
end;
$$;
create trigger search_leads_entity_check before insert or update of about_entity_id, company_id on public.search_leads
  for each row execute function public.search_leads_entity_check();
revoke execute on function public.search_leads_entity_check() from public, anon, authenticated;

create trigger enforce_company_freeze before insert or update or delete on public.search_leads
  for each row execute function public.enforce_company_freeze();

alter table public.search_leads enable row level security;
create policy "Admins can read search_leads" on public.search_leads for select
  using (public.has_role(auth.uid(), 'admin'::public.app_role));
revoke insert, update, delete, truncate on public.search_leads from anon, authenticated;
notify pgrst, 'reload schema';
