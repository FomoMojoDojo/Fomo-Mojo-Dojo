export type RouteQuality = "generic" | "acceptable" | "strong" | "highly_specific";

export type RouteLanguageHypothesisLike = {
  statement?: string | null;
  whatMustBeTrue?: string[] | null;
  dependencyType?: "supports" | "constrains" | "assumes" | "contradicts" | string | null;
};

export type RouteLanguageInput = {
  category?: string | null;
  title?: string | null;
  shortDescription?: string | null;
  whyThisMatters?: string[] | null;
  linkedHypotheses?: RouteLanguageHypothesisLike[] | null;
  opportunityOutcome?: string | null;
  stepLabel?: string | null;
};

export type RouteQualityAssessment = {
  quality: RouteQuality;
  score: number;
  reasons: string[];
};

export type RouteLanguageRewrite = {
  title: string;
  shortDescription: string;
  whyThisMatters: string[];
  qualityBefore: RouteQualityAssessment;
  qualityAfter: RouteQualityAssessment;
  changed: boolean;
};

type RewriteTemplate = {
  title: string;
  shortDescription: string;
  whyHint?: string | null;
};

const GENERIC_TITLE_START = /^(improve|enhance|increase|optimize|strengthen|accelerate|develop|design|establish|boost|clarify|build|create|launch|remove)\b/i;
const GENERIC_TITLE_PHRASES = [
  "organizational alignment",
  "communication flow",
  "execution blockers",
  "progress tracking",
  "success metrics",
  "path selection confidence",
  "prerequisite alignment",
  "credibility validation",
  "adaptive marketing adjustments",
  "lessons capture process",
  "data-driven allocation insights",
  "impact metrics",
  "usage and impact tracking",
  "funding cycle reporting",
  "feedback frequency",
  "engagement",
  "transparency",
  "reporting",
  "visibility",
  "alignment",
];
const GENERIC_WHY_PATTERNS = [
  /linked to \d+ opportunity signals?/i,
  /at least one related job step is still marked as a gap/i,
  /related checkpoints are already partly designed/i,
  /no route-to-opportunity linkage exists yet/i,
  /route addresses a meaningful strategic gap/i,
  /reduces visible execution risk/i,
];
const GENERIC_HYPOTHESIS_TRUTHS = [
  "further evidence must confirm that this directional pattern matters in real decisions",
  "customer evidence must eventually confirm this internal strategic assumption",
  "customer or market evidence must confirm that this tension changes real buyer behavior",
  "we need evidence that this route changes customer or stakeholder decisions",
];
const STAKEHOLDER_TERMS = [
  "buyer",
  "buyers",
  "customer",
  "customers",
  "operator",
  "operators",
  "donor",
  "donors",
  "responder",
  "responders",
  "team",
  "teams",
  "agency",
  "agencies",
  "partner",
  "partners",
  "supplier",
  "stakeholder",
  "stakeholders",
];
const TENSION_TERMS = [
  "trust",
  "proof",
  "reliability",
  "repeat purchase",
  "switching",
  "delay",
  "drop-off",
  "uncertainty",
  "friction",
  "margin",
  "stock-out",
  "quality",
  "response",
  "impact",
  "confidence",
  "visibility",
  "rework",
  "proof",
];
const OUTCOME_TERMS = [
  "before",
  "unless",
  "visible",
  "confidence",
  "response",
  "retention",
  "repeat",
  "funding",
  "reorder",
  "decision",
  "proof",
  "trust",
  "quality",
  "impact",
  "support",
];
const STRONG_PREFIXES = ["reduce", "make", "test", "shift", "protect", "shorten", "turn", "keep", "expose"];

function clean(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalize(value: unknown) {
  return clean(value).toLowerCase();
}

function stripPeriod(value: string) {
  return clean(value).replace(/[.?!]+$/g, "");
}

function lowerFirst(value: string) {
  return value ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

function dedupeLines(values: Array<string | null | undefined>, limit = 3) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const item = clean(value);
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
    if (output.length >= limit) break;
  }
  return output;
}

function textBundle(input: RouteLanguageInput) {
  return [
    input.title,
    input.shortDescription,
    ...(Array.isArray(input.whyThisMatters) ? input.whyThisMatters : []),
    ...(Array.isArray(input.linkedHypotheses)
      ? input.linkedHypotheses.flatMap((item) => [item.statement, ...(item.whatMustBeTrue ?? [])])
      : []),
    input.opportunityOutcome,
    input.stepLabel,
  ].filter(Boolean).join(" ");
}

function includesAny(text: string, patterns: string[]) {
  return patterns.some((pattern) => text.includes(pattern));
}

function countMatches(text: string, patterns: string[]) {
  return patterns.reduce((count, pattern) => count + (text.includes(pattern) ? 1 : 0), 0);
}

function filteredWhyLines(values: string[] | null | undefined) {
  return (Array.isArray(values) ? values : [])
    .map((value) => clean(value))
    .filter(Boolean)
    .filter((value) => !GENERIC_WHY_PATTERNS.some((pattern) => pattern.test(value)));
}

function filteredHypothesisTruths(values: Array<string | null | undefined>) {
  return values
    .map((value) => clean(value))
    .filter(Boolean)
    .filter((value) => !GENERIC_HYPOTHESIS_TRUTHS.includes(normalize(value)));
}

function strongestHypothesisLine(input: RouteLanguageInput) {
  const hypotheses = Array.isArray(input.linkedHypotheses) ? input.linkedHypotheses : [];
  const truth = filteredHypothesisTruths(
    hypotheses.flatMap((item) => item.whatMustBeTrue ?? []),
  )[0];
  if (truth) return truth;
  return hypotheses.map((item) => clean(item.statement)).filter(Boolean)[0] ?? "";
}

function routeSignals(input: RouteLanguageInput) {
  const text = normalize(textBundle(input));
  return {
    text,
    hasStakeholder: countMatches(text, STAKEHOLDER_TERMS) > 0,
    tensionCount: countMatches(text, TENSION_TERMS),
    outcomeCount: countMatches(text, OUTCOME_TERMS),
    hypothesisHint: strongestHypothesisLine(input),
  };
}

function startsStrong(title: string) {
  const normalized = normalize(title);
  return STRONG_PREFIXES.some((prefix) => normalized.startsWith(`${prefix} `));
}

export function classifyRouteQuality(input: RouteLanguageInput): RouteQualityAssessment {
  const title = clean(input.title);
  const description = clean(input.shortDescription);
  const full = normalize(textBundle(input));
  const signals = routeSignals(input);
  const reasons: string[] = [];
  let score = 0;

  if (startsStrong(title)) {
    score += 2;
  } else if (GENERIC_TITLE_START.test(title)) {
    score -= 2;
    reasons.push("generic_start");
  }

  if (signals.hasStakeholder) score += 2;
  if (signals.tensionCount > 0) score += Math.min(3, signals.tensionCount);
  if (signals.outcomeCount > 1) score += 2;
  if (/\b(before|unless|until|while|without)\b/.test(full)) score += 2;
  if (clean(signals.hypothesisHint)) score += 1;

  if (includesAny(full, GENERIC_TITLE_PHRASES)) {
    score -= 3;
    reasons.push("generic_phrase");
  }

  if (/\b(optimi[sz]e|alignment|framework|initiative|capability|workflow|process|tracking|reporting)\b/.test(full) && signals.tensionCount === 0) {
    score -= 2;
    reasons.push("bucket_language");
  }
  if (/\b(loop|process|tracking|channel|metrics|toolkit|system|program)\b/.test(normalize(title)) && !/\b(before|unless|until|while)\b/.test(normalize(title))) {
    score -= 2;
    reasons.push("implementation_title");
  }

  if (!title || title.split(/\s+/).length < 4) {
    score -= 1;
    reasons.push("too_short");
  }
  if (title.split(/\s+/).length > 11) {
    score -= 1;
    reasons.push("too_long");
  }
  if (description.length > 0 && description.length < 44) score -= 1;
  if (/\b(implement|system|toolkit|process|program|channel)\b/.test(full) && signals.tensionCount === 0 && signals.outcomeCount < 2) {
    score -= 2;
    reasons.push("implementation_heavy");
  }

  let quality: RouteQuality = "acceptable";
  if (score <= 1) quality = "generic";
  else if (score <= 4) quality = "acceptable";
  else if (score <= 7) quality = "strong";
  else quality = "highly_specific";

  return { quality, score, reasons };
}

function hypothesisText(input: RouteLanguageInput) {
  return normalize(strongestHypothesisLine(input));
}

function buildTemplate(input: RouteLanguageInput): RewriteTemplate | null {
  const text = normalize(textBundle(input));
  const hypothesis = hypothesisText(input);

  if (/repeat purchase|purchase frequency|retention|switching/.test(text) || /switching risk/.test(hypothesis)) {
    return {
      title: "Test whether operational proof changes repeat purchasing confidence",
      shortDescription: "Use repeat-purchase signals to learn whether visible reliability proof is strong enough to keep customers coming back.",
      whyHint: "This route matters if supplier value stays hard to perceive before customers decide whether to come back.",
    };
  }

  if (/\bpos\b|point of sale|inventory|manual counts|reorder triggers|sales velocity/.test(text)) {
    return {
      title: "Reduce stock-out risk before manual counts fail",
      shortDescription: "Make reorder signals visible early enough that sales velocity drives supply decisions before stock-outs appear.",
      whyHint: "This route matters if inventory risk is still becoming visible only after sales momentum is already lost.",
    };
  }

  if (/supplier agreement|lead time|pricing tier|supplier terms|unclear terms/.test(text)) {
    return {
      title: "Reduce reorder friction caused by unclear supplier terms",
      shortDescription: "Make lead times and pricing predictable enough that repeat orders do not trigger renegotiation or margin surprises.",
      whyHint: "This route matters if reorder friction is eroding trust before the product can prove its value.",
    };
  }

  if (/pricing|margin/.test(text)) {
    return {
      title: "Make margin tradeoffs visible before pricing changes",
      shortDescription: "Turn pricing into a decision rule so growth does not quietly erase the margins the business depends on.",
      whyHint: "This route matters if pricing choices are still being made faster than margin consequences become visible.",
    };
  }

  if (/staff preparation|opening and closing|quality gaps|onboarding|manager dependency|prep/.test(text)) {
    return {
      title: "Shift preparation quality from manager-dependent to system-supported",
      shortDescription: "Reduce quality drift by making preparation standards visible enough to hold across shifts, not just strong managers.",
      whyHint: "This route matters if quality still depends on who happens to be running the shift.",
    };
  }

  if (/marketing success metrics|measurable success|success criteria/.test(text)) {
    return {
      title: "Reduce uncertainty about what success should look like",
      shortDescription: "Set a clearer decision rule for progress so the team can tell whether a path is working before confidence drifts.",
      whyHint: "This route matters if the team still cannot tell whether a strategic path is succeeding before time and energy are already spent.",
    };
  }

  if (/path selection|strategic fit|brand positioning/.test(text)) {
    return {
      title: "Reduce uncertainty about which path fits the brand",
      shortDescription: "Help the team see which marketing path actually fits the brand before effort is committed.",
      whyHint: "This route matters if the wrong path can feel plausible until the execution cost is already sunk.",
    };
  }

  if (/execution blockers|delays delaying|starting execution promptly/.test(text)) {
    return {
      title: "Reduce drag before execution can start",
      shortDescription: "Surface the blockers that stop work from moving so momentum does not depend on improvisation.",
      whyHint: "This route matters if execution is slowing down before the real work has even begun.",
    };
  }

  if (/prerequisite alignment|prerequisites|readiness|stakeholder alignment/.test(text)) {
    return {
      title: "Expose missing prerequisites before execution stalls",
      shortDescription: "Make missing inputs visible earlier so execution does not slow down because the setup was never real.",
      whyHint: "This route matters if teams are committing to execution before the needed conditions are actually in place.",
    };
  }

  if (/credibility validation|feasibility and credibility|proof to win trust/.test(text) || /credible proof/.test(hypothesis)) {
    return {
      title: "Make strategy proof visible before commitment",
      shortDescription: "Show whether a strategic path is credible before the team commits budget, effort, or reputation to it.",
      whyHint: "This route matters if belief is forming faster than proof.",
    };
  }

  if (/rework|execution delays|momentum toward goals/.test(text)) {
    return {
      title: "Reduce rework before momentum is lost",
      shortDescription: "Cut the delays that force teams to restart work after they think execution has already begun.",
      whyHint: "This route matters if execution quality is falling apart after momentum already looks real from the outside.",
    };
  }

  if (/progress tracking|quality signals during marketing execution|real-time/.test(text)) {
    return {
      title: "Make progress visible before confidence drops",
      shortDescription: "Make progress easy to read while the work is still underway so the team can adjust before trust erodes.",
      whyHint: "This route matters if the team is learning too late that a path is drifting off course.",
    };
  }

  if (/adaptive marketing adjustments|conditions or results change|market realities/.test(text)) {
    return {
      title: "Act on new signals before wasted effort compounds",
      shortDescription: "Respond to new evidence quickly enough that marketing direction changes before wasted effort compounds.",
      whyHint: "This route matters if the market moves faster than the team can act on what it is learning.",
    };
  }

  if (/lessons capture|closing loops|lessons learned/.test(text)) {
    return {
      title: "Turn finished work into proof for the next decision",
      shortDescription: "Capture what actually worked so the next strategic choice depends less on memory and more on proof.",
      whyHint: "This route matters if the organization keeps paying to relearn what it already discovered.",
    };
  }

  if (/operational proof|trust/.test(hypothesis) && /proof|trust|credibility|validation/.test(text)) {
    return {
      title: "Make proof of reliability visible earlier",
      shortDescription: "Surface operational proof sooner so buyers can decide with more confidence before trust erodes.",
      whyHint: "This route matters if trust is weakening before the operational value becomes visible.",
    };
  }

  return null;
}

function fallbackDescription(input: RouteLanguageInput) {
  const opportunity = clean(input.opportunityOutcome);
  if (opportunity) {
    return `This path is worth testing if it changes ${lowerFirst(stripPeriod(opportunity))}.`;
  }
  const hypothesisLine = strongestHypothesisLine(input);
  if (hypothesisLine) {
    return `This path matters if ${lowerFirst(stripPeriod(hypothesisLine))}.`;
  }
  return "We need to test whether this path changes a decision that currently feels unstable.";
}

export function buildRouteWhyThisMattersNarrative(input: RouteLanguageInput): string[] {
  const description = clean(input.shortDescription);
  const keptWhys = filteredWhyLines(input.whyThisMatters ?? []);
  const hypothesisLine = strongestHypothesisLine(input);
  const hypothesisWhy = hypothesisLine
    ? `This path matters if ${lowerFirst(stripPeriod(hypothesisLine))}.`
    : clean(input.opportunityOutcome)
      ? `This path matters if it changes ${lowerFirst(stripPeriod(String(input.opportunityOutcome)))}.`
      : "";

  return dedupeLines([
    description,
    hypothesisWhy,
    keptWhys[0] ?? null,
    keptWhys[1] ?? null,
  ], 3);
}

export function rewriteRouteLanguage(input: RouteLanguageInput): RouteLanguageRewrite {
  const qualityBefore = classifyRouteQuality(input);
  const template = buildTemplate(input);
  const originalTitle = clean(input.title);
  const originalDescription = clean(input.shortDescription);
  const titleLooksImplementationHeavy =
    /\b(loop|process|tracking|channel|metrics|toolkit|system|program)\b/.test(normalize(originalTitle)) &&
    !/\b(before|unless|until|while)\b/.test(normalize(originalTitle));
  const shouldRewrite =
    Boolean(template) &&
    (
      qualityBefore.quality === "generic" ||
      qualityBefore.quality === "acceptable" ||
      titleLooksImplementationHeavy ||
      !originalTitle ||
      !originalDescription
    );

  const title = clean((shouldRewrite ? template?.title : null) || originalTitle);
  const shortDescription = clean((shouldRewrite ? template?.shortDescription : null) || originalDescription || fallbackDescription(input));
  const whyThisMatters = dedupeLines([
    ...buildRouteWhyThisMattersNarrative({
      ...input,
      title,
      shortDescription,
    }),
    shouldRewrite ? template?.whyHint || null : null,
  ], 3);

  const qualityAfter = classifyRouteQuality({
    ...input,
    title,
    shortDescription,
    whyThisMatters,
  });

  const changed =
    title !== originalTitle ||
    shortDescription !== originalDescription ||
    JSON.stringify(whyThisMatters) !== JSON.stringify(dedupeLines(input.whyThisMatters ?? [], 3));

  return {
    title,
    shortDescription,
    whyThisMatters,
    qualityBefore,
    qualityAfter,
    changed,
  };
}
