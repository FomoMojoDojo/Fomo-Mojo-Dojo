-- V2-5c — claims.provenance admits the third value 'analytic'; a fourth/unknown value is
-- refused (rolled back).
begin;
do $$ declare v_fired boolean; begin
  insert into public.claims (company_id, statement, topic, claim_type, provenance)
  values ('d8feefb3-ce5a-43d9-bccb-f573bb95e88a','probe analytic claim','unknown','observation','analytic');
  raise notice 'V2-5c ACCEPTED: provenance=analytic satisfies claims_provenance_check';

  v_fired := false;
  begin
    insert into public.claims (company_id, statement, topic, claim_type, provenance)
    values ('d8feefb3-ce5a-43d9-bccb-f573bb95e88a','probe bogus','unknown','observation','made_up_value');
  exception when check_violation then v_fired := true; end;
  if not v_fired then raise exception 'V2-5c-FAIL: an unknown provenance value was accepted'; end if;
  raise notice 'V2-5c REJECTED: an unknown provenance value is refused by the CHECK';
end $$;
rollback;
