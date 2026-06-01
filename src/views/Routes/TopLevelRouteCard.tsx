import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import RouteCard from "./RouteCard";
import ClaimStateBadge from "@/components/claims/ClaimStateBadge";
import type { ClaimState } from "@/lib/claimState";
import type { RouteRow } from "./useRoutes";
import type { OpportunityRow } from "@/hooks/useOpportunities";
import type { JobStepRow } from "@/hooks/useJobSteps";
import type { StrategicTension } from "@/lib/tensionTypes";
import type { ClaimRow } from "@/lib/claims/useCompanyClaims";
import { routeDetail } from "./routeDetail";
import type { RouteDecision } from "@/lib/decisionSystem";
import { deriveInitiativeContext, type FocusClassification } from "@/lib/initiativeFocus";

const c = {
  bg:        "#faf7f6",
  panel:     "#FFFFFF",
  line:      "#DDE6D1",
  lineFaint: "#EEF3E9",
  charcoal:  "#233C4B",
  secondary: "#46606D",
  muted:     "#6E847F",
  teal:      "#5F9B8C",
  coral:     "#FF7D2D",
  amber:     "#FAC846",
};

const STATE_ACCENT: Record<string, string> = {
  flow:         c.teal,
  focus:        "#7B61FF",
  diagnose:     c.amber,
  outside_view: c.muted,
};

type WrapCondition = { condition: string; satisfied_flag: boolean; evidence_refs?: string[] };
type WrapAlternative = { alternative_title: string; rejection_reason: string; considered_at?: string };

function WrapDetailPanel({
  alternatives,
  conditions,
  onClose,
  activeTab,
}: {
  alternatives: WrapAlternative[];
  conditions: WrapCondition[];
  onClose: () => void;
  activeTab: "alts" | "conditions";
}) {
  const [tab, setTab] = useState<"alts" | "conditions">(activeTab);
  return (
    <div style={{
      background: c.panel,
      border: `1px solid ${c.line}`,
      borderRadius: 4,
      padding: "16px 20px",
      marginTop: 8,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 16 }}>
          <button
            type="button"
            onClick={() => setTab("alts")}
            style={{
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              fontSize: 9,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: tab === "alts" ? c.charcoal : c.muted,
              fontWeight: tab === "alts" ? 600 : 400,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              borderBottom: tab === "alts" ? `1px solid ${c.charcoal}` : "none",
              paddingBottom: 2,
            }}
          >
            Alternatives considered ({alternatives.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("conditions")}
            style={{
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              fontSize: 9,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: tab === "conditions" ? c.charcoal : c.muted,
              fontWeight: tab === "conditions" ? 600 : 400,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              borderBottom: tab === "conditions" ? `1px solid ${c.charcoal}` : "none",
              paddingBottom: 2,
            }}
          >
            Conditions to meet ({conditions.length})
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 9, color: c.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          ✕ Close
        </button>
      </div>

      {tab === "alts" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {alternatives.length === 0 ? (
            <p style={{ fontSize: 12, color: c.muted }}>No alternatives recorded.</p>
          ) : alternatives.map((a, i) => (
            <div key={i} style={{ paddingLeft: 12, borderLeft: `2px solid ${c.lineFaint}` }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: c.charcoal, margin: 0 }}>{a.alternative_title}</p>
              <p style={{ fontSize: 11, color: c.secondary, margin: "4px 0 0", lineHeight: "1.45" }}>
                Rejected: {a.rejection_reason}
              </p>
            </div>
          ))}
        </div>
      )}

      {tab === "conditions" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {conditions.length === 0 ? (
            <p style={{ fontSize: 12, color: c.muted }}>No conditions recorded.</p>
          ) : conditions.map((cond, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{
                flexShrink: 0,
                width: 14,
                height: 14,
                borderRadius: "50%",
                border: `1.5px solid ${cond.satisfied_flag ? c.teal : c.line}`,
                background: cond.satisfied_flag ? c.teal : "transparent",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 2,
              }}>
                {cond.satisfied_flag && <span style={{ color: "#fff", fontSize: 8 }}>✓</span>}
              </span>
              <p style={{ fontSize: 12, color: cond.satisfied_flag ? c.secondary : c.charcoal, margin: 0, lineHeight: "1.45" }}>
                {cond.condition}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TopLevelRouteCard({
  route,
  legs,
  claimsMap,
  opportunities,
  steps,
  initiativeContext,
  opportunityFocusById,
  routeOutcomeMap,
  routeDecisionMap,
  routeDecisionAttributionMap,
  allTensions,
  selectedRouteId,
  onSelect,
  onInspect,
}: {
  route: RouteRow;
  legs: RouteRow[];
  claimsMap?: Map<string, ClaimRow>;
  opportunities: OpportunityRow[];
  steps: JobStepRow[];
  initiativeContext: ReturnType<typeof deriveInitiativeContext>;
  opportunityFocusById: Map<string, FocusClassification>;
  routeOutcomeMap: Map<string, { statement: string; leadingIndicator: string }>;
  routeDecisionMap: Map<string, RouteDecision>;
  routeDecisionAttributionMap: Map<string, { title: string; decision_state: string }>;
  allTensions: StrategicTension[];
  selectedRouteId?: string | null;
  onSelect?: (route: RouteRow) => void;
  onInspect?: (route: RouteRow) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [wrapOpen, setWrapOpen] = useState(false);
  const [wrapTab, setWrapTab] = useState<"alts" | "conditions">("alts");

  const claimState = route.claim_id
    ? ((claimsMap?.get(route.claim_id)?.state ?? null) as ClaimState | null)
    : null;

  const alternatives = useMemo(
    () => (Array.isArray(route.rejected_alternatives) ? route.rejected_alternatives : []),
    [route.rejected_alternatives],
  );
  const conditions = useMemo(
    () => (Array.isArray(route.what_would_have_to_be_true) ? route.what_would_have_to_be_true : []),
    [route.what_would_have_to_be_true],
  );
  const metConditions = conditions.filter((cond) => cond.satisfied_flag).length;
  const isCommitted = selectedRouteId === route.id || legs.some((l) => l.id === selectedRouteId);
  const isMonitored = claimState === "diagnose" || claimState === "focus" || claimState === "flow";

  const stateAccent = STATE_ACCENT[claimState ?? "outside_view"] ?? c.muted;

  function openWrap(tab: "alts" | "conditions") {
    if (wrapOpen && wrapTab === tab) {
      setWrapOpen(false);
    } else {
      setWrapTab(tab);
      setWrapOpen(true);
    }
  }

  const legDetails = useMemo(
    () =>
      legs.map((leg) => {
        const d = routeDetail({ route: leg, opportunities, steps, initiativeContext, opportunityFocusById });
        const decision = routeDecisionMap.get(leg.id);
        const decisionAttribution = routeDecisionAttributionMap.get(leg.id) ?? null;
        const legTensions = allTensions.filter((t) => t.affected_routes?.includes(leg.id)).slice(0, 2);
        const legClaimId = leg.claim_id ?? null;
        const legClaimState = legClaimId
          ? ((claimsMap?.get(legClaimId)?.state ?? null) as ClaimState | null)
          : null;
        return { leg, d, decision, decisionAttribution, legTensions, legClaimId, legClaimState };
      }),
    [legs, opportunities, steps, initiativeContext, opportunityFocusById, routeDecisionMap, routeDecisionAttributionMap, allTensions, claimsMap],
  );

  return (
    <div style={{
      borderLeft: `3px solid ${stateAccent}`,
      borderBottom: `1px solid ${c.line}`,
      paddingLeft: 0,
      marginBottom: 0,
    }}>
      {/* ── Route header ── */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          width: "100%",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          padding: "16px 20px 12px 20px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h3 style={{ fontSize: 17, fontWeight: 600, color: c.charcoal, margin: 0, lineHeight: "1.2" }}>
              {route.title}
            </h3>
            {claimState && (
              <ClaimStateBadge state={claimState} claimId={route.claim_id ?? ""} size="sm" variant="inline" />
            )}
            <span style={{
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              fontSize: 8.5,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: c.muted,
              opacity: 0.65,
            }}>
              {legs.length} {legs.length === 1 ? "leg" : "legs"}
            </span>
          </div>
          {route.short_description && (
            <p style={{ fontSize: 12, color: c.secondary, marginTop: 4, lineHeight: "1.45", maxWidth: 680 }}>
              {route.short_description}
            </p>
          )}
        </div>
        <span style={{ flexShrink: 0, color: c.muted, paddingTop: 2 }}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {/* ── WRAP indicators ── */}
      <div style={{
        display: "flex",
        gap: 0,
        padding: "0 20px 12px 20px",
        flexWrap: "wrap",
        borderBottom: expanded ? `1px solid ${c.lineFaint}` : "none",
      }}>
        <button
          type="button"
          onClick={() => openWrap("alts")}
          style={{
            display: "flex",
            gap: 6,
            alignItems: "baseline",
            paddingRight: 20,
            background: "none",
            border: "none",
            cursor: alternatives.length > 0 ? "pointer" : "default",
            padding: "4px 20px 4px 0",
          }}
        >
          <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 8.5, textTransform: "uppercase", letterSpacing: "0.12em", color: c.muted, opacity: 0.65 }}>
            Alternatives considered
          </span>
          <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, fontWeight: 600, color: alternatives.length > 0 ? c.charcoal : c.muted }}>
            {alternatives.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => openWrap("conditions")}
          style={{
            display: "flex",
            gap: 6,
            alignItems: "baseline",
            background: "none",
            border: "none",
            cursor: conditions.length > 0 ? "pointer" : "default",
            padding: "4px 20px 4px 0",
          }}
        >
          <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 8.5, textTransform: "uppercase", letterSpacing: "0.12em", color: c.muted, opacity: 0.65 }}>
            Conditions to meet
          </span>
          <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, fontWeight: 600, color: conditions.length > 0 ? c.charcoal : c.muted }}>
            {conditions.length}
            {conditions.length > 0 && metConditions === 0 && (
              <span style={{ fontWeight: 400, color: c.muted, fontSize: 9 }}> (0 met)</span>
            )}
            {conditions.length > 0 && metConditions > 0 && (
              <span style={{ fontWeight: 400, color: c.teal, fontSize: 9 }}> ({metConditions} met)</span>
            )}
          </span>
        </button>

        <div style={{ display: "flex", gap: 6, alignItems: "baseline", padding: "4px 20px 4px 0" }}>
          <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 8.5, textTransform: "uppercase", letterSpacing: "0.12em", color: c.muted, opacity: 0.65 }}>
            Commitment
          </span>
          <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, fontWeight: 600, color: isCommitted ? c.teal : c.muted }}>
            {isCommitted ? "Active" : "Not yet"}
          </span>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "baseline", padding: "4px 20px 4px 0" }}>
          <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 8.5, textTransform: "uppercase", letterSpacing: "0.12em", color: c.muted, opacity: 0.65 }}>
            Monitoring
          </span>
          <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, fontWeight: 600, color: isMonitored ? c.charcoal : c.muted }}>
            {isMonitored ? "Active" : "Not yet"}
          </span>
        </div>
      </div>

      {/* ── WRAP detail panel (conditionally shown) ── */}
      {wrapOpen && (
        <div style={{ padding: "0 20px 12px" }}>
          <WrapDetailPanel
            alternatives={alternatives}
            conditions={conditions}
            onClose={() => setWrapOpen(false)}
            activeTab={wrapTab}
          />
        </div>
      )}

      {/* ── Legs ── */}
      {expanded && (
        <div style={{ paddingLeft: 20 }}>
          {legDetails.length === 0 ? (
            <p style={{ fontSize: 12, color: c.muted, padding: "12px 0" }}>No legs assigned to this route.</p>
          ) : (
            legDetails.map(({ leg, d, decision, legTensions, legClaimId, legClaimState }) => (
              <RouteCard
                key={leg.id}
                route={leg}
                accent={stateAccent}
                steps={d.steps}
                evidence={d.evidence}
                whyThisMatters={d.whyThisMatters}
                frameworks={d.frameworks}
                linkedDesiredOutcome={routeOutcomeMap.get(leg.id) || null}
                focus={d.focus}
                onInspect={onInspect ? () => onInspect(leg) : undefined}
                isSelected={selectedRouteId === leg.id}
                isOtherSelected={!!selectedRouteId && selectedRouteId !== leg.id}
                onSelect={onSelect ? () => onSelect(leg) : undefined}
                commitmentState={decision?.commitmentState}
                sequencingNarrative={decision?.sequencingNarrative ?? null}
                commitmentRationale={decision?.commitmentRationale ?? null}
                routeTensions={legTensions}
                claimId={legClaimId}
                claimState={legClaimState}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
