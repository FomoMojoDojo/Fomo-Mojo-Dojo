-- ── 4f-2: SEGMENT STORAGE (operator rulings F2 of 2026-09-24, refined 2026-09-25) ────────────────
--
-- A working session is a first-read review meeting, not an interview: different stretches of it are
-- doing different work. The operator marks those stretches as SEGMENTS — a problem statement, a
-- market discussion (naming the market), a read review, or other — and later commits land items
-- differently depending on which segment they fall in. This commit builds the STORE and its setter
-- only. Nothing reads segments yet: segment-aware landing is 4f-4, the boundary proposer is 4f-3,
-- and the operator's control is its own brief.
--
-- WHY A TABLE AND NOT jsonb ON THE RECORD. Three reasons, each already paid for elsewhere in this
-- estate: a market_discussion segment carries a journey_key, so a segment is a row with a foreign
-- key's worth of meaning; the no-overlap rule is a CONSTRAINT a table can hold and a jsonb array
-- cannot; and interview_records_immutable() would need per-entry append-only loops for a fourth
-- jsonb column, which are already the longest part of that function.
--
-- WHAT THE NO-OVERLAP RULE COVERS, AND WHY IT IS NARROW. Only CONFIRMED, live rows. 4f-3's proposer
-- emits UNCONFIRMED rows seeded from both sides of the transcript, and those may overlap each other
-- freely — the operator's confirmation is what resolves them into one non-overlapping set. A
-- constraint over every row would make the proposer impossible to write.
--
-- SEGMENTS APPLY TO WORKING-SESSION RECORDS ONLY. A stakeholder or customer transcript has no
-- segments and the setter refuses one, so a later reader can never find segments where the record
-- type says there should be none.
--
-- REVERSAL. Drop the RPC, the trigger, the helper and the table. No existing table or routine
-- changes shape; set_interview_our_speakers gains one refusal and is otherwise untouched.

BEGIN;

-- ── 1. the lease, in SQL ─────────────────────────────────────────────────────────────────────────
-- The parser's N10 lease lives on the run row: integrity_runs.excluded_by_rule->'lease' carries
-- {pass_id, heartbeat}, and handler.ts refuses a second writer while
--     now - heartbeat < STALE_AFTER_MS (5 minutes)
-- against the LATEST 'planned' run for (company, interview_parse, interview_records, record). This
-- is that same predicate, so an operator setter and a parse pass cannot disagree about who holds the
-- record. A missing or unparseable heartbeat is NOT fresh — the parser's Number.isFinite check
-- becomes the NULL here — so a run that crashed without clearing its lease does not lock the record
-- for ever; it goes stale on the same 5-minute clock.
CREATE OR REPLACE FUNCTION public.interview_parse_lease_fresh(p_record_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((
    SELECT (r.excluded_by_rule -> 'lease' ->> 'heartbeat')::timestamptz > now() - interval '5 minutes'
    FROM public.integrity_runs r
    WHERE r.component = 'interview_parse'
      AND r.surface_type = 'interview_records'
      AND r.surface_id = p_record_id
      AND r.status = 'planned'
    ORDER BY r.ran_at DESC
    LIMIT 1
  ), false);
$function$;

COMMENT ON FUNCTION public.interview_parse_lease_fresh(uuid) IS
  '4f-2: true while a parse pass holds the N10 lease on this record (the parser''s own predicate: the latest planned run''s lease heartbeat within 5 minutes). Operator setters refuse while it is true.';

-- ── 2. the table ─────────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.interview_segments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  interview_record_id uuid NOT NULL REFERENCES public.interview_records(id) ON DELETE CASCADE,
  segment_kind        text NOT NULL,
  turn_start          integer NOT NULL,
  turn_end            integer NOT NULL,
  -- the market a market_discussion segment is ABOUT. Required there, forbidden elsewhere: a problem
  -- statement or a read review is not about a market, and a NULL-able column with no CHECK is how
  -- half-placed rows appear.
  journey_key         text,
  proposed_by         text NOT NULL,
  confirmed_at        timestamptz,
  confirmed_by        uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL,
  superseded_at       timestamptz,
  superseded_by_id    uuid REFERENCES public.interview_segments(id) ON DELETE SET NULL,

  CONSTRAINT interview_segments_kind_check
    CHECK (segment_kind IN ('problem_statement', 'market_discussion', 'read_review', 'other')),
  CONSTRAINT interview_segments_turn_start_check CHECK (turn_start >= 0),
  CONSTRAINT interview_segments_turn_order_check CHECK (turn_end >= turn_start),
  CONSTRAINT interview_segments_market_key
    CHECK ((segment_kind = 'market_discussion') = (journey_key IS NOT NULL)),
  CONSTRAINT interview_segments_proposed_by_check
    CHECK (proposed_by IN ('operator', 'system')),
  CONSTRAINT interview_segments_confirmed_pair
    CHECK ((confirmed_at IS NULL) = (confirmed_by IS NULL)),
  CONSTRAINT interview_segments_superseded_pair
    CHECK ((superseded_at IS NULL) = (superseded_by_id IS NULL))
);

COMMENT ON TABLE public.interview_segments IS
  '4f-2: the operator''s reading of a WORKING-SESSION transcript, as turn ranges. Only confirmed live rows are non-overlapping; 4f-3 proposals are unconfirmed and may overlap. Written only through set_interview_segments.';

CREATE INDEX interview_segments_record_live
  ON public.interview_segments (interview_record_id)
  WHERE superseded_at IS NULL;

-- ── 3. no two CONFIRMED live ranges may overlap on one record ───────────────────────────────────
-- int4range(turn_start, turn_end + 1) makes the stored inclusive range half-open, so [3,5] and [6,8]
-- are adjacent rather than overlapping, and [3,5] and [5,8] correctly collide on turn 5.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE public.interview_segments
  ADD CONSTRAINT interview_segments_no_overlap
  EXCLUDE USING gist (
    interview_record_id WITH =,
    int4range(turn_start, turn_end + 1) WITH &&
  ) WHERE (superseded_at IS NULL AND confirmed_at IS NOT NULL);

-- ── 4. immutability: a segment is not edited, it is superseded ───────────────────────────────────
-- Only two things may ever change after birth, and each only once, and neither back to NULL: the
-- supersession pair and the confirmation pair. Everything else — the record, the kind, the range,
-- the market key, who proposed it — is fixed, because a segment that could be edited in place would
-- leave the parser's stamped items pointing at a range that no longer exists.
CREATE OR REPLACE FUNCTION public.interview_segments_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = OLD.company_id) THEN
      RETURN OLD;   -- the company itself is going; the cascade may run
    END IF;
    RAISE EXCEPTION 'interview segments are superseded, never deleted — segment %', OLD.id;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.interview_record_id IS DISTINCT FROM OLD.interview_record_id
     OR NEW.segment_kind IS DISTINCT FROM OLD.segment_kind
     OR NEW.turn_start IS DISTINCT FROM OLD.turn_start
     OR NEW.turn_end IS DISTINCT FROM OLD.turn_end
     OR NEW.journey_key IS DISTINCT FROM OLD.journey_key
     OR NEW.proposed_by IS DISTINCT FROM OLD.proposed_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION 'interview segment % is immutable after birth — only the confirmation pair and the supersession pair may change', OLD.id;
  END IF;

  IF OLD.superseded_at IS NOT NULL
     AND (NEW.superseded_at IS DISTINCT FROM OLD.superseded_at
          OR NEW.superseded_by_id IS DISTINCT FROM OLD.superseded_by_id) THEN
    RAISE EXCEPTION 'interview segment % is already superseded — a supersession is final', OLD.id;
  END IF;
  IF OLD.confirmed_at IS NOT NULL
     AND (NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
          OR NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by) THEN
    RAISE EXCEPTION 'interview segment % is already confirmed — a confirmation is final', OLD.id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER interview_segments_immutable
  BEFORE UPDATE OR DELETE ON public.interview_segments
  FOR EACH ROW EXECUTE FUNCTION public.interview_segments_immutable();

-- ── 5. the freeze, and RLS ──────────────────────────────────────────────────────────────────────
CREATE TRIGGER enforce_company_freeze_interview_segments
  BEFORE INSERT OR UPDATE OR DELETE ON public.interview_segments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_company_freeze();

ALTER TABLE public.interview_segments ENABLE ROW LEVEL SECURITY;

-- Admins READ. Nobody writes through the client: there is deliberately no INSERT/UPDATE/DELETE
-- policy, so the only writer is the SECURITY DEFINER RPC below (and the service role, which bypasses
-- RLS and is what the parser will read with in 4f-4).
CREATE POLICY "Admins read interview_segments"
  ON public.interview_segments FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "service role full access on interview_segments"
  ON public.interview_segments FOR ALL
  USING (auth.role() = 'service_role');

COMMIT;

-- ── 6. THE SETTER ────────────────────────────────────────────────────────────────────────────────
-- One call replaces the record's whole operator set: the live confirmed operator rows are SUPERSEDED
-- (never deleted — the audit must still be able to say what the operator used to think) and the new
-- set is inserted, proposed_by 'operator' and confirmed at once, because an operator drawing a
-- boundary IS the confirmation. An empty array supersedes everything and inserts nothing, which is
-- how a mis-read is withdrawn.
--
-- System proposals are left alone: they are unconfirmed, they are 4f-3's business, and superseding
-- them here would delete the very suggestions the operator is about to act on.
--
-- The audit row carries counts and turn RANGES by kind. Turn indices and kinds are safe to log;
-- transcript text never enters a payload, the same discipline set_interview_our_speakers keeps when
-- it logs labels_count and never a label.
BEGIN;

CREATE OR REPLACE FUNCTION public.set_interview_segments(p_record_id uuid, p_segments jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor    uuid := auth.uid();
  v_rec      public.interview_records%ROWTYPE;
  v_frozen   boolean;
  v_now      timestamptz := now();
  v_in       integer;
  v_superseded integer := 0;
  v_inserted integer := 0;
  v_run_id   bigint;
  v_by_kind  jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'no_caller: set_interview_segments has no authenticated caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.has_role(v_actor, 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_admin: only an admin may set the segments of a working session' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_segments IS NULL OR jsonb_typeof(p_segments) <> 'array' THEN
    RAISE EXCEPTION 'bad_payload: p_segments must be a jsonb array (an empty array supersedes every segment)' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_rec FROM public.interview_records WHERE id = p_record_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_record: interview record % not found', p_record_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_rec.retracted_at IS NOT NULL THEN
    RAISE EXCEPTION 'record_withdrawn: this interview was withdrawn — its segments are closed' USING ERRCODE = 'check_violation';
  END IF;
  -- Segments are a WORKING SESSION's shape. A stakeholder or customer transcript has none, so a
  -- later reader can never find segments where the record type says there should be none.
  IF v_rec.speaker_role <> 'working_session' THEN
    RAISE EXCEPTION 'not_working_session: segments apply to a working session only (record % is %)', p_record_id, v_rec.speaker_role USING ERRCODE = 'check_violation';
  END IF;

  SELECT frozen INTO v_frozen FROM public.companies WHERE id = v_rec.company_id;
  IF v_frozen IS TRUE THEN
    RAISE EXCEPTION 'frozen_company: this company is a frozen reference fixture (SELECT-only)' USING ERRCODE = 'check_violation';
  END IF;

  IF public.interview_parse_lease_fresh(p_record_id) THEN
    RAISE EXCEPTION 'parse_in_flight: a parse pass holds the lease on this record — try again when it returns' USING ERRCODE = 'check_violation';
  END IF;

  v_in := jsonb_array_length(p_segments);

  -- supersede the live CONFIRMED OPERATOR set; system proposals are 4f-3's and are left alone
  WITH gone AS (
    UPDATE public.interview_segments
       SET superseded_at = v_now, superseded_by_id = id
     WHERE interview_record_id = p_record_id
       AND superseded_at IS NULL
       AND confirmed_at IS NOT NULL
       AND proposed_by = 'operator'
    RETURNING 1
  ) SELECT count(*) INTO v_superseded FROM gone;

  WITH added AS (
    INSERT INTO public.interview_segments
      (company_id, interview_record_id, segment_kind, turn_start, turn_end, journey_key,
       proposed_by, confirmed_at, confirmed_by, created_by)
    SELECT v_rec.company_id, p_record_id,
           s ->> 'segment_kind',
           (s ->> 'turn_start')::integer,
           (s ->> 'turn_end')::integer,
           NULLIF(btrim(COALESCE(s ->> 'journey_key', '')), ''),
           'operator', v_now, v_actor, v_actor
      FROM jsonb_array_elements(p_segments) AS s
    RETURNING 1
  ) SELECT count(*) INTO v_inserted FROM added;

  SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb) INTO v_by_kind
    FROM (
      SELECT segment_kind AS k,
             jsonb_build_object('count', count(*),
                                'ranges', jsonb_agg(jsonb_build_array(turn_start, turn_end) ORDER BY turn_start)) AS v
        FROM public.interview_segments
       WHERE interview_record_id = p_record_id AND superseded_at IS NULL AND confirmed_at IS NOT NULL
       GROUP BY segment_kind
    ) g;

  INSERT INTO public.integrity_runs (
    company_id, component, surface_type, surface_id, ran_at, status, examined, admitted,
    excluded_by_rule, run_ref
  ) VALUES (
    v_rec.company_id, 'interview_segments_set', 'interview_records', p_record_id, v_now, 'completed',
    v_in, v_inserted,
    jsonb_build_object(
      'record_id', p_record_id, 'actor', v_actor,
      'segments_in', v_in, 'inserted', v_inserted, 'superseded', v_superseded,
      'live_by_kind', v_by_kind,
      'note', 'turn indices and kinds only — no transcript text enters this payload',
      'reversal', 'call set_interview_segments again with the previous set; the rows here are superseded, never deleted'
    ),
    'set-interview-segments'
  ) RETURNING id INTO v_run_id;

  RETURN jsonb_build_object('ok', true, 'record_id', p_record_id, 'inserted', v_inserted,
                            'superseded', v_superseded, 'live_by_kind', v_by_kind, 'audit_id', v_run_id);
END;
$function$;

COMMENT ON FUNCTION public.set_interview_segments(uuid, jsonb) IS
  '4f-2: replace a working-session record''s operator segments. Admin only; refuses a withdrawn record, a frozen company, a non-working-session record, and a record whose parse holds the N10 lease. Supersedes, never deletes. Audited to integrity_runs (interview_segments_set).';

COMMIT;
-- ── 7. the same refusal on the OTHER operator setter ───────────────────────────────────────────
-- set_interview_our_speakers already refuses a non-admin, a withdrawn record and a frozen company,
-- and it is allowed AFTER parsing (unlike correct_interview_speaker) because R7 retracts and
-- re-lands only the items whose side moved. What it did NOT refuse was a change made WHILE a pass
-- was running. Only that refusal is added; the rest of the function is its live definition, taken
-- verbatim from pg_get_functiondef rather than retyped.
BEGIN;

CREATE OR REPLACE FUNCTION public.set_interview_our_speakers(p_record_id uuid, p_labels text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- 4f-2: a parse pass holding the N10 lease is the record's only writer. our_speakers moves the
  -- side under landed items (R7 retracts and re-lands them), so changing it mid-pass would race the
  -- pass that is deciding those sides. Same predicate the parser uses, so the two cannot disagree.
  IF public.interview_parse_lease_fresh(p_record_id) THEN
    RAISE EXCEPTION 'parse_in_flight: a parse pass holds the lease on this record — try again when it returns';
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
$function$;

COMMIT;
