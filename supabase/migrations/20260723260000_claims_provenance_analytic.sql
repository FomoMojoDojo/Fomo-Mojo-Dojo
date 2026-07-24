-- V2-5c — a THIRD claim provenance value: 'analytic'.
--
-- Operator ruling 2026-07-23: claims born from analysis (mojo_analysis-backed) are
-- neither the client's own declared words (internal_declared) nor the outside record
-- (public_observed) — they are OUR reading. They carry provenance='analytic' and render
-- NOWHERE client-facing by default (workshop/operator territory only). This widens the
-- CHECK to admit the value; the writer (deriveClaimProvenance) stamps it, and the
-- client-facing allowlist (isPublicProvenance) already excludes it (fail-toward-blocked).
--
-- Existing mislabeled rows are NOT corrected — claims.provenance is birth-immutable
-- (INT-2 trigger); the V2-5b render guard stays load-bearing for those legacy rows. This
-- closes the class for all NEWBORNS.
--
-- Prior CHECK: provenance IN ('public_observed','internal_declared','client_attested').

alter table public.claims
  drop constraint if exists claims_provenance_check;
alter table public.claims
  add constraint claims_provenance_check
  check (provenance = any (array['public_observed','internal_declared','client_attested','analytic']));
