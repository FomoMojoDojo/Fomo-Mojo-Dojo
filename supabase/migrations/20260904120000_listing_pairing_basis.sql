-- LISTING PAIRS BY CONSTRUCTION (operator ruling 2026-09-04): a listing-backed observed claim admitted by
-- listingMayCorroborate forms its echoed pair deterministically — pairing_basis 'listing' (never the prose
-- proposer). Additive: the CHECK gains one value. Applied with psql -f (repo convention).
alter table public.claim_deltas drop constraint claim_deltas_pairing_basis_check;
alter table public.claim_deltas add constraint claim_deltas_pairing_basis_check
  check (pairing_basis = any (array['judge_confirmed'::text, 'inferred'::text, 'operator'::text, 'listing'::text]));
