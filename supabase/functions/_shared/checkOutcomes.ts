// ── check outcomes — the sanctioned write path and the resurrection (rulings 1–7, 2026-09-12) ─────
//
// recordCheckOutcome  = THE act of recording a check: computes the subject identity through the TS
//                       authority (contentIdentity of the CONDITION text — for a leg test, the leg's
//                       carried condition), appends the durable row through record_check_outcome
//                       (which supersedes the prior live row), then re-applies the cache.
// applyCheckOutcomes  = the resurrection: resolves every live row onto the CURRENT structure (route
//                       conditions, leg-carried conditions, tests) and writes the display cache from
//                       the durable record — never the reverse. Route arrays go through
//                       replace_route_conditions (the sanctioned array writer); tests.outcome through
//                       set_test_outcome_cache (the cache door). Called at every synthesis terminal
//                       and before validation_state is derived. Total, idempotent.
import { contentIdentity } from "./contentIdentity.ts";
import {
  overlayCompany,
  type CheckKind,
  type CheckOutcomeRow,
  type CheckVerdict,
  type RouteEl,
  type TestEl,
} from "../../../src/lib/checkOutcomes/index.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClient = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any };

export type RecordCheckOutcomeArgs = {
  companyId: string;
  checkKind: CheckKind;
  verdict: CheckVerdict;
  /** The condition text (route condition, or the leg's carried condition for a leg test). */
  conditionText: string;
  /** leg_test detail — recorded, never key. */
  hypothesisText?: string | null;
  moveText?: string | null;
  /** CONTEXT — where the check was recorded. */
  routeId?: string | null;
  routeTitle?: string | null;
  legId?: string | null;
  testId?: string | null;
  evidenceRefs?: string[];
  note?: string | null;
  recordedBy?: string | null;
  checkVersion?: number;
};

export type RecordCheckOutcomeResult = { id: string; supersededId: string | null; subjectIdentity: string; applied: ApplyResult };

export async function recordCheckOutcome(supabase: SupabaseClient, args: RecordCheckOutcomeArgs): Promise<RecordCheckOutcomeResult> {
  const text = String(args.conditionText ?? "").trim();
  if (!text) throw new Error("recordCheckOutcome: conditionText is required");
  const subjectIdentity = await contentIdentity(text);
  const context: Record<string, unknown> = {
    route_id: args.routeId ?? null, route_title: args.routeTitle ?? null, leg_id: args.legId ?? null, test_id: args.testId ?? null,
    hypothesis_text: args.hypothesisText ?? null, move_text: args.moveText ?? null,
    hypothesis_identity: args.hypothesisText ? await contentIdentity(args.hypothesisText) : null,
    move_identity: args.moveText ? await contentIdentity(args.moveText) : null,
  };
  const { data, error } = await supabase.rpc("record_check_outcome", {
    p_company_id: args.companyId,
    p_subject_identity: subjectIdentity,
    p_check_kind: args.checkKind,
    p_verdict: args.verdict,
    p_subject_text: text,
    p_context: context,
    p_note: args.note ?? null,
    p_evidence_refs: args.evidenceRefs ?? [],
    p_check_version: args.checkVersion ?? 1,
    p_recorded_by: args.recordedBy ?? null,
  });
  if (error) throw new Error(`record_check_outcome failed: ${error.message}`);
  const row = data as { id: string; superseded_id: string | null };
  const applied = await applyCheckOutcomes(supabase, args.companyId);
  return { id: row.id, supersededId: row.superseded_id ?? null, subjectIdentity, applied };
}

export type ApplyResult = { routesRewritten: string[]; testsRewritten: Array<{ id: string; outcome: string | null }>; liveRows: number };

export async function applyCheckOutcomes(supabase: SupabaseClient, companyId: string): Promise<ApplyResult> {
  const [rowsRes, routesRes, testsRes] = await Promise.all([
    supabase.from("check_outcomes").select("id, company_id, subject_identity, check_kind, check_version, verdict, recorded_at, superseded_by").eq("company_id", companyId),
    supabase.from("routes").select("id, level, parent_id, what_would_have_to_be_true").eq("company_id", companyId),
    supabase.from("tests").select("id, action_id, outcome").eq("company_id", companyId),
  ]);
  for (const [name, r] of [["check_outcomes", rowsRes], ["routes", routesRes], ["tests", testsRes]] as const) {
    if (r.error) throw new Error(`[checkOutcomes] ${name} read failed: ${r.error.message}`);
  }
  const rows = (rowsRes.data ?? []) as CheckOutcomeRow[];
  const routes = (routesRes.data ?? []) as RouteEl[];
  const tests = (testsRes.data ?? []) as TestEl[];
  const overlay = await overlayCompany(rows, routes, tests, contentIdentity);
  const routesRewritten: string[] = [];
  for (const o of overlay.routes) {
    // The array carries every stamped element verbatim (the overlay only adds/clears stamps from the
    // live record), so the sanctioned writer never refuses this call.
    const { error } = await supabase.rpc("replace_route_conditions", { p_route_id: o.routeId, p_conditions: o.conditions, p_actor: "check-outcomes:apply" });
    if (error) throw new Error(`[checkOutcomes] replace_route_conditions failed for ${o.routeId}: ${error.message}`);
    routesRewritten.push(o.routeId);
  }
  const testsRewritten: Array<{ id: string; outcome: string | null }> = [];
  for (const t of overlay.tests) {
    const { error } = await supabase.rpc("set_test_outcome_cache", { p_test_id: t.testId, p_outcome: t.outcome });
    if (error) throw new Error(`[checkOutcomes] set_test_outcome_cache failed for ${t.testId}: ${error.message}`);
    testsRewritten.push({ id: t.testId, outcome: t.outcome });
  }
  return { routesRewritten, testsRewritten, liveRows: rows.filter((r) => r.superseded_by == null && r.verdict !== "withdrawn").length };
}

/** Terminal helper: never throws (the structure write it follows has already landed). */
export async function applyCheckOutcomesQuietly(supabase: SupabaseClient, companyId: string, site: string): Promise<void> {
  try {
    const r = await applyCheckOutcomes(supabase, companyId);
    console.log(`[checkOutcomes] ${site}: ${r.routesRewritten.length} route arrays, ${r.testsRewritten.length} test outcomes re-stamped from ${r.liveRows} live rows (company ${companyId})`);
  } catch (err) {
    console.error(`[checkOutcomes] ${site} failed (non-fatal):`, String((err as Error)?.message ?? err));
  }
}
