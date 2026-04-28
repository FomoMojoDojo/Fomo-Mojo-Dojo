export type StrategicCheckpoint = {
  label: string;
  description: string;
};

export type StrategicCheckpointTemplate = readonly [
  StrategicCheckpoint,
  StrategicCheckpoint,
  StrategicCheckpoint,
  StrategicCheckpoint,
  StrategicCheckpoint,
  StrategicCheckpoint,
  StrategicCheckpoint,
  StrategicCheckpoint,
];

export type StrategicMarketCategory = {
  key: string;
  label: string;
  aliases: string[];
  keywords: string[];
  mapTitle: string;
  mapSubtitle: string;
  checkpointTemplate: StrategicCheckpointTemplate;
};

export const STRATEGIC_MARKET_CATEGORIES: ReadonlyArray<StrategicMarketCategory> = [
  {
    key: "b2b-saas",
    label: "B2B SaaS",
    aliases: ["enterprise software", "business software", "software platform"],
    keywords: ["b2b", "saas", "software", "enterprise", "subscription", "workflow", "platform", "api"],
    mapTitle: "Checkpoint Map: Buying and Realizing B2B Software Value",
    mapSubtitle: "How business teams evaluate, adopt, and realize value from software solutions.",
    checkpointTemplate: [
      { label: "Define desired business outcome", description: "Define the business result and measurable success criteria expected from the software." },
      { label: "Assess current workflow baseline", description: "Assess current workflow performance, constraints, and change readiness before selection." },
      { label: "Prepare requirements and buying criteria", description: "Prepare requirements, stakeholders, and decision criteria for vendor evaluation." },
      { label: "Confirm fit and adoption risk", description: "Confirm product fit, implementation risk, and adoption feasibility before commitment." },
      { label: "Execute evaluation and initial adoption", description: "Execute selection, onboarding, and initial usage actions to activate value." },
      { label: "Monitor adoption and outcome performance", description: "Monitor usage, reliability, and outcome metrics during early and ongoing use." },
      { label: "Adjust process and enablement", description: "Adjust workflows, training, and governance as adoption barriers or gaps appear." },
      { label: "Confirm realized value and next cycle", description: "Confirm realized business value and define next improvement priorities." },
    ],
  },
  {
    key: "b2c-software",
    label: "B2C Software",
    aliases: ["consumer software", "consumer app", "mobile app"],
    keywords: ["b2c", "consumer", "app", "mobile", "self-serve", "freemium", "creator"],
    mapTitle: "Checkpoint Map: Choosing and Using Consumer Software",
    mapSubtitle: "How consumers discover, evaluate, adopt, and sustain product usage.",
    checkpointTemplate: [
      { label: "Define desired personal outcome", description: "Define the personal result the user wants and how success will be recognized." },
      { label: "Assess current habits and barriers", description: "Assess current behavior, effort, and barriers that block progress today." },
      { label: "Prepare options and tradeoffs", description: "Prepare candidate options, effort tradeoffs, and trust considerations before choosing." },
      { label: "Confirm trust, cost, and fit", description: "Confirm the option feels credible, affordable, and aligned to the user context." },
      { label: "Execute setup and first-use actions", description: "Execute setup, first-use, and core actions that create early progress." },
      { label: "Monitor engagement and result quality", description: "Monitor consistency, satisfaction, and result quality during ongoing usage." },
      { label: "Adjust routine and usage choices", description: "Adjust settings, routines, and usage patterns when outcomes lag expectations." },
      { label: "Confirm sustained value decision", description: "Confirm ongoing value and decide whether to continue, expand, or switch." },
    ],
  },
  {
    key: "professional-services",
    label: "Professional Services",
    aliases: ["consulting", "advisory", "agency services"],
    keywords: ["consulting", "advisory", "agency", "services", "engagement", "client delivery"],
    mapTitle: "Checkpoint Map: Diagnosing and Delivering Service Outcomes",
    mapSubtitle: "How service teams define scope, deliver interventions, and prove business outcomes.",
    checkpointTemplate: [
      { label: "Define target client outcome", description: "Define the client business result, scope boundaries, and success metrics." },
      { label: "Assess client baseline and constraints", description: "Assess current state, constraints, and stakeholder alignment before planning delivery." },
      { label: "Prepare scope and delivery plan", description: "Prepare workplan, roles, milestones, and decision protocols for the engagement." },
      { label: "Confirm approach and delivery risk", description: "Confirm approach credibility, resource fit, and risk exposure before commitment." },
      { label: "Execute engagement activities", description: "Execute diagnostic and delivery activities that move the client toward outcomes." },
      { label: "Monitor delivery quality and confidence", description: "Monitor quality, speed, and stakeholder confidence while delivery is underway." },
      { label: "Adjust interventions and plan", description: "Adjust interventions, sequencing, and ownership when evidence shows drift." },
      { label: "Confirm impact and next priorities", description: "Confirm achieved impact and define next priorities for sustained outcomes." },
    ],
  },
  {
    key: "financial-services",
    label: "Financial Services",
    aliases: ["fintech", "banking", "insurance", "payments", "lending"],
    keywords: ["fintech", "financial", "bank", "insurance", "payments", "lending", "credit", "debt", "collections"],
    mapTitle: "Checkpoint Map: Selecting and Using Financial Solutions",
    mapSubtitle: "How customers evaluate financial options and execute reliable financial outcomes.",
    checkpointTemplate: [
      { label: "Define required financial outcome", description: "Define the target financial result and acceptable risk boundaries." },
      { label: "Assess cash flow and risk baseline", description: "Assess current balances, obligations, risk exposure, and compliance constraints." },
      { label: "Prepare documentation and criteria", description: "Prepare data, documentation, and criteria required for evaluation and approval." },
      { label: "Confirm terms and affordability", description: "Confirm terms, total cost, and risk implications before commitment." },
      { label: "Execute transaction and servicing actions", description: "Execute transaction, account servicing, and required follow-through actions." },
      { label: "Monitor balances and performance", description: "Monitor payments, balances, fees, and service quality against targets." },
      { label: "Adjust allocation and protection choices", description: "Adjust repayment, allocation, or protection choices as conditions change." },
      { label: "Confirm financial outcome and next cycle", description: "Confirm the result achieved and set priorities for the next financial cycle." },
    ],
  },
  {
    key: "healthcare-services",
    label: "Healthcare Services",
    aliases: ["care delivery", "clinical services"],
    keywords: ["healthcare", "health care", "clinic", "clinical", "patient", "care", "provider"],
    mapTitle: "Checkpoint Map: Accessing and Completing Care",
    mapSubtitle: "How care teams and patients coordinate diagnosis, treatment, and follow-through.",
    checkpointTemplate: [
      { label: "Define desired care outcome", description: "Define the care objective and the clinical or quality result sought." },
      { label: "Assess patient baseline and constraints", description: "Assess baseline condition, risks, and operational constraints affecting care." },
      { label: "Prepare care plan and coordination", description: "Prepare treatment plan, coordination roles, and required resources before action." },
      { label: "Confirm diagnosis path and feasibility", description: "Confirm diagnosis confidence, treatment feasibility, and safety considerations." },
      { label: "Execute care delivery actions", description: "Execute treatment and follow-through actions across the care team." },
      { label: "Monitor response and safety signals", description: "Monitor response, adherence, and safety indicators during care progression." },
      { label: "Adjust treatment and coordination", description: "Adjust treatment path and care coordination when evidence changes." },
      { label: "Confirm outcome and preventive next steps", description: "Confirm care outcome and define preventive or follow-up actions." },
    ],
  },
  {
    key: "education-services",
    label: "Education Services",
    aliases: ["edtech", "learning services", "training"],
    keywords: ["education", "edtech", "learning", "training", "school", "student", "curriculum"],
    mapTitle: "Checkpoint Map: Achieving Learning Outcomes",
    mapSubtitle: "How learners and educators define goals, execute instruction, and demonstrate mastery.",
    checkpointTemplate: [
      { label: "Define target learning outcome", description: "Define the learning objective and measurable mastery criteria." },
      { label: "Assess learner baseline and gaps", description: "Assess current proficiency, context, and barriers to progress." },
      { label: "Prepare instruction path and supports", description: "Prepare instruction sequence, support resources, and assessment plan." },
      { label: "Confirm path and assessment fit", description: "Confirm the learning path and assessment criteria are feasible and relevant." },
      { label: "Execute instruction and practice", description: "Execute instruction and guided practice needed to move toward mastery." },
      { label: "Monitor comprehension and retention", description: "Monitor understanding, retention, and performance across checkpoints." },
      { label: "Adjust pacing and support", description: "Adjust pacing, support intensity, and practice approach based on evidence." },
      { label: "Confirm mastery and next learning cycle", description: "Confirm mastery achieved and define next learning priorities." },
    ],
  },
  {
    key: "retail-ecommerce",
    label: "Retail & E-commerce",
    aliases: ["ecommerce", "online retail", "retail"],
    keywords: ["retail", "ecommerce", "e-commerce", "online store", "shopping", "merchandising", "checkout"],
    mapTitle: "Checkpoint Map: Discovering, Buying, and Receiving Products",
    mapSubtitle: "How buyers evaluate offers, complete purchase, and confirm post-purchase value.",
    checkpointTemplate: [
      { label: "Define desired purchase outcome", description: "Define what the buyer needs and how purchase success is judged." },
      { label: "Assess preferences and constraints", description: "Assess budget, timing, quality expectations, and purchase constraints." },
      { label: "Prepare options and comparison criteria", description: "Prepare candidate options and criteria for comparing offers." },
      { label: "Confirm fit, price, and delivery reliability", description: "Confirm product fit, total price, and dependable fulfillment before checkout." },
      { label: "Execute purchase and fulfillment steps", description: "Execute checkout, payment, and order fulfillment actions." },
      { label: "Monitor order and experience quality", description: "Monitor status, delivery quality, and post-purchase satisfaction." },
      { label: "Adjust service and recovery actions", description: "Adjust returns, support, or replacement actions when outcomes miss expectations." },
      { label: "Confirm value received and next purchase", description: "Confirm expected value and feed learning into future buying decisions." },
    ],
  },
  {
    key: "marketplace",
    label: "Marketplace",
    aliases: ["two-sided platform", "platform marketplace"],
    keywords: ["marketplace", "two-sided", "supply", "demand", "seller", "buyer", "matching"],
    mapTitle: "Checkpoint Map: Matching Supply and Demand Reliably",
    mapSubtitle: "How participants evaluate options, transact, and confirm successful exchange outcomes.",
    checkpointTemplate: [
      { label: "Define desired exchange outcome", description: "Define the intended exchange result for both demand and supply sides." },
      { label: "Assess fit and participation constraints", description: "Assess availability, eligibility, and constraints affecting matching quality." },
      { label: "Prepare request or listing details", description: "Prepare clear request or listing details and decision criteria." },
      { label: "Confirm counterparty and terms", description: "Confirm counterparty quality, trust signals, and transaction terms." },
      { label: "Execute matching and transaction actions", description: "Execute matching, transaction, and handoff actions to complete exchange." },
      { label: "Monitor fulfillment and payment performance", description: "Monitor fulfillment quality, timing, and payment completion." },
      { label: "Adjust terms and dispute handling", description: "Adjust matching approach, terms, or dispute response as needed." },
      { label: "Confirm exchange outcome and repeatability", description: "Confirm exchange success and improve the next matching cycle." },
    ],
  },
  {
    key: "manufacturing-industrial",
    label: "Manufacturing & Industrial",
    aliases: ["industrial manufacturing", "factory operations"],
    keywords: ["manufacturing", "industrial", "factory", "production", "plant", "quality control"],
    mapTitle: "Checkpoint Map: Planning and Delivering Production Outcomes",
    mapSubtitle: "How teams plan, execute, and stabilize production performance.",
    checkpointTemplate: [
      { label: "Define production outcome and targets", description: "Define output, quality, and cost targets for the production cycle." },
      { label: "Assess capacity and risk baseline", description: "Assess demand, capacity, constraints, and risk conditions before scheduling." },
      { label: "Prepare materials, staffing, and schedule", description: "Prepare inputs, staffing, and production schedule for reliable execution." },
      { label: "Confirm readiness and control limits", description: "Confirm line readiness, control limits, and contingency response plans." },
      { label: "Execute production and quality actions", description: "Execute production runs and quality assurance actions." },
      { label: "Monitor throughput and defect signals", description: "Monitor throughput, downtime, and defect trends during execution." },
      { label: "Adjust line settings and recovery plan", description: "Adjust settings, staffing, or recovery actions to stabilize performance." },
      { label: "Confirm output and next planning cycle", description: "Confirm production outcome and feed learning into next planning cycle." },
    ],
  },
  {
    key: "logistics-transportation",
    label: "Logistics & Transportation",
    aliases: ["supply chain logistics", "transport services"],
    keywords: ["logistics", "transport", "transportation", "delivery", "freight", "route", "fleet", "shipment"],
    mapTitle: "Checkpoint Map: Moving Goods Reliably and On Time",
    mapSubtitle: "How teams plan, execute, and recover logistics operations.",
    checkpointTemplate: [
      { label: "Define delivery outcome and target", description: "Define delivery timing, cost, and service-level outcomes required." },
      { label: "Assess network baseline and constraints", description: "Assess network capacity, route risk, and operating constraints." },
      { label: "Prepare shipment and handoff plan", description: "Prepare shipment data, handoffs, and required resources for dispatch." },
      { label: "Confirm route feasibility and carrier fit", description: "Confirm route feasibility, carrier fit, and timing reliability." },
      { label: "Execute dispatch and delivery actions", description: "Execute dispatch, movement, and final delivery actions." },
      { label: "Monitor transit and exception signals", description: "Monitor location status, exceptions, and service-level performance." },
      { label: "Adjust routing and recovery response", description: "Adjust routing, capacity allocation, and recovery actions when disruption occurs." },
      { label: "Confirm delivery outcome and next dispatch", description: "Confirm delivery performance and improve the next dispatch cycle." },
    ],
  },
  {
    key: "hospitality-foodservice",
    label: "Hospitality & Foodservice",
    aliases: ["restaurant operations", "venue hospitality"],
    keywords: ["hospitality", "foodservice", "restaurant", "cafe", "venue", "guest", "menu", "beverage"],
    mapTitle: "Checkpoint Map: Delivering Guest Experience Consistently",
    mapSubtitle: "How operators prepare, execute, and improve service quality and margin outcomes.",
    checkpointTemplate: [
      { label: "Define guest and margin outcome", description: "Define the guest experience result and margin target for service." },
      { label: "Assess demand and service constraints", description: "Assess demand, staffing, inventory, and service bottlenecks." },
      { label: "Prepare service plan and resources", description: "Prepare menu, inventory, staff roles, and pacing expectations." },
      { label: "Confirm readiness and service flow", description: "Confirm readiness, reservation flow, and service feasibility before peak periods." },
      { label: "Execute service delivery actions", description: "Execute preparation, service, and handoff actions across guest touchpoints." },
      { label: "Monitor quality, pace, and waste", description: "Monitor guest feedback, pacing, waste, and labor efficiency." },
      { label: "Adjust staffing and service recovery", description: "Adjust staffing, menu execution, and recovery actions when quality drops." },
      { label: "Confirm outcome and next service cycle", description: "Confirm guest outcome and carry learnings into the next service cycle." },
    ],
  },
  {
    key: "real-estate-property-services",
    label: "Real Estate & Property Services",
    aliases: ["property management", "real estate services"],
    keywords: ["real estate", "property", "leasing", "tenant", "broker", "facility", "asset management"],
    mapTitle: "Checkpoint Map: Securing and Managing Property Outcomes",
    mapSubtitle: "How teams evaluate, transact, and operate property decisions over time.",
    checkpointTemplate: [
      { label: "Define property and portfolio outcome", description: "Define financial and operational outcomes for the property decision." },
      { label: "Assess asset baseline and constraints", description: "Assess condition, market context, and legal or operational constraints." },
      { label: "Prepare valuation, terms, and timeline", description: "Prepare valuation assumptions, terms, stakeholders, and execution timeline." },
      { label: "Confirm deal or lease feasibility", description: "Confirm transaction or lease feasibility, risk profile, and compliance fit." },
      { label: "Execute transaction and operations actions", description: "Execute acquisition, leasing, or operations actions to activate outcomes." },
      { label: "Monitor occupancy and cash flow", description: "Monitor occupancy, cash flow, maintenance, and service performance." },
      { label: "Adjust pricing, terms, and operations", description: "Adjust pricing, terms, or operating choices as market conditions evolve." },
      { label: "Confirm property outcome and next cycle", description: "Confirm property performance and define next portfolio priorities." },
    ],
  },
  {
    key: "energy-utilities",
    label: "Energy & Utilities",
    aliases: ["utilities services", "energy services"],
    keywords: ["energy", "utility", "utilities", "power", "grid", "renewable", "electricity"],
    mapTitle: "Checkpoint Map: Ensuring Reliable Utility Service",
    mapSubtitle: "How operators plan, deliver, and stabilize energy and utility outcomes.",
    checkpointTemplate: [
      { label: "Define reliability and cost outcome", description: "Define service reliability, quality, and cost targets for operations." },
      { label: "Assess demand and infrastructure baseline", description: "Assess demand profile, infrastructure condition, and operating constraints." },
      { label: "Prepare operating and contingency plan", description: "Prepare load plans, resource assignments, and contingency actions." },
      { label: "Confirm safety and regulatory readiness", description: "Confirm operating plan meets safety and regulatory requirements." },
      { label: "Execute generation and service actions", description: "Execute generation, distribution, and field service actions." },
      { label: "Monitor uptime and incident signals", description: "Monitor uptime, outages, and service quality indicators in real time." },
      { label: "Adjust dispatch and recovery actions", description: "Adjust dispatch, maintenance, and incident response to stabilize outcomes." },
      { label: "Confirm service outcome and next cycle", description: "Confirm service performance and harden the next operating cycle." },
    ],
  },
  {
    key: "telecommunications",
    label: "Telecommunications",
    aliases: ["telecom", "connectivity services"],
    keywords: ["telecom", "telecommunications", "network", "connectivity", "carrier", "broadband"],
    mapTitle: "Checkpoint Map: Delivering Reliable Connectivity",
    mapSubtitle: "How teams provision, maintain, and optimize connectivity outcomes.",
    checkpointTemplate: [
      { label: "Define connectivity outcome and target", description: "Define connectivity performance outcome and customer service targets." },
      { label: "Assess network baseline and constraints", description: "Assess coverage, capacity, and performance constraints by segment." },
      { label: "Prepare provisioning and support plan", description: "Prepare provisioning requirements, resource plans, and support readiness." },
      { label: "Confirm feasibility and service risk", description: "Confirm installation feasibility, service continuity risk, and quality thresholds." },
      { label: "Execute provisioning and activation", description: "Execute provisioning, activation, and support actions for service delivery." },
      { label: "Monitor latency, uptime, and experience", description: "Monitor latency, uptime, and customer experience indicators." },
      { label: "Adjust capacity and support response", description: "Adjust capacity, routing, and support response when performance degrades." },
      { label: "Confirm outcome and next optimization cycle", description: "Confirm connectivity outcome and prioritize next optimization cycle." },
    ],
  },
  {
    key: "media-entertainment",
    label: "Media & Entertainment",
    aliases: ["content media", "entertainment services"],
    keywords: ["media", "entertainment", "content", "audience", "streaming", "creator"],
    mapTitle: "Checkpoint Map: Producing and Delivering Content Outcomes",
    mapSubtitle: "How teams plan, distribute, and optimize content impact and engagement.",
    checkpointTemplate: [
      { label: "Define audience and impact outcome", description: "Define target audience outcome and business impact objectives." },
      { label: "Assess audience baseline and constraints", description: "Assess audience behavior, content constraints, and production capacity." },
      { label: "Prepare content and distribution plan", description: "Prepare content slate, rights, and distribution priorities." },
      { label: "Confirm fit, timing, and risk", description: "Confirm content fit, release timing, and risk exposure before execution." },
      { label: "Execute production and distribution actions", description: "Execute production, publishing, and distribution actions across channels." },
      { label: "Monitor reach, engagement, and yield", description: "Monitor reach, engagement quality, and revenue indicators." },
      { label: "Adjust programming and channel mix", description: "Adjust programming choices and channel mix based on performance signals." },
      { label: "Confirm outcome and next content cycle", description: "Confirm impact outcome and define the next content cycle priorities." },
    ],
  },
  {
    key: "public-sector-government",
    label: "Public Sector & Government",
    aliases: ["government services", "civic services"],
    keywords: ["public sector", "government", "civic", "municipal", "public service", "agency"],
    mapTitle: "Checkpoint Map: Delivering Public Service Outcomes",
    mapSubtitle: "How agencies define, execute, and validate service outcomes for constituents.",
    checkpointTemplate: [
      { label: "Define constituent service outcome", description: "Define the constituent outcome and service standards required." },
      { label: "Assess policy baseline and constraints", description: "Assess policy constraints, demand baseline, and delivery capacity." },
      { label: "Prepare service design and resourcing", description: "Prepare service design, resource allocation, and cross-agency roles." },
      { label: "Confirm compliance and feasibility", description: "Confirm legal compliance, feasibility, and public risk posture." },
      { label: "Execute service delivery actions", description: "Execute service delivery and case-handling actions." },
      { label: "Monitor access, timeliness, and quality", description: "Monitor accessibility, timeliness, and service quality outcomes." },
      { label: "Adjust policy execution and operations", description: "Adjust execution, staffing, or process controls to improve outcomes." },
      { label: "Confirm public outcome and next cycle", description: "Confirm public service outcome and feed insights into next planning cycle." },
    ],
  },
  {
    key: "nonprofit-social-impact",
    label: "Nonprofit & Social Impact",
    aliases: ["nonprofit services", "mission services"],
    keywords: ["nonprofit", "mission", "donor", "grant", "philanthropy", "impact"],
    mapTitle: "Checkpoint Map: Securing and Delivering Mission Outcomes",
    mapSubtitle: "How teams align funding, delivery, and evidence of mission impact.",
    checkpointTemplate: [
      { label: "Define mission and impact outcome", description: "Define mission outcome and impact metrics that matter most." },
      { label: "Assess need, funding, and constraints", description: "Assess beneficiary needs, funding realities, and operating constraints." },
      { label: "Prepare program and partnership plan", description: "Prepare program design, partner roles, and resource plan." },
      { label: "Confirm fit, evidence, and risk", description: "Confirm program fit, evidence strategy, and execution risk before launch." },
      { label: "Execute program delivery actions", description: "Execute program and support actions for beneficiaries." },
      { label: "Monitor outcomes and resource use", description: "Monitor participation, outcomes, and resource utilization against targets." },
      { label: "Adjust program and funding mix", description: "Adjust service model, partnerships, or funding mix based on results." },
      { label: "Confirm impact and next mission cycle", description: "Confirm impact achieved and prioritize next mission cycle decisions." },
    ],
  },
  {
    key: "general-commercial-services",
    label: "General Commercial Services",
    aliases: ["commercial services", "business services"],
    keywords: ["business", "service", "services", "operations", "growth"],
    mapTitle: "Checkpoint Map: Delivering Reliable Business Outcomes",
    mapSubtitle: "How teams define, execute, and improve outcomes in recurring operations.",
    checkpointTemplate: [
      { label: "Define business outcome and success", description: "Define the business result and measurable success criteria for this cycle." },
      { label: "Assess current baseline and constraints", description: "Assess current baseline, constraints, and operating conditions." },
      { label: "Prepare requirements and resources", description: "Prepare requirements, stakeholder alignment, and resource plan." },
      { label: "Confirm feasibility, value, and risk", description: "Confirm the chosen approach is feasible and worth committing to." },
      { label: "Execute core operations actions", description: "Execute the core actions required to move the outcome forward." },
      { label: "Monitor performance and quality signals", description: "Monitor progress, quality, and efficiency indicators during execution." },
      { label: "Adjust decisions and resource allocation", description: "Adjust decisions and resources as conditions shift or results lag." },
      { label: "Confirm outcome and capture learning", description: "Confirm the achieved outcome and capture learning for the next cycle." },
    ],
  },
] as const;

const CATEGORY_BY_KEY = new Map(STRATEGIC_MARKET_CATEGORIES.map((category) => [category.key, category]));

function normalize(value: string | null | undefined) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function slug(value: string | null | undefined) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function listTraditionalMarketCategoryLabels() {
  return STRATEGIC_MARKET_CATEGORIES.map((category) => category.label);
}

export function bestFitStrategicMarketCategory(input: string | null | undefined) {
  const text = normalize(input);
  if (!text) return CATEGORY_BY_KEY.get("general-commercial-services")!;

  const exact = STRATEGIC_MARKET_CATEGORIES.find((category) => {
    const targets = [category.label, ...category.aliases].map((entry) => normalize(entry));
    return targets.some((entry) => entry === text);
  });
  if (exact) return exact;

  let best = CATEGORY_BY_KEY.get("general-commercial-services")!;
  let bestScore = -1;

  for (const category of STRATEGIC_MARKET_CATEGORIES) {
    let score = 0;
    for (const alias of [category.label, ...category.aliases]) {
      const normalizedAlias = normalize(alias);
      if (!normalizedAlias) continue;
      if (text.includes(normalizedAlias)) score += 5;
    }
    for (const keyword of category.keywords) {
      const normalizedKeyword = normalize(keyword);
      if (!normalizedKeyword) continue;
      if (text.includes(normalizedKeyword)) score += normalizedKeyword.length > 7 ? 3 : 2;
    }
    if (score > bestScore) {
      best = category;
      bestScore = score;
    }
  }

  return bestScore <= 0 ? CATEGORY_BY_KEY.get("general-commercial-services")! : best;
}

export function buildTraditionalMarketDefinition(value: string | null | undefined) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "No market definition captured yet.";
  if (/^\s*category\s*:/i.test(normalized)) return normalized;

  const category = bestFitStrategicMarketCategory(normalized);
  if (normalize(normalized) === normalize(category.label)) return `Category: ${category.label}`;
  return `Category: ${category.label}. ${normalized}`;
}

export function buildMarketFitCheckpointSpine(categoryKeyOrLabel: string | null | undefined) {
  const category = CATEGORY_BY_KEY.get(slug(categoryKeyOrLabel)) || bestFitStrategicMarketCategory(categoryKeyOrLabel);
  return category.checkpointTemplate.map((step) => ({
    label: step.label,
    description: step.description,
  }));
}

export function buildMarketFitMapOption(input: string | null | undefined) {
  const category = bestFitStrategicMarketCategory(input);
  return {
    key: `market-fit-${category.key}`,
    categoryKey: category.key,
    categoryLabel: category.label,
    title: category.mapTitle,
    subtitle: category.mapSubtitle,
  };
}
