/**
 * Strategic Movement Memory — snapshot model and comparison logic.
 *
 * Phase 25: the system begins remembering how strategic state changes.
 * This is NOT an activity log. It is strategic memory: what changed,
 * why it changed, and what became safer or less safe to commit to.
 *
 * Storage: localStorage per company (no DB required for v1).
 * Compare: current state vs. previous snapshot → interpretive movement summary.
 *
 * Compression rules:
 * - Never say "3 records changed" or "snapshot updated"
 * - Always interpret: "Confidence strengthened." / "Blocker persisted."
 * - Silence noise: only surface material movement (weight <= 3)
 * - A first read has no movement and shows nothing
 */

import type { TensionPressure } from "@/lib/tensionTypes";

// ─── Snapshot model ───────────────────────────────────────────────────────────

/**
 * Captured strategic state at a point in time.
 * Immutable — never mutate an existing snapshot.
 */
export type StrategicMovementSnapshot = {
  timestamp: string;
  companyId: string;
  centerStateKey: string;
  confidencePosture: string;
  canCommit: boolean;
  safeRouteCount: number;
  blockedRouteCount: number;
  portfolioState: string;
  primaryTensions: Array<{
    id: string;
    statement: string;
    pressure: TensionPressure;
    isCommitmentBlocker: boolean;
  }>;
  validationUrgency: string | null;
  hasContradiction: boolean;
  customerProofPresent: boolean;
  unresolvedAssumptionsCount: number;
  contradictedAssumptionsCount: number;
  reframedAssumptionsCount: number;
  mojoScore: number | null;
};

// ─── Tension movement ─────────────────────────────────────────────────────────

export type TensionMovementStatus =
  | "emerging"      // not present in previous snapshot
  | "strengthening" // pressure increased since last snapshot
  | "persistent"    // same state across snapshots
  | "weakened"      // pressure decreased (still present)
  | "cooling";      // present in previous, weaker or absent now

export type TensionMovementAnnotation = {
  tensionId: string;
  movementStatus: TensionMovementStatus;
};

// ─── Movement items ───────────────────────────────────────────────────────────

export type MovementDirection =
  | "strengthened"
  | "weakened"
  | "emerged"
  | "cooled"
  | "persisted"
  | "resolved"
  | "advanced"
  | "stalled"
  | "improved"
  | "degraded"
  | "narrowed"
  | "none";

export type MovementItem = {
  id: string;
  statement: string;
  direction: MovementDirection;
  /**
   * Importance — lower is more significant.
   * 1: critical (commitment changed, blocker persisted)
   * 2: high (new tension, route advanced/stalled, contradiction)
   * 3: medium (tension cooled, proof narrowed, new validation)
   * 4: low (validation persisted, minor posture)
   * 5: minimal (no material change)
   */
  weight: number;
};

// ─── Movement summary ─────────────────────────────────────────────────────────

export type MovementSummary =
  | {
      firstRead: true;
      summaryLine: string;
      annotatedTensions: TensionMovementAnnotation[];
    }
  | {
      firstRead: false;
      hasMaterialMovement: boolean;
      summaryLine: string;
      items: MovementItem[];
      annotatedTensions: TensionMovementAnnotation[];
    };

// ─── Snapshot input ───────────────────────────────────────────────────────────

export type SnapshotInput = {
  companyId: string;
  centerStateKey: string;
  confidencePosture: string;
  canCommit: boolean;
  safeToCommit: string[];
  blocked: string[];
  portfolioState: string;
  tensions: Array<{
    id: string;
    statement: string;
    pressure: TensionPressure;
    isCommitmentBlocker: boolean;
  }>;
  validationUrgency: string | null;
  hasContradiction: boolean;
  customerProofPresent: boolean;
  unresolvedAssumptionsCount: number;
  contradictedAssumptionsCount: number;
  reframedAssumptionsCount: number;
  mojoScore: number | null;
};

// ─── Snapshot capture ─────────────────────────────────────────────────────────

export function captureSnapshot(input: SnapshotInput): StrategicMovementSnapshot {
  return {
    timestamp: new Date().toISOString(),
    companyId: input.companyId,
    centerStateKey: input.centerStateKey,
    confidencePosture: input.confidencePosture,
    canCommit: input.canCommit,
    safeRouteCount: input.safeToCommit.length,
    blockedRouteCount: input.blocked.length,
    portfolioState: input.portfolioState,
    primaryTensions: input.tensions.map((t) => ({
      id: t.id,
      statement: t.statement,
      pressure: t.pressure,
      isCommitmentBlocker: t.isCommitmentBlocker,
    })),
    validationUrgency: input.validationUrgency,
    hasContradiction: input.hasContradiction,
    customerProofPresent: input.customerProofPresent,
    unresolvedAssumptionsCount: input.unresolvedAssumptionsCount,
    contradictedAssumptionsCount: input.contradictedAssumptionsCount,
    reframedAssumptionsCount: input.reframedAssumptionsCount,
    mojoScore: input.mojoScore,
  };
}

// ─── Portfolio state ranking ──────────────────────────────────────────────────

const PORTFOLIO_RANK: Record<string, number> = {
  balanced:          5,
  converging:        4,
  validation_heavy:  3,
  over_concentrated: 2,
  fragmented:        1,
  scaling_ahead:     0,
};

function portfolioRank(state: string): number {
  return PORTFOLIO_RANK[state] ?? 3;
}

// ─── Tension pressure ranking ─────────────────────────────────────────────────

const PRESSURE_RANK: Record<TensionPressure, number> = {
  critical: 4,
  high:     3,
  medium:   2,
  low:      1,
};

function pressureRank(p: TensionPressure): number {
  return PRESSURE_RANK[p] ?? 0;
}

// ─── Snapshot comparison ──────────────────────────────────────────────────────

/**
 * Compare previous and current snapshots.
 * Returns an interpretive movement summary — not an event log.
 */
export function compareSnapshots(
  prev: StrategicMovementSnapshot,
  current: StrategicMovementSnapshot,
): MovementSummary {
  const items: MovementItem[] = [];
  let seq = 0;
  const id = (prefix: string) => `${prefix}-${++seq}`;

  // ── Confidence / contradiction ───────────────────────────────────────────

  if (!prev.hasContradiction && current.hasContradiction) {
    items.push({ id: id("cont"), statement: "Contradiction pressure increased.", direction: "weakened", weight: 2 });
  } else if (prev.hasContradiction && !current.hasContradiction) {
    items.push({ id: id("cont"), statement: "Positioning contradiction weakened.", direction: "cooled", weight: 3 });
  }

  const confidenceImproved = (p: string, c: string) =>
    (p === "contradicted" && c !== "contradicted") ||
    (p === "fragmented"   && (c === "stable" || c === "strengthening")) ||
    (p === "scattered"    && (c === "stable" || c === "strengthening"));

  const confidenceDeclined = (p: string, c: string) =>
    (p !== "contradicted" && c === "contradicted") ||
    (p === "stable"       && c === "fragmented") ||
    (p === "strengthening" && c === "fragmented");

  if (confidenceImproved(prev.confidencePosture, current.confidencePosture)) {
    items.push({ id: id("conf"), statement: "Confidence strengthened.", direction: "strengthened", weight: 2 });
  } else if (confidenceDeclined(prev.confidencePosture, current.confidencePosture)) {
    items.push({ id: id("conf"), statement: "Confidence weakened.", direction: "weakened", weight: 2 });
  }

  // ── Commitment readiness ─────────────────────────────────────────────────

  if (!prev.canCommit && current.canCommit) {
    items.push({ id: id("commit"), statement: "Commitment readiness improved.", direction: "improved", weight: 1 });
  } else if (prev.canCommit && !current.canCommit) {
    items.push({ id: id("commit"), statement: "Commitment readiness degraded.", direction: "degraded", weight: 1 });
  } else if (current.safeRouteCount > prev.safeRouteCount) {
    items.push({ id: id("route-adv"), statement: "One route advanced to commitment.", direction: "advanced", weight: 2 });
  } else if (current.safeRouteCount < prev.safeRouteCount) {
    items.push({ id: id("route-reg"), statement: "A committed route regressed.", direction: "stalled", weight: 2 });
  }

  if (current.blockedRouteCount > prev.blockedRouteCount) {
    items.push({ id: id("blocked"), statement: "Route commitment became blocked.", direction: "stalled", weight: 2 });
  }

  // ── Portfolio state ──────────────────────────────────────────────────────

  const prevRank = portfolioRank(prev.portfolioState);
  const currRank = portfolioRank(current.portfolioState);

  if (currRank > prevRank + 1) {
    items.push({ id: id("port"), statement: "Portfolio direction clarifying.", direction: "advanced", weight: 3 });
  } else if (currRank < prevRank - 1) {
    items.push({ id: id("port"), statement: "Route portfolio stalled.", direction: "stalled", weight: 3 });
  }

  // ── Tension comparison ───────────────────────────────────────────────────

  const prevTensionIds = new Set(prev.primaryTensions.map((t) => t.id));
  const currTensionIds = new Set(current.primaryTensions.map((t) => t.id));

  // Match by ID first, then by normalised statement (derived tensions regenerate)
  const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const prevByStatement = new Map(prev.primaryTensions.map((t) => [normalise(t.statement), t]));
  const currByStatement = new Map(current.primaryTensions.map((t) => [normalise(t.statement), t]));

  function findInPrev(t: { id: string; statement: string }) {
    if (prevTensionIds.has(t.id)) return prev.primaryTensions.find((p) => p.id === t.id) ?? null;
    return prevByStatement.get(normalise(t.statement)) ?? null;
  }

  function findInCurr(t: { id: string; statement: string }) {
    if (currTensionIds.has(t.id)) return current.primaryTensions.find((c) => c.id === t.id) ?? null;
    return currByStatement.get(normalise(t.statement)) ?? null;
  }

  const annotatedTensions: TensionMovementAnnotation[] = [];

  for (const curr of current.primaryTensions) {
    const prevT = findInPrev(curr);
    if (!prevT) {
      // New tension
      annotatedTensions.push({ tensionId: curr.id, movementStatus: "emerging" });
      const label = curr.isCommitmentBlocker ? "A new blocking tension emerged." : "A new tension emerged.";
      items.push({ id: id("t-emerge"), statement: label, direction: "emerged", weight: curr.isCommitmentBlocker ? 1 : 2 });
    } else {
      // Existing tension — compare pressure
      const prevR = pressureRank(prevT.pressure);
      const currR = pressureRank(curr.pressure);
      if (currR > prevR) {
        annotatedTensions.push({ tensionId: curr.id, movementStatus: "strengthening" });
        items.push({ id: id("t-str"), statement: "Tension strengthening.", direction: "strengthened", weight: 2 });
      } else if (currR < prevR) {
        annotatedTensions.push({ tensionId: curr.id, movementStatus: "weakened" });
        items.push({ id: id("t-cool"), statement: "Tension cooled.", direction: "cooled", weight: 3 });
      } else {
        annotatedTensions.push({ tensionId: curr.id, movementStatus: "persistent" });
        if (curr.isCommitmentBlocker) {
          items.push({ id: id("t-blk"), statement: "Commitment blocker persisted.", direction: "persisted", weight: 1 });
        }
      }
    }
  }

  // Tensions that were in previous but are gone now
  for (const prevT of prev.primaryTensions) {
    if (!findInCurr(prevT)) {
      annotatedTensions.push({ tensionId: prevT.id, movementStatus: "cooling" });
      const label = prevT.isCommitmentBlocker ? "Blocking tension resolved." : "Tension cooled.";
      items.push({ id: id("t-res"), statement: label, direction: prevT.isCommitmentBlocker ? "resolved" : "cooled", weight: prevT.isCommitmentBlocker ? 2 : 3 });
    }
  }

  // ── Validation urgency ───────────────────────────────────────────────────

  if (prev.validationUrgency && current.validationUrgency) {
    if (normalise(prev.validationUrgency) === normalise(current.validationUrgency)) {
      items.push({ id: id("val"), statement: "Validation pressure persisted.", direction: "persisted", weight: 4 });
    } else {
      items.push({ id: id("val"), statement: "New validation requirement surfaced.", direction: "emerged", weight: 3 });
    }
  } else if (!prev.validationUrgency && current.validationUrgency) {
    items.push({ id: id("val"), statement: "Validation urgency increased.", direction: "weakened", weight: 3 });
  } else if (prev.validationUrgency && !current.validationUrgency) {
    items.push({ id: id("val"), statement: "Validation pressure resolved.", direction: "resolved", weight: 2 });
  }

  // ── Customer proof ───────────────────────────────────────────────────────

  if (!prev.customerProofPresent && current.customerProofPresent) {
    items.push({ id: id("proof"), statement: "Proof gap narrowed.", direction: "narrowed", weight: 3 });
  } else if (prev.customerProofPresent && !current.customerProofPresent) {
    items.push({ id: id("proof"), statement: "Proof gap persisted.", direction: "persisted", weight: 4 });
  }

  // ── Assumption evolution (Phase 26) ──────────────────────────────────────

  if (
    current.contradictedAssumptionsCount !== undefined &&
    prev.contradictedAssumptionsCount !== undefined
  ) {
    if (current.contradictedAssumptionsCount > prev.contradictedAssumptionsCount) {
      items.push({ id: id("assump-cont"), statement: "Belief contradicted.", direction: "weakened", weight: 2 });
    } else if (current.contradictedAssumptionsCount < prev.contradictedAssumptionsCount) {
      items.push({ id: id("assump-res"), statement: "Contradiction resolved.", direction: "cooled", weight: 3 });
    }
  }

  if (
    current.reframedAssumptionsCount !== undefined &&
    prev.reframedAssumptionsCount !== undefined &&
    current.reframedAssumptionsCount > prev.reframedAssumptionsCount
  ) {
    items.push({ id: id("reframe"), statement: "Belief reframed.", direction: "advanced", weight: 3 });
  }

  // ── Summary ──────────────────────────────────────────────────────────────

  items.sort((a, b) => a.weight - b.weight);
  const material = items.filter((item) => item.weight <= 3);
  const hasMaterialMovement = material.length > 0;
  const summaryLine = buildSummaryLine(material);

  return {
    firstRead: false,
    hasMaterialMovement,
    summaryLine,
    items,
    annotatedTensions,
  };
}

// ─── Summary line builder ─────────────────────────────────────────────────────

function buildSummaryLine(materialItems: MovementItem[]): string {
  if (materialItems.length === 0) return "No material movement.";
  return materialItems.slice(0, 2).map((item) => item.statement).join(" ");
}

export function deriveMovementLine(summary: MovementSummary): string | null {
  if (summary.firstRead) return null;
  if (!summary.hasMaterialMovement) return null;
  return summary.summaryLine;
}

// ─── localStorage persistence ─────────────────────────────────────────────────

const STORAGE_KEY_PREFIX = "mojo-strategic-snapshot-v1-";
const MIN_SNAPSHOT_AGE_MS = 60 * 60 * 1000; // 1 hour minimum between saves

function storageKey(companyId: string): string {
  return `${STORAGE_KEY_PREFIX}${companyId}`;
}

export function loadSnapshot(companyId: string): StrategicMovementSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(companyId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || !("timestamp" in parsed)) return null;
    return parsed as StrategicMovementSnapshot;
  } catch {
    return null;
  }
}

export function saveSnapshot(companyId: string, snapshot: StrategicMovementSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(companyId), JSON.stringify(snapshot));
  } catch {
    // Ignore storage errors — memory is best-effort
  }
}

/**
 * Returns true if enough time has passed since the stored snapshot to warrant
 * a comparison. Prevents same-session comparisons from always showing "no movement."
 */
export function snapshotIsStale(snapshot: StrategicMovementSnapshot): boolean {
  try {
    const age = Date.now() - new Date(snapshot.timestamp).getTime();
    return age >= MIN_SNAPSHOT_AGE_MS;
  } catch {
    return true;
  }
}
