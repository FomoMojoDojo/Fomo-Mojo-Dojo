import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RouteRow } from "@/hooks/useRoutes";

export type DirectionSignals = {
  outside: number;
  organization: number;
  customer: number;
  total: number;
};

export type DirectionItem = {
  id: string;
  title: string;
  legCount: number;
  signals: DirectionSignals;
  signalStrength: number;
  isLeaning: boolean;
};

export type DirectionEvidence = {
  directions: DirectionItem[];
  leaning: string | null;
  narrative: string;
};

type SignalRefRow = {
  claim_id: string;
  signal_id: string;
};

type SignalRow = {
  id: string;
  signal_band: string;
};

/**
 * Composite weight for comparing directions.
 * Customer evidence is weighted 4× — hardest to get and most predictive.
 */
function signalWeight(s: DirectionSignals): number {
  return s.outside * 1 + s.organization * 2 + s.customer * 4;
}

/**
 * Pure computation — exported for unit testing.
 * Accepts structured inputs and returns a DirectionEvidence result.
 *
 * @param topRoutes - top-level routes (level='route')
 * @param legsByParentId - legs grouped by their parent route id
 * @param signalBandBySignalId - signal_band keyed by signal.id
 * @param signalIdsByClaimId - signal ids grouped by claim_id
 */
export function computeDirectionEvidence(
  topRoutes: RouteRow[],
  legsByParentId: Map<string, RouteRow[]>,
  signalBandBySignalId: Map<string, string>,
  signalIdsByClaimId: Map<string, string[]>,
): DirectionEvidence {
  const items: DirectionItem[] = topRoutes.map((route) => {
    const legs = legsByParentId.get(route.id) ?? [];

    const claimIds = [route.claim_id, ...legs.map((l) => l.claim_id)].filter(
      (id): id is string => Boolean(id),
    );

    let outside = 0;
    let organization = 0;
    let customer = 0;

    for (const claimId of claimIds) {
      for (const signalId of signalIdsByClaimId.get(claimId) ?? []) {
        const band = signalBandBySignalId.get(signalId);
        if (band === "outside") outside++;
        else if (band === "organization") organization++;
        else if (band === "customer") customer++;
      }
    }

    const signals: DirectionSignals = { outside, organization, customer, total: outside + organization + customer };
    return {
      id: route.id,
      title: route.title,
      legCount: legs.length,
      signals,
      signalStrength: signalWeight(signals),
      isLeaning: false,
    };
  });

  // Determine leaning direction
  if (items.length === 0) {
    return { directions: [], leaning: null, narrative: "No directions found." };
  }

  const sorted = [...items].sort((a, b) => b.signalStrength - a.signalStrength);
  const top = sorted[0];
  const second = sorted[1];

  // "Clearly leaning" = top has at least 4 more weighted points than second, and top > 0
  const clearlyLeaning =
    top.signalStrength > 0 &&
    (second === undefined || top.signalStrength - (second?.signalStrength ?? 0) >= 4);

  const leaningId = clearlyLeaning ? top.id : null;
  for (const item of items) {
    item.isLeaning = item.id === leaningId;
  }

  // Narrative
  const count = items.length;
  const countWord = count === 1 ? "One direction" : count === 2 ? "Two directions" : count === 3 ? "Three directions" : `${count} directions`;

  let narrative: string;

  const hasCustomer = items.some((d) => d.signals.customer > 0);
  const onlyOneHasCustomer =
    hasCustomer && items.filter((d) => d.signals.customer > 0).length === 1;

  if (clearlyLeaning && second !== undefined) {
    const others = sorted.slice(1).map((d) => d.signals.total);
    const othersStr = others.join(" and ");
    const missingCustomer = items.some((d) => d.signals.customer === 0);
    narrative = `${countWord} under evaluation. "${top.title}" has the strongest evidence behind it — ${top.signals.total} signals vs ${othersStr} for the others.${missingCustomer ? " But customer evidence is what would confirm it." : ""}`;
  } else if (onlyOneHasCustomer && top.signals.customer > 0) {
    narrative = `${countWord} under evaluation. "${top.title}" is the only direction with direct customer evidence. That gives it an edge, but the sample is small.`;
  } else {
    narrative = `${countWord} under evaluation. None has pulled ahead yet — the evidence is spread roughly evenly. Customer input would break the tie.`;
  }

  return { directions: items, leaning: leaningId, narrative };
}

/**
 * Fetches claim_signal_refs and signals for the given routes, then
 * computes per-direction signal evidence.
 *
 * @param companyId - Supabase company id
 * @param routes - already-loaded routes from useRoutes (avoids double-fetch)
 */
export function useDirectionEvidence(
  companyId: string | undefined,
  routes: RouteRow[],
) {
  const [evidence, setEvidence] = useState<DirectionEvidence | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyId || routes.length === 0) {
      setEvidence(null);
      setLoading(false);
      return;
    }

    const topRoutes = routes.filter((r) => r.level === "route");
    if (topRoutes.length === 0) {
      setEvidence(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);

      const legsByParentId = new Map<string, RouteRow[]>();
      for (const r of routes) {
        if (r.level === "leg" && r.parent_id) {
          const arr = legsByParentId.get(r.parent_id) ?? [];
          arr.push(r);
          legsByParentId.set(r.parent_id, arr);
        }
      }

      const allClaimIds = [
        ...topRoutes.map((r) => r.claim_id),
        ...routes.filter((r) => r.level === "leg").map((r) => r.claim_id),
      ].filter((id): id is string => Boolean(id));

      if (allClaimIds.length === 0) {
        const emptyDirs = computeDirectionEvidence(topRoutes, legsByParentId, new Map(), new Map());
        if (!cancelled) {
          setEvidence(emptyDirs);
          setLoading(false);
        }
        return;
      }

      const [refsRes, signalsRes] = await Promise.all([
        supabase
          .from("claim_signal_refs")
          .select("claim_id, signal_id")
          .eq("company_id", companyId)
          .in("claim_id", allClaimIds)
          .limit(2000),
        supabase
          .from("signals")
          .select("id, signal_band")
          .eq("company_id", companyId)
          .eq("relevance_state", "active")
          .limit(2000),
      ]);

      if (cancelled) return;

      const signalBandBySignalId = new Map<string, string>();
      for (const s of (signalsRes.data ?? []) as SignalRow[]) {
        signalBandBySignalId.set(s.id, s.signal_band);
      }

      const signalIdsByClaimId = new Map<string, string[]>();
      for (const ref of (refsRes.data ?? []) as SignalRefRow[]) {
        const arr = signalIdsByClaimId.get(ref.claim_id) ?? [];
        arr.push(ref.signal_id);
        signalIdsByClaimId.set(ref.claim_id, arr);
      }

      const result = computeDirectionEvidence(
        topRoutes,
        legsByParentId,
        signalBandBySignalId,
        signalIdsByClaimId,
      );

      if (!cancelled) {
        setEvidence(result);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId, routes]);

  return { evidence, loading };
}
