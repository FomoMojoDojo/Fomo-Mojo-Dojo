import type { InputItem } from "@/lib/types";
import type { SourceConfidenceSignals } from "@/lib/sourceConfidence";
import type { EngagementPhase } from "@/lib/engagementPhase";

// WorkflowPhase is the inferred phase derived from evidence signals.
// It is a subset of EngagementPhase — the 3 phases the inference logic can produce.
// When an admin has explicitly set a phase (including validate checkpoints or
// outside_signals), the adminPhase override takes precedence.
export type WorkflowPhase = "diagnose" | "focus" | "flow";

export type WorkflowStep = {
  title: string;
  detail: string;
  done: boolean;
};

export type WorkflowGuidance = {
  // The resolved phase — may be any EngagementPhase when adminPhase is provided.
  phase: EngagementPhase;
  title: string;
  detail: string;
  steps: WorkflowStep[];
};

function percentComplete(inputs: InputItem[]) {
  if (!inputs.length) return 0;
  const total = inputs.reduce((sum, item) => sum + (Number(item.completeness) || 0), 0);
  return Math.round(total / inputs.length);
}

function firstIncompleteStep(steps: WorkflowStep[]) {
  return steps.find((step) => !step.done) ?? steps[0];
}

// Phase-specific guidance for outside_signals and validate checkpoints.
// These phases are admin-set only (never inferred from signals).
const ADMIN_PHASE_GUIDANCE: Partial<Record<EngagementPhase, WorkflowGuidance>> = {
  outside_signals: {
    phase: "outside_signals",
    title: "Build the external evidence picture",
    detail: "Gather public signals, map the competitive landscape, and identify possible gaps before interpreting constraints or making recommendations.",
    steps: [
      { title: "Run public baseline", detail: "Complete the public research and evidence ledger.", done: false },
      { title: "Map competitive landscape", detail: "Document how competitors position and what claims they make.", done: false },
      { title: "Document public claims", detail: "Capture website, press, and review signals.", done: false },
      { title: "Identify possible gaps", detail: "Surface contradictions and missing signals.", done: false },
      { title: "Draft first-conversation questions", detail: "Prepare questions for the initial client meeting.", done: false },
    ],
  },
  validate_outside: {
    phase: "validate_outside",
    title: "Present external findings to the client",
    detail: "Show what was observed from the outside. Gather the client's perspective. Assess fit before diagnosis begins.",
    steps: [
      { title: "Present external findings", detail: "Walk the client through signals, gaps, and contradictions found.", done: false },
      { title: "Capture client reaction", detail: "Note corrections, surprises, and confirmations.", done: false },
      { title: "Assess engagement fit", detail: "Confirm the engagement is well-scoped for the problems surfaced.", done: false },
      { title: "Confirm move to Diagnose", detail: "Agree on next steps before beginning full diagnosis.", done: false },
    ],
  },
  validate_diagnose: {
    phase: "validate_diagnose",
    title: "Align on working hypotheses",
    detail: "Present what the evidence suggests. Separate confirmed signals from assumptions. Confirm readiness to commit to a direction.",
    steps: [
      { title: "Document working hypotheses", detail: "State what the evidence points to, clearly.", done: false },
      { title: "Separate evidence from assumption", detail: "Label each claim as supported or still assumed.", done: false },
      { title: "Surface contradictions", detail: "Bring unresolved contradictions to the client.", done: false },
      { title: "Confirm alignment", detail: "Agree on direction before moving to Focus.", done: false },
    ],
  },
  validate_focus: {
    phase: "validate_focus",
    title: "Confirm the chosen path",
    detail: "Present the chosen desired outcome and route. Ensure evidence supports the decision and all stakeholders are aligned before execution.",
    steps: [
      { title: "Present chosen outcome with evidence", detail: "Show why this outcome was selected and what backs it.", done: false },
      { title: "Confirm route", detail: "Agree on the specific route or path forward.", done: false },
      { title: "Acknowledge tradeoffs", detail: "Surface what is being deprioritised and why.", done: false },
      { title: "Confirm stakeholder alignment", detail: "Ensure everyone is committed before execution begins.", done: false },
    ],
  },
  validate_flow: {
    phase: "validate_flow",
    title: "Review measurement and habits",
    detail: "Check whether the route is producing results. Assess whether the right habits and cadence are in place.",
    steps: [
      { title: "Review leading indicators", detail: "Compare current signals against the baseline.", done: false },
      { title: "Answer habit questions", detail: "Is the operating cadence in place and working?", done: false },
      { title: "Identify drift signals", detail: "Note any signals that suggest re-examination is needed.", done: false },
      { title: "Decide: continue, adjust, or close", detail: "Make an explicit call on the next cycle.", done: false },
    ],
  },
};

export function computeWorkflowGuidance(args: {
  inputs: InputItem[];
  sourceSignals: SourceConfidenceSignals;
  publicEvidenceStatus?: string | null;
  focusOpportunityCount: number;
  routeCount: number;
  strategicProblemCount?: number;
  reconciledStrategicProblemCount?: number;
  // When the admin has explicitly set a phase, it overrides the inferred result.
  adminPhase?: EngagementPhase | null;
}): WorkflowGuidance {
  // Admin-set phases that have fixed guidance — return immediately, no inference needed.
  if (args.adminPhase && ADMIN_PHASE_GUIDANCE[args.adminPhase]) {
    return ADMIN_PHASE_GUIDANCE[args.adminPhase]!;
  }
  const inputs = Array.isArray(args.inputs) ? args.inputs : [];
  const completePct = percentComplete(inputs);
  const publicEvidenceStatus = String(args.publicEvidenceStatus || "").trim().toLowerCase();
  const hasPublicResearch =
    publicEvidenceStatus === "baseline_plus_artifacts" ||
    publicEvidenceStatus === "public_evidence_strong" ||
    publicEvidenceStatus === "public_evidence_partial" ||
    publicEvidenceStatus === "public_evidence_thin";
  const hasCompanyResearch = args.sourceSignals.hasCompanyEvidence;
  const hasPrimaryResearch = args.sourceSignals.hasPrimaryEvidence;
  const strategicProblemCount = Math.max(0, Number(args.strategicProblemCount || 0));
  const reconciledStrategicProblemCount = Math.max(0, Number(args.reconciledStrategicProblemCount || 0));
  const hasStrategicProblem = strategicProblemCount > 0;
  const strategicProblemReconciled =
    strategicProblemCount <= 1 || reconciledStrategicProblemCount > 0;
  const hasFocusOutputs = args.focusOpportunityCount > 0 && args.routeCount > 0;
  const hasTestingLoop = args.sourceSignals.hasImplementedTested || args.sourceSignals.testedSignal >= 60;

  const diagnoseComplete =
    hasStrategicProblem &&
    strategicProblemReconciled &&
    hasPublicResearch &&
    hasCompanyResearch &&
    hasPrimaryResearch &&
    completePct >= 35;

  const focusComplete =
    diagnoseComplete &&
    hasFocusOutputs &&
    completePct >= 45;

  if (!diagnoseComplete) {
    const steps: WorkflowStep[] = [
      {
        title: "Capture client strategic problem",
        detail: "Record the client-stated strategic problem in Strategy before generating recommendations.",
        done: hasStrategicProblem,
      },
      {
        title: "Reconcile strategic problem statements",
        detail: "If multiple statements exist, reconcile to a clear decision-ready framing.",
        done: strategicProblemReconciled,
      },
      {
        title: "Confirm public baseline",
        detail: "Ensure public research and evidence ledger are complete and current.",
        done: hasPublicResearch,
      },
      {
        title: "Collect company evidence",
        detail: "Upload internal strategy, positioning, and operating artifacts.",
        done: hasCompanyResearch,
      },
      {
        title: "Collect primary market evidence",
        detail: "Run interviews/surveys to validate needs, alternatives, and assumptions.",
        done: hasPrimaryResearch,
      },
      {
        title: "Close critical research gaps",
        detail: "Finish the highest-impact missing inputs so diagnosis is decision-ready.",
        done: completePct >= 35,
      },
    ];
    const next = firstIncompleteStep(steps);
    return {
      phase: "diagnose",
      title: next.title,
      detail: next.detail,
      steps,
    };
  }

  if (!focusComplete) {
    const steps: WorkflowStep[] = [
      {
        title: "Select target outcome",
        detail: "Choose one measurable outcome to optimize first.",
        done: args.focusOpportunityCount > 0,
      },
      {
        title: "Prioritize opportunity",
        detail: "Pick the highest-leverage underserved opportunity.",
        done: args.focusOpportunityCount > 0,
      },
      {
        title: "Choose route",
        detail: "Commit to the route that will close the selected opportunity gap.",
        done: args.routeCount > 0,
      },
      {
        title: "Define must-be-true assumptions",
        detail: "State assumptions and possibilities required for the selected route to work.",
        done: completePct >= 45 && strategicProblemReconciled,
      },
    ];
    const next = firstIncompleteStep(steps);
    return {
      phase: "focus",
      title: next.title,
      detail: next.detail,
      steps,
    };
  }

  const steps: WorkflowStep[] = [
    {
      title: "Implement selected route",
      detail: "Execute the chosen route with clear owners and operating cadence.",
      done: completePct >= 55,
    },
    {
      title: "Instrument measurement",
      detail: "Track leading indicators and target outcome metrics.",
      done: args.sourceSignals.testedSignal >= 45,
    },
    {
      title: "Monitor and review",
      detail: "Review progress, assumptions, and score movement on a fixed cadence.",
      done: args.sourceSignals.testedSignal >= 60,
    },
    {
      title: "Test and recalibrate",
      detail: "Run tests, validate assumptions, and update scoring based on evidence.",
      done: hasTestingLoop,
    },
  ];
  const next = firstIncompleteStep(steps);
  return {
    phase: "flow",
    title: next.title,
    detail: next.detail,
    steps,
  };
}
