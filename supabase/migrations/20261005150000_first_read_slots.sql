-- ── SHORT-FORM SLOTS, slice 1 (operator rulings R1-R7, signed 2026-10-05) ────────────────────────
--
-- Each First Read commitment screen leads with a generated SHORT FORM — a set of framework slots,
-- not a shortened paragraph — and the full outside read sits behind a full-screen swap.
--
-- WHY A SIBLING TABLE AND NOT public_reads.payload (R1, from the 2026-10-05 diagnostic):
--   * payload is judge-attested to the FULL read, and a strategy payload's cascade_source is read at
--     promote time by writeCascadeGaps. Editing slots inside payload would make a slot change a
--     cascade-routing risk.
--   * slots carry their OWN model + judge stamp: a slot runs in its source read's lane (R5), and a
--     who-you-serve slot (slice 3) must be local-only, which the parent read's stamp cannot express.
--   * who-you-serve has no read JSON to live in at all — its slot is a grouping ACROSS
--     odi_market_definitions rows, on a table with ~19 edge-function writers plus client-side
--     writers. A sibling table is the only place a single-writer invariant can hold for it.
--
-- BOUND TO A REVISION (R1/R6): source_read_id names the exact public_reads row a slot compresses.
-- A slot is superseded in the SAME transaction as its source read (promoteStagedReads), so the slot
-- layer can never outlive its source — the failure ruling 6 fixed for cascade gaps (Edgewood
-- 913b716a: promote flipped rows and left live questions describing a strategy no longer current),
-- one layer up. A screen with no signed, current slot shows the full read (R6).
--
-- SLICE 1 is positioning + strategy only. The kind CHECK covers all four so slices 2 and 3 need no
-- schema change; the GENERATOR refuses anything but positioning and strategy in this slice.

create table if not exists public.first_read_slots (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  kind              text not null,
  slots             jsonb not null,
  -- the exact read revision this compresses. NULL only for who_you_serve (slice 3), whose source is
  -- a set of odi_market_definitions rows named by source_identities instead.
  -- ON DELETE RESTRICT (R6 amendment): a read that has slots cannot vanish under them.
  source_read_id    uuid references public.public_reads(id) on delete restrict,
  source_identities text[] not null default '{}'::text[],
  input_ledger      jsonb not null default '{}'::jsonb,
  model_provider    text,
  model_name        text,
  judge_model       text,
  judge_verdict     jsonb,
  criterion_version integer,
  is_current        boolean not null default false,
  superseded_by     uuid references public.first_read_slots(id),
  -- the R6 marker. A slot superseded because its SOURCE READ was replaced has no successor slot,
  -- so superseded_by is NULL and superseded_at/_reason carry the fact instead.
  superseded_at     timestamptz,
  superseded_reason text,
  signed_at         timestamptz,
  signed_by         uuid,
  sign_note         text,
  created_at        timestamptz not null default now(),

  constraint first_read_slots_kind_check
    check (kind = any (array['positioning','strategy','promise','who_you_serve'])),
  -- a read-backed kind must name its revision; who_you_serve must not (it has no single read).
  constraint first_read_slots_source_shape_check
    check ((kind = 'who_you_serve' and source_read_id is null)
        or (kind <> 'who_you_serve' and source_read_id is not null)),
  -- current ⇒ signed, and signed ⇒ both signature columns. A current row is always an operator-signed
  -- row (R1); the guard's (s5) is this constraint's live counterpart.
  constraint first_read_slots_current_signed_check
    check (is_current = false or (signed_at is not null and signed_by is not null)),
  constraint first_read_slots_signature_pair_check
    check ((signed_at is null) = (signed_by is null)),
  -- a superseded slot is never current (R6)
  constraint first_read_slots_superseded_not_current_check
    check (superseded_at is null or is_current = false)
);

-- one CURRENT slot per company per kind (the public_reads_current_one shape)
create unique index if not exists first_read_slots_current_one
  on public.first_read_slots (company_id, kind) where is_current;
create index if not exists first_read_slots_company_kind
  on public.first_read_slots (company_id, kind, created_at desc);
-- promote supersedes slots BY SOURCE READ, so that lookup gets its own index
create index if not exists first_read_slots_source_read
  on public.first_read_slots (source_read_id) where is_current;

comment on table public.first_read_slots is
  'Short-form framework slots for a First Read commitment screen (R1-R7, 2026-10-05). One current, '
  'operator-signed row per (company, kind). Bound to the read revision it compresses via '
  'source_read_id; superseded in the same transaction as that read. Written only by the slot '
  'generator — see scripts/guards/first-read-slots-guard.sh (s1).';

-- frozen reference companies keep their record (house trigger, same as public_reads)
drop trigger if exists enforce_company_freeze on public.first_read_slots;
create trigger enforce_company_freeze
  before insert or delete or update on public.first_read_slots
  for each row execute function public.enforce_company_freeze();

-- ── RLS from day one (R1) ───────────────────────────────────────────────────────────────────────
-- A new table with RLS OFF is reachable anonymously unless anon holds nothing (grants-guard g3);
-- this table ships with RLS ON instead, so it never joins the 29-table exemption set.
alter table public.first_read_slots enable row level security;

drop policy if exists "Admins manage all first_read_slots" on public.first_read_slots;
create policy "Admins manage all first_read_slots"
  on public.first_read_slots for all to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

-- A company MEMBER reads the signed, current short form and nothing else: not a staged slot, not a
-- superseded one. Deliberately company_members only (the ruling says "a company member"); a company
-- creator who is not a member reads nothing here.
drop policy if exists "Members read signed current first_read_slots" on public.first_read_slots;
create policy "Members read signed current first_read_slots"
  on public.first_read_slots for select to authenticated
  using (
    is_current = true
    and signed_at is not null
    and exists (
      select 1 from public.company_members cm
      where cm.company_id = first_read_slots.company_id and cm.user_id = auth.uid()
    )
  );

-- ── Grants: anon holds nothing; authenticated holds at most SELECT (grants-guard g7/g8 shape) ────
revoke all on table public.first_read_slots from anon;
revoke all on table public.first_read_slots from authenticated;
grant select on table public.first_read_slots to authenticated;
grant all on table public.first_read_slots to service_role;

notify pgrst, 'reload schema';

-- ── R6 — THE SLOT LAYER NEVER OUTLIVES ITS SOURCE, IN THE SAME TRANSACTION ──────────────────────
--
-- WHY A TRIGGER AND NOT A THIRD UPDATE IN THE PROMOTE PATH. promoteStagedReads
-- (_shared/publicReadPromote.ts:112-117) issues SEPARATE PostgREST .update() calls — there is no
-- BEGIN/COMMIT in that path, so each call is its own transaction. A third sequential call could fail
-- between the read flip and the slot flip and leave a CURRENT slot pointing at a SUPERSEDED read:
-- exactly the Edgewood 913b716a failure ruling 6 fixed for cascade gaps, one layer up. A row trigger
-- rides the promote path's OWN update statement, so the supersession is atomic by construction.
-- It also covers the DIRECT write path (generate-public-read/index.ts:435), which supersedes a prior
-- row too — so no caller, present or future, can orphan a slot. publicReadPromote.ts is unchanged.
--
-- RIGHTS. SECURITY INVOKER, deliberately. The only writers that set public_reads.is_current = false
-- are generate-public-read/index.ts:435 (direct write) and _shared/publicReadPromote.ts:114
-- (promote) — both reached only through generate-public-read, whose client is built with
-- SUPABASE_SERVICE_ROLE_KEY (index.ts:154). first-read-fill and interview-parser are SELECT-only on
-- public_reads; recurrence-step does not touch it; nothing in src/ writes it. service_role holds full
-- grants here and bypasses RLS, so invoker rights are sufficient and no definer escalation is taken.
-- RESIDUAL, stated: public_reads has RLS off and `authenticated` holds UPDATE on it, so a direct API
-- caller could flip is_current and the trigger would then run as authenticated, which holds only
-- SELECT here — the slot update is refused and the whole statement fails. That is fail-closed, and no
-- application path does it: only the service-role generator can supersede a read that has slots.
--
-- The function `returns trigger`, so PostgREST cannot expose it as an RPC, and it is granted to no one.

create or replace function public.first_read_slots_supersede_on_read_change()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
begin
  -- every slot bound to the read that just stopped being current — CURRENT OR STAGED.
  update public.first_read_slots s
     set is_current        = false,
         superseded_at     = now(),
         superseded_reason = 'source_read_superseded'
   where s.source_read_id = old.id
     and s.superseded_at is null;
  return null;  -- AFTER trigger: the return value is ignored
end;
$fn$;

revoke all on function public.first_read_slots_supersede_on_read_change() from public;
revoke all on function public.first_read_slots_supersede_on_read_change() from anon;
revoke all on function public.first_read_slots_supersede_on_read_change() from authenticated;

comment on function public.first_read_slots_supersede_on_read_change() is
  'R6 (2026-10-05): supersedes every first_read_slots row bound to a public_reads row that just '
  'stopped being current, in the SAME transaction as that flip. Guarded by first-read-slots-guard.sh '
  '(s4 the rule, s4b the trigger exists and is enabled).';

drop trigger if exists first_read_slots_supersede_on_read_change on public.public_reads;
create trigger first_read_slots_supersede_on_read_change
  after update of is_current on public.public_reads
  for each row
  when (old.is_current and not new.is_current)
  execute function public.first_read_slots_supersede_on_read_change();
