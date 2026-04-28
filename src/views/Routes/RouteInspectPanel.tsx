import { useMemo } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { RouteRow } from "./useRoutes";
import type { OpportunityRow } from "@/hooks/useOpportunities";
import type { JobStepRow } from "@/hooks/useJobSteps";
import type { FocusClassification } from "@/lib/initiativeFocus";
import { deriveInitiativeContext } from "@/lib/initiativeFocus";
import { routeDetail } from "./routeDetail";
import TierAlignmentGrid from "@/components/inspect/TierAlignmentGrid";
import { routeSignalTiers, generationContextLabel } from "@/lib/strategicObject";
import { computeRouteUnlockConditions } from "@/lib/evidenceBands";

const c = {
  charcoal: "#233C4B",
  secondary: "#46606D",
  muted: "#6E847F",
  line: "#DDE6D1",
  lineFaint: "#EEF3E9",
  paper: "#F7FBF8",
  coral: "#FF7D2D",
  amber: "#FAC846",
  teal: "#5F9B8C",
};

function categoryAccent(category: string): string {
  if (category === "fix") return c.coral;
  if (category === "improve") return c.amber;
  return c.teal;
}

type GateScore = {
  label?: string;
  score?: number;
  components?: Record<string, number>;
};

function parseGateScores(raw: unknown): Record<string, GateScore> | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const per = obj.per_gate_scores;
  if (!per || typeof per !== "object") return null;
  return per as Record<string, GateScore>;
}

function gateInsight(category: string, gates: Record<string, GateScore>): { sentence: string; bullets: string[] } | null {
  let key: string | null = null;

  if (category === "fix") {
    let lowestScore = Infinity;
    for (const [k, g] of Object.entries(gates)) {
      const s = Number(g.score ?? 100);
      if (s < lowestScore) { lowestScore = s; key = k; }
    }
  } else if (category === "improve") {
    const ciScore = Number(gates.customer_insight?.score ?? 100);
    const scScore = Number(gates.strategy_cascade?.score ?? 100);
    key = ciScore <= scScore ? "customer_insight" : "strategy_cascade";
  } else {
    key = "gtm_execution";
  }

  if (!key || !gates[key]) return null;
  const gate = gates[key];
  const label = gate.label || key.replace(/_/g, " ");
  const score = Math.round(Number(gate.score ?? 0));

  const bullets: string[] = [];
  if (gate.components) {
    const comps = gate.components;
    if (typeof comps.route_completeness === "number" && comps.route_completeness < 0.5) {
      bullets.push("Completing more steps in this route would improve this score.");
    }
    if (typeof comps.evidence_completeness === "number" && comps.evidence_completeness < 0.4) {
      bullets.push("Adding evidence would strengthen this score.");
    }
    if (bullets.length === 0) {
      bullets.push("Focus on the highest-impact steps to move this score.");
    }
  } else {
    bullets.push("Focus on the highest-impact steps to move this score.");
  }

  return { sentence: `Your ${label} score is currently ${score}/100.`, bullets };
}

export default function RouteInspectPanel({
  open,
  onClose,
  route,
  opportunities,
  steps,
  initiativeContext,
  opportunityFocusById,
  areaScoresJson,
  linkedDesiredOutcome,
  staleNote,
}: {
  open: boolean;
  onClose: () => void;
  route: RouteRow | null;
  opportunities: OpportunityRow[];
  steps: JobStepRow[];
  initiativeContext: ReturnType<typeof deriveInitiativeContext>;
  opportunityFocusById: Map<string, FocusClassification>;
  areaScoresJson?: unknown;
  linkedDesiredOutcome?: { statement: string; leadingIndicator: string } | null;
  staleNote?: string | null;
}) {
  const detail = useMemo(() => {
    if (!route) return null;
    return routeDetail({ route, opportunities, steps, initiativeContext, opportunityFocusById });
  }, [route, opportunities, steps, initiativeContext, opportunityFocusById]);

  const category = String(route?.category || "improve").toLowerCase();
  const accent = categoryAccent(category);
  const pts = typeof route?.pts_value === "number" ? Math.round(route.pts_value) : null;
  const effort = String(route?.effort || "medium").toUpperCase();
  const frameworks = detail?.frameworks ?? [];
  const whyThisMatters = detail?.whyThisMatters ?? [];
  const evidence = detail?.evidence ?? [];
  const rankedOpps = detail?.rankedOpps ?? [];

  const supporting = evidence.filter((e) => e.status !== "missing");
  const missing = evidence.filter((e) => e.status === "missing");
  const highPriorityOpps = rankedOpps.filter((o) => (o.opportunity_score ?? 0) >= 8);

  const tierCells = useMemo(() => routeSignalTiers({
    frameworksUsed: frameworks,
    hasNonMissingEvidence: supporting.length > 0,
    hasCompleteEvidence: evidence.some((e) => e.status === "complete"),
    hasCustomerEvidence: rankedOpps.length > 0,
  }), [frameworks, supporting.length, evidence, rankedOpps.length]);

  const genContext = route ? generationContextLabel(frameworks, route.id) : "";

  const gateScores = useMemo(() => parseGateScores(areaScoresJson), [areaScoresJson]);
  const insight = useMemo(() => {
    if (!gateScores) return null;
    return gateInsight(category, gateScores);
  }, [gateScores, category]);

  const unlockConditions = useMemo(() => computeRouteUnlockConditions(
    {
      supportingEvidenceCount: supporting.length,
      missingEvidenceCount: missing.length,
      customerOppCount: highPriorityOpps.length,
      isDerived: String(route?.id ?? "").startsWith("derived-"),
    },
    false,
  ), [supporting.length, missing.length, highPriorityOpps.length, route?.id]);

  function statusGlyph(status: "complete" | "in_progress" | "missing") {
    if (status === "complete") return "◉";
    if (status === "in_progress") return "◎";
    return "○";
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="sm:max-w-[480px] overflow-y-auto flex flex-col gap-0 p-0">
        {route ? (
          <div className="flex flex-col h-full">
            {/* Stale banner */}
            {staleNote && (
              <div
                className="px-6 py-2 flex items-center gap-2 border-b"
                style={{ background: `${c.amber}18`, borderColor: c.amber }}
              >
                <span className="font-mono text-[9px] uppercase tracking-[0.08em]" style={{ color: c.amber }}>
                  {staleNote}
                </span>
              </div>
            )}

            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b" style={{ borderColor: c.line }}>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span
                  className="rounded-md px-2 py-[2px] font-mono text-[10px] uppercase tracking-[0.08em] border"
                  style={{ color: accent, borderColor: accent, background: `${accent}14` }}
                >
                  {String(category).charAt(0).toUpperCase() + String(category).slice(1)}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                  {effort} EFFORT
                </span>
                {pts !== null && (
                  <span className="font-mono text-[11px] font-semibold" style={{ color: accent }}>
                    +{pts} pts reachable
                  </span>
                )}
              </div>
              <h2 className="font-sans text-[18px] font-semibold leading-tight" style={{ color: c.charcoal }}>
                {route.title || "Untitled route"}
              </h2>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                Generated using: {genContext}
              </p>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

              {/* Section 0: What this claims */}
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] mb-3" style={{ color: c.muted }}>
                  What this claims
                </p>
                <p className="font-sans text-[13px] leading-[1.55] mb-3" style={{ color: c.secondary }}>
                  {route.short_description || whyThisMatters[0] || "This route surfaces an opportunity to improve performance against your strategy."}
                </p>
                <TierAlignmentGrid cells={tierCells} />
              </div>

              <div className="border-t" style={{ borderColor: c.line }} />

              {/* Section A: Why this was flagged */}
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] mb-3" style={{ color: c.muted }}>
                  Why this was flagged
                </p>
                {whyThisMatters.length > 0 ? (
                  <ul className="space-y-2">
                    {whyThisMatters.map((reason, i) => (
                      <li key={i} className="flex items-start gap-2 font-sans text-[13px] leading-[1.55]" style={{ color: c.secondary }}>
                        <span style={{ color: accent, flexShrink: 0 }}>·</span>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="font-sans text-[13px]" style={{ color: c.muted }}>No specific reasons recorded for this route.</p>
                )}
                {linkedDesiredOutcome?.statement && (
                  <div className="mt-3 rounded-lg border p-3" style={{ borderColor: c.line, background: c.paper }}>
                    <p className="font-mono text-[9px] uppercase tracking-[0.1em] mb-1" style={{ color: c.muted }}>Linked outcome</p>
                    <p className="font-sans text-[12px] leading-[1.5]" style={{ color: c.secondary }}>
                      {linkedDesiredOutcome.statement}
                    </p>
                  </div>
                )}
              </div>

              <div className="border-t" style={{ borderColor: c.line }} />

              {/* Section B: Evidence */}
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] mb-3" style={{ color: c.muted }}>
                  Evidence
                </p>

                {(supporting.length > 0 || highPriorityOpps.length > 0) && (
                  <div className="mb-4">
                    <p className="font-mono text-[9px] uppercase tracking-[0.1em] mb-2" style={{ color: c.teal }}>
                      Supporting
                    </p>
                    <div className="space-y-1.5">
                      {supporting.map((item) => (
                        <div key={item.id} className="flex items-start gap-2 font-sans text-[12px] leading-[1.5]" style={{ color: c.secondary }}>
                          <span style={{ color: c.teal, flexShrink: 0 }}>{statusGlyph(item.status)}</span>
                          <span>{item.title}</span>
                        </div>
                      ))}
                      {highPriorityOpps.map((opp) => (
                        <div key={opp.id} className="flex items-start gap-2 font-sans text-[12px] leading-[1.5]" style={{ color: c.secondary }}>
                          <span style={{ color: c.teal, flexShrink: 0 }}>◉</span>
                          <span>{String(opp.outcome).slice(0, 80)}{opp.outcome.length > 80 ? "…" : ""}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.1em] mb-2" style={{ color: c.coral }}>
                    Needs attention
                  </p>
                  {missing.length > 0 ? (
                    <div className="space-y-1.5">
                      {missing.map((item) => (
                        <div key={item.id} className="flex items-start gap-2 font-sans text-[12px] leading-[1.5]" style={{ color: c.coral }}>
                          <span style={{ flexShrink: 0 }}>○</span>
                          <span>{item.title}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="font-sans text-[12px]" style={{ color: c.muted }}>No gaps flagged for this route.</p>
                  )}
                </div>
              </div>

              <div className="border-t" style={{ borderColor: c.line }} />

              {/* Section C: What would move this */}
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] mb-3" style={{ color: c.muted }}>
                  What would move this
                </p>
                {insight ? (
                  <div>
                    <p className="font-sans text-[13px] leading-[1.55] mb-2" style={{ color: c.secondary }}>
                      {insight.sentence}
                    </p>
                    <ul className="space-y-1.5">
                      {insight.bullets.map((b, i) => (
                        <li key={i} className="flex items-start gap-2 font-sans text-[12px] leading-[1.5]" style={{ color: c.muted }}>
                          <span style={{ flexShrink: 0 }}>·</span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="font-sans text-[13px]" style={{ color: c.muted }}>
                    Run scoring to see what would change this recommendation.
                  </p>
                )}
              </div>

              <div className="border-t" style={{ borderColor: c.line }} />

              {/* Section D: What would strengthen this */}
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] mb-3" style={{ color: c.muted }}>
                  What would strengthen this
                </p>

                {/* Current evidence state */}
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span
                    className="rounded px-2 py-[2px] font-mono text-[9px] uppercase tracking-[0.08em] border"
                    style={{ color: c.amber, borderColor: c.amber, background: `${c.amber}18` }}
                  >
                    {unlockConditions.currentBandLabel}
                  </span>
                  {unlockConditions.nextBandLabel && (
                    <>
                      <span className="font-mono text-[10px]" style={{ color: c.muted }}>→</span>
                      <span className="font-mono text-[9px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                        {unlockConditions.nextBandLabel}
                      </span>
                    </>
                  )}
                </div>
                <p className="font-sans text-[12px] leading-[1.5] mb-3" style={{ color: c.secondary }}>
                  {unlockConditions.currentStateDescription}
                </p>

                {/* Missing items */}
                {unlockConditions.missingItems.length > 0 && (
                  <div className="mb-3">
                    <p className="font-mono text-[9px] uppercase tracking-[0.1em] mb-1.5" style={{ color: c.coral }}>
                      Current evidence state
                    </p>
                    <div className="space-y-1.5">
                      {unlockConditions.missingItems.map((item, i) => (
                        <div key={i} className="flex items-start gap-2 font-sans text-[12px] leading-[1.5]" style={{ color: c.muted }}>
                          <span style={{ color: c.coral, flexShrink: 0 }}>○</span>
                          <span>{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Restore items */}
                {unlockConditions.restoreItems.length > 0 && (
                  <div className="mb-3">
                    <p className="font-mono text-[9px] uppercase tracking-[0.1em] mb-1.5" style={{ color: c.amber }}>
                      Restorable
                    </p>
                    <div className="space-y-1.5">
                      {unlockConditions.restoreItems.map((item, i) => (
                        <div key={i} className="flex items-start gap-2 font-sans text-[12px] leading-[1.5]" style={{ color: c.amber }}>
                          <span style={{ flexShrink: 0 }}>↩</span>
                          <span>{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Unlock items — next evidence threshold */}
                {unlockConditions.unlockItems.length > 0 && (
                  <div className="rounded border p-3 space-y-2" style={{ borderColor: c.line, borderStyle: "dashed" }}>
                    <p className="font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
                      Next evidence threshold
                    </p>
                    {unlockConditions.unlockItems.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 font-sans text-[12px] leading-[1.5]" style={{ color: c.secondary }}>
                        <span style={{ color: c.teal, flexShrink: 0 }}>·</span>
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t" style={{ borderColor: c.line }}>
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-full border py-2 font-mono text-[10px] uppercase tracking-[0.08em]"
                style={{ borderColor: c.line, color: c.secondary }}
              >
                Close
              </button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
