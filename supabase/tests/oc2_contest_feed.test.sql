-- OC-2 SQL laws (rolled back — zero residue): the capture-storage widening and
-- the counting-invariance law that a contested claim keeps counting. The feed's
-- anchoring/idempotency/kind law is unit-tested in contestFeed.test.ts; here we
-- prove the DB-side guarantees that unit tests can't reach.
--
-- Run: docker exec -i <db> psql -U postgres -X -v ON_ERROR_STOP=1 -f this.sql
begin;

create function pg_temp.oc2_snapshot(p_company uuid) returns text
language sql stable as $fn$
  select md5(coalesce(string_agg(line, '|' order by line), '<empty>'))
  from (
    select 'claim:'||c.id::text||':'||coalesce(c.status,'')||':'||coalesce(c.triangulation_state,'')
           ||':'||coalesce(c.state,'')||':'||coalesce(c.outside_support_count,0)::text
           ||':'||coalesce(c.organization_support_count,0)::text
           ||':'||coalesce(c.customer_support_count,0)::text as line
    from public.claims c where c.company_id = p_company
    union all
    select 'delta:'||md5(d::text) from public.claim_deltas d where d.company_id = p_company
  ) s;
$fn$;

do $$
declare
  v_company uuid := 'd8feefb3-ce5a-43d9-bccb-f573bb95e88a';
  v_claim_a uuid := '06e8ae87-9836-5e6f-ac1d-351c136347e7';
  v_claim_b uuid := '0c145dd0-441b-5806-a8d3-4a92fd7eee91';
  v_session uuid;
  v_id text := encode(digest('oc2-fixture', 'sha256'), 'hex');
  v_fired boolean;
  h0 text; h1 text; h2 text; hp text;
begin
  -- ── CAPTURE-STORAGE LAW — first_read_responses.verdict admits 'not_important' ──
  insert into public.first_read_sessions (company_id, status) values (v_company, 'open')
    returning id into v_session;

  -- not_important is accepted (its own value, no correction text required)
  insert into public.first_read_responses
    (session_id, company_id, item_kind, item_ref, item_identity, item_text, verdict)
  values (v_session, v_company, 'finding', null, v_id, 'fixture finding text', 'not_important');
  if (select count(*) from public.first_read_responses
        where session_id = v_session and verdict = 'not_important') <> 1 then
    raise exception 'OC2-FAIL cap.1: not_important response was not stored';
  end if;

  -- a fifth verdict value is still refused (CHECK is closed, not open)
  v_fired := false;
  begin
    insert into public.first_read_responses
      (session_id, company_id, item_kind, item_ref, item_identity, item_text, verdict)
    values (v_session, v_company, 'finding', null, v_id||'x', 'other', 'set_aside');
  exception when check_violation then v_fired := true;
  end;
  if not v_fired then raise exception 'OC2-FAIL cap.2: verdict CHECK accepted a fifth value'; end if;
  raise notice 'OC2 PASS capture — not_important stored; a fifth verdict value refused';

  delete from public.first_read_responses where session_id = v_session;

  -- ── TEST d — a contested claim STILL COUNTS (both kinds), read byte-identical ──
  h0 := pg_temp.oc2_snapshot(v_company);
  if h0 = md5('<empty>') then raise exception 'OC2-FAIL d: snapshot empty'; end if;

  -- disputed contest on claim_a
  insert into public.claim_contests
    (session_id, company_id, claim_id, claim_identity, contest_kind, source)
  values (v_session, v_company, v_claim_a, v_id, 'disputed', 'client_attested');
  h1 := pg_temp.oc2_snapshot(v_company);
  if h1 <> h0 then raise exception 'OC2-FAIL d.disputed: counting read changed after a disputed contest'; end if;

  -- immaterial contest on claim_b
  insert into public.claim_contests
    (session_id, company_id, claim_id, claim_identity, contest_kind, source)
  values (v_session, v_company, v_claim_b, v_id, 'immaterial', 'client_attested');
  h2 := pg_temp.oc2_snapshot(v_company);
  if h2 <> h0 then raise exception 'OC2-FAIL d.immaterial: counting read changed after an immaterial contest'; end if;

  if (select count(*) from public.claim_contests where session_id = v_session) <> 2 then
    raise exception 'OC2-FAIL d: expected 2 contests present';
  end if;

  -- FALSIFICATION: a real counting change (bump a support count) IS detected by
  -- the same read — the invariance above is a true invariance, not a dead compare.
  update public.claims set outside_support_count = outside_support_count + 1 where id = v_claim_a;
  hp := pg_temp.oc2_snapshot(v_company);
  if hp = h0 then raise exception 'OC2-FAIL d.falsify: planted counting change not detected'; end if;
  update public.claims set outside_support_count = outside_support_count - 1 where id = v_claim_a;
  raise notice 'OC2 PASS d — contested claims (disputed + immaterial) count byte-identical; planted change detected';

  raise notice 'OC2 ALL SQL TESTS GREEN';
end $$;

rollback;
