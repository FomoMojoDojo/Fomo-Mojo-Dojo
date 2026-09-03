-- OPERATOR RELEVANCE OVERRIDES (operator ruling 2026-09-03) — a durable, identity-keyed home for the
-- operator's spare/strike decision on a claim-delta pair.
--
-- WHY. The machine relevance overlay (claim_deltas.relevance_*) is ROW-BOUND: the delta finalize's stale
-- sweep deletes and re-inserts pair rows, so any operator decision written into those columns dies on
-- the next recompute and is indistinguishable from a judge verdict afterwards. Evidence: the 08-25 CB2
-- review (6 spared as relevance_provider='operator', 4 kept orthogonal) vanished with the 08-26 recompute,
-- and the router then re-struck the same partnership-corroboration shape on the live client-bar surface.
--
-- WHAT. One row per operator decision, keyed by the pair's content identity (claimDeltaSynthesis.ts
-- pairIdentity — sha256 of pair|normalize(declared)|normalize(observed) through the single TS authority),
-- which the delta core already treats as the unit that survives a recompute. Reversal is a NEW row that
-- supersedes the prior one (superseded_by) — never an update of the verdict, never a delete. 'withdrawn'
-- hands the pair back to the machine. No FK to claims, so the decision outlives signal and claim loss.
--
-- HOW IT WINS. A BEFORE INSERT OR UPDATE trigger on claim_deltas looks up the live override for the row's
-- identity: if one exists (and is not withdrawn) it REWRITES the row's relevance columns from the override
-- regardless of what the writer asserted; if none exists and the writer asserts provider='operator', it
-- RAISES. So 'operator' on a delta row can only ever be DERIVED from a live override — the machine cannot
-- fake it, and the operator's decision beats any machine verdict on the same pair at the row boundary,
-- even if a code path forgets to consult the table (the code paths that do consult it merely save judge
-- spend). Frozen companies are refused by the RPC and by enforce_company_freeze on every table here.
--
-- Guard: scripts/guards/relevance-override-guard.sql (rolled-back psql proof on the ScratchCo fixture).

begin;

-- ── 1. the override table ─────────────────────────────────────────────────────────────────────────
create table public.claim_delta_relevance_overrides (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  pairing_kind      text not null check (pairing_kind in ('internal_vs_public', 'public_vs_public')),
  content_identity  text not null,
  verdict           text not null check (verdict in ('relevant', 'orthogonal', 'withdrawn')),
  reason            text not null check (length(btrim(reason)) > 0),
  decided_by        uuid,
  decided_at        timestamptz not null default now(),
  -- DEFERRABLE: supersession sets the prior row's pointer to the NEW row's id BEFORE that row is
  -- inserted (so the live-uniqueness index never sees two live rows); the FK is checked at commit.
  superseded_by     uuid references public.claim_delta_relevance_overrides(id) on delete set null
                    deferrable initially deferred
);

-- Exactly one LIVE decision per pair.
create unique index claim_delta_relevance_overrides_live_uniq
  on public.claim_delta_relevance_overrides (company_id, pairing_kind, content_identity)
  where superseded_by is null;
create index claim_delta_relevance_overrides_company_idx
  on public.claim_delta_relevance_overrides (company_id, decided_at desc);

alter table public.claim_delta_relevance_overrides enable row level security;

create policy "members and admins read relevance overrides"
  on public.claim_delta_relevance_overrides for select
  to authenticated
  using (
    exists (select 1 from public.company_members cm where cm.company_id = claim_delta_relevance_overrides.company_id and cm.user_id = auth.uid())
    or exists (select 1 from public.companies c where c.id = claim_delta_relevance_overrides.company_id and c.created_by = auth.uid())
    or public.has_role(auth.uid(), 'admin'::app_role)
  );
create policy "admins insert relevance overrides"
  on public.claim_delta_relevance_overrides for insert
  to authenticated
  with check (public.has_role(auth.uid(), 'admin'::app_role));
-- The ONLY permitted update is supersession (setting superseded_by); the verdict/reason/identity of a
-- decided row never change. Enforced by trigger below for every role, policy for the authenticated role.
create policy "admins supersede relevance overrides"
  on public.claim_delta_relevance_overrides for update
  to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role));
-- No delete policy: authenticated deletes are denied outright.

-- Immutable-once-decided: any UPDATE may only set superseded_by (from null to a row id).
create or replace function public.claim_delta_relevance_overrides_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.company_id <> old.company_id or new.pairing_kind <> old.pairing_kind
     or new.content_identity <> old.content_identity or new.verdict <> old.verdict
     or new.reason <> old.reason or new.decided_by is distinct from old.decided_by
     or new.decided_at <> old.decided_at then
    raise exception 'claim_delta_relevance_overrides is append-only: a decided row may only be superseded';
  end if;
  if old.superseded_by is not null and new.superseded_by is distinct from old.superseded_by then
    raise exception 'claim_delta_relevance_overrides: superseded_by is set once';
  end if;
  return new;
end;
$$;
create trigger claim_delta_relevance_overrides_immutable
  before update on public.claim_delta_relevance_overrides
  for each row execute function public.claim_delta_relevance_overrides_immutable();

-- Delete audit (claim_delta_rejections_delete_audit shape): every delete on ANY path leaves a row.
create table public.claim_delta_relevance_override_removals (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null,               -- NO FK: survives teardown + churn
  override_id       uuid not null,
  pairing_kind      text not null,
  content_identity  text not null,
  verdict           text not null,
  reason            text not null,               -- the decision's reason, preserved
  removal_reason    text not null,               -- txn-local GUC or 'unaudited_direct_delete'
  removed_at        timestamptz not null default now()
);
create index claim_delta_relevance_override_removals_company_idx
  on public.claim_delta_relevance_override_removals (company_id, removed_at desc);
create or replace function public.claim_delta_relevance_overrides_delete_audit()
returns trigger
language plpgsql
as $$
begin
  insert into public.claim_delta_relevance_override_removals
    (company_id, override_id, pairing_kind, content_identity, verdict, reason, removal_reason)
  values
    (old.company_id, old.id, old.pairing_kind, old.content_identity, old.verdict, old.reason,
     coalesce(nullif(btrim(coalesce(current_setting('app.override_removal_reason', true), '')), ''), 'unaudited_direct_delete'));
  return old;
end;
$$;
create trigger claim_delta_relevance_overrides_delete_audit
  before delete on public.claim_delta_relevance_overrides
  for each row execute function public.claim_delta_relevance_overrides_delete_audit();

-- FREEZE: attach explicitly (the 08-10 migration enumerated tables at its run time; RB-2 lesson).
create trigger enforce_company_freeze
  before insert or update or delete on public.claim_delta_relevance_overrides
  for each row execute function public.enforce_company_freeze();

-- ── 2. the override-wins trigger on claim_deltas ─────────────────────────────────────────────────
create or replace function public.apply_relevance_override()
returns trigger
language plpgsql
as $$
declare
  v_ov record;
begin
  select verdict, reason, decided_at
    into v_ov
    from public.claim_delta_relevance_overrides o
   where o.company_id = new.company_id
     and o.pairing_kind = new.pairing_kind
     and o.content_identity = new.content_identity
     and o.superseded_by is null
   limit 1;
  if found and v_ov.verdict in ('relevant', 'orthogonal') then
    -- The operator's decision wins over whatever the writer asserted.
    new.relevance_verdict   := v_ov.verdict;
    new.relevance_provider  := 'operator';
    new.relevance_model     := 'operator_override';
    new.relevance_reason    := v_ov.reason;
    new.relevance_span      := null;
    new.relevance_judged_at := v_ov.decided_at;
    return new;
  end if;
  -- No live override (or a withdrawn one): 'operator' provenance cannot be asserted by any writer.
  if new.relevance_provider = 'operator' then
    raise exception 'claim_deltas: relevance_provider=''operator'' requires a live claim_delta_relevance_overrides row for this pair';
  end if;
  return new;
end;
$$;
create trigger claim_deltas_apply_relevance_override
  before insert or update on public.claim_deltas
  for each row execute function public.apply_relevance_override();

-- ── 3. the sanctioned write: set_relevance_override ───────────────────────────────────────────────
-- Admin-only (service role or has_role admin; the postgres session user for guards). Refuses a frozen
-- company before any write. Inserts the new decision, supersedes the prior live one, and patches every
-- live claim_deltas row carrying that identity: relevant/orthogonal ⇒ the override-wins trigger stamps
-- them; withdrawn ⇒ operator-stamped rows are cleared back to NULL so the backstop re-judges them.
create or replace function public.set_relevance_override(
  p_company_id       uuid,
  p_pairing_kind     text,
  p_content_identity text,
  p_verdict          text,
  p_reason           text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_frozen     boolean;
  v_prior_id   uuid;
  v_new_id     uuid;
  v_patched    integer := 0;
  v_superseded integer := 0;
begin
  if not (coalesce(auth.role(), '') = 'service_role'
          or session_user = 'postgres'
          or public.has_role(auth.uid(), 'admin'::app_role)) then
    raise exception 'set_relevance_override: admin only';
  end if;
  if p_verdict not in ('relevant', 'orthogonal', 'withdrawn') then
    raise exception 'set_relevance_override: verdict must be relevant | orthogonal | withdrawn';
  end if;
  if p_pairing_kind not in ('internal_vs_public', 'public_vs_public') then
    raise exception 'set_relevance_override: bad pairing_kind';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'set_relevance_override: a reason is required';
  end if;
  select frozen into v_frozen from public.companies where id = p_company_id;
  if v_frozen is null then
    raise exception 'set_relevance_override: company not found';
  end if;
  if v_frozen then
    raise exception 'This is a frozen reference company — its record is preserved and is not modified.';
  end if;

  select id into v_prior_id
    from public.claim_delta_relevance_overrides
   where company_id = p_company_id and pairing_kind = p_pairing_kind
     and content_identity = p_content_identity and superseded_by is null;

  -- Reversal is a NEW row. The prior live decision is superseded FIRST (pointing at the pre-generated
  -- new id — the deferred FK is checked at commit), so the live-uniqueness index never sees two live
  -- rows for the pair; then the new decision is inserted with that id.
  v_new_id := gen_random_uuid();
  if v_prior_id is not null then
    update public.claim_delta_relevance_overrides set superseded_by = v_new_id where id = v_prior_id;
    get diagnostics v_superseded = row_count;
  end if;
  insert into public.claim_delta_relevance_overrides
    (id, company_id, pairing_kind, content_identity, verdict, reason, decided_by)
  values (v_new_id, p_company_id, p_pairing_kind, p_content_identity, p_verdict, btrim(p_reason), auth.uid());

  if p_verdict in ('relevant', 'orthogonal') then
    -- The trigger derives the columns from the (now live) override; touching the row is enough.
    update public.claim_deltas
       set relevance_verdict = p_verdict
     where company_id = p_company_id and pairing_kind = p_pairing_kind and content_identity = p_content_identity;
    get diagnostics v_patched = row_count;
  else
    update public.claim_deltas
       set relevance_verdict = null, relevance_provider = null, relevance_model = null,
           relevance_reason = null, relevance_span = null, relevance_judged_at = null
     where company_id = p_company_id and pairing_kind = p_pairing_kind and content_identity = p_content_identity
       and relevance_provider = 'operator';
    get diagnostics v_patched = row_count;
  end if;

  return jsonb_build_object('override_id', v_new_id, 'superseded', v_superseded, 'patched', v_patched);
end;
$$;
revoke all on function public.set_relevance_override(uuid, text, text, text, text) from public;
grant execute on function public.set_relevance_override(uuid, text, text, text, text) to authenticated, service_role;

-- ── 4. report view: live overrides whose pair has no current delta row (identity not re-produced) ──
create or replace view public.relevance_overrides_without_live_pair as
  select o.id, o.company_id, o.pairing_kind, o.content_identity, o.verdict, o.reason, o.decided_by, o.decided_at
    from public.claim_delta_relevance_overrides o
   where o.superseded_by is null
     and o.verdict in ('relevant', 'orthogonal')
     and not exists (
       select 1 from public.claim_deltas d
        where d.company_id = o.company_id and d.pairing_kind = o.pairing_kind and d.content_identity = o.content_identity
     );

commit;
