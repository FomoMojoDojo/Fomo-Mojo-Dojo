import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import TopNav from "@/components/layout/TopNav";
import AiBoundaryNote from "@/components/AiBoundaryNote";
import { useInputs } from "@/hooks/useInputs";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useSourceConfidence } from "@/hooks/useSourceConfidence";
import { useDynamicScoring } from "@/hooks/useDynamicScoring";
import { useJobSteps } from "@/hooks/useJobSteps";
import { useStrategicProblems } from "@/hooks/useStrategicProblems";
import { useLatestLocalAlignment, useRunLocalAlignment } from "@/hooks/useLocalAlignment";
import MethodologyPanel from "@/components/methodology/MethodologyPanel";
import DeepDivePanel from "@/views/DeepDive/DeepDivePanel";
import StrategyJourneyMapAlt from "./StrategyJourneyMapAlt";
import { useOpportunities } from "@/hooks/useOpportunities";
import { useRoutes } from "@/views/Routes/useRoutes";
import type { ClientSummary, InputItem, ScoreArea } from "@/lib/types";
import { MetaBadge, ScoreChip, StateBadge } from "@/components/ui/semantic-badges";
import { SourceLegend } from "@/components/provenance/SourceLegend";
import { scoreCompanyMojo } from "@/lib/scoring/mojoScore";
import { computeWorkflowGuidance } from "@/lib/workflowPhase";
import { toast } from "sonner";

/* ── Clean, sophisticated palette ── */
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
  borderRadius: 12,
  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
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

function mapInputToAreaKey(input: InputItem): "positioning" | "strategy" | "product" | "marketing" | "sales" | "cx" {
  const sub = String(input.sub_group || "").toLowerCase();
  const group = input.group_key;

  if (sub.includes("positioning")) return "positioning";
  if (sub.includes("strategy")) return "strategy";
  if (sub.includes("service delivery") || sub.includes("operations") || sub.includes("product")) return "product";
  if (sub.includes("awareness") || sub.includes("marketing") || sub.includes("outreach")) return "marketing";
  if (sub.includes("referral") || sub.includes("sales") || sub.includes("pipeline")) return "sales";
  if (sub.includes("fundraising") || sub.includes("revenue") || sub.includes("donor")) return "sales";
  if (sub.includes("family") || sub.includes("customer") || sub.includes("client") || sub.includes("experience") || sub.includes("satisfaction")) return "cx";

  if (group === "foundation") return "positioning";
  if (group === "execution") return "marketing";
  return "cx";
}

function formatEvidenceLabel(status: unknown) {
  switch (String(status || "")) {
    case "baseline_plus_artifacts":
    case "public_evidence_strong":
      return "Evidence: Strong";
    case "public_evidence_partial":
      return "Evidence: Partial";
    case "public_evidence_thin":
      return "Evidence: Thin";
    case "generated_no_baseline":
      return "Evidence: Generated";
    case "no_public_evidence":
      return "Evidence: None";
    default:
      return "Evidence: Unknown";
  }
}

function evidencePercent(areaScoresJson: unknown) {
  if (
    typeof areaScoresJson === "object" &&
    areaScoresJson !== null &&
    typeof (areaScoresJson as { evidence?: { baseline_strength?: unknown } }).evidence?.baseline_strength === "number"
  ) {
    return Math.round(
      (areaScoresJson as { evidence: { baseline_strength: number } }).evidence.baseline_strength,
    );
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
      className="h-[8px] w-full rounded-full overflow-hidden"
      style={{ background: c.lineFaint, border: `1px solid ${c.line}` }}
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

export default function MapView() {
  const [processOpen, setProcessOpen] = useState(false);
  const [deepDiveOpen, setDeepDiveOpen] = useState(false);
  const [deepDiveArea, setDeepDiveArea] = useState<string | null>(null);

  const { user } = useAuth();
  const { activeCompany, refetch: refetchCompanies } = useCompany();

  const { query: inputsQuery } = useInputs();
  const inputs = useMemo<InputItem[]>(() => {
    if (!user) return [];
    return inputsQuery.data ?? [];
  }, [user, inputsQuery.data]);
  const { signals: sourceSignals } = useSourceConfidence({
    companyId: activeCompany?.id,
    areaScoresJson: activeCompany?.area_scores_json,
    inputsOverride: inputs,
  });
  const { items: strategicProblems } = useStrategicProblems(activeCompany?.id);
  const { items: jobSteps } = useJobSteps(activeCompany?.id);
  const { data: localAlignment } = useLatestLocalAlignment(activeCompany?.id);
  const applyLocalAlignment = useRunLocalAlignment(activeCompany?.id);

  const hasData = inputs.length > 0;

  // Dynamic scoring from real inputs
  const { summary, areas } = useDynamicScoring(inputs, hasData);

  const {
    loading: oppLoading,
    items: oppItems,
    error: oppError,
  } = useOpportunities(activeCompany?.id);
  const { items: routeItems } = useRoutes(activeCompany?.id);

  const fallbackScores = useMemo(
    () =>
      scoreCompanyMojo({
        inputs,
        jobSteps,
        opportunities: Array.isArray(oppItems) ? oppItems : [],
        routes: Array.isArray(routeItems) ? routeItems : [],
        strategicProblems,
        baselineRunResultJson: null,
      }),
    [inputs, jobSteps, oppItems, routeItems, strategicProblems],
  );

  // Prefer stored company scores (from public baseline / research), fallback to shared scorer, then 0
  const displayMojo =
    (typeof activeCompany?.mojo_score === "number" ? activeCompany.mojo_score : null) ??
    fallbackScores.mojo_score ??
    0;

  const displayPotential =
    (typeof activeCompany?.potential_score === "number" ? activeCompany.potential_score : null) ??
    fallbackScores.potential_score ??
    0;

  const displayProjected =
    (typeof activeCompany?.projected_score === "number" ? activeCompany.projected_score : null) ??
    fallbackScores.projected_score ??
    0;

  const usingStoredScores = hasStoredCompanyScores(activeCompany);
  const score = Math.round(safeNumber(displayMojo, 0));
  const potential = Math.round(safeNumber(displayPotential, 0));
  const projected = Math.round(safeNumber(displayProjected, 0));
  const previousScoresRef = useRef<{ mojo: number; potential: number; projected: number } | null>(null);
  const [scoreDeltas, setScoreDeltas] = useState<{
    mojo: number | null;
    potential: number | null;
    projected: number | null;
  }>({
    mojo: null,
    potential: null,
    projected: null,
  });
  const evidenceLabel = formatEvidenceLabel(activeCompany?.evidence_status ?? fallbackScores.evidence_status);
  const evidencePct = evidencePercent(activeCompany?.area_scores_json) ?? Math.round(fallbackScores.evidenceBreakdown.baseline_strength);
  const displayAreaScoresJson =
    typeof activeCompany?.area_scores_json === "object" && activeCompany?.area_scores_json !== null
      ? activeCompany.area_scores_json
      : fallbackScores.area_scores_json;
  const localScoreImpact = localAlignment?.score_impact ?? null;

  useEffect(() => {
    previousScoresRef.current = null;
    setScoreDeltas({ mojo: null, potential: null, projected: null });
  }, [activeCompany?.id]);

  useEffect(() => {
    const previous = previousScoresRef.current;
    if (!previous) {
      previousScoresRef.current = { mojo: score, potential, projected };
      return;
    }

    const mojoDelta = score - previous.mojo;
    const potentialDelta = potential - previous.potential;
    const projectedDelta = projected - previous.projected;

    setScoreDeltas((current) =>
      current.mojo === mojoDelta &&
      current.potential === potentialDelta &&
      current.projected === projectedDelta
        ? current
        : {
            mojo: mojoDelta,
            potential: potentialDelta,
            projected: projectedDelta,
          },
    );

    previousScoresRef.current = { mojo: score, potential, projected };
  }, [score, potential, projected]);

  const scoreSubtext = useMemo(() => {
    const pointsChangeText = (delta: number | null) => {
      if (delta === null) return "Points change: 0";
      if (delta > 0) return `Points change: +${delta}`;
      if (delta < 0) return `Points change: -${Math.abs(delta)}`;
      return "Points change: 0";
    };

    const conciseDeltaText = (delta: number | null): string | null => {
      if (delta === null || delta === 0) return null;
      if (delta > 0) return `↑ +${delta} pts`;
      return `↓ ${Math.abs(delta)} pts`;
    };

    return {
      currentReality: pointsChangeText(scoreDeltas.mojo),
      potential: conciseDeltaText(scoreDeltas.potential),
      projected: conciseDeltaText(scoreDeltas.projected),
    };
  }, [scoreDeltas.mojo, scoreDeltas.potential, scoreDeltas.projected]);

  const inputComplete = inputs.filter((i) => i.status === "complete").length;
  const inputTotal = inputs.length;
  const inputGaps = inputs.filter(
    (i) => i.status === "gap" || i.status === "not_started"
  ).length;

  const completePct =
    inputTotal > 0
      ? Math.round(
          inputs.reduce((s, i) => s + safeNumber(i.completeness, 0), 0) /
            inputTotal
        )
      : 0;

  const focusOpps = useMemo(() => {
    const items = Array.isArray(oppItems) ? oppItems : [];
    return items
      .filter((o) => o.priority_tier === "focus")
      .sort((a, b) => safeNumber(b.opportunity_score, 0) - safeNumber(a.opportunity_score, 0))
      .slice(0, 8);
  }, [oppItems]);

  function openDeepDive(areaKey: string) {
    setDeepDiveArea(areaKey);
    setDeepDiveOpen(true);
  }

  function closeDeepDive() {
    setDeepDiveOpen(false);
    setTimeout(() => setDeepDiveArea(null), 300);
  }

  async function handleApplyScoreUpdate() {
    if (!activeCompany?.id || applyLocalAlignment.isPending) return;
    try {
      const result = await applyLocalAlignment.mutateAsync({
        areas: ["positioning", "strategy"],
        trigger: "manual_apply",
        applyScoreUpdate: true,
      });
      await refetchCompanies();
      const applied = result?.applied_score_update;
      if (applied?.applied) {
        toast.success(
          `Score updated: ${applied.previous_mojo ?? 0} → ${applied.updated_mojo ?? 0}`,
        );
      } else {
        toast.message(applied?.reason || "No score change was applied.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to apply score update.");
    }
  }

  async function handleRunLocalComparison() {
    if (!activeCompany?.id || applyLocalAlignment.isPending) return;
    try {
      await applyLocalAlignment.mutateAsync({
        areas: ["positioning", "strategy"],
        trigger: "manual_refresh",
        applyScoreUpdate: false,
      });
      toast.success("Local comparison updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to run local comparison.");
    }
  }

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

  const researchFinding = useMemo(() => {
    const topFocus = focusOpps[0];
    if (topFocus) {
      const stepContext =
        topFocus.step_label && topFocus.step_number
          ? `${topFocus.journey_key} step ${topFocus.step_number}: ${topFocus.step_label}`
          : topFocus.step_label || topFocus.journey_key || "current workflow";
      const oppScore = safeNumber(topFocus.opportunity_score, 0);
      const importance = safeNumber(topFocus.importance, 0);
      const satisfaction = safeNumber(topFocus.satisfaction, 0);
      return {
        label: "Highest-Impact Finding",
        headline: topFocus.outcome || "A high-impact opportunity was identified.",
        detail:
          `Research points to ${stepContext} as the strongest leverage point right now. ` +
          `This outcome carries an estimated opportunity score of ${oppScore}, with importance at ${importance} and satisfaction at ${satisfaction}, which suggests a meaningful gap worth fixing first.`,
        chips: [
          { label: "Opp", value: oppScore },
          { label: "Imp", value: importance },
          { label: "Sat", value: satisfaction },
        ],
      };
    }

    if (weakestArea) {
      return {
        label: "Weakest Area",
        headline: `${areaDisplayLabel(weakestArea)} is the current constraint.`,
        detail:
          weakestArea.status_note ||
          "This area is the lowest-scoring part of the current map and is the most likely drag on overall confidence and execution.",
        chips: [{ label: "Score", value: Math.round(safeNumber(weakestArea.score, 0)) }],
      };
    }

    if (topInputGap) {
      return {
        label: "Largest Missing Input",
        headline: topInputGap.input_label || "A critical input is still missing.",
        detail:
          topInputGap.why_it_matters ||
          "This input is still incomplete and likely needs attention before the rest of the strategy can become reliable.",
        chips: [{ label: "Impact", value: Math.round(safeNumber(topInputGap.score_impact, 0)) }],
      };
    }

    const insights = isClientSummary(summary) ? summary.key_insights : [];
    const topInsight = insights?.[0];
    return {
      label: "Research Finding",
      headline: topInsight?.headline?.replace(/\*/g, "") || "No research finding yet.",
      detail:
        topInsight?.detail ||
        "Run Web Baseline + AI Research to generate an evidence-backed finding about the most important thing to fix next.",
      chips: [],
    };
  }, [focusOpps, weakestArea, topInputGap, summary]);

  // Areas list (full width card)
  const areaList: ScoreArea[] = Array.isArray(areas) ? areas : [];
  const topAreas = areaList
    .slice()
    .sort((a, b) => safeNumber(b.score, 0) - safeNumber(a.score, 0));

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
        result[key] = {
          summary: "No mapped inputs yet",
          detail: "Add inputs in this area so map guidance is contextual.",
        };
        continue;
      }

      const complete = areaInputs.filter((item) => item.status === "complete").length;
      const gaps = areaInputs.filter((item) => item.status === "gap" || item.status === "not_started");
      const topGap = gaps
        .slice()
        .sort((a, b) => safeNumber(b.score_impact, 0) - safeNumber(a.score_impact, 0))[0];

      result[key] = {
        summary: `${complete}/${areaInputs.length} inputs complete`,
        detail: topGap
          ? `Top gap: ${topGap.input_label} (+${Math.round(safeNumber(topGap.score_impact, 0))} pts)`
          : "No critical mapped gap right now.",
      };
    }
    return result;
  }, [inputs, topAreas]);

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

  const workflow = useMemo(
    () =>
      computeWorkflowGuidance({
        inputs,
        sourceSignals,
        focusOpportunityCount: focusOpps.length,
        routeCount: mapRoutes.length,
        strategicProblemCount: strategicProblems.length,
        reconciledStrategicProblemCount: strategicProblems.filter((item) => item.status === "reconciled").length,
      }),
    [inputs, sourceSignals, focusOpps.length, mapRoutes.length, strategicProblems],
  );
  const headedPlan = workflow.steps;
  const currentHeadedIndex = Math.max(
    0,
    headedPlan.findIndex((step) => !step.done),
  );
  const headedTitle = workflow.title;
  const headedDetail = workflow.detail;

  return (
    <div
      className="min-h-screen"
      style={{
        background: c.bg,
        backgroundImage:
          `url("data:image/svg+xml,%3Csvg width='6' height='6' viewBox='0 0 6 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000' fill-opacity='0.025'%3E%3Cpath d='M5 0h1L0 5V4zM6 5v1H5z'/%3E%3C/g%3E%3C/svg%3E")`,
      }}
    >
      <TopNav onProcessClick={() => setProcessOpen(true)} />

      <main className="max-w-content mx-auto pt-6 px-4 sm:px-6 md:px-9 pb-12">
        {/* Company bar */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1
              className="font-sans text-[20px] font-bold tracking-tight"
              style={{ color: c.charcoal }}
            >
              {activeCompany?.name || "No company selected"}
            </h1>
            <p className="font-mono text-[11px] mt-0.5" style={{ color: c.muted }}>
              {(activeCompany?.website || "No website yet") +
                " · " +
                (activeCompany?.evidence_status || "not_scored")}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <MetaBadge>
                {usingStoredScores
                  ? `${evidenceLabel} · ${evidencePct}% confidence`
                  : `Estimated from current artifacts · ${evidencePct}% confidence`}
              </MetaBadge>
              <SourceLegend signals={sourceSignals} />
            </div>
            <Link
              to="/admin/companies"
              className="font-mono text-[10px] uppercase tracking-wider hover:opacity-70 transition-opacity"
              style={{ color: c.muted }}
            >
              Admin →
            </Link>
          </div>
        </div>

        {/* Recessed field behind all cards */}
        <div
          className="rounded-2xl p-5 sm:p-6"
          style={{
            background: c.field,
            boxShadow:
              "inset 0 2px 6px rgba(0,0,0,0.07), inset 0 0 0 1px rgba(0,0,0,0.04)",
          }}
        >
          <AiBoundaryNote
            label="Source Split"
            tone="public"
            className="mb-5"
            detail="Map scores, journey steps, opportunities, and routes come from the public baseline and company research flow. Uploaded client files feed the deep-dive analysis separately on the local internal AI path."
          />

          {!usingStoredScores ? (
            <div className="mb-5 rounded-xl border px-4 py-3" style={{ borderColor: c.line, background: c.lineFaint }}>
              <p className="font-mono text-[10px] uppercase tracking-wider" style={{ color: c.muted }}>
                Score Status
              </p>
              <p className="mt-1 font-sans text-[12px] leading-[1.6]" style={{ color: c.secondary }}>
                These scores are estimated from current inputs, job steps, and opportunities because no stored company score is available yet. Run the public baseline and AI research flow to save authoritative values.
              </p>
            </div>
          ) : null}

          <div className="mb-5 rounded-xl border px-4 py-3" style={{ borderColor: c.line, background: c.lineFaint }}>
            <p className="font-mono text-[10px] uppercase tracking-wider" style={{ color: c.muted }}>
              Local Comparison Impact
            </p>
            {localAlignment ? (
              <>
                <p className="mt-1 font-sans text-[12px] leading-[1.6]" style={{ color: c.secondary }}>
                  {localScoreImpact?.should_change
                    ? `Local strategy/positioning comparison suggests a ${localScoreImpact.direction} adjustment of ${localScoreImpact.points} point${localScoreImpact.points === 1 ? "" : "s"} when reconciliation actions are completed.`
                    : "Local strategy/positioning comparison did not recommend a score change from this run."}
                </p>
                <p className="mt-1 font-sans text-[12px] leading-[1.6]" style={{ color: c.secondary }}>
                  {localScoreImpact?.reason || "No score-impact rationale returned."}
                </p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wider" style={{ color: c.muted }}>
                  Run: {new Date(localAlignment.created_at).toLocaleString()} · {localAlignment.provider} · {localAlignment.model}
                </p>
                {localAlignment.applied_score_update?.applied ? (
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-wider" style={{ color: c.teal }}>
                    Applied: {localAlignment.applied_score_update.previous_mojo ?? 0} → {localAlignment.applied_score_update.updated_mojo ?? 0}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-1 font-sans text-[12px] leading-[1.6]" style={{ color: c.secondary }}>
                No local comparison has run for this company yet. Run it to generate side-by-side public vs company evidence and gap/overlap findings.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleRunLocalComparison}
                disabled={applyLocalAlignment.isPending}
                className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                style={{ borderColor: c.line, color: c.charcoal, background: "#FFFFFF" }}
              >
                {applyLocalAlignment.isPending ? "Running..." : "Run Local Comparison"}
              </button>
              {localAlignment && localScoreImpact?.should_change ? (
                <button
                  type="button"
                  onClick={handleApplyScoreUpdate}
                  disabled={applyLocalAlignment.isPending}
                  className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ borderColor: c.charcoal, color: "#ffffff", background: c.charcoal }}
                >
                  {applyLocalAlignment.isPending ? "Applying..." : "Apply Score Update"}
                </button>
              ) : null}
            </div>
          </div>

          {/* ── Hero stats ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            {[
              {
                value: score,
                label: "Current Reality",
                bg: c.coral,
                sub: scoreSubtext.currentReality,
              },
              { value: potential, label: "Potential", bg: c.amber, sub: scoreSubtext.potential },
              { value: projected, label: "Projected", bg: c.teal, sub: scoreSubtext.projected },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col items-center justify-center rounded-xl px-4 py-7"
                style={{ background: stat.bg, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}
              >
                <span
                  className="font-sans font-black leading-none tracking-tighter text-white"
                  style={{ fontSize: 54 }}
                >
                  {stat.value}
                </span>
                <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.06em] mt-2 text-white/80">
                  {stat.label}
                </span>
                {stat.sub ? (
                  <span className="mt-1 max-w-[220px] text-center font-mono text-[11px] text-white/60">
                    {stat.sub}
                  </span>
                ) : null}
              </div>
            ))}
          </div>

          {/* Row 1: Strategy Journey Map (full width) */}
          <div style={cardStyle} className="p-4">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wider" style={{ color: c.muted }}>
                  Strategy Journey Map
                </p>
                <p className="font-sans text-[13px] font-semibold" style={{ color: c.charcoal }}>
                  Where you stand and what to do next
                </p>
              </div>

              <div className="flex items-center gap-2">
                <ScoreChip label="Done" value={inputComplete} />
                <ScoreChip label="Total" value={inputTotal} />
                <StateBadge tone={inputGaps > 0 ? "gap" : "designed"}>{inputGaps} gaps</StateBadge>
                <ScoreChip label="Avg" value={completePct} />
              </div>
            </div>

            <StrategyJourneyMapAlt
              areas={areas}
              summary={summary}
              onAreaClick={openDeepDive}
              currentScore={score}
              potentialScore={projected}
              areaScoresJson={displayAreaScoresJson}
              routesData={mapRoutes}
            />
          </div>

          {/* Row 2: Key Insight (left) + Your Next Move (right) */}
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

              <div className="mt-3 flex flex-wrap gap-2">
                {researchFinding.chips.length > 0 ? (
                  researchFinding.chips.map((chip) => (
                    <ScoreChip key={chip.label} label={chip.label} value={chip.value} />
                  ))
                ) : (
                  <>
                    <ScoreChip label="Current Reality" value={score} />
                    <ScoreChip label="Potential" value={potential} />
                    <ScoreChip label="Projected" value={projected} />
                  </>
                )}
              </div>
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

          {/* Row 3: Biggest Opportunities (left) + Where You're Headed (right) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
            <div style={cardStyle} className="lg:col-span-2 p-4">
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider" style={{ color: c.muted }}>
                    Biggest Opportunities
                  </p>
                  <p className="font-sans text-[13px] font-semibold" style={{ color: c.charcoal }}>
                    Focus next
                  </p>
                </div>

                <Link
                  to="/opportunities"
                  className="font-mono text-[10px] uppercase tracking-wider hover:opacity-70 transition-opacity"
                  style={{ color: c.muted }}
                >
                  View →
                </Link>
              </div>

              {!activeCompany?.id ? (
                <p className="font-sans text-[13px]" style={{ color: c.secondary }}>
                  No active company selected.
                </p>
              ) : oppLoading ? (
                <p className="font-mono text-[12px]" style={{ color: c.muted }}>
                  Loading…
                </p>
              ) : oppError ? (
                <p className="font-mono text-[12px]" style={{ color: "#b91c1c" }}>
                  Failed to load opportunities: {oppError}
                </p>
              ) : focusOpps.length === 0 ? (
                <div>
                  <p className="font-sans text-[13px]" style={{ color: c.secondary }}>
                    No focus opportunities yet.
                  </p>
                  <p className="font-sans text-[12px] mt-1" style={{ color: c.muted }}>
                    Run <span className="font-semibold">AI Research</span> in Admin → Companies.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {focusOpps.map((o) => (
                    <div
                      key={o.id}
                      className="rounded-lg p-3"
                      style={{ border: `1px solid ${c.line}`, background: c.lineFaint }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-sans text-[13px] font-semibold" style={{ color: c.charcoal }}>
                            {o.outcome || "Untitled opportunity"}
                          </p>
                          <p className="font-sans text-[12px] mt-0.5" style={{ color: c.secondary }}>
                            {o.journey_key}
                            {o.step_label ? ` • ${o.step_label}` : ""}
                            {o.step_number ? ` (Step ${o.step_number})` : ""}
                          </p>
                        </div>

                        <div className="shrink-0">
                          <ScoreChip label="Score" value={o.opportunity_score} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={cardStyle} className="p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider" style={{ color: c.muted }}>
                Where You’re Headed
              </p>
              <p className="font-sans text-[13px] font-semibold mt-2" style={{ color: c.charcoal }}>
                {workflow.phase === "diagnose"
                  ? "Diagnose Phase"
                  : workflow.phase === "focus"
                    ? "Focus Phase"
                    : "Flow Phase"}
              </p>

              <div
                className="mt-3 rounded-xl border px-3 py-3"
                style={{ borderColor: c.line, background: c.lineFaint }}
              >
                <div className="relative">
                  <div
                    className="absolute bottom-2 left-[11px] top-[16px] w-px"
                    style={{ background: c.line }}
                  />
                  <div className="space-y-3">
                    {headedPlan.map((step, index) => {
                      const isCurrent = index === currentHeadedIndex;
                      const isDone = step.done;
                      return (
                        <div key={step.title} className="relative flex items-start gap-3">
                          <div
                            className="mt-[1px] flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border font-mono text-[10px]"
                            style={{
                              borderColor: isCurrent ? c.coral : isDone ? c.teal : c.line,
                              background: isCurrent ? "#fff" : isDone ? "#EFF7F3" : "#F0EFEC",
                              color: isCurrent ? c.coral : isDone ? c.teal : c.muted,
                              boxShadow: isCurrent ? "0 0 0 2px rgba(255,125,45,0.14)" : "none",
                            }}
                          >
                            {isCurrent ? (
                              <span className="inline-block h-[8px] w-[8px] rounded-full" style={{ background: c.coral }} />
                            ) : isDone ? (
                              <span className="inline-block h-[8px] w-[8px] rounded-full" style={{ background: c.teal }} />
                            ) : (
                              index + 1
                            )}
                          </div>

                          <div className="min-w-0 pt-[1px]">
                            <p
                              className="font-sans text-[13px] font-semibold leading-[1.35]"
                              style={{ color: isCurrent ? c.charcoal : isDone ? c.secondary : c.muted }}
                            >
                              {step.title}
                            </p>
                            <p className="mt-1 font-sans text-[12px] leading-[1.45]" style={{ color: c.secondary }}>
                              {step.detail}
                            </p>
                            {isCurrent ? (
                              <span
                                className="mt-1 inline-flex rounded-[4px] border px-1.5 py-[2px] font-mono text-[9px] uppercase tracking-[0.08em]"
                                style={{
                                  borderColor: "#FFCBAA",
                                  background: "#FFF0E6",
                                  color: c.coral,
                                }}
                              >
                                You are here
                              </span>
                            ) : isDone ? (
                              <span
                                className="mt-1 inline-flex rounded-[4px] border px-1.5 py-[2px] font-mono text-[9px] uppercase tracking-[0.08em]"
                                style={{
                                  borderColor: "#B5D9CC",
                                  background: "#EFF7F3",
                                  color: c.teal,
                                }}
                              >
                                Done
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-3">
                <Link
                  to="/inputs"
                  className="font-mono text-[10px] uppercase tracking-wider hover:opacity-70 transition-opacity"
                  style={{ color: c.muted }}
                >
                  Go to Inputs →
                </Link>
              </div>
            </div>
          </div>

          {/* Row 4: Where We Stand (full width) */}
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

          {/* Row 5: Your Inputs (left) + Quick Nav (right) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
            <div style={cardStyle} className="lg:col-span-2 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider" style={{ color: c.muted }}>
                    Your Inputs
                  </p>
                  <p className="font-sans text-[13px] font-semibold" style={{ color: c.charcoal }}>
                    Progress + gap count
                  </p>
                </div>
                <div className="flex gap-2">
                  <ScoreChip label="Done" value={inputComplete} />
                  <ScoreChip label="Total" value={inputTotal} />
                  <StateBadge tone={inputGaps > 0 ? "gap" : "designed"}>{inputGaps} gaps</StateBadge>
                  <ScoreChip label="Avg" value={completePct} />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { label: "Foundation", hint: "Positioning + program clarity", badge: "Positioning & Strategy" },
                  { label: "Execution", hint: "Channels + operating loop", badge: "Product & Marketing" },
                  { label: "Market Evidence", hint: "Signals + validation", badge: "Sales & Customer Data" },
                ].map((x) => (
                  <div
                    key={x.label}
                    className="rounded-lg p-3"
                    style={{ border: `1px solid ${c.line}`, background: c.lineFaint }}
                  >
                    <p className="font-sans text-[12px] font-semibold" style={{ color: c.charcoal }}>
                      {x.label}
                    </p>
                    <div className="mt-2">
                      <MetaBadge>{x.badge}</MetaBadge>
                    </div>
                    <p className="font-sans text-[12px] mt-2" style={{ color: c.secondary }}>
                      {x.hint}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-3">
                <Link
                  to="/inputs"
                  className="font-mono text-[10px] uppercase tracking-wider hover:opacity-70 transition-opacity"
                  style={{ color: c.muted }}
                >
                  Open Inputs →
                </Link>
              </div>
            </div>

            <div style={cardStyle} className="p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider" style={{ color: c.muted }}>
                Quick Nav
              </p>

              <div className="mt-3 flex flex-col gap-2">
                {[
                  { to: "/inputs", label: "Inputs" },
                  { to: "/job-steps", label: "Job Steps" },
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
          </div>

          {/* Bottom micro footer */}
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
