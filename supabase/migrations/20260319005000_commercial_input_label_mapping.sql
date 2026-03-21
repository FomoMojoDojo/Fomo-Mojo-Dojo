-- Make commercial-company diagnostic input labels more category-specific and framework-readable.

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
  input_label = CASE i.input_key
    WHEN 'val-prop' THEN 'Value Themes'
    WHEN 'target-aud' THEN 'Best-Fit Customers'
    WHEN 'program-model' THEN 'Operating Model'
    WHEN 'needs-assessment' THEN 'Customer Jobs'
    WHEN 'outcome-data' THEN 'Outcome Evidence'
    WHEN 'referral-map' THEN 'Acquisition Sources'
    WHEN 'brand-narrative' THEN 'Positioning Story'
    WHEN 'channel-strat' THEN 'GTM Channels'
    WHEN 'donor-retention' THEN 'Customer Retention'
    WHEN 'grant-pipeline' THEN 'Growth Pipeline'
    WHEN 'family-satisfaction' THEN 'Customer Satisfaction'
    ELSE i.input_label
  END,
  sub_group = CASE i.input_key
    WHEN 'needs-assessment' THEN 'ODI'
    WHEN 'outcome-data' THEN 'ODI'
    WHEN 'referral-map' THEN 'GTM'
    WHEN 'brand-narrative' THEN 'Messaging'
    WHEN 'channel-strat' THEN 'GTM'
    WHEN 'donor-retention' THEN 'Retention'
    WHEN 'grant-pipeline' THEN 'Demand Pipeline'
    WHEN 'family-satisfaction' THEN 'Customer Experience'
    ELSE i.sub_group
  END
FROM company_mode cm
WHERE
  i.company_id = cm.company_id
  AND cm.mode = 'commercial'
  AND i.input_key IN (
    'val-prop',
    'target-aud',
    'program-model',
    'needs-assessment',
    'outcome-data',
    'referral-map',
    'brand-narrative',
    'channel-strat',
    'donor-retention',
    'grant-pipeline',
    'family-satisfaction'
  );

