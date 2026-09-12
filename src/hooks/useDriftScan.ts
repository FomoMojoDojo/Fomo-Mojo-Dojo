import { useState, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type DriftScanResult = {
  assessed: number;
  aligned: number;
  slight_drift: number;
  material_drift: number;
};

export type ScanAllStatus = DriftScanResult & { scannedAt: Date };

/** The gated wrappers (WorkshopView.handleScanAllSurfaces / handleCheckSurfaceDrift, MOVED here in the
 *  Opportunities Tier 1 lift, 2026-09-12) read the caller's governance.drift.scan capability and bump
 *  the caller's drift-badge key after an assessment. Both are optional: a caller without them gets
 *  the bare invokes only. */
export type DriftScanGate = {
  canScan: boolean;
  /** Called after any successful assessment — the badges re-read (driftBadgeRefreshKey bump). */
  onAssessed?: () => void;
};

export function useDriftScan(companyId: string | null | undefined, gate?: DriftScanGate) {
  const canScan = gate?.canScan ?? false;
  const onAssessed = gate?.onAssessed;
  const [scanningAll, setScanningAll] = useState(false);
  const [checkingSurfaceId, setCheckingSurfaceId] = useState<string | null>(null);

  const scanAllSurfaces = useCallback(async (
    onSuccess?: (result: DriftScanResult) => void,
    onError?: (message: string) => void,
  ) => {
    if (!companyId) return;
    setScanningAll(true);
    try {
      const { data, error } = await supabase.functions.invoke("assess-surface-drift", {
        body: { company_id: companyId },
      });
      if (error) throw error;
      onSuccess?.(data as DriftScanResult);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Scan failed";
      onError?.(message);
    } finally {
      setScanningAll(false);
    }
  }, [companyId]);

  const checkSurface = useCallback(async (
    surfaceType: string,
    surfaceId: string,
    onSuccess?: (result: DriftScanResult) => void,
    onError?: (message: string) => void,
  ) => {
    if (!companyId) return;
    setCheckingSurfaceId(surfaceId);
    try {
      const { data, error } = await supabase.functions.invoke("assess-surface-drift", {
        body: { company_id: companyId, surface_type: surfaceType, surface_id: surfaceId },
      });
      if (error) throw error;
      onSuccess?.(data as DriftScanResult);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Drift check failed";
      onError?.(message);
    } finally {
      setCheckingSurfaceId(null);
    }
  }, [companyId]);

  /** WorkshopView.handleScanAllSurfaces, MOVED verbatim: gate, clear the error, invoke, badge bump, status +
   *  toast on success, error + toast on failure. The caller keeps its own status/error state via the
   *  callbacks (the view renders "Last scanned …" from them). */
  const scanAllGated = useCallback((cb?: { onStatus?: (status: ScanAllStatus) => void; onError?: (message: string | null) => void }) => {
    if (!canScan) return; // governance.drift.scan
    cb?.onError?.(null);
    scanAllSurfaces(
      (result) => {
        onAssessed?.();
        cb?.onStatus?.({ ...result, scannedAt: new Date() });
        const driftCount = (result.slight_drift ?? 0) + (result.material_drift ?? 0);
        const summary = driftCount === 0
          ? `${result.assessed} surface${result.assessed === 1 ? "" : "s"} · all aligned`
          : `${result.assessed} surface${result.assessed === 1 ? "" : "s"} · ${driftCount} with drift`;
        toast.success(`Scanned · ${summary}`, { duration: 4000 });
      },
      (err) => {
        cb?.onError?.(err);
        toast.error(`Scan failed — ${err}`, { duration: 5000 });
      },
    );
  }, [canScan, onAssessed, scanAllSurfaces]);

  /** WorkshopView.handleCheckSurfaceDrift, MOVED verbatim: gate (silent when the capability is absent —
   *  the control renders regardless, as it always did), invoke, badge bump + toast. */
  const checkSurfaceGated = useCallback((surfaceType: string, surfaceId: string) => {
    if (!canScan) return; // governance.drift.scan
    checkSurface(
      surfaceType,
      surfaceId,
      (result) => {
        onAssessed?.();
        const driftLabel = result.material_drift > 0 ? "material drift" : result.slight_drift > 0 ? "slight drift" : "aligned";
        toast.success(`Checked ${surfaceType} · ${driftLabel}`, { duration: 4000 });
      },
      (err) => {
        toast.error(`Check failed — ${err}`, { duration: 5000 });
      },
    );
  }, [canScan, onAssessed, checkSurface]);

  return { scanningAll, checkingSurfaceId, scanAllSurfaces, checkSurface, scanAllGated, checkSurfaceGated };
}
