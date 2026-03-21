-- Normalize input grouping + framework language, and repair profile-specific labels.
-- Goal:
-- 1) group_key counts are flexible, but keys map to sensible defaults
-- 2) outcome-data lives in market_evidence
-- 3) profile-specific labels avoid one-size-fits-all wording
-- 4) sub_group communicates framework basis used for scoring

WITH latest_baseline AS (
  SELECT DISTINCT ON (company_id)
    company_id,
    result_json
  FROM public.public_baseline_runs
  ORDER BY company_id, created_at DESC
),
company_profile AS (
  SELECT
    c.id AS company_id,
    CASE
      WHEN (
        lower(
          coalesce(c.name, '') || ' ' ||
          coalesce(c.website, '') || ' ' ||
          coalesce(lb.result_json->>'category_archetype', '') || ' ' ||
          coalesce(lb.result_json #>> '{lens_card,economic_engine}', '') || ' ' ||
          coalesce(lb.result_json #>> '{lens_card,primary_buyer}', '') || ' ' ||
          coalesce(lb.result_json #>> '{lens_card,chooser}', '') || ' ' ||
          coalesce(lb.result_json #>> '{lens_card,user}', '')
        ) ~ '(nonprofit|donor|grant|fundraising|philanthropy|charity|mission[- ]driven)'
      )
      AND NOT (
        lower(
          coalesce(c.name, '') || ' ' ||
          coalesce(c.website, '') || ' ' ||
          coalesce(lb.result_json->>'category_archetype', '') || ' ' ||
          coalesce(lb.result_json #>> '{lens_card,economic_engine}', '') || ' ' ||
          coalesce(lb.result_json #>> '{lens_card,primary_buyer}', '') || ' ' ||
          coalesce(lb.result_json #>> '{lens_card,chooser}', '') || ' ' ||
          coalesce(lb.result_json #>> '{lens_card,user}', '')
        ) ~ '(saas|software|b2b|fintech|coffee|cafe|retail|law|attorney|aviation|air taxi|subscription|revenue|creditor|debt|collections?)'
      )
      THEN 'nonprofit'
      WHEN lower(
        coalesce(c.name, '') || ' ' ||
        coalesce(c.website, '') || ' ' ||
        coalesce(lb.result_json->>'category_archetype', '') || ' ' ||
        coalesce(lb.result_json #>> '{lens_card,economic_engine}', '') || ' ' ||
        coalesce(lb.result_json #>> '{lens_card,primary_buyer}', '') || ' ' ||
        coalesce(lb.result_json #>> '{lens_card,chooser}', '') || ' ' ||
        coalesce(lb.result_json #>> '{lens_card,user}', '')
      ) ~ '(indebted|debt|collections?|creditor|fintech)'
      THEN 'fintech_collections'
      WHEN lower(
        coalesce(c.name, '') || ' ' ||
        coalesce(c.website, '') || ' ' ||
        coalesce(lb.result_json->>'category_archetype', '') || ' ' ||
        coalesce(lb.result_json #>> '{lens_card,economic_engine}', '') || ' ' ||
        coalesce(lb.result_json #>> '{lens_card,primary_buyer}', '') || ' ' ||
        coalesce(lb.result_json #>> '{lens_card,chooser}', '') || ' ' ||
        coalesce(lb.result_json #>> '{lens_card,user}', '')
      ) ~ '(law|litigation|legal|attorney|toxic tort|mesothelioma|claimant|brayton|purcell)'
      THEN 'legal_services'
      WHEN lower(
        coalesce(c.name, '') || ' ' ||
        coalesce(c.website, '') || ' ' ||
        coalesce(lb.result_json->>'category_archetype', '') || ' ' ||
        coalesce(lb.result_json #>> '{lens_card,economic_engine}', '') || ' ' ||
        coalesce(lb.result_json #>> '{lens_card,primary_buyer}', '') || ' ' ||
        coalesce(lb.result_json #>> '{lens_card,chooser}', '') || ' ' ||
        coalesce(lb.result_json #>> '{lens_card,user}', '')
      ) ~ '(cafe|coffee|roast|roastery|barra)'
      THEN 'hospitality_coffee'
      WHEN lower(
        coalesce(c.name, '') || ' ' ||
        coalesce(c.website, '') || ' ' ||
        coalesce(lb.result_json->>'category_archetype', '') || ' ' ||
        coalesce(lb.result_json #>> '{lens_card,economic_engine}', '') || ' ' ||
        coalesce(lb.result_json #>> '{lens_card,primary_buyer}', '') || ' ' ||
        coalesce(lb.result_json #>> '{lens_card,chooser}', '') || ' ' ||
        coalesce(lb.result_json #>> '{lens_card,user}', '')
      ) ~ '(telecom|carrier|dealer network|wireless retail|point[- ]of[- ]sale|\\mpos\\M)'
      THEN 'telecom_saas'
      WHEN lower(
        coalesce(c.name, '') || ' ' ||
        coalesce(c.website, '') || ' ' ||
        coalesce(lb.result_json->>'category_archetype', '') || ' ' ||
        coalesce(lb.result_json #>> '{lens_card,economic_engine}', '') || ' ' ||
        coalesce(lb.result_json #>> '{lens_card,primary_buyer}', '') || ' ' ||
        coalesce(lb.result_json #>> '{lens_card,chooser}', '') || ' ' ||
        coalesce(lb.result_json #>> '{lens_card,user}', '')
      ) ~ '(aviation|air taxi|evtol|flight|urban air mobility|joby)'
      THEN 'mobility_aviation'
      ELSE 'generic_commercial'
    END AS profile
  FROM public.companies c
  LEFT JOIN latest_baseline lb ON lb.company_id = c.id
),
target AS (
  SELECT
    i.id,
    i.input_key,
    cp.profile
  FROM public.inputs i
  JOIN company_profile cp ON cp.company_id = i.company_id
),
mapped AS (
  SELECT
    t.id,
    CASE
      WHEN t.profile = 'fintech_collections' THEN
        CASE t.input_key
          WHEN 'val-prop' THEN 'Recovery Value Themes'
          WHEN 'target-aud' THEN 'Best-Fit Creditors'
          WHEN 'program-model' THEN 'Collections Operating Model'
          WHEN 'needs-assessment' THEN 'Creditor & Debtor Jobs'
          WHEN 'outcome-data' THEN 'Recovery Outcome Evidence'
          WHEN 'referral-map' THEN 'Acquisition & Partner Channels'
          WHEN 'brand-narrative' THEN 'Trust & Compliance Story'
          WHEN 'channel-strat' THEN 'Enterprise GTM Channels'
          WHEN 'donor-retention' THEN 'Client Retention'
          WHEN 'grant-pipeline' THEN 'Enterprise Pipeline'
          WHEN 'family-satisfaction' THEN 'Debtor Experience Signals'
          ELSE NULL
        END
      WHEN t.profile = 'hospitality_coffee' THEN
        CASE t.input_key
          WHEN 'val-prop' THEN 'Roaster Value Themes'
          WHEN 'target-aud' THEN 'Best-Fit Buyers'
          WHEN 'program-model' THEN 'Roaster Operating Model'
          WHEN 'needs-assessment' THEN 'Buyer & Partner Jobs'
          WHEN 'outcome-data' THEN 'Cup Quality Evidence'
          WHEN 'referral-map' THEN 'Wholesale Acquisition Sources'
          WHEN 'brand-narrative' THEN 'Origin & Craft Story'
          WHEN 'channel-strat' THEN 'Wholesale + DTC Channels'
          WHEN 'donor-retention' THEN 'Repeat Purchase Retention'
          WHEN 'grant-pipeline' THEN 'Wholesale Pipeline'
          WHEN 'family-satisfaction' THEN 'Customer Experience Signals'
          ELSE NULL
        END
      WHEN t.profile = 'telecom_saas' THEN
        CASE t.input_key
          WHEN 'val-prop' THEN 'Platform Value Themes'
          WHEN 'target-aud' THEN 'Best-Fit Carrier Segments'
          WHEN 'program-model' THEN 'Platform Operating Model'
          WHEN 'needs-assessment' THEN 'Operator Jobs'
          WHEN 'outcome-data' THEN 'Adoption Evidence'
          WHEN 'referral-map' THEN 'Partner Acquisition Sources'
          WHEN 'brand-narrative' THEN 'Platform Positioning Story'
          WHEN 'channel-strat' THEN 'Carrier GTM Channels'
          ELSE NULL
        END
      WHEN t.profile = 'legal_services' THEN
        CASE t.input_key
          WHEN 'val-prop' THEN 'Case Value Themes'
          WHEN 'target-aud' THEN 'Best-Fit Claimants'
          WHEN 'program-model' THEN 'Litigation Operating Model'
          WHEN 'needs-assessment' THEN 'Claimant Decision Jobs'
          WHEN 'outcome-data' THEN 'Case Outcome Evidence'
          WHEN 'referral-map' THEN 'Case Referral Sources'
          WHEN 'brand-narrative' THEN 'Advocacy Story'
          WHEN 'channel-strat' THEN 'Claim Intake Channels'
          ELSE NULL
        END
      WHEN t.profile = 'mobility_aviation' THEN
        CASE t.input_key
          WHEN 'val-prop' THEN 'Mobility Value Themes'
          WHEN 'target-aud' THEN 'Best-Fit Riders & Partners'
          WHEN 'program-model' THEN 'Flight Operating Model'
          WHEN 'needs-assessment' THEN 'Rider & Partner Jobs'
          WHEN 'outcome-data' THEN 'Flight Readiness Evidence'
          WHEN 'referral-map' THEN 'Partnership Acquisition Sources'
          WHEN 'brand-narrative' THEN 'Mobility Story'
          WHEN 'channel-strat' THEN 'Route Launch Channels'
          ELSE NULL
        END
      WHEN t.profile = 'generic_commercial' THEN
        CASE t.input_key
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
          ELSE NULL
        END
      ELSE NULL
    END AS next_label,
    CASE
      WHEN t.input_key IN ('comp-alt', 'unique-attr', 'val-prop', 'target-aud', 'market-cat', 'brand-narrative')
        THEN 'Positioning'
      WHEN t.input_key = 'program-model'
        THEN 'Strategy Cascade'
      WHEN t.input_key IN ('needs-assessment', 'outcome-data')
        THEN 'ODI'
      WHEN t.input_key IN ('referral-map', 'channel-strat')
        THEN 'GTM'
      WHEN t.input_key IN ('donor-retention', 'grant-pipeline', 'family-satisfaction')
        THEN 'Market Evidence'
      ELSE NULL
    END AS next_sub_group,
    CASE
      WHEN t.input_key IN ('comp-alt','unique-attr','val-prop','target-aud','market-cat','program-model','needs-assessment')
        THEN 'foundation'
      WHEN t.input_key IN ('referral-map','brand-narrative','channel-strat')
        THEN 'execution'
      WHEN t.input_key IN ('outcome-data','donor-retention','grant-pipeline','family-satisfaction')
        THEN 'market_evidence'
      ELSE 'foundation'
    END AS next_group_key
  FROM target t
)
UPDATE public.inputs i
SET
  input_label = COALESCE(m.next_label, i.input_label),
  sub_group = COALESCE(m.next_sub_group, i.sub_group),
  group_key = m.next_group_key::public.input_group_key,
  group_label = CASE m.next_group_key
    WHEN 'execution' THEN 'Execution'
    WHEN 'market_evidence' THEN 'Market Evidence'
    ELSE 'Foundation'
  END
FROM mapped m
WHERE i.id = m.id
  AND (
    COALESCE(m.next_label, i.input_label) IS DISTINCT FROM i.input_label
    OR COALESCE(m.next_sub_group, i.sub_group) IS DISTINCT FROM i.sub_group
    OR m.next_group_key::public.input_group_key IS DISTINCT FROM i.group_key
    OR CASE m.next_group_key
      WHEN 'execution' THEN 'Execution'
      WHEN 'market_evidence' THEN 'Market Evidence'
      ELSE 'Foundation'
    END IS DISTINCT FROM i.group_label
  );

WITH one_subitem AS (
  SELECT input_id, (array_agg(id ORDER BY id))[1] AS subitem_id
  FROM public.input_subitems
  GROUP BY input_id
  HAVING count(*) = 1
)
UPDATE public.input_subitems s
SET name = i.input_label
FROM one_subitem os
JOIN public.inputs i ON i.id = os.input_id
WHERE s.id = os.subitem_id
  AND COALESCE(s.name, '') IS DISTINCT FROM COALESCE(i.input_label, '');

-- Ensure outcome evidence rows are always classified under market evidence.
UPDATE public.inputs
SET
  group_key = 'market_evidence'::public.input_group_key,
  group_label = 'Market Evidence'
WHERE input_key = 'outcome-data'
  AND (
    group_key IS DISTINCT FROM 'market_evidence'::public.input_group_key
    OR COALESCE(group_label, '') <> 'Market Evidence'
  );
