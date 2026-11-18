-- V1 (2026-11-18, the Charter voice research plan, decisions 1, 3, 7): THE REVIEW-HOST LANE's storage.
--
-- review_lane_calls — one row per paid web_search call the lane made: the target it was aimed at, the call's ledgered usd,
-- the raw response VERBATIM (so every minted row can be traced to, and rebuilt from, what the tool returned — no second
-- call), and the outcome (rows built, dropped and why). Written by the lane (service role) only; admins read it.
--
-- signals.about_entity_id — WHICH confirmed related entity (Charter's Spectrum brand / Cox) a review is about, as a STORED
-- FACT from the page the citation came from: the reviewed page list in supabase/functions/_shared/reviewPages.ts. Never
-- from the quote's text, never from a model. NULL = "brand not recorded". It is not subject_id (PROPOSAL-v3's subject axis):
-- the client's own brand fits none of that table's roles. about_entity_page names the list entry that matched.

create table public.review_lane_calls (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  target_key text not null check (btrim(target_key) <> ''),
  host text not null check (btrim(host) <> ''),
  model text not null,
  usd numeric,
  response jsonb not null,
  outcome jsonb not null default '{}'::jsonb,
  minted_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index review_lane_calls_company on public.review_lane_calls (company_id, created_at);

alter table public.signals
  add column about_entity_id uuid references public.company_related_entities(id) on delete restrict,
  add column about_entity_basis text,
  add column about_entity_page text,
  add column review_lane_call_id uuid references public.review_lane_calls(id) on delete restrict;
alter table public.signals add constraint signals_about_entity_basis_check
  check (about_entity_basis is null or about_entity_basis = 'review_page');
alter table public.signals add constraint signals_about_entity_shape
  check ((about_entity_id is null and about_entity_basis is null and about_entity_page is null)
      or (about_entity_id is not null and about_entity_basis is not null and btrim(coalesce(about_entity_page, '')) <> ''));
create index signals_about_entity on public.signals (about_entity_id) where about_entity_id is not null;
create index signals_review_lane_call on public.signals (review_lane_call_id) where review_lane_call_id is not null;

-- the entity must be a CONFIRMED related entity of the signal's own company
create or replace function public.signals_about_entity_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.about_entity_id is not null and not exists (
       select 1 from public.company_related_entities e
        where e.id = new.about_entity_id and e.company_id = new.company_id and e.status = 'confirmed') then
    raise exception 'signals: about_entity_id must be a confirmed related entity of the signal''s company';
  end if;
  if new.review_lane_call_id is not null and not exists (
       select 1 from public.review_lane_calls c where c.id = new.review_lane_call_id and c.company_id = new.company_id) then
    raise exception 'signals: review_lane_call_id must be a call of the signal''s company';
  end if;
  return new;
end;
$$;
create trigger signals_about_entity_check before insert or update of about_entity_id, review_lane_call_id, company_id on public.signals
  for each row execute function public.signals_about_entity_check();
revoke execute on function public.signals_about_entity_check() from public, anon, authenticated;

create trigger enforce_company_freeze before insert or update or delete on public.review_lane_calls
  for each row execute function public.enforce_company_freeze();

alter table public.review_lane_calls enable row level security;
create policy "Admins can read review_lane_calls" on public.review_lane_calls for select
  using (public.has_role(auth.uid(), 'admin'::public.app_role));
revoke insert, update, delete, truncate on public.review_lane_calls from anon, authenticated;
notify pgrst, 'reload schema';
