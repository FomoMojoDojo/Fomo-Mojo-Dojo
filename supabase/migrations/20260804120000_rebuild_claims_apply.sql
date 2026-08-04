-- RB-1 Stage 2: transactional wrapper for the signal-derived claim reconcile.
--
-- rebuildClaimsForCompany (evidencePhase1) previously ran its mutation sequence
-- as four independent PostgREST calls with NO transaction: delete-refs (163) →
-- upsert-claims (202) → prune (232) → insert-refs (258) → G-STATE (306). An abort
-- anywhere in that window left refs deleted and never restored — data worse than
-- before the run started.
--
-- This function moves the ENTIRE mutation sequence behind one transaction.
-- PostgREST executes every rpc() call inside a single transaction, so any
-- exception here — a trigger, an FK, or the test probe below — rolls back every
-- step. A partial failure can no longer leave a half-rebuilt pool.
--
-- What is INSIDE the boundary: delete-refs, upsert-claims, prune, insert-refs,
-- G-STATE updates. What is OUTSIDE (computed in TS BEFORE this call, all pure or
-- read-only — the claim reconcile makes NO model/network calls): loading signals,
-- mapSignalsToClaimCandidates, deterministic id hashing, loading existing/manual
-- claims, selectPruneVictims (the RB-1 provenance-scoped prune authority), and the
-- G-STATE inference. Only the already-computed payloads cross into the transaction.
--
-- Prune ids are provenance-scoped to public_observed in TS (selectPruneVictims);
-- remove_claims_bulk re-guards struck claims here as defence in depth.

create or replace function public.rebuild_claims_apply(
  p_company_id    uuid,
  p_claim_rows    jsonb,             -- array of claim upsert objects
  p_prune_ids     uuid[],            -- public_observed stale claim ids (from selectPruneVictims)
  p_ref_rows      jsonb,             -- array of {claim_id, signal_id, relationship}
  p_state_updates jsonb,             -- { "<state>": ["<claim_id>", ...] } (G-STATE)
  p_probe_fail    text default null  -- TEST-ONLY atomicity seam; MUST be null in production
) returns jsonb
language plpgsql
as $$
declare
  v_upserted int := 0;
  v_pruned int := 0;
  v_refs int := 0;
  v_state_updated int := 0;
  v_tmp int := 0;
  v_deleted int := 0;
  v_state text;
  v_ids uuid[];
begin
  -- 1. DESTRUCTIVE: clear this company's refs (rebuilt in step 4).
  delete from public.claim_signal_refs where company_id = p_company_id;
  get diagnostics v_deleted = row_count;

  -- TEST-ONLY: prove the partial ref-delete rolls back. The NOTICE (which
  -- survives rollback) records that the delete really executed inside the txn;
  -- the exception then unwinds it, so callers observe refs unchanged.
  if p_probe_fail = 'after_delete' then
    raise notice 'RB-1 probe: ref-delete executed inside txn, % row(s) removed — about to force rollback', v_deleted;
    raise exception 'RB-1 probe: forced failure after ref-delete';
  end if;

  -- 2. CONSTRUCTIVE: upsert candidate claims. Explicit column list so unlisted
  --    columns (status, created_at, …) keep their table defaults on insert and
  --    are untouched on update — matching the prior supabase upsert exactly.
  --    status is never set here, so the status guard trigger never fires; a
  --    changed provenance would trip the immutability guard and roll the whole
  --    transaction back (safer than the old partial-write behaviour).
  insert into public.claims (
    id, company_id, statement, topic, claim_type,
    outside_support_count, organization_support_count, customer_support_count,
    triangulation_state, confidence, provenance, revalidation_flag, raw_payload, state
  )
  select
    (r->>'id')::uuid, (r->>'company_id')::uuid, r->>'statement', r->>'topic', r->>'claim_type',
    (r->>'outside_support_count')::int, (r->>'organization_support_count')::int, (r->>'customer_support_count')::int,
    r->>'triangulation_state', r->>'confidence', r->>'provenance', (r->>'revalidation_flag')::boolean,
    coalesce(r->'raw_payload', '{}'::jsonb), r->>'state'
  from jsonb_array_elements(coalesce(p_claim_rows, '[]'::jsonb)) r
  on conflict (id) do update set
    statement                  = excluded.statement,
    topic                      = excluded.topic,
    claim_type                 = excluded.claim_type,
    outside_support_count      = excluded.outside_support_count,
    organization_support_count = excluded.organization_support_count,
    customer_support_count     = excluded.customer_support_count,
    triangulation_state        = excluded.triangulation_state,
    confidence                 = excluded.confidence,
    provenance                 = excluded.provenance,
    revalidation_flag          = excluded.revalidation_flag,
    raw_payload                = excluded.raw_payload,
    state                      = excluded.state;
  get diagnostics v_upserted = row_count;

  if p_probe_fail = 'after_upsert' then
    raise exception 'RB-1 probe: forced failure after claim-upsert';
  end if;

  -- 3. DESTRUCTIVE: prune stale public_observed claims. Ids are already
  --    provenance-scoped in TS; remove_claims_bulk re-guards struck + audits.
  if array_length(p_prune_ids, 1) is not null then
    v_pruned := remove_claims_bulk(p_prune_ids, 'signals_gone', 'evidencePhase1:R2');
  end if;

  if p_probe_fail = 'after_prune' then
    raise exception 'RB-1 probe: forced failure after prune';
  end if;

  -- 4. CONSTRUCTIVE: re-insert refs.
  insert into public.claim_signal_refs (company_id, claim_id, signal_id, relationship)
  select p_company_id, (r->>'claim_id')::uuid, (r->>'signal_id')::uuid, r->>'relationship'
  from jsonb_array_elements(coalesce(p_ref_rows, '[]'::jsonb)) r;
  get diagnostics v_refs = row_count;

  -- 5. G-STATE: apply signal-derived state updates (TS already skipped focus/flow).
  for v_state, v_ids in
    select key, array(select jsonb_array_elements_text(value))::uuid[]
    from jsonb_each(coalesce(p_state_updates, '{}'::jsonb))
  loop
    update public.claims set state = v_state where id = any(v_ids);
    get diagnostics v_tmp = row_count;
    v_state_updated := v_state_updated + v_tmp;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'upserted', v_upserted,
    'pruned', v_pruned,
    'refs', v_refs,
    'state_updated', v_state_updated
  );
end;
$$;

grant execute on function public.rebuild_claims_apply(uuid, jsonb, uuid[], jsonb, jsonb, text) to service_role;
