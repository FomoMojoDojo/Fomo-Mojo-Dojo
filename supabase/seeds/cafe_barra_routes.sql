-- Cafe Barra local dev seed — routes
-- company_id: 58b2b15b-bada-4bcd-9c12-b7e66a37d0bc
-- Run once against local Supabase.

DO $$
DECLARE
  co_id  uuid := '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc';
  usr_id uuid := 'fd766480-d2ef-4794-a79a-b849a91df024';
BEGIN

-- ── FIX ─────────────────────────────────────────────────────────────────────

INSERT INTO public.routes
  (id, company_id, user_id, category, title, short_description,
   pts_value, effort, type, sort_order, frameworks_used,
   why_this_matters_json, steps_json, evidence_json)
VALUES
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

-- ── IMPROVE ─────────────────────────────────────────────────────────────────

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

-- ── CREATE ───────────────────────────────────────────────────────────────────

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

END $$;
