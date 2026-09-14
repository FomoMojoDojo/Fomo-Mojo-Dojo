-- Re-mint mechanism (signed 2026-09-13): version-stamped verdicts and overrides, signals superseded
-- (never deleted), claims struck through set_claim_status with the remint reason, and a ledger.
--
-- 1. doc_voice_verdicts — classifier_version / override_version (the criterion_version precedent).
--    A newer classifier writes a version-2 MODEL row beside the version-1 row; a later operator
--    decision writes a version-2 OVERRIDE row beside the earlier one. Rows are never edited; readers
--    take the highest version of each kind for an exact (input_file_id, content_sha).
-- 2. provenance_remints — one row per applied (or dry-run) re-mint of a document's proposal, and one
--    note row per artifact recorded as synthesized from a corpus that contained withdrawn documents.

ALTER TABLE public.doc_voice_verdicts
  ADD COLUMN IF NOT EXISTS classifier_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS override_version integer NOT NULL DEFAULT 1;

DROP INDEX IF EXISTS public.doc_voice_verdicts_model_uniq;
DROP INDEX IF EXISTS public.doc_voice_verdicts_override_uniq;
CREATE UNIQUE INDEX doc_voice_verdicts_model_uniq
  ON public.doc_voice_verdicts (input_file_id, content_sha, classifier_version) WHERE (operator_override IS NULL);
CREATE UNIQUE INDEX doc_voice_verdicts_override_uniq
  ON public.doc_voice_verdicts (input_file_id, content_sha, override_version) WHERE (operator_override IS NOT NULL);

COMMENT ON COLUMN public.doc_voice_verdicts.classifier_version IS 'model rows: 1 = binary voice classifier; 2 = authorship+subject classifier (a779766). Highest wins; older rows are history.';
COMMENT ON COLUMN public.doc_voice_verdicts.override_version IS 'override rows: a later operator decision is a new row with the next version; the earlier row stays as history.';

CREATE TABLE IF NOT EXISTS public.provenance_remints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('remint', 'artifact_note')),
  input_file_id uuid,
  content_sha text,
  proposal_id uuid,
  artifact_table text,
  artifact_id uuid,
  from_authorship text,
  from_subject text,
  to_authorship text,
  to_subject text,
  superseded_signal_ids uuid[] NOT NULL DEFAULT '{}',
  struck_claim_ids uuid[] NOT NULL DEFAULT '{}',
  minted_signal_ids uuid[] NOT NULL DEFAULT '{}',
  minted_claim_ids uuid[] NOT NULL DEFAULT '{}',
  dry_run boolean NOT NULL DEFAULT false,
  actor text NOT NULL,
  note text,
  applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS provenance_remints_company_idx ON public.provenance_remints (company_id, applied_at DESC);
COMMENT ON TABLE public.provenance_remints IS 'Ledger of upload-provenance re-mints (signed 2026-09-13): what was superseded, struck and minted, per document proposal; plus artifact notes.';

-- Append-only: a ledger row is never edited or deleted — except inside a deliberate purge transaction that
-- SET LOCAL app.remint_ledger_purge = 'on' (the register-backfill precedent), which exists only so a
-- throwaway company's rows can go with the company. Edits are refused unconditionally.
CREATE OR REPLACE FUNCTION public.provenance_remints_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.remint_ledger_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'provenance_remints is append-only (row %)', OLD.id;
END $$;
DROP TRIGGER IF EXISTS provenance_remints_immutable ON public.provenance_remints;
CREATE TRIGGER provenance_remints_immutable BEFORE UPDATE OR DELETE ON public.provenance_remints
  FOR EACH ROW EXECUTE FUNCTION public.provenance_remints_immutable();
