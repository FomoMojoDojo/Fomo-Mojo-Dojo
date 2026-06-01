import { supabase } from "@/integrations/supabase/client";

type SurfaceType = "positioning" | "cascade" | "route" | "opportunity";

// Snapshots the company's active signal IDs onto the surface row.
// Called after a surface row enters its new current state (post-accept).
export async function captureBaseline(
  companyId: string,
  surfaceType: SurfaceType,
  surfaceId: string,
): Promise<void> {
  const { data: signalRows, error: signalError } = await supabase
    .from("signals")
    .select("id")
    .eq("company_id", companyId)
    .eq("relevance_state", "active");

  if (signalError) throw new Error(`Baseline read failed: ${signalError.message}`);

  const signalIds = (signalRows ?? []).map((r) => r.id);
  const payload = {
    evidence_baseline_signal_ids: signalIds,
    evidence_baseline_captured_at: new Date().toISOString(),
  };

  let updateError: { message: string } | null = null;

  switch (surfaceType) {
    case "positioning":
      ({ error: updateError } = await supabase.from("positioning_canvases").update(payload).eq("id", surfaceId));
      break;
    case "cascade":
      ({ error: updateError } = await supabase.from("strategy_cascades").update(payload).eq("id", surfaceId));
      break;
    case "route":
      ({ error: updateError } = await supabase.from("routes").update(payload).eq("id", surfaceId));
      break;
    case "opportunity":
      ({ error: updateError } = await supabase.from("odi_needs").update(payload).eq("id", surfaceId));
      break;
  }

  if (updateError) throw new Error(`Baseline write failed: ${updateError.message}`);
}
