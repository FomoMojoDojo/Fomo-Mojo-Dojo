// ── recomputeValidationState — the one writer for validation_state ───────────────────────────────
//
// Derives validation_state for a company's routes/legs (from tests.result and route conditions),
// odi_needs (survey provenance) and claims.triangulation_state ('contradicted' from a contradicting
// claim_signal_ref) — from outcomes that already exist, using the pure derivation in
// src/lib/validationState (formulas live once). Called at the TERMINAL of each outcome writer
// (generateRouteConditionsForCompany, generateLegTestsForCompany, rebuildCompanyReconcile,
// extract-own-words) and by the recompute-validation-state endpoint. Total recomputation ⇒ idempotent:
// only rows whose derived state differs are updated. Non-fatal for callers: errors are logged.
// The Mojo Score is not read or written here (ruling 2B).
import {
  deriveClaimContradictions,
  deriveNeedStates,
  deriveRouteStates,
  diffStates,
  type ClaimLike,
  type ClaimRefLike,
  type NeedLike,
  type RouteLike,
  type TestRow,
  type Update,
  type ValidationState,
} from "../../../src/lib/validationState/index.ts";

// Structural client type (as snapshotMojoScore) — keeps this module checkable by both deno and tsc.
// deno-lint-ignore no-explicit-any
type SupabaseClient = { from: (table: string) => any };

export type ValidationStateRecompute = {
  company_id: string;
  dry_run: boolean;
  routes: { rows: number; updates: Update<ValidationState>[] };
  needs: { rows: number; updates: Update<ValidationState>[] };
  claims: { rows: number; updates: Update<"contradicted">[] };
};

export async function recomputeValidationState(
  supabase: SupabaseClient,
  companyId: string,
  opts: { dryRun?: boolean } = {},
): Promise<ValidationStateRecompute> {
  const dryRun = opts.dryRun === true;
  const [routesRes, testsRes, needsRes, claimsRes, refsRes] = await Promise.all([
    supabase.from("routes").select("id, level, parent_id, what_would_have_to_be_true, validation_state").eq("company_id", companyId),
    supabase.from("tests").select("id, action_id, result, no_test_needed").eq("company_id", companyId),
    supabase.from("odi_needs").select("id, provenance_type, validation_state").eq("company_id", companyId),
    supabase.from("claims").select("id, triangulation_state").eq("company_id", companyId),
    supabase.from("claim_signal_refs").select("claim_id, relationship").eq("company_id", companyId),
  ]);
  for (const [name, r] of [["routes", routesRes], ["tests", testsRes], ["odi_needs", needsRes], ["claims", claimsRes], ["claim_signal_refs", refsRes]] as const) {
    if (r.error) throw new Error(`[validationState] ${name} read failed: ${r.error.message}`);
  }
  const routes = (routesRes.data ?? []) as RouteLike[];
  const tests = (testsRes.data ?? []) as TestRow[];
  const needs = (needsRes.data ?? []) as NeedLike[];
  const claims = (claimsRes.data ?? []) as ClaimLike[];
  const refs = (refsRes.data ?? []) as ClaimRefLike[];

  const routeUpdates = diffStates(routes.map((r) => ({ id: r.id, state: r.validation_state ?? null })), deriveRouteStates(routes, tests));
  const needUpdates = diffStates(needs.map((n) => ({ id: n.id, state: n.validation_state ?? null })), deriveNeedStates(needs));
  const claimUpdates = diffStates(claims.map((c) => ({ id: c.id, state: c.triangulation_state ?? null })), deriveClaimContradictions(claims, refs));

  if (!dryRun) {
    for (const u of routeUpdates) {
      const { error } = await supabase.from("routes").update({ validation_state: u.to }).eq("id", u.id).eq("company_id", companyId);
      if (error) throw new Error(`[validationState] routes update failed for ${u.id}: ${error.message}`);
    }
    for (const u of needUpdates) {
      const { error } = await supabase.from("odi_needs").update({ validation_state: u.to }).eq("id", u.id).eq("company_id", companyId);
      if (error) throw new Error(`[validationState] odi_needs update failed for ${u.id}: ${error.message}`);
    }
    for (const u of claimUpdates) {
      const { error } = await supabase.from("claims").update({ triangulation_state: u.to }).eq("id", u.id).eq("company_id", companyId);
      if (error) throw new Error(`[validationState] claims update failed for ${u.id}: ${error.message}`);
    }
  }
  return {
    company_id: companyId,
    dry_run: dryRun,
    routes: { rows: routes.length, updates: routeUpdates },
    needs: { rows: needs.length, updates: needUpdates },
    claims: { rows: claims.length, updates: claimUpdates },
  };
}

/** Terminal helper: never throws (the outcome write it follows has already landed). */
export async function recomputeValidationStateQuietly(supabase: SupabaseClient, companyId: string, site: string): Promise<void> {
  try {
    const r = await recomputeValidationState(supabase, companyId);
    console.log(`[validationState] ${site}: routes ${r.routes.updates.length} · needs ${r.needs.updates.length} · claims ${r.claims.updates.length} updated (company ${companyId})`);
  } catch (err) {
    console.error(`[validationState] ${site} failed (non-fatal):`, String((err as Error)?.message ?? err));
  }
}
