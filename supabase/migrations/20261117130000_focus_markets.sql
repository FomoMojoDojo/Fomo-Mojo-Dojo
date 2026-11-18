-- F-1 (2026-11-17, Proposal A, decisions 1/3/6): A COMPANY'S FOCUS MARKETS — the client's customer,
-- named and signed by the operator. Stored in operator_primary_selection (decision 1 = A2) as an
-- ORDERED SET (decision 3: one or more), one row per RANK: domain 'focus_market_01', 'focus_market_02', …
-- (item_id = the odi_market_definitions id, item_key = its journey_key). The table's UNIQUE
-- (company_id, domain) is kept: four writers upsert on exactly that key, so the rank lives in the domain.
--
-- One write path: public.sign_focus_markets(company, ordered market ids) — admin only, SECURITY
-- INVOKER (RLS still applies), atomic, every id a LIVE market of THAT company, an audit row per change
-- in operator_primary_selection_audit. An empty list unsigns. Nothing else writes these domains, and
-- nothing writes them automatically (focus-market-guard).
--
-- public.focus_market_options(company) lists EVERY live market of the company (decision 3: every live
-- market is offered), with the evidence the system ranks it by and its signed rank, if any.
-- The evidence is needs + job steps + outcomes. Interview segments are NOT counted: they are parser-internal
-- (the 4f-2 census wall; ruling 2026-11-17, option B), so no focus code reads them.

alter table public.operator_primary_selection drop constraint operator_primary_selection_domain_check;
alter table public.operator_primary_selection add constraint operator_primary_selection_domain_check
  check (domain = any (array['finding'::text, 'job_step_set'::text]) or domain ~ '^focus_market_[0-9]{2}$');

alter table public.operator_primary_selection drop constraint operator_primary_selection_key_per_domain;
alter table public.operator_primary_selection add constraint operator_primary_selection_key_per_domain
  check (((domain <> 'finding'::text) or (item_id is not null))
     and ((domain <> 'job_step_set'::text) or (item_key is not null))
     and ((domain !~ '^focus_market_') or (item_id is not null and item_key is not null)));

create or replace function public.focus_market_options(p_company_id uuid)
returns table (
  market_definition_id uuid, journey_key text, job_executor text, jtbd text, relationship_kind text,
  market_register text, validation_state text,
  needs integer, job_steps integer, outcomes integer, evidence integer,
  signed_rank integer
)
language sql stable security invoker set search_path = public
as $$
  with m as (
    select d.id, d.journey_key, d.job_executor, d.jtbd, d.relationship_kind, d.market_register, d.validation_state
      from public.odi_market_definitions d
     where d.company_id = p_company_id and d.retracted_at is null
  ), c as (
    select m.*,
      (select count(*)::int from public.odi_needs n where n.company_id = p_company_id and n.journey_key = m.journey_key and n.status = 'active') as needs,
      (select count(*)::int from public.job_steps s where s.company_id = p_company_id and s.journey_key = m.journey_key) as job_steps,
      ((select count(*)::int from public.managed_outcomes o where o.company_id = p_company_id and o.journey_key = m.journey_key)
       + (select count(*)::int from public.market_candidate_outcomes o where o.company_id = p_company_id and o.journey_key = m.journey_key)) as outcomes,
      (select substring(s.domain from 14)::int from public.operator_primary_selection s
        where s.company_id = p_company_id and s.domain ~ '^focus_market_[0-9]{2}$' and s.item_id = m.id limit 1) as signed_rank
    from m
  )
  select id, journey_key, job_executor, jtbd, relationship_kind, market_register, validation_state,
         needs, job_steps, outcomes, needs + job_steps + outcomes,
         signed_rank
    from c
   order by signed_rank nulls last, needs + job_steps + outcomes desc, journey_key;
$$;

create or replace function public.sign_focus_markets(p_company_id uuid, p_market_ids uuid[])
returns jsonb
language plpgsql security invoker set search_path = public
as $$
declare
  v_n int := coalesce(array_length(p_market_ids, 1), 0);
  v_actor text := coalesce(auth.jwt() ->> 'email', auth.uid()::text);
  v_old record;
  v_rank int;
  v_key text;
  v_dom text;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'focus markets: admin only' using errcode = '42501';
  end if;
  if v_n > 20 then raise exception 'focus markets: at most 20 can be signed'; end if;
  if v_n <> (select count(distinct x) from unnest(coalesce(p_market_ids, '{}'::uuid[])) x) then
    raise exception 'focus markets: a market appears more than once';
  end if;
  if exists (select 1 from unnest(coalesce(p_market_ids, '{}'::uuid[])) x
              where not exists (select 1 from public.odi_market_definitions d
                                 where d.id = x and d.company_id = p_company_id and d.retracted_at is null)) then
    raise exception 'focus markets: every market must be a live market of this company';
  end if;

  -- ranks that change or fall away are cleared, each with its audit row
  for v_old in select s.domain, s.item_id, s.item_key from public.operator_primary_selection s
                where s.company_id = p_company_id and s.domain ~ '^focus_market_[0-9]{2}$' loop
    v_rank := substring(v_old.domain from 14)::int;
    if v_rank > v_n or p_market_ids[v_rank] is distinct from v_old.item_id then
      delete from public.operator_primary_selection where company_id = p_company_id and domain = v_old.domain;
      insert into public.operator_primary_selection_audit (company_id, domain, item_key, action, actor, reason)
      values (p_company_id, v_old.domain, v_old.item_key, 'cleared_operator', v_actor, 'market:' || v_old.item_id);
    end if;
  end loop;

  for v_rank in 1 .. v_n loop
    v_dom := 'focus_market_' || lpad(v_rank::text, 2, '0');
    if not exists (select 1 from public.operator_primary_selection s
                    where s.company_id = p_company_id and s.domain = v_dom and s.item_id = p_market_ids[v_rank]) then
      select d.journey_key into v_key from public.odi_market_definitions d where d.id = p_market_ids[v_rank];
      insert into public.operator_primary_selection (company_id, domain, item_id, item_key, chosen_by, chosen_at)
      values (p_company_id, v_dom, p_market_ids[v_rank], v_key, v_actor, now());
      insert into public.operator_primary_selection_audit (company_id, domain, item_key, action, actor, reason)
      values (p_company_id, v_dom, v_key, 'set', v_actor, 'market:' || p_market_ids[v_rank]);
    end if;
  end loop;

  return coalesce((select jsonb_agg(jsonb_build_object('rank', substring(s.domain from 14)::int,
                    'market_definition_id', s.item_id, 'journey_key', s.item_key,
                    'chosen_by', s.chosen_by, 'chosen_at', s.chosen_at) order by s.domain)
                     from public.operator_primary_selection s
                    where s.company_id = p_company_id and s.domain ~ '^focus_market_[0-9]{2}$'), '[]'::jsonb);
end;
$$;

revoke execute on function public.sign_focus_markets(uuid, uuid[]) from public, anon;
grant execute on function public.sign_focus_markets(uuid, uuid[]) to authenticated;
revoke execute on function public.focus_market_options(uuid) from public, anon;
grant execute on function public.focus_market_options(uuid) to authenticated;
