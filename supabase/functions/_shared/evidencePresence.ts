// Evidence presence (operator rulings 2026-09-16) — the ONE persisted answer to "is there any evidence
// for this company yet?". Every nothing-to-report surface renders from this RECORD, never from a
// recomputation, and a number rendered on zero evidence is a fabricated verdict.
//
//   noEvidenceYet(company) := signals = 0 AND NOT companyHasSpine AND no first_read_outside_score record
//
// SQL-provable (the backfill mirrors it exactly):
//   (select count(*) from signals where company_id = $1) = 0
//   and not exists (spine rows: routes(level), job_steps, positioning_canvases, strategy_cascades, live odi_market_definitions)
//   and not exists (select 1 from integrity_runs where company_id = $1 and component = 'first_read_outside_score')
//
// The record: integrity_runs component 'evidence_presence', excluded_by_rule.state ∈ {none, present}.
// Idempotent: a new row is appended only when the state CHANGES; readers take the newest row (ran_at)
// — the integrity supersession shape every other component uses. Writers: birthAdmission (a refused or
// skipped birth), public-baseline (every terminal), research-company (a successful birth → present).
import { companyHasSpine } from "./spinePredicate.ts";

export const EVIDENCE_PRESENCE_COMPONENT = "evidence_presence" as const;
export type EvidencePresenceState = "none" | "present";

type Db = { from: (t: string) => any };

export async function noEvidenceYet(supabase: Db, companyId: string): Promise<boolean> {
  const { count } = await supabase.from("signals").select("id", { count: "exact", head: true }).eq("company_id", companyId);
  if (Number(count ?? 0) > 0) return false;
  if (await companyHasSpine(supabase, companyId)) return false;
  const { data } = await supabase.from("integrity_runs").select("id")
    .eq("company_id", companyId).eq("component", "first_read_outside_score").limit(1).maybeSingle();
  if (data) return false;
  return true;
}

export async function readEvidencePresence(supabase: Db, companyId: string): Promise<EvidencePresenceState | null> {
  const { data } = await supabase.from("integrity_runs").select("excluded_by_rule")
    .eq("company_id", companyId).eq("component", EVIDENCE_PRESENCE_COMPONENT)
    .order("ran_at", { ascending: false }).limit(1).maybeSingle();
  const s = (data as { excluded_by_rule?: { state?: unknown } | null } | null)?.excluded_by_rule?.state;
  return s === "none" || s === "present" ? s : null;
}

/** Evaluate the predicate and persist it; returns the state and whether a row was appended. */
export async function recordEvidencePresence(
  supabase: Db,
  companyId: string,
  runRef: string,
): Promise<{ state: EvidencePresenceState; written: boolean }> {
  const state: EvidencePresenceState = (await noEvidenceYet(supabase, companyId)) ? "none" : "present";
  const current = await readEvidencePresence(supabase, companyId);
  if (current === state) return { state, written: false };
  const { error } = await supabase.from("integrity_runs").insert({
    company_id: companyId, component: EVIDENCE_PRESENCE_COMPONENT, status: "completed",
    ran_at: new Date().toISOString(), examined: 0, admitted: 0,
    excluded_by_rule: { state, rule: "signals = 0 AND NOT companyHasSpine AND no first_read_outside_score record", previous: current },
    run_ref: runRef,
  });
  if (error) throw new Error(`evidence_presence record failed: ${error.message}`);
  return { state, written: true };
}
