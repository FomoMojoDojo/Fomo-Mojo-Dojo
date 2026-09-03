-- GUARD RB-2 — rebuild_claims_apply must not delete refs it does not own.
--
-- Runs against the LOCAL database inside ONE transaction that is ALWAYS rolled back (the fixture is
-- never changed). Uses the ScratchCo Backstop Proof fixture (dddddddd-0000-4000-8000-000000000001):
--   1. plant an own-words claim (extract-own-words shape) with a ref to the fixture's signal;
--   2. plant a candidate-style inference claim with an OLD ref (relationship 'supports');
--   3. call rebuild_claims_apply with the candidate as the ONLY claim row, no prune ids, and a
--      REPLACEMENT ref row for the candidate (relationship 'qualifies');
--   4. assert: the own-words ref SURVIVED; the candidate's old ref is GONE and the new one PRESENT.
-- Either assertion failing raises → psql exits non-zero → the transaction rolls back.
--
-- RED against the RB-1 body (20260804120000): assertion 4a fails (own-words ref vanished).
-- GREEN against RB-2 (20260903160000): both assertions hold.
--
-- Run:  docker exec -i supabase_db_<ref> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--         < scripts/guards/rebuild-refs-scoped-guard.sql

\set ON_ERROR_STOP on
begin;

do $$
declare
  v_co    constant uuid := 'dddddddd-0000-4000-8000-000000000001';
  v_sig   uuid;
  v_ow    constant uuid := 'eeeeeeee-0000-4000-8000-00000000c0de';
  v_cand  constant uuid := 'eeeeeeee-0000-4000-8000-00000000cafe';
  v_out   jsonb;
  v_ow_refs int;
  v_old_refs int;
  v_new_refs int;
begin
  select id into v_sig from public.signals where company_id = v_co order by created_at limit 1;
  if v_sig is null then
    raise exception 'GUARD SETUP: ScratchCo fixture has no signal';
  end if;

  -- 1. planted own-words claim + birth ref (extract-own-words shape; NOT a rebuild candidate)
  insert into public.claims (id, company_id, statement, claim_type, provenance, proof_category, topic, status, raw_payload)
  values (v_ow, v_co, 'GUARD planted own-words statement', 'own_words', 'public_observed', 'public_answerable', 'own_words', 'active',
          jsonb_build_object('content_identity', 'guard-ow', 'source', 'own_words_extractor'));
  insert into public.claim_signal_refs (company_id, claim_id, signal_id, relationship)
  values (v_co, v_ow, v_sig, 'supports');

  -- 2. planted candidate-style claim + OLD ref
  insert into public.claims (id, company_id, statement, topic, claim_type, outside_support_count, organization_support_count,
                             customer_support_count, triangulation_state, confidence, provenance, revalidation_flag, raw_payload, state)
  values (v_cand, v_co, 'GUARD planted candidate statement', 'market', 'inference', 1, 0, 0, 'single_source', 'low',
          'public_observed', false, '{}'::jsonb, 'outside_view');
  insert into public.claim_signal_refs (company_id, claim_id, signal_id, relationship)
  values (v_co, v_cand, v_sig, 'supports');

  -- 3. the rebuild: candidate is the only owned claim; its ref is replaced
  v_out := public.rebuild_claims_apply(
    v_co,
    jsonb_build_array(jsonb_build_object(
      'id', v_cand, 'company_id', v_co, 'statement', 'GUARD planted candidate statement', 'topic', 'market',
      'claim_type', 'inference', 'outside_support_count', 1, 'organization_support_count', 0, 'customer_support_count', 0,
      'triangulation_state', 'single_source', 'confidence', 'low', 'provenance', 'public_observed',
      'revalidation_flag', false, 'raw_payload', '{}'::jsonb, 'state', 'outside_view')),
    '{}'::uuid[],
    jsonb_build_array(jsonb_build_object('claim_id', v_cand, 'signal_id', v_sig, 'relationship', 'qualifies')),
    '{}'::jsonb
  );
  raise notice 'rebuild_claims_apply → %', v_out;

  -- 4a. own-words ref must SURVIVE
  select count(*) into v_ow_refs from public.claim_signal_refs where claim_id = v_ow;
  if v_ow_refs <> 1 then
    raise exception 'RED (4a): own-words ref did NOT survive the rebuild (found % ref rows on the planted own-words claim)', v_ow_refs;
  end if;

  -- 4b. candidate's old ref GONE, replacement PRESENT
  select count(*) into v_old_refs from public.claim_signal_refs where claim_id = v_cand and relationship = 'supports';
  select count(*) into v_new_refs from public.claim_signal_refs where claim_id = v_cand and relationship = 'qualifies';
  if v_old_refs <> 0 or v_new_refs <> 1 then
    raise exception 'RED (4b): candidate ref was not rebuilt (old=% new=%) — the delete must still own candidate refs', v_old_refs, v_new_refs;
  end if;

  raise notice 'GREEN: own-words ref survived (%), candidate ref replaced (old=% new=%)', v_ow_refs, v_old_refs, v_new_refs;
end
$$;

rollback;
