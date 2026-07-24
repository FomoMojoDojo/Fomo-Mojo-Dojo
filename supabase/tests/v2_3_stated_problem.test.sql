-- V2-3 — the sign-to-publish lifecycle + points cap (rolled back).
--   • a SIGNED row and a PENDING row COEXIST for one company (regeneration never
--     clobbers the shown row)
--   • at most ONE signed and ONE pending per company
--   • supporting_points caps at 4
begin;
do $$
declare
  v_company uuid := 'd8feefb3-ce5a-43d9-bccb-f573bb95e88a';
  v_fired boolean;
begin
  -- accept: the signed row (what the client is shown)
  insert into public.first_read_stated_problem (company_id, statement, statement_identity, register, status, supporting_points, gen_model)
  values (v_company, 'The shown headline.', 'sid-signed', 'internal_declared', 'signed', '[]'::jsonb, 'm');

  -- accept: a PENDING row COEXISTS (the regenerated shape awaiting signature)
  insert into public.first_read_stated_problem (company_id, statement, statement_identity, register, status, supporting_points, gen_model)
  values (v_company, 'The regenerated headline.', 'sid-pending', 'internal_declared', 'pending',
          '["a","b","c","d"]'::jsonb, 'm');

  -- REFUSE: a SECOND signed row for the same company (one signed max)
  v_fired := false;
  begin
    insert into public.first_read_stated_problem (company_id, statement, statement_identity, register, status, gen_model)
    values (v_company, 'a rival signed row', 'sid-signed-2', 'internal_declared', 'signed', 'm');
  exception when unique_violation then v_fired := true; end;
  if not v_fired then raise exception 'V2-3-FAIL: two signed rows for one company were accepted'; end if;

  -- REFUSE: more than 4 supporting points
  v_fired := false;
  begin
    insert into public.first_read_stated_problem (company_id, statement, statement_identity, register, status, supporting_points, gen_model)
    values ('58b2b15b-bada-4bcd-9c12-b7e66a37d0bc', 'too many', 'sid-cap', 'internal_declared', 'pending',
            '["a","b","c","d","e"]'::jsonb, 'm');
  exception when check_violation then v_fired := true; end;
  if not v_fired then raise exception 'V2-3-FAIL: a 5-point supporting list was accepted'; end if;

  -- REFUSE: an unknown status
  v_fired := false;
  begin
    insert into public.first_read_stated_problem (company_id, statement, statement_identity, register, status, gen_model)
    values ('916ce5f4-8ab3-4908-907e-570dc294e330', 'x', 'sid-bad', 'internal_declared', 'draft', 'm');
  exception when check_violation then v_fired := true; end;
  if not v_fired then raise exception 'V2-3-FAIL: an unknown status was accepted'; end if;

  raise notice 'V2-3 PASS — signed+pending coexist; one signed/one pending per company; points cap 4; status locked';
end $$;
rollback;
