import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import TopNav from "@/components/layout/TopNav";
import { useCompany } from "@/hooks/useCompany";
import { useSourceConfidence } from "@/hooks/useSourceConfidence";
import { useManagedOutcomes } from "@/hooks/useManagedOutcomes";
import { useOpportunities, type OpportunityRow, type WorkflowStatus } from "@/hooks/useOpportunities";
import { useJobSteps } from "@/hooks/useJobSteps";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageContextStatus from "@/components/layout/PageContextStatus";
import { computeOpportunityScore } from "@/lib/scoring";
import { opportunityActionFromPriorityTier, opportunityActionTone } from "@/lib/opportunityLabels";
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

const TREE_STEP_MIN_WIDTH = 280;
const TREE_MAP_MIN_WIDTH = 1160;
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

function evidenceNeeded(item: OpportunityRow) {
  return [
    item.step_label
      ? `Confirm where "${item.step_label}" breaks down in real practice.`
      : "Tie this opportunity to a specific job step or workflow moment.",
    "Collect direct customer, operator, or buyer language for this outcome.",
    item.priority_tier === "focus"
      ? "Validate importance and dissatisfaction with interviews or survey evidence."
      : "Confirm this is a real high-opportunity outcome before choosing a solution.",
  ];
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
  if (args.hasValidated) active.push("Validated");
  if (args.hasTested) active.push("Tested");
  return active.length > 0 ? active.join(" · ") : "No active evidence sources";
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
        className={`${compact ? "h-7 min-w-[126px]" : "h-8 min-w-[138px]"} border bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em]`}
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
          <div className="flex items-center gap-2">
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
  opportunityNumberById,
  workflowStatusAvailable,
  updatingWorkflowId,
  onWorkflowChange,
  showJourneyBadge = true,
  targetOpportunityId,
}: {
  items: OpportunityRow[];
  managedOutcomes: Array<{
    journey_key: string;
    outcome_title: string;
    outcome_statement: string;
    leading_indicator: string;
    target_direction: string;
    evidence_basis: string;
    confidence: number;
  }>;
  opportunityNumberById: Map<string, string>;
  workflowStatusAvailable: boolean;
  updatingWorkflowId: string | null;
  onWorkflowChange: (item: OpportunityRow, next: WorkflowStatus) => void;
  showJourneyBadge?: boolean;
  targetOpportunityId?: string | null;
}) {
  const presentJourneyKeys = Array.from(new Set(items.map((item) => String(item.journey_key || "").trim()).filter(Boolean)));
  const orderedJourneyKeys = [
    ...["customer", "revenue", "operations"].filter((key) => presentJourneyKeys.includes(key)),
    ...presentJourneyKeys.filter((key) => !["customer", "revenue", "operations"].includes(key)).sort((a, b) => a.localeCompare(b)),
  ];
  const grouped = orderedJourneyKeys.map((journeyKey) => {
    const journeyItems = items.filter((item) => item.journey_key === journeyKey);
    const stepMap = new Map<string, OpportunityRow[]>();

    for (const item of journeyItems) {
      const key = `${item.step_number ?? "?"}|${item.step_label ?? "Unassigned step"}`;
      if (!stepMap.has(key)) stepMap.set(key, []);
      stepMap.get(key)?.push(item);
    }

    const steps = Array.from(stepMap.entries())
      .map(([key, rows]) => {
        const [stepNumber, stepLabel] = key.split("|");
        return {
          stepNumber,
          stepLabel,
          items: rows.sort((a, b) => (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0)),
        };
      })
      .sort((a, b) => Number(a.stepNumber) - Number(b.stepNumber));

    return {
      journeyKey,
      steps,
      managedOutcome: managedOutcomes.find((outcome) => outcome.journey_key === journeyKey) ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <div className="rounded-[24px] border p-5" style={{ borderColor: c.line, background: c.panel }}>
        <h2 className="font-sans text-[22px] font-semibold" style={{ color: c.charcoal }}>
          Opportunity Solution Tree
        </h2>
        <p className="mt-2 max-w-4xl font-sans text-[13px] leading-[1.7]" style={{ color: c.secondary }}>
          This view separates a top-level product outcome target from the opportunity branches beneath it. The top node is the leading-indicator result the team should manage toward. The lower nodes are opportunity hypotheses to explore before selecting solutions. Hover over any opportunity branch to preview detail. Current scores are still estimated from public evidence, not survey-validated measurements.
        </p>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
          Product outcome target → step branches → opportunity branches (solutions come later)
        </p>
      </div>

      <div className="space-y-6">
        {grouped.map(({ journeyKey, steps, managedOutcome }) => {
          const accent = JOURNEY_ACCENT[journeyKey] || c.monitor;
          const itemCount = steps.reduce((sum, step) => sum + step.items.length, 0);
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
                  {steps.length} steps · {itemCount} opportunities
                </p>
              </div>

              {steps.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed p-4" style={{ borderColor: c.line, background: c.card }}>
                  <p className="font-sans text-[13px]" style={{ color: c.secondary }}>
                    No opportunities mapped to this journey yet.
                  </p>
                </div>
              ) : (
                <div className="mt-5 overflow-x-auto pb-2">
                  <div
                    style={{
                      minWidth: `${Math.max(TREE_MAP_MIN_WIDTH, steps.length * TREE_STEP_MIN_WIDTH)}px`,
                    }}
                  >
                    <div className="flex justify-center">
                      <HoverCard openDelay={100}>
                        <HoverCardTrigger asChild>
                          <div
                            className="relative max-w-[360px] rounded-[24px] border px-5 py-4 text-center shadow-sm"
                            style={{ borderColor: c.line, background: "#F8F4ED" }}
                          >
                            <div
                              className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full"
                              style={{ background: `${accent}18`, color: accent }}
                            >
                              <Sparkles className="h-4 w-4" />
                            </div>
                            <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                              Product outcome target
                            </p>
                            <p className="mt-1 font-sans text-[16px] font-semibold leading-[1.4]" style={{ color: c.charcoal }}>
                              {managedOutcome?.outcome_title || journeyRootLabel(journeyKey)}
                            </p>
                            <p className="mt-2 font-sans text-[12px] italic leading-[1.55]" style={{ color: c.secondary }}>
                              {managedOutcome?.leading_indicator
                                ? `Leading indicator: ${managedOutcome.leading_indicator}`
                                : "Provisional leading-indicator target derived from public evidence, not yet a hard-measured KPI."}
                            </p>
                          </div>
                        </HoverCardTrigger>
                        <HoverCardContent className="w-[320px] border-[#dde6d1] bg-[#faf7f6] text-[#233c4b] shadow-[0_20px_60px_rgba(35,60,75,0.16)]">
                          <div className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                            Product outcome target
                          </div>
                          <p className="mt-2 font-sans text-[13px] leading-[1.65]" style={{ color: c.secondary }}>
                            {managedOutcome?.outcome_statement ||
                              "This root is the result the team should manage toward. It is not a feature, project, or initiative. The branches below are opportunities that may explain why the team is or is not reaching that outcome."}
                          </p>
                          {managedOutcome?.target_direction ? (
                            <p className="mt-3 font-sans text-[12px] leading-[1.6]" style={{ color: c.secondary }}>
                              Target direction: {managedOutcome.target_direction}
                            </p>
                          ) : null}
                          {managedOutcome?.evidence_basis ? (
                            <p className="mt-3 font-sans text-[12px] leading-[1.6]" style={{ color: c.secondary }}>
                              Evidence basis: {managedOutcome.evidence_basis}
                            </p>
                          ) : null}
                          <p className="mt-3 font-sans text-[12px] italic leading-[1.6]" style={{ color: c.muted }}>
                            {managedOutcome
                              ? `Confidence ${managedOutcome.confidence}/100. Still provisional until backed by measured baseline and target data.`
                              : "A true managed outcome should eventually become a measurable leading indicator with a baseline and target."}
                          </p>
                        </HoverCardContent>
                      </HoverCard>
                    </div>

                    <div className="mx-auto h-8 w-px" style={{ background: `${accent}66` }} />
                    <div className="mx-auto h-px w-[88%]" style={{ background: `${accent}55` }} />

                    <div className="mt-6 grid gap-5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(${TREE_STEP_MIN_WIDTH}px, 1fr))` }}>
                      {steps.map((step) => (
                        <div key={`${journeyKey}-${step.stepNumber}-${step.stepLabel}`} className="flex flex-col items-center">
                          <div className="h-6 w-px" style={{ background: `${accent}55` }} />
                          <HoverCard openDelay={100}>
                            <HoverCardTrigger asChild>
                              <button
                                type="button"
                                className="w-full rounded-[22px] border px-4 py-3 text-left shadow-sm transition-transform hover:-translate-y-0.5"
                                style={{ borderColor: c.line, background: c.card }}
                                title={step.stepLabel ? `Step ${step.stepNumber}: ${step.stepLabel}` : `Step ${step.stepNumber}`}
                              >
                                <div className="font-mono text-[10px] uppercase tracking-[0.08em] whitespace-nowrap" style={{ color: c.muted }}>
                                  Job Step {step.stepNumber}
                                </div>
                                <div className="mt-1 font-sans text-[14px] font-semibold leading-[1.45]" style={{ color: c.charcoal }}>
                                  {step.stepLabel}
                                </div>
                                <div className="mt-3 flex items-center gap-2">
                                  <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
                                    {step.items.length} branches
                                  </span>
                                </div>
                              </button>
                            </HoverCardTrigger>
                            <HoverCardContent className="w-[300px] border-[#dde6d1] bg-[#faf7f6] text-[#233c4b] shadow-[0_20px_60px_rgba(35,60,75,0.16)]">
                              <div className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                                Step branch
                              </div>
                              <p className="mt-2 font-sans text-[13px] leading-[1.65]" style={{ color: c.secondary }}>
                                This branch groups the opportunity nodes around the same moment in the journey, so we can see where to investigate before discussing solutions.
                              </p>
                            </HoverCardContent>
                          </HoverCard>

                          <div className="h-5 w-px" style={{ background: `${accent}44` }} />

                          <div className="w-full space-y-3">
                            {step.items.map((item) => {
                              const opportunityNumber = opportunityNumberById.get(item.id);
                              const isTargeted = targetOpportunityId === item.id;
                              const readableOutcome = humanizeOutcomeText(item.outcome);
                              const score = formatOdiScore(odiScore(item));
                              const workflowStatus = resolveWorkflowStatus(item);
                              const actionType = opportunityActionFromPriorityTier(item.priority_tier);
                              return (
                                <div key={item.id} className="flex justify-center">
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
                                            {item.step_number ? `Step ${item.step_number}` : "Step"}
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
                                    <div className="mt-3 pt-2" style={{ borderTop: `1px solid ${c.line}` }}>
                                      <div className="flex items-center justify-between gap-2">
                                        <p
                                          className="font-sans text-[13px] font-semibold"
                                          style={{ color: priorityAccent(item.priority_tier) }}
                                        >
                                          {priorityLabel(item.priority_tier)}
                                        </p>
                                        <div className="flex items-center gap-2">
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
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
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
  const { loading, items, error, updatingWorkflowId, workflowStatusAvailable, updateWorkflowStatus } = useOpportunities(activeCompany?.id);
  const { items: managedOutcomes } = useManagedOutcomes(activeCompany?.id);
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
          <PageContextStatus className="mt-4" lastScoredAt={activeCompany?.last_scored_at} sourceSignals={sourceSignals} />
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
