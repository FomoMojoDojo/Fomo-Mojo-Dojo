-- file_proposals: staged analysis outputs from Dify workflows.
-- Proposals never affect readiness/scoring until explicitly accepted by the user.
-- Rejected proposals are retained as audit log but excluded from all scoring reads.

CREATE TABLE public.file_proposals (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  file_id             uuid        NOT NULL,
  file_name           text        NOT NULL DEFAULT '',
  source_type         text        NOT NULL DEFAULT '',
  summary             text        NOT NULL DEFAULT '',
  signal_type         text        NOT NULL DEFAULT 'document',
  suggested_areas     text[]      NOT NULL DEFAULT '{}',
  candidate_needs     jsonb       NOT NULL DEFAULT '[]',
  possible_gaps       jsonb       NOT NULL DEFAULT '[]',
  possible_routes     jsonb       NOT NULL DEFAULT '[]',
  confidence          text        NOT NULL DEFAULT 'medium'
                                  CHECK (confidence IN ('high', 'medium', 'low')),
  questions_to_verify jsonb       NOT NULL DEFAULT '[]',
  status              text        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending', 'accepted', 'rejected')),
  applied_areas       text[]      NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  reviewed_at         timestamptz
);

CREATE INDEX file_proposals_company_file_idx
  ON public.file_proposals (company_id, file_id, created_at DESC);

ALTER TABLE public.file_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all file proposals"
ON public.file_proposals FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view company file proposals"
ON public.file_proposals FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = file_proposals.company_id
      AND (
        c.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.company_members cm
          WHERE cm.company_id = c.id AND cm.user_id = auth.uid()
        )
      )
  )
);

CREATE POLICY "Users can update company file proposals"
ON public.file_proposals FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = file_proposals.company_id
      AND (
        c.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.company_members cm
          WHERE cm.company_id = c.id AND cm.user_id = auth.uid()
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = file_proposals.company_id
      AND (
        c.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.company_members cm
          WHERE cm.company_id = c.id AND cm.user_id = auth.uid()
        )
      )
  )
);
