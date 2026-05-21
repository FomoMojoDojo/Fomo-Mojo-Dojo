-- Cafe Barra — J3.1 Partner Job Customer Needs / Opportunities
--
-- Generates 16 odi_needs rows (2 per step × 8 partner job steps) for
-- journey_key = 'partner'. These represent what the cafe operator wants
-- at each step of their specialty coffee sourcing journey.
--
-- Framing notes:
--   - These are customer-side outcomes (what the café operator wants),
--     NOT company desired outcomes (what Cafe Barra wants to achieve).
--   - service_state values are PRE-SURVEY provisional estimates derived
--     from J3 gap analysis. Without importance/satisfaction survey data,
--     these are working hypotheses, not evidence-based classifications.
--   - strategy_alignment = 'aligned' across all rows because the partner
--     job is by definition the B2B target this cascade is built around.
--   - ODI phrasing: "Minimize [metric]" / "Increase/maximize [metric]"
--
-- company_id: 58b2b15b-bada-4bcd-9c12-b7e66a37d0bc
-- user_id:    fd766480-d2ef-4794-a79a-b849a91df024
--
-- Idempotent: clears and re-inserts partner journey needs only.
--
-- Usage:
--   docker cp supabase/seeds/cafe_barra_j3_partner_needs.sql \
--     supabase_db_dzlgyxcvuwiulgifbmew:/tmp/cb_j3_needs.sql
--   docker exec supabase_db_dzlgyxcvuwiulgifbmew \
--     psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/cb_j3_needs.sql

BEGIN;

-- destructive-ok: targets partner journey_key for fixed Cafe Barra UUID only
DELETE FROM public.odi_needs
  WHERE company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc'
    AND journey_key = 'partner';

INSERT INTO public.odi_needs
  (company_id, user_id, tier, desired_outcome,
   journey_key, step_number, step_label,
   importance, satisfaction, opportunity_score, service_state,
   strategy_alignment, strategy_alignment_reason,
   source_path, frameworks_used, notes, sort_order)
VALUES

-- ── Step 1: Determine what a standout coffee offering requires ─────────────
-- No gap flagged in J3 → provisional service_state: served
-- Importance moderate (clear goal, established B2B context)

(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'core',
  'Minimize the time it takes to define what level of roast quality and origin profile would make the venue''s coffee offering genuinely distinctive.',
  'partner', 1, 'Determine what a standout coffee offering requires',
  6, 6, 6, 'served',
  'aligned',
  'Directly supports the B2B cascade goal of becoming the most trusted specialty sourcing partner — clear criteria enable better supplier selection.',
  'manual_j3_recovery', ARRAY['ODI','JTBD','J3.1'],
  'Pre-survey provisional estimate. J3 gap analysis found no explicit friction at this step.', 1
),
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'core',
  'Increase confidence that the quality and distinctiveness criteria set at the outset reflect what cafe customers actually value — not just what the operator assumes.',
  'partner', 1, 'Determine what a standout coffee offering requires',
  7, 5, 9, 'served',
  'aligned',
  'Validates that operator success criteria align with customer outcomes — central to the B2B cascade''s differentiation thesis.',
  'manual_j3_recovery', ARRAY['ODI','JTBD','J3.1'],
  'Pre-survey provisional estimate. Slight evidence gap: operator assumptions may diverge from customer preferences without direct signal.', 2
),

-- ── Step 2: Identify and shortlist specialty roasters that fit ─────────────
-- Gap flagged in J3: no structured discovery process → provisional: underserved

(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'core',
  'Minimize the time it takes to identify specialty roasters who match on roast quality, origin profile, and willingness to support smaller-volume independent operators.',
  'partner', 2, 'Identify and shortlist specialty roasters that fit',
  8, 3, 13, 'underserved',
  'aligned',
  'Directly supports the B2B cascade''s "locate viable options" step — frictionless roaster discovery is a core differentiator for Cafe Barra''s operator partners.',
  'manual_j3_recovery', ARRAY['ODI','JTBD','J3.1'],
  'Pre-survey provisional estimate. J3 gap: no structured discovery process beyond word-of-mouth. Importance elevated because this step gates the entire sourcing cycle.', 3
),
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'core',
  'Increase confidence that the shortlisted roasters can consistently deliver at the quality level required for a differentiated offering — not just on sample batches.',
  'partner', 2, 'Identify and shortlist specialty roasters that fit',
  7, 4, 10, 'underserved',
  'aligned',
  'Consistency at scale is the proof gap in the B2B cascade — roasters who perform on samples but not on repeat supply undermine the differentiation thesis.',
  'manual_j3_recovery', ARRAY['ODI','JTBD','J3.1'],
  'Pre-survey provisional estimate. Consistent delivery gap is a well-documented pattern in specialty coffee B2B sourcing.', 4
),

-- ── Step 3: Validate operational requirements before committing ────────────
-- Gap flagged in J3: incompatibilities discovered post-commitment → provisional: underserved / served

(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'core',
  'Minimize the risk of discovering that the venue''s equipment, storage, or volume capacity is incompatible with the supplier''s requirements after committing to the relationship.',
  'partner', 3, 'Validate operational requirements before committing',
  8, 3, 13, 'underserved',
  'aligned',
  'Operational reliability is a key "how to win" capability in the B2B cascade — pre-commitment validation prevents churn and reputational damage.',
  'manual_j3_recovery', ARRAY['ODI','JTBD','J3.1'],
  'Pre-survey provisional estimate. J3 gap: incompatibilities typically discovered post-commitment. Elevated importance because failures here are costly to reverse.', 5
),
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'core',
  'Increase confidence that the supplier''s minimum order volumes and delivery cadence are workable within the venue''s current operational rhythm.',
  'partner', 3, 'Validate operational requirements before committing',
  6, 5, 7, 'served',
  'aligned',
  'Cadence alignment supports the operational reliability capability in the cascade — sustainable delivery rhythms reduce reorder friction.',
  'manual_j3_recovery', ARRAY['ODI','JTBD','J3.1'],
  'Pre-survey provisional estimate. Slightly less urgent than compatibility risk — operators can often adjust cadence if minimums are known upfront.', 6
),

-- ── Step 4: Confirm supplier terms are workable before committing ──────────
-- Gap flagged in J3: pricing/terms undocumented → provisional: underserved

(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'core',
  'Minimize the time it takes to get clear, documented pricing tiers and lead time commitments from a prospective specialty coffee supplier.',
  'partner', 4, 'Confirm supplier terms are workable before committing',
  8, 3, 13, 'underserved',
  'aligned',
  'Transparent terms documentation is a stated capability in the B2B cascade — "consistent, documented supply chain with transparent lead times and pricing."',
  'manual_j3_recovery', ARRAY['ODI','JTBD','J3.1'],
  'Pre-survey provisional estimate. J3 gap: pricing and lead time terms frequently undocumented or verbal until after first order. High importance — opacity blocks commitment.', 7
),
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'core',
  'Reduce the risk of pricing surprises or supply shortfalls after committing to a sourcing relationship — particularly on reorder cycles.',
  'partner', 4, 'Confirm supplier terms are workable before committing',
  7, 4, 10, 'underserved',
  'aligned',
  'Reorder predictability directly supports the "operational reliability" how-to-win capability — surprise costs or stockouts undermine the differentiation thesis.',
  'manual_j3_recovery', ARRAY['ODI','JTBD','J3.1'],
  'Pre-survey provisional estimate. Reorder surprise is a common post-commitment failure mode in specialty coffee B2B.', 8
),

-- ── Step 5: Onboard the supplier and integrate into the program ────────────
-- No gap flagged in J3 → provisional service_state: served

(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'core',
  'Minimize the time it takes to integrate a new specialty coffee supplier into daily operations, staff briefings, and service standards.',
  'partner', 5, 'Onboard the supplier and integrate into the program',
  6, 6, 6, 'served',
  'aligned',
  'Smooth onboarding reduces friction in the early relationship — supporting the B2B cascade''s goal of sustainable, low-friction supplier partnerships.',
  'manual_j3_recovery', ARRAY['ODI','JTBD','J3.1'],
  'Pre-survey provisional estimate. J3 found no explicit gap at onboarding — provisionally served pending direct evidence.', 9
),
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'core',
  'Increase confidence that staff understand the supplier''s product well enough to serve it consistently and speak about it credibly with customers.',
  'partner', 5, 'Onboard the supplier and integrate into the program',
  7, 5, 9, 'served',
  'aligned',
  'Staff product knowledge is part of the "roast profile development and iteration support" capability — the differentiation depends on the offering being communicated well.',
  'manual_j3_recovery', ARRAY['ODI','JTBD','J3.1'],
  'Pre-survey provisional estimate. Staff knowledge gap could undermine the customer-facing differentiation even if the coffee itself is excellent.', 10
),

-- ── Step 6: Track whether the offering is meeting quality expectations ──────
-- Gap flagged in J3: no supplier performance feedback loop → provisional: underserved

(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'core',
  'Minimize the time it takes to detect when the supplier''s roast quality or delivery consistency is falling below expectations — before it affects customer experience.',
  'partner', 6, 'Track whether the offering is meeting quality expectations',
  8, 3, 13, 'underserved',
  'aligned',
  'Early detection of supplier underperformance is essential to maintaining the differentiation thesis — the B2B cascade''s monitoring capability depends on this feedback loop.',
  'manual_j3_recovery', ARRAY['ODI','JTBD','J3.1'],
  'Pre-survey provisional estimate. J3 gap: no system to track supplier performance — no feedback loop between the offering and outcomes. High importance because drift goes undetected.', 11
),
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'core',
  'Increase confidence that customer satisfaction with the coffee offering is being tracked accurately enough to signal whether the sourcing relationship is delivering on its promise.',
  'partner', 6, 'Track whether the offering is meeting quality expectations',
  7, 4, 10, 'underserved',
  'aligned',
  'Customer satisfaction feedback closes the loop between the sourcing relationship and the end-customer outcome — the B2B cascade''s "track whether the offering is driving the customer experience" goal.',
  'manual_j3_recovery', ARRAY['ODI','JTBD','J3.1'],
  'Pre-survey provisional estimate. Without customer feedback, the operator cannot validate whether the sourcing investment is translating into differentiation.', 12
),

-- ── Step 7: Adjust the sourcing relationship when outcomes fall short ───────
-- Gap flagged in J3: operators absorb underperformance → provisional: underserved

(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'core',
  'Minimize the time it takes to renegotiate or escalate when a supplier is not delivering on quality or service-level commitments.',
  'partner', 7, 'Adjust the sourcing relationship when outcomes fall short',
  8, 3, 13, 'underserved',
  'aligned',
  'Responsive escalation is part of the "B2B relationship depth" capability — partners need to trust that gaps will be addressed, not absorbed.',
  'manual_j3_recovery', ARRAY['ODI','JTBD','J3.1'],
  'Pre-survey provisional estimate. J3 gap: operators absorb underperformance rather than escalate, lacking clear criteria for when to act. High importance because inaction compounds.', 13
),
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'core',
  'Reduce the risk that supplier underperformance goes unaddressed because the threshold for escalation or exit is not defined in advance.',
  'partner', 7, 'Adjust the sourcing relationship when outcomes fall short',
  7, 4, 10, 'underserved',
  'aligned',
  'Pre-defined performance thresholds make escalation actionable — supports the "operational reliability" cascade capability by ensuring accountability is clear before problems arise.',
  'manual_j3_recovery', ARRAY['ODI','JTBD','J3.1'],
  'Pre-survey provisional estimate. Without defined thresholds, operators default to inaction — a documented B2B sourcing pattern in specialty coffee.', 14
),

-- ── Step 8: Evaluate the cycle and decide how to evolve the partnership ─────
-- No gap flagged in J3 → provisional service_state: served

(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'core',
  'Minimize the time it takes to assess whether a specialty coffee supplier relationship is worth deepening, renegotiating, or replacing after a full sourcing cycle.',
  'partner', 8, 'Evaluate the cycle and decide how to evolve the partnership',
  6, 6, 6, 'served',
  'aligned',
  'Cycle evaluation enables continuous improvement of the sourcing relationship — aligns with the cascade''s "Conclude and learn" checkpoint and the goal of building durable operator partnerships.',
  'manual_j3_recovery', ARRAY['ODI','JTBD','J3.1'],
  'Pre-survey provisional estimate. J3 found no explicit gap at cycle evaluation — provisionally served pending direct evidence.', 15
),
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'core',
  'Increase confidence that the sourcing criteria established at the start of the relationship are still the right ones after a full cycle — and know what to update.',
  'partner', 8, 'Evaluate the cycle and decide how to evolve the partnership',
  6, 7, 6, 'served',
  'aligned',
  'Criteria refinement closes the learning loop between the sourcing outcome and the next cycle''s goal-setting — essential for the B2B cascade''s continuous improvement thesis.',
  'manual_j3_recovery', ARRAY['ODI','JTBD','J3.1'],
  'Pre-survey provisional estimate. Low urgency relative to earlier steps but important for partnership longevity.', 16
);

COMMIT;
