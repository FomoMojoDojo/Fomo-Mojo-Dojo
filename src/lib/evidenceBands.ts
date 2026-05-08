// Evidence bands represent the strength of evidence backing a strategic artifact.
// They are derived at render time from existing fields — no schema additions needed.

export type EvidenceBand =
  | "hypothesis_only"
  | "directional_not_validated"
  | "customer_evidenced"
  | "market_validated"
  | "proven_path"
  | "sustained_performance";

export interface UnlockItem {
  label: string;
  actionType: "restore_signal" | "upload_data" | "run_research" | "complete_step" | "none";
  actionLabel?: string;
}

export interface ArtifactUnlockConditions {
  currentBand: EvidenceBand;
  currentBandLabel: string;
  currentStateDescription: string;
  nextBand: EvidenceBand | null;
  nextBandLabel: string | null;
  missingItems: UnlockItem[];
  restoreItems: UnlockItem[];
  unlockItems: UnlockItem[];
}

export const BAND_LABELS: Record<EvidenceBand, string> = {
  hypothesis_only:          "Hypothesis Only",
  directional_not_validated:"Directional · Not Validated",
  customer_evidenced:       "Customer-Evidenced",
  market_validated:         "Market-Validated",
  proven_path:              "Proven Path",
  sustained_performance:    "Sustained Performance",
};

const BAND_PROGRESSION: EvidenceBand[] = [
  "hypothesis_only",
  "directional_not_validated",
  "customer_evidenced",
  "market_validated",
  "proven_path",
  "sustained_performance",
];

function nextBandFor(band: EvidenceBand): EvidenceBand | null {
  const idx = BAND_PROGRESSION.indexOf(band);
  return idx >= 0 && idx < BAND_PROGRESSION.length - 1 ? BAND_PROGRESSION[idx + 1] : null;
}

// ── Route band derivation ──────────────────────────────────────────────────────

export interface RouteEvidenceInputs {
  supportingEvidenceCount: number;
  missingEvidenceCount: number;
  customerOppCount: number;
  isDerived: boolean;
}

function routeBand({ supportingEvidenceCount, missingEvidenceCount, customerOppCount, isDerived }: RouteEvidenceInputs): EvidenceBand {
  const total = supportingEvidenceCount + missingEvidenceCount;
  if (total === 0 || (isDerived && supportingEvidenceCount === 0)) return "hypothesis_only";
  if (supportingEvidenceCount === 0) return "directional_not_validated";
  if (customerOppCount === 0 && missingEvidenceCount > supportingEvidenceCount) return "directional_not_validated";
  if (customerOppCount === 0) return "customer_evidenced";
  if (missingEvidenceCount === 0 && customerOppCount > 0) return "market_validated";
  return "customer_evidenced";
}

const ROUTE_STATE_DESCRIPTIONS: Record<EvidenceBand, string> = {
  hypothesis_only:          "Route is inferred from strategy — no evidence yet links it to customer outcomes.",
  directional_not_validated:"Route direction is plausible but lacks customer signal backing.",
  customer_evidenced:       "Some customer evidence backs this route.",
  market_validated:         "Market evidence supports this route — no critical gaps remain.",
  proven_path:              "Route has company evidence and steps in progress.",
  sustained_performance:    "Route is fully validated with tracked outcomes.",
};

function routeUnlockItems(
  band: EvidenceBand,
  inputs: RouteEvidenceInputs,
  hasExclusions: boolean,
): Pick<ArtifactUnlockConditions, "missingItems" | "restoreItems" | "unlockItems"> {
  const m: UnlockItem[] = [];
  const r: UnlockItem[] = [];
  const u: UnlockItem[] = [];

  if (band === "hypothesis_only") {
    m.push({ label: "Evidence items that confirm customer demand for this capability", actionType: "none" });
    if (hasExclusions) r.push({ label: "Restore excluded outside signals that informed this route", actionType: "restore_signal", actionLabel: "Restore signals" });
    u.push({ label: "Add evidence items with confirmed or in-progress status", actionType: "upload_data" });
    u.push({ label: "Link this route to customer-validated needs", actionType: "none" });
  } else if (band === "directional_not_validated") {
    if (inputs.customerOppCount === 0) m.push({ label: "Customer research signals linking this route to validated needs", actionType: "none" });
    if (inputs.missingEvidenceCount > 0) m.push({ label: `${inputs.missingEvidenceCount} evidence item${inputs.missingEvidenceCount !== 1 ? "s" : ""} flagged as needing attention`, actionType: "none" });
    if (hasExclusions) r.push({ label: "Restore excluded outside signals to strengthen evidence", actionType: "restore_signal", actionLabel: "Restore signals" });
    u.push({ label: "Link this route to customer-validated needs to reach Customer-Evidenced", actionType: "none" });
  } else if (band === "customer_evidenced") {
    m.push({ label: "Market-level validation or competitive proof points", actionType: "none" });
    u.push({ label: "Add market comparison evidence or competitive signals", actionType: "run_research" });
    if (inputs.missingEvidenceCount > 0) u.push({ label: "Resolve flagged evidence gaps to reach Market-Validated", actionType: "complete_step" });
  } else if (band === "market_validated") {
    m.push({ label: "Implementation steps completed or in progress", actionType: "none" });
    u.push({ label: "Complete route steps to build implementation confidence", actionType: "complete_step" });
  } else if (band === "proven_path") {
    u.push({ label: "Track and record outcomes against this route's intended impact", actionType: "none" });
  }

  return { missingItems: m, restoreItems: r, unlockItems: u };
}

// ── Need band derivation ───────────────────────────────────────────────────────

export interface NeedEvidenceInputs {
  sourcePath: string | null | undefined;
  importance: number;
  satisfaction: number;
  serviceState: string | null | undefined;
}

function needBand({ sourcePath, importance, serviceState }: NeedEvidenceInputs): EvidenceBand {
  const sp = String(sourcePath ?? "").toLowerCase();
  const state = String(serviceState ?? "").toLowerCase();

  if (!sp) return "hypothesis_only";

  if (sp.includes("interview") || sp.includes("survey") || sp.includes("primary")) {
    return importance >= 6 ? "customer_evidenced" : "market_validated";
  }
  if (state === "overserved" && importance < 5) return "market_validated";
  if (sp.includes("public") || sp.includes("baseline") || sp.includes("benchmark")) return "directional_not_validated";
  if (sp.includes("upload") || sp.includes("org") || sp.includes("company")) return "customer_evidenced";
  return "directional_not_validated";
}

const NEED_STATE_DESCRIPTIONS: Record<EvidenceBand, string> = {
  hypothesis_only:          "This need is inferred — no customer data confirms its importance.",
  directional_not_validated:"Importance and satisfaction estimates are early — limited data points.",
  customer_evidenced:       "Customer data backs this need — sample size may be limited.",
  market_validated:         "Need is validated across the market.",
  proven_path:              "Company-confirmed customer need.",
  sustained_performance:    "Validated need with tracked outcome improvement.",
};

function needUnlockItems(
  band: EvidenceBand,
  inputs: NeedEvidenceInputs,
  hasExclusions: boolean,
): Pick<ArtifactUnlockConditions, "missingItems" | "restoreItems" | "unlockItems"> {
  const m: UnlockItem[] = [];
  const r: UnlockItem[] = [];
  const u: UnlockItem[] = [];

  if (band === "hypothesis_only") {
    m.push({ label: "Any customer or market signals confirming this need exists", actionType: "none" });
    u.push({ label: "Add customer interview data to validate this need", actionType: "run_research" });
    u.push({ label: "Run a baseline to generate initial market signals", actionType: "run_research" });
  } else if (band === "directional_not_validated") {
    m.push({ label: "Primary customer research signals for this specific need", actionType: "none" });
    if (inputs.importance > 7) m.push({ label: "Additional interviews to confirm high-importance rating", actionType: "none" });
    if (hasExclusions) r.push({ label: "Restore any excluded outside signals related to this need area", actionType: "restore_signal", actionLabel: "Restore signals" });
    u.push({ label: "Validate with additional customer interviews to reach Customer-Evidenced", actionType: "run_research" });
  } else if (band === "customer_evidenced") {
    m.push({ label: "Market-wide validation of this need across a broader sample", actionType: "none" });
    u.push({ label: "Expand interview pool or add market-wide benchmark data", actionType: "run_research" });
  } else if (band === "market_validated") {
    m.push({ label: "Company-specific confirmation this need applies to your customers", actionType: "none" });
    u.push({ label: "Add internal evidence or compare to your customer segment", actionType: "upload_data" });
  } else if (band === "proven_path") {
    u.push({ label: "Track outcomes after addressing this need to reach Sustained Performance", actionType: "none" });
  }

  return { missingItems: m, restoreItems: r, unlockItems: u };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function computeRouteUnlockConditions(
  inputs: RouteEvidenceInputs,
  hasExclusions: boolean,
): ArtifactUnlockConditions {
  const band = routeBand(inputs);
  const next = nextBandFor(band);
  const items = routeUnlockItems(band, inputs, hasExclusions);
  return {
    currentBand: band,
    currentBandLabel: BAND_LABELS[band],
    currentStateDescription: ROUTE_STATE_DESCRIPTIONS[band],
    nextBand: next,
    nextBandLabel: next ? BAND_LABELS[next] : null,
    ...items,
  };
}

export function computeNeedUnlockConditions(
  inputs: NeedEvidenceInputs,
  hasExclusions: boolean,
): ArtifactUnlockConditions {
  const band = needBand(inputs);
  const next = nextBandFor(band);
  const items = needUnlockItems(band, inputs, hasExclusions);
  return {
    currentBand: band,
    currentBandLabel: BAND_LABELS[band],
    currentStateDescription: NEED_STATE_DESCRIPTIONS[band],
    nextBand: next,
    nextBandLabel: next ? BAND_LABELS[next] : null,
    ...items,
  };
}

// ── Evidence-layer band derivation for scoring ────────────────────────────────
// v1 proxy: customer layer requires actual interview/survey source paths.
// TODO: Replace isPrimaryNeedsSourcePath with typed evidence_signals in v2 once
//       odi_needs.source_path is superseded by a typed evidence_signals relation.

const NON_PRIMARY_MARKERS = ["public", "baseline", "benchmark", "generated", "research-company", "uploaded_file", "social"];
const PRIMARY_MARKERS = ["interview", "survey", "primary", "qualitative", "focus-group"];

export function isPrimaryNeedsSourcePath(sourcePath: string | null | undefined): boolean {
  const s = String(sourcePath ?? "").toLowerCase();
  if (!s) return false;
  if (NON_PRIMARY_MARKERS.some((m) => s.includes(m))) return false;
  return PRIMARY_MARKERS.some((m) => s.includes(m));
}

export interface EvidenceLayerProfile {
  outside: { present: boolean; strength: number };    // public baseline signals, 0–1
  org: { present: boolean; strength: number };        // uploaded/generated artifacts, 0–1
  customer: { present: boolean; strength: number };   // primary research only, 0–1
  measurement: { present: boolean; strength: number }; // v1 proxy: high ledger density, 0–1
}

export function computeEvidenceBand(profile: EvidenceLayerProfile): EvidenceBand {
  const { outside, org, customer, measurement } = profile;

  if (outside.present && org.present && customer.present && measurement.present
    && outside.strength >= 0.5 && org.strength >= 0.5 && customer.strength >= 0.5) {
    return "sustained_performance";
  }

  if (customer.present && measurement.present && (org.present || outside.present)) {
    return "proven_path";
  }

  if (customer.present && (outside.present || org.strength >= 0.5)) {
    return "market_validated";
  }

  if (customer.present || org.strength >= 0.5) {
    return "customer_evidenced";
  }

  if (outside.present || org.present) {
    return "directional_not_validated";
  }

  return "hypothesis_only";
}

// Max delta points Reachable (potential_score) can be above Current per evidence band.
export const BAND_REACHABLE_CAP: Record<EvidenceBand, number> = {
  hypothesis_only: 5,
  directional_not_validated: 12,
  customer_evidenced: 18,
  market_validated: 22,
  proven_path: 22,
  sustained_performance: 22,
};

// Max delta points Unlockable (projected_score) can be above Current per evidence band.
export const BAND_UNLOCKABLE_CAP: Record<EvidenceBand, number> = {
  hypothesis_only: 10,
  directional_not_validated: 22,
  customer_evidenced: 32,
  market_validated: 38,
  proven_path: 42,
  sustained_performance: 42,
};

// ── Banner-level unlock summary (one per affected artifact) ───────────────────

export interface ArtifactUnlockSummary {
  artifact: string;
  bandLabel: string;
  topAction: string;
}

function bannerBandFromStatus(
  evidenceStatus: string | null | undefined,
  hasCompanyEvidence: boolean,
): EvidenceBand {
  const s = String(evidenceStatus ?? "").toLowerCase();
  if (!s || s === "no_public_evidence") return "hypothesis_only";
  if (s.includes("emerging") || s.includes("public_evidence_thin")) return "directional_not_validated";
  if (s.includes("public_evidence_partial")) return "customer_evidenced";
  if (s.includes("public_evidence_strong")) return "market_validated";
  if (s.includes("baseline_plus_artifacts") && hasCompanyEvidence) return "proven_path";
  if (s.includes("baseline_plus_artifacts")) return "market_validated";
  return "directional_not_validated";
}

const BANNER_TOP_ACTIONS: Record<string, Record<EvidenceBand, (hasExclusions: boolean) => string>> = {
  Positioning: {
    hypothesis_only:          () => "Run a market signals baseline to generate initial evidence",
    directional_not_validated:(x) => x ? "Restore excluded outside signals" : "Add primary customer research",
    customer_evidenced:       () => "Add competitive signals or market comparables",
    market_validated:         () => "Add company-specific evidence",
    proven_path:              () => "Track positioning outcomes",
    sustained_performance:    () => "Maintain signal freshness",
  },
  Strategy: {
    hypothesis_only:          () => "Run a baseline to generate strategy inputs",
    directional_not_validated:(x) => x ? "Restore excluded signals to refresh inputs" : "Add customer evidence",
    customer_evidenced:       () => "Add market-wide validation",
    market_validated:         () => "Align with internal evidence or OKRs",
    proven_path:              () => "Track strategy outcomes",
    sustained_performance:    () => "Maintain signal freshness",
  },
  Needs: {
    hypothesis_only:          () => "Add customer interview data",
    directional_not_validated:(x) => x ? "Restore excluded needs signals" : "Run additional customer interviews",
    customer_evidenced:       () => "Expand interview pool",
    market_validated:         () => "Confirm against your customer segment",
    proven_path:              () => "Track need resolution",
    sustained_performance:    () => "Maintain research cadence",
  },
  Routes: {
    hypothesis_only:          () => "Add evidence items to validate routes",
    directional_not_validated:(x) => x ? "Restore excluded signals affecting route evidence" : "Link routes to customer-validated needs",
    customer_evidenced:       () => "Add market comparison signals",
    market_validated:         () => "Complete route steps",
    proven_path:              () => "Track implementation outcomes",
    sustained_performance:    () => "Maintain implementation cadence",
  },
};

export function computeArtifactUnlockSummary(
  artifact: string,
  evidenceStatus: string | null | undefined,
  hasCompanyEvidence: boolean,
  hasExclusions: boolean,
): ArtifactUnlockSummary {
  const band = bannerBandFromStatus(evidenceStatus, hasCompanyEvidence);
  const actions = BANNER_TOP_ACTIONS[artifact] ?? BANNER_TOP_ACTIONS.Positioning;
  const topAction = actions[band]?.(hasExclusions) ?? "Add more evidence to strengthen this area";
  return { artifact, bandLabel: BAND_LABELS[band], topAction };
}
