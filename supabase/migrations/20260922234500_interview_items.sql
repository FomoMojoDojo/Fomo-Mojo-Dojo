-- Interview parser, commit 1 of 5 — the ITEMS store (design Part I, signed 2026-09-19;
-- rules PARSER_RULES_VERSION 2026-09-22.1 in supabase/functions/interview-parser/rules.ts).
--
-- A parsed interview yields typed items (a job, a pain point, a desire, an outcome — and later the
-- downstream kinds). Every candidate LANDS: the judge annotates with a reason on pass and on reject,
-- and a rejected item lands marked, never missing (rule 1). Each item keeps the executor's raw words
-- verbatim with their speaker label; the framework statement beside them is derived and judged under
-- the current criterion, never hand-authored (rule 3).
--
-- POINTER OVER WORDING (rule 2). The pointer is computed by the CODE — turn index, line range and a
-- sha256 of the passage — against the record's stored text sha. The model never asserts offsets: the
-- P6 probe measured 34 of 116 model-emitted offsets landing outside the window or inverted, so an
-- offset a model asserts is not evidence. Trace re-checks the POINTER, not the words, which is what
-- lets a re-worded transcript keep its items traceable.
--
-- ONE LANDING PER ITEM (rule 5): UNIQUE (interview_record_id, content_identity) among LIVE rows, so a
-- re-parse is idempotent and a withdrawn item never blocks its own replacement. Retiring the record
-- withdraws every item it produced, in the same statement as the odi_needs retraction it already did.
--
-- Items land UNVALIDATED and UNREVIEWED (rule 4). Nothing in this commit can set `validated`: the
-- immutability trigger refuses it outright, and the RPC that will own it does not exist yet.
BEGIN;

CREATE TABLE public.interview_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  interview_record_id uuid NOT NULL REFERENCES public.interview_records(id) ON DELETE CASCADE,
  -- The market home, when the system has inferred one. NULL until placement runs (commit 4).
  journey_key text,
  kind text NOT NULL CHECK (kind IN ('job', 'pain_point', 'desire', 'outcome', 'route', 'step', 'positioning', 'cascade')),
  -- The executor's own words, verbatim, with the speaker label the transcript carried.
  raw_words text NOT NULL CHECK (length(btrim(raw_words)) > 0),
  speaker_label text,
  -- Derived and judged, never hand-authored. NULL while an annotated item carries words but no form.
  framework_statement text,
  framework_form text CHECK (framework_form IS NULL OR framework_form IN ('odi_need', 'job_statement', 'route', 'step', 'positioning', 'cascade')),
  -- Code-computed: { turn_index, line_start, line_end, passage_sha256 }.
  pointer jsonb NOT NULL,
  -- The record's verbatim sha at parse time — the pointer is only meaningful against this text.
  record_text_sha256 text NOT NULL CHECK (record_text_sha256 ~ '^[0-9a-f]{64}$'),
  trace_state text NOT NULL CHECK (trace_state IN ('located', 'not_located')),
  landing text NOT NULL CHECK (landing IN ('market', 'step', 'unplaced')),
  placement jsonb,
  review_state text NOT NULL DEFAULT 'unreviewed' CHECK (review_state IN ('unreviewed', 'reviewed')),
  validated boolean NOT NULL DEFAULT false,
  judge_state text NOT NULL CHECK (judge_state IN ('accepted', 'annotated')),
  -- Rule 1: a reason on pass AND on reject. NOT NULL and non-blank, so "never drop" cannot degrade
  -- into "landed with nothing said about it".
  judge_reason text NOT NULL CHECK (length(btrim(judge_reason)) > 0),
  parse_level text,
  rules_version text NOT NULL CHECK (length(btrim(rules_version)) > 0),
  content_identity text NOT NULL CHECK (length(btrim(content_identity)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  retracted_at timestamptz,
  retracted_reason text,
  -- Same shape as odi_market_definitions: a stored generated boolean so an equality-only probe can ask
  -- the question without learning IS NULL.
  retracted boolean GENERATED ALWAYS AS (retracted_at IS NOT NULL) STORED,
  CONSTRAINT interview_items_retraction_pair CHECK (
    (retracted_at IS NULL AND retracted_reason IS NULL)
    OR (retracted_at IS NOT NULL AND length(btrim(coalesce(retracted_reason, ''))) > 0)
  )
);

-- Rule 5: one LIVE landing per (record, content identity). Retracted rows are excluded, so a
-- withdrawn item never blocks the row that replaces it.
CREATE UNIQUE INDEX interview_items_one_live_per_identity
  ON public.interview_items (interview_record_id, content_identity) WHERE (retracted_at IS NULL);
CREATE INDEX interview_items_company_idx ON public.interview_items (company_id, retracted);
CREATE INDEX interview_items_record_idx ON public.interview_items (interview_record_id);
CREATE INDEX interview_items_journey_idx ON public.interview_items (company_id, journey_key);

COMMENT ON TABLE public.interview_items IS
  'Typed items parsed from an interview transcript (parser commit 1, rules 2026-09-22.1). Every candidate lands; the judge annotates with a reason on pass and reject. Raw words verbatim; the framework statement is derived and judged, never hand-authored. The pointer is code-computed against record_text_sha256 — the model never asserts offsets. Admin-only; public-register and external writers never read it.';

-- ── strictness and parse provenance on the record ─────────────────────────────────────────────────
ALTER TABLE public.interview_records
  ADD COLUMN strictness text NOT NULL DEFAULT 'keep_and_mark'
    CHECK (strictness IN ('keep_and_mark', 'located_only')),
  ADD COLUMN match_tolerance text NOT NULL DEFAULT 'ws'
    CHECK (match_tolerance IN ('exact', 'ws', 'fuzzy_0_85')),
  ADD COLUMN parse_level text,
  ADD COLUMN rules_version text;

COMMENT ON COLUMN public.interview_records.strictness IS
  'Per-company admin setting, stored per record: keep_and_mark (default — an unlocated item still lands, marked) or located_only.';

-- ── retraction reach (rule 5) ─────────────────────────────────────────────────────────────────────
-- Was: odi_needs only. A record retired before this reached its needs and left its ITEMS live, which
-- would outlive their own source. Both now move in the one statement.
CREATE OR REPLACE FUNCTION public.interview_records_retraction_propagates()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.retracted_at IS NULL AND NEW.retracted_at IS NOT NULL THEN
    UPDATE public.odi_needs
       SET status = 'retracted', updated_at = now()
     WHERE interview_record_id = NEW.id AND status <> 'retracted';
    UPDATE public.interview_items
       SET retracted_at = NEW.retracted_at, retracted_reason = 'source interview withdrawn'
     WHERE interview_record_id = NEW.id AND retracted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- ── immutability ──────────────────────────────────────────────────────────────────────────────────
-- What an item IS never changes: its words, where they came from, and the criterion that judged them.
-- What an operator DOES with it may: review_state and placement. `validated` is refused outright —
-- rule 4 says landing is unvalidated and "Mark reviewed" never sets it, and the RPC that will own
-- that transition does not exist yet, so in this commit NO path can set it.
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
     OR NEW.pointer::text IS DISTINCT FROM OLD.pointer::text
     OR NEW.record_text_sha256 IS DISTINCT FROM OLD.record_text_sha256
     OR NEW.content_identity IS DISTINCT FROM OLD.content_identity
     OR NEW.rules_version IS DISTINCT FROM OLD.rules_version
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'interview_items: the words, the pointer, the identity and the rules version are fixed at landing — item %', OLD.id;
  END IF;
  IF NEW.validated IS DISTINCT FROM OLD.validated THEN
    RAISE EXCEPTION 'interview_items: validated is set only by its own RPC, never by an UPDATE — item %', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_interview_items_immutable
  BEFORE UPDATE OR DELETE ON public.interview_items
  FOR EACH ROW EXECUTE FUNCTION public.interview_items_immutable();

CREATE TRIGGER enforce_company_freeze_interview_items
  BEFORE INSERT OR UPDATE OR DELETE ON public.interview_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_company_freeze();

-- ── access: admin only (rule 4) ───────────────────────────────────────────────────────────────────
-- interview_records lets a company member SELECT its OWN typed records (input_file_id IS NULL); items
-- carry parsed transcript words and get no such door. Admin only, for every verb.
ALTER TABLE public.interview_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage all interview_items" ON public.interview_items
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

GRANT SELECT, INSERT, UPDATE ON public.interview_items TO authenticated, service_role;

COMMIT;
