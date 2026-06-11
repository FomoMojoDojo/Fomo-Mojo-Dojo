import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { DriftAssessment } from "@/hooks/useDriftAssessment";

export type DriftInboxItem = DriftAssessment & {
  surface_display_name: string;
  surface_navigation_path: string;
};

export type InboxFilter = "all" | "new" | "material" | "slight";
export type InboxSort = "severity" | "recency" | "surface_type";

const WORKSHOP = "/preview/client-refine/workshop";
const ROUTES = "/preview/client-refine/routes";

const SEVERITY_ORDER: Record<string, number> = {
  material_drift: 0,
  slight_drift: 1,
  aligned: 2,
};

function navPath(surfaceType: string): string {
  switch (surfaceType) {
    case "cascade": return `${WORKSHOP}?tab=strategy`;
    case "positioning": return `${WORKSHOP}?tab=positioning`;
    case "route": return ROUTES;
    case "opportunity": return `${WORKSHOP}?tab=needs`;
    case "market_definition": return `${WORKSHOP}?tab=jtbd`;
    default: return WORKSHOP;
  }
}

async function fetchDisplayNames(
  items: DriftAssessment[],
): Promise<Record<string, string>> {
  const names: Record<string, string> = {};

  // Cascade: static label — singleton per company
  for (const item of items) {
    if (item.surface_type === "cascade") {
      names[item.surface_id] = "Strategy Cascade";
    }
  }

  // Positioning: market_category
  const posIds = items.filter((i) => i.surface_type === "positioning").map((i) => i.surface_id);
  if (posIds.length) {
    const { data } = await supabase
      .from("positioning_canvases")
      .select("id, market_category")
      .in("id", posIds);
    for (const row of data ?? []) {
      names[row.id] = row.market_category
        ? `Positioning · ${row.market_category}`
        : "Positioning Canvas";
    }
  }

  // Routes: title
  const routeIds = items.filter((i) => i.surface_type === "route").map((i) => i.surface_id);
  if (routeIds.length) {
    const { data } = await supabase
      .from("routes")
      .select("id, title")
      .in("id", routeIds);
    for (const row of data ?? []) {
      names[row.id] = (row.title as string | null) ?? "Route";
    }
  }

  // Opportunities: desired_outcome truncated
  const oppIds = items.filter((i) => i.surface_type === "opportunity").map((i) => i.surface_id);
  if (oppIds.length) {
    const { data } = await supabase
      .from("odi_needs")
      .select("id, desired_outcome")
      .in("id", oppIds);
    for (const row of data ?? []) {
      const text: string = row.desired_outcome ?? "";
      names[row.id] = text.length > 60 ? text.slice(0, 60) + "…" : text || "Customer Opportunity";
    }
  }

  return names;
}

export function useDriftInbox(
  companyId: string | null | undefined,
  options: { filter?: InboxFilter; sort?: InboxSort } = {},
) {
  const { filter = "all", sort = "severity" } = options;
  const [allItems, setAllItems] = useState<DriftInboxItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastFullScanAt, setLastFullScanAt] = useState<Date | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  useEffect(() => {
    if (!companyId) {
      setAllItems([]);
      return;
    }
    setIsLoading(true);
    setError(null);

    const run = async () => {
      const { data: rows, error: qErr } = await supabase
        .from("surface_drift_assessments")
        .select("*")
        .eq("company_id", companyId)
        .is("accepted_as_aligned_at", null)
        .neq("drift_state", "aligned")
        .order("last_assessed_at", { ascending: false });

      if (qErr) {
        setError(qErr.message);
        setIsLoading(false);
        return;
      }

      // lastFullScanAt: most recent assessed_at across all assessments
      const { data: latestScan } = await supabase
        .from("surface_drift_assessments")
        .select("last_assessed_at")
        .eq("company_id", companyId)
        .order("last_assessed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestScan?.last_assessed_at) {
        setLastFullScanAt(new Date(latestScan.last_assessed_at));
      }

      const rawItems = (rows ?? []) as DriftAssessment[];
      const nameMap = rawItems.length > 0 ? await fetchDisplayNames(rawItems) : {};

      const enriched: DriftInboxItem[] = rawItems.map((item) => ({
        ...item,
        surface_display_name: nameMap[item.surface_id] ?? item.surface_type,
        surface_navigation_path: navPath(item.surface_type),
      }));

      setAllItems(enriched);
      setIsLoading(false);
    };

    run().catch((err) => {
      setError(err instanceof Error ? err.message : "Query failed");
      setIsLoading(false);
    });
  }, [companyId, refreshKey]);

  // Client-side filter + sort
  const items: DriftInboxItem[] = (() => {
    let filtered = allItems;
    if (filter === "new") filtered = filtered.filter((i) => !i.operator_seen_at);
    else if (filter === "material") filtered = filtered.filter((i) => i.drift_state === "material_drift");
    else if (filter === "slight") filtered = filtered.filter((i) => i.drift_state === "slight_drift");

    const sorted = [...filtered];
    if (sort === "severity") {
      sorted.sort((a, b) => (SEVERITY_ORDER[a.drift_state] ?? 2) - (SEVERITY_ORDER[b.drift_state] ?? 2));
    } else if (sort === "recency") {
      sorted.sort((a, b) => new Date(b.last_assessed_at).getTime() - new Date(a.last_assessed_at).getTime());
    } else if (sort === "surface_type") {
      sorted.sort((a, b) => a.surface_type.localeCompare(b.surface_type));
    }
    return sorted;
  })();

  const newCount = allItems.filter((i) => !i.operator_seen_at).length;
  const totalUnresolved = allItems.length;
  const materialCount = allItems.filter((i) => i.drift_state === "material_drift").length;
  const slightCount = allItems.filter((i) => i.drift_state === "slight_drift").length;

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const acceptBulkAsAligned = useCallback(async (assessmentIds: string[]) => {
    if (!assessmentIds.length) return;
    setBulkLoading(true);
    try {
      const { error: err } = await supabase
        .from("surface_drift_assessments")
        .update({ accepted_as_aligned_at: new Date().toISOString() })
        .in("id", assessmentIds);
      if (err) throw new Error(err.message);
      setRefreshKey((k) => k + 1);
    } finally {
      setBulkLoading(false);
    }
  }, []);

  const proposeChangesForBulk = useCallback(async (
    assessmentIds: string[],
    companyIdArg: string,
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ generated: number; failed: number }> => {
    if (!assessmentIds.length) return { generated: 0, failed: 0 };
    setBulkLoading(true);

    const targets = allItems.filter((i) => assessmentIds.includes(i.id));
    let generated = 0;
    let failed = 0;

    for (let i = 0; i < targets.length; i += 3) {
      const batch = targets.slice(i, i + 3);
      const results = await Promise.allSettled(
        batch.map(async (item) => {
          const fnName = {
            cascade: "propose-cascade-changes",
            positioning: "propose-positioning-changes",
            route: "propose-route-changes",
            opportunity: "propose-opportunity-changes",
          }[item.surface_type];
          if (!fnName) throw new Error(`Unknown surface type: ${item.surface_type}`);

          const body: Record<string, string> = { company_id: companyIdArg };
          if (item.surface_type === "route") body.route_id = item.surface_id;
          if (item.surface_type === "opportunity") body.opportunity_id = item.surface_id;

          const { error: fnErr } = await supabase.functions.invoke(fnName, { body });
          if (fnErr) throw new Error(fnErr.message);
        }),
      );

      for (const r of results) {
        if (r.status === "fulfilled") generated++;
        else failed++;
      }
      onProgress?.(Math.min(i + 3, targets.length), targets.length);
    }

    setBulkLoading(false);
    setRefreshKey((k) => k + 1);

    if (generated === 0 && failed > 0) {
      throw new Error(`All ${failed} proposals failed to generate`);
    }
    return { generated, failed };
  }, [allItems]);

  return {
    items,
    allItems,
    newCount,
    totalUnresolved,
    materialCount,
    slightCount,
    lastFullScanAt,
    isLoading,
    error,
    bulkLoading,
    refresh,
    acceptBulkAsAligned,
    proposeChangesForBulk,
  };
}

const AFFECTED_NEED_STATES = ["needs_review", "stale", "contradicted", "revalidate"];

// Lightweight count-only hook for nav badge (avoids full item fetch)
export function useDriftInboxCount(companyId: string | null | undefined) {
  const [totalUnresolved, setTotalUnresolved] = useState(0);
  const [newCount, setNewCount] = useState(0);

  useEffect(() => {
    if (!companyId) {
      setTotalUnresolved(0);
      setNewCount(0);
      return;
    }

    const run = async () => {
      const [driftResult, needsResult] = await Promise.all([
        supabase
          .from("surface_drift_assessments")
          .select("id, operator_seen_at")
          .eq("company_id", companyId)
          .is("accepted_as_aligned_at", null)
          .neq("drift_state", "aligned"),
        supabase
          .from("odi_needs")
          .select("id")
          .eq("company_id", companyId)
          .in("dependency_state", AFFECTED_NEED_STATES),
      ]);

      const driftRows = driftResult.data ?? [];
      const needsCount = (needsResult.data ?? []).length;

      setTotalUnresolved(driftRows.length + needsCount);
      setNewCount(driftRows.filter((r) => !r.operator_seen_at).length + needsCount);
    };

    run().catch(() => {});
  }, [companyId]);

  return { totalUnresolved, newCount };
}
