import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import TopNav from "@/components/layout/TopNav";
import { useCompany } from "@/hooks/useCompany";
import { useSourceConfidence } from "@/hooks/useSourceConfidence";
import { useManagedOutcomes } from "@/hooks/useManagedOutcomes";
import { useOpportunities, type OpportunityRow, type WorkflowStatus } from "@/hooks/useOpportunities";
import { useJobSteps } from "@/hooks/useJobSteps";
import { useRoutes, type RouteRow } from "@/views/Routes/useRoutes";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  title: string;
  statement: string;
  leadingIndicator: string;
  targetDirection: string;
  evidenceBasis: string;
  confidence: number;
  source: "managed_outcome" | "opportunity";
  managedOutcomeId?: string;
};

type SolutionIdea = {
  id: string;
  title: string;
  category: string;
  effort: string;
};

const TOKEN_STOP_WORDS = new Set([
  "the", "and", "for", "with", "into", "from", "that", "this", "your", "their", "while", "through", "across",
  "owner", "owners", "customer", "customers", "partner", "partners", "team", "teams", "step", "journey",
  "increase", "reduce", "improve", "maximize", "minimize", "avoid", "rate", "share", "consistency", "confidence",
]);

function tokenizeText(value: string) {
  const tokens = String(value || "")
    .toLowerCase()
    .match(/[a-z][a-z-]{2,}/g) || [];
  return tokens.filter((token) => !TOKEN_STOP_WORDS.has(token));
}

function parseDirectionalVerb(value: string) {
  const match = String(value || "").trim().toLowerCase().match(/^(increase|reduce|improve|maximize|minimize|avoid)\b/);
  return match ? match[1] : "";
}

function directionalConflict(a: string, b: string) {
  const key = `${a}:${b}`;
  return key === "increase:reduce" ||
    key === "reduce:increase" ||
    key === "maximize:minimize" ||
    key === "minimize:maximize";
}

function scoreOutcomeOpportunityFit(outcomeStatement: string, item: OpportunityRow) {
  const outcomeTokens = new Set(tokenizeText(outcomeStatement));
  const itemTokens = new Set(tokenizeText(`${item.outcome} ${item.step_label || ""}`));

  if (outcomeTokens.size === 0 || itemTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of itemTokens) {
    if (outcomeTokens.has(token)) overlap += 1;
  }

  const outcomeDirection = parseDirectionalVerb(outcomeStatement);
  const itemDirection = parseDirectionalVerb(item.outcome);
  const directionBonus = !outcomeDirection || !itemDirection
    ? 0
    : outcomeDirection === itemDirection
      ? 0.75
      : directionalConflict(outcomeDirection, itemDirection)
        ? -0.75
        : -0.25;

  const outcomeCoverage = overlap / Math.max(1, outcomeTokens.size);
  const itemCoverage = overlap / Math.max(1, itemTokens.size);
  const noOverlapPenalty = overlap === 0 ? -0.5 : 0;
  return overlap * 0.8 + outcomeCoverage * 1.4 + itemCoverage * 0.9 + directionBonus + noOverlapPenalty;
}

function selectOutcomeScopedOpportunities(outcomeStatement: string, journeyItems: OpportunityRow[]) {
  const outcomeTokenCount = new Set(tokenizeText(outcomeStatement)).size;
  const strongThreshold = outcomeTokenCount <= 3 ? 1.2 : outcomeTokenCount <= 6 ? 1.5 : 1.8;
  const ranked = [...journeyItems]
    .map((item) => ({
      item,
      fitScore: scoreOutcomeOpportunityFit(outcomeStatement, item),
    }))
    .sort((a, b) => {
      if (b.fitScore !== a.fitScore) return b.fitScore - a.fitScore;
      return (Number(b.item.opportunity_score) || 0) - (Number(a.item.opportunity_score) || 0);
    });

  const strong = ranked.filter((entry) => entry.fitScore >= strongThreshold);
  const visible = strong.slice(0, 4);

  return {
    visible,
    hiddenCount: Math.max(0, journeyItems.length - visible.length),
    bestFitScore: ranked[0]?.fitScore ?? 0,
  };
}

function scoreRouteOutcomeFit(route: RouteRow, item: OpportunityRow, outcomeStatement: string) {
  const routeText = `${route.title} ${route.short_description || ""} ${(route.frameworks_used || []).join(" ")}`;
  const routeTokens = new Set(tokenizeText(routeText));
  const outcomeTokens = new Set(tokenizeText(outcomeStatement));
  const itemTokens = new Set(tokenizeText(`${item.outcome} ${item.step_label || ""}`));
  if (routeTokens.size === 0) return 0;

  let outcomeOverlap = 0;
  for (const token of outcomeTokens) {
    if (routeTokens.has(token)) outcomeOverlap += 1;
  }
  let itemOverlap = 0;
  for (const token of itemTokens) {
    if (routeTokens.has(token)) itemOverlap += 1;
  }

  const desiredCategory =
    item.priority_tier === "focus"
      ? "fix"
      : item.priority_tier === "monitor"
        ? "improve"
        : "create";
  const routeCategory = String(route.category || "").toLowerCase();
  const categoryScore =
    routeCategory === desiredCategory ? 0.6 : routeCategory ? -0.2 : 0;

  const outcomeDirection = parseDirectionalVerb(outcomeStatement);
  const routeDirection = parseDirectionalVerb(routeText);
  const directionScore = !outcomeDirection || !routeDirection
    ? 0
    : outcomeDirection === routeDirection
      ? 0.5
      : directionalConflict(outcomeDirection, routeDirection)
        ? -0.6
        : -0.2;

  return outcomeOverlap * 1.25 + itemOverlap * 0.8 + categoryScore + directionScore;
}

function matchSolutionsForOpportunity(item: OpportunityRow, routeItems: RouteRow[], outcomeStatement: string) {
  const ranked = routeItems
    .map((route) => ({ route, score: scoreRouteOutcomeFit(route, item, outcomeStatement) }))
    .filter((entry) => entry.score >= 1.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((entry, index) => ({
      id: `${item.id}-route-${entry.route.id || index}`,
      title: entry.route.title || "Untitled solution idea",
      category: String(entry.route.category || "improve"),
      effort: String(entry.route.effort || "medium"),
    }));

  return ranked;
}

function inferAudienceLabel(text: string) {
  const raw = String(text || "").toLowerCase();
  if (raw.includes("cafe owner")) return "cafe owners";
  if (raw.includes("partner cafe")) return "partner cafes";
  if (raw.includes("family")) return "families";
  if (raw.includes("patient")) return "patients";
  if (raw.includes("operator")) return "operators";
  if (raw.includes("buyer")) return "buyers";
  if (raw.includes("partner")) return "partners";
  if (raw.includes("client")) return "clients";
  return "target users";
}

function buildAssumptionTests(item: OpportunityRow, solution: SolutionIdea) {
  const audience = inferAudienceLabel(item.outcome);
  const stepLabel = String(item.step_label || "this journey step").toLowerCase();
  return [
    `Desirability test: Interview 5 ${audience} about friction in ${stepLabel} before scaling "${solution.title}".`,
    `Viability/feasibility test: Run a 2-week pilot and track step completion rate, quality consistency, and rework.`,
  ];
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
}: {
  item: OpportunityRow;
  opportunityNumber?: string;
  workflowStatus: WorkflowStatus;
  workflowStatusAvailable: boolean;
  workflowSaving?: boolean;
  onWorkflowChange: (item: OpportunityRow, next: WorkflowStatus) => void;
  showJourneyBadge?: boolean;
  isTargeted?: boolean;
}) {
  const [expanded, setExpanded] = useState(isTargeted);
  useEffect(() => {
    if (isTargeted) setExpanded(true);
  }, [isTargeted]);
  const accent = JOURNEY_ACCENT[item.journey_key] || c.monitor;
  const evidenceNeeded = [
    item.step_label
      ? `Confirm where "${item.step_label}" currently breaks down in practice`
      : "Tie this opportunity to a named job step or workflow moment",
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
                  Job step context:
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
            <ActionTypeBadge label={actionType} />
            <WorkflowStatusPicker
              value={workflowStatus}
              compact
              disabled={workflowSaving}
              onChange={(next) => onWorkflowChange(item, next)}
            />
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
          />
        ))}
      </div>
    </section>
  );
}

function ViewToggle({
  mode,
  onChange,
}: {
  mode: "list" | "map";
  onChange: (mode: "list" | "map") => void;
}) {
  return (
    <div
      className="inline-flex rounded-full border p-1"
      style={{ borderColor: c.line, background: c.card }}
    >
      {([
        { key: "list", label: "List View" },
        { key: "map", label: "Opportunity Map" },
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
  routeItems,
  savingManagedOutcome,
  onCreateManagedOutcome,
  onUpdateManagedOutcome,
  opportunityNumberById,
  workflowStatusAvailable,
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
    evidence_basis: string;
    confidence: number;
  }>;
  routeItems: RouteRow[];
  savingManagedOutcome: boolean;
  onCreateManagedOutcome: (input: {
    journey_key: string;
    outcome_title: string;
    outcome_statement: string;
    leading_indicator: string;
    target_direction: string;
    evidence_basis: string;
    confidence: number;
    frameworks_used?: string[];
  }) => Promise<{ id: string } | void>;
  onUpdateManagedOutcome: (id: string, patch: {
    outcome_title?: string;
    outcome_statement?: string;
    leading_indicator?: string;
    target_direction?: string;
    evidence_basis?: string;
    confidence?: number;
    frameworks_used?: string[];
  }) => Promise<{ id: string } | void>;
  opportunityNumberById: Map<string, string>;
  workflowStatusAvailable: boolean;
  updatingWorkflowId: string | null;
  onWorkflowChange: (item: OpportunityRow, next: WorkflowStatus) => void;
  showJourneyBadge?: boolean;
  targetOpportunityId?: string | null;
}) {
  const [selectedOutcomeByJourney, setSelectedOutcomeByJourney] = useState<Record<string, string>>({});
  const [editorByJourney, setEditorByJourney] = useState<Record<string, {
    mode: "add" | "edit";
    managedOutcomeId?: string;
    outcome_title: string;
    outcome_statement: string;
    leading_indicator: string;
    target_direction: string;
    evidence_basis: string;
    confidence: number;
    error?: string;
  } | null>>({});

  const grouped = useMemo(() => {
    const presentJourneyKeys = Array.from(new Set(items.map((item) => String(item.journey_key || "").trim()).filter(Boolean)));
    const orderedJourneyKeys = [
      ...["customer", "revenue", "operations"].filter((key) => presentJourneyKeys.includes(key)),
      ...presentJourneyKeys.filter((key) => !["customer", "revenue", "operations"].includes(key)).sort((a, b) => a.localeCompare(b)),
    ];

    return orderedJourneyKeys.map((journeyKey) => {
      const journeyItems = items
        .filter((item) => item.journey_key === journeyKey)
        .sort((a, b) => (Number(b.opportunity_score) || 0) - (Number(a.opportunity_score) || 0));

      const managedJourneyOutcomes = managedOutcomes
        .filter((outcome) => outcome.journey_key === journeyKey)
        .map((outcome) => ({
          id: `managed-${outcome.id}`,
          title: outcome.outcome_statement || outcome.outcome_title || journeyRootLabel(journeyKey),
          statement: outcome.outcome_statement || outcome.outcome_title || journeyRootLabel(journeyKey),
          leadingIndicator: outcome.leading_indicator || "Leading indicator to validate",
          targetDirection: outcome.target_direction || "improve",
          evidenceBasis: outcome.evidence_basis || "Derived from current evidence",
          confidence: Number.isFinite(Number(outcome.confidence)) ? Number(outcome.confidence) : 55,
          source: "managed_outcome" as const,
          managedOutcomeId: outcome.id,
        }));

      const candidateOutcomeOptions = [...journeyItems]
        .sort((a, b) => (Number(b.opportunity_score) || 0) - (Number(a.opportunity_score) || 0))
        .slice(0, 6)
        .map((item) => {
          const statement = humanizeOutcomeText(item.outcome) || journeyRootLabel(journeyKey);
          const stepLabel = String(item.step_label || "the customer journey").toLowerCase();
          const audience = inferAudienceLabel(item.outcome);
          const verbMatch = statement.match(/^(Increase|Reduce|Improve|Maximize|Minimize|Avoid)\b/i);
          const targetDirection = (verbMatch?.[1] || "Increase").toLowerCase();
          return {
            id: `opp-${item.id}`,
            title: statement,
            statement,
            leadingIndicator: `Share of ${audience} progressing through ${stepLabel} with fewer delays and less rework.`,
            targetDirection,
            evidenceBasis: "Candidate desired outcome derived from current opportunity map and should be validated through interviews.",
            confidence: 42,
            source: "opportunity" as const,
          };
        });

      const dedupedOptions: DesiredOutcomeOption[] = [];
      const seenTitles = new Set<string>();
      for (const option of [...managedJourneyOutcomes, ...candidateOutcomeOptions]) {
        const normalized = option.statement.trim().toLowerCase();
        if (!normalized || seenTitles.has(normalized)) continue;
        seenTitles.add(normalized);
        dedupedOptions.push(option);
      }
      if (dedupedOptions.length === 0) {
        dedupedOptions.push({
          id: `fallback-${journeyKey}`,
          title: journeyRootLabel(journeyKey),
          statement: journeyRootLabel(journeyKey),
          leadingIndicator: "Leading indicator to validate with Strategic Decision System importance/satisfaction evidence.",
          targetDirection: "improve",
          evidenceBasis: "Fallback outcome; replace with validated desired outcome.",
          confidence: 30,
          source: "opportunity",
        });
      }

      return {
        journeyKey,
        journeyItems,
        itemCount: journeyItems.length,
        desiredOutcomeOptions: dedupedOptions,
        managedJourneyOutcomes,
      };
    });
  }, [items, managedOutcomes]);

  useEffect(() => {
    setSelectedOutcomeByJourney((current) => {
      const next = { ...current };
      let changed = false;
      for (const group of grouped) {
        const ids = new Set(group.desiredOutcomeOptions.map((option) => option.id));
        const active = next[group.journeyKey];
        if (!active || !ids.has(active)) {
          next[group.journeyKey] = group.desiredOutcomeOptions[0]?.id || "";
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [grouped]);

  function openAddEditor(journeyKey: string) {
    setEditorByJourney((current) => ({
      ...current,
      [journeyKey]: {
        mode: "add",
        outcome_title: "",
        outcome_statement: "",
        leading_indicator: "",
        target_direction: "increase",
        evidence_basis: "Team-authored desired outcome.",
        confidence: 55,
      },
    }));
  }

  function openEditEditor(journeyKey: string, option: DesiredOutcomeOption) {
    if (!option.managedOutcomeId) return;
    setEditorByJourney((current) => ({
      ...current,
      [journeyKey]: {
        mode: "edit",
        managedOutcomeId: option.managedOutcomeId,
        outcome_title: option.statement,
        outcome_statement: option.statement,
        leading_indicator: option.leadingIndicator,
        target_direction: option.targetDirection || "increase",
        evidence_basis: option.evidenceBasis,
        confidence: Number.isFinite(option.confidence) ? option.confidence : 55,
      },
    }));
  }

  function closeEditor(journeyKey: string) {
    setEditorByJourney((current) => ({ ...current, [journeyKey]: null }));
  }

  async function saveEditor(journeyKey: string) {
    const editor = editorByJourney[journeyKey];
    if (!editor) return;
    const statement = editor.outcome_statement.trim();
    const indicator = editor.leading_indicator.trim();
    if (!statement || !indicator) {
      setEditorByJourney((current) => ({
        ...current,
        [journeyKey]: { ...editor, error: "Add an outcome statement and leading indicator." },
      }));
      return;
    }

    try {
      if (editor.mode === "edit" && editor.managedOutcomeId) {
        const updated = await onUpdateManagedOutcome(editor.managedOutcomeId, {
          outcome_title: statement,
          outcome_statement: statement,
          leading_indicator: indicator,
          target_direction: editor.target_direction || "increase",
          evidence_basis: editor.evidence_basis || "Team-authored desired outcome.",
          confidence: Math.max(10, Math.min(95, Number(editor.confidence) || 55)),
          frameworks_used: ["Teresa Torres", "Strategic Decision System", "JTBD"],
        });
        const updatedId = (updated as { id?: string } | void)?.id;
        if (updatedId) {
          setSelectedOutcomeByJourney((current) => ({ ...current, [journeyKey]: `managed-${updatedId}` }));
        }
      } else {
        const created = await onCreateManagedOutcome({
          journey_key: journeyKey,
          outcome_title: statement,
          outcome_statement: statement,
          leading_indicator: indicator,
          target_direction: editor.target_direction || "increase",
          evidence_basis: editor.evidence_basis || "Team-authored desired outcome.",
          confidence: Math.max(10, Math.min(95, Number(editor.confidence) || 55)),
          frameworks_used: ["Teresa Torres", "Strategic Decision System", "JTBD"],
        });
        const createdId = (created as { id?: string } | void)?.id;
        if (createdId) {
          setSelectedOutcomeByJourney((current) => ({ ...current, [journeyKey]: `managed-${createdId}` }));
        }
      }
      closeEditor(journeyKey);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save desired outcome.";
      setEditorByJourney((current) => ({
        ...current,
        [journeyKey]: editor ? { ...editor, error: message } : editor,
      }));
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[24px] border p-5" style={{ borderColor: c.line, background: c.panel }}>
        <h2 className="font-sans text-[22px] font-semibold" style={{ color: c.charcoal }}>
          Opportunity Solution Tree
        </h2>
        <p className="mt-2 max-w-4xl font-sans text-[13px] leading-[1.7]" style={{ color: c.secondary }}>
          This view now follows Teresa Torres flow end-to-end: desired outcome first, then opportunity branches, then solution ideas, then assumption tests. Pick a desired outcome for each journey and pressure-test solutions before committing.
        </p>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
          Desired outcome → opportunities → solution ideas → assumption tests
        </p>
      </div>

      <div className="space-y-6">
        {grouped.map(({ journeyKey, journeyItems, itemCount, desiredOutcomeOptions, managedJourneyOutcomes }) => {
          const accent = JOURNEY_ACCENT[journeyKey] || c.monitor;
          const selectedOutcome =
            desiredOutcomeOptions.find((option) => option.id === selectedOutcomeByJourney[journeyKey]) ||
            desiredOutcomeOptions[0];
          const editor = editorByJourney[journeyKey];
          const scoped = selectOutcomeScopedOpportunities(selectedOutcome?.statement || "", journeyItems);
          const visibleOpportunities = scoped.visible.map((entry) => entry.item);
          return (
            <section
              key={journeyKey}
              className="rounded-[28px] border p-4 sm:p-5"
              style={{ borderColor: c.line, background: c.panel }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ background: accent }} />
                  <h3 className="font-sans text-[20px] font-semibold" style={{ color: c.charcoal }}>
                    {titleCaseJourney(journeyKey)}
                  </h3>
                </div>
                <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                  {itemCount} opportunities
                </p>
              </div>

              <div className="mt-4 max-w-[760px] space-y-3">
                <div className="max-w-[580px]">
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                    Desired outcome
                  </p>
                  <Select
                    value={selectedOutcome?.id || desiredOutcomeOptions[0]?.id}
                    onValueChange={(next) =>
                      setSelectedOutcomeByJourney((current) => ({
                        ...current,
                        [journeyKey]: next,
                      }))
                    }
                  >
                    <SelectTrigger
                      className="h-9 max-w-full border bg-white px-3 py-1 text-left font-sans text-[13px]"
                      style={{ borderColor: c.line, color: c.charcoal }}
                    >
                      <SelectValue placeholder="Choose desired outcome" />
                    </SelectTrigger>
                    <SelectContent className="border-[#DDE6D1] bg-white text-[#233C4B] shadow-[0_14px_32px_rgba(35,60,75,0.14)]">
                      {desiredOutcomeOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id} className="text-[12px] leading-[1.45]">
                          {option.statement}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-2 font-sans text-[12px]" style={{ color: c.secondary }}>
                    Opportunities below are regenerated for this desired outcome and non-matching branches are removed.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openAddEditor(journeyKey)}
                    className="rounded-md border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors hover:bg-[#F5F7F2]"
                    style={{ borderColor: c.line, color: c.secondary, background: c.card }}
                  >
                    Add Desired Outcome
                  </button>
                  {managedJourneyOutcomes.map((option) => (
                    <button
                      key={`${journeyKey}-edit-${option.id}`}
                      type="button"
                      onClick={() => openEditEditor(journeyKey, option)}
                      className="rounded-md border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors hover:bg-[#F5F7F2]"
                      style={{ borderColor: c.line, color: c.secondary, background: c.card }}
                    >
                      Edit: {(option.statement || option.title).slice(0, 42)}{(option.statement || option.title).length > 42 ? "…" : ""}
                    </button>
                  ))}
                </div>

                {editor ? (
                  <div className="rounded-xl border p-3" style={{ borderColor: c.line, background: "#FAF9F6" }}>
                    <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                      {editor.mode === "edit" ? "Edit desired outcome" : "Add desired outcome"}
                    </p>
                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                      <Select
                        value={editor.target_direction || "increase"}
                        onValueChange={(next) =>
                          setEditorByJourney((current) => ({
                            ...current,
                            [journeyKey]: current[journeyKey]
                              ? { ...current[journeyKey]!, target_direction: next, error: "" }
                              : current[journeyKey],
                          }))
                        }
                      >
                        <SelectTrigger
                        className="h-9 border bg-white px-3 py-1 text-left font-sans text-[13px] md:col-span-2"
                        style={{ borderColor: c.line, color: c.charcoal }}
                      >
                        <SelectValue placeholder="Target direction" />
                        </SelectTrigger>
                        <SelectContent className="border-[#DDE6D1] bg-white text-[#233C4B] shadow-[0_14px_32px_rgba(35,60,75,0.14)]">
                          {["increase", "reduce", "improve", "maximize", "minimize", "avoid"].map((direction) => (
                            <SelectItem key={`${journeyKey}-${direction}`} value={direction} className="text-[12px] leading-[1.45] capitalize">
                              {direction}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <textarea
                        value={editor.outcome_statement}
                        onChange={(event) =>
                          setEditorByJourney((current) => ({
                            ...current,
                            [journeyKey]: current[journeyKey]
                              ? { ...current[journeyKey]!, outcome_statement: event.target.value, error: "" }
                              : current[journeyKey],
                          }))
                        }
                        placeholder="Desired outcome statement"
                        rows={3}
                        className="rounded-md border px-3 py-2 text-[13px] outline-none focus:ring-1 md:col-span-2"
                        style={{ borderColor: c.line, color: c.charcoal, background: "#fff" }}
                      />
                      <input
                        type="text"
                        value={editor.leading_indicator}
                        onChange={(event) =>
                          setEditorByJourney((current) => ({
                            ...current,
                            [journeyKey]: current[journeyKey]
                              ? { ...current[journeyKey]!, leading_indicator: event.target.value, error: "" }
                              : current[journeyKey],
                          }))
                        }
                        placeholder="Leading indicator"
                        className="h-9 rounded-md border px-3 text-[13px] outline-none focus:ring-1 md:col-span-2"
                        style={{ borderColor: c.line, color: c.charcoal, background: "#fff" }}
                      />
                    </div>
                    {editor.error ? (
                      <p className="mt-2 font-sans text-[12px]" style={{ color: c.focus }}>
                        {editor.error}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void saveEditor(journeyKey)}
                        disabled={savingManagedOutcome}
                        className="rounded-md border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors disabled:opacity-60"
                        style={{ borderColor: c.line, color: "#fff", background: c.charcoal }}
                      >
                        {savingManagedOutcome ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => closeEditor(journeyKey)}
                        disabled={savingManagedOutcome}
                        className="rounded-md border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors hover:bg-[#F5F7F2] disabled:opacity-60"
                        style={{ borderColor: c.line, color: c.secondary, background: c.card }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              {journeyItems.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed p-4" style={{ borderColor: c.line, background: c.card }}>
                  <p className="font-sans text-[13px]" style={{ color: c.secondary }}>
                    No opportunities mapped to this journey yet.
                  </p>
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  <div className="flex justify-center">
                    <DesiredOutcomeFlipCard outcome={selectedOutcome} accent={accent} />
                  </div>

                  <div className="mx-auto h-8 w-px" style={{ background: `${accent}66` }} />
                  <div className="mx-auto h-px w-[88%]" style={{ background: `${accent}55` }} />

                  {scoped.hiddenCount > 0 && visibleOpportunities.length > 0 ? (
                    <p className="text-center font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                      Regenerated for selected outcome: showing {visibleOpportunities.length}, hiding {scoped.hiddenCount}
                    </p>
                  ) : null}

                  {visibleOpportunities.length === 0 ? (
                    <div className="rounded-2xl border border-dashed p-4" style={{ borderColor: c.line, background: c.card }}>
                      <p className="font-sans text-[13px] font-semibold" style={{ color: c.charcoal }}>
                        No high-confidence opportunity matches found for this desired outcome.
                      </p>
                      <p className="mt-2 font-sans text-[12px]" style={{ color: c.secondary }}>
                        Adjust the desired outcome wording or update the opportunity set so this branch reflects evidence-backed fit.
                      </p>
                      {scoped.bestFitScore > 0 ? (
                        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                          Best available fit score: {scoped.bestFitScore.toFixed(2)} (below threshold)
                        </p>
                      ) : null}
                    </div>
                  ) : (
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {visibleOpportunities.map((item) => {
                      const opportunityNumber = opportunityNumberById.get(item.id);
                      const isTargeted = targetOpportunityId === item.id;
                      const readableOutcome = humanizeOutcomeText(item.outcome);
                      const score = formatOdiScore(odiScore(item));
                      const workflowStatus = resolveWorkflowStatus(item);
                      const actionType = opportunityActionFromPriorityTier(item.priority_tier);
                      const solutions = matchSolutionsForOpportunity(item, routeItems, selectedOutcome?.statement || "");
                      return (
                        <div key={item.id} className="w-full space-y-2">
                          <div className="flex justify-center">
                            <div
                              id={`opportunity-${item.id}`}
                              className="relative w-full rounded-[20px] border px-4 py-3 text-left shadow-sm transition-transform hover:-translate-y-0.5"
                              style={{
                                borderColor: isTargeted ? c.charcoal : c.line,
                                background: c.paper,
                                boxShadow: isTargeted
                                  ? "0 0 0 3px rgba(35,60,75,0.16), 0 6px 22px rgba(35,60,75,0.10)"
                                  : undefined,
                              }}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                                <div className="min-w-0">
                                  <div className="mb-2 flex items-center gap-2">
                                    <OpportunityNumberBadge value={opportunityNumber} />
                                    <span
                                      className="font-mono text-[10px] uppercase tracking-[0.08em] whitespace-nowrap"
                                      style={{ color: c.secondary }}
                                    >
                                      {showJourneyBadge ? `${titleCaseJourney(item.journey_key)} · ` : ""}
                                      {item.step_number ? `Step ${item.step_number}` : "Step context"}
                                    </span>
                                  </div>
                                </div>
                                <div className="shrink-0">
                                  <p
                                    className="font-mono text-[10px] uppercase tracking-[0.06em] whitespace-nowrap text-right"
                                    style={{ color: c.secondary }}
                                  >
                                    Opp Score {score}
                                  </p>
                                </div>
                              </div>
                              <p
                                className="mt-2 w-full font-sans text-[14px] font-normal leading-[1.55] line-clamp-7"
                                style={{ color: c.charcoal }}
                                title={readableOutcome}
                              >
                                {readableOutcome || "Untitled opportunity"}
                              </p>
                              {isTargeted ? (
                                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.charcoal }}>
                                  Opened from map insight
                                </p>
                              ) : null}
                              <p className="mt-2 font-sans text-[12px]" style={{ color: c.secondary }}>
                                Step context: {item.step_number ? `Step ${item.step_number}` : "Unassigned"}
                                {item.step_label ? ` · ${item.step_label}` : ""}
                              </p>
                              <div className="mt-3 pt-2" style={{ borderTop: `1px solid ${c.line}` }}>
                                <div className="flex items-center justify-between gap-2">
                                  <p
                                    className="font-sans text-[13px] font-semibold"
                                    style={{ color: priorityAccent(item.priority_tier) }}
                                  >
                                    {priorityLabel(item.priority_tier)}
                                  </p>
                                  <div className="flex flex-wrap items-center justify-end gap-2">
                                    <ActionTypeBadge label={actionType} />
                                    <WorkflowStatusPicker
                                      value={workflowStatus}
                                      compact
                                      disabled={updatingWorkflowId === item.id}
                                      onChange={(next) => onWorkflowChange(item, next)}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="ml-3 border-l pl-3" style={{ borderColor: `${accent}44` }}>
                            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                              Solution ideas
                            </p>
                            {solutions.length === 0 ? (
                              <div className="rounded-lg border border-dashed px-3 py-2" style={{ borderColor: c.line, background: "#FAF9F6" }}>
                                <p className="font-sans text-[12px]" style={{ color: c.secondary }}>
                                  No high-confidence solution routes match this opportunity yet. Refine route statements in Routes to improve alignment.
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {solutions.map((solution) => {
                                  const tests = buildAssumptionTests(item, solution);
                                  return (
                                    <div key={solution.id} className="space-y-2">
                                      <div
                                        className="rounded-lg border px-3 py-2"
                                        style={{ borderColor: c.line, background: "#FAF9F6" }}
                                      >
                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                          <p className="font-sans text-[12px] font-semibold leading-[1.45]" style={{ color: c.charcoal }}>
                                            {solution.title}
                                          </p>
                                          <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
                                            {solution.category} · {solution.effort}
                                          </p>
                                        </div>
                                      </div>

                                      <div className="ml-3 border-l pl-3" style={{ borderColor: `${accent}33` }}>
                                        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                                          Assumption tests
                                        </p>
                                        <div className="space-y-1.5">
                                          {tests.map((test, index) => (
                                            <div
                                              key={`${solution.id}-test-${index}`}
                                              className="rounded-md border px-3 py-2"
                                              style={{ borderColor: c.line, background: "#FFFFFF" }}
                                            >
                                              <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
                                                Test {index + 1}
                                              </p>
                                              <p className="mt-1 font-sans text-[12px] leading-[1.55]" style={{ color: c.secondary }}>
                                                {test}
                                              </p>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default function OpportunitiesView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeCompany } = useCompany();
  const auditMode = isGenericAuditCompany(activeCompany);
  const { loading, items, error, updatingWorkflowId, workflowStatusAvailable, updateWorkflowStatus } = useOpportunities(activeCompany?.id);
  const {
    items: managedOutcomes,
    saving: savingManagedOutcome,
    createManagedOutcome,
    updateManagedOutcome,
  } = useManagedOutcomes(activeCompany?.id);
  const { items: routeItems } = useRoutes(activeCompany?.id);
  const { items: steps } = useJobSteps(activeCompany?.id);
  const { signals: sourceSignals } = useSourceConfidence({
    companyId: activeCompany?.id,
    areaScoresJson: activeCompany?.area_scores_json,
  });
  const queryView = String(searchParams.get("view") || "").toLowerCase();
  const targetOpportunityId = String(searchParams.get("opportunity") || "").trim() || null;
  const requestedView: "list" | "map" = queryView === "map" ? "map" : "list";
  const [viewMode, setViewMode] = useState<"list" | "map">(requestedView);
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

  const handleViewChange = (mode: "list" | "map") => {
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

      <main className={`${viewMode === "map" ? "max-w-[1720px]" : "max-w-[1440px]"} mx-auto px-4 pb-12 pt-6 sm:px-6 md:px-8`}>
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
            source="opportunities, job_steps, managed_outcomes, routes, and company area_scores_json."
            evaluation="AI and deterministic fit logic rank opportunities against selected desired outcomes, then score route alignment to each opportunity."
            scoring="Opportunity score uses Strategic Decision System importance and satisfaction; visible branches are thresholded by outcome-fit score; weak matches are hidden."
            why="This box shows why a branch appears, what was filtered out, and where language may still be generic."
          />
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
            Evidence: {evidenceSummaryText({ hasPublic, hasCustomer, hasValidated, hasTested })}
          </p>
          {!workflowStatusAvailable ? (
            <p className="mt-2 font-sans text-[12px] italic" style={{ color: c.secondary }}>
              Workflow labels are view-only until latest database migrations are applied.
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
            routeItems={routeItems}
            savingManagedOutcome={savingManagedOutcome}
            onCreateManagedOutcome={createManagedOutcome}
            onUpdateManagedOutcome={updateManagedOutcome}
            opportunityNumberById={opportunityNumberById}
            workflowStatusAvailable={workflowStatusAvailable}
            updatingWorkflowId={updatingWorkflowId}
            onWorkflowChange={handleWorkflowChange}
            showJourneyBadge={showJourneyBadge}
            targetOpportunityId={targetOpportunityId}
          />
        ) : (
          <div className="space-y-8">
            <OpportunitySection
              title="Prioritize Now"
              subtitle="Strong opportunities that deserve attention before you commit to a solution."
              items={prioritizeNow}
              opportunityNumberById={opportunityNumberById}
              workflowStatusAvailable={workflowStatusAvailable}
              updatingWorkflowId={updatingWorkflowId}
              onWorkflowChange={handleWorkflowChange}
              subtitleItalic
              showJourneyBadge={showJourneyBadge}
              targetOpportunityId={targetOpportunityId}
            />
            <OpportunitySection
              title="Investigate Next"
              subtitle="Promising opportunities where the next move is better evidence, sharper assumptions, or smaller tests."
              items={investigateNext}
              opportunityNumberById={opportunityNumberById}
              workflowStatusAvailable={workflowStatusAvailable}
              updatingWorkflowId={updatingWorkflowId}
              onWorkflowChange={handleWorkflowChange}
              subtitleItalic
              showJourneyBadge={showJourneyBadge}
              targetOpportunityId={targetOpportunityId}
            />
            <OpportunitySection
              title="Later Opportunities"
              subtitle="Keep these visible, but sequence them after higher-leverage opportunity work."
              items={laterOpportunities}
              opportunityNumberById={opportunityNumberById}
              workflowStatusAvailable={workflowStatusAvailable}
              updatingWorkflowId={updatingWorkflowId}
              onWorkflowChange={handleWorkflowChange}
              showJourneyBadge={showJourneyBadge}
              targetOpportunityId={targetOpportunityId}
            />
          </div>
        )}
      </main>
    </div>
  );
}
