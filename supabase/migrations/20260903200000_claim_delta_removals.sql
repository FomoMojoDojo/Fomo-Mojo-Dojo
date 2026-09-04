-- CLAIM_DELTAS DELETE AUDIT (self-echo gate, step 1, operator ruling 2026-09-03).
--
-- LAW: preserve + audit, never delete un-reasoned. claim_deltas rows were the ONE table whose removal
-- left no trace (the stale sweep deleted the 08-25 CB2 review rows silently). From this migration on:
--   * every DELETE on claim_deltas writes one claim_delta_removals row carrying the full row snapshot;
--   * the reason comes from the transaction-local GUC app.delta_removal_reason and the trigger RAISES
--     when it is unset — an un-reasoned delete is structurally impossible;
--   * cascades from a claims or companies delete get their reason stamped by a BEFORE DELETE trigger
--     on the parent (claim_delete_cascade:<id> / company_delete_cascade:<id>) unless the caller set one;
--   * writers that delete on purpose go through delete_claim_deltas_audited(p_company_id, p_ids, p_reason) — the
--     stale sweep passes 'stale_sweep:<kind>:<run ref>', the own-host recompute 'own_host_observed'.
-- Additive: no existing row changes. Applied with psql -f (repo convention).

-- ── 1. the audit table ───────────────────────────────────────────────────────────────────────
create table public.claim_delta_removals (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null,               -- NO FK: survives teardown + churn
  delta_id          uuid not null,
  content_identity  text,
  pairing_kind      text,
  delta_type        text,
  row_snapshot      jsonb not null,              -- the whole deleted row, verbatim
  reason            text not null,
  removed_by        text not null,               -- auth uid when present, else the session user
  removed_at        timestamptz not null default now()
);
create index claim_delta_removals_company_idx
  on public.claim_delta_removals (company_id, removed_at desc);
create index claim_delta_removals_identity_idx
  on public.claim_delta_removals (company_id, pairing_kind, content_identity);

alter table public.claim_delta_removals enable row level security;
create policy "members and admins read claim delta removals"
  on public.claim_delta_removals for select
  to authenticated
  using (
    exists (select 1 from public.company_members cm where cm.company_id = claim_delta_removals.company_id and cm.user_id = auth.uid())
    or exists (select 1 from public.companies c where c.id = claim_delta_removals.company_id and c.created_by = auth.uid())
    or public.has_role(auth.uid(), 'admin'::app_role)
  );
-- No insert/update/delete policy: only the trigger (definer context) writes here.

-- FREEZE: attach explicitly (the 08-10 migration enumerated tables at its run time; RB-2 lesson).
create trigger enforce_company_freeze
  before insert or update or delete on public.claim_delta_removals
  for each row execute function public.enforce_company_freeze();

-- ── 2. the BEFORE DELETE trigger on claim_deltas ─────────────────────────────────────────────
create or replace function public.claim_deltas_delete_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := nullif(btrim(coalesce(current_setting('app.delta_removal_reason', true), '')), '');
begin
  if v_reason is null then
    raise exception 'claim_deltas: delete refused — no app.delta_removal_reason set. Every removal is audited; delete through delete_claim_deltas_audited(ids, reason).'
      using errcode = 'P0001';
  end if;
  insert into public.claim_delta_removals
    (company_id, delta_id, content_identity, pairing_kind, delta_type, row_snapshot, reason, removed_by)
  values
    (old.company_id, old.id, old.content_identity, old.pairing_kind, old.delta_type, to_jsonb(old), v_reason,
     coalesce(auth.uid()::text, session_user::text));
  return old;
end;
$$;
create trigger claim_deltas_delete_audit
  before delete on public.claim_deltas
  for each row execute function public.claim_deltas_delete_audit();

-- ── 3. cascade reasons: a parent delete stamps the reason for its cascaded delta rows ─────────
-- BEFORE DELETE on the parent runs before the RI cascade reaches claim_deltas, so the cascaded rows
-- audit with a real reason. A caller-set reason is never overwritten.
create or replace function public.claim_deltas_cascade_reason()
returns trigger
language plpgsql
as $$
begin
  if nullif(btrim(coalesce(current_setting('app.delta_removal_reason', true), '')), '') is null then
    perform set_config('app.delta_removal_reason', tg_table_name || '_delete_cascade:' || old.id::text, true);
  end if;
  return old;
end;
$$;
create trigger claims_delta_cascade_reason
  before delete on public.claims
  for each row execute function public.claim_deltas_cascade_reason();
create trigger companies_delta_cascade_reason
  before delete on public.companies
  for each row execute function public.claim_deltas_cascade_reason();

-- ── 4. the sanctioned deleter ────────────────────────────────────────────────────────────────
-- Admin / service role / the postgres session user. Company-scoped (ids outside the company are
-- ignored), refuses a frozen company before any read (CB1 by law), sets the transaction-local reason,
-- deletes, returns the count.
create or replace function public.delete_claim_deltas_audited(p_company_id uuid, p_ids uuid[], p_reason text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
  v_frozen boolean;
begin
  if not (coalesce(auth.role(), '') = 'service_role'
          or session_user = 'postgres'
          or public.has_role(auth.uid(), 'admin'::app_role)) then
    raise exception 'delete_claim_deltas_audited: admin only';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'delete_claim_deltas_audited: a reason is required';
  end if;
  select frozen into v_frozen from public.companies where id = p_company_id;
  if v_frozen is null then
    raise exception 'delete_claim_deltas_audited: company not found';
  end if;
  if v_frozen then
    raise exception 'This is a frozen reference company — its record is preserved and is not modified.';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    return 0;
  end if;
  perform set_config('app.delta_removal_reason', btrim(p_reason), true);
  -- destructive-ok: the audited path — the BEFORE DELETE trigger snapshots every row into claim_delta_removals
  delete from public.claim_deltas where company_id = p_company_id and id = any(p_ids);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.delete_claim_deltas_audited(uuid, uuid[], text) from public;
grant execute on function public.delete_claim_deltas_audited(uuid, uuid[], text) to authenticated, service_role;
