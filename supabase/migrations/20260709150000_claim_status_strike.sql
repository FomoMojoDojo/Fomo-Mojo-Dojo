-- Strike/minimize Gate A — the claims lifecycle gains a NON-public removal tier
-- (evidence law: DELETE is for relevance only; outdated/superseded/retracted
-- claims are STRUCK — preserved as a recorded decision, de-emphasized, never
-- disappeared) and a soft de-emphasis tier (MINIMIZED — display-only, keeps
-- counting in every compute).
--
--   active    → normal (default; every existing row)
--   minimized → de-emphasized on render (Gate B), COUNTS everywhere
--   struck    → stops counting everywhere (score, deltas, readiness, machine,
--               bands); requires a reason; explicit operator act, reversible,
--               never automatic.

alter table public.claims
  add column if not exists status text not null default 'active',
  add column if not exists struck_reason text,
  add column if not exists struck_at timestamptz,
  add column if not exists struck_by text;

alter table public.claims
  add constraint claims_status_check check (status in ('active','minimized','struck'));

-- struck ⇒ a reason is mandatory (recorded decision, not a silent flag)
alter table public.claims
  add constraint claims_struck_reason_check check (status <> 'struck' or struck_reason is not null);

-- ── Conflation-guard layering (mirrors the INT-2 provenance trigger): status is
-- writable ONLY through the set_claim_status authority below, which sets a
-- transaction-local flag. Sweeps, reconciles, and stray UPDATE paths hard-fail —
-- NOTHING may ever strike a claim automatically.
create or replace function public.claims_status_guard()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if current_setting('app.claim_status_authority', true) = 'on' then
      return new;
    end if;
    raise exception 'claims.status changes only through set_claim_status (strike/minimize law) — claim % blocked % -> %',
      old.id, old.status, new.status;
  end if;
  return new;
end;
$$;

create trigger claims_status_guard
  before update on public.claims
  for each row
  execute function public.claims_status_guard();

-- ── The single status authority. Validates the transition, stamps/clears the
-- struck_* columns, and echoes a recorded-decision row into claim_events
-- (from_state/to_state = the claim's UNCHANGED lifecycle state, satisfying the
-- existing CHECKs; the status change itself rides triggered_by_event +
-- evidence_delta).
create or replace function public.set_claim_status(
  p_claim_id uuid,
  p_status text,
  p_reason text default null,
  p_actor text default null
) returns void
language plpgsql
as $$
declare
  v_claim record;
begin
  if p_status not in ('active','minimized','struck') then
    raise exception 'invalid status %', p_status;
  end if;
  if p_status = 'struck' and (p_reason is null or length(trim(p_reason)) = 0) then
    raise exception 'striking a claim requires a reason (recorded-decision law)';
  end if;

  select * into v_claim from public.claims where id = p_claim_id;
  if not found then
    raise exception 'claim % not found', p_claim_id;
  end if;

  perform set_config('app.claim_status_authority', 'on', true);

  update public.claims
  set status = p_status,
      struck_reason = case when p_status = 'struck' then p_reason else null end,
      struck_at     = case when p_status = 'struck' then now() else null end,
      struck_by     = case when p_status = 'struck' then p_actor else null end
  where id = p_claim_id;

  insert into public.claim_events (company_id, claim_id, from_state, to_state, triggered_by_event, evidence_delta, occurred_at)
  values (
    v_claim.company_id,
    v_claim.id,
    v_claim.state,
    v_claim.state,
    'status:' || v_claim.status || '->' || p_status,
    jsonb_build_object('status_from', v_claim.status, 'status_to', p_status, 'reason', p_reason, 'actor', p_actor),
    now()
  );
end;
$$;

-- ── Removal audit: DELETE is relevance-only, and every delete records WHY in a
-- table that SURVIVES the cascade (claim_events rows die with their claim —
-- established 07-07). remove_claim is the only sanctioned manual-delete path;
-- the automatic R2 prune writes its own rows with reason 'signals_gone'
-- (added to the category CHECK for exactly that purpose).
create table public.claim_removals (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null,
  claim_statement    text not null,
  statement_identity text not null,          -- sha256(normalizeForHash(statement)) where computable; raw statement hash from SQL path
  provenance         text,
  reason_category    text not null check (reason_category in ('wrong_entity','excluded_source','fabricated_extraction','signals_gone')),
  actor              text,
  removed_at         timestamptz not null default now()
);

create or replace function public.remove_claim(
  p_claim_id uuid,
  p_reason_category text,
  p_actor text default null
) returns void
language plpgsql
as $$
declare
  v_claim record;
begin
  if p_reason_category not in ('wrong_entity','excluded_source','fabricated_extraction') then
    raise exception 'manual claim removal requires a relevance-only reason category (wrong_entity | excluded_source | fabricated_extraction) — non-public changes must be STRUCK, not deleted';
  end if;

  select * into v_claim from public.claims where id = p_claim_id;
  if not found then
    raise exception 'claim % not found', p_claim_id;
  end if;

  insert into public.claim_removals (company_id, claim_statement, statement_identity, provenance, reason_category, actor)
  values (
    v_claim.company_id,
    v_claim.statement,
    encode(digest(lower(regexp_replace(v_claim.statement, '\s+', ' ', 'g')), 'sha256'), 'hex'),
    v_claim.provenance,
    p_reason_category,
    p_actor
  );

  delete from public.claims where id = p_claim_id;
end;
$$;
