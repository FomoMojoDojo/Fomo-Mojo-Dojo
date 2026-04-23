import { useMemo } from "react";
import TopNav from "@/components/layout/TopNav";
import { Wrench, LineChart, Rocket } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { useSourceConfidence } from "@/hooks/useSourceConfidence";
import { useJobSteps } from "@/hooks/useJobSteps";
import { useOpportunities } from "@/hooks/useOpportunities";
import { useManagedOutcomes } from "@/hooks/useManagedOutcomes";
import { useSolutionIdeas } from "@/hooks/useSolutionIdeas";
import { useInputs } from "@/hooks/useInputs";
import { useRoutes } from "@/views/Routes/useRoutes";
import { MetaBadge } from "@/components/ui/semantic-badges";
import PageContextStatus from "@/components/layout/PageContextStatus";
import GenericAuditTraceNote from "@/components/diagnostics/GenericAuditTraceNote";
import RouteCard from "./RouteCard";
import type { RouteRow } from "./useRoutes";
import type { JobStepRow } from "@/hooks/useJobSteps";
import type { OpportunityRow } from "@/hooks/useOpportunities";
import { isGenericAuditCompany } from "@/lib/genericAudit";
import {
  classifyOpportunityFocus,
  classifyRouteFocus,
  deriveInitiativeContext,
  type FocusClassification,
} from "@/lib/initiativeFocus";

const c = {
  bg: "#faf7f6",
  panel: "#FFFFFF",
  panelTint: "#F7FBF8",
  line: "#DDE6D1",
  lineFaint: "#EEF3E9",
  charcoal: "#233C4B",
  secondary: "#46606D",
  muted: "#6E847F",
  coral: "#FF7D2D",
  amber: "#FAC846",
  teal: "#5F9B8C",
};

const CATEGORY_META: Record<string, { title: string; subtitle: string; accent: string }> = {
  fix: {
    title: "Fix",
    subtitle: "Address gaps that are holding back your score.",
    accent: c.coral,
  },
  improve: {
    title: "Improve",
    subtitle: "Strengthen what's partially in place.",
    accent: c.amber,
  },
  create: {
    title: "Create",
    subtitle: "Build new capabilities for growth.",
    accent: c.teal,
  },
};

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenSet(text: string) {
  return new Set(
    normalize(text)
      .split(" ")
      .filter((token) => token.length >= 4),
  );
}

function overlapScore(a: Set<string>, b: Set<string>) {
  let hits = 0;
  for (const token of a) {
    if (b.has(token)) hits++;
  }
  return hits;
}

function categoryPriority(category: string) {
  if (category === "fix") return "focus";
  if (category === "improve") return "monitor";
  return "defer";
}

function focusSortValue(focus: FocusClassification | undefined) {
  if (!focus) return 0;
  if (focus.level === "initiative") return 2;
  if (focus.level === "related") return 1;
  return 0;
}

function stepStatus(step: JobStepRow) {
  if (step.designed && !step.has_gap) return "complete" as const;
  if (step.designed || step.has_gap) return "in_progress" as const;
  return "missing" as const;
}

function routeDetail(args: {
  route: RouteRow;
  opportunities: OpportunityRow[];
  steps: JobStepRow[];
  initiativeContext: ReturnType<typeof deriveInitiativeContext>;
  opportunityFocusById: Map<string, FocusClassification>;
}) {
  const { route, opportunities, steps, initiativeContext, opportunityFocusById } = args;
  const category = String(route.category || "improve").toLowerCase();
  const expectedPriority = categoryPriority(category);
  const routeTokens = tokenSet(`${route.title} ${route.short_description || ""}`);

  const rankedOpps = opportunities
    .map((opp) => {
      const text = `${opp.outcome} ${opp.step_label || ""} ${opp.journey_key}`;
      const textTokens = tokenSet(text);
      const overlap = overlapScore(routeTokens, textTokens);
      const priorityBoost = opp.priority_tier === expectedPriority ? 2 : 0;
      return {
        opp,
        score: overlap + priorityBoost + ((opp.opportunity_score ?? 0) / 20),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((item) => item.opp);

  const relatedSteps = rankedOpps.length > 0
    ? rankedOpps
        .map((opp) =>
          steps.find(
            (step) =>
              step.journey_key === opp.journey_key &&
              step.step_number === opp.step_number &&
              step.step_label === opp.step_label,
          ),
        )
        .filter((step): step is JobStepRow => !!step)
    : steps
        .filter((step) => (category === "fix" ? step.has_gap : true))
        .slice(0, 3);

  const uniqueSteps = Array.from(new Map(relatedSteps.map((step) => [step.id, step])).values()).slice(0, 4);

  const stepItems =
    uniqueSteps.length > 0
      ? uniqueSteps.map((step) => ({
          id: step.id,
          title: `Step ${step.step_number ?? "?"}: ${step.step_label || "Untitled"}${step.gap_note ? ` — ${step.gap_note}` : ""}`,
          status: stepStatus(step),
        }))
      : [
          {
            id: `${route.id}-step-1`,
            title: "Define the concrete workstream and assign an owner.",
            status: "missing" as const,
          },
          {
            id: `${route.id}-step-2`,
            title: "Confirm the customer, revenue, or operations point of friction this route addresses.",
            status: "missing" as const,
          },
        ];

  const evidenceItems = [
    ...uniqueSteps.slice(0, 2).map((step) => ({
      id: `${route.id}-evidence-step-${step.id}`,
      title: step.has_gap
        ? `Evidence for ${step.step_label || "this step"} is thin: ${step.gap_note || "clarify current-state proof points"}`
        : `Current-state evidence exists for ${step.step_label || "this step"}`,
      status: step.has_gap ? ("missing" as const) : ("complete" as const),
    })),
    {
      id: `${route.id}-evidence-owner`,
      title:
        category === "fix"
          ? "Decision owner and turnaround timing confirmed"
          : category === "create"
            ? "New capability owner and pilot scope defined"
            : "Improvement owner, baseline metric, and target state defined",
      status: "in_progress" as const,
    },
    {
      id: `${route.id}-evidence-proof`,
      title:
        rankedOpps.length > 0
          ? "Validate this route against the linked outcome opportunities"
          : "Gather evidence that this route meaningfully changes an important outcome",
      status: rankedOpps.length > 0 ? ("in_progress" as const) : ("missing" as const),
    },
  ].slice(0, 4);

  const whyThisMatters = [
    route.short_description || "This route addresses a meaningful strategic gap.",
    rankedOpps.length > 0
      ? `Linked to ${rankedOpps.length} opportunity ${rankedOpps.length === 1 ? "signal" : "signals"}, led by ${rankedOpps[0].outcome}.`
      : "No route-to-opportunity linkage exists yet, so this needs stronger evidence before prioritization.",
    uniqueSteps.some((step) => step.has_gap)
      ? "At least one related job step is still marked as a gap, so this route reduces visible execution risk."
      : "Related checkpoints are already partly designed, so this route can tighten and scale what exists.",
  ];

  const linkedOpportunityFocus = rankedOpps
    .map((opp) => opportunityFocusById.get(opp.id))
    .filter((item): item is FocusClassification => !!item);
  const focus = classifyRouteFocus({
    route,
    context: initiativeContext,
    linkedOpportunityFocus,
  });

  const storedSteps = Array.isArray(route.steps_json) && route.steps_json.length > 0
    ? route.steps_json
    : null;
  const storedEvidence = Array.isArray(route.evidence_json) && route.evidence_json.length > 0
    ? route.evidence_json
    : null;
  const storedWhy = Array.isArray(route.why_this_matters_json) && route.why_this_matters_json.length > 0
    ? route.why_this_matters_json
    : null;

  return {
    steps: storedSteps ?? stepItems,
    evidence: storedEvidence ?? evidenceItems,
    whyThisMatters: storedWhy ?? whyThisMatters,
    frameworks: (route.frameworks_used ?? []).filter(Boolean),
    focus,
  };
}

function categoryIcon(category: string) {
  if (category === "fix") return <Wrench className="h-4 w-4" />;
  if (category === "improve") return <LineChart className="h-4 w-4" />;
  return <Rocket className="h-4 w-4" />;
}

function RoutesColumn({
  category,
  items,
  opportunities,
  steps,
  initiativeContext,
  opportunityFocusById,
  routeOutcomeMap,
}: {
  category: string;
  items: RouteRow[];
  opportunities: OpportunityRow[];
  steps: JobStepRow[];
  initiativeContext: ReturnType<typeof deriveInitiativeContext>;
  opportunityFocusById: Map<string, FocusClassification>;
  routeOutcomeMap: Map<string, { statement: string; leadingIndicator: string }>;
}) {
  const meta = CATEGORY_META[category] ?? {
    title: category,
    subtitle: "Routes with a non-standard category.",
    accent: c.amber,
  };

  return (
    <section
      className="overflow-hidden rounded-[18px] border p-4"
      style={{ borderColor: c.line, background: c.panel }}
    >
      <div className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span style={{ color: meta.accent }}>{categoryIcon(category)}</span>
            <h2 className="font-sans text-[32px] font-semibold leading-[1.05]" style={{ color: c.charcoal }}>
              {meta.title}
            </h2>
          </div>
          <MetaBadge>{items.length}</MetaBadge>
        </div>

        <p className="mt-2 font-sans text-[14px] leading-[1.55]" style={{ color: c.secondary }}>
          {meta.subtitle}
        </p>
        <div className="mt-3 border-b" style={{ borderColor: c.line }} />
      </div>

      <div className="space-y-3">
        {[...items]
          .map((route) => ({
            route,
            detail: routeDetail({
              route,
              opportunities,
              steps,
              initiativeContext,
              opportunityFocusById,
            }),
          }))
          .sort((a, b) => {
            const focusRank = focusSortValue(b.detail.focus) - focusSortValue(a.detail.focus);
            if (focusRank !== 0) return focusRank;
            return Number(a.route.sort_order ?? 999) - Number(b.route.sort_order ?? 999);
          })
          .map(({ route, detail }) => {
          return (
            <RouteCard
              key={route.id}
              route={route}
              accent={meta.accent}
              steps={detail.steps}
              evidence={detail.evidence}
              whyThisMatters={detail.whyThisMatters}
              frameworks={detail.frameworks}
              linkedDesiredOutcome={routeOutcomeMap.get(route.id) || null}
              focus={detail.focus}
            />
          );
        })}
        {items.length === 0 ? (
          <div
            className="rounded-lg border px-3 py-4 text-center font-sans text-[13px]"
            style={{ borderColor: c.line, color: c.secondary, background: c.panelTint }}
          >
            No routes in this category yet.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function groupStats(
  inputs: Array<{ group_key: string; completeness: number; status: string; input_label: string; score_impact: number }>,
  groupKey: string,
) {
  const group = inputs.filter((item) => item.group_key === groupKey);
  if (group.length === 0) {
    return {
      percent: 0,
      text: "No mapped inputs yet for this section.",
    };
  }

  const percent = Math.round(group.reduce((sum, item) => sum + Number(item.completeness || 0), 0) / group.length);
  const gaps = group
    .filter((item) => item.status === "gap" || item.status === "not_started")
    .sort((a, b) => Number(b.score_impact || 0) - Number(a.score_impact || 0));

  return {
    percent,
    text: gaps[0]
      ? `${gaps[0].input_label} is currently the highest-impact gap.`
      : "Core inputs are in place; keep evidence current.",
  };
}

function StatBand({
  label,
  percent,
  text,
  accent,
}: {
  label: string;
  percent: number;
  text: string;
  accent: string;
}) {
  const bounded = Math.max(0, Math.min(100, percent));
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: c.line, background: c.panel }}>
      <div className="mb-2 flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em]" style={{ color: c.charcoal }}>
          {label}
        </p>
        <span className="font-mono text-[12px] font-semibold" style={{ color: accent }}>
          {bounded}%
        </span>
      </div>
      <div className="h-[6px] w-full rounded-full" style={{ background: c.lineFaint }}>
        <div className="h-full rounded-full" style={{ width: `${bounded}%`, background: accent }} />
      </div>
      <p className="mt-3 font-sans text-[13px] leading-[1.5]" style={{ color: c.secondary }}>
        {text}
      </p>
    </div>
  );
}

export default function RoutesView() {
  const { activeCompany } = useCompany();
  const auditMode = isGenericAuditCompany(activeCompany);
  const { loading, items, error } = useRoutes(activeCompany?.id);
  const { items: steps } = useJobSteps(activeCompany?.id);
  const { items: opportunities } = useOpportunities(activeCompany?.id);
  const { items: managedOutcomes } = useManagedOutcomes(activeCompany?.id);
  const { items: solutionIdeas } = useSolutionIdeas(activeCompany?.id);
  const { query: inputsQuery } = useInputs(activeCompany?.id);
  const inputs = inputsQuery.data ?? [];
  const { signals: sourceSignals } = useSourceConfidence({
    companyId: activeCompany?.id,
    areaScoresJson: activeCompany?.area_scores_json,
  });
  const initiativeContext = useMemo(
    () =>
      deriveInitiativeContext({
        areaScoresJson: activeCompany?.area_scores_json,
        jobSteps: steps,
      }),
    [activeCompany?.area_scores_json, steps],
  );
  const opportunityFocusById = useMemo(() => {
    const map = new Map<string, FocusClassification>();
    for (const opp of opportunities) {
      map.set(opp.id, classifyOpportunityFocus(opp, initiativeContext));
    }
    return map;
  }, [initiativeContext, opportunities]);

  const fix = items.filter((route) => String(route.category).toLowerCase() === "fix");
  const improve = items.filter((route) => String(route.category).toLowerCase() === "improve");
  const create = items.filter((route) => String(route.category).toLowerCase() === "create");
  const routeOutcomeMap = useMemo(() => {
    const managedById = new Map(
      managedOutcomes.map((outcome) => [
        outcome.id,
        {
          statement: String(outcome.outcome_statement || outcome.outcome_title || "").trim(),
          leadingIndicator: String(outcome.leading_indicator || outcome.metric || "").trim(),
        },
      ]),
    );
    const opportunitiesById = new Map(opportunities.map((opp) => [opp.id, opp]));
    const map = new Map<string, { statement: string; leadingIndicator: string }>();
    for (const idea of solutionIdeas) {
      const routeId = String(idea.route_id || "").trim();
      if (!routeId || map.has(routeId)) continue;
      const opp = opportunitiesById.get(String(idea.opportunity_id || ""));
      if (!opp?.managed_outcome_id) continue;
      const managed = managedById.get(String(opp.managed_outcome_id || ""));
      if (!managed) continue;
      map.set(routeId, managed);
    }
    return map;
  }, [managedOutcomes, opportunities, solutionIdeas]);

  const currentScore = Math.round(Number(activeCompany?.mojo_score ?? 0));
  const potentialScore = Math.round(Number(activeCompany?.potential_score ?? activeCompany?.projected_score ?? 0));
  const totalPts = items.reduce((sum, route) => sum + Math.max(0, Number(route.pts_value || 0)), 0);
  const inputTotal = inputs.length;
  const inputComplete = inputs.filter((item) => item.status === "complete").length;
  const criticalGaps = inputs.filter((item) => item.status === "gap" || item.status === "not_started").length;

  const foundationStats = groupStats(inputs, "foundation");
  const executionStats = groupStats(inputs, "execution");
  const evidenceStats = groupStats(inputs, "market_evidence");

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

      <main className="mx-auto max-w-[1440px] px-4 pb-12 pt-6 sm:px-6 md:px-8">
        <PageContextStatus lastScoredAt={activeCompany?.last_scored_at} sourceSignals={sourceSignals} />

        <div className="mb-6">
          <div className="flex flex-wrap items-start gap-3">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                {activeCompany?.name || "No company selected"}
              </div>
              <h1 className="mt-1 font-sans text-[34px] font-semibold leading-[1.1]" style={{ color: c.charcoal }}>
                Routes
              </h1>
              <p className="mojo-under-title font-sans text-[15px] mojo-desc" style={{ color: c.secondary }}>
                Click any route to expand steps, evidence needed, and why this matters.
              </p>
              <div className="mt-3">
                <MetaBadge>{`Initiative: ${initiativeContext.primaryJourneyTitle}`}</MetaBadge>
              </div>
            </div>
          </div>
          <GenericAuditTraceNote
            active={auditMode}
            className="mt-3 max-w-5xl"
            source="routes table when available; otherwise route cards are derived from opportunities and priority tiers."
            evaluation="AI/logic classify each route as Fix/Improve/Create and match it against initiative focus and linked opportunities."
            scoring="Route impact uses pts_value; top-panel score delta compares current reality vs potential and highlights expected movement."
            why="This shows whether route guidance is evidence-backed or derived fallback, so you can tune route quality and confidence."
          />
        </div>

        {!activeCompany?.id ? (
          <div className="rounded-[24px] border px-6 py-12 text-center" style={{ borderColor: c.line, background: c.panel }}>
            <p className="font-sans text-[15px]" style={{ color: c.secondary }}>
              Select a company to view route data.
            </p>
          </div>
        ) : loading ? (
          <div className="rounded-[24px] border px-6 py-12 text-center" style={{ borderColor: c.line, background: c.panel }}>
            <p className="font-mono text-[12px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
              Loading routes…
            </p>
          </div>
        ) : error ? (
          <div className="rounded-[24px] border px-6 py-12 text-center" style={{ borderColor: c.line, background: c.panel }}>
            <p className="font-sans text-[15px]" style={{ color: c.coral }}>
              Failed to load routes: {error}
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <section className="rounded-[18px] border px-5 py-4" style={{ borderColor: c.line, background: c.panel }}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex min-w-[220px] items-center gap-4">
                  <div>
                    <p className="font-sans text-[54px] font-black leading-none tracking-tight" style={{ color: c.charcoal }}>
                      {currentScore}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: c.muted }}>
                      Current reality
                    </p>
                  </div>
                  <div className="h-10 w-px" style={{ background: c.line }} />
                  <div>
                    <p className="font-mono text-[11px]" style={{ color: c.teal }}>
                      {`+${Math.max(0, potentialScore - currentScore)} potential delta`}
                    </p>
                    <p className="mt-1 font-sans text-[16px] font-semibold leading-[1.45]" style={{ color: c.charcoal }}>
                      {inputComplete} of {inputTotal} inputs complete · {criticalGaps} critical gaps
                    </p>
                  </div>
                </div>

                <div className="flex items-end gap-6">
                  <div className="text-right">
                    <p className="font-sans text-[34px] font-bold leading-none" style={{ color: c.teal }}>
                      {potentialScore}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: c.muted }}>
                      Potential
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-sans text-[34px] font-bold leading-none" style={{ color: c.amber }}>
                      {items.length}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: c.muted }}>
                      Routes
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-sans text-[34px] font-bold leading-none" style={{ color: c.coral }}>
                      {Math.round(totalPts)}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: c.muted }}>
                      Total Pts
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <StatBand label="Foundation" percent={foundationStats.percent} text={foundationStats.text} accent={c.amber} />
              <StatBand label="Execution" percent={executionStats.percent} text={executionStats.text} accent="#5D9B58" />
              <StatBand label="Evidence" percent={evidenceStats.percent} text={evidenceStats.text} accent={c.coral} />
            </section>

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <RoutesColumn
                category="fix"
                items={fix}
                opportunities={opportunities}
                steps={steps}
                initiativeContext={initiativeContext}
                opportunityFocusById={opportunityFocusById}
                routeOutcomeMap={routeOutcomeMap}
              />
              <RoutesColumn
                category="improve"
                items={improve}
                opportunities={opportunities}
                steps={steps}
                initiativeContext={initiativeContext}
                opportunityFocusById={opportunityFocusById}
                routeOutcomeMap={routeOutcomeMap}
              />
              <RoutesColumn
                category="create"
                items={create}
                opportunities={opportunities}
                steps={steps}
                initiativeContext={initiativeContext}
                opportunityFocusById={opportunityFocusById}
                routeOutcomeMap={routeOutcomeMap}
              />
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
