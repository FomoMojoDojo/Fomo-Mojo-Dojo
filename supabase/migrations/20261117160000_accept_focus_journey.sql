-- F-4 (2026-11-17, Proposal A decision 3): accept_candidate_proposal lands a focus card in ITS focus
-- market's journey (proposed_state.journey_key, written by the candidate queue from the card's
-- focus_index), and refuses a card whose journey is no longer a live market of the company. The function
-- is otherwise byte-identical to 20261114010000_candidate_review_queue.sql.
create or replace function public.accept_candidate_proposal(p_proposal_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  p          public.surface_proposals%rowtype;
  st         jsonb;
  item       jsonb;
  sig_ids    jsonb;
  voice      text;
  jkey       text;
  jtitle     text;
  jsub       text;
  next_step  integer;
  new_id     uuid;
begin
  if not public.has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'accept_candidate_proposal: admin only' using errcode = '42501';
  end if;
  select * into p from public.surface_proposals where id = p_proposal_id for update;
  if not found then raise exception 'accept_candidate_proposal: no such proposal %', p_proposal_id; end if;
  if p.status <> 'pending' then raise exception 'accept_candidate_proposal: proposal % is %, not pending', p_proposal_id, p.status; end if;
  if p.surface_type not in ('candidate_need','candidate_job_step','candidate_outcome') then
    raise exception 'accept_candidate_proposal: % has no insert-type accept (need, job step and outcome only)', p.surface_type;
  end if;

  st      := p.proposed_state;
  item    := coalesce(st->'item', '{}'::jsonb);
  sig_ids := coalesce(st->'evidence_signal_ids', '[]'::jsonb);
  voice   := coalesce(st->>'evidence_voice', 'unlabeled');

  -- F-4 (2026-11-17): a card from a FOCUSED run carries its focus market's journey. It is used while that
  -- journey is still a live market of this company; a card naming one that is not is REFUSED, never
  -- guessed into another journey. Any other card keeps the rule that stood before: the company's journey
  -- when it has exactly one, otherwise the column default.
  if nullif(st->>'journey_key', '') is not null then
    if not exists (select 1 from public.odi_market_definitions d
                    where d.company_id = p.company_id and d.journey_key = st->>'journey_key' and d.retracted_at is null) then
      raise exception 'accept_candidate_proposal: the card''s focus market (%) is no longer a live market of this company', st->>'journey_key';
    end if;
    jkey := st->>'journey_key';
  else
    select case when count(distinct journey_key) = 1 then min(journey_key) end into jkey
      from public.job_steps where company_id = p.company_id;
    jkey := coalesce(jkey, 'customer');
  end if;

  if p.surface_type = 'candidate_need' then
    insert into public.odi_needs (company_id, user_id, tier, holder, journey_key, step_number, step_label,
      desired_outcome, importance, satisfaction, opportunity_score, service_state, source_path,
      provenance_type, validation_state, evidence_state, evidence_baseline_signal_ids,
      evidence_baseline_captured_at, evidence_voice, source_proposal_id)
    values (p.company_id, auth.uid(), 'need', 'market', jkey, 0, '',
      coalesce(item->>'desired_outcome', ''), 0, 0, 0,
      -- SP-326: NULL — a candidate's evidence sets no service_state in this slice
      null, 'file_proposal:' || coalesce(p.raw_payload->>'file_proposal_id', ''),
      'file_derived', 'unvalidated', 'thin', sig_ids, now(), voice, p.id)
    returning id into new_id;
  elsif p.surface_type = 'candidate_job_step' then
    select coalesce(max(step_number), 0) + 1, min(journey_title), min(journey_subtitle)
      into next_step, jtitle, jsub
      from public.job_steps where company_id = p.company_id and journey_key = jkey;
    insert into public.job_steps (company_id, user_id, journey_key, journey_title, journey_subtitle,
      step_number, step_label, description, evidence_status, evidence_basis, provenance_type,
      validation_state, evidence_state, evidence_signal_ids, evidence_voice, source_proposal_id)
    values (p.company_id, auth.uid(), jkey, coalesce(jtitle, ''), coalesce(jsub, ''),
      next_step, coalesce(item->>'step_label', ''), coalesce(item->>'step_description', ''),
      'unclear', '', 'file_derived', 'unvalidated', 'thin', sig_ids, voice, p.id)
    returning id into new_id;
  else
    insert into public.desired_outcomes (company_id, statement, provenance_type, evidence_signal_ids,
      evidence_voice, source_proposal_id)
    values (p.company_id, coalesce(item->>'outcome', ''), 'file_derived', sig_ids, voice, p.id)
    returning id into new_id;
  end if;

  update public.surface_proposals
     set status = 'accepted', reviewed_by = auth.uid(), reviewed_at = now(),
         surface_id = new_id,
         raw_payload = coalesce(raw_payload, '{}'::jsonb) || jsonb_build_object('accepted_row_id', new_id)
   where id = p.id;
  return jsonb_build_object('ok', true, 'proposal_id', p.id, 'surface_type', p.surface_type, 'row_id', new_id);
end;
$$;
revoke execute on function public.accept_candidate_proposal(uuid) from public, anon;
grant execute on function public.accept_candidate_proposal(uuid) to authenticated;
