-- Add program_phase to companies table
-- Allows admin to manually set which phase a company is currently in.
-- Valid values: 'outside' | 'diagnose' | 'focus' | 'flow'
-- NULL means auto-derive from data completeness signals.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS program_phase text
  CHECK (program_phase IS NULL OR program_phase IN ('outside', 'diagnose', 'focus', 'flow'));

COMMENT ON COLUMN public.companies.program_phase IS
  'Admin-set current program phase. NULL = auto-derived from data. Values: outside | diagnose | focus | flow';
