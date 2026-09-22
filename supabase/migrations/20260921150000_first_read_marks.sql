-- First-read marks, commit 1 of 4 (rulings FM1–FM15, signed 2026-09-21): the STORE and the WRITE PATH only.
-- No UI, no strings, no reader outside src/lib/firstReadMarks (FM13 option A — the census test pins it).
--
-- A mark attaches to ONE row of the LIVE first read (/preview/client-refine/first-read/<company>): a client
-- reaction (note + disposition "Address in next phase" | "Interesting") or our mark (note, "stood out to us").
-- The anchor (beat, kind, key, text, sha256 of normalizeForHash(text)) is frozen at creation — immutable by
-- trigger; on a revisit the reader decides match / wording_changed / row_gone from it (commit 4 asks the
-- operator to keep or remove; nothing here rewrites an anchor). Notes are an append-only version history.
-- FM16: the disposition lives on the note versions — first_read_marks.disposition is the version-1 value only
-- (immutable); the CURRENT disposition is the latest note version's. A client reaction carries one on every
-- version (append without one carries the previous forward); our mark never does — checked by the RPCs and by
-- trigger. The only change a mark ever takes after birth is ONE permanent withdraw (set-once, with a reason, one
-- integrity_runs audit row). No UPDATE or DELETE path exists otherwise: the triggers refuse them, and the
-- tables have no INSERT/UPDATE/DELETE policy for authenticated — every write goes through the three RPCs,
-- which take the actor from auth.uid() only (must hold the admin role) and refuse a frozen company.
--
-- Creates: table first_read_marks, table first_read_mark_notes, trigger functions first_read_marks_immutable /
-- first_read_mark_notes_immutable (+ the enforce_company_freeze trigger on both), RLS (admin SELECT, service
-- role ALL), RPCs create_first_read_mark / append_first_read_mark_note / withdraw_first_read_mark.
BEGIN;

CREATE TABLE public.first_read_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('client_reaction', 'our_mark')),
  -- FM16: the version-1 disposition, kept for the record; the current one is the latest note version's.
  disposition text CHECK (disposition IN ('address_next_phase', 'interesting')),
  beat_key text NOT NULL CHECK (length(btrim(beat_key)) > 0),
  anchor_kind text NOT NULL CHECK (length(btrim(anchor_kind)) > 0),
  anchor_key text NOT NULL CHECK (length(btrim(anchor_key)) > 0),
  anchor_text text NOT NULL,
  anchor_text_sha256 text NOT NULL CHECK (anchor_text_sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz,
  withdrawn_by uuid,
  withdraw_reason text,
  -- FM: a client reaction carries a disposition; our mark never does.
  CONSTRAINT first_read_marks_disposition_by_kind CHECK (
    (kind = 'client_reaction' AND disposition IS NOT NULL) OR (kind = 'our_mark' AND disposition IS NULL)
  ),
  -- the withdraw triple travels together, with a reason
  CONSTRAINT first_read_marks_withdraw_triple CHECK (
    (withdrawn_at IS NULL AND withdrawn_by IS NULL AND withdraw_reason IS NULL)
    OR (withdrawn_at IS NOT NULL AND withdrawn_by IS NOT NULL AND length(btrim(coalesce(withdraw_reason, ''))) > 0)
  )
);
CREATE INDEX first_read_marks_company_beat_idx ON public.first_read_marks (company_id, beat_key);
CREATE INDEX first_read_marks_anchor_idx ON public.first_read_marks (company_id, anchor_kind, anchor_key);

CREATE TABLE public.first_read_mark_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mark_id uuid NOT NULL REFERENCES public.first_read_marks(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1),
  note text NOT NULL CHECK (length(btrim(note)) > 0),
  -- FM16: the disposition as of this version — required when the mark is a client_reaction, NULL for our_mark
  -- (the kind rule is enforced by trigger below, the mark's kind being on the parent row).
  disposition text CHECK (disposition IN ('address_next_phase', 'interesting')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mark_id, version)
);

-- ── immutability ─────────────────────────────────────────────────────────────────────────────────────
-- A mark row changes exactly once: the withdraw triple, from NULL to set. Everything else is fixed at birth.
-- DELETE is refused while the company exists (the company cascade is the one legal removal).
CREATE OR REPLACE FUNCTION public.first_read_marks_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = OLD.company_id) THEN
      RETURN OLD; -- the company cascade
    END IF;
    RAISE EXCEPTION 'first_read_marks: a mark is withdrawn, never deleted — mark %', OLD.id;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.disposition IS DISTINCT FROM OLD.disposition
     OR NEW.beat_key IS DISTINCT FROM OLD.beat_key
     OR NEW.anchor_kind IS DISTINCT FROM OLD.anchor_kind
     OR NEW.anchor_key IS DISTINCT FROM OLD.anchor_key
     OR NEW.anchor_text IS DISTINCT FROM OLD.anchor_text
     OR NEW.anchor_text_sha256 IS DISTINCT FROM OLD.anchor_text_sha256
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'first_read_marks: the anchor, kind, disposition and birth fields are immutable — mark %', OLD.id;
  END IF;
  IF OLD.withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION 'first_read_marks: mark % is withdrawn and can no longer change', OLD.id;
  END IF;
  IF NEW.withdrawn_at IS NULL THEN
    RAISE EXCEPTION 'first_read_marks: the only change a mark takes is its withdraw — mark %', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_first_read_marks_immutable
  BEFORE UPDATE OR DELETE ON public.first_read_marks
  FOR EACH ROW EXECUTE FUNCTION public.first_read_marks_immutable();

-- A note version is never edited or deleted (the mark cascade is the one legal removal); on INSERT the FM16
-- kind rule holds: a client_reaction version carries a disposition, an our_mark version never does.
CREATE OR REPLACE FUNCTION public.first_read_mark_notes_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_kind text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT kind INTO v_kind FROM public.first_read_marks WHERE id = NEW.mark_id;
    IF v_kind = 'client_reaction' AND NEW.disposition IS NULL THEN
      RAISE EXCEPTION 'first_read_mark_notes: a client_reaction version carries a disposition (mark %, version %)', NEW.mark_id, NEW.version;
    END IF;
    IF v_kind = 'our_mark' AND NEW.disposition IS NOT NULL THEN
      RAISE EXCEPTION 'first_read_mark_notes: our mark never carries a disposition (mark %, version %)', NEW.mark_id, NEW.version;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM public.first_read_marks WHERE id = OLD.mark_id) THEN
      RETURN OLD; -- the mark (company) cascade
    END IF;
    RAISE EXCEPTION 'first_read_mark_notes: a note version is history — never deleted (mark %, version %)', OLD.mark_id, OLD.version;
  END IF;
  RAISE EXCEPTION 'first_read_mark_notes: a note version is history — never edited; append the next version (mark %, version %)', OLD.mark_id, OLD.version;
END;
$$;
CREATE TRIGGER trg_first_read_mark_notes_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.first_read_mark_notes
  FOR EACH ROW EXECUTE FUNCTION public.first_read_mark_notes_immutable();

-- company freeze, same as every company_id-bearing table (migration 20260810120000)
CREATE TRIGGER enforce_company_freeze
  BEFORE INSERT OR DELETE OR UPDATE ON public.first_read_marks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_company_freeze();

-- ── RLS: admin-only SELECT (the operator_primary_selection pattern), service role as elsewhere ─────────
ALTER TABLE public.first_read_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.first_read_mark_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read first_read_marks" ON public.first_read_marks
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins read first_read_mark_notes" ON public.first_read_mark_notes
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "service role full access on first_read_marks" ON public.first_read_marks
  FOR ALL USING (auth.role() = 'service_role'::text);
CREATE POLICY "service role full access on first_read_mark_notes" ON public.first_read_mark_notes
  FOR ALL USING (auth.role() = 'service_role'::text);
-- No INSERT / UPDATE / DELETE policy for authenticated: the RPCs below (SECURITY DEFINER) are the write path.

-- ── the actor gate shared by the three RPCs: auth.uid() must hold the admin role; the body never names the actor
CREATE OR REPLACE FUNCTION public.first_read_marks_actor(p_fn text)
RETURNS uuid LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION '%: no authenticated caller', p_fn USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.has_role(v_actor, 'admin'::app_role) THEN
    RAISE EXCEPTION '%: caller is not an admin', p_fn USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN v_actor;
END;
$$;
REVOKE ALL ON FUNCTION public.first_read_marks_actor(text) FROM public;

-- create: the mark and note version 1 in ONE transaction; an empty note refuses before anything is written
CREATE OR REPLACE FUNCTION public.create_first_read_mark(
  p_company_id uuid, p_kind text, p_disposition text, p_beat_key text,
  p_anchor_kind text, p_anchor_key text, p_anchor_text text, p_anchor_text_sha256 text, p_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor uuid;
  v_frozen boolean;
  v_mark_id uuid;
  v_now timestamptz := now();
BEGIN
  v_actor := public.first_read_marks_actor('create_first_read_mark');
  IF length(btrim(coalesce(p_note, ''))) = 0 THEN
    RAISE EXCEPTION 'create_first_read_mark: the note is empty — nothing was written' USING ERRCODE = 'check_violation';
  END IF;
  SELECT frozen INTO v_frozen FROM public.companies WHERE id = p_company_id;
  IF v_frozen IS NULL THEN
    RAISE EXCEPTION 'create_first_read_mark: no company %', p_company_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_frozen THEN
    RAISE EXCEPTION 'create_first_read_mark: company % is a frozen reference fixture', p_company_id USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO public.first_read_marks (company_id, kind, disposition, beat_key, anchor_kind, anchor_key, anchor_text, anchor_text_sha256, created_by, created_at)
  VALUES (p_company_id, p_kind, p_disposition, p_beat_key, p_anchor_kind, p_anchor_key, p_anchor_text, lower(p_anchor_text_sha256), v_actor, v_now)
  RETURNING id INTO v_mark_id;
  INSERT INTO public.first_read_mark_notes (mark_id, version, note, disposition, created_by, created_at)
  VALUES (v_mark_id, 1, p_note, p_disposition, v_actor, v_now);
  RETURN jsonb_build_object('ok', true, 'mark_id', v_mark_id, 'version', 1, 'disposition', p_disposition, 'created_at', v_now);
END;
$$;
REVOKE ALL ON FUNCTION public.create_first_read_mark(uuid, text, text, text, text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_first_read_mark(uuid, text, text, text, text, text, text, text, text) TO authenticated, service_role;

-- append: the next note version; refused on a withdrawn mark. FM16: p_disposition is optional — for a
-- client_reaction an omitted one carries the previous version's forward; for our mark it must be NULL.
CREATE OR REPLACE FUNCTION public.append_first_read_mark_note(p_mark_id uuid, p_note text, p_disposition text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor uuid;
  v_mark public.first_read_marks%ROWTYPE;
  v_frozen boolean;
  v_version integer;
  v_disposition text;
  v_now timestamptz := now();
BEGIN
  v_actor := public.first_read_marks_actor('append_first_read_mark_note');
  IF length(btrim(coalesce(p_note, ''))) = 0 THEN
    RAISE EXCEPTION 'append_first_read_mark_note: the note is empty — nothing was written' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_mark FROM public.first_read_marks WHERE id = p_mark_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'append_first_read_mark_note: no mark %', p_mark_id USING ERRCODE = 'no_data_found';
  END IF;
  SELECT frozen INTO v_frozen FROM public.companies WHERE id = v_mark.company_id;
  IF coalesce(v_frozen, false) THEN
    RAISE EXCEPTION 'append_first_read_mark_note: company % is a frozen reference fixture', v_mark.company_id USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_mark.withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION 'append_first_read_mark_note: mark % is withdrawn', p_mark_id USING ERRCODE = 'check_violation';
  END IF;
  IF v_mark.kind = 'our_mark' AND p_disposition IS NOT NULL THEN
    RAISE EXCEPTION 'append_first_read_mark_note: our mark never carries a disposition (mark %)', p_mark_id USING ERRCODE = 'check_violation';
  END IF;
  IF v_mark.kind = 'client_reaction' THEN
    IF p_disposition IS NULL THEN
      SELECT disposition INTO v_disposition FROM public.first_read_mark_notes WHERE mark_id = p_mark_id ORDER BY version DESC LIMIT 1;
    ELSIF p_disposition NOT IN ('address_next_phase', 'interesting') THEN
      RAISE EXCEPTION 'append_first_read_mark_note: disposition must be address_next_phase or interesting' USING ERRCODE = 'check_violation';
    ELSE
      v_disposition := p_disposition;
    END IF;
  END IF;
  SELECT coalesce(max(version), 0) + 1 INTO v_version FROM public.first_read_mark_notes WHERE mark_id = p_mark_id;
  INSERT INTO public.first_read_mark_notes (mark_id, version, note, disposition, created_by, created_at)
  VALUES (p_mark_id, v_version, p_note, v_disposition, v_actor, v_now);
  RETURN jsonb_build_object('ok', true, 'mark_id', p_mark_id, 'version', v_version, 'disposition', v_disposition, 'created_at', v_now);
END;
$$;
REVOKE ALL ON FUNCTION public.append_first_read_mark_note(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.append_first_read_mark_note(uuid, text, text) TO authenticated, service_role;

-- withdraw: set-once, with a reason, one integrity_runs audit row; a second withdraw refuses
CREATE OR REPLACE FUNCTION public.withdraw_first_read_mark(p_mark_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor uuid;
  v_mark public.first_read_marks%ROWTYPE;
  v_frozen boolean;
  v_now timestamptz := now();
  v_versions integer;
  v_audit_id bigint;
BEGIN
  v_actor := public.first_read_marks_actor('withdraw_first_read_mark');
  IF length(btrim(coalesce(p_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'withdraw_first_read_mark: a reason is required' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_mark FROM public.first_read_marks WHERE id = p_mark_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdraw_first_read_mark: no mark %', p_mark_id USING ERRCODE = 'no_data_found';
  END IF;
  SELECT frozen INTO v_frozen FROM public.companies WHERE id = v_mark.company_id;
  IF coalesce(v_frozen, false) THEN
    RAISE EXCEPTION 'withdraw_first_read_mark: company % is a frozen reference fixture', v_mark.company_id USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_mark.withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION 'withdraw_first_read_mark: mark % is already withdrawn (% — %)', p_mark_id, v_mark.withdrawn_at, coalesce(v_mark.withdraw_reason, '') USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.first_read_marks SET withdrawn_at = v_now, withdrawn_by = v_actor, withdraw_reason = p_reason WHERE id = p_mark_id;
  SELECT count(*) INTO v_versions FROM public.first_read_mark_notes WHERE mark_id = p_mark_id;
  INSERT INTO public.integrity_runs (company_id, component, surface_type, surface_id, ran_at, status, examined, admitted, excluded_by_rule, run_ref)
  VALUES (v_mark.company_id, 'first_read_mark_withdrawn', 'first_read_marks', p_mark_id, v_now, 'completed', 1, 0,
    jsonb_build_object(
      'ruling', 'FM (2026-09-21): a mark is withdrawn once, permanently, with a reason; its anchor and note history stay as record.',
      'mark_id', p_mark_id, 'kind', v_mark.kind, 'disposition', v_mark.disposition, 'beat_key', v_mark.beat_key,
      'anchor_kind', v_mark.anchor_kind, 'anchor_key', v_mark.anchor_key, 'anchor_text_sha256', v_mark.anchor_text_sha256,
      'note_versions', v_versions, 'withdrawn_by', v_actor, 'withdraw_reason', p_reason),
    'withdraw_first_read_mark')
  RETURNING id INTO v_audit_id;
  RETURN jsonb_build_object('ok', true, 'mark_id', p_mark_id, 'withdrawn_at', v_now, 'audit_id', v_audit_id);
END;
$$;
REVOKE ALL ON FUNCTION public.withdraw_first_read_mark(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.withdraw_first_read_mark(uuid, text) TO authenticated, service_role;

COMMENT ON TABLE public.first_read_marks IS 'First-read marks (FM1–FM15, 2026-09-21): a client reaction or our mark on one live first-read row; anchor immutable; one permanent withdraw; writes only via create_/append_/withdraw_first_read_mark.';
COMMENT ON TABLE public.first_read_mark_notes IS 'Append-only note versions of a first-read mark (UNIQUE mark_id, version); each carries the disposition as of that version (FM16); never edited or deleted.';
COMMIT;
