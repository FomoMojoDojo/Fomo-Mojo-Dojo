// Routes view shared substrate — relocated verbatim from ClientRefinePreviewRoutesView (strand 3a).
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

// ─── Design tokens (inline-style safe — no CSS var access) ───────────────────
export const R = {
  ink:          "#111111",
  inkSoft:      "#555555",
  inkFaint:     "#999999",
  signal:       "#ff5b29",
  hairline:     "rgba(17,17,17,0.12)",
  hairlineFaint: "rgba(17,17,17,0.08)",
  mono:         '"IBM Plex Mono", ui-monospace, monospace',
  sans:         '"Inter", system-ui, sans-serif',
} as const;

export type RouteCategory = "fix" | "improve" | "create";

export const CATEGORY_META: Record<RouteCategory, { label: string; subtitle: string; hypothesisSubtitle: string }> = {
  fix:     { label: "Under Pressure",    subtitle: "Unresolved friction the evidence flags as actively limiting.",        hypothesisSubtitle: "Gaps that appear in the evidence — not yet confirmed." },
  improve: { label: "Under Validation",  subtitle: "Areas showing partial progress where evidence suggests continued pressure.", hypothesisSubtitle: "Areas showing partial progress — worth confirming." },
  create:  { label: "Directional",       subtitle: "New directions suggested by the evidence — no existing path covers this.", hypothesisSubtitle: "New directions from the outside signals — hypothesis only." },
};

export const CATEGORY_POSTURE_LABEL: Record<string, string> = {
  fix:     "Under Pressure",
  improve: "Under Validation",
  create:  "Directional",
};

export function isHypothesisPhase(phase: string): boolean {
  return ["outside_signals", "validate_outside", "diagnose", "validate_diagnose"].includes(phase);
}

export function toSentence(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

// ─── Client route inspect panel ───────────────────────────────────────────────

export function deriveClientWhyReasons(route: RouteRow): string[] {
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

export function deriveCanonicalRouteSentence(route: RouteRow): string {
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

export type EvidenceItem = { id: string; title: string; status: "complete" | "in_progress" | "missing" };

export type ClientAssumption = RouteAssumption;

export const CLIENT_LAYER_LABELS: Record<ClientAssumption["layer"], string> = {
  outside:  "Outside Signals",
  org:      "Organization",
  customer: "Customer",
  market:   "Market",
};

export const CLIENT_STATUS_LABELS: Record<ClientAssumption["status"], string> = {
  supported: "Supported",
  partial:   "Partial",
  unproven:  "Not yet proven",
};

export const CLIENT_STATUS_COLORS: Record<ClientAssumption["status"], string> = {
  supported: R.ink,
  partial:   R.inkFaint,
  unproven:  R.inkFaint,
};

export const CLIENT_STATUS_GLYPHS: Record<ClientAssumption["status"], string> = {
  supported: "◉",
  partial:   "◎",
  unproven:  "○",
};

export function deriveStrengthMoves(
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

export type DetailItem = { id: string; title: string; status: "complete" | "in_progress" | "missing" };

export function statusGlyph(status: DetailItem["status"]) {
  if (status === "complete")    return "◉";
  if (status === "in_progress") return "◎";
  return "○";
}

export function statusTip(status: DetailItem["status"]) {
  if (status === "complete")    return "Complete";
  if (status === "in_progress") return "In progress";
  return "Missing — not yet addressed";
}

// ─── Route field config ───────────────────────────────────────────────────────

export const ROUTE_FIELD_LABELS: Record<string, string> = {
  title:                   "Title",
  short_description:       "Description",
  rejected_alternatives:   "Rejected Alternatives",
  what_would_have_to_be_true: "What Would Have to Be True",
};

export const ROUTE_FIELDS = Object.keys(ROUTE_FIELD_LABELS);

export function summarizeRouteValue(field: string, val: unknown): string {
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

export function routeDiffedFields(proposal: RouteProposalRow): string[] {
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

export function routeTimeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export type WrapAlt  = { alternative_title: string; rejection_reason: string; considered_at?: string };

export type WrapCond = {
  condition: string;
  satisfied_flag: boolean;
  evidence_refs?: string[];
  leg_class?: "test" | "build";
  // Hole-close reconcile (piece #2): stamped on a leg's carried condition when its source
  // route condition is re-rolled away — the leg keeps rendering, honestly, with its reason.
  orphaned?: boolean;
  orphaned_reason?: string;
  orphaned_at?: string;
  orphaned_from_identity?: string;
  // CG-2: stamped on a test-class leg's carried condition when the honesty judge DECLINES
  // its test — persists the refusal (verbatim reason) so the panel shows attempted-and-
  // declined distinctly from never-attempted. Cleared when a subsequent test is kept.
  test_declined?: boolean;
  test_declined_reason?: string;
  test_declined_at?: string;
  // HEAL: set only on the residual — the corrected (auto-rewritten) condition's retried test
  // was also declined; carries that retry decline reason verbatim, distinct from the original.
  test_declined_retry_reason?: string;
};

export const HIERARCHY_STATE_ACCENT: Record<string, string> = {
  flow:         R.signal,
  focus:        R.signal,
  diagnose:     R.signal,
  outside_view: R.inkFaint,
};

export const HIERARCHY_STATE_LABEL: Record<string, string> = {
  flow:         "Commitment active",
  focus:        "In focus",
  diagnose:     "Being diagnosed",
  outside_view: "Outside view",
};

export const HIERARCHY_FRAMING: Record<string, { heading: string; body: string }> = {
  flow:         { heading: "Active commitments",      body: "The organization has committed to these directions. Focus is on strengthening evidence and closing execution gaps." },
  focus:        { heading: "Priority routes",         body: "Evidence validates these as the most actionable directions. The work is narrowing from candidate to chosen path." },
  diagnose:     { heading: "Routes under consideration", body: "Candidate directions grounded in internal evidence. Customer validation is the next layer needed to focus around one." },
  outside_view: { heading: "Early directions",        body: "These routes are based on outside signals. You'll still need to validate them internally and with customers before committing." },
};

// ─── Hierarchy spec §4-§7: visual system ─────────────────────────────────────

export const HIERARCHY_HERO: Record<string, { before: string; signal: string }> = {
  flow:         { before: "Active",       signal: "Commitments" },
  focus:        { before: "Priority",     signal: "Routes" },
  diagnose:     { before: "Routes Under", signal: "Consideration" },
  outside_view: { before: "Early",        signal: "Directions" },
};

export function inferRelevantCategory(step: JobStepRow): "fix" | "improve" | "create" | null {
  if (step.has_gap) return "fix";
  const conf = step.evidence_confidence ?? 100;
  if (step.evidence_status === "unclear" || conf < 50) return "fix";
  if (step.evidence_status === "implied" || conf < 70) return "improve";
  return null;
}
