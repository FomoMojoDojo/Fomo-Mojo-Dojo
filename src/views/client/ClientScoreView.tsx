import ClientModeNav from "@/components/client-view/ClientModeNav";
import ClientSignalBars from "@/components/client-view/ClientSignalBars";
import PageShell from "@/components/layout/PageShell";
import { useClientViewData } from "@/hooks/useClientViewData";
import { useHashAnchorScroll } from "@/hooks/useHashAnchorScroll";
import type { ClientActionSummary } from "@/lib/clientViewModel";
import { StateBadge } from "@/components/ui/semantic-badges";

function scoreState(score: number) {
  if (score >= 75) return { label: "Strong", tone: "served" as const };
  if (score >= 60) return { label: "Emerging", tone: "monitor" as const };
  return { label: "At Risk", tone: "gap" as const };
}

type LimiterLabel = "Ownership" | "Proof" | "Alignment" | "Execution";

type Limiter = {
  label: LimiterLabel;
  detail: string;
  action: string;
  projected: number;
};

function isProofLimited(evidenceStatus: string | null | undefined) {
  const status = String(evidenceStatus || "").trim().toLowerCase();
  if (!status) return true;
  if (status.includes("strong") || status.includes("artifacts")) return false;
  return (
    status.includes("thin") ||
    status.includes("partial") ||
    status.includes("no_public") ||
    status.includes("generated_no_baseline") ||
    status.includes("emerging")
  );
}

function isAlignmentLimited(constraintTitle: string) {
  return /\bmisalign|\balign|\bconflict|\bpriorit|\bshared\b|\bdirection\b/i.test(constraintTitle);
}

function pickAnchorAction(actions: ClientActionSummary[], preferred: "Fix" | "Improve" | "Create") {
  const direct = actions.find((item) => item.category === preferred);
  if (direct) return direct;
  return actions[0] ?? null;
}

function projectedTarget(base: number, ceiling: number, lift: number) {
  return Math.min(ceiling, base + lift);
}

export default function ClientScoreView() {
  useHashAnchorScroll();

  const {
    activeCompany,
    hasCompany,
    topActions,
    allActions,
    ownership,
    primaryConstraint,
    signalStrength,
    mapStatus,
    committedAt,
    mapPrimaryOwner,
    rerunAnalysis,
    rerunningAnalysis,
  } = useClientViewData({ actionLimit: 5 });

  const mojoScore = Math.round(Number(activeCompany?.mojo_score ?? 0));
  const potentialScore = Math.round(Number(activeCompany?.potential_score ?? 0));
  const projectedScore = Math.round(Number(activeCompany?.projected_score ?? 0));
  const scoreTone = scoreState(mojoScore);
  const scoreCeiling = Math.max(mojoScore, potentialScore, projectedScore);
  const proofLimited = isProofLimited(activeCompany?.evidence_status);
  const alignmentLimited = isAlignmentLimited(primaryConstraint.title);
  const activeCount = allActions.filter((action) => action.status === "in_progress" || action.status === "done").length;
  const executionLimited = allActions.length > 0 && activeCount === 0;
  const unownedCount = ownership.unownedCriticalActions;
  const topFix = pickAnchorAction(allActions, "Fix");
  const topImprove = pickAnchorAction(allActions, "Improve");

  const limiters: Limiter[] = [];
  if (unownedCount > 0) {
    limiters.push({
      label: "Ownership",
      detail: `${unownedCount} critical action${unownedCount === 1 ? " has" : "s have"} no clear owner.`,
      action: `Assign a Primary Owner to "${topFix?.title || "top Fix action"}".`,
      projected: projectedTarget(mojoScore, scoreCeiling, 12),
    });
  }
  if (proofLimited) {
    limiters.push({
      label: "Proof",
      detail: "Impact is not yet validated with clear, quantified results.",
      action: `Validate measurable impact for "${topImprove?.title || topFix?.title || "top priority"}".`,
      projected: projectedTarget(mojoScore, scoreCeiling, 10),
    });
  }
  if (alignmentLimited) {
    limiters.push({
      label: "Alignment",
      detail: "The team is not yet fully aligned on one clear problem.",
      action: "Align on the single most important problem before adding work.",
      projected: projectedTarget(mojoScore, scoreCeiling, 8),
    });
  }
  if (executionLimited) {
    limiters.push({
      label: "Execution",
      detail: "Priorities are defined, but little is in active execution.",
      action: `Move "${topFix?.title || "top Fix action"}" into in-progress this week.`,
      projected: projectedTarget(mojoScore, scoreCeiling, 9),
    });
  }

  const topLimiters = (limiters.length > 0 ? limiters : [{
    label: "Execution" as const,
    detail: "Momentum is stable; focus on keeping critical actions moving.",
    action: `Keep "${topFix?.title || "top priority"}" in active execution.`,
    projected: projectedTarget(mojoScore, scoreCeiling, 4),
  }]).slice(0, 3);

  const currentPosition = `${mojoScore} → ${scoreTone.label}`;
  const fastestLift =
    topLimiters
      .map((factor) => ({ ...factor, lift: Math.max(0, factor.projected - mojoScore) }))
      .sort((a, b) => b.lift - a.lift)[0] ?? null;

  const successMetrics = topActions
    .flatMap((action) => action.successCriteria)
    .filter((item, index, collection) => collection.indexOf(item) === index)
    .slice(0, 4);

  return (
    <PageShell bare tone="neutral">
      <div className="client-view-stage max-w-content mx-auto px-4 pb-14 pt-6 sm:px-6 md:px-9">
        <header className="mb-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-t-muted">Learning</p>
          <h1 className="mt-1 max-w-[640px] font-sans text-[30px] font-medium text-t-primary">Is this working?</h1>
          <p className="mt-2 max-w-[640px] font-sans text-[15px] leading-[1.7] text-t-secondary">
            Outcome signal, success metrics, and re-evaluation.
          </p>
        </header>

        <div className="space-y-4">
          <ClientModeNav
            activeMode="learning"
            mapStatus={mapStatus}
            committedAt={committedAt}
            primaryOwner={mapPrimaryOwner}
            onRerunAnalysis={rerunAnalysis}
            rerunning={rerunningAnalysis}
          />

          {!hasCompany ? (
            <div className="rounded-xl border border-[#d8e1de] bg-white p-5">
              <p className="font-sans text-[14px] text-t-secondary">Select a company to view score.</p>
            </div>
          ) : (
            <section id="client-what-this-means" className="scroll-mt-20 space-y-5">
              <div className="rounded-3xl bg-[#233c4b] px-6 py-8 text-center text-white">
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#b7d2d8]">Outcome signal</p>
                <p className="mt-2 font-sans text-[94px] font-semibold leading-none">{mojoScore}</p>
                <p className="mt-2 font-sans text-[26px] font-medium">{scoreTone.label}</p>
                <div className="mt-3 inline-flex">
                  <StateBadge tone={scoreTone.tone}>{currentPosition}</StateBadge>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <span className="rounded-full border border-white/25 bg-white/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em]">
                    Baseline {mojoScore}
                  </span>
                  <span className="rounded-full border border-white/25 bg-white/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em]">
                    Reachable {potentialScore}
                  </span>
                  <span className="rounded-full border border-white/25 bg-white/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em]">
                    Unlockable {projectedScore}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.3fr_1fr]">
                <div id="client-ownership" className="space-y-4 scroll-mt-20">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-t-muted">Cause {"->"} Effect</p>
                    <ul className="mt-2 space-y-2">
                      {topLimiters.slice(0, 3).map((factor) => (
                        <li key={`limit-${factor.label}`} className="font-sans text-[15px] leading-[1.5] text-t-primary">
                          <span className="font-semibold">{factor.label}</span> {"->"} {factor.detail}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <ClientSignalBars summary={signalStrength} />
                  <div className="rounded-2xl border border-[#d8e1de] bg-white px-4 py-4">
                    <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-t-muted">Constraint impact</p>
                    <p className="mt-2 font-sans text-[15px] leading-[1.45] text-t-primary">{primaryConstraint.title}</p>
                    <p className="mt-1 font-sans text-[13px] leading-[1.5] text-t-secondary">
                      {ownership.insight}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {fastestLift ? (
                    <div className="rounded-xl border border-forest/25 bg-forest/5 px-4 py-3">
                      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-forest">Fastest lift</p>
                      <p className="mt-1 font-sans text-[15px] leading-[1.45] text-t-primary">{fastestLift.action}</p>
                      <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.08em] text-forest">
                        Potential upside: +{Math.max(0, fastestLift.projected - mojoScore)}
                      </p>
                    </div>
                  ) : null}
                  <div className="rounded-2xl border border-[#d8e1de] bg-white px-4 py-4">
                    <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-t-muted">Success metrics</p>
                    <ul className="mt-2 space-y-1.5">
                      {successMetrics.length > 0 ? (
                        successMetrics.map((item) => (
                          <li key={`learning-metric-${item}`} className="font-sans text-[13px] leading-[1.45] text-t-primary">
                            {item}
                          </li>
                        ))
                      ) : (
                        <li className="font-sans text-[13px] text-t-secondary">Add success criteria on top priorities.</li>
                      )}
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-[#d8e1de] bg-white px-4 py-4">
                    <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-t-muted">Re-evaluation</p>
                    <p className="mt-1 font-sans text-[13px] leading-[1.5] text-t-secondary">
                      Re-run with latest inputs to refresh constraint, priorities, and next move.
                    </p>
                    <button
                      type="button"
                      onClick={() => void rerunAnalysis()}
                      disabled={rerunningAnalysis}
                      className="mt-3 inline-flex rounded-full bg-[#233c4b] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-white transition-opacity hover:opacity-85 disabled:opacity-60"
                    >
                      {rerunningAnalysis ? "Re-running..." : "Re-run analysis"}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </PageShell>
  );
}
