import { useState, useEffect, useMemo, useCallback } from "react";
import type { OdiNeedRow } from "@/hooks/useOdiNeeds";
import type { JobStepRow } from "@/hooks/useJobSteps";
import type { RouteRow } from "@/views/Routes/useRoutes";
import { supabase } from "@/integrations/supabase/client";
import { isArtifactStale } from "@/lib/evidenceImpact";
import { isPrimaryNeedsSourcePath } from "@/lib/evidenceBands";
import NeedInspectPanel from "@/components/needs/NeedInspectPanel";
import RouteInspectPanel, { type RouteInspectDetail } from "@/components/routes/RouteInspectPanel";
import InspectionShell from "@/components/inspection/InspectionShell";
import { useInspectionStack } from "@/hooks/useInspectionStack";
import { SectionHeader } from "../primitives";
import { getOutcomeFocus, setOutcomeFocus, clearOutcomeFocus } from "@/lib/activeOutcomeFocus";
import { useAuth } from "@/hooks/useAuth";
import { sanitizeStaleReason } from "@/lib/needDisplayLanguage";
import { HierarchyPageShell } from "@/components/design-system/HierarchyPageShell";
import { HierarchySectionHeader } from "@/components/design-system/HierarchySectionHeader";
import { D } from "@/components/design-system/tokens";
import type { SignalBasis } from "@/components/design-system/SignalBasisChip";

// ── Constants ─────────────────────────────────────────────────────────────────

const STATE_LABEL: Record<string, string> = {
  underserved: "Underserved",
  served:      "Served",
  overserved:  "Overserved",
};

const MONO: React.CSSProperties = {
  fontFamily: "monospace",
  fontSize: 9,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const REVIEW_STATES = new Set(["needs_review", "stale", "contradicted", "revalidate"]);

function needsReviewState(value: string | null | undefined) {
  return REVIEW_STATES.has(String(value || "").trim().toLowerCase());
}

// Maps well-known journey_key values to plain outcome statements.
// Unknown keys get title-cased automatically.
const JOURNEY_OUTCOME_LABELS: Record<string, string> = {
  customer:   "Improve the customer experience",
  revenue:    "Grow and protect revenue",
  operations: "Strengthen operational efficiency",
  brand:      "Build a stronger market position",
  demand:     "Increase qualified demand",
  other:      "Other opportunities",
};

function labelForJourneyKey(key: string): string {
  return (
    JOURNEY_OUTCOME_LABELS[key.toLowerCase()] ??
    key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ")
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type OutcomeGroup = {
  key: string;
  label: string;
  needs: OdiNeedRow[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function isMeaningfullyScored(n: OdiNeedRow): boolean {
  return !(n.importance === 5 && n.satisfaction === 5) && n.opportunity_score > 0;
}

function deriveUnknowns(needs: OdiNeedRow[]): string[] {
  if (needs.length === 0) return [];

  const primaryNeeds = needs.filter((n) => isPrimaryNeedsSourcePath(n.source_path));
  const hasCustomerSignals = primaryNeeds.length > 0;
  const hasMeaningfulScoring = primaryNeeds.filter(isMeaningfullyScored).length >= 3;
  const unvalidatedCount = needs.filter((n) => !isPrimaryNeedsSourcePath(n.source_path)).length;

  const unknowns: string[] = [];

  if (!hasCustomerSignals) {
    unknowns.push("We haven't talked to customers yet — this is based on internal and market data.");
    unknowns.push("We don't know which problems matter most to customers.");
  } else {
    if (unvalidatedCount > 0) {
      unknowns.push("Some of these needs haven't been checked with customers yet.");
    }
    if (!hasMeaningfulScoring) {
      unknowns.push("We don't yet know which problems matter most.");
    }
  }

  return unknowns.slice(0, 4);
}

function deriveNeedRoleLabel(need: OdiNeedRow): string | null {
  if (need.service_state === "underserved" && need.importance >= 8) return "Active tension";
  if (need.service_state === "underserved" && need.importance >= 5) return "Emerging gap";
  if (need.service_state === "served" && need.importance >= 7 && need.satisfaction <= 6) return "Proof gap";
  if (need.service_state === "overserved" && need.importance <= 5) return "Over-invested";
  return null;
}

// ── NeedRow ───────────────────────────────────────────────────────────────────

function NeedRow({
  need,
  idx,
  num,
  total,
  reorderingId,
  onMove,
  onScoreChange,
  onInspect,
  onFocus,
  onReEvaluate,
  reEvalLoading,
  isMuted,
  isHighlighted,
  isFocused,
  reviewState,
  titleMode = "human",
}: {
  need: OdiNeedRow;
  idx: number;
  num: string;
  total: number;
  reorderingId: string | null;
  onMove: (idx: number, dir: "up" | "down") => Promise<void>;
  onScoreChange: (id: string, imp: number, sat: number) => Promise<void>;
  onInspect?: () => void;
  onFocus?: () => void;
  onReEvaluate?: () => void;
  reEvalLoading?: boolean;
  isMuted: boolean;
  isHighlighted: boolean;
  isFocused: boolean;
  reviewState: boolean;
  titleMode?: "human" | "canonical";
}) {
  const [imp, setImp] = useState(need.importance);
  const [sat, setSat] = useState(need.satisfaction);

  useEffect(() => { setImp(need.importance); setSat(need.satisfaction); }, [need.importance, need.satisfaction]);

  const busy = reorderingId === need.id;
  const oppWeight = need.opportunity_score >= 9
    ? " crpv-ws-need-row-critical"
    : need.opportunity_score >= 7
      ? " crpv-ws-need-row-high"
      : need.opportunity_score < 3
        ? " crpv-ws-need-row-ambient"
        : need.opportunity_score < 5
          ? " crpv-ws-need-row-low"
          : "";

  const roleLabel = deriveNeedRoleLabel(need);
  const isOffStrategy = need.strategy_alignment === "off_strategy";

  const roleStyle: React.CSSProperties = {
    ...(roleLabel === "Active tension"
      ? { borderLeft: "3px solid #c47839", background: "#fdf9f6", paddingLeft: 9 }
      : roleLabel === "Emerging gap"
      ? { borderLeft: "2px solid #c4a039" }
      : roleLabel === "Proof gap"
      ? { borderLeft: "2px solid #6a7a9e" }
      : roleLabel === "Over-invested"
      ? { opacity: 0.5 }
      : {}),
    ...(isOffStrategy ? { opacity: isOffStrategy && roleLabel === "Over-invested" ? 0.5 : 0.58 } : {}),
  };

  return (
    <div
      className={`crpv-ws-need-row${oppWeight}${busy ? " crpv-ws-need-moving" : ""}${isMuted ? " crpv-ws-need-muted" : ""}${isHighlighted ? " crpv-ws-need-match" : ""}`}
      style={roleStyle}
      data-depstate={need.dependency_state ?? undefined}
    >
      <span className="crpv-ws-need-num">{num}</span>
      <div className="crpv-ws-need-body">
        <div className="crpv-ws-need-outcome">
          <span>{titleMode === "canonical" ? (need.odi_canonical_statement ?? need.desired_outcome) : need.desired_outcome}</span>
          {reviewState && (
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ ...MONO, color: "#b06a3c" }}>Needs review</span>
              <span style={{ fontSize: 11, color: "#7d6a5c", lineHeight: 1.45 }}>
                {sanitizeStaleReason(need.stale_reason)}
              </span>
            </div>
          )}
          {isOffStrategy && (
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ ...MONO, color: "#999" }}>OFF-STRATEGY · retained by choice</span>
              {need.strategy_alignment_reason && (
                <span style={{ fontSize: 11, color: "#aaa", lineHeight: 1.45, fontStyle: "italic" }}>
                  {need.strategy_alignment_reason}
                </span>
              )}
              {onReEvaluate && (
                <button
                  type="button"
                  disabled={reEvalLoading}
                  onClick={onReEvaluate}
                  style={{ alignSelf: "flex-start", fontSize: 10, color: reEvalLoading ? "#ccc" : "#999", background: "none", border: "none", cursor: reEvalLoading ? "default" : "pointer", padding: 0, textDecoration: "underline" }}
                >
                  {reEvalLoading ? "Evaluating…" : "↻ Re-evaluate alignment"}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="crpv-ws-need-annotation">
          <div className="crpv-ws-need-scores">
            <label className="crpv-ws-need-score-wrap">
              <span className="crpv-ws-need-score-lbl cap">Imp</span>
              <input
                type="number" min={0} max={10}
                className="crpv-ws-score-input"
                value={imp}
                onChange={(e) => setImp(Number(e.target.value))}
                onBlur={() => onScoreChange(need.id, imp, sat)}
              />
            </label>
            <label className="crpv-ws-need-score-wrap">
              <span className="crpv-ws-need-score-lbl cap">Sat</span>
              <input
                type="number" min={0} max={10}
                className="crpv-ws-score-input"
                value={sat}
                onChange={(e) => setSat(Number(e.target.value))}
                onBlur={() => onScoreChange(need.id, imp, sat)}
              />
            </label>
            <div className="crpv-ws-need-score-wrap">
              <span className="crpv-ws-need-score-lbl cap">Opp</span>
              <span className="crpv-ws-score-display">{need.opportunity_score}</span>
            </div>
          </div>
          <span className={`crpv-ws-state-badge crpv-ws-state-${need.service_state}`}>
            {STATE_LABEL[need.service_state] ?? need.service_state}
          </span>
          {roleLabel && (() => {
            const roleColor =
              roleLabel === "Active tension" ? "#b06a3c"
              : roleLabel === "Emerging gap" ? "#8a6a3c"
              : roleLabel === "Proof gap" ? "#5a5e6e"
              : "#6e7e85";
            return <span style={{ ...MONO, color: roleColor, fontSize: 9 }}>{roleLabel}</span>;
          })()}
          {onFocus && (
            <button
              type="button"
              style={{ fontSize: 10, color: isFocused ? "#5f9b8c" : "#999", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              onClick={onFocus}
            >
              {isFocused ? "Unfocus" : "Focus"}
            </button>
          )}
          {onInspect && (
            <button type="button" className="crpv-ws-need-inspect-btn" onClick={onInspect}>
              Inspect →
            </button>
          )}
          <div className="crpv-ws-reorder-btns">
            <button
              type="button" className="crpv-ws-reorder-btn"
              disabled={idx === 0 || busy}
              onClick={() => onMove(idx, "up")}
              aria-label="Move up"
            >▲</button>
            <button
              type="button" className="crpv-ws-reorder-btn"
              disabled={idx === total - 1 || busy}
              onClick={() => onMove(idx, "down")}
              aria-label="Move down"
            >▼</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── NeedsOrgPanel ─────────────────────────────────────────────────────────────

export default function NeedsOrgPanel({
  needs: initialNeeds,
  loading,
  updateNeedScores,
  latestExclusionAt,
  activeStep,
  onClearStep,
  routes,
  onRouteSelect,
  companyId,
  currentPhase,
  reviewNeedId,
  onReviewNeedHandled,
  hasHierarchy,
  signalBasis,
  onReEvaluate,
  reEvalLoadingId,
}: {
  needs: OdiNeedRow[];
  loading: boolean;
  updateNeedScores: (id: string, imp: number, sat: number) => Promise<void>;
  latestExclusionAt?: Date | null;
  activeStep?: JobStepRow | null;
  onClearStep?: () => void;
  routes?: RouteRow[];
  onRouteSelect?: (routeId: string) => void;
  companyId?: string;
  currentPhase?: import("@/lib/engagementPhase").EngagementPhase;
  reviewNeedId?: string | null;
  onReviewNeedHandled?: () => void;
  hasHierarchy?: boolean;
  signalBasis?: SignalBasis;
  onReEvaluate?: (needId: string) => void;
  reEvalLoadingId?: string | null;
}) {
  const { user } = useAuth();
  const [titleMode, setTitleMode] = useState<"human" | "canonical">("human");
  const [localNeeds, setLocalNeeds] = useState<OdiNeedRow[]>(initialNeeds);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [highlightReviewSection, setHighlightReviewSection] = useState(false);
  const [reviewTargetId, setReviewTargetId] = useState<string | null>(null);
  const { stack, top, open: openFrame, push: pushFrame, pop: popFrame, clear: clearFrame, updateTopLens } = useInspectionStack();
  const [focusedOutcome, setFocusedOutcomeRaw] = useState<string | null>(null);
  const [focusedOpportunityId, setFocusedOpportunityIdRaw] = useState<string | null>(null);

  // ── localStorage sync ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!companyId) return;
    const saved = getOutcomeFocus(companyId);
    setFocusedOutcomeRaw(saved.outcomeText);
    setFocusedOpportunityIdRaw(saved.opportunityId);
  }, [companyId]);

  function setFocusedOutcome(outcome: string | null) {
    setFocusedOutcomeRaw(outcome);
    if (companyId) setOutcomeFocus(companyId, { outcomeText: outcome, opportunityId: focusedOpportunityId });
  }

  function setFocusedOpportunityId(id: string | null) {
    setFocusedOpportunityIdRaw(id);
    if (companyId) setOutcomeFocus(companyId, { outcomeText: focusedOutcome, opportunityId: id });
  }

  function clearAllFocus() {
    setFocusedOutcomeRaw(null);
    setFocusedOpportunityIdRaw(null);
    if (companyId) clearOutcomeFocus(companyId);
  }

  useEffect(() => { setLocalNeeds(initialNeeds); }, [initialNeeds]);

  useEffect(() => {
    if (!reviewNeedId) return;
    const matchedNeed = initialNeeds.find((need) => need.id === reviewNeedId) ?? null;
    if (matchedNeed) {
      openFrame({ kind: "need", objectId: matchedNeed.id, lens: "validation" });
      setReviewTargetId(matchedNeed.id);
      setHighlightReviewSection(true);
    }
    onReviewNeedHandled?.();
  }, [initialNeeds, onReviewNeedHandled, openFrame, reviewNeedId]);

  const applyNeedPatch = useCallback((needId: string, patch: Partial<OdiNeedRow>) => {
    setLocalNeeds((prev) => prev.map((need) => (need.id === needId ? { ...need, ...patch } : need)));
  }, []);

  // Derive the need currently open in the inspection panel — used for source_run_id in review events
  const currentNeedSourceRunId = useMemo(() => {
    if (top?.kind !== "need") return null;
    return localNeeds.find((n) => n.id === top.objectId)?.source_run_id ?? null;
  }, [top, localNeeds]);

  const createNeedReviewEvent = useCallback(async (needId: string, eventType: "refreshed" | "updated", reason: string, newValue: Record<string, unknown>) => {
    if (!companyId) throw new Error("Company context missing for need review event.");
    const { error } = await supabase.from("strategic_events").insert({
      company_id: companyId,
      event_type: eventType,
      actor_type: user?.id ? "user" : "system",
      actor_id: user?.id ?? null,
      source_run_id: currentNeedSourceRunId,
      object_type: "odi_need",
      object_id: needId,
      previous_value: null,
      new_value: newValue,
      reason,
    });
    if (error) throw new Error(error.message || "Failed to record need review event.");
  }, [companyId, currentNeedSourceRunId, user?.id]);

  const handleMarkReviewed = useCallback(async (needId: string) => {
    const previousNeed = localNeeds.find((need) => need.id === needId);
    if (!previousNeed) throw new Error("Need not found.");
    const reviewedAt = new Date().toISOString();
    const patch = {
      dependency_state: "fresh",
      last_reviewed_at: reviewedAt,
      stale_reason: null,
      stale_since_event_id: null,
      updated_at: reviewedAt,
    } satisfies Partial<OdiNeedRow>;

    const { error } = await supabase
      .from("odi_needs")
      .update(patch)
      .eq("id", needId);
    if (error) throw new Error(error.message || "Failed to mark need reviewed.");

    try {
      await createNeedReviewEvent(
        needId,
        "refreshed",
        "Need reviewed after job map change",
        {
          dependency_state: "fresh",
          last_reviewed_at: reviewedAt,
        },
      );
    } catch (eventError) {
      await supabase
        .from("odi_needs")
        .update({
          dependency_state: previousNeed.dependency_state ?? "needs_review",
          last_reviewed_at: previousNeed.last_reviewed_at ?? null,
          stale_reason: previousNeed.stale_reason ?? null,
          stale_since_event_id: previousNeed.stale_since_event_id ?? null,
          updated_at: previousNeed.updated_at ?? null,
        })
        .eq("id", needId);
      throw eventError;
    }

    applyNeedPatch(needId, patch);
    setHighlightReviewSection(false);
  }, [applyNeedPatch, createNeedReviewEvent, localNeeds]);

  const handleSendBackToReview = useCallback(async (needId: string) => {
    const previousNeed = localNeeds.find((need) => need.id === needId);
    if (!previousNeed) throw new Error("Need not found.");
    const reviewedAt = new Date().toISOString();
    const patch = {
      dependency_state: "needs_review",
      stale_reason: "Manual review requested",
      last_reviewed_at: reviewedAt,
      updated_at: reviewedAt,
    } satisfies Partial<OdiNeedRow>;

    const { error } = await supabase
      .from("odi_needs")
      .update(patch)
      .eq("id", needId);
    if (error) throw new Error(error.message || "Failed to send need back to review.");

    try {
      await createNeedReviewEvent(
        needId,
        "updated",
        "Manual review requested",
        {
          dependency_state: "needs_review",
          stale_reason: "Manual review requested",
          last_reviewed_at: reviewedAt,
        },
      );
    } catch (eventError) {
      await supabase
        .from("odi_needs")
        .update({
          dependency_state: previousNeed.dependency_state ?? "fresh",
          last_reviewed_at: previousNeed.last_reviewed_at ?? null,
          stale_reason: previousNeed.stale_reason ?? null,
          stale_since_event_id: previousNeed.stale_since_event_id ?? null,
          updated_at: previousNeed.updated_at ?? null,
        })
        .eq("id", needId);
      throw eventError;
    }

    applyNeedPatch(needId, patch);
    setReviewTargetId(needId);
    setHighlightReviewSection(true);
  }, [applyNeedPatch, createNeedReviewEvent, localNeeds]);

  // ── Derived state ───────────────────────────────────────────────────────────

  const isStepActive = !!activeStep;

  function isStepMatch(need: OdiNeedRow): boolean {
    if (!activeStep) return true;
    return need.step_number === activeStep.step_number &&
           need.journey_key === activeStep.journey_key;
  }

  // Stable global rank by score — used for need numbers (#001, #002…)
  const needNumberById = useMemo(() => {
    const sorted = [...initialNeeds].sort((a, b) => {
      const scoreDiff = (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      const impDiff = (b.importance ?? 0) - (a.importance ?? 0);
      if (impDiff !== 0) return impDiff;
      return String(a.id).localeCompare(String(b.id));
    });
    return new Map<string, string>(sorted.map((n, i) => [n.id, String(i + 1).padStart(3, "0")]));
  }, [initialNeeds]);

  // Group by journey_key, sort groups by top opportunity score desc
  const outcomeGroups = useMemo((): OutcomeGroup[] => {
    const map = new Map<string, OdiNeedRow[]>();
    for (const n of localNeeds) {
      const key = (n.journey_key || "other").trim().toLowerCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    }
    return [...map.entries()]
      .map(([key, groupNeeds]) => ({
        key,
        label: labelForJourneyKey(key),
        needs: [...groupNeeds].sort((a, b) => (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0)),
      }))
      .sort((a, b) => {
        const aTop = a.needs[0]?.opportunity_score ?? 0;
        const bTop = b.needs[0]?.opportunity_score ?? 0;
        return bTop - aTop;
      });
  }, [localNeeds]);

  const focusedOppNeed = focusedOpportunityId
    ? localNeeds.find((n) => n.id === focusedOpportunityId) ?? null
    : null;

  // ── Reorder ─────────────────────────────────────────────────────────────────

  const moveNeed = useCallback(async (idxInLocal: number, dir: "up" | "down") => {
    const targetIdx = dir === "up" ? idxInLocal - 1 : idxInLocal + 1;
    if (targetIdx < 0 || targetIdx >= localNeeds.length) return;

    const needA = localNeeds[idxInLocal];
    const needB = localNeeds[targetIdx];
    const sortA = needA.sort_order ?? idxInLocal;
    const sortB = needB.sort_order ?? targetIdx;

    const next = [...localNeeds];
    [next[idxInLocal], next[targetIdx]] = [next[targetIdx], next[idxInLocal]];
    setLocalNeeds(next);
    setReorderingId(needA.id);

    try {
      await Promise.all([
        supabase.from("odi_needs").update({ sort_order: sortB }).eq("id", needA.id),
        supabase.from("odi_needs").update({ sort_order: sortA }).eq("id", needB.id),
      ]);
    } catch {
      setLocalNeeds(initialNeeds);
    } finally {
      setReorderingId(null);
    }
  }, [localNeeds, initialNeeds]);

  // ── Early returns ────────────────────────────────────────────────────────────

  if (loading) return <div className="crpv-ws-placeholder cap">Loading…</div>;
  if (localNeeds.length === 0) return <div className="crpv-ws-placeholder">No needs data yet.</div>;

  const unknowns = deriveUnknowns(localNeeds);
  const showOutcomeList = outcomeGroups.length > 1;

  const activeTensionCount  = localNeeds.filter((n) => deriveNeedRoleLabel(n) === "Active tension").length;
  const emergingGapCount    = localNeeds.filter((n) => deriveNeedRoleLabel(n) === "Emerging gap").length;
  const proofGapCount       = localNeeds.filter((n) => deriveNeedRoleLabel(n) === "Proof gap").length;
  const overInvestedCount   = localNeeds.filter((n) => deriveNeedRoleLabel(n) === "Over-invested").length;

  const needsStateLead = (() => {
    if (activeTensionCount >= 2) return `${activeTensionCount} active tensions shaping the top priorities.`;
    if (activeTensionCount === 1) return "One active tension leading the priority stack.";
    if (emergingGapCount >= 3) return `${emergingGapCount} emerging gaps — customer strategy not yet converged.`;
    if (proofGapCount >= 2) return `${proofGapCount} proof gaps remain — execution confidence still developing.`;
    if (overInvestedCount >= 2) return `${overInvestedCount} areas appear over-invested — review for misalignment.`;
    if (localNeeds.length > 0) return "Customer signal stable — no critical tensions flagged.";
    return null;
  })();

  const needsStateSecondary = (() => {
    if (activeTensionCount >= 1 && overInvestedCount >= 1) return `${overInvestedCount} area${overInvestedCount === 1 ? "" : "s"} over-invested alongside active tensions — priority misalignment possible.`;
    if (proofGapCount >= 1 && activeTensionCount === 0) return `${proofGapCount} proof gap${proofGapCount === 1 ? "" : "s"} — important needs served but not yet validated.`;
    return null;
  })();

  // ── Hierarchy layout ───────────────────────────────────────────────────────
  if (hasHierarchy) {
    const sorted = [...localNeeds].sort((a, b) => (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0));
    const subhead = `${localNeeds.length} ${localNeeds.length === 1 ? "opportunity" : "opportunities"} mapped across your customer job.`;

    const topOpp = sorted[0] ?? null;
    const topScore = topOpp?.opportunity_score ?? 0;
    const tiedCount = sorted.filter((n) => n.opportunity_score === topScore).length;
    const topText = topOpp
      ? (titleMode === "canonical" ? (topOpp.odi_canonical_statement ?? topOpp.desired_outcome) : topOpp.desired_outcome)
      : null;
    const topStateColor = topOpp?.service_state === "underserved" ? D.signal
      : topOpp?.service_state === "overserved" ? D.inkFaint
      : D.inkSoft;

    return (
      <HierarchyPageShell
        eyebrowSegments={["Opportunities"]}
        h1Before="Customer"
        h1Signal="Opportunities"
        subhead={subhead}
        signalBasis={signalBasis}
        compactHero
      >
        {/* TOP OPPORTUNITY — dominant element */}
        {topOpp && (
          <div style={{
            borderLeft: `5px solid ${D.signal}`,
            paddingLeft: 20,
            marginBottom: 52,
          }}>
            <p style={{ fontFamily: D.mono, fontSize: 9, textTransform: "uppercase" as const, letterSpacing: "0.14em", color: D.signal, margin: "0 0 10px" }}>
              Top Opportunity
              {tiedCount > 1 && (
                <span style={{ color: D.inkFaint, marginLeft: 8 }}>— tied with #{String(2).padStart(2, "0")}</span>
              )}
            </p>
            <p style={{ fontFamily: D.sans, fontSize: 26, fontWeight: 700, lineHeight: 1.35, color: D.ink, margin: "0 0 14px", maxWidth: 640 }}>
              {topText}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ fontFamily: D.mono, fontSize: 22, fontWeight: 700, color: D.ink, letterSpacing: "-0.02em" }}>
                {topScore.toFixed(1)}
              </span>
              <span style={{ fontFamily: D.mono, fontSize: 9, textTransform: "uppercase" as const, letterSpacing: "0.12em", color: topStateColor }}>
                {STATE_LABEL[topOpp.service_state] ?? topOpp.service_state}
              </span>
            </div>
          </div>
        )}

        {/* HUMAN | CANONICAL toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 32, fontFamily: D.mono, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          <button
            type="button"
            onClick={() => setTitleMode("human")}
            style={{ background: "none", border: "none", cursor: "pointer", padding: "1px 4px", color: titleMode === "human" ? D.ink : "rgba(17,17,17,0.4)", fontFamily: "inherit", fontSize: "inherit", letterSpacing: "inherit", textTransform: "inherit" }}
          >
            Human
          </button>
          <span style={{ color: D.hairline, alignSelf: "center" }}>|</span>
          <button
            type="button"
            onClick={() => setTitleMode("canonical")}
            style={{ background: "none", border: "none", cursor: "pointer", padding: "1px 4px", color: titleMode === "canonical" ? D.ink : "rgba(17,17,17,0.4)", fontFamily: "inherit", fontSize: "inherit", letterSpacing: "inherit", textTransform: "inherit" }}
          >
            Canonical
          </button>
        </div>

        {/* § 01 OPPORTUNITIES */}
        <HierarchySectionHeader number="01" label="Opportunities" />
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {sorted.map((need, idx) => {
            const text = titleMode === "canonical" ? (need.odi_canonical_statement ?? need.desired_outcome) : need.desired_outcome;
            const stateColor = need.service_state === "underserved" ? D.signal
              : need.service_state === "overserved" ? D.inkFaint
              : D.inkSoft;
            const hierarchyOffStrategy = need.strategy_alignment === "off_strategy";
            return (
              <div key={need.id} style={{ display: "grid", gridTemplateColumns: "60px 1fr auto", alignItems: "start", gap: "0 16px", borderBottom: `1px solid ${D.hairlineFaint}`, padding: "16px 0", opacity: hierarchyOffStrategy ? 0.58 : undefined }}>
                <span style={{ fontFamily: D.mono, fontSize: 36, fontWeight: 700, color: "rgba(17,17,17,0.06)", lineHeight: 1, textAlign: "right", paddingRight: 4 }}>
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <div>
                  <p style={{ fontFamily: D.sans, fontSize: 14, color: D.ink, margin: "4px 0 0", lineHeight: 1.55 }}>
                    {text}
                  </p>
                  {hierarchyOffStrategy && (
                    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                      <span style={{ fontFamily: D.mono, fontSize: 9, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "#999" }}>
                        OFF-STRATEGY · retained by choice
                      </span>
                      {need.strategy_alignment_reason && (
                        <span style={{ fontSize: 11, color: "#aaa", lineHeight: 1.45, fontStyle: "italic" }}>
                          {need.strategy_alignment_reason}
                        </span>
                      )}
                      {onReEvaluate && (
                        <button
                          type="button"
                          disabled={reEvalLoadingId === need.id}
                          onClick={() => onReEvaluate(need.id)}
                          style={{ alignSelf: "flex-start", fontSize: 10, color: reEvalLoadingId === need.id ? "#ccc" : "#999", background: "none", border: "none", cursor: reEvalLoadingId === need.id ? "default" : "pointer", padding: 0, textDecoration: "underline" }}
                        >
                          {reEvalLoadingId === need.id ? "Evaluating…" : "↻ Re-evaluate alignment"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, paddingTop: 4 }}>
                  <span style={{ fontFamily: D.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: stateColor }}>
                    {STATE_LABEL[need.service_state] ?? need.service_state}
                  </span>
                  {typeof need.opportunity_score === "number" && need.opportunity_score > 0 && (
                    <span style={{ fontFamily: D.mono, fontSize: 9, color: "rgba(17,17,17,0.3)", letterSpacing: "0.06em" }}>
                      {need.opportunity_score.toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </HierarchyPageShell>
    );
  }

  // ── Legacy layout ──────────────────────────────────────────────────────────
  return (
    <div className="crpv-ws-section crpv-ws-section-wide">
      {/* Strategic interpretation lead — replaces artifact-first SectionHeader */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <p style={{ fontFamily: "monospace", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9aaba5", margin: 0 }}>
            Tensions shaping customer progress
          </p>
          <span style={{ display: "flex", gap: 2, fontFamily: "monospace", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            <button
              type="button"
              onClick={() => setTitleMode("human")}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "1px 4px", color: titleMode === "human" ? "#1e3340" : "#9aaba5", fontFamily: "inherit", fontSize: "inherit", letterSpacing: "inherit", textTransform: "inherit" }}
            >
              Human
            </button>
            <span style={{ color: "#d0d5da", alignSelf: "center" }}>|</span>
            <button
              type="button"
              onClick={() => setTitleMode("canonical")}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "1px 4px", color: titleMode === "canonical" ? "#1e3340" : "#9aaba5", fontFamily: "inherit", fontSize: "inherit", letterSpacing: "inherit", textTransform: "inherit" }}
            >
              Canonical
            </button>
          </span>
        </div>
        {needsStateLead && (
          <p style={{ fontSize: 15, fontWeight: 400, color: "#1e3340", lineHeight: 1.5, margin: "0 0 4px", letterSpacing: "-0.005em" }}>
            {needsStateLead}
          </p>
        )}
        {needsStateSecondary && (
          <p style={{ fontSize: 12, color: "#6a7e78", margin: 0, lineHeight: 1.5 }}>
            {needsStateSecondary}
          </p>
        )}
      </div>

      {/* Step filter banner */}
      {isStepActive && activeStep && (
        <div className="crpv-ws-needs-ctx">
          <span>
            Exploring needs for: <strong>{activeStep.step_label ?? activeStep.journey_key}</strong>
          </span>
          {onClearStep && (
            <button type="button" className="crpv-ws-needs-ctx-clear" onClick={onClearStep}>
              Clear
            </button>
          )}
        </div>
      )}

      {/* FOCUSING ON banner — opportunity-level focus */}
      {focusedOppNeed && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, background: "#f0f7f5", border: "1px solid #5f9b8c", borderRadius: 3, padding: "8px 12px", marginBottom: 16 }}>
          <span style={{ ...MONO, color: "#5f9b8c", flexShrink: 0, paddingTop: 1 }}>Focusing on</span>
          <span style={{ fontSize: 12, color: "#333", flex: 1, lineHeight: 1.5 }}>
            {titleMode === "canonical" ? (focusedOppNeed.odi_canonical_statement ?? focusedOppNeed.desired_outcome) : focusedOppNeed.desired_outcome}
          </span>
          <button
            type="button"
            onClick={() => setFocusedOpportunityId(null)}
            style={{ fontSize: 11, color: "#888", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Outcomes we may pursue — overview list */}
      {showOutcomeList && (
        <div style={{ marginBottom: 28 }}>
          <p style={{ ...MONO, color: "#999", margin: "0 0 12px" }}>Outcomes we may pursue</p>
          <div style={{ borderTop: "1px solid #f0ede8" }}>
            {outcomeGroups.map((group, i) => {
              const active = focusedOutcome === group.key;
              return (
                <div
                  key={group.key}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "10px 0",
                    borderBottom: "1px solid #f0ede8",
                  }}
                >
                  <span style={{ ...MONO, color: "#ccc", flexShrink: 0, paddingTop: 3, minWidth: 20, textAlign: "right" }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: "0 0 2px", fontSize: 13, color: active ? "#111" : "#444", lineHeight: 1.45, fontWeight: active ? 500 : 400 }}>
                      {group.label}
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: "#bbb" }}>
                      {group.needs.length} {group.needs.length === 1 ? "opportunity" : "opportunities"}
                    </p>
                    {active && (
                      <p style={{ margin: "4px 0 0", fontSize: 11, color: "#5f9b8c" }}>
                        Focusing on this outcome
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setFocusedOutcome(active ? null : group.key)}
                    style={{
                      fontSize: 11,
                      color: active ? "#5f9b8c" : "#888",
                      background: "none",
                      border: active ? "1px solid #5f9b8c" : "none",
                      borderRadius: 3,
                      cursor: "pointer",
                      padding: active ? "2px 8px" : 0,
                      flexShrink: 0,
                      fontWeight: active ? 500 : 400,
                      textDecoration: active ? "none" : "underline",
                    }}
                  >
                    {active ? "Focused" : "Focus"}
                  </button>
                </div>
              );
            })}
          </div>
          {(focusedOutcome || focusedOpportunityId) && (
            <button
              type="button"
              onClick={clearAllFocus}
              style={{ fontSize: 11, color: "#bbb", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", padding: "6px 0 0", display: "block" }}
            >
              Clear all focus
            </button>
          )}
        </div>
      )}

      {/* Unresolved tensions — gaps still active in interpretation */}
      {unknowns.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <p style={{ ...MONO, color: "#c0b6ab", margin: "0 0 14px" }}>
            Active unknowns
          </p>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {unknowns.map((item, i) => (
              <p
                key={i}
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: "#6b6058",
                  lineHeight: 1.7,
                  fontStyle: "italic",
                  paddingTop: i === 0 ? 0 : 10,
                  paddingBottom: 10,
                  borderBottom: i < unknowns.length - 1 ? "1px solid #f0ede8" : "none",
                  opacity: 1 - i * 0.12,
                }}
              >
                {item}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Opportunities grouped under each outcome */}
      {outcomeGroups.map((group) => {
        const outcomeFocused = focusedOutcome !== null;
        const groupDimmed = outcomeFocused && focusedOutcome !== group.key;

        return (
          <div
            key={group.key}
            style={{ marginBottom: 32, opacity: groupDimmed ? 0.7 : 1, transition: "opacity 0.15s" }}
          >
            {/* Outcome group header */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, paddingBottom: 8, borderBottom: "1px solid #f0ede8", marginBottom: 0 }}>
              <span style={{ ...MONO, color: "#aaa" }}>{group.label}</span>
              <span style={{ ...MONO, color: "#ddd" }}>{group.needs.length}</span>
            </div>

            {/* Table header */}
            <div className="crpv-ws-need-table-hd">
              <span className="crpv-ws-need-col-num cap">#</span>
              <span className="crpv-ws-need-col-outcome cap">Opportunity</span>
              <span className="crpv-ws-need-col-scores cap">Scores</span>
              <span className="crpv-ws-need-col-state cap">State</span>
              <span className="crpv-ws-need-col-order" />
            </div>

            {group.needs.map((need) => {
              const idxInLocal = localNeeds.findIndex((n) => n.id === need.id);
              const isMuted = isStepActive && !isStepMatch(need);
              const isHighlighted = isStepActive && isStepMatch(need);
              const isFocused = focusedOpportunityId === need.id;
              const reviewState = needsReviewState(need.dependency_state);

              return (
                <NeedRow
                  key={need.id}
                  need={need}
                  idx={idxInLocal}
                  num={needNumberById.get(need.id) ?? "—"}
                  total={localNeeds.length}
                  reorderingId={reorderingId}
                  titleMode={titleMode}
                  onMove={moveNeed}
                  onScoreChange={updateNeedScores}
                  onInspect={() => openFrame({ kind: "need", objectId: need.id, lens: "overview" })}
                  onFocus={() => setFocusedOpportunityId(isFocused ? null : need.id)}
                  onReEvaluate={onReEvaluate ? () => onReEvaluate(need.id) : undefined}
                  reEvalLoading={reEvalLoadingId === need.id}
                  isMuted={isMuted}
                  isHighlighted={isHighlighted}
                  isFocused={isFocused}
                  reviewState={reviewState}
                />
              );
            })}
          </div>
        );
      })}

      <InspectionShell
        stack={stack}
        onPop={popFrame}
        onClear={() => { clearFrame(); setHighlightReviewSection(false); setReviewTargetId(null); }}
        renderNeed={(frame) => {
          const need = localNeeds.find((n) => n.id === frame.objectId) ?? null;
          const prevFrame = stack.length > 1 ? stack[stack.length - 2] : null;
          const linkedRouteIds = prevFrame?.kind === "route" ? [prevFrame.objectId] : [];
          return (
            <NeedInspectPanel
              key={frame.objectId}
              shellMode
              initialLens={frame.lens}
              onLensChange={updateTopLens}
              open
              onClose={() => { clearFrame(); setHighlightReviewSection(false); setReviewTargetId(null); }}
              need={need}
              routes={routes}
              onInspectRoute={(routeId) => pushFrame({ kind: "route", objectId: routeId, lens: "overview" })}
              currentPhase={currentPhase}
              reviewHighlighted={highlightReviewSection && frame.objectId === reviewTargetId}
              onMarkReviewed={handleMarkReviewed}
              onSendBackToReview={handleSendBackToReview}
              staleNote={
                need && latestExclusionAt && isArtifactStale(need, latestExclusionAt)
                  ? "Needs review after excluded inputs"
                  : null
              }
              linkedRouteIds={linkedRouteIds}
            />
          );
        }}
        renderRoute={(frame) => {
          const route = (routes ?? []).find((r) => r.id === frame.objectId) ?? null;
          const detail: RouteInspectDetail = route ? {
            steps: Array.isArray(route.steps_json) ? (route.steps_json as RouteInspectDetail["steps"]) : [],
            evidence: Array.isArray(route.evidence_json) ? (route.evidence_json as RouteInspectDetail["evidence"]) : [],
            whyThisMatters: Array.isArray(route.why_this_matters_json) ? (route.why_this_matters_json as string[]) : [],
            frameworks: Array.isArray(route.frameworks_used) ? (route.frameworks_used as string[]) : [],
            rankedOpps: [],
          } : { steps: [], evidence: [], whyThisMatters: [], frameworks: [], rankedOpps: [] };
          return (
            <RouteInspectPanel
              key={frame.objectId}
              shellMode
              initialLens={frame.lens}
              onLensChange={updateTopLens}
              open
              onClose={clearFrame}
              route={route}
              detail={route ? detail : null}
              rationale={null}
            />
          );
        }}
      />
    </div>
  );
}
