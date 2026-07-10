-- Struck-preservation guard — recorded decisions survive signal loss, at the
-- DATABASE level, not just in the reconcile's code path.
--
-- The R2 prune's victim selection now exempts struck claims (prunePolicy.ts),
-- but defense-in-depth: the delete-audit trigger REFUSES any delete of a
-- struck claim unless an explicit relevance category was declared through
-- remove_claim (wrong_entity | excluded_source | fabricated_extraction).
-- 'signals_gone' is NOT sufficient for a struck claim — signal loss is
-- precisely what struck must survive. Raw DELETEs of struck rows now fail.
--
-- KNOWN CONSEQUENCE (deliberate): a company-level FK cascade delete will now
-- REFUSE if the company holds struck claims — destroying recorded decisions
-- requires explicitly removing (or restoring) them first.

create or replace function public.claims_delete_audit()
returns trigger
language plpgsql
as $$
declare
  v_category text := coalesce(nullif(current_setting('app.claim_removal_category', true), ''), 'unaudited_direct_delete');
begin
  if old.status = 'struck' and v_category not in ('wrong_entity','excluded_source','fabricated_extraction') then
    raise exception 'claim % is STRUCK — a recorded decision. Deletes require remove_claim with an explicit relevance category (or restore it first); category % refused (struck-preservation law)',
      old.id, v_category;
  end if;

  insert into public.claim_removals (company_id, claim_statement, statement_identity, provenance, reason_category, actor)
  values (
    old.company_id,
    old.statement,
    encode(digest(lower(regexp_replace(old.statement, '\s+', ' ', 'g')), 'sha256'), 'hex'),
    old.provenance,
    v_category,
    nullif(current_setting('app.claim_removal_actor', true), '')
  );
  return old;
end;
$$;

-- Bulk removal gets a clearer, earlier refusal (the trigger would abort the
-- whole statement anyway — this names the law before any row moves).
create or replace function public.remove_claims_bulk(
  p_claim_ids uuid[],
  p_reason_category text,
  p_actor text default null
) returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  if p_reason_category not in ('wrong_entity','excluded_source','fabricated_extraction','signals_gone') then
    raise exception 'bulk claim removal requires a declared audit category (wrong_entity | excluded_source | fabricated_extraction | signals_gone)';
  end if;
  if exists (select 1 from public.claims where id = any(p_claim_ids) and status = 'struck') then
    raise exception 'bulk removal cannot touch STRUCK claims — recorded decisions survive signal loss; use remove_claim per claim (struck-preservation law)';
  end if;

  perform set_config('app.claim_removal_category', p_reason_category, true);
  perform set_config('app.claim_removal_actor', coalesce(p_actor, ''), true);

  delete from public.claims where id = any(p_claim_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
