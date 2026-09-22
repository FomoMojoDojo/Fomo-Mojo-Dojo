-- First-read marks, commit 4 of 4 — the revisit prompt's remembered Keep (ruling FM12 revised, operator,
-- 2026-09-22). On a revisit the tool asks Keep or Remove for every mark whose row no longer matches. Remove is
-- the existing permanent withdraw, with a new reason value (operator_removed_on_revisit — free text on the
-- column, so no schema change is needed for it). Keep is new and must be REMEMBERED, or the same question is
-- asked on every reload: three nullable columns record what the mark was reconciled AGAINST, so a row that
-- changes AGAIN after a Keep asks again.
--
--   revisit_resolved_at       when the operator kept it
--   revisit_resolved_against  the current row's sha256 at that moment, or the literal 'row_gone'
--   revisit_resolved_by       the admin who kept it
--
-- The anchor stays immutable: the trigger below still refuses every birth field, and now admits exactly two
-- legal changes to a live mark — the withdraw triple (as before) or the revisit triple (new), never both in one
-- statement, never on a withdrawn mark.
BEGIN;

ALTER TABLE public.first_read_marks
  ADD COLUMN revisit_resolved_at timestamptz,
  ADD COLUMN revisit_resolved_against text,
  ADD COLUMN revisit_resolved_by uuid;

-- The revisit triple travels together; 'against' is the current sha256 or the literal row_gone, never blank.
ALTER TABLE public.first_read_marks
  ADD CONSTRAINT first_read_marks_revisit_triple CHECK (
    (revisit_resolved_at IS NULL AND revisit_resolved_against IS NULL AND revisit_resolved_by IS NULL)
    OR (revisit_resolved_at IS NOT NULL AND revisit_resolved_by IS NOT NULL
        AND (revisit_resolved_against ~ '^[0-9a-f]{64}$' OR revisit_resolved_against = 'row_gone'))
  );

CREATE INDEX first_read_marks_revisit_idx ON public.first_read_marks (company_id, revisit_resolved_at);

-- ── immutability, amended ────────────────────────────────────────────────────────────────────────────
-- Unchanged: DELETE refused while the company exists; every birth field immutable; a withdrawn mark frozen.
-- Amended: a live mark now takes EITHER the withdraw triple OR the revisit triple in one statement — and a
-- Keep may be re-recorded (a row that changed again after a Keep is kept again, against the new text).
CREATE OR REPLACE FUNCTION public.first_read_marks_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_withdraw_changed boolean;
  v_revisit_changed boolean;
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
  v_withdraw_changed := NEW.withdrawn_at IS DISTINCT FROM OLD.withdrawn_at
    OR NEW.withdrawn_by IS DISTINCT FROM OLD.withdrawn_by
    OR NEW.withdraw_reason IS DISTINCT FROM OLD.withdraw_reason;
  v_revisit_changed := NEW.revisit_resolved_at IS DISTINCT FROM OLD.revisit_resolved_at
    OR NEW.revisit_resolved_against IS DISTINCT FROM OLD.revisit_resolved_against
    OR NEW.revisit_resolved_by IS DISTINCT FROM OLD.revisit_resolved_by;
  IF v_withdraw_changed AND v_revisit_changed THEN
    RAISE EXCEPTION 'first_read_marks: a withdraw and a revisit resolution never travel in one statement — mark %', OLD.id;
  END IF;
  IF NOT v_withdraw_changed AND NOT v_revisit_changed THEN
    RAISE EXCEPTION 'first_read_marks: the only changes a mark takes are its withdraw and its revisit resolution — mark %', OLD.id;
  END IF;
  IF v_withdraw_changed AND NEW.withdrawn_at IS NULL THEN
    RAISE EXCEPTION 'first_read_marks: a withdraw is never undone — mark %', OLD.id;
  END IF;
  IF v_revisit_changed AND NEW.revisit_resolved_at IS NULL THEN
    RAISE EXCEPTION 'first_read_marks: a revisit resolution is never cleared — mark %', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

-- ── keep ─────────────────────────────────────────────────────────────────────────────────────────────
-- Records that the operator reconciled this mark against the row AS IT NOW READS. p_against is that row's
-- sha256, or the literal row_gone when the row has left the read. Refuses a blank p_against, a withdrawn mark
-- and a frozen company — the same three refusals the withdraw RPC makes. Re-keeping is legal: the row may have
-- changed again since the last Keep, and the prompt fires again precisely when it has.
CREATE OR REPLACE FUNCTION public.keep_first_read_mark(p_mark_id uuid, p_against text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor uuid;
  v_mark public.first_read_marks%ROWTYPE;
  v_frozen boolean;
  v_now timestamptz := now();
  v_versions integer;
  v_audit_id bigint;
BEGIN
  v_actor := public.first_read_marks_actor('keep_first_read_mark');
  IF length(btrim(coalesce(p_against, ''))) = 0 THEN
    RAISE EXCEPTION 'keep_first_read_mark: what the mark was kept against is required' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT (p_against ~ '^[0-9a-f]{64}$' OR p_against = 'row_gone') THEN
    RAISE EXCEPTION 'keep_first_read_mark: % is neither a sha256 nor row_gone', p_against USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_mark FROM public.first_read_marks WHERE id = p_mark_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'keep_first_read_mark: no mark %', p_mark_id USING ERRCODE = 'no_data_found';
  END IF;
  SELECT frozen INTO v_frozen FROM public.companies WHERE id = v_mark.company_id;
  IF coalesce(v_frozen, false) THEN
    RAISE EXCEPTION 'keep_first_read_mark: company % is a frozen reference fixture', v_mark.company_id USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_mark.withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION 'keep_first_read_mark: mark % is withdrawn (% — %)', p_mark_id, v_mark.withdrawn_at, coalesce(v_mark.withdraw_reason, '') USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.first_read_marks
     SET revisit_resolved_at = v_now, revisit_resolved_by = v_actor, revisit_resolved_against = p_against
   WHERE id = p_mark_id;
  SELECT count(*) INTO v_versions FROM public.first_read_mark_notes WHERE mark_id = p_mark_id;
  INSERT INTO public.integrity_runs (company_id, component, surface_type, surface_id, ran_at, status, examined, admitted, excluded_by_rule, run_ref)
  VALUES (v_mark.company_id, 'first_read_mark_kept', 'first_read_marks', p_mark_id, v_now, 'completed', 1, 1,
    jsonb_build_object(
      'ruling', 'FM12 revised (2026-09-22): on a revisit the operator keeps or removes a mark whose row no longer matches; a Keep is remembered against the row as it then read, so a row that changes again asks again.',
      'mark_id', p_mark_id, 'kind', v_mark.kind, 'disposition', v_mark.disposition, 'beat_key', v_mark.beat_key,
      'anchor_kind', v_mark.anchor_kind, 'anchor_key', v_mark.anchor_key, 'anchor_text_sha256', v_mark.anchor_text_sha256,
      'note_versions', v_versions, 'revisit_resolved_by', v_actor, 'revisit_resolved_against', p_against),
    'keep_first_read_mark')
  RETURNING id INTO v_audit_id;
  RETURN jsonb_build_object('ok', true, 'mark_id', p_mark_id, 'revisit_resolved_at', v_now, 'audit_id', v_audit_id);
END;
$$;
REVOKE ALL ON FUNCTION public.keep_first_read_mark(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.keep_first_read_mark(uuid, text) TO authenticated, service_role;

COMMENT ON COLUMN public.first_read_marks.revisit_resolved_against IS 'FM12 revised (2026-09-22): the sha256 of the row as it read when the operator kept this mark, or the literal row_gone; the prompt fires again when the current state differs from it.';

COMMIT;
