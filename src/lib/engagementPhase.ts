// ── Canonical 8-state engagement phase model ──────────────────────────────────
//
// Progression:
//   outside_signals → validate_outside → diagnose → validate_diagnose
//   → focus → validate_focus → flow → validate_flow
//
// Validate checkpoints are transition gates between main phases, not peers.
// Each checkpoint has a distinct purpose and content profile.

export type MainPhase =
  | "outside_signals"
  | "diagnose"
  | "focus"
  | "flow";

export type ValidateCheckpoint =
  | "validate_outside"    // gateway: outside_signals → diagnose (initial client meeting)
  | "validate_diagnose"   // gateway: diagnose → focus (working hypotheses session)
  | "validate_focus"      // gateway: focus → flow (chosen path confirmation)
  | "validate_flow";      // reflection: flow measurement + habit questions

export type EngagementPhase = MainPhase | ValidateCheckpoint;

// Ordered linear progression — canonical phase sequence.
export const PHASE_ORDER: EngagementPhase[] = [
  "outside_signals",
  "validate_outside",
  "diagnose",
  "validate_diagnose",
  "focus",
  "validate_focus",
  "flow",
  "validate_flow",
];

export type NarrativeTone =
  | "observational"    // outside_signals — detect patterns, surface hypotheses
  | "presentational"   // validate_outside — show findings, assess fit
  | "diagnostic"       // diagnose — synthesise, refine, build evidence
  | "synthesis"        // validate_diagnose — align on working hypotheses
  | "decisional"       // focus — choose, prioritise, commit
  | "confirmational"   // validate_focus — confirm chosen path, ensure alignment
  | "executional"      // flow — execute, monitor, iterate
  | "reflective";      // validate_flow — measure, habit check, is it working?

// Capabilities control what a phase is allowed to surface.
// Guards are checked by phaseAllows() before generating narrative or rendering sections.
export type PhaseCapability =
  | "prioritization_advice"    // recommendations, route selection, prioritization
  | "route_recommendations"    // route cards and route inspect guidance
  | "execution_guidance"       // owners, sequencing, progress tracking
  | "assumptions_section"      // inspect panel: assumptions list
  | "evidence_section"         // inspect panel: supporting/missing evidence
  | "strengthen_section"       // inspect panel: evidence unlock / readiness
  | "gate_scores_section";     // inspect panel: gate score breakdown

export interface PhaseDefinition {
  key: EngagementPhase;
  label: string;
  tagline: string;
  description: string;
  steps: string[];
  isValidate: boolean;
  narrativeTone: NarrativeTone;
  capabilities: ReadonlySet<PhaseCapability>;
}

// ── Phase definitions ─────────────────────────────────────────────────────────

export const PHASE_DEFS: PhaseDefinition[] = [
  {
    key: "outside_signals",
    label: "Outside",
    tagline: "Public signals · market landscape · initial hypotheses",
    description:
      "Gather publicly available evidence: market research, competitive landscape, public claims, and initial signals on how the market sees the client. Produce hypotheses and questions — not conclusions.",
    steps: [
      "Public baseline run and evidence ledger complete",
      "Competitive landscape mapped",
      "Public claims documented (website, press, reviews)",
      "Possible gaps and contradictions identified",
      "Questions for the first client conversation drafted",
    ],
    isValidate: false,
    narrativeTone: "observational",
    capabilities: new Set(),
  },
  {
    key: "validate_outside",
    label: "Validate",
    tagline: "Initial client meeting · show findings · assess fit",
    description:
      "Present what was found from the outside to the client. Surface possible gaps and contradictions. Assess fit and gather the client's perspective before entering full diagnosis.",
    steps: [
      "External findings presented to client",
      "Client's reaction and corrections captured",
      "Fit assessed — is the engagement well-scoped?",
      "Priority questions answered or flagged",
      "Agreement to move to Diagnose confirmed",
    ],
    isValidate: true,
    narrativeTone: "presentational",
    capabilities: new Set(),
  },
  {
    key: "diagnose",
    label: "Diagnose",
    tagline: "Company docs · interviews · initial strategy draft",
    description:
      "Upload company documents, run stakeholder and customer interviews, produce an initial draft of strategy, positioning, needs, and desires. Build working hypotheses grounded in evidence.",
    steps: [
      "Company strategy and brand documents uploaded",
      "Stakeholder interviews conducted",
      "Customer interviews or surveys done",
      "Initial strategy and positioning draft complete",
      "Needs, pain points, and desires mapped",
    ],
    isValidate: false,
    narrativeTone: "diagnostic",
    capabilities: new Set<PhaseCapability>(["assumptions_section"]),
  },
  {
    key: "validate_diagnose",
    label: "Validate",
    tagline: "Working hypotheses · align before committing direction",
    description:
      "Present working hypotheses to the client. Distinguish what is supported by evidence from what is still assumed. Resolve contradictions and confirm readiness to move to Focus.",
    steps: [
      "Working hypotheses documented",
      "Evidence-supported claims separated from assumptions",
      "Contradictions surfaced and discussed",
      "Client alignment confirmed on direction",
      "Agreement to move to Focus confirmed",
    ],
    isValidate: true,
    narrativeTone: "synthesis",
    capabilities: new Set<PhaseCapability>(["assumptions_section", "evidence_section"]),
  },
  {
    key: "focus",
    label: "Focus",
    tagline: "Customer needs · importance / satisfaction · prioritised solutions",
    description:
      "Run the customer needs survey, score importance and satisfaction, assign opportunities to desired outcomes, and prioritise the highest-leverage route. Evidence-backed decisions are now appropriate.",
    steps: [
      "Customer needs survey fielded and results recorded",
      "Importance and satisfaction scored for all needs",
      "Opportunities mapped to desired outcomes",
      "Top opportunities prioritised by opportunity score",
      "Solutions assigned and initial tests designed",
    ],
    isValidate: false,
    narrativeTone: "decisional",
    capabilities: new Set<PhaseCapability>([
      "prioritization_advice",
      "route_recommendations",
      "assumptions_section",
      "evidence_section",
      "strengthen_section",
      "gate_scores_section",
    ]),
  },
  {
    key: "validate_focus",
    label: "Validate",
    tagline: "Chosen outcome · path forward · evidence-supported alignment",
    description:
      "Confirm the chosen desired outcome and path forward with the client. Ensure the decision is grounded in evidence, tradeoffs are acknowledged, and all stakeholders are aligned before execution begins.",
    steps: [
      "Chosen desired outcome presented with evidence",
      "Route or path confirmed",
      "Tradeoffs acknowledged and accepted",
      "Stakeholder alignment confirmed",
      "Agreement to move to Flow confirmed",
    ],
    isValidate: true,
    narrativeTone: "confirmational",
    capabilities: new Set<PhaseCapability>([
      "prioritization_advice",
      "route_recommendations",
      "assumptions_section",
      "evidence_section",
      "strengthen_section",
      "gate_scores_section",
    ]),
  },
  {
    key: "flow",
    label: "Flow",
    tagline: "Track · check in · clear next steps",
    description:
      "Track progress on the chosen route, run regular check-ins, monitor leading indicators, and maintain a clear record of owners, assumptions, and evidence of progress.",
    steps: [
      "Chosen route locked in with clear owners",
      "Why it matters and how it addresses the problem documented",
      "Clear next steps and operating cadence defined",
      "Leading indicators and outcome metrics instrumented",
      "Progress and score movement tracked regularly",
    ],
    isValidate: false,
    narrativeTone: "executional",
    capabilities: new Set<PhaseCapability>([
      "prioritization_advice",
      "route_recommendations",
      "execution_guidance",
      "assumptions_section",
      "evidence_section",
      "strengthen_section",
      "gate_scores_section",
    ]),
  },
  {
    key: "validate_flow",
    label: "Validate",
    tagline: "Measurement · habit questions · is the system working?",
    description:
      "Review whether the route is producing results. Check that the right habits and cadence are in place. Identify signals that would indicate drift or the need to re-examine the chosen path.",
    steps: [
      "Leading indicators reviewed against baseline",
      "Habit and cadence questions answered",
      "Signals of drift or re-examination identified",
      "Team alignment on whether to continue or adjust",
      "Decision to iterate, pivot, or close the loop",
    ],
    isValidate: true,
    narrativeTone: "reflective",
    capabilities: new Set<PhaseCapability>([
      "prioritization_advice",
      "route_recommendations",
      "execution_guidance",
      "assumptions_section",
      "evidence_section",
      "strengthen_section",
      "gate_scores_section",
    ]),
  },
];

// ── Lookup helpers ─────────────────────────────────────────────────────────────

export const PHASE_MAP = new Map<EngagementPhase, PhaseDefinition>(
  PHASE_DEFS.map((d) => [d.key, d]),
);

export function getPhaseDefinition(phase: EngagementPhase): PhaseDefinition {
  return PHASE_MAP.get(phase) ?? PHASE_DEFS[0];
}

export function phaseAllows(phase: EngagementPhase, capability: PhaseCapability): boolean {
  return getPhaseDefinition(phase).capabilities.has(capability);
}

export function isMainPhase(phase: EngagementPhase): phase is MainPhase {
  return !getPhaseDefinition(phase).isValidate;
}

export function isValidateCheckpoint(phase: EngagementPhase): phase is ValidateCheckpoint {
  return getPhaseDefinition(phase).isValidate;
}

// Returns the main phase that directly precedes a validate checkpoint.
export function validatePreceding(phase: ValidateCheckpoint): MainPhase {
  const map: Record<ValidateCheckpoint, MainPhase> = {
    validate_outside:  "outside_signals",
    validate_diagnose: "diagnose",
    validate_focus:    "focus",
    validate_flow:     "flow",
  };
  return map[phase];
}

// Returns the label of the first phase where a capability becomes available.
// Used to render "Available from Diagnose" locked-section labels in inspect panels.
export function firstPhaseWithCapability(capability: PhaseCapability): string {
  for (const phase of PHASE_ORDER) {
    if (PHASE_MAP.get(phase)!.capabilities.has(capability)) {
      return PHASE_MAP.get(phase)!.label;
    }
  }
  return "Flow";
}

// ── Legacy coercion ───────────────────────────────────────────────────────────
// Converts any legacy or variant program_phase DB string to a valid EngagementPhase.

const VALID_PHASES = new Set<string>(PHASE_ORDER);

const LEGACY_MAP: Record<string, EngagementPhase> = {
  outside:   "outside_signals",
  diagnosis: "diagnose",
  execution: "flow",
  validate:  "validate_outside", // ambiguous legacy — default to earliest validate gate
};

export function normalizeEngagementPhase(raw: string | null | undefined): EngagementPhase {
  if (!raw) return "outside_signals";
  if (VALID_PHASES.has(raw)) return raw as EngagementPhase;
  return LEGACY_MAP[raw] ?? "outside_signals";
}
