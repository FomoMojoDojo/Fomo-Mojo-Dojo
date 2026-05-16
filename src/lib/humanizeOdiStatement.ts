/**
 * Converts ODI canonical sentence format to plain English for client-facing display.
 *
 * ODI sentences follow structured formulas ("Minimize the time to X when Y") that
 * read as survey-instrument language. This module restructures them into the "smart
 * friend" voice — direct, slightly informal, zero jargon.
 *
 * Constraints:
 *   - If the original has a "when [context]" clause, the output MUST keep both beats:
 *     Beat 1 = "when this is happening", Beat 2 = "this is the problem"
 *   - If no "when" clause, a single-beat restructuring is fine
 *   - Uses "your" where the context is a client-owned activity
 *   - Falls back to gerund-only fix for unrecognized patterns
 *
 * The stored canonical value is NEVER modified — display-only transform.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function toGerund(verb: string): string {
  const v = verb.toLowerCase();
  if (v.endsWith("ie")) return v.slice(0, -2) + "ying";
  // Drop trailing 'e' unless it follows 'e' or 'o' (see→seeing, toe→toeing)
  if (v.endsWith("e") && !v.endsWith("ee") && !v.endsWith("oe")) return v.slice(0, -1) + "ing";
  return v + "ing";
}

/**
 * Converts the leading verb to gerund form ONLY if the phrase starts with an
 * uppercase letter — the signal that an ODI formula injected a bare infinitive verb
 * (e.g. "Identify main competitors…"). Lowercase phrases (articles, nouns, existing
 * gerunds) are passed through unchanged.
 */
function gerundifyContext(phrase: string): string {
  const words = phrase.trim().split(/\s+/);
  if (words.length === 0 || !/^[A-Z]/.test(words[0])) return phrase;
  return [toGerund(words[0]), ...words.slice(1)].join(" ");
}

// ─── Known step-label replacements ───────────────────────────────────────────
// Maps gerundified ODI-injected step labels to client-friendly "your X" phrases.
// Applied AFTER gerundifyContext so we match the lowercase gerund form.

const STEP_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  {
    // matches "identify" / "Identify" / "identifying" + rest of step label
    pattern: /\bidentif(?:y|ying|ied) main competitors in specialty coffee\b/gi,
    replacement: "your competitor research",
  },
  {
    pattern: /customer-facing drink quality/gi,
    replacement: "drink quality",
  },
  {
    pattern: /the roaster transitions to a new season'?s? origin beans/gi,
    replacement: "switching to new seasonal beans",
  },
];

function applyStepReplacements(s: string): string {
  let result = s;
  for (const { pattern, replacement } of STEP_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

function resolveContext(raw: string): string {
  return applyStepReplacements(gerundifyContext(raw));
}

// ─── Pattern matchers ─────────────────────────────────────────────────────────

type MatchResult = string | null;

/**
 * "Minimize/Reduce the time [to|it takes to] [action] when [context] is not [producing/working/…]"
 *
 * Two-beat output: "When [context] isn't working, it takes too long to [action]"
 */
function matchTimeWhenNotWorking(s: string): MatchResult {
  const m = s.match(
    /^(?:minimize|reduce) the time (?:to|it takes to) (.+?) when (.+?) (?:is|are) not (?:producing|giving|delivering|working|functioning)\b.*$/i,
  );
  if (!m) return null;
  const action = m[1].trim().toLowerCase();
  const context = resolveContext(m[2].trim());
  return `When ${context} isn't working, it takes too long to ${action}`;
}

/**
 * "Minimize/Reduce the time [to|it takes to] [action] when [context]"
 *
 * Two-beat output: "When [context], it takes too long to [action]"
 */
function matchTimeWhen(s: string): MatchResult {
  const m = s.match(
    /^(?:minimize|reduce) the time (?:to|it takes to) (.+?) when (.+?)\.?$/i,
  );
  if (!m) return null;
  const action = m[1].trim().toLowerCase();
  const context = resolveContext(m[2].trim());
  return `When ${context}, it takes too long to ${action}`;
}

/**
 * "Minimize/Reduce the time [to|it takes to] [action]" (no when clause)
 *
 * Single-beat output: "It takes too long to [action]"
 */
function matchTimeOnly(s: string): MatchResult {
  const m = s.match(
    /^(?:minimize|reduce) the time (?:to|it takes to) (.+?)\.?$/i,
  );
  if (!m) return null;
  return `It takes too long to ${m[1].trim().toLowerCase()}`;
}

/**
 * "Minimize the effort [required|needed] to [action]"
 *
 * Output: "It takes too much effort to [action]"
 */
function matchEffort(s: string): MatchResult {
  const m = s.match(/^(?:minimize|reduce) the effort (?:required|needed) to (.+?)\.?$/i);
  if (!m) return null;
  return `It takes too much effort to ${m[1].trim().toLowerCase()}`;
}

/**
 * "Minimize variation in [noun phrase]"
 *
 * Output: "[Noun phrase] is inconsistent"
 */
function matchVariation(s: string): MatchResult {
  const m = s.match(/^minimize variation in (.+?)\.?$/i);
  if (!m) return null;
  return cap(`${m[1].trim()} is inconsistent`);
}

/**
 * "Increase confidence [that|in] [statement]"
 *
 * Output: "You need more confidence that [statement]"
 */
function matchConfidence(s: string): MatchResult {
  const m = s.match(/^increase confidence (?:that|in) (.+?)\.?$/i);
  if (!m) return null;
  const stmt = applyStepReplacements(m[1].trim().toLowerCase());
  return `You need more confidence that ${stmt}`;
}

/**
 * "Increase the likelihood that [outcome] when [context]"
 *
 * Two-beat output: "When [context], [outcome] should happen more reliably"
 */
function matchLikelihood(s: string): MatchResult {
  const m = s.match(/^increase the likelihood that (.+?) when (.+?)\.?$/i);
  if (!m) return null;
  const context = resolveContext(m[2].trim());
  const outcome = applyStepReplacements(m[1].trim().toLowerCase());
  return `When ${context}, ${outcome} should happen more reliably`;
}

/**
 * "Minimize the disruption/risk/chance [to|of] [X] when [context]"
 *
 * Two-beat output: "When [context], it's hard to protect [X]"
 */
function matchDisruptionWhen(s: string): MatchResult {
  const m = s.match(
    /^minimize the (?:disruption|risk|chance) (?:to|of) (.+?) when (.+?)\.?$/i,
  );
  if (!m) return null;
  const target = applyStepReplacements(m[1].trim().toLowerCase());
  const context = resolveContext(m[2].trim());
  return `When ${context}, it's hard to protect ${target}`;
}

/**
 * "Minimize the disruption/risk/chance [to|of] [X]" (no when clause)
 *
 * Output: "It's hard to protect [X]"
 */
function matchDisruptionOnly(s: string): MatchResult {
  const m = s.match(
    /^minimize the (?:disruption|risk|chance) (?:to|of) (.+?)\.?$/i,
  );
  if (!m) return null;
  const target = applyStepReplacements(m[1].trim().toLowerCase());
  return `It's hard to protect ${target}`;
}

/**
 * Fallback: fix "when [CapitalizedVerb]" → "when [verb]ing" without restructuring.
 * Covers unrecognized patterns that still have the ODI verb-injection problem.
 */
function gerundOnlyFallback(s: string): string {
  return s.replace(/\bwhen ([A-Z][a-z]+)\b/g, (_, verb) => `when ${toGerund(verb)}`);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function humanizeOdiStatement(statement: string): string {
  if (!statement || !statement.trim()) return statement;
  const s = statement.trim();

  return (
    matchTimeWhenNotWorking(s) ??
    matchTimeWhen(s) ??
    matchTimeOnly(s) ??
    matchEffort(s) ??
    matchVariation(s) ??
    matchConfidence(s) ??
    matchLikelihood(s) ??
    matchDisruptionWhen(s) ??
    matchDisruptionOnly(s) ??
    gerundOnlyFallback(s)
  );
}
