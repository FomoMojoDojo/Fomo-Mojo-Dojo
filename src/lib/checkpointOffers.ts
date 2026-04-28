export type CheckpointOfferWeights = {
  opportunity: number;
  strategic_fit: number;
  feasibility: number;
  time_to_impact: number;
};

export const DEFAULT_CHECKPOINT_OFFER_WEIGHTS: CheckpointOfferWeights = {
  opportunity: 0.45,
  strategic_fit: 0.25,
  feasibility: 0.2,
  time_to_impact: 0.1,
};

export type CheckpointOfferCandidate = {
  id: string;
  checkpoint_number: number;
  checkpoint_label: string;
  title: string;
  type: string;
  linked_opportunity_ids: string[];
  priority_score: number;
  priority_rank: number;
  recommended_status: "in_progress" | "planned" | "parked";
  rationale: string;
};

export type CheckpointOfferSection = {
  checkpoint_number: number;
  checkpoint_label: string;
  checkpoint_description: string;
  offers: CheckpointOfferCandidate[];
};

export type CheckpointRowInput = {
  id?: string | null;
  journey_key?: string | null;
  step_number?: number | null;
  step_label?: string | null;
  description?: string | null;
};

export type CheckpointOpportunityInput = {
  id: string;
  journey_key?: string | null;
  step_number?: number | null;
  step_label?: string | null;
  outcome?: string | null;
  opportunity_score?: number | null;
  priority_tier?: string | null;
};

export type CheckpointNeedInput = {
  id: string;
  journey_key?: string | null;
  step_number?: number | null;
  step_label?: string | null;
  desired_outcome?: string | null;
  opportunity_score?: number | null;
};

type StrategyContextInput = {
  where_to_play?: string | null;
  how_to_win?: string | null;
};

type PositioningContextInput = {
  market_category?: string | null;
  value_for_customer?: string | null;
  best_fit_customers?: string | null;
  unique_attributes?: Array<{ name?: string | null; description?: string | null }> | null;
};

type OfferBlueprint = {
  title: string;
  type: string;
  feasibilityBase: number;
  timeBase: number;
};

type NormalizedCheckpoint = {
  checkpoint_number: number;
  checkpoint_label: string;
  checkpoint_description: string;
};

type ScoreComponents = {
  opportunity: number;
  strategic_fit: number;
  feasibility: number;
  time_to_impact: number;
};

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "your",
  "their",
  "into",
  "through",
  "across",
  "checkpoint",
  "customer",
  "customers",
  "journey",
  "step",
  "stage",
  "improve",
  "increase",
  "reduce",
  "manage",
  "using",
  "based",
  "team",
  "teams",
  "work",
]);

function clamp(min: number, value: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function safeText(value: unknown) {
  return String(value || "").trim();
}

function normalizeJourneyKey(value: string | null | undefined) {
  return safeText(value).toLowerCase();
}

function isCustomerJourneyKey(value: string | null | undefined) {
  const key = normalizeJourneyKey(value);
  return key === "customer" || key.startsWith("customer-") || key.startsWith("customer_");
}

function normalizeLabel(value: string | null | undefined) {
  return safeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  const tokens = normalizeLabel(value).split(" ").filter(Boolean);
  return tokens.filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function overlapScore(a: string, b: string) {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap += 1;
  }
  return overlap / Math.max(tokensA.size, tokensB.size);
}

function keywordDetected(haystack: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(haystack));
}

function selectPrimaryCustomerCheckpoints(checkpoints: CheckpointRowInput[]): NormalizedCheckpoint[] {
  const source = (Array.isArray(checkpoints) ? checkpoints : []).filter((item) => item);
  const customerRows = source.filter((row) => isCustomerJourneyKey(row.journey_key));
  const pool = customerRows.length > 0 ? customerRows : source;
  if (pool.length === 0) {
    return Array.from({ length: 8 }, (_, index) => ({
      checkpoint_number: index + 1,
      checkpoint_label: `Checkpoint ${index + 1}`,
      checkpoint_description: "",
    }));
  }

  const groups = new Map<string, CheckpointRowInput[]>();
  for (const row of pool) {
    const key = normalizeJourneyKey(row.journey_key) || "customer";
    const current = groups.get(key);
    if (current) current.push(row);
    else groups.set(key, [row]);
  }

  const sortedGroups = Array.from(groups.entries())
    .map(([journeyKey, rows]) => ({ journeyKey, rows }))
    .sort((a, b) => {
      const aCustomer = a.journeyKey === "customer" ? 1 : 0;
      const bCustomer = b.journeyKey === "customer" ? 1 : 0;
      if (aCustomer !== bCustomer) return bCustomer - aCustomer;
      if (a.rows.length !== b.rows.length) return b.rows.length - a.rows.length;
      return a.journeyKey.localeCompare(b.journeyKey);
    });

  const selectedRows = [...(sortedGroups[0]?.rows ?? [])].sort((a, b) => {
    const numberDiff = (a.step_number ?? 999) - (b.step_number ?? 999);
    if (numberDiff !== 0) return numberDiff;
    return safeText(a.step_label).localeCompare(safeText(b.step_label));
  });

  const byNumber = new Map<number, CheckpointRowInput>();
  const fallbackQueue: CheckpointRowInput[] = [];
  for (const row of selectedRows) {
    const n = Number(row.step_number);
    if (Number.isFinite(n) && n >= 1 && n <= 8 && !byNumber.has(n)) {
      byNumber.set(n, row);
    } else {
      fallbackQueue.push(row);
    }
  }

  const result: NormalizedCheckpoint[] = [];
  for (let checkpointNumber = 1; checkpointNumber <= 8; checkpointNumber += 1) {
    const row = byNumber.get(checkpointNumber) ?? fallbackQueue.shift() ?? null;
    result.push({
      checkpoint_number: checkpointNumber,
      checkpoint_label: safeText(row?.step_label) || `Checkpoint ${checkpointNumber}`,
      checkpoint_description: safeText(row?.description),
    });
  }
  return result;
}

function resolveCustomerOpportunities(opportunities: CheckpointOpportunityInput[]) {
  const rows = (Array.isArray(opportunities) ? opportunities : []).filter((item) => item?.id);
  const customerRows = rows.filter((row) => isCustomerJourneyKey(row.journey_key));
  return customerRows.length > 0 ? customerRows : rows;
}

function resolveCustomerNeeds(needs: CheckpointNeedInput[]) {
  const rows = (Array.isArray(needs) ? needs : []).filter((item) => item?.id);
  const customerRows = rows.filter((row) => isCustomerJourneyKey(row.journey_key));
  return customerRows.length > 0 ? customerRows : rows;
}

function sortByOpportunityScore<T extends { opportunity_score?: number | null }>(rows: T[]) {
  return [...rows].sort((a, b) => (Number(b.opportunity_score) || 0) - (Number(a.opportunity_score) || 0));
}

function mapCheckpointOpportunities(
  checkpoint: NormalizedCheckpoint,
  opportunities: CheckpointOpportunityInput[],
) {
  const byNumber = opportunities.filter((item) => Number(item.step_number) === checkpoint.checkpoint_number);
  if (byNumber.length > 0) return sortByOpportunityScore(byNumber);

  const label = checkpoint.checkpoint_label;
  const byLabel = opportunities
    .map((item) => ({
      item,
      score: Math.max(
        overlapScore(label, safeText(item.step_label)),
        overlapScore(label, safeText(item.outcome)),
      ),
    }))
    .filter((entry) => entry.score >= 0.25)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (Number(b.item.opportunity_score) || 0) - (Number(a.item.opportunity_score) || 0);
    })
    .map((entry) => entry.item);
  return byLabel;
}

function mapCheckpointNeeds(
  checkpoint: NormalizedCheckpoint,
  needs: CheckpointNeedInput[],
) {
  const byNumber = needs.filter((item) => Number(item.step_number) === checkpoint.checkpoint_number);
  if (byNumber.length > 0) return sortByOpportunityScore(byNumber);

  const label = checkpoint.checkpoint_label;
  const byLabel = needs
    .map((item) => ({
      item,
      score: Math.max(
        overlapScore(label, safeText(item.step_label)),
        overlapScore(label, safeText(item.desired_outcome)),
      ),
    }))
    .filter((entry) => entry.score >= 0.25)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (Number(b.item.opportunity_score) || 0) - (Number(a.item.opportunity_score) || 0);
    })
    .map((entry) => entry.item);
  return byLabel;
}

function extractUniqueAttributesText(
  uniqueAttributes?: Array<{ name?: string | null; description?: string | null }> | null,
) {
  if (!Array.isArray(uniqueAttributes)) return "";
  return uniqueAttributes
    .map((item) => [safeText(item?.name), safeText(item?.description)].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(" ");
}

function detectDomain(globalContext: string) {
  const lower = globalContext.toLowerCase();
  if (keywordDetected(lower, [/\bcoffee\b/, /\bcafe\b/, /\broast/, /\bbarista\b/, /\bbrew\b/, /\bflavor\b/])) {
    return "coffee";
  }
  return "general";
}

function detectTheme(checkpointContext: string) {
  const lower = checkpointContext.toLowerCase();
  if (keywordDetected(lower, [/\bdefine\b/, /\bquality needs\b/, /\bbrand expectations?\b/])) {
    return "quality-definition";
  }
  if (keywordDetected(lower, [/\bevaluation criteria\b/, /\bprepare\b/, /\bevaluate\b/, /\bcriteria\b/, /\bcompare\b/])) {
    return "evaluation-criteria";
  }
  if (keywordDetected(lower, [/\bconfirm\b/, /\bfit\b/, /\balignment\b/, /\bcommitment\b/])) {
    return "fit-confirmation";
  }
  if (keywordDetected(lower, [/\bexecute\b/, /\brun\b/, /\banalysis\b/, /\bmodel\b/, /\bscenario\b/])) {
    return "analysis-execution";
  }
  if (
    keywordDetected(lower, [/\blocate\b/, /\bidentify\b/, /\bdiscover\b/, /\bsource\b/]) &&
    keywordDetected(lower, [/\bsupplier\b/, /\broaster\b/, /\bvendor\b/])
  ) {
    return "supplier-discovery";
  }
  if (keywordDetected(lower, [/\bonboard/, /\btraining\b/, /\blaunch\b/, /\breadiness\b/, /\bsetup\b/])) {
    return "onboarding";
  }
  if (keywordDetected(lower, [/\bquality\b/, /\bconsisten/, /\bflavor\b/, /\bstandard\b/])) {
    return "quality";
  }
  if (keywordDetected(lower, [/\bmonitor/, /\btrack/, /\bdashboard\b/, /\balert\b/, /\bsignal\b/])) {
    return "monitoring";
  }
  if (keywordDetected(lower, [/\bretain/, /\breorder\b/, /\brenew/, /\bloyal/])) {
    return "retention";
  }
  if (keywordDetected(lower, [/\bmodify\b/, /\badjust\b/, /\bterms\b/, /\bpartnership\b/])) {
    return "partnership-optimization";
  }
  if (keywordDetected(lower, [/\bconclude\b/, /\brenew\b/, /\brenewal\b/, /\bexit\b/])) {
    return "renewal";
  }
  if (keywordDetected(lower, [/\bevaluate\b/, /\bchoose\b/, /\bcompare\b/, /\bdecide\b/])) {
    return "decision";
  }
  return "progress";
}

function coffeeFallbackByCheckpoint(checkpointNumber: number): OfferBlueprint[] {
  if (checkpointNumber <= 2) {
    return [
      { title: "Cafe Fit Discovery Sprint", type: "Program", feasibilityBase: 72, timeBase: 74 },
      { title: "Preferred Roaster Match Shortlist", type: "Toolkit", feasibilityBase: 67, timeBase: 70 },
      { title: "Brand Profile Intake Workshop", type: "Workshop", feasibilityBase: 76, timeBase: 75 },
    ];
  }
  if (checkpointNumber <= 4) {
    return [
      { title: "Supplier Evaluation Scorecard", type: "Scorecard", feasibilityBase: 73, timeBase: 72 },
      { title: "Roaster Fit Validation Session", type: "Service", feasibilityBase: 69, timeBase: 68 },
      { title: "Cup Profile Comparison Kit", type: "Toolkit", feasibilityBase: 71, timeBase: 69 },
    ];
  }
  if (checkpointNumber <= 6) {
    return [
      { title: "30-Day Partner Launch Academy", type: "Program", feasibilityBase: 72, timeBase: 74 },
      { title: "Barista Readiness Certification", type: "Certification", feasibilityBase: 68, timeBase: 69 },
      { title: "Quality Pulse Dashboard", type: "Dashboard", feasibilityBase: 58, timeBase: 62 },
    ];
  }
  return [
    { title: "Partnership Value Review", type: "Review", feasibilityBase: 74, timeBase: 71 },
    { title: "Renewal Decision Brief", type: "Guide", feasibilityBase: 72, timeBase: 70 },
    { title: "Performance-Based Terms Planner", type: "Planner", feasibilityBase: 68, timeBase: 67 },
  ];
}

function offerBlueprints(theme: string, domain: string, checkpointNumber: number): OfferBlueprint[] {
  if (domain === "coffee" && theme === "quality-definition") {
    return [
      { title: "Quality Definition Blueprint", type: "Blueprint", feasibilityBase: 75, timeBase: 76 },
      { title: "Brand Flavor Profile Workshop", type: "Workshop", feasibilityBase: 74, timeBase: 73 },
      { title: "Premium Quality Spec Template", type: "Template", feasibilityBase: 79, timeBase: 78 },
    ];
  }
  if (domain === "coffee" && theme === "supplier-discovery") {
    return [
      { title: "Preferred Roaster Match Shortlist", type: "Toolkit", feasibilityBase: 67, timeBase: 70 },
      { title: "Supplier Discovery Sprint", type: "Program", feasibilityBase: 70, timeBase: 72 },
      { title: "Roaster Qualification Radar", type: "Dashboard", feasibilityBase: 61, timeBase: 65 },
    ];
  }
  if (domain === "coffee" && theme === "evaluation-criteria") {
    return [
      { title: "Supplier Evaluation Scorecard", type: "Scorecard", feasibilityBase: 73, timeBase: 72 },
      { title: "Cup Profile Comparison Kit", type: "Toolkit", feasibilityBase: 71, timeBase: 69 },
      { title: "Reliability Criteria Review", type: "Review", feasibilityBase: 75, timeBase: 73 },
    ];
  }
  if (domain === "coffee" && theme === "fit-confirmation") {
    return [
      { title: "Roaster Fit Validation Session", type: "Service", feasibilityBase: 69, timeBase: 68 },
      { title: "Codified Process Proof Pack", type: "Pack", feasibilityBase: 74, timeBase: 71 },
      { title: "Commitment Readiness Checklist", type: "Checklist", feasibilityBase: 79, timeBase: 75 },
    ];
  }
  if (domain === "coffee" && theme === "onboarding") {
    return [
      { title: "30-Day Partner Launch Academy", type: "Program", feasibilityBase: 72, timeBase: 74 },
      { title: "Barista Readiness Certification", type: "Certification", feasibilityBase: 68, timeBase: 69 },
      { title: "Partner Setup Concierge", type: "Service", feasibilityBase: 64, timeBase: 71 },
    ];
  }
  if (domain === "coffee" && (theme === "quality" || theme === "monitoring")) {
    return [
      { title: "Quality Pulse Dashboard", type: "Dashboard", feasibilityBase: 58, timeBase: 62 },
      { title: "Monthly Flavor Consistency Audit", type: "Audit", feasibilityBase: 74, timeBase: 70 },
      { title: "Brew Standard Response Playbook", type: "Playbook", feasibilityBase: 77, timeBase: 73 },
    ];
  }
  if (domain === "coffee" && theme === "partnership-optimization") {
    return [
      { title: "Performance-Based Terms Planner", type: "Planner", feasibilityBase: 68, timeBase: 67 },
      { title: "Partner Outcome Review Cadence", type: "Program", feasibilityBase: 73, timeBase: 69 },
      { title: "Adjustment Decision Trigger Kit", type: "Toolkit", feasibilityBase: 71, timeBase: 68 },
    ];
  }
  if (domain === "coffee" && theme === "renewal") {
    return [
      { title: "Renewal Decision Brief", type: "Guide", feasibilityBase: 72, timeBase: 70 },
      { title: "Partnership Value Review", type: "Review", feasibilityBase: 74, timeBase: 71 },
      { title: "Exit-or-Renew Criteria Matrix", type: "Scorecard", feasibilityBase: 70, timeBase: 68 },
    ];
  }
  if (domain === "coffee") {
    return coffeeFallbackByCheckpoint(checkpointNumber);
  }
  if (theme === "evaluation-criteria") {
    return [
      { title: "Decision Data Readiness Checklist", type: "Checklist", feasibilityBase: 78, timeBase: 76 },
      { title: "Criteria Scoring Matrix", type: "Scorecard", feasibilityBase: 73, timeBase: 72 },
      { title: "Input Quality Calibration Session", type: "Workshop", feasibilityBase: 69, timeBase: 70 },
    ];
  }
  if (theme === "fit-confirmation") {
    return [
      { title: "Decision Scope Confirmation Gate", type: "Gate", feasibilityBase: 72, timeBase: 71 },
      { title: "Parameter Sanity Check Pack", type: "Pack", feasibilityBase: 75, timeBase: 73 },
      { title: "Pre-Analysis Risk Review", type: "Review", feasibilityBase: 70, timeBase: 69 },
    ];
  }
  if (theme === "analysis-execution") {
    return [
      { title: "Strategic Analysis Runbook", type: "Runbook", feasibilityBase: 76, timeBase: 72 },
      { title: "Scenario Execution Accelerator", type: "Program", feasibilityBase: 68, timeBase: 67 },
      { title: "Repeatability Control Dashboard", type: "Dashboard", feasibilityBase: 58, timeBase: 63 },
    ];
  }
  if (theme === "onboarding") {
    return [
      { title: "30-Day Launch Academy", type: "Program", feasibilityBase: 71, timeBase: 73 },
      { title: "Operator Readiness Certification", type: "Certification", feasibilityBase: 66, timeBase: 67 },
      { title: "Activation Concierge Support", type: "Service", feasibilityBase: 64, timeBase: 69 },
    ];
  }
  if (theme === "quality" || theme === "monitoring") {
    return [
      { title: "Quality Pulse Dashboard", type: "Dashboard", feasibilityBase: 58, timeBase: 62 },
      { title: "Consistency Assurance Audit", type: "Audit", feasibilityBase: 73, timeBase: 69 },
      { title: "Standard Recovery Playbook", type: "Playbook", feasibilityBase: 76, timeBase: 72 },
    ];
  }
  if (theme === "retention") {
    return [
      { title: "Retention Checkpoint Program", type: "Program", feasibilityBase: 69, timeBase: 70 },
      { title: "Loyalty Recovery Trigger Kit", type: "Toolkit", feasibilityBase: 66, timeBase: 72 },
      { title: "At-Risk Account Review Cadence", type: "Service", feasibilityBase: 72, timeBase: 68 },
    ];
  }
  if (theme === "decision") {
    return [
      { title: "Decision Confidence Guide", type: "Guide", feasibilityBase: 78, timeBase: 74 },
      { title: "Alternative Fit Comparison Kit", type: "Toolkit", feasibilityBase: 69, timeBase: 67 },
      { title: "Decision Checkpoint Advisory", type: "Service", feasibilityBase: 64, timeBase: 65 },
    ];
  }
  return [
    { title: "Checkpoint Progress Playbook", type: "Playbook", feasibilityBase: 77, timeBase: 71 },
    { title: "Checkpoint Quality Review", type: "Audit", feasibilityBase: 72, timeBase: 68 },
    { title: "Checkpoint Signal Dashboard", type: "Dashboard", feasibilityBase: 58, timeBase: 61 },
  ];
}

function normalizeOpportunitySignal(
  opportunities: CheckpointOpportunityInput[],
  needs: CheckpointNeedInput[],
) {
  const oppScores = opportunities
    .map((item) => Number(item.opportunity_score))
    .filter((value) => Number.isFinite(value));
  const needScores = needs
    .map((item) => Number(item.opportunity_score))
    .filter((value) => Number.isFinite(value));
  const scores = [...oppScores, ...needScores];
  if (scores.length === 0) return 38;
  const avg = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  return clamp(25, (avg / 20) * 100, 100);
}

function strategicFitScore(args: {
  offerTitle: string;
  checkpointLabel: string;
  strategyContext: StrategyContextInput;
  positioningContext: PositioningContextInput;
  opportunityTexts: string;
  needTexts: string;
}) {
  const strategyText = [
    safeText(args.strategyContext.where_to_play),
    safeText(args.strategyContext.how_to_win),
    safeText(args.positioningContext.market_category),
    safeText(args.positioningContext.value_for_customer),
    safeText(args.positioningContext.best_fit_customers),
    extractUniqueAttributesText(args.positioningContext.unique_attributes),
  ]
    .filter(Boolean)
    .join(" ");

  const localText = `${args.offerTitle} ${args.checkpointLabel} ${args.opportunityTexts} ${args.needTexts}`;
  const overlap = overlapScore(localText, strategyText);
  const base = 42 + overlap * 55;
  return clamp(20, base, 100);
}

function feasibilityScore(args: {
  blueprint: OfferBlueprint;
  linkedOpportunityCount: number;
  strategyContext: StrategyContextInput;
}) {
  const complexityPenalty = Math.max(0, args.linkedOpportunityCount - 2) * 3.5;
  const strategicBoost = keywordDetected(
    `${safeText(args.strategyContext.where_to_play)} ${safeText(args.strategyContext.how_to_win)}`.toLowerCase(),
    [/\bpartner\b/, /\bstandard\b/, /\bprocess\b/, /\brepeatable\b/],
  )
    ? 3
    : 0;
  return clamp(20, args.blueprint.feasibilityBase - complexityPenalty + strategicBoost, 95);
}

function timeToImpactScore(args: {
  blueprint: OfferBlueprint;
  linkedOpportunityCount: number;
  checkpointNumber: number;
}) {
  const dependencyPenalty = Math.max(0, args.linkedOpportunityCount - 2) * 2.2;
  const checkpointAdjustment = args.checkpointNumber >= 6 ? 2 : 0;
  return clamp(20, args.blueprint.timeBase - dependencyPenalty + checkpointAdjustment, 95);
}

function resolveWeights(input?: Partial<CheckpointOfferWeights>): CheckpointOfferWeights {
  const merged: CheckpointOfferWeights = {
    opportunity: Number(input?.opportunity),
    strategic_fit: Number(input?.strategic_fit),
    feasibility: Number(input?.feasibility),
    time_to_impact: Number(input?.time_to_impact),
  };
  if (
    !Number.isFinite(merged.opportunity) ||
    !Number.isFinite(merged.strategic_fit) ||
    !Number.isFinite(merged.feasibility) ||
    !Number.isFinite(merged.time_to_impact)
  ) {
    return { ...DEFAULT_CHECKPOINT_OFFER_WEIGHTS };
  }
  const sum = merged.opportunity + merged.strategic_fit + merged.feasibility + merged.time_to_impact;
  if (!Number.isFinite(sum) || sum <= 0) return { ...DEFAULT_CHECKPOINT_OFFER_WEIGHTS };
  return {
    opportunity: merged.opportunity / sum,
    strategic_fit: merged.strategic_fit / sum,
    feasibility: merged.feasibility / sum,
    time_to_impact: merged.time_to_impact / sum,
  };
}

export function computeWeightedPriorityScore(
  components: ScoreComponents,
  weights: CheckpointOfferWeights,
) {
  const total =
    components.opportunity * weights.opportunity +
    components.strategic_fit * weights.strategic_fit +
    components.feasibility * weights.feasibility +
    components.time_to_impact * weights.time_to_impact;
  return round1(clamp(0, total, 100));
}

function recommendedStatusForScore(score: number): "in_progress" | "planned" | "parked" {
  if (score >= 70) return "in_progress";
  if (score >= 55) return "planned";
  return "parked";
}

function toOfferId(checkpointNumber: number, title: string) {
  const slug = normalizeLabel(title).replace(/\s+/g, "-").replace(/-+/g, "-");
  return `checkpoint-${checkpointNumber}-${slug || "offer"}`;
}

export function buildCheckpointOffers(args: {
  checkpoints: CheckpointRowInput[];
  opportunities: CheckpointOpportunityInput[];
  needs: CheckpointNeedInput[];
  strategyContext?: StrategyContextInput;
  positioningContext?: PositioningContextInput;
  weights?: Partial<CheckpointOfferWeights>;
}): CheckpointOfferSection[] {
  const normalizedCheckpoints = selectPrimaryCustomerCheckpoints(args.checkpoints);
  const customerOpportunities = resolveCustomerOpportunities(args.opportunities);
  const customerNeeds = resolveCustomerNeeds(args.needs);
  const weights = resolveWeights(args.weights);

  const globalContext = [
    safeText(args.strategyContext?.where_to_play),
    safeText(args.strategyContext?.how_to_win),
    safeText(args.positioningContext?.market_category),
    safeText(args.positioningContext?.value_for_customer),
    safeText(args.positioningContext?.best_fit_customers),
    extractUniqueAttributesText(args.positioningContext?.unique_attributes),
    normalizedCheckpoints.map((item) => item.checkpoint_label).join(" "),
    customerOpportunities.map((item) => safeText(item.outcome)).join(" "),
  ]
    .filter(Boolean)
    .join(" ");
  const domain = detectDomain(globalContext);

  return normalizedCheckpoints.map((checkpoint) => {
    const linkedOpportunities = mapCheckpointOpportunities(checkpoint, customerOpportunities);
    const linkedNeeds = mapCheckpointNeeds(checkpoint, customerNeeds);
    const topOpportunityIds = linkedOpportunities.slice(0, 3).map((item) => item.id);
    const opportunitySignal = normalizeOpportunitySignal(linkedOpportunities, linkedNeeds);
    const opportunityTexts = linkedOpportunities
      .slice(0, 3)
      .map((item) => safeText(item.outcome))
      .filter(Boolean)
      .join(" ");
    const needTexts = linkedNeeds
      .slice(0, 3)
      .map((item) => safeText(item.desired_outcome))
      .filter(Boolean)
      .join(" ");
    const checkpointText = `${checkpoint.checkpoint_label} ${checkpoint.checkpoint_description}`;
    const expandedCheckpointContext = `${checkpointText} ${opportunityTexts} ${needTexts}`;
    const themeFromCheckpoint = detectTheme(checkpointText);
    const theme = themeFromCheckpoint === "progress"
      ? detectTheme(expandedCheckpointContext)
      : themeFromCheckpoint;
    const blueprints = offerBlueprints(theme, domain, checkpoint.checkpoint_number);

    const rawOffers = blueprints.map((blueprint) => {
      const components: ScoreComponents = {
        opportunity: opportunitySignal,
        strategic_fit: strategicFitScore({
          offerTitle: blueprint.title,
          checkpointLabel: checkpoint.checkpoint_label,
          strategyContext: args.strategyContext ?? {},
          positioningContext: args.positioningContext ?? {},
          opportunityTexts,
          needTexts,
        }),
        feasibility: feasibilityScore({
          blueprint,
          linkedOpportunityCount: topOpportunityIds.length,
          strategyContext: args.strategyContext ?? {},
        }),
        time_to_impact: timeToImpactScore({
          blueprint,
          linkedOpportunityCount: topOpportunityIds.length,
          checkpointNumber: checkpoint.checkpoint_number,
        }),
      };
      const priorityScore = computeWeightedPriorityScore(components, weights);
      const recommendation = recommendedStatusForScore(priorityScore);
      const rationaleSegments: string[] = [];
      if (opportunitySignal >= 70) rationaleSegments.push("High underserved-outcome pressure");
      else if (opportunitySignal >= 50) rationaleSegments.push("Moderate underserved-outcome pressure");
      else rationaleSegments.push("Early opportunity signal");
      if (components.strategic_fit >= 65) rationaleSegments.push("strong strategy alignment");
      if (components.time_to_impact >= 70) rationaleSegments.push("fast activation potential");
      return {
        id: toOfferId(checkpoint.checkpoint_number, blueprint.title),
        checkpoint_number: checkpoint.checkpoint_number,
        checkpoint_label: checkpoint.checkpoint_label,
        title: blueprint.title,
        type: blueprint.type,
        linked_opportunity_ids: topOpportunityIds,
        priority_score: priorityScore,
        priority_rank: 0,
        recommended_status: recommendation,
        rationale: `${rationaleSegments.join(", ")} at checkpoint ${checkpoint.checkpoint_number}.`,
      } satisfies CheckpointOfferCandidate;
    });

    const ranked = rawOffers
      .sort((a, b) => {
        if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
        return a.title.localeCompare(b.title);
      })
      .slice(0, 3)
      .map((offer, index) => ({
        ...offer,
        priority_rank: index + 1,
      }));

    return {
      checkpoint_number: checkpoint.checkpoint_number,
      checkpoint_label: checkpoint.checkpoint_label,
      checkpoint_description: checkpoint.checkpoint_description,
      offers: ranked,
    };
  });
}
