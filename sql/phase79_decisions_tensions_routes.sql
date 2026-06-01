-- PHASE 79: Evidence-Derived Route System — Decisions, Tensions, Routes, Linkage
-- Company: Cafe Barra | 58b2b15b-bada-4bcd-9c12-b7e66a37d0bc
-- Admin user: 5860c99a-e6f8-4feb-9997-992e3654f181
--
-- Active evidence files (source_file_ids referenced throughout):
--   67c948c4 → Cafe_Barra_Alternatives_Mar_18_2026        (comp-alt)
--   3a0b6c5e → Cafe_Barra_Partner_Selection_Framework     (referral-map)
--   ec0c7a86 → THE_BARRA_PROCESS_or_BARRA_ROAST_METHOD    (unique-attr)
--   0337c3b9 → Cafe_Barra_Positioning.pdf.extracted.txt   (comp-alt)
--   4f9761e9 → Cafe Barra Positioning May 1               (comp-alt)
--   471a44bc → Cafe_Barra_Strategic_Framework_Final.txt   (target-aud)
--   c04a4f1a → Cafe_Barra_Strategic_Framework_Final.pdf   (target-aud)
--   b9d7b627 → Cafe_Barra_Positioning.pdf                 (comp-alt)
--
-- Safe to re-run: uses DO blocks with NOT EXISTS guards.

BEGIN;

-- ════════════════════════════════════════════════════════════════
-- PART A: STRATEGIC DECISIONS
-- ════════════════════════════════════════════════════════════════

-- Decision 1: Quality → Retention link
INSERT INTO public.strategic_decisions (
  id, company_id, title, decision_question, decision_state, confidence_state,
  current_posture, source,
  supporting_evidence, contradicting_evidence, validation_requirements,
  created_at, updated_at
) VALUES (
  'a1000001-cafe-4bcd-9012-cafe79000001',
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'Quality consistency → repeat purchasing',
  'Does proof of exceptional, seasonally-consistent roast quality drive measurably higher partner retention and repeat purchasing compared to "really good" craft alternatives?',
  'under_validation',
  'directional',
  'Active validation needed. The alternatives analysis establishes that exceptional is a qualitatively different category from really good. Whether this difference translates to measurable retention behavior is not yet established.',
  'ai_derived',
  '[{"signal": "Alternatives analysis: gap between really good and exceptional is qualitatively different — that gap is where regulars come from", "layer": "outside", "confidence": 0.72},
   {"signal": "Strategic Framework: positioning as the roast development partner for cafes building a coffee program they are proud of", "layer": "org", "confidence": 0.65}]'::jsonb,
  '[{"signal": "No direct measurement of partner retention or repeat purchasing rates available in any active file", "layer": "customer", "confidence": 0.90}]'::jsonb,
  '[{"requirement": "Direct evidence of partner NPS or retention rate vs alternative roasters"},
   {"requirement": "At least one partner account documenting repeat purchasing behavior tied to quality perception, not switching cost"}]'::jsonb,
  NOW(), NOW()
) ON CONFLICT (id) DO NOTHING;

-- Decision 2: Methodology externalization
INSERT INTO public.strategic_decisions (
  id, company_id, title, decision_question, decision_state, confidence_state,
  current_posture, source,
  supporting_evidence, contradicting_evidence, validation_requirements,
  created_at, updated_at
) VALUES (
  'a1000002-cafe-4bcd-9012-cafe79000002',
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'Barra Process externalizability',
  'Can the Barra Roast Method be externalized into transferable operating standards that cafe staff can learn and verify without direct Cafe Barra contact — without losing the quality ceiling?',
  'exploratory',
  'low',
  'No validation activity started. The Barra Process document describes 5 templates and instinct-based calibration. The instinct layer is currently not transferable. Externalization would require systematic translation of judgment calls into observable criteria.',
  'ai_derived',
  '[{"signal": "Barra Process: 5 roasting templates matched to bean origin and density — documented and repeatable", "layer": "org", "confidence": 0.85},
   {"signal": "Barra Process: 3-sample test protocol exists — concrete enough to be documented", "layer": "org", "confidence": 0.80}]'::jsonb,
  '[{"signal": "Barra Process: relies heavily on instinct, smell, look, taste during roasting — not yet codified into verifiable criteria", "layer": "org", "confidence": 0.90}]'::jsonb,
  '[{"requirement": "Attempt to write one template into observable pass/fail criteria without relying on instinct"},
   {"requirement": "Test whether a trained barista can reproduce a target roast using documented criteria alone"}]'::jsonb,
  NOW(), NOW()
) ON CONFLICT (id) DO NOTHING;

-- Decision 3: Growth path
INSERT INTO public.strategic_decisions (
  id, company_id, title, decision_question, decision_state, confidence_state,
  current_posture, source,
  supporting_evidence, contradicting_evidence, validation_requirements,
  created_at, updated_at
) VALUES (
  'a1000003-cafe-4bcd-9012-cafe79000003',
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'Growth path: partner depth vs network expansion',
  'Should Cafe Barra grow through deepening the service and proof quality in existing accounts, or by expanding the qualified partner network — and do these paths compete for the same operational capacity?',
  'exploratory',
  'directional',
  'Evidence points toward a selectivity-first model (Partner Selection Framework declines unfit accounts). Unclear whether current capacity supports network expansion without diluting the partner quality Cafe Barra''s differentiation depends on.',
  'ai_derived',
  '[{"signal": "Partner Selection Framework: explicitly prioritizes alignment over volume — decline criteria exist for unfit accounts", "layer": "org", "confidence": 0.88},
   {"signal": "Strategic Framework: LA geography implies limited addressable partner pool in the near term", "layer": "org", "confidence": 0.70}]'::jsonb,
  '[{"signal": "No capacity or operational load data available in active files — cannot determine current throughput ceiling", "layer": "org", "confidence": 0.85}]'::jsonb,
  '[{"requirement": "Map current partner account depth — how many hours per account per month for onboarding, calibration, support"},
   {"requirement": "Define the maximum qualified partner network at current operational capacity"}]'::jsonb,
  NOW(), NOW()
) ON CONFLICT (id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- PART B: STRATEGIC TENSIONS
-- ════════════════════════════════════════════════════════════════

INSERT INTO public.strategic_tensions (
  id, company_id, statement, detail, status, confidence, pressure, source,
  affected_positioning, affected_strategy, is_commitment_blocker,
  created_at
) VALUES

-- Tension 1: Proof gap
(
  'b1000001-cafe-4bcd-9012-cafe79000001',
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'The exceptional quality claim cannot be verified by a prospective partner before committing',
  'Cafe Barra positions itself above "really good" alternatives. But a prospective cafe owner has no instrument to verify this difference before signing on. The alternatives are easy to sample. Cafe Barra''s differentiation — roast profile quality, seasonal consistency — only becomes visible over time. This creates an adoption gap: the differentiation that matters most is the last thing a buyer can see.',
  'unresolved', 0.82, 'high', 'customer_positioning_mismatch',
  true, true, true,
  NOW()
),

-- Tension 2: Qualification friction
(
  'b1000002-cafe-4bcd-9012-cafe79000002',
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'The partner qualification process protects quality but creates adoption friction',
  'The 8-criteria Partner Selection Framework and full interview process are rigorous by design. They are also high-touch: each prospective partner requires a structured conversation, scoring, and judgment call. The filter that protects quality is the same mechanism that slows onboarding. There is no lightweight pre-qualification stage — it is full interview or no evaluation.',
  'unresolved', 0.78, 'high', 'unvalidated_scale_pressure',
  false, true, false,
  NOW()
),

-- Tension 3: Seasonal invisibility
(
  'b1000003-cafe-4bcd-9012-cafe79000003',
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'Seasonal origin adaptation is the methodology''s strength but is currently invisible to partner cafes',
  'The Barra Process defines consistency as consistent quality, not the same flavor profile each season. This is intentional and documented. But partner cafes experience seasonal transitions as unexplained variation unless explicitly briefed. The feature — thoughtful adaptation to each season''s best bean — reads as instability if not communicated as a deliberate methodology.',
  'unresolved', 0.85, 'high', 'customer_positioning_mismatch',
  false, false, false,
  NOW()
),

-- Tension 4: Instinct ceiling
(
  'b1000004-cafe-4bcd-9012-cafe79000004',
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'The quality ceiling depends on instinct that is not yet transferable or auditable',
  'The Barra Process relies on smell, look, and taste during roasting — described as "science meets art meets commitment." The art component is the ceiling. It is also the component that cannot currently be externalized: a trained barista cannot replicate the judgment call from documentation alone. This means the quality ceiling is person-dependent and does not yet survive operational scale or absence.',
  'unresolved', 0.80, 'high', 'capability_positioning_mismatch',
  false, true, false,
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- PART C: EVIDENCE-DERIVED ROUTES (5 routes)
-- ════════════════════════════════════════════════════════════════

-- Route 1: Consistency Proof
INSERT INTO public.routes (
  id, company_id, user_id, category, title, short_description,
  frameworks_used, sort_order,
  why_this_matters_json, evidence_json, steps_json,
  route_insights_json,
  source_file_ids,
  linked_tension_ids,
  dependency_state, validation_state, evidence_state
) VALUES (
  'e1000001-cafe-4bcd-9012-cafe79000001',
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  '5860c99a-e6f8-4feb-9997-992e3654f181',
  'create',
  'Build a seasonal consistency signal partner cafes can observe independently',
  'Right now the exceptional quality claim requires a leap of faith. Alternatives are easy to sample. Create a verifiable consistency artifact — roast log, tasting guide, or comparison protocol — that surfaces the Barra Method''s quality ceiling before purchase commitment.',
  ARRAY['ODI', 'evidence_derived_79'],
  10,
  '["The alternatives analysis shows inconsistency is the defining failure of every craft alternative Cafe Barra competes against. Local artisan roasters are described as ''really good on Tuesdays'' — not a brand you can build on.", "Exceptional requires ongoing proof. The gap between really good and exceptional is qualitatively different — but invisible until experienced. A consistency signal closes that gap before commitment is required.", "No competing alternative has this artifact. Commodity roasters win on ease. Artisan roasters lose on variance. Neither produces a verifiable consistency record. This is uncontested ground."]'::jsonb,
  '[{"id": "e1", "title": "Alternatives analysis: inconsistency cited as defining failure of craft alternatives", "status": "complete"},
   {"id": "e2", "title": "Strategic Framework: positioning requires earned proof, not narrative", "status": "complete"},
   {"id": "e3", "title": "Direct customer measurement of consistency perception", "status": "missing"},
   {"id": "e4", "title": "Partner willingness to share drink quality tracking data", "status": "missing"}]'::jsonb,
  '[{"id": "s1", "title": "Define what a consistency artifact looks like (roast log, tasting comparison, variance report)", "status": "missing"},
   {"id": "s2", "title": "Pilot with one existing partner account: can they interpret and use the artifact?", "status": "missing"},
   {"id": "s3", "title": "Determine whether the artifact survives seasonal origin transitions", "status": "missing"}]'::jsonb,
  '{
    "pressure": "Consistency Proof Pressure",
    "pressure_short": "Consistency proof",
    "evidence_snippets": [
      {
        "text": "The distance between really good and exceptional is qualitatively different — it is not a bigger version of the same thing, it is a different category of experience entirely.",
        "source_file_id": "67c948c4-5b1c-4910-943e-9004f6db682b",
        "source_label": "Alternatives Analysis",
        "confidence": "direct"
      },
      {
        "text": "Local craft roasters: really good on Tuesdays is not a brand you can build on. The cafe owner ends up doing brand repair instead of brand building.",
        "source_file_id": "67c948c4-5b1c-4910-943e-9004f6db682b",
        "source_label": "Alternatives Analysis",
        "confidence": "direct"
      },
      {
        "text": "Be the most trusted specialty coffee sourcing and roast development partner for independent cafe operators who want to build a distinctive offering.",
        "source_file_id": "471a44bc-a868-4c1e-8f21-f8564e3a045a",
        "source_label": "Strategic Framework Final",
        "confidence": "direct"
      }
    ],
    "uncertainty": "No evidence in any active file measures whether partner cafes actually perceive Cafe Barra as more consistent than alternatives they have previously used. The quality claim is internally documented, not externally validated.",
    "weakening_conditions": [
      "Cafe Barra has a bad season — seasonal origin adaptation produces lower quality than expected",
      "A well-funded craft competitor builds a similar consistency artifact first",
      "Partners do not want to track drink quality data — the artifact has no audience"
    ],
    "prerequisites": [
      "At least one existing partner account willing to participate in a consistency tracking pilot",
      "Internal clarity on what consistency metrics the Barra Process already produces"
    ],
    "customer_impact": "A cafe owner can compare Cafe Barra consistency against their current roaster using a concrete artifact, not narrative. The decision to switch or deepen becomes evidence-based.",
    "operational_impact": "Requires creating and maintaining a consistency documentation process that survives seasonal transitions. Adds ongoing documentation burden if not systematized.",
    "confidence_posture": "Signal is strong on the problem (alternatives fail on consistency). Signal is absent on the solution (no artifact exists yet, no partner has tested one). Proceed on problem confidence; solution confidence is zero until piloted.",
    "movement_condition": "Confidence strengthens when a partner uses the artifact and reports it changed their perception of Cafe Barra quality. Confidence weakens if no partner engages with it after two seasonal cycles."
  }'::jsonb,
  ARRAY['67c948c4-5b1c-4910-943e-9004f6db682b', '471a44bc-a868-4c1e-8f21-f8564e3a045a', '4f9761e9-8505-436a-884b-641689337edc'],
  ARRAY['b1000001-cafe-4bcd-9012-cafe79000001'::uuid],
  'fresh', 'unvalidated', 'partial'
) ON CONFLICT (id) DO NOTHING;

-- Route 2: Partner Qualification Pre-filter
INSERT INTO public.routes (
  id, company_id, user_id, category, title, short_description,
  frameworks_used, sort_order,
  why_this_matters_json, evidence_json, steps_json,
  route_insights_json,
  source_file_ids,
  linked_tension_ids,
  dependency_state, validation_state, evidence_state
) VALUES (
  'e2000001-cafe-4bcd-9012-cafe79000001',
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  '5860c99a-e6f8-4feb-9997-992e3654f181',
  'fix',
  'Add a lightweight pre-qualification tier before the full partner interview',
  'The 8-criteria Partner Selection Framework is thorough. The full interview is also the only filter: there is no faster way to identify obviously misaligned accounts before investing evaluation time. A brief written or async screen would protect the interview for accounts that already show alignment signals.',
  ARRAY['ODI', 'evidence_derived_79'],
  20,
  '["The Partner Selection Framework identifies clear decline criteria: prioritizes lowest price, refuses staff training, treats suppliers as interchangeable vendors. These signals are often observable before a structured interview — in how the inquiry arrives, what they lead with, what they do not ask.", "The full interview requires a collaborative, conversational tone — it is not designed to screen, only to evaluate. If unqualified accounts reach the interview, the instrument is being used for the wrong stage.", "Protecting evaluation capacity is not administrative overhead. Each full interview the Barra Process is used well for is a future partner gained. Each misallocated interview is partner capacity wasted."]'::jsonb,
  '[{"id": "e1", "title": "Partner Selection Framework: 8-criteria scorecard and full structured interview guide documented", "status": "complete"},
   {"id": "e2", "title": "Partner Selection Framework: clear decline criteria documented (price-first, no training, transactional)", "status": "complete"},
   {"id": "e3", "title": "Pre-qualification format tested and shown to correctly filter misaligned accounts", "status": "missing"},
   {"id": "e4", "title": "Measurement of current inquiry quality — what share of inquiries are misaligned before interview", "status": "missing"}]'::jsonb,
  '[{"id": "s1", "title": "Identify where most inquiries originate and what signals they send before the interview", "status": "missing"},
   {"id": "s2", "title": "Draft a 5-question async screen that surfaces brand intent and price orientation", "status": "missing"},
   {"id": "s3", "title": "Test the screen against 5 past or current accounts to calibrate scoring", "status": "missing"}]'::jsonb,
  '{
    "pressure": "Partner Qualification Pressure",
    "pressure_short": "Partner qualification",
    "evidence_snippets": [
      {
        "text": "Decline partnerships if a cafe: prioritizes lowest price above quality, refuses staff training, treats suppliers as interchangeable vendors, cannot maintain basic quality standards, has chaotic communication or ordering processes.",
        "source_file_id": "3a0b6c5e-c8c8-49cc-8551-5b83804c6dd5",
        "source_label": "Partner Selection Framework",
        "confidence": "direct"
      },
      {
        "text": "Score Interpretation: 32-40 = Ideal Cafe Barra Partner. 8-15 = Decline Partnership. The full scorecard requires a structured interview to complete.",
        "source_file_id": "3a0b6c5e-c8c8-49cc-8551-5b83804c6dd5",
        "source_label": "Partner Selection Framework",
        "confidence": "direct"
      }
    ],
    "uncertainty": "No data on what share of current inquiries are misaligned before they reach the full interview. Unclear whether inquiry volume is large enough to justify a pre-qualification stage, or whether the problem is small enough to handle manually.",
    "weakening_conditions": [
      "Inquiry volume is so low that any screen adds friction without saving meaningful time",
      "The decline criteria are not actually observable before the full interview — they only appear when probed"
    ],
    "prerequisites": [
      "A baseline picture of inquiry sources and quality (even anecdotal) before building a screen",
      "Agreement on what signals in a pre-qualification response indicate a likely misalignment"
    ],
    "customer_impact": "Well-qualified partner cafes get faster access to Cafe Barra''s evaluation — less time in the queue behind misaligned accounts.",
    "operational_impact": "Reduces full-interview load for clearly misaligned accounts. Requires maintaining the pre-qualification screen as a living document when decline criteria evolve.",
    "confidence_posture": "Strong signal on the problem structure (decline criteria are documented and specific). No signal yet on whether the problem is large enough to act on. Start with a count: how many inquiries in the last 12 months reached the full interview and were declined?",
    "movement_condition": "Confidence strengthens when a pre-filter accurately identifies misaligned accounts without requiring a full interview. Weakens if decline criteria are found to require full interview context to apply reliably."
  }'::jsonb,
  ARRAY['3a0b6c5e-c8c8-49cc-8551-5b83804c6dd5'],
  ARRAY['b1000002-cafe-4bcd-9012-cafe79000002'::uuid],
  'fresh', 'unvalidated', 'partial'
) ON CONFLICT (id) DO NOTHING;

-- Route 3: Methodology Externalization
INSERT INTO public.routes (
  id, company_id, user_id, category, title, short_description,
  frameworks_used, sort_order,
  why_this_matters_json, evidence_json, steps_json,
  route_insights_json,
  source_file_ids,
  linked_tension_ids,
  dependency_state, validation_state, evidence_state
) VALUES (
  'e3000001-cafe-4bcd-9012-cafe79000001',
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  '5860c99a-e6f8-4feb-9997-992e3654f181',
  'improve',
  'Externalize one Barra roasting template into observable, partner-communicable criteria',
  'The Barra Process has 5 templates. Each is currently held in instinct and careful notes. Converting one template into observable, non-instinct criteria would test whether the quality ceiling can be documented without losing precision — and would give partner cafes something concrete to verify against.',
  ARRAY['ODI', 'evidence_derived_79'],
  30,
  '["The Barra Process describes three sample roasts per batch, then intensive dialing-in using instinct, smell, look, and taste. The methodology exists. The transfer mechanism does not.", "Each template is matched to bean characteristics — larger/wetter beans (Brazil, Mexico) vs smaller/denser (Ethiopia). This origin-based logic is systematizable: it is based on observable bean properties, not subjective preference.", "If one template can be externalized successfully, the remaining four become a roadmap. If no template survives externalization without instinct, the quality ceiling is person-dependent — a structural risk."]'::jsonb,
  '[{"id": "e1", "title": "Barra Process: 5 templates matched to bean origin and density — documented structure exists", "status": "complete"},
   {"id": "e2", "title": "Barra Process: 3-sample test protocol — concrete enough to describe in steps", "status": "complete"},
   {"id": "e3", "title": "A trained barista has followed the documented template without instinct-based guidance", "status": "missing"},
   {"id": "e4", "title": "Quality outcome of externalized template matches instinct-guided roast", "status": "missing"}]'::jsonb,
  '[{"id": "s1", "title": "Select the most systematizable template (origin-based criteria rather than instinct-heavy)", "status": "missing"},
   {"id": "s2", "title": "Write observable pass/fail criteria for each step — no instinct references", "status": "missing"},
   {"id": "s3", "title": "Test: can another person produce an acceptable roast from criteria alone?", "status": "missing"},
   {"id": "s4", "title": "Document gap between externalized output and instinct-guided output (if any)", "status": "missing"}]'::jsonb,
  '{
    "pressure": "Methodology Scalability Pressure",
    "pressure_short": "Methodology scalability",
    "evidence_snippets": [
      {
        "text": "I have developed 5 main roasting templates that I use to decide if and how to roast each bean. Some templates are geared toward larger, wetter beans like Brazil or Mexico, while others work better with the smaller, denser beans like those from Ethiopia.",
        "source_file_id": "ec0c7a86-f085-4ea2-86dd-06fdb6a44f73",
        "source_label": "The Barra Process",
        "confidence": "direct"
      },
      {
        "text": "It is in this last step that I lean heavily on instinct, paying close attention to the smell, look and taste of the beans as they are roasting while keeping careful notes on how to repeat this recipe. Science meets art meets commitment.",
        "source_file_id": "ec0c7a86-f085-4ea2-86dd-06fdb6a44f73",
        "source_label": "The Barra Process",
        "confidence": "direct"
      }
    ],
    "uncertainty": "Whether the instinct component is separable from the quality outcome is unknown until tested. The methodology could be partially systematizable (the structural steps are) but ultimately instinct-dependent (the quality ceiling requires it).",
    "weakening_conditions": [
      "The externalized template produces lower quality than the instinct-guided version — confirming the ceiling is person-dependent",
      "The process of writing observable criteria reveals that the judgment calls are too contextual to codify"
    ],
    "prerequisites": [
      "A test batch with someone who has not been trained in the Barra Process following documented criteria only",
      "A clear quality rubric to compare externalized vs instinct-guided roast output"
    ],
    "customer_impact": "Partner cafes could receive a verification guide for each origin batch — moving quality assurance from trust in Cafe Barra to observable criteria they can check themselves.",
    "operational_impact": "If externalization succeeds, onboarding new partner baristas becomes documentable. If it fails, the person-dependency becomes a known structural constraint requiring different mitigation.",
    "confidence_posture": "The templates exist and are origin-based — systematization looks plausible. The instinct layer is the unknown. Run the test before drawing conclusions about scalability.",
    "movement_condition": "Confidence strengthens when a second person produces an acceptable roast from documented criteria without instinct-based guidance. Confidence weakens if every externalization attempt requires instinct correction."
  }'::jsonb,
  ARRAY['ec0c7a86-f085-4ea2-86dd-06fdb6a44f73'],
  ARRAY['b1000004-cafe-4bcd-9012-cafe79000004'::uuid],
  'fresh', 'unvalidated', 'thin'
) ON CONFLICT (id) DO NOTHING;

-- Route 4: Seasonal Communication Design
INSERT INTO public.routes (
  id, company_id, user_id, category, title, short_description,
  frameworks_used, sort_order,
  why_this_matters_json, evidence_json, steps_json,
  route_insights_json,
  source_file_ids,
  linked_tension_ids,
  dependency_state, validation_state, evidence_state
) VALUES (
  'e4000001-cafe-4bcd-9012-cafe79000001',
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  '5860c99a-e6f8-4feb-9997-992e3654f181',
  'fix',
  'Design the seasonal origin transition so partner cafes experience it as a methodology feature, not a supply disruption',
  'Seasonal variation is Cafe Barra''s intentional model — buy for a season, adapt to the bean. But partners experience this as an unexplained change unless briefed. The Barra Process''s strength becomes invisible noise unless communication design converts it into a visible proof of craft.',
  ARRAY['ODI', 'evidence_derived_79'],
  40,
  '["The Barra Process states: my idea of consistency is not the same bean and same flavor profile every season, but instead consistent quality. This is the intended model. Whether partners understand and accept it as a model rather than experiencing it as inconsistency depends entirely on whether it is communicated as deliberate.", "Partners who do not understand the seasonal model may compare October''s coffee to July''s and experience degradation — exactly the failure mode of commodity alternatives. The positioning fails not because quality changed, but because the quality model was not communicated.", "The Alternatives Analysis shows that local artisan roasters lose accounts because of inconsistency that customers cannot distinguish from deliberate seasonal adaptation. Cafe Barra has the documentation to make this distinction visible. Using it proactively is a differentiation lever that requires no new capability — only communication design."]'::jsonb,
  '[{"id": "e1", "title": "Barra Process: seasonal adaptation philosophy documented explicitly", "status": "complete"},
   {"id": "e2", "title": "Partner cafes currently receive seasonal transition briefings", "status": "missing"},
   {"id": "e3", "title": "Partner feedback on how they experience origin transitions", "status": "missing"}]'::jsonb,
  '[{"id": "s1", "title": "Document what information a partner cafe would need to welcome rather than resist an origin transition", "status": "missing"},
   {"id": "s2", "title": "Draft a one-page seasonal brief: what changed, why, what to expect in the cup", "status": "missing"},
   {"id": "s3", "title": "Send to one partner account ahead of next seasonal transition and ask for feedback", "status": "missing"}]'::jsonb,
  '{
    "pressure": "Seasonal Sourcing Pressure",
    "pressure_short": "Seasonal sourcing",
    "evidence_snippets": [
      {
        "text": "My idea of consistency is not the same bean and same flavor profile every season, but instead consistent quality. Here is how I achieve this.",
        "source_file_id": "ec0c7a86-f085-4ea2-86dd-06fdb6a44f73",
        "source_label": "The Barra Process",
        "confidence": "direct"
      },
      {
        "text": "When those beans run out, I attempt to acquire similar beans, but no two beans are alike. Instead of trying to adjust the roasts to make them taste similar to the previous batches, I choose to bring out the unique character of each bean.",
        "source_file_id": "ec0c7a86-f085-4ea2-86dd-06fdb6a44f73",
        "source_label": "The Barra Process",
        "confidence": "direct"
      },
      {
        "text": "The local craft roaster alternative: really good on Tuesdays is not a brand you can build on. The gap between really good and exceptional is where inconsistency lives, and customers feel that gap even when they cannot name it.",
        "source_file_id": "67c948c4-5b1c-4910-943e-9004f6db682b",
        "source_label": "Alternatives Analysis",
        "confidence": "direct"
      }
    ],
    "uncertainty": "No evidence in active files indicates whether current partner cafes actually experience seasonal transitions as positive, neutral, or disruptive. The problem may already be managed — or it may be causing silent attrition.",
    "weakening_conditions": [
      "Partners prefer consistent flavor profiles over consistent quality — the distinction does not resonate with their customer base",
      "Seasonal briefs require more preparation time than current capacity allows each cycle"
    ],
    "prerequisites": [
      "One upcoming seasonal transition to use as a pilot for the briefing approach",
      "A partner account willing to give honest feedback on how they experience origin changes"
    ],
    "customer_impact": "Partner cafes can brief their own staff on what changed and why — turning origin transitions from confusing variability into a story about seasonal craft. Reduces barista uncertainty and customer-facing inconsistency in messaging.",
    "operational_impact": "Requires a lightweight seasonal brief for each origin transition. Low ongoing cost if templatized. Creates a visible record of Cafe Barra''s methodology decisions over time.",
    "confidence_posture": "High confidence on the underlying problem structure — the methodology creates seasonal variation, and partners are not currently briefed on how to interpret it. No current evidence confirms this is causing friction. Test before investing in systematic brief infrastructure.",
    "movement_condition": "Confidence strengthens when a partner explicitly references the seasonal brief as helpful or shares it with their staff. Weakens if partners report they already handle transitions without briefing or do not find the distinction meaningful."
  }'::jsonb,
  ARRAY['ec0c7a86-f085-4ea2-86dd-06fdb6a44f73', '67c948c4-5b1c-4910-943e-9004f6db682b'],
  ARRAY['b1000003-cafe-4bcd-9012-cafe79000003'::uuid],
  'fresh', 'unvalidated', 'partial'
) ON CONFLICT (id) DO NOTHING;

-- Route 5: Brand Coherence Test
INSERT INTO public.routes (
  id, company_id, user_id, category, title, short_description,
  frameworks_used, sort_order,
  why_this_matters_json, evidence_json, steps_json,
  route_insights_json,
  source_file_ids,
  linked_tension_ids,
  dependency_state, validation_state, evidence_state
) VALUES (
  'e5000001-cafe-4bcd-9012-cafe79000001',
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  '5860c99a-e6f8-4feb-9997-992e3654f181',
  'create',
  'Test whether the exceptional positioning holds under direct comparison with premium craft alternatives a prospect has already considered',
  'The positioning places Cafe Barra above "really good" in a quality category that is "qualitatively different." This is asserted, not demonstrated. A prospect who has already tried Blue Bottle or Stumptown will compare, not defer. The positioning needs to survive that direct comparison — not just in narrative, but in what a prospect actually experiences.',
  ARRAY['ODI', 'evidence_derived_79'],
  50,
  '["The Alternatives Analysis identifies well-known craft brands (Blue Bottle, Stumptown, Equator) as the relevant comparison for specialty store buyers — not commodity distributors. These accounts carry brand recognition. Cafe Barra''s differentiation claim must survive comparison with these brands in a prospect''s direct experience, not just in a positioning deck.", "The quality ladder in the Alternatives Analysis places exceptional above really good as a qualitatively different category. This is correct framing. But the analysis does not establish whether Cafe Barra has crossed that line from the perspective of a prospect who has not yet experienced the Barra Process.", "Positioning that cannot be tested is positioning that cannot be trusted. If the exceptional claim holds under direct comparison, it becomes a closing argument. If it does not, the claim needs to be revised before it creates expectation gaps with partners."]'::jsonb,
  '[{"id": "e1", "title": "Alternatives analysis: quality ceiling map with explicit position for Cafe Barra", "status": "complete"},
   {"id": "e2", "title": "Strategic Framework: positioning statement as the specialty roast development partner", "status": "complete"},
   {"id": "e3", "title": "Direct comparison result: prospect blind tasted Barra vs known premium alternative", "status": "missing"},
   {"id": "e4", "title": "Partner account acquired from a competitor citing quality differentiation as deciding factor", "status": "missing"}]'::jsonb,
  '[{"id": "s1", "title": "Identify a prospective partner currently using Blue Bottle or Stumptown for retail/hospitality", "status": "missing"},
   {"id": "s2", "title": "Design a blind tasting protocol using the Barra Process to produce comparison samples", "status": "missing"},
   {"id": "s3", "title": "Run comparison and document whether prospect perceives the exceptional vs really good distinction", "status": "missing"}]'::jsonb,
  '{
    "pressure": "Brand Coherence Pressure",
    "pressure_short": "Brand coherence",
    "evidence_snippets": [
      {
        "text": "The quality ladder: Alternative quality ceiling — National/regional commodity: good enough. Local artisan: really good (inconsistently). In-house: variable. The distance between good and really good is where regulars come from. But the distance between really good and exceptional is qualitatively different — it is not a bigger version of the same thing.",
        "source_file_id": "67c948c4-5b1c-4910-943e-9004f6db682b",
        "source_label": "Alternatives Analysis",
        "confidence": "direct"
      },
      {
        "text": "Well-known regional or national craft brands (Blue Bottle, Stumptown, Equator) — these bring brand recognition but also dilute the store''s own identity. You are carrying their story, not telling yours.",
        "source_file_id": "67c948c4-5b1c-4910-943e-9004f6db682b",
        "source_label": "Alternatives Analysis",
        "confidence": "direct"
      },
      {
        "text": "The roast partner for cafes that take quality seriously.",
        "source_file_id": "471a44bc-a868-4c1e-8f21-f8564e3a045a",
        "source_label": "Strategic Framework Final",
        "confidence": "direct"
      }
    ],
    "uncertainty": "No active file contains evidence of how prospects actually perceive Cafe Barra quality relative to premium craft brands they have already experienced. The positioning is internally constructed — no external validation exists yet.",
    "weakening_conditions": [
      "A prospect blind tastes Cafe Barra and Blue Bottle and cannot distinguish them reliably",
      "The Barra Process produces exceptional quality only in specific origins — not across all seasonal variants",
      "Premium alternatives have already communicated a similar exceptional framing — the positioning is not distinctive to prospects"
    ],
    "prerequisites": [
      "At least one batch of recent Cafe Barra coffee produced by the Barra Process for comparison",
      "A prospective partner who has direct experience with a premium craft alternative and is willing to do a comparison"
    ],
    "customer_impact": "If the test succeeds: a new partner acquisition argument grounded in direct experience rather than narrative. If it fails: early identification that the quality ceiling claim needs revision before it creates expectation gaps.",
    "operational_impact": "Requires producing comparison-quality samples on demand. Low investment for a one-time test. High value if it confirms or refutes the positioning claim.",
    "confidence_posture": "Positioning claim is coherent and internally consistent. External validation is completely absent. Confidence in the claim should be treated as directional until a comparison test produces evidence in either direction.",
    "movement_condition": "Confidence strengthens when a prospect who has experienced a premium craft alternative chooses Cafe Barra citing quality differentiation. Weakens if multiple comparison tests produce no perceived distinction."
  }'::jsonb,
  ARRAY['67c948c4-5b1c-4910-943e-9004f6db682b', '471a44bc-a868-4c1e-8f21-f8564e3a045a', '0337c3b9-b682-48b6-a6c1-c176b1f8633d'],
  ARRAY['b1000001-cafe-4bcd-9012-cafe79000001'::uuid],
  'fresh', 'unvalidated', 'thin'
) ON CONFLICT (id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- PART D: DECISION → ROUTE LINKAGE
-- ════════════════════════════════════════════════════════════════

INSERT INTO public.decision_routes (id, company_id, decision_id, route_id, relationship, sort_order, created_at)
VALUES
  -- Quality consistency decision: routes 1 and 5 validate it
  ('d1000001-cafe-4bcd-9012-cafe79000001', '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
   'a1000001-cafe-4bcd-9012-cafe79000001', 'e1000001-cafe-4bcd-9012-cafe79000001', 'validation_path', 1, NOW()),
  ('d1000002-cafe-4bcd-9012-cafe79000002', '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
   'a1000001-cafe-4bcd-9012-cafe79000001', 'e5000001-cafe-4bcd-9012-cafe79000001', 'validation_path', 2, NOW()),
  -- Methodology externalization decision: route 3 validates it
  ('d1000003-cafe-4bcd-9012-cafe79000003', '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
   'a1000002-cafe-4bcd-9012-cafe79000002', 'e3000001-cafe-4bcd-9012-cafe79000001', 'validation_path', 1, NOW()),
  -- Methodology decision: route 4 is an expression of it
  ('d1000004-cafe-4bcd-9012-cafe79000004', '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
   'a1000002-cafe-4bcd-9012-cafe79000002', 'e4000001-cafe-4bcd-9012-cafe79000001', 'expression', 2, NOW()),
  -- Growth path decision: route 2 is an expression of it
  ('d1000005-cafe-4bcd-9012-cafe79000005', '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
   'a1000003-cafe-4bcd-9012-cafe79000003', 'e2000001-cafe-4bcd-9012-cafe79000001', 'expression', 1, NOW())
ON CONFLICT (id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- PART E: INITIAL MOVEMENT EVENTS
-- ════════════════════════════════════════════════════════════════

INSERT INTO public.route_decision_events (id, company_id, route_id, event_type, summary_json, created_at)
VALUES
  (
    'f1000001-cafe-4bcd-9012-cafe79000001',
    '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
    'e1000001-cafe-4bcd-9012-cafe79000001',
    'selected',
    '{"route_title": "Build a seasonal consistency signal partner cafes can observe independently",
      "route_category": "create",
      "pressure": "Consistency Proof Pressure",
      "bullets": [
        "The alternatives analysis confirms inconsistency is the defining failure of all craft alternatives.",
        "No consistency artifact exists — this is uncontested ground.",
        "Evidence strong on problem; zero confidence on solution until piloted."
      ],
      "confidence_posture": "directional",
      "evidence_source": "evidence_derived_79"}'::jsonb,
    NOW()
  ),
  (
    'f2000001-cafe-4bcd-9012-cafe79000001',
    '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
    'e5000001-cafe-4bcd-9012-cafe79000001',
    'selected',
    '{"route_title": "Test whether the exceptional positioning holds under direct comparison",
      "route_category": "create",
      "pressure": "Brand Coherence Pressure",
      "bullets": [
        "Positioning claim is internally coherent. External validation is completely absent.",
        "Premium craft comparators identified: Blue Bottle, Stumptown, Equator.",
        "Treat positioning confidence as directional until comparison test runs."
      ],
      "confidence_posture": "directional",
      "evidence_source": "evidence_derived_79"}'::jsonb,
    NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- PART F: SUPERSEDE RECONSTRUCTED ROUTES
-- ════════════════════════════════════════════════════════════════

UPDATE public.routes
SET
  frameworks_used = array_append(frameworks_used, 'superseded_by_evidence_79'),
  dependency_state = 'stale',
  stale_reason = 'Replaced by evidence-derived routes from Phase 79 active file analysis',
  updated_at = NOW()
WHERE company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc'
  AND 'reconstructed_prior' = ANY(frameworks_used)
  AND NOT ('superseded_by_evidence_79' = ANY(frameworks_used));

-- ════════════════════════════════════════════════════════════════
-- PART G: SUMMARY REPORT
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE
  n_decisions   INTEGER;
  n_tensions    INTEGER;
  n_new_routes  INTEGER;
  n_superseded  INTEGER;
  n_dr          INTEGER;
  n_events      INTEGER;
BEGIN
  SELECT COUNT(*) INTO n_decisions FROM public.strategic_decisions WHERE company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc';
  SELECT COUNT(*) INTO n_tensions FROM public.strategic_tensions WHERE company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc';
  SELECT COUNT(*) INTO n_new_routes FROM public.routes WHERE company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc' AND 'evidence_derived_79' = ANY(frameworks_used);
  SELECT COUNT(*) INTO n_superseded FROM public.routes WHERE company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc' AND 'superseded_by_evidence_79' = ANY(frameworks_used);
  SELECT COUNT(*) INTO n_dr FROM public.decision_routes WHERE company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc';
  SELECT COUNT(*) INTO n_events FROM public.route_decision_events WHERE company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc';

  RAISE NOTICE '';
  RAISE NOTICE '=== Phase 79 Route System Summary ===';
  RAISE NOTICE '  Strategic decisions created: %', n_decisions;
  RAISE NOTICE '  Strategic tensions created:  %', n_tensions;
  RAISE NOTICE '  Evidence-derived routes:     %', n_new_routes;
  RAISE NOTICE '  Reconstructed routes superseded: %', n_superseded;
  RAISE NOTICE '  Decision → route links:      %', n_dr;
  RAISE NOTICE '  Movement events:             %', n_events;
END $$;

COMMIT;
