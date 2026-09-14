-- Retirement by operator decision (ruling 2026-09-14): a proposal's live signals are superseded and its
-- sole-backed claims struck under a reason the OPERATOR states (e.g. operator_retired:test_ingest) —
-- no re-ingest, no minting_version 2 rows, no origin resolution. The ledger records the decision as a
-- third kind on provenance_remints, sibling to 'remint': one 'retirement' row per proposal, carrying the
-- operator's reason verbatim. Rows stay append-only (provenance_remints_immutable is unchanged).

ALTER TABLE public.provenance_remints DROP CONSTRAINT IF EXISTS provenance_remints_kind_check;
ALTER TABLE public.provenance_remints ADD CONSTRAINT provenance_remints_kind_check
  CHECK (kind IN ('remint', 'artifact_note', 'retirement'));

ALTER TABLE public.provenance_remints ADD COLUMN IF NOT EXISTS reason text;
COMMENT ON COLUMN public.provenance_remints.reason IS 'retirement rows: the operator''s stated reason, verbatim (e.g. operator_retired:test_ingest) — an operator decision, never a machine finding';
