import type { InputItem } from "@/lib/types";
import type { SourceConfidenceSignals } from "@/lib/sourceConfidence";

export type WorkflowPhase = "diagnose" | "focus" | "flow";

export type WorkflowStep = {
  title: string;
  detail: string;
  done: boolean;
};

export type WorkflowGuidance = {
  phase: WorkflowPhase;
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

export function computeWorkflowGuidance(args: {
  inputs: InputItem[];
  sourceSignals: SourceConfidenceSignals;
  focusOpportunityCount: number;
  routeCount: number;
  strategicProblemCount?: number;
  reconciledStrategicProblemCount?: number;
}): WorkflowGuidance {
  const inputs = Array.isArray(args.inputs) ? args.inputs : [];
  const completePct = percentComplete(inputs);
  const hasPublicResearch = completePct > 0;
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
