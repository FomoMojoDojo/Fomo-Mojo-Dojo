-- V2-2b — the widened register + one-source-per-company (rolled back). register admits
-- the two source registers ONLY; the sources never blend (one row per company).
begin;
do $$
declare
  v_company uuid := 'd8feefb3-ce5a-43d9-bccb-f573bb95e88a';
  v_fired boolean;
begin
  -- accept: company_declared (internal register)
  insert into public.first_read_stated_problem (company_id, statement, statement_identity, register, descriptive_fallback, gen_model)
  values (v_company, 'The problem you brought.', 'sid-a', 'internal_declared', false, 'm');

  -- REFUSE: a second row for the same company — one source wins, never blended
  v_fired := false;
  begin
    insert into public.first_read_stated_problem (company_id, statement, statement_identity, register, gen_model)
    values (v_company, 'site-inferred instead', 'sid-b', 'public_observed', 'm');
  exception when unique_violation then v_fired := true; end;
  if not v_fired then raise exception 'V2-2b-FAIL blend: two rows (two sources) for one company were accepted'; end if;

  -- accept: site_inferred (public register) for a DIFFERENT company
  insert into public.first_read_stated_problem (company_id, statement, statement_identity, register, descriptive_fallback, gen_model)
  values ('58b2b15b-bada-4bcd-9c12-b7e66a37d0bc', 'How they describe themselves.', 'sid-c', 'public_observed', true, 'm');

  -- REFUSE: the retired 'client_voice' register (widened away)
  v_fired := false;
  begin
    insert into public.first_read_stated_problem (company_id, statement, statement_identity, register, gen_model)
    values ('916ce5f4-8ab3-4908-907e-570dc294e330', 'x', 'sid-d', 'client_voice', 'm');
  exception when check_violation then v_fired := true; end;
  if not v_fired then raise exception 'V2-2b-FAIL register: the retired client_voice register was accepted'; end if;

  raise notice 'V2-2b PASS — register admits internal_declared|public_observed only; one source per company (no blend)';
end $$;
rollback;
