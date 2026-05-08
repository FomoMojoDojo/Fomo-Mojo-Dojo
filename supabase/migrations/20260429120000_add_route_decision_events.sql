CREATE TABLE public.route_decision_events (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  route_id   uuid,
  event_type text        NOT NULL CHECK (event_type IN ('selected', 'cleared', 'changed')),
  summary_json jsonb     NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX route_decision_events_company_id_idx ON public.route_decision_events (company_id, created_at DESC);
