-- OC-2c DB-side proof (rolled back — zero residue): a verdict CHANGES IN PLACE
-- (one row) while the session is open, and is REFUSED once the proposal is issued
-- (the existing freeze trigger governs — the UI's locked state is honest, not a
-- silent no-op). The client mechanics are covered in oc2c.test.tsx; this owns the
-- DB guarantees those mechanics rely on.
--
-- Run: docker exec -i <db> psql -U postgres -X -v ON_ERROR_STOP=1 -f this.sql
begin;
do $$
declare
  v_company uuid := 'd8feefb3-ce5a-43d9-bccb-f573bb95e88a';
  v_session uuid;
  v_id text := 'oc2c-freeze-id';
  v_verdict text;
  v_rows bigint;
  v_fired boolean;
begin
  insert into public.first_read_sessions (company_id, status) values (v_company, 'open')
    returning id into v_session;
  insert into public.first_read_responses
    (session_id, company_id, item_kind, item_ref, item_identity, item_text, verdict)
  values (v_session, v_company, 'finding', null, v_id, 'freeze fixture', 'rejected');

  -- A→B REPLACE while open: update the verdict, assert ONE row, new value
  update public.first_read_responses set verdict = 'confirmed'
    where session_id = v_session and item_identity = v_id;
  select verdict, count(*) over() into v_verdict, v_rows
    from public.first_read_responses where session_id = v_session and item_identity = v_id;
  if v_verdict <> 'confirmed' or v_rows <> 1 then
    raise exception 'OC2C-FAIL open-replace: verdict=% rows=% (want confirmed/1)', v_verdict, v_rows;
  end if;

  -- ISSUE the proposal → verdicts freeze
  update public.first_read_sessions set status = 'proposal_issued' where id = v_session;

  -- post-issuance change is REFUSED by the freeze trigger (not a silent no-op)
  v_fired := false;
  begin
    update public.first_read_responses set verdict = 'rejected'
      where session_id = v_session and item_identity = v_id;
  exception when others then
    if sqlerrm ilike '%frozen%' then v_fired := true; else raise; end if;
  end;
  if not v_fired then raise exception 'OC2C-FAIL frozen: a post-issuance verdict change was NOT refused'; end if;

  -- and the stored verdict is unchanged
  select verdict into v_verdict from public.first_read_responses
    where session_id = v_session and item_identity = v_id;
  if v_verdict <> 'confirmed' then raise exception 'OC2C-FAIL frozen: stored verdict mutated to %', v_verdict; end if;

  raise notice 'OC2C PASS — open session replaces verdict in place (1 row); issued session refuses the change';
end $$;
rollback;
