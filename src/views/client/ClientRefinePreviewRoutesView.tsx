import { useEffect, useMemo, useRef, useState, useCallback, Fragment } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useCompany } from "@/hooks/useCompany";
import type { Company, ExcludedSignal } from "@/hooks/useCompany";
import { useClientViewData } from "@/hooks/useClientViewData";
import { useCapability } from "@/hooks/useCapability";
import { useRouteHypothesisDependencies, useStrategicHypotheses } from "@/hooks/useStrategicHypotheses";
import { supabase } from "@/integrations/supabase/client";
import { captureBaseline } from "@/lib/baselineCapture";
import { stageLabel } from "@/lib/phaseDisplay";
import { saveManualEdit } from "@/lib/manualInlineEdit";
import InlineTextEdit from "@/components/inline-edit/InlineTextEdit";
import InlineTextareaEdit from "@/components/inline-edit/InlineTextareaEdit";
import { useRoutes, type RouteAssumption } from "@/views/Routes/useRoutes";
import { CLIENT_REFINE_PREVIEW_ROUTE, CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE, CLIENT_REFINE_PREVIEW_PATH_ROUTE, CLIENT_REFINE_PREVIEW_INBOX_ROUTE } from "@/lib/clientRefinePreview";
import { useDriftInboxCount } from "@/hooks/useDriftInbox";
import { setActivePath } from "@/lib/activePath";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import CanonicalRouteInspectPanel, { type RouteInspectDetail as CanonicalRouteInspectDetail } from "@/components/routes/RouteInspectPanel";
import ScoreContextBar from "@/components/score/ScoreContextBar";
import { buildReadinessFromCompanySignals } from "@/lib/mojoScoreFromAnatomy";
import type { RouteRow } from "@/views/Routes/useRoutes";
import type { JobStepRow } from "@/hooks/useJobSteps";
import { useOdiNeeds } from "@/hooks/useOdiNeeds";
import type { OdiNeedRow } from "@/hooks/useOdiNeeds";
import { usePublicBaseline } from "@/hooks/usePublicBaseline";
import { usePositioningCanvas } from "@/hooks/usePositioningCanvas";
import { useStrategyCascade } from "@/hooks/useStrategyCascade";
import { SignalBar } from "./workshop/tabs/OutsidePanels";
import type { SignalStage } from "./workshop/types";
import { baselineOf } from "./workshop/helpers";
import {
  routeRelativeTime,
  buildDecisionBullets,
  persistSelectedRouteDecision,
  clearSelectedRouteDecision,
  insertRouteDecisionEvent,
} from "@/views/Routes/routeDecision";
import { computeLatestExclusionAt, isArtifactStale } from "@/lib/evidenceImpact";
import { clientGateInsight } from "@/lib/routeInsights";
import TierAlignmentGrid from "@/components/inspect/TierAlignmentGrid";
import { routeSignalTiers, generationContextLabel } from "@/lib/strategicObject";
import { buildRouteSourceLinks } from "@/lib/sourceLinks";
import SourcesUsedSection from "@/components/inspect/SourcesUsedSection";
import { selectRecommendedRoute, impactReason } from "@/lib/routeScoring";
import { type NextBestMove } from "@/lib/nextBestMove";
import { buildRouteRationales, deriveWhyLeading, type RouteRationale } from "@/lib/routeRationale";
import { buildRouteOrientationRead, deriveCommitmentLegitimacy, type RouteOrientationRead } from "@/lib/routeOrientationRead";
import { deriveClientAssumptions, deriveClientEvidence } from "@/lib/routeClientNarrative";
import { buildRouteEditorialRoles, floorEngagementPhase, phaseNarrativePriority, softenRouteForPhase, sortRoutesForPhase, type RouteEditorialRole } from "@/lib/refinePreviewPhaseOrchestration";
import { displayConfidenceLabel, commitmentMovementSentence } from "@/lib/strategicLanguage";
import "@/styles/client-refine-preview.css";
import { WorkshopSidebar } from "@/components/client/WorkshopSidebar";
import { useCompanyClaims, type ClaimRow } from "@/lib/claims/useCompanyClaims";

import ClaimStateBadge from "@/components/claims/ClaimStateBadge";
import type { ClaimState } from "@/lib/claimState";
import DriftBadge from "@/components/drift/DriftBadge";
import DriftDetailPanel from "@/components/drift/DriftDetailPanel";
import ProposeChangesButton from "@/components/drift/ProposeChangesButton";
import { useDriftScan } from "@/hooks/useDriftScan";
import type { EngagementPhase } from "@/lib/engagementPhase";
import { useDesiredOutcomes } from "@/lib/desiredOutcomes";
import type { DesiredOutcomeRow } from "@/lib/desiredOutcomes";
import { useMojoScore } from "@/hooks/useMojoScore";
import { computeMojoScore } from "@/lib/mojoScore/computeMojoScore";
import { computeReachableScore, computeUnlockableScore } from "@/lib/mojoScore/projections";
import { useSignalLandscape } from "@/hooks/useSignalLandscape";
import { SignalBasisChip } from "@/components/design-system/SignalBasisChip";
import { useRouteProposals, type RouteProposalRow } from "@/hooks/useRouteProposals";
import { useAuth } from "@/hooks/useAuth";
import SurfaceEducationTrigger from "@/components/surface-education/SurfaceEducationTrigger";
import FlowCommitSheet from "@/components/claims/FlowCommitSheet";

// ─── Design tokens (inline-style safe — no CSS var access) ───────────────────
const R = {
  ink:          "#111111",
  inkSoft:      "#555555",
  inkFaint:     "#999999",
  signal:       "#ff5b29",
  hairline:     "rgba(17,17,17,0.12)",
  hairlineFaint: "rgba(17,17,17,0.08)",
  mono:         '"IBM Plex Mono", ui-monospace, monospace',
  sans:         '"Inter", system-ui, sans-serif',
} as const;

type RouteCategory = "fix" | "improve" | "create";

const CATEGORY_META: Record<RouteCategory, { label: string; subtitle: string; hypothesisSubtitle: string }> = {
  fix:     { label: "Under Pressure",    subtitle: "Unresolved friction the evidence flags as actively limiting.",        hypothesisSubtitle: "Gaps that appear in the evidence — not yet confirmed." },
  improve: { label: "Under Validation",  subtitle: "Areas showing partial progress where evidence suggests continued pressure.", hypothesisSubtitle: "Areas showing partial progress — worth confirming." },
  create:  { label: "Directional",       subtitle: "New directions suggested by the evidence — no existing path covers this.", hypothesisSubtitle: "New directions from the outside signals — hypothesis only." },
};

const CATEGORY_POSTURE_LABEL: Record<string, string> = {
  fix:     "Under Pressure",
  improve: "Under Validation",
  create:  "Directional",
};

function isHypothesisPhase(phase: string): boolean {
  return ["outside_signals", "validate_outside", "diagnose", "validate_diagnose"].includes(phase);
}

function toSentence(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

// ─── Client route inspect panel ───────────────────────────────────────────────

function deriveClientWhyReasons(route: RouteRow): string[] {
  const stored = Array.isArray(route.why_this_matters_json) ? route.why_this_matters_json.map(String).filter(Boolean) : [];
  if (stored.length > 0) return stored;
  const category = String(route.category || "").toLowerCase();
  const desc = route.short_description ? String(route.short_description).trim() : "";
  const reasons: string[] = [];
  if (desc) reasons.push(desc);
  if (category === "fix") {
    reasons.push("The evidence flags this gap as actively limiting outcomes.");
    if (reasons.length < 2) reasons.push("Addressing this removes a constraint that's compounding.");
  } else if (category === "improve") {
    reasons.push("Evidence shows partial progress — this route targets the remaining gap.");
    if (reasons.length < 2) reasons.push("Strengthening here removes an active constraint the evidence has surfaced.");
  } else {
    reasons.push("This points to an unmet need — no existing path currently covers this.");
    if (reasons.length < 2) reasons.push("This reflects demand visible in the evidence that has no active route.");
  }
  return reasons.slice(0, 3);
}

function deriveCanonicalRouteSentence(route: RouteRow): string {
  const category = String(route.category || "").toLowerCase();
  const why = Array.isArray(route.why_this_matters_json)
    ? route.why_this_matters_json.map(String).filter(Boolean)
    : [];
  const topReason = why[0] ? why[0].replace(/\.$/, "").trim() : null;
  const isInferred = String(route.id || "").startsWith("derived-");
  const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

  if (isInferred) {
    return topReason
      ? `The evidence points to ${lc(topReason)}.`
      : "This direction was inferred from the data — no existing path covers it yet.";
  }
  if (category === "fix") {
    return topReason
      ? `This route exists because ${lc(topReason)}.`
      : "This route addresses a constraint the evidence flags as actively limiting.";
  }
  if (category === "improve") {
    return topReason
      ? `This route exists because ${lc(topReason)}.`
      : "Evidence shows partial progress here. This route targets what's still holding.";
  }
  return topReason
    ? `This direction was surfaced because ${lc(topReason)}.`
    : "No existing path covers this area. This points to unmet demand.";
}

type EvidenceItem = { id: string; title: string; status: "complete" | "in_progress" | "missing" };
type ClientAssumption = RouteAssumption;

const CLIENT_LAYER_LABELS: Record<ClientAssumption["layer"], string> = {
  outside:  "Outside Signals",
  org:      "Organization",
  customer: "Customer",
  market:   "Market",
};

const CLIENT_STATUS_LABELS: Record<ClientAssumption["status"], string> = {
  supported: "Supported",
  partial:   "Partial",
  unproven:  "Not yet proven",
};

const CLIENT_STATUS_COLORS: Record<ClientAssumption["status"], string> = {
  supported: R.ink,
  partial:   R.inkFaint,
  unproven:  R.inkFaint,
};

const CLIENT_STATUS_GLYPHS: Record<ClientAssumption["status"], string> = {
  supported: "◉",
  partial:   "◎",
  unproven:  "○",
};


function deriveStrengthMoves(
  evidence: EvidenceItem[],
  assumptions: ClientAssumption[],
  isStale: boolean,
): string[] {
  const moves: string[] = [];

  if (evidence.some((e) => e.status === "missing")) {
    moves.push("Close missing evidence gaps.");
  }
  if (assumptions.some((a) => a.layer === "customer" && a.status === "unproven")) {
    moves.push("Validate this with customer evidence.");
  }
  if (assumptions.some((a) => a.layer === "org" && a.status === "unproven")) {
    moves.push("Confirm internal capability and ownership.");
  }
  if (isStale) {
    moves.push("Recheck this route after excluded inputs.");
  }
  if (moves.length === 0) {
    moves.push("Gather stronger evidence before treating this as a committed path.");
  }

  return moves;
}

function ClientRouteInspectPanel({
  open,
  onClose,
  route,
  excludedSignals,
  areaScoresJson,
}: {
  open: boolean;
  onClose: () => void;
  route: RouteRow | null;
  excludedSignals?: ExcludedSignal[] | null;
  areaScoresJson?: unknown;
}) {
  if (!route) return null;

  const why        = deriveClientWhyReasons(route);
  const evidence   = deriveClientEvidence(route);
  const supporting = evidence.filter((e) => e.status !== "missing");
  const missing    = evidence.filter((e) => e.status === "missing");
  const category   = String(route.category || "").toLowerCase();
  const pts        = typeof route.pts_value === "number" ? Math.round(route.pts_value) : null;
  const effort     = route.effort ? String(route.effort).toUpperCase() : null;

  const assumptions    = deriveClientAssumptions(route, evidence);
  const supportedCount = assumptions.filter((a) => a.status === "supported").length;

  const latestExclusionAt = computeLatestExclusionAt(excludedSignals ?? []);
  const isStale = latestExclusionAt ? isArtifactStale(route, latestExclusionAt) : false;

  const strengthMoves    = deriveStrengthMoves(evidence, assumptions, isStale);
  const criticalUnproven = assumptions.filter((a) => a.critical === true && a.status === "unproven");
  const moveFactor       = clientGateInsight(category, areaScoresJson ?? null);

  const frameworks = Array.isArray(route.frameworks_used) ? route.frameworks_used.map(String) : [];
  const genContext = generationContextLabel(frameworks, route.id);
  const routeSources = buildRouteSourceLinks({ evidence_json: supporting, created_at: route.created_at });
  const tierCells = routeSignalTiers({
    frameworksUsed: frameworks,
    hasNonMissingEvidence: supporting.length > 0,
    hasCompleteEvidence: evidence.some((e) => e.status === "complete"),
    hasCustomerEvidence: false,
  });

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="sm:max-w-[480px] overflow-y-auto flex flex-col gap-0 p-0">
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

          {/* Stale warning — amber band above header */}
          {isStale && (
            <div style={{ padding: "10px 24px", background: "#fef9ec", borderBottom: "1px solid #FAC846" }}>
              <p style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.08em", color: "#FAC846", textTransform: "uppercase", fontWeight: 600, margin: 0, lineHeight: 1.5 }}>
                Needs review after excluded inputs
              </p>
              <p style={{ fontSize: 11, color: "#999", margin: "2px 0 0", lineHeight: 1.5 }}>
                This recommendation may reflect information that has since been excluded.
              </p>
            </div>
          )}

          <div className="crpv-inspect-hd" style={{ borderBottom: "1px solid #d9d9d9" }}>
            <div className="crpv-inspect-badges">
              {category && <span className="crpv-r-badge">{(CATEGORY_POSTURE_LABEL[category] ?? category).toUpperCase()}</span>}
            </div>
            <p className="crpv-inspect-title" style={{ color: "#111111" }}>{route.title || "Untitled route"}</p>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

            {/* What this claims */}
            <div className="crpv-inspect-section">
              <p className="crpv-inspect-section-label" style={{ color: "#999999" }}>What this claims</p>
              <p style={{ fontSize: 12, color: "#555555", margin: "4px 0 10px", lineHeight: 1.5, fontStyle: "italic" }}>
                {deriveCanonicalRouteSentence(route)}
              </p>
              <p style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.08em", color: "#999999", textTransform: "uppercase", margin: "0 0 8px" }}>
                {genContext}
              </p>
              <TierAlignmentGrid cells={tierCells} />
            </div>

            <div style={{ height: 1, background: "#d9d9d9" }} />

            {/* Why this was flagged */}
            <div className="crpv-inspect-section">
              <p className="crpv-inspect-section-label" style={{ color: "#999999" }}>Why this was flagged</p>
              <ul className="crpv-inspect-bullets">
                {why.map((reason, i) => (
                  <li key={i} className="crpv-inspect-bullet" style={{ color: "#555555" }}>
                    <span className="crpv-inspect-dot" style={{ color: "#999999" }}>·</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ height: 1, background: "#d9d9d9" }} />

            {/* Evidence */}
            <div className="crpv-inspect-section">
              <p className="crpv-inspect-section-label" style={{ color: "#999999" }}>Evidence</p>
              {supporting.length > 0 && (
                <div className="crpv-inspect-evidence-group">
                  <p className="crpv-inspect-sub-label">Supporting</p>
                  {supporting.map((item) => (
                    <div key={item.id} className="crpv-r-detail-row">
                      <span className={`crpv-r-dot ${item.status}`} title={statusTip(item.status)}>{statusGlyph(item.status)}</span>
                      <span style={{ color: "#555555" }}>{item.title}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="crpv-inspect-evidence-group">
                <p className="crpv-inspect-sub-label crpv-inspect-sub-label--gap">Needs attention</p>
                {missing.length > 0 ? (
                  missing.map((item) => (
                    <div key={item.id} className="crpv-r-detail-row crpv-r-detail-row--missing">
                      <span className="crpv-r-dot missing" title="Missing — not yet addressed">○</span>
                      <span style={{ color: "#ff7d2d" }}>{item.title}</span>
                    </div>
                  ))
                ) : (
                  <p className="crpv-inspect-empty" style={{ color: "#999999" }}>No gaps flagged for this route.</p>
                )}
              </div>
            </div>

            <div style={{ height: 1, background: "#d9d9d9" }} />

            {/* What would have to be true */}
            <div className="crpv-inspect-section">
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                <p className="crpv-inspect-section-label" style={{ color: "#999999" }}>What would have to be true</p>
                {assumptions.length > 0 && (
                  <span style={{ fontSize: 10, fontFamily: "monospace", color: "#5F9B8C", flexShrink: 0 }}>
                    {supportedCount} of {assumptions.length} supported
                  </span>
                )}
              </div>
              <p style={{ fontSize: 12, color: "#999999", margin: "0 0 12px", lineHeight: 1.5 }}>
                These are the conditions that must hold for this route to be a good path.
              </p>

              {assumptions.length === 0 ? (
                <p style={{ fontSize: 12, color: "#999999", lineHeight: 1.5 }}>
                  No conditions have been defined yet. Treat this route as a working hypothesis until confirmed.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {assumptions.map((assumption) => {
                    const statusColor = CLIENT_STATUS_COLORS[assumption.status];
                    const statusGlyphChar = CLIENT_STATUS_GLYPHS[assumption.status];
                    const layerLabel = CLIENT_LAYER_LABELS[assumption.layer] ?? assumption.layer;
                    const statusLabel = CLIENT_STATUS_LABELS[assumption.status];
                    return (
                      <div
                        key={assumption.id}
                        style={{ border: "1px solid #e8ede8", borderRadius: 6, padding: "10px 12px", background: "#fafcfa" }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          <span style={{ color: statusColor, flexShrink: 0, fontSize: 13, marginTop: 1 }}>
                            {statusGlyphChar}
                          </span>
                          <p style={{ fontSize: 13, color: "#555555", margin: 0, lineHeight: 1.55 }}>
                            {assumption.statement}
                          </p>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.08em", color: "#999999", textTransform: "uppercase", border: "1px solid #e8ede8", borderRadius: 3, padding: "1px 6px" }}>
                            {layerLabel}
                          </span>
                          <span style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.08em", color: statusColor, textTransform: "uppercase" }}>
                            {statusLabel}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ height: 1, background: "#d9d9d9" }} />

            {/* What would move this */}
            <div className="crpv-inspect-section">
              <p className="crpv-inspect-section-label" style={{ color: "#999999" }}>What would move this</p>
              {moveFactor ? (
                <>
                  <p style={{ fontSize: 13, color: "#555555", margin: "4px 0 6px", lineHeight: 1.55 }}>
                    The main constraint to resolve appears to be:{" "}
                    <span style={{ fontWeight: 500 }}>{moveFactor}</span>.
                  </p>
                  <p style={{ fontSize: 12, color: "#999999", margin: 0, lineHeight: 1.5 }}>
                    Improving this would make the route more ready to act on.
                  </p>
                </>
              ) : (
                <p style={{ fontSize: 13, color: "#999999", margin: "4px 0 0", lineHeight: 1.55 }}>
                  No specific constraint resolved — resolve open proof gaps to see what shifts.
                </p>
              )}
            </div>

            <div style={{ height: 1, background: "#d9d9d9" }} />

            {/* What would strengthen this */}
            <div className="crpv-inspect-section">
              <p className="crpv-inspect-section-label" style={{ color: "#999999" }}>What would strengthen this</p>
              <p style={{ fontSize: 12, color: "#999999", margin: "0 0 12px", lineHeight: 1.5 }}>
                These are the next evidence moves that would make this route more trustworthy.
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                {strengthMoves.map((move, i) => (
                  <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "#555555", lineHeight: 1.55 }}>
                    <span style={{ color: "#5F9B8C", flexShrink: 0, marginTop: 1 }}>·</span>
                    <span>{move}</span>
                  </li>
                ))}
              </ul>

              {criticalUnproven.length > 0 && (
                <>
                  <p style={{ fontSize: 12, color: "#999999", margin: "12px 0 8px", lineHeight: 1.5 }}>
                    This route's full potential depends on{" "}
                    <span style={{ color: "#555555", fontWeight: 500 }}>
                      {criticalUnproven.length} critical condition{criticalUnproven.length !== 1 ? "s" : ""}
                    </span>{" "}
                    being confirmed.
                  </p>
                  <div style={{ border: "1px solid rgba(255,125,45,0.3)", borderRadius: 6, padding: "10px 12px", background: "rgba(255,125,45,0.05)" }}>
                    <p style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.08em", color: "#FF7D2D", textTransform: "uppercase", margin: "0 0 8px", fontWeight: 600 }}>
                      Critical conditions to confirm
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {criticalUnproven.map((a) => (
                        <div key={a.id} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          <span style={{ color: "#FF7D2D", flexShrink: 0 }}>○</span>
                          <span style={{ fontSize: 12, color: "#555555", lineHeight: 1.55 }}>{a.statement}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div style={{ borderTop: "1px solid #d9d9d9" }} />
            <div className="crpv-inspect-section">
              <SourcesUsedSection sources={routeSources} />
            </div>

          </div>

          <div style={{ padding: "16px 24px", borderTop: "1px solid #d9d9d9" }}>
            <button type="button" className="crpv-inspect-close" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Decision banner ──────────────────────────────────────────────────────────

function ClientDecisionBanner({
  route,
  savedAt,
  onClear,
  isHypothesis,
}: {
  route: RouteRow;
  savedAt: string | null;
  onClear: () => void;
  isHypothesis?: boolean;
}) {
  const why      = deriveClientWhyReasons(route);
  const evidence = deriveClientEvidence(route);
  const steps    = (Array.isArray(route.steps_json) ? route.steps_json : []) as Array<{ status: string }>;
  const bullets  = buildDecisionBullets({ whyThisMatters: why, evidence, steps }, null);
  const category = String(route.category || "").toLowerCase();
  const pts      = typeof route.pts_value === "number" ? Math.round(route.pts_value) : null;
  const timeLabel = savedAt ? routeRelativeTime(savedAt) : null;

  return (
    <div style={{
      borderLeft: `3px solid ${isHypothesis ? R.inkFaint : R.signal}`,
      paddingLeft: 18,
      marginBottom: 24,
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: R.mono, fontSize: 9, letterSpacing: "0.1em", color: isHypothesis ? R.inkFaint : R.signal, fontWeight: 600, textTransform: "uppercase" }}>
          {isHypothesis ? "WORKING HYPOTHESIS" : "CHOSEN PATH"}
        </span>
        {category && (
          <span style={{ fontFamily: R.mono, fontSize: 9, letterSpacing: "0.06em", color: R.inkFaint, textTransform: "uppercase" }}>
            · {CATEGORY_POSTURE_LABEL[category] ?? category}
          </span>
        )}
        <button
          type="button"
          onClick={onClear}
          style={{ marginLeft: "auto", fontFamily: R.mono, fontSize: 9, letterSpacing: "0.06em", color: R.inkFaint, textDecoration: "underline", textUnderlineOffset: 2, background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          DESELECT
        </button>
      </div>

      <p style={{ fontFamily: R.sans, fontSize: 14, fontWeight: 700, color: R.ink, margin: 0, lineHeight: 1.35, letterSpacing: "-0.01em" }}>
        {route.title || "Untitled route"}
      </p>

      {bullets.length > 0 && (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
          {bullets.map((b, i) => (
            <li key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: R.inkSoft, lineHeight: 1.5 }}>
              <span style={{ color: R.inkFaint, flexShrink: 0 }}>·</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}

      {isHypothesis && (
        <p style={{ fontSize: 11, color: "#999", margin: 0, fontStyle: "italic" }}>
          Validate needs before committing.
        </p>
      )}

      {timeLabel && (
        <p style={{ fontSize: 11, color: "#999", margin: 0, fontFamily: "monospace" }}>
          Saved · {timeLabel}
        </p>
      )}
    </div>
  );
}

function RouteWhyRisingPanel({
  route,
  rationale,
  title,
  safeNowLabel,
  whyLeading,
  phase,
}: {
  route: RouteRow;
  rationale: RouteRationale;
  title: string;
  safeNowLabel: string;
  whyLeading?: string;
  phase?: string;
}) {
  const [showEvidence, setShowEvidence] = useState(false);
  const [detailExpanded, setDetailExpanded] = useState(false);
  const combinedEvidence = useMemo(
    () => [...rationale.supportingEvidenceLines, ...rationale.weakeningEvidenceLines].slice(0, 4),
    [rationale.supportingEvidenceLines, rationale.weakeningEvidenceLines],
  );

  return (
    <section className="crpv-r-why-rising" aria-label="Why this direction keeps surfacing">
      <div className="crpv-r-why-rising-header">
        <p className="cap">{title}</p>
        <h2>{route.title || "Untitled route"}</h2>
        <div className="crpv-r-why-rising-meta">
          <span className="crpv-r-readiness-state">{rationale.readiness}</span>
          <span>{rationale.movementLabel}</span>
          <span>{displayConfidenceLabel(rationale.confidenceLabel)}</span>
        </div>
      </div>

      {phase === "flow" && (
        <p className="crpv-r-why-rising-movement-intro">
          {commitmentMovementSentence(rationale.movement)}
        </p>
      )}

      {whyLeading && phase !== "flow" && (
        <p className="crpv-r-why-rising-lead-sentence">{whyLeading}</p>
      )}

      {/* Primary context — always visible */}
      <div className="crpv-r-why-rising-grid">
        <div>
          <p className="crpv-r-why-rising-label">Why this direction keeps surfacing</p>
          <p>{rationale.whyThisRouteExists}</p>
        </div>
        <div>
          <p className="crpv-r-why-rising-label">What the evidence shows</p>
          <p>{rationale.whatSupportsIt}</p>
        </div>
        <div>
          <p className="crpv-r-why-rising-label">What still needs to be proven</p>
          <p>{rationale.mustBecomeTrue}</p>
        </div>
      </div>

      {/* Secondary context — behind toggle */}
      {detailExpanded && (
        <div className="crpv-r-why-rising-grid crpv-r-why-rising-grid--secondary">
          <div>
            <p className="crpv-r-why-rising-label">{safeNowLabel}</p>
            <p>{rationale.readinessMeaning}</p>
          </div>
          <div>
            <p className="crpv-r-why-rising-label">What the organization hasn't yet settled</p>
            <p>{rationale.uncertainty}</p>
          </div>
          <div>
            <p className="crpv-r-why-rising-label">What might pull against this</p>
            <p>{rationale.couldWeaken}</p>
          </div>
        </div>
      )}

      <div className="crpv-r-why-rising-actions">
        <button
          type="button"
          className="btn ghost"
          onClick={() => setDetailExpanded((v) => !v)}
        >
          {detailExpanded ? "Less context" : "Explore reasoning"}
        </button>
        {combinedEvidence.length > 0 && (
          <button
            type="button"
            className="btn ghost"
            onClick={() => setShowEvidence((current) => !current)}
          >
            {showEvidence ? "Hide evidence" : "See evidence"}
          </button>
        )}
      </div>

      {showEvidence ? (
        <div className="crpv-r-why-rising-evidence">
          {rationale.supportingEvidenceLines.length > 0 ? (
            <div className="crpv-r-why-rising-evidence-block">
              <p className="crpv-r-why-rising-label">What backs this direction</p>
              {rationale.supportingEvidenceLines.slice(0, 3).map((line) => (
                <div key={line} className="crpv-r-why-rising-evidence-line">{line}</div>
              ))}
            </div>
          ) : null}
          {rationale.weakeningEvidenceLines.length > 0 ? (
            <div className="crpv-r-why-rising-evidence-block">
              <p className="crpv-r-why-rising-label">What's pulling against this</p>
              {rationale.weakeningEvidenceLines.slice(0, 2).map((line) => (
                <div key={line} className="crpv-r-why-rising-evidence-line">{line}</div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

// ─── Route card ───────────────────────────────────────────────────────────────

type DetailItem = { id: string; title: string; status: "complete" | "in_progress" | "missing" };

function statusGlyph(status: DetailItem["status"]) {
  if (status === "complete")    return "◉";
  if (status === "in_progress") return "◎";
  return "○";
}

function statusTip(status: DetailItem["status"]) {
  if (status === "complete")    return "Complete";
  if (status === "in_progress") return "In progress";
  return "Missing — not yet addressed";
}

// ─── Route field config ───────────────────────────────────────────────────────

const ROUTE_FIELD_LABELS: Record<string, string> = {
  title:                   "Title",
  short_description:       "Description",
  rejected_alternatives:   "Rejected Alternatives",
  what_would_have_to_be_true: "What Would Have to Be True",
};
const ROUTE_FIELDS = Object.keys(ROUTE_FIELD_LABELS);

function summarizeRouteValue(field: string, val: unknown): string {
  if (field === "rejected_alternatives") {
    if (!Array.isArray(val) || val.length === 0) return "(empty)";
    const titles = (val as Array<{ alternative_title?: string; rejection_reason?: string }>)
      .map((item) => item.alternative_title || item.rejection_reason || "")
      .filter(Boolean);
    if (titles.length === 0) return "(empty)";
    if (titles.length <= 2) return titles.join(", ");
    return `${titles.slice(0, 2).join(", ")} +${titles.length - 2} more`;
  }
  if (field === "what_would_have_to_be_true") {
    if (!Array.isArray(val) || val.length === 0) return "(empty)";
    const conditions = (val as Array<{ condition?: string }>)
      .map((item) => item.condition || "")
      .filter(Boolean);
    if (conditions.length === 0) return "(empty)";
    if (conditions.length <= 2) return conditions.join(", ");
    return `${conditions.slice(0, 2).join(", ")} +${conditions.length - 2} more`;
  }
  return String(val ?? "") || "(empty)";
}

function routeDiffedFields(proposal: RouteProposalRow): string[] {
  return ROUTE_FIELDS.filter((field) => {
    const curr = proposal.current_state[field];
    const prop = proposal.proposed_state[field];
    if (field === "rejected_alternatives") {
      const texts = (arr: unknown) =>
        (Array.isArray(arr) ? arr : [])
          .map((item: unknown) => (typeof item === "object" && item ? String((item as Record<string, unknown>).rejection_reason ?? "") : ""))
          .filter(Boolean)
          .sort()
          .join("|");
      return texts(curr) !== texts(prop);
    }
    if (field === "what_would_have_to_be_true") {
      const texts = (arr: unknown) =>
        (Array.isArray(arr) ? arr : [])
          .map((item: unknown) => (typeof item === "object" && item ? String((item as Record<string, unknown>).condition ?? "") : ""))
          .filter(Boolean)
          .sort()
          .join("|");
      return texts(curr) !== texts(prop);
    }
    return String(curr ?? "") !== String(prop ?? "");
  });
}

function routeTimeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function RouteProposalSection({
  proposal,
  onAcceptProposal,
  onRejectProposal,
  acceptLoading,
  rejectLoading,
  canApply = true,
  canReject = true,
}: {
  proposal: RouteProposalRow;
  onAcceptProposal?: (proposalId: string, acceptedFields: string[], skippedFields: string[]) => void;
  onRejectProposal?: (proposalId: string) => void;
  acceptLoading?: boolean;
  rejectLoading?: boolean;
  canApply?: boolean;
  canReject?: boolean;
}) {
  const diffFields = useMemo(() => routeDiffedFields(proposal), [proposal]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(diffFields));
  useEffect(() => { setSelected(new Set(routeDiffedFields(proposal))); }, [proposal.id]);

  const total = diffFields.length;
  const selectedCount = diffFields.filter((f) => selected.has(f)).length;
  const allUnchecked = selectedCount === 0;

  function toggle(field: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }

  function handleAccept() {
    if (!onAcceptProposal) return;
    const accepted = diffFields.filter((f) => selected.has(f));
    const skipped = diffFields.filter((f) => !selected.has(f));
    onAcceptProposal(proposal.id, accepted, skipped);
  }

  const isList = (field: string) =>
    field === "rejected_alternatives" || field === "what_would_have_to_be_true";

  return (
    <div style={{
      margin: "10px 0 4px",
      padding: "10px 12px 12px",
      border: `1px solid rgba(255,91,41,0.25)`,
      borderRadius: 6,
      background: "rgba(255,91,41,0.03)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontFamily: R.mono, letterSpacing: "0.07em", color: "#ff5b29", fontWeight: 600 }}>
          PROPOSED CHANGES
        </span>
        <span style={{ fontSize: 10, fontFamily: R.mono, color: R.inkFaint }}>
          {routeTimeAgo(proposal.created_at)} · {total} field{total !== 1 ? "s" : ""} differ
        </span>
      </div>
      {proposal.reason && (
        <p style={{ fontSize: 11, color: R.inkSoft, margin: "0 0 8px", lineHeight: 1.5, fontStyle: "italic" }}>
          {proposal.reason}
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
        {diffFields.map((field) => {
          const curr = proposal.current_state[field];
          const prop = proposal.proposed_state[field];
          const isChecked = selected.has(field);
          return (
            <label key={field} style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggle(field)}
                style={{ marginTop: 2, accentColor: "#ff5b29", flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 10, fontFamily: R.mono, color: R.inkSoft, letterSpacing: "0.05em" }}>
                    {ROUTE_FIELD_LABELS[field] ?? field}
                  </span>
                  {isList(field) && (
                    <span style={{ fontSize: 9, fontFamily: R.mono, color: "#ff5b29", border: "1px solid rgba(255,91,41,0.4)", borderRadius: 3, padding: "0 4px", letterSpacing: "0.05em" }}>
                      LIST
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: R.inkFaint, fontFamily: R.sans, textDecoration: "line-through", marginBottom: 1, lineHeight: 1.4 }}>
                  {summarizeRouteValue(field, curr)}
                </div>
                <div style={{ fontSize: 11, color: R.ink, fontFamily: R.sans, lineHeight: 1.4 }}>
                  {summarizeRouteValue(field, prop)}
                </div>
              </div>
            </label>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          onClick={handleAccept}
          disabled={acceptLoading || allUnchecked || !canApply}
          title={!canApply ? "Approval requires the apply capability" : allUnchecked ? "Select at least one field to apply" : undefined}
          style={{
            fontSize: 10,
            fontFamily: R.mono,
            letterSpacing: "0.05em",
            background: allUnchecked || !canApply ? "none" : "#111",
            color: allUnchecked || !canApply ? R.inkFaint : "#fff",
            border: `1px solid ${allUnchecked || !canApply ? R.hairline : "#111"}`,
            borderRadius: 4,
            padding: "4px 10px",
            cursor: acceptLoading || allUnchecked || !canApply ? "default" : "pointer",
            opacity: acceptLoading ? 0.5 : 1,
          }}
        >
          {acceptLoading ? "Applying…" : `Apply ${selectedCount} of ${total} change${total !== 1 ? "s" : ""}`}
        </button>
        <button
          type="button"
          onClick={() => onRejectProposal?.(proposal.id)}
          disabled={rejectLoading || !canReject}
          title={!canReject ? "Rejecting requires the reject capability" : undefined}
          style={{
            fontSize: 10,
            fontFamily: R.mono,
            letterSpacing: "0.05em",
            background: "none",
            color: R.inkFaint,
            border: `1px solid ${R.hairline}`,
            borderRadius: 4,
            padding: "4px 10px",
            cursor: rejectLoading ? "default" : "pointer",
            opacity: rejectLoading ? 0.5 : 1,
          }}
        >
          {rejectLoading ? "Dismissing…" : "Dismiss"}
        </button>
      </div>
    </div>
  );
}

function RouteCard({
  route,
  rationale,
  onInspect,
  isSelected,
  isOtherSelected,
  onSelect,
  isHovered,
  isOtherHovered,
  onHover,
  isContextMatch,
  isContextDim,
  isReady,
  phaseSoftened,
  editorialRole,
  phase,
  claimId,
  claimState,
  onReEvaluate,
  reEvalLoading,
  pendingProposal,
  onGenerateProposal,
  generateLoading,
  generateMessage,
  onAcceptProposal,
  onRejectProposal,
  acceptLoading,
  rejectLoading,
  canApply = true,
  canReject = true,
  canGenerate: canGenerateRoute = true,
  driftRefreshKey,
  onCheckDrift,
  checkingSurfaceId,
}: {
  route: RouteRow;
  rationale?: RouteRationale | null;
  onInspect?: () => void;
  isSelected?: boolean;
  isOtherSelected?: boolean;
  onSelect?: (route: RouteRow) => void;
  isHovered?: boolean;
  isOtherHovered?: boolean;
  onHover?: (id: string | null) => void;
  isContextMatch?: boolean;
  isContextDim?: boolean;
  isReady?: boolean;
  phaseSoftened?: boolean;
  editorialRole?: RouteEditorialRole;
  phase?: string;
  claimId?: string | null;
  claimState?: ClaimState | null;
  onReEvaluate?: () => void;
  reEvalLoading?: boolean;
  pendingProposal?: RouteProposalRow | null;
  onGenerateProposal?: () => void;
  generateLoading?: boolean;
  generateMessage?: string | null;
  onAcceptProposal?: (proposalId: string, acceptedFields: string[], skippedFields: string[]) => void;
  onRejectProposal?: (proposalId: string) => void;
  acceptLoading?: boolean;
  rejectLoading?: boolean;
  canApply?: boolean;
  canReject?: boolean;
  canGenerate?: boolean;
  driftRefreshKey?: number;
  onCheckDrift?: () => void;
  checkingSurfaceId?: string | null;
}) {


  const [expanded, setExpanded] = useState(false);

  const steps    = (Array.isArray(route.steps_json)    ? route.steps_json    : []) as DetailItem[];
  const evidence = (Array.isArray(route.evidence_json) ? route.evidence_json : []) as DetailItem[];
  const why      = Array.isArray(route.why_this_matters_json) ? route.why_this_matters_json : [];

  const pts    = typeof route.pts_value === "number" ? Math.round(route.pts_value) : null;
  const effort = route.effort ? String(route.effort).toUpperCase() : null;
  const completedSteps = steps.filter((s) => s.status === "complete").length;
  const isOffStrategy = route.strategy_alignment === "off_strategy";

  const leftAccent = `inset 2px 0 0 ${R.inkSoft}`;
  const hoverShadow = "0 2px 10px rgba(17,17,17,0.08)";
  const boxShadow = isContextMatch && isHovered
    ? `${hoverShadow}, ${leftAccent}`
    : isContextMatch
    ? leftAccent
    : isHovered
    ? hoverShadow
    : undefined;
  const editorialQuiet = editorialRole === "default" && !expanded && !isSelected && !isHovered;
  const isFlow = phase === "flow";
  const editorialLabel = (() => {
    if (isFlow) {
      if (isSelected) {
        if (rationale?.movement === "weaken") return "Destabilizing";
        if (rationale?.movement === "strengthen") return "Commitment strengthening";
        return "Active commitment";
      }
      if (rationale?.movement === "weaken") return "Under pressure";
      if (editorialRole === "improving") return "Strengthening";
      if (editorialRole === "risk") return "Needs watching";
      return null;
    }
    return editorialRole === "recommended"
      ? "Lead route"
      : editorialRole === "improving"
        ? "Strengthening"
        : editorialRole === "risk"
          ? "Needs watching"
          : null;
  })();

  return (
    <div
      className={`crpv-r-card${expanded ? " expanded" : ""}`}
      onMouseEnter={onHover ? () => onHover(route.id) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}
      style={{
        outline: isSelected
          ? `2px solid ${R.signal}`
          : isHovered
          ? `1.5px solid ${R.hairline}`
          : "1.5px solid transparent",
        outlineOffset: isSelected ? -2 : -1,
        boxShadow,
        opacity: isOtherSelected ? 0.42 : isOtherHovered ? 0.72 : isOffStrategy ? 0.58 : editorialQuiet ? 0.54 : phaseSoftened ? 0.62 : isContextDim ? 0.85 : undefined,
      }}
    >
      <button
        type="button"
        className="crpv-r-card-trigger"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="crpv-r-card-top">
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
            <span className="crpv-r-card-title" style={isContextMatch ? { fontWeight: 600 } : undefined}>{route.title || "Untitled route"}</span>
            {isOffStrategy && (
              <span style={{ fontSize: 9, fontFamily: R.mono, letterSpacing: "0.1em", color: "#888", textTransform: "uppercase" }}>
                OFF-STRATEGY · retained by choice
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isSelected && (
              <span style={{
                fontSize: 10,
                fontFamily: R.mono,
                letterSpacing: "0.06em",
                color: isFlow && rationale?.movement === "weaken" ? R.signal : R.ink,
                background: R.hairlineFaint,
                padding: "1px 6px",
                textTransform: "uppercase",
              }}>
                {isFlow
                  ? (rationale?.movement === "weaken" ? "Active — destabilizing" : "Active commitment")
                  : (isReady ? "Chosen path" : "Working hypothesis")}
              </span>
            )}
            <span className="crpv-r-card-chevron">{expanded ? "▲" : "▼"}</span>
          </div>
        </div>

        {claimId && claimState && (
          <ClaimStateBadge state={claimState} claimId={claimId} size="sm" variant="inline" />
        )}

        {editorialLabel ? <p className="crpv-r-card-editorial-label">{editorialLabel}</p> : null}

        {route.short_description ? (
          <p className="crpv-r-card-desc">{route.short_description}</p>
        ) : null}

        {rationale ? (
          <div className="crpv-r-card-rationale">
            <div className="crpv-r-card-rationale-top">
              <span className="crpv-r-readiness-state">{rationale.readiness}</span>
              <span className="crpv-r-card-rationale-state">{rationale.movementLabel}</span>
              <span className="crpv-r-card-rationale-state">{displayConfidenceLabel(rationale.confidenceLabel)}</span>
            </div>
            {isHovered && !expanded ? <p className="crpv-r-card-rationale-copy">{rationale.whyThisRouteExists}</p> : null}
          </div>
        ) : null}

        <div className="crpv-r-card-meta">
          {steps.length > 0 ? (
            <span className="crpv-r-badge-ghost">{completedSteps}/{steps.length} STEPS</span>
          ) : null}
        </div>
      </button>

      {expanded ? (
        <div className="crpv-r-card-detail">
          {rationale ? (
            <div className="crpv-r-detail-section">
              <p className="crpv-r-detail-label">Why this direction</p>
              <div className="crpv-r-rationale-stack">
                <div className="crpv-r-rationale-row">
                  <span className="crpv-r-rationale-key">What the evidence shows</span>
                  <p>{rationale.whatSupportsIt}</p>
                </div>
                <div className="crpv-r-rationale-row">
                  <span className="crpv-r-rationale-key">What still needs proof</span>
                  <p>{rationale.mustBecomeTrue}</p>
                </div>
              </div>
            </div>
          ) : null}

          {steps.length > 0 ? (
            <div className="crpv-r-detail-section">
              <p className="crpv-r-detail-label">Steps</p>
              {steps.map((step) => (
                <div key={step.id} className="crpv-r-detail-row">
                  <span className={`crpv-r-dot ${step.status}`} title={statusTip(step.status)}>{statusGlyph(step.status)}</span>
                  <span>{step.title}</span>
                </div>
              ))}
            </div>
          ) : null}

          {evidence.length > 0 ? (
            <div className="crpv-r-detail-section">
              <p className="crpv-r-detail-label">Evidence needed</p>
              {evidence.map((item) => (
                <div key={item.id} className="crpv-r-detail-row">
                  <span className={`crpv-r-dot ${item.status}`} title={statusTip(item.status)}>{statusGlyph(item.status)}</span>
                  <span>{item.title}</span>
                </div>
              ))}
            </div>
          ) : null}

          {why.length > 0 ? (
            <div className="crpv-r-detail-section crpv-r-detail-why">
              <p className="crpv-r-detail-label">{isReady ? "Why this matters" : "Why this could matter"}</p>
              {why.map((reason, i) => (
                <div key={i} className="crpv-r-detail-row">
                  <span className="crpv-r-dot">·</span>
                  <span>{String(reason)}</span>
                </div>
              ))}
            </div>
          ) : null}

          {isOffStrategy && route.strategy_alignment_reason ? (
            <div className="crpv-r-detail-section">
              <p className="crpv-r-detail-label" style={{ color: "#999" }}>Strategy alignment note</p>
              <p style={{ fontSize: 11, color: "#999", margin: 0, lineHeight: 1.5, fontStyle: "italic" }}>
                {route.strategy_alignment_reason}
              </p>
            </div>
          ) : null}

          <div className="crpv-r-detail-section" style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            {onSelect && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelect(route); }}
                style={{
                  fontSize: 11,
                  color: isSelected ? R.inkFaint : R.ink,
                  textDecoration: "underline",
                  textUnderlineOffset: 2,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  fontFamily: R.mono,
                }}
              >
                {isSelected ? "Deselect" : isReady ? "Choose this path →" : "Add as hypothesis →"}
              </button>
            )}
            {onInspect && (
              <button
                type="button"
                className="crpv-r-inspect-btn"
                onClick={(e) => { e.stopPropagation(); onInspect(); }}
              >
                Inspect why →
              </button>
            )}
            {onReEvaluate && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onReEvaluate(); }}
                disabled={reEvalLoading}
                style={{
                  fontSize: 10,
                  color: "#aaa",
                  fontFamily: R.mono,
                  letterSpacing: "0.06em",
                  background: "none",
                  border: "none",
                  cursor: reEvalLoading ? "wait" : "pointer",
                  padding: 0,
                  opacity: reEvalLoading ? 0.5 : 1,
                }}
              >
                {reEvalLoading ? "Evaluating…" : "↻ Re-evaluate alignment"}
              </button>
            )}
            {onGenerateProposal && (
              <ProposeChangesButton
                surfaceType="route"
                surfaceId={route.id}
                onGenerate={onGenerateProposal}
                canGenerate={canGenerateRoute}
                generateLoading={generateLoading}
                hasPendingProposal={!!pendingProposal}
                variant="link"
                stopPropagation
                refreshKey={driftRefreshKey}
              />
            )}
            {onCheckDrift && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onCheckDrift(); }}
                disabled={checkingSurfaceId === route.id}
                style={{ fontSize: 10, color: checkingSurfaceId === route.id ? "#ccc" : "#bbb", background: "none", border: "none", cursor: checkingSurfaceId === route.id ? "wait" : "pointer", padding: 0, textDecoration: "underline", opacity: checkingSurfaceId === route.id ? 0.5 : 1 }}
              >
                {checkingSurfaceId === route.id ? "Checking…" : "Check for drift"}
              </button>
            )}
          </div>
          {generateMessage && (
            <p style={{ fontSize: 10, color: R.inkFaint, fontFamily: R.mono, margin: "4px 0 0", lineHeight: 1.4 }}>
              {generateMessage}
            </p>
          )}
          {pendingProposal && (
            <RouteProposalSection
              proposal={pendingProposal}
              onAcceptProposal={onAcceptProposal}
              onRejectProposal={onRejectProposal}
              acceptLoading={acceptLoading}
              rejectLoading={rejectLoading}
              canApply={canApply}
              canReject={canReject}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

function RoutesColumn({
  category,
  items,
  rationales,
  onInspect,
  selectedRouteId,
  onSelect,
  hoveredRouteId,
  onHover,
  isContextMatch,
  isContextDim,
  recommendedRouteId,
  recommendedReason,
  onStartRoute,
  isDeemphasized,
  isReady,
  hypothesisPhase,
  phase,
  subtitleOverride,
  recommendedLabel,
  recommendedReasonPrefix,
  editorialRoles,
  claimsMap,
  onReEvaluate,
  reEvalLoadingId,
  proposalsMap,
  onGenerateProposal,
  generateLoadingId,
  onAcceptProposal,
  onRejectProposal,
  canApply = true,
  canReject = true,
  canGenerate = true,
  acceptLoadingProposalId,
  rejectLoadingProposalId,
  driftRefreshKey,
  onCheckDrift,
  checkingSurfaceId,
}: {
  category: RouteCategory;
  items: RouteRow[];
  rationales: Map<string, RouteRationale>;
  onInspect?: (route: RouteRow) => void;
  selectedRouteId?: string | null;
  onSelect?: (route: RouteRow) => void;
  hoveredRouteId?: string | null;
  onHover?: (id: string | null) => void;
  isContextMatch?: boolean;
  isContextDim?: boolean;
  recommendedRouteId?: string | null;
  recommendedReason?: string | null;
  onStartRoute?: (route: RouteRow) => void;
  isDeemphasized?: boolean;
  isReady?: boolean;
  hypothesisPhase?: boolean;
  phase: string;
  subtitleOverride?: string;
  recommendedLabel?: string;
  recommendedReasonPrefix?: string;
  editorialRoles?: Map<string, RouteEditorialRole>;
  claimsMap?: Map<string, ClaimRow>;
  onReEvaluate?: (routeId: string) => void;
  reEvalLoadingId?: string | null;
  proposalsMap?: Map<string, RouteProposalRow>;
  onGenerateProposal?: (routeId: string) => void;
  generateLoadingId?: string | null;
  onAcceptProposal?: (proposalId: string, acceptedFields: string[], skippedFields: string[]) => void;
  onRejectProposal?: (proposalId: string) => void;
  canApply?: boolean;
  canReject?: boolean;
  canGenerate?: boolean;
  acceptLoadingProposalId?: string | null;
  rejectLoadingProposalId?: string | null;
  driftRefreshKey?: number;
  onCheckDrift?: (routeId: string) => void;
  checkingSurfaceId?: string | null;
}) {
  const meta = CATEGORY_META[category] ?? CATEGORY_META.improve;

  const sortedItems = useMemo(() => {
    return sortRoutesForPhase({
      items,
      rationales,
      phase,
      recommendedRouteId,
    });
  }, [items, phase, rationales, recommendedRouteId]);

  const recommendedRationale = useMemo(
    () => (recommendedRouteId ? rationales.get(recommendedRouteId) ?? null : null),
    [rationales, recommendedRouteId],
  );

  return (
    <section className="crpv-r-column">
      <div className="crpv-r-col-hd">
        <div className="crpv-r-col-hd-top">
          <span className="crpv-r-col-label">{meta.label}</span>
          <span className="crpv-r-col-count">{items.length}</span>
        </div>
        <p className="crpv-r-col-subtitle">{subtitleOverride || (hypothesisPhase ? meta.hypothesisSubtitle : meta.subtitle)}</p>
        {(isContextMatch || isContextDim) && (
          <p style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.1em", color: "#999", textTransform: "uppercase", margin: "0 0 10px", visibility: isContextMatch ? "visible" : "hidden" }}>
            Most relevant to this step
          </p>
        )}
        <div className="crpv-r-col-divider" />
      </div>

      <div className="crpv-r-card-stack" style={isDeemphasized ? { opacity: 0.7 } : undefined}>
        {sortedItems.length > 0 ? (
          sortedItems.map((route) => (
            <Fragment key={route.id}>
              {route.id === recommendedRouteId && isReady && !hypothesisPhase && (
                <div style={{ marginBottom: 6 }}>
                  <p style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.1em", color: "#999", textTransform: "uppercase", margin: "0 0 3px 0" }}>
                    {recommendedLabel || "Recommended starting point"}
                  </p>
                  {(recommendedRationale?.whatSupportsIt || recommendedReason) && (
                    <p style={{ fontSize: 11, color: "#888", margin: 0, lineHeight: 1.4 }}>
                      <span style={{ fontWeight: 600, color: "#666" }}>{recommendedReasonPrefix || "Why this: "}</span>{recommendedRationale?.whatSupportsIt || recommendedReason}
                    </p>
                  )}
                </div>
              )}
              {route.id === recommendedRouteId && hypothesisPhase && (
                <div style={{ marginBottom: 6 }}>
                  <p style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.1em", color: "#aaa", textTransform: "uppercase", margin: "0 0 3px 0" }}>
                    {recommendedLabel || "Strongest signal"}
                  </p>
                  {(recommendedRationale?.whyThisRouteExists || recommendedReason) && (
                    <p style={{ fontSize: 11, color: "#aaa", margin: 0, lineHeight: 1.4 }}>
                      <span style={{ fontWeight: 600 }}>{recommendedReasonPrefix || "If this is true: "}</span>{recommendedRationale?.whyThisRouteExists || recommendedReason}
                    </p>
                  )}
                </div>
              )}
              <RouteCard
                route={route}
                rationale={rationales.get(route.id) ?? null}
                onInspect={onInspect ? () => onInspect(route) : undefined}
                isSelected={selectedRouteId === route.id}
                isOtherSelected={!!selectedRouteId && selectedRouteId !== route.id}
                onSelect={onSelect}
                isHovered={!selectedRouteId && hoveredRouteId === route.id}
                isOtherHovered={!selectedRouteId && !!hoveredRouteId && hoveredRouteId !== route.id}
                onHover={onHover}
                isContextMatch={isContextMatch}
                isContextDim={isContextDim}
                isReady={isReady}
                phase={phase}
                editorialRole={editorialRoles?.get(route.id) ?? "default"}
                claimId={route.claim_id ?? null}
                claimState={route.claim_id ? (claimsMap?.get(route.claim_id)?.state ?? null) : null}
                phaseSoftened={softenRouteForPhase({
                  phase,
                  route,
                  rationale: rationales.get(route.id) ?? null,
                  recommendedRouteId,
                  selectedRouteId,
                })}
                onReEvaluate={onReEvaluate ? () => onReEvaluate(route.id) : undefined}
                reEvalLoading={reEvalLoadingId === route.id}
                pendingProposal={proposalsMap?.get(route.id) ?? null}
                onGenerateProposal={onGenerateProposal ? () => onGenerateProposal(route.id) : undefined}
                generateLoading={generateLoadingId === route.id}
                onAcceptProposal={onAcceptProposal}
                onRejectProposal={onRejectProposal}
                canApply={canApply}
                canReject={canReject}
                canGenerate={canGenerate}
                acceptLoading={acceptLoadingProposalId === (proposalsMap?.get(route.id)?.id ?? "")}
                rejectLoading={rejectLoadingProposalId === (proposalsMap?.get(route.id)?.id ?? "")}
                driftRefreshKey={driftRefreshKey}
                onCheckDrift={onCheckDrift ? () => onCheckDrift(route.id) : undefined}
                checkingSurfaceId={checkingSurfaceId}
              />
              {route.id === recommendedRouteId && onStartRoute && !hypothesisPhase && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onStartRoute(route); }}
                  style={{ fontSize: 11, color: "#555", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", padding: "4px 0 8px", display: "block" }}
                >
                  Start this route →
                </button>
              )}
            </Fragment>
          ))
        ) : (
          <div className="crpv-r-empty">No routes in this category yet.</div>
        )}
      </div>
    </section>
  );
}

// ─── Hierarchy: WRAP inline detail panel ─────────────────────────────────────

type WrapAlt  = { alternative_title: string; rejection_reason: string; considered_at?: string };
type WrapCond = { condition: string; satisfied_flag: boolean; evidence_refs?: string[] };

function HierarchyWrapPanel({
  alternatives,
  conditions,
  activeTab,
  onClose,
}: {
  alternatives: WrapAlt[];
  conditions: WrapCond[];
  activeTab: "alts" | "conditions";
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"alts" | "conditions">(activeTab);
  return (
    <div style={{ background: "#fff", border: `1px solid ${R.hairline}`, padding: "14px 18px", marginTop: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 14 }}>
          {(["alts", "conditions"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                fontFamily: R.mono,
                fontSize: 9, textTransform: "uppercase", letterSpacing: "0.14em",
                color: tab === t ? R.ink : R.inkFaint,
                fontWeight: tab === t ? 600 : 400,
                background: "none", border: "none", cursor: "pointer", padding: 0,
                borderBottom: tab === t ? `1px solid ${R.ink}` : "none", paddingBottom: 2,
              }}
            >
              {t === "alts"
                ? `Alternatives considered (${alternatives.length})`
                : `Conditions to meet (${conditions.length})`}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} style={{ fontFamily: R.mono, fontSize: 9, color: R.inkFaint, background: "none", border: "none", cursor: "pointer", padding: 0 }}>✕</button>
      </div>
      {tab === "alts" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {alternatives.length === 0 ? (
            <p style={{ fontSize: 12, color: R.inkFaint, margin: 0 }}>No alternatives recorded.</p>
          ) : alternatives.map((a, i) => (
            <div key={i} style={{ paddingLeft: 10, borderLeft: `2px solid ${R.hairlineFaint}` }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: R.ink, margin: 0 }}>{a.alternative_title}</p>
              <p style={{ fontSize: 11, color: R.inkSoft, margin: "3px 0 0", lineHeight: 1.45 }}>Rejected: {a.rejection_reason}</p>
            </div>
          ))}
        </div>
      )}
      {tab === "conditions" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {conditions.length === 0 ? (
            <p style={{ fontSize: 12, color: R.inkFaint, margin: 0 }}>No conditions recorded.</p>
          ) : conditions.map((cond, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{
                flexShrink: 0, width: 13, height: 13, borderRadius: "50%",
                border: `1.5px solid ${cond.satisfied_flag ? R.signal : R.hairline}`,
                background: cond.satisfied_flag ? R.signal : "transparent",
                display: "inline-flex", alignItems: "center", justifyContent: "center", marginTop: 2,
              }}>
                {cond.satisfied_flag && <span style={{ color: "#fff", fontSize: 7 }}>✓</span>}
              </span>
              <p style={{ fontSize: 12, color: cond.satisfied_flag ? R.inkSoft : R.ink, margin: 0, lineHeight: 1.45 }}>
                {cond.condition}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Hierarchy: constants ─────────────────────────────────────────────────────

const HIERARCHY_STATE_ACCENT: Record<string, string> = {
  flow:         R.signal,
  focus:        R.signal,
  diagnose:     R.signal,
  outside_view: R.inkFaint,
};

const HIERARCHY_STATE_LABEL: Record<string, string> = {
  flow:         "Commitment active",
  focus:        "In focus",
  diagnose:     "Being diagnosed",
  outside_view: "Outside view",
};

const HIERARCHY_FRAMING: Record<string, { heading: string; body: string }> = {
  flow:         { heading: "Active commitments",      body: "The organization has committed to these directions. Focus is on strengthening evidence and closing execution gaps." },
  focus:        { heading: "Priority routes",         body: "Evidence validates these as the most actionable directions. The work is narrowing from candidate to chosen path." },
  diagnose:     { heading: "Routes under consideration", body: "Candidate directions grounded in internal evidence. Customer validation is the next layer needed to focus around one." },
  outside_view: { heading: "Early directions",        body: "These routes are based on outside signals. You'll still need to validate them internally and with customers before committing." },
};

// ─── Hierarchy spec §4-§7: visual system ─────────────────────────────────────

const HIERARCHY_HERO: Record<string, { before: string; signal: string }> = {
  flow:         { before: "Active",       signal: "Commitments" },
  focus:        { before: "Priority",     signal: "Routes" },
  diagnose:     { before: "Routes Under", signal: "Consideration" },
  outside_view: { before: "Early",        signal: "Directions" },
};

function splitActionText(text: string): [string, string] {
  const words = text.split(" ");
  const split = Math.max(2, Math.ceil(words.length * 0.45));
  return [words.slice(0, split).join(" "), words.slice(split).join(" ")];
}

// Ring button — standalone interactive (use only where NOT nested in a button parent)
function ExpandRingBtn({ open, onClick }: { open: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={open ? "Collapse" : "Expand"}
      style={{
        width: 28, height: 28, borderRadius: "50%",
        border: `1.5px solid ${open ? R.ink : R.hairline}`,
        background: open ? R.ink : "transparent",
        color: open ? "#fff" : "rgba(17,17,17,0.45)",
        cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: R.mono, fontSize: 15, lineHeight: 1, fontWeight: 400,
        flexShrink: 0,
      }}
    >
      {open ? "−" : "+"}
    </button>
  );
}

// Visual-only ring indicator — use inside a <button> parent (no nested button)
function ExpandRingIndicator({ open }: { open: boolean }) {
  return (
    <span style={{
      width: 26, height: 26, borderRadius: "50%",
      border: `1.5px solid ${open ? R.ink : R.hairline}`,
      background: open ? R.ink : "transparent",
      color: open ? "#fff" : "rgba(17,17,17,0.45)",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontFamily: R.mono, fontSize: 14, lineHeight: 1, fontWeight: 400,
      flexShrink: 0,
    }}>
      {open ? "−" : "+"}
    </span>
  );
}

function InkMetaChip({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 5, alignItems: "baseline" }}>
      <span style={{ fontFamily: R.mono, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(17,17,17,0.4)" }}>{label}</span>
      <span style={{ fontFamily: R.mono, fontSize: 10, fontWeight: 600, color: accent ? R.signal : "rgba(17,17,17,0.65)" }}>{value}</span>
    </div>
  );
}

function RouteStateTag({ claimState }: { claimState: ClaimState }) {
  const isDiagnose = claimState === "diagnose";
  const label = HIERARCHY_STATE_LABEL[claimState] ?? claimState;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontFamily: R.mono, fontSize: 8.5, textTransform: "uppercase", letterSpacing: "0.1em",
      color: isDiagnose ? R.signal : "rgba(17,17,17,0.5)",
      padding: "2px 7px",
      background: isDiagnose ? "rgba(255,91,41,0.12)" : "rgba(17,17,17,0.05)",
      borderRadius: 2,
    }}>
      {isDiagnose && (
        <span className="crpv-pulse-dot" style={{
          width: 5, height: 5, borderRadius: "50%",
          background: R.signal, flexShrink: 0, display: "inline-block",
        }} />
      )}
      {label}
    </span>
  );
}

function ScoreChip({ label, value, accent, dim }: { label: string; value: number; accent?: boolean; dim?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", padding: "0 14px" }}>
      <span style={{
        fontFamily: R.mono, fontSize: 22, fontWeight: 500,
        color: accent ? R.signal : dim ? "rgba(17,17,17,0.35)" : R.ink,
        lineHeight: 1, fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </span>
      <span style={{
        fontFamily: R.mono, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.12em",
        color: "rgba(17,17,17,0.4)", marginTop: 3,
      }}>
        {label}
      </span>
    </div>
  );
}

function HierarchyScoreStrip({ current, reachable, unlockable }: { current: number; reachable: number; unlockable: number }) {
  const max = Math.max(unlockable, 100);
  const filledPct   = (current / max) * 100;
  const reachPct    = (reachable / max) * 100;
  const unlockPct   = (unlockable / max) * 100;
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      borderTop: `1px solid ${R.hairline}`, borderBottom: `1px solid ${R.hairline}`,
      padding: "16px 0", marginBottom: 48,
    }}>
      {/* Left: thin segmented bar */}
      <div style={{ flex: 1, position: "relative", height: 3, background: "rgba(17,17,17,0.08)", borderRadius: 1, overflow: "hidden", marginRight: 24 }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${filledPct}%`, background: R.ink, borderRadius: 1 }} />
        {reachPct > filledPct && (
          <div style={{ position: "absolute", left: `${filledPct}%`, top: 0, height: "100%", width: `${reachPct - filledPct}%`, background: R.ink, opacity: 0.22, borderRadius: 1 }} />
        )}
        {unlockPct > reachPct && (
          <div style={{ position: "absolute", left: `${reachPct}%`, top: 0, height: "100%", width: `${unlockPct - reachPct}%`, background: R.signal, opacity: 0.55, borderRadius: 1 }} />
        )}
      </div>
      {/* Right: compact score chips */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, flexShrink: 0, borderLeft: `1px solid ${R.hairline}` }}>
        <ScoreChip label="NOW" value={current} accent />
        <span style={{ fontFamily: R.mono, fontSize: 12, color: "rgba(17,17,17,0.25)", padding: "0 4px" }}>→</span>
        <ScoreChip label="REACHABLE" value={Math.round(reachable)} />
        <span style={{ fontFamily: R.mono, fontSize: 12, color: "rgba(17,17,17,0.25)", padding: "0 4px" }}>→</span>
        <ScoreChip label="UNLOCKABLE" value={Math.round(unlockable)} dim />
      </div>
    </div>
  );
}

function KeystoneStripe({ action, scoreLift }: { action: string; scoreLift: number }) {
  const [actionBefore, actionSignal] = splitActionText(action);
  return (
    <div style={{
      background: R.ink,
      marginLeft: -60, width: "calc(100% + 120px)",
      padding: "28px 60px",
      marginBottom: 48,
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 32,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: R.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(246,246,244,0.45)", margin: "0 0 10px" }}>
          § KEY MOVE
        </p>
        <p style={{ fontFamily: R.sans, fontSize: 18, fontWeight: 600, color: "#f6f6f4", lineHeight: 1.45, margin: 0, maxWidth: 580 }}>
          {actionBefore}{" "}
          <span style={{ color: R.signal }}>{actionSignal}</span>
        </p>
      </div>
      <div style={{ flexShrink: 0, textAlign: "right" }}>
        <p style={{ fontFamily: R.mono, fontSize: 52, fontWeight: 500, color: R.signal, lineHeight: 1, margin: 0, fontVariantNumeric: "tabular-nums" }}>
          +{scoreLift}
        </p>
        <p style={{ fontFamily: R.mono, fontSize: 8.5, color: "rgba(246,246,244,0.45)", textTransform: "uppercase", letterSpacing: "0.12em", margin: "4px 0 0" }}>
          PTS REACHABLE
        </p>
      </div>
    </div>
  );
}

function HierarchyPageHeader({
  framing,
  current,
  reachable,
  unlockable,
  dominantState,
}: {
  framing: { heading: string; body: string };
  current: number;
  reachable: number;
  unlockable: number;
  dominantState: string | null;
}) {
  const hero = HIERARCHY_HERO[dominantState ?? "diagnose"] ?? HIERARCHY_HERO.diagnose;
  return (
    <div style={{ marginBottom: 0 }}>
      {/* Eyebrow */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: R.signal, display: "inline-block", flexShrink: 0 }} />
        <span style={{ fontFamily: R.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.16em", color: "rgba(17,17,17,0.4)" }}>
          Strategy · Route Plan
        </span>
      </div>
      {/* Hero H1 — supporting weight; § DESTINATION is the page's visual lead */}
      <h1 style={{ fontFamily: R.sans, fontSize: 30, fontWeight: 700, color: R.ink, margin: "0 0 10px", lineHeight: 1.05, letterSpacing: "-0.022em", maxWidth: 720 }}>
        {hero.before}{" "}
        <span style={{ color: R.signal }}>{hero.signal}</span>
      </h1>
      {/* Subhead */}
      <p style={{ fontFamily: R.sans, fontSize: 13, color: "rgba(17,17,17,0.55)", margin: "0 0 32px", lineHeight: 1.55, maxWidth: 600 }}>
        {framing.body}
      </p>
      {/* Score strip */}
      <HierarchyScoreStrip current={current} reachable={reachable} unlockable={unlockable} />
    </div>
  );
}

function LegRow({
  leg,
  index,
  isLead,
  expanded,
  onToggle,
  claimsMap,
  rationale,
  routeClaimState,
  onSaveField,
  phase,
  onDriftClick,
  driftRefreshKey,
  onCheckDrift,
  checkingSurfaceId,
}: {
  leg: RouteRow;
  index: number;
  isLead?: boolean;
  expanded: boolean;
  onToggle: () => void;
  claimsMap?: Map<string, ClaimRow>;
  rationale?: RouteRationale | null;
  routeClaimState?: ClaimState | null;
  onSaveField?: (legId: string, field: "title" | "short_description", value: string) => Promise<void>;
  phase?: EngagementPhase;
  onDriftClick?: (surfaceType: string, surfaceId: string) => void;
  driftRefreshKey?: number;
  onCheckDrift?: (routeId: string) => void;
  checkingSurfaceId?: string | null;
}) {
  const legClaimState = leg.claim_id
    ? ((claimsMap?.get(leg.claim_id)?.state ?? null) as ClaimState | null)
    : null;
  const showLegStateTag = legClaimState !== null && legClaimState !== routeClaimState;
  const steps    = (Array.isArray(leg.steps_json)    ? leg.steps_json    : []) as DetailItem[];
  const evidence = (Array.isArray(leg.evidence_json) ? leg.evidence_json : []) as DetailItem[];
  const conditions = (Array.isArray(leg.what_would_have_to_be_true) ? leg.what_would_have_to_be_true : []) as WrapCond[];
  const completedSteps = steps.filter((s) => s.status === "complete").length;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "80px 1fr auto",
        borderTop: `1px solid ${R.hairlineFaint}`,
        padding: "18px 0",
        transition: "background 0.12s",
      }}
    >
      {/* Col 1: index numeral */}
      <div style={{ paddingLeft: 4, paddingTop: 2 }}>
        <span style={{
          fontFamily: R.mono, fontSize: 36, fontWeight: 400,
          color: isLead ? R.signal : "rgba(17,17,17,0.15)",
          lineHeight: 1, fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.02em", display: "block",
        }}>
          {String(index).padStart(2, "0")}
        </span>
      </div>

      {/* Col 2: content */}
      <div style={{ minWidth: 0 }}>
        {/* Status pill + title row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 5 }}>
          {showLegStateTag && legClaimState && <RouteStateTag claimState={legClaimState} />}
          <h3 style={{ fontFamily: R.sans, fontSize: 18, fontWeight: 600, color: R.ink, margin: 0, lineHeight: 1.2, letterSpacing: "-0.01em", flex: 1, minWidth: 0 }}>
            <InlineTextEdit
              value={leg.title || ""}
              onSave={onSaveField ? (v) => onSaveField(leg.id, "title", v) : async () => {}}
              placeholder="Untitled leg"
              disabled={!onSaveField}
              style={{ fontFamily: R.sans, fontSize: 18, fontWeight: 600, color: R.ink, lineHeight: 1.2, letterSpacing: "-0.01em" }}
            />
          </h3>
          {onDriftClick && (
            <DriftBadge
              surfaceType="route"
              surfaceId={leg.id}
              phase={phase}
              refreshKey={driftRefreshKey}
              onClick={(a) => onDriftClick("route", a.surface_id)}
            />
          )}
          {onCheckDrift && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onCheckDrift(leg.id); }}
              disabled={checkingSurfaceId === leg.id}
              style={{ fontSize: 10, fontFamily: R.mono, letterSpacing: "0.06em", color: checkingSurfaceId === leg.id ? "#ccc" : "#aaa", background: "none", border: "none", cursor: checkingSurfaceId === leg.id ? "wait" : "pointer", padding: 0, textDecoration: "underline", opacity: checkingSurfaceId === leg.id ? 0.5 : 1, flexShrink: 0 }}
            >
              {checkingSurfaceId === leg.id ? "Checking…" : "Check for drift"}
            </button>
          )}
        </div>
        {/* Summary */}
        <InlineTextareaEdit
          value={leg.short_description || ""}
          onSave={onSaveField ? (v) => onSaveField(leg.id, "short_description", v) : async () => {}}
          placeholder="Add a description…"
          disabled={!onSaveField}
          rows={2}
          style={{ fontFamily: R.sans, fontSize: 14, color: "rgba(17,17,17,0.65)", marginBottom: 8, lineHeight: 1.55 }}
        />
        {/* Meta line */}
        {steps.length > 0 && (
          <span style={{ fontFamily: R.mono, fontSize: 9, color: "rgba(17,17,17,0.4)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            {completedSteps}/{steps.length} STEPS
          </span>
        )}
        {/* Expanded detail panel */}
        {expanded && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, marginTop: 22, paddingTop: 18, borderTop: `1px solid ${R.hairlineFaint}` }}>
            {/* Left: Why + Steps */}
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {rationale && (
                <div>
                  <p style={{ fontFamily: R.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(17,17,17,0.4)", margin: "0 0 8px" }}>
                    Why This Direction
                  </p>
                  <p style={{ fontFamily: R.sans, fontSize: 13, color: "rgba(17,17,17,0.8)", lineHeight: 1.6, margin: 0 }}>
                    {rationale.whatSupportsIt}
                  </p>
                  {rationale.mustBecomeTrue && (
                    <p style={{ fontFamily: R.sans, fontSize: 13, color: "rgba(17,17,17,0.55)", lineHeight: 1.55, margin: "6px 0 0", fontStyle: "italic" }}>
                      Still needed: {rationale.mustBecomeTrue}
                    </p>
                  )}
                </div>
              )}
              {conditions.length > 0 && (
                <div>
                  <p style={{ fontFamily: R.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(17,17,17,0.4)", margin: "0 0 8px" }}>
                    What Would Have to Be True
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {conditions.map((cond, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <span style={{
                          width: 11, height: 11, borderRadius: 2, flexShrink: 0, marginTop: 3,
                          border: `1.5px solid ${cond.satisfied_flag ? R.signal : R.hairline}`,
                          background: cond.satisfied_flag ? R.signal : "transparent",
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {cond.satisfied_flag && <span style={{ color: "#fff", fontSize: 7 }}>✓</span>}
                        </span>
                        <span style={{ fontFamily: R.sans, fontSize: 13, color: cond.satisfied_flag ? "rgba(17,17,17,0.55)" : R.ink, lineHeight: 1.45 }}>
                          {cond.condition}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {steps.length > 0 && (
                <div>
                  <p style={{ fontFamily: R.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(17,17,17,0.4)", margin: "0 0 8px" }}>
                    Steps
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {steps.map((step) => (
                      <div key={step.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <span style={{ fontFamily: R.mono, fontSize: 11, color: step.status === "complete" ? R.signal : "rgba(17,17,17,0.35)", flexShrink: 0, marginTop: 1 }}>
                          {statusGlyph(step.status)}
                        </span>
                        <span style={{ fontFamily: R.sans, fontSize: 13, color: step.status === "complete" ? "rgba(17,17,17,0.55)" : R.ink, lineHeight: 1.45 }}>
                          {step.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {/* Right: Evidence needed */}
            <div>
              {evidence.length > 0 ? (
                <div>
                  <p style={{ fontFamily: R.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(17,17,17,0.4)", margin: "0 0 8px" }}>
                    Evidence Needed
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {evidence.map((item) => (
                      <div key={item.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <span style={{ fontFamily: R.mono, fontSize: 11, color: item.status === "complete" ? R.signal : "rgba(17,17,17,0.35)", flexShrink: 0, marginTop: 1 }}>
                          {statusGlyph(item.status)}
                        </span>
                        <span style={{ fontFamily: R.sans, fontSize: 13, color: item.status === "complete" ? "rgba(17,17,17,0.55)" : R.ink, lineHeight: 1.45 }}>
                          {item.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p style={{ fontFamily: R.sans, fontSize: 13, color: "rgba(17,17,17,0.4)", margin: 0 }}>No evidence items recorded.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Col 3: expand button */}
      <div style={{ paddingLeft: 16, paddingTop: 2 }}>
        <ExpandRingBtn open={expanded} onClick={onToggle} />
      </div>
    </div>
  );
}

function HierarchyRouteSection({
  route,
  legs,
  index,
  isLead,
  claimsMap,
  rationales,
  selectedRouteId,
  defaultExpanded,
  recommendedRouteId: _recommendedRouteId,
  onSaveField,
  phase,
  onDriftClick,
  driftRefreshKey,
  onCheckDrift,
  checkingSurfaceId,
}: {
  route: RouteRow;
  legs: RouteRow[];
  index: number;
  isLead?: boolean;
  claimsMap?: Map<string, ClaimRow>;
  rationales: Map<string, RouteRationale>;
  selectedRouteId?: string | null;
  defaultExpanded?: boolean;
  recommendedRouteId?: string | null;
  onSaveField?: (routeOrLegId: string, field: "title" | "short_description", value: string) => Promise<void>;
  phase?: EngagementPhase;
  onDriftClick?: (surfaceType: string, surfaceId: string) => void;
  driftRefreshKey?: number;
  onCheckDrift?: (routeId: string) => void;
  checkingSurfaceId?: string | null;
}) {
  const [collapsed, setCollapsed] = useState(!defaultExpanded);
  const [expandedLegId, setExpandedLegId] = useState<string | null>(null);

  const claimState = route.claim_id
    ? ((claimsMap?.get(route.claim_id)?.state ?? null) as ClaimState | null)
    : null;
  // FND-4 (display-only): WRAP grounding lives on the bets (legs), not the parent
  // grouping — its own field is empty. Aggregate the chip counts from the legs prop.
  const alternatives  = legs.flatMap((l) => (Array.isArray(l.rejected_alternatives) ? l.rejected_alternatives : []));
  const conditions    = legs.flatMap((l) => (Array.isArray(l.what_would_have_to_be_true) ? l.what_would_have_to_be_true : []));
  const metConditions = conditions.filter((c: WrapCond) => c.satisfied_flag).length;
  const isCommitted   = legs.some((l) => l.id === selectedRouteId);
  const isMonitored   = claimState === "diagnose" || claimState === "focus" || claimState === "flow";

  function toggleLeg(legId: string) {
    setExpandedLegId((prev) => (prev === legId ? null : legId));
  }

  return (
    <div style={{ borderTop: `1px solid ${R.hairline}` }}>
      {/* Route header — div role=button avoids nested button issue */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setCollapsed((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setCollapsed((v) => !v); }}
        style={{ display: "flex", width: "100%", alignItems: "flex-start", gap: 24, padding: "28px 0", cursor: "pointer" }}
      >
        {/* § number */}
        <div style={{ flexShrink: 0, width: 48, paddingTop: 3 }}>
          <span style={{ fontFamily: R.mono, fontSize: 11, color: "rgba(17,17,17,0.4)", letterSpacing: "0.08em" }}>
            § {String(index).padStart(2, "0")}
          </span>
        </div>
        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Meta row */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
            <span style={{ fontFamily: R.mono, fontSize: 9, color: "rgba(17,17,17,0.4)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
              Route · {legs.length} {legs.length === 1 ? "leg" : "legs"}
            </span>
            {isLead && (
              <span style={{ fontFamily: R.mono, fontSize: 9, color: R.signal, textTransform: "uppercase", letterSpacing: "0.1em" }}>◆ Lead route</span>
            )}
            {claimState && <RouteStateTag claimState={claimState} />}
            {onDriftClick && (
              <DriftBadge
                surfaceType="route"
                surfaceId={route.id}
                phase={phase}
                refreshKey={driftRefreshKey}
                onClick={(a) => onDriftClick("route", a.surface_id)}
              />
            )}
            {onCheckDrift && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onCheckDrift(route.id); }}
                disabled={checkingSurfaceId === route.id}
                style={{ fontSize: 10, fontFamily: R.mono, letterSpacing: "0.06em", color: checkingSurfaceId === route.id ? "#ccc" : "#aaa", background: "none", border: "none", cursor: checkingSurfaceId === route.id ? "wait" : "pointer", padding: 0, textDecoration: "underline", opacity: checkingSurfaceId === route.id ? 0.5 : 1, flexShrink: 0 }}
              >
                {checkingSurfaceId === route.id ? "Checking…" : "Check for drift"}
              </button>
            )}
          </div>
          {/* H2 title */}
          <h2 style={{ fontFamily: R.sans, fontSize: 26, fontWeight: 700, color: R.ink, margin: "0 0 10px", lineHeight: 1.15, letterSpacing: "-0.015em" }}>
            <InlineTextEdit
              value={route.title || ""}
              onSave={onSaveField ? (v) => onSaveField(route.id, "title", v) : async () => {}}
              placeholder="Untitled route"
              disabled={!onSaveField}
              style={{ fontFamily: R.sans, fontSize: 26, fontWeight: 700, color: R.ink, lineHeight: 1.15, letterSpacing: "-0.015em" }}
            />
          </h2>
          {/* Summary */}
          <InlineTextareaEdit
            value={route.short_description || ""}
            onSave={onSaveField ? (v) => onSaveField(route.id, "short_description", v) : async () => {}}
            placeholder="Add a description…"
            disabled={!onSaveField}
            rows={2}
            style={{ fontFamily: R.sans, fontSize: 15, color: "rgba(17,17,17,0.65)", marginBottom: 14, lineHeight: 1.6, maxWidth: 620 }}
          />
          {/* WRAP meta line */}
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <InkMetaChip label="Alternatives" value={String(alternatives.length)} />
            <InkMetaChip
              label="Conditions"
              value={`${conditions.length}${metConditions > 0 ? ` · ${metConditions} met` : ""}`}
            />
            <InkMetaChip label="Commitment" value={isCommitted ? "Active" : "Not yet"} accent={isCommitted} />
            <InkMetaChip label="Monitoring" value={isMonitored ? "Active" : "Not yet"} />
          </div>
        </div>
        {/* Expand indicator (visual only — parent div handles click) */}
        <div style={{ flexShrink: 0, paddingTop: 4 }}>
          <ExpandRingIndicator open={!collapsed} />
        </div>
      </div>

      {/* Collapsible leg list */}
      {!collapsed && (
        <div style={{ paddingBottom: 32 }}>
          {legs.length === 0 ? (
            <p style={{ fontFamily: R.sans, fontSize: 13, color: "rgba(17,17,17,0.4)", paddingLeft: 72, margin: 0 }}>
              No legs assigned to this route.
            </p>
          ) : legs.map((leg, legIdx) => (
            <LegRow
              key={leg.id}
              leg={leg}
              index={legIdx + 1}
              isLead={legIdx === 0}
              expanded={expandedLegId === leg.id}
              onToggle={() => toggleLeg(leg.id)}
              claimsMap={claimsMap}
              rationale={rationales.get(leg.id) ?? null}
              routeClaimState={claimState}
              onSaveField={onSaveField}
              phase={phase}
              onDriftClick={onDriftClick}
              driftRefreshKey={driftRefreshKey}
              onCheckDrift={onCheckDrift}
              checkingSurfaceId={checkingSurfaceId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Hierarchy: group card (legacy — kept for non-spec clients) ───────────────

function HierarchyGroupCard({
  route,
  legs,
  claimsMap,
  rationales,
  selectedRouteId,
  onSelect,
  onInspect,
  isReady,
  phase,
  editorialRoles,
  recommendedRouteId,
}: {
  route: RouteRow;
  legs: RouteRow[];
  claimsMap?: Map<string, ClaimRow>;
  rationales: Map<string, RouteRationale>;
  selectedRouteId?: string | null;
  onSelect?: (route: RouteRow) => void;
  onInspect?: (route: RouteRow) => void;
  isReady?: boolean;
  phase: string;
  editorialRoles?: Map<string, RouteEditorialRole>;
  recommendedRouteId?: string | null;
}) {
  const [expanded, setExpanded] = useState(true);
  const [wrapOpen, setWrapOpen] = useState(false);
  const [wrapTab, setWrapTab] = useState<"alts" | "conditions">("alts");

  const claimState = route.claim_id
    ? ((claimsMap?.get(route.claim_id)?.state ?? null) as ClaimState | null)
    : null;
  const stateAccent = HIERARCHY_STATE_ACCENT[claimState ?? "outside_view"] ?? "#6E847F";
  const stateLabel  = claimState ? (HIERARCHY_STATE_LABEL[claimState] ?? null) : null;

  const alternatives  = Array.isArray(route.rejected_alternatives)      ? route.rejected_alternatives      : [];
  const conditions    = Array.isArray(route.what_would_have_to_be_true) ? route.what_would_have_to_be_true : [];
  const metConditions = conditions.filter((c) => c.satisfied_flag).length;
  const isCommitted   = legs.some((l) => l.id === selectedRouteId);
  const isMonitored   = claimState === "diagnose" || claimState === "focus" || claimState === "flow";

  function openWrap(tab: "alts" | "conditions") {
    if (wrapOpen && wrapTab === tab) setWrapOpen(false);
    else { setWrapTab(tab); setWrapOpen(true); }
  }

  return (
    <div style={{ borderLeft: `3px solid ${stateAccent}`, borderBottom: `1px solid ${R.hairline}` }}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{ display: "flex", width: "100%", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "16px 20px 8px 20px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h3 style={{ fontFamily: R.sans, fontSize: 15, fontWeight: 700, color: R.ink, margin: 0, lineHeight: 1.2, letterSpacing: "-0.01em" }}>
              {route.title || "Untitled route"}
            </h3>
            {claimState && (
              <ClaimStateBadge state={claimState} claimId={route.claim_id ?? ""} size="sm" variant="inline" />
            )}
            <span style={{ fontFamily: R.mono, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.12em", color: R.inkFaint }}>
              {legs.length} {legs.length === 1 ? "leg" : "legs"}
            </span>
          </div>
          {route.short_description && (
            <p style={{ fontFamily: R.sans, fontSize: 12, color: R.inkSoft, marginTop: 4, lineHeight: 1.5, maxWidth: 680 }}>
              {route.short_description}
            </p>
          )}
        </div>
        <span style={{ flexShrink: 0, color: R.inkFaint, paddingTop: 2, fontSize: 11 }}>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {/* WRAP indicators — compact mono line */}
      <div style={{ display: "flex", flexWrap: "wrap", padding: "0 20px 10px 20px", borderBottom: expanded ? `1px solid ${R.hairlineFaint}` : "none" }}>
        <button type="button" onClick={() => openWrap("alts")} style={{ display: "flex", gap: 6, alignItems: "baseline", padding: "2px 16px 2px 0", background: "none", border: "none", cursor: alternatives.length > 0 ? "pointer" : "default" }}>
          <span style={{ fontFamily: R.mono, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.12em", color: R.inkFaint }}>ALTERNATIVES</span>
          <span style={{ fontFamily: R.mono, fontSize: 10, fontWeight: 600, color: alternatives.length > 0 ? R.ink : R.inkFaint }}>{alternatives.length}</span>
        </button>
        <button type="button" onClick={() => openWrap("conditions")} style={{ display: "flex", gap: 6, alignItems: "baseline", padding: "2px 16px 2px 0", background: "none", border: "none", cursor: conditions.length > 0 ? "pointer" : "default" }}>
          <span style={{ fontFamily: R.mono, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.12em", color: R.inkFaint }}>CONDITIONS</span>
          <span style={{ fontFamily: R.mono, fontSize: 10, fontWeight: 600, color: conditions.length > 0 ? R.ink : R.inkFaint }}>
            {conditions.length}
            {conditions.length > 0 && (
              <span style={{ fontWeight: 400, color: metConditions > 0 ? R.signal : R.inkFaint, fontSize: 9 }}> ({metConditions} met)</span>
            )}
          </span>
        </button>
        <div style={{ display: "flex", gap: 6, alignItems: "baseline", padding: "2px 16px 2px 0" }}>
          <span style={{ fontFamily: R.mono, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.12em", color: R.inkFaint }}>COMMITMENT</span>
          <span style={{ fontFamily: R.mono, fontSize: 10, fontWeight: 600, color: isCommitted ? R.signal : R.inkFaint }}>{isCommitted ? "Active" : "Not yet"}</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "baseline", padding: "2px 16px 2px 0" }}>
          <span style={{ fontFamily: R.mono, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.12em", color: R.inkFaint }}>MONITORING</span>
          <span style={{ fontFamily: R.mono, fontSize: 10, fontWeight: 600, color: isMonitored ? R.ink : R.inkFaint }}>{isMonitored ? "Active" : "Not yet"}</span>
        </div>
        {stateLabel && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "baseline", padding: "2px 0" }}>
            <span style={{ fontFamily: R.mono, fontSize: 8.5, textTransform: "uppercase", letterSpacing: "0.12em", color: stateAccent, fontWeight: 600 }}>{stateLabel}</span>
          </div>
        )}
      </div>

      {/* WRAP detail panel */}
      {wrapOpen && (
        <div style={{ padding: "0 20px 12px" }}>
          <HierarchyWrapPanel
            alternatives={alternatives}
            conditions={conditions}
            activeTab={wrapTab}
            onClose={() => setWrapOpen(false)}
          />
        </div>
      )}

      {/* Nested legs */}
      {expanded && (
        <div style={{ paddingLeft: 16 }}>
          {legs.length === 0 ? (
            <p style={{ fontFamily: R.sans, fontSize: 12, color: R.inkFaint, padding: "12px 0" }}>No legs assigned to this route.</p>
          ) : (
            legs.map((leg) => (
              <RouteCard
                key={leg.id}
                route={leg}
                rationale={rationales.get(leg.id) ?? null}
                onInspect={onInspect ? () => onInspect(leg) : undefined}
                isSelected={selectedRouteId === leg.id}
                isOtherSelected={!!selectedRouteId && selectedRouteId !== leg.id}
                onSelect={onSelect}
                isReady={isReady}
                phase={phase}
                editorialRole={editorialRoles?.get(leg.id) ?? "default"}
                claimId={leg.claim_id ?? null}
                claimState={leg.claim_id ? ((claimsMap?.get(leg.claim_id)?.state ?? null) as ClaimState | null) : null}
                phaseSoftened={softenRouteForPhase({
                  phase,
                  route: leg,
                  rationale: rationales.get(leg.id) ?? null,
                  recommendedRouteId: recommendedRouteId ?? null,
                  selectedRouteId: selectedRouteId ?? null,
                })}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Hierarchy: desired outcome banner ───────────────────────────────────────

export function DesiredOutcomeBanner({ outcome }: { outcome: DesiredOutcomeRow }) {
  if (!outcome.statement) return null;
  return (
    <div style={{ borderLeft: `5px solid ${R.signal}`, paddingLeft: 24, marginBottom: 52 }}>
      <p style={{ fontFamily: R.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.14em", color: R.signal, margin: "0 0 12px" }}>
        § Destination
      </p>
      <p style={{ fontFamily: R.sans, fontSize: 32, fontWeight: 800, color: R.ink, margin: 0, lineHeight: 1.2, letterSpacing: "-0.02em", maxWidth: 680 }}>
        {outcome.statement}
      </p>
      {outcome.metric && (
        <p style={{ fontFamily: R.sans, fontSize: 13, color: R.inkSoft, margin: "14px 0 0", lineHeight: 1.5 }}>
          <span style={{ fontFamily: R.mono, fontSize: 8.5, textTransform: "uppercase", letterSpacing: "0.1em", color: R.inkFaint }}>Leading Indicator</span>
          {" · "}{outcome.metric}
        </p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientRefinePreviewRoutesView() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { companies, setActiveCompanyId, loading: companiesLoading } = useCompany();
  const { activeCompany, hasCompany, confidence } = useClientViewData({ actionLimit: 5 });
  const [routesRefreshKey, setRoutesRefreshKey] = useState(0);
  const { loading: routesLoading, items: routes } = useRoutes(activeCompany?.id, routesRefreshKey);
  // ─── All data-fetching hooks before any callbacks ────────────────────────────
  const { needs } = useOdiNeeds(activeCompany?.id);
  const { preferredRun: baselineRun } = usePublicBaseline(activeCompany?.id);
  const { item: positioning } = usePositioningCanvas(activeCompany?.id);
  const { item: strategy } = useStrategyCascade(activeCompany?.id);
  const [activeStage, setActiveStage] = useState<SignalStage>("org");
  const [showHeaderSwitcher, setShowHeaderSwitcher] = useState(false);
  const headerSwitcherRef = useRef<HTMLDivElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const phase = floorEngagementPhase({
    phase: activeCompany?.engagement_phase ?? "outside_signals",
    hasNeedsWithScores: needs.some((n) => n.importance > 0),
    hasSelectedRoute: !!activeCompany?.selected_route_id,
  });
  const routeIdParam = searchParams.get("routeId");
  const baseline = baselineOf(baselineRun);
  const excludedCount = activeCompany?.excluded_signals_json?.length ?? 0;

  const { totalUnresolved: inboxCount, newCount: inboxNewCount } = useDriftInboxCount(activeCompany?.id);

  const goToMainSite   = useCallback(() => navigate("/"), [navigate]);
  const goToRefineHome = useCallback(() => navigate(CLIENT_REFINE_PREVIEW_ROUTE), [navigate]);
  const goToWorkshop   = useCallback(() => navigate(CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE), [navigate]);

  const handleStageChange = useCallback((stage: SignalStage) => {
    setActiveStage(stage);
    navigate(`${CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE}?stage=${stage}`);
  }, [navigate]);

  const clearRouteIdParam = useCallback(() => {
    setSearchParams((prev) => { prev.delete("routeId"); return prev; }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    if (!showHeaderSwitcher) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!headerSwitcherRef.current?.contains(e.target as Node)) setShowHeaderSwitcher(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowHeaderSwitcher(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [showHeaderSwitcher]);

  const readiness = useMemo(
    () => buildReadinessFromCompanySignals({
      mojoScore:       activeCompany?.mojo_score,
      evidenceStatus:  activeCompany?.evidence_status,
    }),
    [activeCompany?.mojo_score, activeCompany?.evidence_status],
  );
  const currentScore    = readiness.currentReadiness;
  const reachableScore  = readiness.nearTermPotential;
  const unlockableScore = readiness.structuralUpside;
  const readinessLabel  = readiness.postureLabel;
  const ceilingReason   = readiness.ceilingReason;
  const hasHierarchy    = routes.some((r) => r.level === "route");
  const { claims: pageClaimsMap } = useCompanyClaims(activeCompany?.id);
  const pageTopLevelRoutes = useMemo(() => routes.filter((r) => r.level === "route"), [routes]);
  const pagesDominantClaimState = useMemo((): ClaimState | null => {
    if (!hasHierarchy || pageTopLevelRoutes.length === 0) return null;
    const order: ClaimState[] = ["flow", "focus", "diagnose", "outside_view"];
    const states = pageTopLevelRoutes
      .map((r) => (r as { claim_id?: string | null }).claim_id
        ? (pageClaimsMap.get((r as { claim_id?: string | null }).claim_id!)?.state ?? null)
        : null)
      .filter((s): s is ClaimState => s !== null);
    for (const s of order) { if (states.includes(s)) return s; }
    return states[0] ?? null;
  }, [hasHierarchy, pageTopLevelRoutes, pageClaimsMap]);

  if (!hasCompany) {
    return (
      <section className="crpv-page crpv-routes-page">
        <article className="crpv-empty-state">
          <p className="cap">Client Refine Preview · Routes</p>
          <h1>Select a company to view routes.</h1>
          {companiesLoading ? (
            <p className="crpv-muted">Loading companies…</p>
          ) : companies.length > 0 ? (
            <div className="crpv-company-grid">
              {companies.map((company) => (
                <button
                  key={company.id}
                  type="button"
                  className="crpv-company-button"
                  onClick={() => setActiveCompanyId(company.id)}
                >
                  <span>{company.name}</span>
                  <small>{company.quarter || "Quarter"} · {company.archetype || "Archetype"}</small>
                </button>
              ))}
            </div>
          ) : (
            <p className="crpv-muted">No companies available.</p>
          )}
        </article>
      </section>
    );
  }

  return (
    <section className="crpv-page crpv-routes-page">
      <header className="crpv-header">
        <div className="left">
          <b>Mojo</b>
          {companies.length > 1 ? (
            <div className="crpv-co-switcher" ref={headerSwitcherRef}>
              <button
                type="button"
                className="crpv-co-trigger cap"
                onClick={() => setShowHeaderSwitcher((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={showHeaderSwitcher}
              >
                [{toSentence(activeCompany?.name) || "COMPANY"}]
                <span className="crpv-co-caret">{showHeaderSwitcher ? "▲" : "▼"}</span>
              </button>
              <span className="cap" style={{ marginLeft: 4 }}>· DAY 52 · {pagesDominantClaimState ? pagesDominantClaimState.replace(/_/g, " ").toUpperCase() : stageLabel(phase).toUpperCase()}</span>
              {showHeaderSwitcher && (
                <div className="crpv-co-dropdown" role="listbox">
                  <ul className="crpv-co-list">
                    {companies.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className={`crpv-co-option${c.id === activeCompany?.id ? " active" : ""}`}
                          role="option"
                          aria-selected={c.id === activeCompany?.id}
                          onClick={() => { setActiveCompanyId(c.id); setShowHeaderSwitcher(false); }}
                        >
                          <span className="crpv-co-option-name">{c.name}</span>
                          <span className="crpv-co-option-meta cap">
                            {[c.quarter, c.archetype, c.mojo_score != null ? `score ${Math.round(c.mojo_score)}` : null].filter(Boolean).join(" · ")}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <span className="cap">[{toSentence(activeCompany?.name) || "COMPANY"}] · DAY 52 · {pagesDominantClaimState ? pagesDominantClaimState.replace(/_/g, " ").toUpperCase() : stageLabel(phase).toUpperCase()}</span>
          )}
        </div>
      </header>

      {!hasHierarchy && (
        <ScoreContextBar
          currentScore={currentScore}
          reachableScore={reachableScore}
          unlockableScore={unlockableScore}
          routesCount={routes.length}
          confidenceLabel={readinessLabel}
          ceilingReason={ceilingReason}
        />
      )}

      {!hasHierarchy && (
        <SignalBar
          activeStage={activeStage}
          setActiveStage={handleStageChange}
          baseline={baseline}
          positioning={positioning ?? null}
          strategy={strategy ?? null}
          excludedCount={excludedCount}
        />
      )}

      <div className="crpv-ws-body">
        <WorkshopSidebar
          activeTab="routes"
          onTabClick={(tab) => navigate(`${CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE}?tab=${tab}`)}
          onHome={goToRefineHome}
          onInbox={() => navigate(CLIENT_REFINE_PREVIEW_INBOX_ROUTE)}
          inboxCount={inboxCount}
          inboxHasNew={inboxNewCount > 0}
          showTeachingToggle={isAdmin}
        />
        <div className="crpv-ws-content">
          <RoutesOrgPanel
            routes={routes}
            loading={routesLoading}
            activeCompany={activeCompany}
            routeIdParam={routeIdParam}
            onClearRouteIdParam={clearRouteIdParam}
            needs={needs}
            onCommitSuccess={() => setRoutesRefreshKey((k) => k + 1)}
          />
        </div>
      </div>
    </section>
  );
}

// ─── Workshop-embedded panel ──────────────────────────────────────────────────

function inferRelevantCategory(step: JobStepRow): "fix" | "improve" | "create" | null {
  if (step.has_gap) return "fix";
  const conf = step.evidence_confidence ?? 100;
  if (step.evidence_status === "unclear" || conf < 50) return "fix";
  if (step.evidence_status === "implied" || conf < 70) return "improve";
  return null;
}


export function RoutesOrgPanel({
  routes,
  loading,
  activeCompany,
  routeIdParam,
  onClearRouteIdParam,
  contextStep,
  nextBestMove,
  needs,
  onRouteActivate,
  onCommitSuccess,
}: {
  routes: RouteRow[];
  loading: boolean;
  activeCompany: Company | null | undefined;
  routeIdParam?: string | null;
  onClearRouteIdParam?: () => void;
  contextStep?: JobStepRow | null;
  nextBestMove?: NextBestMove;
  needs?: OdiNeedRow[];
  onRouteActivate?: (routeId: string) => void;
  onCommitSuccess?: () => void;
}) {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [inspectRoute, setInspectRoute]     = useState<RouteRow | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [decisionSavedAt, setDecisionSavedAt] = useState<string | null>(null);
  const [hoveredRouteId, setHoveredRouteId]   = useState<string | null>(null);
  const [confirmRoute, setConfirmRoute]       = useState<RouteRow | null>(null);
  // Governance + route-generate caps (3a/3b): the handlers + RoutesColumn renders
  // that consume these live in THIS component, so the hooks must resolve here.
  const canApply = useCapability("governance.proposal.apply", activeCompany?.id);
  const canReject = useCapability("governance.proposal.reject", activeCompany?.id);
  const canGenRoute = useCapability("structure.route.generate", activeCompany?.id);
  const { data: strategicHypothesisRows = [] } = useStrategicHypotheses(activeCompany?.id);
  const { data: routeHypothesisDependencies = [] } = useRouteHypothesisDependencies(activeCompany?.id);
  const [claimsRefreshKey, setClaimsRefreshKey] = useState(0);
  const [flowCommitClaim, setFlowCommitClaim] = useState<{ id: string; statement: string } | null>(null);
  const { claims: claimsMap } = useCompanyClaims(activeCompany?.id, claimsRefreshKey);
  const { primary: desiredOutcome } = useDesiredOutcomes(activeCompany?.id);
  const { history: mojoScoreHistory } = useMojoScore(activeCompany?.id);
  const { landscape: routesSignalLandscape } = useSignalLandscape(activeCompany?.id);
  const [reEvalLoading, setReEvalLoading] = useState<string | null>(null);
  const [routeProposalRefreshKey, setRouteProposalRefreshKey] = useState(0);
  const { proposals: routeProposalsMap } = useRouteProposals(activeCompany?.id, routeProposalRefreshKey);
  const [generateLoadingRouteId, setGenerateLoadingRouteId] = useState<string | null>(null);
  const [acceptLoadingProposalId, setAcceptLoadingProposalId] = useState<string | null>(null);
  const [rejectLoadingProposalId, setRejectLoadingProposalId] = useState<string | null>(null);
  const [driftPanel, setDriftPanel] = useState<{ surfaceType: string; surfaceId: string } | null>(null);
  const [driftBadgeRefreshKey, setDriftBadgeRefreshKey] = useState(0);
  const { checkingSurfaceId, checkSurface: checkRouteDrift } = useDriftScan(activeCompany?.id);

  useEffect(() => {
    setSelectedRouteId(activeCompany?.selected_route_id ?? null);
    setDecisionSavedAt(activeCompany?.selected_route_updated_at ?? null);
  }, [activeCompany?.id]);

  useEffect(() => {
    if (!routeIdParam || routes.length === 0) return;
    const target = routes.find((r) => r.id === routeIdParam);
    if (target) {
      setInspectRoute(target);
      onClearRouteIdParam?.();
    } else {
      console.warn(`[RoutesOrgPanel] No route found for routeId: ${routeIdParam}`);
    }
  }, [routeIdParam, routes]);

  const handleReEvaluate = useCallback(async (routeId: string) => {
    if (!activeCompany?.id) return;
    setReEvalLoading(routeId);
    const { error } = await supabase.functions.invoke("evaluate-route-alignment", {
      body: { route_id: routeId, company_id: activeCompany.id },
    });
    setReEvalLoading(null);
    if (error) console.error("[RoutesOrgPanel] Re-evaluate error:", error.message);
  }, [activeCompany?.id]);

  const handleGenerateRouteProposal = useCallback(async (routeId: string) => {
    if (!activeCompany?.id) return;
    if (!canGenRoute) return; // structure.route.generate
    setGenerateLoadingRouteId(routeId);
    try {
      await supabase.functions.invoke("propose-route-changes", {
        body: { route_id: routeId, company_id: activeCompany.id },
      });
      setRouteProposalRefreshKey((k) => k + 1);
    } finally {
      setGenerateLoadingRouteId(null);
    }
  }, [activeCompany?.id, canGenRoute]);

  const handleDriftClick = useCallback((surfaceType: string, surfaceId: string) => {
    setDriftPanel({ surfaceType, surfaceId });
  }, []);

  const handleCheckRouteDrift = useCallback((routeId: string) => {
    checkRouteDrift(
      "route",
      routeId,
      (result) => {
        setDriftBadgeRefreshKey((k) => k + 1);
        const driftLabel = result.material_drift > 0 ? "material drift" : result.slight_drift > 0 ? "slight drift" : "aligned";
        toast.success(`Checked route · ${driftLabel}`, { duration: 4000 });
      },
      (err) => {
        toast.error(`Check failed — ${err}`, { duration: 5000 });
      },
    );
  }, [checkRouteDrift]);

  const handleAcceptRouteProposal = useCallback(async (
    proposalId: string,
    acceptedFields: string[],
    skippedFields: string[],
  ) => {
    if (!activeCompany?.id) return;
    if (!canApply) return; // governance.proposal.apply (route)
    const proposal = Array.from(routeProposalsMap.values()).find((p) => p.id === proposalId);
    if (!proposal?.surface_id) return;
    setAcceptLoadingProposalId(proposalId);
    try {
      const proposed = proposal.proposed_state as Record<string, unknown>;
      const patch: Record<string, unknown> = { source: `manual_${proposalId}` };
      for (const field of acceptedFields) { patch[field] = proposed[field]; }
      const { error: updateError } = await supabase
        .from("routes")
        .update(patch)
        .eq("id", proposal.surface_id)
        .eq("company_id", activeCompany.id);
      if (updateError) { return; }
      await captureBaseline(activeCompany.id, "route", proposal.surface_id);
      await supabase
        .from("surface_proposals")
        .update({
          status: "accepted",
          reviewed_at: new Date().toISOString(),
          raw_payload: { accepted_fields: acceptedFields, skipped_fields: skippedFields },
        })
        .eq("id", proposalId);
      setRouteProposalRefreshKey((k) => k + 1);
      await supabase.functions.invoke("evaluate-route-alignment", {
        body: { route_id: proposal.surface_id, company_id: activeCompany.id },
      });
    } finally {
      setAcceptLoadingProposalId(null);
    }
  }, [activeCompany?.id, canApply, routeProposalsMap]);

  const handleRejectRouteProposal = useCallback(async (proposalId: string) => {
    if (!activeCompany?.id) return;
    if (!canReject) return; // governance.proposal.reject (route)
    setRejectLoadingProposalId(proposalId);
    try {
      await supabase.from("surface_proposals").update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
      }).eq("id", proposalId);
      setRouteProposalRefreshKey((k) => k + 1);
    } finally {
      setRejectLoadingProposalId(null);
    }
  }, [activeCompany?.id, canReject]);

  const phase = floorEngagementPhase({
    phase: activeCompany?.engagement_phase ?? "outside_signals",
    hasNeedsWithScores: (needs ?? []).some((n) => n.importance > 0),
    hasSelectedRoute: !!activeCompany?.selected_route_id,
  });
  const hypothesisPh = isHypothesisPhase(phase);
  const phasePriority = phaseNarrativePriority(phase);

  const fix     = useMemo(() => routes.filter((r) => String(r.category).toLowerCase() === "fix"),     [routes]);
  const improve = useMemo(() => routes.filter((r) => String(r.category).toLowerCase() === "improve"), [routes]);
  const create  = useMemo(() => routes.filter((r) => String(r.category).toLowerCase() === "create"),  [routes]);

  const selectedRoute = useMemo(
    () => routes.find((r) => r.id === selectedRouteId) ?? null,
    [routes, selectedRouteId],
  );

  const latestExclusionAt = useMemo(
    () => computeLatestExclusionAt(activeCompany?.excluded_signals_json ?? []),
    [activeCompany?.excluded_signals_json],
  );

  // A5 route/leg hierarchy
  const hasHierarchy = useMemo(() => routes.some((r) => r.level === "route"), [routes]);
  const topLevelRoutes = useMemo(() => routes.filter((r) => r.level === "route"), [routes]);
  const legRoutes = useMemo(() => routes.filter((r) => r.level === "leg" || r.level === "action"), [routes]);
  const legsByParent = useMemo(() => {
    const map = new Map<string, RouteRow[]>();
    for (const leg of legRoutes) {
      if (!leg.parent_id) continue;
      const arr = map.get(leg.parent_id) ?? [];
      arr.push(leg);
      map.set(leg.parent_id, arr);
    }
    return map;
  }, [legRoutes]);
  const dominantClaimState = useMemo((): ClaimState | null => {
    if (!hasHierarchy || topLevelRoutes.length === 0) return null;
    // Prefer the lead (recommended) route's claim state for the header label.
    const recommended = selectRecommendedRoute(routes, null, null);
    const leadRoute = recommended ? topLevelRoutes.find((r) => r.id === recommended.id) : null;
    const leadState = leadRoute?.claim_id ? (claimsMap?.get(leadRoute.claim_id)?.state ?? null) as ClaimState | null : null;
    if (leadState) return leadState;
    const dominanceOrder: ClaimState[] = ["flow", "focus", "diagnose", "outside_view"];
    const states = topLevelRoutes
      .map((r) => r.claim_id ? ((claimsMap?.get(r.claim_id)?.state ?? null) as ClaimState | null) : null)
      .filter((s): s is ClaimState => s !== null);
    for (const s of dominanceOrder) {
      if (states.includes(s)) return s;
    }
    return states[0] ?? null;
  }, [hasHierarchy, topLevelRoutes, claimsMap, routes]);
  const ungroupedRoutes = useMemo(
    () => hasHierarchy ? routes.filter((r) => r.level == null && r.parent_id == null) : [],
    [hasHierarchy, routes],
  );
  const ungroupedFix     = useMemo(() => ungroupedRoutes.filter((r) => String(r.category).toLowerCase() === "fix"),     [ungroupedRoutes]);
  const ungroupedImprove = useMemo(() => ungroupedRoutes.filter((r) => String(r.category).toLowerCase() === "improve"), [ungroupedRoutes]);
  const ungroupedCreate  = useMemo(() => ungroupedRoutes.filter((r) => String(r.category).toLowerCase() === "create"),  [ungroupedRoutes]);

  const focusClaims = useMemo(
    () => Array.from(claimsMap.values()).filter((c) => c.state === "focus"),
    [claimsMap],
  );
  const flowClaims = useMemo(
    () => Array.from(claimsMap.values()).filter((c) => c.state === "flow"),
    [claimsMap],
  );
  const routeByClaimId = useMemo(() => {
    const map = new Map<string, RouteRow>();
    for (const r of routes) {
      if (r.claim_id) map.set(r.claim_id, r);
    }
    return map;
  }, [routes]);

  // Live-compute MojoScore from in-memory data (fallback when no DB row exists yet)
  const liveMojoScore = useMemo(() => {
    if (!hasHierarchy || !activeCompany?.id) return null;
    return computeMojoScore({
      companyId: activeCompany.id,
      claims: Array.from(claimsMap.values()).map((c) => ({
        id: c.id,
        state: c.state,
        claim_type: c.claim_type,
        topic: c.topic,
        outside_support_count: c.outside_support_count,
        organization_support_count: c.organization_support_count,
        customer_support_count: c.customer_support_count,
        updated_at: c.updated_at,
      })),
      routes: routes.map((r) => ({
        id: r.id,
        category: r.category,
        level: r.level ?? null,
        parent_id: r.parent_id ?? null,
        steps_json: (Array.isArray(r.steps_json) ? r.steps_json : null) as Array<{ id: string; title: string; status: string }> | null,
        evidence_json: (Array.isArray(r.evidence_json) ? r.evidence_json : null) as Array<{ id: string; title: string; status: string }> | null,
        why_this_matters_json: Array.isArray(r.why_this_matters_json) ? r.why_this_matters_json as string[] : null,
        rejected_alternatives: Array.isArray(r.rejected_alternatives) ? r.rejected_alternatives : null,
        what_would_have_to_be_true: Array.isArray(r.what_would_have_to_be_true) ? r.what_would_have_to_be_true : null,
        linked_need_ids: Array.isArray(r.linked_need_ids) ? r.linked_need_ids : null,
        updated_at: r.updated_at ?? null,
      })),
      needs: (needs ?? []).map((n) => ({
        id: n.id,
        desired_outcome: n.desired_outcome,
        importance: n.importance,
        satisfaction: n.satisfaction,
        opportunity_score: n.opportunity_score,
        service_state: n.service_state,
        updated_at: n.updated_at ?? null,
      })),
      computedAt: new Date().toISOString(),
    });
  }, [hasHierarchy, activeCompany?.id, claimsMap, routes, needs]);

  const displayMojoScore = liveMojoScore;
  const displayMojoHistory = mojoScoreHistory.length > 0 ? mojoScoreHistory : [];

  const isReroute = useMemo(() => {
    if (!selectedRoute) return false;
    const stale = latestExclusionAt ? isArtifactStale(selectedRoute, latestExclusionAt) : false;
    const ev = deriveClientEvidence(selectedRoute);
    return stale || deriveClientAssumptions(selectedRoute, ev).some((a) => a.critical && a.status === "unproven");
  }, [selectedRoute, latestExclusionAt]);

  async function handleSaveRouteField(routeOrLegId: string, field: "title" | "short_description", value: string) {
    if (!activeCompany?.id) return;
    await saveManualEdit("route", routeOrLegId, activeCompany.id, field, value);
    supabase.functions.invoke("evaluate-route-alignment", { body: { route_id: routeOrLegId, company_id: activeCompany.id } }).catch(() => {});
    setRoutesRefreshKey((k) => k + 1);
  }

  function handleInspectRoute(route: RouteRow) {
    setInspectRoute(route);
    onRouteActivate?.(route.id);
  }

  async function handleSelectRoute(route: RouteRow) {
    onRouteActivate?.(route.id);
    if (selectedRouteId === route.id) { handleClearDecision(); return; }
    const eventType = selectedRouteId ? "changed" : "selected";
    const now = new Date().toISOString();
    setSelectedRouteId(route.id);
    setDecisionSavedAt(now);
    if (!activeCompany?.id) return;
    const why      = deriveClientWhyReasons(route);
    const evidence = deriveClientEvidence(route);
    const steps    = (Array.isArray(route.steps_json) ? route.steps_json : []) as Array<{ status: string }>;
    const summary  = { bullets: buildDecisionBullets({ whyThisMatters: why, evidence, steps }, null), route_title: route.title, route_category: route.category };
    await persistSelectedRouteDecision(activeCompany.id, route.id, summary, now);
    await insertRouteDecisionEvent(activeCompany.id, route.id, eventType, summary);
  }

  async function handleClearDecision() {
    const priorRouteId = selectedRouteId;
    const priorSummary = activeCompany?.selected_route_summary_json ?? {};
    setSelectedRouteId(null);
    setDecisionSavedAt(null);
    if (!activeCompany?.id) return;
    await clearSelectedRouteDecision(activeCompany.id);
    await insertRouteDecisionEvent(activeCompany.id, priorRouteId, "cleared", priorSummary);
  }

  function handleConfirmStart(route: RouteRow) {
    if (!activeCompany?.id) return;
    const steps = Array.isArray(route.steps_json) ? route.steps_json : [];
    const stepId = steps.find((s) => s.status !== "complete")?.id ?? steps[0]?.id ?? null;
    setActivePath(activeCompany.id, { routeId: route.id, stepId, startedAt: new Date().toISOString() });
    setConfirmRoute(null);
    navigate(CLIENT_REFINE_PREVIEW_PATH_ROUTE);
  }

  const relevantCategory = contextStep ? inferRelevantCategory(contextStep) : null;

  const recommended = useMemo(
    () => selectRecommendedRoute(routes, relevantCategory, contextStep ?? null),
    [routes, relevantCategory, contextStep]
  );
  const recommendedRouteId = recommended?.id ?? null;
  const recommendedReason = recommended ? impactReason(recommended.breakdown.expectedImpact) : null;

  const routeSeeds = useMemo(
    () =>
      routes.map((route) => {
        const evidence = deriveClientEvidence(route);
        const assumptions = deriveClientAssumptions(route, evidence);
        return { route, evidence, assumptions };
      }),
    [routes],
  );

  const routeRationales = useMemo(
    () =>
      buildRouteRationales({
        seeds: routeSeeds,
        hypotheses: strategicHypothesisRows,
        routeLinks: routeHypothesisDependencies,
        selectedRouteId,
        recommendedRouteId,
        phase,
      }),
    [phase, recommendedRouteId, routeHypothesisDependencies, routeSeeds, selectedRouteId, strategicHypothesisRows],
  );

  const routeRationaleMap = useMemo(
    () => new Map(routeRationales.map((rationale) => [rationale.routeId, rationale])),
    [routeRationales],
  );
  const editorialRoles = useMemo(
    () => buildRouteEditorialRoles({
      items: routes,
      rationales: routeRationaleMap,
      phase,
      recommendedRouteId,
    }),
    [phase, recommendedRouteId, routeRationaleMap, routes],
  );

  const isReady = !nextBestMove || nextBestMove.type === "start_route";

  const topNeed = useMemo(
    () => [...(needs ?? [])].sort((a, b) => (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0))[0] ?? null,
    [needs],
  );

  const leadRoute = useMemo(
    () =>
      selectedRoute ??
      routes.find((route) => route.id === recommendedRouteId) ??
      routeSeeds
        .map((seed) => seed.route)
        .find(Boolean) ??
      null,
    [recommendedRouteId, routeSeeds, routes, selectedRoute],
  );

  const leadRouteRationale = useMemo(
    () => (leadRoute ? routeRationaleMap.get(leadRoute.id) ?? null : null),
    [leadRoute, routeRationaleMap],
  );

  const whyLeading = useMemo(
    () => leadRouteRationale ? deriveWhyLeading(leadRouteRationale, routeRationales) : null,
    [leadRouteRationale, routeRationales],
  );

  const orientationRead = useMemo(
    () =>
      buildRouteOrientationRead({
        phase,
        leadRationale: leadRouteRationale,
        allRationales: routeRationales,
        hypothesisRows: strategicHypothesisRows,
        topNeedOutcome: topNeed?.desired_outcome ?? null,
      }),
    [phase, leadRouteRationale, routeRationales, strategicHypothesisRows, topNeed?.desired_outcome],
  );

  const commitmentLegitimacy = useMemo(
    () => deriveCommitmentLegitimacy(leadRouteRationale ?? null, !!selectedRoute, phase),
    [leadRouteRationale, selectedRoute, phase],
  );

  const dynamicPanelTitle = useMemo(() => {
    const base = phasePriority.routes.panelTitle;
    if (phase !== "flow" || !leadRouteRationale) return base;
    if (leadRouteRationale.movement === "weaken") return "How this commitment is destabilizing";
    if (leadRouteRationale.movement === "strengthen") return "How this commitment is strengthening";
    return base;
  }, [phase, phasePriority.routes.panelTitle, leadRouteRationale]);

  // Canonical inspect panel inputs — built from stored blobs only (no job-step or opportunity data in this view)
  const inspectDetail = useMemo<CanonicalRouteInspectDetail | null>(() => {
    if (!inspectRoute) return null;
    const evidence   = deriveClientEvidence(inspectRoute);
    const why        = Array.isArray(inspectRoute.why_this_matters_json)
      ? inspectRoute.why_this_matters_json.map(String).filter(Boolean)
      : [inspectRoute.short_description || "This route addresses a meaningful strategic gap."];
    return {
      steps:           (Array.isArray(inspectRoute.steps_json) ? inspectRoute.steps_json : []) as CanonicalRouteInspectDetail["steps"],
      evidence:        evidence as CanonicalRouteInspectDetail["evidence"],
      whyThisMatters:  why,
      frameworks:      Array.isArray(inspectRoute.frameworks_used) ? inspectRoute.frameworks_used.filter(Boolean) : [],
      rankedOpps:      [],
    };
  }, [inspectRoute]);

  const inspectRationale = useMemo(
    () => inspectRoute ? (routeRationaleMap.get(inspectRoute.id) ?? null) : null,
    [inspectRoute, routeRationaleMap],
  );

  return (
    <div
      className={hasHierarchy ? undefined : "crpv-ws-section crpv-ws-section-wide"}
      style={hasHierarchy ? { margin: -36, padding: "40px 48px 80px", background: "#ffffff" } : undefined}
      data-tone={phasePriority.orientation.tone}
    >
      {/* ── Hierarchy page header: eyebrow + hero + score strip + keystone ── */}
      {hasHierarchy && (() => {
        const framing = HIERARCHY_FRAMING[dominantClaimState ?? "diagnose"] ?? HIERARCHY_FRAMING.diagnose;
        if (!displayMojoScore) {
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 32 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: R.signal, display: "inline-block" }} />
              <span style={{ fontFamily: R.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.16em", color: "rgba(17,17,17,0.4)" }}>
                Strategy · Route Plan
              </span>
            </div>
          );
        }
        const reachable  = computeReachableScore(displayMojoScore);
        const unlockable = computeUnlockableScore(reachable, displayMojoScore);
        const current    = Math.round(displayMojoScore.total_score);
        const scoreLift  = Math.round(reachable) - current;
        const leadRoute = recommendedRouteId ? topLevelRoutes.find((r) => r.id === recommendedRouteId) ?? topLevelRoutes[0] : topLevelRoutes[0];
        const keystoneAction =
          nextBestMove?.title ??
          (leadRoute?.title ? `Validate "${leadRoute.title}" with direct customer evidence` : "Validate the leading direction with direct customer evidence.");
        return (
          <>
            <HierarchyPageHeader
              framing={framing}
              current={current}
              reachable={reachable}
              unlockable={unlockable}
              dominantState={dominantClaimState}
            />
            <div style={{ marginBottom: 12, marginTop: -16 }}>
              <SurfaceEducationTrigger
                surfaceKey="routes"
                isAdmin={isAdmin}
                panelTitle="About Routes"
                slotData={{ route_count: topLevelRoutes.length }}
              />
            </div>
            {scoreLift > 0 && (
              <KeystoneStripe action={keystoneAction} scoreLift={scoreLift} />
            )}
            {routesSignalLandscape && (
              <SignalBasisChip
                publicCount={routesSignalLandscape.byBand.outside.count}
                teamCount={routesSignalLandscape.byBand.organization.count}
                customerCount={routesSignalLandscape.byBand.customer.count}
              />
            )}
          </>
        );
      })()}

      {/* ── Orientation Layer ──────────────────────────────────────────── */}
      {!hasHierarchy && <section
        className="crpv-r-orientation"
        data-tone={phasePriority.orientation.tone}
        aria-label="Current strategic read"
      >
        <div className="crpv-r-orientation-header">
          <p className="crpv-r-orientation-cap">Current Strategic Read</p>
          <p className="crpv-r-orientation-question">{phasePriority.orientation.question}</p>
        </div>

        <div className="crpv-r-orientation-body">
          <div className="crpv-r-orientation-item" data-primary="true">
            <p className="crpv-r-orientation-label">What currently appears true</p>
            <p className="crpv-r-orientation-value">{orientationRead.whatAppearsTrue}</p>
          </div>

          {commitmentLegitimacy && (
            <div className="crpv-r-orientation-item">
              <p className="crpv-r-orientation-label">Why the organization is comfortable acting here</p>
              <p className="crpv-r-orientation-value">{commitmentLegitimacy}</p>
            </div>
          )}

          {orientationRead.strongestSignal && (
            <div className="crpv-r-orientation-item">
              <p className="crpv-r-orientation-label">Strongest signal</p>
              <p className="crpv-r-orientation-value">{orientationRead.strongestSignal}</p>
            </div>
          )}

          <div className="crpv-r-orientation-item">
            <p className="crpv-r-orientation-label">What remains unresolved</p>
            <p className="crpv-r-orientation-value">{orientationRead.whatRemains}</p>
          </div>

          {orientationRead.validating && (
            <div className="crpv-r-orientation-item">
              <p className="crpv-r-orientation-label">What we're still working to prove</p>
              <p className="crpv-r-orientation-value">{orientationRead.validating}</p>
            </div>
          )}

          <div className="crpv-r-orientation-item" data-ambient="true">
            <p className="crpv-r-orientation-label">What could change this</p>
            <p className="crpv-r-orientation-value">{orientationRead.whatCouldChange}</p>
          </div>
        </div>
      </section>}

      {/* ── Focal action (secondary to orientation) ────────────────────── */}
      {!hasHierarchy && nextBestMove && (
        <div style={{ marginBottom: 32, paddingTop: 4 }}>
          <p style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.1em", color: "#999", textTransform: "uppercase", margin: "0 0 6px" }}>
            {hypothesisPh ? "Most in focus" : phasePriority.phase === "flow" ? "What is shifting now" : phasePriority.orientation.tone === "exploratory" ? "Examine next" : "Do this next"}
          </p>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#222", margin: "0 0 4px", lineHeight: 1.35 }}>
            {nextBestMove.title}
          </p>
          <p style={{ fontSize: 12, color: "#777", margin: 0, lineHeight: 1.5 }}>
            {nextBestMove.reason}
          </p>
        </div>
      )}

      {/* ── Route context — only for non-hierarchy clients ─────────────────── */}
      {!hasHierarchy && (
        <>
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.1em", color: "#999", textTransform: "uppercase", margin: "0 0 4px" }}>
              {phasePriority.routes.introLabel}
            </p>
            <p style={{ fontSize: 12, color: "#888", margin: 0, lineHeight: 1.5 }}>
              {phasePriority.routes.introCopy}
            </p>
          </div>

          {contextStep && (
            <div style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.1em", color: "#888", textTransform: "uppercase", margin: "0 0 4px", fontWeight: 600 }}>
                Focusing on
              </p>
              <p style={{ fontSize: 13, fontWeight: 500, color: "#222", margin: "0 0 4px" }}>
                {contextStep.step_number != null ? `Step ${contextStep.step_number} — ` : ""}{contextStep.step_label ?? "Selected step"}
              </p>
              <p style={{ fontSize: 12, color: "#888", margin: 0 }}>
                These routes help address gaps in this step.
              </p>
            </div>
          )}
        </>
      )}

      {(activeCompany?.excluded_signals_json?.length ?? 0) > 0 && (
        <div style={{ border: "1px solid #FAC846", borderRadius: 6, padding: "10px 16px", marginBottom: 16, background: "#fef9ec" }}>
          <p style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.08em", color: "#FAC846", textTransform: "uppercase", fontWeight: 600, margin: 0, lineHeight: 1.5 }}>
            Some outside signals were excluded. You may want to review these recommendations.
          </p>
        </div>
      )}

      {!hasHierarchy && leadRoute && leadRouteRationale ? (
        <div style={{ marginBottom: 24 }}>
          <RouteWhyRisingPanel
            route={leadRoute}
            rationale={leadRouteRationale}
            title={dynamicPanelTitle}
            safeNowLabel={phasePriority.routes.safeNowLabel}
            whyLeading={whyLeading ?? undefined}
            phase={phase}
          />
        </div>
      ) : null}

      {/* ── Claims: Ready to commit (focus state) ── */}
      {focusClaims.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontFamily: R.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: R.inkFaint, margin: "0 0 10px" }}>
            Ready to Commit
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {focusClaims.map((claim) => (
              <div
                key={claim.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 14px",
                  border: `1px solid ${R.hairline}`,
                  borderRadius: 6,
                  background: "#fff",
                }}
              >
                <p style={{ fontFamily: R.sans, fontSize: 13, color: R.ink, margin: 0, lineHeight: 1.4, flex: 1, minWidth: 0 }}>
                  {claim.statement ?? claim.topic ?? "—"}
                </p>
                <button
                  type="button"
                  onClick={() => setFlowCommitClaim({ id: claim.id, statement: claim.statement ?? claim.topic ?? "" })}
                  style={{
                    flexShrink: 0,
                    fontFamily: R.mono,
                    fontSize: 9,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "#3A6B28",
                    background: "none",
                    border: "1px solid #3A6B28",
                    borderRadius: 4,
                    padding: "4px 10px",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Commit →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Claims: In flow (committed) ── */}
      {flowClaims.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontFamily: R.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: R.inkFaint, margin: "0 0 10px" }}>
            In Flow
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {flowClaims.map((claim) => {
              const linkedRoute = routeByClaimId.get(claim.id);
              return (
                <div
                  key={claim.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "10px 14px",
                    border: `1px solid ${R.hairline}`,
                    borderRadius: 6,
                    background: "#fff",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: R.sans, fontSize: 13, color: R.ink, margin: 0, lineHeight: 1.4 }}>
                      {claim.statement ?? claim.topic ?? "—"}
                    </p>
                    {linkedRoute && (
                      <p style={{ fontFamily: R.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: R.inkFaint, margin: "4px 0 0" }}>
                        Route · {linkedRoute.title}
                      </p>
                    )}
                  </div>
                  <ClaimStateBadge state={claim.state} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div className="crpv-ws-placeholder cap">Loading routes…</div>
      ) : (
        <>
          {!isReady && !hasHierarchy && (
            <p style={{ fontSize: 11, color: "#999", margin: "0 0 14px", fontStyle: "italic" }}>
              {phasePriority.routes.unreadyNote}
            </p>
          )}
          {hasHierarchy ? (
            <>
              {desiredOutcome && <DesiredOutcomeBanner outcome={desiredOutcome} />}
              <div>
                {topLevelRoutes.map((tlRoute, idx) => (
                  <HierarchyRouteSection
                    key={tlRoute.id}
                    route={tlRoute}
                    legs={legsByParent.get(tlRoute.id) ?? []}
                    index={idx + 1}
                    isLead={tlRoute.id === recommendedRouteId}
                    claimsMap={claimsMap}
                    rationales={routeRationaleMap}
                    selectedRouteId={selectedRoute?.id}
                    defaultExpanded={idx === 0}
                    recommendedRouteId={recommendedRouteId}
                    onSaveField={handleSaveRouteField}
                    phase={phase}
                    onDriftClick={handleDriftClick}
                    driftRefreshKey={driftBadgeRefreshKey}
                    onCheckDrift={handleCheckRouteDrift}
                    checkingSurfaceId={checkingSurfaceId}
                  />
                ))}
              </div>
              {ungroupedRoutes.length > 0 && (
                <div className="crpv-r-columns" style={{ marginTop: 24 }}>
                  <RoutesColumn category="fix"     items={ungroupedFix}     rationales={routeRationaleMap} onInspect={handleInspectRoute} selectedRouteId={selectedRoute?.id} onSelect={handleSelectRoute} hoveredRouteId={hoveredRouteId} onHover={setHoveredRouteId} isContextMatch={relevantCategory === "fix"}     isContextDim={relevantCategory !== null && relevantCategory !== "fix"}     recommendedRouteId={recommendedRouteId} recommendedReason={recommendedReason} onStartRoute={!hypothesisPh && isReady ? setConfirmRoute : undefined} isDeemphasized={!isReady} isReady={isReady} hypothesisPhase={hypothesisPh} phase={phase} editorialRoles={editorialRoles} claimsMap={claimsMap} onReEvaluate={handleReEvaluate} reEvalLoadingId={reEvalLoading} proposalsMap={routeProposalsMap} onGenerateProposal={handleGenerateRouteProposal} canGenerate={canGenRoute} generateLoadingId={generateLoadingRouteId} onAcceptProposal={handleAcceptRouteProposal} onRejectProposal={handleRejectRouteProposal} canApply={canApply} canReject={canReject} acceptLoadingProposalId={acceptLoadingProposalId} rejectLoadingProposalId={rejectLoadingProposalId} driftRefreshKey={driftBadgeRefreshKey} onCheckDrift={handleCheckRouteDrift} checkingSurfaceId={checkingSurfaceId} />
                  <RoutesColumn category="improve" items={ungroupedImprove} rationales={routeRationaleMap} onInspect={handleInspectRoute} selectedRouteId={selectedRoute?.id} onSelect={handleSelectRoute} hoveredRouteId={hoveredRouteId} onHover={setHoveredRouteId} isContextMatch={relevantCategory === "improve"} isContextDim={relevantCategory !== null && relevantCategory !== "improve"} recommendedRouteId={recommendedRouteId} recommendedReason={recommendedReason} onStartRoute={!hypothesisPh && isReady ? setConfirmRoute : undefined} isDeemphasized={!isReady} isReady={isReady} hypothesisPhase={hypothesisPh} phase={phase} editorialRoles={editorialRoles} claimsMap={claimsMap} onReEvaluate={handleReEvaluate} reEvalLoadingId={reEvalLoading} proposalsMap={routeProposalsMap} onGenerateProposal={handleGenerateRouteProposal} canGenerate={canGenRoute} generateLoadingId={generateLoadingRouteId} onAcceptProposal={handleAcceptRouteProposal} onRejectProposal={handleRejectRouteProposal} canApply={canApply} canReject={canReject} acceptLoadingProposalId={acceptLoadingProposalId} rejectLoadingProposalId={rejectLoadingProposalId} driftRefreshKey={driftBadgeRefreshKey} onCheckDrift={handleCheckRouteDrift} checkingSurfaceId={checkingSurfaceId} />
                  <RoutesColumn category="create"  items={ungroupedCreate}  rationales={routeRationaleMap} onInspect={handleInspectRoute} selectedRouteId={selectedRoute?.id} onSelect={handleSelectRoute} hoveredRouteId={hoveredRouteId} onHover={setHoveredRouteId} isContextMatch={relevantCategory === "create"}  isContextDim={relevantCategory !== null && relevantCategory !== "create"}  recommendedRouteId={recommendedRouteId} recommendedReason={recommendedReason} onStartRoute={!hypothesisPh && isReady ? setConfirmRoute : undefined} isDeemphasized={!isReady} isReady={isReady} hypothesisPhase={hypothesisPh} phase={phase} editorialRoles={editorialRoles} claimsMap={claimsMap} onReEvaluate={handleReEvaluate} reEvalLoadingId={reEvalLoading} proposalsMap={routeProposalsMap} onGenerateProposal={handleGenerateRouteProposal} canGenerate={canGenRoute} generateLoadingId={generateLoadingRouteId} onAcceptProposal={handleAcceptRouteProposal} onRejectProposal={handleRejectRouteProposal} canApply={canApply} canReject={canReject} acceptLoadingProposalId={acceptLoadingProposalId} rejectLoadingProposalId={rejectLoadingProposalId} driftRefreshKey={driftBadgeRefreshKey} onCheckDrift={handleCheckRouteDrift} checkingSurfaceId={checkingSurfaceId} />
                </div>
              )}
            </>
          ) : (
            <div className="crpv-r-columns">
              <RoutesColumn category="fix"     items={fix}     rationales={routeRationaleMap} onInspect={handleInspectRoute} selectedRouteId={selectedRoute?.id} onSelect={handleSelectRoute} hoveredRouteId={hoveredRouteId} onHover={setHoveredRouteId} isContextMatch={relevantCategory === "fix"}     isContextDim={relevantCategory !== null && relevantCategory !== "fix"}     recommendedRouteId={recommendedRouteId} recommendedReason={recommendedReason} onStartRoute={!hypothesisPh && isReady ? setConfirmRoute : undefined} isDeemphasized={!isReady} isReady={isReady} hypothesisPhase={hypothesisPh} phase={phase} subtitleOverride={hypothesisPh ? phasePriority.routes.hypothesisSubtitleOverride : undefined} recommendedLabel={phasePriority.routes.recommendedLabel} recommendedReasonPrefix={phasePriority.routes.recommendedReasonPrefix} editorialRoles={editorialRoles} claimsMap={claimsMap} onReEvaluate={handleReEvaluate} reEvalLoadingId={reEvalLoading} proposalsMap={routeProposalsMap} onGenerateProposal={handleGenerateRouteProposal} canGenerate={canGenRoute} generateLoadingId={generateLoadingRouteId} onAcceptProposal={handleAcceptRouteProposal} onRejectProposal={handleRejectRouteProposal} canApply={canApply} canReject={canReject} acceptLoadingProposalId={acceptLoadingProposalId} rejectLoadingProposalId={rejectLoadingProposalId} driftRefreshKey={driftBadgeRefreshKey} onCheckDrift={handleCheckRouteDrift} checkingSurfaceId={checkingSurfaceId} />
              <RoutesColumn category="improve" items={improve} rationales={routeRationaleMap} onInspect={handleInspectRoute} selectedRouteId={selectedRoute?.id} onSelect={handleSelectRoute} hoveredRouteId={hoveredRouteId} onHover={setHoveredRouteId} isContextMatch={relevantCategory === "improve"} isContextDim={relevantCategory !== null && relevantCategory !== "improve"} recommendedRouteId={recommendedRouteId} recommendedReason={recommendedReason} onStartRoute={!hypothesisPh && isReady ? setConfirmRoute : undefined} isDeemphasized={!isReady} isReady={isReady} hypothesisPhase={hypothesisPh} phase={phase} subtitleOverride={hypothesisPh ? phasePriority.routes.hypothesisSubtitleOverride : undefined} recommendedLabel={phasePriority.routes.recommendedLabel} recommendedReasonPrefix={phasePriority.routes.recommendedReasonPrefix} editorialRoles={editorialRoles} claimsMap={claimsMap} onReEvaluate={handleReEvaluate} reEvalLoadingId={reEvalLoading} proposalsMap={routeProposalsMap} onGenerateProposal={handleGenerateRouteProposal} canGenerate={canGenRoute} generateLoadingId={generateLoadingRouteId} onAcceptProposal={handleAcceptRouteProposal} onRejectProposal={handleRejectRouteProposal} canApply={canApply} canReject={canReject} acceptLoadingProposalId={acceptLoadingProposalId} rejectLoadingProposalId={rejectLoadingProposalId} driftRefreshKey={driftBadgeRefreshKey} onCheckDrift={handleCheckRouteDrift} checkingSurfaceId={checkingSurfaceId} />
              <RoutesColumn category="create"  items={create}  rationales={routeRationaleMap} onInspect={handleInspectRoute} selectedRouteId={selectedRoute?.id} onSelect={handleSelectRoute} hoveredRouteId={hoveredRouteId} onHover={setHoveredRouteId} isContextMatch={relevantCategory === "create"}  isContextDim={relevantCategory !== null && relevantCategory !== "create"}  recommendedRouteId={recommendedRouteId} recommendedReason={recommendedReason} onStartRoute={!hypothesisPh && isReady ? setConfirmRoute : undefined} isDeemphasized={!isReady} isReady={isReady} hypothesisPhase={hypothesisPh} phase={phase} subtitleOverride={hypothesisPh ? phasePriority.routes.hypothesisSubtitleOverride : undefined} recommendedLabel={phasePriority.routes.recommendedLabel} recommendedReasonPrefix={phasePriority.routes.recommendedReasonPrefix} editorialRoles={editorialRoles} claimsMap={claimsMap} onReEvaluate={handleReEvaluate} reEvalLoadingId={reEvalLoading} proposalsMap={routeProposalsMap} onGenerateProposal={handleGenerateRouteProposal} canGenerate={canGenRoute} generateLoadingId={generateLoadingRouteId} onAcceptProposal={handleAcceptRouteProposal} onRejectProposal={handleRejectRouteProposal} canApply={canApply} canReject={canReject} acceptLoadingProposalId={acceptLoadingProposalId} rejectLoadingProposalId={rejectLoadingProposalId} driftRefreshKey={driftBadgeRefreshKey} onCheckDrift={handleCheckRouteDrift} checkingSurfaceId={checkingSurfaceId} />
            </div>
          )}
        </>
      )}

      {selectedRoute && (
        <ClientDecisionBanner route={selectedRoute} savedAt={decisionSavedAt} onClear={handleClearDecision} isHypothesis={!isReady} />
      )}

      {isReroute && (
        <div style={{ border: "1px solid #FAC846", borderRadius: 6, padding: "10px 16px", marginTop: 4, background: "#fef9ec" }}>
          <p style={{ fontSize: 12, color: "#888", margin: "0 0 2px", fontWeight: 500 }}>⚠ This path may need to be reconsidered.</p>
          <p style={{ fontSize: 11, color: "#999", margin: 0, lineHeight: 1.5 }}>Review alternative paths or confirm the open conditions.</p>
        </div>
      )}

      {confirmRoute && (
        <>
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.28)", zIndex: 40 }}
            onClick={() => setConfirmRoute(null)}
          />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", background: "#fff", borderRadius: 8, padding: "28px 32px", zIndex: 41, minWidth: 320, maxWidth: 420, boxShadow: "0 4px 32px rgba(0,0,0,0.16)" }}>
            <p style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.1em", color: "#999", textTransform: "uppercase", margin: "0 0 10px" }}>
              Start this route
            </p>
            <p style={{ fontSize: 16, fontWeight: 600, color: "#111", margin: "0 0 8px", lineHeight: 1.3 }}>
              {confirmRoute.title}
            </p>
            <p style={{ fontSize: 13, color: "#888", margin: "0 0 24px", lineHeight: 1.5 }}>
              This will become your current path.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => handleConfirmStart(confirmRoute)}
                style={{ background: "#111", color: "#fff", border: "none", borderRadius: 4, padding: "8px 18px", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
              >
                Start route
              </button>
              <button
                type="button"
                onClick={() => setConfirmRoute(null)}
                style={{ background: "none", color: "#888", border: "1px solid #ddd", borderRadius: 4, padding: "8px 16px", fontSize: 13, cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {!hasHierarchy && (
        <CanonicalRouteInspectPanel
          open={!!inspectRoute}
          onClose={() => setInspectRoute(null)}
          route={inspectRoute}
          detail={inspectDetail}
          rationale={inspectRationale}
          areaScoresJson={activeCompany?.area_scores_json}
          linkedDesiredOutcome={null}
          currentPhase={phase}
          staleNote={
            inspectRoute && latestExclusionAt && isArtifactStale(inspectRoute, latestExclusionAt)
              ? "Needs review after excluded inputs"
              : null
          }
        />
      )}
      {driftPanel && (
        <DriftDetailPanel
          open
          onClose={() => setDriftPanel(null)}
          surfaceType={driftPanel.surfaceType}
          surfaceId={driftPanel.surfaceId}
          refreshKey={driftBadgeRefreshKey}
          onRefresh={() => setDriftBadgeRefreshKey((k) => k + 1)}
          onProposeChanges={() => handleGenerateRouteProposal(driftPanel.surfaceId)}
          proposeChangesLabel="Propose route changes from current evidence"
        />
      )}

      {flowCommitClaim && activeCompany?.id && (
        <FlowCommitSheet
          open={!!flowCommitClaim}
          onOpenChange={(o) => { if (!o) setFlowCommitClaim(null); }}
          claimId={flowCommitClaim.id}
          claimStatement={flowCommitClaim.statement}
          companyId={activeCompany.id}
          onSuccess={() => {
            setFlowCommitClaim(null);
            setClaimsRefreshKey((k) => k + 1);
            onCommitSuccess?.();
          }}
        />
      )}
    </div>
  );
}
