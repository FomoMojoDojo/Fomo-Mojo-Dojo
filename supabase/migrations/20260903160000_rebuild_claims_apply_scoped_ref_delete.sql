-- RB-2 — rebuild_claims_apply: scope the claim_signal_refs delete to the claims the rebuild OWNS.
--
-- DEFECT (found 2026-09-03 on Geniant, systemic: Edgewood / Sonos / CB2 / FomoMojoDojo): step 1 of the
-- RB-1 wrapper (20260804120000) cleared EVERY ref for the company and step 4 re-inserted only the
-- rows the caller derived from SIGNAL CANDIDATES (evidencePhase1 mapSignalsToClaimCandidates). Refs
-- on claims the rebuild does NOT mint — own_words claims (extract-own-words, refs written at birth),
-- internal_declared and analytic claims — were deleted and never restored. Geniant: 57 own-words refs
-- written 09-02 15:32 UTC, gone after the 17:28 UTC claim_rebuild (hourly backups 16:26/17:26 UTC show
-- 77 refs incl. 57 own-words; 18:26 UTC shows 26, all stamped 17:28:55). The public gap worker's
-- declared side ("public_observed claims backed by a client_voice signal") then lost its own-words and
-- fell to whatever inference claims happened to be client_voice-backed.
--
-- FIX (operator ruling, option i): delete ONLY refs whose claim the rebuild owns — a claim carried in
-- p_claim_rows (a candidate, about to be re-inserted from p_ref_rows) or a claim in p_prune_ids (about
-- to be removed; its refs cascade anyway). Every other ref — own-words-born, internal_declared,
-- analytic, struck-preserved — is not rebuild-owned and is left untouched. Transaction boundary,
-- step ordering, the RB-1 probe seams and the G-STATE step are byte-for-byte unchanged.
--
-- Guard: scripts/guards/rebuild-refs-scoped-guard.sql (planted own-words ref must SURVIVE; a planted
-- candidate ref must be REPLACED). Red against the RB-1 body, green against this one.

create or replace function public.rebuild_claims_apply(
  p_company_id    uuid,
  p_claim_rows    jsonb,             -- array of claim upsert objects (each carries its stable id)
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
  -- 1. DESTRUCTIVE (SCOPED, RB-2): clear refs ONLY on the claims this rebuild owns — the candidate
  --    claims carried in p_claim_rows (rebuilt from p_ref_rows in step 4) and the prune victims.
  --    Refs on claims the rebuild does not mint (own_words, internal_declared, analytic,
  --    struck-preserved) are NOT rebuild-owned and must survive a full refresh unchanged.
  -- destructive-ok: scoped to the candidate + prune claim ids of THIS rebuild, re-inserted in step 4
  --   inside the same transaction; refs on non-rebuild-owned claims are never touched (guard RB-2).
  delete from public.claim_signal_refs
  where company_id = p_company_id
    and (
      claim_id in (
        select (r->>'id')::uuid
        from jsonb_array_elements(coalesce(p_claim_rows, '[]'::jsonb)) r
        where r->>'id' is not null
      )
      or claim_id = any(coalesce(p_prune_ids, '{}'::uuid[]))
    );
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
