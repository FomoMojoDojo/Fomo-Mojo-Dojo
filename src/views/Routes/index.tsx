import TopNav from "@/components/layout/TopNav";
import { Wrench, LineChart, Rocket } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { useSourceConfidence } from "@/hooks/useSourceConfidence";
import { useJobSteps } from "@/hooks/useJobSteps";
import { useOpportunities } from "@/hooks/useOpportunities";
import { useInputs } from "@/hooks/useInputs";
import { useRoutes } from "@/views/Routes/useRoutes";
import { MetaBadge } from "@/components/ui/semantic-badges";
import { SourceLegend } from "@/components/provenance/SourceLegend";
import RouteCard from "./RouteCard";
import type { RouteRow } from "./useRoutes";
import type { JobStepRow } from "@/hooks/useJobSteps";
import type { OpportunityRow } from "@/hooks/useOpportunities";

const c = {
  bg: "#faf7f6",
  panel: "#FFFFFF",
  panelDark: "#1E1A14",
  line: "#DDE6D1",
  lineWarm: "#D6CCB8",
  warmCard: "#F2EEE7",
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

function stepStatus(step: JobStepRow) {
  if (step.designed && !step.has_gap) return "complete" as const;
  if (step.designed || step.has_gap) return "in_progress" as const;
  return "missing" as const;
}

function routeDetail(route: RouteRow, opportunities: OpportunityRow[], steps: JobStepRow[]) {
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
      : "Related job steps are already partly designed, so this route can tighten and scale what exists.",
  ];

  return {
    steps: stepItems,
    evidence: evidenceItems,
    whyThisMatters,
    frameworks: (route.frameworks_used ?? []).filter(Boolean),
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
}: {
  category: string;
  items: RouteRow[];
  opportunities: OpportunityRow[];
  steps: JobStepRow[];
}) {
  const meta = CATEGORY_META[category] ?? {
    title: category,
    subtitle: "Routes with a non-standard category.",
    accent: c.amber,
  };

  return (
    <section
      className="overflow-hidden rounded-[18px] border p-4"
      style={{ borderColor: c.lineWarm, background: c.warmCard }}
    >
      <div className="mb-4 flex items-center justify-between gap-3 border-b pb-3" style={{ borderColor: c.lineWarm }}>
        <div className="flex items-center gap-2">
          <span style={{ color: meta.accent }}>{categoryIcon(category)}</span>
          <h2 className="font-sans text-[28px] font-semibold" style={{ color: c.charcoal }}>
            {meta.title}
          </h2>
        </div>
        <MetaBadge>{items.length}</MetaBadge>
      </div>

      <p className="mb-4 font-sans text-[13px]" style={{ color: c.secondary }}>
        {meta.subtitle}
      </p>

      <div className="space-y-3">
        {items.map((route) => {
          const detail = routeDetail(route, opportunities, steps);
          return (
            <RouteCard
              key={route.id}
              route={route}
              accent={meta.accent}
              steps={detail.steps}
              evidence={detail.evidence}
              whyThisMatters={detail.whyThisMatters}
              frameworks={detail.frameworks}
            />
          );
        })}
        {items.length === 0 ? (
          <div
            className="rounded-lg border px-3 py-4 text-center font-sans text-[13px]"
            style={{ borderColor: c.lineWarm, color: c.secondary, background: c.panel }}
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
    <div className="rounded-xl border p-4" style={{ borderColor: c.lineWarm, background: c.panel }}>
      <div className="mb-2 flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em]" style={{ color: c.charcoal }}>
          {label}
        </p>
        <span className="font-mono text-[12px] font-semibold" style={{ color: accent }}>
          {bounded}%
        </span>
      </div>
      <div className="h-[6px] w-full rounded-full" style={{ background: "#DDD5C7" }}>
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
  const { loading, items, error } = useRoutes(activeCompany?.id);
  const { items: steps } = useJobSteps(activeCompany?.id);
  const { items: opportunities } = useOpportunities(activeCompany?.id);
  const { query: inputsQuery } = useInputs(activeCompany?.id);
  const inputs = inputsQuery.data ?? [];
  const { signals: sourceSignals } = useSourceConfidence({
    companyId: activeCompany?.id,
    areaScoresJson: activeCompany?.area_scores_json,
  });

  const fix = items.filter((route) => String(route.category).toLowerCase() === "fix");
  const improve = items.filter((route) => String(route.category).toLowerCase() === "improve");
  const create = items.filter((route) => String(route.category).toLowerCase() === "create");

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
        <div className="mb-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                {activeCompany?.name || "No company selected"}
              </div>
              <h1 className="mt-1 font-sans text-[28px] font-semibold" style={{ color: c.charcoal }}>
                Routes
              </h1>
              <p className="mt-1 font-sans text-[14px]" style={{ color: c.secondary }}>
                Click any route to expand steps, evidence needed, and why this matters.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <MetaBadge>
                {activeCompany?.last_scored_at
                  ? `Updated ${new Date(activeCompany.last_scored_at).toLocaleDateString()}`
                  : "Awaiting research"}
              </MetaBadge>
              <SourceLegend signals={sourceSignals} />
            </div>
          </div>
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
            <section className="rounded-[18px] border px-5 py-4" style={{ borderColor: "#2A251C", background: c.panelDark }}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex min-w-[220px] items-center gap-4">
                  <div>
                    <p className="font-sans text-[54px] font-black leading-none tracking-tight" style={{ color: c.amber }}>
                      {currentScore}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: "#9B9384" }}>
                      Current reality
                    </p>
                  </div>
                  <div className="h-10 w-px" style={{ background: "#3B352A" }} />
                  <div>
                    <p className="font-mono text-[11px]" style={{ color: "#7EB55B" }}>
                      {`+${Math.max(0, potentialScore - currentScore)} potential delta`}
                    </p>
                    <p className="mt-1 font-sans text-[25px]" style={{ color: "#D6CCB8" }}>
                      {inputComplete} of {inputTotal} inputs complete · {criticalGaps} critical gaps
                    </p>
                  </div>
                </div>

                <div className="flex items-end gap-6">
                  <div className="text-right">
                    <p className="font-sans text-[42px] font-bold leading-none" style={{ color: c.teal }}>
                      {potentialScore}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: "#9B9384" }}>
                      Potential
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-sans text-[42px] font-bold leading-none" style={{ color: c.amber }}>
                      {items.length}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: "#9B9384" }}>
                      Routes
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-sans text-[42px] font-bold leading-none" style={{ color: "#F1D174" }}>
                      {Math.round(totalPts)}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: "#9B9384" }}>
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
              <RoutesColumn category="fix" items={fix} opportunities={opportunities} steps={steps} />
              <RoutesColumn category="improve" items={improve} opportunities={opportunities} steps={steps} />
              <RoutesColumn category="create" items={create} opportunities={opportunities} steps={steps} />
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
