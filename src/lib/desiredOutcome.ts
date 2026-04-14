export const DESIRED_OUTCOME_DIRECTIONS = [
  "increase",
  "reduce",
  "improve",
  "maximize",
  "minimize",
  "avoid",
] as const;

export type DesiredOutcomeDirection = (typeof DESIRED_OUTCOME_DIRECTIONS)[number];

export type DesiredOutcomeParts = {
  direction: DesiredOutcomeDirection;
  metric: string;
  object: string;
  context: string;
  constraint?: string | null;
  is_primary?: boolean | null;
};

export type DesiredOutcomeRowLike = {
  outcome_statement?: string | null;
  leading_indicator?: string | null;
  target_direction?: string | null;
  journey_key?: string | null;
  direction?: string | null;
  metric?: string | null;
  object?: string | null;
  context?: string | null;
  constraint?: string | null;
  is_primary?: boolean | null;
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
];

const MEASURABLE_PATTERN =
  /\b(rate|share|time|cycle|days?|weeks?|months?|hours?|minutes?|percentage|percent|count|ratio|likelihood|confidence|completion|retention|conversion|drop-off|delay|rework|quality|consistency|accuracy|first-pass)\b/i;

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

  const actors = ["customer", "customers", "prospect", "prospects", "team", "teams", "operator", "operators", "buyer", "buyers", "partner", "partners"];
  return actors.some((token) => object.includes(token) && context.includes(token));
}

export function normalizeDesiredOutcomeDirection(value: string | null | undefined): DesiredOutcomeDirection {
  const normalized = compact(value).toLowerCase();
  if ((DESIRED_OUTCOME_DIRECTIONS as readonly string[]).includes(normalized)) {
    return normalized as DesiredOutcomeDirection;
  }
  return "increase";
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
  const object = stripLeadingDirection(parts.object);
  const context = compact(parts.context);
  const constraint = compact(parts.constraint || "");
  const constraintClause = constraint
    ? (/^(without|under|within|before|after)\b/i.test(constraint) ? constraint : `while ${constraint}`)
    : "";
  const contextClause = context && !isContextRedundant(object, context)
    ? `for ${lowerLeading(context)}`
    : "";

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
  const prefixMatch = compact(statement).toLowerCase().match(/^(increase|reduce|improve|maximize|minimize|avoid)\b/);
  if (prefixMatch?.[1]) return normalizeDesiredOutcomeDirection(prefixMatch[1]);
  return fromFallback;
}

function splitObjectAndContext(statement: string) {
  const normalized = stripLeadingDirection(statement);

  if (!normalized) {
    return {
      object: "reliable progress",
      context: "target customers",
    };
  }

  const contextMatch = normalized.match(/^(.*?)(?:\s+(?:for|among|across|within|during|in)\s+)(.+)$/i);
  if (!contextMatch) {
    return {
      object: normalized,
      context: "target customers",
    };
  }

  return {
    object: compact(contextMatch[1]) || "reliable progress",
    context: compact(contextMatch[2]) || "target customers",
  };
}

export function deriveDesiredOutcomeParts(row: DesiredOutcomeRowLike): DesiredOutcomeParts {
  const statement = humanizeOutcomeLanguage(row.outcome_statement);
  const leadingIndicator = humanizeOutcomeLanguage(row.leading_indicator);
  const direction = inferDirectionFromStatement(statement, row.direction || row.target_direction);

  const split = splitObjectAndContext(statement);
  const metric = compact(row.metric || leadingIndicator || "");
  const object = stripLeadingDirection(compact(row.object || split.object || "reliable progress"));

  return {
    direction: normalizeDesiredOutcomeDirection(direction),
    metric: humanizeOutcomeLanguage(metric || `Share of ${split.context} that achieve ${split.object}`),
    object: humanizeOutcomeLanguage(object || "reliable progress"),
    context: humanizeOutcomeLanguage(compact(row.context || split.context || inferContextFromJourney(row.journey_key))),
    constraint: compact(row.constraint || "") || null,
    is_primary: row.is_primary ?? null,
  };
}

export function composeDesiredOutcomeFromParts(parts: DesiredOutcomeParts) {
  const normalizedParts: DesiredOutcomeParts = {
    direction: normalizeDesiredOutcomeDirection(parts.direction),
    metric: humanizeOutcomeLanguage(parts.metric),
    object: humanizeOutcomeLanguage(stripLeadingDirection(parts.object)),
    context: humanizeOutcomeLanguage(parts.context),
    constraint: compact(parts.constraint || "") || null,
    is_primary: parts.is_primary ?? null,
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

export function validateDesiredOutcomeParts(parts: DesiredOutcomeParts) {
  const reasons: string[] = [];
  const normalized = composeDesiredOutcomeFromParts(parts);

  if (!normalized.direction) reasons.push("missing_direction");
  if (!compact(normalized.metric)) reasons.push("missing_metric");
  if (!compact(normalized.object)) reasons.push("missing_object");
  if (!compact(normalized.context)) reasons.push("missing_context");

  if (SOLUTION_LANGUAGE_PATTERN.test(`${normalized.object} ${normalized.context}`)) {
    reasons.push("contains_solution_language");
  }

  if (!MEASURABLE_PATTERN.test(normalized.metric) && !MEASURABLE_PATTERN.test(normalized.outcome_statement)) {
    reasons.push("missing_measurable_signal");
  }

  if (/\bmonitor decision impact\b/i.test(normalized.outcome_statement)) {
    reasons.push("contains_jargon");
  }

  const rootText = compact(`${normalized.direction} ${normalized.object} ${normalized.context}`);
  if (rootText.length < 24) reasons.push("too_vague");

  return {
    valid: reasons.length === 0,
    reasons,
    normalized,
  };
}

export function getPrimaryDesiredOutcome<T extends DesiredOutcomeRowLike>(rows: T[]) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return null;

  const explicit = list.find((row) => row?.is_primary === true);
  if (explicit) return explicit;

  return [...list].sort((a, b) => {
    const aSignal = compact(a.leading_indicator).length > 0 ? 1 : 0;
    const bSignal = compact(b.leading_indicator).length > 0 ? 1 : 0;
    if (aSignal !== bSignal) return bSignal - aSignal;
    return compact(b.outcome_statement).length - compact(a.outcome_statement).length;
  })[0] || null;
}
