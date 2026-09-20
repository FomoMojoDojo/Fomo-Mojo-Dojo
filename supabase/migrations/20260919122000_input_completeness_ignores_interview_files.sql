-- R15 (operator, 2026-09-19): an interview upload never changes an input's completeness / status. The
-- completeness recalculation (trg_recalc_on_file_change / trg_recalc_on_subitem_change →
-- recalculate_input_completeness) counted ANY input_files row as "a file" (15 % of completeness). The file
-- count now excludes is_interview rows. Nothing else in the formula changes. Non-destructive.
BEGIN;
CREATE OR REPLACE FUNCTION public.recalculate_input_completeness()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _input_id uuid;
  _total_subs int;
  _done_subs int;
  _file_count int;
  _new_completeness int;
  _new_status input_status;
  _new_impact_tier input_impact_tier;
  _current_impact_tier input_impact_tier;
  _current_score_impact numeric;
BEGIN
  IF TG_TABLE_NAME = 'input_subitems' THEN
    _input_id := COALESCE(NEW.input_id, OLD.input_id);
  ELSIF TG_TABLE_NAME = 'input_files' THEN
    _input_id := COALESCE(NEW.input_id, OLD.input_id);
  END IF;
  IF _input_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE done = true)
  INTO _total_subs, _done_subs
  FROM public.input_subitems WHERE input_id = _input_id;

  -- R15: an interview transcript is not evidence for the input — it never counts as a file here.
  SELECT COUNT(*) INTO _file_count
  FROM public.input_files WHERE input_id = _input_id AND is_interview = false;

  SELECT impact_tier, score_impact INTO _current_impact_tier, _current_score_impact
  FROM public.inputs WHERE id = _input_id;

  IF _total_subs > 0 THEN
    _new_completeness := LEAST(
      ROUND((_done_subs::numeric / _total_subs) * 85 + (CASE WHEN _file_count > 0 THEN 15 ELSE 0 END)),
      100
    );
  ELSE
    _new_completeness := CASE WHEN _file_count > 0 THEN 15 ELSE 0 END;
  END IF;

  IF _new_completeness >= 100 THEN
    _new_status := 'complete';
  ELSIF _new_completeness > 0 THEN
    _new_status := 'partial';
  ELSE
    _new_status := 'not_started';
  END IF;

  IF _new_status = 'complete' THEN
    _new_impact_tier := 'done';
  ELSIF _current_impact_tier = 'done' AND _new_status != 'complete' THEN
    IF _current_score_impact >= 3.0 THEN _new_impact_tier := 'high';
    ELSIF _current_score_impact >= 1.0 THEN _new_impact_tier := 'med';
    ELSE _new_impact_tier := 'low';
    END IF;
  ELSE
    _new_impact_tier := _current_impact_tier;
  END IF;

  UPDATE public.inputs
  SET completeness = _new_completeness,
      status = _new_status,
      impact_tier = _new_impact_tier,
      updated_at = now()
  WHERE id = _input_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
COMMENT ON FUNCTION public.recalculate_input_completeness() IS 'Subitems 85 % + any NON-interview file 15 % (R15, 2026-09-19: input_files.is_interview rows never count).';
COMMIT;
