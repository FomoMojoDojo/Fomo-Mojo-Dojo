ALTER TABLE public.job_steps
ADD COLUMN IF NOT EXISTS evidence_status text NOT NULL DEFAULT 'unclear';

ALTER TABLE public.job_steps
ADD COLUMN IF NOT EXISTS evidence_basis text NOT NULL DEFAULT '';

ALTER TABLE public.job_steps
ADD COLUMN IF NOT EXISTS evidence_confidence integer NOT NULL DEFAULT 0;
