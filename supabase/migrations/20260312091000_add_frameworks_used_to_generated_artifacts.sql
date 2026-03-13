ALTER TABLE public.inputs
ADD COLUMN IF NOT EXISTS frameworks_used text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.job_steps
ADD COLUMN IF NOT EXISTS frameworks_used text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.opportunities
ADD COLUMN IF NOT EXISTS frameworks_used text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.routes
ADD COLUMN IF NOT EXISTS frameworks_used text[] NOT NULL DEFAULT '{}'::text[];
