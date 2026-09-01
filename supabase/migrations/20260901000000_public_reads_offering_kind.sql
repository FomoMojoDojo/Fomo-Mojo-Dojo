-- GATE 6a — add the `offering` public-read kind (2026-09-01, operator-signed). "What you offer" is a
-- PUBLIC OFFERING READ: what the public record shows the company currently puts in front of the people
-- it serves (products / services / programs / formats / channels), generated on the SAME gate-6a path
-- (same input ledger, same provenance router, same cite-or-REJECT validation, same judge, same
-- public_reads(company_id, kind) keying with supersede-never-delete). No new column, no new table —
-- ONLY the kind CHECK constraint widens by one value. Purely additive: existing rows are untouched
-- (no positioning/strategy/promise row changes kind), and the (company, kind) uniqueness + freeze
-- trigger already cover the new value by construction.
ALTER TABLE public.public_reads
  DROP CONSTRAINT IF EXISTS public_reads_kind_check;

ALTER TABLE public.public_reads
  ADD CONSTRAINT public_reads_kind_check
  CHECK (kind IN ('positioning', 'strategy', 'promise', 'offering'));
