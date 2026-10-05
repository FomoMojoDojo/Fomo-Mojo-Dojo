-- V1 (2026-10-05) — the two public views ran with DEFINER rights as postgres (bypassrls=true),
-- so anon read every row of derived_tensions_structural: 11 rows across 3 companies, claim
-- statement text included. Every policy on every base table targets {authenticated} only, so
-- the views were the sole anon read path. relevance_overrides_without_live_pair is additionally
-- auto-updatable, and anon's INSERT grant let an unauthenticated caller write an override row
-- against ANY company id (verified: INSERT 0 1 through the view; refused by RLS on the base table).
--
-- security_invoker makes every base-relation permission and RLS check use the CALLER. No reader
-- changes: nothing in src/, supabase/functions/ or tests/ queries either view, and the one reader
-- (scripts/guards/relevance-override-guard.sql) runs as postgres, which holds bypassrls.
--
-- Guarded by grants-guard.sh (g6 security_invoker, g7 anon holds nothing, g8 authenticated at most
-- SELECT, g9 a live anon GET is refused) and tests/workspace/v1-public-view-invoker.spec.ts.

alter view public.derived_tensions_structural            set (security_invoker = true);
alter view public.relevance_overrides_without_live_pair  set (security_invoker = true);

-- The flag alone closes the read. These revokes close the write vector and turn an ugly
-- "permission denied for table claim_deltas" into a clean PostgREST refusal.
revoke all on table public.derived_tensions_structural            from anon;
revoke all on table public.relevance_overrides_without_live_pair  from anon;

revoke insert, update, delete on table public.derived_tensions_structural            from authenticated;
revoke insert, update, delete on table public.relevance_overrides_without_live_pair  from authenticated;
grant  select                 on table public.derived_tensions_structural            to   authenticated;
grant  select                 on table public.relevance_overrides_without_live_pair  to   authenticated;

comment on view public.derived_tensions_structural is
  'Structural claim tensions. security_invoker: the caller''s grants and RLS on claims/'
  'claim_signal_refs/signals/routes apply. anon holds nothing; authenticated holds SELECT only.';
comment on view public.relevance_overrides_without_live_pair is
  'Orphaned operator relevance overrides. security_invoker: the caller''s grants and RLS on '
  'claim_delta_relevance_overrides/claim_deltas apply. anon holds nothing; authenticated SELECT only.';

notify pgrst, 'reload schema';
