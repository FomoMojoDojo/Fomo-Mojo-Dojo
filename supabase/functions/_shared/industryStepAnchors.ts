// DRAFT — operator content review required before production use.
// Label wording is a first-pass hypothesis; final content is a separate operator pass.
// All labels pass containsSolutionPrescriptiveLanguage + containsNonOdiProcessLanguage guards.

const STANDARD_MARKET_CATEGORY_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "B2B SaaS", pattern: /\b(b2b|enterprise|business)\b.*\b(saas|software|platform)\b|\benterprise software\b|\bbusiness software\b/i },
  { label: "B2C SaaS", pattern: /\bb2c\b.*\b(saas|software|platform)\b|\bconsumer software\b/i },
  { label: "Marketplace", pattern: /\bmarketplace\b/i },
  { label: "E-commerce", pattern: /\be-?commerce\b|\bonline retail\b/i },
  { label: "Professional Services", pattern: /\bconsult(ing|ancy)?\b|\bagency\b|\bprofessional services?\b/i },
  { label: "Healthcare Services", pattern: /\bhealth\s?care\b|\bmental health\b|\bclinic\b/i },
  { label: "Financial Services", pattern: /\bfintech\b|\bfinancial services?\b|\bbanking\b|\binsurance\b|\blending\b|\bdebt\b|\bcollections?\b/i },
  { label: "Education Services", pattern: /\bedtech\b|\beducation\b|\blearning\b|\bschool\b/i },
  { label: "Nonprofit Services", pattern: /\bnon-?profit\b|\bphilanthrop(y|ic)\b|\bdonor\b|\bgrant\b/i },
  { label: "Hospitality / Foodservice", pattern: /\bhospitality\b|\bfoodservice\b|\bcafe\b|\brestaurant\b|\bcoffee\b/i },
  { label: "Logistics / Transportation", pattern: /\blogistics\b|\btransport(ation)?\b|\bdelivery\b|\bmobility\b|\bfreight\b/i },
  { label: "Manufacturing", pattern: /\bmanufacturing\b|\bindustrial\b|\bfactory\b/i },
  { label: "Public Sector / Government", pattern: /\bpublic sector\b|\bgovernment\b|\bcivic\b|\bmunicipal\b/i },
];

export function inferStandardMarketCategory(...values: unknown[]): string {
  const corpus = values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
  if (!corpus) return "";
  for (const candidate of STANDARD_MARKET_CATEGORY_PATTERNS) {
    if (candidate.pattern.test(corpus)) return candidate.label;
  }
  return "";
}

export type IndustryStepAnchor = {
  define: string;
  locate: string;
  prepare: string;
  confirm: string;
  execute: string;
  monitor: string;
  modify: string;
  conclude: string;
};

// DRAFT — 13 standard market categories × 8 ODI universal-job-map checkpoints.
// Each label: 2–8 words, solution-agnostic, job-progression framing.
export const INDUSTRY_STEP_ANCHORS: Record<string, IndustryStepAnchor> = {
  "B2B SaaS": {
    define: "Define required business outcome",
    locate: "Identify high-fit buyer opportunities",
    prepare: "Align stakeholders and evaluation criteria",
    confirm: "Validate technical and business fit",
    execute: "Deliver agreed-upon solution value",
    monitor: "Track adoption and outcome signals",
    modify: "Adjust delivery based on feedback",
    conclude: "Confirm results and determine next steps",
  },
  "B2C SaaS": {
    define: "Clarify personal goal or need",
    locate: "Find and evaluate product options",
    prepare: "Set up account and preferences",
    confirm: "Verify setup meets expectations",
    execute: "Accomplish core personal task",
    monitor: "Check progress against personal goal",
    modify: "Adjust settings to better fit",
    conclude: "Assess results and decide continuation",
  },
  "Marketplace": {
    define: "Define needed supply or demand",
    locate: "Find matching supply or demand",
    prepare: "Evaluate listings and verify conditions",
    confirm: "Select and commit to a match",
    execute: "Complete the core transaction",
    monitor: "Track fulfillment and quality signals",
    modify: "Resolve issues as they arise",
    conclude: "Confirm exchange and capture satisfaction",
  },
  "E-commerce": {
    define: "Clarify product need and criteria",
    locate: "Search and evaluate product options",
    prepare: "Verify availability and readiness to buy",
    confirm: "Confirm selection and payment details",
    execute: "Complete purchase and confirm receipt",
    monitor: "Track delivery and order status",
    modify: "Handle changes or returns as needed",
    conclude: "Confirm satisfaction and resolve issues",
  },
  "Professional Services": {
    define: "Clarify scope and desired results",
    locate: "Identify qualified service providers",
    prepare: "Gather context and align expectations",
    confirm: "Validate approach and mutual readiness",
    execute: "Deliver core professional work",
    monitor: "Track progress and emerging signals",
    modify: "Adjust scope when conditions shift",
    conclude: "Confirm outcome and capture lessons",
  },
  "Healthcare Services": {
    define: "Clarify health concern or need",
    locate: "Identify appropriate care options",
    prepare: "Gather records and prepare for care",
    confirm: "Validate care plan and readiness",
    execute: "Receive or deliver care",
    monitor: "Track health response and signals",
    modify: "Adjust care plan based on response",
    conclude: "Confirm resolution and plan follow-up",
  },
  "Financial Services": {
    define: "Clarify financial goal or situation",
    locate: "Identify viable financial options",
    prepare: "Gather documentation and meet conditions",
    confirm: "Validate eligibility and commit to path",
    execute: "Complete core financial transaction",
    monitor: "Track financial outcome and risk signals",
    modify: "Adjust strategy when conditions shift",
    conclude: "Confirm result and determine next step",
  },
  "Education Services": {
    define: "Define learning goal or skill gap",
    locate: "Identify suitable programs or resources",
    prepare: "Enroll and prepare learning conditions",
    confirm: "Confirm readiness and course alignment",
    execute: "Complete core learning activities",
    monitor: "Track progress and comprehension signals",
    modify: "Adjust study approach to close gaps",
    conclude: "Assess mastery and apply next steps",
  },
  "Nonprofit Services": {
    define: "Clarify mission need or beneficiary gap",
    locate: "Identify funding or resource sources",
    prepare: "Prepare proposals and align stakeholders",
    confirm: "Confirm grant or support commitment",
    execute: "Deliver program or service",
    monitor: "Track outcomes and mission alignment",
    modify: "Adapt delivery when conditions shift",
    conclude: "Confirm impact and report findings",
  },
  "Hospitality / Foodservice": {
    define: "Clarify guest experience goal",
    locate: "Identify viable venue or service options",
    prepare: "Prepare space, staff, and supplies",
    confirm: "Confirm readiness before guest arrival",
    execute: "Deliver core guest experience",
    monitor: "Track service quality and guest signals",
    modify: "Adjust service when issues arise",
    conclude: "Confirm guest satisfaction and close",
  },
  "Logistics / Transportation": {
    define: "Define shipment or movement requirements",
    locate: "Identify viable carriers or routes",
    prepare: "Arrange documentation and loading conditions",
    confirm: "Validate route and readiness to move",
    execute: "Complete core transport movement",
    monitor: "Track shipment status and risk signals",
    modify: "Reroute or adjust when disruptions occur",
    conclude: "Confirm delivery and resolve discrepancies",
  },
  "Manufacturing": {
    define: "Clarify production requirement or specification",
    locate: "Identify materials and production options",
    prepare: "Stage inputs and confirm process readiness",
    confirm: "Validate quality and production conditions",
    execute: "Complete core production run",
    monitor: "Track yield and quality signals",
    modify: "Adjust process when shortfalls arise",
    conclude: "Confirm output quality and close production",
  },
  "Public Sector / Government": {
    define: "Clarify public need or mandate",
    locate: "Identify applicable programs or authorities",
    prepare: "Gather documentation and meet eligibility",
    confirm: "Validate compliance and approval readiness",
    execute: "Deliver public service or action",
    monitor: "Track service effectiveness and signals",
    modify: "Adjust approach based on community response",
    conclude: "Confirm outcomes and satisfy reporting",
  },
};

export function getIndustryStepAnchors(industryLabel: string): IndustryStepAnchor | null {
  return INDUSTRY_STEP_ANCHORS[industryLabel] ?? null;
}

const ANCHOR_KEY_ORDER: Array<keyof IndustryStepAnchor> = [
  "define", "locate", "prepare", "confirm", "execute", "monitor", "modify", "conclude",
];

export function anchorsToPromptBlock(anchors: IndustryStepAnchor): string {
  return ANCHOR_KEY_ORDER.map((key, index) =>
    `${index + 1} (${key}): ${anchors[key]}`
  ).join("\n");
}
