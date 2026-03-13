
-- Function to recalculate input completeness and status based on subitems + files
CREATE OR REPLACE FUNCTION public.recalculate_input_completeness()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  -- Determine which input_id was affected
  IF TG_TABLE_NAME = 'input_subitems' THEN
    _input_id := COALESCE(NEW.input_id, OLD.input_id);
  ELSIF TG_TABLE_NAME = 'input_files' THEN
    _input_id := COALESCE(NEW.input_id, OLD.input_id);
  END IF;

  IF _input_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Count subitems
  SELECT COUNT(*), COUNT(*) FILTER (WHERE done = true)
  INTO _total_subs, _done_subs
  FROM public.input_subitems WHERE input_id = _input_id;

  -- Count files
  SELECT COUNT(*) INTO _file_count
  FROM public.input_files WHERE input_id = _input_id;

  -- Get current impact tier and score_impact
  SELECT impact_tier, score_impact INTO _current_impact_tier, _current_score_impact
  FROM public.inputs WHERE id = _input_id;

  -- Calculate completeness:
  -- Subitems contribute 85%, files contribute 15% (any file = full 15%)
  IF _total_subs > 0 THEN
    _new_completeness := LEAST(
      ROUND((_done_subs::numeric / _total_subs) * 85 + (CASE WHEN _file_count > 0 THEN 15 ELSE 0 END)),
      100
    );
  ELSE
    -- No subitems: files alone can bring it to 15%
    _new_completeness := CASE WHEN _file_count > 0 THEN 15 ELSE 0 END;
  END IF;

  -- Determine status
  IF _new_completeness >= 100 THEN
    _new_status := 'complete';
  ELSIF _new_completeness > 0 THEN
    _new_status := 'partial';
  ELSE
    _new_status := 'not_started';
  END IF;

  -- Update impact_tier to 'done' if complete, otherwise keep original (or recalc from score_impact)
  IF _new_status = 'complete' THEN
    _new_impact_tier := 'done';
  ELSIF _current_impact_tier = 'done' AND _new_status != 'complete' THEN
    -- Was done, now incomplete again — recalc from score_impact
    IF _current_score_impact >= 3.0 THEN _new_impact_tier := 'high';
    ELSIF _current_score_impact >= 1.0 THEN _new_impact_tier := 'med';
    ELSE _new_impact_tier := 'low';
    END IF;
  ELSE
    _new_impact_tier := _current_impact_tier;
  END IF;

  -- Update the input row
  UPDATE public.inputs
  SET completeness = _new_completeness,
      status = _new_status,
      impact_tier = _new_impact_tier,
      updated_at = now()
  WHERE id = _input_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger on input_subitems changes
CREATE TRIGGER trg_recalc_on_subitem_change
AFTER INSERT OR UPDATE OR DELETE ON public.input_subitems
FOR EACH ROW EXECUTE FUNCTION public.recalculate_input_completeness();

-- Trigger on input_files changes  
CREATE TRIGGER trg_recalc_on_file_change
AFTER INSERT OR UPDATE OR DELETE ON public.input_files
FOR EACH ROW EXECUTE FUNCTION public.recalculate_input_completeness();
