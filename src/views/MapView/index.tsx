import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import TopNav from "@/components/layout/TopNav";
import AiBoundaryNote from "@/components/AiBoundaryNote";
import { useInputs } from "@/hooks/useInputs";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useDynamicScoring } from "@/hooks/useDynamicScoring";
import { useJobSteps } from "@/hooks/useJobSteps";
import MethodologyPanel from "@/components/methodology/MethodologyPanel";
import DeepDivePanel from "@/views/DeepDive/DeepDivePanel";
import StrategyJourneyMapAlt from "./StrategyJourneyMapAlt";
import { useOpportunities } from "@/hooks/useOpportunities";
import type { ClientSummary, InputItem, ScoreArea } from "@/lib/types";
import { MetaBadge, ScoreChip, StateBadge } from "@/components/ui/semantic-badges";
import { scoreCompanyMojo } from "@/lib/scoring/mojoScore";

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
  const { activeCompany } = useCompany();

  const { query: inputsQuery } = useInputs();
  const inputs = useMemo<InputItem[]>(() => {
    if (!user) return [];
    return inputsQuery.data ?? [];
  }, [user, inputsQuery.data]);
  const { items: jobSteps } = useJobSteps(activeCompany?.id);

  const hasData = inputs.length > 0;

  // Dynamic scoring from real inputs
  const { summary, areas } = useDynamicScoring(inputs, hasData);

  const {
    loading: oppLoading,
    items: oppItems,
    error: oppError,
  } = useOpportunities(activeCompany?.id);

  const fallbackScores = useMemo(
    () =>
      scoreCompanyMojo({
        inputs,
        jobSteps,
        opportunities: Array.isArray(oppItems) ? oppItems : [],
        baselineRunResultJson: null,
      }),
    [inputs, jobSteps, oppItems],
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
  const evidenceLabel = formatEvidenceLabel(activeCompany?.evidence_status ?? fallbackScores.evidence_status);
  const evidencePct = evidencePercent(activeCompany?.area_scores_json) ?? Math.round(fallbackScores.evidenceBreakdown.baseline_strength);

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

  // “Where you’re headed” (placeholder until milestones are DB-backed)
  const headedTitle =
    inputGaps > 0 ? "Close foundation gaps" : focusOpps.length > 0 ? "Execute your focus lane" : "Run research + baseline";
  const headedDetail =
    inputGaps > 0
      ? "Complete the highest-impact inputs to raise confidence and score."
      : focusOpps.length > 0
      ? "Pick the top 1–2 focus opportunities and build routes + inputs around them."
      : "Run Web Baseline + AI Research to populate signals, inputs, steps, and opportunities.";

  // Areas list (full width card)
  const areaList: ScoreArea[] = Array.isArray(areas) ? areas : [];
  const topAreas = areaList
    .slice()
    .sort((a, b) => safeNumber(b.score, 0) - safeNumber(a.score, 0));

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

          <div className="flex items-center gap-3">
            <MetaBadge>
              {usingStoredScores
                ? `${evidenceLabel} · ${evidencePct}% confidence`
                : `Estimated from current artifacts · ${evidencePct}% confidence`}
            </MetaBadge>
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

          {/* ── Hero stats ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            {[
              {
                value: score,
                label: "Mojo Score",
                bg: c.coral,
                sub: `↑ +${safeNumber(summary?.score_delta, 0)} this quarter`,
              },
              { value: potential, label: "Potential", bg: c.amber, sub: "with clearer strategic framing" },
              { value: projected, label: "Projected", bg: c.teal, sub: "if positioning, customer insight, and execution gaps are closed" },
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
                <span className="mt-1 max-w-[220px] text-center font-mono text-[11px] text-white/60">
                  {stat.sub}
                </span>
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
                    <ScoreChip label="Mojo" value={score} />
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
                Next 7–14 days
              </p>

              <div className="mt-3 space-y-2">
                <div className="rounded-lg p-3" style={{ border: `1px solid ${c.line}`, background: c.lineFaint }}>
                  <p className="font-sans text-[12px] font-semibold" style={{ color: c.charcoal }}>
                    1) Confirm public baseline
                  </p>
                  <p className="font-sans text-[12px] mt-1" style={{ color: c.secondary }}>
                    Ensure evidence ledger is meaningful and recent.
                  </p>
                </div>

                <div className="rounded-lg p-3" style={{ border: `1px solid ${c.line}`, background: c.lineFaint }}>
                  <p className="font-sans text-[12px] font-semibold" style={{ color: c.charcoal }}>
                    2) Close top gaps
                  </p>
                  <p className="font-sans text-[12px] mt-1" style={{ color: c.secondary }}>
                    Complete 3–5 highest impact inputs first.
                  </p>
                </div>

                <div className="rounded-lg p-3" style={{ border: `1px solid ${c.line}`, background: c.lineFaint }}>
                  <p className="font-sans text-[12px] font-semibold" style={{ color: c.charcoal }}>
                    3) Choose a focus lane
                  </p>
                  <p className="font-sans text-[12px] mt-1" style={{ color: c.secondary }}>
                    Pick the top opportunity and turn it into routes + actions.
                  </p>
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
                      <p className="font-sans text-[12px] mt-2" style={{ color: c.secondary }}>
                        Click to open deep dive →
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
