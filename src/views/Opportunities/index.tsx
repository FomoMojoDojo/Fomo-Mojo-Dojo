import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import TopNav from "@/components/layout/TopNav";
import { useCompany } from "@/hooks/useCompany";
import { useSourceConfidence } from "@/hooks/useSourceConfidence";
import { useManagedOutcomes } from "@/hooks/useManagedOutcomes";
import { useOpportunities, type OpportunityRow, type WorkflowStatus } from "@/hooks/useOpportunities";
import { useSolutionIdeas, type SolutionIdeaRow } from "@/hooks/useSolutionIdeas";
import { useSolutionTests, type SolutionTestRow } from "@/hooks/useSolutionTests";
import { useJobSteps } from "@/hooks/useJobSteps";
import { useOdiNeeds } from "@/hooks/useOdiNeeds";
import { useStrategyCascade } from "@/hooks/useStrategyCascade";
import { usePositioningCanvas } from "@/hooks/usePositioningCanvas";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StateBadge } from "@/components/ui/semantic-badges";
import PageContextStatus from "@/components/layout/PageContextStatus";
import GenericAuditTraceNote from "@/components/diagnostics/GenericAuditTraceNote";
import { computeOpportunityScore } from "@/lib/scoring";
import { opportunityActionFromPriorityTier, opportunityActionTone } from "@/lib/opportunityLabels";
import { isGenericAuditCompany } from "@/lib/genericAudit";
import {
  classifyOpportunityFocus,
  deriveInitiativeContext,
  type FocusClassification,
} from "@/lib/initiativeFocus";
import {
  ensureRequiredFrameworkKeys,
  validateDesiredOutcome,
  validateOutcomeOpportunityDistinctness,
  validateSolutionIdea,
  validateSolutionTest,
} from "@/lib/opportunityTreeSemantics";
import {
  buildOpportunityTree,
  pickDefaultOpenOpportunityId,
  type OpportunityTreeNode,
} from "@/lib/opportunityTree";
import {
  composeDesiredOutcomeFromParts,
  humanizeOutcomeLanguage,
  normalizeDesiredOutcomeDirection,
} from "@/lib/desiredOutcome";
import { buildCheckpointOffers, type CheckpointOfferCandidate } from "@/lib/checkpointOffers";

const c = {
  bg: "#faf7f6",
  panel: "#FFFFFF",
  card: "#ffffff",
  paper: "#FFFFFF",
  line: "#DDE6D1",
  charcoal: "#233C4B",
  secondary: "#46606D",
  muted: "#6E847F",
  focus: "#FF7D2D",
  monitor: "#FAC846",
  defer: "#5F9B8C",
};

const JOURNEY_ACCENT: Record<string, string> = {
  customer: "#FF7D2D",
  revenue: "#5F9B8C",
  operations: "#233C4B",
};

const WORKFLOW_STATUS_OPTIONS: Array<{ value: WorkflowStatus; label: string }> = [
  { value: "in_progress", label: "In progress" },
  { value: "planned", label: "Planned" },
  { value: "parked", label: "Parked" },
];

const OUTCOME_TEXT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bmonitored decision outcomes\b/gi, "tracked decision results"],
  [/\bdecision outcomes\b/gi, "decision results"],
  [/\bbased on insights from\b/gi, "using evidence from"],
  [/\bstrategic alignment\b/gi, "fit with strategy"],
  [/\bcore audience\b/gi, "main audience"],
  [/\bleverage\b/gi, "use"],
  [/\butili[sz]e\b/gi, "use"],
  [/\boptimi[sz]e\b/gi, "improve"],
];

function humanizeOutcomeText(value: string | null | undefined) {
  let text = String(value || "").trim();
  if (!text) return "";
  for (const [pattern, replacement] of OUTCOME_TEXT_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  text = text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function focusSortValue(focus: FocusClassification | undefined) {
  if (!focus) return 0;
  if (focus.level === "initiative") return 2;
  if (focus.level === "related") return 1;
  return 0;
}

function priorityTierSortValue(tier: string | null | undefined) {
  if (tier === "focus") return 0;
  if (tier === "monitor") return 1;
  if (tier === "defer") return 2;
  return 3;
}

function OpportunityNumberBadge({ value }: { value?: string }) {
  if (!value) return null;
  return (
    <span
      className="shrink-0 min-w-[52px] whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.04em] text-left"
      style={{ color: c.secondary }}
      title="Stable opportunity number based on suggested priority"
    >
      {value}
    </span>
  );
}

function titleCaseJourney(key: string) {
  if (key === "customer") return "Customer";
  if (key === "revenue") return "Revenue";
  if (key === "operations") return "Operations";
  return key;
}

function odiScore(item: OpportunityRow) {
  const importance = Number(item.importance);
  const satisfaction = Number(item.satisfaction);
  if (Number.isFinite(importance) && Number.isFinite(satisfaction)) {
    return computeOpportunityScore(importance, satisfaction);
  }
  const stored = Number(item.opportunity_score);
  return Number.isFinite(stored) ? Math.round(stored * 10) / 10 : null;
}

function formatOdiScore(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function priorityLabel(tier: string) {
  if (tier === "focus") return "Prioritize now";
  if (tier === "monitor") return "Investigate next";
  return "Keep visible";
}

function defaultWorkflowStatusForTier(tier: string): WorkflowStatus {
  if (tier === "focus") return "in_progress";
  if (tier === "monitor") return "planned";
  return "parked";
}

function resolveWorkflowStatus(item: OpportunityRow): WorkflowStatus {
  const raw = String(item.workflow_status || "").trim().toLowerCase();
  if (raw === "in_progress" || raw === "planned" || raw === "parked") return raw;
  return defaultWorkflowStatusForTier(String(item.priority_tier || ""));
}

function workflowStatusLabel(value: WorkflowStatus) {
  if (value === "in_progress") return "In progress";
  if (value === "planned") return "Planned";
  return "Parked";
}

function ActionTypeBadge({ label }: { label: "Fix" | "Improve" | "Create" }) {
  const style = opportunityActionTone(label);
  return (
    <span
      className="inline-flex items-center rounded-md border px-2 py-[1px] font-mono text-[10px] uppercase tracking-[0.08em]"
      style={{ borderColor: style.border, background: style.bg, color: style.fg }}
    >
      {label}
    </span>
  );
}

function priorityAccent(tier: string) {
  if (tier === "focus") return c.focus;
  if (tier === "monitor") return c.monitor;
  return c.secondary;
}

type InnovationStrategy = "differentiated" | "dominant" | "disruptive" | "discrete";

const STRATEGY_META: Record<InnovationStrategy, {
  label: string;
  focusQuadrant: "underserved" | "overserved" | "all" | null;
  banner: string;
  cardAlign: (state: "underserved" | "served" | "overserved") => "strong" | "neutral" | "conflict";
}> = {
  differentiated: {
    label: "Differentiated",
    focusQuadrant: "underserved",
    banner: "Differentiated strategy: prioritize underserved outcomes — high importance, low satisfaction. These are where a meaningfully better solution creates durable advantage.",
    cardAlign: (s) => s === "underserved" ? "strong" : s === "served" ? "conflict" : "neutral",
  },
  dominant: {
    label: "Dominant",
    focusQuadrant: "all",
    banner: "Dominant strategy: address all key outcomes better than any alternative. No quadrant is off-limits — breadth of coverage is the competitive moat.",
    cardAlign: () => "strong",
  },
  disruptive: {
    label: "Disruptive",
    focusQuadrant: "overserved",
    banner: "Disruptive strategy: target overserved or non-consuming segments with a simpler, more affordable solution. Overserved outcomes are your entry point.",
    cardAlign: (s) => s === "overserved" ? "strong" : s === "underserved" ? "conflict" : "neutral",
  },
  discrete: {
    label: "Discrete",
    focusQuadrant: null,
    banner: "Discrete strategy: serve a distinct segment with unique outcome priorities. Focus on the outcomes that matter most to that specific group, regardless of mainstream rankings.",
    cardAlign: () => "neutral",
  },
};

function deriveServiceState(importance: number | null, satisfaction: number | null): "underserved" | "served" | "overserved" {
  const imp = Number(importance) || 0;
  const sat = Number(satisfaction) || 0;
  const score = imp + Math.max(0, imp - sat);
  if (score >= 10) return "underserved";
  if (sat > imp + 1) return "overserved";
  return "served";
}

function journeyRootLabel(key: string, companyName?: string | null) {
  if (key === "customer") {
    return companyName
      ? `Increase the share of target customers who successfully progress through ${companyName}'s customer journey`
      : "Increase the share of target customers who successfully progress through the customer journey";
  }
  if (key === "revenue") {
    return companyName
      ? `Increase the rate at which qualified demand converts into sustainable funding, contracts, or revenue for ${companyName}`
      : "Increase the rate at which qualified demand converts into sustainable funding, contracts, or revenue";
  }
  if (key === "operations") {
    return companyName
      ? `Increase the consistency and timeliness of delivery across ${companyName}'s operating journey`
      : "Increase the consistency and timeliness of delivery across the operating journey";
  }
  return "Increase successful progress through the core journey";
}

function evidenceSummaryText(args: {
  hasPublic: boolean;
  hasCustomer: boolean;
  hasValidated: boolean;
  hasTested: boolean;
}) {
  const active: string[] = [];
  if (args.hasPublic) active.push("Public");
  if (args.hasCustomer) active.push("Company");
  if (args.hasValidated) active.push("Research");
  if (args.hasTested) active.push("Testing");
  return active.length > 0 ? active.join(" · ") : "No active evidence sources";
}

type DesiredOutcomeOption = {
  id: string;
  journeyKey: string;
  title: string;
  statement: string;
  leadingIndicator: string;
  targetDirection: string;
  direction: string;
  metric: string;
  object: string;
  context: string;
  constraint: string | null;
  isPrimary: boolean;
  evidenceBasis: string;
  confidence: number;
  source: "managed_outcome" | "recommended";
  managedOutcomeId?: string;
};

function plainEnglishStepPhrase(stepLabel: string, stepNumber?: number | null) {
  const raw = String(stepLabel || "").trim();
  if (!raw) {
    if (stepNumber) return `complete step ${stepNumber}`;
    return "complete this stage";
  }

  let phrase = raw.toLowerCase().replace(/\s+/g, " ").trim();

  const exactRewrites: Array<[RegExp, string]> = [
    [/^monitor decision impact$/i, "review decision results"],
    [/^review outcomes and reprioritize$/i, "review outcomes and update priorities"],
    [/^run weekly decision cadence$/i, "run a weekly decision review"],
    [/^map constraints and options$/i, "map constraints and next options"],
    [/^frame strategic problem$/i, "define the strategic problem clearly"],
    [/^prepare evidence inputs$/i, "prepare required evidence"],
  ];

  for (const [pattern, replacement] of exactRewrites) {
    if (pattern.test(phrase)) {
      phrase = replacement;
      break;
    }
  }

  phrase = phrase
    .replace(/^monitor\b/i, "review")
    .replace(/^frame\b/i, "define")
    .replace(/^start\b/i, "complete");

  if (!/^(review|define|complete|prepare|run|map|confirm|reduce|increase|improve)/i.test(phrase)) {
    phrase = `complete ${phrase}`;
  }

  return phrase;
}

function audienceLabelForJourney(journeyKey: string) {
  if (journeyKey === "customer") return "customers";
  if (journeyKey === "revenue") return "qualified prospects";
  if (journeyKey === "operations") return "delivery teams";
  return "users";
}

function contextLabelForJourney(journeyKey: string) {
  if (journeyKey === "customer") return "target customers in the customer journey";
  if (journeyKey === "revenue") return "qualified demand in the revenue journey";
  if (journeyKey === "operations") return "delivery teams in the operations journey";
  return "participants in the active journey";
}

function buildRecommendedDesiredOutcomes(items: OpportunityRow[]): DesiredOutcomeOption[] {
  const sorted = [...items].sort((a, b) => (Number(b.opportunity_score) || 0) - (Number(a.opportunity_score) || 0));
  const uniqueStepItems: OpportunityRow[] = [];
  const seenStepKeys = new Set<string>();

  for (const item of sorted) {
    const stepKey = `${String(item.step_number ?? "")}:${String(item.step_label || "").trim().toLowerCase()}`;
    if (seenStepKeys.has(stepKey)) continue;
    seenStepKeys.add(stepKey);
    uniqueStepItems.push(item);
    if (uniqueStepItems.length >= 5) break;
  }

  return uniqueStepItems.map((item, index) => {
    const journeyKey = String(item.journey_key || "").trim().toLowerCase() || "customer";
    const stepLabel = String(item.step_label || "").trim();
    const stepContext = plainEnglishStepPhrase(stepLabel, item.step_number);
    const audience = audienceLabelForJourney(journeyKey);
    const context = contextLabelForJourney(journeyKey);
    const object = `the share of ${audience} who can ${stepContext} on time without back-and-forth`;
    const metric = `Share of ${audience} who can ${stepContext} on first pass within expected time`;

    const structured = composeDesiredOutcomeFromParts({
      direction: "increase",
      metric,
      object,
      context,
      constraint: null,
    });

    return {
      id: `recommended-${journeyKey}-${index + 1}`,
      journeyKey,
      title: `Starter outcome for ${titleCaseJourney(journeyKey)}`,
      statement: structured.outcome_statement,
      leadingIndicator: structured.leading_indicator,
      targetDirection: structured.target_direction,
      direction: structured.direction,
      metric: structured.metric,
      object: structured.object,
      context: structured.context,
      constraint: structured.constraint,
      isPrimary: index === 0,
      evidenceBasis: "Recommended starter outcome generated from current opportunities. Save or edit to persist.",
      confidence: 45,
      source: "recommended" as const,
    };
  });
}

function outcomeSimilarityScore(selectedOutcome: DesiredOutcomeOption | undefined, opportunity: OpportunityRow) {
  if (!selectedOutcome) return 0;
  const selectedJourney = String(selectedOutcome.journeyKey || "").trim().toLowerCase();
  const opportunityJourney = String(opportunity.journey_key || "").trim().toLowerCase();
  const journeyMatch = selectedJourney && opportunityJourney === selectedJourney ? 2.5 : 0;

  const tokenize = (value: string) =>
    (String(value || "").toLowerCase().match(/[a-z][a-z-]{2,}/g) || []).filter(
      (token) =>
        !["the", "and", "for", "with", "into", "from", "that", "this", "your", "their", "journey", "outcome", "opportunity"].includes(
          token,
        ),
    );

  const selectedTokens = new Set(
    tokenize(`${selectedOutcome.statement} ${selectedOutcome.object} ${selectedOutcome.metric}`),
  );
  const opportunityTokens = new Set(
    tokenize(`${opportunity.outcome || ""} ${opportunity.step_label || ""}`),
  );
  let overlap = 0;
  for (const token of selectedTokens) {
    if (opportunityTokens.has(token)) overlap += 1;
  }

  return journeyMatch + overlap * 0.65;
}

function DesiredOutcomeFlipCard({
  outcome,
  accent,
}: {
  outcome?: DesiredOutcomeOption;
  accent: string;
}) {
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    setFlipped(false);
  }, [outcome?.id]);

  const statement = outcome?.statement || "Define a desired outcome to anchor this branch.";
  const targetDirection = outcome?.targetDirection || "improve";
  const evidenceBasis = outcome?.evidenceBasis || "No evidence basis provided yet.";
  const confidence = Number.isFinite(Number(outcome?.confidence)) ? Number(outcome?.confidence) : 0;

  return (
    <button
      type="button"
      onClick={() => setFlipped((current) => !current)}
      className="group mx-auto block w-full max-w-[420px] text-left"
      aria-label="Flip desired outcome card"
      title="Click to flip"
    >
      <div className="relative h-[230px] w-full [perspective:1200px]">
        <div
          className={`relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d] ${flipped ? "[transform:rotateY(180deg)]" : ""}`}
        >
          <div
            className="absolute inset-0 rounded-[24px] border px-5 py-4 shadow-sm [backface-visibility:hidden]"
            style={{ borderColor: c.line, background: "#F8F4ED" }}
          >
            <div
              className="mb-3 flex h-10 w-10 items-center justify-center rounded-full"
              style={{ background: `${accent}18`, color: accent }}
            >
              <Sparkles className="h-4 w-4" />
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
              Desired outcome
            </p>
            <p className="mt-2 font-sans text-[16px] font-semibold leading-[1.4]" style={{ color: c.charcoal }}>
              {statement}
            </p>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
              Tap to flip for details
            </p>
          </div>

          <div
            className="absolute inset-0 rounded-[24px] border px-5 py-4 shadow-sm [backface-visibility:hidden] [transform:rotateY(180deg)]"
            style={{ borderColor: c.line, background: "#FFFFFF" }}
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
              Outcome details
            </p>
            <p className="mt-2 font-sans text-[13px] leading-[1.55]" style={{ color: c.secondary }}>
              <span className="font-semibold" style={{ color: c.charcoal }}>Target direction:</span> {targetDirection}
            </p>
            <p className="mt-2 font-sans text-[13px] leading-[1.55]" style={{ color: c.secondary }}>
              <span className="font-semibold" style={{ color: c.charcoal }}>Evidence:</span> {evidenceBasis}
            </p>
            <p className="mt-2 font-sans text-[13px] leading-[1.55]" style={{ color: c.secondary }}>
              <span className="font-semibold" style={{ color: c.charcoal }}>Confidence:</span> {confidence}/100
            </p>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
              Tap to flip back
            </p>
          </div>
        </div>
      </div>
    </button>
  );
}

function WorkflowStatusPicker({
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  value: WorkflowStatus;
  onChange: (value: WorkflowStatus) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as WorkflowStatus)} disabled={disabled}>
      <SelectTrigger
        className={`${compact ? "h-7 w-[132px] shrink-0" : "h-8 w-[148px] shrink-0"} max-w-full border bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em]`}
        style={{ borderColor: c.line, color: c.secondary }}
      >
        <SelectValue placeholder="Set workflow" />
      </SelectTrigger>
      <SelectContent className="border-[#DDE6D1] bg-white text-[#233C4B] shadow-[0_14px_32px_rgba(35,60,75,0.14)]">
        {WORKFLOW_STATUS_OPTIONS.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className="font-mono text-[10px] uppercase tracking-[0.08em] focus:bg-[#EEF4FF] focus:text-[#233C4B]"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function OpportunityCard({
  item,
  opportunityNumber,
  workflowStatus,
  workflowStatusAvailable,
  workflowSaving = false,
  onWorkflowChange,
  showJourneyBadge = true,
  isTargeted = false,
  innovationStrategy = null,
  hideWorkflowPicker = false,
}: {
  item: OpportunityRow;
  opportunityNumber?: string;
  workflowStatus: WorkflowStatus;
  workflowStatusAvailable: boolean;
  workflowSaving?: boolean;
  onWorkflowChange: (item: OpportunityRow, next: WorkflowStatus) => void;
  showJourneyBadge?: boolean;
  isTargeted?: boolean;
  innovationStrategy?: string | null;
  hideWorkflowPicker?: boolean;
}) {
  const [expanded, setExpanded] = useState(isTargeted);
  useEffect(() => {
    if (isTargeted) setExpanded(true);
  }, [isTargeted]);
  const accent = JOURNEY_ACCENT[item.journey_key] || c.monitor;
  const strategyAlignment = (() => {
    if (!innovationStrategy) return null;
    const meta = STRATEGY_META[innovationStrategy as InnovationStrategy];
    if (!meta) return null;
    const state = deriveServiceState(item.importance, item.satisfaction);
    return meta.cardAlign(state);
  })();
  const evidenceNeeded = [
    item.step_label
      ? `Confirm where "${item.step_label}" currently breaks down in practice`
      : "Tie this opportunity to a named checkpoint or workflow moment",
    "Collect direct customer, operator, or buyer language for this outcome",
    item.priority_tier === "focus"
      ? "Validate importance and dissatisfaction with interviews or survey inputs"
      : "Gather enough evidence to confirm this is worth prioritizing",
  ];
  const nextStep =
    item.priority_tier === "focus"
      ? "Interview users around this outcome before choosing a solution path."
      : item.priority_tier === "monitor"
        ? "Tighten evidence, then decide whether this should move into the focus lane."
        : "Keep this visible, but do not invest heavily until stronger underserved outcomes are confirmed.";
  const score = formatOdiScore(odiScore(item));
  const actionType = opportunityActionFromPriorityTier(item.priority_tier);
  const stepContext = item.step_number ? `Step ${item.step_number}` : "Unassigned step";
  const stepContextDetail = item.step_label ? ` · ${item.step_label}` : "";

  return (
    <div
      id={`opportunity-${item.id}`}
      className="overflow-hidden rounded-2xl border"
      style={{
        borderColor: isTargeted ? c.charcoal : c.line,
        background: c.paper,
        boxShadow: isTargeted
          ? "0 0 0 3px rgba(35,60,75,0.16), 0 6px 22px rgba(35,60,75,0.10)"
          : "0 1px 2px rgba(0,0,0,0.03)",
      }}
    >
      <div className="h-[5px] w-full" style={{ background: accent }} />
      <button type="button" onClick={() => setExpanded((value) => !value)} className="w-full cursor-pointer px-5 pt-5 text-left">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-2">
            <OpportunityNumberBadge value={opportunityNumber} />
            <div className="min-w-0">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.08em] whitespace-nowrap" style={{ color: c.secondary }}>
                {showJourneyBadge ? `${titleCaseJourney(item.journey_key)}` : ""}
              </p>

              <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                Desired Outcome Opportunity
              </p>
              <h3 className="mt-1 font-sans text-[16px] font-semibold leading-tight" style={{ color: c.charcoal }}>
                {humanizeOutcomeText(item.outcome) || "Untitled opportunity"}
              </h3>
              {isTargeted ? (
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.charcoal }}>
                  Opened from map insight
                </p>
              ) : null}

              <p className="mt-3 font-sans text-[13px]" style={{ color: c.secondary }}>
                <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                  Checkpoint context:
                </span>{" "}
                {stepContext}
                {stepContextDetail}
              </p>
            </div>
          </div>

          <div className="text-right">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
              Opp Score
            </p>
            <p className="font-sans text-[20px] font-semibold leading-none mt-1" style={{ color: c.charcoal }}>
              {score}
            </p>
            <div style={{ color: c.muted }}>{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</div>
          </div>
        </div>
      </button>
      <div className="px-5 pb-4">
        <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3" style={{ borderColor: c.line }}>
          <p
            className="font-sans text-[14px] font-semibold tracking-[0.01em]"
            style={{ color: priorityAccent(item.priority_tier) }}
          >
            {priorityLabel(item.priority_tier)}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <StateBadge tone={deriveServiceState(item.importance, item.satisfaction)} />
            {strategyAlignment === "strong" ? (
              <span className="inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ borderColor: "#B6DFB8", background: "#EEF6E7", color: "#1F6A5B" }}>
                Fits strategy
              </span>
            ) : strategyAlignment === "conflict" ? (
              <span className="inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ borderColor: "#F1C3AC", background: "#FFF4EC", color: "#915E46" }}>
                Low fit
              </span>
            ) : null}
            <ActionTypeBadge label={actionType} />
            {!hideWorkflowPicker ? (
              <WorkflowStatusPicker
                value={workflowStatus}
                compact
                disabled={workflowSaving}
                onChange={(next) => onWorkflowChange(item, next)}
              />
            ) : null}
          </div>
        </div>
      </div>

      {expanded ? (
        <div className="border-t p-5 pt-4 animate-fade-in-up" style={{ borderColor: c.line }}>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                Next Step
              </p>
              <p className="mt-2 font-sans text-[12px] leading-[1.65]" style={{ color: c.secondary }}>
                {nextStep}
              </p>
            </div>

            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                Missing Evidence
              </p>
              <ul className="mt-2 space-y-2">
                {evidenceNeeded.map((entry, index) => (
                  <li
                    key={`${item.id}-evidence-${index}`}
                    className="flex items-start gap-2 font-sans text-[12px] leading-[1.6]"
                    style={{ color: c.secondary }}
                  >
                    <span style={{ color: accent }}>•</span>
                    <span>{entry}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OpportunitySection({
  title,
  subtitle,
  items,
  opportunityNumberById,
  workflowStatusAvailable,
  updatingWorkflowId,
  onWorkflowChange,
  subtitleItalic = false,
  showJourneyBadge = true,
  targetOpportunityId,
  innovationStrategy = null,
}: {
  title: string;
  subtitle: string;
  items: OpportunityRow[];
  opportunityNumberById: Map<string, string>;
  workflowStatusAvailable: boolean;
  updatingWorkflowId: string | null;
  onWorkflowChange: (item: OpportunityRow, next: WorkflowStatus) => void;
  subtitleItalic?: boolean;
  showJourneyBadge?: boolean;
  targetOpportunityId?: string | null;
  innovationStrategy?: string | null;
}) {
  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-sans text-[24px] font-semibold" style={{ color: c.charcoal }}>
            {title}
          </h2>
          <p className={`font-sans text-[13px] ${subtitleItalic ? "italic" : ""}`} style={{ color: c.secondary }}>
            {subtitle}
          </p>
        </div>

        <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
          {items.length} opportunities
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {items.map((item) => (
          <OpportunityCard
            key={item.id}
            item={item}
            opportunityNumber={opportunityNumberById.get(item.id)}
            workflowStatus={resolveWorkflowStatus(item)}
            workflowStatusAvailable={workflowStatusAvailable}
            workflowSaving={updatingWorkflowId === item.id}
            onWorkflowChange={onWorkflowChange}
            showJourneyBadge={showJourneyBadge}
            isTargeted={targetOpportunityId === item.id}
            innovationStrategy={innovationStrategy}
          />
        ))}
      </div>
    </section>
  );
}

// Workflow status badge colors (still stored, shown as badge on each card)
const WORKFLOW_STATUS_BADGE: Record<WorkflowStatus, { label: string; bg: string; fg: string; border: string }> = {
  in_progress: { label: "In Progress", bg: "#FFF4EC", fg: "#FF7D2D", border: "#FFD1B4" },
  planned:     { label: "Planned",     bg: "#FFFCE8", fg: "#C48A2A", border: "#F3D77A" },
  parked:      { label: "Parked",      bg: "#F4F6F5", fg: "#6E847F", border: "#C8D8CA" },
};

function CheckpointListSection({
  items,
  jobSteps,
  opportunityNumberById,
  workflowStatusAvailable,
  updatingWorkflowId,
  onWorkflowChange,
  showJourneyBadge = true,
  targetOpportunityId,
  innovationStrategy = null,
}: {
  items: OpportunityRow[];
  jobSteps: Array<{ id: string; journey_key: string; step_number: number | null; step_label: string | null; journey_title?: string | null }>;
  opportunityNumberById: Map<string, string>;
  workflowStatusAvailable: boolean;
  updatingWorkflowId: string | null;
  onWorkflowChange: (item: OpportunityRow, next: WorkflowStatus) => void;
  showJourneyBadge?: boolean;
  targetOpportunityId?: string | null;
  innovationStrategy?: string | null;
}) {
  // Group opportunities by step_number + journey_key
  const grouped = useMemo(() => {
    const byKey = new Map<string, { stepLabel: string; journeyKey: string; stepNumber: number | null; items: OpportunityRow[] }>();

    for (const item of items) {
      const key = `${item.journey_key}::${item.step_number ?? ""}::${item.step_label ?? ""}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          stepLabel: item.step_label || "",
          journeyKey: item.journey_key || "",
          stepNumber: item.step_number ?? null,
          items: [],
        });
      }
      byKey.get(key)!.items.push(item);
    }

    // Sort items within each group by opportunity_score desc
    for (const group of byKey.values()) {
      group.items.sort((a, b) => (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0));
    }

    // Sort groups: by journey_key (customer, revenue, operations) then step_number asc
    const journeyOrder: Record<string, number> = { customer: 0, revenue: 1, operations: 2 };
    const sorted = Array.from(byKey.values()).sort((a, b) => {
      const jDiff = (journeyOrder[a.journeyKey] ?? 9) - (journeyOrder[b.journeyKey] ?? 9);
      if (jDiff !== 0) return jDiff;
      return (a.stepNumber ?? 999) - (b.stepNumber ?? 999);
    });

    // Groups with no step label go at the bottom
    const withStep = sorted.filter((g) => g.stepLabel || g.stepNumber !== null);
    const noStep = sorted.filter((g) => !g.stepLabel && g.stepNumber === null);
    return [...withStep, ...noStep];
  }, [items]);

  if (items.length === 0) return null;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-sans text-[24px] font-semibold" style={{ color: c.charcoal }}>
          Opportunities by Checkpoint
        </h2>
        <p className="font-sans text-[13px]" style={{ color: c.secondary }}>
          Opportunities grouped under the job step where they have the most impact. Sorted by opportunity score within each step.
        </p>
      </div>

      {grouped.map((group) => {
        const accentColor = JOURNEY_ACCENT[group.journeyKey] ?? c.muted;
        const groupLabel = group.stepLabel
          ? `${group.stepLabel}${group.stepNumber !== null ? ` (Step ${group.stepNumber})` : ""}`
          : group.stepNumber !== null
          ? `Step ${group.stepNumber}`
          : "Unassigned";

        return (
          <div key={`${group.journeyKey}::${group.stepNumber}::${group.stepLabel}`}>
            {/* Step header */}
            <div
              className="flex items-center gap-3 mb-3 pb-2"
              style={{ borderBottom: `2px solid ${accentColor}20` }}
            >
              <div
                className="h-[18px] w-[3px] rounded-full shrink-0"
                style={{ background: accentColor }}
              />
              <div>
                <p
                  className="font-mono text-[10px] uppercase tracking-[0.08em]"
                  style={{ color: accentColor }}
                >
                  {group.journeyKey}
                </p>
                <p className="font-sans text-[15px] font-semibold leading-tight" style={{ color: c.charcoal }}>
                  {groupLabel}
                </p>
              </div>
              <span
                className="ml-auto font-mono text-[10px] rounded-full border px-2 py-0.5"
                style={{ borderColor: c.line, color: c.muted, background: "#FFFFFF" }}
              >
                {group.items.length}
              </span>
            </div>

            {/* Opportunity cards for this step */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {group.items.map((item) => (
                <div key={item.id} className="relative">
                  <OpportunityCard
                    item={item}
                    opportunityNumber={opportunityNumberById.get(item.id)}
                    workflowStatus={resolveWorkflowStatus(item)}
                    workflowStatusAvailable={workflowStatusAvailable}
                    workflowSaving={updatingWorkflowId === item.id}
                    onWorkflowChange={onWorkflowChange}
                    showJourneyBadge={showJourneyBadge}
                    isTargeted={targetOpportunityId === item.id}
                    innovationStrategy={innovationStrategy}
                    hideWorkflowPicker
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

type ViewMode = "list" | "map" | "checkpoint-offers" | "landscape";

/* ── Landscape (2×2 scatter) helpers ── */
const LAND_W = 540;
const LAND_H = 460;
const LAND_PL = 44;
const LAND_PT = 16;
const LAND_PR = 16;
const LAND_PB = 44;
const LAND_IW = LAND_W - LAND_PL - LAND_PR;
const LAND_IH = LAND_H - LAND_PT - LAND_PB;

function lx(sat: number) {
  return LAND_PL + (Math.max(0, Math.min(10, Number(sat) || 0)) / 10) * LAND_IW;
}
function ly(imp: number) {
  return LAND_PT + LAND_IH * (1 - Math.max(0, Math.min(10, Number(imp) || 0)) / 10);
}
function lr(score: number | null) {
  return Math.max(5, Math.min(18, 4 + (Number(score) || 0) * 0.75));
}

const LAND_QUADRANT = [
  { x: LAND_PL, y: LAND_PT, w: LAND_IW / 2, h: LAND_IH / 2, fill: "#FFF4EC", label: "Underserved", sub: "High importance · Low satisfaction", textX: LAND_PL + 8, textY: LAND_PT + 16 },
  { x: LAND_PL + LAND_IW / 2, y: LAND_PT, w: LAND_IW / 2, h: LAND_IH / 2, fill: "#EEF6F4", label: "Served", sub: "High importance · High satisfaction", textX: LAND_PL + LAND_IW / 2 + 8, textY: LAND_PT + 16 },
  { x: LAND_PL, y: LAND_PT + LAND_IH / 2, w: LAND_IW / 2, h: LAND_IH / 2, fill: "#F8F8F8", label: "Low Priority", sub: "Low importance · Low satisfaction", textX: LAND_PL + 8, textY: LAND_PT + LAND_IH / 2 + 16 },
  { x: LAND_PL + LAND_IW / 2, y: LAND_PT + LAND_IH / 2, w: LAND_IW / 2, h: LAND_IH / 2, fill: "#F4F6FB", label: "Overserved", sub: "Low importance · High satisfaction", textX: LAND_PL + LAND_IW / 2 + 8, textY: LAND_PT + LAND_IH / 2 + 16 },
];

function LandscapeView({
  items,
  opportunityNumberById,
  innovationStrategy,
}: {
  items: OpportunityRow[];
  opportunityNumberById: Map<string, string>;
  innovationStrategy: string | null;
}) {
  const [hovered, setHovered] = useState<{ item: OpportunityRow; svgX: number; svgY: number } | null>(null);
  const validItems = items.filter(
    (item) => Number.isFinite(Number(item.importance)) && Number.isFinite(Number(item.satisfaction)),
  );
  const ticks = [0, 2, 4, 6, 8, 10];
  const strategyMeta = innovationStrategy ? STRATEGY_META[innovationStrategy as InnovationStrategy] ?? null : null;
  const focusQuadrant = strategyMeta?.focusQuadrant ?? null;

  function quadrantFill(label: string) {
    if (!focusQuadrant || focusQuadrant === "all") {
      if (label === "Underserved") return "#FFF4EC";
      if (label === "Served") return "#EEF6F4";
      if (label === "Overserved") return "#F4F6FB";
      return "#F8F8F8";
    }
    const isEmphasis =
      (focusQuadrant === "underserved" && label === "Underserved") ||
      (focusQuadrant === "overserved" && label === "Overserved");
    if (isEmphasis) return focusQuadrant === "underserved" ? "#FFE9D6" : "#E8EEF8";
    return "#FAFAFA";
  }

  function quadrantStroke(label: string) {
    if (!focusQuadrant || focusQuadrant === "all") return "none";
    const isEmphasis =
      (focusQuadrant === "underserved" && label === "Underserved") ||
      (focusQuadrant === "overserved" && label === "Overserved");
    return isEmphasis ? (focusQuadrant === "underserved" ? "#E8703A" : "#6680B8") : "none";
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[24px] border p-5" style={{ borderColor: c.line, background: c.panel }}>
        <h2 className="font-sans text-[22px] font-semibold" style={{ color: c.charcoal }}>
          Opportunity Landscape
        </h2>
        <p className="mt-2 max-w-3xl font-sans text-[13px] leading-[1.7]" style={{ color: c.secondary }}>
          Each circle is one opportunity, plotted by importance (Y) and satisfaction (X). Circle size reflects the opportunity score. Top-left quadrant (high importance, low satisfaction) is where to focus first.
        </p>
        {strategyMeta ? (
          <div className="mt-3 rounded-lg border px-3 py-2.5" style={{ borderColor: c.line, background: "#FAF9F6" }}>
            <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
              {strategyMeta.label} strategy
            </p>
            <p className="mt-1 font-sans text-[12px] leading-[1.55]" style={{ color: c.secondary }}>
              {strategyMeta.banner}
            </p>
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-4">
          {(["customer", "revenue", "operations"] as const).map((key) => (
            <span key={key} className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: JOURNEY_ACCENT[key] }} />
              {key.charAt(0).toUpperCase() + key.slice(1)}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-[24px] border p-5" style={{ borderColor: c.line, background: c.panel }}>
        {validItems.length === 0 ? (
          <p className="font-sans text-[13px]" style={{ color: c.secondary }}>
            No opportunities with importance and satisfaction scores yet.
          </p>
        ) : (
          <div className="relative inline-block">
            <svg
              width={LAND_W}
              height={LAND_H}
              className="overflow-visible"
              onMouseLeave={() => setHovered(null)}
            >
              {/* Quadrant fills */}
              {LAND_QUADRANT.map((q) => (
                <rect key={q.label} x={q.x} y={q.y} width={q.w} height={q.h} fill={quadrantFill(q.label)} stroke={quadrantStroke(q.label)} strokeWidth={focusQuadrant && focusQuadrant !== "all" ? 1.5 : 0} />
              ))}

              {/* Quadrant labels */}
              {LAND_QUADRANT.map((q) => (
                <text key={`${q.label}-label`} x={q.textX} y={q.textY} fontSize={9} fontFamily="monospace" textAnchor="start" fill="#9aa0a6" style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {q.label}
                </text>
              ))}

              {/* Grid lines at midpoint */}
              <line x1={lx(5)} y1={LAND_PT} x2={lx(5)} y2={LAND_PT + LAND_IH} stroke="#d0d8d4" strokeWidth={1} strokeDasharray="4 3" />
              <line x1={LAND_PL} y1={ly(5)} x2={LAND_PL + LAND_IW} y2={ly(5)} stroke="#d0d8d4" strokeWidth={1} strokeDasharray="4 3" />

              {/* Axis ticks + labels — X (satisfaction) */}
              {ticks.map((t) => (
                <g key={`xt-${t}`}>
                  <line x1={lx(t)} y1={LAND_PT + LAND_IH} x2={lx(t)} y2={LAND_PT + LAND_IH + 4} stroke="#c0c8c4" strokeWidth={1} />
                  <text x={lx(t)} y={LAND_PT + LAND_IH + 14} fontSize={9} textAnchor="middle" fill="#9aa0a6" fontFamily="monospace">{t}</text>
                </g>
              ))}
              <text x={LAND_PL + LAND_IW / 2} y={LAND_H - 2} fontSize={9} textAnchor="middle" fill="#6e847f" fontFamily="monospace" style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}>Satisfaction →</text>

              {/* Axis ticks + labels — Y (importance) */}
              {ticks.map((t) => (
                <g key={`yt-${t}`}>
                  <line x1={LAND_PL - 4} y1={ly(t)} x2={LAND_PL} y2={ly(t)} stroke="#c0c8c4" strokeWidth={1} />
                  <text x={LAND_PL - 7} y={ly(t) + 3} fontSize={9} textAnchor="end" fill="#9aa0a6" fontFamily="monospace">{t}</text>
                </g>
              ))}
              <text
                x={10}
                y={LAND_PT + LAND_IH / 2}
                fontSize={9}
                textAnchor="middle"
                fill="#6e847f"
                fontFamily="monospace"
                style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
                transform={`rotate(-90, 10, ${LAND_PT + LAND_IH / 2})`}
              >
                Importance →
              </text>

              {/* Plot border */}
              <rect x={LAND_PL} y={LAND_PT} width={LAND_IW} height={LAND_IH} fill="none" stroke="#d0d8d4" strokeWidth={1} />

              {/* Points */}
              {validItems.map((item) => {
                const cx = lx(Number(item.satisfaction));
                const cy = ly(Number(item.importance));
                const r = lr(item.opportunity_score);
                const fill = JOURNEY_ACCENT[String(item.journey_key)] || c.monitor;
                const isHovered = hovered?.item.id === item.id;
                return (
                  <circle
                    key={item.id}
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={fill}
                    fillOpacity={isHovered ? 0.95 : 0.72}
                    stroke={isHovered ? c.charcoal : fill}
                    strokeWidth={isHovered ? 2 : 1}
                    style={{ cursor: "pointer", transition: "fill-opacity 0.12s" }}
                    onMouseEnter={() => setHovered({ item, svgX: cx, svgY: cy })}
                    onMouseMove={() => setHovered({ item, svgX: cx, svgY: cy })}
                  />
                );
              })}

              {/* Tooltip (SVG foreignObject) */}
              {hovered ? (() => {
                const tw = 220;
                const th = 90;
                const tx = Math.min(hovered.svgX + 12, LAND_W - tw - 4);
                const ty = Math.max(hovered.svgY - th / 2, LAND_PT);
                return (
                  <foreignObject x={tx} y={ty} width={tw} height={th} style={{ pointerEvents: "none" }}>
                    <div
                      style={{
                        background: "#fff",
                        border: "1px solid #d0d8d4",
                        borderRadius: 10,
                        padding: "8px 10px",
                        boxShadow: "0 4px 14px rgba(0,0,0,0.10)",
                        fontSize: 11,
                        lineHeight: 1.5,
                        color: "#233C4B",
                        fontFamily: "sans-serif",
                      }}
                    >
                      <div style={{ fontFamily: "monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6e847f", marginBottom: 4 }}>
                        {opportunityNumberById.get(hovered.item.id) || "—"} · {String(hovered.item.journey_key || "").charAt(0).toUpperCase() + String(hovered.item.journey_key || "").slice(1)}
                      </div>
                      <div style={{ fontWeight: 600, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                        {String(hovered.item.outcome || "Untitled opportunity")}
                      </div>
                      <div style={{ fontFamily: "monospace", fontSize: 9, marginTop: 6, color: "#46606d" }}>
                        I {Number(hovered.item.importance ?? 0).toFixed(1)} · S {Number(hovered.item.satisfaction ?? 0).toFixed(1)} · Score {Number(hovered.item.opportunity_score ?? 0).toFixed(1)}
                      </div>
                    </div>
                  </foreignObject>
                );
              })() : null}
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}

function ViewToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  return (
    <div
      className="inline-flex rounded-full border p-1"
      style={{ borderColor: c.line, background: c.card }}
    >
      {([
        { key: "list", label: "List View" },
        { key: "map", label: "Opportunity Map" },
        { key: "landscape", label: "Landscape" },
        { key: "checkpoint-offers", label: "Checkpoint Offers" },
      ] as const).map((item) => {
        const active = mode === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className="rounded-full px-4 py-2 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors"
            style={{
              background: active ? c.charcoal : "transparent",
              color: active ? "#fff" : c.secondary,
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function OpportunityTreeView({
  items,
  managedOutcomes,
  solutionIdeas,
  solutionTests,
  savingManagedOutcome,
  onCreateManagedOutcome,
  onUpdateManagedOutcome,
  opportunityNumberById,
  workflowStatusAvailable,
  managedOutcomeLinkAvailable,
  updatingWorkflowId,
  onWorkflowChange,
  showJourneyBadge = true,
  targetOpportunityId,
}: {
  items: OpportunityRow[];
  managedOutcomes: Array<{
    id: string;
    journey_key: string;
    outcome_title: string;
    outcome_statement: string;
    leading_indicator: string;
    target_direction: string;
    direction: string;
    metric: string;
    object: string;
    context: string;
    constraint: string | null;
    is_primary: boolean;
    evidence_basis: string;
    confidence: number;
    frameworks_used?: string[];
  }>;
  solutionIdeas: SolutionIdeaRow[];
  solutionTests: SolutionTestRow[];
  savingManagedOutcome: boolean;
  onCreateManagedOutcome: (input: {
    journey_key: string;
    outcome_title: string;
    outcome_statement: string;
    leading_indicator: string;
    target_direction: string;
    direction: string;
    metric: string;
    object: string;
    context: string;
    constraint?: string | null;
    is_primary?: boolean;
    evidence_basis: string;
    confidence: number;
    frameworks_used?: string[];
  }) => Promise<{ id: string } | void>;
  onUpdateManagedOutcome: (id: string, patch: {
    outcome_title?: string;
    outcome_statement?: string;
    leading_indicator?: string;
    target_direction?: string;
    direction?: string;
    metric?: string;
    object?: string;
    context?: string;
    constraint?: string | null;
    is_primary?: boolean;
    evidence_basis?: string;
    confidence?: number;
    frameworks_used?: string[];
  }) => Promise<{ id: string } | void>;
  opportunityNumberById: Map<string, string>;
  workflowStatusAvailable: boolean;
  managedOutcomeLinkAvailable: boolean;
  updatingWorkflowId: string | null;
  onWorkflowChange: (item: OpportunityRow, next: WorkflowStatus) => void;
  showJourneyBadge?: boolean;
  targetOpportunityId?: string | null;
}) {
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<string>("");
  const [openOpportunityId, setOpenOpportunityId] = useState<string | null>(null);

  const ideasByOpportunity = useMemo(() => {
    const map = new Map<string, SolutionIdeaRow[]>();
    for (const idea of solutionIdeas) {
      const key = String(idea.opportunity_id || "").trim();
      if (!key) continue;
      const current = map.get(key) || [];
      current.push(idea);
      map.set(key, current);
    }
    for (const [key, list] of map.entries()) {
      map.set(
        key,
        list
          .filter((item) => {
            const validation = validateSolutionIdea({
              title: item.title,
              description: item.description,
              frameworksUsed: item.frameworks_used,
            });
            return validation.valid;
          })
          .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)),
      );
    }
    return map;
  }, [solutionIdeas]);

  const testsBySolution = useMemo(() => {
    const map = new Map<string, SolutionTestRow[]>();
    for (const test of solutionTests) {
      const key = String(test.solution_idea_id || "").trim();
      if (!key) continue;
      const current = map.get(key) || [];
      current.push(test);
      map.set(key, current);
    }
    for (const [key, list] of map.entries()) {
      map.set(
        key,
        list
          .filter((item) => {
            const validation = validateSolutionTest({
              title: item.title,
              method: item.method,
              metric: item.metric,
              successThreshold: item.success_threshold,
              timebox: item.timebox,
              frameworksUsed: item.frameworks_used,
            });
            return validation.valid;
          })
          .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)),
      );
    }
    return map;
  }, [solutionTests]);

  const managedOutcomeOptions = useMemo<DesiredOutcomeOption[]>(() => {
    return managedOutcomes
      .filter((outcome) =>
        validateDesiredOutcome({
          statement: String(outcome.outcome_statement || outcome.outcome_title || ""),
          leadingIndicator: String(outcome.leading_indicator || ""),
          targetDirection: String(outcome.target_direction || ""),
          direction: String(outcome.direction || outcome.target_direction || ""),
          metric: String(outcome.metric || outcome.leading_indicator || ""),
          object: String(outcome.object || ""),
          context: String(outcome.context || ""),
          constraint: String(outcome.constraint || ""),
          frameworksUsed: ensureRequiredFrameworkKeys(outcome.frameworks_used || []),
        }).valid,
      )
      .map((outcome) => {
        const journeyKey = String(outcome.journey_key || "").trim().toLowerCase() || "customer";
        const structured = composeDesiredOutcomeFromParts({
          direction: normalizeDesiredOutcomeDirection(outcome.direction || outcome.target_direction || "increase"),
          metric: outcome.metric || outcome.leading_indicator || "Leading indicator to validate",
          object: outcome.object || outcome.outcome_statement || outcome.outcome_title || journeyRootLabel(journeyKey),
          context: outcome.context || `${titleCaseJourney(journeyKey)} journey`,
          constraint: outcome.constraint || null,
          is_primary: outcome.is_primary,
        });
        return {
          id: `managed-${outcome.id}`,
          journeyKey,
          title: structured.outcome_statement,
          statement: structured.outcome_statement,
          leadingIndicator: structured.leading_indicator,
          targetDirection: structured.target_direction,
          direction: structured.direction,
          metric: structured.metric,
          object: structured.object,
          context: structured.context,
          constraint: structured.constraint,
          isPrimary: outcome.is_primary === true,
          evidenceBasis: outcome.evidence_basis || "Derived from current evidence",
          confidence: Number.isFinite(Number(outcome.confidence)) ? Number(outcome.confidence) : 55,
          source: "managed_outcome" as const,
          managedOutcomeId: outcome.id,
        };
      })
      .sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        if (a.journeyKey !== b.journeyKey) return a.journeyKey.localeCompare(b.journeyKey);
        return b.confidence - a.confidence;
      });
  }, [managedOutcomes]);

  const recommendedOutcomeOptions = useMemo(() => buildRecommendedDesiredOutcomes(items), [items]);

  const desiredOutcomeOptions = useMemo(() => {
    if (managedOutcomeOptions.length === 0) return recommendedOutcomeOptions;
    const existing = new Set(managedOutcomeOptions.map((option) => option.statement.toLowerCase()));
    const recommendedDistinct = recommendedOutcomeOptions.filter(
      (option) => !existing.has(option.statement.toLowerCase()),
    );
    return [...managedOutcomeOptions, ...recommendedDistinct];
  }, [managedOutcomeOptions, recommendedOutcomeOptions]);

  useEffect(() => {
    if (desiredOutcomeOptions.length === 0) {
      setSelectedOutcomeId("");
      return;
    }
    const ids = new Set(desiredOutcomeOptions.map((option) => option.id));
    if (!selectedOutcomeId || !ids.has(selectedOutcomeId)) {
      setSelectedOutcomeId(desiredOutcomeOptions[0].id);
    }
  }, [desiredOutcomeOptions, selectedOutcomeId]);

  const selectedOutcome =
    desiredOutcomeOptions.find((option) => option.id === selectedOutcomeId) ||
    desiredOutcomeOptions[0];

  const selectedManagedOutcomeId = String(selectedOutcome?.managedOutcomeId || "");
  const useManagedFilter =
    selectedOutcome?.source === "managed_outcome" &&
    managedOutcomeLinkAvailable &&
    Boolean(selectedManagedOutcomeId);

  const visibleOpportunities = useMemo(
    () => {
      if (useManagedFilter) {
        return items
          .filter((item) => String(item.managed_outcome_id || "") === selectedManagedOutcomeId)
          .sort((a, b) => (Number(b.opportunity_score) || 0) - (Number(a.opportunity_score) || 0));
      }

      const selectedJourney = String(selectedOutcome?.journeyKey || "").trim().toLowerCase();
      const journeyPool = selectedJourney
        ? items.filter((item) => String(item.journey_key || "").trim().toLowerCase() === selectedJourney)
        : items;
      const basePool = journeyPool.length > 0 ? journeyPool : items;

      const scored = basePool
        .map((item) => ({
          item,
          score: outcomeSimilarityScore(selectedOutcome, item),
        }))
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return (Number(b.item.opportunity_score) || 0) - (Number(a.item.opportunity_score) || 0);
        });

      const semanticBranch = scored.filter((entry) => entry.score > 0).slice(0, 16).map((entry) => entry.item);
      if (semanticBranch.length >= 4) {
        return semanticBranch;
      }

      return [...basePool].sort((a, b) => (Number(b.opportunity_score) || 0) - (Number(a.opportunity_score) || 0));
    },
    [items, selectedManagedOutcomeId, selectedOutcome, useManagedFilter],
  );

  const tree = useMemo(() => buildOpportunityTree(visibleOpportunities), [visibleOpportunities]);

  useEffect(() => {
    setOpenOpportunityId(null);
  }, [selectedOutcomeId]);

  useEffect(() => {
    if (tree.nodesById.size === 0) {
      setOpenOpportunityId(null);
      return;
    }
    if (openOpportunityId && tree.nodesById.has(openOpportunityId)) return;
    if (targetOpportunityId && tree.nodesById.has(targetOpportunityId)) {
      setOpenOpportunityId(targetOpportunityId);
      return;
    }
    setOpenOpportunityId(pickDefaultOpenOpportunityId(tree.roots));
  }, [openOpportunityId, targetOpportunityId, tree]);

  const openNode = openOpportunityId ? tree.nodesById.get(openOpportunityId) : undefined;
  const openItem = openNode?.item;
  const openSolutions = useMemo(
    () =>
      (openItem ? ideasByOpportunity.get(openItem.id) || [] : []).map((solution) => ({
        ...solution,
        tests: testsBySolution.get(solution.id) || [],
      })),
    [ideasByOpportunity, openItem, testsBySolution],
  );

  const selectedAccent = JOURNEY_ACCENT[selectedOutcome?.journeyKey || ""] || c.monitor;

  const renderNodes = (nodes: OpportunityTreeNode<OpportunityRow>[]) => {
    if (nodes.length === 0) return null;
    return (
      <div className="space-y-2">
        {nodes.map((node) => {
          const isOpen = node.id === openOpportunityId;
          const number = opportunityNumberById.get(node.id);
          const readableOutcome = humanizeOutcomeText(node.item.outcome);
          return (
            <div key={node.id}>
              <button
                type="button"
                onClick={() => setOpenOpportunityId(node.id)}
                title={readableOutcome || "Untitled opportunity"}
                className="flex w-full items-center gap-2 rounded-md border px-2 py-1 text-left transition-colors hover:bg-[#F8FBF8]"
                style={{
                  marginLeft: `${node.depth * 14}px`,
                  borderColor: isOpen ? c.charcoal : c.line,
                  background: isOpen ? "#F2F7F3" : "#FFFFFF",
                }}
              >
                <span
                  className="inline-flex h-2.5 w-2.5 rounded-full"
                  style={{ background: isOpen ? selectedAccent : `${selectedAccent}66` }}
                />
                <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
                  {number || "—"}
                </span>
                {isOpen ? (
                  <span className="truncate font-sans text-[12px]" style={{ color: c.charcoal }}>
                    {readableOutcome || "Untitled opportunity"}
                  </span>
                ) : null}
              </button>
              {node.children.length > 0 ? renderNodes(node.children) : null}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[24px] border p-5" style={{ borderColor: c.line, background: c.panel }}>
        <h2 className="font-sans text-[22px] font-semibold" style={{ color: c.charcoal }}>
          Opportunity Solution Tree
        </h2>
        <p className="mt-2 max-w-4xl font-sans text-[13px] leading-[1.7]" style={{ color: c.secondary }}>
          Select one desired outcome, scan opportunity branches, and open one opportunity at a time to inspect its solution ideas and assumption tests.
        </p>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
          Desired outcome → opportunities → solution ideas → assumption tests
        </p>
      </div>

      <section className="rounded-[28px] border p-4 sm:p-5" style={{ borderColor: c.line, background: c.panel }}>
        <div className="max-w-[920px] space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
            Desired outcome
          </p>
          {desiredOutcomeOptions.length > 0 ? (
            <>
              <Select value={selectedOutcome?.id || ""} onValueChange={setSelectedOutcomeId}>
                <SelectTrigger
                  className="h-9 max-w-full border bg-white px-3 py-1 text-left font-sans text-[13px]"
                  style={{ borderColor: c.line, color: c.charcoal }}
                >
                  <SelectValue placeholder="Choose desired outcome" />
                </SelectTrigger>
                <SelectContent className="border-[#DDE6D1] bg-white text-[#233C4B] shadow-[0_14px_32px_rgba(35,60,75,0.14)]">
                  {desiredOutcomeOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id} className="text-[12px] leading-[1.45]">
                      {titleCaseJourney(option.journeyKey)} · {option.statement}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="font-sans text-[12px]" style={{ color: c.secondary }}>
                {selectedOutcome?.source === "recommended"
                  ? "Recommended starter from current research and opportunity evidence."
                  : "Showing opportunities linked to this persisted desired outcome branch."}
              </p>
            </>
          ) : (
            <div className="rounded-lg border border-dashed px-3 py-3" style={{ borderColor: c.line, background: "#FAF9F6" }}>
              <p className="font-sans text-[12px] font-semibold" style={{ color: c.charcoal }}>
                No desired outcomes found yet.
              </p>
              <p className="mt-1 font-sans text-[12px]" style={{ color: c.secondary }}>
                Run research to generate outcomes and opportunity branches.
              </p>
            </div>
          )}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_1fr]">
          <div className="space-y-4">
            <DesiredOutcomeFlipCard outcome={selectedOutcome} accent={selectedAccent} />
            {visibleOpportunities.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-4" style={{ borderColor: c.line, background: c.card }}>
                <p className="font-sans text-[13px] font-semibold" style={{ color: c.charcoal }}>
                  {useManagedFilter
                    ? "No opportunities are linked to this desired outcome yet."
                    : "No opportunities are available for this desired outcome."}
                </p>
                <p className="mt-1 font-sans text-[12px]" style={{ color: c.secondary }}>
                  Re-run research or backfill linking to populate this branch.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border p-3" style={{ borderColor: c.line, background: "#fff" }}>
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                  Opportunity branches (hover for full name)
                </p>
                {renderNodes(tree.roots as OpportunityTreeNode<OpportunityRow>[])}
              </div>
            )}
          </div>

          <div>
            {openItem ? (
              <div
                id={`opportunity-${openItem.id}`}
                className="space-y-3 rounded-2xl border p-4"
                style={{ borderColor: c.line, background: "#fff" }}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <OpportunityNumberBadge value={opportunityNumberById.get(openItem.id)} />
                      {showJourneyBadge ? (
                        <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
                          {titleCaseJourney(openItem.journey_key)}
                        </span>
                      ) : null}
                    </div>
                    <p className="font-sans text-[14px] font-semibold leading-[1.5]" style={{ color: c.charcoal }}>
                      {humanizeOutcomeText(openItem.outcome)}
                    </p>
                    {!validateOutcomeOpportunityDistinctness(selectedOutcome?.statement || "", openItem.outcome).valid ? (
                      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.focus }}>
                        Warning: this opportunity is too close to the desired outcome.
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
                      Opp Score {formatOdiScore(odiScore(openItem))}
                    </p>
                    <div className="mt-1 flex items-center justify-end gap-2">
                      <ActionTypeBadge label={opportunityActionFromPriorityTier(openItem.priority_tier)} />
                      <WorkflowStatusPicker
                        value={resolveWorkflowStatus(openItem)}
                        compact
                        disabled={updatingWorkflowId === openItem.id}
                        onChange={(next) => onWorkflowChange(openItem, next)}
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border px-3 py-2" style={{ borderColor: c.line, background: "#FAF9F6" }}>
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                    Child opportunity branches
                  </p>
                  {openNode?.children?.length ? (
                    <div className="mt-2 space-y-1.5">
                      {openNode.children.map((child) => (
                        <button
                          key={`${openItem.id}-child-${child.id}`}
                          type="button"
                          onClick={() => setOpenOpportunityId(child.id)}
                          className="w-full rounded-md border px-2 py-1 text-left font-sans text-[12px] transition-colors hover:bg-white"
                          style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
                          title={humanizeOutcomeText(child.item.outcome)}
                        >
                          {opportunityNumberById.get(child.id) || "—"} · {humanizeOutcomeText(child.item.outcome) || "Untitled opportunity"}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 font-sans text-[12px]" style={{ color: c.secondary }}>
                      No child opportunities on this branch yet.
                    </p>
                  )}
                </div>

                <div>
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                    Solution ideas
                  </p>
                  {openSolutions.length === 0 ? (
                    <div className="rounded-lg border border-dashed px-3 py-2" style={{ borderColor: c.line, background: "#FAF9F6" }}>
                      <p className="font-sans text-[12px]" style={{ color: c.secondary }}>
                        No persisted solution ideas for this opportunity.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {openSolutions.map((solution) => (
                        <div key={solution.id} className="rounded-lg border px-3 py-2" style={{ borderColor: c.line, background: "#FAF9F6" }}>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="font-sans text-[12px] font-semibold leading-[1.45]" style={{ color: c.charcoal }}>
                              {solution.title}
                            </p>
                            <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
                              {solution.category} · {solution.effort}
                            </p>
                          </div>
                          {solution.description ? (
                            <p className="mt-1 font-sans text-[12px] leading-[1.55]" style={{ color: c.secondary }}>
                              {solution.description}
                            </p>
                          ) : null}
                          <div className="mt-2 rounded-md border px-2 py-2" style={{ borderColor: c.line, background: "#fff" }}>
                            <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                              Assumption tests
                            </p>
                            {solution.tests.length === 0 ? (
                              <p className="mt-1 font-sans text-[12px]" style={{ color: c.secondary }}>
                                No persisted tests for this solution idea.
                              </p>
                            ) : (
                              <div className="mt-1 space-y-1.5">
                                {solution.tests.map((test, index) => (
                                  <div key={`${solution.id}-test-${index}`} className="rounded-md border px-2 py-1.5" style={{ borderColor: c.line, background: "#fff" }}>
                                    <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
                                      {test.title || `Test ${index + 1}`}
                                    </p>
                                    <p className="font-sans text-[12px]" style={{ color: c.secondary }}>
                                      {test.method} · {test.metric}
                                    </p>
                                    <p className="font-sans text-[12px]" style={{ color: c.secondary }}>
                                      {test.success_threshold} · {test.timebox}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed p-4" style={{ borderColor: c.line, background: c.card }}>
                <p className="font-sans text-[13px]" style={{ color: c.secondary }}>
                  Select an opportunity node to open its branch.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function CheckpointOffersView({
  sections,
  opportunitiesById,
  opportunityNumberById,
  workflowStatusAvailable,
  actionSavingOfferId,
  onOfferAction,
}: {
  sections: Array<{
    checkpoint_number: number;
    checkpoint_label: string;
    checkpoint_description: string;
    offers: CheckpointOfferCandidate[];
  }>;
  opportunitiesById: Map<string, OpportunityRow>;
  opportunityNumberById: Map<string, string>;
  workflowStatusAvailable: boolean;
  actionSavingOfferId: string | null;
  onOfferAction: (offer: CheckpointOfferCandidate, status: WorkflowStatus) => void;
}) {
  if (sections.length === 0) {
    return (
      <div className="rounded-[24px] border px-6 py-12 text-center" style={{ borderColor: c.line, background: c.panel }}>
        <p className="font-sans text-[15px]" style={{ color: c.secondary }}>
          No checkpoint map is available yet for offer generation.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[24px] border p-5" style={{ borderColor: c.line, background: c.panel }}>
        <h2 className="font-sans text-[22px] font-semibold" style={{ color: c.charcoal }}>
          Checkpoint Offers
        </h2>
        <p className="mt-2 max-w-4xl font-sans text-[13px] leading-[1.7]" style={{ color: c.secondary }}>
          Offers are generated per checkpoint from underserved outcomes, then ranked by weighted impact-feasibility. Use Pursue, Queue, or Not now to update linked opportunities.
        </p>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
          Scoring weights: Opportunity 45% · Strategic fit 25% · Feasibility 20% · Time-to-impact 10%
        </p>
      </div>

      {sections.map((section) => (
        <section key={`checkpoint-offers-${section.checkpoint_number}`} className="rounded-[24px] border p-5" style={{ borderColor: c.line, background: c.panel }}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                Checkpoint {section.checkpoint_number}
              </p>
              <h3 className="mt-1 font-sans text-[20px] font-semibold" style={{ color: c.charcoal }}>
                {section.checkpoint_label}
              </h3>
              {section.checkpoint_description ? (
                <p className="mt-1 font-sans text-[13px]" style={{ color: c.secondary }}>
                  {section.checkpoint_description}
                </p>
              ) : null}
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
              {section.offers.length} offers
            </p>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-3">
            {section.offers.map((offer) => {
              const statuses = offer.linked_opportunity_ids
                .map((id) => opportunitiesById.get(id))
                .filter((item): item is OpportunityRow => Boolean(item))
                .map((item) => resolveWorkflowStatus(item));
              const activeStatus =
                statuses.length === 0
                  ? null
                  : statuses.every((status) => status === statuses[0])
                    ? statuses[0]
                    : "mixed";

              const linkedStatements = offer.linked_opportunity_ids
                .map((id) => opportunitiesById.get(id))
                .filter((item): item is OpportunityRow => Boolean(item))
                .map((item) => ({
                  id: item.id,
                  statement: humanizeOutcomeText(item.outcome),
                  number: opportunityNumberById.get(item.id),
                }));

              return (
                <article key={offer.id} className="rounded-[18px] border p-4" style={{ borderColor: c.line, background: c.paper }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                        Rank {offer.priority_rank} · {offer.type}
                      </p>
                      <h4 className="mt-1 font-sans text-[16px] font-semibold leading-[1.4]" style={{ color: c.charcoal }}>
                        {offer.title}
                      </h4>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                        Score
                      </p>
                      <p className="font-sans text-[18px] font-semibold leading-none" style={{ color: c.charcoal }}>
                        {offer.priority_score}
                      </p>
                    </div>
                  </div>

                  <p className="mt-2 font-sans text-[12px] leading-[1.6]" style={{ color: c.secondary }}>
                    {offer.rationale}
                  </p>

                  <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                    Linked opportunities
                  </p>
                  {linkedStatements.length === 0 ? (
                    <p className="mt-1 font-sans text-[12px]" style={{ color: c.secondary }}>
                      No direct links found.
                    </p>
                  ) : (
                    <ul className="mt-1 space-y-1.5">
                      {linkedStatements.map((entry) => (
                        <li key={`${offer.id}-${entry.id}`} className="font-sans text-[12px] leading-[1.45]" style={{ color: c.secondary }}>
                          {entry.number ? <span className="font-mono text-[10px] uppercase tracking-[0.08em]">{entry.number}</span> : null}
                          {entry.number ? " · " : ""}
                          {entry.statement || "Untitled opportunity"}
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {([
                      { status: "in_progress", label: "Pursue" },
                      { status: "planned", label: "Queue" },
                      { status: "parked", label: "Not now" },
                    ] as const).map((action) => {
                      const active = activeStatus === action.status;
                      return (
                        <button
                          key={`${offer.id}-${action.status}`}
                          type="button"
                          onClick={() => onOfferAction(offer, action.status)}
                          disabled={
                            !workflowStatusAvailable ||
                            offer.linked_opportunity_ids.length === 0 ||
                            actionSavingOfferId === offer.id
                          }
                          className="rounded-md border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                          style={{
                            borderColor: active ? c.charcoal : c.line,
                            background: active ? c.charcoal : c.card,
                            color: active ? "#fff" : c.secondary,
                          }}
                        >
                          {action.label}
                        </button>
                      );
                    })}
                  </div>

                  <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
                    Recommended: {workflowStatusLabel(offer.recommended_status)}
                    {activeStatus === "mixed"
                      ? " · Current: Mixed"
                      : activeStatus
                        ? ` · Current: ${workflowStatusLabel(activeStatus)}`
                        : ""}
                  </p>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function OpportunitiesView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeCompany } = useCompany();
  const auditMode = isGenericAuditCompany(activeCompany);
  const {
    loading,
    items,
    error,
    updatingWorkflowId,
    workflowStatusAvailable,
    managedOutcomeLinkAvailable,
    updateWorkflowStatus,
  } = useOpportunities(activeCompany?.id);
  const { needs, marketDefinition } = useOdiNeeds(activeCompany?.id);
  const innovationStrategy = String(marketDefinition?.innovation_strategy || "").trim().toLowerCase() || null;
  const { item: strategyCascade } = useStrategyCascade(activeCompany?.id);
  const { item: positioningCanvas } = usePositioningCanvas(activeCompany?.id);
  const {
    items: managedOutcomes,
    saving: savingManagedOutcome,
    createManagedOutcome,
    updateManagedOutcome,
  } = useManagedOutcomes(activeCompany?.id);
  const { items: solutionIdeas } = useSolutionIdeas(activeCompany?.id);
  const { items: solutionTests } = useSolutionTests(activeCompany?.id);
  const { items: steps } = useJobSteps(activeCompany?.id);
  const { signals: sourceSignals } = useSourceConfidence({
    companyId: activeCompany?.id,
    areaScoresJson: activeCompany?.area_scores_json,
  });
  const queryView = String(searchParams.get("view") || "").toLowerCase();
  const targetOpportunityId = String(searchParams.get("opportunity") || "").trim() || null;
  const requestedView: ViewMode =
    queryView === "map" ? "map" : queryView === "checkpoint-offers" ? "checkpoint-offers" : queryView === "landscape" ? "landscape" : "list";
  const [viewMode, setViewMode] = useState<ViewMode>(requestedView);
  const [actionSavingOfferId, setActionSavingOfferId] = useState<string | null>(null);
  useEffect(() => {
    setViewMode(requestedView);
  }, [requestedView]);
  const publicEvidenceStatus = String(activeCompany?.evidence_status || "").trim().toLowerCase();
  const hasPublic = !["", "not_scored", "no_public_evidence", "generated_no_baseline"].includes(publicEvidenceStatus);
  const hasCustomer = sourceSignals.hasCompanyEvidence;
  const hasValidated = sourceSignals.hasPrimaryEvidence;
  const hasTested = sourceSignals.hasImplementedTested;
  const initiativeContext = useMemo(
    () =>
      deriveInitiativeContext({
        areaScoresJson: activeCompany?.area_scores_json,
        jobSteps: steps,
      }),
    [activeCompany?.area_scores_json, steps],
  );
  const focusById = useMemo(() => {
    const map = new Map<string, FocusClassification>();
    for (const item of items) {
      map.set(item.id, classifyOpportunityFocus(item, initiativeContext));
    }
    return map;
  }, [initiativeContext, items]);
  const sortedForTree = useMemo(
    () =>
      [...items].sort((a, b) => {
        const focusRank = focusSortValue(focusById.get(b.id)) - focusSortValue(focusById.get(a.id));
        if (focusRank !== 0) return focusRank;
        const journeyRank = ["customer", "revenue", "operations"].indexOf(String(a.journey_key));
        const otherRank = ["customer", "revenue", "operations"].indexOf(String(b.journey_key));
        const normalizedA = journeyRank === -1 ? 99 : journeyRank;
        const normalizedB = otherRank === -1 ? 99 : otherRank;
        if (normalizedA !== normalizedB) return normalizedA - normalizedB;
        if ((a.step_number ?? 999) !== (b.step_number ?? 999)) return (a.step_number ?? 999) - (b.step_number ?? 999);
        return (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0);
      }),
    [focusById, items],
  );
  const sortByFocus = (rows: OpportunityRow[]) =>
    [...rows].sort((a, b) => {
      const focusRank = focusSortValue(focusById.get(b.id)) - focusSortValue(focusById.get(a.id));
      if (focusRank !== 0) return focusRank;
      return (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0);
    });
  const suggestedOpportunityItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        const tierRank = priorityTierSortValue(a.priority_tier) - priorityTierSortValue(b.priority_tier);
        if (tierRank !== 0) return tierRank;
        const focusRank = focusSortValue(focusById.get(b.id)) - focusSortValue(focusById.get(a.id));
        if (focusRank !== 0) return focusRank;
        const scoreDiff = (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0);
        if (scoreDiff !== 0) return scoreDiff;
        const importanceDiff = (b.importance ?? 0) - (a.importance ?? 0);
        if (importanceDiff !== 0) return importanceDiff;
        const satisfactionDiff = (a.satisfaction ?? 0) - (b.satisfaction ?? 0);
        if (satisfactionDiff !== 0) return satisfactionDiff;
        return String(a.id).localeCompare(String(b.id));
      }),
    [focusById, items],
  );
  const opportunityNumberById = useMemo(
    () =>
      new Map<string, string>(
        suggestedOpportunityItems.map((item, index) => [item.id, String(index + 1).padStart(3, "0")]),
      ),
    [suggestedOpportunityItems],
  );
  const opportunitiesById = useMemo(
    () =>
      new Map<string, OpportunityRow>(
        items.map((item) => [item.id, item]),
      ),
    [items],
  );
  const checkpointOfferSections = useMemo(
    () =>
      buildCheckpointOffers({
        checkpoints: steps,
        opportunities: items,
        needs,
        strategyContext: {
          where_to_play: strategyCascade?.where_to_play,
          how_to_win: strategyCascade?.how_to_win,
        },
        positioningContext: {
          market_category: positioningCanvas?.market_category,
          value_for_customer: positioningCanvas?.value_for_customer,
          best_fit_customers: positioningCanvas?.best_fit_customers,
          unique_attributes: positioningCanvas?.unique_attributes,
        },
      }),
    [
      items,
      needs,
      positioningCanvas?.best_fit_customers,
      positioningCanvas?.market_category,
      positioningCanvas?.unique_attributes,
      positioningCanvas?.value_for_customer,
      steps,
      strategyCascade?.how_to_win,
      strategyCascade?.where_to_play,
    ],
  );

  const prioritizeNow = sortByFocus(items.filter((item) => item.priority_tier === "focus"));
  const investigateNext = sortByFocus(items.filter((item) => item.priority_tier === "monitor"));
  const laterOpportunities = sortByFocus(items.filter((item) => item.priority_tier === "defer"));
  const showJourneyBadge = useMemo(() => {
    const keys = Array.from(
      new Set(
        items
          .map((item) => String(item.journey_key || "").trim().toLowerCase())
          .filter(Boolean),
      ),
    );
    if (keys.length === 0) return true;
    return !(keys.length === 1 && keys[0] === "customer");
  }, [items]);

  useEffect(() => {
    if (!targetOpportunityId || loading || items.length === 0) return;
    const exists = items.some((item) => item.id === targetOpportunityId);
    if (!exists) return;
    const frame = window.requestAnimationFrame(() => {
      const node = document.getElementById(`opportunity-${targetOpportunityId}`);
      if (!node) return;
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [targetOpportunityId, loading, items, viewMode]);

  const handleViewChange = (mode: "list" | "map" | "checkpoint-offers") => {
    setViewMode(mode);
    const next = new URLSearchParams(searchParams);
    next.set("view", mode);
    if (!targetOpportunityId) next.delete("opportunity");
    setSearchParams(next, { replace: true });
  };

  const handleWorkflowChange = async (item: OpportunityRow, next: WorkflowStatus) => {
    try {
      await updateWorkflowStatus(item.id, next);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update workflow label.";
      window.alert(message);
    }
  };

  const handleCheckpointOfferAction = async (offer: CheckpointOfferCandidate, status: WorkflowStatus) => {
    const linkedIds = Array.from(new Set(offer.linked_opportunity_ids.filter(Boolean)));
    if (linkedIds.length === 0) return;
    setActionSavingOfferId(offer.id);
    try {
      await Promise.all(linkedIds.map((id) => updateWorkflowStatus(id, status)));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update linked opportunities.";
      window.alert(message);
    } finally {
      setActionSavingOfferId(null);
    }
  };

  return (
    <div
      className="min-h-screen"
      style={{
        background: c.bg,
        backgroundImage:
          'url("data:image/svg+xml,%3Csvg width=\'6\' height=\'6\' viewBox=\'0 0 6 6\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23000\' fill-opacity=\'0.025\'%3E%3Cpath d=\'M5 0h1L0 5V4zM6 5v1H5z\'/%3E%3C/g%3E%3C/svg%3E")',
      }}
    >
      <TopNav />

      <main className={`${viewMode === "map" || viewMode === "checkpoint-offers" || viewMode === "landscape" ? "max-w-[1720px]" : "max-w-[1440px]"} mx-auto px-4 pb-12 pt-6 sm:px-6 md:px-8`}>
        <PageContextStatus lastScoredAt={activeCompany?.last_scored_at} sourceSignals={sourceSignals} />

        <div className="mb-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                {activeCompany?.name || "No company selected"}
              </div>
              <h1 className="mt-1 font-sans text-[28px] font-semibold" style={{ color: c.charcoal }}>
                Opportunities
              </h1>
              <p className="mojo-under-title max-w-4xl font-sans text-[14px] mojo-desc" style={{ color: c.secondary }}>
                Focus on the product outcomes and leading indicators behind the jobs customers, buyers, and operators are trying to get done. The top of the tree should represent a result to manage toward. The branches below should capture the opportunity space, not outputs, initiatives, or deliverables. Prioritize the highest-opportunity outcomes first, then test assumptions before locking into solution choices. Current importance, satisfaction, and opportunity values are estimated from public evidence until interviews or surveys exist.
              </p>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
                Initiative: {initiativeContext.primaryJourneyTitle}
              </p>
            </div>
          </div>
          <GenericAuditTraceNote
            active={auditMode}
            className="mt-3 max-w-5xl"
            source="opportunities, managed_outcomes, solution_ideas, solution_tests, job_steps, routes, and company area_scores_json."
            evaluation="Research generation enforces desired outcome vs opportunity distinctness, then persists linked opportunities, solution ideas, and tests."
            scoring="Opportunity score uses Strategic Decision System importance and satisfaction; tree branches render persisted links only, with explicit missing-data states."
            why="This box shows why a branch appears, where persisted data is missing, and where language may still be generic."
          />
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
            Evidence: {evidenceSummaryText({ hasPublic, hasCustomer, hasValidated, hasTested })}
          </p>
          {!workflowStatusAvailable ? (
            <p className="mt-2 font-sans text-[12px] italic" style={{ color: c.secondary }}>
              Workflow labels are view-only until latest database migrations are applied.
            </p>
          ) : null}
          {!managedOutcomeLinkAvailable ? (
            <p className="mt-2 font-sans text-[12px] italic" style={{ color: c.secondary }}>
              Outcome linkage is unavailable until the `managed_outcome_id` migration is applied.
            </p>
          ) : null}
          {items.length > 0 ? (
            <div className="mt-4">
              <ViewToggle mode={viewMode} onChange={handleViewChange} />
            </div>
          ) : null}
        </div>

        {!activeCompany?.id ? (
          <div className="rounded-[24px] border px-6 py-12 text-center" style={{ borderColor: c.line, background: c.panel }}>
            <p className="font-sans text-[15px]" style={{ color: c.secondary }}>
              Select a company to view opportunity data.
            </p>
          </div>
        ) : loading ? (
          <div className="rounded-[24px] border px-6 py-12 text-center" style={{ borderColor: c.line, background: c.panel }}>
            <p className="font-mono text-[12px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
              Loading opportunities…
            </p>
          </div>
        ) : error ? (
          <div className="rounded-[24px] border px-6 py-12 text-center" style={{ borderColor: c.line, background: c.panel }}>
            <p className="font-sans text-[15px]" style={{ color: c.focus }}>
              Failed to load opportunities: {error}
            </p>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-[24px] border px-6 py-12 text-center" style={{ borderColor: c.line, background: c.panel }}>
            <p className="font-sans text-[15px]" style={{ color: c.secondary }}>
              No opportunity data yet. Run AI Research in Admin → Companies.
            </p>
          </div>
        ) : viewMode === "map" ? (
          <OpportunityTreeView
            items={sortedForTree}
            managedOutcomes={managedOutcomes}
            solutionIdeas={solutionIdeas}
            solutionTests={solutionTests}
            savingManagedOutcome={savingManagedOutcome}
            onCreateManagedOutcome={createManagedOutcome}
            onUpdateManagedOutcome={updateManagedOutcome}
            opportunityNumberById={opportunityNumberById}
            workflowStatusAvailable={workflowStatusAvailable}
            managedOutcomeLinkAvailable={managedOutcomeLinkAvailable}
            updatingWorkflowId={updatingWorkflowId}
            onWorkflowChange={handleWorkflowChange}
            showJourneyBadge={showJourneyBadge}
            targetOpportunityId={targetOpportunityId}
          />
        ) : viewMode === "landscape" ? (
          <LandscapeView
            items={suggestedOpportunityItems}
            opportunityNumberById={opportunityNumberById}
            innovationStrategy={innovationStrategy}
          />
        ) : viewMode === "checkpoint-offers" ? (
          <CheckpointOffersView
            sections={checkpointOfferSections}
            opportunitiesById={opportunitiesById}
            opportunityNumberById={opportunityNumberById}
            workflowStatusAvailable={workflowStatusAvailable}
            actionSavingOfferId={actionSavingOfferId}
            onOfferAction={handleCheckpointOfferAction}
          />
        ) : (
          <div className="space-y-8">
            {innovationStrategy && STRATEGY_META[innovationStrategy as InnovationStrategy] ? (
              <div className="rounded-[18px] border px-5 py-4" style={{ borderColor: c.line, background: "#FAF9F6" }}>
                <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                  {STRATEGY_META[innovationStrategy as InnovationStrategy].label} strategy
                </p>
                <p className="mt-1.5 font-sans text-[13px] leading-[1.6]" style={{ color: c.secondary }}>
                  {STRATEGY_META[innovationStrategy as InnovationStrategy].banner}
                </p>
              </div>
            ) : null}
            <CheckpointListSection
              items={suggestedOpportunityItems}
              jobSteps={steps}
              opportunityNumberById={opportunityNumberById}
              workflowStatusAvailable={workflowStatusAvailable}
              updatingWorkflowId={updatingWorkflowId}
              onWorkflowChange={handleWorkflowChange}
              showJourneyBadge={showJourneyBadge}
              targetOpportunityId={targetOpportunityId}
              innovationStrategy={innovationStrategy}
            />
          </div>
        )}
      </main>
    </div>
  );
}
