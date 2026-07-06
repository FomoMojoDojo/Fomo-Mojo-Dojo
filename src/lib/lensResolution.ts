// Market-lens READ resolution (reads gate, on top of schema 529d1d1).
//
// The lens layer formalizes (company_id, journey_key): market_lens rows are the
// lens list; children (job_steps, odi_needs, opportunities, odi_market_definitions,
// managed_outcomes) resolve by the SAME (company_id, journey_key) pair — no child
// carries a lens FK. Routes are different (R2 keystone): they live in a
// company-level pool and are REFERENCED into lenses via route_lens_refs; a focused
// lens shows only its referenced routes, and an unreferenced lens is honestly
// "not assessed yet", never the company pool.
//
// LAW (mirrors R4(ii)): the FOCUS key is always passed IN. This module never
// imports resolveChosenSet / lead-lens heuristics — callers decide focus; these
// helpers only resolve it. Read-only: nothing here writes.
//
// Frozen fixtures (CB1/CB2) have NO lens rows by design (backfill excluded them).
// Every helper therefore treats "no lens rows" as the legacy single-market state
// and callers fall back to their pre-lens behavior.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type MarketLensRow = {
  id: string;
  company_id: string;
  journey_key: string;
  title: string | null;
  portfolio_state: "active" | "dormant" | string;
  portfolio_role: "lead" | "support" | string;
  coherence_status: string;
  anchor_outcome_id: string | null;
};

const LENS_COLUMNS = "id,company_id,journey_key,title,portfolio_state,portfolio_role,coherence_status,anchor_outcome_id";

// All lenses for a company, lead first then alphabetical — the MarketSwitcher's
// option order. Empty array ⇒ no lens layer (frozen fixture or pre-lens company).
export async function fetchCompanyLenses(companyId: string): Promise<MarketLensRow[]> {
  const { data, error } = await supabase
    .from("market_lens")
    .select(LENS_COLUMNS)
    .eq("company_id", companyId);
  if (error || !Array.isArray(data)) return [];
  const rows = data as MarketLensRow[];
  return rows.sort((a, b) => {
    if (a.portfolio_role !== b.portfolio_role) return a.portfolio_role === "lead" ? -1 : 1;
    return String(a.journey_key).localeCompare(String(b.journey_key));
  });
}

export function useCompanyLenses(companyId?: string, refreshKey = 0) {
  const [lenses, setLenses] = useState<MarketLensRow[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!companyId) { setLenses([]); return; }
    setLoading(true);
    fetchCompanyLenses(companyId)
      .then((rows) => { if (!cancelled) setLenses(rows); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [companyId, refreshKey]);
  return { lenses, loading };
}

export type LensRouteRefs =
  | { lens: null; referencedRouteIds: null }            // no lens layer for this key — legacy pool
  | { lens: MarketLensRow; referencedRouteIds: Set<string> }; // may be empty ⇒ unassessed

// Routes for a focused lens: the referenced ids (ref_state='referenced' only —
// 'excluded' means assessed-and-rejected and stays hidden). lens=null ⇒ the focus
// key has no lens row; callers keep their legacy behavior.
export async function fetchLensRouteRefs(companyId: string, journeyKey: string): Promise<LensRouteRefs> {
  const { data: lensRow } = await supabase
    .from("market_lens")
    .select(LENS_COLUMNS)
    .eq("company_id", companyId)
    .eq("journey_key", journeyKey)
    .maybeSingle();
  if (!lensRow) return { lens: null, referencedRouteIds: null };
  const { data: refs } = await supabase
    .from("route_lens_refs")
    .select("route_id, ref_state")
    .eq("lens_id", (lensRow as MarketLensRow).id)
    .eq("ref_state", "referenced");
  const ids = new Set<string>(((refs ?? []) as Array<{ route_id: string }>).map((r) => String(r.route_id)));
  return { lens: lensRow as MarketLensRow, referencedRouteIds: ids };
}

// Full child resolution for one lens — the documented read API for future
// consumers (surfaces beyond the workshop wire up in later gates). Children
// resolve by (company_id, journey_key); routes via route_lens_refs.
export async function fetchLensChildren(companyId: string, journeyKey: string) {
  const [lensRefs, steps, needs, opps, marketDef, outcomes] = await Promise.all([
    fetchLensRouteRefs(companyId, journeyKey),
    supabase.from("job_steps").select("*").eq("company_id", companyId).eq("journey_key", journeyKey),
    supabase.from("odi_needs").select("*").eq("company_id", companyId).eq("journey_key", journeyKey),
    supabase.from("opportunities").select("*").eq("company_id", companyId).eq("journey_key", journeyKey),
    supabase.from("odi_market_definitions").select("*").eq("company_id", companyId).eq("journey_key", journeyKey).maybeSingle(),
    supabase.from("managed_outcomes").select("*").eq("company_id", companyId).eq("journey_key", journeyKey),
  ]);
  return {
    lens: lensRefs.lens,
    referencedRouteIds: lensRefs.referencedRouteIds,
    jobSteps: steps.data ?? [],
    needs: needs.data ?? [],
    opportunities: opps.data ?? [],
    marketDefinition: marketDef.data ?? null,
    managedOutcomes: outcomes.data ?? [],
  };
}
