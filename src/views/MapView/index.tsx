import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import TopNav from "@/components/layout/TopNav";
import { useInputs } from "@/hooks/useInputs";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useSourceConfidence } from "@/hooks/useSourceConfidence";
import { useDynamicScoring } from "@/hooks/useDynamicScoring";
import { useJobSteps } from "@/hooks/useJobSteps";
import { useManagedOutcomes } from "@/hooks/useManagedOutcomes";
import { useStrategicProblems } from "@/hooks/useStrategicProblems";
import { useStrategicAssumptions } from "@/hooks/useStrategicAssumptions";
import { useSolutionIdeas } from "@/hooks/useSolutionIdeas";
import MethodologyPanel from "@/components/methodology/MethodologyPanel";
import DeepDivePanel from "@/views/DeepDive/DeepDivePanel";
import StrategyJourneyMapAlt from "./StrategyJourneyMapAlt";
import StrategyPhaseStrip from "@/components/journey/StrategyPhaseStrip";
import { type EngagementPhase, normalizeEngagementPhase } from "@/lib/engagementPhase";
import { buildPhaseNarrative } from "@/lib/phaseNarrative";
import WhatsChangedPanel from "@/components/changelog/WhatsChangedPanel";
import ProgramGapPanel from "@/components/gaps/ProgramGapPanel";
import AssumptionSnapshot from "@/components/assumptions/AssumptionSnapshot";
import { useOpportunities, type OpportunityRow } from "@/hooks/useOpportunities";
import { useRoutes } from "@/views/Routes/useRoutes";
import type { ClientSummary, InputItem, ScoreArea } from "@/lib/types";
import { MetaBadge, ScoreChip } from "@/components/ui/semantic-badges";
import PageContextStatus from "@/components/layout/PageContextStatus";
import GenericAuditTraceNote from "@/components/diagnostics/GenericAuditTraceNote";
import { scoreCompanyMojo } from "@/lib/scoring/mojoScore";
import { computeWorkflowGuidance } from "@/lib/workflowPhase";
import { mapInputToAreaKey } from "@/lib/areaMapping";
import { isGenericAuditCompany } from "@/lib/genericAudit";
import { deriveInitiativeContext } from "@/lib/initiativeFocus";
import { supabase } from "@/integrations/supabase/client";

/* ── Palette ── */
const c = {
  bg: "#faf7f6",
  field: "#FFFFFF",
  card: "#ffffff",
  line: "#DDE6D1",
  lineFaint: "#EEF3E9",
  charcoal: "#233C4B",
  secondary: "#46606D",
  muted: "#6E847F",
  faint: "#C8D8CA",
  coral: "#FF7D2D",
  teal: "#5F9B8C",
  amber: "#FAC846",
};

const cardStyle = {
  background: c.card,
  borderRadius: 4,
  border: `1px solid ${c.line}`,
} as const;

function safeNumber(n: unknown, fallback = 0) {
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function isClientSummary(value: unknown): value is ClientSummary {
  return typeof value === "object" && value !== null && Array.isArray((value as ClientSummary).key_insights);
}

function areaDisplayLabel(area: ScoreArea): string {
  return area.area_label || area.area_key || "Area";
}

function formatEvidenceLabel(status: unknown) {
  switch (String(status || "")) {
    case "baseline_plus_artifacts":
    case "public_evidence_strong":
      return "Strong";
    case "public_evidence_partial":
      return "Partial";
    case "public_evidence_thin":
      return "Thin";
    case "generated_no_baseline":
      return "Generated";
    case "no_public_evidence":
      return "None";
    default:
      return "Unknown";
  }
}

function evidencePercent(areaScoresJson: unknown): number | null {
  if (typeof areaScoresJson !== "object" || areaScoresJson === null) return null;
  const asj = areaScoresJson as Record<string, unknown>;

  // Prefer claim-evidence maturity written by snapshotMojoScore (0 = honest zero).
  if (typeof asj.claim_evidence_pct === "number") {
    return Math.round(asj.claim_evidence_pct);
  }

  // Fall back to legacy public baseline strength (0 = uninitialized, treat as no-data).
  const evidence = asj.evidence as { baseline_strength?: unknown } | undefined;
  if (typeof evidence?.baseline_strength === "number" && evidence.baseline_strength > 0) {
    return Math.round(evidence.baseline_strength);
  }

  return null;
}

function hasStoredCompanyScores(activeCompany: {
  mojo_score?: unknown;
  potential_score?: unknown;
  projected_score?: unknown;
  area_scores_json?: unknown;
} | null | undefined) {
  return (
    typeof activeCompany?.mojo_score === "number" &&
    typeof activeCompany?.potential_score === "number" &&
    typeof activeCompany?.projected_score === "number" &&
    typeof activeCompany?.area_scores_json === "object" &&
    activeCompany?.area_scores_json !== null
  );
}

function MiniBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      className="h-[5px] w-full overflow-hidden"
      style={{ background: c.lineFaint }}
    >
      <div
        className="h-full"
        style={{
          width: `${v}%`,
          background: v >= 70 ? c.teal : v >= 40 ? c.amber : c.coral,
        }}
      />
    </div>
  );
}

/** Derive the engagement phase from available signals. Admin-set phase takes precedence. */
function deriveAutoPhase(args: {
  hasPublicEvidence: boolean;
  hasCompanyEvidence: boolean;
  workflowPhase: "diagnose" | "focus" | "flow";
}): EngagementPhase {
  if (!args.hasPublicEvidence && !args.hasCompanyEvidence) return "outside_signals";
  if (args.workflowPhase === "diagnose") return "diagnose";
  if (args.workflowPhase === "focus") return "focus";
  return "flow";
}

/** Compact Routes summary strip: Fix / Improve / Create columns */
function RoutesStrip({ routes, companyId }: { routes: ReturnType<typeof useRoutes>["items"]; companyId?: string }) {
  const items = Array.isArray(routes) ? routes : [];
  const CATS = [
    { key: "fix", label: "Fix", accent: c.coral, sub: "Address gaps holding back your score" },
    { key: "improve", label: "Improve", accent: c.amber, sub: "Strengthen what's partially in place" },
    { key: "create", label: "Create", accent: c.teal, sub: "Build new capabilities for growth" },
  ];

  if (items.length === 0) {
    return (
      <div style={cardStyle} className="p-4 mt-4">
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <p className="font-mono text-[10px] uppercase tracking-wider" style={{ color: c.muted }}>
            Routes
          </p>
          <Link
            to="/routes"
            className="font-mono text-[10px] uppercase tracking-wider hover:opacity-70 transition-opacity"
            style={{ color: c.muted }}
          >
            View all →
          </Link>
        </div>
        <p className="font-sans text-[13px]" style={{ color: c.secondary }}>
          No routes yet. Run AI Research or add routes manually.
        </p>
      </div>
    );
  }

  return (
    <div style={cardStyle} className="p-4 mt-4">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider" style={{ color: c.muted }}>
            Routes
          </p>
          <p className="font-sans text-[13px] font-semibold" style={{ color: c.charcoal }}>
            Fix · Improve · Create
          </p>
        </div>
        <Link
          to="/routes"
          className="font-mono text-[10px] uppercase tracking-wider hover:opacity-70 transition-opacity"
          style={{ color: c.muted }}
        >
          Open full view →
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {CATS.map(({ key, label, accent, sub }) => {
          const catRoutes = items.filter(
            (r) => String(r.category || "").toLowerCase() === key,
          );
          return (
            <div
              key={key}
              className="p-3"
              style={{ borderLeft: `2px solid ${accent}`, paddingLeft: 12 }}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] font-semibold" style={{ color: accent }}>
                  {label}
                </p>
                <span
                  className="font-mono text-[9px]"
                  style={{ color: c.muted }}
                >
                  {catRoutes.length}
                </span>
              </div>
              <p className="font-sans text-[11px] mb-2" style={{ color: c.muted }}>
                {sub}
              </p>
              {catRoutes.length === 0 ? (
                <p className="font-sans text-[11px]" style={{ color: c.faint }}>
                  No routes yet.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {catRoutes.slice(0, 4).map((r) => (
                    <div key={r.id} className="flex items-start gap-1.5">
                      <span
                        className="mt-[4px] inline-block h-[5px] w-[5px] shrink-0 rounded-full"
                        style={{ background: accent }}
                      />
                      <p className="font-sans text-[12px] leading-[1.4]" style={{ color: c.charcoal }}>
                        {r.title}
                      </p>
                    </div>
                  ))}
                  {catRoutes.length > 4 && (
                    <p className="font-mono text-[10px]" style={{ color: c.muted }}>
                      +{catRoutes.length - 4} more
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MapView() {
  const [processOpen, setProcessOpen] = useState(false);
  const [deepDiveOpen, setDeepDiveOpen] = useState(false);
  const [deepDiveArea, setDeepDiveArea] = useState<string | null>(null);
  const [savingPhase, setSavingPhase] = useState(false);

  const { user } = useAuth();
  const { activeCompany, refetch: refetchCompany } = useCompany();
  const auditMode = isGenericAuditCompany(activeCompany);

  const { query: inputsQuery } = useInputs();
  const inputs = useMemo<InputItem[]>(() => {
    if (!user) return [];
    return inputsQuery.data ?? [];
  }, [user, inputsQuery.data]);

  const { signals: sourceSignals } = useSourceConfidence({
    companyId: activeCompany?.id,
    areaScoresJson: activeCompany?.area_scores_json,
    inputsOverride: inputs,
    evidenceStatus: activeCompany?.evidence_status,
  });
  const { items: strategicProblems } = useStrategicProblems(activeCompany?.id);
  const { items: jobSteps } = useJobSteps(activeCompany?.id);
  const { items: managedOutcomes } = useManagedOutcomes(activeCompany?.id);
  const {
    items: assumptions,
    loading: assumptionsLoading,
    tableMissing: assumptionsTableMissing,
  } = useStrategicAssumptions(activeCompany?.id);
  const { items: solutionIdeas } = useSolutionIdeas(activeCompany?.id);

  const hasData = inputs.length > 0;
  const { summary, areas } = useDynamicScoring(inputs, hasData);

  const { items: oppItems } = useOpportunities(activeCompany?.id);
  const { items: routeItems } = useRoutes(activeCompany?.id);

  // On-strategy set resolved at the data layer (operator pin → else SQL heuristic).
  const [primaryJourneyKey, setPrimaryJourneyKey] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!activeCompany?.id) { setPrimaryJourneyKey(undefined); return; }
    let cancelled = false;
    (supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }> })
      .rpc("resolve_primary_job_step_set", { p_company_id: activeCompany.id })
      .then(({ data }) => { if (!cancelled) setPrimaryJourneyKey(typeof data === "string" ? data : undefined); });
    return () => { cancelled = true; };
  }, [activeCompany?.id]);

  const fallbackScores = useMemo(
    () =>
      scoreCompanyMojo({
        inputs,
        jobSteps,
        opportunities: Array.isArray(oppItems) ? oppItems : [],
        managedOutcomes,
        routes: Array.isArray(routeItems) ? routeItems : [],
        strategicProblems,
        baselineRunResultJson: null,
        primaryJourneyKey,
      }),
    [inputs, jobSteps, oppItems, managedOutcomes, routeItems, strategicProblems, primaryJourneyKey],
  );

  const displayMojo =
    (typeof activeCompany?.mojo_score === "number" ? activeCompany.mojo_score : null) ??
    fallbackScores.mojo_score ??
    0;
  const usingStoredScores = hasStoredCompanyScores(activeCompany);
  const score = Math.round(safeNumber(displayMojo, 0));

  const evidenceLabel = formatEvidenceLabel(activeCompany?.evidence_status ?? fallbackScores.evidence_status);
  const evidencePct = evidencePercent(activeCompany?.area_scores_json) ?? Math.round(fallbackScores.evidenceBreakdown.baseline_strength);
  const displayAreaScoresJson =
    typeof activeCompany?.area_scores_json === "object" && activeCompany?.area_scores_json !== null
      ? activeCompany.area_scores_json
      : fallbackScores.area_scores_json;

  const initiativeContext = useMemo(
    () =>
      deriveInitiativeContext({
        areaScoresJson: activeCompany?.area_scores_json,
        jobSteps,
        strategicProblems,
      }),
    [activeCompany?.area_scores_json, jobSteps, strategicProblems],
  );

  const mapRoutes = useMemo(
    () =>
      (Array.isArray(routeItems) ? routeItems : []).map((route, index) => {
        const effortRaw = String(route.effort || "medium").toLowerCase();
        const effort = effortRaw === "low" || effortRaw === "medium" || effortRaw === "high" ? effortRaw : "medium";
        const categoryRaw = String(route.category || "improve").toLowerCase();
        const category = categoryRaw === "fix" || categoryRaw === "improve" || categoryRaw === "create" ? categoryRaw : "improve";
        return {
          id: route.id,
          title: route.title || "Untitled route",
          category,
          shortDescription: route.short_description || "No route description yet.",
          mojoImpactPoints: Math.max(1, safeNumber(route.pts_value, 1)),
          effort,
          status: "not_started" as const,
          recommended: (route.sort_order ?? index + 1) === 1,
          dependencies: [],
          steps: [],
          evidenceChecklist: [],
          whyRecommended: [],
        };
      }),
    [routeItems],
  );

  // Admin-set phase (already normalised by useCompany)
  const adminPhase: EngagementPhase | null = activeCompany?.engagement_phase ?? null;

  const workflow = useMemo(
    () =>
      computeWorkflowGuidance({
        inputs,
        sourceSignals,
        publicEvidenceStatus: activeCompany?.evidence_status ?? null,
        focusOpportunityCount: (Array.isArray(oppItems) ? oppItems : []).filter(
          (o) => o.priority_tier === "focus",
        ).length,
        routeCount: mapRoutes.length,
        strategicProblemCount: strategicProblems.length,
        reconciledStrategicProblemCount: strategicProblems.filter((item) => item.status === "reconciled").length,
        adminPhase,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inputs, sourceSignals, activeCompany?.evidence_status, oppItems, mapRoutes.length, strategicProblems, adminPhase],
  );

  // Program phase: prefer admin-set value, fallback to auto-derived from signals
  const autoPhase = useMemo(
    () =>
      deriveAutoPhase({
        hasPublicEvidence: sourceSignals.hasPublicEvidence,
        hasCompanyEvidence: sourceSignals.hasCompanyEvidence,
        workflowPhase: (workflow.phase === "diagnose" || workflow.phase === "focus" || workflow.phase === "flow")
          ? workflow.phase
          : "diagnose",
      }),
    [sourceSignals.hasPublicEvidence, sourceSignals.hasCompanyEvidence, workflow.phase],
  );
  const currentPhase: EngagementPhase = adminPhase ?? autoPhase;

  const handlePhaseChange = async (phase: EngagementPhase) => {
    if (!activeCompany?.id) return;
    setSavingPhase(true);
    try {
      const { error } = await (supabase as any)
        .from("companies")
        .update({ program_phase: phase })
        .eq("id", activeCompany.id);
      if (error) console.error("[handlePhaseChange] DB write failed:", error.message, { phase });
      await refetchCompany();
    } finally {
      setSavingPhase(false);
    }
  };

  // Research finding card
  const focusOpps = useMemo(() => {
    const items = Array.isArray(oppItems) ? oppItems : [];
    return items
      .filter((o) => o.priority_tier === "focus")
      .sort((a, b) => safeNumber(b.opportunity_score, 0) - safeNumber(a.opportunity_score, 0))
      .slice(0, 8);
  }, [oppItems]);

  const weakestArea = useMemo(() => {
    const items = Array.isArray(areas) ? areas : [];
    return items
      .slice()
      .sort((a, b) => safeNumber(a.score, 100) - safeNumber(b.score, 100))[0] ?? null;
  }, [areas]);

  const topInputGap = useMemo(() => {
    return inputs
      .filter((input) => input.status === "gap" || input.status === "not_started")
      .sort((a, b) => safeNumber(b.score_impact, 0) - safeNumber(a.score_impact, 0))[0] ?? null;
  }, [inputs]);

  const researchFinding = useMemo(
    () =>
      buildPhaseNarrative({
        phase: currentPhase,
        focusOpps,
        weakestArea,
        topInputGap,
        summary,
        initiativeContext,
        sourceSignals,
      }),
    [currentPhase, focusOpps, weakestArea, topInputGap, summary, initiativeContext, sourceSignals],
  );

  const areaList: ScoreArea[] = Array.isArray(areas) ? areas : [];
  const topAreas = areaList.slice().sort((a, b) => safeNumber(b.score, 0) - safeNumber(a.score, 0));

  const areaContextByKey = useMemo(() => {
    const grouped = new Map<string, InputItem[]>();
    for (const input of inputs) {
      const key = mapInputToAreaKey(input);
      const existing = grouped.get(key) ?? [];
      existing.push(input);
      grouped.set(key, existing);
    }
    const result: Record<string, { summary: string; detail: string }> = {};
    for (const area of topAreas) {
      const key = String(area.area_key || "");
      const areaInputs = grouped.get(key) ?? [];
      if (areaInputs.length === 0) {
        result[key] = { summary: "No mapped inputs yet", detail: "Add inputs in this area so map guidance is contextual." };
        continue;
      }
      const complete = areaInputs.filter((item) => item.status === "complete").length;
      const gaps = areaInputs.filter((item) => item.status === "gap" || item.status === "not_started");
      const topGap = gaps.slice().sort((a, b) => safeNumber(b.score_impact, 0) - safeNumber(a.score_impact, 0))[0];
      result[key] = {
        summary: `${complete}/${areaInputs.length} inputs complete`,
        detail: topGap
          ? `Top gap: ${topGap.input_label} (+${Math.round(safeNumber(topGap.score_impact, 0))} pts)`
          : "No critical mapped gap right now.",
      };
    }
    return result;
  }, [inputs, topAreas]);

  const headedTitle = workflow.title;
  const headedDetail = workflow.detail;

  function openDeepDive(areaKey: string) {
    setDeepDiveArea(areaKey);
    setDeepDiveOpen(true);
  }

  function closeDeepDive() {
    setDeepDiveOpen(false);
    setTimeout(() => setDeepDiveArea(null), 300);
  }

  // Gap panel data
  const jobStepDesignedCount = jobSteps.filter((s) => s.designed).length;
  const reconciledProblemCount = strategicProblems.filter((p) => p.status === "reconciled").length;

  const publicEvidenceStatus = String(activeCompany?.evidence_status || "").toLowerCase();
  const hasPublicEvidence =
    publicEvidenceStatus === "baseline_plus_artifacts" ||
    publicEvidenceStatus === "public_evidence_strong" ||
    publicEvidenceStatus === "public_evidence_partial" ||
    publicEvidenceStatus === "public_evidence_thin" ||
    sourceSignals.hasPublicEvidence;

  return (
    <div
      className="min-h-screen"
      style={{
        background: c.bg,
        backgroundImage:
          `url("data:image/svg+xml,%3Csvg width='6' height='6' viewBox='0 0 6 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000' fill-opacity='0.025'%3E%3Cpath d='M5 0h1L0 5V4zM6 5v1H5z'/%3E%3C/g%3E%3C/svg%3E")`,
      }}
    >
      <TopNav />

      <main className="max-w-content mx-auto pt-6 px-4 sm:px-6 md:px-9 pb-12">
        <PageContextStatus
          lastScoredAt={activeCompany?.last_scored_at}
          sourceSignals={sourceSignals}
          evidenceLabel={usingStoredScores ? evidenceLabel : "Estimated from current artifacts"}
          confidencePercent={evidencePct}
          publicEvidenceStatus={String(activeCompany?.evidence_status || "")}
        />

        {/* Company bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="font-sans text-[20px] font-bold tracking-tight" style={{ color: c.charcoal }}>
                {activeCompany?.name || "No company selected"}
              </h1>
              <p className="font-mono text-[11px] mt-0.5" style={{ color: c.muted }}>
                {(activeCompany?.website || "No website yet") +
                  " · " +
                  (activeCompany?.evidence_status || "not_scored")}
              </p>
            </div>
          </div>
          <GenericAuditTraceNote
            active={auditMode}
            className="mt-3 max-w-5xl"
            source="companies scores/area_scores_json plus live inputs, job_steps, opportunities, routes, and Strategic Decision System tables."
            evaluation="AI + deterministic logic merge evidence strength, initiative alignment, and source confidence to generate map cards and priorities."
            scoring="Current/Reachable/Unlockable prefer stored scores; fallback scorer computes gate scores, evidence multipliers, opportunity focus, and constraints."
            why="This clarifies why each map box exists, how it was derived, and which levers to tune when output feels generic."
          />
        </div>

        {/* Recessed field */}
        <div
          className="rounded-2xl p-5 sm:p-6"
          style={{
            background: c.field,
            boxShadow: "inset 0 2px 6px rgba(0,0,0,0.07), inset 0 0 0 1px rgba(0,0,0,0.04)",
          }}
        >
          {!usingStoredScores ? (
            <div className="mb-5 rounded-xl border px-4 py-3" style={{ borderColor: c.line, background: c.lineFaint }}>
              <p className="font-mono text-[10px] uppercase tracking-wider" style={{ color: c.muted }}>
                Score Status
              </p>
              <p className="mt-1 font-sans text-[12px] leading-[1.6]" style={{ color: c.secondary }}>
                These scores are estimated from current inputs, job checkpoints, and opportunities — no stored company score yet. Run the public baseline and AI research flow to save authoritative values.
              </p>
            </div>
          ) : null}

          {/* ── Phase strip ── */}
          <StrategyPhaseStrip
            currentPhase={currentPhase}
            isAdmin={!!user}
            onPhaseChange={handlePhaseChange}
          />
          {savingPhase && (
            <p className="mb-3 font-mono text-[10px] uppercase tracking-wider" style={{ color: c.muted }}>
              Saving phase…
            </p>
          )}

          {/* ── What's Changed ── */}
          <WhatsChangedPanel
            companyId={activeCompany?.id}
            userId={user?.id}
          />

          {/* ── Journey Map ── */}
          <div style={cardStyle} className="p-4">
            <StrategyJourneyMapAlt
              areas={areas}
              summary={summary}
              onAreaClick={openDeepDive}
              currentScore={score}
              routesData={mapRoutes}
            />
          </div>

          {/* ── Key Insight + Your Next Move ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
            <div style={cardStyle} className="lg:col-span-2 p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider" style={{ color: c.muted }}>
                {researchFinding.label}
              </p>
              <p className="font-sans text-[16px] font-bold mt-2" style={{ color: c.charcoal }}>
                {researchFinding.headline}
              </p>
              <p className="font-sans text-[13px] leading-[1.7] mt-2" style={{ color: c.secondary }}>
                {researchFinding.detail}
              </p>
              {researchFinding.whyItMatters ? (
                <p className="font-sans text-[13px] leading-[1.6] mt-2" style={{ color: c.secondary }}>
                  <span className="font-semibold" style={{ color: c.charcoal }}>Why it matters:</span>{" "}
                  {researchFinding.whyItMatters}
                </p>
              ) : null}
              {researchFinding.whatNext ? (
                <p className="font-sans text-[13px] leading-[1.6] mt-1.5" style={{ color: c.secondary }}>
                  <span className="font-semibold" style={{ color: c.charcoal }}>What next:</span>{" "}
                  {researchFinding.whatNext}
                </p>
              ) : null}
              {researchFinding.opportunityId ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    to={`/opportunities?view=list&opportunity=${encodeURIComponent(researchFinding.opportunityId)}`}
                    className="font-mono text-[10px] uppercase tracking-[0.08em] rounded-full border px-3 py-1.5 hover:opacity-80 transition-opacity"
                    style={{ borderColor: c.line, color: c.secondary, background: "#FFFFFF" }}
                  >
                    Open in opportunity card →
                  </Link>
                  <Link
                    to={`/opportunities?view=map&opportunity=${encodeURIComponent(researchFinding.opportunityId)}`}
                    className="font-mono text-[10px] uppercase tracking-[0.08em] rounded-full border px-3 py-1.5 hover:opacity-80 transition-opacity"
                    style={{ borderColor: c.line, color: c.secondary, background: "#FFFFFF" }}
                  >
                    Open in opportunity map →
                  </Link>
                </div>
              ) : null}
              {researchFinding.chips.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {researchFinding.chips.map((chip) => (
                    <ScoreChip key={chip.label} label={chip.label} value={chip.value} />
                  ))}
                </div>
              )}
            </div>

            <div style={cardStyle} className="p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider" style={{ color: c.muted }}>
                Your Next Move
              </p>
              <p className="font-sans text-[13px] font-semibold mt-2" style={{ color: c.charcoal }}>
                {headedTitle}
              </p>
              <p className="font-sans text-[12px] leading-[1.7] mt-2" style={{ color: c.secondary }}>
                {headedDetail}
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <Link
                  to="/inputs"
                  className="font-mono text-[10px] uppercase tracking-wider hover:opacity-70 transition-opacity"
                  style={{ color: c.muted }}
                >
                  Open Inputs →
                </Link>
                <Link
                  to="/opportunities"
                  className="font-mono text-[10px] uppercase tracking-wider hover:opacity-70 transition-opacity"
                  style={{ color: c.muted }}
                >
                  View Opportunities →
                </Link>
                <Link
                  to="/routes"
                  className="font-mono text-[10px] uppercase tracking-wider hover:opacity-70 transition-opacity"
                  style={{ color: c.muted }}
                >
                  View Routes →
                </Link>
              </div>
            </div>
          </div>

          {/* ── Routes (Fix / Improve / Create) — shown from Focus phase onward ── */}
          {researchFinding.showRouteRecommendations ? (
            <RoutesStrip routes={routeItems} companyId={activeCompany?.id} />
          ) : (
            <div
              className="mt-4 rounded-xl p-4"
              style={{ border: `1px solid ${c.line}`, background: c.lineFaint }}
            >
              <p className="font-mono text-[10px] uppercase tracking-wider" style={{ color: c.muted }}>
                Routes
              </p>
              <p className="font-sans text-[12px] mt-1" style={{ color: c.muted }}>
                Available from Focus — route recommendations appear once the engagement moves into the prioritisation phase.
              </p>
            </div>
          )}

          {/* ── Program Gaps ── */}
          <div className="mt-4">
            <ProgramGapPanel
              inputs={inputs}
              opportunities={Array.isArray(oppItems) ? oppItems : []}
              assumptions={assumptions}
              managedOutcomeCount={managedOutcomes.length}
              jobStepCount={jobSteps.length}
              jobStepDesignedCount={jobStepDesignedCount}
              strategicProblemCount={strategicProblems.length}
              reconciledProblemCount={reconciledProblemCount}
              routeCount={routeItems?.length ?? 0}
              solutionIdeaCount={solutionIdeas.length}
              odiNeedCount={0}
              hasPublicEvidence={hasPublicEvidence}
              hasCompanyEvidence={sourceSignals.hasCompanyEvidence}
              hasPrimaryEvidence={sourceSignals.hasPrimaryEvidence}
              currentPhase={currentPhase}
            />
          </div>

          {/* ── Assumption Snapshot ── */}
          <AssumptionSnapshot
            assumptions={assumptions}
            loading={assumptionsLoading}
            tableMissing={assumptionsTableMissing}
          />

          {/* ── Where We Stand ── */}
          <div style={cardStyle} className="p-4 mt-4">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wider" style={{ color: c.muted }}>
                  Where We Stand
                </p>
                <p className="font-sans text-[13px] font-semibold" style={{ color: c.charcoal }}>
                  Strengths and gaps across the map
                </p>
              </div>
              <MetaBadge>{topAreas.length} areas</MetaBadge>
            </div>

            {topAreas.length === 0 ? (
              <p className="font-sans text-[13px]" style={{ color: c.secondary }}>
                No area data yet. Run Web Baseline + AI Research.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {topAreas.slice(0, 10).map((a) => {
                  const label = areaDisplayLabel(a);
                  const key = a.area_key || label;
                  const s = Math.round(safeNumber(a.score, 0));
                  const context = areaContextByKey[String(key)] ?? {
                    summary: "No mapped inputs yet",
                    detail: "Add inputs in this area so map guidance is contextual.",
                  };
                  return (
                    <button
                      key={String(key)}
                      type="button"
                      onClick={() => openDeepDive(String(key))}
                      className="text-left rounded-lg p-3 hover:opacity-90 transition-opacity"
                      style={{ border: `1px solid ${c.line}`, background: c.lineFaint }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-sans text-[13px] font-semibold" style={{ color: c.charcoal }}>
                          {label}
                        </p>
                        <ScoreChip label="Score" value={s} />
                      </div>
                      <div className="mt-2">
                        <MiniBar value={s} />
                      </div>
                      <p className="font-sans text-[12px] mt-2 font-semibold" style={{ color: c.charcoal }}>
                        {context.summary}
                      </p>
                      <p className="font-sans text-[12px] mt-1" style={{ color: c.secondary }}>
                        {context.detail}
                      </p>
                      <p className="font-sans text-[11px] mt-2" style={{ color: c.muted }}>
                        Open deep dive →
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Quick Nav ── */}
          <div style={cardStyle} className="p-4 mt-4">
            <p className="font-mono text-[10px] uppercase tracking-wider mb-3" style={{ color: c.muted }}>
              Quick Nav
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { to: "/inputs", label: "Inputs" },
                { to: "/job-steps", label: "Checkpoints" },
                { to: "/routes", label: "Routes" },
                { to: "/strategy", label: "Strategy" },
                { to: "/positioning", label: "Positioning" },
                { to: "/opportunities", label: "Opportunities" },
                { to: "/analytics", label: "Analytics" },
                { to: "/process/mojomap", label: "MojoMap Process" },
              ].map((x) => (
                <Link
                  key={x.to}
                  to={x.to}
                  className="rounded-lg px-3 py-2 font-mono text-[10px] uppercase tracking-wider hover:opacity-80 transition-opacity"
                  style={{ border: `1px solid ${c.line}`, background: c.lineFaint, color: c.secondary }}
                >
                  {x.label} →
                </Link>
              ))}
            </div>
          </div>

          {/* Bottom footer */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="font-mono text-[10px]" style={{ color: c.muted }}>
              Active company:{" "}
              <span style={{ color: c.secondary }}>{activeCompany?.name || "—"}</span>
            </div>
            <button
              type="button"
              onClick={() => setProcessOpen(true)}
              className="font-mono text-[10px] uppercase tracking-wider hover:opacity-70 transition-opacity"
              style={{ color: c.muted }}
            >
              Methodology →
            </button>
          </div>
        </div>
      </main>

      <DeepDivePanel open={deepDiveOpen} areaKey={deepDiveArea} onClose={closeDeepDive} dynamicAreas={areas} />
      <MethodologyPanel open={processOpen} onClose={() => setProcessOpen(false)} />
    </div>
  );
}
