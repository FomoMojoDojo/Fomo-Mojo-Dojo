-- Expand program_phase check constraint to include all 8 engagement phase values.
-- The original constraint only allowed the 4 legacy values: outside, diagnose, focus, flow.
-- The phase system now uses 8 values including validate checkpoints.

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_program_phase_check;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_program_phase_check
  CHECK (
    program_phase IS NULL OR program_phase IN (
      'outside_signals',
      'validate_outside',
      'diagnose',
      'validate_diagnose',
      'focus',
      'validate_focus',
      'flow',
      'validate_flow',
      -- Legacy values kept so existing rows remain valid
      'outside',
      'execution'
    )
  );

COMMENT ON COLUMN public.companies.program_phase IS
  'Admin-set current program phase. NULL = auto-derived from data. Values: outside_signals | validate_outside | diagnose | validate_diagnose | focus | validate_focus | flow | validate_flow';
