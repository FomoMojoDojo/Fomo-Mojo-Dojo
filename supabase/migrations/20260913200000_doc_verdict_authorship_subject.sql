-- Import provenance (rulings 1–13, 2026-09-13): AUTHORSHIP and SUBJECT on doc_voice_verdicts.
--
-- doc_voice_verdicts already judges an uploaded document's VOICE per content (model row + optional
-- operator-override row, exact (input_file_id, content_sha), never rewritten). Two facts join it:
--   authorship  client | us | third_party | uncertain   (ruling 3: "us" = operator-authored analysis)
--   subject     this_company | the_market | uncertain   (ruling 4: a per-document fact, not anchor-derived)
-- Both are model-judged at upload and operator-overridable (ruling 11), on the same rows:
--   model row    → the classifier's authorship/subject (+ subject_basis, verbatim)
--   override row → the operator's authorship/subject (either may be NULL = "voice override only")
-- The binary `verdict` / `operator_override` stay as the VOICE projection every existing consumer reads
-- (client ⇒ client_voice; us / third_party ⇒ external; uncertain ⇒ uncertain), so the declared
-- synthesis gate (corpusVoiceGate) keeps refusing anything that is not the client's voice.
--
-- FORWARD MAPPING (ruling 3, stated): existing rows receive ONLY the new column —
--   verdict / operator_override client_voice → authorship 'client'
--   verdict / operator_override external     → authorship 'third_party'
--   verdict uncertain                        → authorship 'uncertain'
--   subject                                  → NULL (unknown — no existing row is re-judged; ruling 13)
-- No existing column changes. "us" cannot be inferred from a binary row: the four advisor-authored Edgewood
-- documents the accuracy read identified stay 'client' until re-examined (reported, not decided).

ALTER TABLE public.doc_voice_verdicts
  ADD COLUMN IF NOT EXISTS authorship text,
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS subject_basis text;

ALTER TABLE public.doc_voice_verdicts DROP CONSTRAINT IF EXISTS doc_voice_verdicts_authorship_check;
ALTER TABLE public.doc_voice_verdicts ADD CONSTRAINT doc_voice_verdicts_authorship_check
  CHECK (authorship IS NULL OR authorship IN ('client', 'us', 'third_party', 'uncertain'));
ALTER TABLE public.doc_voice_verdicts DROP CONSTRAINT IF EXISTS doc_voice_verdicts_subject_check;
ALTER TABLE public.doc_voice_verdicts ADD CONSTRAINT doc_voice_verdicts_subject_check
  CHECK (subject IS NULL OR subject IN ('this_company', 'the_market', 'uncertain'));
-- A model row always carries the voice projection consistent with its authorship (an override row may
-- carry authorship without changing voice, or voice without authorship).
ALTER TABLE public.doc_voice_verdicts DROP CONSTRAINT IF EXISTS doc_voice_verdicts_voice_projection;
ALTER TABLE public.doc_voice_verdicts ADD CONSTRAINT doc_voice_verdicts_voice_projection
  CHECK (
    operator_override IS NOT NULL
    OR authorship IS NULL
    OR (authorship = 'client' AND verdict = 'client_voice')
    OR (authorship IN ('us', 'third_party') AND verdict = 'external')
    OR (authorship = 'uncertain' AND verdict IN ('uncertain', 'external'))  -- classifier failure: fail-toward-external keeps verdict 'external'
  );

-- Forward mapping of existing rows (new column only).
UPDATE public.doc_voice_verdicts
   SET authorship = CASE coalesce(operator_override, verdict)
                      WHEN 'client_voice' THEN 'client'
                      WHEN 'external'     THEN 'third_party'
                      ELSE 'uncertain'
                    END
 WHERE authorship IS NULL;

COMMENT ON COLUMN public.doc_voice_verdicts.authorship IS 'client | us | third_party | uncertain — who wrote the document (ruling 3, 2026-09-13); model-judged, operator-overridable';
COMMENT ON COLUMN public.doc_voice_verdicts.subject IS 'this_company | the_market | uncertain — what the document is about (ruling 4, 2026-09-13); NULL on rows judged before the fact existed';
