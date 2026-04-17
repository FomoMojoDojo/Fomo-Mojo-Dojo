export const DESIRED_OUTCOME_DIRECTIONS = [
  "increase",
  "reduce",
  "improve",
  "maximize",
  "minimize",
  "avoid",
] as const;

export type DesiredOutcomeDirection = (typeof DESIRED_OUTCOME_DIRECTIONS)[number];

export const OUTCOME_LEVELS = ["primary", "secondary", "tertiary"] as const;
export type OutcomeLevel = (typeof OUTCOME_LEVELS)[number];

export const OUTCOME_LEVEL_META: Record<
  OutcomeLevel,
  { label: string; shortLabel: string; problem: string; example: string }
> = {
  primary: {
    label: "Primary — Selection / Conviction",
    shortLabel: "Primary",
    problem: "positioning, clarity, trust, conversion, time to conviction",
    example:
      "Increase the percentage of qualified prospects who book a strategy call after their first interaction.",
  },
  secondary: {
    label: "Secondary — Value Realization",
    shortLabel: "Secondary",
    problem: "adoption, implementation, decision quality, measurable progress",
    example:
      "Increase the percentage of clients who commit to a strategic decision within one week of identifying a priority.",
  },
  tertiary: {
    label: "Tertiary — Scale / Expansion",
    shortLabel: "Tertiary",
    problem: "retention, expansion, repeatability, compounding growth",
    example:
      "Increase the percentage of client engagements that expand into ongoing work within 12 months.",
  },
};

export type DesiredOutcomeParts = {
  direction: DesiredOutcomeDirection;
  metric: string;
  actor: string;
  action: string;
  object: string;
  context: string;
  constraint?: string | null;
  is_primary?: boolean | null;
  level?: OutcomeLevel | null;
};

export type DesiredOutcomeRowLike = {
  outcome_statement?: string | null;
  leading_indicator?: string | null;
  target_direction?: string | null;
  journey_key?: string | null;
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

const SOLUTION_LANGUAGE_PATTERN =
  /\b(feature|features|build|built|launch|launched|dashboard|portal|campaign|workflow|form|tool|tools|ui|ux|implementation|implement|implemented|solution|solutions)\b/i;

const PLAIN_LANGUAGE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bmonitor decision impact\b/gi, "review decision results"],
  [/\bmonitored decision outcomes\b/gi, "tracked decision results"],
  [/\bdecision outcomes\b/gi, "decision results"],
  [/\bstrategic alignment\b/gi, "fit with strategy"],
  [/\bcore audience\b/gi, "main audience"],
  [/\bleverage\b/gi, "use"],
  [/\butili[sz]e\b/gi, "use"],
  [/\boptimi[sz]e\b/gi, "improve"],
  [/\benable\b/gi, "help"],
  [/\bsynergy\b/gi, "combined value"],
  [/\bholistic\b/gi, "full"],
  [/\bbest-in-class\b/gi, "best"],
];

const MEASURABLE_PATTERN =
  /\b(rate|share|time|cycle|days?|weeks?|months?|hours?|minutes?|percentage|percent|count|ratio|likelihood|confidence|completion|retention|conversion|drop-off|delay|rework|quality|consistency|accuracy|first-pass)\b/i;

// Observable actions — must be verbs describing behavior
const OBSERVABLE_ACTION_PATTERN =
  /\b(book|schedule|commit|complete|adopt|choose|select|update|submit|sign|attend|refer|return|purchase|subscribe|cancel|respond|review|approve|decide|start|finish|convert)\b/i;

function compact(value: string | null | undefined) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function lowerLeading(value: string) {
  const text = compact(value);
  if (!text) return "";
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function stripLeadingDirection(value: string) {
  let text = compact(value);
  const pattern = /^(increase|reduce|improve|maximize|minimize|avoid)\b[\s:,-]*/i;
  while (pattern.test(text)) {
    text = text.replace(pattern, "").trim();
  }
  return text;
}

function isContextRedundant(objectText: string, contextText: string) {
  const object = compact(objectText).toLowerCase();
  const context = compact(contextText).toLowerCase();
  if (!object || !context) return false;
  if (object.includes(context)) return true;

  const actors = [
    "customer", "customers", "prospect", "prospects", "team", "teams",
    "operator", "operators", "buyer", "buyers", "partner", "partners",
  ];
  return actors.some((token) => object.includes(token) && context.includes(token));
}

export function normalizeDesiredOutcomeDirection(
  value: string | null | undefined,
): DesiredOutcomeDirection {
  const normalized = compact(value).toLowerCase();
  if ((DESIRED_OUTCOME_DIRECTIONS as readonly string[]).includes(normalized)) {
    return normalized as DesiredOutcomeDirection;
  }
  return "increase";
}

export function normalizeOutcomeLevel(value: string | null | undefined): OutcomeLevel | null {
  const normalized = compact(value).toLowerCase();
  if ((OUTCOME_LEVELS as readonly string[]).includes(normalized)) {
    return normalized as OutcomeLevel;
  }
  return null;
}

export function humanizeOutcomeLanguage(value: string | null | undefined) {
  let text = compact(value);
  if (!text) return "";
  for (const [pattern, replacement] of PLAIN_LANGUAGE_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  text = compact(text);
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function buildDesiredOutcomeSentence(parts: DesiredOutcomeParts) {
  const direction = normalizeDesiredOutcomeDirection(parts.direction);
  const actor = compact(parts.actor);
  const action = compact(parts.action);
  const constraint = compact(parts.constraint || "");
  const constraintClause = constraint
    ? /^(without|under|within|before|after)\b/i.test(constraint)
      ? constraint
      : `while ${constraint}`
    : "";

  // Behavioral format: Direction + Metric + Actor + Action + Context + Constraint
  if (actor && action) {
    const rawMetric = compact(parts.metric);
    const context = compact(parts.context);

    // Strip any "of <noun>" suffix so "percentage of clients" → "percentage"
    // This prevents doubling when the actor is also in the metric field.
    const metricUnit = rawMetric
      ? lowerLeading(rawMetric.replace(/\s+of\s+\S.*$/i, "").trim()) || "percentage"
      : "percentage";
    const metricClause = `the ${metricUnit} of`;

    // Parts stored via humanizeOutcomeLanguage are sentence-capitalised;
    // lowercase them here so they sit cleanly inside the sentence.
    const body = [
      `${direction} ${metricClause} ${lowerLeading(actor)} who ${lowerLeading(action)}`,
      lowerLeading(context),
      constraintClause,
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    return humanizeOutcomeLanguage(body.endsWith(".") ? body : `${body}.`);
  }

  // Legacy format: Direction + Object + Context + Constraint
  const object = stripLeadingDirection(parts.object);
  const context = compact(parts.context);
  const contextClause =
    context && !isContextRedundant(object, context) ? `for ${lowerLeading(context)}` : "";

  const body = [
    `${direction} ${object || "reliable progress"}`,
    contextClause,
    constraintClause,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return humanizeOutcomeLanguage(body.endsWith(".") ? body : `${body}.`);
}

function inferContextFromJourney(journeyKey: string | null | undefined) {
  const key = compact(journeyKey).toLowerCase();
  if (key === "customer") return "target customers in the customer journey";
  if (key === "revenue") return "qualified demand in the revenue journey";
  if (key === "operations") return "delivery teams in the operations journey";
  if (key) return `${key} journey participants`;
  return "target customers";
}

function inferDirectionFromStatement(statement: string, fallback?: string | null) {
  const fromFallback = normalizeDesiredOutcomeDirection(fallback);
  const prefixMatch = compact(statement)
    .toLowerCase()
    .match(/^(increase|reduce|improve|maximize|minimize|avoid)\b/);
  if (prefixMatch?.[1]) return normalizeDesiredOutcomeDirection(prefixMatch[1]);
  return fromFallback;
}

function splitObjectAndContext(statement: string) {
  const normalized = stripLeadingDirection(statement);

  if (!normalized) {
    return { object: "reliable progress", context: "target customers" };
  }

  const contextMatch = normalized.match(
    /^(.*?)(?:\s+(?:for|among|across|within|during|in)\s+)(.+)$/i,
  );
  if (!contextMatch) {
    return { object: normalized, context: "target customers" };
  }

  return {
    object: compact(contextMatch[1]) || "reliable progress",
    context: compact(contextMatch[2]) || "target customers",
  };
}

/** Try to extract actor and action from a legacy outcome statement. */
function inferActorAndAction(statement: string): { actor: string; action: string } {
  // Pattern: "the percentage of {actor} who {action} ..."
  const behavioralMatch = statement.match(
    /the\s+(?:percentage|share|rate|number)\s+of\s+([^w][\w\s]+?)\s+who\s+([\w\s]+?)(?:\s+(?:after|during|within|in|while|without)|\.)/i,
  );
  if (behavioralMatch) {
    return {
      actor: compact(behavioralMatch[1]),
      action: compact(behavioralMatch[2]),
    };
  }
  return { actor: "", action: "" };
}

export function deriveDesiredOutcomeParts(row: DesiredOutcomeRowLike): DesiredOutcomeParts {
  const statement = humanizeOutcomeLanguage(row.outcome_statement);
  const leadingIndicator = humanizeOutcomeLanguage(row.leading_indicator);
  const direction = inferDirectionFromStatement(statement, row.direction || row.target_direction);

  const split = splitObjectAndContext(statement);
  const metric = compact(row.metric || leadingIndicator || "");
  const object = stripLeadingDirection(compact(row.object || split.object || "reliable progress"));

  // Use explicit actor/action from row, fall back to inference from statement
  const inferred = inferActorAndAction(statement);
  const actor = compact(row.actor || inferred.actor);
  const action = compact(row.action || inferred.action);

  return {
    direction: normalizeDesiredOutcomeDirection(direction),
    metric: humanizeOutcomeLanguage(
      metric || `Share of ${split.context} that achieve ${split.object}`,
    ),
    actor,
    action,
    object: humanizeOutcomeLanguage(object || "reliable progress"),
    context: humanizeOutcomeLanguage(
      compact(row.context || split.context || inferContextFromJourney(row.journey_key)),
    ),
    constraint: compact(row.constraint || "") || null,
    is_primary: row.is_primary ?? null,
    level: normalizeOutcomeLevel(row.level),
  };
}

export function composeDesiredOutcomeFromParts(parts: DesiredOutcomeParts) {
  const normalizedParts: DesiredOutcomeParts = {
    direction: normalizeDesiredOutcomeDirection(parts.direction),
    metric: humanizeOutcomeLanguage(parts.metric),
    actor: humanizeOutcomeLanguage(parts.actor),
    action: humanizeOutcomeLanguage(parts.action),
    object: humanizeOutcomeLanguage(stripLeadingDirection(parts.object)),
    context: humanizeOutcomeLanguage(parts.context),
    constraint: compact(parts.constraint || "") || null,
    is_primary: parts.is_primary ?? null,
    level: normalizeOutcomeLevel(parts.level as string | null | undefined),
  };

  const outcome_statement = buildDesiredOutcomeSentence(normalizedParts);
  const leading_indicator = humanizeOutcomeLanguage(normalizedParts.metric);

  return {
    ...normalizedParts,
    outcome_statement,
    leading_indicator,
    target_direction: normalizedParts.direction,
  };
}

export type OutcomeValidationResult = {
  valid: boolean;
  reasons: string[];       // hard failures — outcome must be rewritten
  warnings: string[];      // soft gaps — outcome works but is incomplete
  normalized: ReturnType<typeof composeDesiredOutcomeFromParts>;
};

export function validateDesiredOutcomeParts(parts: DesiredOutcomeParts): OutcomeValidationResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const normalized = composeDesiredOutcomeFromParts(parts);

  // Hard failures
  if (!normalized.direction) reasons.push("missing_direction");
  if (!compact(normalized.metric)) reasons.push("missing_metric");
  if (!compact(normalized.object) && !compact(normalized.actor)) reasons.push("missing_object");
  if (!compact(normalized.context) && !compact(normalized.action)) reasons.push("missing_context");

  if (SOLUTION_LANGUAGE_PATTERN.test(`${normalized.object} ${normalized.context}`)) {
    reasons.push("contains_solution_language");
  }

  if (
    !MEASURABLE_PATTERN.test(normalized.metric) &&
    !MEASURABLE_PATTERN.test(normalized.outcome_statement)
  ) {
    reasons.push("missing_measurable_signal");
  }

  if (/\bmonitor decision impact\b/i.test(normalized.outcome_statement)) {
    reasons.push("contains_jargon");
  }

  const rootText = compact(
    `${normalized.direction} ${normalized.object} ${normalized.context}`,
  );
  if (rootText.length < 24) reasons.push("too_vague");

  // Soft warnings — behavior-first rule
  if (!compact(normalized.actor)) warnings.push("missing_actor");
  if (!compact(normalized.action)) warnings.push("missing_action");
  if (!normalized.level) warnings.push("missing_level");

  if (compact(normalized.action) && !OBSERVABLE_ACTION_PATTERN.test(normalized.action)) {
    warnings.push("action_may_not_be_observable");
  }

  return {
    valid: reasons.length === 0,
    reasons,
    warnings,
    normalized,
  };
}

export function getPrimaryDesiredOutcome<T extends DesiredOutcomeRowLike>(rows: T[]) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return null;

  const explicit = list.find((row) => row?.is_primary === true);
  if (explicit) return explicit;

  const primaryLevel = list.find((row) => row?.level === "primary");
  if (primaryLevel) return primaryLevel;

  return (
    [...list].sort((a, b) => {
      const aSignal = compact(a.leading_indicator).length > 0 ? 1 : 0;
      const bSignal = compact(b.leading_indicator).length > 0 ? 1 : 0;
      if (aSignal !== bSignal) return bSignal - aSignal;
      return compact(b.outcome_statement).length - compact(a.outcome_statement).length;
    })[0] || null
  );
}

/** True when the outcome fully satisfies the behavior-first rule. */
export function isFullyStructured(parts: {
  actor?: string | null;
  action?: string | null;
  level?: string | null;
}): boolean {
  return !!(compact(parts.actor) && compact(parts.action) && parts.level);
}

// ── Stage-aware outcome generation utilities ─────────────────────────────────

export type ProblemType = "pre_conviction" | "post_conviction" | "scale_retention" | "unknown";
export type EvidenceLevel = "external_only" | "internal_partial" | "validated" | "strong_validated";

const PRE_CONVICTION_KEYWORDS =
  /\b(prospect|reach conviction|book|first call|first interaction|first meeting|discovery|qualify|qualified|pipeline|win rate|close rate|outreach|referral source|new client|acquire|acquisition|selection|attract|awareness|convert|conversion|conviction|pre-sale|presale)\b/i;

const POST_CONVICTION_KEYWORDS =
  /\b(client engagement|delivering|delivery|implement|onboard|onboarding|adopt|adoption|commit to direction|strategic direction|value realization|decision quality|during engagement|existing client|engagement stall|post-sale|post sale)\b/i;

const SCALE_RETENTION_KEYWORDS =
  /\b(retain|retention|renew|renewal|expand|expansion|repeat|upsell|alumni|referral from existing|second engagement|compounding|scale|long.?term)\b/i;

/**
 * Classify a list of strategic problem statements into a problem type.
 * This runs deterministically before LLM generation to constrain level selection.
 */
export function classifyProblemType(problemStatements: string[]): ProblemType {
  const combined = problemStatements.filter(Boolean).join(" ");
  if (!combined.trim()) return "unknown";

  const preSale = PRE_CONVICTION_KEYWORDS.test(combined) ? 1 : 0;
  const postSale = POST_CONVICTION_KEYWORDS.test(combined) ? 1 : 0;
  const scale   = SCALE_RETENTION_KEYWORDS.test(combined) ? 1 : 0;

  if (preSale === 0 && postSale === 0 && scale === 0) return "unknown";
  if (preSale >= postSale && preSale >= scale) return "pre_conviction";
  if (scale >= postSale) return "scale_retention";
  return "post_conviction";
}

/**
 * Derive an evidence level from how the research context was assembled.
 * Feeds directly into confidence ceilings and outcome wording.
 */
export function deriveEvidenceLevel(
  researchContextMode: "public_baseline" | "uploaded_evidence_fallback",
  uploadedFileCount: number,
): EvidenceLevel {
  if (researchContextMode !== "uploaded_evidence_fallback") return "external_only";
  if (uploadedFileCount >= 8) return "validated";
  return "internal_partial";
}

/** Maximum confidence score permitted at each evidence level. */
export const EVIDENCE_CONFIDENCE_CEILING: Record<EvidenceLevel, number> = {
  external_only:    52,
  internal_partial: 65,
  validated:        78,
  strong_validated: 88,
};

/**
 * Which outcome levels are appropriate at each MojoMap program phase.
 * Outside = hypothesis only → primary is provisional.
 * Diagnose = primary required; secondary only if post-conviction problem is explicit.
 * Focus / Flow = all levels allowed, must match problem type.
 */
export const STAGE_PERMITTED_LEVELS: Record<string, OutcomeLevel[]> = {
  outside:  ["primary"],
  diagnose: ["primary", "secondary"],
  focus:    ["primary", "secondary", "tertiary"],
  flow:     ["primary", "secondary", "tertiary"],
};

/**
 * Map problem type → the correct primary level.
 * pre_conviction  → primary   (selection / conviction)
 * post_conviction → secondary (value realization)
 * scale_retention → tertiary  (scale / expansion)
 */
export const PROBLEM_TYPE_TO_PRIMARY_LEVEL: Record<ProblemType, OutcomeLevel | null> = {
  pre_conviction:  "primary",
  post_conviction: "secondary",
  scale_retention: "tertiary",
  unknown:          null,
};
