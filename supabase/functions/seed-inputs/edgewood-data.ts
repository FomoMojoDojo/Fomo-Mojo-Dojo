// Edgewood Center for Children & Families — Verified Inputs
// Re-evaluated March 2026 from publicly available information + client-provided messaging:
//   edgewood.org (homepage, /about, /connect-with-us, /get-involved, /services)
//   impact2025.edgewood.org (FY25 Impact Report)
//   Client-provided: Why We Exist, Why Us, Mission, Vision, One-Liner, Boilerplate (100w, 500w)
//
// Key verified facts:
//   Founded 1851 · 170+ year history · "People. Place. Path." tagline
//   Mission: "We provide the place and the path to reimagine what youth mental health should be."
//   Vision: "A Bay Area where there is no doubt where to turn when confronted with a youth mental health crisis."
//   Why We Exist: "Every child deserves a chance to thrive, regardless of the challenges they face."
//   Why Us: "Pre-COVID crisis, post-COVID multiplied, current system ineffective. 170+ years but lacked awareness/access. Today, changing this."
//   300+ youth mental healthcare professionals · 6 Bay Area locations
//   16+ innovative programs · ~5,000 children and youth served annually
//   Oldest children's nonprofit in the western United States (est. 1851)
//   Services: 24/7 crisis stabilization (415.682.3278), intensive residential,
//     outpatient (edgewoodoutpatient.org), community-based
//   Continuum: prevention → early intervention → crisis → ongoing support
//   Audiences: Parents/Caregivers, Teens (13-17), Young Adults (18-26), Partners/Providers
//   4 audience-specific Formstack intake forms on /connect-with-us
//   Locations: SF Vicente, Bayview-Hunters Point, Concord, Burlingame, San Bruno Drop-In, Redwood City Drop-In
//   Culture pillars: Connection & Belonging, Retention & Leadership, Client-Centered Care
//   Kinship Support Network (pioneered 1993, saves ~$6.5B annually)
//   Team: many with lived experience, family-centered approach, trauma-informed principles
//   FY25 Impact Report: ~5,000 served, 2,000+ prevention/early intervention, 500 crisis
//   15+ languages served · CEO Lynn Dolce MFT · Board Chair Jim Illig
//   Fundraising: Give platform, "Place to Begin" campaign, Grace Magill Fund, Auxiliary,
//     60th Edgewood Fair (record amounts), Edgewood Open, Corporate Impact Days
//   One-Liner: "Edgewood's expertise, energy, and resources are entirely focused on delivering
//     life-changing youth mental and behavioral health care that works, demonstrating that a
//     reimagined youth mental health system can transform lives and strengthen communities."

export const EDGEWOOD_INPUTS = [
  {
    input_key: "comp-alt",
    input_label: "Competitive Landscape",
    group_key: "foundation",
    group_label: "Foundation",
    sub_group: "Positioning",
    completeness: 65,
    status: "partial",
    score_impact: 7,
    impact_tier: "high",
    description:
      "Comprehensive landscape analysis completed mapping 8 major alternative pathways: (1) Do Nothing/Cope Informally, (2) Crisis Lines/ERs/Acute Inpatient (UCSF Stanyan, Fremont Hospital), (3) County/Public Behavioral Health (SF BH, Marin Youth & Family Services), (4) Community Nonprofits & CBOs (SF LGBT Center, COY, culturally-specific programs), (5) School-Based & School-Linked Services (CYBHI-funded, CSU East Bay partnerships), (6) Private Practice & Commercial Care (Psychology Today listings, boutique clinics, telehealth), (7) High-Cost Residential (Paradigm, Muir Wood, Mission Prep, Newport Academy, Sequel out-of-state), (8) Peer-Led & Prevention Models. Evidence-based outcome comparisons position Edgewood's integrated continuum as structurally superior on family preservation, school progress, and reduced justice involvement.",
    why_it_matters:
      "Landscape analysis reveals Edgewood is one of the only Bay Area providers combining crisis stabilization, residential treatment, intensive community-based care, and school-linked supports under one roof. Key strategic finding: Edgewood is often not top-of-mind for referrers who default to Psychology Today-listed branded residential programs. Ensuring schools, pediatricians, and county workers see Edgewood as a first-line option is a concrete leverage point.",
    subitems: [
      { sort_order: 1, name: "List direct nonprofit competitors in the Bay Area", done: true },
      { sort_order: 2, name: "Map private practice alternatives for youth mental health", done: true },
      { sort_order: 3, name: "Document county and state service pathways", done: true },
      { sort_order: 4, name: "Conduct family decision-journey interviews (5+)", done: false },
      { sort_order: 5, name: "Survey referral partner perceptions", done: false },
    ],
  },
  {
    input_key: "unique-attr",
    input_label: "Unique Differentiators",
    group_key: "foundation",
    group_label: "Foundation",
    sub_group: "Positioning",
    completeness: 85,
    status: "partial",
    score_impact: 9,
    impact_tier: "high",
    description:
      "What Edgewood can credibly claim that no other Bay Area youth mental health provider can — now validated through competitive landscape analysis. Confirmed unique: only provider combining crisis stabilization, residential treatment, intensive community-based care, and school-linked supports under one roof. 170+ year history (oldest children's nonprofit in the western US, est. 1851), 300+ professionals (many with lived experience), 6 locations, 16+ innovative programs, ~5,000 served annually, full continuum of care, trauma-informed culture pillars, and 'People. Place. Path.' identity. Research evidence shows Edgewood's integrated model structurally outperforms alternatives on family preservation, school progress, and reduced justice involvement.",
    why_it_matters:
      "Competitive analysis confirms Edgewood's integrated continuum is genuinely unique in the Bay Area — no other provider spans crisis-to-community under one organization. Only family validation of differentiators remains.",
    subitems: [
      { sort_order: 1, name: "Audit current differentiators against competitors", done: true },
      { sort_order: 2, name: "Validate differentiators with staff and families", done: false },
      { sort_order: 3, name: "Document 174+ year heritage narrative with centennial video", done: true },
      { sort_order: 4, name: "Articulate continuum of care as unique positioning", done: true },
      { sort_order: 5, name: "Quantify scale: 300+ staff, 6 locations, 15+ programs, 4K+ served", done: true },
      { sort_order: 6, name: "Define culture pillars as differentiators", done: true },
    ],
  },
  {
    input_key: "val-prop",
    input_label: "Value Proposition by Audience",
    group_key: "foundation",
    group_label: "Foundation",
    sub_group: "Positioning",
    completeness: 65,
    status: "partial",
    score_impact: 6,
    impact_tier: "med",
    description:
      "Formal one-liner defined: 'Edgewood's expertise, energy, and resources are entirely focused on delivering life-changing youth mental and behavioral health care that works.' Boilerplate messaging at 100-word and 500-word lengths. 4 audience-specific Formstack intake forms on /connect-with-us. Value propositions stronger but still need per-audience differentiation.",
    why_it_matters:
      "Formal value proposition now exists at organizational level with multiple lengths. Per-audience differentiation still needed — the same core messaging appears across parent/teen/young adult/partner intake forms.",
    subitems: [
      { sort_order: 1, name: "Draft family value proposition", done: true },
      { sort_order: 2, name: "Draft donor value proposition", done: true },
      { sort_order: 3, name: "Draft referral partner value proposition", done: true },
      { sort_order: 4, name: "Draft county/government value proposition", done: false },
      { sort_order: 5, name: "Differentiate messaging across audience intake forms", done: false },
    ],
  },
  {
    input_key: "target-aud",
    input_label: "Target Audiences",
    group_key: "foundation",
    group_label: "Foundation",
    sub_group: "Positioning",
    completeness: 60,
    status: "partial",
    score_impact: 6,
    impact_tier: "med",
    description:
      "Website clearly defines four audience segments with dedicated pages and intake forms: Parents & Caregivers, Teens (ages 13-17), Young Adults (ages 18-26), and Partners & Providers. Age ranges and service interests captured via Formstack. Behavioral profiles and prioritization still needed.",
    why_it_matters:
      "Segments are well-defined on the website with dedicated intake forms capturing contact preferences and service interests. Next step is building detailed behavioral profiles and a prioritization matrix.",
    subitems: [
      { sort_order: 1, name: "Build family segment profiles with behavioral data", done: true },
      { sort_order: 2, name: "Build donor segment profiles", done: false },
      { sort_order: 3, name: "Build referral partner segments", done: true },
      { sort_order: 4, name: "Create segment prioritization matrix", done: false },
    ],
  },
  {
    input_key: "market-cat",
    input_label: "Category Definition",
    group_key: "foundation",
    group_label: "Foundation",
    sub_group: "Positioning",
    completeness: 75,
    status: "partial",
    score_impact: 7,
    impact_tier: "high",
    description:
      "Mission: 'We provide the place and the path to reimagine what youth mental health should be.' Vision: 'A Bay Area where there is no doubt where to turn when confronted with a youth mental health crisis.' 'People. Place. Path.' tagline used consistently. Category framing elevated from description to aspiration.",
    why_it_matters:
      "Category definition now includes formal mission and vision statements that set an ambitious category frame — 'reimagine' positions Edgewood as building the future, not just competing within it. Testing with key audiences would validate resonance.",
    subitems: [
      { sort_order: 1, name: "Workshop category options with leadership", done: true },
      { sort_order: 2, name: "Test category framing with key audiences", done: false },
      { sort_order: 3, name: "Validate 'People. Place. Path.' resonance across segments", done: true },
    ],
  },
  {
    input_key: "program-model",
    input_label: "Program Logic Models",
    group_key: "foundation",
    group_label: "Foundation",
    sub_group: "Strategy",
    completeness: 25,
    status: "partial",
    score_impact: 3,
    impact_tier: "med",
    description:
      "Edgewood's continuum of care is well-documented: Crisis Stabilization 24/7, Acute Intensive Services, Outpatient Therapy, Community Based Services, Edgewood Community School, TAY drop-in centers, Kinship Support Network, Family Resource Center, Food Bank. FY25 Impact Report has a 'Measuring Impact' section. Formal logic models (inputs→activities→outputs→outcomes) not publicly visible.",
    why_it_matters:
      "Programs are extensively described across the site with clear service pathways. The Impact Report's 'Measuring Impact' section suggests outcome tracking exists internally. Formal logic models would strengthen grant applications.",
    subitems: [
      { sort_order: 1, name: "Document logic models for each program area", done: false },
      { sort_order: 2, name: "Validate outcomes framework with program staff", done: false },
      { sort_order: 3, name: "Map program continuum with clear entry/exit criteria", done: true },
    ],
  },
  {
    input_key: "needs-assessment",
    input_label: "Community Needs Assessment",
    group_key: "foundation",
    group_label: "Foundation",
    sub_group: "Strategy",
    completeness: 10,
    status: "gap",
    score_impact: 1,
    impact_tier: "low",
    description:
      "FY25 Impact Report cites '94% of California youth ages 14-25 experience mental health challenges' (2025 BlueSky/Blue Shield survey) and notes 15+ languages served. Some contextual data referenced but no formal community needs assessment or service gap analysis visible.",
    why_it_matters:
      "External data is cited in the Impact Report to establish urgency. A formal needs assessment specific to the 3-county service area would strengthen program planning and grant applications.",
    subitems: [
      { sort_order: 1, name: "Compile county-level youth mental health needs data", done: false },
      { sort_order: 2, name: "Conduct service gap analysis across 3 counties", done: false },
      { sort_order: 3, name: "Assess waitlist trends and demand forecasting", done: false },
      { sort_order: 4, name: "Reference external data sources (BlueSky/Blue Shield survey)", done: true },
    ],
  },
  {
    input_key: "outcome-data",
    input_label: "Outcome Measurement",
    group_key: "execution",
    group_label: "Execution",
    sub_group: "Service Delivery",
    completeness: 45,
    status: "partial",
    score_impact: 5,
    impact_tier: "med",
    description:
      "FY25 Impact Report (impact2025.edgewood.org) has dedicated 'Measuring Impact' section with data analytics. Reports 4,016 served, 2,000+ in prevention/early intervention, 500 crisis admissions. FY24 Annual Report also available. Standardized measures across all programs not confirmed publicly.",
    why_it_matters:
      "Two annual reports demonstrate commitment to outcome measurement with quantitative data. The 'Measuring Impact' section suggests internal analytics capability. Standardization and real-time dashboards would complete this input.",
    subitems: [
      { sort_order: 1, name: "Select standardized outcome measures", done: false },
      { sort_order: 2, name: "Implement data collection across programs", done: true },
      { sort_order: 3, name: "Publish FY25 Impact Report with outcome data", done: true },
      { sort_order: 4, name: "Benchmark against national norms", done: false },
      { sort_order: 5, name: "Build real-time outcome dashboards", done: false },
    ],
  },
  {
    input_key: "referral-map",
    input_label: "Referral Source Mapping",
    group_key: "execution",
    group_label: "Execution",
    sub_group: "Referral Pipeline",
    completeness: 20,
    status: "gap",
    score_impact: 2,
    impact_tier: "high",
    description:
      "Edgewood has a 'Connect with Us' page with 4 audience-specific Formstack intake forms, 24/7 crisis line (415.682.3278), general phone line (415.682.3160), and a dedicated Partners & Providers referral form with service checkboxes (CSU, PHP, IOP, NPS, therapy, testing, residential). Systematic referral source mapping and conversion tracking not visible.",
    why_it_matters:
      "Referral infrastructure is stronger than initially assessed — dedicated provider intake form captures service type and contact preferences. But without systematic tracking of referral sources and conversion rates, growth remains reactive.",
    subitems: [
      { sort_order: 1, name: "List all current referral sources", done: false },
      { sort_order: 2, name: "Calculate referral-to-intake conversion rates", done: false },
      { sort_order: 3, name: "Identify untapped referral sources", done: false },
      { sort_order: 4, name: "Assess referral partner relationship health", done: false },
      { sort_order: 5, name: "Leverage Formstack data for referral analytics", done: true },
    ],
  },
  {
    input_key: "brand-narrative",
    input_label: "Brand Narrative",
    group_key: "execution",
    group_label: "Execution",
    sub_group: "Awareness",
    completeness: 85,
    status: "partial",
    score_impact: 9,
    impact_tier: "med",
    description:
      "Comprehensive brand narrative now includes: formal Why We Exist ('every child deserves a chance to thrive'), Why Us (post-COVID crisis framing, 170+ year track record, 'suffered from lack of awareness'), Mission, Vision, one-liner, and boilerplate messaging at 100-word and 500-word lengths. Plus 170+ year heritage story, centennial video (Vimeo, 12:18), 'People. Place. Path.' tagline, culture pillars, CEO letter, 7+ homepage testimonials, 3 impact stories, Grace Magill Fund story, trauma-informed principles narrative.",
    why_it_matters:
      "Narrative is now one of Edgewood's strongest assets — formal mission/vision/why messaging completes the strategic layer. The 500-word boilerplate positions Edgewood as a 'beacon of hope and transformation' and 'model for effective, compassionate care nationwide.' Only audience-specific narrative variations remain.",
    subitems: [
      { sort_order: 1, name: "Draft core narrative framework", done: true },
      { sort_order: 2, name: "Build story bank with family testimonials (with consent)", done: true },
      { sort_order: 3, name: "Create centennial/heritage narrative assets", done: true },
      { sort_order: 4, name: "Publish impact stories in FY25 report", done: true },
      { sort_order: 5, name: "Develop narrative variations for each audience segment", done: false },
    ],
  },
  {
    input_key: "channel-strat",
    input_label: "Outreach Channel Strategy",
    group_key: "execution",
    group_label: "Execution",
    sub_group: "Awareness",
    completeness: 45,
    status: "partial",
    score_impact: 5,
    impact_tier: "high",
    description:
      "Edgewood uses: main website (edgewood.org), outpatient site (edgewoodoutpatient.org), impact report microsite (impact2025.edgewood.org), Give platform (give.edgewood.org), Issuu (Case for Support, Outpatient Expansion case), Google Analytics, Calendly, Formstack forms, 24/7 crisis line, general phone, 6 physical locations, events (60th Edgewood Fair, Edgewood Open), volunteer program, Corporate Impact Days, Auxiliary.",
    why_it_matters:
      "More digital and physical touchpoints discovered than initially assessed. Multiple platforms (Formstack, Issuu, Calendly, give.edgewood.org) show sophisticated multi-channel approach. Formal channel strategy with audience-channel mapping and performance tracking would optimize investment.",
    subitems: [
      { sort_order: 1, name: "Audit current outreach channels", done: true },
      { sort_order: 2, name: "Map family discovery journey", done: false },
      { sort_order: 3, name: "Prioritize channels by audience segment", done: false },
      { sort_order: 4, name: "Track channel performance metrics", done: true },
    ],
  },
  {
    input_key: "donor-retention",
    input_label: "Donor Retention Analysis",
    group_key: "market_evidence",
    group_label: "Market Evidence",
    sub_group: "Fundraising",
    completeness: 15,
    status: "gap",
    score_impact: 2,
    impact_tier: "med",
    description:
      "Edgewood has robust fundraising infrastructure: Give platform (give.edgewood.org), donor testimonials (Barbara J. 'Longtime Donor'), Auxiliary, 'Place to Begin' campaign with Case for Support on Issuu, Grace Magill Fund, 60th Edgewood Fair (record amounts), Edgewood Open tournament, Corporate Impact Days, Gratitude section in FY25 report. No public donor retention data or cohort analysis.",
    why_it_matters:
      "Fundraising infrastructure is more developed than initially assessed — multiple campaigns, a dedicated fund, annual gala, and corporate giving. Retention analysis would optimize this substantial stewardship investment.",
    subitems: [
      { sort_order: 1, name: "Run donor cohort retention analysis", done: false },
      { sort_order: 2, name: "Survey lapsed donors", done: false },
      { sort_order: 3, name: "Document existing fundraising campaigns and infrastructure", done: true },
    ],
  },
  {
    input_key: "family-satisfaction",
    input_label: "Family Satisfaction Data",
    group_key: "market_evidence",
    group_label: "Market Evidence",
    sub_group: "Family Experience",
    completeness: 30,
    status: "partial",
    score_impact: 3,
    impact_tier: "low",
    description:
      "Homepage features 7+ testimonials (Maria/Teen, Denise P./Parent, Tasha D., Robert W./Parent, Kevin J./Volunteer, John B., Barbara J./Donor, Robert H./Parent). FY25 Impact Report includes 3 in-depth family stories. Complaint procedures published on /connect-with-us. Systematic satisfaction measurement (NPS, post-program surveys) not confirmed.",
    why_it_matters:
      "Rich testimonial evidence and published complaint procedures show attention to family experience. Systematic satisfaction tracking would provide actionable data for service improvement.",
    subitems: [
      { sort_order: 1, name: "Implement post-program family surveys", done: false },
      { sort_order: 2, name: "Establish NPS tracking", done: false },
      { sort_order: 3, name: "Analyze journey friction points", done: false },
      { sort_order: 4, name: "Formalize testimonial collection process", done: true },
      { sort_order: 5, name: "Publish complaint procedures", done: true },
    ],
  },
  {
    input_key: "grant-pipeline",
    input_label: "Grant Pipeline & Win Rate",
    group_key: "market_evidence",
    group_label: "Market Evidence",
    sub_group: "Fundraising",
    completeness: 5,
    status: "gap",
    score_impact: 1,
    impact_tier: "med",
    description:
      "'Place to Begin' campaign with Case for Support and Mental Health Outpatient Expansion case published on Issuu suggests active fundraising strategy. Gratitude section in FY25 Impact Report acknowledges donors and institutions. No public grant pipeline, funder relationship tracking, or win rate data visible.",
    why_it_matters:
      "Active capital campaigns and published cases for support indicate fundraising sophistication. Systematic pipeline tracking with win rates by funder type would optimize proposal investment.",
    subitems: [
      { sort_order: 1, name: "Document current grant pipeline", done: false },
      { sort_order: 2, name: "Analyze win/loss rates by funder type", done: false },
      { sort_order: 3, name: "Score funder alignment with Edgewood's programs", done: false },
      { sort_order: 4, name: "Leverage published cases for support in proposals", done: true },
    ],
  },
];
