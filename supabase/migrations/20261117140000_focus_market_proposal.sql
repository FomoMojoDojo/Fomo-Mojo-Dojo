-- F-2 (2026-11-17, Proposal A decision 6): THE SYSTEM PROPOSES, THE OPERATOR SIGNS. A focus-market
-- proposal is one surface_proposals row (surface_type 'focus_market') ranking EVERY live market of the
-- company by the evidence focus_market_options counts — needs, job steps and outcomes.
-- Deterministic, no model, nothing signed by it: it is written only when an admin asks
-- (public.propose_focus_markets), a newer proposal supersedes an older PENDING one, and the signature
-- (public.sign_focus_markets) closes the pending proposal — 'accepted' with the set as signed and
-- whether the operator changed the system's order.

alter table public.surface_proposals drop constraint surface_proposals_surface_type_check;
alter table public.surface_proposals add constraint surface_proposals_surface_type_check
  check (surface_type = any (array['positioning','cascade','route','opportunity',
    'candidate_need','candidate_job_step','candidate_outcome','candidate_route','candidate_positioning',
    'evidence_need','evidence_job_step','evidence_route','evidence_positioning','focus_market']));

create or replace function public.propose_focus_markets(p_company_id uuid)
returns jsonb
language plpgsql security invoker set search_path = public
as $$
declare
  v_ranking jsonb;
  v_total int;
  v_current jsonb;
  v_id uuid;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'focus markets: admin only' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'market_definition_id', o.market_definition_id, 'journey_key', o.journey_key, 'job_executor', o.job_executor,
           'relationship_kind', o.relationship_kind, 'evidence', o.evidence, 'needs', o.needs, 'job_steps', o.job_steps,
           'outcomes', o.outcomes)
           order by o.evidence desc, o.journey_key), '[]'::jsonb),
         coalesce(sum(o.evidence), 0)::int
    into v_ranking, v_total
    from public.focus_market_options(p_company_id) o;
  select coalesce(jsonb_agg(jsonb_build_object('rank', substring(s.domain from 14)::int, 'market_definition_id', s.item_id, 'journey_key', s.item_key) order by s.domain), '[]'::jsonb)
    into v_current
    from public.operator_primary_selection s where s.company_id = p_company_id and s.domain ~ '^focus_market_[0-9]{2}$';

  update public.surface_proposals set status = 'superseded', reviewed_at = now(), reviewed_by = auth.uid()
   where company_id = p_company_id and surface_type = 'focus_market' and status = 'pending';

  insert into public.surface_proposals (company_id, surface_type, surface_id, current_state, proposed_state, status, reason, created_by, raw_payload)
  values (p_company_id, 'focus_market', null, v_current,
          jsonb_build_object('ranking', v_ranking, 'evidence_total', v_total),
          'pending', 'focus_market: ranked by evidence (needs, job steps, outcomes)', auth.uid(),
          jsonb_build_object('proposed_by', 'propose_focus_markets', 'basis', 'focus_market_options v1', 'model', null))
  returning id into v_id;
  return jsonb_build_object('proposal_id', v_id, 'ranking', v_ranking, 'evidence_total', v_total);
end;
$$;

-- sign_focus_markets, unchanged from F-1 except its last step: a PENDING focus_market proposal is
-- closed by the signature ('accepted', with the set as signed and whether the order was changed).
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
  v_set jsonb;
  v_prop record;
  v_proposed uuid[];
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

  v_set := coalesce((select jsonb_agg(jsonb_build_object('rank', substring(s.domain from 14)::int,
                    'market_definition_id', s.item_id, 'journey_key', s.item_key,
                    'chosen_by', s.chosen_by, 'chosen_at', s.chosen_at) order by s.domain)
                     from public.operator_primary_selection s
                    where s.company_id = p_company_id and s.domain ~ '^focus_market_[0-9]{2}$'), '[]'::jsonb);

  -- F-2: the signature closes the pending proposal
  for v_prop in select id, proposed_state from public.surface_proposals
                 where company_id = p_company_id and surface_type = 'focus_market' and status = 'pending' loop
    select array_agg((e->>'market_definition_id')::uuid order by ord) into v_proposed
      from jsonb_array_elements(v_prop.proposed_state->'ranking') with ordinality as t(e, ord);
    update public.surface_proposals
       set status = 'accepted', reviewed_at = now(), reviewed_by = auth.uid(),
           raw_payload = raw_payload || jsonb_build_object('signed_as', v_set,
             'order_changed', coalesce(v_proposed[1:v_n], '{}'::uuid[]) is distinct from coalesce(p_market_ids, '{}'::uuid[]))
     where id = v_prop.id;
  end loop;
  return v_set;
end;
$$;

revoke execute on function public.propose_focus_markets(uuid) from public, anon;
grant execute on function public.propose_focus_markets(uuid) to authenticated;
