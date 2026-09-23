-- Interview parser, commit 4a — OUR-SIDE SPEAKERS (R5) and what SUPERSESSION (R6/R7) needs.
--
-- R5. A kickoff transcript has two sides in it. The consultant's own words are not the client's
-- evidence: an item quoting our side is not a customer's job, pain, desire or outcome, and converting
-- it spends model time inventing a framework statement for something that was never evidence. The
-- record now carries WHICH LABELS ARE OURS, and every item lands stamped with the side it came from.
--
--   • interview_records.our_speakers text[] NOT NULL DEFAULT '{}' — the labels, exactly as the
--     transcript spells them. Empty means "we have not said", which reads as all-client.
--   • set_interview_our_speakers(p_record_id, p_labels) — admin only, refuses a withdrawn record and a
--     frozen company, allowed BEFORE or AFTER parsed_at (R5), and writes one integrity_runs row whose
--     payload carries the COUNT of labels and never the labels themselves.
--   • interview_items.speaker_side text CHECK (client|ours) NOT NULL — derived AT LANDING from the
--     record's our_speakers as they stood at that moment. It is fixed at landing like the words and the
--     pointer: R7 says a later change to our_speakers never rewrites an item, it is recognised by the
--     NEXT parse, which retracts the item and lands it again on the other side.
--
-- R6/R7 need NO new constraint: interview_items_retraction_pair already admits any non-blank
-- retracted_reason, so "superseded by rules 2026-09-23.1" and "speaker side changed" are legal today.
-- This migration adds no reason vocabulary on purpose — a reason is prose for the audit, and pinning a
-- list here would mean a migration every time a rules version moves.
--
-- CONTENT IDENTITY IS UNCHANGED (rule 5). speaker_side is NOT in the hash: the same words from the same
-- passage are the same item whichever side said them, which is exactly what makes R7's retract-and-
-- re-land legible — the identity matches, so the pair is visibly the same item twice, not two items.
BEGIN;

-- ── R5: the record's side setting ────────────────────────────────────────────────────────────────
ALTER TABLE public.interview_records
  ADD COLUMN IF NOT EXISTS our_speakers text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.interview_records.our_speakers IS
  'R5 (2026-09-23): the speaker labels on THIS record that are our own side, spelled as the transcript spells them. Set only by set_interview_our_speakers. Empty means not yet said, which lands every item as client.';

-- ── R5: the side stamp on every item ─────────────────────────────────────────────────────────────
ALTER TABLE public.interview_items
  ADD COLUMN IF NOT EXISTS speaker_side text NOT NULL DEFAULT 'client';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interview_items_speaker_side_check') THEN
    ALTER TABLE public.interview_items
      ADD CONSTRAINT interview_items_speaker_side_check CHECK (speaker_side IN ('client', 'ours'));
  END IF;
END $$;

COMMENT ON COLUMN public.interview_items.speaker_side IS
  'R5 (2026-09-23): client | ours, derived AT LANDING from the record''s our_speakers at that moment. THE ROWS THAT EXISTED WHEN THIS COLUMN WAS ADDED WERE BACKFILLED AS client: they were parsed before the setting existed and nobody had said which labels were ours. A re-parse recomputes it (R7).';

-- ── R5/R7: the side is fixed at landing, like the words and the pointer ──────────────────────────
-- R7 is the whole reason: a change of side is a RETRACT AND RE-LAND by the next parse, never an
-- UPDATE, so the audit shows the same identity landing twice with the reason between them.
CREATE OR REPLACE FUNCTION public.interview_items_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = OLD.company_id) THEN
      RETURN OLD; -- the company cascade
    END IF;
    RAISE EXCEPTION 'interview items are retracted, never deleted — item %', OLD.id;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.interview_record_id IS DISTINCT FROM OLD.interview_record_id
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.raw_words IS DISTINCT FROM OLD.raw_words
     OR NEW.speaker_label IS DISTINCT FROM OLD.speaker_label
     OR NEW.speaker_side IS DISTINCT FROM OLD.speaker_side
     OR NEW.pointer::text IS DISTINCT FROM OLD.pointer::text
     OR NEW.record_text_sha256 IS DISTINCT FROM OLD.record_text_sha256
     OR NEW.content_identity IS DISTINCT FROM OLD.content_identity
     OR NEW.rules_version IS DISTINCT FROM OLD.rules_version
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'interview_items: the words, the speaker side, the pointer, the identity and the rules version are fixed at landing — item %', OLD.id;
  END IF;
  IF NEW.validated IS DISTINCT FROM OLD.validated THEN
    RAISE EXCEPTION 'interview_items: validated is set only by its own RPC, never by an UPDATE — item %', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

-- ── R5: the one write path for the setting ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_interview_our_speakers(
  p_record_id uuid,
  p_labels    text[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec      record;
  v_frozen   boolean;
  v_labels   text[];
  v_run_id   bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'not_admin: only an admin can say which speakers are our side';
  END IF;

  SELECT id, company_id, retracted_at, parsed_at INTO v_rec
  FROM public.interview_records WHERE id = p_record_id;
  IF v_rec.id IS NULL THEN
    RAISE EXCEPTION 'no_record: interview record % not found', p_record_id;
  END IF;
  IF v_rec.retracted_at IS NOT NULL THEN
    RAISE EXCEPTION 'record_withdrawn: this interview was withdrawn — the speaker setting is closed';
  END IF;

  SELECT frozen INTO v_frozen FROM public.companies WHERE id = v_rec.company_id;
  IF v_frozen IS TRUE THEN
    RAISE EXCEPTION 'frozen_company: this company is a frozen reference fixture (SELECT-only)';
  END IF;

  -- Blank labels are dropped and the rest de-duplicated; order is not meaningful.
  SELECT coalesce(array_agg(DISTINCT btrim(l) ORDER BY btrim(l)), '{}')
    INTO v_labels
  FROM unnest(coalesce(p_labels, '{}')) AS l
  WHERE length(btrim(l)) > 0;

  UPDATE public.interview_records SET our_speakers = v_labels WHERE id = p_record_id;

  -- The audit carries the COUNT only. A speaker label is a person's name; it never enters a payload.
  INSERT INTO public.integrity_runs (
    company_id, component, surface_type, surface_id, ran_at, status, examined, admitted, excluded_by_rule, run_ref
  ) VALUES (
    v_rec.company_id, 'interview_our_speakers_set', 'interview_records', p_record_id, now(), 'completed',
    (SELECT count(*) FROM unnest(coalesce(p_labels, '{}'))), array_length(v_labels, 1),
    jsonb_build_object(
      'labels_count', coalesce(array_length(v_labels, 1), 0),
      'parsed_at_was', v_rec.parsed_at,
      'note', 'labels are never written to this payload'
    ),
    'set-interview-our-speakers'
  ) RETURNING id INTO v_run_id;

  RETURN jsonb_build_object('ok', true, 'record_id', p_record_id, 'labels_count', coalesce(array_length(v_labels, 1), 0), 'run_id', v_run_id);
END;
$$;

REVOKE ALL ON FUNCTION public.set_interview_our_speakers(uuid, text[]) FROM public;
GRANT EXECUTE ON FUNCTION public.set_interview_our_speakers(uuid, text[]) TO authenticated, service_role;

-- ── R6: parsed_at must be able to ADVANCE, or a re-parse cannot record itself ─────────────────────
-- The birth trigger let parsed_at move only from NULL — "parsed once, stamped once". R6 makes a
-- re-parse a real act: an older rules version is superseded and the record is stamped with the version
-- that produced the live set. So parsed_at may now move FORWARD, and only forward: clearing it or
-- winding it back is still refused, and everything else the trigger guards is untouched. rules_version
-- and parse_level were never in the guarded list and move with it.
CREATE OR REPLACE FUNCTION public.interview_records_immutable()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  i int;
  v_correcting boolean := (current_setting('app.interview_correction', true) = OLD.id::text);
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = OLD.company_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'interview records are retracted, never deleted — record %', OLD.id;
  END IF;
  IF OLD.retracted_at IS NOT NULL THEN
    RAISE EXCEPTION 'interview record % is retracted and can no longer change (retracted % — %)',
      OLD.id, OLD.retracted_at, coalesce(OLD.retracted_reason, 'no reason recorded');
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.person_name IS DISTINCT FROM OLD.person_name
     OR NEW.person_role IS DISTINCT FROM OLD.person_role
     OR NEW.interviewed_at IS DISTINCT FROM OLD.interviewed_at
     OR NEW.interviewer IS DISTINCT FROM OLD.interviewer
     OR NEW.consent_basis IS DISTINCT FROM OLD.consent_basis
     OR NEW.verbatim IS DISTINCT FROM OLD.verbatim
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.input_file_id IS DISTINCT FROM OLD.input_file_id
     OR NEW.file_sha256 IS DISTINCT FROM OLD.file_sha256
     OR NEW.file_bytes IS DISTINCT FROM OLD.file_bytes
     OR NEW.text_sha256 IS DISTINCT FROM OLD.text_sha256
     OR NEW.extraction_method IS DISTINCT FROM OLD.extraction_method
     OR NEW.extraction_version IS DISTINCT FROM OLD.extraction_version
  THEN
    RAISE EXCEPTION 'interview record % is immutable after birth — only journey_key / market_state / market_basis / review_state / our_speakers, the parse stamp (forward only), the retraction triple, and (through correct_interview_speaker) speaker_role / content_identity / speaker_history may change', OLD.id;
  END IF;
  -- R6: forward only. NULL -> a time is a first parse; time -> a later time is a re-parse.
  IF OLD.parsed_at IS NOT NULL AND (NEW.parsed_at IS NULL OR NEW.parsed_at < OLD.parsed_at) THEN
    RAISE EXCEPTION 'interview record % — parsed_at only moves forward; it is never cleared or wound back', OLD.id;
  END IF;
  IF (NEW.speaker_role IS DISTINCT FROM OLD.speaker_role
      OR NEW.content_identity IS DISTINCT FROM OLD.content_identity
      OR NEW.speaker_history IS DISTINCT FROM OLD.speaker_history)
     AND NOT v_correcting THEN
    RAISE EXCEPTION 'interview record % — speaker_role / content_identity / speaker_history change only through correct_interview_speaker', OLD.id;
  END IF;
  IF jsonb_array_length(NEW.market_basis) < jsonb_array_length(OLD.market_basis) THEN
    RAISE EXCEPTION 'interview record % market_basis is append-only history — an entry was removed', OLD.id;
  END IF;
  FOR i IN 0 .. jsonb_array_length(OLD.market_basis) - 1 LOOP
    IF NEW.market_basis -> i IS DISTINCT FROM OLD.market_basis -> i THEN
      RAISE EXCEPTION 'interview record % market_basis is append-only history — entry % was changed', OLD.id, i;
    END IF;
  END LOOP;
  IF jsonb_array_length(NEW.speaker_history) < jsonb_array_length(OLD.speaker_history) THEN
    RAISE EXCEPTION 'interview record % speaker_history is append-only history — an entry was removed', OLD.id;
  END IF;
  FOR i IN 0 .. jsonb_array_length(OLD.speaker_history) - 1 LOOP
    IF NEW.speaker_history -> i IS DISTINCT FROM OLD.speaker_history -> i THEN
      RAISE EXCEPTION 'interview record % speaker_history is append-only history — entry % was changed', OLD.id, i;
    END IF;
  END LOOP;
  IF NEW.retracted_at IS NOT NULL AND (NEW.retracted_reason IS NULL OR length(btrim(NEW.retracted_reason)) = 0) THEN
    RAISE EXCEPTION 'interview record % cannot be retracted without retracted_reason', OLD.id;
  END IF;
  RETURN NEW;
END;
$fn$;

COMMIT;
