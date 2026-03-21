-- Keep UI checklist labels aligned with input labels for generated single-item checklists.
-- Safe scope: only inputs that currently have exactly one subitem row.

WITH single_subitem_inputs AS (
  SELECT input_id
  FROM public.input_subitems
  GROUP BY input_id
  HAVING count(*) = 1
)
UPDATE public.input_subitems s
SET name = i.input_label
FROM public.inputs i
JOIN single_subitem_inputs ss ON ss.input_id = i.id
WHERE s.input_id = i.id
  AND s.name IS DISTINCT FROM i.input_label;

