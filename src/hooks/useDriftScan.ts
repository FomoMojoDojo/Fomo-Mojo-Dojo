import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type DriftScanResult = {
  assessed: number;
  aligned: number;
  slight_drift: number;
  material_drift: number;
};

export function useDriftScan(companyId: string | null | undefined) {
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

  return { scanningAll, checkingSurfaceId, scanAllSurfaces, checkSurface };
}
