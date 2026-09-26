-- B1 (Notion "Client Portals" sync) — client_portal_links storage laws.
-- Self-contained: runs inside ONE transaction and ROLLS BACK — leaves the fixture DB
-- byte-unchanged. Every law is checked in the affirmative AND falsified in-line.
--
-- Run: docker exec -i <db> psql -U postgres -X -v ON_ERROR_STOP=1 -f this.sql
-- Exit 0 with 'CPL1 ALL TESTS GREEN' ⇒ pass. Any RAISE 'CPL1-FAIL' ⇒ a law broke.
--
-- Fixtures (live rows in the local DB):
--   CB1 (frozen)  58b2b15b-bada-4bcd-9c12-b7e66a37d0bc   companies.frozen = true
--   Edgewood      3dd2cfbb-0792-4bf1-9cd4-15db9646874b   not frozen
--   FomoMojoDojo  dea66de5-647e-45b7-9f13-a9673f641006   not frozen
--   admin         5860c99a-e6f8-4feb-9997-992e3654f181   user_roles.role = 'admin'
--   non-admin     1834ea55-e0af-49df-bd32-853df1c97c82   NO user_roles row, NO company_members row
--                                                        (backups/fr-nonadmin.env, kept throwaway)

begin;

do $$
declare
  v_cb1       uuid := '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc';
  v_edgewood  uuid := '3dd2cfbb-0792-4bf1-9cd4-15db9646874b';
  v_fmd       uuid := 'dea66de5-647e-45b7-9f13-a9673f641006';
  v_admin     text := '5860c99a-e6f8-4feb-9997-992e3654f181';
  v_nonadmin  text := '1834ea55-e0af-49df-bd32-853df1c97c82';
  v_fired     boolean;
  v_reason    text;
  v_n         int;
  v_status    text;
  v_changed   timestamptz;
  -- B1a (R4/R6/R7), tests 5f–5g
  v_audit_before int;
  v_enabled      boolean;
  v_actor_seen   text;
begin
  -- Fixture preconditions: if these drift the tests below would pass for the wrong reason.
  if not (select frozen from public.companies where id = v_cb1) then
    raise exception 'CPL1-FAIL 0a: CB1 is not frozen — the R-frozen test would pass vacuously';
  end if;
  if (select frozen from public.companies where id = v_edgewood) then
    raise exception 'CPL1-FAIL 0b: Edgewood is frozen — it is the unfrozen control';
  end if;
  if exists (select 1 from public.user_roles where user_id = v_nonadmin::uuid) then
    raise exception 'CPL1-FAIL 0c: the non-admin fixture has a user_roles row';
  end if;
  raise notice 'CPL1 PASS 0 — fixtures as expected';

  -- The two unfrozen fixtures may already carry a real row (an operator flagged them on the
  -- Company page). Clear THEIR rows inside this transaction so the tests below start from a known
  -- state; the rollback at the end puts everything back, so a live row is never actually lost.
  delete from public.client_portal_links where company_id in (v_edgewood, v_fmd);


  -- ── TEST 1 — R-frozen: a CB1 row is refused by the DB ────────────────────────
  v_fired := false;
  begin
    insert into public.client_portal_links (company_id, enabled) values (v_cb1, true);
  exception when others then v_fired := true; v_reason := SQLERRM;
  end;
  if not v_fired then
    raise exception 'CPL1-FAIL 1: a CB1 client_portal_links row was NOT refused';
  end if;
  if v_reason not ilike '%frozen reference company%' then
    raise exception 'CPL1-FAIL 1b: CB1 refusal did not come from the freeze trigger (got: %)', v_reason;
  end if;
  raise notice 'CPL1 PASS 1 — CB1 insert refused: %', v_reason;

  -- FALSIFICATION of test 1: the SAME insert on an UNFROZEN company must succeed, so the
  -- refusal above is the freeze rule and not a broken insert.
  insert into public.client_portal_links (company_id, enabled) values (v_edgewood, true);
  if not exists (select 1 from public.client_portal_links where company_id = v_edgewood) then
    raise exception 'CPL1-FAIL 1c: the unfrozen control insert did not land';
  end if;
  raise notice 'CPL1 PASS 1c — unfrozen control insert lands (test 1 is the freeze rule, not a bad insert)';

  -- ── TEST 2 — R-status: a value outside the seven is refused ──────────────────
  v_fired := false;
  begin
    update public.client_portal_links set client_status = 'Map created' where company_id = v_edgewood;
  exception when others then v_fired := true; v_reason := SQLERRM;
  end;
  if not v_fired then
    raise exception 'CPL1-FAIL 2: client_status ''Map created'' (wrong case) was NOT refused';
  end if;
  if v_reason not ilike '%client_portal_links_client_status_check%' then
    raise exception 'CPL1-FAIL 2b: refusal did not come from the client_status CHECK (got: %)', v_reason;
  end if;
  raise notice 'CPL1 PASS 2 — off-list client_status refused: %', v_reason;

  -- FALSIFICATION of test 2: each of the seven signed values IS accepted, and NULL is accepted.
  foreach v_status in array array['Cold Intake','Web Intake','Map Created','In Progress','Completed','On Hold','Ongoing'] loop
    update public.client_portal_links set client_status = v_status where company_id = v_edgewood;
    if (select client_status from public.client_portal_links where company_id = v_edgewood) is distinct from v_status then
      raise exception 'CPL1-FAIL 2c: signed value % was not stored', v_status;
    end if;
  end loop;
  update public.client_portal_links set client_status = null where company_id = v_edgewood;
  if (select client_status from public.client_portal_links where company_id = v_edgewood) is not null then
    raise exception 'CPL1-FAIL 2d: NULL (not set) was not accepted';
  end if;
  raise notice 'CPL1 PASS 2c/2d — all seven signed values and NULL accepted';

  -- Same CHECK on last_notion_status_seen: a value Notion could never have sent is refused.
  v_fired := false;
  begin
    update public.client_portal_links set last_notion_status_seen = 'Archived' where company_id = v_edgewood;
  exception when others then v_fired := true;
  end;
  if not v_fired then
    raise exception 'CPL1-FAIL 2e: off-list last_notion_status_seen was NOT refused';
  end if;
  raise notice 'CPL1 PASS 2e — off-list last_notion_status_seen refused';

  -- ── TEST 3 — one Notion page can never be claimed by two companies ───────────
  update public.client_portal_links set notion_page_id = 'cpl1-page-aaa' where company_id = v_edgewood;
  insert into public.client_portal_links (company_id, enabled) values (v_fmd, true);
  v_fired := false;
  begin
    update public.client_portal_links set notion_page_id = 'cpl1-page-aaa' where company_id = v_fmd;
  exception when others then v_fired := true; v_reason := SQLERRM;
  end;
  if not v_fired then
    raise exception 'CPL1-FAIL 3: a duplicate notion_page_id was NOT refused';
  end if;
  if v_reason not ilike '%client_portal_links_notion_page_id_key%' then
    raise exception 'CPL1-FAIL 3b: refusal did not come from the notion_page_id UNIQUE (got: %)', v_reason;
  end if;
  raise notice 'CPL1 PASS 3 — duplicate notion_page_id refused: %', v_reason;

  -- FALSIFICATION of test 3: a DIFFERENT page id on the same second company succeeds, and two
  -- NULLs coexist (UNIQUE must not collapse "not linked yet" into one company).
  update public.client_portal_links set notion_page_id = 'cpl1-page-bbb' where company_id = v_fmd;
  update public.client_portal_links set notion_page_id = null where company_id = v_edgewood;
  update public.client_portal_links set notion_page_id = null where company_id = v_fmd;
  if (select count(*) from public.client_portal_links where notion_page_id is null) < 2 then
    raise exception 'CPL1-FAIL 3c: two unlinked (NULL notion_page_id) rows cannot coexist';
  end if;
  raise notice 'CPL1 PASS 3b/3c — distinct ids accepted; multiple NULLs coexist';

  -- ── TEST 4 — R-cas: the compare-and-set predicate the UI uses ────────────────
  -- Stored value is NULL right now. A write whose expected value is 'In Progress' must not land.
  update public.client_portal_links
     set client_status = 'Completed', status_changed_at = now()
   where company_id = v_edgewood
     and client_status is not distinct from 'In Progress';
  get diagnostics v_n = ROW_COUNT;
  if v_n <> 0 then
    raise exception 'CPL1-FAIL 4: a stale compare-and-set updated % row(s)', v_n;
  end if;
  if (select client_status from public.client_portal_links where company_id = v_edgewood) is not null then
    raise exception 'CPL1-FAIL 4b: a stale compare-and-set changed the stored value';
  end if;
  raise notice 'CPL1 PASS 4 — stale compare-and-set updates 0 rows and leaves the value unchanged';

  -- FALSIFICATION of test 4: the SAME statement with the CORRECT expected value (NULL) lands,
  -- and sets status_changed_at.
  update public.client_portal_links
     set client_status = 'In Progress', status_changed_at = now()
   where company_id = v_edgewood
     and client_status is not distinct from null;
  get diagnostics v_n = ROW_COUNT;
  if v_n <> 1 then
    raise exception 'CPL1-FAIL 4c: a fresh compare-and-set updated % row(s), expected 1', v_n;
  end if;
  select client_status, status_changed_at into v_status, v_changed
    from public.client_portal_links where company_id = v_edgewood;
  if v_status <> 'In Progress' then
    raise exception 'CPL1-FAIL 4d: fresh compare-and-set stored % instead of In Progress', v_status;
  end if;
  if v_changed is null then
    raise exception 'CPL1-FAIL 4e: status_changed_at was not set on a status write';
  end if;
  raise notice 'CPL1 PASS 4c/4d/4e — fresh compare-and-set lands and stamps status_changed_at';

  -- ── TEST 6 — status_changed_at is DB-stamped and writer-immutable ────────────
  -- Run on FomoMojoDojo, whose status has never been set: status_changed_at starts NULL, so the
  -- trigger's change branch and its no-change branch are told apart by more than a timestamp
  -- comparison. (now() is TRANSACTION time, constant inside this test, so "did it re-stamp?" can
  -- never be asked by comparing two stamps taken in one transaction — NULL vs not-NULL can.)
  if (select status_changed_at from public.client_portal_links where company_id = v_fmd) is not null then
    raise exception 'CPL1-FAIL 6-pre: FomoMojoDojo already carries a status date';
  end if;

  -- 6a: an `enabled`-only write does not touch the status date.
  update public.client_portal_links set enabled = false where company_id = v_fmd;
  if (select status_changed_at from public.client_portal_links where company_id = v_fmd) is not null then
    raise exception 'CPL1-FAIL 6a: an enabled-only write stamped a status date';
  end if;
  raise notice 'CPL1 PASS 6a — an enabled-only write never stamps the status date';

  -- 6b: a writer cannot set the column directly. With no status change, the value it sent is
  -- discarded and the stored value stands. This is what makes the column the DB's record and not
  -- the writer's claim.
  update public.client_portal_links
     set status_changed_at = '2001-01-01T00:00:00Z' where company_id = v_fmd;
  if (select status_changed_at from public.client_portal_links where company_id = v_fmd) is not null then
    raise exception 'CPL1-FAIL 6b: a writer set status_changed_at directly';
  end if;
  raise notice 'CPL1 PASS 6b — status_changed_at is writer-immutable without a status change';

  -- 6c — FALSIFICATION of 6a/6b: a REAL status change DOES stamp, and stamps SERVER time even when
  -- the writer sends its own (a skewed browser clock can never date a status change, which is what
  -- R3's newest-change-wins depends on). Without this the two NULLs above would equally describe a
  -- trigger that never writes at all.
  update public.client_portal_links
     set client_status = 'Cold Intake', status_changed_at = '2001-01-01T00:00:00Z'
   where company_id = v_fmd
     and client_status is not distinct from null;
  select status_changed_at into v_changed
    from public.client_portal_links where company_id = v_fmd;
  if v_changed is null then
    raise exception 'CPL1-FAIL 6c: a real status change did NOT stamp status_changed_at';
  end if;
  if v_changed < now() - interval '1 minute' then
    raise exception 'CPL1-FAIL 6c2: the writer''s date (%) was kept instead of server now()', v_changed;
  end if;
  raise notice 'CPL1 PASS 6c — a real status change stamps server now() and discards the writer''s date';

  -- 6d: re-saving the SAME status, again with a bogus date, leaves the stamp where it is.
  update public.client_portal_links
     set client_status = 'Cold Intake', status_changed_at = '2001-01-01T00:00:00Z'
   where company_id = v_fmd;
  if (select status_changed_at from public.client_portal_links where company_id = v_fmd) <> v_changed then
    raise exception 'CPL1-FAIL 6d: re-saving the same status moved the stamp';
  end if;
  raise notice 'CPL1 PASS 6d — re-saving the same status leaves the stamp untouched';

  -- ── TEST 5 — RLS: a non-admin authenticated user can neither read nor write ──
  -- Two rows exist at this point (Edgewood + FomoMojoDojo), so a 0-row SELECT below is the
  -- policy filtering, not an empty table.
  if (select count(*) from public.client_portal_links) < 2 then
    raise exception 'CPL1-FAIL 5a: fewer than 2 rows present — the RLS SELECT test would pass vacuously';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_nonadmin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into v_n from public.client_portal_links;
  if v_n <> 0 then
    raise exception 'CPL1-FAIL 5: a non-admin SELECTed % row(s)', v_n;
  end if;

  v_fired := false;
  begin
    insert into public.client_portal_links (company_id, enabled) values (v_cb1, true);
  exception when others then v_fired := true;
  end;
  if not v_fired then
    raise exception 'CPL1-FAIL 5b: a non-admin INSERT was NOT refused';
  end if;

  update public.client_portal_links set enabled = false where company_id = v_edgewood;
  get diagnostics v_n = ROW_COUNT;
  if v_n <> 0 then
    raise exception 'CPL1-FAIL 5c: a non-admin UPDATE touched % row(s)', v_n;
  end if;

  delete from public.client_portal_links where company_id = v_edgewood;
  get diagnostics v_n = ROW_COUNT;
  if v_n <> 0 then
    raise exception 'CPL1-FAIL 5d: a non-admin DELETE touched % row(s)', v_n;
  end if;
  raise notice 'CPL1 PASS 5 — non-admin: 0 rows visible, INSERT refused, UPDATE/DELETE touch nothing';

  -- FALSIFICATION of test 5: the SAME session as an ADMIN sees the rows, so the 0 SELECT above is
  -- the admin clause and not a blanket denial of `authenticated`.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.client_portal_links;
  if v_n < 2 then
    raise exception 'CPL1-FAIL 5e: an admin authenticated user saw only % row(s)', v_n;
  end if;
  raise notice 'CPL1 PASS 5e — the same role as an admin reads (test 5''s 0 is the admin clause)';

  -- ── TEST 5f REVISED — B1a (R7): an admin may only SELECT. ────────────────────
  -- B1 asserted here that an admin authenticated UPDATE touched exactly 1 row, under the FOR ALL
  -- policy. R7 narrowed that policy to SELECT, so the same UPDATE must now touch 0 — a direct write
  -- is how a change escapes the audit trail, which is the whole point of B1a. The admin write path
  -- has not gone away, it has moved: TEST 5g calls it.
  update public.client_portal_links set enabled = false where company_id = v_edgewood;
  get diagnostics v_n = ROW_COUNT;
  if v_n <> 0 then
    raise exception 'CPL1-FAIL 5f: an admin authenticated UPDATE touched % row(s) — R7 narrowed the policy to SELECT', v_n;
  end if;
  v_fired := false;
  begin
    insert into public.client_portal_links (company_id, enabled) values (v_fmd, true);
  exception when others then v_fired := true;
  end;
  if not v_fired then
    raise exception 'CPL1-FAIL 5f2: an admin authenticated INSERT was NOT refused — R7 narrowed the policy to SELECT';
  end if;
  raise notice 'CPL1 PASS 5f — R7: an admin authenticated UPDATE touches nothing and INSERT is refused';

  -- ── TEST 5g — B1a (R4): the admin write path is set_client_portal_link, and it audits. ──
  -- Same session, same admin, still `authenticated`: the RPC is SECURITY DEFINER so it is not
  -- subject to the policies above, but it takes the actor from auth.uid() and requires the admin
  -- role, so this proves the door R7 closed has an audited replacement and not a dead end.
  select count(*) into v_n from public.integrity_runs
    where component = 'client_portal_operator_set' and surface_id = v_edgewood;
  v_audit_before := v_n;
  select client_status into v_status from public.client_portal_links where company_id = v_edgewood;
  perform public.set_client_portal_link(v_edgewood, true, true, v_status, 'On Hold');
  select enabled, client_status into v_enabled, v_status
    from public.client_portal_links where company_id = v_edgewood;
  if v_enabled is not true or v_status <> 'On Hold' then
    raise exception 'CPL1-FAIL 5g: the RPC did not store enabled/On Hold (got %/%)', v_enabled, v_status;
  end if;
  select count(*) into v_n from public.integrity_runs
    where component = 'client_portal_operator_set' and surface_id = v_edgewood;
  if v_n <> v_audit_before + 1 then
    raise exception 'CPL1-FAIL 5g2: the RPC wrote % audit row(s), expected exactly 1', v_n - v_audit_before;
  end if;
  select excluded_by_rule ->> 'actor' into v_actor_seen from public.integrity_runs
    where component = 'client_portal_operator_set' and surface_id = v_edgewood
    order by id desc limit 1;
  if v_actor_seen is distinct from v_admin then
    raise exception 'CPL1-FAIL 5g3: the audit row names actor %, expected the admin %', v_actor_seen, v_admin;
  end if;
  -- R6: the same call again would change nothing, and must be refused with no second audit row.
  v_fired := false;
  begin
    perform public.set_client_portal_link(v_edgewood, true, true, 'On Hold', 'On Hold');
  exception when others then v_fired := true;
  end;
  if not v_fired then
    raise exception 'CPL1-FAIL 5g4: R6 — a no-op call was NOT refused';
  end if;
  select count(*) into v_n from public.integrity_runs
    where component = 'client_portal_operator_set' and surface_id = v_edgewood;
  if v_n <> v_audit_before + 1 then
    raise exception 'CPL1-FAIL 5g5: R6 — the refused no-op still wrote an audit row';
  end if;
  raise notice 'CPL1 PASS 5g — R4/R6: the RPC writes both columns + ONE audit row naming the admin; a no-op is refused and audits nothing';

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);

  raise notice 'CPL1 ALL TESTS GREEN';
end $$;

rollback;
