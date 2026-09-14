-- EXCERPT VERIFICATIONS (trace design signed 2026-09-14, eight rulings): a durable, append-only record of
-- whether a stored evidence_excerpt was verified against a basis, which basis, and when.
--
-- WHY. The public E4 guard blanked an untraceable excerpt but recorded nothing on a pass, so a verified
-- excerpt and a never-checked one were indistinguishable after the fact; a back-verification could not be
-- shown to have happened. This table is the check_outcomes precedent applied to excerpts: keyed by CONTENT
-- (company, source, excerpt identity, guard version), not by signal id — ingest is delete-by-source +
-- reinsert, so a signal id dies on re-ingest while the record must not. signal_id is informational only.
--
-- VERDICTS. passed | blanked | no_basis. never_checked is the ABSENCE of a row and is never written —
-- it means "no record exists", never a failure, a blank, or a doubt about the text.
-- BASIS. retained_page (the crawl's text at mint) | quote_source_text | sidecar | page_snapshot |
-- refetch (rulings 1–2: a later fetch of the same URL — the record must never imply it was the mint-time
-- page: basis_at carries the fetch time) | none (with no_basis_reason).
-- GUARD VERSION. Starts at 1 (the normalizeForHash-substring rule, with its real edges — the Oxford-comma
-- case) and moves ONLY by operator ruling, mirroring criterion_version / check_version: a looser rule
-- writes new rows beside the old; old verdicts stand as history and are never re-judged.
-- KEY. One verdict per (company_id, source_url, excerpt_identity, guard_version): a second run writes
-- nothing new for an unchanged key (idempotent by construction).
CREATE TABLE IF NOT EXISTS public.excerpt_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  signal_id uuid,                                  -- informational; NO foreign key — outlives re-ingest
  source_url text NOT NULL,                        -- the source key: the signal's URL; 'file:<path>' for a document; 'proposal:<id>' when neither
  excerpt_identity text NOT NULL,                  -- sha256(normalizeForHash(evidence_excerpt)) — TS authority contentIdentity.ts
  guard_version integer NOT NULL DEFAULT 1,
  verdict text NOT NULL CHECK (verdict IN ('passed', 'blanked', 'no_basis')),
  basis_kind text NOT NULL CHECK (basis_kind IN ('retained_page', 'quote_source_text', 'sidecar', 'page_snapshot', 'refetch', 'none')),
  basis_sha text,                                  -- sha256(normalizeForHash(basis text)); NULL when none
  basis_at timestamptz,                            -- when the basis text was captured (mint / snapshot / re-fetch time)
  no_basis_reason text,                            -- page_not_retained | frozen_company_no_refetch | fetch_blocked | fetch_gone | no_document | file_row_deleted | no_sidecar
  recorded_by text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  note text,
  CONSTRAINT excerpt_verifications_basis_consistent CHECK (
    (verdict = 'no_basis' AND basis_kind = 'none' AND basis_sha IS NULL AND no_basis_reason IS NOT NULL)
    OR (verdict IN ('passed', 'blanked') AND basis_kind <> 'none' AND basis_sha IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS excerpt_verifications_key
  ON public.excerpt_verifications (company_id, source_url, excerpt_identity, guard_version);
CREATE INDEX IF NOT EXISTS excerpt_verifications_signal_idx ON public.excerpt_verifications (signal_id);
COMMENT ON TABLE public.excerpt_verifications IS 'Durable excerpt verification records (signed 2026-09-14). Append-only; one verdict per (company, source_url, excerpt_identity, guard_version); never_checked = no row, never written.';

-- Append-only: never updated, never deleted — except inside a deliberate purge transaction that
-- SET LOCAL app.excerpt_verifications_purge = 'on' (the provenance_remints precedent), which exists only so a
-- throwaway company's rows can go with the company.
CREATE OR REPLACE FUNCTION public.excerpt_verifications_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.excerpt_verifications_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'excerpt_verifications is append-only (row %)', OLD.id;
END $$;
DROP TRIGGER IF EXISTS excerpt_verifications_immutable ON public.excerpt_verifications;
CREATE TRIGGER excerpt_verifications_immutable BEFORE UPDATE OR DELETE ON public.excerpt_verifications
  FOR EACH ROW EXECUTE FUNCTION public.excerpt_verifications_immutable();
