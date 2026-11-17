-- BRIEF-17 commit 3 — Option B: reconcile-map-evidence's output goes ONLY to the review queue
-- (SP-336). Four surface types, one per kind of EXISTING map row it judges. Each row carries the
-- existing row as current_state (never NULL — these are changes to rows that exist) and, in
-- proposed_state, the verdict per voice with the signals it rests on, the proposed service_state for a
-- need (outside voice only, SP-335) and the disputed field where there is one. Nothing here applies
-- anything to the map (SP-327); there is no accept for these types in this slice.
alter table public.surface_proposals drop constraint surface_proposals_surface_type_check;
alter table public.surface_proposals add constraint surface_proposals_surface_type_check
  check (surface_type = any (array['positioning','cascade','route','opportunity',
    'candidate_need','candidate_job_step','candidate_outcome','candidate_route','candidate_positioning',
    'evidence_need','evidence_job_step','evidence_route','evidence_positioning']));
