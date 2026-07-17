-- FD-1 — the FRONT-DOOR industry-standard job-map REFERENCE library (table only;
-- the generator is FD-2, the selector/render is FD-3). This holds the cold-open
-- "wow" reference maps: an industry-STANDARD ODI job map, stated AS the standard,
-- true-by-reference — NOT a company's data.
--
-- STRUCTURAL WALL (non-negotiable law): reference/standard data must be INCAPABLE
-- of entering the corroboration/claims machinery. This table therefore carries:
--   * NO company_id            — it is company-agnostic; nothing keys it to a company.
--   * NO source_url / registrable_domain / host / verdict / distinct_host_count
--                              — it holds no evidence, no attestation, no scoring.
--   * a FIXED provenance literal ('industry_standard_reference').
-- It cannot be joined into signalRecurrence / claims / normative_step_* /
-- finding_* (those key on company_id + sources this table does not have). It is
-- true-by-reference: no proof machinery, no consistency tiers ever touch it.

begin;

create table public.industry_reference_job_maps (
  id               uuid primary key default gen_random_uuid(),
  industry_key     text not null,          -- normalized taxonomy slug (the selector key)
  industry_label   text not null,          -- client-facing pick-list display (operator-signed)
  step_key         text not null           -- one of the 8 JTBD_ODI_CHECKPOINTS
                     check (step_key in ('define','locate','prepare','confirm','execute','monitor','modify','conclude')),
  step_number      integer not null,       -- render order (subset-of-8 allowed)
  step_label       text not null,
  description      text not null,
  provenance       text not null default 'industry_standard_reference'
                     check (provenance = 'industry_standard_reference'), -- the wall: reference literal ONLY
  taxonomy_version text,
  generator_run_id uuid,                    -- nullable; stamped by FD-2
  content_sha      text,                    -- nullable; TS authority (FD-2)
  is_published     boolean not null default false, -- operator signs by flipping this
  created_at       timestamptz not null default now()
);

-- Selector lookup: by industry, published-only.
create index industry_reference_job_maps_key_pub_idx
  on public.industry_reference_job_maps (industry_key, is_published);

commit;
