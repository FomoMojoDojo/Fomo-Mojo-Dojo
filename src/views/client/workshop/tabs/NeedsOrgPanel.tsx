import { useState, useEffect, useMemo, useCallback } from "react";
import type { OdiNeedRow } from "@/hooks/useOdiNeeds";
import type { JobStepRow } from "@/hooks/useJobSteps";
import type { RouteRow } from "@/views/Routes/useRoutes";
import { supabase } from "@/integrations/supabase/client";
import { isArtifactStale } from "@/lib/evidenceImpact";
import { isPrimaryNeedsSourcePath } from "@/lib/evidenceBands";
import NeedInspectPanel from "@/components/needs/NeedInspectPanel";
import { SectionHeader } from "../primitives";
import { getOutcomeFocus, setOutcomeFocus, clearOutcomeFocus } from "@/lib/activeOutcomeFocus";

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
  isMuted,
  isHighlighted,
  isFocused,
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
  isMuted: boolean;
  isHighlighted: boolean;
  isFocused: boolean;
}) {
  const [imp, setImp] = useState(need.importance);
  const [sat, setSat] = useState(need.satisfaction);

  useEffect(() => { setImp(need.importance); setSat(need.satisfaction); }, [need.importance, need.satisfaction]);

  const busy = reorderingId === need.id;

  return (
    <div
      className={`crpv-ws-need-row${busy ? " crpv-ws-need-moving" : ""}${isMuted ? " crpv-ws-need-muted" : ""}${isHighlighted ? " crpv-ws-need-match" : ""}`}
    >
      <span className="crpv-ws-need-num">{num}</span>
      <div className="crpv-ws-need-outcome">
        <span>{need.desired_outcome}</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
          {onFocus && (
            <button
              type="button"
              style={{ fontSize: 10, color: isFocused ? "#5f9b8c" : "#888", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              onClick={onFocus}
            >
              {isFocused ? "Unfocus" : "Focus here"}
            </button>
          )}
          {onInspect && (
            <button type="button" className="crpv-ws-need-inspect-btn" onClick={onInspect}>
              Inspect →
            </button>
          )}
        </div>
      </div>
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
}) {
  const [localNeeds, setLocalNeeds] = useState<OdiNeedRow[]>(initialNeeds);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [inspectNeed, setInspectNeed] = useState<OdiNeedRow | null>(null);
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

  return (
    <div className="crpv-ws-section crpv-ws-section-wide">
      <SectionHeader
        title={`Needs · Organization Signals · ${localNeeds.length} total`}
        desc="What customers need to get done. Use importance and satisfaction scores to surface the biggest opportunities."
      />

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
            {focusedOppNeed.desired_outcome}
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

      {/* What we don't know — supporting context */}
      {unknowns.length > 0 && (
        <div style={{ marginBottom: 28, paddingTop: 16, borderTop: "1px solid #f5f3ef" }}>
          <p style={{ ...MONO, color: "#bbb", margin: "0 0 10px" }}>
            What we don't know yet
          </p>
          <ul style={{ margin: 0, padding: "0 0 0 18px" }}>
            {unknowns.map((item, i) => (
              <li key={i} style={{ fontSize: 13, color: "#555", lineHeight: 1.6, marginBottom: 4 }}>
                {item}
              </li>
            ))}
          </ul>
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

              return (
                <NeedRow
                  key={need.id}
                  need={need}
                  idx={idxInLocal}
                  num={needNumberById.get(need.id) ?? "—"}
                  total={localNeeds.length}
                  reorderingId={reorderingId}
                  onMove={moveNeed}
                  onScoreChange={updateNeedScores}
                  onInspect={() => setInspectNeed(need)}
                  onFocus={() => setFocusedOpportunityId(isFocused ? null : need.id)}
                  isMuted={isMuted}
                  isHighlighted={isHighlighted}
                  isFocused={isFocused}
                />
              );
            })}
          </div>
        );
      })}

      <NeedInspectPanel
        open={!!inspectNeed}
        onClose={() => setInspectNeed(null)}
        need={inspectNeed}
        routes={routes}
        onRouteSelect={onRouteSelect}
        currentPhase={currentPhase}
        staleNote={
          inspectNeed && latestExclusionAt && isArtifactStale(inspectNeed, latestExclusionAt)
            ? "Needs review after excluded inputs"
            : null
        }
      />
    </div>
  );
}
