import { deriveDesiredOutcomeParts, validateDesiredOutcomeParts, type DesiredOutcomeParts } from "./desiredOutcome";

export const REQUIRED_FRAMEWORK_KEYS = ["odi", "teresa_torres"] as const;

const PRESCRIPTIVE_SOLUTION_TERM_PATTERN =
  /\b(feature|features|dashboard|portal|campaign|workflow|form|tool|tools|ui|ux|implementation|solution|solutions|prototype|wireframe|playbook|template|toolkit|checklist)\b/i;
const PRESCRIPTIVE_SOLUTION_PREFIX_PATTERN =
  /^(build|launch|create|implement|redesign|develop|establish|standardize|automate|deploy|design|integrate|introduce)\b/i;
/**
 * Paired prescriptive verb + solution noun — catches "build a workflow tracker",
 * "launch a new dashboard", "deploy a form" etc. while leaving descriptive uses
 * like "reduce friction in the approval workflow" untouched.
 */
const PRESCRIPTIVE_VERB_NOUN_PAIR_PATTERN =
  /\b(build|launch|create|implement|redesign|develop|establish|standardize|automate|deploy|design|integrate|introduce)\s+\w*\s*(a|an|the)?\s*(feature|dashboard|portal|campaign|workflow|form|tool|tools|ui|ux|prototype|wireframe|playbook|template|toolkit|checklist|solution)\b/i;
const SOLUTION_IDEA_SIGNAL_PATTERN =
  /\b(feature|features|build|built|launch|launched|dashboard|portal|campaign|workflow|form|tool|tools|ui|ux|implementation|implement|implemented|solution|solutions|redesign|redesigned|develop|developed|create|created|establish|established|standardize|standardized|automate|automated|deploy|deployed|pilot|piloted|map|mapped|analyze|analysed|analyzed|audit|audited|define|defined|train|trained|design|designed|integrate|integrated|introduce|introduced|process|system|program|protocol|playbook|framework|template|toolkit|script|guide|checklist)\b/i;

const OUTCOME_VERB_PATTERN = /^(increase|reduce|improve|maximize|minimize|avoid)\b/i;
const MEASURABLE_DIMENSION_PATTERN =
  /\b(time|effort|likelihood|confidence|consistency|clarity|risk|delay|drop-off|completion|cost|burden|visibility|follow-through|continuity|conversion|retention|readiness|access|quality|rework|rate|share|percentage)\b/i;

const INTERNAL_STATE_PATTERN =
  /\b(feel|believe|understand|trust|know|think|experience|perceive|sense|realize|appreciate|grasp)\b/i;

const POST_SALE_ACTOR_PATTERN = /\b(client|clients|existing client|engagement|engagements)\b/i;
const PRE_SALE_ACTOR_PATTERN  = /\b(prospect|prospects|qualified prospect|lead|leads|decision.?maker)\b/i;

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
  direction?: string;
  metric?: string;
  actor?: string;
  action?: string;
  object?: string;
  context?: string;
  constraint?: string | null;
  level?: string | null;
  /** Pre-classified problem type — drives actor/level alignment checks */
  problemType?: "pre_conviction" | "post_conviction" | "scale_retention" | "unknown" | null;
  /** Current MojoMap program phase — drives stage/level alignment checks */
  stage?: "outside" | "diagnose" | "focus" | "flow" | null;
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

function containsPrescriptiveSolutionLanguage(value: string) {
  const text = String(value || "").trim();
  if (!text) return false;

  // Strongest signal: sentence starts with a prescriptive build/deploy verb.
  if (PRESCRIPTIVE_SOLUTION_PREFIX_PATTERN.test(text)) return true;

  // Medium signal: prescriptive verb paired with a solution noun anywhere in text.
  if (PRESCRIPTIVE_VERB_NOUN_PAIR_PATTERN.test(text)) return true;

  // Weak signal: solution noun appears alone.
  // Only treat it as prescriptive when there is NO outcome directional verb
  // (increase / reduce / improve / maximize / minimize / avoid).
  // If an outcome verb is present the noun is almost certainly used as
  // descriptive context (e.g. "reduce friction in the approval workflow").
  if (PRESCRIPTIVE_SOLUTION_TERM_PATTERN.test(text)) {
    const hasOutcomeVerb = OUTCOME_VERB_PATTERN.test(text);
    if (!hasOutcomeVerb) return true;
  }

  return false;
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
  if (containsPrescriptiveSolutionLanguage(statement)) reasons.push("contains_solution_language");

  const structuredInput: DesiredOutcomeParts = {
    ...deriveDesiredOutcomeParts({
      outcome_statement: statement,
      leading_indicator: indicator,
      target_direction: String(candidate.direction || candidate.targetDirection || "increase"),
      metric: String(candidate.metric || ""),
      actor: String(candidate.actor || ""),
      action: String(candidate.action || ""),
      object: String(candidate.object || ""),
      context: String(candidate.context || ""),
      constraint: candidate.constraint || null,
      level: candidate.level || null,
    }),
  };
  const structured = validateDesiredOutcomeParts(structuredInput);
  if (!structured.valid) {
    reasons.push(...structured.reasons.map((reason) => `structured_${reason}`));
  }
  // Surface behavior-first warnings as reasons so AI pipelines can detect gaps.
  // Always prefix with "warning_" so they are NOT treated as hard failures.
  for (const w of structured.warnings) {
    const prefixed = w.startsWith("warning_") ? w : `warning_${w}`;
    if (!reasons.includes(prefixed)) reasons.push(prefixed);
  }

  if (candidate.frameworksUsed && !hasRequiredFrameworkKeys(candidate.frameworksUsed)) {
    reasons.push("missing_required_frameworks");
  }

  // Alignment signals — surfaced for repair logic and UI, but do not block valid.
  // Prompts control alignment; validators check structure.
  if (INTERNAL_STATE_PATTERN.test(statement) || INTERNAL_STATE_PATTERN.test(indicator)) {
    reasons.push("warning_contains_internal_state_language");
  }

  if (candidate.stage && candidate.level) {
    const stageMap: Record<string, string[]> = {
      outside:  ["primary"],
      diagnose: ["primary", "secondary"],
      focus:    ["primary", "secondary", "tertiary"],
      flow:     ["primary", "secondary", "tertiary"],
    };
    const permitted = stageMap[candidate.stage] ?? [];
    if (permitted.length > 0 && !permitted.includes(candidate.level)) {
      reasons.push("warning_stage_level_mismatch");
    }
  }

  if (candidate.problemType && candidate.actor) {
    const actorText = String(candidate.actor || "");
    if (candidate.problemType === "pre_conviction" && POST_SALE_ACTOR_PATTERN.test(actorText)) {
      reasons.push("warning_actor_stage_mismatch");
    }
    if (candidate.problemType === "post_conviction" && PRE_SALE_ACTOR_PATTERN.test(actorText)) {
      reasons.push("warning_actor_stage_mismatch");
    }
  }

  // valid = no HARD failures (warnings are prefixed "warning_" and do not block)
  const hardFailures = reasons.filter((r) => !r.startsWith("warning_"));
  return { valid: hardFailures.length === 0, reasons };
}

export function validateOpportunity(candidate: OpportunityCandidate): ValidationResult {
  const reasons: string[] = [];
  const outcome = String(candidate.outcome || "").trim();

  if (!outcome) reasons.push("missing_outcome");
  if (containsPrescriptiveSolutionLanguage(outcome)) reasons.push("contains_solution_language");
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

export function validateParentChildOpportunityDistinctness(parentOpportunity: string, childOpportunity: string): ValidationResult {
  return validateOutcomeOpportunityDistinctness(parentOpportunity, childOpportunity);
}

export function validateSolutionIdea(candidate: SolutionIdeaCandidate): ValidationResult {
  const reasons: string[] = [];
  const title = String(candidate.title || "").trim();
  const description = String(candidate.description || "").trim();

  if (!title) reasons.push("missing_title");
  if (!description) reasons.push("missing_description");
  if (!SOLUTION_IDEA_SIGNAL_PATTERN.test(`${title} ${description}`)) reasons.push("missing_solution_signal");

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
