import type { OpportunityRow, WorkflowStatus } from "@/hooks/useOpportunities";
import type { StrategicProblem } from "@/hooks/useStrategicProblems";
import { opportunityActionFromPriorityTier } from "@/lib/opportunityLabels";

export type ClientActionCategory = "Fix" | "Improve" | "Create";
export type ClientActionStatus = WorkflowStatus | "done";

export type ClientActionSummary = {
  id: string;
  title: string;
  category: ClientActionCategory;
  status: ClientActionStatus;
  score: number;
  primaryOwner: string | null;
  decider: string | null;
  contributors: string[];
  isOwned: boolean;
  whyItMatters: string;
  ifSolved: string[];
  assumptions: string[];
  successCriteria: string[];
};

export type ClientOwnershipStatus = "Strong" | "Emerging" | "Fragile" | "At Risk";

export type ClientOwnershipSummary = {
  ownedCriticalActions: number;
  totalCriticalActions: number;
  unownedCriticalActions: number;
  ownershipStrength: number;
  status: ClientOwnershipStatus;
  insight: string;
  scoreLiftHint: number;
};

export type ClientConstraintSummary = {
  title: string;
  detail: string;
  type: "Foundational" | "Validated";
};

export type ClientNextMove = {
  title: string;
  detail: string;
  linkTo: string;
};

export type ClientConfidenceLevel = "Low" | "Medium" | "High";
export type ClientActionConfidenceTag = "Assumed" | "Needs validation" | "Validated";
export type ClientConfidenceSummary = {
  level: ClientConfidenceLevel;
  explanation: string;
  nextMoveSupport: string;
  actionTag: ClientActionConfidenceTag;
  ctaLabel: string;
  ctaHref: string;
};

export type ClientSignalLevel = "Low" | "Medium" | "High";
export type ClientSignalBar = {
  label: "Proof" | "Ownership" | "Execution";
  value: number;
  level: ClientSignalLevel;
};
export type ClientSignalStrengthSummary = {
  proof: ClientSignalBar;
  ownership: ClientSignalBar;
  execution: ClientSignalBar;
};

export type ClientEvidenceSource = {
  label: "Internal data" | "Customer interviews" | "Market signals";
  present: boolean;
};

export type ClientEvidenceSummary = {
  sources: ClientEvidenceSource[];
};

export type ClientInputCoverageKey =
  | "internalSignals"
  | "customerTruth"
  | "marketSignals"
  | "executionSignals";

export type ClientInputCoverageLevel = "Low" | "Medium" | "High";

export type ClientInputCoverageItem = {
  key: ClientInputCoverageKey;
  label: string;
  coverage: number;
  level: ClientInputCoverageLevel;
  message: string;
};

export type ClientInputConfidenceLabel =
  | "low confidence"
  | "incomplete"
  | "moderate confidence"
  | "high confidence";

export type ClientInputCoverageSummary = {
  items: ClientInputCoverageItem[];
  overallCoverage: number;
  confidenceLevel: ClientConfidenceLevel;
  confidenceLabel: ClientInputConfidenceLabel;
  gaps: string[];
};

export type ClientSystemState = "Early Diagnosis" | "Partial Validation" | "Validated";

type NextMoveInput = {
  actions: ClientActionSummary[];
  ownership: ClientOwnershipSummary;
  constraint: ClientConstraintSummary;
  mojoScore?: number | null;
};

function toText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toStatus(value: unknown): ClientActionStatus {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "in_progress" || normalized === "planned" || normalized === "parked" || normalized === "done") {
    return normalized;
  }
  return "planned";
}

function toScore(value: unknown): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 0;
  return numberValue;
}

function categoryRank(category: ClientActionCategory) {
  if (category === "Fix") return 0;
  if (category === "Improve") return 1;
  return 2;
}

function statusRank(status: ClientActionStatus) {
  if (status === "in_progress") return 0;
  if (status === "planned") return 1;
  if (status === "done") return 2;
  if (status === "parked") return 3;
  return 4;
}

function primaryOwnerFromOpportunity(item: OpportunityRow): string | null {
  const record = item as OpportunityRow & {
    ownership?: {
      primaryOwner?: string;
      decider?: string;
      contributors?: string[];
    };
    owner?: string;
    ownerName?: string;
    assignee?: string;
  };

  return (
    toText(record.ownership?.primaryOwner) ??
    toText(record.owner) ??
    toText(record.ownerName) ??
    toText(record.assignee) ??
    null
  );
}

function deciderFromOpportunity(item: OpportunityRow): string | null {
  const record = item as OpportunityRow & {
    ownership?: {
      decider?: string;
    };
    approver?: string;
  };

  return toText(record.ownership?.decider) ?? toText(record.approver) ?? null;
}

function contributorsFromOpportunity(item: OpportunityRow): string[] {
  const record = item as OpportunityRow & {
    ownership?: {
      contributors?: string[];
    };
    contributors?: string[] | string;
    stakeholders?: string[] | string;
  };

  const raw =
    record.ownership?.contributors ??
    record.contributors ??
    record.stakeholders ??
    [];

  if (Array.isArray(raw)) {
    return raw.map((entry) => toText(entry)).filter((entry): entry is string => !!entry);
  }

  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((entry) => toText(entry))
      .filter((entry): entry is string => !!entry);
  }

  return [];
}

function readableOutcome(value: string) {
  const text = value.trim();
  if (!text) return "Untitled action";
  return text;
}

function statusLabel(status: ClientActionStatus) {
  if (status === "in_progress") return "In Progress";
  if (status === "done") return "Done";
  if (status === "planned") return "Planned";
  return "Parked";
}

function whyActionMatters(action: ClientActionSummary) {
  if (action.category === "Fix") {
    return "Removes friction.";
  }
  if (action.category === "Improve") {
    return "Builds adoption.";
  }
  return "Builds proof over time.";
}

function ifSolvedOutcomes(action: ClientActionSummary) {
  if (action.category === "Fix") {
    return [
      "Decision friction drops.",
      "Teams move faster this week.",
      action.isOwned ? "Execution stays accountable." : "Ownership becomes clear.",
    ];
  }

  if (action.category === "Improve") {
    return [
      "Adoption gets easier.",
      "Execution quality rises.",
      action.isOwned ? "Momentum stays consistent." : "A clear owner can keep momentum.",
    ];
  }

  return [
    "New value becomes testable.",
    "Learning loops speed up.",
    action.isOwned ? "Experiments stay on track." : "Clear ownership keeps this moving.",
  ];
}

function actionAssumptions(action: ClientActionSummary) {
  if (action.category === "Fix") {
    return [
      "Owner can remove blocker this sprint.",
      "Team agrees this is highest leverage.",
      "Inputs are enough to start now.",
    ];
  }
  if (action.category === "Improve") {
    return [
      "Process changes will increase consistency.",
      "Team has capacity to execute weekly.",
      "Signals are stable enough to optimize.",
    ];
  }
  return [
    "Opportunity is worth testing now.",
    "Small test can produce clear signal.",
    "Team can absorb learning quickly.",
  ];
}

function actionSuccessCriteria(action: ClientActionSummary) {
  if (action.category === "Fix") {
    return [
      "Owner assigned and action in progress.",
      "Decision cycle time drops this month.",
      "Critical blocker count declines.",
    ];
  }
  if (action.category === "Improve") {
    return [
      "Adoption rate increases week over week.",
      "Execution variance reduces across teams.",
      "Priority outcomes stay on cadence.",
    ];
  }
  return [
    "Pilot produces measurable signal.",
    "Decision quality improves after test.",
    "Clear go/no-go call is made.",
  ];
}

export function summarizeClientActions(opportunities: OpportunityRow[], limit = 5): ClientActionSummary[] {
  const safeOpportunities = [...(Array.isArray(opportunities) ? opportunities : [])].filter(
    (item): item is OpportunityRow =>
      !!item &&
      typeof item === "object" &&
      typeof (item as { id?: unknown }).id === "string" &&
      Boolean(String((item as { id?: unknown }).id || "").trim()),
  );

  return safeOpportunities
    .map((item) => {
      const category = opportunityActionFromPriorityTier(item.priority_tier) as ClientActionCategory;
      const status = toStatus(item.workflow_status);
      const primaryOwner = primaryOwnerFromOpportunity(item);
      const decider = deciderFromOpportunity(item);
      const contributors = contributorsFromOpportunity(item);
      const summary: ClientActionSummary = {
        id: item.id,
        title: readableOutcome(item.outcome),
        category,
        status,
        score: toScore(item.opportunity_score),
        primaryOwner,
        decider,
        contributors,
        isOwned: Boolean(primaryOwner),
        whyItMatters: "",
        ifSolved: [],
        assumptions: [],
        successCriteria: [],
      };

      return {
        ...summary,
        whyItMatters: whyActionMatters(summary),
        ifSolved: ifSolvedOutcomes(summary),
        assumptions: actionAssumptions(summary),
        successCriteria: actionSuccessCriteria(summary),
      };
    })
    .sort((a, b) => {
      const categoryDelta = categoryRank(a.category) - categoryRank(b.category);
      if (categoryDelta !== 0) return categoryDelta;

      const statusDelta = statusRank(a.status) - statusRank(b.status);
      if (statusDelta !== 0) return statusDelta;

      return b.score - a.score;
    })
    .slice(0, Math.max(1, limit));
}

function ownershipStatus(value: number): ClientOwnershipStatus {
  if (value >= 80) return "Strong";
  if (value >= 60) return "Emerging";
  if (value >= 40) return "Fragile";
  return "At Risk";
}

export function summarizeOwnership(actions: ClientActionSummary[]): ClientOwnershipSummary {
  const critical = actions.filter((action) => action.category === "Fix" || action.category === "Improve");
  const totalCriticalActions = critical.length;
  const ownedCriticalActions = critical.filter((action) => action.isOwned).length;
  const unownedCriticalActions = Math.max(totalCriticalActions - ownedCriticalActions, 0);

  const ownershipStrength =
    totalCriticalActions > 0
      ? Math.round((ownedCriticalActions / totalCriticalActions) * 100)
      : 100;

  const status = ownershipStatus(ownershipStrength);
  const scoreLiftHint = totalCriticalActions > 0 ? Math.round((unownedCriticalActions / totalCriticalActions) * 12) : 0;

  const insight =
    unownedCriticalActions > 0
      ? `${unownedCriticalActions} critical action${unownedCriticalActions === 1 ? " has" : "s have"} no clear owner.`
      : "Ownership is strong across current priorities.";

  return {
    ownedCriticalActions,
    totalCriticalActions,
    unownedCriticalActions,
    ownershipStrength,
    status,
    insight,
    scoreLiftHint,
  };
}

function toConstraintTitle(problem: StrategicProblem): string {
  const raw = String(problem.statement || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)[0];
  if (!raw) return "Decision clarity is the primary constraint";
  return raw.replace(/\s+/g, " ").trim();
}

export function summarizePrimaryConstraint(
  strategicProblems: StrategicProblem[],
  actions: ClientActionSummary[],
  evidenceStatus?: string | null,
): ClientConstraintSummary {
  const normalizedEvidence = String(evidenceStatus || "").trim().toLowerCase();
  const isValidated =
    normalizedEvidence.includes("strong") ||
    normalizedEvidence.includes("artifacts") ||
    normalizedEvidence.includes("validated");
  const type: ClientConstraintSummary["type"] = isValidated ? "Validated" : "Foundational";

  const openProblem = strategicProblems.find((problem) => problem.status === "open");
  if (openProblem) {
    return {
      title: toConstraintTitle(openProblem),
      detail: "This slows decisions and execution.",
      type,
    };
  }

  const unownedCritical = actions.filter((action) => (action.category === "Fix" || action.category === "Improve") && !action.isOwned);
  if (unownedCritical.length > 0) {
    return {
      title: "Critical work lacks clear ownership",
      detail: "Without ownership, progress stalls.",
      type,
    };
  }

  return {
    title: "The direction is still unsettled",
    detail: "The current evidence is not yet strong enough to treat this as settled.",
    type,
  };
}

export function summarizeNextMove(
  input: NextMoveInput,
): ClientNextMove {
  const actions = input.actions;
  const constraintText = `${input.constraint.title} ${input.constraint.detail}`.toLowerCase();
  const fixActions = actions.filter((action) => action.category === "Fix");
  const criticalActions = actions.filter(
    (action) => action.category === "Fix" || action.category === "Improve",
  );

  // 1) OWNERSHIP CHECK
  const unownedFixActions = fixActions.filter((action) => !action.isOwned);
  if (unownedFixActions.length > 0) {
    const topFix = unownedFixActions[0];
    return {
      title: "Assign owners to top Fix actions",
      detail:
        topFix
          ? `Start with "${topFix.title}". Without ownership, nothing moves.`
          : "Start with your top Fix action. Without ownership, nothing moves.",
      linkTo: "/",
    };
  }

  // 2) CLARITY CHECK
  const clarityConstraint =
    /\bcustomer\b|\bmarket\b|\bneeds?\b|\bevidence\b|\bclarity\b/.test(constraintText);
  if (clarityConstraint) {
    return {
      title: "Validate results from pilot tests",
      detail:
        "Without proof, trust and adoption stay low.",
      linkTo: "/",
    };
  }

  // 3) ALIGNMENT CHECK
  const alignmentSignals =
    /\bmisalign|\balign|\bconflict|\bpriorit|\bshared\b|\bdirection\b/.test(constraintText) ||
    (input.ownership.status !== "Strong" && criticalActions.filter((action) => action.status === "planned").length > 1);
  if (alignmentSignals) {
    return {
      title: "Align on one problem",
      detail:
        "Split focus slows decisions.",
      linkTo: "/",
    };
  }

  // 4) EXECUTION CHECK
  const ownedCriticalActions = criticalActions.filter((action) => action.isOwned);
  const hasOwnedCriticalActions = ownedCriticalActions.length > 0;
  const hasActiveCriticalAction = ownedCriticalActions.some((action) => action.status === "in_progress" || action.status === "done");
  const topOwnedFix = fixActions.find((action) => action.isOwned);
  if (hasOwnedCriticalActions && !hasActiveCriticalAction && topOwnedFix) {
    return {
      title: "Move Priority 1 into execution",
      detail: `Start "${topOwnedFix.title}" now.`,
      linkTo: "/",
    };
  }

  // 5) CREATION CHECK
  return {
    title: "Test one new opportunity",
    detail: "Keep scope tight and measurable.",
    linkTo: "/",
  };
}

export function summarizeWhatThisMeans(args: {
  companyName?: string | null;
  mojoScore?: number | null;
  ownership: ClientOwnershipSummary;
  constraint: ClientConstraintSummary;
  actions: ClientActionSummary[];
}): string[] {
  const name = args.companyName?.trim() || "This team";
  const score = Number.isFinite(Number(args.mojoScore)) ? Number(args.mojoScore) : null;
  const activeActions = args.actions.filter((action) => action.status === "in_progress" || action.status === "done").length;

  const lines: string[] = [];

  if (score !== null) {
    lines.push(`Score ${Math.round(score)}.`);
  }

  lines.push(args.constraint.detail);

  if (args.ownership.unownedCriticalActions > 0) {
    lines.push("No clear owners on critical work.");
  } else if (activeActions === 0 && args.actions.length > 0) {
    lines.push("Priorities are set, but work is not moving.");
  } else {
    lines.push("Ownership is clear. Work is moving.");
  }

  return lines.slice(0, 3);
}

export function summarizeConfidence(evidenceStatus?: string | null): ClientConfidenceSummary {
  const normalized = String(evidenceStatus || "").trim().toLowerCase();

  const high =
    normalized.includes("baseline_plus_artifacts") ||
    normalized.includes("public_evidence_strong");
  const medium =
    normalized.includes("public_evidence_partial") ||
    normalized.includes("public_evidence_thin") ||
    normalized.includes("emerging");

  if (high) {
    return {
      level: "High",
      explanation: "Backed by real customer evidence.",
      nextMoveSupport: "Backed by real customer evidence.",
      actionTag: "Validated",
      ctaLabel: "Increase Confidence",
      ctaHref: "/opportunities#client-next-move",
    };
  }

  if (medium) {
    return {
      level: "Medium",
      explanation: "Partially validated.",
      nextMoveSupport: "Recommended based on current signals.",
      actionTag: "Needs validation",
      ctaLabel: "Increase Confidence",
      ctaHref: "/opportunities#client-next-move",
    };
  }

  return {
    level: "Low",
    explanation: "Based on internal data only.",
    nextMoveSupport: "Recommended based on current signals.",
    actionTag: "Assumed",
    ctaLabel: "Increase Confidence",
    ctaHref: "/opportunities#client-next-move",
  };
}

function levelFromValue(value: number): ClientSignalLevel {
  if (value >= 70) return "High";
  if (value >= 45) return "Medium";
  return "Low";
}

function coverageLevel(value: number): ClientInputCoverageLevel {
  if (value >= 70) return "High";
  if (value >= 45) return "Medium";
  return "Low";
}

export function summarizeSignalStrength(args: {
  confidence: ClientConfidenceSummary;
  ownership: ClientOwnershipSummary;
  actions: ClientActionSummary[];
}): ClientSignalStrengthSummary {
  const proofValue = args.confidence.level === "High" ? 84 : args.confidence.level === "Medium" ? 60 : 32;
  const ownershipValue = Math.max(0, Math.min(100, Math.round(args.ownership.ownershipStrength)));

  const critical = args.actions.filter((action) => action.category === "Fix" || action.category === "Improve");
  const totalCritical = critical.length;
  const activeCritical = critical.filter((action) => action.status === "in_progress" || action.status === "done").length;
  const ownedCritical = critical.filter((action) => action.isOwned).length;
  const executionValue =
    totalCritical === 0
      ? 50
      : Math.max(
          0,
          Math.min(
            100,
            Math.round(((activeCritical / totalCritical) * 70) + ((ownedCritical / totalCritical) * 30)),
          ),
        );

  return {
    proof: { label: "Proof", value: proofValue, level: levelFromValue(proofValue) },
    ownership: { label: "Ownership", value: ownershipValue, level: levelFromValue(ownershipValue) },
    execution: { label: "Execution", value: executionValue, level: levelFromValue(executionValue) },
  };
}

export function summarizeEvidenceSources(evidenceStatus?: string | null): ClientEvidenceSummary {
  const normalized = String(evidenceStatus || "").trim().toLowerCase();
  const hasInternal = true;
  const hasCustomer =
    normalized.includes("strong") ||
    normalized.includes("artifacts") ||
    normalized.includes("validated") ||
    normalized.includes("research");
  const hasMarket =
    normalized.includes("public") ||
    normalized.includes("emerging") ||
    normalized.includes("partial") ||
    normalized.includes("thin") ||
    normalized.includes("strong");

  return {
    sources: [
      { label: "Internal data", present: hasInternal },
      { label: "Customer interviews", present: hasCustomer },
      { label: "Market signals", present: hasMarket },
    ],
  };
}

export function summarizeInputCoverage(args: {
  evidenceStatus?: string | null;
  actions: ClientActionSummary[];
  strategicProblems?: StrategicProblem[];
}): ClientInputCoverageSummary {
  const normalized = String(args.evidenceStatus || "").trim().toLowerCase();
  const strategicProblemCount = args.strategicProblems?.length ?? 0;
  const actionCount = args.actions.length;
  const criticalActions = args.actions.filter((action) => action.category === "Fix" || action.category === "Improve");
  const ownedCritical = criticalActions.filter((action) => action.isOwned).length;
  const activeCritical = criticalActions.filter((action) => action.status === "in_progress" || action.status === "done").length;

  const internalCoverage = (() => {
    const signalCount = actionCount + strategicProblemCount;
    if (signalCount >= 10) return 88;
    if (signalCount >= 6) return 72;
    if (signalCount >= 3) return 56;
    if (signalCount >= 1) return 38;
    return 20;
  })();

  const customerCoverage = (() => {
    if (
      normalized.includes("baseline_plus_artifacts") ||
      normalized.includes("strong") ||
      normalized.includes("validated")
    ) {
      return 84;
    }
    if (
      normalized.includes("research") ||
      normalized.includes("partial") ||
      normalized.includes("emerging")
    ) {
      return 58;
    }
    return 24;
  })();

  const marketCoverage = (() => {
    if (
      normalized.includes("public_evidence_strong") ||
      normalized.includes("baseline_plus_artifacts")
    ) {
      return 82;
    }
    if (
      normalized.includes("public") ||
      normalized.includes("partial") ||
      normalized.includes("thin") ||
      normalized.includes("emerging")
    ) {
      return 54;
    }
    return 22;
  })();

  const executionCoverage = (() => {
    if (criticalActions.length === 0) return 35;
    const ownerRatio = ownedCritical / criticalActions.length;
    const activeRatio = activeCritical / criticalActions.length;
    return Math.round(Math.min(100, Math.max(0, ownerRatio * 60 + activeRatio * 40)));
  })();

  const items: ClientInputCoverageItem[] = [
    {
      key: "internalSignals",
      label: "Internal Signals",
      coverage: internalCoverage,
      level: coverageLevel(internalCoverage),
      message: internalCoverage >= 60 ? "Internal signals are usable." : "Internal signals are still thin.",
    },
    {
      key: "customerTruth",
      label: "Customer Truth",
      coverage: customerCoverage,
      level: coverageLevel(customerCoverage),
      message:
        customerCoverage >= 60
          ? "Customer truth is partially validated."
          : "Customer validation is missing.",
    },
    {
      key: "marketSignals",
      label: "Market Signals",
      coverage: marketCoverage,
      level: coverageLevel(marketCoverage),
      message:
        marketCoverage >= 60
          ? "Market signal coverage is acceptable."
          : "Market signal coverage is missing.",
    },
    {
      key: "executionSignals",
      label: "Execution Signals",
      coverage: executionCoverage,
      level: coverageLevel(executionCoverage),
      message:
        executionCoverage >= 60
          ? "Execution signals show active ownership."
          : "Execution signals are weak; ownership is unclear.",
    },
  ];

  const overallCoverage =
    items.length > 0
      ? Math.round(items.reduce((sum, item) => sum + item.coverage, 0) / items.length)
      : 0;

  const confidenceLevel: ClientConfidenceLevel =
    overallCoverage >= 75 && customerCoverage >= 60 && marketCoverage >= 60
      ? "High"
      : overallCoverage >= 45
        ? "Medium"
        : "Low";

  const confidenceLabel: ClientInputConfidenceLabel =
    confidenceLevel === "High"
      ? "high confidence"
      : confidenceLevel === "Medium"
        ? "incomplete"
        : "low confidence";

  const gaps = items
    .filter((item) => item.coverage < 60)
    .map((item) => item.message);

  return {
    items,
    overallCoverage,
    confidenceLevel,
    confidenceLabel,
    gaps,
  };
}

export function summarizeSystemState(coverage: ClientInputCoverageSummary): ClientSystemState {
  const customerCoverage = coverage.items.find((item) => item.key === "customerTruth")?.coverage ?? 0;
  const marketCoverage = coverage.items.find((item) => item.key === "marketSignals")?.coverage ?? 0;

  if (coverage.overallCoverage >= 75 && customerCoverage >= 60 && marketCoverage >= 60) {
    return "Validated";
  }
  if (coverage.overallCoverage >= 45) {
    return "Partial Validation";
  }
  return "Early Diagnosis";
}

export { statusLabel };
