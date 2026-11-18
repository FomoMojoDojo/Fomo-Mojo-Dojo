-- M-1 (2026-11-18; maps-and-markets decisions 1-3, 10): ONE NEED, SEVERAL MARKETS. A need stays one
-- odi_needs row; its membership of each market is one need_markets row. The per-market fields live on
-- the link (decision 2). Until M-4 moves their writes onto the link, the HOME link (journey_key = the
-- need's own journey_key) MIRRORS the need's legacy per-market columns, by trigger, so every reader sees
-- the same values whichever it reads.
--
-- Never deleted (decision 10): a link leaves a market by retired_at / retired_by / retired_reason. A
-- DIRECT delete of a link is refused. A legacy delete of a NEED (the Social Signals panel; two guard
-- teardowns) still cascades its links — that path predates this table and closing it is a separate
-- decision — and every such cascaded delete is recorded in need_markets_deleted_audit, so it is never
-- silent. need-markets-guard asserts all of it.

create table public.need_markets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  need_id uuid not null references public.odi_needs(id) on delete cascade,
  journey_key text not null,
  market_definition_id uuid references public.odi_market_definitions(id),
  tag_source text not null check (tag_source in ('home','generator','signal','operator','migration')),
  tagged_by text not null,
  tagged_at timestamptz not null default now(),
  -- per market (decision 2)
  importance integer,
  satisfaction integer,
  opportunity_score integer,
  service_state text,
  step_number integer,
  step_label text,
  validation_state text,
  evidence_state text,
  strategy_alignment text,
  strategy_alignment_reason text,
  canonical_statement text,
  evidence_signal_ids jsonb,
  -- leaving a market is a state change, never a delete
  retired_at timestamptz,
  retired_by text,
  retired_reason text,
  constraint need_markets_retired_signed check (retired_at is null or (retired_by is not null and retired_reason is not null)),
  constraint need_markets_one_link_per_market unique (need_id, journey_key)
);
create index need_markets_company_journey on public.need_markets (company_id, journey_key) where retired_at is null;
create index need_markets_need on public.need_markets (need_id);

create table public.need_markets_deleted_audit (
  id bigserial primary key,
  link_id uuid not null,
  need_id uuid not null,
  company_id uuid not null,
  journey_key text not null,
  deleted_at timestamptz not null default now(),
  deleted_by text,
  how text not null
);

alter table public.need_markets enable row level security;
alter table public.need_markets_deleted_audit enable row level security;
-- the same readers and writers as odi_needs
create policy "Admins can manage all need_markets" on public.need_markets for all
  using (public.has_role(auth.uid(), 'admin'::public.app_role)) with check (public.has_role(auth.uid(), 'admin'::public.app_role));
create policy "Users can view company need_markets" on public.need_markets for select using (
  exists (select 1 from public.companies c where c.id = need_markets.company_id and c.created_by = auth.uid())
  or exists (select 1 from public.company_members cm where cm.company_id = need_markets.company_id and cm.user_id = auth.uid()));
create policy "Admins can read need_markets_deleted_audit" on public.need_markets_deleted_audit for select
  using (public.has_role(auth.uid(), 'admin'::public.app_role));

create trigger enforce_company_freeze before insert or update or delete on public.need_markets
  for each row execute function public.enforce_company_freeze();

-- a DIRECT delete is refused; a delete cascaded from its need is recorded
create or replace function public.need_markets_no_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() <= 1 then
    raise exception 'need_markets: a link is never deleted — retire it (retired_at, retired_by, retired_reason)' using errcode = '42501';
  end if;
  insert into public.need_markets_deleted_audit (link_id, need_id, company_id, journey_key, deleted_by, how)
  values (old.id, old.need_id, old.company_id, old.journey_key, coalesce(auth.jwt() ->> 'email', auth.uid()::text, current_user), 'cascade from odi_needs delete');
  return old;
end;
$$;
create trigger need_markets_no_delete before delete on public.need_markets
  for each row execute function public.need_markets_no_delete();

-- tag_source: 'home' = the need's own journey_key, as whoever wrote the need set it (mirrored by trigger);
-- 'migration' = M-1's backfill; 'generator' / 'signal' / 'operator' = a further market added by that party (M-3, T-3).
-- the HOME link: created with every need, and mirroring the need's legacy per-market columns until M-4
create or replace function public.need_markets_home_link() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_md uuid;
begin
  -- a COMPANY-HELD need (holder='company', 4f-6 / F9) has no market and so no link; a need moved to
  -- company-held leaves its market by retirement, never by delete
  if new.journey_key is null then
    if tg_op = 'UPDATE' and old.journey_key is not null then
      update public.need_markets set retired_at = now(), retired_by = 'need_markets_home_link',
             retired_reason = 'the need became company-held (no market)'
       where need_id = new.id and journey_key = old.journey_key and retired_at is null;
    end if;
    return null;
  end if;
  select d.id into v_md from public.odi_market_definitions d
   where d.company_id = new.company_id and d.journey_key = new.journey_key and d.retracted_at is null
   order by d.created_at desc limit 1;
  if tg_op = 'UPDATE' and old.journey_key is not null and old.journey_key is distinct from new.journey_key then
    -- a legacy writer moved the need: its home link moves with it, unless the need is already linked there
    if exists (select 1 from public.need_markets where need_id = new.id and journey_key = new.journey_key) then
      update public.need_markets set retired_at = now(), retired_by = 'need_markets_home_link',
             retired_reason = 'the need''s journey_key moved to ' || new.journey_key
       where need_id = new.id and journey_key = old.journey_key and retired_at is null;
    else
      update public.need_markets set journey_key = new.journey_key, market_definition_id = v_md
       where need_id = new.id and journey_key = old.journey_key;
    end if;
  end if;
  insert into public.need_markets as l (company_id, need_id, journey_key, market_definition_id, tag_source, tagged_by,
         importance, satisfaction, opportunity_score, service_state, step_number, step_label, validation_state,
         evidence_state, strategy_alignment, strategy_alignment_reason, canonical_statement, evidence_signal_ids)
  values (new.company_id, new.id, new.journey_key, v_md,
          'home',
          coalesce(auth.jwt() ->> 'email', auth.uid()::text, current_user),
          new.importance, new.satisfaction, new.opportunity_score, new.service_state, new.step_number, new.step_label,
          new.validation_state, new.evidence_state, new.strategy_alignment, new.strategy_alignment_reason,
          new.odi_canonical_statement, new.evidence_baseline_signal_ids)
  on conflict (need_id, journey_key) do update set
    importance = excluded.importance, satisfaction = excluded.satisfaction, opportunity_score = excluded.opportunity_score,
    service_state = excluded.service_state, step_number = excluded.step_number, step_label = excluded.step_label,
    validation_state = excluded.validation_state, evidence_state = excluded.evidence_state,
    strategy_alignment = excluded.strategy_alignment, strategy_alignment_reason = excluded.strategy_alignment_reason,
    canonical_statement = excluded.canonical_statement, evidence_signal_ids = excluded.evidence_signal_ids,
    market_definition_id = coalesce(l.market_definition_id, excluded.market_definition_id),
    -- a legacy writer putting the need back in a market it had left re-links it (reversible, decision 10)
    retired_at = null, retired_by = null, retired_reason = null;
  return null;
end;
$$;
create trigger need_markets_home_link after insert or update of journey_key, importance, satisfaction, opportunity_score,
  service_state, step_number, step_label, validation_state, evidence_state, strategy_alignment, strategy_alignment_reason,
  odi_canonical_statement, evidence_baseline_signal_ids on public.odi_needs
  for each row execute function public.need_markets_home_link();

-- BACKFILL (a data act): one home link per existing need — active, superseded and retracted alike.
-- The frozen reference company's needs are linked under the freeze override door: the links are new
-- rows ABOUT its preserved record; no odi_needs row is written.
select set_config('app.freeze_override', 'on', true);
insert into public.need_markets (company_id, need_id, journey_key, market_definition_id, tag_source, tagged_by,
       importance, satisfaction, opportunity_score, service_state, step_number, step_label, validation_state,
       evidence_state, strategy_alignment, strategy_alignment_reason, canonical_statement, evidence_signal_ids, tagged_at)
select n.company_id, n.id, n.journey_key,
       (select d.id from public.odi_market_definitions d where d.company_id = n.company_id and d.journey_key = n.journey_key
         and d.retracted_at is null order by d.created_at desc limit 1),
       'migration', 'M-1 backfill',
       n.importance, n.satisfaction, n.opportunity_score, n.service_state, n.step_number, n.step_label, n.validation_state,
       n.evidence_state, n.strategy_alignment, n.strategy_alignment_reason, n.odi_canonical_statement,
       n.evidence_baseline_signal_ids, coalesce(n.created_at, now())
  from public.odi_needs n
 where n.journey_key is not null
on conflict (need_id, journey_key) do nothing;
select set_config('app.freeze_override', 'off', true);
