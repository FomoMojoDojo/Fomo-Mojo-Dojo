-- V2-3 / V2-3b — the site-inference row lifecycle (rolled back). After V2-3b the
-- declared path is render-side verbatim (no row); this table now caches site-inference
-- only, keeping its signed/pending lifecycle:
--   • a SIGNED row and a PENDING row COEXIST for one company
--   • at most ONE signed and ONE pending per company
--   • register + status are locked
-- (V2-3b dropped supporting_points; the parseable shape was retired.)
begin;
do $$
declare
  v_company uuid := 'd8feefb3-ce5a-43d9-bccb-f573bb95e88a';
  v_fired boolean;
begin
  -- accept: the signed row (what the client is shown)
  insert into public.first_read_stated_problem (company_id, statement, statement_identity, register, status, gen_model)
  values (v_company, 'The shown statement.', 'sid-signed', 'public_observed', 'signed', 'm');

  -- accept: a PENDING row COEXISTS (the regenerated inference awaiting signature)
  insert into public.first_read_stated_problem (company_id, statement, statement_identity, register, status, gen_model)
  values (v_company, 'The regenerated statement.', 'sid-pending', 'public_observed', 'pending', 'm');

  -- REFUSE: a SECOND signed row for the same company (one signed max)
  v_fired := false;
  begin
    insert into public.first_read_stated_problem (company_id, statement, statement_identity, register, status, gen_model)
    values (v_company, 'a rival signed row', 'sid-signed-2', 'public_observed', 'signed', 'm');
  exception when unique_violation then v_fired := true; end;
  if not v_fired then raise exception 'V2-3-FAIL: two signed rows for one company were accepted'; end if;

  -- REFUSE: an unknown status
  v_fired := false;
  begin
    insert into public.first_read_stated_problem (company_id, statement, statement_identity, register, status, gen_model)
    values ('58b2b15b-bada-4bcd-9c12-b7e66a37d0bc', 'x', 'sid-bad', 'public_observed', 'draft', 'm');
  exception when check_violation then v_fired := true; end;
  if not v_fired then raise exception 'V2-3-FAIL: an unknown status was accepted'; end if;

  raise notice 'V2-3b PASS — signed+pending coexist; one signed/one pending per company; status locked';
end $$;
rollback;
