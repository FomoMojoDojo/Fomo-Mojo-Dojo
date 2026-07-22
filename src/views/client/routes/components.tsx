// Routes view components — relocated verbatim from ClientRefinePreviewRoutesView (strand 3a).
import { useEffect, useMemo, useRef, useState, useCallback, Fragment } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useCompany } from "@/hooks/useCompany";
import type { Company, ExcludedSignal } from "@/hooks/useCompany";
import { useClientViewData } from "@/hooks/useClientViewData";
import { useCapability } from "@/hooks/useCapability";
import { useRouteHypothesisDependencies, useStrategicHypotheses } from "@/hooks/useStrategicHypotheses";
import { supabase } from "@/integrations/supabase/client";
import { isFrozenCompany } from "@/lib/frozenCompanies";
import { captureBaseline } from "@/lib/baselineCapture";
import { stageLabel } from "@/lib/phaseDisplay";
import { saveManualEdit } from "@/lib/manualInlineEdit";
import InlineTextEdit from "@/components/inline-edit/InlineTextEdit";
import InlineTextareaEdit from "@/components/inline-edit/InlineTextareaEdit";
import { useRoutes, type RouteAssumption } from "@/hooks/useRoutes";
import { CLIENT_REFINE_PREVIEW_ROUTE, CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE, CLIENT_REFINE_PREVIEW_PATH_ROUTE, CLIENT_REFINE_PREVIEW_INBOX_ROUTE, CLIENT_REFINE_PREVIEW_MEMBERS_ROUTE, CLIENT_REFINE_PREVIEW_EXTRACTS_ROUTE } from "@/lib/clientRefinePreview";
import { useDriftInboxCount } from "@/hooks/useDriftInbox";
import { setActivePath } from "@/lib/activePath";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import CanonicalRouteInspectPanel, { type RouteInspectDetail as CanonicalRouteInspectDetail } from "@/components/routes/RouteInspectPanel";
import ScoreContextBar from "@/components/score/ScoreContextBar";
import { buildReadinessFromCompanySignals } from "@/lib/mojoScoreFromAnatomy";
import type { RouteRow } from "@/hooks/useRoutes";
import type { JobStepRow } from "@/hooks/useJobSteps";
import { useOdiNeeds } from "@/hooks/useOdiNeeds";
import type { OdiNeedRow } from "@/hooks/useOdiNeeds";
import { usePublicBaseline } from "@/hooks/usePublicBaseline";
import { usePositioningCanvas } from "@/hooks/usePositioningCanvas";
import { useStrategyCascade } from "@/hooks/useStrategyCascade";
import { SignalBar } from "../workshop/tabs/OutsidePanels";
import type { SignalStage } from "../workshop/types";
import { baselineOf } from "../workshop/helpers";
import {
  routeRelativeTime,
  buildDecisionBullets,
  persistSelectedRouteDecision,
  clearSelectedRouteDecision,
  insertRouteDecisionEvent,
} from "@/lib/routeDecision";
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
import { R, RouteCategory, CATEGORY_META, CATEGORY_POSTURE_LABEL, isHypothesisPhase, toSentence, deriveClientWhyReasons, deriveCanonicalRouteSentence, EvidenceItem, ClientAssumption, CLIENT_LAYER_LABELS, CLIENT_STATUS_LABELS, CLIENT_STATUS_COLORS, CLIENT_STATUS_GLYPHS, deriveStrengthMoves, DetailItem, statusGlyph, statusTip, ROUTE_FIELD_LABELS, ROUTE_FIELDS, summarizeRouteValue, routeDiffedFields, routeTimeAgo, WrapAlt, WrapCond, HIERARCHY_STATE_ACCENT, HIERARCHY_STATE_LABEL, HIERARCHY_FRAMING, HIERARCHY_HERO, inferRelevantCategory } from "./shared";
import { ExpandRingBtn, ExpandRingIndicator, InkMetaChip, RouteStateTag, ScoreChip, HierarchyScoreStrip, KeystoneStripe } from "./primitives";

export function ClientRouteInspectPanel({
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

export function ClientDecisionBanner({
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

export function RouteWhyRisingPanel({
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

export function RouteProposalSection({
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

export function RouteCard({
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

export function RoutesColumn({
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

export function HierarchyWrapPanel({
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

export function HierarchyPageHeader({
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

// Gate 3: belief-only test surfaced read-only on a test-class leg. Reads the leg's
// one primary `tests` row (action_id = leg.id) and renders the signed strings +
// derived honesty states. The admin Generate/Regenerate control (non-frozen only)
// invokes generate-leg-tests company-wide; a failure (including a gateway cut or
// isolate kill) reports HONESTLY as an error and refreshes to show whatever
// landed server-side (CH-0b — the per-leg chunked progress UI is CH-1). There is
// NO result-entry control — a result is displayed verbatim if present, never set.
type LegTestRow = {
  id: string;
  hypothesis: string;
  expected_positive_signal: string;
  expected_negative_signal: string;
  result: string | null;
  no_test_needed: boolean;
  no_test_needed_reason: string | null;
};

function LegTestState({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ marginTop: 4 }}>
      <p style={{ fontFamily: R.sans, fontSize: 13, fontWeight: 600, color: "rgba(17,17,17,0.7)", margin: 0, lineHeight: 1.4 }}>{title}</p>
      {sub && <p style={{ fontFamily: R.sans, fontSize: 12, color: "rgba(17,17,17,0.5)", margin: "3px 0 0", lineHeight: 1.5 }}>{sub}</p>}
    </div>
  );
}

function LegTestField({ label, helper, children }: { label: string; helper?: string; children: string }) {
  return (
    <div>
      <span style={{ fontFamily: R.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(17,17,17,0.4)" }}>{label}</span>
      {helper && <span style={{ fontFamily: R.sans, fontSize: 11, color: "rgba(17,17,17,0.4)", marginLeft: 8, fontStyle: "italic" }}>{helper}</span>}
      <p style={{ fontFamily: R.sans, fontSize: 13, color: "rgba(17,17,17,0.8)", margin: "3px 0 0", lineHeight: 1.5 }}>{children}</p>
    </div>
  );
}

function LegTestPanel({
  legId,
  companyId,
  refreshKey,
  onGenerated,
  declinedReason,
}: {
  legId: string;
  companyId: string;
  refreshKey?: number;
  onGenerated?: () => void;
  // CG-2: the verbatim honesty-judge reason this leg's test was declined for, stamped
  // durably on the leg's wwhtbt[0] (test_declined_reason). Present ⇒ attempted-and-declined
  // (distinct from never-attempted). Null/absent ⇒ no decline on record.
  declinedReason?: string | null;
}) {
  const { isAdmin } = useAuth();
  const [test, setTest] = useState<LegTestRow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [localRefresh, setLocalRefresh] = useState(0);
  const [generating, setGenerating] = useState(false);
  const frozen = isFrozenCompany(companyId);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    supabase
      .from("tests")
      .select("id, hypothesis, expected_positive_signal, expected_negative_signal, result, no_test_needed, no_test_needed_reason")
      .eq("company_id", companyId)
      .eq("action_id", legId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setTest((data as LegTestRow | null) ?? null);
        setLoaded(true);
      });
    return () => { active = false; };
  }, [companyId, legId, refreshKey, localRefresh]);

  const handleGenerate = useCallback(async () => {
    if (generating) return;
    if (frozen) {
      toast.error("This is a frozen reference company — tests aren't generated for it.");
      return;
    }
    setGenerating(true);
    toast.loading("Drafting tests for test-class legs… (~1-2 min)", { id: "gen-leg-tests" });
    try {
      const { data, error } = await supabase.functions.invoke("generate-leg-tests", {
        body: { company_id: companyId, write: true },
      });
      if (data && data.ok === false) {
        toast.error(data.error || "Couldn't draft tests.", { id: "gen-leg-tests" });
        return;
      }
      if (error) throw error;
      toast.success("Tests drafted — hypotheses only, no results invented", { id: "gen-leg-tests" });
      setLocalRefresh((k) => k + 1);
      onGenerated?.();
    } catch (err) {
      // CH-0b: the failure path tells the truth. The old branch toasted SUCCESS on
      // any error — an isolate kill read as "Tests drafted". Writes that landed
      // server-side before a gateway cut still surface via the refresh below; the
      // honest per-leg progress UI is the chunking gate (CH-1).
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[LegTestPanel] generate-leg-tests:", err);
      toast.error(`Test drafting failed or didn't confirm — ${message}. If the run was still working server-side, refresh in a minute to see what landed.`, { id: "gen-leg-tests" });
      setLocalRefresh((k) => k + 1);
      onGenerated?.();
    } finally {
      setGenerating(false);
    }
  }, [generating, frozen, companyId, onGenerated]);

  return (
    <div style={{ margin: "10px 0 8px", padding: "12px 14px", border: `1px solid ${R.hairline}`, borderRadius: 4, background: "rgba(17,17,17,0.015)" }}>
      <p style={{ fontFamily: R.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: R.inkSoft, margin: "0 0 10px" }}>
        Test for this leg
      </p>
      {!loaded ? null : test === null && declinedReason ? (
        // CG-2: attempted-and-declined — the honesty judge refused this test and the
        // reason was stamped on the leg. Surface the STORED reason verbatim (never a
        // canned string posing as the judge), plus what unlocks it.
        <div style={{ marginTop: 4 }}>
          <p style={{ fontFamily: R.sans, fontSize: 13, fontWeight: 600, color: "#b45309", margin: 0, lineHeight: 1.4 }}>
            The honesty check declined this test.
          </p>
          <p style={{ fontFamily: R.sans, fontSize: 12, color: "rgba(17,17,17,0.6)", margin: "3px 0 0", lineHeight: 1.5 }}>
            Reason: {declinedReason}
          </p>
          <p style={{ fontFamily: R.sans, fontSize: 12, color: "rgba(17,17,17,0.45)", margin: "6px 0 0", lineHeight: 1.5 }}>
            This unlocks once the leg's source condition is rewritten as a forward target. Regenerate conditions on the Routes panel, then draft the test again.
          </p>
        </div>
      ) : test === null ? (
        <LegTestState title="Test not yet drafted" sub="This leg is marked as a test, but no hypothesis has been written yet." />
      ) : test.no_test_needed ? (
        <LegTestState title="No test needed" sub={test.no_test_needed_reason || ""} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <LegTestField label="Hypothesis" helper="What this leg is betting is true.">{test.hypothesis}</LegTestField>
          <LegTestField label="If it's working, we'd see">{test.expected_positive_signal}</LegTestField>
          <LegTestField label="If it's not, we'd see">{test.expected_negative_signal}</LegTestField>
          {test.result ? (
            <LegTestField label="Result">{test.result}</LegTestField>
          ) : (
            <LegTestState title="Test not yet run — hypothesis only" sub="This is a starting hypothesis. It earns belief once the test runs." />
          )}
        </div>
      )}
      {isAdmin && !frozen && (
        test === null && declinedReason ? (
          // CG-2: in the declined state, re-running "Generate test" just re-hits the same
          // judge wall — the real unblock is upstream. Offer the honest next step, disabled
          // here because the condition control is not on this surface (name where it lives).
          <button
            type="button"
            disabled
            title="The condition control lives on the Routes panel — use “Regenerate conditions” there, then draft this test again."
            style={{
              marginTop: 12, fontFamily: R.mono, fontSize: 10, letterSpacing: "0.06em",
              padding: "5px 10px", borderRadius: 4, border: `1px solid ${R.hairline}`,
              background: "rgba(120,120,140,0.08)", color: R.inkSoft, cursor: "not-allowed", opacity: 0.55,
            }}
          >
            Regenerate condition first
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleGenerate(); }}
            disabled={generating}
            style={{
              marginTop: 12, fontFamily: R.mono, fontSize: 10, letterSpacing: "0.06em",
              padding: "5px 10px", borderRadius: 4, border: `1px solid ${R.hairline}`,
              background: generating ? "rgba(120,120,140,0.12)" : "transparent",
              color: R.inkSoft, cursor: generating ? "default" : "pointer", opacity: generating ? 0.6 : 1,
            }}
          >
            {generating ? "Drafting test…" : test ? "Regenerate test" : "Generate test"}
          </button>
        )
      )}
    </div>
  );
}

export function LegRow({
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
  legTestRefreshKey,
  onLegTestGenerated,
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
  legTestRefreshKey?: number;
  onLegTestGenerated?: () => void;
}) {
  const legClaimState = leg.claim_id
    ? ((claimsMap?.get(leg.claim_id)?.state ?? null) as ClaimState | null)
    : null;
  const showLegStateTag = legClaimState !== null && legClaimState !== routeClaimState;
  const steps    = (Array.isArray(leg.steps_json)    ? leg.steps_json    : []) as DetailItem[];
  const evidence = (Array.isArray(leg.evidence_json) ? leg.evidence_json : []) as DetailItem[];
  const conditions = (Array.isArray(leg.what_would_have_to_be_true) ? leg.what_would_have_to_be_true : []) as WrapCond[];
  const completedSteps = steps.filter((s) => s.status === "complete").length;

  // Gate 2: a generated leg (provenance_type='internal_hypothesis') is a starting
  // hypothesis derived from one route condition (carried in what_would_have_to_be_true).
  // When that source condition is satisfied, the leg renders struck-and-preserved
  // ("✓ Condition met") — the move text and its condition stay readable.
  const isGeneratedLeg = leg.provenance_type === "internal_hypothesis";
  const sourceCondition = isGeneratedLeg ? (conditions[0] ?? null) : null;
  const isConditionMet = !!sourceCondition?.satisfied_flag;
  // Test-class legs (the 70b judge classified them as evidence-gathering) carry a "Test"
  // marker alongside "Starting hypothesis" — Gate 3 attaches the test content to these.
  const isTestLeg = sourceCondition?.leg_class === "test";
  // Hole-close (piece #2): a leg whose source condition was re-rolled away is stamped
  // orphaned on its carried condition. It NEVER disappears — it keeps rendering here with
  // an honest ⚠ badge and its reason, mirroring how struck claims kept a visible residual.
  const legHead = conditions[0];
  const isOrphaned = !!legHead?.orphaned;
  const orphanReason = String(legHead?.orphaned_reason ?? "");
  // CG-2: a durable decline stamp (test_declined) means the honesty judge refused this
  // leg's test — the render shows attempted-and-declined distinctly from never-attempted,
  // surfacing the STORED judge reason verbatim.
  const testDeclinedReason = legHead?.test_declined ? String(legHead?.test_declined_reason ?? "") : null;
  // Strip a loose trailing em/en-dash a generator can leave behind — it reads as unfinished.
  const legTitle = (leg.title || "").replace(/\s*[—–]+\s*$/, "").trimEnd();

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
          {isOrphaned && (
            <span style={{ fontFamily: R.mono, fontSize: 8.5, letterSpacing: "0.1em", color: "#b45309", border: "1px solid #b45309", background: "rgba(180,83,9,0.08)", borderRadius: 2, padding: "2px 6px", flexShrink: 0 }}>
              ⚠ Orphaned
            </span>
          )}
          {isConditionMet ? (
            <span style={{ fontFamily: R.mono, fontSize: 8.5, letterSpacing: "0.1em", color: R.signal, border: `1px solid ${R.signal}`, borderRadius: 2, padding: "2px 6px", flexShrink: 0 }}>
              ✓ Condition met
            </span>
          ) : isGeneratedLeg ? (
            <>
              <span style={{ fontFamily: R.mono, fontSize: 8.5, letterSpacing: "0.1em", color: R.inkSoft, border: `1px solid ${R.hairline}`, borderRadius: 2, padding: "2px 6px", flexShrink: 0 }}>
                Starting hypothesis
              </span>
              {isTestLeg && (
                <span style={{ fontFamily: R.mono, fontSize: 8.5, letterSpacing: "0.1em", color: R.signal, border: `1px solid ${R.signal}`, borderRadius: 2, padding: "2px 6px", flexShrink: 0 }}>
                  Test
                </span>
              )}
            </>
          ) : null}
          <h3 style={{ fontFamily: R.sans, fontSize: 18, fontWeight: 600, color: R.ink, margin: 0, lineHeight: 1.2, letterSpacing: "-0.01em", flex: 1, minWidth: 0 }}>
            <InlineTextEdit
              value={legTitle}
              onSave={onSaveField ? (v) => onSaveField(leg.id, "title", v) : async () => {}}
              placeholder="Untitled leg"
              disabled={!onSaveField}
              style={{ fontFamily: R.sans, fontSize: 18, fontWeight: 600, color: isConditionMet ? "rgba(17,17,17,0.45)" : R.ink, textDecoration: isConditionMet ? "line-through" : undefined, lineHeight: 1.2, letterSpacing: "-0.01em" }}
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
        {/* Derivation: the route condition this leg would establish (preserved when met) */}
        {sourceCondition && (
          <p style={{ fontSize: 12, color: "rgba(17,17,17,0.5)", margin: "0 0 8px", lineHeight: 1.5 }}>
            <span style={{ fontFamily: R.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(17,17,17,0.4)" }}>What this would establish: </span>
            {sourceCondition.condition}
          </p>
        )}
        {/* Hole-close (piece #2): the honest home for a declared-orphan leg — rendered in
            place with its reason, never silently dropped (never-disappear law). */}
        {isOrphaned && (
          <p style={{ fontSize: 12, color: "#b45309", margin: "0 0 8px", lineHeight: 1.5, background: "rgba(180,83,9,0.06)", borderLeft: "2px solid #b45309", padding: "6px 10px", borderRadius: 2 }}>
            <span style={{ fontFamily: R.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em" }}>Orphaned leg — </span>
            {orphanReason || "its source condition was re-rolled away and no longer maps to a live condition."}
          </p>
        )}
        {/* Gate 3: belief-only test on test-class legs (read-only surface) */}
        {isTestLeg && (
          <LegTestPanel
            legId={leg.id}
            companyId={leg.company_id}
            refreshKey={legTestRefreshKey}
            onGenerated={onLegTestGenerated}
            declinedReason={testDeclinedReason}
          />
        )}
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

export function HierarchyRouteSection({
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
  legTestRefreshKey,
  onLegTestGenerated,
  onSelect,
  onClear,
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
  legTestRefreshKey?: number;
  onLegTestGenerated?: () => void;
  onSelect?: (route: RouteRow) => void;
  onClear?: () => void;
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

  // Gate 4: route-choose mechanic. The chosen path is the route whose id IS the
  // company's selected_route_id. The control is admin-only + non-frozen (same gate
  // as gen-legs/gen-tests); on frozen CB1/CB2 it never renders, so it can never
  // write. One chosen path at a time is enforced by the existing handler toggle.
  const { isAdmin } = useAuth();
  const isFrozen    = isFrozenCompany(route.company_id);
  const isChosen    = !!selectedRouteId && route.id === selectedRouteId;
  const showChoose  = isAdmin && !isFrozen && !!onSelect;

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
            {/* Gate 4: route-choose control + CHOSEN PATH marker (admin-only, non-frozen) */}
            {showChoose && (
              <>
                {selectedRouteId && (
                  <span style={{
                    fontFamily: R.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em",
                    color: isChosen ? R.signal : R.inkFaint, fontWeight: isChosen ? 600 : 400, flexShrink: 0,
                  }}>
                    {isChosen ? "CHOSEN PATH" : "Working hypothesis"}
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); if (isChosen) { onClear?.(); } else { onSelect?.(route); } }}
                  style={{
                    fontSize: 11, fontFamily: R.mono, color: isChosen ? R.inkFaint : R.ink,
                    textDecoration: "underline", textUnderlineOffset: 2,
                    background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0,
                  }}
                >
                  {isChosen ? "Deselect" : "Choose this path →"}
                </button>
              </>
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
              legTestRefreshKey={legTestRefreshKey}
              onLegTestGenerated={onLegTestGenerated}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Hierarchy: group card (legacy — kept for non-spec clients) ───────────────

export function HierarchyGroupCard({
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
