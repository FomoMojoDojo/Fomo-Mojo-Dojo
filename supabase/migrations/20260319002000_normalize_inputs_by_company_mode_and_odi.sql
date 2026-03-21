-- Normalize existing inputs so each company has category-relevant wording
-- and ODI language is present in core diagnostic rows.

-- 1) Keep input grouping deterministic by input_key.
UPDATE public.inputs
SET
  group_key = CASE
    WHEN input_key IN ('comp-alt', 'unique-attr', 'val-prop', 'target-aud', 'market-cat', 'program-model', 'needs-assessment') THEN 'foundation'::public.input_group_key
    WHEN input_key IN ('outcome-data', 'brand-narrative', 'channel-strat', 'referral-map') THEN 'execution'::public.input_group_key
    WHEN input_key IN ('donor-retention', 'grant-pipeline', 'family-satisfaction') THEN 'market_evidence'::public.input_group_key
    ELSE group_key
  END,
  group_label = CASE
    WHEN input_key IN ('comp-alt', 'unique-attr', 'val-prop', 'target-aud', 'market-cat', 'program-model', 'needs-assessment') THEN 'Foundation'
    WHEN input_key IN ('outcome-data', 'brand-narrative', 'channel-strat', 'referral-map') THEN 'Execution'
    WHEN input_key IN ('donor-retention', 'grant-pipeline', 'family-satisfaction') THEN 'Market Evidence'
    ELSE group_label
  END;

WITH latest_baseline AS (
  SELECT DISTINCT ON (company_id)
    company_id,
    result_json
  FROM public.public_baseline_runs
  ORDER BY company_id, created_at DESC
),
company_mode AS (
  SELECT
    c.id AS company_id,
    CASE
      WHEN (
        (
          lower(
            coalesce(c.name, '') || ' ' ||
            coalesce(c.website, '') || ' ' ||
            coalesce(lb.result_json->>'category_archetype', '') || ' ' ||
            coalesce(lb.result_json #>> '{lens_card,economic_engine}', '')
          ) ~ '(nonprofit|donor|grant|fundraising|philanthropy|charity|mission[- ]driven)'
        )
        AND NOT (
          lower(
            coalesce(c.name, '') || ' ' ||
            coalesce(c.website, '') || ' ' ||
            coalesce(lb.result_json->>'category_archetype', '') || ' ' ||
            coalesce(lb.result_json #>> '{lens_card,economic_engine}', '')
          ) ~ '(saas|software|b2b|fintech|coffee|cafe|retail|law|aviation|air taxi|subscription|revenue)'
        )
      )
      THEN 'nonprofit'
      ELSE 'commercial'
    END AS mode
  FROM public.companies c
  LEFT JOIN latest_baseline lb ON lb.company_id = c.id
)
-- 2) Commercial companies: convert nonprofit placeholders to category-relevant signals.
UPDATE public.inputs i
SET
  input_label = 'Customer Retention',
  sub_group = 'Retention',
  description = CASE
    WHEN i.description ~* '(not applicable|not relevant|n/a)' OR btrim(coalesce(i.description, '')) = '' THEN 'Repeat purchase and reorder behavior'
    ELSE i.description
  END,
  why_it_matters = CASE
    WHEN i.why_it_matters ~* '(not applicable|not relevant|n/a)' OR btrim(coalesce(i.why_it_matters, '')) = '' THEN 'Protects recurring revenue and loyalty'
    ELSE i.why_it_matters
  END
FROM company_mode cm
WHERE
  i.company_id = cm.company_id
  AND cm.mode = 'commercial'
  AND i.input_key = 'donor-retention';

WITH latest_baseline AS (
  SELECT DISTINCT ON (company_id)
    company_id,
    result_json
  FROM public.public_baseline_runs
  ORDER BY company_id, created_at DESC
),
company_mode AS (
  SELECT
    c.id AS company_id,
    CASE
      WHEN (
        (
          lower(
            coalesce(c.name, '') || ' ' ||
            coalesce(c.website, '') || ' ' ||
            coalesce(lb.result_json->>'category_archetype', '') || ' ' ||
            coalesce(lb.result_json #>> '{lens_card,economic_engine}', '')
          ) ~ '(nonprofit|donor|grant|fundraising|philanthropy|charity|mission[- ]driven)'
        )
        AND NOT (
          lower(
            coalesce(c.name, '') || ' ' ||
            coalesce(c.website, '') || ' ' ||
            coalesce(lb.result_json->>'category_archetype', '') || ' ' ||
            coalesce(lb.result_json #>> '{lens_card,economic_engine}', '')
          ) ~ '(saas|software|b2b|fintech|coffee|cafe|retail|law|aviation|air taxi|subscription|revenue)'
        )
      )
      THEN 'nonprofit'
      ELSE 'commercial'
    END AS mode
  FROM public.companies c
  LEFT JOIN latest_baseline lb ON lb.company_id = c.id
)
UPDATE public.inputs i
SET
  input_label = 'Growth Pipeline',
  sub_group = 'Demand Pipeline',
  description = CASE
    WHEN i.description ~* '(not applicable|not relevant|n/a)' OR btrim(coalesce(i.description, '')) = '' THEN 'Qualified leads and wholesale opportunities'
    ELSE i.description
  END,
  why_it_matters = CASE
    WHEN i.why_it_matters ~* '(not applicable|not relevant|n/a)' OR btrim(coalesce(i.why_it_matters, '')) = '' THEN 'Predicts near-term revenue growth'
    ELSE i.why_it_matters
  END
FROM company_mode cm
WHERE
  i.company_id = cm.company_id
  AND cm.mode = 'commercial'
  AND i.input_key = 'grant-pipeline';

WITH latest_baseline AS (
  SELECT DISTINCT ON (company_id)
    company_id,
    result_json
  FROM public.public_baseline_runs
  ORDER BY company_id, created_at DESC
),
company_mode AS (
  SELECT
    c.id AS company_id,
    CASE
      WHEN (
        (
          lower(
            coalesce(c.name, '') || ' ' ||
            coalesce(c.website, '') || ' ' ||
            coalesce(lb.result_json->>'category_archetype', '') || ' ' ||
            coalesce(lb.result_json #>> '{lens_card,economic_engine}', '')
          ) ~ '(nonprofit|donor|grant|fundraising|philanthropy|charity|mission[- ]driven)'
        )
        AND NOT (
          lower(
            coalesce(c.name, '') || ' ' ||
            coalesce(c.website, '') || ' ' ||
            coalesce(lb.result_json->>'category_archetype', '') || ' ' ||
            coalesce(lb.result_json #>> '{lens_card,economic_engine}', '')
          ) ~ '(saas|software|b2b|fintech|coffee|cafe|retail|law|aviation|air taxi|subscription|revenue)'
        )
      )
      THEN 'nonprofit'
      ELSE 'commercial'
    END AS mode
  FROM public.companies c
  LEFT JOIN latest_baseline lb ON lb.company_id = c.id
)
UPDATE public.inputs i
SET
  input_label = 'Customer Satisfaction',
  sub_group = 'Customer Experience',
  description = CASE
    WHEN i.description ~* '(not applicable|not relevant|n/a)' OR btrim(coalesce(i.description, '')) = '' THEN 'Ratings, reviews, and repeat sentiment'
    ELSE i.description
  END,
  why_it_matters = CASE
    WHEN i.why_it_matters ~* '(not applicable|not relevant|n/a)' OR btrim(coalesce(i.why_it_matters, '')) = '' THEN 'Signals fit, quality, and retention risk'
    ELSE i.why_it_matters
  END
FROM company_mode cm
WHERE
  i.company_id = cm.company_id
  AND cm.mode = 'commercial'
  AND i.input_key = 'family-satisfaction';

-- 3) Ensure ODI language appears in key diagnostic rows.
UPDATE public.inputs
SET
  description = trim(both from concat_ws('. ', nullif(btrim(description), ''), 'ODI job map and desired outcomes')),
  why_it_matters = trim(both from concat_ws('. ', nullif(btrim(why_it_matters), ''), 'Uses importance and satisfaction to prioritize'))
WHERE
  input_key = 'needs-assessment'
  AND (
    coalesce(description, '') !~* '(odi|job|outcome|importance|satisfaction)'
    OR coalesce(why_it_matters, '') !~* '(odi|job|outcome|importance|satisfaction)'
  );

UPDATE public.inputs
SET
  description = trim(both from concat_ws('. ', nullif(btrim(description), ''), 'Track ODI outcome satisfaction and completion signals')),
  why_it_matters = trim(both from concat_ws('. ', nullif(btrim(why_it_matters), ''), 'Validates high-importance underserved outcomes'))
WHERE
  input_key = 'outcome-data'
  AND (
    coalesce(description, '') !~* '(odi|job|outcome|importance|satisfaction)'
    OR coalesce(why_it_matters, '') !~* '(odi|job|outcome|importance|satisfaction)'
  );

UPDATE public.inputs
SET
  description = trim(both from concat_ws('. ', nullif(btrim(description), ''), 'Map decision-journey triggers and trusted acquisition sources')),
  why_it_matters = trim(both from concat_ws('. ', nullif(btrim(why_it_matters), ''), 'Shows where customers discover, evaluate, and choose'))
WHERE
  input_key = 'referral-map'
  AND (
    coalesce(description, '') !~* '(odi|job|outcome|importance|satisfaction)'
    OR coalesce(why_it_matters, '') !~* '(odi|job|outcome|importance|satisfaction)'
  );

-- 4) Ensure ODI is included in framework tags for inputs.
UPDATE public.inputs i
SET frameworks_used = (
  SELECT ARRAY_AGG(DISTINCT key ORDER BY key)
  FROM UNNEST(coalesce(i.frameworks_used, ARRAY[]::text[]) || ARRAY['odi']) AS key
)
WHERE NOT ('odi' = ANY (coalesce(i.frameworks_used, ARRAY[]::text[])));

