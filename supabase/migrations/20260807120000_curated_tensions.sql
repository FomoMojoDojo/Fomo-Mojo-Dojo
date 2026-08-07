-- SELF-CONSISTENCY — curated_tensions.
--
-- A CURATED, single-instance operator record: the flagship declared promise beside the
-- public record's own admitted difficulty in the same service. This is NOT a machine
-- finding — there is no judge, no tension criterion, no auto-detection. An operator
-- hand-authors one row, reasoned and reversible; the client render is honest that it is a
-- curation. Nothing in the app fires on future data.
--
-- WHY A TABLE, NOT HARDCODED IDS: the curation is a recorded decision (reasoned,
-- reversible, operator-only), not component code. Two claim refs + a note + audit.
--
-- REVERSIBLE SOFT-REMOVE (operator ruling 2026-08-07): removal is an in-row soft-delete
-- (removed_at/removed_by/removed_reason). The render filters removed_at IS NULL; a removal
-- is reversible by clearing removed_at. Smallest honest shape — no companion audit table.
--
-- RLS mirrors market_options (the sole RLS pattern authority): SELECT for the company's
-- creator OR a company_member OR an admin; writes are admin/service-role only — no client
-- may hand-author a curation. Deliberately NO cm.company_id=cm.company_id self-comparison
-- (the cross-tenant hole reported in the sibling tables) is reproduced here.

create table public.curated_tensions (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies(id) on delete cascade,

  -- The two sides, by REGISTER. promise = the declared direction (internal register);
  -- difficulty = the public record's own admission. SEPARATE columns by law: the render
  -- labels each side by its register and never blends declared with public.
  promise_claim_id     uuid not null references public.claims(id) on delete cascade,
  difficulty_claim_id  uuid not null references public.claims(id) on delete cascade,

  -- Reasoned, operator-only. NEVER rendered client-facing — the client sees the signed
  -- framing + curation line, not this note.
  operator_note        text,

  created_at           timestamptz not null default now(),
  created_by           uuid,

  -- Reversible soft-remove. render filters removed_at IS NULL; clearing it restores.
  removed_at           timestamptz,
  removed_by           uuid,
  removed_reason       text
);

-- One live curation per (company, promise, difficulty) pair — a re-seed of the same pair
-- can't double-render. (Soft-removed rows keep their identity; a fresh curation of the
-- same pair would clear removed_at rather than insert a duplicate.)
create unique index curated_tensions_live_pair_uidx
  on public.curated_tensions (company_id, promise_claim_id, difficulty_claim_id)
  where removed_at is null;

alter table public.curated_tensions enable row level security;

create policy "Users can view company curated_tensions"
  on public.curated_tensions for select
  to authenticated
  using (
    exists (
      select 1 from public.companies c
      where c.id = curated_tensions.company_id and c.created_by = auth.uid()
    )
    or exists (
      select 1 from public.company_members cm
      where cm.company_id = curated_tensions.company_id and cm.user_id = auth.uid()
    )
    or public.has_role(auth.uid(), 'admin')
  );

create policy "Admins can manage all curated_tensions"
  on public.curated_tensions for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
