-- Add evidence_status and evidence_note to companies table.
-- These were previously applied manually but never captured in a migration.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS evidence_status text,
  ADD COLUMN IF NOT EXISTS evidence_note text;

COMMENT ON COLUMN public.companies.evidence_status IS
  'Current evidence quality level: baseline_plus_artifacts | public_evidence_strong | public_evidence_partial | public_evidence_thin | generated_no_baseline | no_public_evidence';
COMMENT ON COLUMN public.companies.evidence_note IS
  'Human-readable note about the evidence state for this company.';
