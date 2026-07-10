-- Strike Gate B rider — NO claim delete escapes the audit.
--
-- Gate A made remove_claim the sanctioned manual-delete path and gave the R2
-- prune its own audit insert, but a raw `DELETE FROM claims` (psql, a future
-- code path, anything) still vanished silently. Now a BEFORE DELETE trigger
-- writes the claim_removals row for EVERY delete; sanctioned paths declare
-- their category through a transaction-local GUC (same escape-hatch shape as
-- the INT-2 provenance backfill flag), and anything that didn't declare one is
-- recorded honestly as 'unaudited_direct_delete'.

alter table public.claim_removals
  drop constraint claim_removals_reason_category_check;
alter table public.claim_removals
  add constraint claim_removals_reason_category_check
  check (reason_category in ('wrong_entity','excluded_source','fabricated_extraction','signals_gone','unaudited_direct_delete'));

-- ── The audit trigger. Category/actor arrive via txn-local GUCs set ONLY by the
-- sanctioned RPCs below; an invalid GUC value fails the table CHECK (loud).
create or replace function public.claims_delete_audit()
returns trigger
language plpgsql
as $$
begin
  insert into public.claim_removals (company_id, claim_statement, statement_identity, provenance, reason_category, actor)
  values (
    old.company_id,
    old.statement,
    encode(digest(lower(regexp_replace(old.statement, '\s+', ' ', 'g')), 'sha256'), 'hex'),
    old.provenance,
    coalesce(nullif(current_setting('app.claim_removal_category', true), ''), 'unaudited_direct_delete'),
    nullif(current_setting('app.claim_removal_actor', true), '')
  );
  return old;
end;
$$;

create trigger claims_delete_audit
  before delete on public.claims
  for each row
  execute function public.claims_delete_audit();

-- ── remove_claim v2: the trigger now owns the audit write — the manual insert
-- is GONE (it would double-audit). The RPC's job is validation + declaring the
-- category/actor for the trigger. Relevance-only law unchanged.
create or replace function public.remove_claim(
  p_claim_id uuid,
  p_reason_category text,
  p_actor text default null
) returns void
language plpgsql
as $$
begin
  if p_reason_category not in ('wrong_entity','excluded_source','fabricated_extraction') then
    raise exception 'manual claim removal requires a relevance-only reason category (wrong_entity | excluded_source | fabricated_extraction) — non-public changes must be STRUCK, not deleted';
  end if;
  if not exists (select 1 from public.claims where id = p_claim_id) then
    raise exception 'claim % not found', p_claim_id;
  end if;

  perform set_config('app.claim_removal_category', p_reason_category, true);
  perform set_config('app.claim_removal_actor', coalesce(p_actor, ''), true);

  delete from public.claims where id = p_claim_id;
end;
$$;

-- ── Bulk removal for pipeline prunes (R2). Same declared-category mechanics;
-- additionally admits 'signals_gone' — the one category a pipeline may claim.
-- 'unaudited_direct_delete' is NOT accepted by any RPC: it exists only as the
-- trigger's honest verdict on deletes that bypassed both.
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

  perform set_config('app.claim_removal_category', p_reason_category, true);
  perform set_config('app.claim_removal_actor', coalesce(p_actor, ''), true);

  delete from public.claims where id = any(p_claim_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
