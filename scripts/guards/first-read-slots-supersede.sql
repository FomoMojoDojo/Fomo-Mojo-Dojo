-- ── R6 SQL TEST — the supersede trigger fires on BOTH public_reads write paths ───────────────────
--
-- The slot layer must never outlive its source read, and the enforcement is a trigger rather than a
-- third sequential update because promoteStagedReads is NOT transactional (separate PostgREST calls).
-- A trigger is only worth that argument if it covers EVERY path that stops a read being current.
-- There are exactly two, both reached only through generate-public-read with the service-role client:
--   (A) the PROMOTE path      — _shared/publicReadPromote.ts:114  update {is_current:false, superseded_by}
--   (B) the DIRECT WRITE path — generate-public-read/index.ts:435  update {is_current:false}
-- Both are proved here, plus the staged-slot case (a slot that was never current is superseded too,
-- so it can never be promoted against a read that has moved on).
--
-- ONE transaction, ALWAYS rolled back. No company's rows are changed.
-- Run: docker exec -i supabase_db_<ref> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--        < scripts/guards/first-read-slots-supersede.sql

\set ON_ERROR_STOP on
begin;

do $$
declare
  v_co uuid; v_read uuid; v_read2 uuid;
  v_cur uuid; v_staged uuid;
  v_is_current boolean; v_sup_at timestamptz; v_reason text;
  v_fail int := 0;
begin
  select company_id, id into v_co, v_read
    from public.public_reads where is_current and kind='strategy' limit 1;
  if v_co is null then raise exception 'setup: no current strategy read to test against'; end if;

  -- ══ (A) THE PROMOTE PATH ══════════════════════════════════════════════════════════════════════
  insert into public.first_read_slots
    (company_id, kind, slots, source_read_id, model_provider, model_name, judge_model, judge_verdict,
     is_current, signed_at, signed_by)
  values (v_co, 'strategy', '{"where_to_play_line":{"text":"a seeded line long enough for the floor","citations":[]},"how_to_win_line":{"text":"a seeded line long enough for the floor","citations":[]}}'::jsonb,
          v_read, 'external_openai', 'gpt-4.1-mini', 'gpt-4.1-mini',
          '{"slots":{}}'::jsonb, true, now(), '00000000-0000-4000-8000-000000000001')
  returning id into v_cur;
  -- a STAGED slot on the same read: it must be superseded too, or it could be promoted later
  insert into public.first_read_slots
    (company_id, kind, slots, source_read_id, model_provider, model_name, judge_model, is_current)
  values (v_co, 'positioning', '{"differentiators":[],"category_context":{"text":"a seeded line long enough for the floor","citations":[]}}'::jsonb,
          v_read, 'external_openai', 'gpt-4.1-mini', 'gpt-4.1-mini', false)
  returning id into v_staged;

  -- exactly what publicReadPromote.ts:114 issues
  update public.public_reads set is_current = false, superseded_by = null where id = v_read;

  select is_current, superseded_at, superseded_reason into v_is_current, v_sup_at, v_reason
    from public.first_read_slots where id = v_cur;
  if v_is_current is not false or v_sup_at is null then
    raise notice '  FAIL (A) the promote path did not supersede the CURRENT slot (is_current=%, superseded_at=%)', v_is_current, v_sup_at;
    v_fail := v_fail + 1;
  elsif v_reason <> 'source_read_superseded' then
    raise notice '  FAIL (A) wrong reason on the current slot: %', v_reason; v_fail := v_fail + 1;
  else
    raise notice '  ok   (A) the promote path superseded the current slot in the same transaction, reason source_read_superseded';
  end if;

  select superseded_at, superseded_reason into v_sup_at, v_reason
    from public.first_read_slots where id = v_staged;
  if v_sup_at is null then
    raise notice '  FAIL (A2) a STAGED slot on the superseded read survived — it could still be promoted';
    v_fail := v_fail + 1;
  else
    raise notice '  ok   (A2) a staged slot on the superseded read was superseded too, so it can never be promoted';
  end if;

  -- ══ (B) THE DIRECT WRITE PATH ═════════════════════════════════════════════════════════════════
  -- a second current read for the same kind, then the update generate-public-read/index.ts:435 issues
  insert into public.public_reads (company_id, kind, payload, input_ledger, model_provider, model_name, is_current)
  values (v_co, 'strategy', '{}'::jsonb, '{}'::jsonb, 'external_openai', 'gpt-4.1-mini', true)
  returning id into v_read2;
  insert into public.first_read_slots
    (company_id, kind, slots, source_read_id, model_provider, model_name, judge_model, judge_verdict,
     is_current, signed_at, signed_by)
  values (v_co, 'strategy', '{"where_to_play_line":{"text":"a seeded line long enough for the floor","citations":[]},"how_to_win_line":{"text":"a seeded line long enough for the floor","citations":[]}}'::jsonb,
          v_read2, 'external_openai', 'gpt-4.1-mini', 'gpt-4.1-mini',
          '{"slots":{}}'::jsonb, true, now(), '00000000-0000-4000-8000-000000000001')
  returning id into v_cur;

  update public.public_reads set is_current = false where id = v_read2;   -- index.ts:435, no superseded_by

  select is_current, superseded_at, superseded_reason into v_is_current, v_sup_at, v_reason
    from public.first_read_slots where id = v_cur;
  if v_is_current is not false or v_sup_at is null then
    raise notice '  FAIL (B) the direct write path did not supersede the slot (is_current=%, superseded_at=%)', v_is_current, v_sup_at;
    v_fail := v_fail + 1;
  elsif v_reason <> 'source_read_superseded' then
    raise notice '  FAIL (B) wrong reason on the direct-write slot: %', v_reason; v_fail := v_fail + 1;
  else
    raise notice '  ok   (B) the direct write path superseded the slot in the same transaction, reason source_read_superseded';
  end if;

  -- ══ (C) A READ WITH SLOTS CANNOT BE DELETED UNDER THEM (ON DELETE RESTRICT) ════════════════════
  begin
    delete from public.public_reads where id = v_read2;
    raise notice '  FAIL (C) a read with slots was DELETED — the FK is not RESTRICT';
    v_fail := v_fail + 1;
  exception when foreign_key_violation then
    raise notice '  ok   (C) deleting a read that has slots is refused by ON DELETE RESTRICT';
  end;

  -- ══ (D) THE TRIGGER DOES NOT FIRE ON AN UNRELATED UPDATE ══════════════════════════════════════
  -- it is AFTER UPDATE OF is_current WHEN (old.is_current AND NOT new.is_current): a read becoming
  -- current, or any other column changing, must leave slots alone.
  insert into public.first_read_slots
    (company_id, kind, slots, source_read_id, model_provider, model_name, judge_model, judge_verdict,
     is_current, signed_at, signed_by)
  values (v_co, 'promise', '{"outcome_line":{"text":"a seeded line long enough for the floor","citations":[]}}'::jsonb,
          v_read2, 'external_openai', 'gpt-4.1-mini', 'gpt-4.1-mini',
          '{"slots":{}}'::jsonb, true, now(), '00000000-0000-4000-8000-000000000001')
  returning id into v_cur;
  update public.public_reads set model_name = 'gpt-4.1-mini-unrelated' where id = v_read2;
  update public.public_reads set is_current = true where id = v_read2;   -- false -> true: WHEN is false
  select superseded_at into v_sup_at from public.first_read_slots where id = v_cur;
  if v_sup_at is not null then
    raise notice '  FAIL (D) the trigger fired on an unrelated update or on a read BECOMING current';
    v_fail := v_fail + 1;
  else
    raise notice '  ok   (D) the trigger leaves slots alone on an unrelated update and when a read becomes current';
  end if;

  if v_fail = 0 then
    raise notice 'GREEN: the R6 trigger covers both public_reads write paths, supersedes staged slots, restricts deletes, and does not over-fire';
  else
    raise exception 'RED: % R6 supersede assertion(s) failed', v_fail;
  end if;
end
$$;

rollback;
