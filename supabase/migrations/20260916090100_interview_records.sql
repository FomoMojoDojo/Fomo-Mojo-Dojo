-- Gate 1 (operator ruling 2026-09-16), migration B — interview records + the odi_needs pointer + the
-- triggers that make a fabricated or altered "you told us" structurally impossible.
--
-- Additive only. No existing row changes. No function, no UI (gates 2-4).
--
-- An interview record is the attestation: WHO said it (person, their role), in WHICH capacity
-- (speaker_role — client stakeholder vs market participant), WHEN, to WHOM, on WHAT consent basis,
-- and the VERBATIM. Records are retracted, never deleted, and never edited after birth. A need that
-- claims one of the two interview provenances must point at a record of the matching speaker role,
-- and can never carry an ODI service verdict of its own.

BEGIN;

-- ── a. the table ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.interview_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  speaker_role text NOT NULL CHECK (speaker_role IN ('client_stakeholder', 'market_participant')),
  person_name text NOT NULL CHECK (length(btrim(person_name)) > 0),
  -- the person's role at their own organization; free text, nullable
  person_role text,
  -- the market this voice belongs to. Named journey_key ONLY to match the odi_needs join column;
  -- no surface ever says "journey". Required for a market participant, optional for a stakeholder.
  journey_key text,
  interviewed_at timestamptz NOT NULL,
  interviewer text NOT NULL,
  consent_basis text NOT NULL CHECK (length(btrim(consent_basis)) > 0),
  verbatim text NOT NULL CHECK (length(btrim(verbatim)) > 0),
  -- set by trigger from (company_id, speaker_role, normalized verbatim) — never by the caller
  content_identity text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  retracted_at timestamptz,
  retracted_reason text,
  retracted_by uuid,
  CONSTRAINT interview_records_market_needs_key
    CHECK (speaker_role <> 'market_participant' OR journey_key IS NOT NULL)
);

CREATE UNIQUE INDEX interview_records_company_identity_live
  ON public.interview_records (company_id, content_identity)
  WHERE retracted_at IS NULL;
CREATE INDEX interview_records_company_journey_idx
  ON public.interview_records (company_id, journey_key);

-- ── b. content identity at birth ─────────────────────────────────────────────────────────────
-- Same shape as the attested-claims namespace (feed-first-read-corrections attestedClaimId):
-- sha256("<namespace>:<company_id>:<origin>:<normalizeForHash(text)>"), where normalizeForHash is
-- lower-case, whitespace runs collapsed to one space, trimmed (_shared/contentIdentity.ts).
CREATE OR REPLACE FUNCTION public.interview_records_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  normalized text;
BEGIN
  normalized := btrim(regexp_replace(lower(coalesce(NEW.verbatim, '')), '\s+', ' ', 'g'));
  NEW.content_identity := encode(
    extensions.digest(
      'interview-records-2026-09:' || NEW.company_id::text || ':' || NEW.speaker_role || ':' || normalized,
      'sha256'
    ),
    'hex'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER interview_records_identity
  BEFORE INSERT ON public.interview_records
  FOR EACH ROW EXECUTE FUNCTION public.interview_records_identity();

-- ── c. immutability: retract-once, never edit, never delete ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.interview_records_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'interview records are retracted, never deleted — record % (%)', OLD.id, OLD.person_name;
  END IF;

  -- Retraction is set-once: a retracted record can never change again, including its retraction.
  IF OLD.retracted_at IS NOT NULL THEN
    RAISE EXCEPTION 'interview record % is retracted and can no longer change (retracted % — %)',
      OLD.id, OLD.retracted_at, coalesce(OLD.retracted_reason, 'no reason recorded');
  END IF;

  -- Every column except the three retraction columns is immutable after birth.
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.speaker_role IS DISTINCT FROM OLD.speaker_role
     OR NEW.person_name IS DISTINCT FROM OLD.person_name
     OR NEW.person_role IS DISTINCT FROM OLD.person_role
     OR NEW.journey_key IS DISTINCT FROM OLD.journey_key
     OR NEW.interviewed_at IS DISTINCT FROM OLD.interviewed_at
     OR NEW.interviewer IS DISTINCT FROM OLD.interviewer
     OR NEW.consent_basis IS DISTINCT FROM OLD.consent_basis
     OR NEW.verbatim IS DISTINCT FROM OLD.verbatim
     OR NEW.content_identity IS DISTINCT FROM OLD.content_identity
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'interview record % is immutable after birth — only retracted_at / retracted_reason / retracted_by may be set, once', OLD.id;
  END IF;

  -- A retraction must actually retract: retracted_at set together with a reason.
  IF NEW.retracted_at IS NOT NULL AND (NEW.retracted_reason IS NULL OR length(btrim(NEW.retracted_reason)) = 0) THEN
    RAISE EXCEPTION 'interview record % cannot be retracted without retracted_reason', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER interview_records_immutable
  BEFORE UPDATE OR DELETE ON public.interview_records
  FOR EACH ROW EXECUTE FUNCTION public.interview_records_immutable();

-- ── d. the pointer on odi_needs ──────────────────────────────────────────────────────────────
ALTER TABLE public.odi_needs
  ADD COLUMN interview_record_id uuid REFERENCES public.interview_records(id) ON DELETE RESTRICT;
CREATE INDEX idx_odi_needs_interview_record_id ON public.odi_needs (interview_record_id);

-- ── e. consistency: provenance ⇔ record, matching speaker role, no verdict, immutable pairing ──
-- Escape hatch: the SAME per-transaction setting as claims_provenance_immutable_guard
-- (app.provenance_backfill = 'on'), and nothing else.
CREATE OR REPLACE FUNCTION public.odi_needs_interview_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  is_interview boolean;
  rec_role text;
  rec_company uuid;
BEGIN
  IF current_setting('app.provenance_backfill', true) = 'on' THEN
    RETURN NEW;
  END IF;

  is_interview := NEW.provenance_type::text IN ('client_attested', 'market_interviewed');

  -- provenance ⇔ pointer, both directions
  IF is_interview AND NEW.interview_record_id IS NULL THEN
    RAISE EXCEPTION 'odi_needs.provenance_type % requires interview_record_id — a "you told us" need must point at its interview record', NEW.provenance_type;
  END IF;
  IF NOT is_interview AND NEW.interview_record_id IS NOT NULL THEN
    RAISE EXCEPTION 'odi_needs.interview_record_id is only valid with provenance_type client_attested or market_interviewed (got %)', NEW.provenance_type;
  END IF;

  IF is_interview THEN
    SELECT speaker_role, company_id INTO rec_role, rec_company
      FROM public.interview_records WHERE id = NEW.interview_record_id;
    IF rec_role IS NULL THEN
      RAISE EXCEPTION 'odi_needs.interview_record_id % does not name an interview record', NEW.interview_record_id;
    END IF;
    IF rec_company IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'interview record % belongs to another company', NEW.interview_record_id;
    END IF;
    IF NEW.provenance_type::text = 'client_attested' AND rec_role <> 'client_stakeholder' THEN
      RAISE EXCEPTION 'client_attested requires an interview record with speaker_role client_stakeholder (record % is %)', NEW.interview_record_id, rec_role;
    END IF;
    IF NEW.provenance_type::text = 'market_interviewed' AND rec_role <> 'market_participant' THEN
      RAISE EXCEPTION 'market_interviewed requires an interview record with speaker_role market_participant (record % is %)', NEW.interview_record_id, rec_role;
    END IF;
    -- an interview finding is evidence, never an ODI verdict
    IF lower(coalesce(NEW.service_state, '')) IN ('underserved', 'under_served') THEN
      RAISE EXCEPTION 'an interview-sourced need (%) can never carry service_state underserved — findings are evidence, not verdicts', NEW.provenance_type;
    END IF;
  END IF;

  -- once born as an interview need, the pairing is immutable
  IF TG_OP = 'UPDATE' AND OLD.provenance_type::text IN ('client_attested', 'market_interviewed') THEN
    IF NEW.provenance_type IS DISTINCT FROM OLD.provenance_type THEN
      RAISE EXCEPTION 'odi_needs.provenance_type is immutable for an interview-sourced need — % cannot change % -> %', OLD.id, OLD.provenance_type, NEW.provenance_type;
    END IF;
    IF NEW.interview_record_id IS DISTINCT FROM OLD.interview_record_id THEN
      RAISE EXCEPTION 'odi_needs.interview_record_id is immutable for an interview-sourced need — % cannot change % -> %', OLD.id, OLD.interview_record_id, NEW.interview_record_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER odi_needs_interview_consistency
  BEFORE INSERT OR UPDATE ON public.odi_needs
  FOR EACH ROW EXECUTE FUNCTION public.odi_needs_interview_consistency();

-- ── f. RLS, mirroring odi_needs; retraction is an operator-only data act; no DELETE policy ────
ALTER TABLE public.interview_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all interview_records"
  ON public.interview_records FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view company interview_records"
  ON public.interview_records FOR SELECT TO authenticated
  USING (
    auth.uid() = created_by
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = interview_records.company_id AND c.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = interview_records.company_id AND cm.user_id = auth.uid())
  );

CREATE POLICY "Users can insert company interview_records"
  ON public.interview_records FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND (
      EXISTS (SELECT 1 FROM public.companies c WHERE c.id = interview_records.company_id AND c.created_by = auth.uid())
      OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = interview_records.company_id AND cm.user_id = auth.uid())
    )
  );
-- UPDATE: admin only (through the ALL policy above). DELETE: no policy — and the trigger refuses anyway.

-- ── g. company freeze, same as odi_needs ─────────────────────────────────────────────────────
CREATE TRIGGER enforce_company_freeze
  BEFORE INSERT OR DELETE OR UPDATE ON public.interview_records
  FOR EACH ROW EXECUTE FUNCTION public.enforce_company_freeze();

COMMIT;
