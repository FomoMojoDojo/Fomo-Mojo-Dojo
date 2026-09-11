// Gate 8b — the ONE question every keyed market lookup asks before it synthesises children.
//
// A retracted def (odi_market_definitions.retracted_at set by an operator data act; `retracted` is the
// stored generated boolean) still RESOLVES by journey_key — history must be readable — but nothing
// may be born from it: no opportunities, no step conditions, no re-hypothesised market. The three
// per-journey syntheses call this first and skip with one shared reason, so the refusal reads the
// same everywhere and a reader can grep one word.
export const RETRACTED_MARKET_SKIP = "retracted_market" as const;

export async function journeyIsRetracted(
  supabase: { from: (t: string) => any },
  companyId: string,
  journeyKey: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("odi_market_definitions")
    .select("retracted")
    .eq("company_id", companyId)
    .eq("journey_key", journeyKey)
    .maybeSingle();
  return (data as { retracted?: boolean | null } | null)?.retracted === true;
}
