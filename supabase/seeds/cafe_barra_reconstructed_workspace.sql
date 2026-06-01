-- Cafe Barra — Reconstructed Workspace (Phase 77-D)
--
-- SOURCE: Reconstructed from known prior state (screenshots, conversation record).
--         This is NOT original database data — it is a faithful reconstruction.
--         Internal marker: source = reconstructed_from_prior_screenshots
--
-- company_id: 58b2b15b-bada-4bcd-9c12-b7e66a37d0bc
-- user_id:    fd766480-d2ef-4794-a79a-b849a91df024
--
-- Safe to re-run (idempotent). Does NOT touch FMD or Generic Audit companies.
-- Written as plain SQL (no DO block) to avoid PL/pgSQL string-parsing quirks.
--
-- Usage:
--   docker cp supabase/seeds/cafe_barra_reconstructed_workspace.sql \
--     supabase_db_dzlgyxcvuwiulgifbmew:/tmp/cb_reconstruct.sql
--   docker exec supabase_db_dzlgyxcvuwiulgifbmew \
--     psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/cb_reconstruct.sql

BEGIN;

-- ─── Clear prior fabricated/wrong Cafe Barra rows ─────────────────────────
-- destructive-ok: targets fixed Cafe Barra UUID only; idempotent reconstruction seed; does not touch other companies

DELETE FROM public.odi_market_definitions
  WHERE company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc';

-- destructive-ok: targets fixed Cafe Barra UUID only; idempotent reconstruction seed; does not touch other companies
DELETE FROM public.odi_needs
  WHERE company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc';

-- destructive-ok: targets fixed Cafe Barra UUID only; idempotent reconstruction seed; does not touch other companies
DELETE FROM public.job_steps
  WHERE company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc';

-- destructive-ok: targets fixed Cafe Barra UUID only; idempotent reconstruction seed; does not touch other companies
DELETE FROM public.routes
  WHERE company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc';

-- ─── Positioning canvas — B2B specialty coffee roaster framing ────────────
-- Prior known: target is cafe owners and venue operators.
-- best_fit_customers from test fixture: "Cafe owners and venue operators"
-- destructive-ok: updates Cafe Barra canvas only (WHERE company_id = fixed UUID); reconstruction seed
UPDATE public.positioning_canvases SET
  value_for_customer = 'We help independent cafe owners build a distinctive specialty coffee offering — one where roast profile, supplier relationships, and product quality are strong enough to become the reason customers choose them.',
  best_fit_customers = 'Cafe owners and venue operators who want their coffee to be a differentiator, not a commodity. Typically 1-5 location independents with a clear vision for the customer experience they want to create.',
  market_category = 'Specialty coffee roasting and B2B sourcing',
  category_rationale = 'The market divides between commodity wholesale (lower cost, lower differentiation) and premium single-origin roasters (high quality, inconsistent supply and support). We compete by combining specialty roast quality with the operational reliability and relationship depth that independent operators actually need.',
  current_tagline = 'Specialty coffee that sets your establishment apart.',
  proposed_tagline = 'The roast partner for cafes that take quality seriously.',
  competitive_alternatives_json = '[{"name":"Commodity wholesale distributors","reason":"Lower cost but no roast development support or differentiation"},{"name":"Premium direct-trade single-origin roasters","reason":"High quality but inconsistent supply and limited operator support"},{"name":"In-house roasting","reason":"Maximum control but requires capital, expertise, and time the owner may not have"}]'::jsonb,
  frameworks_used = ARRAY['ODI','strategy_cascade','public_baseline','reconstructed_prior']
WHERE company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc';

-- ─── Strategy cascade — B2B specialty coffee framing ─────────────────────
-- destructive-ok: updates Cafe Barra strategy only (WHERE company_id = fixed UUID); reconstruction seed
UPDATE public.strategy_cascades SET
  winning_aspiration = 'Be the most trusted specialty coffee sourcing and roast development partner for independent cafe operators who want to build a distinctive offering.',
  where_to_play = 'Independent cafes and hospitality venues with 1-5 locations who want to differentiate on coffee quality. Not commodity buyers or chains. Operators who compete on customer experience and want coffee to be a meaningful part of it.',
  how_to_win = 'Win by combining superior roast profile development support with operational reliability — making it easier for cafe owners to build a distinctive offering they can actually sustain. Supplier switching must remain easy enough that proof gaps change behavior. Current proof is mostly public signals — confidence should stay provisional until direct customer evidence accumulates.',
  capabilities_json = '["Roast profile development and iteration support for operator partners","Consistent, documented supply chain with transparent lead times and pricing","Operational reliability — cafe owners can count on stock availability without manual oversight","B2B relationship depth — working directly with owners, not through distributors"]'::jsonb,
  assumptions_json = '[{"assumption":"Cafe owners who prioritize quality will pay a premium for reliable specialty sourcing","confidence":"medium"},{"assumption":"Supplier switching remains easy enough that proof gaps change purchasing behavior","confidence":"medium"},{"assumption":"Operational reliability is a stronger differentiator than raw coffee quality alone","confidence":"low — needs direct customer evidence"},{"assumption":"Buyers choose primarily on craft quality and operational outcomes, not price or convenience","confidence":"low — uncertainty not yet resolved"}]'::jsonb,
  frameworks_used = ARRAY['ODI','strategy_cascade','reconstructed_prior']
WHERE company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc';

-- ─── Market definition — known prior job executor ─────────────────────────

INSERT INTO public.odi_market_definitions
  (company_id, user_id, job_executor, chooser, jtbd, source_path, frameworks_used)
VALUES (
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'Cafe owners trying to create a unique, high-quality coffee offering that sets their establishment apart.',
  'The cafe owner or head buyer',
  'Source and develop a specialty coffee offering that sets our establishment apart — selecting the right suppliers, building distinctive roast profiles, and tracking whether the offering is actually driving the customer experience we want.',
  'reconstructed_from_prior_screenshots',
  ARRAY['ODI','JTBD','reconstructed_prior']
);

-- ─── Job map — 6 known prior steps ────────────────────────────────────────
-- Known step labels from prior screenshots:
--   Define desired progress / Locate viable options / Evaluate current offerings /
--   Select suppliers / Develop roast recipes / Monitor sales performance
-- journey_key: "primary" (not "internal"/"operations" — renders as primary journey)

INSERT INTO public.job_steps
  (company_id, user_id,
   journey_key, journey_title, journey_subtitle,
   step_number, step_label, description, designed,
   has_gap, evidence_status, evidence_basis, evidence_confidence, gap_note,
   frameworks_used)
VALUES
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'primary', 'Creating a specialty coffee offering',
  'Cafe owners building a distinctive, high-quality coffee identity for their establishment',
  1, 'Define desired progress',
  'Clarify what success looks like for the specialty coffee offering — what roast profile, origin story, and customer response would signal we have the right product.',
  true, false, 'implied', 'Owner conversations and early product brief (reconstructed)', 60, '',
  ARRAY['ODI','JTBD','reconstructed_prior']
),
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'primary', 'Creating a specialty coffee offering',
  'Cafe owners building a distinctive, high-quality coffee identity for their establishment',
  2, 'Locate viable options',
  'Identify suppliers and roasters who can deliver the quality, origin profile, and operational reliability needed for a differentiated offering.',
  true, false, 'implied', 'Supplier outreach log and trade show contacts (reconstructed)', 50, '',
  ARRAY['ODI','reconstructed_prior']
),
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'primary', 'Creating a specialty coffee offering',
  'Cafe owners building a distinctive, high-quality coffee identity for their establishment',
  3, 'Evaluate current offerings',
  'Assess how current coffee offerings compare against what competitors and top-tier roasters are doing — identify gaps in quality, differentiation, and proof.',
  true, true, 'implied', 'Competitor menu analysis and public specialty coffee benchmarks', 45,
  'No systematic process for evaluating current offerings against specialty coffee market benchmarks',
  ARRAY['ODI','public_baseline','reconstructed_prior']
),
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'primary', 'Creating a specialty coffee offering',
  'Cafe owners building a distinctive, high-quality coffee identity for their establishment',
  4, 'Select suppliers',
  'Commit to sourcing relationships that deliver the right combination of quality, operational reliability, and pricing — with terms clear enough to reduce reorder friction.',
  true, true, 'implied', 'Supplier negotiations and ordering log (reconstructed)', 40,
  'Supplier terms on lead times and pricing tiers are not consistently documented — creating friction in the reorder and decision cycle',
  ARRAY['ODI','reconstructed_prior']
),
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'primary', 'Creating a specialty coffee offering',
  'Cafe owners building a distinctive, high-quality coffee identity for their establishment',
  5, 'Develop roast recipes',
  'Build distinctive roast profiles that differentiate the coffee experience — iterating until the taste, consistency, and story all align with the establishment identity.',
  true, false, 'unclear', '', 30, '',
  ARRAY['ODI','reconstructed_prior']
),
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'primary', 'Creating a specialty coffee offering',
  'Cafe owners building a distinctive, high-quality coffee identity for their establishment',
  6, 'Monitor sales performance',
  'Track whether the specialty coffee offering is driving the results expected — customer response, repeat purchasing, and margin — and adjust when signals drift.',
  true, true, 'unclear', '', 25,
  'No system to track whether the specialty offering is changing repeat purchase behavior or customer perception — no feedback loop between product and outcome',
  ARRAY['ODI','reconstructed_prior']
);

-- ─── ODI needs — 8 known prior needs ──────────────────────────────────────
-- All 8 needs relate to "Identify main competitors in specialty coffee"
-- (a market analysis task within step 3: Evaluate current offerings).
-- Known prior from run-mojo-analysis edge function output.
-- Scores estimated from prior screenshot context.

INSERT INTO public.odi_needs
  (company_id, user_id, tier, desired_outcome,
   journey_key, step_number, step_label,
   importance, satisfaction, opportunity_score, service_state,
   source_path, frameworks_used, notes, sort_order)
VALUES
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'core',
  'Minimize the time to adjust when Identify main competitors in specialty coffee is not producing expected results.',
  'primary', 3, 'Evaluate current offerings',
  7, 3, 28, 'under_served',
  'reconstructed_from_prior_screenshots', ARRAY['ODI','reconstructed_prior'],
  'Reconstructed 2026-05-13. Original generated by run-mojo-analysis.', 1
),
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'core',
  'Increase confidence that teams define success for Identify main competitors in specialty coffee the same way.',
  'primary', 3, 'Evaluate current offerings',
  7, 4, 21, 'under_served',
  'reconstructed_from_prior_screenshots', ARRAY['ODI','reconstructed_prior'],
  'Reconstructed 2026-05-13. Original generated by run-mojo-analysis.', 2
),
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'core',
  'Increase confidence that the chosen path for Identify main competitors in specialty coffee fits the real customer need.',
  'primary', 3, 'Evaluate current offerings',
  8, 4, 32, 'under_served',
  'reconstructed_from_prior_screenshots', ARRAY['ODI','reconstructed_prior'],
  'Reconstructed 2026-05-13. Original generated by run-mojo-analysis.', 3
),
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'supporting',
  'Increase clarity on what to repeat next cycle for Identify main competitors in specialty coffee.',
  'primary', 3, 'Evaluate current offerings',
  6, 4, 12, 'under_served',
  'reconstructed_from_prior_screenshots', ARRAY['ODI','reconstructed_prior'],
  'Reconstructed 2026-05-13. Original generated by run-mojo-analysis.', 4
),
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'core',
  'Minimize delays caused by missing ownership or data before work on Identify main competitors in specialty coffee starts.',
  'primary', 3, 'Evaluate current offerings',
  7, 3, 28, 'under_served',
  'reconstructed_from_prior_screenshots', ARRAY['ODI','reconstructed_prior'],
  'Reconstructed 2026-05-13. Original generated by run-mojo-analysis.', 5
),
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'core',
  'Reduce the risk of committing to a weak approach for Identify main competitors in specialty coffee.',
  'primary', 3, 'Evaluate current offerings',
  8, 3, 40, 'under_served',
  'reconstructed_from_prior_screenshots', ARRAY['ODI','reconstructed_prior'],
  'Reconstructed 2026-05-13. Original generated by run-mojo-analysis.', 6
),
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'core',
  'Increase visibility into live progress signals for Identify main competitors in specialty coffee.',
  'primary', 3, 'Evaluate current offerings',
  8, 3, 40, 'under_served',
  'reconstructed_from_prior_screenshots', ARRAY['ODI','reconstructed_prior'],
  'Reconstructed 2026-05-13. Original generated by run-mojo-analysis.', 7
),
(
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'core',
  'Minimize the time it takes to detect when Identify main competitors in specialty coffee is drifting off track.',
  'primary', 3, 'Evaluate current offerings',
  7, 3, 28, 'under_served',
  'reconstructed_from_prior_screenshots', ARRAY['ODI','reconstructed_prior'],
  'Reconstructed 2026-05-13. Original generated by run-mojo-analysis.', 8
);

-- ─── Routes — 5 known prior routes ────────────────────────────────────────
-- Known prior route titles from Phase 77-D spec and prior screenshots.

-- FIX: Reduce reorder friction caused by unclear supplier terms
INSERT INTO public.routes
  (id, company_id, user_id, category, title, short_description,
   pts_value, effort, type, sort_order, frameworks_used,
   why_this_matters_json, steps_json, evidence_json)
VALUES (
  gen_random_uuid(),
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'fix',
  'Reduce reorder friction caused by unclear supplier terms',
  'Supplier terms on lead times and pricing tiers are not consistently documented, creating friction in the reorder cycle and contributing to stock-out risk.',
  7, 'low', 'Fix', 1,
  ARRAY['ODI','strategy_cascade','reconstructed_prior'],
  '["Unclear terms may be creating avoidable stock-out risk on high-volume SKUs.",
    "Formalizing lead-time windows and pricing tier thresholds could reduce ad-hoc renegotiation.",
    "Directly addresses the gap in step 4 (Select suppliers) of the specialty coffee sourcing job."]'::jsonb,
  '[{"id":"s1","title":"Audit current supplier contracts for ambiguous clauses","status":"complete"},
    {"id":"s2","title":"Draft standardized lead-time and pricing addendum","status":"in_progress"},
    {"id":"s3","title":"Review addendum with supplier and sign updated terms","status":"missing"}]'::jsonb,
  '[{"id":"e1","title":"Supplier communication logs (6 months)","status":"complete"},
    {"id":"e2","title":"Stock-out incident log cross-referenced with reorder timing","status":"in_progress"},
    {"id":"e3","title":"Signed updated supplier agreement","status":"missing"}]'::jsonb
);

-- FIX: Make margin tradeoffs visible before pricing changes
INSERT INTO public.routes
  (id, company_id, user_id, category, title, short_description,
   pts_value, effort, type, sort_order, frameworks_used,
   why_this_matters_json, steps_json, evidence_json)
VALUES (
  gen_random_uuid(),
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'fix',
  'Make margin tradeoffs visible before pricing changes',
  'Menu pricing evolved ad-hoc with no documented model linking cost, volume, and target margin. Tradeoffs are invisible until they show up as profitability surprises.',
  8, 'medium', 'Fix', 2,
  ARRAY['ODI','public_baseline','reconstructed_prior'],
  '["Without a margin model, pricing decisions are reactive and may offset gains from volume or quality improvement.",
    "Defining floor margins per product category creates a consistent decision rule before any pricing change.",
    "Margin visibility is a precondition for credible pricing conversations with cafe owner partners."]'::jsonb,
  '[{"id":"s1","title":"Pull COGS data for top 20 SKUs from invoices and POS","status":"complete"},
    {"id":"s2","title":"Build target margin model by product category","status":"in_progress"},
    {"id":"s3","title":"Publish pricing floor guide for internal use","status":"missing"},
    {"id":"s4","title":"Validate model against last 3 months of actuals","status":"missing"}]'::jsonb,
  '[{"id":"e1","title":"POS sales export (last 6 months)","status":"complete"},
    {"id":"e2","title":"Cost invoice records","status":"complete"},
    {"id":"e3","title":"Competitor menu pricing sample for specialty segment","status":"in_progress"},
    {"id":"e4","title":"Documented, signed-off pricing model","status":"missing"}]'::jsonb
);

-- IMPROVE: Shift preparation quality from manager-dependent to system-supported
INSERT INTO public.routes
  (id, company_id, user_id, category, title, short_description,
   pts_value, effort, type, sort_order, frameworks_used,
   why_this_matters_json, steps_json, evidence_json)
VALUES (
  gen_random_uuid(),
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'improve',
  'Shift preparation quality from manager-dependent to system-supported',
  'Preparation quality consistency currently depends on manager presence and informal training. Building system-level support removes the single point of failure.',
  6, 'low', 'Improve', 3,
  ARRAY['ODI','JTBD','reconstructed_prior'],
  '["Standardized prep removes the manager-as-single-point-of-failure dependency — quality holds when the owner is not in the building.",
    "Written systems scale onboarding and reduce quality variance across staff and shifts.",
    "Directly addresses the operational reliability gap that weakens partner confidence in our offering."]'::jsonb,
  '[{"id":"s1","title":"Shadow top-performing shifts to document current best practice","status":"complete"},
    {"id":"s2","title":"Draft written prep checklist per station","status":"in_progress"},
    {"id":"s3","title":"Pilot checklist with two shifts and collect staff feedback","status":"missing"},
    {"id":"s4","title":"Roll out finalized standards and post at each station","status":"missing"}]'::jsonb,
  '[{"id":"e1","title":"Customer complaint log (last quarter, quality-related)","status":"complete"},
    {"id":"e2","title":"Staff satisfaction and consistency self-assessment","status":"in_progress"},
    {"id":"e3","title":"Finalized written prep standards document","status":"missing"}]'::jsonb
);

-- IMPROVE: Reduce stock-out risk before manual counts fail
INSERT INTO public.routes
  (id, company_id, user_id, category, title, short_description,
   pts_value, effort, type, sort_order, frameworks_used,
   why_this_matters_json, steps_json, evidence_json)
VALUES (
  gen_random_uuid(),
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'improve',
  'Reduce stock-out risk before manual counts fail',
  'Ordering decisions rely on manual counts with no connection to sales velocity. Stock-outs may be detected only after they occur — leaving cafe partners without supply.',
  7, 'medium', 'Improve', 4,
  ARRAY['strategy_cascade','JTBD','reconstructed_prior'],
  '["Manual counts introduce lag — stock-outs likely surface hours after the actual tipping point, affecting partner orders.",
    "A POS-linked par level model makes ordering consistent and less dependent on daily individual judgment.",
    "Reducing supply disruption risk is foundational to the operational reliability positioning we are claiming."]'::jsonb,
  '[{"id":"s1","title":"Audit POS system for inventory module or API availability","status":"complete"},
    {"id":"s2","title":"Map top 15 SKUs to par levels and reorder points","status":"in_progress"},
    {"id":"s3","title":"Configure par level alerts in POS or inventory tool","status":"missing"},
    {"id":"s4","title":"Run 30-day trial and validate alert timing against actuals","status":"missing"}]'::jsonb,
  '[{"id":"e1","title":"POS system feature documentation","status":"complete"},
    {"id":"e2","title":"Historical stock-out events (6 months) with root cause notes","status":"in_progress"},
    {"id":"e3","title":"Par level configuration live and validated","status":"missing"}]'::jsonb
);

-- CREATE: Test whether operational proof changes repeat purchasing confidence
INSERT INTO public.routes
  (id, company_id, user_id, category, title, short_description,
   pts_value, effort, type, sort_order, frameworks_used,
   why_this_matters_json, steps_json, evidence_json)
VALUES (
  gen_random_uuid(),
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'create',
  'Test whether operational proof changes repeat purchasing confidence',
  'Current proof of operational reliability is mostly public signals. This route tests whether building direct, documented partner proof changes repeat purchasing confidence.',
  9, 'medium', 'Create', 5,
  ARRAY['ODI','public_baseline','JTBD','reconstructed_prior'],
  '["Route fits a direction centered on partner operational outcomes and operational reliability, but current proof is mostly public signals — confidence should stay provisional.",
    "Whether buyers choose primarily on craft quality and specialty coffee positioning, partner operational outcomes, operational reliability, or some combination is still unclear and unresolved.",
    "Supplier switching must remain easy enough that proof gaps change behavior — maintain low switching cost as a design constraint while building this evidence.",
    "This route could weaken if buyers ultimately prioritize price or convenience more than reliability and proof — that risk has not yet been tested with direct customer evidence."]'::jsonb,
  '[{"id":"s1","title":"Define what operational proof means to partner cafe owners (interviews)","status":"missing"},
    {"id":"s2","title":"Collect 90-day operational case evidence from 3 existing partners","status":"missing"},
    {"id":"s3","title":"Share documented proof with prospective accounts and track response","status":"missing"},
    {"id":"s4","title":"Review: did proof change purchasing confidence or repeat behavior?","status":"missing"}]'::jsonb,
  '[{"id":"e1","title":"Partner satisfaction and repeat purchase data (before proof)","status":"missing"},
    {"id":"e2","title":"Partner satisfaction and repeat purchase data (after proof)","status":"missing"},
    {"id":"e3","title":"Public signals baseline (specialty coffee buyer behavior)","status":"complete"},
    {"id":"e4","title":"Direct interview evidence from cafe owner partners","status":"missing"}]'::jsonb
);

COMMIT;
