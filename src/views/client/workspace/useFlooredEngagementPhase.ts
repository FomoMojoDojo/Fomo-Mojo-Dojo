// The per-company phase word (ruling 3, 2026-09-11) — EXTRACTED from the home's derivation
// (ClientRefinePreviewView: rawPhase ← companies.engagement_phase, floored by evidence via
// floorEngagementPhase). One home: the home imports this hook and its rendered string stays
// byte-identical (spec g). Display via stageLabel() is the caller's; this returns the phase key.
import { useMemo } from "react";
import type { Company } from "@/hooks/useCompany";
import type { OdiNeedRow } from "@/hooks/useOdiNeeds";
import { floorEngagementPhase } from "@/lib/refinePreviewPhaseOrchestration";

export function useFlooredEngagementPhase(
  company: Pick<Company, "engagement_phase" | "selected_route_id"> | null | undefined,
  needs: ReadonlyArray<Pick<OdiNeedRow, "importance">>,
): string {
  const rawPhase = company?.engagement_phase ?? "outside_signals";
  const hasNeedsWithScores = needs.some((n) => n.importance > 0);
  const hasSelectedRoute = !!company?.selected_route_id;
  return useMemo(
    () => floorEngagementPhase({ phase: rawPhase, hasNeedsWithScores, hasSelectedRoute }),
    [rawPhase, hasNeedsWithScores, hasSelectedRoute],
  );
}
