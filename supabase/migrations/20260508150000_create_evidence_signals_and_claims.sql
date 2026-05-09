CREATE TABLE IF NOT EXISTS public.signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source_id text,
  source_type text NOT NULL,
  source_title text,
  source_url text,
  signal_band text NOT NULL,
  evidence_type text NOT NULL DEFAULT 'unknown',
  claim_text text NOT NULL,
  evidence_excerpt text NOT NULL DEFAULT '',
  topic text,
  framework text,
  directness text NOT NULL DEFAULT 'weak',
  recency text,
  framing_fit text NOT NULL DEFAULT 'unknown',
  structure_level text NOT NULL DEFAULT 'raw',
  validation_status text NOT NULL DEFAULT 'unvalidated',
  confidence_to_use text NOT NULL DEFAULT 'low',
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signals_signal_band_check
    CHECK (signal_band IN ('outside', 'organization', 'customer')),
  CONSTRAINT signals_evidence_type_check
    CHECK (evidence_type IN ('founder_narrative', 'internal_data', 'market_signal', 'customer_validation', 'quantitative', 'unknown')),
  CONSTRAINT signals_directness_check
    CHECK (directness IN ('direct', 'inferred', 'weak')),
  CONSTRAINT signals_framing_fit_check
    CHECK (framing_fit IN ('strong', 'partial', 'weak', 'unknown')),
  CONSTRAINT signals_structure_level_check
    CHECK (structure_level IN ('raw', 'extracted', 'interpreted')),
  CONSTRAINT signals_validation_status_check
    CHECK (validation_status IN ('unvalidated', 'directional', 'validated', 'contradicted')),
  CONSTRAINT signals_confidence_to_use_check
    CHECK (confidence_to_use IN ('high', 'medium', 'low'))
);

CREATE TABLE IF NOT EXISTS public.claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  statement text NOT NULL,
  topic text,
  claim_type text NOT NULL DEFAULT 'observation',
  outside_support_count integer NOT NULL DEFAULT 0,
  organization_support_count integer NOT NULL DEFAULT 0,
  customer_support_count integer NOT NULL DEFAULT 0,
  triangulation_state text NOT NULL DEFAULT 'untested',
  confidence text NOT NULL DEFAULT 'low',
  revalidation_flag boolean NOT NULL DEFAULT false,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT claims_claim_type_check
    CHECK (claim_type IN ('observation', 'inference', 'hypothesis', 'assumption', 'strategic_belief', 'customer_outcome', 'unmet_need', 'route_candidate')),
  CONSTRAINT claims_triangulation_state_check
    CHECK (triangulation_state IN ('single_source', 'multi_source', 'customer_backed', 'contradicted', 'untested')),
  CONSTRAINT claims_confidence_check
    CHECK (confidence IN ('high', 'medium', 'low'))
);

CREATE TABLE IF NOT EXISTS public.claim_signal_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  claim_id uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  signal_id uuid NOT NULL REFERENCES public.signals(id) ON DELETE CASCADE,
  relationship text NOT NULL DEFAULT 'supports',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT claim_signal_refs_relationship_check
    CHECK (relationship IN ('supports', 'contradicts', 'qualifies'))
);

CREATE INDEX IF NOT EXISTS idx_signals_company_id ON public.signals(company_id);
CREATE INDEX IF NOT EXISTS idx_signals_signal_band ON public.signals(signal_band);
CREATE INDEX IF NOT EXISTS idx_signals_source_type ON public.signals(source_type);
CREATE INDEX IF NOT EXISTS idx_signals_topic ON public.signals(topic);
CREATE INDEX IF NOT EXISTS idx_claims_company_id ON public.claims(company_id);
CREATE INDEX IF NOT EXISTS idx_claims_claim_type ON public.claims(claim_type);
CREATE INDEX IF NOT EXISTS idx_claims_triangulation_state ON public.claims(triangulation_state);
CREATE INDEX IF NOT EXISTS idx_claim_signal_refs_company_id ON public.claim_signal_refs(company_id);
CREATE INDEX IF NOT EXISTS idx_claim_signal_refs_claim_id ON public.claim_signal_refs(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_signal_refs_signal_id ON public.claim_signal_refs(signal_id);

ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_signal_refs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'signals' AND policyname = 'Admins can manage all signals'
  ) THEN
    CREATE POLICY "Admins can manage all signals"
      ON public.signals FOR ALL
      TO authenticated
      USING (public.has_role(auth.uid(), 'admin'))
      WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'claims' AND policyname = 'Admins can manage all claims'
  ) THEN
    CREATE POLICY "Admins can manage all claims"
      ON public.claims FOR ALL
      TO authenticated
      USING (public.has_role(auth.uid(), 'admin'))
      WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'claim_signal_refs' AND policyname = 'Admins can manage all claim signal refs'
  ) THEN
    CREATE POLICY "Admins can manage all claim signal refs"
      ON public.claim_signal_refs FOR ALL
      TO authenticated
      USING (public.has_role(auth.uid(), 'admin'))
      WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'signals' AND policyname = 'Users can manage company signals'
  ) THEN
    CREATE POLICY "Users can manage company signals"
      ON public.signals FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.companies c
          WHERE c.id = signals.company_id
            AND c.created_by = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.company_members cm
          WHERE cm.company_id = signals.company_id
            AND cm.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.companies c
          WHERE c.id = signals.company_id
            AND c.created_by = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.company_members cm
          WHERE cm.company_id = signals.company_id
            AND cm.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'claims' AND policyname = 'Users can manage company claims'
  ) THEN
    CREATE POLICY "Users can manage company claims"
      ON public.claims FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.companies c
          WHERE c.id = claims.company_id
            AND c.created_by = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.company_members cm
          WHERE cm.company_id = claims.company_id
            AND cm.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.companies c
          WHERE c.id = claims.company_id
            AND c.created_by = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.company_members cm
          WHERE cm.company_id = claims.company_id
            AND cm.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'claim_signal_refs' AND policyname = 'Users can manage company claim signal refs'
  ) THEN
    CREATE POLICY "Users can manage company claim signal refs"
      ON public.claim_signal_refs FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.companies c
          WHERE c.id = claim_signal_refs.company_id
            AND c.created_by = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.company_members cm
          WHERE cm.company_id = claim_signal_refs.company_id
            AND cm.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.companies c
          WHERE c.id = claim_signal_refs.company_id
            AND c.created_by = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.company_members cm
          WHERE cm.company_id = claim_signal_refs.company_id
            AND cm.user_id = auth.uid()
        )
      );
  END IF;
END $$;
