-- OC-3 falsification-validated tests: resolve_contest RPC, the widened resolution
-- CHECK, the external-strike auto-resolve hook, and the company-teardown refusal.
-- Self-contained: runs inside ONE transaction and ROLLS BACK — leaves the fixture DB
-- byte-unchanged. Every law is checked in the affirmative AND falsified in-line.
--
-- Run: docker exec -i <db> psql -U postgres -X -v ON_ERROR_STOP=1 -f this.sql
-- Exit 0 with 'OC3 ALL TESTS GREEN' ⇒ pass. Any RAISE 'OC3-FAIL' ⇒ a law broke.
--
-- Fixtures (live rows in the local DB, same as OC-1):
--   company d8feefb3-ce5a-43d9-bccb-f573bb95e88a
--   claim A 06e8ae87-9836-5e6f-ac1d-351c136347e7
--   claim B 0c145dd0-441b-5806-a8d3-4a92fd7eee91
--   admin   5860c99a-e6f8-4feb-9997-992e3654f181  (user_roles.role='admin')

begin;

-- "COUNTS everywhere" snapshot: md5 over the claims that COUNT (status <> 'struck',
-- so minimized stays in) with their support counts + state, PLUS the company's deltas.
-- A set_aside (active→minimized) must leave THIS byte-identical (minimized still counts);
-- a strike (→struck) must change it (the claim drops out of the counting set).
create function pg_temp.oc3_counting(p_company uuid) returns text
language sql stable as $fn$
  select md5(coalesce(string_agg(line, '|' order by line), '<empty>'))
  from (
    select 'claim:'||c.id::text||':'||coalesce(c.state,'')
           ||':'||coalesce(c.outside_support_count,0)::text
           ||':'||coalesce(c.organization_support_count,0)::text
           ||':'||coalesce(c.customer_support_count,0)::text as line
    from public.claims c
    where c.company_id = p_company and c.status <> 'struck'   -- struck stops counting
    union all
    select 'delta:'||md5(d::text) from public.claim_deltas d where d.company_id = p_company
  ) s;
$fn$;

-- Full snapshot INCLUDING status: dismiss must leave this byte-identical (nothing changes).
create function pg_temp.oc3_full(p_company uuid) returns text
language sql stable as $fn$
  select md5(coalesce(string_agg(line, '|' order by line), '<empty>'))
  from (
    select 'claim:'||c.id::text||':'||coalesce(c.status,'')||':'||coalesce(c.state,'')
           ||':'||coalesce(c.outside_support_count,0)::text as line
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
  v_admin     text := '5860c99a-e6f8-4feb-9997-992e3654f181';
  v_session   uuid;
  v_cd        uuid;  -- disputed contest
  v_ci        uuid;  -- immaterial contest
  v_id        text := 'x';
  v_fired     boolean;
  v_snap0     text;
  v_snap1     text;
  v_status    text;
  v_reason    text;
  v_events    int;
  v_res       text;
begin
  insert into public.first_read_sessions (company_id, status) values (v_company, 'open') returning id into v_session;

  -- Impersonate the admin for the RPC (has_role(auth.uid(),'admin') reads request.jwt.claims).
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

  -- ── TEST 1 — non-admin caller is refused ─────────────────────────────────────
  insert into public.claim_contests (session_id, company_id, claim_id, claim_identity, contest_kind)
    values (v_session, v_company, v_claim_a, v_id, 'disputed') returning id into v_cd;
  perform set_config('request.jwt.claims', '', true); -- no identity → auth.uid() null → not admin
  v_fired := false;
  begin perform public.resolve_contest(v_cd, 'dismissed', 'r'); exception when others then v_fired := true; end;
  if not v_fired then raise exception 'OC3-FAIL 1: non-admin resolve was NOT refused'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  raise notice 'OC3 PASS 1 — non-admin refused';

  -- ── TEST 2 — missing reason refused ──────────────────────────────────────────
  v_fired := false;
  begin perform public.resolve_contest(v_cd, 'dismissed', '   '); exception when others then v_fired := true; end;
  if not v_fired then raise exception 'OC3-FAIL 2: empty reason was NOT refused'; end if;
  raise notice 'OC3 PASS 2 — missing reason refused';

  -- ── TEST 3 — kind mismatch refused (disputed→set_aside) ──────────────────────
  v_fired := false;
  begin perform public.resolve_contest(v_cd, 'set_aside', 'r'); exception when others then v_fired := true; end;
  if not v_fired then raise exception 'OC3-FAIL 3: disputed→set_aside was NOT refused'; end if;
  raise notice 'OC3 PASS 3 — disputed→set_aside refused';

  -- ── TEST 4 — DISMISS touches nothing (full snapshot byte-identical) ──────────
  v_snap0 := pg_temp.oc3_full(v_company);
  perform public.resolve_contest(v_cd, 'dismissed', 'operator disagrees with the dispute');
  v_snap1 := pg_temp.oc3_full(v_company);
  if v_snap0 <> v_snap1 then raise exception 'OC3-FAIL 4: dismiss changed claims/deltas (snapshot moved)'; end if;
  select resolution into v_res from public.claim_contests where id = v_cd;
  if v_res <> 'dismissed' then raise exception 'OC3-FAIL 4b: dismiss did not set resolution'; end if;
  -- falsification: had we STRUCK a claim instead, the full snapshot MUST move
  perform public.set_claim_status(v_claim_a, 'struck', 'control strike', v_admin);
  if pg_temp.oc3_full(v_company) = v_snap0 then raise exception 'OC3-FAIL 4c: control strike did not move the snapshot (detector is blind)'; end if;
  perform public.set_claim_status(v_claim_a, 'active', 'undo control', v_admin); -- restore for later tests
  raise notice 'OC3 PASS 4 — dismiss touches nothing; control strike moves the snapshot';

  -- ── TEST 5 — re-resolve refused (v_cd already dismissed) ─────────────────────
  v_fired := false;
  begin perform public.resolve_contest(v_cd, 'strike_resolved', 'r'); exception when others then v_fired := true; end;
  if not v_fired then raise exception 'OC3-FAIL 5: re-resolving a resolved contest was NOT refused'; end if;
  raise notice 'OC3 PASS 5 — re-resolve refused';

  -- ── TEST 6 — set_aside → minimized, STILL COUNTS (counting snapshot identical) ─
  insert into public.claim_contests (session_id, company_id, claim_id, claim_identity, contest_kind)
    values (v_session, v_company, v_claim_b, v_id, 'immaterial') returning id into v_ci;
  v_snap0 := pg_temp.oc3_counting(v_company);
  perform public.resolve_contest(v_ci, 'set_aside', 'true but not a focus now');
  select status into v_status from public.claims where id = v_claim_b;
  if v_status <> 'minimized' then raise exception 'OC3-FAIL 6: set_aside did not minimize the claim (got %)', v_status; end if;
  v_snap1 := pg_temp.oc3_counting(v_company);
  if v_snap0 <> v_snap1 then raise exception 'OC3-FAIL 6b: set_aside changed what COUNTS (minimized must still count)'; end if;
  -- structural: the status change rode the SOLE authority (a claim_events row exists)
  select count(*) into v_events from public.claim_events
    where claim_id = v_claim_b and triggered_by_event like 'status:%->minimized';
  if v_events < 1 then raise exception 'OC3-FAIL 6c: minimize did not go through set_claim_status (no claim_events signature)'; end if;
  -- falsification: a STRIKE of the same claim MUST drop it from the counting set
  perform public.set_claim_status(v_claim_b, 'struck', 'control strike b', v_admin);
  if pg_temp.oc3_counting(v_company) = v_snap0 then raise exception 'OC3-FAIL 6d: control strike did not change the counting set (detector blind)'; end if;
  perform public.set_claim_status(v_claim_b, 'minimized', 'restore', v_admin);
  raise notice 'OC3 PASS 6 — set_aside minimizes (via sole authority), still counts; control strike drops it';

  -- ── TEST 7 — immaterial→dismissed is LAWFUL (amendment 2026-07-24) ───────────
  -- fresh immaterial contest in a new session (unique (session,claim))
  insert into public.first_read_sessions (company_id, status) values (v_company, 'open') returning id into v_session;
  insert into public.claim_contests (session_id, company_id, claim_id, claim_identity, contest_kind)
    values (v_session, v_company, v_claim_b, v_id, 'immaterial') returning id into v_ci;
  perform public.resolve_contest(v_ci, 'dismissed', 'disagree it is immaterial; keeping the claim as-is');
  select resolution into v_res from public.claim_contests where id = v_ci;
  if v_res <> 'dismissed' then raise exception 'OC3-FAIL 7: immaterial→dismissed was not accepted (amendment)'; end if;
  -- falsification: immaterial→strike_resolved STILL forbidden (RPC + CHECK)
  insert into public.first_read_sessions (company_id, status) values (v_company, 'open') returning id into v_session;
  insert into public.claim_contests (session_id, company_id, claim_id, claim_identity, contest_kind)
    values (v_session, v_company, v_claim_b, v_id, 'immaterial') returning id into v_ci;
  v_fired := false;
  begin perform public.resolve_contest(v_ci, 'strike_resolved', 'r'); exception when others then v_fired := true; end;
  if not v_fired then raise exception 'OC3-FAIL 7b: immaterial→strike_resolved was NOT refused'; end if;
  raise notice 'OC3 PASS 7 — immaterial→dismissed lawful; immaterial→strike_resolved still refused';

  -- ── TEST 8 — external strike auto-resolves OPEN contests ─────────────────────
  -- fresh disputed contest on claim A (still active), then strike A OUTSIDE the RPC
  insert into public.first_read_sessions (company_id, status) values (v_company, 'open') returning id into v_session;
  insert into public.claim_contests (session_id, company_id, claim_id, claim_identity, contest_kind)
    values (v_session, v_company, v_claim_a, v_id, 'disputed') returning id into v_cd;
  perform public.set_claim_status(v_claim_a, 'struck', 'struck elsewhere in the app', v_admin);
  select resolution, resolution_reason into v_res, v_reason from public.claim_contests where id = v_cd;
  if v_res <> 'strike_resolved' then raise exception 'OC3-FAIL 8: external strike did not auto-resolve the disputed contest (got %)', coalesce(v_res,'null'); end if;
  if v_reason not ilike '%struck outside%' then raise exception 'OC3-FAIL 8b: auto-resolution reason not recorded'; end if;
  -- falsification: a contest that was ALREADY resolved must NOT be re-touched by the hook.
  -- v_ci from TEST 7 was dismissed; strike its claim and confirm it stays 'dismissed'.
  perform public.set_claim_status(v_claim_b, 'struck', 'struck b elsewhere', v_admin);
  select resolution into v_res from public.claim_contests where id = v_ci;
  if v_res <> 'dismissed' then raise exception 'OC3-FAIL 8c: the hook overwrote an already-resolved contest'; end if;
  raise notice 'OC3 PASS 8 — external strike auto-resolves OPEN contests only';

  -- ── TEST 9 — company teardown REFUSES while an OPEN contest exists ───────────
  -- one guaranteed-open contest (claim A is struck; add on a still-countable path via a
  -- fresh session on claim B — but claim B is struck too now; use claim A which allows a
  -- new session's contest). Simplest: a fresh open contest we then leave unresolved.
  insert into public.first_read_sessions (company_id, status) values (v_company, 'open') returning id into v_session;
  insert into public.claim_contests (session_id, company_id, claim_id, claim_identity, contest_kind)
    values (v_session, v_company, v_claim_a, v_id, 'disputed');  -- OPEN
  v_fired := false;
  begin delete from public.companies where id = v_company; exception when others then v_fired := true; v_reason := SQLERRM; end;
  if not v_fired then raise exception 'OC3-FAIL 9: company teardown was NOT refused with an open contest'; end if;
  if v_reason not ilike '%await your judgment%' then raise exception 'OC3-FAIL 9b: teardown refusal lacked the plain-English message (got: %)', v_reason; end if;
  raise notice 'OC3 PASS 9 — teardown refused while an open contest exists: %', v_reason;

  raise notice 'OC3 ALL TESTS GREEN';
end $$;

rollback;
