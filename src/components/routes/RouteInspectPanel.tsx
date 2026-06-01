/**
 * RouteInspectPanel — the canonical object-centric inspection surface for StrategicRoute.
 *
 * Architecture role: Phase 1 of the strategic object graph. This panel treats a route
 * as a first-class reasoning object, not a record to display. Five lens tabs give the
 * user five interpretive frames on the same object without rebuilding the data layer.
 *
 * Ontology integration: uses LensType + LENS_SUPPORTED_OBJECTS from strategicObjects.ts.
 * The "overview" tab is a panel-specific default state, not a formal LensType.
 *
 * Transitional constraint: coexists with existing RouteCard and Routes page.
 * The old RouteInspectPanel (src/views/Routes/RouteInspectPanel.tsx) is preserved
 * but superseded by this file.
 */

import { useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { RouteRow, RouteAssumption } from "@/views/Routes/useRoutes";
import type { OpportunityRow } from "@/hooks/useOpportunities";
import type { OdiNeedRow } from "@/hooks/useOdiNeeds";
import type { RouteRationale } from "@/lib/routeRationale";
import {
  generationContextLabel,
  routeSignalTiers,
  type TierCellData,
} from "@/lib/strategicObject";
import { displayConfidenceLabel } from "@/lib/strategicLanguage";
import { gateInsight, parseGateScores } from "@/lib/routeInsights";
import {
  LENS_TYPES,
  isLensCompatible,
  type LensType,
} from "@/lib/strategicObjects";
import type { StrategyCascade, PositioningCanvas } from "@/lib/types";
import { deriveRouteAlignsWithDirection } from "@/lib/strategicObjectRelationships";
import {
  buildRoutePositioningImplication,
  type CoherenceSignal,
} from "@/lib/positioningLensNarrative";
import {
  deriveRouteCustomerImplication,
  type FrictionKind,
} from "@/lib/customerRealityNarrative";
import type { RouteDecision, CommitmentState } from "@/lib/decisionSystem";

// ─── Design tokens ──────────────────────────────────────────────────────────────

const c = {
  bg:          "#F7FBF8",
  surface:     "#FFFFFF",
  charcoal:    "#233C4B",
  secondary:   "#46606D",
  muted:       "#6E847F",
  ink:         "#1A2E38",
  line:        "#DDE6D1",
  lineFaint:   "#EEF3E9",
  coral:       "#FF7D2D",
  amber:       "#FAC846",
  teal:        "#5F9B8C",
  tealDim:     "#5F9B8C40",
  coralDim:    "#FF7D2D1A",
  amberDim:    "#FAC84618",
};

const MONO = '"JetBrains Mono", ui-monospace, "SFMono-Regular", monospace';

function accentFor(category: string): string {
  if (category === "fix")     return c.coral;
  if (category === "improve") return c.amber;
  return c.teal;
}

// ─── Shared primitive components ───────────────────────────────────────────────

function Mono({ children, size = 10, color = c.muted, bold = false }: {
  children: React.ReactNode;
  size?: number;
  color?: string;
  bold?: boolean;
}) {
  return (
    <span style={{
      fontFamily: MONO, fontSize: size,
      textTransform: "uppercase", letterSpacing: "0.10em",
      color, fontWeight: bold ? 600 : 400,
    }}>
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p style={{ margin: "0 0 8px", fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.12em", color: c.muted, opacity: 0.68 }}>
      {children}
    </p>
  );
}

function Divider({ margin = "0" }: { margin?: string }) {
  return <div style={{ borderTop: `1px solid ${c.line}`, margin }} />;
}

function Bullet({ text, accent = c.secondary }: { text: string; accent?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
      <span style={{ color: c.muted, flexShrink: 0, marginTop: 1, fontSize: 14 }}>·</span>
      <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, lineHeight: 1.6, color: accent }}>
        {text}
      </span>
    </div>
  );
}

function StatusDot({ status }: { status: "complete" | "in_progress" | "missing" }) {
  const color = status === "complete" ? c.teal : status === "in_progress" ? c.amber : c.coral;
  const glyph = status === "complete" ? "◉" : status === "in_progress" ? "◎" : "○";
  return <span style={{ color, fontSize: 11, flexShrink: 0 }}>{glyph}</span>;
}

// ─── Inspection tab type ────────────────────────────────────────────────────────

// "overview" is a panel-specific default landing state — not a formal LensType.
// The other tabs correspond to canonical LensType values from strategicObjects.ts.
type InspectTab = "overview" | Extract<LensType, "customer_reality" | "positioning" | "evidence" | "validation">;

const TABS: { id: InspectTab; label: string }[] = [
  { id: "overview",         label: "Overview" },
  { id: "customer_reality", label: "Customer Reality" },
  { id: "positioning",      label: "Positioning" },
  { id: "evidence",         label: "Evidence" },
  { id: "validation",       label: "Validation" },
];

// Validate that the non-overview tabs are real LensType values.
// This is a compile-time guard — if LensType changes, this will error.
const _lensTabCheck = TABS.slice(1).map(t => {
  const _: LensType = t.id as LensType;
  return _;
});
void _lensTabCheck;

// ─── Panel-level data shape ─────────────────────────────────────────────────────

export type RouteInspectDetail = {
  steps: { id: string; title: string; status: "complete" | "in_progress" | "missing" }[];
  evidence: { id: string; title: string; status: "complete" | "in_progress" | "missing" }[];
  whyThisMatters: string[];
  frameworks: string[];
  rankedOpps: OpportunityRow[];
};

export type RouteInspectPanelProps = {
  open: boolean;
  onClose: () => void;
  route: RouteRow | null;
  /** Pre-computed from routeDetail() at the page level. */
  detail: RouteInspectDetail | null;
  /**
   * Pre-computed from buildRouteRationales(). Optional — panel degrades gracefully
   * when rationale is unavailable (e.g., hypotheses not loaded on that page).
   */
  rationale: RouteRationale | null;
  linkedDesiredOutcome?: { statement: string; leadingIndicator: string } | null;
  staleNote?: string | null;
  currentPhase?: string;
  areaScoresJson?: unknown;
  /** When true, the panel renders its body only — the Sheet is owned by InspectionShell. */
  shellMode?: boolean;
  /** Starting lens tab; respected only on first mount (use key prop to remount on object change). */
  initialLens?: string;
  /** Fires when the user switches lens tabs — used by InspectionShell to preserve lens in the stack frame. */
  onLensChange?: (lens: string) => void;
  /** Customer Reality opp chips become traversal buttons when this is provided. */
  onInspectNeed?: (needId: string) => void;
  /** Pool of needs to match against opp outcome strings for traversal. */
  linkedNeeds?: OdiNeedRow[];
  /** Fires when user clicks "Strategic direction →" in the Overview — navigates up to StrategicDirectionInspectPanel. */
  onInspectDirection?: () => void;
  /** Strategy cascade — when provided, enables alignment-aware copy in the direction section. */
  cascade?: StrategyCascade | null;
  /** Positioning canvas — when provided, enables coherence signal in the Positioning lens. */
  positioning?: PositioningCanvas | null;
  /** Decision portfolio entry for this route — commitment state, sequencing, escalations. */
  routeDecision?: RouteDecision | null;
};

// ─── Confidence and readiness rendering ────────────────────────────────────────

function readinessColor(readiness: string): string {
  if (readiness === "Commit")      return c.teal;
  if (readiness === "Validate")    return c.amber;
  if (readiness === "Investigate") return c.secondary;
  return c.coral; // Hold
}

function ReadinessBadge({ readiness }: { readiness: string }) {
  const color = readinessColor(readiness);
  return (
    <span style={{
      fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em",
      color, background: `${color}18`, border: `1px solid ${color}50`,
      borderRadius: 4, padding: "2px 7px",
    }}>
      {readiness}
    </span>
  );
}

// ─── Source tier grid ───────────────────────────────────────────────────────────

function TierGrid({ tiers }: { tiers: TierCellData[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
      {tiers.map((tier) => (
        <div key={tier.tier} style={{
          padding: "7px 10px",
          borderRadius: 6,
          border: `1px solid ${tier.present ? c.teal : c.line}`,
          background: tier.present ? `${c.teal}0A` : c.bg,
        }}>
          <div style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.10em", color: tier.present ? c.teal : c.muted }}>
            {tier.present ? "✓" : "—"}&nbsp;&nbsp;{tier.label}
          </div>
          {tier.detail && (
            <p style={{ margin: "3px 0 0", fontFamily: "Inter, sans-serif", fontSize: 11, color: c.secondary, lineHeight: 1.4 }}>
              {tier.detail}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Decision section ─────────────────────────────────────────────────────────

function commitmentColor(state: CommitmentState): string {
  if (state === "commit" || state === "scale") return c.teal;
  if (state === "validate" || state === "pause") return c.amber;
  if (state === "unwind") return c.coral;
  return c.secondary; // explore
}

const COMMITMENT_LABEL: Record<CommitmentState, string> = {
  explore:  "Not yet warranted",
  validate: "Validating",
  commit:   "Holding",
  scale:    "Holding",
  pause:    "Fragile",
  unwind:   "Remains blocked",
};

function lifecycleColor(state: string): string {
  if (state === "committed" || state === "advancing") return c.teal;
  if (state === "validating" || state === "gated" || state === "stalled") return c.amber;
  if (state === "re-evaluating" || state === "de-escalating") return c.coral;
  return c.secondary; // exploring
}

function DecisionSection({ decision }: { decision: RouteDecision }) {
  const stateColor = commitmentColor(decision.commitmentState);
  const lcColor = lifecycleColor(decision.lifecycleState);
  const showLifecycle =
    decision.lifecycleState !== "exploring" &&
    decision.lifecycleState !== "validating";

  return (
    <div>
      <SectionLabel>Commitment posture</SectionLabel>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{
          fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em",
          color: stateColor, background: `${stateColor}18`, border: `1px solid ${stateColor}50`,
          borderRadius: 4, padding: "2px 7px",
        }}>
          {COMMITMENT_LABEL[decision.commitmentState]}
        </span>
        {showLifecycle && (
          <span style={{
            fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em",
            color: lcColor, background: `${lcColor}12`, border: `1px solid ${lcColor}40`,
            borderRadius: 4, padding: "2px 7px",
          }}>
            {decision.lifecycleLabel}
          </span>
        )}
      </div>
      <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 12.5, lineHeight: 1.55, color: c.secondary }}>
        {decision.commitmentRationale}
      </p>

      {decision.reviewPressure.warranted && decision.reviewPressure.note && (
        <>
          <Divider />
          <p style={{
            margin: 0, fontFamily: "Inter, sans-serif", fontSize: 12, color: c.amber,
            lineHeight: 1.5, paddingLeft: 10, borderLeft: `2px solid ${c.amber}`,
          }}>
            {decision.reviewPressure.note}
          </p>
        </>
      )}

      {(decision.sequencingNarrative || decision.prerequisiteRouteIds.length > 0 || decision.enabledRouteIds.length > 0) && (
        <>
          <Divider />
          <SectionLabel>Sequencing</SectionLabel>
          <p style={{ margin: "0 0 6px", fontFamily: "Inter, sans-serif", fontSize: 12.5, lineHeight: 1.55, color: c.secondary }}>
            {decision.sequencingNarrative}
          </p>
          {decision.blockedReason && (
            <p style={{ margin: "6px 0 0", fontFamily: "Inter, sans-serif", fontSize: 12, color: c.coral, lineHeight: 1.5 }}>
              {decision.blockedReason}
            </p>
          )}
          {decision.prerequisiteRouteIds.length > 0 && (
            <p style={{ margin: "6px 0 0", fontFamily: "Inter, sans-serif", fontSize: 11.5, color: c.muted, lineHeight: 1.4 }}>
              <span style={{ fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.08em" }}>Needs first: </span>
              {decision.prerequisiteRouteIds.length} route{decision.prerequisiteRouteIds.length > 1 ? "s" : ""} should reach commitment before this one.
            </p>
          )}
          {decision.enabledRouteIds.length > 0 && (
            <p style={{ margin: "4px 0 0", fontFamily: "Inter, sans-serif", fontSize: 11.5, color: c.muted, lineHeight: 1.4 }}>
              <span style={{ fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.08em" }}>Unlocks: </span>
              {decision.enabledRouteIds.length} route{decision.enabledRouteIds.length > 1 ? "s" : ""} become safer once this is committed.
            </p>
          )}
        </>
      )}

      {decision.escalationNote && (
        <>
          <Divider />
          <p style={{
            margin: 0, fontFamily: "Inter, sans-serif", fontSize: 12, color: c.coral,
            lineHeight: 1.5, paddingLeft: 10, borderLeft: `2px solid ${c.coral}`,
          }}>
            {decision.escalationNote}
          </p>
        </>
      )}
    </div>
  );
}

// ─── Lens: Overview ─────────────────────────────────────────────────────────────

function OverviewLens({
  route,
  detail,
  rationale,
  linkedDesiredOutcome,
  areaScoresJson,
  onInspectDirection,
  cascade,
  routeDecision,
}: {
  route: RouteRow;
  detail: RouteInspectDetail;
  rationale: RouteRationale | null;
  linkedDesiredOutcome?: { statement: string; leadingIndicator: string } | null;
  areaScoresJson?: unknown;
  onInspectDirection?: () => void;
  cascade?: StrategyCascade | null;
  routeDecision?: RouteDecision | null;
}) {
  const accent = accentFor(String(route.category));
  const category = String(route.category || "improve").toLowerCase();
  const alignRel = deriveRouteAlignsWithDirection(route, cascade ?? null, route.company_id);

  // Narrative fields — prefer rich rationale, fall back to stored/computed detail
  const whyExists = rationale?.whyThisRouteExists || detail.whyThisMatters[0] || "This route addresses a meaningful strategic gap.";
  const uncertainty = rationale?.uncertainty || null;
  const readiness   = rationale?.readiness || null;
  const confidenceLabel = rationale?.confidenceLabel || null;
  const readinessMeaning = rationale?.readinessMeaning || null;
  const genContext = generationContextLabel(detail.frameworks, route.id);

  // "What would move this" — gate insight from area scores, or rationale fallback
  const gates = parseGateScores(areaScoresJson);
  const insight = gates ? gateInsight(category, gates) : null;
  const couldWeaken = rationale?.couldWeaken || null;

  return (
    <div style={{ padding: "14px 20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Confidence posture */}
      {(readiness || confidenceLabel) && (
        <div>
          <SectionLabel>Confidence posture</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            {readiness && <ReadinessBadge readiness={readiness} />}
            {confidenceLabel && (
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: c.secondary }}>
                {displayConfidenceLabel(confidenceLabel)}
              </span>
            )}
          </div>
          {readinessMeaning && (
            <p style={{ margin: "7px 0 0", fontFamily: "Inter, sans-serif", fontSize: 12, color: c.muted, lineHeight: 1.5 }}>
              {readinessMeaning}
            </p>
          )}
        </div>
      )}

      <Divider />

      {/* Why this route exists */}
      <div>
        <SectionLabel>Why this route was surfaced</SectionLabel>
        <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 13, lineHeight: 1.65, color: c.secondary }}>
          {whyExists}
        </p>
        {linkedDesiredOutcome?.statement && (
          <p style={{ margin: "8px 0 0", fontFamily: "Inter, sans-serif", fontSize: 12, color: c.muted, lineHeight: 1.5 }}>
            <span style={{ fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.08em" }}>Linked outcome: </span>
            {linkedDesiredOutcome.statement}
          </p>
        )}
        <p style={{ margin: "8px 0 0", fontFamily: MONO, fontSize: 9.5, color: c.muted, textTransform: "uppercase", letterSpacing: "0.08em", lineHeight: 1.4 }}>
          {genContext}
        </p>
      </div>

      {/* What's still uncertain */}
      {uncertainty && (
        <>
          <Divider />
          <div>
            <SectionLabel>What is still uncertain</SectionLabel>
            <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 13, lineHeight: 1.65, color: c.secondary }}>
              {uncertainty}
            </p>
          </div>
        </>
      )}

      {/* Steps progress compact */}
      {detail.steps.length > 0 && (
        <>
          <Divider />
          <div>
            <SectionLabel>Steps</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {detail.steps.slice(0, 4).map((step) => (
                <div key={step.id} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <StatusDot status={step.status} />
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, lineHeight: 1.5, color: c.secondary }}>
                    {step.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* What would move this */}
      {(insight || couldWeaken) && (
        <>
          <Divider />
          <div>
            <SectionLabel>What would move this</SectionLabel>
            {insight && (
              <>
                <p style={{ margin: "0 0 6px", fontFamily: "Inter, sans-serif", fontSize: 13, color: c.secondary }}>
                  {insight.sentence}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {insight.bullets.map((b, i) => <Bullet key={i} text={b} />)}
                </div>
              </>
            )}
            {!insight && couldWeaken && (
              <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 13, lineHeight: 1.6, color: c.secondary }}>
                {couldWeaken}
              </p>
            )}
          </div>
        </>
      )}

      {!readiness && !confidenceLabel && !insight && (
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: c.muted, fontStyle: "italic" }}>
          Run scoring to see what would change this recommendation.
        </p>
      )}

      {/* Strategic direction — alignment-aware */}
      {onInspectDirection && (
        <>
          <Divider />
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: c.muted, lineHeight: 1.5 }}>
              {alignRel?.strength === "high"
                ? "This route was generated from your strategic direction."
                : alignRel?.strength === "medium"
                ? "This route's themes align with your strategic direction."
                : "This route still needs strategic fit validation."}
            </span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onInspectDirection(); }}
              style={{
                fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.08em",
                color: c.teal, background: "none", border: "none", cursor: "pointer",
                padding: 0, textDecoration: "underline", flexShrink: 0,
              }}
            >
              Strategic direction →
            </button>
          </div>
        </>
      )}

      {/* Decision posture */}
      {routeDecision && (
        <>
          <Divider />
          <DecisionSection decision={routeDecision} />
        </>
      )}
    </div>
  );
}

// ─── Lens: Customer Reality ─────────────────────────────────────────────────────

function frictionBadgeStyle(kind: FrictionKind): React.CSSProperties {
  const base: React.CSSProperties = {
    fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em",
    borderRadius: 4, padding: "2px 7px", border: "1px solid",
  };
  if (kind === "customer")          return { ...base, color: c.teal,  backgroundColor: `${c.teal}14`,  borderColor: `${c.teal}50` };
  if (kind === "strategic")         return { ...base, color: c.amber, backgroundColor: `${c.amberDim}`, borderColor: `${c.amber}50` };
  if (kind === "market_perception") return { ...base, color: c.teal,  backgroundColor: `${c.tealDim}`,  borderColor: `${c.teal}40` };
  return { ...base, color: c.muted, backgroundColor: `${c.muted}10`, borderColor: `${c.muted}40` }; // operational
}

function CustomerRealityLens({
  route,
  detail,
  rationale,
  linkedNeeds,
  onInspectNeed,
}: {
  route: RouteRow;
  detail: RouteInspectDetail;
  rationale: RouteRationale | null;
  linkedNeeds?: OdiNeedRow[];
  onInspectNeed?: (needId: string) => void;
}) {
  const opps = detail.rankedOpps.slice(0, 4);
  const supportShape = rationale?.supportShape;

  const implication = deriveRouteCustomerImplication(route, opps, linkedNeeds ?? []);

  // Build outcome → need map for traversal
  const needByOutcome = new Map(
    (linkedNeeds ?? []).filter((n) => n.desired_outcome).map((n) => [n.desired_outcome, n]),
  );

  return (
    <div style={{ padding: "14px 20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Friction kind + behavior targeted */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={frictionBadgeStyle(implication.frictionKind)}>
            {implication.frictionLabel}
          </span>
          {implication.behaviorValidated && (
            <span style={{
              fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em",
              color: c.teal, backgroundColor: `${c.teal}14`, border: `1px solid ${c.teal}50`,
              borderRadius: 4, padding: "2px 7px",
            }}>
              Validated
            </span>
          )}
        </div>
        <p style={{ margin: "0 0 6px", fontFamily: "Inter, sans-serif", fontSize: 13, lineHeight: 1.6, color: c.secondary }}>
          {implication.behaviorTargeted}
        </p>
        <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 12, color: c.muted }}>
          {implication.evidenceNote}
        </p>
      </div>

      {/* Customer uncertainty */}
      {implication.customerUncertainty && (
        <>
          <Divider />
          <div>
            <SectionLabel>Customer uncertainty</SectionLabel>
            <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 13, lineHeight: 1.65, color: c.coral }}>
              {implication.customerUncertainty}
            </p>
          </div>
        </>
      )}

      {/* Signal distribution (from rationale) */}
      {supportShape && (
        <>
          <Divider />
          <div>
            <SectionLabel>Signal distribution</SectionLabel>
            <div style={{ display: "flex", gap: 16 }}>
              {[
                { label: "Outside", value: supportShape.outside },
                { label: "Org", value: supportShape.organization },
                { label: "Customer", value: supportShape.customer },
              ].map(({ label, value }) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 600, color: value > 0 ? c.teal : c.muted }}>
                    {Math.round(value * 10) / 10}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.10em", color: c.muted, marginTop: 2 }}>
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Opportunity signals + navigation */}
      {opps.length > 0 && (
        <>
          <Divider />
          <div>
            <SectionLabel>
              {`${opps.length} linked customer signal${opps.length !== 1 ? "s" : ""}`}
            </SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {opps.map((opp) => {
                const score = opp.opportunity_score ?? 0;
                const isHighGap = score >= 10;
                const isOverServed = (opp.importance ?? 5) <= 4 && (opp.satisfaction ?? 5) >= 8;
                const matchedNeed = opp.outcome ? needByOutcome.get(opp.outcome) : undefined;
                const canTraverse = !!matchedNeed && !!onInspectNeed;
                return (
                  <div key={opp.id} style={{
                    padding: "9px 11px", borderRadius: 7,
                    border: `1px solid ${isHighGap ? `${c.teal}50` : c.lineFaint}`,
                    background: isHighGap ? `${c.teal}06` : c.surface,
                  }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                      <p style={{ margin: "0 0 4px", fontFamily: "Inter, sans-serif", fontSize: 12.5, lineHeight: 1.5, color: c.charcoal, flex: 1 }}>
                        {opp.outcome}
                      </p>
                      {canTraverse && (
                        <button
                          type="button"
                          onClick={() => onInspectNeed!(matchedNeed!.id)}
                          style={{
                            fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase",
                            letterSpacing: "0.08em", color: c.muted,
                            background: "none", border: "none", cursor: "pointer",
                            padding: "0 0 0 8px", textDecoration: "underline", flexShrink: 0,
                          }}
                        >
                          Inspect →
                        </button>
                      )}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                      {opp.step_label && <Mono size={9.5} color={c.muted}>{opp.step_label}</Mono>}
                      <Mono size={9.5} color={isHighGap ? c.teal : c.muted} bold={isHighGap}>
                        {isOverServed ? "over-served" : isHighGap ? "high-priority gap" : `signal strength: ${Math.round(score)}`}
                      </Mono>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* What supports it */}
      {rationale?.whatSupportsIt && (
        <>
          <Divider />
          <div>
            <SectionLabel>What supports this route</SectionLabel>
            <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 13, lineHeight: 1.65, color: c.secondary }}>
              {rationale.whatSupportsIt}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Lens: Positioning ──────────────────────────────────────────────────────────

function coherenceBadgeStyle(signal: CoherenceSignal): React.CSSProperties {
  const base: React.CSSProperties = {
    fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em",
    borderRadius: 4, padding: "2px 7px", border: "1px solid",
  };
  if (signal === "reinforces") return { ...base, color: c.teal,  backgroundColor: `${c.teal}14`,  borderColor: `${c.teal}50` };
  if (signal === "weakens")    return { ...base, color: c.coral, backgroundColor: `${c.coralDim}`, borderColor: `${c.coral}50` };
  if (signal === "mixed")      return { ...base, color: c.amber, backgroundColor: `${c.amberDim}`, borderColor: `${c.amber}50` };
  return { ...base, color: c.muted, backgroundColor: `${c.muted}10`, borderColor: `${c.muted}40` };
}

function PositioningLens({
  route,
  detail,
  rationale,
  cascade,
  positioning,
}: {
  route: RouteRow;
  detail: RouteInspectDetail;
  rationale: RouteRationale | null;
  cascade: StrategyCascade | null;
  positioning: PositioningCanvas | null;
}) {
  const category = String(route.category || "improve").toLowerCase();
  const accent = accentFor(category);
  const genContext = generationContextLabel(detail.frameworks, route.id);

  const hasNonMissingEvidence = detail.evidence.some((e) => e.status !== "missing");
  const hasCompleteEvidence   = detail.evidence.some((e) => e.status === "complete");
  const hasCustomerEvidence   = detail.rankedOpps.length > 0;

  const tiers = routeSignalTiers({
    frameworksUsed: detail.frameworks,
    hasNonMissingEvidence,
    hasCompleteEvidence,
    hasCustomerEvidence,
  });

  const implication = buildRoutePositioningImplication(route, positioning, cascade);

  const tensionFraming: Record<string, string> = {
    fix: "This route addresses a known execution gap — the current position cannot hold without closing it.",
    improve: "This route strengthens an existing capability. Competitors with similar offerings may be investing in the same area.",
    create: "This route opens a new capability or market position. It requires proof that the market will reward the investment.",
  };

  return (
    <div style={{ padding: "14px 20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Route posture in positioning terms */}
      <div>
        <SectionLabel>Positioning posture</SectionLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{
            fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em",
            color: accent, background: `${accent}14`, border: `1px solid ${accent}50`,
            borderRadius: 4, padding: "2px 7px",
          }}>
            {category.charAt(0).toUpperCase() + category.slice(1)}
          </span>
          {positioning && (
            <span style={coherenceBadgeStyle(implication.coherenceSignal)}>
              {implication.displayLabel}
            </span>
          )}
        </div>
        <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 13, lineHeight: 1.65, color: c.secondary }}>
          {tensionFraming[category] ?? tensionFraming.improve}
        </p>
      </div>

      {/* What this route claims */}
      {positioning && (
        <>
          <Divider />
          <div>
            <SectionLabel>What this route claims</SectionLabel>
            <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 13, lineHeight: 1.65, color: c.secondary }}>
              {implication.claimReinforced}
            </p>
            {implication.tensionNavigated && (
              <p style={{ margin: "8px 0 0", fontFamily: "Inter, sans-serif", fontSize: 12.5, lineHeight: 1.5, color: c.coral }}>
                {implication.tensionNavigated}
              </p>
            )}
          </div>
        </>
      )}

      <Divider />

      {/* Source signal layer grid */}
      <div>
        <SectionLabel>Source signal layers</SectionLabel>
        <TierGrid tiers={tiers} />
        <p style={{ margin: "8px 0 0", fontFamily: MONO, fontSize: 9.5, color: c.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {genContext}
        </p>
      </div>

      {/* Supporting evidence summary for positioning context */}
      {rationale?.supportingEvidenceLines && rationale.supportingEvidenceLines.length > 0 && (
        <>
          <Divider />
          <div>
            <SectionLabel>Supporting signals</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {rationale.supportingEvidenceLines.slice(0, 3).map((line, i) => (
                <Bullet key={i} text={line} />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Existing whyThisRouteExists from rationale (when no positioning canvas available) */}
      {!positioning && rationale?.whyThisRouteExists && (
        <>
          <Divider />
          <div>
            <SectionLabel>Why this route exists</SectionLabel>
            <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 13, lineHeight: 1.65, color: c.secondary }}>
              {rationale.whyThisRouteExists}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Lens: Evidence ─────────────────────────────────────────────────────────────

function EvidenceLens({
  detail,
  rationale,
}: {
  detail: RouteInspectDetail;
  rationale: RouteRationale | null;
}) {
  const [expanded, setExpanded] = useState(false);

  const supporting  = detail.evidence.filter((e) => e.status !== "missing");
  const missing     = detail.evidence.filter((e) => e.status === "missing");
  const weakening   = rationale?.weakeningEvidenceLines ?? [];
  const supportLines = rationale?.supportingEvidenceLines ?? [];

  return (
    <div style={{ padding: "14px 20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Evidence summary counts */}
      <div>
        <SectionLabel>Evidence overview</SectionLabel>
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 600, color: supporting.length > 0 ? c.teal : c.muted }}>
              {supporting.length}
            </div>
            <Mono size={9} color={c.muted}>Supporting</Mono>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 600, color: weakening.length > 0 ? c.coral : c.muted }}>
              {weakening.length}
            </div>
            <Mono size={9} color={c.muted}>Weakening</Mono>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 600, color: missing.length > 0 ? c.amber : c.muted }}>
              {missing.length}
            </div>
            <Mono size={9} color={c.muted}>Missing</Mono>
          </div>
        </div>
      </div>

      {/* Supporting evidence */}
      {(supporting.length > 0 || supportLines.length > 0) && (
        <>
          <Divider />
          <div>
            <SectionLabel>Supporting evidence</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(expanded ? supporting : supporting.slice(0, 3)).map((item) => (
                <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <StatusDot status={item.status} />
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, lineHeight: 1.5, color: c.secondary }}>
                    {item.title}
                  </span>
                </div>
              ))}
              {!expanded && supporting.length > 3 && (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  style={{ fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em", color: c.muted, background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
                >
                  + {supporting.length - 3} more
                </button>
              )}
            </div>
            {supportLines.length > 0 && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
                {supportLines.slice(0, expanded ? supportLines.length : 2).map((line, i) => (
                  <Bullet key={i} text={line} />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Weakening evidence */}
      {weakening.length > 0 && (
        <>
          <Divider />
          <div>
            <SectionLabel>Weakening signals</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {weakening.map((line, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ color: c.coral, fontSize: 11, flexShrink: 0 }}>◌</span>
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, lineHeight: 1.5, color: c.secondary }}>
                    {line}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Missing evidence */}
      <Divider />
      <div>
        <SectionLabel>Needs attention</SectionLabel>
        {missing.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {missing.map((item) => (
              <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <span style={{ color: c.coral, fontSize: 11, flexShrink: 0 }}>○</span>
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, lineHeight: 1.5, color: c.secondary }}>
                  {item.title}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 13, color: c.muted, fontStyle: "italic" }}>
            No evidence gaps flagged for this route.
          </p>
        )}
      </div>

      {(supporting.length === 0 && missing.length === 0 && weakening.length === 0) && (
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: c.muted, fontStyle: "italic" }}>
          No evidence data available yet. Upload supporting documents to populate this section.
        </p>
      )}
    </div>
  );
}

// ─── Lens: Validation ───────────────────────────────────────────────────────────

function ValidationLens({
  route,
  rationale,
}: {
  route: RouteRow;
  rationale: RouteRationale | null;
}) {
  const [expanded, setExpanded] = useState(false);

  const assumptions: RouteAssumption[] = Array.isArray(route.assumptions_json)
    ? route.assumptions_json
    : [];

  const criticalAssumptions = assumptions.filter((a) => a.critical);
  const otherAssumptions    = assumptions.filter((a) => !a.critical);
  const displayAssumptions  = expanded ? assumptions : (criticalAssumptions.length > 0 ? criticalAssumptions : assumptions.slice(0, 3));

  function assumptionStatusColor(status: RouteAssumption["status"]): string {
    if (status === "supported") return c.teal;
    if (status === "partial")   return c.amber;
    return c.coral;
  }

  function assumptionStatusLabel(status: RouteAssumption["status"]): string {
    if (status === "supported") return "Supported";
    if (status === "partial")   return "Partial";
    return "Unproven";
  }

  return (
    <div style={{ padding: "14px 20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Must become true */}
      {rationale?.mustBecomeTrue && (
        <div>
          <SectionLabel>What must become true</SectionLabel>
          <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 13, lineHeight: 1.65, color: c.secondary }}>
            {rationale.mustBecomeTrue}
          </p>
        </div>
      )}

      {/* Assumptions list */}
      <Divider />
      <div>
        <SectionLabel>
          {assumptions.length > 0
            ? `${assumptions.length} assumption${assumptions.length !== 1 ? "s" : ""}${criticalAssumptions.length > 0 ? ` — ${criticalAssumptions.length} critical` : ""}`
            : "Assumptions"}
        </SectionLabel>

        {assumptions.length > 0 ? (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {displayAssumptions.map((assumption) => {
                const statusColor = assumptionStatusColor(assumption.status);
                return (
                  <div key={assumption.id} style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: `1px solid ${assumption.critical ? `${c.coral}40` : c.lineFaint}`,
                    background: assumption.critical ? `${c.coral}06` : c.surface,
                  }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                      <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 12.5, lineHeight: 1.55, color: c.charcoal, flex: 1 }}>
                        {assumption.statement}
                      </p>
                      <span style={{
                        fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em",
                        color: statusColor, background: `${statusColor}18`, border: `1px solid ${statusColor}50`,
                        borderRadius: 3, padding: "2px 5px", flexShrink: 0,
                      }}>
                        {assumptionStatusLabel(assumption.status)}
                      </span>
                    </div>
                    {assumption.critical && (
                      <p style={{ margin: "5px 0 0", fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: c.coral }}>
                        Critical — route depends on this
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            {!expanded && (criticalAssumptions.length > 0 ? otherAssumptions.length > 0 : assumptions.length > 3) && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                style={{ marginTop: 8, fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em", color: c.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                Show all {assumptions.length} assumptions
              </button>
            )}
          </>
        ) : (
          <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 13, color: c.muted, fontStyle: "italic" }}>
            No assumptions recorded yet. Run analysis to surface what needs to be validated.
          </p>
        )}
      </div>

      {/* Could weaken */}
      {rationale?.couldWeaken && (
        <>
          <Divider />
          <div>
            <SectionLabel>Could weaken if</SectionLabel>
            <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 13, lineHeight: 1.65, color: c.secondary }}>
              {rationale.couldWeaken}
            </p>
          </div>
        </>
      )}

      {(!rationale?.mustBecomeTrue && !rationale?.couldWeaken && assumptions.length > 0) && (
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: c.muted, fontStyle: "italic" }}>
          Run analysis to surface what would strengthen or weaken this route.
        </p>
      )}
    </div>
  );
}

// ─── Lens switcher ───────────────────────────────────────────────────────────────

function LensSwitcher({
  active,
  onChange,
  routeKind,
}: {
  active: InspectTab;
  onChange: (tab: InspectTab) => void;
  routeKind: "strategic_route";
}) {
  // Verify lens tabs against LENS_SUPPORTED_OBJECTS at render time.
  // Overview is always shown; formal lenses are filtered by ontology compatibility.
  const visibleTabs = TABS.filter((tab) => {
    if (tab.id === "overview") return true;
    const lensType = tab.id as LensType;
    // Confirm this is a known lens type before checking compatibility
    if (!LENS_TYPES.includes(lensType)) return false;
    return isLensCompatible(lensType, routeKind);
  });

  return (
    <div style={{
      borderBottom: `1px solid ${c.lineFaint}`,
      background: c.surface,
      padding: "0 24px",
      display: "flex",
      gap: 0,
      overflowX: "auto",
    }}>
      {visibleTabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id as InspectTab)}
            style={{
              fontFamily: MONO,
              fontSize: 9.5,
              textTransform: "uppercase",
              letterSpacing: "0.10em",
              color: isActive ? c.charcoal : c.muted,
              background: "none",
              border: "none",
              borderBottom: isActive ? `2px solid ${c.charcoal}` : "2px solid transparent",
              cursor: "pointer",
              padding: "10px 12px",
              transition: "color 0.12s, border-color 0.12s",
              whiteSpace: "nowrap",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main panel ─────────────────────────────────────────────────────────────────

export default function RouteInspectPanel({
  open,
  onClose,
  route,
  detail,
  rationale,
  linkedDesiredOutcome,
  staleNote,
  areaScoresJson,
  shellMode = false,
  initialLens,
  onLensChange,
  onInspectNeed,
  linkedNeeds,
  onInspectDirection,
  cascade,
  positioning,
  routeDecision,
}: RouteInspectPanelProps) {
  const [activeTab, setActiveTab] = useState<InspectTab>(() => {
    if (initialLens && TABS.some((t) => t.id === initialLens)) return initialLens as InspectTab;
    return "overview";
  });

  function switchTab(tab: InspectTab) {
    setActiveTab(tab);
    onLensChange?.(tab);
  }

  const category = String(route?.category || "improve").toLowerCase();
  const accent   = accentFor(category);
  const pts      = typeof route?.pts_value === "number" ? Math.round(route.pts_value) : null;
  const effort   = String(route?.effort || "medium");

  const readiness = rationale?.readiness ?? null;

  function handleOpenChange(v: boolean) {
    if (!v) {
      onClose();
      setActiveTab("overview");
    }
  }

  function body() {
    if (!route || !detail) return null;
    return (
      <div style={{
        display: "flex", flexDirection: "column",
        ...(shellMode ? { flex: 1, minHeight: 0 } : { height: "100%" }),
        background: c.bg,
      }}>

        {/* Stale banner */}
        {staleNote && (
          <div style={{
            padding: "6px 24px",
            display: "flex", alignItems: "center", gap: 8,
            background: `${c.amber}18`, borderBottom: `1px solid ${c.amber}50`,
          }}>
            <Mono size={9} color={c.amber}>⚑ {staleNote}</Mono>
          </div>
        )}

        {/* ── Fixed header ── */}
        <div style={{ padding: "20px 24px 16px", background: c.surface, borderBottom: `1px solid ${c.lineFaint}`, flexShrink: 0 }}>

          {/* Badge row */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{
              fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em",
              color: accent, background: `${accent}14`, border: `1px solid ${accent}50`,
              borderRadius: 4, padding: "2px 7px",
            }}>
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em", color: c.muted }}>
              {effort} effort
            </span>
            {pts !== null && (
              <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: accent }}>
                +{pts} pts
              </span>
            )}
            {readiness && (
              <ReadinessBadge readiness={readiness} />
            )}
          </div>

          {/* Route title */}
          <h2 style={{ margin: "0 0 8px", fontFamily: "Inter, sans-serif", fontSize: 19, fontWeight: 600, lineHeight: 1.3, color: c.ink }}>
            {route.title || "Untitled route"}
          </h2>

          {/* One-line why — from rationale or description. Derived routes suppress internal scoring text. */}
          {(() => {
            const isDerived = route.id.startsWith("derived-");
            const subline = rationale?.whyThisRouteExists || (isDerived ? null : (route.short_description || null));
            if (!subline) return null;
            return (
              <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 12.5, lineHeight: 1.5, color: c.muted }}>
                {subline.slice(0, 120)}
                {subline.length > 120 ? "…" : ""}
              </p>
            );
          })()}
        </div>

        {/* ── Lens switcher ── */}
        <div style={{ flexShrink: 0 }}>
          <LensSwitcher
            active={activeTab}
            onChange={switchTab}
            routeKind="strategic_route"
          />
        </div>

        {/* ── Scrollable content ── */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {activeTab === "overview" && (
            <OverviewLens
              route={route}
              detail={detail}
              rationale={rationale}
              linkedDesiredOutcome={linkedDesiredOutcome}
              areaScoresJson={areaScoresJson}
              onInspectDirection={onInspectDirection}
              cascade={cascade}
              routeDecision={routeDecision}
            />
          )}
          {activeTab === "customer_reality" && (
            <CustomerRealityLens
              route={route}
              detail={detail}
              rationale={rationale}
              linkedNeeds={linkedNeeds}
              onInspectNeed={onInspectNeed}
            />
          )}
          {activeTab === "positioning" && (
            <PositioningLens
              route={route}
              detail={detail}
              rationale={rationale}
              cascade={cascade ?? null}
              positioning={positioning ?? null}
            />
          )}
          {activeTab === "evidence" && (
            <EvidenceLens detail={detail} rationale={rationale} />
          )}
          {activeTab === "validation" && (
            <ValidationLens route={route} rationale={rationale} />
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: "12px 24px",
          borderTop: `1px solid ${c.lineFaint}`,
          background: c.surface,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <Mono size={9} color={c.muted}>
            {LENS_TYPES.includes(activeTab as LensType) ? `${activeTab.replace(/_/g, " ")} lens` : "overview"}
          </Mono>
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            style={{
              fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em",
              color: c.secondary, background: "none",
              border: `1px solid ${c.line}`, borderRadius: 20,
              padding: "5px 16px", cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

      </div>
    );
  }

  if (shellMode) {
    return body();
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-[600px] flex flex-col p-0 overflow-hidden"
        aria-label={route ? `Inspect route: ${route.title}` : "Route inspection panel"}
      >
        {body()}
      </SheetContent>
    </Sheet>
  );
}
