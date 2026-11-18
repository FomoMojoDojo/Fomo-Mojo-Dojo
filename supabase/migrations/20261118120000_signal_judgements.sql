-- T-1 (2026-11-18; maps-and-markets T-1, party design note "one small signal-judgement pattern"):
-- THE SHARED SIGNAL-JUDGEMENT PATTERN, and its first two judgements — STANCE and MARKETS.
--
-- The pattern, for any judgement made about one signal by a local judge, one item at a time:
--   • the value is stored WITH the version that made it (judge + model + prompt md5) and when — a value
--     without a version is refused by constraint;
--   • a failed or unparseable judgement leaves the value NULL (never guessed);
--   • the operator's word is a row in signal_judgement_overrides, with an actor (refused without one);
--     the model's value is kept beside it, as doc_voice_verdicts does;
--   • a re-judgement happens on request only and never silently re-interprets an old row;
--   • nothing is deleted: a market tag leaves by retired_at.
--
-- STANCE is single-valued, so it is four columns on signals. MARKETS are many per signal, so they are rows
-- in signal_market_tags: each names ONE listed market of the company, or an UNLISTED group by a short name
-- (a proposed new market) — never both. Tagging does not depend on the focus: a tag names a market, and a
-- signed focus is a priority read elsewhere, never an input here.

alter table public.signals
  add column stance text check (stance in ('customer_voice','company_toward_customer','company','unclear')),
  add column stance_reason text,
  add column stance_version text,
  add column stance_judged_at timestamptz,
  add constraint signals_stance_versioned check (stance is null or (stance_version is not null and stance_judged_at is not null));

create table public.signal_market_tags (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  signal_id uuid not null references public.signals(id) on delete cascade,
  market_definition_id uuid references public.odi_market_definitions(id),
  journey_key text,
  unlisted_group text,
  tag_source text not null check (tag_source in ('model','operator')),
  version text not null check (version <> ''),
  reason text,
  tagged_by text not null,
  tagged_at timestamptz not null default now(),
  retired_at timestamptz,
  retired_by text,
  retired_reason text,
  constraint signal_market_tags_one_target check ((market_definition_id is not null) <> (nullif(btrim(unlisted_group), '') is not null)),
  constraint signal_market_tags_journey_with_market check ((market_definition_id is null) = (journey_key is null)),
  constraint signal_market_tags_retired_signed check (retired_at is null or (retired_by is not null and retired_reason is not null))
);
create unique index signal_market_tags_one_live_market on public.signal_market_tags (signal_id, market_definition_id)
  where retired_at is null and market_definition_id is not null;
create unique index signal_market_tags_one_live_group on public.signal_market_tags (signal_id, lower(btrim(unlisted_group)))
  where retired_at is null and unlisted_group is not null;
create index signal_market_tags_company on public.signal_market_tags (company_id) where retired_at is null;

create table public.signal_judgement_overrides (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  signal_id uuid not null references public.signals(id) on delete cascade,
  judgement text not null check (judgement in ('stance','markets')),
  value jsonb not null,
  actor text not null check (btrim(actor) <> ''),
  reason text,
  created_at timestamptz not null default now(),
  superseded_at timestamptz
);
create index signal_judgement_overrides_signal on public.signal_judgement_overrides (signal_id, judgement) where superseded_at is null;

create table public.signal_market_tags_deleted_audit (
  id bigserial primary key,
  tag_id uuid not null,
  signal_id uuid not null,
  company_id uuid not null,
  market_definition_id uuid,
  unlisted_group text,
  deleted_at timestamptz not null default now(),
  deleted_by text,
  how text not null
);

-- a tag belongs to its signal's company, and a listed market to that same company
create or replace function public.signal_market_tags_same_company() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.signals s where s.id = new.signal_id and s.company_id = new.company_id) then
    raise exception 'signal_market_tags: the tag''s company must be its signal''s';
  end if;
  if new.market_definition_id is not null and not exists (
       select 1 from public.odi_market_definitions d where d.id = new.market_definition_id and d.company_id = new.company_id
         and d.journey_key = new.journey_key) then
    raise exception 'signal_market_tags: the market must be a market of the signal''s company, with its journey_key';
  end if;
  return new;
end;
$$;
create trigger signal_market_tags_same_company before insert or update on public.signal_market_tags
  for each row execute function public.signal_market_tags_same_company();

-- never deleted directly; a delete cascaded from the signal (public-baseline's replace, guard teardowns) is recorded
create or replace function public.signal_market_tags_no_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() <= 1 then
    raise exception 'signal_market_tags: a tag is never deleted — retire it (retired_at, retired_by, retired_reason)' using errcode = '42501';
  end if;
  insert into public.signal_market_tags_deleted_audit (tag_id, signal_id, company_id, market_definition_id, unlisted_group, deleted_by, how)
  values (old.id, old.signal_id, old.company_id, old.market_definition_id, old.unlisted_group,
          coalesce(auth.jwt() ->> 'email', auth.uid()::text, current_user), 'cascade from signals delete');
  return old;
end;
$$;
create trigger signal_market_tags_no_delete before delete on public.signal_market_tags
  for each row execute function public.signal_market_tags_no_delete();

create trigger enforce_company_freeze before insert or update or delete on public.signal_market_tags
  for each row execute function public.enforce_company_freeze();
create trigger enforce_company_freeze before insert or update or delete on public.signal_judgement_overrides
  for each row execute function public.enforce_company_freeze();

alter table public.signal_market_tags enable row level security;
alter table public.signal_judgement_overrides enable row level security;
alter table public.signal_market_tags_deleted_audit enable row level security;
create policy "Admins can manage all signal_market_tags" on public.signal_market_tags for all
  using (public.has_role(auth.uid(), 'admin'::public.app_role)) with check (public.has_role(auth.uid(), 'admin'::public.app_role));
create policy "Users can view tags of a visible signal" on public.signal_market_tags for select
  using (exists (select 1 from public.signals s where s.id = signal_market_tags.signal_id));
create policy "Admins can manage signal_judgement_overrides" on public.signal_judgement_overrides for all
  using (public.has_role(auth.uid(), 'admin'::public.app_role)) with check (public.has_role(auth.uid(), 'admin'::public.app_role));
create policy "Admins can read signal_market_tags_deleted_audit" on public.signal_market_tags_deleted_audit for select
  using (public.has_role(auth.uid(), 'admin'::public.app_role));
notify pgrst, 'reload schema';
