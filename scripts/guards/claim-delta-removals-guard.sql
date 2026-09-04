-- GUARD — claim_deltas delete audit + observed_own_host override refusal (migrations 20260903200000 / 210000).
--
-- Runs against the LOCAL database inside ONE transaction that is ALWAYS rolled back, on the ScratchCo
-- Backstop Proof fixture (dddddddd-0000-4000-8000-000000000001). Proves, in order:
--   1. a bare DELETE on claim_deltas with NO app.delta_removal_reason RAISES (un-reasoned removal impossible);
--   2. with the reason set, the delete succeeds and ONE removal row holds the full snapshot + reason;
--   3. delete_claim_deltas_audited(company, ids, reason) deletes + audits with that reason; an empty reason RAISES;
--   4. a claims delete CASCADES with reason 'claims_delete_cascade:<claim id>' (no caller reason needed);
--   5. set_relevance_override REFUSES an identity whose live delta row carries observed_own_host = true,
--      and still accepts the same call on a row without the marker;
--   6. the frozen company (CB1) is refused by the audited deleter before any read.
-- Any failed assertion raises → psql exits non-zero → everything rolls back.
--
-- RED against the schema WITHOUT the migrations (no trigger: step 1's bare delete succeeds; no column).
-- GREEN after 20260903200000 + 20260903210000 are applied.
--
-- Run:  docker exec -i supabase_db_<ref> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--         < scripts/guards/claim-delta-removals-guard.sql

\set ON_ERROR_STOP on
begin;

do $$
declare
  v_co    constant uuid := 'dddddddd-0000-4000-8000-000000000001';
  v_cb1   constant uuid := '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc';
  v_decl  constant uuid := 'eeeeeeee-0000-4000-8000-00000000d0d1';
  v_obs   constant uuid := 'eeeeeeee-0000-4000-8000-00000000d0d2';
  v_obs2  constant uuid := 'eeeeeeee-0000-4000-8000-00000000d0d3';
  v_d1 uuid; v_d2 uuid; v_d3 uuid; v_d4 uuid; v_d5 uuid;
  v_n int;
  v_snap jsonb;
  v_reason text;
  v_raised boolean := false;
  v_msg text;
begin
  insert into public.claims (id, company_id, statement, claim_type, provenance, topic, status)
  values (v_decl, v_co, 'GUARD declared statement', 'own_words', 'public_observed', 'own_words', 'active'),
         (v_obs,  v_co, 'GUARD observed statement', 'inference', 'public_observed', 'market', 'active'),
         (v_obs2, v_co, 'GUARD observed statement two', 'inference', 'public_observed', 'market', 'active');
  insert into public.claim_deltas (company_id, declared_claim_id, public_claim_id, delta_type, pairing_basis, content_identity, pairing_kind)
  values (v_co, v_decl, v_obs, 'echoed', 'judge_confirmed', 'guard-removal-1', 'public_vs_public') returning id into v_d1;
  insert into public.claim_deltas (company_id, declared_claim_id, public_claim_id, delta_type, pairing_basis, content_identity, pairing_kind)
  values (v_co, v_decl, v_obs, 'echoed', 'judge_confirmed', 'guard-removal-2', 'public_vs_public') returning id into v_d2;
  insert into public.claim_deltas (company_id, declared_claim_id, public_claim_id, delta_type, pairing_basis, content_identity, pairing_kind)
  values (v_co, v_decl, v_obs, 'echoed', 'judge_confirmed', 'guard-removal-3', 'public_vs_public') returning id into v_d3;
  insert into public.claim_deltas (company_id, declared_claim_id, public_claim_id, delta_type, pairing_basis, content_identity, pairing_kind)
  values (v_co, v_decl, v_obs2, 'echoed', 'judge_confirmed', 'guard-removal-4', 'public_vs_public') returning id into v_d4;
  insert into public.claim_deltas (company_id, declared_claim_id, public_claim_id, delta_type, pairing_basis, content_identity, pairing_kind, observed_own_host)
  values (v_co, v_decl, v_obs, 'echoed', 'judge_confirmed', 'guard-own-host', 'public_vs_public', true) returning id into v_d5;

  -- 1. bare delete, no reason → RAISE (a savepoint so the block continues)
  begin
    -- destructive-ok: fixture row planted above; the trigger is expected to REFUSE this delete
    delete from public.claim_deltas where id = v_d1;
  exception when others then
    v_raised := true; v_msg := sqlerrm;
  end;
  if not v_raised then raise exception 'RED (1): a bare delete with no app.delta_removal_reason was NOT refused'; end if;
  if v_msg not like '%app.delta_removal_reason%' then raise exception 'RED (1b): refusal message does not name the GUC: %', v_msg; end if;
  select count(*) into v_n from public.claim_deltas where id = v_d1;
  if v_n <> 1 then raise exception 'RED (1c): the refused delete removed the row'; end if;

  -- 2. reason set → delete succeeds, one removal row with the snapshot
  perform set_config('app.delta_removal_reason', 'guard: reasoned delete', true);
  -- destructive-ok: fixture row planted above, inside a transaction that ALWAYS rolls back
  delete from public.claim_deltas where id = v_d1;
  select count(*) into v_n from public.claim_delta_removals where delta_id = v_d1;
  select row_snapshot, reason into v_snap, v_reason from public.claim_delta_removals where delta_id = v_d1 limit 1;
  if v_n <> 1 then raise exception 'RED (2a): expected exactly one removal row, found %', v_n; end if;
  if v_reason <> 'guard: reasoned delete' then raise exception 'RED (2b): reason not recorded (got %)', v_reason; end if;
  if (v_snap->>'content_identity') <> 'guard-removal-1' or (v_snap->>'delta_type') <> 'echoed' then
    raise exception 'RED (2c): snapshot does not carry the row (got %)', v_snap;
  end if;
  perform set_config('app.delta_removal_reason', '', true);

  -- 3. the sanctioned deleter audits with its reason; an empty reason raises
  select public.delete_claim_deltas_audited(v_co, array[v_d2], 'stale_sweep:public_vs_public:guard') into v_n;
  if v_n <> 1 then raise exception 'RED (3a): audited deleter returned %', v_n; end if;
  select reason into v_reason from public.claim_delta_removals where delta_id = v_d2;
  if v_reason <> 'stale_sweep:public_vs_public:guard' then raise exception 'RED (3b): audited deleter reason not recorded (got %)', v_reason; end if;
  v_raised := false;
  begin
    perform public.delete_claim_deltas_audited(v_co, array[v_d3], '   ');
  exception when others then v_raised := true;
  end;
  if not v_raised then raise exception 'RED (3c): an empty reason was accepted by the audited deleter'; end if;
  select count(*) into v_n from public.claim_deltas where id = v_d3;
  if v_n <> 1 then raise exception 'RED (3d): the refused audited delete removed the row'; end if;
  -- the deleter's reason must not leak into the session after it returns (set_config local to its txn — same
  -- txn here, so it DOES persist; clear it explicitly before the cascade step so step 4 proves its own stamp)
  perform set_config('app.delta_removal_reason', '', true);

  -- 4. a claims delete cascades with its own reason
  -- destructive-ok: fixture claim planted above (cascades v_d4 away), inside a transaction that ALWAYS rolls back
  delete from public.claims where id = v_obs2;
  select count(*) into v_n from public.claim_delta_removals where delta_id = v_d4;
  select reason into v_reason from public.claim_delta_removals where delta_id = v_d4 limit 1;
  if v_n <> 1 then raise exception 'RED (4a): cascaded delta delete was not audited'; end if;
  if v_reason <> 'claims_delete_cascade:' || v_obs2::text then raise exception 'RED (4b): cascade reason wrong (got %)', v_reason; end if;
  perform set_config('app.delta_removal_reason', '', true);

  -- 5. override refusal on an own-host observed side; accepted on a clean row
  v_raised := false;
  begin
    perform public.set_relevance_override(v_co, 'public_vs_public', 'guard-own-host', 'relevant', 'GUARD: trying to spare a self-echo');
  exception when others then v_raised := true; v_msg := sqlerrm;
  end;
  if not v_raised then raise exception 'RED (5a): an own-host pair was spared into corroboration'; end if;
  if v_msg not like '%own site%' then raise exception 'RED (5b): refusal message unclear: %', v_msg; end if;
  select count(*) into v_n from public.claim_delta_relevance_overrides where company_id = v_co and content_identity = 'guard-own-host';
  if v_n <> 0 then raise exception 'RED (5c): an override row was written despite the refusal'; end if;
  perform public.set_relevance_override(v_co, 'public_vs_public', 'guard-removal-3', 'relevant', 'GUARD: a clean pair is still spare-able');
  select relevance_provider into v_reason from public.claim_deltas where id = v_d3;
  if v_reason <> 'operator' then raise exception 'RED (5d): the clean pair did not take the override'; end if;

  -- 6. frozen refusal (CB1) through the audited deleter
  v_raised := false;
  begin
    perform public.delete_claim_deltas_audited(v_cb1, array[v_d3], 'GUARD: must be refused');
  exception when others then v_raised := true;
  end;
  if not v_raised then raise exception 'RED (6): frozen company CB1 was NOT refused'; end if;

  raise notice 'GREEN: un-reasoned delete refused; reasoned delete + audited deleter snapshot with reason; claims cascade stamps its reason; own-host override refused, clean pair accepted; CB1 refused';
end
$$;

rollback;
