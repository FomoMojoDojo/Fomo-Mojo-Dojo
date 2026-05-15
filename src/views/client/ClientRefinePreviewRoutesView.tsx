import { useEffect, useMemo, useState, useCallback, Fragment } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useCompany } from "@/hooks/useCompany";
import type { Company, ExcludedSignal } from "@/hooks/useCompany";
import { useClientViewData } from "@/hooks/useClientViewData";
import { useRouteHypothesisDependencies, useStrategicHypotheses } from "@/hooks/useStrategicHypotheses";
import { useRoutes, type RouteAssumption } from "@/views/Routes/useRoutes";
import { CLIENT_REFINE_PREVIEW_ROUTE, CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE, CLIENT_REFINE_PREVIEW_PATH_ROUTE } from "@/lib/clientRefinePreview";
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
import { useCompanyClaims, type ClaimRow } from "@/lib/claims/useCompanyClaims";
import ClaimStateBadge from "@/components/claims/ClaimStateBadge";
import type { ClaimState } from "@/lib/claimState";

type RouteCategory = "fix" | "improve" | "create";

const CATEGORY_META: Record<RouteCategory, { label: string; subtitle: string; hypothesisSubtitle: string }> = {
  fix:     { label: "Under Pressure",    subtitle: "Unresolved friction the evidence flags as actively limiting.",        hypothesisSubtitle: "Gaps that appear in the evidence — not yet confirmed." },
  improve: { label: "Under Validation",  subtitle: "Areas showing partial progress where evidence suggests continued pressure.", hypothesisSubtitle: "Areas showing partial progress — worth confirming." },
  create:  { label: "Directional",       subtitle: "New directions suggested by the evidence — no existing path covers this.", hypothesisSubtitle: "New directions suggested by the signals — hypothesis only." },
};

const CATEGORY_POSTURE_LABEL: Record<string, string> = {
  fix:     "Under Pressure",
  improve: "Under Validation",
  create:  "Directional",
};

function isHypothesisPhase(phase: string): boolean {
  return ["outside_signals", "validate_outside", "diagnose", "validate_diagnose"].includes(phase);
}

function stageLabel(value: string) {
  if (value === "outside_signals" || value === "validate_outside" || value === "outside") return "outside signals";
  if (value === "diagnose" || value === "validate_diagnose" || value === "diagnosis") return "diagnose";
  if (value === "focus" || value === "validate_focus") return "focus";
  if (value === "flow" || value === "validate_flow" || value === "execution") return "flow";
  return "diagnose";
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
    if (reasons.length < 2) reasons.push("Addressing this removes a constraint that the signals say is compounding.");
  } else if (category === "improve") {
    reasons.push("Evidence shows partial progress — this route targets the remaining gap.");
    if (reasons.length < 2) reasons.push("Strengthening here removes an active constraint the evidence has surfaced.");
  } else {
    reasons.push("The signals suggest an unmet need — no existing path currently covers this.");
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
    : "No existing path covers this area. The signals suggest unmet demand.";
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
  supported: "#5F9B8C",
  partial:   "#FAC846",
  unproven:  "#999999",
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
      background: isHypothesis ? "#f7f5f1" : "#f0f7f5",
      border: isHypothesis ? "1px solid #d4cfc7" : "1px solid #5F9B8C",
      borderRadius: 6,
      padding: "16px 20px",
      marginBottom: 24,
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, fontFamily: "monospace", letterSpacing: "0.08em", color: isHypothesis ? "#888" : "#5F9B8C", fontWeight: 600, textTransform: "uppercase" }}>
          {isHypothesis ? "Working hypothesis" : "Chosen path"}
        </span>
        {category && (
          <span style={{ fontSize: 10, fontFamily: "monospace", letterSpacing: "0.06em", color: "#5F9B8C", background: "#d5ece7", borderRadius: 3, padding: "1px 6px", textTransform: "uppercase" }}>
            {CATEGORY_POSTURE_LABEL[category] ?? category}
          </span>
        )}
        <button
          type="button"
          onClick={onClear}
          style={{ marginLeft: "auto", fontSize: 11, color: "#999", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          Deselect
        </button>
      </div>

      <p style={{ fontSize: 14, fontWeight: 600, color: "#111", margin: 0, lineHeight: 1.4 }}>
        {route.title || "Untitled route"}
      </p>

      {bullets.length > 0 && (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
          {bullets.map((b, i) => (
            <li key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "#555", lineHeight: 1.5 }}>
              <span style={{ color: "#5F9B8C", flexShrink: 0 }}>·</span>
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
}) {


  const [expanded, setExpanded] = useState(false);

  const steps    = (Array.isArray(route.steps_json)    ? route.steps_json    : []) as DetailItem[];
  const evidence = (Array.isArray(route.evidence_json) ? route.evidence_json : []) as DetailItem[];
  const why      = Array.isArray(route.why_this_matters_json) ? route.why_this_matters_json : [];

  const pts    = typeof route.pts_value === "number" ? Math.round(route.pts_value) : null;
  const effort = route.effort ? String(route.effort).toUpperCase() : null;
  const completedSteps = steps.filter((s) => s.status === "complete").length;

  const leftAccent = "inset 2px 0 0 #555555";
  const hoverShadow = "0 2px 12px rgba(95,155,140,0.15)";
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
          ? "2px solid #5F9B8C"
          : isHovered
          ? "1.5px solid #b0c9c4"
          : "1.5px solid transparent",
        outlineOffset: isSelected ? -2 : -1,
        boxShadow,
        opacity: isOtherSelected ? 0.42 : isOtherHovered ? 0.72 : editorialQuiet ? 0.54 : phaseSoftened ? 0.62 : isContextDim ? 0.85 : undefined,
      }}
    >
      <button
        type="button"
        className="crpv-r-card-trigger"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="crpv-r-card-top">
          <span className="crpv-r-card-title" style={isContextMatch ? { fontWeight: 600 } : undefined}>{route.title || "Untitled route"}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isSelected && (
              <span style={{
                fontSize: 10,
                fontFamily: "monospace",
                letterSpacing: "0.06em",
                color: isFlow && rationale?.movement === "weaken" ? "#c0634a" : "#5F9B8C",
                background: isFlow && rationale?.movement === "weaken" ? "#faeae5" : "#d5ece7",
                borderRadius: 3,
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

          <div className="crpv-r-detail-section" style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {onSelect && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelect(route); }}
                style={{
                  fontSize: 11,
                  color: isSelected ? "#999" : "#5F9B8C",
                  textDecoration: "underline",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  fontFamily: "monospace",
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
          </div>
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientRefinePreviewRoutesView() {
  const navigate = useNavigate();
  const { companies, setActiveCompanyId, loading: companiesLoading } = useCompany();
  const { activeCompany, hasCompany, confidence } = useClientViewData({ actionLimit: 5 });
  const { loading: routesLoading, items: routes } = useRoutes(activeCompany?.id);
  const { needs } = useOdiNeeds(activeCompany?.id);
  const phase = floorEngagementPhase({
    phase: activeCompany?.engagement_phase ?? "outside_signals",
    hasNeedsWithScores: needs.some((n) => n.importance > 0),
    hasSelectedRoute: !!activeCompany?.selected_route_id,
  });
  const { preferredRun: baselineRun } = usePublicBaseline(activeCompany?.id);
  const { item: positioning } = usePositioningCanvas(activeCompany?.id);
  const { item: strategy } = useStrategyCascade(activeCompany?.id);
  const [activeStage, setActiveStage] = useState<SignalStage>("org");
  const [searchParams, setSearchParams] = useSearchParams();
  const routeIdParam = searchParams.get("routeId");

  const baseline = baselineOf(baselineRun);
  const excludedCount = activeCompany?.excluded_signals_json?.length ?? 0;

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
          <span className="cap">
            [{toSentence(activeCompany?.name) || "COMPANY"}] · EXPLORE ROUTES · {stageLabel(phase).toUpperCase()}
          </span>
        </div>
        <div className="crpv-header-tools">
          <button type="button" className="btn ghost" onClick={() => navigate(CLIENT_REFINE_PREVIEW_PATH_ROUTE)}>Active Path →</button>
          <button type="button" className="btn ghost" onClick={goToWorkshop}>Edit strategy →</button>
          <button type="button" className="btn ghost" onClick={goToRefineHome}>← Refine Home</button>
          <button type="button" className="btn ghost crpv-main-site-btn" onClick={goToMainSite}>← Main site</button>
        </div>
      </header>

      <ScoreContextBar
        currentScore={currentScore}
        reachableScore={reachableScore}
        unlockableScore={unlockableScore}
        routesCount={routes.length}
        confidenceLabel={readinessLabel}
        ceilingReason={ceilingReason}
      />

      <SignalBar
        activeStage={activeStage}
        setActiveStage={handleStageChange}
        baseline={baseline}
        positioning={positioning ?? null}
        strategy={strategy ?? null}
        excludedCount={excludedCount}
      />

      <div className="crpv-ws-content">
        <RoutesOrgPanel
          routes={routes}
          loading={routesLoading}
          activeCompany={activeCompany}
          routeIdParam={routeIdParam}
          onClearRouteIdParam={clearRouteIdParam}
          needs={needs}
        />
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
}) {
  const navigate = useNavigate();
  const [inspectRoute, setInspectRoute]     = useState<RouteRow | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [decisionSavedAt, setDecisionSavedAt] = useState<string | null>(null);
  const [hoveredRouteId, setHoveredRouteId]   = useState<string | null>(null);
  const [confirmRoute, setConfirmRoute]       = useState<RouteRow | null>(null);
  const { data: strategicHypothesisRows = [] } = useStrategicHypotheses(activeCompany?.id);
  const { data: routeHypothesisDependencies = [] } = useRouteHypothesisDependencies(activeCompany?.id);
  const { claims: claimsMap } = useCompanyClaims(activeCompany?.id);

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

  const isReroute = useMemo(() => {
    if (!selectedRoute) return false;
    const stale = latestExclusionAt ? isArtifactStale(selectedRoute, latestExclusionAt) : false;
    const ev = deriveClientEvidence(selectedRoute);
    return stale || deriveClientAssumptions(selectedRoute, ev).some((a) => a.critical && a.status === "unproven");
  }, [selectedRoute, latestExclusionAt]);

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
    <div className="crpv-ws-section crpv-ws-section-wide" data-tone={phasePriority.orientation.tone}>
      {/* ── Orientation Layer ──────────────────────────────────────────── */}
      <section
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
      </section>

      {/* ── Focal action (secondary to orientation) ────────────────────── */}
      {nextBestMove && (
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

      {/* ── Route context ──────────────────────────────────────────────── */}
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

      {(activeCompany?.excluded_signals_json?.length ?? 0) > 0 && (
        <div style={{ border: "1px solid #FAC846", borderRadius: 6, padding: "10px 16px", marginBottom: 16, background: "#fef9ec" }}>
          <p style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.08em", color: "#FAC846", textTransform: "uppercase", fontWeight: 600, margin: 0, lineHeight: 1.5 }}>
            Some outside signals were excluded. These recommendations may need review.
          </p>
        </div>
      )}

      {leadRoute && leadRouteRationale ? (
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

      {loading ? (
        <div className="crpv-ws-placeholder cap">Loading routes…</div>
      ) : (
        <>
          {!isReady && (
            <p style={{ fontSize: 11, color: "#999", margin: "0 0 14px", fontStyle: "italic" }}>
              {phasePriority.routes.unreadyNote}
            </p>
          )}
          <div className="crpv-r-columns">
            <RoutesColumn category="fix"     items={fix}     rationales={routeRationaleMap} onInspect={handleInspectRoute} selectedRouteId={selectedRoute?.id} onSelect={handleSelectRoute} hoveredRouteId={hoveredRouteId} onHover={setHoveredRouteId} isContextMatch={relevantCategory === "fix"}     isContextDim={relevantCategory !== null && relevantCategory !== "fix"}     recommendedRouteId={recommendedRouteId} recommendedReason={recommendedReason} onStartRoute={!hypothesisPh && isReady ? setConfirmRoute : undefined} isDeemphasized={!isReady} isReady={isReady} hypothesisPhase={hypothesisPh} phase={phase} subtitleOverride={hypothesisPh ? phasePriority.routes.hypothesisSubtitleOverride : undefined} recommendedLabel={phasePriority.routes.recommendedLabel} recommendedReasonPrefix={phasePriority.routes.recommendedReasonPrefix} editorialRoles={editorialRoles} claimsMap={claimsMap} />
            <RoutesColumn category="improve" items={improve} rationales={routeRationaleMap} onInspect={handleInspectRoute} selectedRouteId={selectedRoute?.id} onSelect={handleSelectRoute} hoveredRouteId={hoveredRouteId} onHover={setHoveredRouteId} isContextMatch={relevantCategory === "improve"} isContextDim={relevantCategory !== null && relevantCategory !== "improve"} recommendedRouteId={recommendedRouteId} recommendedReason={recommendedReason} onStartRoute={!hypothesisPh && isReady ? setConfirmRoute : undefined} isDeemphasized={!isReady} isReady={isReady} hypothesisPhase={hypothesisPh} phase={phase} subtitleOverride={hypothesisPh ? phasePriority.routes.hypothesisSubtitleOverride : undefined} recommendedLabel={phasePriority.routes.recommendedLabel} recommendedReasonPrefix={phasePriority.routes.recommendedReasonPrefix} editorialRoles={editorialRoles} claimsMap={claimsMap} />
            <RoutesColumn category="create"  items={create}  rationales={routeRationaleMap} onInspect={handleInspectRoute} selectedRouteId={selectedRoute?.id} onSelect={handleSelectRoute} hoveredRouteId={hoveredRouteId} onHover={setHoveredRouteId} isContextMatch={relevantCategory === "create"}  isContextDim={relevantCategory !== null && relevantCategory !== "create"}  recommendedRouteId={recommendedRouteId} recommendedReason={recommendedReason} onStartRoute={!hypothesisPh && isReady ? setConfirmRoute : undefined} isDeemphasized={!isReady} isReady={isReady} hypothesisPhase={hypothesisPh} phase={phase} subtitleOverride={hypothesisPh ? phasePriority.routes.hypothesisSubtitleOverride : undefined} recommendedLabel={phasePriority.routes.recommendedLabel} recommendedReasonPrefix={phasePriority.routes.recommendedReasonPrefix} editorialRoles={editorialRoles} claimsMap={claimsMap} />
          </div>
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
    </div>
  );
}
