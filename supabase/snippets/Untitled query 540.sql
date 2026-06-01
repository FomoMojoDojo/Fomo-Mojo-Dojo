select
  id,
  name,
  evidence_status,
  review_status,
  review_source,
  area_scores_json->'evidence' as evidence_block,
  updated_at
from public.companies
where id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc';
