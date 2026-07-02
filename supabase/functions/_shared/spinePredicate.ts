// Shared spine predicate — the SINGLE source of truth for "does this company
// already have a spine?" Used by BOTH the cold-start guard (research-company) and
// the intake skip-check (run-agent-flow), so the two can never drift.
//
// Product law: cold-start is BIRTH-ONLY. A company "already has a spine" if it has
// ANY birth-output row across these tables — a deliberate union (not a single
// signal) so a lone cleared table can't read as empty:
//   routes WHERE level='route', job_steps, positioning_canvases,
//   strategy_cascades, odi_market_definitions.
// Excluded on purpose: `inputs` (rebuilt inside cold-start) and `odi_needs`
// (reconciled, not a reliable birth marker).

type SupabaseLike = { from: (t: string) => any };

async function tableHasRow(
  supabase: SupabaseLike,
  table: string,
  companyId: string,
  extraEq?: [string, string],
): Promise<boolean> {
  let q = supabase.from(table).select("id").eq("company_id", companyId);
  if (extraEq) q = q.eq(extraEq[0], extraEq[1]);
  const { data } = await q.limit(1).maybeSingle();
  return !!data;
}

export async function companyHasSpine(supabase: SupabaseLike, companyId: string): Promise<boolean> {
  if (!companyId) return false;
  // Short-circuit on the first birth-output table that has a row.
  if (await tableHasRow(supabase, "routes", companyId, ["level", "route"])) return true;
  if (await tableHasRow(supabase, "job_steps", companyId)) return true;
  if (await tableHasRow(supabase, "positioning_canvases", companyId)) return true;
  if (await tableHasRow(supabase, "strategy_cascades", companyId)) return true;
  if (await tableHasRow(supabase, "odi_market_definitions", companyId)) return true;
  return false;
}
