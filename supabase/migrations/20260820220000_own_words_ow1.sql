-- GATE OW-1 (2026-08-20): own-words extractor schema.
--   (a) claims.claim_type admits 'own_words' — the company's verbatim self-assertions,
--       extracted from its client_voice public pages (provenance public_observed,
--       proof_category public_answerable). Additive; no backfill; idempotent.
--   (b) own_words_page_snapshots — the reproducibility corpus for the deterministic verbatim
--       guard. INSERT-only, birth-stamped, immutable (a trigger rejects UPDATE and DELETE) so
--       the substring proof always checks against the exact text the extractor read.
-- CB1 (frozen) is never fetched and never written by the extractor; this migration touches no
-- existing row. Idempotent.

-- ── (a) claim_type admits 'own_words' ────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'claims_claim_type_check') THEN
    ALTER TABLE public.claims DROP CONSTRAINT claims_claim_type_check;
  END IF;
  ALTER TABLE public.claims
    ADD CONSTRAINT claims_claim_type_check
    CHECK (claim_type = ANY (ARRAY[
      'observation', 'inference', 'hypothesis', 'assumption', 'strategic_belief',
      'customer_outcome', 'unmet_need', 'route_candidate', 'own_words'
    ]));
END $$;

-- ── (b) own_words_page_snapshots ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.own_words_page_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id),
  source_url  text NOT NULL,
  signal_id   uuid REFERENCES public.signals(id),
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  clean_text  text NOT NULL,
  text_sha256 text NOT NULL,
  run_id      uuid  -- soft correlation to the extractor's long_runner_runs row (no FK: a tag)
);

CREATE INDEX IF NOT EXISTS own_words_page_snapshots_company_url_idx
  ON public.own_words_page_snapshots (company_id, source_url, fetched_at DESC);

-- Birth-immutable: a snapshot is the exact text read at fetched_at. It is never edited or
-- deleted — the verbatim guard and any audit must always find the same bytes. Mirrors the
-- register birth-immutable guards, but stricter: the WHOLE row is frozen after insert.
CREATE OR REPLACE FUNCTION public.own_words_snapshot_immutable()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'own_words_page_snapshots is insert-only and birth-immutable (% on id %)',
    TG_OP, COALESCE(OLD.id::text, '?');
END
$function$;

DROP TRIGGER IF EXISTS own_words_snapshot_immutable_guard ON public.own_words_page_snapshots;
CREATE TRIGGER own_words_snapshot_immutable_guard
  BEFORE UPDATE OR DELETE ON public.own_words_page_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.own_words_snapshot_immutable();

-- ── integrity_runs admits status 'planned' ──────────────────────────────────
-- The own-words beat's integrity record is written in PLAN (dry-run) mode: it looked, and
-- these are the would-be counts — no substance was committed. 'planned' is that state,
-- distinct from completed/failed. Additive; idempotent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integrity_runs_status_check') THEN
    ALTER TABLE public.integrity_runs DROP CONSTRAINT integrity_runs_status_check;
  END IF;
  ALTER TABLE public.integrity_runs
    ADD CONSTRAINT integrity_runs_status_check
    CHECK (status = ANY (ARRAY['completed', 'failed', 'skipped_empty_input', 'planned']));
END $$;

-- ── RLS: mirror signals (admin all; company owner/member) — reads + inserts only ─────
ALTER TABLE public.own_words_page_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='own_words_page_snapshots' AND policyname='Admins can read all own_words snapshots') THEN
    CREATE POLICY "Admins can read all own_words snapshots" ON public.own_words_page_snapshots
      FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='own_words_page_snapshots' AND policyname='Members can read company own_words snapshots') THEN
    CREATE POLICY "Members can read company own_words snapshots" ON public.own_words_page_snapshots
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.companies c WHERE c.id = own_words_page_snapshots.company_id AND c.created_by = auth.uid())
        OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = own_words_page_snapshots.company_id AND cm.user_id = auth.uid())
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='own_words_page_snapshots' AND policyname='Members can insert company own_words snapshots') THEN
    CREATE POLICY "Members can insert company own_words snapshots" ON public.own_words_page_snapshots
      FOR INSERT WITH CHECK (
        has_role(auth.uid(), 'admin'::app_role)
        OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = own_words_page_snapshots.company_id AND c.created_by = auth.uid())
        OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = own_words_page_snapshots.company_id AND cm.user_id = auth.uid())
      );
  END IF;
END $$;
