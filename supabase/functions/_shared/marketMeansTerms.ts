// ── The market goal-not-means deterministic guard (operator ruling R3, 2026-09-22) ─────────────────
//
// "A job statement names what the executor is trying to get done, in the executor's own words. It never
// names a provider, program, service line, facility, treatment setting, or category of supplier the
// executor would shop for."
//
// The model layers (GEN_SYSTEM's rule sentence, the v3 solution-agnostic judge) carry the whole rule; this
// file carries only the terms a machine can decide without a judge, so a candidate naming one is rejected
// BEFORE any judge call is spent on it. Mirrors generate-reference-jobmap/rules.ts, which is the precedent
// for the three-layer shape and for scoping the deterministic list to ONE guard.
//
// SCOPE: this list polices market discovery ONLY. _shared/jtbdProcess.ts (which polices
// local-jobmap-synthesis, research-company subtitles and the workshop panels) is deliberately unchanged —
// the operator kept those writers as they are.
//
// The prompt's never-use list is WIDER than this one on purpose: program, service(s), therapy,
// organization(s) that provide and the rest are legitimate goal words in other executors' worlds
// ("finding a therapy that fits", a school's own programs), so they stay with the model layers where
// context can be read. Only the six below are means in every reading a market statement can give them.

/** The deterministic means terms — whole word (singular or plural) / whole phrase, any case. */
export const MARKET_MEANS_TERMS = [
  "continuum of care",
  "residential treatment",
  "outpatient",
  "inpatient",
  "provider",
  "clinic",
] as const;

export type MarketMeansTerm = (typeof MARKET_MEANS_TERMS)[number];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
 * RULING C (operator, 2026-09-22). The six entries are unchanged; the MATCHING now covers the plural
 * of each single-word term — provider/providers, clinic/clinics, outpatient/outpatients,
 * inpatient/inpatients. "We compared the providers in town" names a means exactly as its singular
 * does, and before this it reached the model layers instead of being refused before a judge was spent.
 *
 * The two PHRASES are unchanged and match whole: "continuum of care" and "residential treatment" have
 * no plural a market statement uses.
 *
 * \b…\b still does the near-miss work, and the optional `s` cannot widen it: "provided",
 * "providing", "clinical" and "clinicians" all continue with a word character where the pattern
 * requires a boundary, so none of them can ever hit.
 */
const termSource = (term: string) => escapeRe(term) + (term.includes(" ") ? "" : "s?");
const termPattern = (term: string) => new RegExp(`\\b${termSource(term)}\\b`, "i");
const ANY_PATTERN = new RegExp(`\\b(${MARKET_MEANS_TERMS.map(termSource).join("|")})\\b`, "i");

/** True when the text names one of the deterministic means terms (whole word/phrase, any case). */
export function containsMarketMeansTerm(value: string | null | undefined): boolean {
  return ANY_PATTERN.test(String(value ?? ""));
}

/** Every term the text names, in list order — the generator's rejection feedback. */
export function marketMeansHits(value: string | null | undefined): MarketMeansTerm[] {
  const text = String(value ?? "");
  return MARKET_MEANS_TERMS.filter((t) => termPattern(t).test(text));
}

export type MarketCandidateText = { job_executor: string; jtbd: string };

/** The candidates that trip the guard, with the tripped terms. Executor and job are judged together —
 *  a means named on either side is the same failure. */
export function marketMeansViolations(
  candidates: ReadonlyArray<MarketCandidateText>,
): Array<{ job_executor: string; terms: MarketMeansTerm[] }> {
  const out: Array<{ job_executor: string; terms: MarketMeansTerm[] }> = [];
  for (const c of candidates) {
    const terms = marketMeansHits(`${c.job_executor ?? ""} ${c.jtbd ?? ""}`);
    if (terms.length) out.push({ job_executor: c.job_executor, terms });
  }
  return out;
}

/** The rejection reason a deterministic hit carries — the signed shape "names a means: <term>". */
export function marketMeansReason(terms: readonly MarketMeansTerm[]): string {
  return `names a means: ${terms.join(", ")}`;
}
