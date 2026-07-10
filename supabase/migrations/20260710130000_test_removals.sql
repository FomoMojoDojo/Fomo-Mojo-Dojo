-- CH-0a — tests preservation + audit, at the DATABASE level.
-- Mirrors the claims model verbatim: claim_removals + claims_delete_audit +
-- remove_claim/remove_claims_bulk (47d11d6 + 93271d4). Same GUC pattern, same
-- default, same refusal-before-audit shape.
--
-- R1 (operator ruling): PRESERVATION IS DECIDED BY PROOF, NOT PROVENANCE.
-- A test is PRESERVED-CLASS if ANY of:
--   - source LIKE 'manual\_%'            (operator-authored)
--   - result IS NOT NULL                 (a recorded outcome is a fact, not a hypothesis)
--   - no_test_needed with an operator-supplied reason
-- A preserved-class test's DELETE is REFUSED unless an explicit relevance
-- category was declared through remove_test. Every other test may be deleted —
-- but NEVER silently: the trigger writes a test_removals row for EVERY delete
-- on EVERY path, including FK-cascaded ones (tests.action_id -> routes ON
-- DELETE CASCADE — cascaded child deletes fire row triggers; claims_delete_audit
-- already proves it in this database by aborting company teardowns).
--
-- R2: 'leg_rerolled' is INSUFFICIENT for a preserved-class test — regeneration
-- is the thing preservation exists to survive (mirrors 'signals_gone' being
-- insufficient for struck claims).
--
-- R3: ONE AUTHORITY, on tests. No trigger on routes. This one trigger reaches
-- all four destroyers: the leg re-roll, research-company §7, useJobSteps
-- removeJourneyMap, and company teardown.
--
-- KNOWN CONSEQUENCE (deliberate, mirrors struck-preservation): deleting a LEG
-- that carries a preserved-class test aborts the whole statement, and a company
-- teardown REFUSES while preserved-class tests exist — teardown means
-- resolving them first via remove_test (or recording their removal reasons).
--
-- IDENTITY GAP (deliberate): NO statement_identity column. The one authoritative
-- normalization (normalizeForHash, contentIdentity.ts) lives in TypeScript and
-- is not reachable from plpgsql; a SQL re-implementation is a parity bug this
-- project has already paid for once (PCT-1). The RAW hypothesis is stored
-- instead — identity can be derived later by the TS authority if ever needed.

create table public.test_removals (
  id                        uuid primary key default gen_random_uuid(),
  -- NO foreign key on company_id, ON PURPOSE: the audit must survive company
  -- teardown exactly as claim_removals does (which also carries no FK).
  company_id                uuid not null,
  -- the full belief payload — raw, uninterpreted (identity gap noted above)
  hypothesis                text not null,
  expected_positive_signal  text,
  expected_negative_signal  text,
  result                    text,
  no_test_needed            boolean,
  no_test_needed_reason     text,
  test_source               text,
  -- the dying leg's context. action_id always comes from the test row itself;
  -- title/condition/parent-route are best-effort: on an FK cascade the leg is
  -- already deleted when this trigger fires, so they record NULL. The sanctioned
  -- re-roll path (remove_tests_for_leg_reroll) deletes tests BEFORE the caller
  -- deletes the legs precisely so the declared path captures full context.
  action_id                 uuid not null,
  leg_title                 text,
  leg_condition             text,
  parent_route_title        text,
  reason_category           text not null check (reason_category in
    ('wrong_entity','excluded_source','fabricated_extraction','leg_rerolled','unaudited_direct_delete')),
  actor                     text,
  removed_at                timestamptz not null default now()
);

-- ── The audit trigger: NO test delete escapes it. Category/actor arrive via
-- txn-local GUCs set ONLY by the sanctioned RPCs below; an undeclared delete is
-- recorded honestly as 'unaudited_direct_delete'. Preserved-class deletes are
-- refused BEFORE the audit insert (the statement aborts; nothing moves).
create or replace function public.tests_delete_audit()
returns trigger
language plpgsql
as $$
declare
  v_category text := coalesce(nullif(current_setting('app.test_removal_category', true), ''), 'unaudited_direct_delete');
  v_proofs text[] := '{}';
  v_leg_title text;
  v_leg_condition text;
  v_parent_route_title text;
begin
  -- R1: preservation is decided by proof, not provenance.
  if old.source like 'manual\_%' then
    v_proofs := array_append(v_proofs, 'operator-authored (source manual_)');
  end if;
  if old.result is not null then
    v_proofs := array_append(v_proofs, 'a recorded result exists');
  end if;
  if old.no_test_needed and nullif(btrim(coalesce(old.no_test_needed_reason, '')), '') is not null then
    v_proofs := array_append(v_proofs, 'no-test-needed with an operator-supplied reason');
  end if;

  if array_length(v_proofs, 1) is not null
     and v_category not in ('wrong_entity','excluded_source','fabricated_extraction') then
    raise exception 'test % is PRESERVED-CLASS [%] — preservation is decided by proof, not provenance. Deletes require remove_test with an explicit relevance category (wrong_entity | excluded_source | fabricated_extraction); category % refused — regeneration is the thing preservation exists to survive (test-preservation law)',
      old.id, array_to_string(v_proofs, '; '), v_category;
  end if;

  -- Best-effort leg context (NULL when the leg died first — FK cascade path).
  select r.title,
         r.what_would_have_to_be_true->0->>'condition',
         p.title
    into v_leg_title, v_leg_condition, v_parent_route_title
  from public.routes r
  left join public.routes p on p.id = r.parent_id
  where r.id = old.action_id;

  insert into public.test_removals (
    company_id, hypothesis, expected_positive_signal, expected_negative_signal,
    result, no_test_needed, no_test_needed_reason, test_source,
    action_id, leg_title, leg_condition, parent_route_title,
    reason_category, actor
  ) values (
    old.company_id, old.hypothesis, old.expected_positive_signal, old.expected_negative_signal,
    old.result, old.no_test_needed, old.no_test_needed_reason, old.source,
    old.action_id, v_leg_title, v_leg_condition, v_parent_route_title,
    v_category,
    nullif(current_setting('app.test_removal_actor', true), '')
  );
  return old;
end;
$$;

create trigger tests_delete_audit
  before delete on public.tests
  for each row
  execute function public.tests_delete_audit();

-- ── remove_test: the SOLE sanctioned path for deleting a preserved-class test.
-- Validation + declaring category/actor for the trigger; the trigger owns the
-- audit write (no manual insert — it would double-audit; remove_claim v2 law).
create or replace function public.remove_test(
  p_test_id uuid,
  p_reason_category text,
  p_actor text default null
) returns void
language plpgsql
as $$
begin
  if p_reason_category in ('leg_rerolled', 'unaudited_direct_delete') then
    raise exception 'remove_test refuses category "%": leg_rerolled can never remove a preserved-class test (regeneration is the thing preservation exists to survive), and unaudited_direct_delete exists only as the trigger''s honest verdict on deletes that declared nothing', p_reason_category;
  end if;
  if p_reason_category not in ('wrong_entity','excluded_source','fabricated_extraction') then
    raise exception 'manual test removal requires a relevance-only reason category (wrong_entity | excluded_source | fabricated_extraction)';
  end if;
  if not exists (select 1 from public.tests where id = p_test_id) then
    raise exception 'test % not found', p_test_id;
  end if;

  perform set_config('app.test_removal_category', p_reason_category, true);
  perform set_config('app.test_removal_actor', coalesce(p_actor, ''), true);

  delete from public.tests where id = p_test_id;
end;
$$;

-- ── The declared path for the leg re-roll (CH-0b wires routeLegSynthesis.ts to
-- this; until then a re-roll's cascaded test deletes audit honestly as
-- 'unaudited_direct_delete').
--
-- CHOSEN SHAPE: an RPC, not a connection-scoped GUC. Two reasons:
--   1. The category GUC is transaction-local by design (set_config(..., true)),
--      and PostgREST/supabase-js gives app code no way to set a GUC and delete
--      in the same transaction — an RPC is the only reachable declared path
--      from the edge functions (exactly why remove_claim is an RPC). A
--      connection-scoped GUC would leak across pooled connections and mislabel
--      unrelated deletes.
--   2. It deletes the tests BEFORE the caller deletes the legs, so the audit
--      rows capture the dying leg's context (title / condition / parent route)
--      that a post-leg-delete cascade can no longer see.
-- Early refusal names the law before any row moves (remove_claims_bulk law);
-- the trigger would abort the whole statement anyway.
create or replace function public.remove_tests_for_leg_reroll(
  p_leg_ids uuid[],
  p_actor text default null
) returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  if exists (
    select 1 from public.tests t
    where t.action_id = any(p_leg_ids)
      and (t.source like 'manual\_%'
           or t.result is not null
           or (t.no_test_needed and nullif(btrim(coalesce(t.no_test_needed_reason, '')), '') is not null))
  ) then
    raise exception 'leg re-roll cannot remove PRESERVED-CLASS tests (operator-authored, recorded result, or reasoned no-test-needed) — regeneration is the thing preservation exists to survive; resolve them first via remove_test (test-preservation law)';
  end if;

  perform set_config('app.test_removal_category', 'leg_rerolled', true);
  perform set_config('app.test_removal_actor', coalesce(p_actor, ''), true);

  delete from public.tests where action_id = any(p_leg_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
