import type { RouteRow } from "./useRoutes";
import type { OpportunityRow } from "@/hooks/useOpportunities";
import type { JobStepRow } from "@/hooks/useJobSteps";
import {
  deriveInitiativeContext,
  classifyRouteFocus,
  type FocusClassification,
} from "@/lib/initiativeFocus";

function normalize(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokenSet(text: string) {
  return new Set(normalize(text).split(" ").filter((t) => t.length >= 4));
}

function overlapScore(a: Set<string>, b: Set<string>) {
  let hits = 0;
  for (const token of a) { if (b.has(token)) hits++; }
  return hits;
}

function categoryPriority(category: string) {
  if (category === "fix") return "focus";
  if (category === "improve") return "monitor";
  return "defer";
}

function stepStatus(step: JobStepRow): "complete" | "in_progress" | "missing" {
  if (step.designed && !step.has_gap) return "complete";
  if (step.designed || step.has_gap) return "in_progress";
  return "missing";
}

export function routeDetail(args: {
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
      return { opp, score: overlap + priorityBoost + ((opp.opportunity_score ?? 0) / 20) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((item) => item.opp);

  const relatedSteps =
    rankedOpps.length > 0
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
      : steps.filter((step) => (category === "fix" ? step.has_gap : true)).slice(0, 3);

  const uniqueSteps = Array.from(new Map(relatedSteps.map((step) => [step.id, step])).values()).slice(0, 4);

  const stepItems =
    uniqueSteps.length > 0
      ? uniqueSteps.map((step) => ({
          id: step.id,
          title: `Step ${step.step_number ?? "?"}: ${step.step_label || "Untitled"}${step.gap_note ? ` — ${step.gap_note}` : ""}`,
          status: stepStatus(step),
        }))
      : [
          { id: `${route.id}-step-1`, title: "Define the concrete workstream and assign an owner.", status: "missing" as const },
          { id: `${route.id}-step-2`, title: "Confirm the customer, revenue, or operations point of friction this route addresses.", status: "missing" as const },
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
  const focus = classifyRouteFocus({ route, context: initiativeContext, linkedOpportunityFocus });

  const storedSteps = Array.isArray(route.steps_json) && route.steps_json.length > 0 ? route.steps_json : null;
  const storedEvidence = Array.isArray(route.evidence_json) && route.evidence_json.length > 0 ? route.evidence_json : null;
  const storedWhy = Array.isArray(route.why_this_matters_json) && route.why_this_matters_json.length > 0 ? route.why_this_matters_json : null;

  return {
    steps: storedSteps ?? stepItems,
    evidence: storedEvidence ?? evidenceItems,
    whyThisMatters: storedWhy ?? whyThisMatters,
    frameworks: (route.frameworks_used ?? []).filter(Boolean),
    focus,
    rankedOpps,
  };
}
