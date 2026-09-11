-- Per-surface educational copy shown inline to clients and operators.
-- Distinct from methodology_pages (team-facing CMS for "Our Process" content).
CREATE TABLE IF NOT EXISTS public.surface_educational_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surface_key text NOT NULL,
  section_a_template text,
  section_b_content text,
  audience text NOT NULL DEFAULT 'client_and_operator'
    CHECK (audience IN ('client_and_operator', 'admin_only')),
  is_published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sec_surface_key
  ON public.surface_educational_content (surface_key, is_published, sort_order);

COMMENT ON TABLE public.surface_educational_content IS
  'Per-surface educational copy shown inline to clients and operators. Distinct from methodology_pages (team CMS).';
