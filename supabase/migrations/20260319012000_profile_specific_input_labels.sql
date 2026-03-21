-- Split commercial diagnostic inputs by business profile so companies do not share generic labels.

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
        ) ~ '(saas|software|b2b|fintech|coffee|cafe|retail|law|aviation|air taxi|subscription|revenue|creditor|debt|collections?)'
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
      ) ~ '(telecom|carrier|dealer network|wireless retail|point[- ]of[- ]sale|pos)'
      THEN 'telecom_saas'
      WHEN lower(
        coalesce(c.name, '') || ' ' ||
        coalesce(c.website, '') || ' ' ||
        coalesce(lb.result_json->>'category_archetype', '') || ' ' ||
        coalesce(lb.result_json #>> '{lens_card,economic_engine}', '') || ' ' ||
        coalesce(lb.result_json #>> '{lens_card,primary_buyer}', '') || ' ' ||
        coalesce(lb.result_json #>> '{lens_card,chooser}', '') || ' ' ||
        coalesce(lb.result_json #>> '{lens_card,user}', '')
      ) ~ '(law|litigation|legal|toxic tort|mesothelioma|claimant)'
      THEN 'legal_services'
      WHEN lower(
        coalesce(c.name, '') || ' ' ||
        coalesce(c.website, '') || ' ' ||
        coalesce(lb.result_json->>'category_archetype', '') || ' ' ||
        coalesce(lb.result_json #>> '{lens_card,economic_engine}', '') || ' ' ||
        coalesce(lb.result_json #>> '{lens_card,primary_buyer}', '') || ' ' ||
        coalesce(lb.result_json #>> '{lens_card,chooser}', '') || ' ' ||
        coalesce(lb.result_json #>> '{lens_card,user}', '')
      ) ~ '(aviation|air taxi|evtol|flight|urban air mobility)'
      THEN 'mobility_aviation'
      ELSE 'generic_commercial'
    END AS profile
  FROM public.companies c
  LEFT JOIN latest_baseline lb ON lb.company_id = c.id
),
target AS (
  SELECT
    i.id,
    i.company_id,
    i.input_key,
    cp.profile
  FROM public.inputs i
  JOIN company_profile cp ON cp.company_id = i.company_id
  WHERE cp.profile <> 'nonprofit'
),
mapped AS (
  SELECT
    t.id,
    CASE t.profile
      WHEN 'fintech_collections' THEN
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
      WHEN 'hospitality_coffee' THEN
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
      WHEN 'telecom_saas' THEN
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
      WHEN 'legal_services' THEN
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
      WHEN 'mobility_aviation' THEN
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
      ELSE
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
    END AS next_input_label,
    CASE t.input_key
      WHEN 'needs-assessment' THEN 'ODI'
      WHEN 'outcome-data' THEN 'ODI'
      WHEN 'referral-map' THEN 'GTM'
      WHEN 'brand-narrative' THEN 'Messaging'
      WHEN 'channel-strat' THEN 'GTM'
      WHEN 'donor-retention' THEN 'Retention'
      WHEN 'grant-pipeline' THEN 'Demand Pipeline'
      WHEN 'family-satisfaction' THEN 'Customer Experience'
      ELSE NULL
    END AS next_sub_group
  FROM target t
)
UPDATE public.inputs i
SET
  input_label = COALESCE(m.next_input_label, i.input_label),
  sub_group = COALESCE(m.next_sub_group, i.sub_group)
FROM mapped m
WHERE i.id = m.id
  AND (
    COALESCE(m.next_input_label, i.input_label) IS DISTINCT FROM i.input_label
    OR COALESCE(m.next_sub_group, i.sub_group) IS DISTINCT FROM i.sub_group
  );

-- Keep single checklist item labels aligned with input labels after remapping.
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
