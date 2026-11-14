-- BRIEF-17 commit 2 — Option A: a file analysis's candidates reach the operator review queue
-- (SP-324..SP-327). Nothing here applies anything to the map: a candidate becomes a map row only
-- through accept_candidate_proposal(), which an admin calls on one queue row at a time (SP-327).

-- ── provenance for rows drawn from an uploaded file (SP-326) ──────────────────────────────────
-- Not external-admissible: _shared/externalProvenance.ts admits by allowlist, so an unknown value
-- is withheld from every outside call (fail-closed, SP-323).
alter type public.provenance_type_enum add value if not exists 'file_derived';

-- ── the queue: five candidate surface types, current_state NULL for an addition (SP-324) ────────
-- Prefixed `candidate_` so the four existing readers (route / opportunity / positioning / cascade,
-- each filtering on its own surface_type) never see a row shaped differently from theirs.
alter table public.surface_proposals drop constraint surface_proposals_surface_type_check;
alter table public.surface_proposals add constraint surface_proposals_surface_type_check
  check (surface_type = any (array['positioning','cascade','route','opportunity',
    'candidate_need','candidate_job_step','candidate_outcome','candidate_route','candidate_positioning']));
alter table public.surface_proposals alter column current_state drop not null;
alter table public.surface_proposals add constraint surface_proposals_current_state_null_only_for_candidates
  check (current_state is not null or surface_type like 'candidate\_%');
-- one queue row per (analysis, list, item): a second write of the same analysis is a no-op
create unique index if not exists surface_proposals_candidate_item_key
  on public.surface_proposals ((raw_payload->>'file_proposal_id'), (raw_payload->>'candidate_list'), (raw_payload->>'candidate_index'))
  where surface_type like 'candidate\_%';

-- ── the voice of a row's evidence (SP-321) and the queue row it came from ────────────────────
-- company = the company says; outside = independent voices about it; mixed = both; unlabeled =
-- evidence whose voice was never established. A company-voice row never corroborates itself.
alter table public.odi_needs
  add column if not exists evidence_voice text check (evidence_voice in ('company','outside','mixed','unlabeled')),
  add column if not exists source_proposal_id uuid references public.surface_proposals(id) on delete restrict;
-- SP-326: a need drawn from company voice gets NO service_state from that evidence alone.
-- Readers already treat a missing state as "no state" (String(x ?? "") / === comparisons).
alter table public.odi_needs alter column service_state drop not null;

alter table public.job_steps drop constraint check_job_steps_provenance_type;
alter table public.job_steps add constraint check_job_steps_provenance_type
  check (provenance_type is null or provenance_type = any (array['public_baseline','internal_derived','operator_authored','file_derived']));
alter table public.job_steps
  add column if not exists evidence_signal_ids jsonb,
  add column if not exists evidence_voice text check (evidence_voice in ('company','outside','mixed','unlabeled')),
  add column if not exists source_proposal_id uuid references public.surface_proposals(id) on delete restrict;

alter table public.desired_outcomes
  add column if not exists provenance_type text check (provenance_type is null or provenance_type = 'file_derived'),
  add column if not exists evidence_signal_ids jsonb,
  add column if not exists evidence_voice text check (evidence_voice in ('company','outside','mixed','unlabeled')),
  add column if not exists source_proposal_id uuid references public.surface_proposals(id) on delete restrict;

-- ── accept: the ONE path from a candidate queue row to a map row (SP-326, SP-327) ─────────────
-- SECURITY INVOKER: it runs under the caller's own RLS (admins manage all three tables), so it
-- grants nothing a caller does not already hold. The admin check is explicit as well, so a member
-- who can insert job steps under RLS still cannot accept a candidate.
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

  -- the company's journey, when it has exactly one; otherwise the column default
  select case when count(distinct journey_key) = 1 then min(journey_key) end into jkey
    from public.job_steps where company_id = p.company_id;
  jkey := coalesce(jkey, 'customer');

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

-- desired_outcomes carried only an owner/member policy, so an admin accepting a candidate outcome
-- on a company it neither created nor belongs to was refused. Same rule the other two tables have.
create policy "Admins can manage all desired_outcomes" on public.desired_outcomes
  for all using (public.has_role(auth.uid(), 'admin'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role));
