import TopNav from "@/components/layout/TopNav";
import { useCompany } from "@/hooks/useCompany";
import { useJobSteps } from "@/hooks/useJobSteps";
import { useOpportunities } from "@/hooks/useOpportunities";
import { useRoutes } from "@/views/Routes/useRoutes";
import { MetaBadge } from "@/components/ui/semantic-badges";
import RouteCard from "./RouteCard";
import type { RouteRow } from "./useRoutes";
import type { JobStepRow } from "@/hooks/useJobSteps";
import type { OpportunityRow } from "@/hooks/useOpportunities";

const c = {
  bg: "#faf7f6",
  panel: "#FFFFFF",
  line: "#DDE6D1",
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
    subtitle: "Address blockers and broken transitions before scaling the rest.",
    accent: c.coral,
  },
  improve: {
    title: "Improve",
    subtitle: "Tighten systems that already exist but are not yet reliable or measurable.",
    accent: c.amber,
  },
  create: {
    title: "Create",
    subtitle: "Build new strategic assets or operating loops that do not exist yet.",
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

function RoutesSection({
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

  if (items.length === 0) return null;

  return (
    <section
      className="overflow-hidden rounded-[28px] border"
      style={{ borderColor: c.line, background: c.panel }}
    >
      <div className="h-[6px] w-full" style={{ background: meta.accent }} />
      <div className="p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-sans text-[24px] font-semibold" style={{ color: c.charcoal }}>
              {meta.title}
            </h2>
            <p className="mt-1 max-w-3xl font-sans text-[14px]" style={{ color: c.secondary }}>
              {meta.subtitle}
            </p>
          </div>

          <MetaBadge>{items.length} routes</MetaBadge>
        </div>

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
        </div>
      </div>
    </section>
  );
}

export default function RoutesView() {
  const { activeCompany } = useCompany();
  const { loading, items, error } = useRoutes(activeCompany?.id);
  const { items: steps } = useJobSteps(activeCompany?.id);
  const { items: opportunities } = useOpportunities(activeCompany?.id);

  const fix = items.filter((route) => String(route.category).toLowerCase() === "fix");
  const improve = items.filter((route) => String(route.category).toLowerCase() === "improve");
  const create = items.filter((route) => String(route.category).toLowerCase() === "create");

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
          <div className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
            {activeCompany?.name || "No company selected"}
          </div>
          <h1 className="mt-1 font-sans text-[28px] font-semibold" style={{ color: c.charcoal }}>
            Routes
          </h1>
          <p className="mt-1 font-sans text-[14px]" style={{ color: c.secondary }}>
            Click any route to see the work sequence, missing evidence, and why it deserves attention now.
          </p>
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
        ) : items.length === 0 ? (
          <div className="rounded-[24px] border px-6 py-12 text-center" style={{ borderColor: c.line, background: c.panel }}>
            <p className="font-sans text-[15px]" style={{ color: c.secondary }}>
              No routes yet for this company.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <RoutesSection category="fix" items={fix} opportunities={opportunities} steps={steps} />
            <RoutesSection category="improve" items={improve} opportunities={opportunities} steps={steps} />
            <RoutesSection category="create" items={create} opportunities={opportunities} steps={steps} />
          </div>
        )}
      </main>
    </div>
  );
}
