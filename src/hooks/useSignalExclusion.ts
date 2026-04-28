import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ExcludedSignal } from "@/hooks/useCompany";

export type { ExcludedSignal };

interface UseSignalExclusionResult {
  excluded: ExcludedSignal[];
  excludedSet: ReadonlySet<string>;
  excludeSignal: (fingerprint: string, reason?: string) => Promise<void>;
  restoreSignal: (fingerprint: string) => Promise<void>;
  isExcluded: (fingerprint: string) => boolean;
  loading: boolean;
}

export function useSignalExclusion(
  companyId: string | null,
  initialExcluded: ExcludedSignal[] | null | undefined,
  onPersisted?: () => void,
): UseSignalExclusionResult {
  const [excluded, setExcluded] = useState<ExcludedSignal[]>(() =>
    Array.isArray(initialExcluded) ? initialExcluded : [],
  );
  const [loading, setLoading] = useState(false);

  // Re-sync when company changes or initialExcluded is refreshed from DB
  useEffect(() => {
    setExcluded(Array.isArray(initialExcluded) ? initialExcluded : []);
  }, [companyId, initialExcluded]);

  const excludedSet = useMemo(
    () => new Set(excluded.map((e) => e.fingerprint)),
    [excluded],
  );

  const persist = useCallback(
    async (next: ExcludedSignal[]) => {
      if (!companyId) return;
      setLoading(true);
      try {
        const { error } = await supabase
          .from("companies")
          .update({ excluded_signals_json: next as unknown as Record<string, unknown>[] })
          .eq("id", companyId);
        if (error) {
          console.error("[useSignalExclusion] persist error:", error);
        } else {
          onPersisted?.();
        }
      } finally {
        setLoading(false);
      }
    },
    [companyId, onPersisted],
  );

  const excludeSignal = useCallback(
    async (fingerprint: string, reason = "wrong_entity") => {
      if (excludedSet.has(fingerprint)) return;
      const entry: ExcludedSignal = {
        fingerprint,
        reason,
        excluded_at: new Date().toISOString(),
      };
      const next = [...excluded, entry];
      setExcluded(next);
      await persist(next);
    },
    [excluded, excludedSet, persist],
  );

  const restoreSignal = useCallback(
    async (fingerprint: string) => {
      if (!excludedSet.has(fingerprint)) return;
      const next = excluded.filter((e) => e.fingerprint !== fingerprint);
      setExcluded(next);
      await persist(next);
    },
    [excluded, excludedSet, persist],
  );

  const isExcluded = useCallback(
    (fingerprint: string) => excludedSet.has(fingerprint),
    [excludedSet],
  );

  return { excluded, excludedSet, excludeSignal, restoreSignal, isExcluded, loading };
}
