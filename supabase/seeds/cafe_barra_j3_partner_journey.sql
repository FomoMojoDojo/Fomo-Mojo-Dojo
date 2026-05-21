-- Cafe Barra — J3 Partner Journey Seed
--
-- Creates:
--   1. odi_market_definitions row with B2B job executor framing
--   2. 8 partner job_steps (journey_key = 'partner') representing the
--      cafe operator's job of sourcing a specialty coffee supplier
--
-- company_id: 58b2b15b-bada-4bcd-9c12-b7e66a37d0bc
-- user_id:    fd766480-d2ef-4794-a79a-b849a91df024
--
-- Idempotent: deletes and re-inserts partner-scoped rows only.
-- Does NOT touch customer/primary journey rows.
--
-- Usage:
--   docker cp supabase/seeds/cafe_barra_j3_partner_journey.sql \
--     supabase_db_dzlgyxcvuwiulgifbmew:/tmp/cb_j3.sql
--   docker exec supabase_db_dzlgyxcvuwiulgifbmew \
--     psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/cb_j3.sql

BEGIN;

-- ─── Market definition — B2B job executor ─────────────────────────────────
-- Clears any prior odi_market_definitions rows for this company, then inserts
-- the B2B framing needed for partner journey synthesis and context.
-- destructive-ok: targets fixed Cafe Barra UUID only; J3 recovery seed

DELETE FROM public.odi_market_definitions
  WHERE company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc';

INSERT INTO public.odi_market_definitions
  (company_id, user_id, job_executor, chooser, jtbd, source_path, frameworks_used)
VALUES (
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'Independent cafe operators sourcing a specialty coffee offering for their venue.',
  'The cafe owner or head buyer',
  'Identify and commit to a specialty coffee supplier relationship that makes the venue''s offering distinctive — evaluating roast quality, supplier reliability, and whether the partnership is actually driving the customer experience we want.',
  'manual_j3_recovery',
  ARRAY['ODI','JTBD','J3']
);

-- ─── Partner job_steps — 8 B2B-framed steps ───────────────────────────────
-- Represents the cafe operator's job of sourcing a specialty coffee supplier.
-- Uses JTBD ODI 8-checkpoint spine with B2B-specific articulation.
-- destructive-ok: targets partner journey_key for fixed Cafe Barra UUID only

DELETE FROM public.job_steps
  WHERE company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc'
    AND journey_key = 'partner';

INSERT INTO public.job_steps
  (company_id, user_id,
   journey_key, journey_title, journey_subtitle,
   step_number, step_label, description, designed,
   has_gap, evidence_status, evidence_basis, evidence_confidence, gap_note,
   frameworks_used)
VALUES

-- Step 1: Define (Determine what a standout coffee offering requires)
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'partner',
  'Cafe Operator Sourcing a Specialty Coffee Offering',
  'How independent cafe operators evaluate, commit to, and manage a specialty coffee supplier relationship',
  1,
  'Determine what a standout coffee offering requires',
  'Clarify what level of roast quality, origin story, and supplier consistency would make the venue''s coffee program a genuine differentiator — not just an adequate product.',
  true, false, 'implied',
  'B2B sourcing intent inferred from public baseline signals and cafe operator positioning context (J3 recovery)',
  50, '',
  ARRAY['ODI','JTBD','J3']
),

-- Step 2: Locate (Identify and shortlist specialty roasters that fit)
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'partner',
  'Cafe Operator Sourcing a Specialty Coffee Offering',
  'How independent cafe operators evaluate, commit to, and manage a specialty coffee supplier relationship',
  2,
  'Identify and shortlist specialty roasters that fit',
  'Find roasters and distributors that match on roast quality, origin sourcing, operational reliability, and willingness to support a smaller-volume independent operator.',
  true, true, 'implied',
  'Sourcing friction identified through public specialty coffee operator signals and trade show discovery patterns (J3 recovery)',
  40,
  'No structured process for discovering and comparing specialty roasters beyond word-of-mouth and trade show contacts',
  ARRAY['ODI','JTBD','J3']
),

-- Step 3: Prepare (Validate operational requirements before committing)
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'partner',
  'Cafe Operator Sourcing a Specialty Coffee Offering',
  'How independent cafe operators evaluate, commit to, and manage a specialty coffee supplier relationship',
  3,
  'Validate operational requirements before committing',
  'Confirm the venue''s equipment, storage, and volume capacity are compatible with the supplier''s minimums, delivery cadence, and handling requirements before locking in a relationship.',
  true, true, 'unclear',
  'Operational compatibility gaps inferred from general B2B sourcing patterns — not directly evidenced for Cafe Barra (J3 recovery)',
  35,
  'Operators often discover operational incompatibilities — minimum order volumes, storage constraints, equipment fit — only after committing to a supplier',
  ARRAY['ODI','JTBD','J3']
),

-- Step 4: Confirm (Confirm supplier terms are workable before committing)
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'partner',
  'Cafe Operator Sourcing a Specialty Coffee Offering',
  'How independent cafe operators evaluate, commit to, and manage a specialty coffee supplier relationship',
  4,
  'Confirm supplier terms are workable before committing',
  'Verify that pricing tiers, lead times, sample policies, and reorder flexibility are documented clearly enough to commit without hidden friction or surprise costs.',
  true, true, 'implied',
  'Pricing and terms opacity surfaced as a recurring B2B sourcing gap in specialty coffee operator research (J3 recovery)',
  40,
  'Pricing and lead time terms are frequently undocumented or verbal until after the first order is placed — increasing commitment risk',
  ARRAY['ODI','JTBD','J3']
),

-- Step 5: Execute (Onboard the supplier and integrate into the program)
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'partner',
  'Cafe Operator Sourcing a Specialty Coffee Offering',
  'How independent cafe operators evaluate, commit to, and manage a specialty coffee supplier relationship',
  5,
  'Onboard the supplier and integrate into the program',
  'Place the first order, complete any required training or briefings, and integrate the new product into the menu, service standards, and daily workflow.',
  true, false, 'unclear',
  'Onboarding step assumed present — no direct evidence of friction at this stage for Cafe Barra (J3 recovery)',
  35, '',
  ARRAY['ODI','JTBD','J3']
),

-- Step 6: Monitor (Track whether the offering is meeting quality expectations)
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'partner',
  'Cafe Operator Sourcing a Specialty Coffee Offering',
  'How independent cafe operators evaluate, commit to, and manage a specialty coffee supplier relationship',
  6,
  'Track whether the offering is meeting quality expectations',
  'Monitor roast consistency, customer response, and whether the supplier relationship is performing at the expected service level — and detect early signals of drift.',
  true, true, 'unclear',
  'No direct evidence of monitoring practices at Cafe Barra — gap inferred from general specialty coffee operator patterns (J3 recovery)',
  30,
  'No system to track supplier performance against quality or service-level expectations — no feedback loop between the offering and customer outcomes',
  ARRAY['ODI','JTBD','J3']
),

-- Step 7: Modify (Adjust the sourcing relationship when outcomes fall short)
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'partner',
  'Cafe Operator Sourcing a Specialty Coffee Offering',
  'How independent cafe operators evaluate, commit to, and manage a specialty coffee supplier relationship',
  7,
  'Adjust the sourcing relationship when outcomes fall short',
  'Renegotiate terms, switch products, or escalate concerns when the partnership is not delivering the quality, consistency, or differentiation the venue needs.',
  true, true, 'unclear',
  'Adjustment friction inferred from B2B sourcing patterns — operators absorb underperformance rather than escalate (J3 recovery)',
  30,
  'Operators often absorb supplier underperformance rather than renegotiate — lacking clear criteria for when to escalate or exit',
  ARRAY['ODI','JTBD','J3']
),

-- Step 8: Conclude (Evaluate the cycle and decide how to evolve the partnership)
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'partner',
  'Cafe Operator Sourcing a Specialty Coffee Offering',
  'How independent cafe operators evaluate, commit to, and manage a specialty coffee supplier relationship',
  8,
  'Evaluate the cycle and decide how to evolve the partnership',
  'Review whether the supplier relationship is working well enough to deepen, renegotiate, or replace — and carry forward what was learned about sourcing criteria and quality thresholds.',
  true, false, 'unclear',
  'Cycle review step assumed present — no direct evidence of formal supplier review practices at Cafe Barra (J3 recovery)',
  30, '',
  ARRAY['ODI','JTBD','J3']
);

COMMIT;
