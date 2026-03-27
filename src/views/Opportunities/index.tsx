import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, GitBranch, Info, Sparkles } from "lucide-react";
import TopNav from "@/components/layout/TopNav";
import { useCompany } from "@/hooks/useCompany";
import { useSourceConfidence } from "@/hooks/useSourceConfidence";
import { useManagedOutcomes } from "@/hooks/useManagedOutcomes";
import { useOpportunities, type OpportunityRow } from "@/hooks/useOpportunities";
import { useJobSteps } from "@/hooks/useJobSteps";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { MetaBadge, ScoreChip, StateBadge, TierBadge } from "@/components/ui/semantic-badges";
import PageContextStatus from "@/components/layout/PageContextStatus";
import {
  alignmentLevelFromFocus,
  classifyOpportunityFocus,
  deriveInitiativeContext,
  type FocusClassification,
} from "@/lib/initiativeFocus";
import AlignmentCircle from "@/components/ui/AlignmentCircle";

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

const UNVALIDATED_OUTCOME_TOOLTIP =
  "Unvalidated: this desired outcome is currently estimated from uploaded/public evidence and generated research. It has not yet been validated with ODI survey data or direct customer interviews.";
const PUBLIC_INFERRED_TOOLTIP =
  "Public inferred: this label is estimated from public web signals only because no uploaded company evidence is attached yet.";

function focusSortValue(focus: FocusClassification | undefined) {
  if (!focus) return 0;
  if (focus.level === "initiative") return 2;
  if (focus.level === "related") return 1;
  return 0;
}

function AlignmentIcon({ focus }: { focus?: FocusClassification }) {
  const level = alignmentLevelFromFocus(focus);
  return (
    <span
      className="inline-flex items-center rounded-full border px-1.5 py-1"
      style={{ borderColor: c.line, background: "#FFFFFF" }}
      title={`Goal alignment ${level * 25}%`}
    >
      <AlignmentCircle level={level} />
    </span>
  );
}

function titleCaseJourney(key: string) {
  if (key === "customer") return "Customer";
  if (key === "revenue") return "Revenue";
  if (key === "operations") return "Operations";
  return key;
}

function servingLabel(item: OpportunityRow) {
  const importance = item.importance ?? 0;
  const satisfaction = item.satisfaction ?? 0;
  const delta = importance - satisfaction;

  if (delta >= 3) return "underserved";
  if (delta <= -2) return "overserved";
  return "served";
}

function priorityLabel(tier: string) {
  if (tier === "focus") return "Prioritize now";
  if (tier === "monitor") return "Investigate next";
  return "Keep visible";
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
      : "Confirm this is a real underserved outcome before choosing a solution.",
  ];
}

function UnvalidatedOutcomeBadge() {
  return (
    <span title={UNVALIDATED_OUTCOME_TOOLTIP}>
      <MetaBadge>Unvalidated</MetaBadge>
    </span>
  );
}

function PublicInferredBadge() {
  return (
    <span title={PUBLIC_INFERRED_TOOLTIP}>
      <MetaBadge>Public inferred</MetaBadge>
    </span>
  );
}

function OpportunityHoverDetail({
  item,
  focus,
  publicOnly = false,
}: {
  item: OpportunityRow;
  focus?: FocusClassification;
  publicOnly?: boolean;
}) {
  return (
    <div className="w-[320px] rounded-[20px] border p-4" style={{ borderColor: c.line, background: "#FBFAF7" }}>
      <div className="flex flex-wrap items-center gap-2">
        <TierBadge tone={item.priority_tier} />
        <StateBadge tone={servingLabel(item)} />
        <AlignmentIcon focus={focus} />
        <ScoreChip label="Opp" value={item.opportunity_score} />
      </div>

      <div className="mt-3 font-sans text-[15px] font-semibold leading-[1.4]" style={{ color: c.charcoal }}>
        {item.outcome}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <MetaBadge>{titleCaseJourney(item.journey_key)}</MetaBadge>
        {item.step_number ? (
          <span title={item.step_label ? `Step ${item.step_number}: ${item.step_label}` : `Step ${item.step_number}`}>
            <MetaBadge>Step {item.step_number}</MetaBadge>
          </span>
        ) : null}
        {publicOnly ? <PublicInferredBadge /> : null}
        <UnvalidatedOutcomeBadge />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <ScoreChip label="I" value={item.importance} />
        <ScoreChip label="S" value={item.satisfaction} />
        <ScoreChip label="Gap" value={(item.importance ?? 0) - (item.satisfaction ?? 0)} />
      </div>

      <div className="mt-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
          Opportunity branch
        </div>
      </div>

      <div className="mt-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
          Why this node exists
        </div>
        <p className="mt-2 font-sans text-[12px] leading-[1.65]" style={{ color: c.secondary }}>
          {item.priority_tier === "focus"
            ? "This appears underserved enough to justify discovery attention before choosing a solution."
            : item.priority_tier === "monitor"
              ? "This may matter, but it needs better evidence before it becomes a top branch in the tree."
              : "Keep this opportunity visible, but do not invest heavily until stronger evidence appears."}
        </p>
      </div>

      <div className="mt-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
          Evidence still needed
        </div>
        <ul className="mt-2 space-y-2">
          {evidenceNeeded(item).map((entry, index) => (
            <li
              key={`${item.id}-hover-evidence-${index}`}
              className="flex items-start gap-2 font-sans text-[12px] leading-[1.55]"
              style={{ color: c.secondary }}
            >
              <span style={{ color: JOURNEY_ACCENT[item.journey_key] || c.monitor }}>•</span>
              <span>{entry}</span>
            </li>
          ))}
        </ul>
      </div>

    </div>
  );
}

function OpportunityCard({
  item,
  focus,
  publicOnly = false,
}: {
  item: OpportunityRow;
  focus?: FocusClassification;
  publicOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
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

  return (
    <div
      className="overflow-hidden rounded-2xl border"
      style={{ borderColor: c.line, background: c.paper, boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}
    >
      <div className="h-[5px] w-full" style={{ background: accent }} />
      <button type="button" onClick={() => setExpanded((value) => !value)} className="w-full cursor-pointer p-5 text-left">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <TierBadge tone={item.priority_tier} />
              <MetaBadge>{titleCaseJourney(item.journey_key)}</MetaBadge>
              {item.step_number ? (
                <span title={item.step_label ? `Step ${item.step_number}: ${item.step_label}` : `Step ${item.step_number}`}>
                  <MetaBadge>Step {item.step_number}</MetaBadge>
                </span>
              ) : null}
              {publicOnly ? <PublicInferredBadge /> : null}
              <AlignmentIcon focus={focus} />
            </div>

            <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
              Desired Outcome Opportunity
            </p>
            <h3 className="mt-1 font-sans text-[16px] font-semibold leading-tight" style={{ color: c.charcoal }}>
              {item.outcome || "Untitled opportunity"}
            </h3>

            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
              Job step context
            </p>
            <p className="mt-1 font-sans text-[13px]" style={{ color: c.secondary }}>
              {item.step_label || "Unassigned step"}
            </p>
          </div>

          <div className="flex items-start gap-3">
            <ScoreChip label="Est. Opp" value={item.opportunity_score} />
            <div style={{ color: c.muted }}>{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <StateBadge tone={servingLabel(item)} />
          <ScoreChip label="Est. I" value={item.importance} />
          <ScoreChip label="Est. S" value={item.satisfaction} />
          <UnvalidatedOutcomeBadge />
        </div>

      </button>

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
  focusById,
  subtitleItalic = false,
  publicOnly = false,
}: {
  title: string;
  subtitle: string;
  items: OpportunityRow[];
  focusById: Map<string, FocusClassification>;
  subtitleItalic?: boolean;
  publicOnly?: boolean;
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

        <MetaBadge>{items.length} opportunities</MetaBadge>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {items.map((item) => (
          <OpportunityCard key={item.id} item={item} focus={focusById.get(item.id)} publicOnly={publicOnly} />
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
  focusById,
  publicOnly = false,
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
  focusById: Map<string, FocusClassification>;
  publicOnly?: boolean;
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
          This view now separates a top-level product outcome target from the opportunity branches beneath it, which is closer to Teresa Torres' guidance on managing outcomes. The top node is the leading-indicator result the team should manage toward. The lower nodes are opportunity hypotheses to explore before selecting solutions. Hover any branch to inspect the context, evidence gap, and why it is prioritized. Current scores are still estimated from public evidence, not survey-based ODI measurements.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <MetaBadge>Product outcome target</MetaBadge>
          <MetaBadge>Step branch</MetaBadge>
          <MetaBadge>Opportunity branch</MetaBadge>
          <MetaBadge>Solutions come later</MetaBadge>
        </div>
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
                <div className="flex flex-wrap gap-2">
                  <MetaBadge>{steps.length} steps</MetaBadge>
                  <MetaBadge>{itemCount} opportunities</MetaBadge>
                </div>
              </div>

              {steps.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed p-4" style={{ borderColor: c.line, background: c.card }}>
                  <p className="font-sans text-[13px]" style={{ color: c.secondary }}>
                    No opportunities mapped to this journey yet.
                  </p>
                </div>
              ) : (
                <div className="mt-5 overflow-x-auto pb-2">
                  <div className="min-w-[960px]">
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

                    <div className="mt-6 grid gap-5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(220px, 1fr))` }}>
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
                                <div className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                                  Job Step {step.stepNumber}
                                </div>
                                <div className="mt-1 font-sans text-[14px] font-semibold leading-[1.45]" style={{ color: c.charcoal }}>
                                  {step.stepLabel}
                                </div>
                                <div className="mt-3 flex items-center gap-2">
                                  <GitBranch className="h-3.5 w-3.5" style={{ color: accent }} />
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
                              const focus = focusById.get(item.id);
                              return (
                                <div key={item.id} className="flex justify-center">
                                  <HoverCard openDelay={80}>
                                    <HoverCardTrigger asChild>
                                      <button
                                        type="button"
                                        className="relative w-full rounded-[20px] border px-4 py-3 text-left shadow-sm transition-transform hover:-translate-y-0.5"
                                        style={{ borderColor: c.line, background: c.paper }}
                                      >
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="min-w-0">
                                            <div className="mb-2 flex flex-wrap items-center gap-2">
                                              <TierBadge tone={item.priority_tier} />
                                              <StateBadge tone={servingLabel(item)} />
                                              <AlignmentIcon focus={focus} />
                                            </div>
                                            <p className="font-sans text-[13px] font-semibold leading-[1.45]" style={{ color: c.charcoal }}>
                                              {item.outcome}
                                            </p>
                                          </div>
                                          <div className="shrink-0">
                                            <ScoreChip label="Opp" value={item.opportunity_score} />
                                          </div>
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                          <ScoreChip label="I" value={item.importance} />
                                          <ScoreChip label="S" value={item.satisfaction} />
                                        </div>
                                        <div className="mt-3 flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                                          <Info className="h-3 w-3" />
                                          Hover for opportunity detail
                                        </div>
                                      </button>
                                    </HoverCardTrigger>
                                    <HoverCardContent className="w-auto border-none bg-transparent p-0 shadow-none">
                                      <OpportunityHoverDetail item={item} focus={focus} publicOnly={publicOnly} />
                                    </HoverCardContent>
                                  </HoverCard>
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
  const { activeCompany } = useCompany();
  const { loading, items, error } = useOpportunities(activeCompany?.id);
  const { items: managedOutcomes } = useManagedOutcomes(activeCompany?.id);
  const { items: steps } = useJobSteps(activeCompany?.id);
  const { signals: sourceSignals } = useSourceConfidence({
    companyId: activeCompany?.id,
    areaScoresJson: activeCompany?.area_scores_json,
  });
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const publicOnly = !sourceSignals.hasCompanyEvidence;
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

  const prioritizeNow = sortByFocus(items.filter((item) => item.priority_tier === "focus"));
  const investigateNext = sortByFocus(items.filter((item) => item.priority_tier === "monitor"));
  const laterOpportunities = sortByFocus(items.filter((item) => item.priority_tier === "defer"));

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

      <main className="max-w-[1440px] mx-auto px-4 pb-12 pt-6 sm:px-6 md:px-8">
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
                Focus on the product outcomes and leading indicators behind the jobs customers, buyers, and operators are trying to get done. The top of the tree should represent a result to manage toward. The branches below should capture the opportunity space, not outputs, initiatives, or deliverables. Prioritize underserved opportunities first, then test assumptions before locking into solution choices. Current importance, satisfaction, and opportunity values are estimated from public evidence until interviews or surveys exist.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <MetaBadge>{`Initiative: ${initiativeContext.primaryJourneyTitle}`}</MetaBadge>
                <AlignmentIcon focus={{ level: "related", overlap: 1 }} />
              </div>
            </div>
          </div>
          <PageContextStatus className="mt-4" lastScoredAt={activeCompany?.last_scored_at} sourceSignals={sourceSignals} />
          {publicOnly ? (
            <div className="mt-3">
              <PublicInferredBadge />
            </div>
          ) : null}
          {items.length > 0 ? (
            <div className="mt-4">
              <ViewToggle mode={viewMode} onChange={setViewMode} />
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
          <OpportunityTreeView items={sortedForTree} managedOutcomes={managedOutcomes} focusById={focusById} publicOnly={publicOnly} />
        ) : (
          <div className="space-y-8">
            <OpportunitySection
              title="Prioritize Now"
              subtitle="Strong opportunities that deserve attention before you commit to a solution."
              items={prioritizeNow}
              focusById={focusById}
              subtitleItalic
              publicOnly={publicOnly}
            />
            <OpportunitySection
              title="Investigate Next"
              subtitle="Promising opportunities where the next move is better evidence, sharper assumptions, or smaller tests."
              items={investigateNext}
              focusById={focusById}
              subtitleItalic
              publicOnly={publicOnly}
            />
            <OpportunitySection
              title="Later Opportunities"
              subtitle="Keep these visible, but sequence them after higher-leverage opportunity work."
              items={laterOpportunities}
              focusById={focusById}
              publicOnly={publicOnly}
            />
          </div>
        )}
      </main>
    </div>
  );
}
