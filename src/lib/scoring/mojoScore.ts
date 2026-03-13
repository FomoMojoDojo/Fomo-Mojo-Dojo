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
  designed?: boolean | null;
  has_gap?: boolean | null;
};

export type ScoreableOpportunity = {
  journey_key?: string | null;
  importance?: number | null;
  satisfaction?: number | null;
  opportunity_score?: number | null;
  priority_tier?: string | null;
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
  gamma: number;
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

export function computeGateScores(
  inputs: ScoreableInput[],
  jobSteps: ScoreableJobStep[],
  opportunities: ScoreableOpportunity[],
  baselineRunResultJson?: BaselineRunResult,
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

  const customerSteps = safeSteps.filter((step) => normalizeJourneyKey(step.journey_key) === "customer");
  const revenueSteps = safeSteps.filter((step) => normalizeJourneyKey(step.journey_key) === "revenue");
  const opsSteps = safeSteps.filter((step) => normalizeJourneyKey(step.journey_key) === "operations");

  const customerOpps = safeOpps.filter((opp) => normalizeJourneyKey(opp.journey_key) === "customer");
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
          0.2 * journeyHealth(customerSteps) +
          0.15 * ratio(customerOpps.length, 8)),
      0,
      100,
    ),
  );

  const strategyCascadeScore = round1(
    clamp(
      100 *
        (0.25 * strategyCoverage +
          0.2 * journeyHealth(revenueSteps) +
          0.2 * journeyHealth(opsSteps) +
          0.15 * baselineSupport +
          0.1 * ratio(revenueOpps.length + opsOpps.length, 12) +
          0.1 * averageCompleteness(strategyInputs)),
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
          customer_journey_health: round1(journeyHealth(customerSteps) * 100),
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
  gamma = 2.2,
): MojoScoreResult {
  const gateScore = round1(
    weightedHarmonicMean(
      (Object.keys(GATE_WEIGHTS) as GateKey[]).map((key) => ({
        value: perGateScores[key] ?? 0,
        weight: GATE_WEIGHTS[key],
      })),
    ),
  );

  const p_raw = clamp((gateScore / 100) * evidenceMultiplier, 0, 1);
  const mojo_score = roundInt(clamp(100 * Math.pow(p_raw, gamma), 0, 100));

  return {
    mojo_score,
    gateScore,
    p_raw: round1(p_raw * 100) / 100,
    gamma,
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
  baselineRunResultJson?: BaselineRunResult;
  gamma?: number;
}): FullMojoScoreResult {
  const gateResult = computeGateScores(
    args.inputs,
    args.jobSteps,
    args.opportunities,
    args.baselineRunResultJson,
  );

  const evidenceResult = computeEvidenceMultiplier(
    args.baselineRunResultJson ?? null,
    gateResult.counts.inputs,
    gateResult.counts.job_steps,
    gateResult.counts.opportunities,
  );

  const mojoResult = computeMojoScore(
    gateResult.perGateScores,
    evidenceResult.evidenceMultiplier,
    args.gamma ?? 2.2,
  );

  const projectedResult = computePotentialProjected(mojoResult.mojo_score);

  const area_scores_json = {
    scoring_version: "mojo_v2",
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
    calibration: {
      gamma: mojoResult.gamma,
      p_raw: mojoResult.p_raw,
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
