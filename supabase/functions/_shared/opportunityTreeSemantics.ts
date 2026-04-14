export const REQUIRED_FRAMEWORK_KEYS = ["odi", "teresa_torres"] as const;

const SOLUTION_LANGUAGE_PATTERN =
  /\b(feature|features|build|built|launch|launched|dashboard|portal|campaign|workflow|form|tool|tools|ui|ux|implementation|implement|implemented|solution|solutions)\b/i;

const OUTCOME_VERB_PATTERN = /^(increase|reduce|improve|maximize|minimize|avoid)\b/i;
const MEASURABLE_DIMENSION_PATTERN =
  /\b(time|effort|likelihood|confidence|consistency|clarity|risk|delay|drop-off|completion|cost|burden|visibility|follow-through|continuity|conversion|retention|readiness|access|quality|rework|rate|share|percentage)\b/i;

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "into", "from", "that", "this", "your", "their", "while", "through", "across",
  "customer", "customers", "team", "teams", "journey", "step", "outcome", "outcomes", "opportunity", "opportunities",
  "increase", "reduce", "improve", "maximize", "minimize", "avoid",
]);

const FRAMEWORK_ALIASES: Record<string, string> = {
  odi: "odi",
  "jobs-to-be-done": "odi",
  jtbd: "odi",
  "odi / jobs-to-be-done": "odi",
  teresa_torres: "teresa_torres",
  "teresa torres": "teresa_torres",
  "teresa torres opportunity mapping": "teresa_torres",
};

export type ValidationResult = {
  valid: boolean;
  reasons: string[];
};

export type DesiredOutcomeCandidate = {
  statement: string;
  leadingIndicator: string;
  targetDirection?: string;
  frameworksUsed?: string[] | null;
};

export type OpportunityCandidate = {
  outcome: string;
  importance?: number | null;
  satisfaction?: number | null;
  frameworksUsed?: string[] | null;
};

export type SolutionIdeaCandidate = {
  title: string;
  description: string;
  frameworksUsed?: string[] | null;
};

export type SolutionTestCandidate = {
  title: string;
  method: string;
  metric: string;
  successThreshold: string;
  timebox: string;
  frameworksUsed?: string[] | null;
};

export function normalizeFrameworkKeys(value: string[] | null | undefined) {
  const keys = Array.isArray(value) ? value : [];
  return Array.from(
    new Set(
      keys
        .map((entry) => String(entry || "").trim().toLowerCase())
        .map((entry) => FRAMEWORK_ALIASES[entry] || entry)
        .filter(Boolean),
    ),
  );
}

export function ensureRequiredFrameworkKeys(value: string[] | null | undefined) {
  return Array.from(new Set([...normalizeFrameworkKeys(value), ...REQUIRED_FRAMEWORK_KEYS]));
}

export function hasRequiredFrameworkKeys(value: string[] | null | undefined) {
  const normalized = normalizeFrameworkKeys(value);
  return REQUIRED_FRAMEWORK_KEYS.every((key) => normalized.includes(key));
}

function tokenize(value: string) {
  const tokens = String(value || "").toLowerCase().match(/[a-z][a-z-]{2,}/g) || [];
  return tokens
    .map(stemToken)
    .filter((token) => token.length >= 3)
    .filter((token) => !STOP_WORDS.has(token));
}

function stemToken(token: string) {
  let value = String(token || "");
  if (value.length > 6 && value.endsWith("ing")) value = value.slice(0, -3);
  if (value.length > 5 && value.endsWith("ly")) value = value.slice(0, -2);
  if (value.length > 5 && value.endsWith("ed")) value = value.slice(0, -2);
  if (value.length > 5 && value.endsWith("es")) value = value.slice(0, -2);
  if (value.length > 4 && value.endsWith("s")) value = value.slice(0, -1);
  return value;
}

function jaccardSimilarity(a: string, b: string) {
  const aSet = new Set(tokenize(a));
  const bSet = new Set(tokenize(b));
  if (aSet.size === 0 || bSet.size === 0) return 0;

  let intersection = 0;
  for (const token of aSet) {
    if (bSet.has(token)) intersection += 1;
  }
  const union = new Set([...aSet, ...bSet]).size;
  return union > 0 ? intersection / union : 0;
}

function overlapRatio(a: Set<string>, b: Set<string>) {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / Math.min(a.size, b.size);
}

function normalizeText(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateDesiredOutcome(candidate: DesiredOutcomeCandidate): ValidationResult {
  const reasons: string[] = [];
  const statement = String(candidate.statement || "").trim();
  const indicator = String(candidate.leadingIndicator || "").trim();

  if (!statement) reasons.push("missing_statement");
  if (!indicator) reasons.push("missing_leading_indicator");

  if (statement && !OUTCOME_VERB_PATTERN.test(statement)) reasons.push("missing_directional_verb");
  if (statement && !MEASURABLE_DIMENSION_PATTERN.test(statement) && !MEASURABLE_DIMENSION_PATTERN.test(indicator)) {
    reasons.push("missing_measurable_dimension");
  }
  if (SOLUTION_LANGUAGE_PATTERN.test(statement)) reasons.push("contains_solution_language");

  if (candidate.frameworksUsed && !hasRequiredFrameworkKeys(candidate.frameworksUsed)) {
    reasons.push("missing_required_frameworks");
  }

  return { valid: reasons.length === 0, reasons };
}

export function validateOpportunity(candidate: OpportunityCandidate): ValidationResult {
  const reasons: string[] = [];
  const outcome = String(candidate.outcome || "").trim();

  if (!outcome) reasons.push("missing_outcome");
  if (SOLUTION_LANGUAGE_PATTERN.test(outcome)) reasons.push("contains_solution_language");
  if (!OUTCOME_VERB_PATTERN.test(outcome)) reasons.push("missing_directional_verb");

  if (candidate.importance != null && !(Number(candidate.importance) >= 1 && Number(candidate.importance) <= 10)) {
    reasons.push("importance_out_of_range");
  }
  if (candidate.satisfaction != null && !(Number(candidate.satisfaction) >= 1 && Number(candidate.satisfaction) <= 10)) {
    reasons.push("satisfaction_out_of_range");
  }

  if (candidate.frameworksUsed && !hasRequiredFrameworkKeys(candidate.frameworksUsed)) {
    reasons.push("missing_required_frameworks");
  }

  return { valid: reasons.length === 0, reasons };
}

export function validateOutcomeOpportunityDistinctness(desiredOutcome: string, opportunityOutcome: string): ValidationResult {
  const reasons: string[] = [];
  const desired = normalizeText(desiredOutcome);
  const opportunity = normalizeText(opportunityOutcome);
  if (!desired || !opportunity) {
    reasons.push("missing_text");
    return { valid: false, reasons };
  }

  if (desired === opportunity) reasons.push("exact_match");

  if (desired.length >= 24 && opportunity.length >= 24) {
    if (desired.includes(opportunity) || opportunity.includes(desired)) {
      reasons.push("near_duplicate_substring");
    }
  }

  const similarity = jaccardSimilarity(desired, opportunity);
  if (similarity >= 0.72) reasons.push("near_duplicate_similarity");

  const desiredTokens = new Set(tokenize(desired));
  const opportunityTokens = new Set(tokenize(opportunity));
  const overlap = overlapRatio(desiredTokens, opportunityTokens);
  if (Math.min(desiredTokens.size, opportunityTokens.size) >= 4 && overlap >= 0.86) {
    reasons.push("near_duplicate_token_overlap");
  }

  return { valid: reasons.length === 0, reasons };
}

export function validateSolutionIdea(candidate: SolutionIdeaCandidate): ValidationResult {
  const reasons: string[] = [];
  const title = String(candidate.title || "").trim();
  const description = String(candidate.description || "").trim();

  if (!title) reasons.push("missing_title");
  if (!description) reasons.push("missing_description");
  if (!SOLUTION_LANGUAGE_PATTERN.test(`${title} ${description}`)) reasons.push("missing_solution_signal");

  if (candidate.frameworksUsed && !hasRequiredFrameworkKeys(candidate.frameworksUsed)) {
    reasons.push("missing_required_frameworks");
  }

  return { valid: reasons.length === 0, reasons };
}

export function validateSolutionTest(candidate: SolutionTestCandidate): ValidationResult {
  const reasons: string[] = [];

  if (!String(candidate.title || "").trim()) reasons.push("missing_title");
  if (!String(candidate.method || "").trim()) reasons.push("missing_method");
  if (!String(candidate.metric || "").trim()) reasons.push("missing_metric");
  if (!String(candidate.successThreshold || "").trim()) reasons.push("missing_success_threshold");
  if (!String(candidate.timebox || "").trim()) reasons.push("missing_timebox");

  if (candidate.frameworksUsed && !hasRequiredFrameworkKeys(candidate.frameworksUsed)) {
    reasons.push("missing_required_frameworks");
  }

  return { valid: reasons.length === 0, reasons };
}
