-- RB-3 Stage 2: claim_provenance_drift — records when the rebuild's data-level
-- provenance DERIVATION disagrees with a claim's frozen BIRTH stamp.
--
-- deriveClaimProvenance drifts as the signal corpus grows (a claim born
-- public_observed can later derive as internal_declared or analytic). RB-3 Stage 1
-- PRESERVES the birth stamp on upsert so INT-2 is never tripped and the rebuild
-- survives. This table OBSERVES the disagreement — observe, never overwrite — the
-- claim_delta_rejections retro-marker shape (freeze-on-observe, identity-keyed).
-- No stored provenance value changes here or anywhere.
--
-- WHY IT MATTERS: `analytic` is client-invisible by allowlist. A public_observed ->
-- analytic drift means a claim carrying an outside-record label may be genuine
-- analysis rendering where it should not — a REGISTER question, the operator's to
-- rule. Preserving silently would bury it; this row surfaces it (ruling 2).
-- Surfacing/where-it-renders is a LATER gate with operator-signed copy.
--
-- FREEZE-ON-OBSERVE: keyed by (company_id, claim_id, birth_provenance,
-- derived_provenance). The first observation of a given disagreement binds;
-- repeated rebuilds of the SAME unchanged disagreement do not accumulate rows
-- (ON CONFLICT DO NOTHING at the writer). A CHANGED derivation is a new
-- disagreement and gets its own row. Derived observation, not evidence: rows
-- cascade away with their claim and need no dedicated delete-audit. Service-role
-- only (no RLS, matching the neg-cache precedent); the client never reads it yet.

create table public.claim_provenance_drift (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  claim_id            uuid not null references public.claims(id) on delete cascade,
  birth_provenance    text not null,
  derived_provenance  text not null,
  observed_at         timestamptz not null default now(),
  unique (company_id, claim_id, birth_provenance, derived_provenance)
);

create index claim_provenance_drift_company_idx on public.claim_provenance_drift (company_id);

grant select, insert on public.claim_provenance_drift to service_role;
