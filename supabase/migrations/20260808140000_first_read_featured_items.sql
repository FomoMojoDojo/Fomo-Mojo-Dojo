-- First Read ROLLUP (Gate 2) — first_read_featured_items.
--
-- A per-theme FEATURED-ITEM pointer: a recorded, reversible operator decision naming the one
-- item a theme leads with (theme 2 = outside-raised, theme 3 = findings). NOT model-ranked —
-- there is no judge, no salience score, no auto-detection. An operator picks one item; the theme
-- renders its lead line + that item as the flagship exhibit. Theme 1's flagship is the curated
-- tension (curated_tensions) — this table does not cover it.
--
-- CONTENT-IDENTITY ANCHORED, NOT ROW-ID: the pointer stores the item's content_identity (the same
-- sha256/delta identity the Check act keys items by), so a rebuild that re-mints the same item
-- resolves the pointer unchanged. If the pointed-at item DISAPPEARS (struck, re-worded, deleted),
-- the identity no longer resolves: the render shows NOTHING for the featured slot (never a stale
-- ghost) and the internal/presenter surface flags "picked item no longer present". Honest by
-- construction — a dangling pointer degrades to the absent state, visibly, on the operator surface.
--
-- REVERSIBLE SOFT-REMOVE (mirrors curated_tensions): removal / replacement is an in-row soft-delete
-- (removed_at/removed_by/removed_reason). Picking a new item for a theme soft-removes the prior live
-- pointer (removed_reason='replaced') and inserts the new one — the trail is recorded and reversible.
-- The render filters removed_at IS NULL.
--
-- RLS mirrors curated_tensions / market_options (the sole RLS pattern authority): SELECT for the
-- company's creator OR a company_member OR an admin; writes are admin/service-role only — no client
-- may set a featured item. No cm self-comparison (the cross-tenant hole in the sibling tables is
-- NOT reproduced here).

create table public.first_read_featured_items (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,

  -- Which theme this pointer features. Theme 1 (say-vs-see) is covered by curated_tensions.
  theme_key      text not null check (theme_key in ('outside_raised', 'findings')),

  -- The featured item's CONTENT identity (not a row id) — rebuild-safe; a vanished item degrades
  -- the pointer to the honest absent state rather than orphaning to a stale row.
  item_identity  text not null,

  -- Reasoned, operator-only. NEVER rendered client-facing.
  operator_note  text,

  created_at     timestamptz not null default now(),
  created_by     uuid,

  -- Reversible soft-remove. render filters removed_at IS NULL; clearing it restores.
  removed_at     timestamptz,
  removed_by     uuid,
  removed_reason text
);

-- One LIVE featured item per (company, theme) — picking a new one replaces (soft-removes) the old.
create unique index first_read_featured_live_uidx
  on public.first_read_featured_items (company_id, theme_key)
  where removed_at is null;

alter table public.first_read_featured_items enable row level security;

create policy "Users can view company first_read_featured_items"
  on public.first_read_featured_items for select
  to authenticated
  using (
    exists (
      select 1 from public.companies c
      where c.id = first_read_featured_items.company_id and c.created_by = auth.uid()
    )
    or exists (
      select 1 from public.company_members cm
      where cm.company_id = first_read_featured_items.company_id and cm.user_id = auth.uid()
    )
    or public.has_role(auth.uid(), 'admin')
  );

create policy "Admins can manage all first_read_featured_items"
  on public.first_read_featured_items for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
