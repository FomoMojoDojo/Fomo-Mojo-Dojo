// Single source of truth for: (1) whether a need's served/underserved/overserved
// verdict is EARNED, (2) the honest certainty rung a need shows, and (3) the
// best-guess value band that replaces the verdict until a survey backs it.
//
// Council law (operator-signed): underserved/served/overserved is a SURVEY verdict —
// only a real ODI survey earns it. No client has run a survey yet, so the verdict
// must not appear in ANY form (word, role label, narrative sentence, dot color)
// until survey provenance exists. What replaces it is NOT blank: needs stay ranked
// by a best-guess of value, shown as a High/Medium/Low band.

type ProvenanceShape = { provenance_type?: string | null };
type VerdictShape = ProvenanceShape & { service_state?: string | null };

// Provenance values whose needs were validated by a real ODI survey. EMPTY today —
// gains "odi_survey" (etc.) when survey provenance lands. NOT hardcoded false: this is
// a genuine provenance membership test, so the survey path re-enables the verdict.
const SURVEY_VALIDATED_PROVENANCE = new Set<string>([
  // "odi_survey",  // ← uncomment when real ODI-survey provenance is written (DECL-OPP-A2+)
]);

/**
 * True only when this need's served/underserved/overserved verdict is backed by a
 * real survey. Keyed on provenance, never on parsing service_state strings (which
 * carry legacy spellings on some fixtures). False for every current provenance_type.
 */
export function isSurveyValidated(need: ProvenanceShape | null | undefined): boolean {
  const p = String(need?.provenance_type ?? "").toLowerCase();
  return SURVEY_VALIDATED_PROVENANCE.has(p);
}

// ─── Certainty rung (replaces the source_path/frameworks string sniffing) ───────────

export type CertaintyRung =
  | "survey_validated" // real ODI survey (none yet)
  | "research_backed" // the company's own curated/interview evidence
  | "outside_signals" // public/market research only
  | "declared" // declared hypothesis (reserved — DECL-OPP-A2)
  | "unknown";

/** The honest certainty rung from provenance_type alone. */
export function certaintyRung(need: ProvenanceShape | null | undefined): CertaintyRung {
  const p = String(need?.provenance_type ?? "").toLowerCase();
  if (p === "odi_survey") return "survey_validated";
  if (p === "manual") return "research_backed";
  if (p === "public_research" || p === "framework_adjudicated") return "outside_signals";
  if (p === "internal_declared") return "declared";
  return "unknown";
}

/**
 * The certainty label to show, or null when there's nothing honest to assert yet
 * (declared rung gets its chip in DECL-OPP-A2; unknown shows nothing).
 */
export function certaintyLabel(rung: CertaintyRung): string | null {
  switch (rung) {
    case "survey_validated":
      return "Customer confirmed";
    case "research_backed":
      return "Backed by your research";
    case "outside_signals":
      return "From outside signals";
    case "declared":
      return "Starting hypothesis";
    case "unknown":
    default:
      return null;
  }
}

export function needCertaintyLabel(need: ProvenanceShape | null | undefined): string | null {
  return certaintyLabel(certaintyRung(need));
}

// ─── Best-guess value band (presentation of opportunity_score as a hypothesis) ──────

export type BestGuessBand = "High" | "Medium" | "Low";

/** High ≥ 10 / Medium 5–9 / Low < 5, off the existing opportunity_score ordering. */
export function bestGuessBand(opportunityScore: number | null | undefined): BestGuessBand {
  const s = opportunityScore ?? 0;
  if (s >= 10) return "High";
  if (s >= 5) return "Medium";
  return "Low";
}

/**
 * Operator-signed wording for the best-guess value band: "Potential <H/M/L> Value".
 * Single-sourced through bestGuessBand() (which stays High/Medium/Low for the
 * distribution logic) so the label can't drift from the band.
 */
export function bestGuessBandLabel(opportunityScore: number | null | undefined): string {
  return `Potential ${bestGuessBand(opportunityScore)} Value`;
}

// Declared opportunities carry their value in `confidence` (0–1, the A2 judge band:
// High 0.95 / Med 0.66 / Low 0.33) and leave opportunity_score empty. Ladder mirrors
// those write values: High ≥0.66 / Medium ≥0.33 / Low. Cannot share the opportunity_
// score thresholds (different scale — 0.95 would read "Low" there).
export function bestGuessBandFromConfidence(confidence: number | null | undefined): BestGuessBand {
  const c = confidence ?? 0;
  if (c >= 0.66) return "High";
  if (c >= 0.33) return "Medium";
  return "Low";
}

type NeedBandShape = ProvenanceShape & { confidence?: number | null; opportunity_score?: number | null };

// The displayed band for a need — the single source for both the label and the sort.
// Declared rows read `confidence` (their opportunity_score is empty); everything else
// reads opportunity_score.
export function needBestGuessBand(need: NeedBandShape | null | undefined): BestGuessBand {
  if (certaintyRung(need) === "declared" && need?.confidence != null) {
    return bestGuessBandFromConfidence(need.confidence);
  }
  return bestGuessBand(need?.opportunity_score);
}

export function needBestGuessBandLabel(need: NeedBandShape | null | undefined): string {
  return `Potential ${needBestGuessBand(need)} Value`;
}

// Mixed-provenance ranking. The displayed band tier is the honest common axis
// (declared and public_research share it), so declared rows rank by their real band
// instead of sinking on opportunity_score=0. Within a TIED band, evidence-derived
// rows (public_research, by opportunity_score gap) precede declared HYPOTHESES — an
// unvalidated hypothesis ranks at the tail of its band, never above an evidenced row
// of the same band. (Declared confidence is uniform per A2-1's honest-High judge, so
// true value-interleaving inside a band isn't possible; tier is the meaningful axis.)
const BAND_RANK: Record<BestGuessBand, number> = { High: 3, Medium: 2, Low: 1 };
export function needValueSortKey(need: NeedBandShape | null | undefined): { tier: number; declaredPenalty: number; secondary: number } {
  const tier = BAND_RANK[needBestGuessBand(need)];
  const isDeclared = certaintyRung(need) === "declared";
  return {
    tier,
    declaredPenalty: isDeclared ? 1 : 0, // within a tied tier, evidence before hypothesis
    secondary: isDeclared && need?.confidence != null ? Number(need.confidence) : Number(need?.opportunity_score ?? 0),
  };
}

// Comparator for mixed declared + public_research lists (use in Array.sort): band tier
// desc, then native signal desc. Pass a tiebreak (e.g. importance, id) as needed.
export function compareNeedsByValue(a: NeedBandShape, b: NeedBandShape): number {
  const ka = needValueSortKey(a);
  const kb = needValueSortKey(b);
  if (kb.tier !== ka.tier) return kb.tier - ka.tier;            // higher band first
  if (ka.declaredPenalty !== kb.declaredPenalty) return ka.declaredPenalty - kb.declaredPenalty; // evidence before hypothesis
  return kb.secondary - ka.secondary;                            // stronger native signal first
}

// ─── The verdict word, gated ────────────────────────────────────────────────────────

/**
 * The served/underserved/overserved verdict word (Title-cased, legacy spellings
 * normalized), or null until a survey earns it. Every display site renders the word
 * ONLY via this function, so the verdict clears everywhere at once.
 */
export function serviceVerdictWord(need: VerdictShape | null | undefined): string | null {
  if (!isSurveyValidated(need)) return null;
  const s = String(need?.service_state ?? "").toLowerCase();
  if (s === "underserved" || s === "under_served") return "Underserved";
  if (s === "overserved" || s === "over_served") return "Overserved";
  if (s === "served" || s === "appropriately_served") return "Served";
  return null;
}
