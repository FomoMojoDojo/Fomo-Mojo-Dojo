/**
 * Strategic Orientation — assembles the top-level orientation model from existing derived data.
 *
 * Phase 24: the primary product orientation shifts from framework navigation
 * to strategic state navigation. This module assembles that orientation surface
 * from the signals, tensions, and portfolio state already computed.
 *
 * Does NOT replace existing surface/portfolio/signals — it reframes them
 * through the lens of: what is true, what changed, what is blocked, what deserves attention.
 */

import type { StrategicTension } from "@/lib/tensionTypes";
import type { DecisionPortfolio } from "@/lib/decisionSystem";
import type { StrategicSignalSurface } from "@/lib/strategicSignals";
import type { TensionMovementAnnotation } from "@/lib/strategicMovementMemory";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CommitmentReadiness = {
  /** One-sentence strategic readiness assessment. */
  label: string;
  /** Optional one-sentence elaboration. */
  sublabel: string | null;
  /** Whether any route is safe to commit now. */
  canCommit: boolean;
  safeRoutes: string[];
  blockedRoutes: string[];
};

export type StrategicLens = {
  key: string;
  label: string;
  /** What this framework is a lens INTO — user-facing role description. */
  role: string;
};

export type StrategicOrientationSurface = {
  /** High/critical tensions only, sorted: blockers first. Max 3. */
  primaryTensions: StrategicTension[];
  hasBlockingTensions: boolean;
  /** Explicit commitment readiness assessment. */
  commitmentReadiness: CommitmentReadiness;
  /** 1-2 movement signals (strengthening/weakening) in plain language. */
  movementSignals: string[];
  /** The most urgent validation requirement, if any. */
  validationUrgency: string | null;
  /** Framework pages reframed as supporting lenses. */
  lenses: StrategicLens[];
};

// ─── Lens definitions ─────────────────────────────────────────────────────────

export const STRATEGIC_LENSES: StrategicLens[] = [
  { key: "routes",      label: "Routes",      role: "lens into possible commitments" },
  { key: "positioning", label: "Positioning",  role: "lens into market interpretation" },
  { key: "needs",       label: "Opportunities", role: "lens into customer pressure" },
  { key: "strategy",    label: "Strategy",     role: "lens into directional coherence" },
  { key: "council",     label: "Council",      role: "advisory review surface" },
];

// ─── Commitment readiness ─────────────────────────────────────────────────────

function deriveCommitmentReadiness(portfolio: DecisionPortfolio): CommitmentReadiness {
  const { safeToCommit, tooEarly, blocked, portfolioState } = portfolio;

  if (safeToCommit.length > 0) {
    const listed = safeToCommit.slice(0, 2).join(", ");
    return {
      label: safeToCommit.length === 1
        ? `Confidence sufficient to commit to ${listed}.`
        : `${safeToCommit.length} routes ready for commitment.`,
      sublabel: blocked.length > 0
        ? `${blocked.length} route${blocked.length === 1 ? "" : "s"} still blocked.`
        : null,
      canCommit: true,
      safeRoutes: safeToCommit,
      blockedRoutes: blocked,
    };
  }

  if (blocked.length > 0) {
    return {
      label: blocked.length === 1
        ? `Blocked until ${blocked[0]} unblocked.`
        : `Blocked until ${blocked.length} tensions resolve.`,
      sublabel: blocked.length === 1
        ? "Commitment premature while this tension persists."
        : `${blocked.length} routes blocked — commitment depends on resolution.`,
      canCommit: false,
      safeRoutes: [],
      blockedRoutes: blocked,
    };
  }

  if (portfolioState === "validation_heavy") {
    return {
      label: "Premature while validation gaps remain open.",
      sublabel: tooEarly.length > 0
        ? `${tooEarly.length} route${tooEarly.length === 1 ? "" : "s"} still too early to commit.`
        : "Close validation gaps before advancing.",
      canCommit: false,
      safeRoutes: [],
      blockedRoutes: [],
    };
  }

  if (portfolioState === "converging") {
    return {
      label: "Strengthening — commitment window approaching.",
      sublabel: "Depends on whether current signals hold.",
      canCommit: false,
      safeRoutes: [],
      blockedRoutes: [],
    };
  }

  if (portfolioState === "scaling_ahead") {
    return {
      label: "Scaling commitment premature — operational proof required.",
      sublabel: null,
      canCommit: false,
      safeRoutes: [],
      blockedRoutes: [],
    };
  }

  if (portfolioState === "fragmented") {
    return {
      label: "Direction fragmented — no commitment path yet.",
      sublabel: "Premature while portfolio lacks coherent direction.",
      canCommit: false,
      safeRoutes: [],
      blockedRoutes: [],
    };
  }

  if (portfolioState === "over_concentrated") {
    return {
      label: "Over-concentrated — diversify before broadening commitment.",
      sublabel: null,
      canCommit: false,
      safeRoutes: [],
      blockedRoutes: [],
    };
  }

  return {
    label: "Exploring — too early to commit.",
    sublabel: tooEarly.length > 0
      ? `${tooEarly.length} route${tooEarly.length === 1 ? "" : "s"} under investigation.`
      : null,
    canCommit: false,
    safeRoutes: [],
    blockedRoutes: [],
  };
}

// ─── Movement signals ─────────────────────────────────────────────────────────

function deriveMovementSignals(signals: StrategicSignalSurface): string[] {
  const all = signals.groups.flatMap((g) => g.signals);
  const moving = all.filter((s) => s.movement === "weakening" || s.movement === "strengthening");
  const weakening   = moving.filter((s) => s.movement === "weakening").slice(0, 1);
  const strengthening = moving.filter((s) => s.movement === "strengthening").slice(0, 1);
  return [...weakening, ...strengthening].slice(0, 2).map((s) => s.statement);
}

// ─── Validation urgency ───────────────────────────────────────────────────────

function deriveValidationUrgency(
  tensions: StrategicTension[],
  portfolio: DecisionPortfolio,
): string | null {
  const blockers = tensions.filter(
    (t) => t.isCommitmentBlocker && (t.pressure === "high" || t.pressure === "critical"),
  );
  if (blockers.length > 0) {
    const reqs = blockers[0].validationRequirements;
    if (reqs && reqs.length > 0) return reqs[0];
  }
  const escalation = portfolio.escalations[0];
  if (escalation) return escalation.detail;
  return null;
}

// ─── Main export ─────────────────────────────────────────────────────────────

const PRESSURE_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function buildStrategicOrientation(args: {
  tensions: StrategicTension[];
  portfolio: DecisionPortfolio;
  signals: StrategicSignalSurface;
  tensionAnnotations?: TensionMovementAnnotation[];
}): StrategicOrientationSurface {
  const { tensions, portfolio, signals, tensionAnnotations = [] } = args;

  const annotationMap = new Map(tensionAnnotations.map((a) => [a.tensionId, a.movementStatus]));

  // Persistent blockers rank highest; emerging tensions rank above cooling ones.
  const MOVEMENT_BOOST: Record<string, number> = {
    persistent:   -1, // rank higher
    strengthening: -1,
    emerging:       0,
    weakened:       1, // rank lower
    cooling:        2,
  };

  const primaryTensions = [...tensions]
    .filter((t) => t.pressure === "critical" || t.pressure === "high")
    .sort((a, b) => {
      if (a.isCommitmentBlocker !== b.isCommitmentBlocker) {
        return a.isCommitmentBlocker ? -1 : 1;
      }
      const aBoost = MOVEMENT_BOOST[annotationMap.get(a.id) ?? ""] ?? 0;
      const bBoost = MOVEMENT_BOOST[annotationMap.get(b.id) ?? ""] ?? 0;
      const aPressure = (PRESSURE_ORDER[a.pressure] ?? 9) + aBoost;
      const bPressure = (PRESSURE_ORDER[b.pressure] ?? 9) + bBoost;
      return aPressure - bPressure;
    })
    .slice(0, 3);

  return {
    primaryTensions,
    hasBlockingTensions: primaryTensions.some((t) => t.isCommitmentBlocker),
    commitmentReadiness: deriveCommitmentReadiness(portfolio),
    movementSignals: deriveMovementSignals(signals),
    validationUrgency: deriveValidationUrgency(tensions, portfolio),
    lenses: STRATEGIC_LENSES,
  };
}
