import { useEffect, useMemo, useState } from "react";
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
import RouteInspectPanel from "./RouteInspectPanel";
import type { RouteRow } from "./useRoutes";
import type { JobStepRow } from "@/hooks/useJobSteps";
import type { OpportunityRow } from "@/hooks/useOpportunities";
import { isGenericAuditCompany } from "@/lib/genericAudit";
import {
  classifyOpportunityFocus,
  deriveInitiativeContext,
  type FocusClassification,
} from "@/lib/initiativeFocus";
import { routeDetail } from "./routeDetail";
import {
  routeRelativeTime,
  buildDecisionBullets,
  persistSelectedRouteDecision,
  clearSelectedRouteDecision,
  insertRouteDecisionEvent,
} from "./routeDecision";
import { computeLatestExclusionAt, isArtifactStale } from "@/lib/evidenceImpact";

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

function focusSortValue(focus: FocusClassification | undefined) {
  if (!focus) return 0;
  if (focus.level === "initiative") return 2;
  if (focus.level === "related") return 1;
  return 0;
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
  onInspect,
  selectedRouteId,
  onSelect,
}: {
  category: string;
  items: RouteRow[];
  opportunities: OpportunityRow[];
  steps: JobStepRow[];
  initiativeContext: ReturnType<typeof deriveInitiativeContext>;
  opportunityFocusById: Map<string, FocusClassification>;
  routeOutcomeMap: Map<string, { statement: string; leadingIndicator: string }>;
  onInspect?: (route: RouteRow) => void;
  selectedRouteId?: string | null;
  onSelect?: (route: RouteRow) => void;
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
              onInspect={onInspect ? () => onInspect(route) : undefined}
              isSelected={selectedRouteId === route.id}
              isOtherSelected={!!selectedRouteId && selectedRouteId !== route.id}
              onSelect={onSelect ? () => onSelect(route) : undefined}
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

function DecisionSummaryBanner({
  route,
  detail,
  linkedOutcome,
  savedAt,
  onClear,
}: {
  route: RouteRow;
  detail: ReturnType<typeof routeDetail>;
  linkedOutcome: { statement: string; leadingIndicator: string } | null;
  savedAt: string | null;
  onClear: () => void;
}) {
  const bullets = buildDecisionBullets(detail, linkedOutcome);
  const catKey = String(route.category || "improve").toLowerCase();
  const catMeta = CATEGORY_META[catKey] ?? CATEGORY_META.improve;
  const points = typeof route.pts_value === "number" ? Math.round(route.pts_value) : null;

  return (
    <section
      className="rounded-[18px] border px-5 py-4"
      style={{ borderColor: c.teal, background: "#F0FAF7" }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: c.teal }}>
              Chosen path
            </span>
            <span
              className="rounded-full border px-2 py-[1px] font-mono text-[10px] uppercase tracking-[0.08em]"
              style={{ background: `${catMeta.accent}15`, color: catMeta.accent, borderColor: `${catMeta.accent}40` }}
            >
              {catMeta.title}
            </span>
            {points !== null && (
              <span className="font-mono text-[10px] font-semibold" style={{ color: catMeta.accent }}>
                +{points} pts potential
              </span>
            )}
          </div>

          <h3 className="mb-2 font-sans text-[18px] font-semibold leading-tight" style={{ color: c.charcoal }}>
            {route.title || "Untitled route"}
          </h3>

          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.teal }}>
            We chose this route because:
          </p>
          <ul className="space-y-1.5">
            {bullets.map((bullet, i) => (
              <li
                key={i}
                className="flex items-start gap-2 font-sans text-[13px] leading-[1.5]"
                style={{ color: c.secondary }}
              >
                <span style={{ color: c.teal }}>·</span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 font-mono text-[10px]" style={{ color: c.muted }}>
            {savedAt
              ? `Saved decision · last updated ${routeRelativeTime(savedAt)}`
              : "Saving…"}
          </p>
        </div>

        <button
          type="button"
          onClick={onClear}
          className="mt-1 shrink-0 font-mono text-[10px] uppercase tracking-[0.08em]"
          style={{ color: c.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          Clear ✕
        </button>
      </div>
    </section>
  );
}

export default function RoutesView() {
  const { activeCompany } = useCompany();
  const auditMode = isGenericAuditCompany(activeCompany);
  const [inspectRoute, setInspectRoute] = useState<RouteRow | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [decisionSavedAt, setDecisionSavedAt] = useState<string | null>(null);

  // Sync from DB when company changes
  useEffect(() => {
    setSelectedRouteId(activeCompany?.selected_route_id ?? null);
    setDecisionSavedAt(activeCompany?.selected_route_updated_at ?? null);
  }, [activeCompany?.id]);
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
    evidenceStatus: activeCompany?.evidence_status,
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

  const latestExclusionAt = useMemo(
    () => computeLatestExclusionAt(activeCompany?.excluded_signals_json ?? []),
    [activeCompany?.excluded_signals_json],
  );

  const selectedRoute = useMemo(
    () => items.find((r) => r.id === selectedRouteId) ?? null,
    [items, selectedRouteId],
  );

  const selectedDetail = useMemo(() => {
    if (!selectedRoute) return null;
    return routeDetail({ route: selectedRoute, opportunities, steps, initiativeContext, opportunityFocusById });
  }, [selectedRoute, opportunities, steps, initiativeContext, opportunityFocusById]);

  const selectedOutcome = selectedRoute ? (routeOutcomeMap.get(selectedRoute.id) ?? null) : null;

  async function handleSelectRoute(route: RouteRow) {
    if (selectedRouteId === route.id) {
      handleClearDecision();
      return;
    }

    // Capture prior selection before optimistic update for history event
    const eventType = selectedRouteId ? "changed" : "selected";

    // Optimistic
    const now = new Date().toISOString();
    setSelectedRouteId(route.id);
    setDecisionSavedAt(now);

    if (!activeCompany?.id) return;

    const detail = routeDetail({ route, opportunities, steps, initiativeContext, opportunityFocusById });
    const linkedOutcome = routeOutcomeMap.get(route.id) ?? null;
    const bullets = buildDecisionBullets(detail, linkedOutcome);
    const summary = { bullets, route_title: route.title, route_category: route.category };

    await persistSelectedRouteDecision(activeCompany.id, route.id, summary, now);
    await insertRouteDecisionEvent(activeCompany.id, route.id, eventType, summary);
  }

  async function handleClearDecision() {
    // Capture prior selection before optimistic update for history event
    const priorRouteId = selectedRouteId;
    const priorSummary = activeCompany?.selected_route_summary_json ?? {};

    // Optimistic
    setSelectedRouteId(null);
    setDecisionSavedAt(null);

    if (!activeCompany?.id) return;

    await clearSelectedRouteDecision(activeCompany.id);
    await insertRouteDecisionEvent(activeCompany.id, priorRouteId, "cleared", priorSummary);
  }

  const currentScore = Math.round(Number(activeCompany?.mojo_score ?? 0));
  const potentialScore = Math.round(Number(activeCompany?.potential_score ?? 0));
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
            scoring="Route impact uses pts_value; top-panel score delta compares current reality vs reachable score and highlights expected movement."
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
                      Current
                    </p>
                  </div>
                  <div className="h-10 w-px" style={{ background: c.line }} />
                  <div>
                    <p className="font-mono text-[11px]" style={{ color: c.teal }}>
                      {`+${Math.max(0, potentialScore - currentScore)} reachable`}
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
                      Reachable
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

            {selectedRoute && selectedDetail && (
              <DecisionSummaryBanner
                route={selectedRoute}
                detail={selectedDetail}
                linkedOutcome={selectedOutcome}
                savedAt={decisionSavedAt}
                onClear={handleClearDecision}
              />
            )}

            {latestExclusionAt && (
              <div
                className="rounded-md border px-4 py-3"
                style={{ borderColor: "#FAC846", background: "#FAC84618" }}
              >
                <p
                  className="font-mono text-[10px] uppercase tracking-[0.08em] font-semibold"
                  style={{ color: "#FAC846" }}
                >
                  Outside signals have been excluded. Route confidence may have changed.
                </p>
                <p className="font-sans text-[12px] mt-1" style={{ color: "#6E847F" }}>
                  Review affected recommendations before making a decision.
                </p>
              </div>
            )}

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <RoutesColumn
                category="fix"
                items={fix}
                opportunities={opportunities}
                steps={steps}
                initiativeContext={initiativeContext}
                opportunityFocusById={opportunityFocusById}
                routeOutcomeMap={routeOutcomeMap}
                onInspect={setInspectRoute}
                selectedRouteId={selectedRouteId}
                onSelect={handleSelectRoute}
              />
              <RoutesColumn
                category="improve"
                items={improve}
                opportunities={opportunities}
                steps={steps}
                initiativeContext={initiativeContext}
                opportunityFocusById={opportunityFocusById}
                routeOutcomeMap={routeOutcomeMap}
                onInspect={setInspectRoute}
                selectedRouteId={selectedRouteId}
                onSelect={handleSelectRoute}
              />
              <RoutesColumn
                category="create"
                items={create}
                opportunities={opportunities}
                steps={steps}
                initiativeContext={initiativeContext}
                opportunityFocusById={opportunityFocusById}
                routeOutcomeMap={routeOutcomeMap}
                onInspect={setInspectRoute}
                selectedRouteId={selectedRouteId}
                onSelect={handleSelectRoute}
              />
            </section>
          </div>
        )}
      </main>

      <RouteInspectPanel
        open={!!inspectRoute}
        onClose={() => setInspectRoute(null)}
        route={inspectRoute}
        opportunities={opportunities}
        steps={steps}
        initiativeContext={initiativeContext}
        opportunityFocusById={opportunityFocusById}
        areaScoresJson={activeCompany?.area_scores_json}
        linkedDesiredOutcome={inspectRoute ? (routeOutcomeMap.get(inspectRoute.id) || null) : null}
        currentPhase={activeCompany?.engagement_phase ?? "outside_signals"}
        staleNote={
          inspectRoute && latestExclusionAt && isArtifactStale(inspectRoute, latestExclusionAt)
            ? "Needs review after excluded inputs"
            : null
        }
      />
    </div>
  );
}
