-- V2-2 — first_read_stated_problem structural laws (rolled back). The register is
-- LOCKED to client_voice (Act 1 never blends the internal-register form content); the
-- quote is byte-exact-verbatim; one row per company.
begin;
do $$
declare
  v_company uuid := 'd8feefb3-ce5a-43d9-bccb-f573bb95e88a';
  v_src text := 'Edgewood offers a continuum of mental healthcare for youth and families.';
  v_fired boolean;
begin
  -- accept: client_voice, verbatim quote
  insert into public.first_read_stated_problem (company_id, statement, statement_identity, register, quote, quote_source_text, gen_model, judge_model)
  values (v_company, 'Delivering mental healthcare for youth and families.', 'sid-1', 'client_voice',
          'continuum of mental healthcare for youth', v_src, 'qwen2.5:14b-instruct', 'llama3:70b');

  -- REFUSE: register other than client_voice (register lock — never blend)
  v_fired := false;
  begin
    insert into public.first_read_stated_problem (company_id, statement, statement_identity, register, gen_model)
    values ('58b2b15b-bada-4bcd-9c12-b7e66a37d0bc', 'x', 'sid-2', 'internal_declared', 'm');
  exception when check_violation then v_fired := true; end;
  if not v_fired then raise exception 'V2-2-FAIL register: a non-client_voice register was accepted'; end if;

  -- REFUSE: a quote NOT verbatim in its source (CV-2e verbatim guard)
  v_fired := false;
  begin
    insert into public.first_read_stated_problem (company_id, statement, statement_identity, quote, quote_source_text, gen_model)
    values ('58b2b15b-bada-4bcd-9c12-b7e66a37d0bc', 'x', 'sid-3', 'not in the source', v_src, 'm');
  exception when check_violation then v_fired := true; end;
  if not v_fired then raise exception 'V2-2-FAIL verbatim: a non-substring quote was accepted'; end if;

  -- REFUSE: a second row for the same company (one stated problem per company)
  v_fired := false;
  begin
    insert into public.first_read_stated_problem (company_id, statement, statement_identity, gen_model)
    values (v_company, 'another', 'sid-4', 'm');
  exception when unique_violation then v_fired := true; end;
  if not v_fired then raise exception 'V2-2-FAIL unique: a second stated problem per company was accepted'; end if;

  raise notice 'V2-2 PASS — register locked to client_voice; quote verbatim-only; one per company';
end $$;
rollback;
