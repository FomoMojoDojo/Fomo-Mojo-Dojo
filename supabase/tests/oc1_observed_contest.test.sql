-- OC-1 falsification-validated schema tests for claim_contests /
-- claim_contest_removals. Self-contained: runs inside one transaction and
-- ROLLS BACK — leaves the fixture DB byte-unchanged. Every law is checked in the
-- affirmative AND falsified in-line (a deliberately-broken variant is shown to
-- FAIL the same detector) so a green run means the detector actually bites.
--
-- Run: docker exec -i <db> psql -U postgres -X -v ON_ERROR_STOP=1 -f this.sql
-- Exit 0 with a final 'OC1 ALL TESTS GREEN' notice ⇒ pass. Any RAISE EXCEPTION
-- 'OC1-FAIL' ⇒ a law did not hold (or a falsification control did not fire).
--
-- Fixtures (live rows in the local DB):
--   company d8feefb3-ce5a-43d9-bccb-f573bb95e88a
--   claim A 06e8ae87-9836-5e6f-ac1d-351c136347e7  (disputed side)
--   claim B 0c145dd0-441b-5806-a8d3-4a92fd7eee91  (immaterial side)

begin;

-- The "existing counting / delta read": md5 over exactly the claims columns every
-- counting surface consumes (status, triangulation_state, state, the three support
-- counts) PLUS the full claim_deltas rows for the company. Inserting a contest must
-- leave this byte-identical (contests are an orthogonal axis).
create function pg_temp.oc1_snapshot(p_company uuid) returns text
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
  v_company   uuid := 'd8feefb3-ce5a-43d9-bccb-f573bb95e88a';
  v_claim_a   uuid := '06e8ae87-9836-5e6f-ac1d-351c136347e7';
  v_claim_b   uuid := '0c145dd0-441b-5806-a8d3-4a92fd7eee91';
  v_session   uuid;
  v_id        text := encode(digest('oc1-fixture-identity', 'sha256'), 'hex');
  v_cid       uuid;
  v_zid       uuid;
  v_rm_before bigint;
  v_rm_after  bigint;
  v_reason    text;
  v_claimid   text;
  h0 text; h1 text; h2 text; hp text;
  v_fired     boolean;
  v_src       text;
begin
  -- session for this company (rolled back with everything else)
  insert into public.first_read_sessions (company_id, status)
  values (v_company, 'open') returning id into v_session;

  -- ── TEST a — unique (session, claim); second insert refused, INCLUDING the other kind
  insert into public.claim_contests (session_id, company_id, claim_id, claim_identity, contest_kind)
  values (v_session, v_company, v_claim_a, v_id, 'disputed');

  -- a.1 second insert, SAME kind → must raise unique_violation
  v_fired := false;
  begin
    insert into public.claim_contests (session_id, company_id, claim_id, claim_identity, contest_kind)
    values (v_session, v_company, v_claim_a, v_id, 'disputed');
  exception when unique_violation then v_fired := true;
  end;
  if not v_fired then raise exception 'OC1-FAIL a.1: duplicate (session,claim) same-kind was NOT refused'; end if;

  -- a.2 second insert, OTHER kind → must STILL raise unique_violation (kind is an attribute, not a 2nd row)
  v_fired := false;
  begin
    insert into public.claim_contests (session_id, company_id, claim_id, claim_identity, contest_kind)
    values (v_session, v_company, v_claim_a, v_id, 'immaterial');
  exception when unique_violation then v_fired := true;
  end;
  if not v_fired then raise exception 'OC1-FAIL a.2: duplicate (session,claim) OTHER-kind was NOT refused'; end if;

  -- a.falsification: a DIFFERENT (session,claim) must SUCCEED — proves the constraint
  -- is scoped to the pair, not blocking all inserts (a broken all-blocking constraint fails here).
  insert into public.claim_contests (session_id, company_id, claim_id, claim_identity, contest_kind)
  values (v_session, v_company, v_claim_b, v_id, 'immaterial');
  raise notice 'OC1 PASS a — unique (session,claim) refuses 2nd insert incl. other kind; distinct pair admitted';

  -- clear both so later tests start clean on this session
  delete from public.claim_contests where session_id = v_session;

  -- ── TEST b — contest_kind CHECK refuses any third value
  v_fired := false;
  begin
    insert into public.claim_contests (session_id, company_id, claim_id, claim_identity, contest_kind)
    values (v_session, v_company, v_claim_a, v_id, 'irrelevant');
  exception when check_violation then v_fired := true;
  end;
  if not v_fired then raise exception 'OC1-FAIL b: contest_kind CHECK accepted a third value'; end if;
  -- b.falsification: the two legal values MUST be accepted (a CHECK that rejects everything fails here)
  insert into public.claim_contests (session_id, company_id, claim_id, claim_identity, contest_kind)
    values (v_session, v_company, v_claim_a, v_id, 'disputed');
  insert into public.claim_contests (session_id, company_id, claim_id, claim_identity, contest_kind)
    values (v_session, v_company, v_claim_b, v_id, 'immaterial');
  raise notice 'OC1 PASS b — contest_kind CHECK refuses a third value; both legal values admitted';

  -- also assert ruling 9 resolution↔kind CHECK: immaterial can NEVER be strike_resolved
  v_fired := false;
  begin
    update public.claim_contests set resolution = 'strike_resolved'
      where session_id = v_session and claim_id = v_claim_b;   -- claim_b is immaterial
  exception when check_violation then v_fired := true;
  end;
  if not v_fired then raise exception 'OC1-FAIL b.r9: immaterial contest was allowed to be strike_resolved'; end if;
  raise notice 'OC1 PASS b.r9 — immaterial cannot be strike_resolved (ruling 9 encoded)';

  delete from public.claim_contests where session_id = v_session;

  -- ── TEST c — every delete (direct AND via claim cascade) leaves a surviving audit row
  -- c.falsification: with the audit trigger DISABLED, a delete must leave NO audit row.
  -- (If a row still appeared, something other than the trigger is writing it — detector must catch that.)
  insert into public.claim_contests (session_id, company_id, claim_id, claim_identity, contest_kind)
    values (v_session, v_company, v_claim_a, v_id, 'disputed') returning id into v_zid;
  alter table public.claim_contests disable trigger claim_contests_delete_audit;
  select count(*) into v_rm_before from public.claim_contest_removals where contest_id = v_zid;
  delete from public.claim_contests where id = v_zid;
  select count(*) into v_rm_after from public.claim_contest_removals where contest_id = v_zid;
  if v_rm_after <> v_rm_before then
    raise exception 'OC1-FAIL c.falsify: audit row appeared with trigger DISABLED (before=% after=%)', v_rm_before, v_rm_after;
  end if;
  alter table public.claim_contests enable trigger claim_contests_delete_audit;

  -- c.1 DIRECT delete → exactly one audit row, reason 'unaudited_direct_delete', identity preserved
  insert into public.claim_contests (session_id, company_id, claim_id, claim_identity, contest_kind)
    values (v_session, v_company, v_claim_a, v_id, 'disputed') returning id into v_cid;
  delete from public.claim_contests where id = v_cid;
  select count(*), max(reason), max(claim_identity)
    into v_rm_after, v_reason, v_claimid
    from public.claim_contest_removals where contest_id = v_cid;
  if v_rm_after <> 1 then raise exception 'OC1-FAIL c.1: direct delete left % audit rows (want 1)', v_rm_after; end if;
  if v_reason <> 'unaudited_direct_delete' then raise exception 'OC1-FAIL c.1: reason was %', v_reason; end if;
  if v_claimid <> v_id then raise exception 'OC1-FAIL c.1: claim_identity not preserved'; end if;

  -- c.2 CASCADE via CLAIM delete → the cascaded contest delete still leaves a SURVIVING audit row
  insert into public.claim_contests (session_id, company_id, claim_id, claim_identity, contest_kind)
    values (v_session, v_company, v_claim_b, v_id, 'immaterial') returning id into v_cid;
  delete from public.claims where id = v_claim_b;          -- FK cascade removes the contest
  select count(*), max(claim_id::text) into v_rm_after, v_claimid
    from public.claim_contest_removals where contest_id = v_cid;
  if v_rm_after <> 1 then raise exception 'OC1-FAIL c.2: claim-cascade left % audit rows (want 1)', v_rm_after; end if;
  if v_claimid <> v_claim_b::text then raise exception 'OC1-FAIL c.2: cascaded audit lost claim_id'; end if;
  -- and it SURVIVES the very cascade that produced it (still selectable after the claim is gone)
  if not exists (select 1 from public.claim_contest_removals where contest_id = v_cid) then
    raise exception 'OC1-FAIL c.2: audit row did not survive the cascade';
  end if;
  raise notice 'OC1 PASS c — direct + claim-cascade deletes each leave a surviving audit row';

  -- ── TEST d — a contested claim STILL COUNTS, both kinds, read byte-identical
  -- fresh session (claim_b was just deleted above; use claim_a disputed on a new session,
  -- and re-read the same company snapshot). Roll the delete of claim_b out of scope by
  -- re-basing d on the CURRENT state (h0 taken now, after c.2), so d is internally consistent.
  h0 := pg_temp.oc1_snapshot(v_company);
  if h0 = md5('<empty>') then raise exception 'OC1-FAIL d: snapshot empty — fixture has no claims'; end if;

  insert into public.first_read_sessions (company_id, status) values (v_company, 'open') returning id into v_session;
  -- disputed contest on claim_a
  insert into public.claim_contests (session_id, company_id, claim_id, claim_identity, contest_kind)
    values (v_session, v_company, v_claim_a, v_id, 'disputed');
  h1 := pg_temp.oc1_snapshot(v_company);
  if h1 <> h0 then raise exception 'OC1-FAIL d.disputed: counting read changed after a disputed contest'; end if;

  -- immaterial contest on a DIFFERENT claim (claim_a already contested on this session; pick another live claim)
  declare v_claim_c uuid;
  begin
    select id into v_claim_c from public.claims
      where company_id = v_company and id <> v_claim_a order by id limit 1;
    insert into public.claim_contests (session_id, company_id, claim_id, claim_identity, contest_kind)
      values (v_session, v_company, v_claim_c, v_id, 'immaterial');
  end;
  h2 := pg_temp.oc1_snapshot(v_company);
  if h2 <> h0 then raise exception 'OC1-FAIL d.immaterial: counting read changed after an immaterial contest'; end if;

  -- both sides non-empty: two contests really exist on this session
  if (select count(*) from public.claim_contests where session_id = v_session) <> 2 then
    raise exception 'OC1-FAIL d: expected 2 contests present';
  end if;

  -- d.falsification: PLANT a real counting change (bump a support count) — the SAME read MUST detect it
  update public.claims set outside_support_count = outside_support_count + 1 where id = v_claim_a;
  hp := pg_temp.oc1_snapshot(v_company);
  if hp = h0 then raise exception 'OC1-FAIL d.falsify: planted counting change was NOT detected by the read'; end if;
  update public.claims set outside_support_count = outside_support_count - 1 where id = v_claim_a;  -- restore (rolled back anyway)
  raise notice 'OC1 PASS d — contested claims (disputed + immaterial) count byte-identical; planted change detected';

  -- ── TEST e — structural: nothing this migration introduced references claims.status
  select prosrc into v_src from pg_proc where proname = 'claim_contests_delete_audit';
  if v_src is null then raise exception 'OC1-FAIL e: audit function missing'; end if;
  if v_src ~ '\mclaims\M' then raise exception 'OC1-FAIL e: audit fn references the claims table'; end if;
  if v_src ~* 'set_claim_status' then raise exception 'OC1-FAIL e: audit fn references set_claim_status'; end if;
  if v_src ~* 'status' then raise exception 'OC1-FAIL e: audit fn references status'; end if;
  -- no function named claim_contest* references claims.status anywhere
  if exists (
    select 1 from pg_proc where proname like 'claim_contest%' and prosrc ~* 'claims.status'
  ) then raise exception 'OC1-FAIL e: a claim_contest* function references claims.status'; end if;
  -- e.positive-control: the SAME detector MUST fire on a known status-writer (the pre-existing guard),
  -- proving the grep isn't a no-op that would pass anything.
  select prosrc into v_src from pg_proc where proname = 'claims_status_guard';
  if v_src !~* 'status' then raise exception 'OC1-FAIL e.control: detector failed to see status in claims_status_guard'; end if;
  raise notice 'OC1 PASS e — no OC-1 function references claims.status (positive-control fires on claims_status_guard)';

  raise notice 'OC1 ALL TESTS GREEN';
end $$;

rollback;
