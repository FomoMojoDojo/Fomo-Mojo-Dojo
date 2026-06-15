-- MH-5a: honest provenance for a locally model-generated market hypothesis.
-- Additive enum value, no backfill. The render tier keys off operator-validated
-- (provenance='manual' → plain) vs everything else (→ "Hypothesis — not yet
-- validated"); this value gives generated market_defs a truthful provenance
-- distinct from public_research / framework_adjudicated / manual, so a generated
-- hypothesis never masquerades as research or as operator-validated.
alter type public.provenance_type_enum add value if not exists 'internal_hypothesis';
