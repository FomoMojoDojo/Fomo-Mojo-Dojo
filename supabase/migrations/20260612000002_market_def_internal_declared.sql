-- Phase 2 Gate 2a addendum: odi_market_definitions provenance honesty.
-- The provenance_type_enum (public_research / framework_adjudicated / odi_survey /
-- manual) has no honest value for a definition derived locally from the company's
-- internal documents. Widen the enum rather than borrow a wrong label
-- (operator-approved 2026-06-12). NULL/backfill not applicable — this only adds
-- a value; no existing row is restamped by migration.
alter type public.provenance_type_enum add value if not exists 'internal_declared';
