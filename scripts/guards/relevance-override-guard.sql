-- GUARD — durable operator relevance override (migration 20260903170000).
--
-- Runs against the LOCAL database inside ONE transaction that is ALWAYS rolled back, on the ScratchCo
-- Backstop Proof fixture (dddddddd-0000-4000-8000-000000000001). Proves, in order:
--   1. a planted RELEVANT override makes a delta row inserted with a machine 'orthogonal' read operator relevant;
--   2. a machine UPDATE back to 'orthogonal' is re-asserted to operator relevant by the trigger;
--   3. asserting relevance_provider='operator' with NO live override RAISES;
--   4. superseding the override with 'withdrawn' (via the RPC) clears the operator stamp and the next insert
--      for that identity is born NULL;
--   5. deleting the observed claim leaves the override row in place and lists it in the report view;
--   6. the RPC refuses the frozen company (CB1).
-- Any failed assertion raises → psql exits non-zero → everything rolls back.
--
-- RED against the schema WITHOUT the migration (the override table does not exist).
-- GREEN after 20260903170000 is applied.
--
-- Run:  docker exec -i supabase_db_<ref> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--         < scripts/guards/relevance-override-guard.sql

\set ON_ERROR_STOP on
begin;

do $$
declare
  v_co    constant uuid := 'dddddddd-0000-4000-8000-000000000001';
  v_cb1   constant uuid := '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc';
  v_decl  constant uuid := 'eeeeeeee-0000-4000-8000-00000000d0c1';
  v_obs   constant uuid := 'eeeeeeee-0000-4000-8000-00000000d0c2';
  v_ident constant text := 'guard-identity-0001';
  v_delta uuid;
  v_out   jsonb;
  v_verdict text; v_provider text; v_model text; v_reason text;
  v_n int;
  v_raised boolean := false;
begin
  -- fixture claims (the observed one is deleted in step 5)
  insert into public.claims (id, company_id, statement, claim_type, provenance, topic, status)
  values (v_decl, v_co, 'GUARD declared statement', 'own_words', 'public_observed', 'own_words', 'active'),
         (v_obs,  v_co, 'GUARD observed statement', 'inference', 'public_observed', 'market', 'active');

  -- 1. plant a RELEVANT override, then insert a delta row asserting a MACHINE orthogonal
  v_out := public.set_relevance_override(v_co, 'public_vs_public', v_ident, 'relevant', 'GUARD: operator spares this pair');
  insert into public.claim_deltas (id, company_id, declared_claim_id, public_claim_id, delta_type, pairing_basis, content_identity, pairing_kind,
                                   relevance_verdict, relevance_provider, relevance_model, relevance_reason)
  values (gen_random_uuid(), v_co, v_decl, v_obs, 'echoed', 'judge_confirmed', v_ident, 'public_vs_public',
          'orthogonal', 'deterministic', 'router', 'no distinctive token shared with the claim')
  returning id into v_delta;
  select relevance_verdict, relevance_provider, relevance_model, relevance_reason into v_verdict, v_provider, v_model, v_reason
    from public.claim_deltas where id = v_delta;
  if v_verdict <> 'relevant' or v_provider <> 'operator' or v_model <> 'operator_override' or v_reason <> 'GUARD: operator spares this pair' then
    raise exception 'RED (1): inserted row did not take the operator override (got % / % / % / %)', v_verdict, v_provider, v_model, v_reason;
  end if;

  -- 2. a machine UPDATE back to orthogonal is re-asserted
  update public.claim_deltas set relevance_verdict = 'orthogonal', relevance_provider = 'external_openai', relevance_model = 'gpt-4.1-mini', relevance_reason = 'judge says no'
   where id = v_delta;
  select relevance_verdict, relevance_provider into v_verdict, v_provider from public.claim_deltas where id = v_delta;
  if v_verdict <> 'relevant' or v_provider <> 'operator' then
    raise exception 'RED (2): machine update overrode the operator decision (got % / %)', v_verdict, v_provider;
  end if;

  -- 3. provider='operator' with NO live override must RAISE
  begin
    insert into public.claim_deltas (company_id, declared_claim_id, public_claim_id, delta_type, pairing_basis, content_identity, pairing_kind,
                                     relevance_verdict, relevance_provider, relevance_model, relevance_reason)
    values (v_co, v_decl, v_obs, 'echoed', 'judge_confirmed', 'guard-identity-no-override', 'public_vs_public',
            'relevant', 'operator', 'operator_override', 'forged');
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'RED (3): a writer asserted relevance_provider=operator with no live override and was NOT refused';
  end if;

  -- 4. withdraw → operator stamp cleared; next insert born NULL
  v_out := public.set_relevance_override(v_co, 'public_vs_public', v_ident, 'withdrawn', 'GUARD: hand the pair back to the machine');
  select relevance_verdict, relevance_provider into v_verdict, v_provider from public.claim_deltas where id = v_delta;
  if v_verdict is not null or v_provider is not null then
    raise exception 'RED (4a): withdrawal did not clear the operator stamp (got % / %)', v_verdict, v_provider;
  end if;
  select count(*) into v_n from public.claim_delta_relevance_overrides where company_id = v_co and content_identity = v_ident and superseded_by is null;
  if v_n <> 1 then raise exception 'RED (4b): expected exactly one live (withdrawn) override, found %', v_n; end if;
  select count(*) into v_n from public.claim_delta_relevance_overrides where company_id = v_co and content_identity = v_ident;
  if v_n <> 2 then raise exception 'RED (4c): reversal must be a NEW row (expected 2 rows, found %)', v_n; end if;
  -- destructive-ok: fixture-only row planted above, inside a transaction that ALWAYS rolls back
  delete from public.claim_deltas where id = v_delta;
  insert into public.claim_deltas (id, company_id, declared_claim_id, public_claim_id, delta_type, pairing_basis, content_identity, pairing_kind)
  values (gen_random_uuid(), v_co, v_decl, v_obs, 'echoed', 'judge_confirmed', v_ident, 'public_vs_public')
  returning id into v_delta;
  select relevance_verdict into v_verdict from public.claim_deltas where id = v_delta;
  if v_verdict is not null then raise exception 'RED (4d): row after withdrawal should be born NULL, got %', v_verdict; end if;

  -- 5. a live override outlives the observed claim and shows in the report view
  v_out := public.set_relevance_override(v_co, 'public_vs_public', v_ident, 'orthogonal', 'GUARD: operator strikes this pair');
  -- destructive-ok: fixture-only claim planted above, inside a transaction that ALWAYS rolls back (cascades the delta row away)
  delete from public.claims where id = v_obs;
  select count(*) into v_n from public.claim_delta_relevance_overrides where company_id = v_co and content_identity = v_ident and superseded_by is null and verdict = 'orthogonal';
  if v_n <> 1 then raise exception 'RED (5a): override did not outlive the observed claim'; end if;
  select count(*) into v_n from public.relevance_overrides_without_live_pair where company_id = v_co and content_identity = v_ident;
  if v_n <> 1 then raise exception 'RED (5b): orphaned override not listed in relevance_overrides_without_live_pair'; end if;

  -- 6. frozen refusal (CB1)
  v_raised := false;
  begin
    perform public.set_relevance_override(v_cb1, 'public_vs_public', 'guard-cb1', 'relevant', 'GUARD: must be refused');
  exception when others then
    v_raised := true;
  end;
  if not v_raised then raise exception 'RED (6): frozen company CB1 was NOT refused'; end if;

  raise notice 'GREEN: override wins on insert + update; forged operator provenance refused; withdrawal clears + next row null; override outlives claim loss + reported; CB1 refused';
end
$$;

rollback;
