-- GUARD — durable check outcomes + re-roll preservation (migration 20260912170000).
--
-- Runs against the LOCAL database inside ONE transaction that is ALWAYS rolled back, on a throwaway
-- company it creates itself. Proves, in order:
--   1. append-only: an UPDATE of any decided column raises; superseded_by is settable once;
--   2. supersession via record_check_outcome: the prior row is superseded (history kept), exactly one live
--      row per (company, identity, kind, version) — the live partial index refuses a second live row;
--      'withdrawn' supersedes and leaves no live verdict;
--   3. check_version: a v2 row coexists with the v1 row as separate live rows;
--   4. tests: a test with outcome='failed' (result NULL) is PRESERVED-CLASS — remove_tests_for_leg_reroll
--      refuses, a direct DELETE refuses; the same for 'inconclusive' (ruling 6);
--   5. tests.outcome is a cache: a direct UPDATE raises; set_test_outcome_cache writes it;
--   6. replace_route_conditions refuses to drop a stamped condition (raw text equality, no identity in SQL),
--      accepts the same array with the element carried verbatim, and accepts a declared drop;
--   7. the delete audit: deleting a check_outcomes row leaves a check_outcome_removals row.
-- Any failed assertion raises → psql exits non-zero → everything rolls back.
--
-- Run:  docker exec -i supabase_db_<ref> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--         < scripts/guards/check-outcomes-guard.sql

\set ON_ERROR_STOP on
begin;

do $$
declare
  v_co    constant uuid := 'cccccccc-0000-4000-8000-00000000c0c0';
  v_ident constant text := repeat('a', 64);          -- a 64-hex identity stamped "by TS" for the proof
  v_ident2 constant text := repeat('b', 64);
  v_route uuid; v_leg uuid; v_test uuid; v_test2 uuid;
  v_r1 jsonb; v_r2 jsonb; v_r3 jsonb; v_id1 uuid; v_id2 uuid; v_id3 uuid;
  v_n int; v_live int; v_raised boolean;
  v_owner uuid;
begin
  select id into v_owner from auth.users limit 1;
  insert into public.companies (id, name, created_by, frozen) values (v_co, 'GUARD check outcomes', v_owner, false);
  insert into public.routes (id, company_id, user_id, category, title, level, relevance_state, what_would_have_to_be_true)
    values (gen_random_uuid(), v_co, v_owner, 'fix', 'GUARD route', 'route', 'active',
            '[{"condition":"guard condition A","satisfied_flag":false,"checked_at":"2026-09-12T10:00:00Z"},{"condition":"guard condition B","satisfied_flag":false}]'::jsonb)
    returning id into v_route;
  insert into public.routes (id, company_id, user_id, category, title, level, parent_id, relevance_state, provenance_type, what_would_have_to_be_true)
    values (gen_random_uuid(), v_co, v_owner, 'fix', 'GUARD leg', 'leg', v_route, 'active', 'internal_hypothesis',
            '[{"condition":"guard condition A","satisfied_flag":false,"leg_class":"test"}]'::jsonb)
    returning id into v_leg;
  insert into public.tests (id, company_id, action_id, hypothesis, expected_positive_signal, expected_negative_signal, result, no_test_needed, source)
    values (gen_random_uuid(), v_co, v_leg, 'guard hypothesis', 'pos', 'neg', null, false, 'generate-leg-tests:guard')
    returning id into v_test;
  insert into public.tests (id, company_id, action_id, hypothesis, expected_positive_signal, expected_negative_signal, result, no_test_needed, source)
    values (gen_random_uuid(), v_co, v_leg, 'guard hypothesis 2', 'pos', 'neg', null, false, 'generate-leg-tests:guard')
    returning id into v_test2;

  -- ── 2. supersession through the sanctioned entry point ─────────────────────────────────────────
  v_r1 := public.record_check_outcome(v_co, v_ident, 'condition_check', 'unsatisfied', 'guard condition A', '{}'::jsonb, null, '{}', 1, null);
  v_id1 := (v_r1->>'id')::uuid;
  if (v_r1->>'superseded_id') is not null then raise exception 'step 2: first record must supersede nothing'; end if;
  v_r2 := public.record_check_outcome(v_co, v_ident, 'condition_check', 'satisfied', 'guard condition A', '{}'::jsonb, null, '{}', 1, null);
  v_id2 := (v_r2->>'id')::uuid;
  if (v_r2->>'superseded_id')::uuid is distinct from v_id1 then raise exception 'step 2: second record must supersede the first'; end if;
  select count(*) into v_live from public.check_outcomes where company_id = v_co and subject_identity = v_ident and check_kind = 'condition_check' and check_version = 1 and superseded_by is null;
  if v_live <> 1 then raise exception 'step 2: expected exactly 1 live row, got %', v_live; end if;
  select count(*) into v_n from public.check_outcomes where company_id = v_co and subject_identity = v_ident;
  if v_n <> 2 then raise exception 'step 2: history must be kept (2 rows), got %', v_n; end if;
  if (select verdict from public.check_outcomes where id = v_id1) <> 'unsatisfied' then raise exception 'step 2: the superseded row keeps its verdict'; end if;
  -- the live partial index refuses a second live row written around the RPC
  v_raised := false;
  begin
    insert into public.check_outcomes (company_id, subject_identity, check_kind, check_version, verdict, subject_text)
      values (v_co, v_ident, 'condition_check', 1, 'unsatisfied', 'guard condition A');
  exception when unique_violation then v_raised := true; end;
  if not v_raised then raise exception 'step 2: live partial unique index did not refuse a second live row'; end if;

  -- ── 1. append-only ──────────────────────────────────────────────────────────────────────────────
  v_raised := false;
  begin
    update public.check_outcomes set verdict = 'unsatisfied' where id = v_id2;
  exception when others then v_raised := true; end;
  if not v_raised then raise exception 'step 1: verdict UPDATE must raise'; end if;
  v_raised := false;
  begin
    update public.check_outcomes set subject_text = 'edited' where id = v_id2;
  exception when others then v_raised := true; end;
  if not v_raised then raise exception 'step 1: subject_text UPDATE must raise'; end if;
  v_raised := false;
  begin
    update public.check_outcomes set superseded_by = v_id2 where id = v_id1;  -- already set to v_id2 → same value ok; set to another → raise
    update public.check_outcomes set superseded_by = gen_random_uuid() where id = v_id1;
  exception when others then v_raised := true; end;
  if not v_raised then raise exception 'step 1: superseded_by must be settable once'; end if;

  -- withdrawn: supersedes, no live verdict
  v_r3 := public.record_check_outcome(v_co, v_ident, 'condition_check', 'withdrawn', 'guard condition A', '{}'::jsonb, 'guard withdraw', '{}', 1, null);
  v_id3 := (v_r3->>'id')::uuid;
  if (v_r3->>'superseded_id')::uuid is distinct from v_id2 then raise exception 'withdrawn must supersede the live row'; end if;
  select count(*) into v_live from public.check_outcomes where company_id = v_co and subject_identity = v_ident and superseded_by is null and verdict <> 'withdrawn';
  if v_live <> 0 then raise exception 'withdrawn must leave no live verdict, got %', v_live; end if;

  -- ── 3. check_version ────────────────────────────────────────────────────────────────────────────
  perform public.record_check_outcome(v_co, v_ident2, 'leg_test', 'failed', 'guard condition A', '{}'::jsonb, null, '{}', 1, null);
  perform public.record_check_outcome(v_co, v_ident2, 'leg_test', 'passed', 'guard condition A', '{}'::jsonb, null, '{}', 2, null);
  select count(*) into v_live from public.check_outcomes where company_id = v_co and subject_identity = v_ident2 and superseded_by is null;
  if v_live <> 2 then raise exception 'step 3: v1 and v2 must be separate live rows, got %', v_live; end if;
  if (select verdict from public.check_outcomes where company_id = v_co and subject_identity = v_ident2 and check_version = 1 and superseded_by is null) <> 'failed' then
    raise exception 'step 3: the v2 record must not supersede the v1 row';
  end if;
  -- kind/verdict consistency
  v_raised := false;
  begin
    perform public.record_check_outcome(v_co, v_ident2, 'condition_check', 'failed', 'x', '{}'::jsonb, null, '{}', 1, null);
  exception when others then v_raised := true; end;
  if not v_raised then raise exception 'step 3: condition_check cannot carry a leg_test verdict'; end if;

  -- ── 5. tests.outcome is a cache ─────────────────────────────────────────────────────────────────
  v_raised := false;
  begin
    update public.tests set outcome = 'failed' where id = v_test;
  exception when others then v_raised := true; end;
  if not v_raised then raise exception 'step 5: direct tests.outcome write must raise'; end if;
  v_n := public.set_test_outcome_cache(v_test, 'failed');
  if v_n <> 1 then raise exception 'step 5: set_test_outcome_cache must write the cache'; end if;
  if (select outcome from public.tests where id = v_test) <> 'failed' then raise exception 'step 5: cache not written'; end if;
  perform public.set_test_outcome_cache(v_test2, 'inconclusive');

  -- ── 4. a recorded outcome is preserved-class ────────────────────────────────────────────────────
  v_raised := false;
  begin
    perform public.remove_tests_for_leg_reroll(array[v_leg], 'guard');
  exception when others then v_raised := true; end;
  if not v_raised then raise exception 'step 4: remove_tests_for_leg_reroll must refuse a leg with a recorded outcome'; end if;
  if (select count(*) from public.tests where action_id = v_leg) <> 2 then raise exception 'step 4: tests must be untouched after the refusal'; end if;
  v_raised := false;
  begin
    delete from public.tests where id = v_test;   -- unaudited direct delete of a failed test
  exception when others then v_raised := true; end;
  if not v_raised then raise exception 'step 4: direct DELETE of a test with outcome=failed must raise'; end if;
  v_raised := false;
  begin
    delete from public.tests where id = v_test2;  -- inconclusive is preserved-class too (ruling 6)
  exception when others then v_raised := true; end;
  if not v_raised then raise exception 'step 4: direct DELETE of a test with outcome=inconclusive must raise'; end if;
  -- clear the cache and the leg re-roll delete goes through again
  perform public.set_test_outcome_cache(v_test, null);
  perform public.set_test_outcome_cache(v_test2, null);
  v_n := public.remove_tests_for_leg_reroll(array[v_leg], 'guard');
  if v_n <> 2 then raise exception 'step 4: with no outcome the re-roll delete must proceed (got %)', v_n; end if;

  -- ── 6. replace_route_conditions ─────────────────────────────────────────────────────────────────
  v_raised := false;
  begin
    perform public.replace_route_conditions(v_route, '[{"condition":"guard condition B","satisfied_flag":false}]'::jsonb, 'guard', null);
  exception when others then v_raised := true; end;
  if not v_raised then raise exception 'step 6: dropping a stamped condition must be refused'; end if;
  if (select jsonb_array_length(what_would_have_to_be_true) from public.routes where id = v_route) <> 2 then raise exception 'step 6: refused write must leave the array intact'; end if;
  -- reworded stamped text (raw equality) is a drop too
  v_raised := false;
  begin
    perform public.replace_route_conditions(v_route, '[{"condition":"guard condition A (reworded)","satisfied_flag":false,"checked_at":"2026-09-12T10:00:00Z"}]'::jsonb, 'guard', null);
  exception when others then v_raised := true; end;
  if not v_raised then raise exception 'step 6: rewording a stamped condition must be refused'; end if;
  -- stamped element carried verbatim + siblings replaced → accepted
  v_r1 := public.replace_route_conditions(v_route, '[{"condition":"guard condition A","satisfied_flag":false,"checked_at":"2026-09-12T10:00:00Z"},{"condition":"guard condition C","satisfied_flag":false}]'::jsonb, 'guard', null);
  if (v_r1->>'written')::int <> 2 then raise exception 'step 6: verbatim carry must be accepted'; end if;
  -- declared drop → accepted and reported
  v_r1 := public.replace_route_conditions(v_route, '[{"condition":"guard condition C","satisfied_flag":false}]'::jsonb, 'guard', 'guard: declared drop');
  if jsonb_array_length(v_r1->'dropped_checked') <> 1 then raise exception 'step 6: declared drop must report the dropped stamped condition'; end if;

  -- ── 7. delete audit + cascade (deleting a decision never revives the one it superseded) ─────────
  perform set_config('app.check_outcome_removal_reason', 'guard: fixture teardown', true);
  delete from public.check_outcomes where id = v_id3;
  if (select count(*) from public.check_outcome_removals where outcome_id in (v_id1, v_id2, v_id3) and removal_reason = 'guard: fixture teardown') <> 3 then
    raise exception 'step 7: deleting the closing decision must cascade through its chain, each row audited';
  end if;
  if (select count(*) from public.check_outcomes where company_id = v_co and subject_identity = v_ident) <> 0 then
    raise exception 'step 7: no superseded row may be revived as live';
  end if;

  raise notice 'check-outcomes-guard: all steps green (rolling back)';
end $$;

rollback;
