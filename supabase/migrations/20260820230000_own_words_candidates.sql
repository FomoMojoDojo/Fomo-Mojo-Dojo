-- GATE R1/OW-2 write-determinism (operator ruling B, 2026-08-20): freeze the generator's output.
-- Plan mode persists every generator candidate + its judge verdict, keyed to the snapshot text it
-- was read from and the plan run_id. WRITE mode reads the LATEST plan run's candidates and applies
-- the DETERMINISTIC rails (assembleOwnWords) — it never calls the generator, so the write is
-- reproducible. INSERT-only + birth-immutable, exactly like own_words_page_snapshots. Additive.

CREATE TABLE IF NOT EXISTS public.own_words_candidates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id),
  source_url          text NOT NULL,
  signal_id           uuid REFERENCES public.signals(id),
  snapshot_text_sha256 text NOT NULL,   -- the exact snapshot the candidate was read from
  run_id              uuid NOT NULL,     -- groups one logical plan run (shared across its batches)
  quote               text NOT NULL,
  quote_offset        integer NOT NULL DEFAULT -1,
  quote_length        integer NOT NULL DEFAULT 0,
  judge_keep          boolean NOT NULL DEFAULT false,
  judge_self_assertion boolean NOT NULL DEFAULT false,
  judge_fidelity      text NOT NULL DEFAULT 'verbatim',
  judge_reason        text,
  content_identity    text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS own_words_candidates_company_run_idx
  ON public.own_words_candidates (company_id, run_id, created_at DESC);

-- Birth-immutable — the frozen set is the write's single source of truth; it must never change.
CREATE OR REPLACE FUNCTION public.own_words_candidate_immutable()
  RETURNS trigger LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'own_words_candidates is insert-only and birth-immutable (% on id %)',
    TG_OP, COALESCE(OLD.id::text, '?');
END
$function$;

DROP TRIGGER IF EXISTS own_words_candidate_immutable_guard ON public.own_words_candidates;
CREATE TRIGGER own_words_candidate_immutable_guard
  BEFORE UPDATE OR DELETE ON public.own_words_candidates
  FOR EACH ROW EXECUTE FUNCTION public.own_words_candidate_immutable();

-- RLS mirrors own_words_page_snapshots (admin + owner/member SELECT; owner/member/admin INSERT).
ALTER TABLE public.own_words_candidates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='own_words_candidates' AND policyname='Admins can read all own_words candidates') THEN
    CREATE POLICY "Admins can read all own_words candidates" ON public.own_words_candidates
      FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='own_words_candidates' AND policyname='Members can read company own_words candidates') THEN
    CREATE POLICY "Members can read company own_words candidates" ON public.own_words_candidates
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.companies c WHERE c.id = own_words_candidates.company_id AND c.created_by = auth.uid())
        OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = own_words_candidates.company_id AND cm.user_id = auth.uid())
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='own_words_candidates' AND policyname='Members can insert company own_words candidates') THEN
    CREATE POLICY "Members can insert company own_words candidates" ON public.own_words_candidates
      FOR INSERT WITH CHECK (
        has_role(auth.uid(), 'admin'::app_role)
        OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = own_words_candidates.company_id AND c.created_by = auth.uid())
        OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = own_words_candidates.company_id AND cm.user_id = auth.uid())
      );
  END IF;
END $$;
