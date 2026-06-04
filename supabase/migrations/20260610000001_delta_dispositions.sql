-- delta_dispositions: operator adjudication of internal ↔ public strategy delta.
-- One row per signal. disposition = 'intentional' (deliberate gap) | 'queued' (to address).
-- Consumed by the journey-respect workstream to exclude resolved gaps from surfacing.
CREATE TABLE IF NOT EXISTS public.delta_dispositions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id)  ON DELETE CASCADE,
  signal_id   uuid NOT NULL REFERENCES public.signals(id)    ON DELETE CASCADE,
  disposition text NOT NULL CHECK (disposition IN ('intentional', 'queued')),
  phase       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (signal_id)
);

ALTER TABLE public.delta_dispositions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'delta_dispositions'
      AND policyname = 'Admins can manage all delta_dispositions'
  ) THEN
    CREATE POLICY "Admins can manage all delta_dispositions"
      ON public.delta_dispositions FOR ALL TO authenticated
      USING  (public.has_role(auth.uid(), 'admin'))
      WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'delta_dispositions'
      AND policyname = 'Members can manage their company delta_dispositions'
  ) THEN
    CREATE POLICY "Members can manage their company delta_dispositions"
      ON public.delta_dispositions FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.companies c
          WHERE c.id = delta_dispositions.company_id AND c.created_by = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.company_members cm
          WHERE cm.company_id = delta_dispositions.company_id AND cm.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.companies c
          WHERE c.id = delta_dispositions.company_id AND c.created_by = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.company_members cm
          WHERE cm.company_id = delta_dispositions.company_id AND cm.user_id = auth.uid()
        )
      );
  END IF;
END $$;
