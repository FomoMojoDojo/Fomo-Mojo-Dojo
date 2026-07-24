-- V2-4 — the unified open-question list: provenance (source_kind) + supersede reconcile
-- (rolled back). ONE list holds finding-derived and silent-delta-derived questions;
-- a re-run supersedes (never deletes), so history survives and both sides stay non-empty.
begin;
do $$
declare
  v_company uuid := 'd8feefb3-ce5a-43d9-bccb-f573bb95e88a';
  v_fired boolean;
  v_live int;
  v_super int;
begin
  -- finding-derived (linked): source_kind='finding', finding_identity == anchor_identity
  insert into public.first_read_open_questions
    (company_id, run_id, question_text, question_identity, finding_identity, anchor_identity, source_kind, status)
  values (v_company, '12', 'Do rural families reach them in time?', 'qid-f1', 'fid-1', 'fid-1', 'finding', 'live');

  -- silent-delta-derived: source_kind='silent_delta', finding_identity NULL, anchor = delta id
  insert into public.first_read_open_questions
    (company_id, run_id, question_text, question_identity, finding_identity, anchor_identity, source_kind, status)
  values (v_company, '12', 'Is that leadership recognized outside?', 'qid-s1', null, 'delta-1', 'silent_delta', 'live');

  -- ONE list, both provenances present
  if (select count(*) from public.first_read_open_questions where company_id=v_company and run_id='12' and status='live') <> 2 then
    raise exception 'V2-4-FAIL: expected 2 live rows across both provenances'; end if;

  -- SUPERSEDE (reconcile, never delete): a re-run drops the finding question → superseded
  update public.first_read_open_questions set status='superseded'
    where company_id=v_company and run_id='12' and question_identity='qid-f1';
  select count(*) into v_live from public.first_read_open_questions where company_id=v_company and status='live';
  select count(*) into v_super from public.first_read_open_questions where company_id=v_company and status='superseded';
  -- both sides non-empty: 1 live, 1 superseded (the row is KEPT, not deleted)
  if v_live <> 1 or v_super <> 1 then raise exception 'V2-4-FAIL supersede: expected 1 live + 1 superseded, got % live / % super', v_live, v_super; end if;

  -- REVIVE (idempotent re-run): the same identity regenerated flips back to live
  update public.first_read_open_questions set status='live' where question_identity='qid-f1';
  if (select count(*) from public.first_read_open_questions where company_id=v_company and status='live') <> 2 then
    raise exception 'V2-4-FAIL: reviving a superseded identity did not restore it to live'; end if;

  -- source_kind lock
  v_fired := false;
  begin
    insert into public.first_read_open_questions (company_id, run_id, question_text, question_identity, source_kind)
    values (v_company, '12', 'x?', 'qid-bad-kind', 'guess');
  exception when check_violation then v_fired := true; end;
  if not v_fired then raise exception 'V2-4-FAIL: an unknown source_kind was accepted'; end if;

  -- status lock
  v_fired := false;
  begin
    insert into public.first_read_open_questions (company_id, run_id, question_text, question_identity, status)
    values (v_company, '12', 'y?', 'qid-bad-status', 'archived');
  exception when check_violation then v_fired := true; end;
  if not v_fired then raise exception 'V2-4-FAIL: an unknown status was accepted'; end if;

  -- duplicate (company, run, question_identity) still refused
  v_fired := false;
  begin
    insert into public.first_read_open_questions (company_id, run_id, question_text, question_identity)
    values (v_company, '12', 'dup', 'qid-f1');
  exception when unique_violation then v_fired := true; end;
  if not v_fired then raise exception 'V2-4-FAIL: duplicate question_identity per (company,run) accepted'; end if;

  raise notice 'V2-4 PASS — one list w/ provenance; supersede keeps history (both sides non-empty); revive idempotent; locks hold';
end $$;
rollback;
