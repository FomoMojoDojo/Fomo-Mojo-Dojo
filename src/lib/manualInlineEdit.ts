import { supabase } from "@/integrations/supabase/client";
import { captureBaseline } from "@/lib/baselineCapture";

type SurfaceType = "positioning" | "cascade" | "route" | "opportunity";

const TABLE: Record<SurfaceType, string> = {
  positioning: "positioning_canvases",
  cascade:     "strategy_cascades",
  route:       "routes",
  opportunity: "odi_needs",
};

// Surfaces that have a `source` column the preservation logic reads.
const HAS_SOURCE_FIELD = new Set<SurfaceType>(["positioning", "cascade", "route"]);

export async function saveManualEdit(
  surfaceType: SurfaceType,
  surfaceId: string,
  companyId: string,
  fieldName: string,
  newValue: string,
): Promise<void> {
  const table = TABLE[surfaceType];

  const payload: Record<string, unknown> = { [fieldName]: newValue };
  if (HAS_SOURCE_FIELD.has(surfaceType)) {
    payload.source = "manual_inline";
  }
  // odi_needs (opportunity) has no `source` column; its operator-edit marker is
  // `source_path` (the A2-4b force-regen predicate preserves source_path LIKE
  // 'manual_%'). Since odi_needs identity = hash(desired_outcome) ALWAYS (canonical
  // is derived), a canonical-only pencil edit no longer goes stale, so this stamp is
  // what keeps it from being re-rolled. Mirrors the human author lane's
  // source_path='manual_<proposalId>'.
  if (surfaceType === "opportunity") {
    payload.source_path = "manual_inline";
  }

  const { error } = await supabase
    .from(table)
    .update(payload)
    .eq("id", surfaceId);

  if (error) throw new Error(`saveManualEdit failed on ${table}: ${error.message}`);

  await captureBaseline(companyId, surfaceType, surfaceId);
}
