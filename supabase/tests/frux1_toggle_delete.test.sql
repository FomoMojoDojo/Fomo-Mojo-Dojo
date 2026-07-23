-- FR-UX-1 DB proof (rolled back — zero residue): toggle-off DELETES a response row
-- on an OPEN session (the only trigger on first_read_responses is the freeze; there
-- is NO delete-audit trigger, so the delete is clean), and the freeze REFUSES the
-- delete once the proposal is issued.
--
-- Run: docker exec -i <db> psql -U postgres -X -v ON_ERROR_STOP=1 -f this.sql
begin;
do $$
declare
  v_company uuid := 'd8feefb3-ce5a-43d9-bccb-f573bb95e88a';
  v_session uuid;
  v_id text := 'frux1-toggle-id';
  v_cnt bigint;
  v_fired boolean;
begin
  insert into public.first_read_sessions (company_id, status) values (v_company, 'open')
    returning id into v_session;
  insert into public.first_read_responses
    (session_id, company_id, item_kind, item_ref, item_identity, item_text, verdict)
  values (v_session, v_company, 'finding', null, v_id, 'toggle fixture', 'confirmed');

  -- OPEN: the delete succeeds; the row is gone
  delete from public.first_read_responses where session_id = v_session and item_identity = v_id;
  select count(*) into v_cnt from public.first_read_responses where session_id = v_session and item_identity = v_id;
  if v_cnt <> 0 then raise exception 'FRUX1-FAIL open-delete: row survived (count=%)', v_cnt; end if;

  -- re-add, issue the proposal → verdicts freeze
  insert into public.first_read_responses
    (session_id, company_id, item_kind, item_ref, item_identity, item_text, verdict)
  values (v_session, v_company, 'finding', null, v_id, 'toggle fixture', 'confirmed');
  update public.first_read_sessions set status = 'proposal_issued' where id = v_session;

  -- ISSUED: the freeze REFUSES the delete (toggle-off is locked out)
  v_fired := false;
  begin
    delete from public.first_read_responses where session_id = v_session and item_identity = v_id;
  exception when others then
    if sqlerrm ilike '%frozen%' then v_fired := true; else raise; end if;
  end;
  if not v_fired then raise exception 'FRUX1-FAIL frozen-delete: post-issuance delete was NOT refused'; end if;
  select count(*) into v_cnt from public.first_read_responses where session_id = v_session and item_identity = v_id;
  if v_cnt <> 1 then raise exception 'FRUX1-FAIL frozen-delete: row was removed despite freeze (count=%)', v_cnt; end if;

  raise notice 'FRUX1 PASS — open session toggle-off deletes the row (no audit trigger); issued session refuses the delete';
end $$;
rollback;
