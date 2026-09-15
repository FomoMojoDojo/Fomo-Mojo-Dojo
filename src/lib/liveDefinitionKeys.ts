// The journey keys that hold a LIVE market definition (odi_market_definitions, retracted_at IS NULL) —
// the workspace switcher's definition side (item 2 gate 1, viewedSet.useMarketIndex) and the scope of
// the old JobSteps surface's re-synthesis (item 2 gate 2). One read, reused; never a latest-row read.
type Db = { from: (t: string) => any };

export async function readLiveDefinitionKeys(supabase: Db, companyId: string): Promise<string[]> {
  const { data } = await supabase
    .from("odi_market_definitions")
    .select("journey_key")
    .eq("company_id", companyId)
    .is("retracted_at", null);
  return ((data as Array<{ journey_key: string | null }> | null) ?? []).map((r) => String(r.journey_key ?? "")).filter(Boolean);
}
