-- D3 (generator root-cause) — the ANCHOR GATE store.
--
-- A dedicated, operator-editable per-company set of client entity anchors: the company name,
-- its domain hosts, partner names, and street address. An OUTSIDE-band signal may mint a
-- public_observed CLIENT claim only if its text or source_url references one of these anchors
-- (evidenceMappers.signalMatchesAnchor); unanchored outside signals stay signals in their
-- market_context/competitor home, never client claims. This closes D3 (unanchored businesses
-- — Izote, Belli Fratelli — minting claims in the client's name).
--
-- BACK-COMPAT: default '[]' → the gate is inert for every existing company until an operator
-- seeds anchors, so no company's rebuild changes until deliberately opted in per-company.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS entity_anchors_json jsonb NOT NULL DEFAULT '[]'::jsonb;
