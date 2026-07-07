-- INT-2 — claim provenance axis (Law 7: provenance ⊥ proof).
-- provenance says WHERE a claim came from (operator-declared vs publicly
-- observed); the state ladder keeps saying HOW PROVEN it is. Additive column,
-- CHECK-constrained, and IMMUTABLE after birth (conflation-guard layer 1: a
-- misrouted claim can never be laundered into the other provenance later —
-- assignment happens exactly once, at INSERT, by the sole derivation authority
-- deriveClaimProvenance in src/lib/evidenceMappers.ts).
-- DEFAULT covers every existing row correctly: all pre-INT-2 claims were born
-- from the public pipeline (the uploaded-doc claims are re-labeled by the
-- INT-2 backfill, which runs as a separate data step with frozen exclusion).

alter table public.claims
  add column if not exists provenance text not null default 'public_observed';

alter table public.claims
  add constraint claims_provenance_check
  check (provenance in ('public_observed', 'internal_declared'));

-- Escape hatch: a sanctioned backfill (one-time data fixes like the INT-2
-- re-label of upload-born claims) must SET LOCAL app.provenance_backfill = 'on'
-- inside its transaction. Nothing else may change provenance — app code never
-- sets the flag, so accidental/incidental UPDATE paths always hard-fail.
create or replace function public.claims_provenance_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.provenance is distinct from old.provenance then
    if current_setting('app.provenance_backfill', true) = 'on' then
      return new;
    end if;
    raise exception 'claims.provenance is immutable after birth (INT-2 conflation guard) — claim % cannot change % -> %',
      old.id, old.provenance, new.provenance;
  end if;
  return new;
end;
$$;

create trigger claims_provenance_immutable_guard
  before update on public.claims
  for each row
  execute function public.claims_provenance_immutable();
