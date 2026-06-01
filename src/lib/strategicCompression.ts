/**
 * Strategic Compression Utilities
 *
 * Converts explanatory prose into high-density strategic language.
 * Operates at the phrase level — not the document level.
 *
 * Compression modes reflect section roles:
 *   "fragment"    — hero / signals: maximum density, copulas removed
 *   "operational" — signals / attention: operational shorthand, structure kept
 *   "structural"  — landscape: slower, sentence form preserved
 *
 * Design principles:
 *   - Conservative — only removes scaffolding that demonstrably reduces density
 *   - Deterministic — same input always produces the same output
 *   - Editorial — compression is a judgment about meaning, not string manipulation
 *
 * Why implication-first communication?
 *   "Validation stalled." carries the same content as "Validation has not materially
 *   improved." but removes the explanatory frame ("has not... improved") and places
 *   the word with actual semantic weight ("stalled") at the end of a shorter phrase.
 *   Executive readers scan for the load-bearing word — compression puts it there.
 */

export type CompressionMode = "fragment" | "operational" | "structural";

// ─── Conservative compression patterns ────────────────────────────────────────

/**
 * Ordered pairs of [pattern, replacement].
 * Applied in sequence — order matters.
 *
 * Each pattern removes a specific explanatory scaffold without losing meaning:
 * - Copulas in front of state adjectives: "is building" → "building"
 * - Completion phrases: "has not materially improved" → "stalled"
 * - Leading articles: "The X gap" → "X gap"
 * - Hedge words: "still", "currently"
 */
const FRAGMENT_PATTERNS: Array<[RegExp, string]> = [
  // Completion-state compressions
  [/\bhas not materially improved\b/gi, "stalled"],
  [/\bhasn'?t closed\b/gi, "persisting"],
  [/\bis the active constraint\b/gi, "the constraint"],
  [/\bhave not confirmed\b/gi, "unconfirmed"],

  // Copula removal before state adjectives (fragment mode only)
  [/\b(is|are)\s+(unresolved|open|persisting|stalled|building|forming|converging|holding|weakening|widening|entrenched)\b/gi, "$2"],

  // Leading article removal at start of phrase
  [/^The\s+(?=[A-Z])/i, ""],

  // Hedge removal
  [/\bstill\s+/gi, ""],
  [/\bcurrently\s+/gi, ""],

  // Em-dash clause to period
  [/\s+—\s+(this|it)\s+(needs|requires|demands)\s+/gi, ". "],

  // Trailing "in places" verbosity
  [/\s+in places\.?\s*$/gi, "."],
];

/**
 * Converts an explanatory sentence to a strategic fragment.
 * Applies FRAGMENT_PATTERNS conservatively — only removes scaffolding
 * that demonstrably reduces density without losing meaning.
 */
export function fragmentify(phrase: string): string {
  let result = phrase;
  for (const [pattern, replacement] of FRAGMENT_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  result = result.replace(/\s{2,}/g, " ").trim();
  if (result && !/[.!?]$/.test(result)) result += ".";
  return result;
}

/**
 * Compresses a phrase according to the target section's compression mode.
 * Structural mode is conservative — sentence form is preserved, only the most
 * obvious hedges stripped. Fragment mode applies full transformation.
 */
export function compress(phrase: string, mode: CompressionMode = "operational"): string {
  if (mode === "structural") {
    return phrase
      .replace(/\bstill\s+/gi, "")
      .replace(/\bcurrently\s+/gi, "")
      .trim();
  }
  return fragmentify(phrase);
}

/**
 * Returns a fragment that expresses the implication of a tension rather than
 * describing the tension itself. Used when a concept is already established
 * upstream and the downstream section should advance rather than restate.
 *
 * Examples:
 *   implicate("proof_gap")            → "Direction exposed."
 *   implicate("positioning_conflict") → "Market tension unresolved."
 *   implicate("fragmentation")        → "No clear path."
 */
export function implicate(concept: string): string {
  const map: Record<string, string> = {
    customer_proof_missing:  "Direction ahead of proof.",
    customer_proof_present:  "Proof accumulating.",
    positioning_conflict:    "Market tension unresolved.",
    fragmentation:           "No clear path.",
    proof_gap:               "Direction exposed.",
    positioning_stabilizing: "Coherence building.",
  };
  return map[concept] ?? "State unresolved.";
}
