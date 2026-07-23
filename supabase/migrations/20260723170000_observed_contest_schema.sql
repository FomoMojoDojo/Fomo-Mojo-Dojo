-- OBSERVED CONTEST — OC-1 (SCHEMA ONLY). The two tables that record a client's
-- verdict AGAINST an observed finding (a claim), on an axis ORTHOGONAL to the
-- claim's own lifecycle. This gate is schema only: no feed (OC-2), no render /
-- resolve RPC (OC-3), no supersede (OC-4).
--
-- LAWS ENCODED STRUCTURALLY (from the OC-1 brief GOAL + ruling 9):
--
--  * A contest is an ORTHOGONAL axis beside claims.status — it is NEVER a status
--    value. A contested claim (either kind) keeps counting everywhere (score,
--    readiness, deltas, distribution). NOTHING in this migration writes, defaults,
--    triggers, or otherwise touches claims.status — auto-strike AND auto-minimize
--    are structurally impossible because no path from a contest to claims exists.
--    (The existing claims_status_guard already refuses any claims.status UPDATE
--    that does not go through set_claim_status; this gate adds no bypass.)
--
--  * contest_kind (ruling 9): a contest carries a KIND, NOT NULL, CHECK-constrained
--    to exactly two values:
--        'disputed'    — the client says the finding is FALSE.
--        'immaterial'  — the client concedes it is TRUE but says it does not matter
--                        to them (scope-reduction signal for a future gate).
--
--  * ONE contest row per (session, claim) — a client gives one verdict per finding
--    per meeting; the kind is an ATTRIBUTE of that verdict, not a second row.
--    Enforced by unique (session_id, claim_id).
--
--  * FK to claims WITH CASCADE, and every contest-row delete (incl. the cascade)
--    leaves a claim_contest_removals audit row — the strike-arc precedent
--    (claims_delete_audit / first_read_sessions_delete_audit): a BEFORE DELETE
--    trigger writes the audit for EVERY delete on EVERY path (cascaded child
--    deletes fire row triggers). The audit table carries NO foreign keys on its
--    scoping ids so it SURVIVES claim / session / company teardown and container
--    churn (mirrors claim_removals / first_read_session_removals, both RLS-off).
--
--  * RESOLUTION vocabulary present but write-machinery DEFERRED to OC-3. The
--    allowed vocabulary already covers all three sanctioned OC-3 outcomes so OC-3
--    needs no schema change:
--        'strike_resolved' — a disputed contest upheld, claim STRUCK (OC-3 calls
--                            the existing set_claim_status authority; never here).
--        'dismissed'       — a disputed contest overruled, claim stands.
--        'set_aside'       — an immaterial contest accepted; OC-3 flips the claim
--                            to status='minimized' through the SAME sanctioned
--                            status authority (still counts, de-emphasized,
--                            reversible) — never a strike, never a new status value.
--    Ruling 9's kind→resolution mapping is encoded as a CHECK so an immaterial
--    contest can NEVER be strike_resolved and a disputed one can NEVER be set_aside.
--    resolution is NULL until OC-3 resolves; NOTHING in this gate ever sets it.
--
--  * Unanchored rejections are NOT rows here — a contest requires a real claim_id
--    (NOT NULL FK). Render-only rejections with no anchor are an OC-3 render
--    concern; this gate never fabricates an anchor.
--
--  * gate-before-artifact; pg_dump taken before this write
--    (backups/pre_oc1_schema_20260723.sql).

begin;

-- ── claim_contests — one client verdict AGAINST a finding, per meeting ─────────
-- Sibling of first_read_responses (the confirm/correct/reject ledger): same
-- ownership shape (session_id + claim_id FKs are ownership; company_id is a
-- denormalized convenience, no FK), same client-attested provenance origin.
-- Distinct axis: this is DISAGREEMENT (dispute / immateriality), not a verdict on
-- truth-capture.
create table public.claim_contests (
  id                 uuid primary key default gen_random_uuid(),
  session_id         uuid not null references public.first_read_sessions(id) on delete cascade,
  company_id         uuid not null,                         -- denormalized (matches first_read_responses); NO FK
  claim_id           uuid not null references public.claims(id) on delete cascade,  -- the contested finding
  claim_identity     text not null,                         -- sha256(normalizeForHash(statement)); computed in TS,
                                                            -- frozen at contest, carried into the audit so it
                                                            -- survives the claim's deletion (mirrors
                                                            -- claim_removals.statement_identity). NEVER computed in SQL.
  contest_kind       text not null
                       check (contest_kind in ('disputed','immaterial')),
  rationale          text,                                  -- optional: the client's stated reason (verbatim)
  source             text not null default 'client_attested'
                       check (source in ('client_attested')),   -- the client-attested provenance origin
  -- resolution axis — columns present, writes deferred to OC-3 (nothing sets them here)
  resolution         text check (resolution in ('strike_resolved','dismissed','set_aside')),
  resolution_reason  text,
  resolved_at        timestamptz,
  resolved_by        text,
  created_at         timestamptz not null default now(),

  -- one verdict per finding per meeting; kind is an attribute of the row, not a 2nd row
  unique (session_id, claim_id),

  -- ruling 9, structural: disputed resolves ONLY by strike/dismiss; immaterial ONLY
  -- by set_aside. Unresolved (NULL) is always allowed — the OC-1 resting state.
  constraint claim_contests_resolution_kind check (
    resolution is null
    or (contest_kind = 'disputed'   and resolution in ('strike_resolved','dismissed'))
    or (contest_kind = 'immaterial' and resolution = 'set_aside')
  )
);

create index claim_contests_company_idx on public.claim_contests (company_id);
create index claim_contests_claim_idx   on public.claim_contests (claim_id);

-- ── claim_contest_removals — the delete audit (strike-arc precedent) ───────────
-- NO foreign keys on the scoping ids: the audit must SURVIVE the very
-- claim/session/company teardown that triggers it (mirrors claim_removals /
-- first_read_session_removals / claim_delta_rejection_removals). RLS is LEFT OFF
-- for the identical reason those are (relrowsecurity=f): the trigger insert runs
-- as the invoker and must succeed on every delete path.
create table public.claim_contest_removals (
  id                 uuid primary key default gen_random_uuid(),
  contest_id         uuid not null,                 -- NO FK: the contest is being deleted
  session_id         uuid not null,                 -- NO FK: survives session teardown
  company_id         uuid not null,                 -- NO FK: survives company teardown + churn
  claim_id           uuid,                          -- NO FK: the claim may already be gone (cascade)
  claim_identity     text not null,                 -- what was contested — meaningful after the claim is gone
  contest_kind       text not null,                 -- disputed | immaterial (snapshot at deletion)
  resolution         text,                          -- resolution at deletion, if any
  reason             text not null,                 -- explicit (future OC-3 RPC) or 'unaudited_direct_delete'
  removed_at         timestamptz not null default now()
);

create index claim_contest_removals_company_idx
  on public.claim_contest_removals (company_id, removed_at desc);

-- The audit trigger. Every contest delete leaves a row, on every path INCLUDING
-- the FK cascade from a deleted claim or session (cascaded child deletes fire
-- row triggers). The reason arrives via a txn-local GUC set ONLY by a sanctioned
-- OC-3 RPC (not built this gate); an undeclared delete records the honest verdict
-- 'unaudited_direct_delete'. This function reads ONLY the OLD contest row and
-- writes ONLY the audit table — it never references claims or claims.status.
create or replace function public.claim_contests_delete_audit()
returns trigger
language plpgsql
as $$
begin
  insert into public.claim_contest_removals
    (contest_id, session_id, company_id, claim_id, claim_identity, contest_kind, resolution, reason)
  values
    (old.id, old.session_id, old.company_id, old.claim_id, old.claim_identity,
     old.contest_kind, old.resolution,
     coalesce(nullif(btrim(coalesce(current_setting('app.contest_removal_reason', true), '')), ''),
              'unaudited_direct_delete'));
  return old;
end;
$$;

create trigger claim_contests_delete_audit
  before delete on public.claim_contests
  for each row
  execute function public.claim_contests_delete_audit();

-- ── RLS — the ratified member+admin tenancy pattern (RLS-2 model) ─────────────
-- Members see ONLY their own company; admins see everything. NO created_by
-- disjunct (RLS-2 deliberately dropped it). Member WRITE policies are an OC-2
-- (feed) concern — the pipeline writes via service role, which bypasses RLS.
alter table public.claim_contests enable row level security;

create policy "Users can view company claim_contests"
  on public.claim_contests for select
  to authenticated
  using (
    exists (
      select 1 from public.company_members cm
      where cm.company_id = claim_contests.company_id and cm.user_id = auth.uid()
    )
    or public.has_role(auth.uid(), 'admin')
  );

create policy "Admins can manage all claim_contests"
  on public.claim_contests for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

commit;
