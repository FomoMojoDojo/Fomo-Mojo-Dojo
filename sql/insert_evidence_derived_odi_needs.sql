-- PHASE 78E: Insert evidence-derived ODI needs for Cafe Barra
-- Generated from 8 active evidence files via local analysis pipeline (Ollama)
-- source_path = 'evidence_derived_78e'
-- frameworks_used = ARRAY['ODI', 'evidence_derived_78e']
--
-- Company: Cafe Barra | ID: 58b2b15b-bada-4bcd-9c12-b7e66a37d0bc
-- User (admin): 5860c99a-e6f8-4feb-9997-992e3654f181
-- Journey: customer — "Job Map: Cafe Owner — Building a Specialty Coffee Program"
--
-- Formula: opportunity_score = (importance - satisfaction) × importance
-- Service states: under_served when importance > satisfaction + 2
--
-- Safe to re-run: INSERT ... ON CONFLICT DO NOTHING (no upsert risk)
-- These are ADDITIVE — reconstructed needs marked superseded separately (PART 2 below)

BEGIN;

-- ─── PART 1: Mark reconstructed needs as superseded ──────────────────────────
-- Update existing "primary" journey needs to mark them as superseded.
-- Do NOT delete — preserves lineage.
UPDATE public.odi_needs
SET
  frameworks_used = array_append(frameworks_used, 'superseded_by_evidence_78e'),
  dependency_state = 'stale',
  stale_reason = 'Replaced by evidence-derived needs from Phase 78E active file analysis',
  updated_at = NOW()
WHERE company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc'
  AND journey_key = 'primary'
  AND source_path = 'reconstructed_from_prior_screenshots';

DO $$
DECLARE n INTEGER;
BEGIN
  SELECT COUNT(*) INTO n FROM public.odi_needs
  WHERE company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc'
    AND 'superseded_by_evidence_78e' = ANY(frameworks_used);
  RAISE NOTICE 'Marked % reconstructed needs as superseded', n;
END $$;

-- ─── PART 2: Insert evidence-derived ODI needs ────────────────────────────────
-- 10 needs anchored to the 8-step customer journey
-- Evidence sources cited in notes column

INSERT INTO public.odi_needs (
  company_id, user_id, journey_key, step_number, step_label,
  desired_outcome, importance, satisfaction, opportunity_score, service_state,
  source_path, frameworks_used, tier, notes,
  dependency_state, validation_state, evidence_state
) VALUES

-- Step 1: Define desired progress ─────────────────────────────────────────────
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  '5860c99a-e6f8-4feb-9997-992e3654f181',
  'customer', 1, 'Define desired progress',
  'Increase clarity on how a distinctively consistent roast profile would differentiate the cafe from alternatives that can only deliver good-enough coffee',
  8, 4, 32, 'under_served',
  'evidence_derived_78e',
  ARRAY['ODI', 'evidence_derived_78e'],
  'want',
  'Evidence: Alternatives analysis documents "good enough is a ceiling, not a floor." Strategic Framework identifies differentiation on coffee quality as the primary job. Files: comp-alt, target-aud.',
  'fresh', 'unvalidated', 'partial'
),

-- Step 2: Locate viable options ───────────────────────────────────────────────
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  '5860c99a-e6f8-4feb-9997-992e3654f181',
  'customer', 2, 'Locate viable options',
  'Minimize the time spent separating roasters who can deliver exceptional seasonal consistency from those who merely claim quality',
  8, 3, 40, 'under_served',
  'evidence_derived_78e',
  ARRAY['ODI', 'evidence_derived_78e'],
  'want',
  'Evidence: Alternatives analysis shows inconsistency is the defining weakness of local craft alternatives. Partner Selection Framework''s 8-category scorecard exists precisely because this evaluation is hard. Files: comp-alt, referral-map.',
  'fresh', 'unvalidated', 'partial'
),
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  '5860c99a-e6f8-4feb-9997-992e3654f181',
  'customer', 2, 'Locate viable options',
  'Reduce the risk of selecting a roaster whose quality profile degrades unpredictably when seasonal origins shift',
  9, 3, 54, 'under_served',
  'evidence_derived_78e',
  ARRAY['ODI', 'evidence_derived_78e'],
  'want',
  'Evidence: The Barra Process documents seasonal adaptation as intentional methodology. The alternatives analysis shows inconsistency across seasons as the key weakness of craft alternatives. Files: unique-attr, comp-alt.',
  'fresh', 'unvalidated', 'partial'
),

-- Step 3: Identify best fit ───────────────────────────────────────────────────
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  '5860c99a-e6f8-4feb-9997-992e3654f181',
  'customer', 3, 'Identify the best fit for their brand',
  'Increase confidence that a roaster''s sourcing and roasting methodology will remain aligned with the cafe''s quality standards across multiple seasonal origin transitions',
  9, 4, 45, 'under_served',
  'evidence_derived_78e',
  ARRAY['ODI', 'evidence_derived_78e'],
  'want',
  'Evidence: The Barra Process defines consistency as "consistent quality" not same flavor every season. This is a methodology alignment question, not just a product question. Files: unique-attr, referral-map.',
  'fresh', 'unvalidated', 'partial'
),
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  '5860c99a-e6f8-4feb-9997-992e3654f181',
  'customer', 3, 'Identify the best fit for their brand',
  'Reduce the effort required to determine whether a prospective roaster treats the relationship as transactional or as a committed quality partnership',
  7, 3, 28, 'under_served',
  'evidence_derived_78e',
  ARRAY['ODI', 'evidence_derived_78e'],
  'want',
  'Evidence: Partner Selection Framework includes "Partnership Orientation" as one of 8 criteria. Decline criteria include "treats suppliers as interchangeable vendors." Files: referral-map.',
  'fresh', 'unvalidated', 'partial'
),

-- Step 4: Confirm readiness ───────────────────────────────────────────────────
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  '5860c99a-e6f8-4feb-9997-992e3654f181',
  'customer', 4, 'Confirm readiness',
  'Minimize the uncertainty about how staff will need to adjust their workflow and dialing practices when adopting a new roaster''s coffee',
  7, 5, 14, 'appropriately_served',
  'evidence_derived_78e',
  ARRAY['ODI', 'evidence_derived_78e'],
  'want',
  'Evidence: Partner Selection Framework scores "Training Culture" as one of 8 criteria. Quality Standards criterion includes daily dial-in discipline. Files: referral-map.',
  'fresh', 'unvalidated', 'partial'
),

-- Step 5: Perform the core task ───────────────────────────────────────────────
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  '5860c99a-e6f8-4feb-9997-992e3654f181',
  'customer', 5, 'Perform the core task',
  'Reduce the quality variance in customer-facing drinks during the transition period when staff are learning a new roaster''s characteristics',
  9, 3, 54, 'under_served',
  'evidence_derived_78e',
  ARRAY['ODI', 'evidence_derived_78e'],
  'want',
  'Evidence: Partner Selection Framework quality standards criterion: "who is responsible for dialing in each day?" Transition quality risk is implicit in the 3-sample-roast evaluation process. Files: unique-attr, referral-map.',
  'fresh', 'unvalidated', 'partial'
),
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  '5860c99a-e6f8-4feb-9997-992e3654f181',
  'customer', 5, 'Perform the core task',
  'Minimize the number of coffee program decisions that require the cafe owner to be present rather than delegating to trained staff',
  7, 4, 21, 'under_served',
  'evidence_derived_78e',
  ARRAY['ODI', 'evidence_derived_78e'],
  'want',
  'Evidence: Partner Selection Framework scores "Operational Discipline" — documented recipes, maintenance routines, consistent standards. Strategic Framework job: "achieve consistent quality without owning the roasting infrastructure." Files: referral-map, target-aud.',
  'fresh', 'unvalidated', 'partial'
),

-- Step 6: Monitor results ─────────────────────────────────────────────────────
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  '5860c99a-e6f8-4feb-9997-992e3654f181',
  'customer', 6, 'Monitor results',
  'Increase visibility into whether the coffee program is contributing to repeat visit behavior rather than remaining ambient background satisfaction',
  8, 3, 40, 'under_served',
  'evidence_derived_78e',
  ARRAY['ODI', 'evidence_derived_78e'],
  'want',
  'Evidence: Alternatives analysis: "the distance between good and really good is where regulars come from." Strategic Framework positions exceptional coffee as the reason customers choose the cafe. Files: comp-alt, target-aud.',
  'fresh', 'unvalidated', 'partial'
),

-- Step 7: Adjust the approach ─────────────────────────────────────────────────
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  '5860c99a-e6f8-4feb-9997-992e3654f181',
  'customer', 7, 'Adjust the approach',
  'Minimize the disruption to customer-facing drink quality when the roaster transitions to a new season''s origin beans',
  9, 3, 54, 'under_served',
  'evidence_derived_78e',
  ARRAY['ODI', 'evidence_derived_78e'],
  'want',
  'Evidence: The Barra Process defines seasonal adaptation explicitly — buy for a season, test and adapt each batch. 5 roasting templates match different bean characteristics. This adjustment process needs to be invisible to cafe customers. Files: unique-attr.',
  'fresh', 'unvalidated', 'partial'
);

DO $$
DECLARE n INTEGER;
BEGIN
  SELECT COUNT(*) INTO n FROM public.odi_needs
  WHERE company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc'
    AND source_path = 'evidence_derived_78e';
  RAISE NOTICE 'Inserted % evidence-derived ODI needs', n;
END $$;

-- ─── PART 3: Summary report ───────────────────────────────────────────────────
DO $$
DECLARE
  n_derived   INTEGER;
  n_superseded INTEGER;
  n_active     INTEGER;
BEGIN
  SELECT COUNT(*) INTO n_derived FROM public.odi_needs
  WHERE company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc'
    AND source_path = 'evidence_derived_78e';

  SELECT COUNT(*) INTO n_superseded FROM public.odi_needs
  WHERE company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc'
    AND 'superseded_by_evidence_78e' = ANY(frameworks_used);

  SELECT COUNT(*) INTO n_active FROM public.odi_needs
  WHERE company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc'
    AND NOT ('superseded_by_evidence_78e' = ANY(frameworks_used));

  RAISE NOTICE '';
  RAISE NOTICE '=== Phase 78E ODI Needs Summary ===';
  RAISE NOTICE '  Evidence-derived needs inserted: %', n_derived;
  RAISE NOTICE '  Reconstructed needs superseded:  %', n_superseded;
  RAISE NOTICE '  Active (non-superseded) needs:   %', n_active;
END $$;

COMMIT;
