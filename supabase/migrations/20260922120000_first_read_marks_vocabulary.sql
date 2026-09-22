-- First-read marks, commit 2 fix pass (rulings FM5 revised, FM18 revised, FM21 — signed 2026-09-22).
-- Commit 1 (20260921150000) is pushed and is not edited; this migration revises the store on top of it.
--
-- 1. The disposition vocabulary on BOTH tables becomes interesting | important | not_important
--    (address_next_phase is retired; both tables hold 0 rows at the time of this migration — proven, not assumed).
-- 2. A note is optional (FM5): first_read_mark_notes.note allows NULL; a non-NULL note is non-empty after trim;
--    the RPCs store NULL for an empty or omitted note. Picking a choice alone is enough to save.
-- 3. create_first_read_mark: p_note is optional (DEFAULT NULL).
-- 4. append_first_read_mark_note: p_note is optional; a version that changes NEITHER the note NOR the
--    disposition (against the latest version) is refused — no empty history entries.
-- The kind rule on disposition (a client_reaction carries one on every version, our_mark never) is unchanged.
-- FM21 (one reaction + one "Stood out to us" per row) is already the partial unique index of 20260922090000.
BEGIN;

-- ── 1. vocabulary ────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.first_read_marks DROP CONSTRAINT first_read_marks_disposition_check;
ALTER TABLE public.first_read_marks
  ADD CONSTRAINT first_read_marks_disposition_check CHECK (disposition IN ('interesting', 'important', 'not_important'));
ALTER TABLE public.first_read_mark_notes DROP CONSTRAINT first_read_mark_notes_disposition_check;
ALTER TABLE public.first_read_mark_notes
  ADD CONSTRAINT first_read_mark_notes_disposition_check CHECK (disposition IN ('interesting', 'important', 'not_important'));

-- ── 2. the note is optional ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.first_read_mark_notes ALTER COLUMN note DROP NOT NULL;
ALTER TABLE public.first_read_mark_notes DROP CONSTRAINT first_read_mark_notes_note_check;
ALTER TABLE public.first_read_mark_notes
  ADD CONSTRAINT first_read_mark_notes_note_check CHECK (note IS NULL OR length(btrim(note)) > 0);

-- ── 3. create: the note is optional; an empty one is stored as NULL ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_first_read_mark(
  p_company_id uuid, p_kind text, p_disposition text, p_beat_key text,
  p_anchor_kind text, p_anchor_key text, p_anchor_text text, p_anchor_text_sha256 text, p_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor uuid;
  v_frozen boolean;
  v_mark_id uuid;
  v_note text := CASE WHEN length(btrim(coalesce(p_note, ''))) = 0 THEN NULL ELSE p_note END;
  v_now timestamptz := now();
BEGIN
  v_actor := public.first_read_marks_actor('create_first_read_mark');
  IF p_kind = 'client_reaction' AND p_disposition IS NULL THEN
    RAISE EXCEPTION 'create_first_read_mark: a client reaction carries a disposition — nothing was written' USING ERRCODE = 'check_violation';
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
  VALUES (v_mark_id, 1, v_note, p_disposition, v_actor, v_now);
  RETURN jsonb_build_object('ok', true, 'mark_id', v_mark_id, 'version', 1, 'disposition', p_disposition, 'created_at', v_now);
END;
$$;
REVOKE ALL ON FUNCTION public.create_first_read_mark(uuid, text, text, text, text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_first_read_mark(uuid, text, text, text, text, text, text, text, text) TO authenticated, service_role;

-- ── 4. append: the note is optional; a version that changes nothing is refused ───────────────────────
-- FM16 unchanged: for a client_reaction an omitted disposition carries the previous version's forward; for our
-- mark it must be NULL. The "nothing changed" test compares the stored note (NULL for empty) and the effective
-- disposition against the latest version.
CREATE OR REPLACE FUNCTION public.append_first_read_mark_note(p_mark_id uuid, p_note text, p_disposition text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor uuid;
  v_mark public.first_read_marks%ROWTYPE;
  v_frozen boolean;
  v_latest public.first_read_mark_notes%ROWTYPE;
  v_version integer;
  v_disposition text;
  v_note text := CASE WHEN length(btrim(coalesce(p_note, ''))) = 0 THEN NULL ELSE p_note END;
  v_now timestamptz := now();
BEGIN
  v_actor := public.first_read_marks_actor('append_first_read_mark_note');
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
  SELECT * INTO v_latest FROM public.first_read_mark_notes WHERE mark_id = p_mark_id ORDER BY version DESC LIMIT 1;
  IF v_mark.kind = 'client_reaction' THEN
    IF p_disposition IS NULL THEN
      v_disposition := v_latest.disposition;
    ELSIF p_disposition NOT IN ('interesting', 'important', 'not_important') THEN
      RAISE EXCEPTION 'append_first_read_mark_note: disposition must be interesting, important or not_important' USING ERRCODE = 'check_violation';
    ELSE
      v_disposition := p_disposition;
    END IF;
  END IF;
  IF v_note IS NOT DISTINCT FROM v_latest.note AND v_disposition IS NOT DISTINCT FROM v_latest.disposition THEN
    RAISE EXCEPTION 'append_first_read_mark_note: nothing changed — no version was written (mark %)', p_mark_id USING ERRCODE = 'check_violation';
  END IF;
  v_version := coalesce(v_latest.version, 0) + 1;
  INSERT INTO public.first_read_mark_notes (mark_id, version, note, disposition, created_by, created_at)
  VALUES (p_mark_id, v_version, v_note, v_disposition, v_actor, v_now);
  RETURN jsonb_build_object('ok', true, 'mark_id', p_mark_id, 'version', v_version, 'disposition', v_disposition, 'created_at', v_now);
END;
$$;
REVOKE ALL ON FUNCTION public.append_first_read_mark_note(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.append_first_read_mark_note(uuid, text, text) TO authenticated, service_role;

COMMIT;
