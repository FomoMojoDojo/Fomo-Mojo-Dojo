import type { HypothesisProvenanceCard } from "@/hooks/useStrategicHypotheses";

export type AuthorityBand = "outside" | "organization" | "customer";
export type AuthorityPhase = "pre_diagnosis" | "diagnose" | "focus" | "flow";
export type StrategicThemeKey =
  | "craft_quality"
  | "partner_outcomes"
  | "operational_reliability"
  | "proof_trust"
  | "governance_impact"
  | "strategic_guidance"
  | "price_convenience";

type SourceShape = { outside: number; organization: number; customer: number };

type StrategicTheme = {
  key: StrategicThemeKey;
  label: string;
  patterns: string[];
};

const STRATEGIC_THEMES: StrategicTheme[] = [
  {
    key: "craft_quality",
    label: "craft quality",
    patterns: ["coffee quality", "quality", "roast", "roasting", "specialty coffee", "artisanal", "beans", "flavor"],
  },
  {
    key: "partner_outcomes",
    label: "partner operational outcomes",
    patterns: ["partner", "operator", "operators", "customer success", "repeat purchasing", "repeat buying", "risk", "margin", "business outcome"],
  },
  {
    key: "operational_reliability",
    label: "operational reliability",
    patterns: ["reliability", "consistency", "consistent", "predictable", "support", "documentation", "training", "onboarding", "operational", "dial-in", "batch variability", "recipe-adjustment"],
  },
  {
    key: "proof_trust",
    label: "proof and trust",
    patterns: ["proof", "trust", "confidence", "credibility", "credible"],
  },
  {
    key: "governance_impact",
    label: "governance and impact visibility",
    patterns: ["governance", "impact", "donor", "endowment", "funding", "first responder", "allocation"],
  },
  {
    key: "strategic_guidance",
    label: "strategic guidance",
    patterns: ["guidance", "path", "prerequisite", "execution", "rework", "progress", "decision", "brand"],
  },
  {
    key: "price_convenience",
    label: "price or convenience",
    patterns: ["price", "pricing", "budget", "convenience", "easy", "easier"],
  },
];

const BAND_WEIGHTS: Record<AuthorityPhase, Record<AuthorityBand, number>> = {
  pre_diagnosis: { outside: 1.45, organization: 1.0, customer: 1.15 },
  diagnose: { outside: 0.8, organization: 1.55, customer: 1.35 },
  focus: { outside: 0.55, organization: 1.55, customer: 1.55 },
  flow: { outside: 0.45, organization: 1.2, customer: 1.75 },
};

const THEME_BIAS_BY_PHASE: Record<AuthorityPhase, Partial<Record<StrategicThemeKey, number>>> = {
  pre_diagnosis: {
    craft_quality: 1.2,
    proof_trust: 1.0,
    partner_outcomes: 0.95,
    operational_reliability: 0.95,
  },
  diagnose: {
    craft_quality: 0.75,
    proof_trust: 1.2,
    partner_outcomes: 1.3,
    operational_reliability: 1.25,
    governance_impact: 1.15,
  },
  focus: {
    craft_quality: 0.6,
    proof_trust: 1.15,
    partner_outcomes: 1.35,
    operational_reliability: 1.35,
    governance_impact: 1.15,
  },
  flow: {
    craft_quality: 0.55,
    proof_trust: 1.05,
    partner_outcomes: 1.15,
    operational_reliability: 1.2,
    governance_impact: 1.2,
  },
};

function clean(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function aggregateSupportShape(row: HypothesisProvenanceCard): SourceShape {
  return row.supportingClaims.reduce(
    (acc, claim) => {
      acc.outside += claim.supportShape.outside;
      acc.organization += claim.supportShape.organization;
      acc.customer += claim.supportShape.customer;
      return acc;
    },
    { outside: 0, organization: 0, customer: 0 },
  );
}

function normalizeBand(value: string | null | undefined): AuthorityBand {
  const normalized = clean(value).toLowerCase();
  if (normalized === "organization" || normalized === "org") return "organization";
  if (normalized === "customer") return "customer";
  return "outside";
}

function validationBoost(value: string | null | undefined) {
  const normalized = clean(value).toLowerCase();
  if (normalized === "validated") return 0.45;
  if (normalized === "directional") return 0.1;
  if (normalized === "contradicted") return -0.2;
  return 0;
}

function directnessBoost(value: string | null | undefined) {
  const normalized = clean(value).toLowerCase();
  if (normalized === "direct") return 0.25;
  if (normalized === "inferred") return 0.12;
  return 0;
}

function confidenceBoost(value: string | null | undefined) {
  const normalized = clean(value).toLowerCase();
  if (normalized === "high") return 0.25;
  if (normalized === "medium") return 0.12;
  return 0;
}

function bandScore(shape: SourceShape, phase: AuthorityPhase) {
  return authorityWeightedSupportShape(shape, phase);
}

function rowNarrativeText(row: HypothesisProvenanceCard) {
  return clean(
    [
      row.hypothesis.statement,
      ...row.supportingClaims.map((claim) => claim.claim.statement),
      ...row.weakeningClaims.map((claim) => claim.claim.statement),
    ].join(" "),
  ).toLowerCase();
}

export function normalizeAuthorityPhase(phase: string): AuthorityPhase {
  const normalized = clean(phase).toLowerCase();
  if (normalized === "outside_signals" || normalized === "validate_outside" || normalized === "pre-diagnosis" || normalized === "pre_diagnosis") {
    return "pre_diagnosis";
  }
  if (normalized === "diagnose" || normalized === "validate_diagnose") return "diagnose";
  if (normalized === "focus" || normalized === "validate_focus") return "focus";
  return "flow";
}

export function phaseSignalPriority(phase: string): AuthorityBand[] {
  const authorityPhase = normalizeAuthorityPhase(phase);
  if (authorityPhase === "pre_diagnosis") return ["outside", "customer", "organization"];
  if (authorityPhase === "diagnose") return ["organization", "customer", "outside"];
  if (authorityPhase === "focus") return ["organization", "customer", "outside"];
  return ["customer", "organization", "outside"];
}

export function signalAuthorityWeight(args: {
  phase: string;
  signalBand?: string | null;
  validationState?: string | null;
  directness?: string | null;
  confidence?: string | null;
}) {
  const authorityPhase = normalizeAuthorityPhase(args.phase);
  const band = normalizeBand(args.signalBand);
  return (
    BAND_WEIGHTS[authorityPhase][band] +
    validationBoost(args.validationState) +
    directnessBoost(args.directness) +
    confidenceBoost(args.confidence)
  );
}

export function authorityWeightedSupportShape(shape: SourceShape, phase: string): SourceShape {
  const authorityPhase = normalizeAuthorityPhase(phase);
  return {
    outside: shape.outside * BAND_WEIGHTS[authorityPhase].outside,
    organization: shape.organization * BAND_WEIGHTS[authorityPhase].organization,
    customer: shape.customer * BAND_WEIGHTS[authorityPhase].customer,
  };
}

export function sourceAuthorityScore(shape: SourceShape, phase: string) {
  const weighted = authorityWeightedSupportShape(shape, phase);
  return weighted.outside + weighted.organization + weighted.customer;
}

export function dominantAuthorityBand(shape: SourceShape, phase: string): AuthorityBand | null {
  const weighted = authorityWeightedSupportShape(shape, phase);
  const ordered = phaseSignalPriority(phase).map((band) => ({ band, score: weighted[band] }));
  const top = [...ordered].sort((a, b) => b.score - a.score)[0] ?? null;
  return top && top.score > 0 ? top.band : null;
}

export function detectStrategicThemes(value: string): StrategicThemeKey[] {
  const text = clean(value).toLowerCase();
  return STRATEGIC_THEMES.filter((theme) => theme.patterns.some((pattern) => text.includes(pattern))).map((theme) => theme.key);
}

export function strategicThemeLabel(key: StrategicThemeKey) {
  return STRATEGIC_THEMES.find((theme) => theme.key === key)?.label ?? "a strategic pattern";
}

export function hypothesisAuthorityScore(row: HypothesisProvenanceCard, phase: string) {
  const shape = aggregateSupportShape(row);
  const weightedShape = bandScore(shape, phase);
  const strongestSignal =
    row.supportingClaims
      .map((claim) => claim.strongestSupportingSignal)
      .find(Boolean) ?? null;
  const signalWeight = strongestSignal
    ? signalAuthorityWeight({
        phase,
        signalBand: strongestSignal.signal_band,
        validationState: strongestSignal.validation_status,
        directness: strongestSignal.directness,
        confidence: strongestSignal.confidence_to_use,
      })
    : 0;
  const contradictionPenalty =
    row.weakeningClaims.length > 0 || row.hypothesis.hypothesis_state === "contradicted"
      ? 0.2
      : 0;
  return weightedShape.outside + weightedShape.organization + weightedShape.customer + signalWeight - contradictionPenalty;
}

export function inferStrategicCenterOfGravity(rows: HypothesisProvenanceCard[], phase: string) {
  const authorityPhase = normalizeAuthorityPhase(phase);
  const themeScores = new Map<StrategicThemeKey, { score: number; band: AuthorityBand | null }>();

  for (const row of rows) {
    const themes = detectStrategicThemes(rowNarrativeText(row));
    if (themes.length === 0) continue;
    const band = dominantAuthorityBand(aggregateSupportShape(row), phase);
    const score = hypothesisAuthorityScore(row, phase) + (row.hypothesis.hypothesis_kind === "candidate_assumption" ? 0.45 : 0);
    for (const theme of themes) {
      const themedScore = score * (THEME_BIAS_BY_PHASE[authorityPhase][theme] ?? 1);
      const current = themeScores.get(theme) ?? { score: 0, band };
      themeScores.set(theme, { score: current.score + themedScore, band: current.band ?? band });
    }
  }

  const ordered = [...themeScores.entries()]
    .map(([key, value]) => ({ key, label: strategicThemeLabel(key), score: value.score, band: value.band }))
    .sort((a, b) => b.score - a.score);

  return {
    label: ordered[0]?.label ?? null,
    band: ordered[0]?.band ?? null,
    themes: ordered.slice(0, 3),
  };
}

export function resolveSignalConflict(rows: HypothesisProvenanceCard[], phase: string) {
  const outsideCandidates: Array<{ theme: StrategicThemeKey; label: string; score: number; statement: string }> = [];
  const strategicCandidates: Array<{ theme: StrategicThemeKey; label: string; score: number; statement: string; band: AuthorityBand }> = [];

  for (const row of rows) {
    const band = dominantAuthorityBand(aggregateSupportShape(row), phase);
    if (!band) continue;
    const statement = clean(row.hypothesis.statement);
    const themes = detectStrategicThemes(rowNarrativeText(row));
    if (themes.length === 0) continue;
    const score = hypothesisAuthorityScore(row, phase);
    for (const theme of themes) {
      if (band === "outside") {
        outsideCandidates.push({ theme, label: strategicThemeLabel(theme), score, statement });
      } else {
        strategicCandidates.push({ theme, label: strategicThemeLabel(theme), score, statement, band });
      }
    }
  }

  const outside = outsideCandidates.sort((a, b) => b.score - a.score)[0] ?? null;
  const strategic = strategicCandidates.sort((a, b) => b.score - a.score)[0] ?? null;
  if (!outside || !strategic || outside.theme === strategic.theme) {
    return {
      hasConflict: false,
      summary: null,
      outsideLabel: outside?.label ?? null,
      strategicLabel: strategic?.label ?? null,
      evidenceLines: [] as string[],
      strategicBand: strategic?.band ?? null,
    };
  }

  return {
    hasConflict: true,
    summary:
      strategic.band === "customer"
        ? `Public positioning still emphasizes ${outside.label}, but customer evidence is increasingly centered on ${strategic.label}.`
        : `Public positioning still emphasizes ${outside.label}, but internal strategy is increasingly centered on ${strategic.label}.`,
    outsideLabel: outside.label,
    strategicLabel: strategic.label,
    evidenceLines: [outside.statement, strategic.statement].filter(Boolean),
    strategicBand: strategic.band,
  };
}
