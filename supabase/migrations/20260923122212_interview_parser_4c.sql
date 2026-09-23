-- Interview parser, commit 4c — TWO NEW KINDS (R4) and SCOPE (R5), from the operator's review of all
-- 44 client-side items of the Sep 22 kickoff parse.
--
-- R4. The eight kinds had nowhere to put two things the kickoff is full of:
--       ask        — a request, a task, or feedback aimed at FomoMojoDojo or at the read itself
--       hypothesis — a belief the speaker holds about cause, or about themselves
--     Both land with their raw words and NO derived statement: neither converts in this commit, and
--     the judge reason names the kind. They join the kind CHECK; framework_form is unchanged, because
--     neither has a form yet.
--
-- R5. Every item now says WHAT IT IS ABOUT:
--       market   — donors, funders, the outside world
--       internal — Edgewood's own organization, team, process
--     The finder assigns it and the judge checks it. It is not in the content identity: the same words
--     from the same passage are the same item whatever scope they were given, so a scope that moves
--     between parses is visibly one item re-landed, exactly as speaker_side is (R5/R7 of 4a).
--
-- BACKFILL. Every row that exists when this runs is stamped 'market'. That is not a judgement about
-- those rows — the rule did not exist when they landed and nobody had been asked. The column comment
-- says so, and the next parse assigns it for real.
BEGIN;

-- ── R4: the two new kinds ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.interview_items DROP CONSTRAINT IF EXISTS interview_items_kind_check;
ALTER TABLE public.interview_items ADD CONSTRAINT interview_items_kind_check
  CHECK (kind IN ('job', 'pain_point', 'desire', 'outcome', 'route', 'step', 'positioning', 'cascade', 'ask', 'hypothesis'));

COMMENT ON CONSTRAINT interview_items_kind_check ON public.interview_items IS
  'R4 (2026-09-23): ask and hypothesis joined the eight. Neither converts yet — both land with raw words, framework_form NULL and a judge reason naming the kind.';

-- ── R5: scope ────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.interview_items
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'market';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interview_items_scope_check') THEN
    ALTER TABLE public.interview_items
      ADD CONSTRAINT interview_items_scope_check CHECK (scope IN ('market', 'internal'));
  END IF;
END $$;

COMMENT ON COLUMN public.interview_items.scope IS
  'R5 (2026-09-23): market = about donors, funders, the outside world; internal = about Edgewood''s own organization, team or process. Assigned by the finder at landing and checked by the judge. THE ROWS THAT EXISTED WHEN THIS COLUMN WAS ADDED WERE BACKFILLED market: the rule did not exist when they landed. A re-parse assigns it for real. Not part of the content identity.';

-- ── R5: scope is fixed at landing, like the words, the pointer and the side ──────────────────────
-- A scope that changes is a re-parse's business (retract and re-land), never an UPDATE — same shape
-- as speaker_side in 4a, so the audit shows one identity landing twice rather than a row mutating.
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
     OR NEW.scope IS DISTINCT FROM OLD.scope
     OR NEW.pointer::text IS DISTINCT FROM OLD.pointer::text
     OR NEW.record_text_sha256 IS DISTINCT FROM OLD.record_text_sha256
     OR NEW.content_identity IS DISTINCT FROM OLD.content_identity
     OR NEW.rules_version IS DISTINCT FROM OLD.rules_version
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'interview_items: the words, the speaker side, the scope, the pointer, the identity and the rules version are fixed at landing — item %', OLD.id;
  END IF;
  IF NEW.validated IS DISTINCT FROM OLD.validated THEN
    RAISE EXCEPTION 'interview_items: validated is set only by its own RPC, never by an UPDATE — item %', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
