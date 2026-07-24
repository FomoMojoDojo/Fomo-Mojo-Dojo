// V2-5b — Act 3 Message-band admission guard (the render IS the guard, per V2-5).
//
// The provenance writer (deriveClaimProvenance) mislabels analytic mojo_analysis reads as
// public_observed, so the register alone isn't enough at the client boundary. Two more
// data-borne exclusions run here so the Message band shows ONLY how the world describes
// the company, in its words — never our analysis, never a framework name:
//   1. FRAMEWORK TOKENS (FR-ATTR law) — a claim whose text carries ODI / JTBD / etc. is a
//      framework leak on a client surface; excluded.
//   2. ANALYTIC VOICE — our recommendation/assessment phrasing ("the organization needs
//      to…", "analysis suggests…") is not the outside's voice; excluded.
// Excluded rows are reported (excludedPerception) so upstream mislabels get fixed too.

// FR-ATTR framework tokens — proprietary/method names that must never reach a client band.
const FRAMEWORK_TOKENS: RegExp[] = [
  /\bODI\b/i,
  /\bJTBD\b/i,
  /jobs[-\s]to[-\s]be[-\s]done/i,
  /outcome[-\s]driven\s+innovation/i,
];

// Analytic-voice patterns — OUR assessment/recommendation, not the outside describing them.
const ANALYTIC_PATTERNS: RegExp[] = [
  /the organization needs to/i,
  /operational challenges inherent to/i,
  /\banalysis suggests\b/i,
  /without (direct )?customer validation/i,
  /product claims without/i,
  /lacks? (concrete|robust|external) validation/i,
];

export function containsFrameworkToken(text: string | null | undefined): boolean {
  const s = typeof text === "string" ? text : "";
  return FRAMEWORK_TOKENS.some((re) => re.test(s));
}

export function isAnalyticVoice(text: string | null | undefined): boolean {
  const s = typeof text === "string" ? text : "";
  return ANALYTIC_PATTERNS.some((re) => re.test(s));
}

/** May this claim text render on the Act 3 Message band? A framework token or an analytic
 *  voice blocks it (→ honest exclusion). Plain public description passes. */
export function admitPublicPerception(text: string | null | undefined): boolean {
  const s = (typeof text === "string" ? text : "").trim();
  if (!s) return false;
  if (containsFrameworkToken(s)) return false;
  if (isAnalyticVoice(s)) return false;
  return true;
}

/** Partition a list of perception texts into admitted vs excluded (with the reason),
 *  so a surface can render the admitted and REPORT the excluded for upstream fixing. */
export function splitPerception<T>(items: T[], getText: (t: T) => string): { admitted: T[]; excluded: Array<{ item: T; reason: "framework_token" | "analytic_voice" }> } {
  const admitted: T[] = [];
  const excluded: Array<{ item: T; reason: "framework_token" | "analytic_voice" }> = [];
  for (const it of items) {
    const text = getText(it);
    if (containsFrameworkToken(text)) excluded.push({ item: it, reason: "framework_token" });
    else if (isAnalyticVoice(text)) excluded.push({ item: it, reason: "analytic_voice" });
    else admitted.push(it);
  }
  return { admitted, excluded };
}
