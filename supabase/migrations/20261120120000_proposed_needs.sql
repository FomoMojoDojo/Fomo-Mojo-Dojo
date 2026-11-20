-- ── SP-466 / SP-467 (2026-11-20): a proposed need is materialised once, and reaches the Brief only ──
--
-- SP-466: any PENDING candidate_need whose evidence meets the SP-406 bar (3 counted reviews from 2
-- sites) is materialised as an odi_needs row by a standing loader rule, because need_evidence cannot
-- hold a label without one (need_evidence_need_fk is composite on (need_id, company_id)). Accept then
-- only marks the proposal accepted: accept_candidate_proposal skips the insert when a row already
-- carries that source_proposal_id, so a second Accept creates no duplicate need.
--
-- SP-467: such a row carries status 'proposed' until a person rules on the card. The Brief reads
-- 'active' and 'proposed'; every other reader of odi_needs excludes 'proposed', so the map, the job
-- map, the drift inbox, the alignment lanes and the MOJO SCORE are untouched by a need nobody has
-- accepted. The discriminator is a status value rather than a join to the proposal, because 21 readers
-- select needs with no status filter at all and a one-term predicate is the only exclusion that can be
-- added to each of them without changing what else they return.
--
-- Transitions, each in the place that already owns it:
--   loader   → inserts status 'proposed'   (scripts/materialise-proposed-needs.ts, idempotent)
--   Accept   → 'proposed' → 'active'       (this function, below)
--   Reject   → 'proposed' → 'retracted'    (src/hooks/useCandidateQueue.ts; SP-444 keeps both rows)
--
-- 'proposed' is additive: 0 rows carry it today and 0 odi_needs rows anywhere carry source_proposal_id
-- (measured fleet-wide 2026-11-20), so no existing row changes meaning.

alter table public.odi_needs drop constraint if exists odi_needs_status_check;
alter table public.odi_needs add constraint odi_needs_status_check
  check (status = any (array['active'::text, 'proposed'::text, 'superseded'::text, 'retracted'::text]));

CREATE OR REPLACE FUNCTION public.accept_candidate_proposal(p_proposal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
    -- SP-466 (2026-11-20): materialising a proposed need is a STANDING LOADER RULE, so by the time a
    -- person clicks Accept the odi_needs row may already exist, carrying this proposal's id. Accepting
    -- must then NOT insert a second one: before this, two Accepts (or one Accept after the loader) left
    -- the company with the same desired_outcome twice, each with its own evidence and its own place in
    -- every count. The skip keys on source_proposal_id, which only the loader and this function set.
    select n.id into new_id from public.odi_needs n
     where n.source_proposal_id = p.id and n.company_id = p.company_id
     limit 1;
    if new_id is null then
    insert into public.odi_needs (company_id, user_id, tier, holder, journey_key, step_number, step_label,
      desired_outcome, importance, satisfaction, opportunity_score, service_state, source_path,
      provenance_type, validation_state, evidence_state, evidence_baseline_signal_ids,
      evidence_baseline_captured_at, evidence_voice, source_proposal_id)
    values (p.company_id, auth.uid(), 'need', 'market', jkey, 0, '',
      coalesce(item->>'desired_outcome', ''), 0, 0, 0,
      -- SP-326: NULL — a candidate's evidence sets no service_state in this slice
      null,
      -- SP-433: an OUTSIDE-VOICE card records what it actually rests on. The file branch below is
      -- byte-unchanged; only a card whose proposed_state.origin says 'outside_voice_read' takes the
      -- other arm. Neither value is on a public list: source_path 'outside_voice_read' is private by
      -- the needRestsOnPrivateSource allowlist, and provenance 'outside_review_derived' is refused by
      -- isSubjectExternallyAdmissible. source_proposal_id below keeps it private a second way.
      case when st->>'origin' = 'outside_voice_read' then 'outside_voice_read'
           else 'file_proposal:' || coalesce(p.raw_payload->>'file_proposal_id', '') end,
      case when st->>'origin' = 'outside_voice_read' then 'outside_review_derived'::public.provenance_type_enum
           else 'file_derived'::public.provenance_type_enum end,
      'unvalidated', 'thin', sig_ids, now(),
      case when st->>'origin' = 'outside_voice_read' then 'outside' else voice end,
      p.id)
    returning id into new_id;
    else
      -- Already materialised. SP-467's 'proposed' status means "reaches the Brief only"; an ACCEPTED
      -- need is an ordinary need of the map, so the one thing Accept does to the row is promote it.
      -- Nothing else is rewritten: the evidence, the voice and the source_path are the loader's.
      update public.odi_needs
         set status = 'active', updated_at = now()
       where id = new_id and company_id = p.company_id and status = 'proposed';
    end if;
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
$function$;
