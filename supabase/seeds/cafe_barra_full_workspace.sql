-- Cafe Barra — Full Workspace Restoration Seed
--
-- Restores company record, positioning, strategy, market definition, needs, and routes.
-- Run this seed after any db reset that wipes local data.
--
-- company_id: 58b2b15b-bada-4bcd-9c12-b7e66a37d0bc
-- user_id:    fd766480-d2ef-4794-a79a-b849a91df024
--
-- Usage:
--   supabase db query -f supabase/seeds/cafe_barra_full_workspace.sql

DO $$
DECLARE
  co_id  uuid := '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc';
  usr_id uuid := 'fd766480-d2ef-4794-a79a-b849a91df024';
  mkt_id uuid := gen_random_uuid();

BEGIN

-- ─── Company ──────────────────────────────────────────────────────────────────

INSERT INTO public.companies
  (id, created_by, name, archetype, tier, quarter,
   mojo_score, potential_score, projected_score,
   program_phase, evidence_status, evidence_note, website)
VALUES (
  co_id, usr_id,
  'Cafe Barra',
  'Operator',
  2,
  'Q2 2026',
  54,
  72,
  63,
  'focus',
  'mixed',
  'Core operational signals are present. Biggest gaps: no repeat-purchase measurement and informal supplier agreements creating reorder friction.',
  'https://cafebarra.com'
)
ON CONFLICT (id) DO NOTHING;

-- ─── Positioning ─────────────────────────────────────────────────────────────

INSERT INTO public.positioning_canvases
  (company_id, user_id, market_category, current_tagline, proposed_tagline,
   value_for_customer, best_fit_customers, category_rationale,
   competitive_alternatives_json, unique_attributes_json, frameworks_used)
VALUES (
  co_id, usr_id,
  'Neighborhood specialty coffee',
  'Your daily coffee, done right.',
  'Consistent quality. Every shift. Every order.',
  'Cafe Barra delivers a reliable, high-quality coffee experience for regulars — one where preparation quality, ingredient availability, and pricing are predictable enough that customers can build it into their routine without second-guessing.',
  'Morning commuters and nearby knowledge workers who value consistency over novelty. Local regulars who want to be recognized and not surprised. Small teams looking for a reliable off-site meeting spot.',
  'The market is divided between chain reliability (predictable but generic) and indie creativity (interesting but inconsistent). Cafe Barra competes by being independently operated with chain-level operational reliability.',
  '[
    {"alternative": "Chain coffee (Starbucks, Peet''s)", "why_chosen": "Consistent, ubiquitous, loyalty program", "our_edge": "Better preparation quality. Recognized as a regular. Not a commodity."},
    {"alternative": "Other indie cafes", "why_chosen": "Unique, local identity, creative menu", "our_edge": "More operationally reliable. Fewer stock-outs. Shorter variance in wait times across shifts."},
    {"alternative": "Office coffee / home brew", "why_chosen": "Cheapest, most convenient", "our_edge": "Social context, better equipment, no setup — worth the premium for the experience and the break from desk."}
  ]'::jsonb,
  '[
    {"attribute": "Shift consistency — same drink quality regardless of which staff is on"},
    {"attribute": "Supplier reliability — key ingredients rarely out of stock"},
    {"attribute": "Predictable pricing — menu prices stable, no surprise upsells"},
    {"attribute": "Regular recognition — staff knows returning customers by name and order"}
  ]'::jsonb,
  ARRAY['ODI', 'strategy_cascade']
)
ON CONFLICT DO NOTHING;

-- ─── Strategy Cascade ────────────────────────────────────────────────────────

INSERT INTO public.strategy_cascades
  (company_id, user_id, winning_aspiration, where_to_play, how_to_win,
   capabilities_json, management_systems_json, assumptions_json, frameworks_used)
VALUES (
  co_id, usr_id,
  'Be the most operationally reliable specialty coffee experience in our neighborhood — the place regulars choose because they know exactly what they''re getting.',
  'Morning and midday visits from a 0.5-mile radius. Knowledge workers aged 25–45 who have a routine and value predictability. Not tourists, not novelty seekers.',
  'Win by making preparation quality and ingredient availability predictable across all shifts and staff. Reduce operational friction (reorder, prep standards, pricing clarity) so that the customer experience is consistent whether or not the owner is in the building.',
  '[
    {"capability": "Shift preparation standards — documented, trained, and verifiable"},
    {"capability": "Supplier agreements with defined lead times and reorder triggers"},
    {"capability": "POS-linked inventory management for top SKUs"},
    {"capability": "Staff training on customer recognition and routine memory"}
  ]'::jsonb,
  '[
    {"system": "Prep checklist per station, reviewed weekly"},
    {"system": "Supplier contract review cycle (quarterly)"},
    {"system": "Monthly margin review against pricing model"}
  ]'::jsonb,
  '[
    {"assumption": "Regulars will pay a modest premium for consistency over alternatives"},
    {"assumption": "Operational investment in standards will reduce rework and complaints more than they cost"},
    {"assumption": "Staff retention improves with documented standards (less judgment pressure on each shift)"}
  ]'::jsonb,
  ARRAY['ODI', 'strategy_cascade', 'public_baseline']
)
ON CONFLICT DO NOTHING;

-- ─── Idempotency guards — clear mutable rows before re-inserting ─────────────
-- destructive-ok: targets fixed Cafe Barra UUID (co_id) only; idempotent seed; does not touch other companies
DELETE FROM public.job_steps          WHERE company_id = co_id;
-- destructive-ok: targets fixed Cafe Barra UUID (co_id) only; idempotent seed; does not touch other companies
DELETE FROM public.routes             WHERE company_id = co_id;
-- destructive-ok: targets fixed Cafe Barra UUID (co_id) only; idempotent seed; does not touch other companies
DELETE FROM public.odi_needs          WHERE company_id = co_id;
-- destructive-ok: targets fixed Cafe Barra UUID (co_id) only; idempotent seed; does not touch other companies
DELETE FROM public.odi_market_definitions WHERE company_id = co_id;

-- ─── ODI Market Definition ───────────────────────────────────────────────────

INSERT INTO public.odi_market_definitions
  (id, company_id, user_id, job_executor, chooser, jtbd,
   source_path, frameworks_used)
VALUES (
  mkt_id, co_id, usr_id,
  'Regular coffee buyer — commuter or nearby knowledge worker',
  'The same person (self-directed purchase)',
  'Get reliable, high-quality coffee quickly as part of my daily routine — without having to think about it or adjust my expectations each visit.',
  'Customer interviews (5), observation (morning shifts x3)',
  ARRAY['ODI', 'JTBD']
)
ON CONFLICT DO NOTHING;

-- ─── ODI Needs ───────────────────────────────────────────────────────────────

INSERT INTO public.odi_needs
  (company_id, user_id, tier, desired_outcome, journey_key, step_number, step_label,
   importance, satisfaction, opportunity_score, service_state,
   source_path, frameworks_used, sort_order)
VALUES

-- Under-served, high priority
(co_id, usr_id, 'functional',
 'Minimize the chance that my usual drink is unavailable due to a stock-out',
 'core_experience', 1, 'Arrival and ordering',
 8, 3, 40, 'under_served',
 'Customer interviews + stock-out incident log',
 ARRAY['ODI'], 1),

-- Under-served, highest priority
(co_id, usr_id, 'functional',
 'Know that preparation quality is consistent regardless of which staff member is working',
 'core_experience', 2, 'Drink preparation',
 9, 4, 45, 'under_served',
 'Customer interviews + complaint log review',
 ARRAY['ODI'], 2),

-- Under-served, moderate priority
(co_id, usr_id, 'functional',
 'Feel confident that pricing reflects the value delivered without unexpected changes',
 'core_experience', 3, 'Payment and value assessment',
 6, 4, 12, 'under_served',
 'Customer interviews',
 ARRAY['ODI'], 3),

-- Appropriately served
(co_id, usr_id, 'emotional',
 'Feel recognized as a regular without having to re-explain my usual order',
 'loyalty_loop', 1, 'Recognition and routine',
 7, 6, 7, 'appropriately_served',
 'Customer interviews',
 ARRAY['ODI'], 4),

-- Under-served, high priority
(co_id, usr_id, 'functional',
 'Get my order within an expected time window even during peak morning hours',
 'core_experience', 1, 'Wait and fulfillment',
 9, 5, 36, 'under_served',
 'Observation (peak shifts) + customer interviews',
 ARRAY['ODI'], 5),

-- Appropriately served
(co_id, usr_id, 'functional',
 'Understand what is on the menu and what is seasonal without having to ask each visit',
 'core_experience', 1, 'Menu orientation',
 5, 6, -5, 'appropriately_served',
 'Customer interviews',
 ARRAY['ODI'], 6)

ON CONFLICT DO NOTHING;

-- ─── Routes ──────────────────────────────────────────────────────────────────

INSERT INTO public.routes
  (id, company_id, user_id, category, title, short_description,
   pts_value, effort, type, sort_order, frameworks_used,
   why_this_matters_json, steps_json, evidence_json)
VALUES

-- FIX 1: Reorder friction / supplier terms
(
  gen_random_uuid(), co_id, usr_id,
  'fix', 'Clarify supplier terms — if ambiguity is what''s creating reorder friction',
  'Supplier terms on lead times and pricing tiers aren''t consistently documented and may be contributing to friction in the reorder process.',
  7, 'low', 'Fix', 1,
  ARRAY['ODI', 'strategy_cascade'],
  '["Unclear terms may be contributing to stock-outs and margin surprises on the highest-volume SKUs.",
    "Formalizing lead-time windows could reduce ad-hoc renegotiation and the time it consumes."]'::jsonb,
  '[{"id":"s1","title":"Audit current supplier contracts for ambiguous clauses","status":"complete"},
    {"id":"s2","title":"Draft standardized lead-time and pricing addendum","status":"in_progress"},
    {"id":"s3","title":"Review with supplier and sign updated terms","status":"missing"}]'::jsonb,
  '[{"id":"e1","title":"Supplier communication logs (6 months)","status":"complete"},
    {"id":"e2","title":"Stock-out incident report","status":"in_progress"},
    {"id":"e3","title":"Signed updated agreement","status":"missing"}]'::jsonb
),

-- FIX 2: Margin tradeoffs / pricing model
(
  gen_random_uuid(), co_id, usr_id,
  'fix', 'Define a margin model — if ad-hoc pricing is what''s eroding profitability',
  'Menu pricing evolved ad-hoc. No documented model links cost, volume, and target margin.',
  8, 'medium', 'Fix', 2,
  ARRAY['ODI', 'public_baseline'],
  '["Without a margin model, price changes may be reactive and could offset gains from volume growth.",
    "Defining floor margins per category could create a consistent decision rule for pricing new items."]'::jsonb,
  '[{"id":"s1","title":"Pull COGS data for top 20 SKUs","status":"complete"},
    {"id":"s2","title":"Model target margin by category","status":"in_progress"},
    {"id":"s3","title":"Publish pricing floor guide for staff","status":"missing"},
    {"id":"s4","title":"Validate against last 3 months of actuals","status":"missing"}]'::jsonb,
  '[{"id":"e1","title":"POS sales export","status":"complete"},
    {"id":"e2","title":"Cost invoice records","status":"complete"},
    {"id":"e3","title":"Competitor menu pricing sample","status":"in_progress"},
    {"id":"e4","title":"Documented pricing model","status":"missing"}]'::jsonb
),

-- IMPROVE 1: Prep quality / staff-system consistency
(
  gen_random_uuid(), co_id, usr_id,
  'improve', 'Build prep standards — if inconsistency is what''s driving quality gaps',
  'Opening and closing routines vary by shift. This inconsistency may be contributing to quality gaps and rework.',
  6, 'low', 'Improve', 3,
  ARRAY['ODI', 'jtbd'],
  '["Standardized prep could reduce customer-facing failures that may stem from rushed or skipped steps.",
    "Written standards might also help onboard new staff faster and reduce reliance on managers for routine checks."]'::jsonb,
  '[{"id":"s1","title":"Shadow top-performing shifts to document current best practice","status":"complete"},
    {"id":"s2","title":"Draft written prep checklist per station","status":"in_progress"},
    {"id":"s3","title":"Pilot with two shifts and collect feedback","status":"missing"},
    {"id":"s4","title":"Roll out and post at each station","status":"missing"}]'::jsonb,
  '[{"id":"e1","title":"Customer complaint log (last quarter)","status":"complete"},
    {"id":"e2","title":"Staff satisfaction survey","status":"in_progress"},
    {"id":"e3","title":"Finalized written standards","status":"missing"}]'::jsonb
),

-- IMPROVE 2: Stock-out risk / POS-linked ordering
(
  gen_random_uuid(), co_id, usr_id,
  'improve', 'Connect ordering to POS — if manual counts are what''s causing stock-out lag',
  'Ordering decisions rely on manual counts. No live link between sales velocity and reorder triggers.',
  7, 'medium', 'Improve', 4,
  ARRAY['strategy_cascade', 'jtbd'],
  '["Manual counts may introduce lag — stock-outs could be surfacing hours after the actual tipping point.",
    "A POS-linked par level model could make ordering more consistent and less dependent on daily judgment calls."]'::jsonb,
  '[{"id":"s1","title":"Audit POS system for inventory module availability","status":"complete"},
    {"id":"s2","title":"Map top 15 SKUs to reorder points","status":"in_progress"},
    {"id":"s3","title":"Configure par level alerts in POS","status":"missing"},
    {"id":"s4","title":"Run 30-day trial and validate against actuals","status":"missing"}]'::jsonb,
  '[{"id":"e1","title":"POS feature documentation","status":"complete"},
    {"id":"e2","title":"Historical stock-out events (6 months)","status":"in_progress"},
    {"id":"e3","title":"Par level configuration live","status":"missing"}]'::jsonb
),

-- CREATE: Repeat purchase tracking / operational proof
(
  gen_random_uuid(), co_id, usr_id,
  'create', 'Build a return-rate tracker — if the lack of measurement is masking retention problems',
  'No system exists to track whether customers return or how purchase frequency changes over time.',
  9, 'high', 'Create', 5,
  ARRAY['ODI', 'public_baseline', 'jtbd'],
  '["Repeat purchase rate may be one of the clearest signals of whether the core experience is working.",
    "Without measurement, it''s hard to tell whether retention is improving — or declining.",
    "A lightweight tracking loop could give you the feedback signal to check whether other routes are actually working."]'::jsonb,
  '[{"id":"s1","title":"Define repeat-purchase metric (visits/month per customer)","status":"missing"},
    {"id":"s2","title":"Identify data source: loyalty app, card transaction hash, or manual log","status":"missing"},
    {"id":"s3","title":"Set baseline from 90-day sample","status":"missing"},
    {"id":"s4","title":"Review metric monthly and link to route outcomes","status":"missing"}]'::jsonb,
  '[{"id":"e1","title":"Customer frequency benchmark (industry)","status":"in_progress"},
    {"id":"e2","title":"Loyalty or transaction data source confirmed","status":"missing"},
    {"id":"e3","title":"First baseline measurement recorded","status":"missing"}]'::jsonb
);

-- ─── Job Steps ───────────────────────────────────────────────────────────────
-- INTENTIONALLY EMPTY — job_steps are generated by the local-jobmap-synthesis
-- edge function (Ollama AI) and were never committed to any seed file.
-- The original Cafe Barra job map (job executor: "Cafe owners", AI-generated
-- step labels) is unrecoverable from git.
-- To rebuild: use "Regenerate ODI Job Map" in the workshop panel.

-- REMOVED: fabricated "Customer Daily Routine" and "Shift Quality Delivery"
-- job_steps inserted during Phase 77A (wrong job executor, wrong framing).
-- These rows have been deleted from the local DB.

-- placeholder INSERT to suppress empty-section warnings
-- (no rows — DO block skips the jump label)

-- END Job Steps

END $$;
