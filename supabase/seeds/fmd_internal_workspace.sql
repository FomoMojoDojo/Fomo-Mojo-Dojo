-- FomoMojoDojo — Internal Recursive Workspace
--
-- The system running its own strategy.
-- Not demo content. Not sample data. The operating environment.
--
-- Primary strategic problem:
--   "How do we establish a new category around strategic confidence systems
--    without collapsing into consulting-language ambiguity or AI-tool positioning?"
--
-- UUID conventions:
--   company:   fda00001-face-4000-9000-fda000000001
--   user:      fd766480-d2ef-4794-a79a-b849a91df024  (same as cafe_barra admin)
--
-- Run once against the target Supabase instance.
-- Idempotent: uses ON CONFLICT DO NOTHING where possible.

DO $$
DECLARE
  co_id  uuid := 'fda00001-face-4000-9000-fda000000001';
  usr_id uuid := 'fd766480-d2ef-4794-a79a-b849a91df024';

  -- Hypothesis IDs
  h1_id  uuid := gen_random_uuid();  -- decision system language
  h2_id  uuid := gen_random_uuid();  -- confidence explainability
  h3_id  uuid := gen_random_uuid();  -- AI distrust
  h4_id  uuid := gen_random_uuid();  -- workshop shell
  h5_id  uuid := gen_random_uuid();  -- destabilization visibility
  h6_id  uuid := gen_random_uuid();  -- consulting buyer resonance
  h7_id  uuid := gen_random_uuid();  -- recursive use trust
  h8_id  uuid := gen_random_uuid();  -- pricing signal hypothesis

  -- Tension IDs
  t1_id  uuid := gen_random_uuid();  -- clarity vs sophistication
  t2_id  uuid := gen_random_uuid();  -- product vs consulting identity
  t3_id  uuid := gen_random_uuid();  -- explainability vs automation
  t4_id  uuid := gen_random_uuid();  -- operational tooling vs strategic orientation
  t5_id  uuid := gen_random_uuid();  -- atmospheric UX vs enterprise usability
  t6_id  uuid := gen_random_uuid();  -- narrative depth vs decision speed

  -- Decision IDs
  d1_id  uuid := gen_random_uuid();  -- category vs methodology positioning
  d2_id  uuid := gen_random_uuid();  -- workshop-led vs software-led GTM
  d3_id  uuid := gen_random_uuid();  -- AI foregrounding
  d4_id  uuid := gen_random_uuid();  -- enterprise exposure before paid
  d5_id  uuid := gen_random_uuid();  -- implementation sequencing as product layer
  d6_id  uuid := gen_random_uuid();  -- confidence-readiness in onboarding

  -- Route IDs
  r1_id  uuid := gen_random_uuid();  -- clarify category narrative
  r2_id  uuid := gen_random_uuid();  -- reduce onboarding ambiguity
  r3_id  uuid := gen_random_uuid();  -- test confidence explainability
  r4_id  uuid := gen_random_uuid();  -- validate destabilization visibility
  r5_id  uuid := gen_random_uuid();  -- separate implementation sequencing
  r6_id  uuid := gen_random_uuid();  -- recursive use proof
  r7_id  uuid := gen_random_uuid();  -- refine workshop first session

BEGIN

-- ─── Company ──────────────────────────────────────────────────────────────────

INSERT INTO public.companies
  (id, created_by, name, archetype, tier, quarter, mojo_score,
   potential_score, projected_score,
   evidence_status, evidence_note, website)
VALUES (
  co_id, usr_id,
  'FomoMojoDojo',
  'Founder',
  1,
  'Q2 2026',
  42,       -- current readiness: directional, not strong
  78,       -- potential: real upside if category lands
  61,       -- projected: depends on resolving core tensions
  'mixed',
  'Operating in category-creation mode. Primary uncertainty: does the strategic confidence framing resonate before or after the workshop experience?',
  'https://fomomojodojo.com'
)
ON CONFLICT (id) DO NOTHING;

-- ─── Positioning ─────────────────────────────────────────────────────────────

INSERT INTO public.positioning_canvases
  (company_id, user_id, market_category, current_tagline, proposed_tagline,
   value_for_customer, best_fit_customers, category_rationale,
   competitive_alternatives_json, unique_attributes_json, frameworks_used)
VALUES (
  co_id, usr_id,
  'Strategic confidence systems',
  'Know what you know. Know what you don''t.',
  'Strategic clarity without false certainty.',
  'MojoMap makes strategic uncertainty visible and navigable — not resolved. Founders and operators get a system that holds complexity honestly, surfaces commitment pressure, and shows exactly what would need to be true before each decision is safe to commit.',
  'Founder-led companies (seed to Series B) running on strategic ambiguity. Operators who distrust AI strategy outputs. Consultants who want to evolve beyond framework delivery.',
  'Confidence-adjusted strategic readiness is a new category. The existing landscape offers: AI generators that resolve uncertainty too quickly, consulting frameworks that require expert interpretation, OKR systems that track commitments but not the basis for them. None make the confidence architecture visible.',
  '[
    {"alternative": "McKinsey / strategic consultants", "why_chosen": "Comprehensive, credible, high-touch", "our_edge": "MojoMap is operational between engagements — not episodic. Clients see their own confidence posture in real time, not only after a deck."},
    {"alternative": "AI strategy generators (various)", "why_chosen": "Fast, cheap, always-on", "our_edge": "We surface uncertainty rather than suppressing it. No hallucinated confidence. Clients see what the system doesn''t know."},
    {"alternative": "OKR / goal-tracking tools", "why_chosen": "Familiar, processable, team-ready", "our_edge": "OKRs track what you committed to. MojoMap tracks whether the basis for that commitment still holds."},
    {"alternative": "DIY strategy documents + meetings", "why_chosen": "Cheap, feels controllable", "our_edge": "Documents decay. MojoMap accumulates strategic memory across decisions, contradictions, and resolved tensions."}
  ]'::jsonb,
  '[
    {"attribute": "Confidence anatomy engine — 10 dimensions, not a single score"},
    {"attribute": "Commitment architecture — decisions live with uncertainty over time"},
    {"attribute": "Contradiction surfacing — the system admits when evidence conflicts"},
    {"attribute": "Movement narrative — tracks how the picture is changing, not just what it is"},
    {"attribute": "Recursive use — the company runs on the system it sells"}
  ]'::jsonb,
  ARRAY['JTBD', 'strategy_cascade', 'public_research']
)
ON CONFLICT DO NOTHING;

-- ─── Strategy Cascade ─────────────────────────────────────────────────────────

INSERT INTO public.strategy_cascades
  (company_id, user_id, winning_aspiration, where_to_play, how_to_win,
   capabilities_json, assumptions_json, frameworks_used)
VALUES (
  co_id, usr_id,
  'Become the canonical system for strategic commitment under uncertainty — the layer that holds a company''s confidence architecture across every decision, route, and reframe.',
  'Founder-led companies between $1M–$20M ARR navigating a strategic inflection. Operators who have tried strategy frameworks and found them too rigid. Strategy consultants who want to compound value between engagements.',
  'Win by being the only system that treats uncertainty as the primary input — not a problem to solve. Make confidence architecture visible. Surface contradictions honestly. Allow commitment to strengthen or weaken over time without forcing resolution.',
  '[
    {"capability": "Confidence anatomy engine with inspectable dimensions"},
    {"capability": "Commitment architecture that persists across reframes"},
    {"capability": "Narrative evolution — strategic memory, not activity logs"},
    {"capability": "Workshop-to-system handoff — insights don''t die in slide decks"},
    {"capability": "Recursive operation — the team uses the system for internal strategy"}
  ]'::jsonb,
  '[
    {"assumption": "Founders will pay for strategic clarity tools if they understand what''s being revealed", "status": "directional", "what_must_be_true": "Demonstrated in 3+ paid engagements"},
    {"assumption": "The workshop experience is the product — software alone doesn''t close", "status": "strengthening", "what_must_be_true": "Workshop-to-software conversion path validated"},
    {"assumption": "Category creation is possible without a large content/community investment", "status": "unvalidated", "what_must_be_true": "Early adopters evangelize without explicit nurture"},
    {"assumption": "AI-generated strategy is distrusted enough to create an anti-positioning opportunity", "status": "strengthening", "what_must_be_true": "Explicit buyer differentiation vs AI tools documented"},
    {"assumption": "Recursive use (running FMD on MojoMap) creates demonstrable proof that accelerates sales", "status": "emerging", "what_must_be_true": "At least one buyer cites recursive use as decision factor"}
  ]'::jsonb,
  ARRAY['strategy_cascade', 'JTBD']
)
ON CONFLICT DO NOTHING;

-- ─── Hypotheses ──────────────────────────────────────────────────────────────

INSERT INTO public.strategic_hypotheses
  (id, company_id, hypothesis_key, statement, hypothesis_kind, hypothesis_state,
   topic, confidence, validation_state, what_must_be_true, is_active)
VALUES

-- h1: Decision system language
(h1_id, co_id,
 'decision-system-language',
 'Buyers understand "decision system" faster than "strategic confidence system" — the former activates a familiar mental model, the latter requires a new one.',
 'directional_hypothesis',
 'emerging',
 'category',
 'medium',
 'directional',
 '["Two or more qualified buyers independently use ''decision'' framing when describing the value after a demo", "Category adoption rate of ''decision system'' language exceeds ''confidence system'' in sales notes within 60 days"]'::jsonb,
 true
),

-- h2: Confidence explainability as differentiator
(h2_id, co_id,
 'confidence-explainability-differentiator',
 'Confidence explainability — showing not just the score but what is holding it — is the core category differentiator. No competitor makes the confidence architecture inspectable.',
 'directional_hypothesis',
 'inferred',
 'product',
 'high',
 'unvalidated',
 '["A buyer specifically references confidence explainability as a reason to choose MojoMap over alternatives", "The inspect panel is mentioned unprompted in at least 3 demo conversations"]'::jsonb,
 true
),

-- h3: AI distrust creates opening
(h3_id, co_id,
 'ai-strategy-distrust',
 'Firms with strategic authority distrust AI-generated strategic recommendations when uncertainty is not visible. They will not act on a recommendation they cannot interrogate.',
 'candidate_assumption',
 'strengthened',
 'market',
 'high',
 'directional',
 '["Buyer explicitly states distrust of AI strategy tools in discovery", "''What is this based on?'' is asked within 5 minutes of any AI-generated output being shown"]'::jsonb,
 true
),

-- h4: Workshop shell superiority
(h4_id, co_id,
 'workshop-shell-dominance',
 'The workshop shell — structured, facilitated, human-in-the-loop — is a stronger UX pattern for strategic orientation than dashboard-style software. Buyers need the scaffold, not just the data.',
 'directional_hypothesis',
 'emerging',
 'product',
 'medium',
 'directional',
 '["Workshop sessions produce more strategic clarity per hour than self-serve software exploration", "Workshop outputs are referenced in subsequent strategy meetings without facilitation"]'::jsonb,
 true
),

-- h5: Destabilization visibility
(h5_id, co_id,
 'destabilization-visibility-trust',
 'Showing a commitment as destabilizing — explicitly surfacing when confidence is eroding — increases buyer trust rather than eroding it. Visible uncertainty is more trustworthy than hidden uncertainty.',
 'directional_hypothesis',
 'inferred',
 'product',
 'low',
 'unvalidated',
 '["A buyer who sees a destabilized commitment responds with increased engagement, not reduced trust", "''At least I know what I don''t know'' is said by a buyer in context of seeing the destabilization indicator"]'::jsonb,
 true
),

-- h6: Consulting buyer resonance
(h6_id, co_id,
 'positioning-first-buyer-resonance',
 'Positioning-first consulting buyers — those who lead with brand, narrative, and differentiation work — resonate faster than operational buyers who prioritize workflow efficiency.',
 'directional_hypothesis',
 'emerging',
 'gtm',
 'medium',
 'directional',
 '["Positioning-first buyers convert from discovery to paid in fewer touchpoints than operational buyers", "The category creation framing lands faster in conversations that start with positioning than those that start with workflow"]'::jsonb,
 true
),

-- h7: Recursive use trust
(h7_id, co_id,
 'recursive-use-trust-signal',
 'Using MojoMap to run FomoMojoDojo''s own strategy creates a demonstrable proof of the system that increases buyer trust and product clarity beyond any demo or case study.',
 'directional_hypothesis',
 'inferred',
 'product',
 'medium',
 'unvalidated',
 '["A buyer cites recursive use as a meaningful trust signal", "The phrase ''you run this yourself'' changes the tone of a sales conversation", "Internal movement narratives are directly usable as external positioning evidence"]'::jsonb,
 true
),

-- h8: Pricing as signal
(h8_id, co_id,
 'pricing-as-category-signal',
 'Premium pricing ($15k–$30k engagement) is a category signal, not an accessibility barrier. It positions MojoMap outside the tool-purchase category and inside the strategic-investment category.',
 'candidate_assumption',
 'unstable',
 'gtm',
 'low',
 'unvalidated',
 '["A buyer is qualified by willingness to invest at this range without requiring ROI justification", "No buyer frames the product as a tool — they frame it as a strategic engagement"]'::jsonb,
 true
);

-- ─── Stored Tensions ─────────────────────────────────────────────────────────
-- These are tensions that require explicit storage — they don't derive cleanly
-- from route/need conflicts but from strategic framing conflicts.

INSERT INTO public.strategic_tensions
  (id, company_id, statement, detail, status, confidence, pressure, source,
   affected_positioning, affected_strategy, is_commitment_blocker,
   resolution_signals, validation_requirements, created_from)
VALUES

-- t1: clarity vs sophistication
(t1_id, co_id,
 'Clarity vs sophistication: the system''s depth creates onboarding friction before it creates value.',
 'The confidence anatomy, readiness layers, and movement feed are genuinely powerful — but they require 20+ minutes of orientation before they''re interpretable. Buyers who encounter the system cold experience friction before insight.',
 'strengthening',
 0.85,
 'high',
 'user_defined',
 true,
 true,
 true,
 ARRAY[
   'A buyer describes the system as immediately clear within the first 10 minutes of a demo',
   'Onboarding session time-to-insight drops below 15 minutes'
 ],
 ARRAY[
   'Define the minimum viable entry point that creates insight without requiring full system understanding',
   'Test whether the workshop shell can front-load clarity before the architecture is revealed'
 ],
 'user_defined'
),

-- t2: product vs consulting identity
(t2_id, co_id,
 'Product vs consulting identity: every revenue conversation requires resolving which business we are.',
 'Clients who come in as consulting buyers expect relationship, facilitation, and bespoke delivery. Clients who come in as software buyers expect self-serve, integration, and scalability. The product currently satisfies neither expectation cleanly — and each conversation that doesn''t resolve this positioning question weakens positioning confidence.',
 'unresolved',
 0.9,
 'critical',
 'user_defined',
 true,
 true,
 true,
 ARRAY[
   'A clear ICP emerges from three consecutive closed deals that share the same buyer archetype',
   'The initial engagement motion is the same for all buyers regardless of consulting vs software framing'
 ],
 ARRAY[
   'Document what the actual delivery motion looks like for the first three deals',
   'Identify whether the same buyer archetype exists across all three'
 ],
 'user_defined'
),

-- t3: explainability vs automation
(t3_id, co_id,
 'Explainability vs automation: the more the system explains its reasoning, the less it feels like AI. The less it explains, the less trustworthy it is.',
 'Buyers who trust the confidence anatomy do so because they can inspect it. But deep explainability requires engagement time that not all buyers are willing to give. Automated recommendations without the anatomy feel like every other AI tool.',
 'unresolved',
 0.75,
 'high',
 'user_defined',
 true,
 false,
 false,
 ARRAY[
   'A buyer says ''I understand why it''s telling me this'' without needing facilitation',
   'The inspect panel reduces trust-related objections in sales conversations'
 ],
 ARRAY[
   'Test whether the inspect panel''s content is interpretable without training',
   'Measure time spent in inspect panels during first sessions'
 ],
 'user_defined'
),

-- t4: operational tooling vs strategic orientation
(t4_id, co_id,
 'Operational tooling vs strategic orientation: workflow buyers want process integration; strategic buyers want perspective shift.',
 'Some prospects want MojoMap to live in their operational stack (integrations, daily use, team-wide). Others want it as a strategic orientation layer (quarterly, facilitated, leadership-only). These require different product assumptions, different pricing, and different success metrics.',
 'emerging',
 0.7,
 'medium',
 'user_defined',
 false,
 true,
 false,
 ARRAY[
   'A buyer archetype emerges that clearly prefers one mode over the other',
   'Adoption data shows a dominant usage pattern (frequent/operational vs infrequent/strategic)'
 ],
 ARRAY[
   'Ask directly in discovery: ''How often would you expect to use this?''',
   'Track session frequency for first 5 paying clients'
 ],
 'user_defined'
),

-- t5: atmospheric UX vs enterprise usability
(t5_id, co_id,
 'Atmospheric UX vs enterprise usability: the visual language creates differentiation and trust with some buyers, friction with others.',
 'The dense, editorial, confidence-first UX is a strong signal of category positioning. It communicates ''this is not another dashboard.'' But enterprise buyers with accessibility requirements, integration expectations, or IT governance processes hit friction when the visual language doesn''t map to familiar patterns.',
 'emerging',
 0.65,
 'medium',
 'user_defined',
 true,
 false,
 false,
 ARRAY[
   'A buyer references the visual language positively in a buying conversation',
   'No buyer mentions the UX as a barrier to purchase'
 ],
 ARRAY[
   'Document UX-related objections across first 10 discovery conversations',
   'Test whether a single enterprise buyer flags accessibility or IT concerns'
 ],
 'user_defined'
),

-- t6: narrative depth vs decision speed
(t6_id, co_id,
 'Narrative depth vs decision speed: the system rewards patience but many buyers need velocity.',
 'Strategic confidence architecture is inherently slow to build — accumulating evidence, resolving tensions, and watching confidence posture shift takes months. But buyers under pressure need strategic direction now, not over a quarter. The system''s deepest value is in its temporal depth, which is the hardest to demonstrate early.',
 'unresolved',
 0.8,
 'high',
 'user_defined',
 true,
 true,
 false,
 ARRAY[
   'A buyer''s confidence posture measurably shifts within the first 4-week engagement',
   'A deliverable from week 1 is useful enough to act on'
 ],
 ARRAY[
   'Define the minimum viable strategic output from a single session',
   'Build a fast-path narrative that shows commitment architecture before full anatomy is developed'
 ],
 'user_defined'
);

-- ─── Strategic Decisions ─────────────────────────────────────────────────────

INSERT INTO public.strategic_decisions
  (id, company_id, title, decision_question, decision_state, confidence_state,
   current_posture, supporting_evidence, contradicting_evidence,
   validation_requirements, blocked_by, affected_positioning,
   affected_capabilities, supporting_hypothesis_ids, active_tension_ids,
   confidence_movement, decision_memory, stale_dependencies, source)
VALUES

-- d1: Category vs methodology positioning
(d1_id, co_id,
 'Category or methodology: what is MojoMap''s primary identity?',
 'Should MojoMap lead with "strategic confidence system" as a new category, or with "methodology" as the primary identity to reduce buyer orientation load?',
 'under_validation',
 'directional',
 'Leaning toward category positioning with methodology as the onboarding scaffold — but evidence is split between buyers who want the category framing and those who need the methodology anchor first.',
 '[
   {"id": "se1", "statement": "Three buyer conversations referenced the system as categorically different from existing strategy tools", "source": "buyer_discovery", "weight": "medium"},
   {"id": "se2", "statement": "Recursive use proof creates a unique category signal no methodology can replicate", "source": "internal_analysis", "weight": "high"}
 ]'::jsonb,
 '[
   {"id": "ce1", "statement": "Two buyer conversations defaulted to asking for a methodology comparison — category language required a second explanation", "source": "buyer_discovery", "severity": "medium"},
   {"id": "ce2", "statement": "''Methodology'' language landed faster than ''confidence system'' language in 4 of 6 email opens", "source": "gtm_signal", "severity": "medium"}
 ]'::jsonb,
 '[
   {"requirement": "Three qualified buyers independently describe the product in category language without prompting", "status": "open"},
   {"requirement": "One enterprise buyer adopts the category framing in internal documentation", "status": "open"}
 ]'::jsonb,
 ARRAY['product-vs-consulting-tension-unresolved'],
 true,
 ARRAY['narrative-positioning', 'category-creation'],
 ARRAY[h1_id, h2_id, h7_id],
 ARRAY[t1_id, t2_id],
 '[
   {"at": "2026-04-15T14:00:00Z", "direction": "strengthening", "reason": "Category framing landed strongly in a positioning-first buyer conversation"},
   {"at": "2026-05-01T11:00:00Z", "direction": "weakening", "reason": "Two subsequent conversations defaulted to methodology framing — buyers needed the category concept explained before engaging with it"}
 ]'::jsonb,
 '[
   {"at": "2026-03-01T00:00:00Z", "entry": "Question opened: category vs methodology was a known tension, not yet a pressed decision"},
   {"at": "2026-04-15T00:00:00Z", "entry": "Category framing tested in first positioning-led conversation — stronger than expected"},
   {"at": "2026-05-01T00:00:00Z", "entry": "Methodology framing resurgent — two buyers needed it as an anchor before category made sense"}
 ]'::jsonb,
 ARRAY[]::text[],
 'user_defined'
),

-- d2: Workshop-led vs software-led GTM
(d2_id, co_id,
 'GTM motion: workshop-led or software-led?',
 'Should the primary acquisition and value-delivery motion lead with the workshop experience, or should software demonstrate value independently before the workshop?',
 'stabilizing',
 'building',
 'Workshop-led motion is becoming the dominant evidence signal. The workshop shell is the canonical interface, and sessions produce more durable strategic output than self-serve exploration.',
 '[
   {"id": "se1", "statement": "Workshop sessions produce 3–4x more lasting strategic alignment than self-serve exploration sessions", "source": "internal_usage", "weight": "high"},
   {"id": "se2", "statement": "The workshop shell has become the canonical UI paradigm — even internal strategy work flows through it", "source": "internal_analysis", "weight": "high"},
   {"id": "se3", "statement": "All three completed engagements closed through a workshop-led discovery conversation", "source": "sales_data", "weight": "medium"}
 ]'::jsonb,
 '[
   {"id": "ce1", "statement": "Workshop-led motion doesn''t scale as a primary acquisition channel without a strong self-serve path behind it", "source": "internal_analysis", "severity": "medium"}
 ]'::jsonb,
 '[
   {"requirement": "Define the minimum workshop experience that creates sufficient value to close without software demo", "status": "met"},
   {"requirement": "Identify whether self-serve has a role after the initial engagement", "status": "open"}
 ]'::jsonb,
 ARRAY[]::text[],
 false,
 ARRAY['workshop-delivery', 'client-facilitation'],
 ARRAY[h4_id],
 ARRAY[t1_id, t4_id],
 '[
   {"at": "2026-03-10T09:00:00Z", "direction": "strengthening", "reason": "Workshop session with first paying client produced a clearer strategic output than any self-serve session"},
   {"at": "2026-04-20T10:00:00Z", "direction": "strengthening", "reason": "Workshop shell became the primary interface for internal FMD strategy work"},
   {"at": "2026-05-05T08:00:00Z", "direction": "stable", "reason": "Position is holding — no new evidence challenging the workshop-led direction"}
 ]'::jsonb,
 '[
   {"at": "2026-02-01T00:00:00Z", "entry": "Question opened with assumption that software-led demos would drive acquisition"},
   {"at": "2026-03-15T00:00:00Z", "entry": "Workshop-led sessions clearly outperforming — question shifted from ''is workshop necessary'' to ''how much can software do independently''"},
   {"at": "2026-05-05T00:00:00Z", "entry": "Stabilizing around workshop-led with software as documentation, not acquisition, layer"}
 ]'::jsonb,
 ARRAY[]::text[],
 'user_defined'
),

-- d3: AI foregrounding — destabilizing
(d3_id, co_id,
 'AI foregrounding: lead with it or downplay it?',
 'Should MojoMap explicitly foreground its AI layer as a capability, or should AI be a structural component that''s visible but not the lead message?',
 'destabilizing',
 'contradicted',
 'AI foregrounding is actively weakening buyer trust in conversations where strategic authority is valued. The confidence architecture resonates more strongly when positioned as a structured thinking system with AI support — not as an AI tool that produces strategy.',
 '[
   {"id": "se1", "statement": "The confidence anatomy framing (not AI framing) drove the strongest buyer engagement in April demos", "source": "buyer_discovery", "weight": "high"}
 ]'::jsonb,
 '[
   {"id": "ce1", "statement": "Explicit AI framing triggered skepticism in 4 of 5 conversations with senior operators", "source": "buyer_discovery", "severity": "high"},
   {"id": "ce2", "statement": "''Another AI strategy tool'' was said by two separate buyers when AI was foregrounded", "source": "buyer_discovery", "severity": "high"},
   {"id": "ce3", "statement": "Buyers with prior negative AI strategy tool experience actively disengaged when AI was mentioned first", "source": "buyer_discovery", "severity": "medium"}
 ]'::jsonb,
 '[
   {"requirement": "Identify the right positioning of AI as infrastructure (not identity) in all buyer-facing materials", "status": "open"},
   {"requirement": "Remove AI-first language from discovery pitch — test confidence-system-first framing", "status": "open"}
 ]'::jsonb,
 ARRAY['narrative-positioning-update-needed'],
 true,
 ARRAY['narrative-copy', 'website-positioning', 'discovery-script'],
 ARRAY[h3_id],
 ARRAY[t3_id],
 '[
   {"at": "2026-03-20T15:00:00Z", "direction": "weakening", "reason": "First buyer explicitly said ''I don''t need another AI telling me what strategy to pursue''"},
   {"at": "2026-04-10T11:00:00Z", "direction": "weakening", "reason": "Repeated buyer pattern: AI framing creates resistance before confidence architecture can land"},
   {"at": "2026-05-08T14:00:00Z", "direction": "weakening", "reason": "''Another AI strategy tool'' said in two more conversations — the AI positioning is actively working against us"}
 ]'::jsonb,
 '[
   {"at": "2026-02-15T00:00:00Z", "entry": "Initial assumption: AI capability was a product strength to lead with"},
   {"at": "2026-03-25T00:00:00Z", "entry": "First signal of AI resistance — adjusted framing in one conversation, immediate improvement"},
   {"at": "2026-04-15T00:00:00Z", "entry": "Pattern confirmed: AI framing consistently produces resistance before value lands"},
   {"at": "2026-05-10T00:00:00Z", "entry": "Destabilizing: original assumption (AI as lead signal) is now working against positioning"}
 ]'::jsonb,
 ARRAY['website-copy', 'discovery-pitch-deck']::text[],
 'user_defined'
),

-- d4: Enterprise exposure before paid
(d4_id, co_id,
 'Enterprise discovery: show the system before paid engagement?',
 'Should enterprise-adjacent buyers be able to experience the confidence system in a discovery context before making a financial commitment, or does that reduce the perceived value of the engagement?',
 'exploratory',
 'low',
 'Question is genuinely open. No sufficient evidence either way. The concern is that showing too much before commitment reduces the anchor for pricing.',
 '[]'::jsonb,
 '[]'::jsonb,
 '[
   {"requirement": "Define what ''enterprise'' means in this context — org size, buying process, or deal size?", "status": "open"},
   {"requirement": "Run at least one discovery session with a prospect that qualifies as enterprise before forming a view", "status": "open"}
 ]'::jsonb,
 ARRAY['enterprise-icp-not-defined']::text[],
 false,
 ARRAY['enterprise-discovery-process']::text[],
 ARRAY[]::uuid[],
 ARRAY[t2_id, t4_id],
 '[]'::jsonb,
 '[
   {"at": "2026-05-01T00:00:00Z", "entry": "Question surfaced from a prospect inquiry — not yet pressed enough to have evidence"}
 ]'::jsonb,
 ARRAY[]::text[],
 'user_defined'
),

-- d5: Implementation sequencing as product layer
(d5_id, co_id,
 'Implementation sequencing: formal product layer or embedded capability?',
 'Should implementation sequencing — deciding which commitments to advance in what order — become a distinct product surface, or should it remain embedded in the routes and decision architecture?',
 'under_validation',
 'directional',
 'The sequencing question is becoming a recurring need in client conversations. Not yet clear whether it requires its own surface or whether the existing routes + commitment architecture already solves it.',
 '[
   {"id": "se1", "statement": "Three client conversations included explicit ''what do we do first?'' questions that the current routes view partially answered but didn''t fully resolve", "source": "client_sessions", "weight": "medium"}
 ]'::jsonb,
 '[
   {"id": "ce1", "statement": "Adding a dedicated sequencing layer risks fragmenting the existing commitment architecture that already handles order and priority", "source": "internal_analysis", "severity": "medium"}
 ]'::jsonb,
 '[
   {"requirement": "Document the sequencing questions that routes + decisions don''t currently answer", "status": "open"},
   {"requirement": "Test whether a dedicated sequencing surface reduces confusion or adds it", "status": "open"}
 ]'::jsonb,
 ARRAY[]::text[],
 false,
 ARRAY['routes-architecture', 'commitment-sequencing']::text[],
 ARRAY[]::uuid[],
 ARRAY[t4_id],
 '[
   {"at": "2026-05-06T10:00:00Z", "direction": "strengthening", "reason": "''What do we do first?'' emerged as a recurring question — the system doesn''t currently have a clear answer surface for this"}
 ]'::jsonb,
 '[
   {"at": "2026-04-15T00:00:00Z", "entry": "Question surfaced from client session — route ordering felt ambiguous without explicit sequencing logic"},
   {"at": "2026-05-06T00:00:00Z", "entry": "Second and third client raised the same question — becoming a pattern, not an outlier"}
 ]'::jsonb,
 ARRAY[]::text[],
 'user_defined'
),

-- d6: Confidence-readiness in onboarding
(d6_id, co_id,
 'Onboarding: should confidence readiness be the primary onboarding signal?',
 'Should the first thing a new client sees in MojoMap be their current confidence readiness score, or should onboarding begin with the strategy cascade and build toward readiness over time?',
 'exploratory',
 'low',
 'No evidence yet. The hypothesis is that leading with readiness creates immediate orientation — but it may also create confusion if the anatomy hasn''t been built yet.',
 '[]'::jsonb,
 '[]'::jsonb,
 '[
   {"requirement": "Run at least two onboarding sessions that lead with readiness score and observe buyer reaction", "status": "open"},
   {"requirement": "Compare time-to-orientation between readiness-first and cascade-first onboarding", "status": "open"}
 ]'::jsonb,
 ARRAY['onboarding-session-design-not-finalized']::text[],
 false,
 ARRAY['onboarding-flow']::text[],
 ARRAY[]::uuid[],
 ARRAY[t1_id],
 '[]'::jsonb,
 '[
   {"at": "2026-05-10T00:00:00Z", "entry": "Question surfaced from Phase 76 — what is the recursive signal that makes onboarding coherent?"}
 ]'::jsonb,
 ARRAY[]::text[],
 'user_defined'
);

-- ─── Routes (Company Roadmap) ─────────────────────────────────────────────────

INSERT INTO public.routes
  (id, company_id, user_id, category, title, short_description,
   pts_value, effort, type, sort_order, frameworks_used,
   why_this_matters_json, steps_json, evidence_json)
VALUES

-- r1: Clarify category narrative
(r1_id, co_id, usr_id,
 'fix',
 'Clarify "strategic confidence system" narrative for buyer conversations',
 'The current category language requires explanation before value lands. The narrative needs a faster on-ramp that meets buyers where they are before introducing the full category frame.',
 12, 'low', 'Fix', 1,
 ARRAY['strategy_cascade', 'public_research'],
 '["Category confusion is extending the sales cycle — buyers are spending orientation time instead of evaluation time.",
   "Resolving this would reduce the median time from first contact to discovery commitment.",
   "This also directly unblocks the AI foregrounding decision — the category narrative is the alternative to AI-first positioning."]'::jsonb,
 '[{"id":"s1","title":"Audit current narrative in all buyer-facing materials for category-vs-methodology split","status":"in_progress"},
   {"id":"s2","title":"Write three variations of the one-sentence description: category-led, methodology-led, outcome-led","status":"missing"},
   {"id":"s3","title":"Test each variation in two discovery conversations and record which activates engagement fastest","status":"missing"},
   {"id":"s4","title":"Update website, discovery script, and deck to reflect the winning framing","status":"missing"}]'::jsonb,
 '[{"id":"e1","title":"Buyer conversation notes showing methodology-first responses","status":"complete"},
   {"id":"e2","title":"Category-first conversation notes with positive response","status":"complete"},
   {"id":"e3","title":"Systematic A/B test of narrative framing in discovery","status":"missing"}]'::jsonb
),

-- r2: Reduce onboarding ambiguity
(r2_id, co_id, usr_id,
 'fix',
 'Reduce onboarding ambiguity in first workshop session',
 'The first session consistently produces confusion before orientation. Participants don''t know where to look first or why. The clarity-vs-sophistication tension is most acute in the opening 20 minutes.',
 10, 'medium', 'Fix', 2,
 ARRAY['JTBD', 'strategy_cascade'],
 '["First session quality determines whether the client believes the system can serve them.",
   "Reducing early confusion is the fastest path to shortening the trust-building period.",
   "This directly addresses the clarity-vs-sophistication tension that is currently a critical commitment blocker."]'::jsonb,
 '[{"id":"s1","title":"Map the confusion moments in first sessions from existing session recordings","status":"in_progress"},
   {"id":"s2","title":"Design a 10-minute warm-up that creates system orientation before full anatomy is shown","status":"missing"},
   {"id":"s3","title":"Test revised opening in next two onboarding sessions","status":"missing"}]'::jsonb,
 '[{"id":"e1","title":"Session recordings showing early confusion moments","status":"in_progress"},
   {"id":"e2","title":"Post-session survey data on orientation clarity","status":"missing"},
   {"id":"e3","title":"Time-to-first-insight measurement","status":"missing"}]'::jsonb
),

-- r3: Test confidence explainability
(r3_id, co_id, usr_id,
 'improve',
 'Test confidence explainability with three target buyers',
 'The inspect panels exist. The anatomy is built. The question is whether buyers interpret confidence dimensions correctly without facilitation, and whether this creates the trust signal the hypothesis predicts.',
 11, 'low', 'Improve', 3,
 ARRAY['JTBD', 'public_research'],
 '["This is the fastest validation path for the confidence-explainability hypothesis.",
   "If buyers interpret the anatomy without training, it de-risks the product''s self-serve viability.",
   "If they don''t, it validates the workshop-led GTM path and sets the product roadmap for interpretability improvements."]'::jsonb,
 '[{"id":"s1","title":"Define success criteria for buyer self-interpretation of confidence dimensions","status":"complete"},
   {"id":"s2","title":"Run three structured test sessions where buyers interpret the inspect panel without facilitation","status":"missing"},
   {"id":"s3","title":"Document which dimensions cause confusion and which are immediately clear","status":"missing"},
   {"id":"s4","title":"Update hypothesis state based on findings","status":"missing"}]'::jsonb,
 '[{"id":"e1","title":"Defined success criteria","status":"complete"},
   {"id":"e2","title":"Buyer self-interpretation session data","status":"missing"},
   {"id":"e3","title":"Confusion mapping by dimension","status":"missing"}]'::jsonb
),

-- r4: Validate destabilization visibility
(r4_id, co_id, usr_id,
 'improve',
 'Validate whether destabilization visibility increases or erodes buyer trust',
 'The hypothesis that visible uncertainty builds trust rather than eroding it is central to the product''s positioning claim. It needs empirical validation before it can anchor a category narrative.',
 9, 'medium', 'Improve', 4,
 ARRAY['JTBD'],
 '["If confirmed, destabilization visibility becomes a core positioning statement: MojoMap is honest about what it doesn''t know.",
   "If contradicted, the product UX needs to reconsider how prominent the destabilizing indicators are in client-facing views.",
   "This is the most counter-intuitive hypothesis in the portfolio — it either becomes a signature move or requires revision."]'::jsonb,
 '[{"id":"s1","title":"Identify two upcoming sessions where a decision is currently in destabilizing state","status":"in_progress"},
   {"id":"s2","title":"Surface the destabilization indicator explicitly and observe reaction","status":"missing"},
   {"id":"s3","title":"Ask directly: does seeing this increase or decrease your confidence in the system?","status":"missing"},
   {"id":"s4","title":"Document response and update hypothesis state","status":"missing"}]'::jsonb,
 '[{"id":"e1","title":"Sessions with destabilizing decisions available for testing","status":"in_progress"},
   {"id":"e2","title":"Structured buyer response to destabilization visibility","status":"missing"}]'::jsonb
),

-- r5: Separate implementation sequencing
(r5_id, co_id, usr_id,
 'improve',
 'Separate implementation sequencing from strategy generation in the UX',
 'The routes view currently serves both "what is recommended" and "what do we do next." Clients need the latter to be explicit, not inferred from sort order.',
 8, 'high', 'Improve', 5,
 ARRAY['strategy_cascade'],
 '["Three consecutive client sessions surfaced the same question: ''what should we start with?'' — the current routes sort order doesn''t answer this clearly.",
   "Explicit sequencing would also make the implementation commitment decision clearer.",
   "This may resolve the operational tooling vs strategic orientation tension by giving operational buyers a process anchor."]'::jsonb,
 '[{"id":"s1","title":"Document the sequencing questions current routes view doesn''t answer","status":"complete"},
   {"id":"s2","title":"Design a sequencing signal that operates on top of existing routes architecture","status":"missing"},
   {"id":"s3","title":"Prototype a sequencing indicator and test in next client session","status":"missing"}]'::jsonb,
 '[{"id":"e1","title":"Client session notes showing ''what first'' question pattern","status":"complete"},
   {"id":"e2","title":"Sequencing signal design","status":"missing"},
   {"id":"e3","title":"Client validation of sequencing indicator clarity","status":"missing"}]'::jsonb
),

-- r6: Recursive use proof
(r6_id, co_id, usr_id,
 'create',
 'Build documented recursive use proof with live strategic narrative',
 'FomoMojoDojo running on MojoMap is the strongest possible proof of the system. This route formalizes that proof — creating documentation, narrative, and artifacts that can be used as positioning evidence.',
 15, 'medium', 'Create', 6,
 ARRAY['strategy_cascade', 'public_research'],
 '["No other confidence system operates its own strategy on its own platform. This is uniquely defensible.",
   "The recursive proof directly validates the trust hypothesis and provides a story no case study can replicate.",
   "Phase 76 is the first activation — this route continues it into a durable, shareable artifact."]'::jsonb,
 '[{"id":"s1","title":"Document Phase 76 seed as the first formal recursive operation","status":"in_progress"},
   {"id":"s2","title":"Run FMD''s Q3 strategic review entirely through MojoMap","status":"missing"},
   {"id":"s3","title":"Produce a shareable narrative: ''How FMD runs its strategy on MojoMap''","status":"missing"},
   {"id":"s4","title":"Test whether sharing recursive proof changes buyer trust in discovery conversations","status":"missing"}]'::jsonb,
 '[{"id":"e1","title":"Phase 76 seed and FMD workspace creation","status":"in_progress"},
   {"id":"e2","title":"Q3 strategic review artifacts","status":"missing"},
   {"id":"e3","title":"Buyer response to recursive proof narrative","status":"missing"}]'::jsonb
),

-- r7: Refine workshop first session
(r7_id, co_id, usr_id,
 'fix',
 'Reduce first workshop session confusion — design the warm-up scaffold',
 'The first 20 minutes of every workshop session are the most important and most fragile. Participants need orientation before insight. The current session opens with full system context before any scaffold has been built.',
 7, 'low', 'Fix', 7,
 ARRAY['JTBD', 'strategy_cascade'],
 '["The clarity-vs-sophistication tension is most acute at the session opening.",
   "A 10-minute warm-up that creates system orientation would compound every subsequent session hour.",
   "This is the single highest-leverage fix for the onboarding experience."]'::jsonb,
 '[{"id":"s1","title":"Map the orientation moment in 3 past session recordings — what question unlocked understanding?","status":"missing"},
   {"id":"s2","title":"Design a 3-question warm-up that surfaces the buyer''s existing strategic uncertainty before the system is introduced","status":"missing"},
   {"id":"s3","title":"Test revised opening in next session","status":"missing"}]'::jsonb,
 '[{"id":"e1","title":"Past session recordings","status":"in_progress"},
   {"id":"e2","title":"Revised session opening design","status":"missing"}]'::jsonb
);

-- ─── Decision Routes (junction) ───────────────────────────────────────────────

INSERT INTO public.decision_routes
  (company_id, decision_id, route_id, relationship, sort_order)
VALUES
-- d1 (category vs methodology) → r1 (clarify narrative) as validation path
(co_id, d1_id, r1_id::text, 'validation_path', 1),
-- d1 also connected to r6 (recursive proof) as expression
(co_id, d1_id, r6_id::text, 'expression', 2),

-- d2 (workshop vs software) → r7 (refine workshop) as expression
(co_id, d2_id, r7_id::text, 'expression', 1),
-- d2 also connected to r2 (onboarding ambiguity) as validation path
(co_id, d2_id, r2_id::text, 'validation_path', 2),

-- d3 (AI foregrounding) → r1 (clarify narrative) as prerequisite
(co_id, d3_id, r1_id::text, 'prerequisite', 1),

-- d5 (implementation sequencing) → r5 (separate sequencing) as expression
(co_id, d5_id, r5_id::text, 'expression', 1),

-- d6 (confidence readiness onboarding) → r3 (test explainability) as validation path
(co_id, d6_id, r3_id::text, 'validation_path', 1)
ON CONFLICT (decision_id, route_id) DO NOTHING;

END $$;
