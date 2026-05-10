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
import ScoreContextBar from "@/components/score/ScoreContextBar";
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
import { buildRouteRationales, type RouteRationale } from "@/lib/routeRationale";
import { deriveClientAssumptions, deriveClientEvidence } from "@/lib/routeClientNarrative";
import { buildRouteEditorialRoles, phaseNarrativePriority, softenRouteForPhase, sortRoutesForPhase, type RouteEditorialRole } from "@/lib/refinePreviewPhaseOrchestration";
import "@/styles/client-refine-preview.css";

type RouteCategory = "fix" | "improve" | "create";

const CATEGORY_META: Record<RouteCategory, { label: string; subtitle: string; hypothesisSubtitle: string }> = {
  fix:     { label: "Fix",     subtitle: "Address gaps that are holding back your score.",   hypothesisSubtitle: "Gaps that appear in the evidence — not yet confirmed." },
  improve: { label: "Improve", subtitle: "Strengthen what is partially in place.",           hypothesisSubtitle: "Areas showing partial progress — worth validating." },
  create:  { label: "Create",  subtitle: "Build new capabilities for growth.",               hypothesisSubtitle: "New capabilities suggested by the signals — hypothesis only." },
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
    reasons.push("This gap is actively limiting your score and customer outcomes.");
    if (reasons.length < 2) reasons.push("Addressing this now prevents the gap from compounding over time.");
  } else if (category === "improve") {
    reasons.push("Strengthening this area would measurably improve your readiness score.");
    if (reasons.length < 2) reasons.push("Partial progress exists — this route closes the remaining gap.");
  } else {
    reasons.push("Building this capability would unlock growth opportunities not currently available.");
    if (reasons.length < 2) reasons.push("This reflects unmet demand in your customer or market signals.");
  }
  return reasons.slice(0, 3);
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
              {category && <span className="crpv-r-badge">{category.toUpperCase()}</span>}
              {effort && <span className="crpv-r-badge">{effort} EFFORT</span>}
              {pts !== null && <span className="crpv-r-badge">{pts > 0 ? `+${pts}` : `${pts}`} PTS</span>}
            </div>
            <p className="crpv-inspect-title" style={{ color: "#111111" }}>{route.title || "Untitled route"}</p>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

            {/* What this claims */}
            <div className="crpv-inspect-section">
              <p className="crpv-inspect-section-label" style={{ color: "#999999" }}>What this claims</p>
              <p style={{ fontSize: 12, color: "#999999", margin: "4px 0 10px", lineHeight: 1.5 }}>
                This recommendation is based on the following signals.
              </p>
              <p style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.08em", color: "#999999", textTransform: "uppercase", margin: "0 0 8px" }}>
                Generated using: {genContext}
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
                  No conditions have been defined yet. Treat this route as a hypothesis until validated.
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
                    The largest improvement opportunity appears to be:{" "}
                    <span style={{ fontWeight: 500 }}>{moveFactor}</span>.
                  </p>
                  <p style={{ fontSize: 12, color: "#999999", margin: 0, lineHeight: 1.5 }}>
                    Improving this would make the route more ready to act on.
                  </p>
                </>
              ) : (
                <p style={{ fontSize: 13, color: "#999999", margin: "4px 0 0", lineHeight: 1.55 }}>
                  Run scoring to see what would most improve this route.
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
                    being validated.
                  </p>
                  <div style={{ border: "1px solid rgba(255,125,45,0.3)", borderRadius: 6, padding: "10px 12px", background: "rgba(255,125,45,0.05)" }}>
                    <p style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.08em", color: "#FF7D2D", textTransform: "uppercase", margin: "0 0 8px", fontWeight: 600 }}>
                      Critical conditions to validate
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
            {category}
          </span>
        )}
        {pts !== null && (
          <span style={{ fontSize: 10, fontFamily: "monospace", color: "#5F9B8C", marginLeft: 2 }}>
            {pts > 0 ? `+${pts} pts` : `${pts} pts`}
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
}: {
  route: RouteRow;
  rationale: RouteRationale;
  title: string;
  safeNowLabel: string;
}) {
  const [showEvidence, setShowEvidence] = useState(false);
  const combinedEvidence = useMemo(
    () => [...rationale.supportingEvidenceLines, ...rationale.weakeningEvidenceLines].slice(0, 4),
    [rationale.supportingEvidenceLines, rationale.weakeningEvidenceLines],
  );

  return (
    <section className="crpv-r-why-rising" aria-label="Why this route is rising">
      <div className="crpv-r-why-rising-header">
        <p className="cap">{title}</p>
        <h2>{route.title || "Untitled route"}</h2>
        <div className="crpv-r-why-rising-meta">
          <span className="crpv-r-readiness-state">{rationale.readiness}</span>
          <span>{rationale.movementLabel}</span>
          <span>{rationale.confidenceLabel}</span>
        </div>
      </div>

      <div className="crpv-r-why-rising-grid">
        <div>
          <p className="crpv-r-why-rising-label">{safeNowLabel}</p>
          <p>{rationale.readinessMeaning}</p>
        </div>
        <div>
          <p className="crpv-r-why-rising-label">Why this route exists</p>
          <p>{rationale.whyThisRouteExists}</p>
        </div>
        <div>
          <p className="crpv-r-why-rising-label">What evidence supports it</p>
          <p>{rationale.whatSupportsIt}</p>
        </div>
        <div>
          <p className="crpv-r-why-rising-label">What uncertainty still exists</p>
          <p>{rationale.uncertainty}</p>
        </div>
        <div>
          <p className="crpv-r-why-rising-label">What must become true</p>
          <p>{rationale.mustBecomeTrue}</p>
        </div>
        <div>
          <p className="crpv-r-why-rising-label">What could weaken it</p>
          <p>{rationale.couldWeaken}</p>
        </div>
      </div>

      {combinedEvidence.length > 0 ? (
        <div className="crpv-r-why-rising-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() => setShowEvidence((current) => !current)}
          >
            {showEvidence ? "Hide evidence" : "See evidence"}
          </button>
        </div>
      ) : null}

      {showEvidence ? (
        <div className="crpv-r-why-rising-evidence">
          {rationale.supportingEvidenceLines.length > 0 ? (
            <div className="crpv-r-why-rising-evidence-block">
              <p className="crpv-r-why-rising-label">Supporting evidence</p>
              {rationale.supportingEvidenceLines.slice(0, 3).map((line) => (
                <div key={line} className="crpv-r-why-rising-evidence-line">{line}</div>
              ))}
            </div>
          ) : null}
          {rationale.weakeningEvidenceLines.length > 0 ? (
            <div className="crpv-r-why-rising-evidence-block">
              <p className="crpv-r-why-rising-label">Possible weakening evidence</p>
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
  const editorialLabel =
    editorialRole === "recommended"
      ? "Lead route"
      : editorialRole === "improving"
        ? "Strengthening"
        : editorialRole === "risk"
          ? "Needs watching"
          : null;

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
        transition: "opacity 0.2s, outline 0.15s, box-shadow 0.15s",
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
              <span style={{ fontSize: 10, fontFamily: "monospace", letterSpacing: "0.06em", color: "#5F9B8C", background: "#d5ece7", borderRadius: 3, padding: "1px 6px", textTransform: "uppercase" }}>
                {isReady ? "Chosen path" : "Working hypothesis"}
              </span>
            )}
            <span className="crpv-r-card-chevron">{expanded ? "▲" : "▼"}</span>
          </div>
        </div>

        {editorialLabel ? <p className="crpv-r-card-editorial-label">{editorialLabel}</p> : null}

        {route.short_description ? (
          <p className="crpv-r-card-desc">{route.short_description}</p>
        ) : null}

        {rationale ? (
          <div className="crpv-r-card-rationale">
            <div className="crpv-r-card-rationale-top">
              <span className="crpv-r-readiness-state">{rationale.readiness}</span>
              <span className="crpv-r-card-rationale-state">{rationale.movementLabel}</span>
              <span className="crpv-r-card-rationale-state">{rationale.confidenceLabel}</span>
            </div>
            {!editorialQuiet ? <p className="crpv-r-card-rationale-copy">{rationale.whyThisRouteExists}</p> : null}
            {!editorialQuiet ? <p className="crpv-r-card-rationale-note">{rationale.readinessMeaning}</p> : null}
          </div>
        ) : null}

        <div className="crpv-r-card-meta">
          {pts !== null ? (
            <span className="crpv-r-badge">{pts > 0 ? `+${pts} PTS` : `${pts} PTS`}</span>
          ) : null}
          {effort ? <span className="crpv-r-badge">{effort} EFFORT</span> : null}
          {steps.length > 0 ? (
            <span className="crpv-r-badge-ghost">{completedSteps}/{steps.length} STEPS</span>
          ) : null}
        </div>
      </button>

      {expanded ? (
        <div className="crpv-r-card-detail">
          {rationale ? (
            <div className="crpv-r-detail-section">
              <p className="crpv-r-detail-label">Why this route</p>
              <div className="crpv-r-rationale-stack">
                <div className="crpv-r-rationale-row">
                  <span className="crpv-r-rationale-key">Readiness</span>
                  <p>{rationale.readinessMeaning}</p>
                </div>
                <div className="crpv-r-rationale-row">
                  <span className="crpv-r-rationale-key">Confidence</span>
                  <p>{rationale.confidenceLabel}</p>
                </div>
                <div className="crpv-r-rationale-row">
                  <span className="crpv-r-rationale-key">What supports it</span>
                  <p>{rationale.whatSupportsIt}</p>
                </div>
                <div className="crpv-r-rationale-row">
                  <span className="crpv-r-rationale-key">What still feels uncertain</span>
                  <p>{rationale.uncertainty}</p>
                </div>
                <div className="crpv-r-rationale-row">
                  <span className="crpv-r-rationale-key">What still needs proof</span>
                  <p>{rationale.mustBecomeTrue}</p>
                </div>
                <div className="crpv-r-rationale-row">
                  <span className="crpv-r-rationale-key">What could weaken it</span>
                  <p>{rationale.couldWeaken}</p>
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
}) {
  const meta = CATEGORY_META[category];

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
                editorialRole={editorialRoles?.get(route.id) ?? "default"}
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
  const phase = activeCompany?.engagement_phase ?? "outside_signals";
  const { loading: routesLoading, items: routes } = useRoutes(activeCompany?.id);
  const { needs } = useOdiNeeds(activeCompany?.id);
  const { preferredRun: baselineRun } = usePublicBaseline(activeCompany?.id);
  const { canvas: positioning } = usePositioningCanvas(activeCompany?.id);
  const { cascade: strategy } = useStrategyCascade(activeCompany?.id);
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

  const currentScore    = Math.round(Number(activeCompany?.mojo_score ?? 0));
  const potentialScore  = Math.round(Number(activeCompany?.potential_score ?? 0));
  const unlockableScore = Math.round(Number(activeCompany?.projected_score ?? 0));

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
        reachableScore={potentialScore}
        unlockableScore={unlockableScore}
        routesCount={routes.length}
        confidenceLabel={confidence.level}
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
}: {
  routes: RouteRow[];
  loading: boolean;
  activeCompany: Company | null | undefined;
  routeIdParam?: string | null;
  onClearRouteIdParam?: () => void;
  contextStep?: JobStepRow | null;
  nextBestMove?: NextBestMove;
  needs?: OdiNeedRow[];
}) {
  const navigate = useNavigate();
  const [inspectRoute, setInspectRoute]     = useState<RouteRow | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [decisionSavedAt, setDecisionSavedAt] = useState<string | null>(null);
  const [hoveredRouteId, setHoveredRouteId]   = useState<string | null>(null);
  const [confirmRoute, setConfirmRoute]       = useState<RouteRow | null>(null);
  const { data: strategicHypothesisRows = [] } = useStrategicHypotheses(activeCompany?.id);
  const { data: routeHypothesisDependencies = [] } = useRouteHypothesisDependencies(activeCompany?.id);

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

  const phase        = activeCompany?.engagement_phase ?? "outside_signals";
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

  async function handleSelectRoute(route: RouteRow) {
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


  return (
    <div className="crpv-ws-section crpv-ws-section-wide">
      {nextBestMove && (
        <div style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.1em", color: "#999", textTransform: "uppercase", margin: "0 0 8px" }}>
            {hypothesisPh ? "Most in focus" : phasePriority.phase === "flow" ? "What is shifting now" : "Do this next"}
          </p>
          {nextBestMove.type === "validate_needs" && topNeed ? (
            <>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: "0 0 4px", lineHeight: 1.35 }}>
                Talk to 8–10 customers about:
              </p>
              <p style={{ fontSize: 14, color: "#444", margin: "0 0 6px", lineHeight: 1.4, fontStyle: "italic" }}>
                "{topNeed.desired_outcome}"
              </p>
            </>
          ) : (
            <p style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: "0 0 6px", lineHeight: 1.35 }}>
              {nextBestMove.title}
            </p>
          )}
          <p style={{ fontSize: 12, color: "#777", margin: 0, lineHeight: 1.5 }}>
            {nextBestMove.reason}
          </p>
        </div>
      )}

      {topNeed && (
        <div style={{ marginBottom: 48 }}>
          <p style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.1em", color: "#999", textTransform: "uppercase", margin: "0 0 10px" }}>
            Focus area
          </p>
          <p style={{ fontSize: 14, color: "#333", margin: 0, lineHeight: 1.5 }}>
            {topNeed.desired_outcome}
          </p>
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
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
            title={phasePriority.routes.panelTitle}
            safeNowLabel={phasePriority.routes.safeNowLabel}
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
            <RoutesColumn category="fix"     items={fix}     rationales={routeRationaleMap} onInspect={setInspectRoute} selectedRouteId={selectedRoute?.id} onSelect={handleSelectRoute} hoveredRouteId={hoveredRouteId} onHover={setHoveredRouteId} isContextMatch={relevantCategory === "fix"}     isContextDim={relevantCategory !== null && relevantCategory !== "fix"}     recommendedRouteId={recommendedRouteId} recommendedReason={recommendedReason} onStartRoute={!hypothesisPh && isReady ? setConfirmRoute : undefined} isDeemphasized={!isReady} isReady={isReady} hypothesisPhase={hypothesisPh} phase={phase} subtitleOverride={hypothesisPh ? phasePriority.routes.hypothesisSubtitleOverride : undefined} recommendedLabel={phasePriority.routes.recommendedLabel} recommendedReasonPrefix={phasePriority.routes.recommendedReasonPrefix} editorialRoles={editorialRoles} />
            <RoutesColumn category="improve" items={improve} rationales={routeRationaleMap} onInspect={setInspectRoute} selectedRouteId={selectedRoute?.id} onSelect={handleSelectRoute} hoveredRouteId={hoveredRouteId} onHover={setHoveredRouteId} isContextMatch={relevantCategory === "improve"} isContextDim={relevantCategory !== null && relevantCategory !== "improve"} recommendedRouteId={recommendedRouteId} recommendedReason={recommendedReason} onStartRoute={!hypothesisPh && isReady ? setConfirmRoute : undefined} isDeemphasized={!isReady} isReady={isReady} hypothesisPhase={hypothesisPh} phase={phase} subtitleOverride={hypothesisPh ? phasePriority.routes.hypothesisSubtitleOverride : undefined} recommendedLabel={phasePriority.routes.recommendedLabel} recommendedReasonPrefix={phasePriority.routes.recommendedReasonPrefix} editorialRoles={editorialRoles} />
            <RoutesColumn category="create"  items={create}  rationales={routeRationaleMap} onInspect={setInspectRoute} selectedRouteId={selectedRoute?.id} onSelect={handleSelectRoute} hoveredRouteId={hoveredRouteId} onHover={setHoveredRouteId} isContextMatch={relevantCategory === "create"}  isContextDim={relevantCategory !== null && relevantCategory !== "create"}  recommendedRouteId={recommendedRouteId} recommendedReason={recommendedReason} onStartRoute={!hypothesisPh && isReady ? setConfirmRoute : undefined} isDeemphasized={!isReady} isReady={isReady} hypothesisPhase={hypothesisPh} phase={phase} subtitleOverride={hypothesisPh ? phasePriority.routes.hypothesisSubtitleOverride : undefined} recommendedLabel={phasePriority.routes.recommendedLabel} recommendedReasonPrefix={phasePriority.routes.recommendedReasonPrefix} editorialRoles={editorialRoles} />
          </div>
        </>
      )}

      {selectedRoute && (
        <ClientDecisionBanner route={selectedRoute} savedAt={decisionSavedAt} onClear={handleClearDecision} isHypothesis={!isReady} />
      )}

      {isReroute && (
        <div style={{ border: "1px solid #FAC846", borderRadius: 6, padding: "10px 16px", marginTop: 4, background: "#fef9ec" }}>
          <p style={{ fontSize: 12, color: "#888", margin: "0 0 2px", fontWeight: 500 }}>⚠ This path may need to be reconsidered.</p>
          <p style={{ fontSize: 11, color: "#999", margin: 0, lineHeight: 1.5 }}>Review alternative paths or validate the open conditions.</p>
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

      <ClientRouteInspectPanel
        open={!!inspectRoute}
        onClose={() => setInspectRoute(null)}
        route={inspectRoute}
        excludedSignals={activeCompany?.excluded_signals_json}
        areaScoresJson={activeCompany?.area_scores_json}
      />
    </div>
  );
}
