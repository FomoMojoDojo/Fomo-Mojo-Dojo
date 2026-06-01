import type { ConfidenceLevel, SignalTopic } from "./evidenceDomain.ts";
import type { StrategicHypothesisKind, StrategicHypothesisState } from "./strategicHypothesisDomain.ts";

export type RouteHypothesisDependencyType = "supports" | "constrains" | "assumes" | "contradicts";
export type RouteHypothesisDependencyStrength = "high" | "medium" | "low";

export type RouteHypothesisRouteLike = {
  id: string;
  category?: string | null;
  title?: string | null;
  short_description?: string | null;
  why_this_matters_json?: string[] | null;
  assumptions_json?: Array<{ statement?: string | null; critical?: boolean | null }> | null;
};

export type RouteHypothesisSupportShape = {
  outside: number;
  organization: number;
  customer: number;
};

export type RouteHypothesisLike = {
  id: string;
  statement: string;
  hypothesis_kind: StrategicHypothesisKind;
  hypothesis_state: StrategicHypothesisState;
  topic: SignalTopic | null;
  confidence: ConfidenceLevel;
  what_must_be_true?: string[] | null;
  is_active: boolean;
};

export type RouteHypothesisLinkCandidate = {
  routeId: string;
  hypothesisId: string;
  dependencyType: RouteHypothesisDependencyType;
  strength: RouteHypothesisDependencyStrength;
  score: number;
};

export type RouteHypothesisLinkInput = {
  route: RouteHypothesisRouteLike;
  hypothesis: RouteHypothesisLike;
  supportShape?: RouteHypothesisSupportShape;
  hasContradiction?: boolean;
};

type Theme =
  | "proof"
  | "trust"
  | "switching"
  | "reliability"
  | "support"
  | "governance"
  | "donor"
  | "onboarding"
  | "operational"
  | "partner_fit"
  | "novelty"
  | "price"
  | "convenience";

const STOP_WORDS = new Set([
  "about", "across", "after", "against", "already", "also", "because", "before", "being", "between", "broad", "buyers", "company", "confidence", "current", "customer", "customers", "direction", "evidence", "first", "from", "have", "internal", "into", "less", "more", "need", "needs", "only", "over", "pattern", "proof", "public", "route", "routes", "should", "signals", "still", "than", "that", "their", "them", "they", "this", "through", "toward", "trust", "validation", "value", "what", "when", "where", "which", "while", "with", "would",
]);

function clean(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalize(value: unknown) {
  return clean(value).toLowerCase();
}

function tokenize(value: unknown) {
  return normalize(value)
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 4 && !STOP_WORDS.has(part));
}

function uniqueTokens(value: unknown) {
  return [...new Set(tokenize(value))];
}

function detectThemes(value: unknown): Theme[] {
  const text = normalize(value);
  const matches: Theme[] = [];
  const add = (theme: Theme, patterns: string[]) => {
    if (patterns.some((pattern) => text.includes(pattern))) matches.push(theme);
  };
  add("proof", ["proof", "prove", "credib", "visible proof", "validation", "validated"]);
  add("trust", ["trust", "confidence", "belief"]);
  add("switching", ["switch", "switching", "sticky", "retention", "repeat purchasing", "repeat purchase", "repeat purchases"]);
  add("reliability", ["reliability", "reliable", "consistent", "consistency", "repeat purchasing"]);
  add("support", ["support", "training", "documentation", "hands-on", "enablement"]);
  add("governance", ["governance", "leadership", "participation"]);
  add("donor", ["donor", "fundraising", "endowment"]);
  add("onboarding", ["onboarding", "adoption", "install", "installation"]);
  add("operational", ["operational", "operations", "workflow", "burden", "dial-in", "batch variability", "recipe-adjustment"]);
  add("partner_fit", ["partner fit", "selected partners", "wholesale reach", "partner"]);
  add("novelty", ["novelty", "artisanal"]);
  add("price", ["price", "pricing", "budget"]);
  add("convenience", ["convenience", "easy", "easier"]);
  return [...new Set(matches)];
}

function overlapScore(a: unknown, b: unknown) {
  const aTokens = uniqueTokens(a);
  const bTokens = new Set(uniqueTokens(b));
  let score = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) score += token.length >= 8 ? 2 : 1;
  }
  return score;
}

function routeText(route: RouteHypothesisRouteLike) {
  return [
    route.title,
    route.short_description,
    ...(Array.isArray(route.why_this_matters_json) ? route.why_this_matters_json : []),
    ...(Array.isArray(route.assumptions_json) ? route.assumptions_json.map((item) => item?.statement || "") : []),
  ].filter(Boolean).join(" ");
}

function routeAssumptionText(route: RouteHypothesisRouteLike) {
  return (Array.isArray(route.assumptions_json) ? route.assumptions_json : [])
    .map((item) => clean(item?.statement))
    .filter(Boolean)
    .join(" ");
}

function hypothesisText(hypothesis: RouteHypothesisLike) {
  return [hypothesis.statement, ...(Array.isArray(hypothesis.what_must_be_true) ? hypothesis.what_must_be_true : [])]
    .filter(Boolean)
    .join(" ");
}

function categoryThemeBoost(category: string, themes: Theme[], kind: StrategicHypothesisKind) {
  const key = normalize(category);
  const shared = new Set(themes);
  let score = 0;

  if (key === "fix" && ["proof", "trust", "reliability", "switching", "operational", "onboarding"].some((theme) => shared.has(theme as Theme))) {
    score += 2;
  }
  if (key === "improve" && ["support", "operational", "proof", "reliability", "partner_fit"].some((theme) => shared.has(theme as Theme))) {
    score += 2;
  }
  if (key === "create" && ["support", "partner_fit", "governance", "donor", "proof", "onboarding"].some((theme) => shared.has(theme as Theme))) {
    score += 2;
  }
  if (kind === "candidate_assumption" && (key === "create" || key === "improve")) score += 1;
  if (kind === "inferred_tension" && (key === "fix" || key === "improve")) score += 1;
  return score;
}

function topicBoost(topic: SignalTopic | null, themes: Theme[]) {
  const normalized = normalize(topic);
  const shared = new Set(themes);
  if (!normalized) return 0;
  if (["positioning", "market", "category", "strategy"].includes(normalized)) {
    return ["proof", "trust", "switching", "novelty", "partner_fit"].some((theme) => shared.has(theme as Theme)) ? 2 : -2;
  }
  if (["problem", "need"].includes(normalized)) {
    return ["operational", "reliability", "support", "onboarding", "trust"].some((theme) => shared.has(theme as Theme)) ? 2 : 0;
  }
  if (["outcome"].includes(normalized)) {
    return ["proof", "switching", "trust", "donor", "governance"].some((theme) => shared.has(theme as Theme)) ? 1 : 0;
  }
  return 0;
}

function isOutsideOnlyWeak(supportShape: RouteHypothesisSupportShape | undefined, hypothesis: RouteHypothesisLike) {
  if (!supportShape) return false;
  return supportShape.outside > 0 && supportShape.organization === 0 && supportShape.customer === 0 && hypothesis.confidence === "low";
}

function isImplementationHeavyRoute(route: RouteHypothesisRouteLike) {
  const text = routeText(route);
  const category = normalize(route.category);
  return category === "create" || /(onboarding|installation|implementation|enablement|toolkit|program|build|system|workflow|documentation|training)/.test(normalize(text));
}

function isBroadPositioningHypothesis(hypothesis: RouteHypothesisLike) {
  const text = normalize(hypothesis.statement);
  return /(positioning|brand|public positioning|public proof|trust expectations|proof to win trust)/.test(text);
}

function isGenericValidationHypothesis(hypothesis: RouteHypothesisLike) {
  const text = normalize(hypothesis.statement);
  return /(customer validation|needs validation|not yet validated|still needs proof|more proof)/.test(text);
}

function dependencyTypeForMatch(hypothesis: RouteHypothesisLike, hasContradiction: boolean): RouteHypothesisDependencyType {
  if (hasContradiction || hypothesis.hypothesis_state === "contradicted") return "contradicts";
  // Unstable hypotheses constrain routes — evidence is actively contested
  if (hypothesis.hypothesis_state === "unstable") return "constrains";
  if (hypothesis.hypothesis_kind === "candidate_assumption") return "assumes";
  if (hypothesis.hypothesis_kind === "inferred_tension") return "constrains";
  return "supports";
}

function strengthFromScore(score: number): RouteHypothesisDependencyStrength {
  if (score >= 12) return "high";
  if (score >= 9) return "medium";
  return "low";
}

function phraseBoost(routeValue: string, hypothesisValue: string) {
  const routeText = normalize(routeValue);
  const hypothesisText = normalize(hypothesisValue);
  let score = 0;

  if (hypothesisText.includes("switching risk") && /(repeat purchase|retention|return)/.test(routeText)) {
    score += 3;
  }
  if (/(credible proof|proof)/.test(hypothesisText) && /(validation|credibility|credible)/.test(routeText)) {
    score += 3;
  }
  if (hypothesisText.includes("guidance") && /(positioning|strategic fit|path selection)/.test(routeText)) {
    score += 2;
  }

  return score;
}

export function evaluateHypothesisRouteLink(input: RouteHypothesisLinkInput): RouteHypothesisLinkCandidate | null {
  const { route, hypothesis, supportShape, hasContradiction = false } = input;
  if (!hypothesis.is_active) return null;
  if (hypothesis.hypothesis_state === "retired" || hypothesis.hypothesis_state === "reframed") return null;

  const routeValue = routeText(route);
  const hypothesisValue = hypothesisText(hypothesis);
  const routeThemes = detectThemes(routeValue);
  const hypothesisThemes = detectThemes(hypothesisValue);
  const sharedThemes = routeThemes.filter((theme) => hypothesisThemes.includes(theme));
  const lexicalOverlap = overlapScore(routeValue, hypothesisValue);
  const whyOverlap = overlapScore((route.why_this_matters_json ?? []).join(" "), hypothesis.statement);
  const assumptionOverlap = overlapScore(routeAssumptionText(route), (hypothesis.what_must_be_true ?? []).join(" "));
  const baseScore =
    lexicalOverlap +
    whyOverlap +
    assumptionOverlap * 2 +
    sharedThemes.length * 2 +
    categoryThemeBoost(String(route.category || ""), sharedThemes, hypothesis.hypothesis_kind) +
    topicBoost(hypothesis.topic, sharedThemes) +
    phraseBoost(routeValue, hypothesisValue);

  if (sharedThemes.length === 0 && lexicalOverlap < 3 && assumptionOverlap === 0) return null;
  if (hypothesis.hypothesis_kind === "candidate_assumption" && assumptionOverlap === 0 && lexicalOverlap < 4) return null;

  if (isBroadPositioningHypothesis(hypothesis) && !sharedThemes.some((theme) => ["proof", "trust", "switching", "partner_fit", "novelty"].includes(theme))) {
    return null;
  }
  if (isGenericValidationHypothesis(hypothesis) && !sharedThemes.some((theme) => ["proof", "trust", "switching"].includes(theme)) && assumptionOverlap === 0) {
    return null;
  }

  let score = baseScore;
  if (isOutsideOnlyWeak(supportShape, hypothesis) && isImplementationHeavyRoute(route) && sharedThemes.length < 2) {
    score -= 3;
  }

  if (score < 8) return null;

  return {
    routeId: route.id,
    hypothesisId: hypothesis.id,
    dependencyType: dependencyTypeForMatch(hypothesis, hasContradiction),
    strength: strengthFromScore(score),
    score,
  };
}

function maxRoutesForHypothesis(hypothesis: RouteHypothesisLike, supportShape?: RouteHypothesisSupportShape) {
  if (isOutsideOnlyWeak(supportShape, hypothesis)) return 1;
  if (hypothesis.hypothesis_kind === "candidate_assumption") return 2;
  return 2;
}

function maxSupportsForRoute(route: RouteHypothesisRouteLike) {
  const key = normalize(route.category);
  if (key === "create") return 2;
  return 2;
}

export function buildConservativeRouteHypothesisLinks(args: {
  routes: RouteHypothesisRouteLike[];
  hypotheses: Array<{ hypothesis: RouteHypothesisLike; supportShape?: RouteHypothesisSupportShape; hasContradiction?: boolean }>;
}) {
  const allCandidates = args.hypotheses.flatMap(({ hypothesis, supportShape, hasContradiction }) =>
    args.routes
      .map((route) => evaluateHypothesisRouteLink({ route, hypothesis, supportShape, hasContradiction }))
      .filter((candidate): candidate is RouteHypothesisLinkCandidate => Boolean(candidate))
      .map((candidate) => ({ candidate, hypothesis, supportShape })),
  );

  const byHypothesis = new Map<string, Array<{ candidate: RouteHypothesisLinkCandidate; hypothesis: RouteHypothesisLike; supportShape?: RouteHypothesisSupportShape }>>();
  for (const item of allCandidates) {
    const bucket = byHypothesis.get(item.hypothesis.id) ?? [];
    bucket.push(item);
    byHypothesis.set(item.hypothesis.id, bucket);
  }

  const trimmedByHypothesis = [...byHypothesis.values()].flatMap((items) => {
    const sorted = [...items].sort((a, b) => b.candidate.score - a.candidate.score);
    const topScore = sorted[0]?.candidate.score ?? 0;
    const limit = maxRoutesForHypothesis(sorted[0]?.hypothesis ?? items[0]!.hypothesis, sorted[0]?.supportShape ?? items[0]!.supportShape);
    return sorted.filter((item, index) => index < limit && item.candidate.score >= topScore - 2);
  });

  const byRoute = new Map<string, Array<{ candidate: RouteHypothesisLinkCandidate }>>();
  for (const item of trimmedByHypothesis) {
    const bucket = byRoute.get(item.candidate.routeId) ?? [];
    bucket.push(item);
    byRoute.set(item.candidate.routeId, bucket);
  }

  const output = new Map<string, RouteHypothesisLinkCandidate>();
  for (const [routeId, items] of byRoute.entries()) {
    const sorted = [...items].sort((a, b) => {
      const contradictionRankA = a.candidate.dependencyType === "contradicts" ? 1 : 0;
      const contradictionRankB = b.candidate.dependencyType === "contradicts" ? 1 : 0;
      if (contradictionRankA !== contradictionRankB) return contradictionRankB - contradictionRankA;
      return b.candidate.score - a.candidate.score;
    });

    const supports = sorted.filter((item) => item.candidate.dependencyType !== "contradicts").slice(0, maxSupportsForRoute(args.routes.find((route) => route.id === routeId) ?? { id: routeId }));
    const contradiction = sorted.find((item) => item.candidate.dependencyType === "contradicts");
    const kept = contradiction ? [...supports, contradiction] : supports;

    for (const item of kept) {
      output.set(`${item.candidate.hypothesisId}:${item.candidate.routeId}`, item.candidate);
    }
  }

  return [...output.values()];
}
