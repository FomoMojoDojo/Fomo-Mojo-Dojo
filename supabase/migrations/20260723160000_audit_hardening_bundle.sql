-- Audit-hardening bundle — no recorded material is erased without an audit row.
--
-- Two tables currently allowed silent deletes, against the strike-arc precedent
-- (claim_removals / test_removals: EVERY delete leaves a trigger-written audit row):
--   1. first_read_sessions — cascade-deleting a session takes its
--      first_read_responses ledger with it, unaudited. A resolved session is a
--      recorded decision.
--   2. claim_delta_rejections — the FR-D2 attestation-wins prune (and any other
--      delete) was logged only in the feed result, not at the table level.
--
-- HOUSE PATTERN (mirrors claims_delete_audit / tests_delete_audit): a BEFORE
-- DELETE trigger writes the audit row for EVERY delete on EVERY path (incl.
-- FK-cascaded ones — cascaded child deletes fire row triggers). The reason
-- arrives via a txn-local GUC set ONLY by the sanctioned RPCs below; a delete
-- that declared nothing is recorded honestly as 'unaudited_direct_delete'.
-- NO foreign key on the scoping ids (mirrors claim_removals / test_removals):
-- the audit must SURVIVE company/session teardown and container churn. RLS is
-- LEFT OFF, exactly as claim_removals / test_removals (both relrowsecurity=f) —
-- trigger inserts run as the invoker and must succeed on every delete path.

-- ── 1. First Read session removals ───────────────────────────────────────────
create table if not exists public.first_read_session_removals (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null,                 -- NO FK: the session is being deleted
  company_id          uuid not null,                 -- NO FK: survives company teardown + churn
  status_at_deletion  text not null,                 -- open | proposal_issued | accepted | declined
  confirmed_count     integer not null default 0,    -- response counts by verdict, at deletion
  corrected_count     integer not null default 0,
  rejected_count      integer not null default 0,
  reason              text not null,                 -- explicit (RPC) or 'unaudited_direct_delete'
  deleted_at          timestamptz not null default now()
);
create index if not exists idx_first_read_session_removals_company
  on public.first_read_session_removals(company_id, deleted_at desc);

-- The audit trigger. A RESOLVED (non-open) session is a recorded decision: its
-- delete REQUIRES an explicit reason (refused otherwise — recorded decisions do
-- not vanish silently). An OPEN draft may be discarded undeclared (test cleanup
-- is normal). Response counts are read here, BEFORE the FK cascade removes them.
create or replace function public.first_read_sessions_delete_audit()
returns trigger
language plpgsql
as $$
declare
  v_reason text := nullif(btrim(coalesce(current_setting('app.fr_session_removal_reason', true), '')), '');
  v_confirmed integer; v_corrected integer; v_rejected integer;
begin
  if old.status <> 'open' and v_reason is null then
    raise exception 'first_read_session % is % — a recorded decision cannot be deleted without an explicit reason (set app.fr_session_removal_reason, e.g. via remove_first_read_session)', old.id, old.status;
  end if;

  select count(*) filter (where verdict = 'confirmed'),
         count(*) filter (where verdict = 'corrected'),
         count(*) filter (where verdict = 'rejected')
    into v_confirmed, v_corrected, v_rejected
  from public.first_read_responses where session_id = old.id;

  insert into public.first_read_session_removals
    (session_id, company_id, status_at_deletion, confirmed_count, corrected_count, rejected_count, reason)
  values
    (old.id, old.company_id, old.status,
     coalesce(v_confirmed, 0), coalesce(v_corrected, 0), coalesce(v_rejected, 0),
     coalesce(v_reason, 'unaudited_direct_delete'));
  return old;
end;
$$;

create trigger first_read_sessions_delete_audit
  before delete on public.first_read_sessions
  for each row
  execute function public.first_read_sessions_delete_audit();

-- Sanctioned reason-carrying delete (the reachable declared path from app/edge —
-- PostgREST can't set a GUC and delete in one statement, so an RPC is the only
-- way to attribute a resolved-session delete; mirrors remove_claim / remove_test).
create or replace function public.remove_first_read_session(p_session_id uuid, p_reason text)
returns void
language plpgsql
as $$
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'remove_first_read_session requires a non-empty reason';
  end if;
  perform set_config('app.fr_session_removal_reason', p_reason, true);
  delete from public.first_read_sessions where id = p_session_id;
end;
$$;

-- ── 2. Claim-delta rejection removals ────────────────────────────────────────
create table if not exists public.claim_delta_rejection_removals (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null,                 -- NO FK: survives teardown + churn
  content_identity    text not null,                 -- the pair identity of the removed rejection
  declared_claim_id   uuid,                           -- NO FK: the claim may already be gone
  public_claim_id     uuid,                           -- NO FK
  rejected_by         text,                           -- proposer | judge (provenance of the original rejection)
  reason              text not null,                  -- 'attestation_wins' (feed) or 'unaudited_direct_delete'
  removed_at          timestamptz not null default now()
);
create index if not exists idx_claim_delta_rejection_removals_company
  on public.claim_delta_rejection_removals(company_id, removed_at desc);

-- The audit trigger. Every rejection delete leaves a row; the reason arrives via
-- a txn-local GUC set by the sanctioned RPC (the FR-D2 attestation-wins prune
-- passes 'attestation_wins'). Any other delete (direct SQL, the generate-claim-
-- deltas finalize orphan-prune — deliberately NOT changed this gate) records
-- 'unaudited_direct_delete', the honest verdict on an undeclared delete.
create or replace function public.claim_delta_rejections_delete_audit()
returns trigger
language plpgsql
as $$
begin
  insert into public.claim_delta_rejection_removals
    (company_id, content_identity, declared_claim_id, public_claim_id, rejected_by, reason)
  values
    (old.company_id, old.content_identity, old.declared_claim_id, old.public_claim_id, old.rejected_by,
     coalesce(nullif(btrim(coalesce(current_setting('app.rejection_removal_reason', true), '')), ''), 'unaudited_direct_delete'));
  return old;
end;
$$;

create trigger claim_delta_rejections_delete_audit
  before delete on public.claim_delta_rejections
  for each row
  execute function public.claim_delta_rejections_delete_audit();

-- Sanctioned reason-carrying delete for the feed's attestation-wins prune.
create or replace function public.remove_claim_delta_rejections(p_ids uuid[], p_reason text)
returns integer
language plpgsql
as $$
declare v_count integer;
begin
  perform set_config('app.rejection_removal_reason',
    coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'unaudited_direct_delete'), true);
  delete from public.claim_delta_rejections where id = any(p_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
