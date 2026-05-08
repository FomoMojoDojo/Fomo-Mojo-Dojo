import type { PositioningCanvas } from "@/lib/types";

export type PositioningStrengthLevel = "strong" | "moderate" | "weak" | "generic";

export interface PositioningStrengthResult {
  level: PositioningStrengthLevel;
  issues: string[];
  suggestions: string[];
}

// Market categories that signal placeholder or overly broad framing.
const GENERIC_CATEGORY_KEYWORDS = [
  "software",
  "platform",
  "solution",
  "solutions",
  "tool",
  "tools",
  "service",
  "services",
  "product",
  "products",
  "system",
  "systems",
  "technology",
  "technologies",
  "saas",
  "b2b",
  "b2c",
  "startup",
  "company",
  "business",
];

// Adjectives that sound differentiated but say nothing verifiable.
const VAGUE_ADJECTIVES = [
  "innovative",
  "cutting-edge",
  "best-in-class",
  "world-class",
  "leading",
  "powerful",
  "robust",
  "seamless",
  "comprehensive",
  "end-to-end",
  "holistic",
  "scalable",
  "flexible",
  "easy",
  "simple",
  "fast",
  "smart",
  "intelligent",
  "advanced",
  "next-generation",
  "next-gen",
  "revolutionary",
  "disruptive",
  "unique",
  "best",
  "better",
  "great",
  "amazing",
  "excellent",
  "superior",
  "optimal",
  "efficient",
];

// Outcome language that is non-specific — talks about capabilities rather than customer results.
const VAGUE_OUTCOME_PHRASES = [
  "help you",
  "helps you",
  "helps companies",
  "help companies",
  "helps businesses",
  "help businesses",
  "helps teams",
  "help teams",
  "enables you",
  "allow you",
  "allows you",
  "empowers you",
  "empower you",
  "manage your",
  "manage the",
  "streamline",
  "streamlines",
  "simplify",
  "simplifies",
  "improve your",
  "improves your",
  "boost your",
  "boosts your",
  "increase your",
  "increases your",
  "enhance your",
  "enhances your",
  "optimize your",
  "optimizes your",
  // Jargon phrases that name a result category without specifying an actual outcome
  "stand out",
  "competitive advantage",
  "competitive edge",
  "customer engagement",
  "customer success",
  "grow your business",
  "drive growth",
  "drive results",
  "drive revenue",
  "market presence",
  "brand awareness",
  "digital transformation",
];

// Audience descriptors that are too broad to define a real buyer segment.
const VAGUE_AUDIENCE_PHRASES = [
  "business owners",
  "small business owners",
  "small businesses",
  "entrepreneurs",
  "marketing teams",
  "sales teams",
  "companies of all sizes",
  "businesses of all sizes",
  "organizations of all",
  "anyone who",
  "open to innovative",
  "looking to grow",
  "looking to improve",
  "who want to",
  "that want to",
  "that need to",
];

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function containsWord(text: string, word: string): boolean {
  const pattern = new RegExp(`(^|\\s|-)${word.replace(/-/g, "[- ]")}(\\s|-|$)`, "i");
  return pattern.test(text);
}

function containsPhrase(text: string, phrase: string): boolean {
  return normalizeText(text).includes(normalizeText(phrase));
}

function evaluateCategory(category: string): { issues: string[]; suggestions: string[]; penalty: number } {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let penalty = 0;

  if (!category || category.trim().length < 3) {
    issues.push("Market category is missing.");
    suggestions.push("Define the specific market category buyers use to evaluate you — e.g. 'revenue intelligence for mid-market SaaS' rather than 'software'.");
    return { issues, suggestions, penalty: 3 };
  }

  const normalized = normalizeText(category);
  const genericMatches = GENERIC_CATEGORY_KEYWORDS.filter((kw) => containsWord(normalized, kw));

  if (genericMatches.length > 0 && category.trim().split(/\s+/).length <= 3) {
    issues.push(`Market category "${category.trim()}" is too broad — buyers can't orient themselves to it.`);
    suggestions.push("Narrow the category to what a buyer would actually search for: include the specific job, buyer type, or context (e.g. 'project tracking for field service teams').");
    penalty += 3;
  } else if (genericMatches.length > 0) {
    issues.push(`Market category contains generic terms (${genericMatches.slice(0, 2).join(", ")}); consider making the frame more specific.`);
    suggestions.push("Add the segment or use-case qualifier to the category name to make it more navigable for buyers.");
    penalty += 1;
  }

  return { issues, suggestions, penalty };
}

function evaluateDifferentiators(
  attributes: PositioningCanvas["unique_attributes"],
): { issues: string[]; suggestions: string[]; penalty: number } {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let penalty = 0;

  if (!attributes || attributes.length === 0) {
    issues.push("No unique attributes are defined.");
    suggestions.push("List the specific capabilities or characteristics that alternatives cannot credibly claim.");
    return { issues, suggestions, penalty: 3 };
  }

  const combined = attributes.map((a) => `${a.name} ${a.description}`).join(" ");
  const normalized = normalizeText(combined);

  const vagueMatches = VAGUE_ADJECTIVES.filter((adj) => containsWord(normalized, adj));
  if (vagueMatches.length >= 3) {
    issues.push(`Differentiators rely on vague adjectives (${vagueMatches.slice(0, 3).join(", ")}) that competitors can also claim.`);
    suggestions.push("Replace adjective-based claims with specific mechanisms, metrics, or proof points — what does the company do that others structurally cannot?");
    penalty += 2;
  } else if (vagueMatches.length >= 1) {
    issues.push(`Some differentiators use unverifiable language (${vagueMatches.slice(0, 2).join(", ")}). Sharpen these with concrete claims.`);
    suggestions.push("Add a measurable result, time frame, or structural constraint that makes each attribute defensible.");
    penalty += 1;
  }

  const shortAttributes = attributes.filter((a) => (a.name + " " + a.description).trim().length < 20);
  if (shortAttributes.length > 0 && attributes.length <= 2) {
    issues.push("Differentiators are too brief to convey what makes them credible.");
    suggestions.push("Each attribute should state both the claim and the mechanism or evidence behind it.");
    penalty += 1;
  }

  return { issues, suggestions, penalty };
}

function evaluateOutcome(outcome: string): { issues: string[]; suggestions: string[]; penalty: number } {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let penalty = 0;

  if (!outcome || outcome.trim().length < 10) {
    issues.push("Value statement (outcome) is missing.");
    suggestions.push("Describe the specific thing customers can now do — that they couldn't do before — as a result of using this product.");
    return { issues, suggestions, penalty: 3 };
  }

  const normalized = normalizeText(outcome);

  const vagueAdjMatches = VAGUE_ADJECTIVES.filter((adj) => containsWord(normalized, adj));
  if (vagueAdjMatches.length >= 2) {
    issues.push(`Value statement uses vague adjectives (${vagueAdjMatches.slice(0, 2).join(", ")}) that don't convey a concrete result.`);
    suggestions.push("Anchor the outcome to a specific customer capability or change in state, not to product qualities.");
    penalty += 2;
  }

  const vaguePhraseMatches = VAGUE_OUTCOME_PHRASES.filter((p) => containsPhrase(normalized, p));
  if (vaguePhraseMatches.length > 0) {
    issues.push("Value statement describes capabilities rather than customer outcomes (e.g. 'helps you manage…').");
    suggestions.push("Reframe from product action to customer result: 'Before, they couldn't X. Now they can.' What specifically changes for them?");
    penalty += 2;
  }

  if (outcome.trim().split(/\s+/).length < 8) {
    issues.push("Value statement is too short to communicate a meaningful outcome.");
    suggestions.push("Expand to cover who benefits, from what constraint, and what they can now accomplish.");
    penalty += 1;
  }

  return { issues, suggestions, penalty };
}

// Returns the WHOLE category phrase as the highlight range when a generic keyword is found.
// Callers that previously highlighted only the matched keyword now highlight the full claim,
// which is where the strategic issue actually lives.
export function getCategoryHighlightWords(category: string): string[] {
  if (!category || !category.trim()) return [];
  const normalized = normalizeText(category);
  const hasGeneric = GENERIC_CATEGORY_KEYWORDS.some((kw) => containsWord(normalized, kw));
  return hasGeneric ? [category.trim()] : [];
}

// Returns the WHOLE differentiator phrase when any vague adjective is found.
// Highlighting only "unique" inside a long phrase obscures where the real problem is.
export function getDifferentiatorHighlightWords(text: string): string[] {
  if (!text || !text.trim()) return [];
  const normalized = normalizeText(text);
  const hasVague = VAGUE_ADJECTIVES.some((adj) => containsWord(normalized, adj));
  return hasVague ? [text.trim()] : [];
}

// Returns matched multi-word phrases that signal non-specific outcome language.
export function getOutcomeHighlightPhrases(outcome: string): string[] {
  if (!outcome) return [];
  const normalized = normalizeText(outcome);
  return VAGUE_OUTCOME_PHRASES.filter((p) => containsPhrase(normalized, p));
}

// Returns matched phrases that signal an overly broad audience description.
export function getBestFitHighlightPhrases(text: string): string[] {
  if (!text) return [];
  const normalized = normalizeText(text);
  return VAGUE_AUDIENCE_PHRASES.filter((p) => containsPhrase(normalized, p));
}

export function evaluatePositioningStrength(canvas: PositioningCanvas): PositioningStrengthResult {
  const categoryResult = evaluateCategory(canvas.market_category);
  const diffResult = evaluateDifferentiators(canvas.unique_attributes);
  const outcomeResult = evaluateOutcome(canvas.value_for_customer);

  const allIssues = [...categoryResult.issues, ...diffResult.issues, ...outcomeResult.issues];
  const allSuggestions = [
    ...categoryResult.suggestions,
    ...diffResult.suggestions,
    ...outcomeResult.suggestions,
  ];
  const totalPenalty = categoryResult.penalty + diffResult.penalty + outcomeResult.penalty;

  let level: PositioningStrengthLevel;
  if (totalPenalty === 0) {
    level = "strong";
  } else if (totalPenalty <= 2) {
    level = "moderate";
  } else if (totalPenalty <= 4) {
    level = "weak";
  } else {
    level = "generic";
  }

  // Promote to generic if any single dimension is maximally generic.
  const anyMaxGeneric =
    categoryResult.penalty >= 3 || diffResult.penalty >= 3 || outcomeResult.penalty >= 3;
  if (anyMaxGeneric && level === "weak") level = "generic";

  return { level, issues: allIssues, suggestions: allSuggestions };
}
