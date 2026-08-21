// GATE S2 (2026-08-20) — deterministic business-operating-status classifier. NO model. Phrase
// rules over a signal's statement / evidence_excerpt / source_title. Conservative: anything
// ambiguous (a bare "closed", an hours note, "closed-loop") stays 'unknown'. The classifier is
// the single authority for both the populate step and the detector.

export type OperatingStatus = "open" | "temporarily_closed" | "permanently_closed" | "unknown";
export type StatusClassification = { status: OperatingStatus; matchedPhrase: string | null };

// Hours / figurative uses of "closed" that must NEVER read as a closure.
const HOURS_OR_LOOP =
  /closed[-\s]loop|closed\s+(on\s+)?(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|weekends?|holidays?|today|now\s+for|for\s+(the\s+)?(day|night|holidays?|season|lunch|renovation|repairs?|maintenance))|closed\s+\d/i;

// All-caps CLOSED as a standalone token — the Yelp/Apple listing-status convention (distinct from
// a lowercase "closed" that may be an hours note).
const TITLE_CLOSED = /(^|[\s\-–—|'"([])CLOSED([\s\-–—|'".,)\]]|$)/;

/**
 * Classify from the three text fields. Order = most specific first; a re-open signal wins (it's
 * the freshest intent), then permanently, then the title marker, then temporarily, then
 * new-management-and-closed. Everything else → unknown.
 */
export function classifyOperatingStatus(input: {
  statement?: string | null;
  evidenceExcerpt?: string | null;
  sourceTitle?: string | null;
}): StatusClassification {
  const title = input.sourceTitle ?? "";
  const body = `${input.statement ?? ""} ${input.evidenceExcerpt ?? ""}`;
  const all = `${title} ${body}`;

  if (/\b(re-?opened|reopening|now open again|back open|open again|is open again|has reopened)\b/i.test(all)) {
    return { status: "open", matchedPhrase: "reopened/open again" };
  }
  if (/permanently closed/i.test(all)) return { status: "permanently_closed", matchedPhrase: "permanently closed" };
  if (TITLE_CLOSED.test(all)) return { status: "permanently_closed", matchedPhrase: "CLOSED (listing marker)" };
  if (/temporarily closed|closed temporarily/i.test(all)) return { status: "temporarily_closed", matchedPhrase: "temporarily closed" };
  if (/under new management/i.test(all) && /\bclosed\b/i.test(all) && !HOURS_OR_LOOP.test(all)) {
    return { status: "temporarily_closed", matchedPhrase: "under new management + closed" };
  }
  // A bare, unqualified "closed" is ambiguous (hours vs shutdown) → stay unknown (conservative).
  return { status: "unknown", matchedPhrase: null };
}
