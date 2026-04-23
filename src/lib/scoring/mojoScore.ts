export type ScoreableInput = {
  input_key?: string | null;
  group_key?: string | null;
  sub_group?: string | null;
  completeness?: number | null;
  status?: string | null;
  score_impact?: number | null;
  impact_tier?: string | null;
};

export type ScoreableJobStep = {
  journey_key?: string | null;
  journey_title?: string | null;
  journey_subtitle?: string | null;
  designed?: boolean | null;
  has_gap?: boolean | null;
};

export type ScoreableOpportunity = {
  journey_key?: string | null;
  outcome?: string | null;
  step_label?: string | null;
  importance?: number | null;
  satisfaction?: number | null;
  opportunity_score?: number | null;
  priority_tier?: string | null;
};

export type ScoreableRoute = {
  title?: string | null;
  short_description?: string | null;
  category?: string | null;
};

export type ScoreableDesiredOutcome = {
  journey_key?: string | null;
  outcome_statement?: string | null;
  leading_indicator?: string | null;
  target_direction?: string | null;
  direction?: string | null;
  metric?: string | null;
  actor?: string | null;
  action?: string | null;
  object?: string | null;
  context?: string | null;
  constraint?: string | null;
  is_primary?: boolean | null;
  level?: string | null;
};

export type StrategicProblemInput = {
  statement?: string | null;
  source?: string | null;
  status?: string | null;
};

export type BaselineLedgerItem = {
  confidence?: number | null;
  signal_strength?: string | null;
  bucket?: string | null;
};

export type BaselineRunResult = {
  evidence_ledger?: BaselineLedgerItem[] | null;
  top_hypotheses?: string[] | null;
  open_questions?: string[] | null;
  lens_card?: Record<string, unknown> | null;
  market_initiative_success?: {
    proven?: boolean | null;
    low_pct?: number | null;
    typical_pct?: number | null;
    high_pct?: number | null;
    source?: string | null;
    as_of?: string | null;
    evidence_urls?: string[] | null;
  } | null;
  market_success_rate_pct?: number | null;
  market_success_low_pct?: number | null;
  market_success_high_pct?: number | null;
  market_success_source?: string | null;
  market_success_as_of?: string | null;
} | null;

export type GateKey =
  | "positioning"
  | "customer_insight"
  | "strategy_cascade"
  | "gtm_execution";

export type EvidenceStatus =
  | "no_public_evidence"
  | "generated_no_baseline"
  | "public_evidence_thin"
  | "public_evidence_partial"
  | "public_evidence_strong"
  | "baseline_plus_artifacts";

export type GateScoreDetail = {
  label: string;
  score: number;
  components: Record<string, number>;
};

export type GateScoreResult = {
  perGateScores: Record<GateKey, number>;
  gateDetails: Record<GateKey, GateScoreDetail>;
  counts: {
    inputs: number;
    job_steps: number;
    opportunities: number;
    evidence_ledger: number;
    strategic_problems: number;
    desired_outcomes: number;
  };
  desiredOutcomeContext: {
    available: boolean;
    score: number;
    primary_statement: string | null;
    coverage_ratio: number;
    matched_keywords: string[];
    missing_keywords: string[];
    status: string;
  };
  strategicProblemContext: {
    score: number;
    token_coverage: number;
    statement_coverage: number;
    matched_keywords: string[];
    missing_keywords: string[];
    status: string;
    strategic_problem_count: number;
    reconciled_count: number;
  };
  initiativeContext: {
    primary_journey_key: string;
    primary_journey_title: string;
    initiative_keywords: string[];
    opportunity_focus: {
      initiative: number;
      related: number;
      other: number;
      initiative_ratio: number;
      related_ratio: number;
    };
    route_focus: {
      initiative: number;
      related: number;
      other: number;
      initiative_ratio: number;
      related_ratio: number;
    };
    step_focus: {
      initiative_steps: number;
      initiative_journey_health: number;
    };
    initiative_focus_norm: number;
    initiative_focus_multiplier: number;
  };
};

export type EvidenceResult = {
  evidenceMultiplier: number;
  evidence_status: EvidenceStatus;
  evidence_note: string;
  evidenceBreakdown: {
    baseline_strength: number;
    artifact_coverage: number;
    ledger_count: number;
    avg_confidence: number;
    inputs_count: number;
    steps_count: number;
    opportunities_count: number;
  };
};

export type MojoScoreResult = {
  mojo_score: number;
  gateScore: number;
  p_raw: number;
  p_curve: number;
  gamma: number;
  market_baseline_points: number;
  benchmark_p_raw: number;
  advantage_points: number;
  curve_points: number;
  failure_correction_norm: number;
  failure_correction_multiplier: number;
};

export type PotentialProjectedResult = {
  potential_score: number;
  projected_score: number;
};

export type FullMojoScoreResult = GateScoreResult &
  EvidenceResult &
  MojoScoreResult &
  PotentialProjectedResult & {
    area_scores_json: Record<string, unknown>;
  };

const POSITIONING_KEYS = [
  "comp-alt",
  "unique-attr",
  "val-prop",
  "target-aud",
  "market-cat",
];

const CUSTOMER_KEYS = ["needs-assessment", "family-satisfaction"];
const STRATEGY_KEYS = ["program-model", "outcome-data"];
const GTM_KEYS = [
  "referral-map",
  "brand-narrative",
  "channel-strat",
  "donor-retention",
  "grant-pipeline",
];

const GATE_WEIGHTS: Record<GateKey, number> = {
  positioning: 0.3,
  customer_insight: 0.25,
  strategy_cascade: 0.25,
  gtm_execution: 0.2,
};
const MARKET_BASELINE_DEFAULT_LOW = 0;
const MARKET_BASELINE_DEFAULT_HIGH = 20;
const MARKET_BASELINE_DEFAULT_TYPICAL = 12;
const ADVANTAGE_WEIGHT_POINTS = 35;
const CURVE_WEIGHT_POINTS = 45;
const STRATEGIC_PROBLEM_STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "against",
  "all",
  "also",
  "among",
  "and",
  "are",
  "because",
  "been",
  "being",
  "between",
  "both",
  "but",
  "can",
  "cannot",
  "could",
  "during",
  "each",
  "from",
  "have",
  "into",
  "just",
  "more",
  "most",
  "not",
  "only",
  "other",
  "our",
  "over",
  "same",
  "should",
  "that",
  "their",
  "there",
  "they",
  "this",
  "those",
  "through",
  "under",
  "very",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "without",
  "would",
  "your",
]);

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function roundInt(n: number) {
  return Math.round(n);
}

function avg(nums: number[]) {
  if (!nums.length) return 0;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function ratio(count: number, max: number) {
  if (max <= 0) return 0;
  return clamp(count / max, 0, 1);
}

function normalizeJourneyKey(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function isCustomerJourneyKey(value: string | null | undefined) {
  const key = normalizeJourneyKey(value);
  return key === "customer" || key.startsWith("customer-");
}

function titleFromJourneyKey(key: string) {
  if (!key) return "Core Initiative";
  if (key === "customer") return "Customer Journey";
  if (key === "revenue") return "Revenue Journey";
  if (key === "operations") return "Operations Journey";
  return key
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeSignalStrength(value: string | null | undefined) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "high") return 1;
  if (raw === "medium") return 0.66;
  if (raw === "low") return 0.33;
  return 0.5;
}

function normalizeConfidence(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value <= 1) return clamp(value, 0, 1);
  if (value <= 10) return clamp(value / 10, 0, 1);
  return clamp(value / 100, 0, 1);
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

type MarketBaselineCalibration = {
  low: number;
  high: number;
  typical: number;
  source: string;
  as_of: string | null;
  proven: boolean;
};

function deriveMarketBaselineCalibration(
  baselineRunResultJson?: BaselineRunResult,
): MarketBaselineCalibration {
  const baseline = (baselineRunResultJson ?? null) as Record<string, unknown> | null;
  const market = (baseline?.market_initiative_success ?? null) as Record<string, unknown> | null;
  const evidenceUrls = Array.isArray(market?.evidence_urls)
    ? market?.evidence_urls.filter((item) => String(item || "").trim().length > 0)
    : [];
  const hasProof = market?.proven === true || (evidenceUrls.length > 0 && String(market?.source || "").trim().length > 0);

  let low = MARKET_BASELINE_DEFAULT_LOW;
  let high = MARKET_BASELINE_DEFAULT_HIGH;
  let typical = MARKET_BASELINE_DEFAULT_TYPICAL;

  if (hasProof) {
    low = numberOrNull(market?.low_pct) ??
      numberOrNull(baseline?.market_success_low_pct) ??
      MARKET_BASELINE_DEFAULT_LOW;
    high = numberOrNull(market?.high_pct) ??
      numberOrNull(baseline?.market_success_high_pct) ??
      MARKET_BASELINE_DEFAULT_HIGH;
    typical =
      numberOrNull(market?.typical_pct) ??
      numberOrNull(baseline?.market_success_rate_pct) ??
      MARKET_BASELINE_DEFAULT_TYPICAL;
  }

  if (high < low) {
    const swap = low;
    low = high;
    high = swap;
  }

  if (typical < low) low = typical;
  if (typical > high) high = typical;
  typical = clamp(typical, low, high);

  const source = hasProof
    ? String(market?.source || baseline?.market_success_source || "").trim() || "provided_without_source_name"
    : "default_range_0_20_unproven";
  const asOfRaw = hasProof ? String(market?.as_of || baseline?.market_success_as_of || "").trim() : "";

  return {
    low: round1(clamp(low, 0, 100)),
    high: round1(clamp(high, 0, 100)),
    typical: round1(clamp(typical, 0, 100)),
    source,
    as_of: asOfRaw || null,
    proven: hasProof,
  };
}

function countMatchingInputs(inputs: ScoreableInput[], keys: string[]) {
  const keySet = new Set(keys);
  return inputs.filter((input) => keySet.has(String(input.input_key || "").trim())).length;
}

function averageCompleteness(inputs: ScoreableInput[]) {
  const values = inputs
    .map((input) => Number(input.completeness))
    .filter((value) => Number.isFinite(value) && value > 0) as number[];

  if (!values.length) return 0;
  return clamp(avg(values), 0, 100) / 100;
}

function journeyHealth(steps: ScoreableJobStep[]) {
  if (!steps.length) return 0;

  const designedRatio = steps.filter((step) => step.designed === true).length / steps.length;
  const nonGapRatio = steps.filter((step) => step.has_gap !== true).length / steps.length;
  return clamp(0.55 * designedRatio + 0.45 * nonGapRatio, 0, 1);
}

function weightedHarmonicMean(entries: Array<{ value: number; weight: number }>) {
  const valid = entries
    .map((entry) => ({
      weight: entry.weight,
      value: clamp(entry.value, 1, 100),
    }))
    .filter((entry) => entry.weight > 0);

  if (!valid.length) return 0;

  const denom = valid.reduce((sum, entry) => sum + entry.weight / entry.value, 0);
  if (denom <= 0) return 0;

  const weightSum = valid.reduce((sum, entry) => sum + entry.weight, 0);
  return (weightSum / denom);
}

function tokenizeStrategicText(value: unknown) {
  const raw = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!raw) return [] as string[];

  return raw
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !STRATEGIC_PROBLEM_STOPWORDS.has(token));
}

function deriveInitiativeContext(
  jobSteps: ScoreableJobStep[],
  strategicProblems: StrategicProblemInput[],
) {
  const byJourney = new Map<string, {
    count: number;
    title: string;
    subtitle: string;
  }>();

  for (const step of jobSteps) {
    const key = normalizeJourneyKey(step.journey_key);
    if (!key) continue;
    const current = byJourney.get(key) ?? { count: 0, title: "", subtitle: "" };
    current.count += 1;
    if (!current.title && String(step.journey_title || "").trim()) {
      current.title = String(step.journey_title || "").trim();
    }
    if (!current.subtitle && String(step.journey_subtitle || "").trim()) {
      current.subtitle = String(step.journey_subtitle || "").trim();
    }
    byJourney.set(key, current);
  }

  if (!byJourney.size) {
    return {
      primary_journey_key: "customer",
      primary_journey_title: "Customer Journey",
      initiative_keywords: ["customer", "journey"],
    };
  }

  const ranked = Array.from(byJourney.entries())
    .map(([key, value]) => {
      const text = `${value.title} ${value.subtitle}`.toLowerCase();
      const economicSignal = /(revenue|investment|investor|funding|capital|contract|pipeline)/.test(text) ? 2 : 0;
      const customCustomerSignal = key.startsWith("customer-") ? 2 : 0;
      const nonGenericSignal = key !== "customer" ? 3 : 0;
      return {
        key,
        value,
        score: value.count + economicSignal + customCustomerSignal + nonGenericSignal,
      };
    })
    .sort((a, b) => b.score - a.score);

  const selected = ranked[0];
  const title = selected.value.title || titleFromJourneyKey(selected.key);
  const primaryProblem = String(strategicProblems[0]?.statement || "");
  const keywords = tokenizeStrategicText(`${selected.key} ${title} ${selected.value.subtitle} ${primaryProblem}`).slice(0, 24);

  return {
    primary_journey_key: selected.key,
    primary_journey_title: title,
    initiative_keywords: keywords.length > 0 ? keywords : tokenizeStrategicText(title).slice(0, 12),
  };
}

function keywordOverlap(text: string, keywords: string[]) {
  if (!keywords.length) return 0;
  const textTokens = new Set(tokenizeStrategicText(text));
  let hits = 0;
  for (const keyword of keywords) {
    if (textTokens.has(keyword)) hits++;
  }
  return hits;
}

function computeStrategicProblemAlignment(
  strategicProblems: StrategicProblemInput[],
  opportunities: ScoreableOpportunity[],
  routes: ScoreableRoute[],
) {
  const problems = Array.isArray(strategicProblems) ? strategicProblems : [];
  const reconciledCount = problems.filter((item) => String(item.status || "").toLowerCase() === "reconciled").length;

  if (!problems.length) {
    return {
      score: 50,
      token_coverage: 50,
      statement_coverage: 50,
      matched_keywords: [] as string[],
      missing_keywords: [] as string[],
      status: "no_strategic_problem",
      strategic_problem_count: 0,
      reconciled_count: 0,
    };
  }

  const keywordSet = new Set<string>();
  for (const problem of problems) {
    for (const token of tokenizeStrategicText(problem.statement)) {
      keywordSet.add(token);
    }
  }
  const keywords = Array.from(keywordSet).slice(0, 28);

  if (!keywords.length) {
    return {
      score: 50,
      token_coverage: 50,
      statement_coverage: 50,
      matched_keywords: [] as string[],
      missing_keywords: [] as string[],
      status: "insufficient_problem_keywords",
      strategic_problem_count: problems.length,
      reconciled_count: reconciledCount,
    };
  }

  const corpusParts: string[] = [];
  for (const opp of opportunities) {
    corpusParts.push(String(opp.outcome || ""));
    corpusParts.push(String(opp.step_label || ""));
  }
  for (const route of routes) {
    corpusParts.push(String(route.title || ""));
    corpusParts.push(String(route.short_description || ""));
    corpusParts.push(String(route.category || ""));
  }

  const corpusTokens = new Set<string>(tokenizeStrategicText(corpusParts.join(" ")));
  const matchedKeywords = keywords.filter((keyword) => corpusTokens.has(keyword));
  const missingKeywords = keywords.filter((keyword) => !corpusTokens.has(keyword));
  const tokenCoverage = keywords.length ? matchedKeywords.length / keywords.length : 0.5;
  const statementCoverage =
    problems.filter((problem) =>
      tokenizeStrategicText(problem.statement).some((token) => corpusTokens.has(token))
    ).length / problems.length;

  const alignmentNorm = clamp(0.65 * tokenCoverage + 0.35 * statementCoverage, 0, 1);
  const score = round1(alignmentNorm * 100);

  return {
    score,
    token_coverage: round1(tokenCoverage * 100),
    statement_coverage: round1(statementCoverage * 100),
    matched_keywords: matchedKeywords.slice(0, 16),
    missing_keywords: missingKeywords.slice(0, 16),
    status: score >= 70 ? "aligned" : score >= 45 ? "partial" : "weak",
    strategic_problem_count: problems.length,
    reconciled_count: reconciledCount,
  };
}

function computeDesiredOutcomeAlignment(
  desiredOutcomes: ScoreableDesiredOutcome[],
  opportunities: ScoreableOpportunity[],
  routes: ScoreableRoute[],
) {
  const outcomes = Array.isArray(desiredOutcomes) ? desiredOutcomes : [];

  // Prefer primary-level outcome, then is_primary flag, then customer journey, then first
  const primary =
    outcomes.find((item) => item?.level === "primary") ||
    outcomes.find((item) => item?.is_primary === true) ||
    outcomes.find((item) => normalizeJourneyKey(item?.journey_key) === "customer") ||
    outcomes[0] ||
    null;

  if (!primary) {
    return {
      available: false,
      score: 50,
      primary_statement: null,
      coverage_ratio: 0.5,
      matched_keywords: [] as string[],
      missing_keywords: [] as string[],
      status: "not_available",
      behavior_structured: false,
    };
  }

  const primaryStatement = String(primary.outcome_statement || "").trim();
  const keywordSource = [
    primaryStatement,
    String(primary.leading_indicator || ""),
    String(primary.metric || ""),
    String(primary.actor || ""),
    String(primary.action || ""),
    String(primary.object || ""),
    String(primary.context || ""),
  ]
    .join(" ")
    .trim();
  const keywords = Array.from(new Set(tokenizeStrategicText(keywordSource))).slice(0, 24);
  if (!keywords.length) {
    return {
      available: true,
      score: 50,
      primary_statement: primaryStatement || null,
      coverage_ratio: 0.5,
      matched_keywords: [] as string[],
      missing_keywords: [] as string[],
      status: "insufficient_keywords",
      behavior_structured: false,
    };
  }

  const corpus = [
    ...opportunities.map(
      (item) => `${String(item.outcome || "")} ${String(item.step_label || "")}`,
    ),
    ...routes.map(
      (item) => `${String(item.title || "")} ${String(item.short_description || "")}`,
    ),
  ].join(" ");
  const corpusTokens = new Set(tokenizeStrategicText(corpus));
  const matched = keywords.filter((token) => corpusTokens.has(token));
  const missing = keywords.filter((token) => !corpusTokens.has(token));
  const coverageRatio = keywords.length > 0 ? matched.length / keywords.length : 0.5;

  // Bonus: fully structured outcomes (level + actor + action) get up to +8 pts
  const behaviorStructured = !!(
    primary.level &&
    String(primary.actor || "").trim() &&
    String(primary.action || "").trim()
  );
  const structureBonus = behaviorStructured ? 8 : 0;
  const score = round1(clamp(100 * coverageRatio + structureBonus, 0, 100));

  return {
    available: true,
    score,
    primary_statement: primaryStatement || null,
    coverage_ratio: round1(coverageRatio * 100),
    matched_keywords: matched.slice(0, 16),
    missing_keywords: missing.slice(0, 16),
    status: score >= 70 ? "aligned" : score >= 45 ? "partial" : "weak",
    behavior_structured: behaviorStructured,
  };
}

export function computeGateScores(
  inputs: ScoreableInput[],
  jobSteps: ScoreableJobStep[],
  opportunities: ScoreableOpportunity[],
  desiredOutcomes: ScoreableDesiredOutcome[] = [],
  baselineRunResultJson?: BaselineRunResult,
  strategicProblems: StrategicProblemInput[] = [],
  routes: ScoreableRoute[] = [],
): GateScoreResult {
  const safeInputs = Array.isArray(inputs) ? inputs : [];
  const safeSteps = Array.isArray(jobSteps) ? jobSteps : [];
  const safeOpps = Array.isArray(opportunities) ? opportunities : [];
  const ledger = Array.isArray(baselineRunResultJson?.evidence_ledger)
    ? baselineRunResultJson?.evidence_ledger ?? []
    : [];

  const ledgerCount = ledger.length;
  const avgConfidence = avg(
    ledger
      .map((item) => Number(item?.confidence))
      .filter((value) => Number.isFinite(value)) as number[],
  );
  const confNorm = normalizeConfidence(avgConfidence);
  const strengthNorm = avg(
    ledger.map((item) => normalizeSignalStrength(item?.signal_strength)),
  );
  const baselineSupport = clamp(0.6 * confNorm + 0.4 * strengthNorm, 0, 1);

  const customerJourneySteps = safeSteps.filter((step) => isCustomerJourneyKey(step.journey_key));
  const revenueSteps = safeSteps.filter((step) => normalizeJourneyKey(step.journey_key) === "revenue");
  const opsSteps = safeSteps.filter((step) => normalizeJourneyKey(step.journey_key) === "operations");

  const customerOpps = safeOpps.filter((opp) => isCustomerJourneyKey(opp.journey_key));
  const revenueOpps = safeOpps.filter((opp) => normalizeJourneyKey(opp.journey_key) === "revenue");
  const opsOpps = safeOpps.filter((opp) => normalizeJourneyKey(opp.journey_key) === "operations");

  const underservedNorm = clamp(
    avg(
      safeOpps.map((opp) =>
        clamp((Number(opp.importance) - Number(opp.satisfaction)) / 9, 0, 1),
      ),
    ),
    0,
    1,
  );
  const oppCoverageNorm = ratio(safeOpps.length, 20);
  const focusNorm = safeOpps.length
    ? safeOpps.filter((opp) => String(opp.priority_tier || "").toLowerCase() === "focus").length / safeOpps.length
    : 0;

  const positioningInputs = safeInputs.filter((input) =>
    POSITIONING_KEYS.includes(String(input.input_key || "").trim()),
  );
  const customerInputs = safeInputs.filter((input) =>
    CUSTOMER_KEYS.includes(String(input.input_key || "").trim()),
  );
  const strategyInputs = safeInputs.filter((input) =>
    STRATEGY_KEYS.includes(String(input.input_key || "").trim()),
  );
  const gtmInputs = safeInputs.filter((input) =>
    GTM_KEYS.includes(String(input.input_key || "").trim()),
  );

  const positioningCoverage = ratio(countMatchingInputs(safeInputs, POSITIONING_KEYS), POSITIONING_KEYS.length);
  const customerCoverage = ratio(countMatchingInputs(safeInputs, CUSTOMER_KEYS), CUSTOMER_KEYS.length);
  const strategyCoverage = ratio(countMatchingInputs(safeInputs, STRATEGY_KEYS), STRATEGY_KEYS.length);
  const gtmCoverage = ratio(countMatchingInputs(safeInputs, GTM_KEYS), GTM_KEYS.length);
  const strategicProblemContext = computeStrategicProblemAlignment(
    strategicProblems,
    safeOpps,
    routes,
  );
  const desiredOutcomeContext = computeDesiredOutcomeAlignment(desiredOutcomes, safeOpps, routes);
  const initiativeBase = deriveInitiativeContext(safeSteps, strategicProblems);
  const initiativeSteps = safeSteps.filter((step) => {
    const key = normalizeJourneyKey(step.journey_key);
    if (key === initiativeBase.primary_journey_key) return true;
    return initiativeBase.primary_journey_key === "customer" && isCustomerJourneyKey(key);
  });
  const oppFocus = safeOpps.map((opp) => {
    const journeyKey = normalizeJourneyKey(opp.journey_key);
    const overlap = keywordOverlap(
      `${String(opp.outcome || "")} ${String(opp.step_label || "")}`,
      initiativeBase.initiative_keywords,
    );
    const directJourneyMatch =
      journeyKey === initiativeBase.primary_journey_key ||
      (initiativeBase.primary_journey_key === "customer" && isCustomerJourneyKey(journeyKey));

    if (directJourneyMatch || overlap >= 2) return "initiative" as const;
    if (overlap >= 1) return "related" as const;
    return "other" as const;
  });
  const routeFocus = routes.map((route) => {
    const overlap = keywordOverlap(
      `${String(route.title || "")} ${String(route.short_description || "")}`,
      initiativeBase.initiative_keywords,
    );
    if (overlap >= 2) return "initiative" as const;
    if (overlap >= 1) return "related" as const;
    return "other" as const;
  });
  const opportunityFocusCounts = {
    initiative: oppFocus.filter((level) => level === "initiative").length,
    related: oppFocus.filter((level) => level === "related").length,
    other: oppFocus.filter((level) => level === "other").length,
  };
  const routeFocusCounts = {
    initiative: routeFocus.filter((level) => level === "initiative").length,
    related: routeFocus.filter((level) => level === "related").length,
    other: routeFocus.filter((level) => level === "other").length,
  };
  const initiativeOppRatio = safeOpps.length
    ? opportunityFocusCounts.initiative / safeOpps.length
    : 0;
  const relatedOppRatio = safeOpps.length
    ? opportunityFocusCounts.related / safeOpps.length
    : 0;
  const initiativeRouteRatio = routes.length
    ? routeFocusCounts.initiative / routes.length
    : 0;
  const relatedRouteRatio = routes.length
    ? routeFocusCounts.related / routes.length
    : 0;
  const initiativeJourneyHealth = journeyHealth(initiativeSteps);
  const initiativeFocusNorm = clamp(
    0.5 * initiativeOppRatio + 0.25 * initiativeRouteRatio + 0.25 * initiativeJourneyHealth,
    0,
    1,
  );
  const initiativeFocusMultiplier = round1(clamp(0.7 + 0.3 * initiativeFocusNorm, 0.7, 1));
  const strategicAlignmentNorm = clamp(strategicProblemContext.score / 100, 0, 1);
  const desiredOutcomeAlignmentNorm = desiredOutcomeContext.available
    ? clamp(desiredOutcomeContext.score / 100, 0, 1)
    : strategicAlignmentNorm;

  const positioningScore = round1(
    clamp(
      100 *
        (0.5 * positioningCoverage +
          0.25 * baselineSupport +
          0.15 * ratio(ledgerCount, 8) +
          0.1 * averageCompleteness(positioningInputs)),
      0,
      100,
    ),
  );

  const customerInsightScore = round1(
    clamp(
      100 *
        (0.2 * customerCoverage +
          0.25 * oppCoverageNorm +
          0.2 * underservedNorm +
          0.2 * journeyHealth(customerJourneySteps) +
          0.15 * ratio(customerOpps.length, 8)),
      0,
      100,
    ),
  );

  const strategyCascadeScore = round1(
    clamp(
      100 *
        (0.2 * strategyCoverage +
          0.15 * journeyHealth(revenueSteps) +
          0.15 * journeyHealth(opsSteps) +
          0.15 * baselineSupport +
          0.1 * ratio(revenueOpps.length + opsOpps.length, 12) +
          0.1 * averageCompleteness(strategyInputs) +
          0.12 * strategicAlignmentNorm +
          0.03 * desiredOutcomeAlignmentNorm),
      0,
      100,
    ),
  );

  const gtmExecutionScore = round1(
    clamp(
      100 *
        (0.3 * gtmCoverage +
          0.2 * journeyHealth(revenueSteps) +
          0.15 * ratio(revenueOpps.length, 8) +
          0.15 * ratio(opsOpps.length, 8) +
          0.1 * focusNorm +
          0.1 * averageCompleteness(gtmInputs)),
      0,
      100,
    ),
  );

  return {
    perGateScores: {
      positioning: positioningScore,
      customer_insight: customerInsightScore,
      strategy_cascade: strategyCascadeScore,
      gtm_execution: gtmExecutionScore,
    },
    gateDetails: {
      positioning: {
        label: "Positioning",
        score: positioningScore,
        components: {
          key_input_coverage: round1(positioningCoverage * 100),
          baseline_support: round1(baselineSupport * 100),
          evidence_ledger_coverage: round1(ratio(ledgerCount, 8) * 100),
          completion_bonus: round1(averageCompleteness(positioningInputs) * 100),
        },
      },
      customer_insight: {
        label: "Customer Insight",
        score: customerInsightScore,
        components: {
          key_input_coverage: round1(customerCoverage * 100),
          opportunity_coverage: round1(oppCoverageNorm * 100),
          underserved_signal: round1(underservedNorm * 100),
          customer_journey_health: round1(journeyHealth(customerJourneySteps) * 100),
          customer_opportunity_coverage: round1(ratio(customerOpps.length, 8) * 100),
        },
      },
      strategy_cascade: {
        label: "Strategy Cascade",
        score: strategyCascadeScore,
        components: {
          key_input_coverage: round1(strategyCoverage * 100),
          revenue_journey_health: round1(journeyHealth(revenueSteps) * 100),
          operations_journey_health: round1(journeyHealth(opsSteps) * 100),
          baseline_support: round1(baselineSupport * 100),
          strategy_opportunity_coverage: round1(ratio(revenueOpps.length + opsOpps.length, 12) * 100),
          completion_bonus: round1(averageCompleteness(strategyInputs) * 100),
          strategic_problem_alignment: strategicProblemContext.score,
          desired_outcome_alignment: desiredOutcomeContext.score,
        },
      },
      gtm_execution: {
        label: "GTM Execution",
        score: gtmExecutionScore,
        components: {
          key_input_coverage: round1(gtmCoverage * 100),
          revenue_journey_health: round1(journeyHealth(revenueSteps) * 100),
          revenue_opportunity_coverage: round1(ratio(revenueOpps.length, 8) * 100),
          operations_opportunity_coverage: round1(ratio(opsOpps.length, 8) * 100),
          focus_opportunity_signal: round1(focusNorm * 100),
          completion_bonus: round1(averageCompleteness(gtmInputs) * 100),
        },
      },
    },
    counts: {
      inputs: safeInputs.length,
      job_steps: safeSteps.length,
      opportunities: safeOpps.length,
      evidence_ledger: ledgerCount,
      strategic_problems: strategicProblemContext.strategic_problem_count,
      desired_outcomes: Array.isArray(desiredOutcomes) ? desiredOutcomes.length : 0,
    },
    desiredOutcomeContext,
    strategicProblemContext,
    initiativeContext: {
      ...initiativeBase,
      opportunity_focus: {
        ...opportunityFocusCounts,
        initiative_ratio: round1(initiativeOppRatio * 100),
        related_ratio: round1(relatedOppRatio * 100),
      },
      route_focus: {
        ...routeFocusCounts,
        initiative_ratio: round1(initiativeRouteRatio * 100),
        related_ratio: round1(relatedRouteRatio * 100),
      },
      step_focus: {
        initiative_steps: initiativeSteps.length,
        initiative_journey_health: round1(initiativeJourneyHealth * 100),
      },
      initiative_focus_norm: round1(initiativeFocusNorm * 100),
      initiative_focus_multiplier: initiativeFocusMultiplier,
    },
  };
}

export function computeEvidenceMultiplier(
  baselineRunResultJson: BaselineRunResult,
  inputsCount: number,
  stepsCount: number,
  oppsCount: number,
): EvidenceResult {
  const ledger = Array.isArray(baselineRunResultJson?.evidence_ledger)
    ? baselineRunResultJson?.evidence_ledger ?? []
    : [];
  const ledgerCount = ledger.length;
  const avgConfidence = avg(
    ledger
      .map((item) => Number(item?.confidence))
      .filter((value) => Number.isFinite(value)) as number[],
  );
  const confNorm = normalizeConfidence(avgConfidence);

  const baselineStrength = clamp(
    0.55 * ratio(ledgerCount, 12) +
      0.45 * confNorm,
    0,
    1,
  );

  const artifactCoverage = clamp(
    0.35 * ratio(inputsCount, 14) +
      0.3 * ratio(stepsCount, 18) +
      0.35 * ratio(oppsCount, 20),
    0,
    1,
  );

  const evidenceMultiplier = round1(
    clamp(0.6 + 0.18 * baselineStrength + 0.22 * artifactCoverage, 0.6, 1.0),
  );

  let evidence_status: EvidenceStatus;
  if (ledgerCount === 0 && artifactCoverage === 0) {
    evidence_status = "no_public_evidence";
  } else if (ledgerCount === 0) {
    evidence_status = "generated_no_baseline";
  } else if (baselineStrength < 0.35) {
    evidence_status = "public_evidence_thin";
  } else if (baselineStrength < 0.65) {
    evidence_status = "public_evidence_partial";
  } else if (artifactCoverage >= 0.45) {
    evidence_status = "baseline_plus_artifacts";
  } else {
    evidence_status = "public_evidence_strong";
  }

  const evidence_note =
    ledgerCount > 0
      ? `ledger=${ledgerCount}, avg_conf=${avgConfidence.toFixed(1)}, artifacts=${Math.round(artifactCoverage * 100)}%`
      : `no baseline ledger, artifacts=${Math.round(artifactCoverage * 100)}%`;

  return {
    evidenceMultiplier,
    evidence_status,
    evidence_note,
    evidenceBreakdown: {
      baseline_strength: round1(baselineStrength * 100),
      artifact_coverage: round1(artifactCoverage * 100),
      ledger_count: ledgerCount,
      avg_confidence: round1(avgConfidence),
      inputs_count: inputsCount,
      steps_count: stepsCount,
      opportunities_count: oppsCount,
    },
  };
}

export function computeMojoScore(
  perGateScores: Record<GateKey, number>,
  evidenceMultiplier: number,
  initiativeFocusMultiplier = 1,
  gamma = 2.2,
  marketBaselinePoints = MARKET_BASELINE_DEFAULT_TYPICAL,
  benchmarkPRaw = MARKET_BASELINE_DEFAULT_TYPICAL / 100,
): MojoScoreResult {
  const gateScore = round1(
    weightedHarmonicMean(
      (Object.keys(GATE_WEIGHTS) as GateKey[]).map((key) => ({
        value: perGateScores[key] ?? 0,
        weight: GATE_WEIGHTS[key],
      })),
    ),
  );

  const clarityNorm = clamp(
    ((perGateScores.positioning ?? 0) + (perGateScores.strategy_cascade ?? 0)) / 200,
    0,
    1,
  );
  const marketDefinitionNorm = clamp((perGateScores.positioning ?? 0) / 100, 0, 1);
  const customerInsightNorm = clamp((perGateScores.customer_insight ?? 0) / 100, 0, 1);
  const failureCorrectionNorm = clamp(
    0.4 * clarityNorm + 0.3 * marketDefinitionNorm + 0.3 * customerInsightNorm,
    0,
    1,
  );
  const failureCorrectionMultiplier = round1(clamp(0.6 + 0.4 * failureCorrectionNorm, 0.6, 1));
  const p_raw = clamp(
    (gateScore / 100) * evidenceMultiplier * initiativeFocusMultiplier * failureCorrectionMultiplier,
    0,
    1,
  );
  const p_curve = clamp(Math.pow(p_raw, gamma), 0, 1);
  const advantage_points = Math.max(0, (p_raw - benchmarkPRaw) * ADVANTAGE_WEIGHT_POINTS);
  const curve_points = Math.max(0, p_curve * CURVE_WEIGHT_POINTS);
  // Mojo score is interpreted as probability points: 1% success = 1 Mojo point.
  const mojo_score = roundInt(
    clamp(
      marketBaselinePoints + advantage_points + curve_points,
      marketBaselinePoints,
      100,
    ),
  );

  return {
    mojo_score,
    gateScore,
    p_raw: round1(p_raw * 100) / 100,
    p_curve: round1(p_curve * 100) / 100,
    gamma,
    market_baseline_points: marketBaselinePoints,
    benchmark_p_raw: benchmarkPRaw,
    advantage_points: round1(advantage_points),
    curve_points: round1(curve_points),
    failure_correction_norm: round1(failureCorrectionNorm * 100) / 100,
    failure_correction_multiplier: round1(failureCorrectionMultiplier * 100) / 100,
  };
}

export function computePotentialProjected(mojo_score: number): PotentialProjectedResult {
  const current = clamp(mojo_score, 0, 100);
  const headroom = 100 - current;

  const potential_score = roundInt(
    clamp(current + Math.min(22, headroom * 0.35), 0, 100),
  );
  const projected_score = roundInt(
    clamp(
      Math.max(potential_score + 10, current + Math.min(42, headroom * 0.62)),
      0,
      100,
    ),
  );

  return { potential_score, projected_score };
}

export function scoreCompanyMojo(args: {
  inputs: ScoreableInput[];
  jobSteps: ScoreableJobStep[];
  opportunities: ScoreableOpportunity[];
  managedOutcomes?: ScoreableDesiredOutcome[];
  routes?: ScoreableRoute[];
  strategicProblems?: StrategicProblemInput[];
  baselineRunResultJson?: BaselineRunResult;
  gamma?: number;
}): FullMojoScoreResult {
  const gateResult = computeGateScores(
    args.inputs,
    args.jobSteps,
    args.opportunities,
    args.managedOutcomes ?? [],
    args.baselineRunResultJson,
    args.strategicProblems ?? [],
    args.routes ?? [],
  );

  const evidenceResult = computeEvidenceMultiplier(
    args.baselineRunResultJson ?? null,
    gateResult.counts.inputs,
    gateResult.counts.job_steps,
    gateResult.counts.opportunities,
  );

  const marketBaseline = deriveMarketBaselineCalibration(args.baselineRunResultJson ?? null);
  const mojoResult = computeMojoScore(
    gateResult.perGateScores,
    evidenceResult.evidenceMultiplier,
    gateResult.initiativeContext.initiative_focus_multiplier,
    args.gamma ?? 2.2,
    marketBaseline.typical,
    marketBaseline.typical / 100,
  );

  const projectedResult = computePotentialProjected(mojoResult.mojo_score);

  const area_scores_json = {
    scoring_version: "mojo_v3",
    gate_weights: GATE_WEIGHTS,
    gate_score: mojoResult.gateScore,
    per_gate_scores: gateResult.gateDetails,
    evidence: {
      multiplier: evidenceResult.evidenceMultiplier,
      status: evidenceResult.evidence_status,
      note: evidenceResult.evidence_note,
      ...evidenceResult.evidenceBreakdown,
    },
    counts: gateResult.counts,
    desired_outcome_context: gateResult.desiredOutcomeContext,
    strategic_problem_context: gateResult.strategicProblemContext,
    initiative_context: gateResult.initiativeContext,
    calibration: {
      gamma: mojoResult.gamma,
      p_raw: mojoResult.p_raw,
      p_curve: mojoResult.p_curve,
      market_baseline_points: mojoResult.market_baseline_points,
      benchmark_p_raw: mojoResult.benchmark_p_raw,
      advantage_points: mojoResult.advantage_points,
      curve_points: mojoResult.curve_points,
      failure_correction_norm: mojoResult.failure_correction_norm,
      failure_correction_multiplier: mojoResult.failure_correction_multiplier,
      initiative_focus_multiplier: gateResult.initiativeContext.initiative_focus_multiplier,
      market_statistics: {
        typical_success_low_pct: marketBaseline.low,
        typical_success_pct: marketBaseline.typical,
        typical_success_high_pct: marketBaseline.high,
        source: marketBaseline.source,
        as_of: marketBaseline.as_of,
        proven: marketBaseline.proven,
        interpretation: "Current reality starts from a market baseline and rises as validated readiness improves.",
      },
    },
    outputs: {
      mojo_score: mojoResult.mojo_score,
      potential_score: projectedResult.potential_score,
      projected_score: projectedResult.projected_score,
    },
  };

  return {
    ...gateResult,
    ...evidenceResult,
    ...mojoResult,
    ...projectedResult,
    area_scores_json,
  };
}
