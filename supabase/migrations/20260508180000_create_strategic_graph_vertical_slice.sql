CREATE TABLE IF NOT EXISTS public.strategic_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'created','updated','deleted','restored','accepted','rejected','regenerated',
    'validated','contradicted','marked_stale','refreshed','score_changed'
  )),
  actor_type text NOT NULL CHECK (actor_type IN ('system','user','dify','council')),
  actor_id uuid NULL,
  source_run_id text NULL,
  object_type text NOT NULL,
  object_id uuid NOT NULL,
  previous_value jsonb NULL,
  new_value jsonb NULL,
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_strategic_events_company_id
  ON public.strategic_events(company_id);
CREATE INDEX IF NOT EXISTS idx_strategic_events_company_object
  ON public.strategic_events(company_id, object_type, object_id);
CREATE INDEX IF NOT EXISTS idx_strategic_events_company_created
  ON public.strategic_events(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_strategic_events_company_event_type
  ON public.strategic_events(company_id, event_type);

ALTER TABLE public.strategic_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.object_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  upstream_object_type text NOT NULL,
  upstream_object_id uuid NOT NULL,
  downstream_object_type text NOT NULL,
  downstream_object_id uuid NOT NULL,
  dependency_type text NOT NULL CHECK (dependency_type IN (
    'supports','derives','constrains','validates','contradicts','assumes','replaces'
  )),
  strength text NOT NULL CHECK (strength IN ('high','medium','low')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_object_dependencies_company_id
  ON public.object_dependencies(company_id);
CREATE INDEX IF NOT EXISTS idx_object_dependencies_upstream
  ON public.object_dependencies(upstream_object_type, upstream_object_id);
CREATE INDEX IF NOT EXISTS idx_object_dependencies_downstream
  ON public.object_dependencies(downstream_object_type, downstream_object_id);

ALTER TABLE public.object_dependencies ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.artifact_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  object_type text NOT NULL,
  object_id uuid NOT NULL,
  version_number integer NOT NULL,
  snapshot jsonb NOT NULL,
  source_event_id uuid NULL REFERENCES public.strategic_events(id) ON DELETE SET NULL,
  source_run_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_artifact_versions_company_id
  ON public.artifact_versions(company_id);
CREATE INDEX IF NOT EXISTS idx_artifact_versions_object_version
  ON public.artifact_versions(object_type, object_id, version_number DESC);

ALTER TABLE public.artifact_versions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.job_steps
  ADD COLUMN IF NOT EXISTS dependency_state text NOT NULL DEFAULT 'fresh' CHECK (dependency_state IN ('fresh','stale','needs_review','contradicted','revalidate')),
  ADD COLUMN IF NOT EXISTS validation_state text NOT NULL DEFAULT 'unvalidated' CHECK (validation_state IN ('unvalidated','directional','validated','contradicted')),
  ADD COLUMN IF NOT EXISTS evidence_state text NOT NULL DEFAULT 'partial' CHECK (evidence_state IN ('partial','sufficient','thin','contradicted')),
  ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS stale_reason text NULL,
  ADD COLUMN IF NOT EXISTS stale_since_event_id uuid NULL REFERENCES public.strategic_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_run_id text NULL;

ALTER TABLE public.odi_needs
  ADD COLUMN IF NOT EXISTS dependency_state text NOT NULL DEFAULT 'fresh' CHECK (dependency_state IN ('fresh','stale','needs_review','contradicted','revalidate')),
  ADD COLUMN IF NOT EXISTS validation_state text NOT NULL DEFAULT 'unvalidated' CHECK (validation_state IN ('unvalidated','directional','validated','contradicted')),
  ADD COLUMN IF NOT EXISTS evidence_state text NOT NULL DEFAULT 'partial' CHECK (evidence_state IN ('partial','sufficient','thin','contradicted')),
  ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS stale_reason text NULL,
  ADD COLUMN IF NOT EXISTS stale_since_event_id uuid NULL REFERENCES public.strategic_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_run_id text NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS dependency_state text NOT NULL DEFAULT 'fresh' CHECK (dependency_state IN ('fresh','stale','needs_review','contradicted','revalidate')),
  ADD COLUMN IF NOT EXISTS validation_state text NOT NULL DEFAULT 'unvalidated' CHECK (validation_state IN ('unvalidated','directional','validated','contradicted')),
  ADD COLUMN IF NOT EXISTS evidence_state text NOT NULL DEFAULT 'partial' CHECK (evidence_state IN ('partial','sufficient','thin','contradicted')),
  ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS stale_reason text NULL,
  ADD COLUMN IF NOT EXISTS stale_since_event_id uuid NULL REFERENCES public.strategic_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_run_id text NULL;

ALTER TABLE public.managed_outcomes
  ADD COLUMN IF NOT EXISTS dependency_state text NOT NULL DEFAULT 'fresh' CHECK (dependency_state IN ('fresh','stale','needs_review','contradicted','revalidate')),
  ADD COLUMN IF NOT EXISTS validation_state text NOT NULL DEFAULT 'unvalidated' CHECK (validation_state IN ('unvalidated','directional','validated','contradicted')),
  ADD COLUMN IF NOT EXISTS evidence_state text NOT NULL DEFAULT 'partial' CHECK (evidence_state IN ('partial','sufficient','thin','contradicted')),
  ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS stale_reason text NULL,
  ADD COLUMN IF NOT EXISTS stale_since_event_id uuid NULL REFERENCES public.strategic_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_run_id text NULL;

DO $$
DECLARE
  _table text;
BEGIN
  FOREACH _table IN ARRAY ARRAY['strategic_events','object_dependencies','artifact_versions'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Admins can manage all %s" ON public.%I', replace(_table, '_', ' '), _table);
    EXECUTE format(
      'CREATE POLICY "Admins can manage all %s" ON public.%I FOR ALL USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = ''admin'')) WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = ''admin''))',
      replace(_table, '_', ' '),
      _table
    );

    EXECUTE format('DROP POLICY IF EXISTS "%s company scoped select" ON public.%I', _table, _table);
    EXECUTE format(
      'CREATE POLICY "%s company scoped select" ON public.%I FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.companies c WHERE c.id = %I.company_id AND c.created_by = auth.uid())
        OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = %I.company_id AND cm.user_id = auth.uid())
      )',
      _table,
      _table,
      _table,
      _table
    );

    EXECUTE format('DROP POLICY IF EXISTS "%s company scoped insert" ON public.%I', _table, _table);
    EXECUTE format(
      'CREATE POLICY "%s company scoped insert" ON public.%I FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.companies c WHERE c.id = %I.company_id AND c.created_by = auth.uid())
        OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = %I.company_id AND cm.user_id = auth.uid())
      )',
      _table,
      _table,
      _table,
      _table
    );

    EXECUTE format('DROP POLICY IF EXISTS "%s company scoped update" ON public.%I', _table, _table);
    EXECUTE format(
      'CREATE POLICY "%s company scoped update" ON public.%I FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.companies c WHERE c.id = %I.company_id AND c.created_by = auth.uid())
        OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = %I.company_id AND cm.user_id = auth.uid())
      ) WITH CHECK (
        EXISTS (SELECT 1 FROM public.companies c WHERE c.id = %I.company_id AND c.created_by = auth.uid())
        OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = %I.company_id AND cm.user_id = auth.uid())
      )',
      _table,
      _table,
      _table,
      _table,
      _table,
      _table
    );

    EXECUTE format('DROP POLICY IF EXISTS "%s company scoped delete" ON public.%I', _table, _table);
    EXECUTE format(
      'CREATE POLICY "%s company scoped delete" ON public.%I FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.companies c WHERE c.id = %I.company_id AND c.created_by = auth.uid())
        OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = %I.company_id AND cm.user_id = auth.uid())
      )',
      _table,
      _table,
      _table,
      _table
    );
  END LOOP;
END $$;

