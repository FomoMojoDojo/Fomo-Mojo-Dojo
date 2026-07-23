-- FR-FLOW-2a — first_read_open_questions shape (rolled back). A linked row and a
-- linkless row both persist; a duplicate (company, run, question_identity) is refused.
begin;
do $$
declare
  v_company uuid := 'd8feefb3-ce5a-43d9-bccb-f573bb95e88a';
  v_fired boolean;
begin
  -- linked row
  insert into public.first_read_open_questions (company_id, run_id, question_text, question_identity, finding_identity)
  values (v_company, '34', 'Do they serve rural markets?', 'qid-1', 'fid-1');
  -- linkless row (finding_identity NULL — honest absence)
  insert into public.first_read_open_questions (company_id, run_id, question_text, question_identity, finding_identity)
  values (v_company, '34', 'What is their churn?', 'qid-2', null);
  if (select count(*) from public.first_read_open_questions where company_id=v_company and run_id='34') <> 2 then
    raise exception 'FF2A-FAIL: expected 2 rows'; end if;

  -- duplicate (company, run, question_identity) → refused
  v_fired := false;
  begin
    insert into public.first_read_open_questions (company_id, run_id, question_text, question_identity)
    values (v_company, '34', 'Do they serve rural markets? (dup)', 'qid-1');
  exception when unique_violation then v_fired := true;
  end;
  if not v_fired then raise exception 'FF2A-FAIL: duplicate question_identity per (company,run) was accepted'; end if;

  raise notice 'FF2A PASS — linked + linkless rows persist; duplicate (company,run,question_identity) refused';
end $$;
rollback;
