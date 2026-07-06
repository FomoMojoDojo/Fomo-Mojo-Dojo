-- Gate 2 — create-new-instance: lineage column. When an operator creates a new
-- instance of an existing company (the birth-only law's friendly front door),
-- the new company records which company it is an instance of. Additive, nullable,
-- no default; ON DELETE SET NULL so deleting an original never cascades into its
-- instances.
alter table public.companies
  add column if not exists instance_of uuid references public.companies(id) on delete set null;

-- Backfill the one pre-existing hand-made instance: CB2 (Cafe Barra 2) was created
-- as a fresh instance of CB1 (Cafe Barra) — same URL, new company. SELECT-only on
-- CB1; CB1 is never written.
update public.companies
  set instance_of = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc' -- CB1
  where id = 'fd3f7f63-968b-4698-b946-3d6b6450d79d'        -- CB2
    and instance_of is null;
