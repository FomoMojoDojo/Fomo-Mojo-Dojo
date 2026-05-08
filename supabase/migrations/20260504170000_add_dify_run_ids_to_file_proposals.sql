ALTER TABLE public.file_proposals
  ADD COLUMN IF NOT EXISTS dify_workflow_run_id text,
  ADD COLUMN IF NOT EXISTS dify_task_id text;
