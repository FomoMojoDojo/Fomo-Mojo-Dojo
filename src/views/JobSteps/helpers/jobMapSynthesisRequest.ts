// Item 2 Gate 2 (signed 2026-09-15, R4) — the old JobSteps surface's local-jobmap-synthesis request.
// Every run from this surface is scoped (selected_maps_only) and strict (require_model): under
// selected_maps_only every listed key is regenerated (delete-per-key + insert), so add-map lists the
// NEW key only and the save-context re-synthesis lists only keys that hold a live market definition.
export type SelectedJobMap = { journey_key: string; journey_title: string; journey_subtitle: string };

export const NO_LIVE_DEFINITION_IN_SCOPE = "No selected map has a live market definition — nothing was run.";

export function buildLocalJobMapSynthesisBody(args: { companyId: string; selectedJobMaps: SelectedJobMap[]; trigger: string }) {
  if (args.selectedJobMaps.length === 0) throw new Error(NO_LIVE_DEFINITION_IN_SCOPE);
  return {
    company_id: args.companyId,
    selected_job_maps: args.selectedJobMaps.map((m) => ({ journey_key: m.journey_key, journey_title: m.journey_title, journey_subtitle: m.journey_subtitle })),
    selected_maps_only: true,
    require_model: true,
    trigger: args.trigger,
  };
}

/** Keep only the maps whose key holds a live market definition (the Gate 1 read). */
export function scopeMapsToLiveDefinitions(maps: SelectedJobMap[], liveKeys: readonly string[]): SelectedJobMap[] {
  const live = new Set(liveKeys);
  return maps.filter((m) => live.has(m.journey_key));
}
