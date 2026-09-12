// ROUTE PROPOSAL HANDLERS — the generate handler MOVED out of RoutesOrgPanel (handleGenerateRouteProposal,
// Routes Tier 1 lift, 2026-09-12): same edge function (propose-route-changes), same body, same
// structure.route.generate gate, same proposal re-read. Ruling 3 (2026-09-12): ONLY generate lifts in
// this brief — accept / reject / re-evaluate stay inline in RoutesOrgPanel for brief 2. The hook owns the
// proposals read the panel always had (useRouteProposals + its refresh key) so both surfaces share it.
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCapability } from "@/hooks/useCapability";
import { useRouteProposals } from "@/hooks/useRouteProposals";

export function useRouteProposalHandlers(companyId: string | null | undefined) {
  const canGenRoute = useCapability("structure.route.generate", companyId);
  const [routeProposalRefreshKey, setRouteProposalRefreshKey] = useState(0);
  const { proposals: routeProposalsMap } = useRouteProposals(companyId ?? undefined, routeProposalRefreshKey);
  const [generateLoadingRouteId, setGenerateLoadingRouteId] = useState<string | null>(null);
  const bumpProposals = useCallback(() => setRouteProposalRefreshKey((k) => k + 1), []);

  const handleGenerateRouteProposal = useCallback(async (routeId: string) => {
    if (!companyId) return;
    if (!canGenRoute) return; // structure.route.generate
    setGenerateLoadingRouteId(routeId);
    try {
      await supabase.functions.invoke("propose-route-changes", {
        body: { route_id: routeId, company_id: companyId },
      });
      setRouteProposalRefreshKey((k) => k + 1);
    } finally {
      setGenerateLoadingRouteId(null);
    }
  }, [companyId, canGenRoute]);

  return { canGenRoute, routeProposalsMap, generateLoadingRouteId, handleGenerateRouteProposal, bumpProposals };
}
