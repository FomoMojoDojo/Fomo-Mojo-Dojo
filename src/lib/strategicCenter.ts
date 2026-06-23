import type { HypothesisProvenanceCard } from "@/hooks/useStrategicHypotheses";
import {
  detectStrategicThemes,
  dominantAuthorityBand,
  hypothesisAuthorityScore,
  inferStrategicCenterOfGravity,
  normalizeAuthorityPhase,
  resolveSignalConflict,
  strategicThemeLabel,
  type StrategicThemeKey,
} from "@/lib/signalAuthority";
import type { RouteAssumption, RouteRow } from "@/hooks/useRoutes";

export type StrategicCenterConfidence = "low" | "medium" | "high";

export type StrategicCenterEvidenceItem = {
  title: string;
  status: string;
};

export type StrategicCenterRouteSeed = {
  route: RouteRow;
  evidence: StrategicCenterEvidenceItem[];
  assumptions: RouteAssumption[];
};

export type StrategicCenterThemeScore = {
  key: StrategicThemeKey;
  label: string;
  score: number;
  source: "hypothesis" | "route" | "public_context";
};

export type StrategicCenter = {
  key: StrategicThemeKey | null;
  label: string | null;
  confidence: StrategicCenterConfidence;
  supportingThemes: StrategicCenterThemeScore[];
  competingThemes: StrategicCenterThemeScore[];
  unresolvedTensions: string[];
  publicContextLabel: string | null;
  customerLag: boolean;
  hasMeaningfulDivergence: boolean;
  shouldLeadExplanations: boolean;
};

type ThemeScoreMap = Map<StrategicThemeKey, StrategicCenterThemeScore>;

const ROUTE_PHASE_WEIGHT = {
  pre_diagnosis: 0.35,
  diagnose: 0.9,
  focus: 1.25,
  flow: 1.3,
} as const;

const THEME_PHASE_BIAS: Record<string, Partial<Record<StrategicThemeKey, number>>> = {
  pre_diagnosis: {
    craft_quality: 1.15,
    proof_trust: 1.0,
    partner_outcomes: 0.9,
    operational_reliability: 0.9,
  },
  diagnose: {
    craft_quality: 0.72,
    proof_trust: 1.12,
    partner_outcomes: 1.25,
    operational_reliability: 1.25,
    governance_impact: 1.1,
  },
  focus: {
    craft_quality: 0.58,
    proof_trust: 1.08,
    partner_outcomes: 1.35,
    operational_reliability: 1.35,
    governance_impact: 1.12,
  },
  flow: {
    craft_quality: 0.52,
    proof_trust: 1.0,
    partner_outcomes: 1.18,
    operational_reliability: 1.22,
    governance_impact: 1.15,
  },
};

const PUBLIC_CONTEXT_LABELS: Partial<Record<StrategicThemeKey, string>> = {
  craft_quality: "craft quality and specialty coffee",
  proof_trust: "proof and trust",
  price_convenience: "price or convenience",
  operational_reliability: "operational reliability",
  partner_outcomes: "partner operational outcomes",
};

const EXPLANATORY_LABELS: Partial<Record<StrategicThemeKey, string>> = {
  proof_trust: "visible proof and trust",
  operational_reliability: "operational reliability",
  partner_outcomes: "partner operational outcomes",
  craft_quality: "craft quality",
  price_convenience: "price or convenience",
};

function clean(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function aggregateSupportShape(row: HypothesisProvenanceCard) {
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

function rowNarrativeText(row: HypothesisProvenanceCard) {
  return clean(
    [
      row.hypothesis.statement,
      ...row.supportingClaims.map((claim) => claim.claim.statement),
      ...row.weakeningClaims.map((claim) => claim.claim.statement),
      ...(row.hypothesis.what_must_be_true ?? []),
    ].join(" "),
  );
}

function routeNarrativeText(seed: StrategicCenterRouteSeed) {
  return clean(
    [
      seed.route.title,
      seed.route.short_description,
      ...(seed.route.why_this_matters_json ?? []),
      ...seed.assumptions
        .filter((assumption) => assumption.critical || assumption.status !== "supported")
        .map((assumption) => assumption.statement),
      ...seed.evidence.filter((item) => item.status !== "missing").map((item) => item.title),
    ].join(" "),
  );
}

function explanatoryLabelForTheme(key: StrategicThemeKey) {
  return EXPLANATORY_LABELS[key] ?? strategicThemeLabel(key);
}

function publicLabelForTheme(key: StrategicThemeKey) {
  return PUBLIC_CONTEXT_LABELS[key] ?? strategicThemeLabel(key);
}

function buildCenterLabel(themes: StrategicCenterThemeScore[]) {
  const keys = themes.map((theme) => theme.key);
  if (keys.includes("partner_outcomes") && keys.includes("operational_reliability")) {
    return "partner operational outcomes and operational reliability";
  }
  if (keys.includes("operational_reliability") && keys.includes("proof_trust")) {
    return "operational reliability and visible proof";
  }
  if (keys.includes("partner_outcomes") && keys.includes("proof_trust")) {
    return "partner operational outcomes and visible proof";
  }

  const nonCraft =
    themes.find((theme) => theme.key === "partner_outcomes") ??
    themes.find((theme) => theme.key === "operational_reliability") ??
    themes.find((theme) => theme.key === "proof_trust") ??
    themes.find((theme) => theme.key === "governance_impact") ??
    themes.find((theme) => theme.key !== "craft_quality");

  if (nonCraft) return explanatoryLabelForTheme(nonCraft.key);
  return themes[0] ? explanatoryLabelForTheme(themes[0].key) : null;
}

function upsertThemeScore(
  map: ThemeScoreMap,
  key: StrategicThemeKey,
  score: number,
  source: StrategicCenterThemeScore["source"],
) {
  if (score <= 0) return;
  const current = map.get(key);
  if (!current) {
    map.set(key, { key, label: strategicThemeLabel(key), score, source });
    return;
  }
  map.set(key, {
    ...current,
    score: current.score + score,
    source: current.source === "hypothesis" ? current.source : source,
  });
}

function sortedThemeScores(map: ThemeScoreMap) {
  return [...map.values()].sort((left, right) => right.score - left.score);
}

function scoreHypothesisThemes(rows: HypothesisProvenanceCard[], phase: string) {
  const authorityPhase = normalizeAuthorityPhase(phase);
  const scores: ThemeScoreMap = new Map();

  for (const row of rows) {
    if (!row.hypothesis.is_active) continue;
    const themes = unique(detectStrategicThemes(rowNarrativeText(row)));
    if (themes.length === 0) continue;

    const dominantBand = dominantAuthorityBand(aggregateSupportShape(row), phase);
    const base = Math.max(0.2, hypothesisAuthorityScore(row, phase));
    const kindBoost =
      row.hypothesis.hypothesis_kind === "candidate_assumption"
        ? 0.45
        : row.hypothesis.hypothesis_kind === "inferred_tension"
          ? 0.25
          : 0;

    for (const theme of themes) {
      let score = base * (THEME_PHASE_BIAS[authorityPhase][theme] ?? 1) + kindBoost;
      if (
        authorityPhase !== "pre_diagnosis" &&
        dominantBand === "organization" &&
        (theme === "partner_outcomes" || theme === "operational_reliability" || theme === "proof_trust")
      ) {
        score += 0.9;
      }
      if (authorityPhase === "flow" && dominantBand === "customer") {
        score += 0.8;
      }
      if (authorityPhase !== "pre_diagnosis" && dominantBand === "outside" && theme === "craft_quality") {
        score -= 0.45;
      }
      upsertThemeScore(scores, theme, score, "hypothesis");
    }
  }

  return scores;
}

function scoreRouteThemes(routeSeeds: StrategicCenterRouteSeed[], phase: string) {
  const authorityPhase = normalizeAuthorityPhase(phase);
  const scores: ThemeScoreMap = new Map();

  for (const seed of routeSeeds) {
    const themes = unique(detectStrategicThemes(routeNarrativeText(seed)));
    if (themes.length === 0) continue;

    const category = clean(seed.route.category).toLowerCase();
    const base = ROUTE_PHASE_WEIGHT[authorityPhase];
    const supportiveEvidence = seed.evidence.filter((item) => item.status !== "missing").length;
    const criticalAssumptions = seed.assumptions.filter((assumption) => assumption.critical).length;

    for (const theme of themes) {
      let score = base + (supportiveEvidence > 0 ? 0.2 : 0) + (criticalAssumptions > 0 ? 0.2 : 0);
      if (
        category === "fix" &&
        (theme === "operational_reliability" || theme === "partner_outcomes" || theme === "proof_trust")
      ) {
        score += 0.55;
      }
      if (
        category === "improve" &&
        (theme === "operational_reliability" || theme === "proof_trust" || theme === "partner_outcomes")
      ) {
        score += 0.45;
      }
      if (
        category === "create" &&
        (theme === "proof_trust" || theme === "partner_outcomes" || theme === "operational_reliability")
      ) {
        score += 0.35;
      }
      if (authorityPhase !== "pre_diagnosis" && theme === "craft_quality") {
        score -= 0.25;
      }
      upsertThemeScore(scores, theme, score, "route");
    }
  }

  return scores;
}

function scorePublicThemes(rows: HypothesisProvenanceCard[], phase: string) {
  const scores: ThemeScoreMap = new Map();
  for (const row of rows) {
    if (!row.hypothesis.is_active) continue;
    if (dominantAuthorityBand(aggregateSupportShape(row), phase) !== "outside") continue;
    const themes = unique(detectStrategicThemes(rowNarrativeText(row)));
    const base = Math.max(0.15, hypothesisAuthorityScore(row, phase));
    for (const theme of themes) {
      upsertThemeScore(scores, theme, base, "public_context");
    }
  }
  return scores;
}

function bandTotals(rows: HypothesisProvenanceCard[], phase: string) {
  return rows.reduce(
    (acc, row) => {
      const dominant = dominantAuthorityBand(aggregateSupportShape(row), phase);
      if (!dominant) return acc;
      acc[dominant] += 1;
      return acc;
    },
    { outside: 0, organization: 0, customer: 0 },
  );
}

export function inferStrategicCenter(args: {
  activeRows: HypothesisProvenanceCard[];
  routeSeeds?: StrategicCenterRouteSeed[];
  phase: string;
}): StrategicCenter {
  const authorityPhase = normalizeAuthorityPhase(args.phase);
  const activeRows = args.activeRows.filter((row) => row.hypothesis.is_active);
  const routeSeeds = args.routeSeeds ?? [];
  const conflict = resolveSignalConflict(activeRows, args.phase);
  const hypothesisCenter = inferStrategicCenterOfGravity(activeRows, args.phase);
  const hypothesisScores = scoreHypothesisThemes(activeRows, args.phase);
  const routeScores = scoreRouteThemes(routeSeeds, args.phase);
  const publicScores = scorePublicThemes(activeRows, args.phase);
  const combinedScores: ThemeScoreMap = new Map();

  for (const score of sortedThemeScores(hypothesisScores)) {
    upsertThemeScore(combinedScores, score.key, score.score, score.source);
  }
  for (const score of sortedThemeScores(routeScores)) {
    upsertThemeScore(combinedScores, score.key, score.score, score.source);
  }

  if (authorityPhase !== "pre_diagnosis") {
    for (const theme of hypothesisCenter.themes.slice(0, 2)) {
      upsertThemeScore(combinedScores, theme.key, 0.9, "hypothesis");
    }
  }

  const supportingThemes = sortedThemeScores(combinedScores).slice(0, 3);
  const primaryTheme = supportingThemes[0] ?? null;
  const publicTheme = sortedThemeScores(publicScores)[0] ?? null;
  const totals = bandTotals(activeRows, args.phase);
  const customerLag =
    authorityPhase !== "pre_diagnosis" &&
    totals.customer === 0 &&
    (totals.organization > 0 || routeSeeds.length > 0 || hypothesisCenter.band === "organization");

  const centerLabel = buildCenterLabel(supportingThemes);
  const publicContextLabel = publicTheme
    ? publicLabelForTheme(publicTheme.key)
    : clean(conflict.outsideLabel || null) || null;
  const primaryScore = primaryTheme?.score ?? 0;
  const secondScore = supportingThemes[1]?.score ?? 0;

  const confidence: StrategicCenterConfidence =
    authorityPhase === "pre_diagnosis"
      ? "low"
      : totals.customer > 0 && totals.organization > 0 && primaryScore >= 3
        ? "high"
        : primaryScore >= 2.4 && (totals.organization > 0 || routeSeeds.length > 0 || hypothesisCenter.band === "organization")
          ? "medium"
          : "low";

  const unresolvedTensions = unique([
    ...activeRows
      .filter((row) => row.hypothesis.hypothesis_kind === "inferred_tension")
      .map((row) => clean(row.hypothesis.statement)),
    conflict.hasConflict && conflict.summary ? clean(conflict.summary) : "",
    customerLag ? "Customer validation is still lagging the current direction." : "",
  ]).filter(Boolean).slice(0, 3);

  const publicStrategicDivergence = Boolean(
    primaryTheme &&
    publicTheme &&
    primaryTheme.key !== publicTheme.key &&
    (conflict.hasConflict || publicTheme.score >= primaryScore * 0.45),
  );

  const competingThemes = sortedThemeScores(
    new Map(
      [
        ...(publicTheme
          ? [[publicTheme.key, { ...publicTheme, label: publicLabelForTheme(publicTheme.key) } as StrategicCenterThemeScore]]
          : []),
        ...supportingThemes
          .filter((theme) => theme.key !== primaryTheme?.key && theme.score >= primaryScore * 0.55)
          .map((theme) => [theme.key, theme] as const),
      ],
    ),
  )
    .filter((theme) => theme.key !== primaryTheme?.key)
    .slice(0, 3);

  const hasMeaningfulDivergence =
    publicStrategicDivergence ||
    (Boolean(conflict.hasConflict) && authorityPhase !== "pre_diagnosis") ||
    (customerLag && confidence !== "low") ||
    (primaryScore > 0 && secondScore >= primaryScore * 0.75 && supportingThemes[1]?.key !== primaryTheme?.key);

  const shouldLeadExplanations =
    authorityPhase !== "pre_diagnosis" &&
    Boolean(centerLabel) &&
    (confidence !== "low" || routeSeeds.length > 0 || hypothesisCenter.band === "organization");

  return {
    key: primaryTheme?.key ?? null,
    label: centerLabel,
    confidence,
    supportingThemes,
    competingThemes,
    unresolvedTensions,
    publicContextLabel,
    customerLag,
    hasMeaningfulDivergence,
    shouldLeadExplanations,
  };
}
