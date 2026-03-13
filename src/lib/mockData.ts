import type {
  ClientData, ClientSummary, ScoreArea, Milestone,
  Opportunity, InputItem, DeepDive, ClientNavConfig,
  JobStep, StrategyCascade, OpportunityOutcome, PositioningCanvas, ScoreHistoryPoint
} from './types';

export const MOCK_CLIENT: ClientData = {
  company_name: 'Edgewood Center for Children & Families',
  quarter: 'Q1 2026',
  tier: 3,
  archetype: 'Mission-Driven Growth',
  last_updated: '2026-03-02',
};

export const MOCK_NAV_CONFIG: ClientNavConfig = {
  show_job_steps: true,
  show_strategy: true,
  show_opps_map: true,
  show_positioning: true,
  show_analytics: false,
};

export const MOCK_SUMMARY: ClientSummary = {
  mojo_score: 38,
  score_delta: 4,
  potential_score: 76,
  key_insights: [
    {
      headline: 'Mission and vision are now *clearly articulated* — but families still can\'t find you.',
      detail: 'Brand Narrative jumped to 85% with formal Why We Exist, Mission, Vision, and boilerplate messaging at multiple lengths. But Competitive Landscape remains at 0% and Referral Source Mapping at 20%. The story is powerful; the pipeline to reach families in crisis is incomplete.',
    },
    {
      headline: 'Positioning is *sharpening* — "reimagine youth mental health" is a bold category claim.',
      detail: 'Category Definition rose to 75% with the mission "We provide the place and the path to reimagine what youth mental health should be." Value Proposition improved to 65% with the one-liner and boilerplate. Competitive validation is the remaining gap.',
    },
  ],
  next_move: 'Complete the competitive landscape mapping — it\'s the highest-impact gap at 0% and the only thing preventing your positioning from being validated against real alternatives.',
  next_move_deadline: 'Apr 1',
  next_move_effort: 'two weeks',
  constraint_area: 'positioning',
  constraint_explanation: 'Referral Pipeline, Outreach, and Fundraising are constrained because Foundation inputs (Competitive Landscape 0%) set a ceiling. Your mission and narrative are strong — competitive context is what\'s missing.',
};

export const MOCK_AREAS: ScoreArea[] = [
  { area_key: 'positioning', area_label: 'Positioning & Story', layer: 1, score: 55.0, trend: 'up', status_note: 'Category (75%) and Differentiators (75%) strengthened with formal mission/vision; Competitive Landscape (0%) remains critical gap', ceiling: null },
  { area_key: 'strategy', area_label: 'Program Strategy', layer: 1, score: 17.5, trend: 'flat', status_note: 'Program models (25%) and needs assessment (10%) need formal documentation', ceiling: null },
  { area_key: 'product', area_label: 'Service Delivery', layer: 2, score: 17.3, trend: 'flat', status_note: 'Outcome measurement (45%) exists but capped by Foundation gap', ceiling: 17.3 },
  { area_key: 'marketing', area_label: 'Awareness & Outreach', layer: 2, score: 17.3, trend: 'up', status_note: 'Brand narrative (85%) now includes formal mission/vision/boilerplate; channel strategy (45%) needs formalization', ceiling: 17.3 },
  { area_key: 'sales', area_label: 'Referral Pipeline', layer: 3, score: 13.8, trend: 'flat', status_note: 'Referral mapping (20%) — intake forms exist but no conversion tracking', ceiling: 13.8 },
  { area_key: 'cx', area_label: 'Family Experience', layer: 3, score: 13.8, trend: 'flat', status_note: 'Satisfaction data (30%) — testimonials collected but no systematic measurement', ceiling: 13.8 },
];

export const MOCK_MILESTONES: Milestone[] = [
  { id: '1', sort_order: 1, title: 'Baseline evaluation from public data', description: 'Website, Impact Report, and public materials assessed to establish starting scores', status: 'current' },
  { id: '2', sort_order: 2, title: 'Competitive landscape mapping', description: 'Map Bay Area alternatives families consider — nonprofits, county services, private therapists', status: 'upcoming' },
  { id: '3', sort_order: 3, title: 'Referral source mapping', description: 'Document all referral pathways, identify conversion rates and untapped sources', status: 'upcoming' },
  { id: '4', sort_order: 4, title: 'Value proposition sharpening', description: 'Differentiate messaging for each audience segment beyond current generic copy', status: 'upcoming' },
  { id: '5', sort_order: 5, title: 'Outreach channel strategy', description: 'Formalize channel-audience mapping and performance tracking across all touchpoints', status: 'upcoming' },
];

export const MOCK_OPPORTUNITIES: Opportunity[] = [
  { id: '1', area_key: 'positioning', sort_order: 1, title: 'Map the competitive landscape', description: 'No competitive mapping exists. Understanding what families compare Edgewood to shapes all outreach, messaging, and referral strategy.', pts_value: 8.0, effort: 'medium', type: 'Fix' },
  { id: '2', area_key: 'sales', sort_order: 2, title: 'Build referral source tracking', description: 'Formstack intake forms capture data but conversion rates and referral source effectiveness are unknown. Systematic tracking would reveal growth levers.', pts_value: 6.0, effort: 'medium', type: 'Fix' },
  { id: '3', area_key: 'marketing', sort_order: 3, title: 'Formalize outreach channel strategy', description: 'Multiple digital and physical channels exist (6 sites, events, Issuu, give.edgewood.org) but no formal audience-channel mapping or performance tracking.', pts_value: 5.0, effort: 'medium', type: 'Improve' },
  { id: '4', area_key: 'positioning', sort_order: 4, title: 'Develop donor impact dashboard', description: 'FY25 Impact Report demonstrates data capability. A real-time donor-facing view would connect giving to measurable outcomes and improve retention.', pts_value: 10.0, effort: 'high', type: 'Create' },
];

export const MOCK_INPUTS: InputItem[] = [
  // Foundation
  { id: '1', input_key: 'comp-alt', input_label: 'Competitive Landscape', group_key: 'foundation', group_label: 'Foundation', sub_group: 'Positioning', completeness: 0, status: 'not_started', score_impact: 0, impact_tier: 'high', description: 'Mapping the alternatives families consider — other Bay Area youth mental health providers, county behavioral health services, private therapists, or forgoing services entirely.', why_it_matters: 'No competitive mapping exists. The Why Us messaging ("current system is ineffective and inefficient") needs competitive proof.', subitems: [], files: [] },
  { id: '2', input_key: 'unique-attr', input_label: 'Unique Differentiators', group_key: 'foundation', group_label: 'Foundation', sub_group: 'Positioning', completeness: 75, status: 'partial', score_impact: 7, impact_tier: 'high', description: '170+ year history, 300+ professionals, 6 locations, 16+ programs, 5,000+ served annually, full continuum, trauma-informed culture, "People. Place. Path." Why Us: "post-COVID crisis multiplied, current system ineffective, Edgewood changing this."', why_it_matters: 'Differentiators now include formal Why Us narrative. Missing only competitive validation.', subitems: [], files: [] },
  { id: '3', input_key: 'val-prop', input_label: 'Value Proposition by Audience', group_key: 'foundation', group_label: 'Foundation', sub_group: 'Positioning', completeness: 65, status: 'partial', score_impact: 6, impact_tier: 'med', description: 'One-liner: "Edgewood\'s expertise, energy, and resources are entirely focused on delivering life-changing youth mental and behavioral health care that works." Boilerplate at 100/500-word lengths. Still needs per-audience differentiation.', why_it_matters: 'Formal value proposition now exists at multiple lengths. Per-audience variations still needed.', subitems: [], files: [] },
  { id: '4', input_key: 'target-aud', input_label: 'Target Audiences', group_key: 'foundation', group_label: 'Foundation', sub_group: 'Positioning', completeness: 60, status: 'partial', score_impact: 6, impact_tier: 'med', description: 'Parents & Caregivers, Teens (13-17), Young Adults (18-26), Partners & Providers — with dedicated intake forms. Vision targets "Bay Area" specifically.', why_it_matters: 'Segments well-defined. Behavioral profiles and prioritization needed.', subitems: [], files: [] },
  { id: '5', input_key: 'market-cat', input_label: 'Category Definition', group_key: 'foundation', group_label: 'Foundation', sub_group: 'Positioning', completeness: 75, status: 'partial', score_impact: 7, impact_tier: 'high', description: 'Mission: "We provide the place and the path to reimagine what youth mental health should be." Vision: "A Bay Area where there is no doubt where to turn when confronted with a youth mental health crisis."', why_it_matters: 'Category definition elevated from description to aspiration. Testing with audiences would validate.', subitems: [], files: [] },
  { id: '6', input_key: 'program-model', input_label: 'Program Logic Models', group_key: 'foundation', group_label: 'Foundation', sub_group: 'Strategy', completeness: 25, status: 'partial', score_impact: 3, impact_tier: 'med', description: 'Why We Exist references "power of early intervention, family-centered support, and specialized treatment." Programs documented. Formal logic models not visible.', why_it_matters: 'Theory of change articulated qualitatively. Formal models needed for grants.', subitems: [], files: [] },
  { id: '7', input_key: 'needs-assessment', input_label: 'Community Needs Assessment', group_key: 'foundation', group_label: 'Foundation', sub_group: 'Strategy', completeness: 10, status: 'gap', score_impact: 1, impact_tier: 'low', description: 'Why Us references pre/post-COVID crisis. FY25 report cites "94% of CA youth." No formal needs assessment for 3-county area.', why_it_matters: 'Urgency well-articulated but no formal assessment specific to service area.', subitems: [], files: [] },
  // Execution
  { id: '8', input_key: 'outcome-data', input_label: 'Outcome Measurement', group_key: 'execution', group_label: 'Execution', sub_group: 'Service Delivery', completeness: 45, status: 'partial', score_impact: 5, impact_tier: 'med', description: 'FY25 + FY24 Impact Reports. Boilerplate cites "approximately 5,000 children, youth, and families annually." Kinship saves "$6.5B annually." Standardization unconfirmed.', why_it_matters: 'Two annual reports and formal messaging include quantified outcomes. Standardization needed.', subitems: [], files: [] },
  { id: '9', input_key: 'referral-map', input_label: 'Referral Source Mapping', group_key: 'execution', group_label: 'Execution', sub_group: 'Referral Pipeline', completeness: 20, status: 'gap', score_impact: 2, impact_tier: 'high', description: 'Intake forms, 24/7 crisis line, Partners/Providers referral form. Why Us acknowledges "suffered from lack of awareness and ease of access."', why_it_matters: 'Leadership acknowledges the access problem. Infrastructure exists but no conversion tracking.', subitems: [], files: [] },
  { id: '10', input_key: 'brand-narrative', input_label: 'Brand Narrative', group_key: 'execution', group_label: 'Execution', sub_group: 'Awareness', completeness: 85, status: 'partial', score_impact: 9, impact_tier: 'med', description: 'Now includes: formal Why We Exist, Why Us, Mission, Vision, one-liner, boilerplate at 100/500-word lengths. Plus heritage story, centennial video, "People. Place. Path.", 7+ testimonials, CEO letter. Audience-specific variations still needed.', why_it_matters: 'One of Edgewood\'s strongest assets. Only audience-specific variations remain.', subitems: [], files: [] },
  { id: '11', input_key: 'channel-strat', input_label: 'Outreach Channel Strategy', group_key: 'execution', group_label: 'Execution', sub_group: 'Awareness', completeness: 45, status: 'partial', score_impact: 5, impact_tier: 'high', description: 'Multiple channels exist (6 sites, events, Issuu, give.edgewood.org) but no formal audience-channel mapping or performance tracking.', why_it_matters: 'Sophisticated multi-channel approach. Formal strategy with audience-channel mapping needed.', subitems: [], files: [] },
  // Market Evidence
  { id: '12', input_key: 'donor-retention', input_label: 'Donor Retention Analysis', group_key: 'market_evidence', group_label: 'Market Evidence', sub_group: 'Fundraising', completeness: 15, status: 'gap', score_impact: 2, impact_tier: 'med', description: 'Give platform, Auxiliary, "Place to Begin" campaign, Grace Magill Fund, 60th Fair, Corporate Impact Days.', why_it_matters: 'Robust fundraising infrastructure but no retention data.', subitems: [], files: [] },
  { id: '13', input_key: 'family-satisfaction', input_label: 'Family Satisfaction Data', group_key: 'market_evidence', group_label: 'Market Evidence', sub_group: 'Family Experience', completeness: 30, status: 'partial', score_impact: 3, impact_tier: 'low', description: '7+ testimonials, 3 FY25 impact stories, complaint procedures. No NPS or systematic surveys.', why_it_matters: 'Rich testimonials but systematic tracking needed.', subitems: [], files: [] },
  { id: '14', input_key: 'grant-pipeline', input_label: 'Grant Pipeline & Win Rate', group_key: 'market_evidence', group_label: 'Market Evidence', sub_group: 'Fundraising', completeness: 5, status: 'gap', score_impact: 1, impact_tier: 'med', description: '"Place to Begin" campaign on Issuu. No pipeline tracking visible.', why_it_matters: 'Active campaigns suggest sophistication. Pipeline tracking needed.', subitems: [], files: [] },
];

export const MOCK_DEEP_DIVES: Record<string, DeepDive> = {
  positioning: {
    area_key: 'positioning',
    why_it_matters: 'Positioning is the foundation of how families find Edgewood, donors fund it, and partners refer to it. With a formal mission ("reimagine what youth mental health should be") and vision ("no doubt where to turn"), the strategic intent is clear — but competitive proof is missing.',
    what_we_found: 'Positioning has strengthened significantly with formal messaging:\n\n**Mission**: "We provide the place and the path to reimagine what youth mental health should be."\n**Vision**: "A Bay Area where there is no doubt where to turn when confronted with a youth mental health crisis."\n**Why Us**: "Pre-COVID we were already in a crisis situation — post-COVID the problem has multiplied. Edgewood has been helping youth for over 170 years, but we have suffered from a lack of awareness and ease of access. Today, we are changing this."\n\nCategory definition rose to 75% with this aspirational framing. Unique differentiators improved to 75% with the formal Why Us narrative. Value proposition rose to 65% with the one-liner and boilerplate messaging at multiple lengths.\n\nHowever, **competitive landscape remains at 0%** — no mapping of alternatives exists. The bold claim to "reimagine youth mental health" needs competitive context to land. Value propositions still lack per-audience differentiation.',
    what_good_looks_like: 'A nonprofit with strong positioning can answer "why us?" for each audience in one sentence. Referral partners have clear criteria for when to refer to Edgewood vs. alternatives. The mission to "reimagine" is validated by evidence that alternatives are failing.\n\nThe benchmark for mature nonprofit positioning is 80–85.',
    path_forward: [
      { step: 'Complete competitive landscape mapping', duration: '2 weeks', owner: 'Development + Strategist', impact_pts: 8.0, action_label: 'Suggested' },
      { step: 'Conduct 5+ family decision-journey interviews', duration: '3 weeks', owner: 'Program team', impact_pts: 3.0, action_label: 'Suggested' },
      { step: 'Differentiate value propositions per audience segment', duration: '1 week', owner: 'Marketing + Strategist', impact_pts: 4.0, action_label: 'Suggested' },
    ],
    holding_back: [
      { gap: 'No competitive landscape mapping', description: 'Zero competitive data visible. The "current system is ineffective" claim in Why Us needs competitive evidence to substantiate.' },
      { gap: 'Generic value propositions', description: 'One-liner and boilerplate are strong at the organizational level. Per-audience variations for families, teens, young adults, and partners are still missing.' },
    ],
  },
  strategy: {
    area_key: 'strategy',
    why_it_matters: 'Program strategy connects community needs to Edgewood\'s 15+ programs and determines where to invest for maximum impact.',
    what_we_found: 'Programs are extensively described on the website with a clear continuum of care documented on the About page. The FY25 Impact Report has a "Measuring Impact" section suggesting internal outcome tracking.\n\nHowever, **program logic models are only 25% complete** — the continuum is mapped but formal inputs→activities→outputs→outcomes models are not publicly visible. **Community needs assessment is at 10%** — the FY25 report cites the BlueSky/Blue Shield survey (94% stat) but no formal assessment for the 3-county service area exists.\n\nThese scores reflect publicly visible information only. Internal documentation may exist.',
    what_good_looks_like: 'Mission-driven organizations with strong strategy have formal logic models for each program, a needs assessment that drives resource allocation, and clear entry/exit criteria across the continuum of care.',
    path_forward: [
      { step: 'Document formal logic models for each program area', duration: '4 weeks', owner: 'Program Directors', impact_pts: 3.0, action_label: 'Suggested' },
      { step: 'Conduct 3-county community needs assessment', duration: '6 weeks', owner: 'Research + Programs', impact_pts: 1.0, action_label: 'Suggested' },
    ],
    holding_back: [
      { gap: 'No formal logic models', description: 'Programs are well-described but lack formal theory-of-change documentation needed for grants and evaluation.' },
      { gap: 'No community needs assessment', description: 'External data is cited but no formal assessment specific to SF, San Mateo, and Contra Costa counties.' },
    ],
  },
  product: {
    area_key: 'product',
    why_it_matters: 'Service delivery is where Edgewood\'s mission becomes real. Outcome data proves impact to funders and families.',
    what_we_found: 'Outcome measurement is at 45%. Two annual reports (FY24, FY25) demonstrate commitment with quantitative data: 4,016 served, 2,000+ in prevention/early intervention, 500 crisis admissions. The "Measuring Impact" section in the FY25 report suggests analytics capability.\n\nHowever, standardized outcome measures across all programs are not confirmed publicly. Real-time dashboards are not visible. Score is capped by Foundation gaps.',
    what_good_looks_like: 'Best-in-class service organizations have standardized outcome measures across all programs, real-time dashboards, and national benchmarking comparisons.',
    path_forward: [
      { step: 'Confirm standardized outcome measures across programs', duration: '2 weeks', owner: 'Clinical leadership', impact_pts: 5.0, action_label: 'Suggested — needs client verification' },
      { step: 'Build real-time outcome dashboards', duration: '6 weeks', owner: 'Data + IT team', impact_pts: 3.0, action_label: 'Suggested' },
    ],
    holding_back: [
      { gap: 'Outcome standardization unconfirmed', description: 'Impact reports show data collection capability but standardized measures across all 15+ programs are not visible publicly.' },
    ],
  },
  marketing: {
    area_key: 'marketing',
    why_it_matters: 'Awareness and outreach determine whether families in crisis can find Edgewood. Leadership acknowledges "we have suffered from a lack of awareness and ease of access" — making this a recognized priority.',
    what_we_found: 'Brand narrative jumped to 85% — now includes formal Why We Exist ("every child deserves a chance to thrive"), Why Us (post-COVID crisis framing, 170+ year track record), Mission, Vision, one-liner, and boilerplate messaging at 100-word and 500-word lengths. Combined with the heritage story, centennial video, 7+ testimonials, "People. Place. Path." tagline, and CEO letter, the narrative foundation is now one of Edgewood\'s strongest assets.\n\nChannel strategy remains at 45% — sophisticated multi-channel infrastructure (6 sites, events, Issuu, Give platform, Formstack, Calendly) exists but lacks formal audience-channel mapping and performance tracking. The gap between narrative strength (85%) and channel strategy (45%) suggests the story is ready but the distribution isn\'t optimized.',
    what_good_looks_like: 'Strong nonprofit outreach has formal audience-channel mapping, performance metrics per channel, and narrative variations tailored to each audience segment.',
    path_forward: [
      { step: 'Map audience-channel alignment', duration: '1 week', owner: 'Marketing + Strategist', impact_pts: 5.0, action_label: 'Suggested' },
      { step: 'Develop audience-specific narrative variations', duration: '2 weeks', owner: 'Marketing', impact_pts: 3.0, action_label: 'Suggested' },
      { step: 'Implement channel performance tracking', duration: '3 weeks', owner: 'Marketing + Data', impact_pts: 2.0, action_label: 'Suggested' },
    ],
    holding_back: [
      { gap: 'No formal channel strategy', description: 'Multiple channels exist but no audience-channel mapping or performance tracking.' },
      { gap: 'Generic narrative across audiences', description: 'Strong core narrative but no tailored variations for families, donors, partners, and government.' },
    ],
  },
  sales: {
    area_key: 'sales',
    why_it_matters: 'The referral pipeline is how families reach Edgewood. It\'s the equivalent of a sales funnel — and it determines who gets served.',
    what_we_found: 'Referral source mapping is at 20%. Infrastructure is better than expected: 4 audience-specific Formstack intake forms on /connect-with-us, a dedicated Partners & Providers referral form with service checkboxes (CSU, PHP, IOP, NPS, therapy, testing, residential), 24/7 crisis line, and a general phone line.\n\nHowever, no systematic referral source tracking is visible. Conversion rates from referral to intake are unknown. There\'s no data on which sources convert best or why families drop off.',
    what_good_looks_like: 'Top nonprofits track referral-to-intake conversion by source, follow up within 24 hours, and systematically nurture the top 20 referral partners.',
    path_forward: [
      { step: 'Map all current referral sources and volumes', duration: '1 week', owner: 'Intake + Data team', impact_pts: 2.0, action_label: 'Suggested' },
      { step: 'Analyze Formstack data for referral patterns', duration: '2 weeks', owner: 'Data team', impact_pts: 3.0, action_label: 'Suggested' },
      { step: 'Build referral partner toolkit', duration: '3 weeks', owner: 'Community Relations', impact_pts: 4.0, action_label: 'Suggested' },
    ],
    holding_back: [
      { gap: 'No referral conversion tracking', description: 'Intake forms capture data but there\'s no visible analysis of which referral sources convert best.' },
      { gap: 'No systematic partner nurturing', description: 'Relationships depend on individual staff rather than organizational systems.' },
    ],
  },
  cx: {
    area_key: 'cx',
    why_it_matters: 'Family experience determines whether families complete programs, recommend Edgewood, and return if they need help again.',
    what_we_found: 'Family satisfaction data is at 30%. There are 7+ testimonials on the homepage, 3 in-depth stories in the FY25 Impact Report, and complaint procedures are published on /connect-with-us.\n\nHowever, no systematic satisfaction measurement (NPS, post-program surveys) is confirmed publicly. No journey friction point analysis is visible. Donor retention analysis (15%) shows fundraising infrastructure exists but lacks measurement.',
    what_good_looks_like: 'Best-in-class family experience means post-program surveys with NPS tracking, journey friction analysis, warm handoffs between programs, and proactive check-ins after graduation.',
    path_forward: [
      { step: 'Implement post-program family surveys', duration: '3 weeks', owner: 'Programs + CX', impact_pts: 3.0, action_label: 'Suggested' },
      { step: 'Run donor retention cohort analysis', duration: '2 weeks', owner: 'Development team', impact_pts: 2.0, action_label: 'Suggested' },
    ],
    holding_back: [
      { gap: 'No systematic satisfaction measurement', description: 'Testimonials show positive sentiment but no NPS or structured surveys confirmed.' },
      { gap: 'No donor retention analysis', description: 'Robust fundraising infrastructure but no cohort analysis or retention data.' },
    ],
  },
};

// === Extended Views Mock Data ===

export const MOCK_JOB_STEPS: JobStep[] = [
  { step_number: 1, step_label: 'Recognize Need', description: 'Family recognizes their child needs mental health support', designed: true, has_gap: false, outcomes: [
    { id: 'o1', outcome: 'Understand warning signs that suggest professional help is needed', importance: 9.5, satisfaction: 5.2, opportunity_score: 13.8, priority: 'focus' },
    { id: 'o2', outcome: 'Feel confident that seeking help is the right decision', importance: 9.0, satisfaction: 6.0, opportunity_score: 12.0, priority: 'focus' },
  ]},
  { step_number: 2, step_label: 'Find Help', description: 'Family searches for appropriate mental health services in the Bay Area', designed: true, has_gap: true, gap_note: 'No competitive landscape mapping — families can\'t easily compare Edgewood to alternatives. Website serves those who already know about Edgewood but doesn\'t help families in the discovery phase.', outcomes: [
    { id: 'o3', outcome: 'Find a provider that specializes in their child\'s specific needs', importance: 9.8, satisfaction: 4.0, opportunity_score: 15.6, priority: 'focus' },
    { id: 'o4', outcome: 'Understand what different program types offer (crisis, residential, outpatient)', importance: 8.5, satisfaction: 5.5, opportunity_score: 11.5, priority: 'focus' },
  ]},
  { step_number: 3, step_label: 'Get Referred', description: 'Family receives a referral from a school, pediatrician, or county agency', designed: true, has_gap: true, gap_note: 'Partners & Providers referral form exists with service checkboxes, but referral partners lack clear criteria for when Edgewood is the right choice vs. alternatives. No referral conversion tracking.', outcomes: [
    { id: 'o5', outcome: 'Receive a warm introduction rather than a cold handoff', importance: 9.2, satisfaction: 5.5, opportunity_score: 12.9, priority: 'focus' },
    { id: 'o6', outcome: 'Feel informed about what to expect from the intake process', importance: 8.8, satisfaction: 6.2, opportunity_score: 11.4, priority: 'focus' },
  ]},
  { step_number: 4, step_label: 'Connect & Intake', description: 'Family uses one of the 4 audience-specific Formstack forms or calls the crisis line', designed: true, has_gap: false, outcomes: [
    { id: 'o7', outcome: 'Complete intake without excessive burden across audience-specific forms', importance: 8.0, satisfaction: 6.5, opportunity_score: 9.5, priority: 'monitor' },
    { id: 'o8', outcome: 'Feel heard and understood during initial assessment', importance: 9.5, satisfaction: 8.0, opportunity_score: 11.0, priority: 'monitor' },
  ]},
  { step_number: 5, step_label: 'Receive Services', description: 'Child and family participate in one of 15+ programs across the continuum of care', designed: true, has_gap: false, outcomes: [
    { id: 'o9', outcome: 'See meaningful progress in their child\'s mental health', importance: 9.8, satisfaction: 7.8, opportunity_score: 11.8, priority: 'monitor' },
    { id: 'o10', outcome: 'Feel involved and informed throughout the treatment process', importance: 9.0, satisfaction: 7.5, opportunity_score: 10.5, priority: 'monitor' },
  ]},
  { step_number: 6, step_label: 'Transition Between Programs', description: 'Family moves between crisis, residential, outpatient, or community services within the continuum', designed: true, has_gap: true, gap_note: 'Continuum of care is well-documented on the website but transition experience data is not available. Satisfaction during handoffs is unconfirmed.', outcomes: [
    { id: 'o11', outcome: 'Experience a seamless handoff with no gaps in care', importance: 9.5, satisfaction: 5.0, opportunity_score: 14.0, priority: 'focus' },
    { id: 'o12', outcome: 'Maintain relationship continuity with trusted staff', importance: 8.5, satisfaction: 5.0, opportunity_score: 12.0, priority: 'focus' },
  ]},
  { step_number: 7, step_label: 'Graduate', description: 'Family completes the program and transitions to community support or independence', designed: true, has_gap: true, gap_note: 'No visible post-program follow-up protocol or alumni connection. Family Resource Center and Kinship Support offer ongoing resources but transition support is unconfirmed.', outcomes: [
    { id: 'o13', outcome: 'Feel prepared to maintain progress independently', importance: 9.0, satisfaction: 6.0, opportunity_score: 12.0, priority: 'focus' },
    { id: 'o14', outcome: 'Know how to access support if they need help again', importance: 8.5, satisfaction: 5.8, opportunity_score: 11.2, priority: 'focus' },
  ]},
  { step_number: 8, step_label: 'Advocate & Give', description: 'Family shares their experience, refers others, or supports Edgewood through giving and volunteering', designed: true, has_gap: false, outcomes: [
    { id: 'o15', outcome: 'Share their story to help other families (7+ testimonials collected)', importance: 6.5, satisfaction: 7.0, opportunity_score: 6.0, priority: 'defer' },
    { id: 'o16', outcome: 'Stay connected through volunteering, Auxiliary, or giving', importance: 5.5, satisfaction: 6.0, opportunity_score: 5.0, priority: 'defer' },
  ]},
];

export const MOCK_INTERNAL_JOB_STEPS: JobStep[] = [
  { step_number: 1, step_label: 'Discover Mission', description: 'Potential donor or funder first learns about Edgewood\'s work through events, media, or word-of-mouth', designed: true, has_gap: true, gap_note: 'Brand awareness is strong in service delivery circles but weak among high-net-worth individuals and corporate sponsors.', outcomes: [
    { id: 'i1', outcome: 'Understand the scope and urgency of the youth mental health crisis', importance: 9.0, satisfaction: 6.5, opportunity_score: 11.5, priority: 'focus' },
    { id: 'i2', outcome: 'Feel emotionally connected to the mission before being asked to give', importance: 8.5, satisfaction: 5.0, opportunity_score: 12.0, priority: 'focus' },
  ]},
  { step_number: 2, step_label: 'Evaluate Impact', description: 'Donor reviews Edgewood\'s outcomes data, annual reports, and program effectiveness', designed: true, has_gap: true, gap_note: 'FY24 and FY25 impact reports exist but lack comparative benchmarks.', outcomes: [
    { id: 'i3', outcome: 'Access clear, credible evidence of program outcomes', importance: 9.5, satisfaction: 6.0, opportunity_score: 13.0, priority: 'focus' },
    { id: 'i4', outcome: 'Compare Edgewood\'s impact to industry benchmarks', importance: 7.5, satisfaction: 3.5, opportunity_score: 11.5, priority: 'focus' },
  ]},
  { step_number: 3, step_label: 'Make First Gift', description: 'Donor makes their initial contribution through the website, event, or direct outreach', designed: true, has_gap: false, outcomes: [
    { id: 'i5', outcome: 'Complete donation with minimal friction across any channel', importance: 8.0, satisfaction: 7.5, opportunity_score: 8.5, priority: 'monitor' },
    { id: 'i6', outcome: 'Feel immediately acknowledged and valued', importance: 8.5, satisfaction: 7.0, opportunity_score: 10.0, priority: 'monitor' },
  ]},
  { step_number: 4, step_label: 'See Impact', description: 'Donor receives updates on how their contribution is making a difference', designed: true, has_gap: true, gap_note: 'Ongoing impact reporting to individual donors is inconsistent. No personalized impact dashboards.', outcomes: [
    { id: 'i7', outcome: 'Receive personalized updates showing what their gift enabled', importance: 9.0, satisfaction: 4.5, opportunity_score: 13.5, priority: 'focus' },
    { id: 'i8', outcome: 'Feel their contribution is meaningful, not just a line item', importance: 9.2, satisfaction: 5.5, opportunity_score: 12.9, priority: 'focus' },
  ]},
  { step_number: 5, step_label: 'Deepen Engagement', description: 'Donor moves beyond giving to volunteering, attending events, or joining the Auxiliary', designed: true, has_gap: false, outcomes: [
    { id: 'i9', outcome: 'Find meaningful ways to contribute beyond financial support', importance: 7.5, satisfaction: 7.0, opportunity_score: 8.0, priority: 'monitor' },
    { id: 'i10', outcome: 'Build personal relationships with staff and other supporters', importance: 7.0, satisfaction: 6.5, opportunity_score: 7.5, priority: 'defer' },
  ]},
  { step_number: 6, step_label: 'Increase Giving', description: 'Donor upgrades their giving level, joins a giving circle, or makes a multi-year pledge', designed: false, has_gap: true, gap_note: 'No structured upgrade pathway or giving tiers. Donors aren\'t proactively invited to increase their impact.', outcomes: [
    { id: 'i11', outcome: 'Understand what higher giving levels can unlock', importance: 8.0, satisfaction: 3.0, opportunity_score: 13.0, priority: 'focus' },
    { id: 'i12', outcome: 'Feel recognized at appropriate levels without pressure', importance: 8.5, satisfaction: 5.0, opportunity_score: 12.0, priority: 'focus' },
  ]},
  { step_number: 7, step_label: 'Champion & Advocate', description: 'Donor becomes a public champion — sharing Edgewood\'s story and leveraging networks', designed: false, has_gap: true, gap_note: 'No formal ambassador or champion program. No toolkit, talking points, or structured peer-to-peer fundraising.', outcomes: [
    { id: 'i13', outcome: 'Have tools and stories to effectively advocate for Edgewood', importance: 7.5, satisfaction: 3.5, opportunity_score: 11.5, priority: 'focus' },
    { id: 'i14', outcome: 'Feel empowered as an insider, not just a donor', importance: 8.0, satisfaction: 4.0, opportunity_score: 12.0, priority: 'focus' },
  ]},
  { step_number: 8, step_label: 'Leave Legacy', description: 'Donor considers planned giving, endowment contributions, or naming opportunities', designed: false, has_gap: true, gap_note: 'No visible planned giving program or legacy society. Estate/planned giving not mentioned on the website.', outcomes: [
    { id: 'i15', outcome: 'Understand planned giving options and their lasting impact', importance: 6.5, satisfaction: 2.0, opportunity_score: 11.0, priority: 'focus' },
    { id: 'i16', outcome: 'Feel their legacy will be honored and sustained', importance: 7.0, satisfaction: 3.0, opportunity_score: 11.0, priority: 'focus' },
  ]},
];

export const MOCK_NONPROFIT_OPS_STEPS: JobStep[] = [
  { step_number: 1, step_label: 'Define Mission & Strategy', description: 'Articulate purpose, set strategic goals, and develop a theory of change that maps how the organization\'s work leads to impact', designed: true, has_gap: false, outcomes: [
    { id: 'np1', outcome: 'Articulate the core problem or need the organization addresses', importance: 9.8, satisfaction: 8.0, opportunity_score: 11.6, priority: 'monitor' },
    { id: 'np2', outcome: 'Set long-term outcomes and success metrics', importance: 9.5, satisfaction: 6.5, opportunity_score: 12.5, priority: 'focus' },
    { id: 'np3', outcome: 'Map how work leads to impact via a theory of change', importance: 9.0, satisfaction: 5.5, opportunity_score: 12.5, priority: 'focus' },
  ]},
  { step_number: 2, step_label: 'Fundraising & Resources', description: 'Identify funding sources (grants, donations, sponsorships, events), write proposals, and steward donor relationships', designed: true, has_gap: true, gap_note: 'Donor stewardship and impact reporting to funders is inconsistent. Grant pipeline management lacks a centralized system.', outcomes: [
    { id: 'np4', outcome: 'Identify and diversify funding sources across grants, donations, and sponsorships', importance: 9.5, satisfaction: 6.0, opportunity_score: 13.0, priority: 'focus' },
    { id: 'np5', outcome: 'Write winning grant proposals aligned with funder priorities', importance: 9.0, satisfaction: 7.0, opportunity_score: 11.0, priority: 'monitor' },
    { id: 'np6', outcome: 'Build relationships, thank donors, and report impact consistently', importance: 9.2, satisfaction: 4.5, opportunity_score: 13.9, priority: 'focus' },
  ]},
  { step_number: 3, step_label: 'Program Design & Delivery', description: 'Design initiatives aligned with mission, hire and train staff and volunteers, and execute programs in the community', designed: true, has_gap: false, outcomes: [
    { id: 'np7', outcome: 'Develop programs directly aligned with mission and community needs', importance: 9.5, satisfaction: 8.0, opportunity_score: 11.0, priority: 'monitor' },
    { id: 'np8', outcome: 'Recruit and train the right team to deliver programs effectively', importance: 9.0, satisfaction: 7.5, opportunity_score: 10.5, priority: 'monitor' },
    { id: 'np9', outcome: 'Execute services reliably in the community or target area', importance: 9.5, satisfaction: 8.0, opportunity_score: 11.0, priority: 'monitor' },
  ]},
  { step_number: 4, step_label: 'Operations & Admin', description: 'Manage budgeting, accounting, tax filings (Form 990), legal compliance, HR, payroll, and organizational infrastructure', designed: true, has_gap: true, gap_note: 'Financial reporting is strong but HR processes and benefits administration need modernization. Compliance tracking is manual.', outcomes: [
    { id: 'np10', outcome: 'Maintain accurate budgeting, accounting, and tax filings', importance: 9.0, satisfaction: 7.5, opportunity_score: 10.5, priority: 'monitor' },
    { id: 'np11', outcome: 'Ensure nonprofit status and legal compliance across jurisdictions', importance: 8.5, satisfaction: 7.0, opportunity_score: 10.0, priority: 'monitor' },
    { id: 'np12', outcome: 'Manage employment, contracts, and benefits effectively', importance: 8.0, satisfaction: 5.5, opportunity_score: 10.5, priority: 'monitor' },
  ]},
  { step_number: 5, step_label: 'Monitoring & Evaluation', description: 'Collect data to assess outcomes, report results to stakeholders, and iterate programs based on feedback', designed: true, has_gap: true, gap_note: 'Outcome measurement exists for some programs but is not standardized. No unified data dashboard for leadership.', outcomes: [
    { id: 'np13', outcome: 'Measure impact with consistent data collection across all programs', importance: 9.5, satisfaction: 5.0, opportunity_score: 14.0, priority: 'focus' },
    { id: 'np14', outcome: 'Share results transparently with funders, the public, and partners', importance: 9.0, satisfaction: 6.0, opportunity_score: 12.0, priority: 'focus' },
    { id: 'np15', outcome: 'Adjust programs based on evidence and feedback loops', importance: 8.5, satisfaction: 5.5, opportunity_score: 11.5, priority: 'focus' },
  ]},
  { step_number: 6, step_label: 'Marketing & Advocacy', description: 'Raise awareness through social media, PR, and events; engage the community; and advocate for systemic change', designed: true, has_gap: true, gap_note: 'Social media presence exists but lacks a cohesive content strategy. Policy advocacy efforts are ad hoc rather than systematic.', outcomes: [
    { id: 'np16', outcome: 'Raise awareness using social media, PR, and events effectively', importance: 8.5, satisfaction: 5.0, opportunity_score: 12.0, priority: 'focus' },
    { id: 'np17', outcome: 'Build community support and active participation', importance: 8.0, satisfaction: 6.0, opportunity_score: 10.0, priority: 'monitor' },
    { id: 'np18', outcome: 'Lobby for systemic change related to the mission', importance: 7.5, satisfaction: 4.0, opportunity_score: 11.0, priority: 'focus' },
  ]},
  { step_number: 7, step_label: 'Governance & Board', description: 'Board ensures mission alignment and fiscal responsibility, aligns on long-term strategy, and holds leadership accountable', designed: true, has_gap: false, outcomes: [
    { id: 'np19', outcome: 'Ensure board provides effective mission alignment and fiscal oversight', importance: 9.0, satisfaction: 7.5, opportunity_score: 10.5, priority: 'monitor' },
    { id: 'np20', outcome: 'Align board and leadership on long-term strategic goals', importance: 8.5, satisfaction: 7.0, opportunity_score: 10.0, priority: 'monitor' },
    { id: 'np21', outcome: 'Hold executive leadership accountable with clear metrics', importance: 8.5, satisfaction: 6.5, opportunity_score: 10.5, priority: 'monitor' },
  ]},
];

export const MOCK_STRATEGY_CASCADE: StrategyCascade = {
  winning_aspiration: '"A Bay Area where there is no doubt where to turn when confronted with a youth mental health crisis." Edgewood aspires to be the unambiguous first choice — not just a provider, but the system reimagined.',
  where_to_play: 'Youth (ages 0–26) and families in the San Francisco Bay Area experiencing mental health challenges, abuse, neglect, and family crises. Four defined audience segments: Parents & Caregivers, Teens (13-17), Young Adults (18-26), Partners & Providers. Six locations across SF, San Mateo, and Contra Costa counties. Over 16 innovative programs reaching 5,000+ children and youth annually.',
  how_to_win: 'Edgewood wins by proving "that we can intentionally change the youth mental health system to work for the good of youth and families, at scale." As the oldest children\'s nonprofit in the western US (est. 1851), Edgewood\'s expertise, energy, and resources are entirely focused on delivering life-changing care — with 300+ professionals, many with lived experience, a full continuum from 24/7 crisis to community support, and a family-centered approach grounded in trauma-informed principles.',
  capabilities: [
    { name: '24/7 Crisis Stabilization', status: 'strong' },
    { name: 'Residential Treatment Programs', status: 'strong' },
    { name: 'Outpatient & Community Services (16+ programs)', status: 'strong' },
    { name: 'Kinship Support Network (pioneered 1993, $6.5B savings)', status: 'strong' },
    { name: 'Outcome Measurement & Reporting', status: 'developing' },
    { name: 'Digital Presence & Family Discovery', status: 'developing' },
    { name: 'Referral Partner Management', status: 'gap' },
  ],
  management_systems: [
    { name: 'Clinical Quality & Compliance', status: 'strong' },
    { name: 'Impact Reporting (FY24 + FY25)', status: 'strong' },
    { name: 'Fundraising Infrastructure', status: 'developing' },
    { name: 'Brand & Mission Messaging', status: 'strong' },
    { name: 'Referral Conversion Tracking', status: 'gap' },
    { name: 'Donor Retention Analysis', status: 'gap' },
  ],
  assumptions: [
    { assumption: 'The youth mental health system can be intentionally changed to work at scale', tested: false, outcome: 'Core mission assumption — needs measurable proof points' },
    { assumption: 'Families prefer a continuum of care over individual point solutions', tested: false, outcome: 'Suggested — needs validation through family interviews' },
    { assumption: 'Referral partners will actively refer if given clear criteria and outcomes data', tested: false, outcome: 'Suggested — needs validation through referral partner toolkit pilot' },
    { assumption: '"Lack of awareness and ease of access" is the primary barrier (not quality or capacity)', tested: false, outcome: 'Stated in Why Us — needs competitive research to confirm' },
    { assumption: 'Post-COVID demand increase is sustained, not temporary', tested: false, outcome: 'Suggested — needs trend data analysis' },
    { assumption: '"People. Place. Path." tagline resonates across all audience segments', tested: false, outcome: 'Suggested — tagline is used consistently but audience resonance is untested' },
  ],
};

export const MOCK_OPPORTUNITY_OUTCOMES: OpportunityOutcome[] = MOCK_JOB_STEPS.flatMap(step =>
  step.outcomes.map(o => ({
    id: o.id,
    outcome: o.outcome,
    step_number: step.step_number,
    step_label: step.step_label,
    importance: o.importance,
    satisfaction: o.satisfaction,
    opportunity_score: o.opportunity_score,
    priority_tier: o.priority as 'focus' | 'monitor' | 'defer',
  }))
);

export const MOCK_POSITIONING_CANVAS: PositioningCanvas = {
  competitive_alternatives: [
    { id: 'ca1', name: 'Private Therapists & Practices', description: 'Individual therapists or group practices — accessible but lack continuum of care, crisis capability, and specialized youth focus. (Suggested — needs client verification)' },
    { id: 'ca2', name: 'County Mental Health Services', description: 'Government-provided services — free but typically long waitlists, high caseloads, and limited program variety. The "ineffective and inefficient" system referenced in Why Us. (Suggested — needs client verification)' },
    { id: 'ca3', name: 'Other Bay Area Youth Nonprofits', description: 'Organizations like Seneca, Fred Finch, or StarVista — similar mission but different specializations and geographic reach. (Suggested — needs client verification)' },
    { id: 'ca4', name: 'Do Nothing / Wait It Out', description: 'Families delay seeking help hoping things improve — often the most common "competitor" and the most dangerous. (Suggested — needs client verification)' },
  ],
  unique_attributes: [
    { id: 'ua1', name: 'Full Continuum of Care', description: 'From 24/7 crisis stabilization to residential to outpatient to community services — all under one organization. "We provide the place and the path." Verified from edgewood.org.', highlighted: true },
    { id: 'ua2', name: '170+ Years, Oldest in the West', description: 'Serving Bay Area families since 1851. "The oldest children\'s nonprofit in the western United States." Centennial celebrated at Vicente campus. Verified from edgewood.org.', highlighted: true },
    { id: 'ua3', name: 'System Reimagination Mission', description: '"On a mission to prove that we can intentionally change the youth mental health system to work for the good of youth and families, at scale." Goes beyond service delivery to systemic change.', highlighted: true },
    { id: 'ua4', name: 'Scale & Reach', description: '5,000+ children and youth annually. 300+ professionals. 6 locations. 16+ innovative programs across SF and San Mateo counties. Kinship Support Network saves $6.5B annually.' },
    { id: 'ua5', name: 'Lived Experience Team', description: 'Team of dedicated professionals, many with lived experiences, who empower children and families. Family-centered approach grounded in trauma-informed principles.' },
  ],
  value_for_customer: 'As a non-profit, Edgewood\'s expertise, energy, and resources are entirely focused on delivering life-changing youth mental and behavioral health care that works, demonstrating that a reimagined youth mental health system can transform lives and strengthen communities.',
  market_category: 'Reimagined Youth Mental Healthcare',
  category_rationale: 'Mission elevates Edgewood beyond "provider" to "system reimaginer." "We provide the place and the path to reimagine what youth mental health should be" — this frames Edgewood as building the future of the category, not just competing within it.',
  current_tagline: 'People. Place. Path.',
  proposed_tagline: 'Suggested: to be developed after competitive landscape mapping and audience validation.',
};

export const MOCK_SCORE_HISTORY: ScoreHistoryPoint[] = [
  { recorded_at: '2026-03-01', mojo_score: 34, area_scores: { positioning: 50, strategy: 17.5, product: 15.8, marketing: 15.8, sales: 12.6, cx: 12.6 }, input_complete_count: 0 },
  { recorded_at: '2026-03-02', mojo_score: 38, area_scores: { positioning: 55, strategy: 17.5, product: 17.3, marketing: 17.3, sales: 13.8, cx: 13.8 }, input_complete_count: 0 },
];
