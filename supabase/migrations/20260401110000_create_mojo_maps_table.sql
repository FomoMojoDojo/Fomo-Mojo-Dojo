CREATE TABLE IF NOT EXISTS public.mojo_maps (
  id text PRIMARY KEY,
  map_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  seed_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mojo_maps_updated_at
  ON public.mojo_maps(updated_at DESC);

ALTER TABLE public.mojo_maps ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'mojo_maps'
      AND policyname = 'Admins can manage all mojo maps'
  ) THEN
    CREATE POLICY "Admins can manage all mojo maps"
      ON public.mojo_maps
      FOR ALL
      TO authenticated
      USING (public.has_role(auth.uid(), 'admin'))
      WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_mojo_maps_updated_at'
  ) THEN
    CREATE TRIGGER update_mojo_maps_updated_at
      BEFORE UPDATE ON public.mojo_maps
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
