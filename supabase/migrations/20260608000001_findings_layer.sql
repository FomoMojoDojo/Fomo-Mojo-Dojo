-- Findings / Watch-outs layer (third tier): standing observations that persist
-- across snapshots until resolved — distinct from the current snapshot (PVT-1) and
-- the run-over-run delta (PVT-2). Plus a shared operator-chosen-primary primitive
-- (reused later for the on-strategy job-step marker) and a read-time resolver.

CREATE TABLE IF NOT EXISTS public.findings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  origin_run_id    bigint NULL REFERENCES public.public_baseline_runs(id) ON DELETE SET NULL,
  -- a finding outlives a scrubbed signal (three-tier model): keep the finding, drop the link.
  origin_signal_id uuid NULL REFERENCES public.signals(id) ON DELETE SET NULL,
  kind             text NOT NULL DEFAULT 'observation' CHECK (kind IN ('observation','watch_out')),
  body             text NOT NULL,
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  tone             text NULL,                 -- reserved (deferred: per-finding tone dial)
  created_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz NULL,
  -- Capture/seed idempotency. A plain UNIQUE (not a partial index) so PostgREST
  -- upsert ON CONFLICT can target it; NULL origin_signal_id stays distinct under
  -- default NULL semantics, so manual/origin-less findings are unconstrained.
  CONSTRAINT findings_company_origin_signal_uniq UNIQUE (company_id, origin_signal_id)
);
CREATE INDEX IF NOT EXISTS findings_company_status_idx ON public.findings (company_id, status);

CREATE TABLE IF NOT EXISTS public.operator_primary_selection (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain     text NOT NULL CHECK (domain IN ('finding','job_step_set')),
  item_id    uuid NOT NULL,                   -- polymorphic logical ref (no FK)
  chosen_by  text NULL,
  chosen_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operator_primary_selection_uniq UNIQUE (company_id, domain)
);

-- RLS: mirror companies (admins manage). Edge functions write via service role,
-- which bypasses RLS, so capture/seed are unaffected.
ALTER TABLE public.findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_primary_selection ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage findings" ON public.findings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage operator_primary_selection" ON public.operator_primary_selection
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- Read-time primary resolver. Operator choice wins when its target finding exists
-- AND is still open; otherwise the MVP default heuristic: watch_out-first, newest
-- run, newest. (watch_out-first is a deliberate lead heuristic, operator-overridable
-- — NOT the deferred tone dial.)
CREATE OR REPLACE FUNCTION public.find_primary_finding(p_company_id uuid)
RETURNS SETOF public.findings
LANGUAGE sql STABLE AS $$
  WITH chosen AS (
    SELECT f.*
    FROM public.operator_primary_selection ops
    JOIN public.findings f ON f.id = ops.item_id
    WHERE ops.company_id = p_company_id
      AND ops.domain = 'finding'
      AND f.status = 'open'
    LIMIT 1
  )
  SELECT * FROM chosen
  UNION ALL
  (
    SELECT f.*
    FROM public.findings f
    WHERE f.company_id = p_company_id
      AND f.status = 'open'
      AND NOT EXISTS (SELECT 1 FROM chosen)
    ORDER BY (f.kind = 'watch_out') DESC, f.origin_run_id DESC NULLS LAST, f.created_at DESC, f.id DESC
    LIMIT 1
  );
$$;
