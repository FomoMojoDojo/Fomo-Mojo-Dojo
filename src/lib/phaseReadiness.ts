// INT-4 — phase-readiness derivation: THE single readiness authority.
//
// Answers one question, read-only: does internal evidence exist for this
// company, making it DIAGNOSE-ready? Diagnose-ready when ANY of:
//   • internal_declared claims exist (INT-2 provenance lane — analyzed,
//     operator-accepted org evidence),
//   • an accepted file proposal exists (explicit operator acceptance act),
//   • operator-authored edits exist (source LIKE 'manual_%' on routes /
//     positioning_canvases / strategy_cascades).
//
// This module NEVER writes — the hybrid law (Model c + d, operator-ruled) is:
// the system detects readiness and OFFERS advancement; only the operator's
// confirm (the existing Company-tab control, the sole writer path besides
// MapView's admin control) promotes the phase. Choosing is promotion.
//
// FOCUS-READINESS SEAM (deliberately NOT built this gate): choosing acts —
// companies.selected_route_id, operator_primary_selection(job_step_set),
// market_lens.portfolio_role='lead' — would define focus-readiness. When that
// gate opens, add deriveFocusReadiness HERE so this file stays the single
// authority; do not grow a second derivation elsewhere.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type DiagnoseReadinessSignals = {
  declaredClaims: number;
  acceptedProposals: number;
  manualEdits: number;
};

// Pure core (unit-tested): OR over the three internal-evidence signals.
export function deriveDiagnoseReadiness(signals: DiagnoseReadinessSignals): boolean {
  return signals.declaredClaims > 0 || signals.acceptedProposals > 0 || signals.manualEdits > 0;
}

// Read-only fetch of the three signals. Head-count queries only; no table is
// ever written from this path (frozen companies are therefore safe to read).
export async function fetchDiagnoseReadiness(companyId: string): Promise<{
  ready: boolean;
  signals: DiagnoseReadinessSignals;
}> {
  const [claims, proposals, routesManual, posManual, cascadeManual] = await Promise.all([
    supabase.from("claims").select("id", { count: "exact", head: true })
      .eq("company_id", companyId).eq("provenance", "internal_declared"),
    supabase.from("file_proposals").select("id", { count: "exact", head: true })
      .eq("company_id", companyId).eq("status", "accepted"),
    supabase.from("routes").select("id", { count: "exact", head: true })
      .eq("company_id", companyId).like("source", "manual_%"),
    supabase.from("positioning_canvases").select("id", { count: "exact", head: true })
      .eq("company_id", companyId).like("source", "manual_%"),
    supabase.from("strategy_cascades").select("id", { count: "exact", head: true })
      .eq("company_id", companyId).like("source", "manual_%"),
  ]);
  const signals: DiagnoseReadinessSignals = {
    declaredClaims: claims.count ?? 0,
    acceptedProposals: proposals.count ?? 0,
    manualEdits: (routesManual.count ?? 0) + (posManual.count ?? 0) + (cascadeManual.count ?? 0),
  };
  return { ready: deriveDiagnoseReadiness(signals), signals };
}

export function useDiagnoseReadiness(companyId?: string, enabled = true) {
  const [ready, setReady] = useState(false);
  const [signals, setSignals] = useState<DiagnoseReadinessSignals | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!companyId || !enabled) { setReady(false); setSignals(null); return; }
    fetchDiagnoseReadiness(companyId).then((r) => {
      if (!cancelled) { setReady(r.ready); setSignals(r.signals); }
    }).catch(() => { if (!cancelled) { setReady(false); setSignals(null); } });
    return () => { cancelled = true; };
  }, [companyId, enabled]);
  return { ready, signals };
}
