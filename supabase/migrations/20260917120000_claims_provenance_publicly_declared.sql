-- C2 (operator ruling 2026-09-17) — a FIFTH claim provenance value: 'publicly_declared'.
--
-- The company's own words arriving through a REGISTRY (Form 990 filing data; GuideStar / Charity Navigator
-- self-reported profile sections — filing-class signals, evidence_class='filing') are neither the outside record
-- (public_observed) nor a declared upload (internal_declared) nor a spoken correction (client_attested): they are
-- publicly declared. Register by origin, not channel. Such claims render on the SAY side under the signed frames
-- ("In your filing · host · fiscal year" / "In your profile · host · date"), count on the declared side of
-- say-vs-see, and never reach a record surface (the outside allowlists admit public_observed only).
--
-- This widens the CHECK to admit the value; the writer (deriveClaimProvenance: every backing signal filing-class)
-- stamps it at birth; the immutability trigger (claims_provenance_immutable) is unchanged and covers it.
--
-- Prior CHECK: provenance IN ('public_observed','internal_declared','client_attested','analytic').

alter table public.claims
  drop constraint if exists claims_provenance_check;
alter table public.claims
  add constraint claims_provenance_check
  check (provenance = any (array['public_observed','internal_declared','client_attested','analytic','publicly_declared']));
