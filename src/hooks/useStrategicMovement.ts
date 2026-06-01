/**
 * useStrategicMovement — loads previous snapshot, compares with current state,
 * and returns an interpretive movement summary for the orientation layer.
 *
 * The hook auto-saves the current snapshot once per session (on first load after
 * the minimum staleness window has elapsed), so subsequent comparisons reflect
 * real strategic change rather than same-session drift.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  captureSnapshot,
  compareSnapshots,
  deriveMovementLine,
  loadSnapshot,
  saveSnapshot,
  snapshotIsStale,
  type MovementSummary,
  type SnapshotInput,
  type StrategicMovementSnapshot,
  type TensionMovementAnnotation,
} from "@/lib/strategicMovementMemory";

export type UseStrategicMovementResult = {
  movement: MovementSummary | null;
  movementLine: string | null;
  annotatedTensions: TensionMovementAnnotation[];
  /** Call after a meaningful user action (analysis run, route committed) to persist current state. */
  captureNow: () => void;
};

export function useStrategicMovement(input: SnapshotInput | null): UseStrategicMovementResult {
  const [previousSnapshot, setPreviousSnapshot] = useState<StrategicMovementSnapshot | null>(null);
  const savedThisSession = useRef(false);

  const companyId = input?.companyId ?? null;

  // Load stored snapshot on company change
  useEffect(() => {
    if (!companyId) {
      setPreviousSnapshot(null);
      return;
    }
    const stored = loadSnapshot(companyId);
    setPreviousSnapshot(stored);
    savedThisSession.current = false;
  }, [companyId]);

  const currentSnapshot = useMemo((): StrategicMovementSnapshot | null => {
    if (!input || !companyId) return null;
    return captureSnapshot(input);
  }, [input, companyId]);

  // Auto-save once per session, but only if the previous snapshot is stale
  useEffect(() => {
    if (!currentSnapshot || !companyId || savedThisSession.current) return;
    const shouldSave = !previousSnapshot || snapshotIsStale(previousSnapshot);
    if (shouldSave) {
      savedThisSession.current = true;
      // Delay by 30s to let the user review the orientation layer first
      // (saves only after a brief read window, not instantly on load)
      const timer = window.setTimeout(() => {
        saveSnapshot(companyId, currentSnapshot);
      }, 30_000);
      return () => window.clearTimeout(timer);
    }
  }, [currentSnapshot, companyId, previousSnapshot]);

  const captureNow = useCallback(() => {
    if (!currentSnapshot || !companyId) return;
    saveSnapshot(companyId, currentSnapshot);
    savedThisSession.current = true;
  }, [currentSnapshot, companyId]);

  const movement = useMemo((): MovementSummary | null => {
    if (!currentSnapshot) return null;
    if (!previousSnapshot) {
      return {
        firstRead: true,
        summaryLine: "First strategic read — movement will appear after the next review.",
        annotatedTensions: [],
      };
    }
    if (!snapshotIsStale(previousSnapshot)) {
      // Same session — suppress movement to avoid showing "no change" noise
      return null;
    }
    return compareSnapshots(previousSnapshot, currentSnapshot);
  }, [previousSnapshot, currentSnapshot]);

  const movementLine = useMemo(() => {
    if (!movement) return null;
    return deriveMovementLine(movement);
  }, [movement]);

  const annotatedTensions = useMemo((): TensionMovementAnnotation[] => {
    if (!movement) return [];
    return movement.annotatedTensions;
  }, [movement]);

  return { movement, movementLine, annotatedTensions, captureNow };
}
