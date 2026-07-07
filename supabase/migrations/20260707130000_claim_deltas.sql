-- INT-3 — claim_deltas: the persisted internal-declared vs public-observed delta
-- (the product's founding signal). One row per delta finding:
--   echoed / divergent           → a judged PAIR (both claim FKs set)
--   publicly_silent              → declared claim with no public echo — an OPEN
--                                  QUESTION by law (absence ≠ contradiction)
--   internally_silent            → public claim with no declared counterpart
-- pairing_basis records the tri-state honesty of a pair: judge_confirmed renders
-- plain, inferred renders visibly labeled, operator overrides both.
-- content_identity anchors verdicts (evidence law): recompute keeps identical
-- rows (and every operator disposition) instead of re-rolling.
-- operator_disposition='rejected_pairing' is a TOMBSTONE: the row stops being a
-- pair on every surface AND its content_identity is never re-proposed by any
-- later recompute — dismissed inferred pairings stay dismissed.
-- No auto-reconciliation state exists by design.

create table public.claim_deltas (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies(id) on delete cascade,
  declared_claim_id  uuid references public.claims(id) on delete cascade,
  public_claim_id    uuid references public.claims(id) on delete cascade,
  delta_type         text not null check (delta_type in ('echoed','divergent','publicly_silent','internally_silent')),
  pairing_basis      text not null default 'judge_confirmed' check (pairing_basis in ('judge_confirmed','inferred','operator')),
  judge_reason       text,
  content_identity   text not null,
  computed_at        timestamptz not null default now(),
  operator_disposition text check (operator_disposition in ('acknowledged','intentional','queued','rejected_pairing')),
  operator_seen_at   timestamptz,
  -- shape law: pairs carry both claims; silences carry exactly their own side
  constraint claim_deltas_shape check (
    (delta_type in ('echoed','divergent') and declared_claim_id is not null and public_claim_id is not null)
    or (delta_type = 'publicly_silent' and declared_claim_id is not null and public_claim_id is null)
    or (delta_type = 'internally_silent' and declared_claim_id is null and public_claim_id is not null)
  ),
  unique (company_id, content_identity)
);

create index claim_deltas_company_idx on public.claim_deltas (company_id, delta_type);
