// RETIREMENT of proposals by OPERATOR decision (mechanism signed 2026-09-14).
//
// The 284d37b re-mint tool minus the re-ingest. Addressed BY PROPOSAL ID — it reaches a proposal whose
// input_files row is gone and one that never had a file_id — and turns on the operator's stated reason,
// never on authorship (no origin resolution, no classifier). For each named proposal:
//   1. its live signals are SUPERSEDED — superseded_at / superseded_reason=<reason> / raw_payload
//      .superseded_by_retirement {at, reason, actor, from: live, to: retired} — never deleted;
//   2. every claim whose ENTIRE live backing was retired signals (whole batch considered at once, plus
//      signals already superseded) is STRUCK through set_claim_status with the same reason and actor —
//      refs kept, provenance and state untouched, claim_events written by the law;
//   3. one provenance_remints row of kind 'retirement' per proposal records the decision;
//   4. nothing is minted; the Mojo Score is re-snapshotted once anything changed.
// Idempotent: a proposal with no live signals is 'none' — the second run supersedes 0, strikes 0 and
// writes no ledger row. dry_run computes and reports every step and writes nothing.
import { claimsWhollyBackedBy, isRetirementReason } from "../../../src/lib/retirementPlan.ts";
import { snapshotMojoScore } from "./snapshotMojoScore.ts";

type Sb = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any };

export type RetirementPlan = {
  proposal_id: string;
  found: boolean;
  file_id: string | null;
  file_name: string | null;
  status: string | null;
  processing_state: string | null;
  live_signals: number;
  change: "none" | "retire" | "not_found";
  superseded_signal_ids: string[];
  struck_claim_ids: Array<{ id: string; statement: string; provenance: string; state: string }>;
};

export async function planRetirement(supabase: Sb, companyId: string, proposalIds: string[], reason: string): Promise<RetirementPlan[]> {
  if (!isRetirementReason(reason)) throw new Error(`reason must be <who>:<what> snake_case, got "${reason}"`);
  const ids = [...new Set(proposalIds.map(String))];
  if (ids.length === 0) throw new Error("proposal_ids required");
  const { data: rows, error } = await supabase.from("file_proposals").select("id, file_id, file_name, status, processing_state").eq("company_id", companyId).in("id", ids);
  if (error) throw new Error(`load proposals: ${error.message}`);
  const found = new Map((((rows ?? []) as Array<{ id: string; file_id: string | null; file_name: string | null; status: string | null; processing_state: string | null }>)).map((r) => [r.id, r]));
  const plans: RetirementPlan[] = [];
  const retiring = new Map<string, string>(); // signal_id -> proposal_id
  for (const id of ids) {
    const p = found.get(id);
    if (!p) { plans.push({ proposal_id: id, found: false, file_id: null, file_name: null, status: null, processing_state: null, live_signals: 0, change: "not_found", superseded_signal_ids: [], struck_claim_ids: [] }); continue; }
    const { data: sigs, error: sErr } = await supabase.from("signals").select("id").eq("company_id", companyId).eq("source_id", p.id).is("superseded_at", null);
    if (sErr) throw new Error(`load signals for ${p.id}: ${sErr.message}`);
    const live = ((sigs ?? []) as Array<{ id: string }>).map((s) => s.id).sort();
    for (const s of live) retiring.set(s, p.id);
    plans.push({ proposal_id: p.id, found: true, file_id: p.file_id, file_name: p.file_name, status: p.status, processing_state: p.processing_state, live_signals: live.length, change: live.length > 0 ? "retire" : "none", superseded_signal_ids: live, struck_claim_ids: [] });
  }
  if (retiring.size === 0) return plans;
  const [{ data: refRows, error: rErr }, { data: deadRows, error: dErr }] = await Promise.all([
    supabase.from("claim_signal_refs").select("claim_id, signal_id").eq("company_id", companyId),
    supabase.from("signals").select("id").eq("company_id", companyId).not("superseded_at", "is", null),
  ]);
  if (rErr) throw new Error(`load refs: ${rErr.message}`);
  if (dErr) throw new Error(`load superseded: ${dErr.message}`);
  const dead = new Set(((deadRows ?? []) as Array<{ id: string }>).map((s) => s.id));
  const candidates = claimsWhollyBackedBy((refRows ?? []) as Array<{ claim_id: string; signal_id: string }>, retiring, dead);
  if (candidates.length === 0) return plans;
  const { data: claimRows, error: cErr } = await supabase.from("claims").select("id, statement, provenance, state, status").in("id", candidates.map((c) => c.claim_id));
  if (cErr) throw new Error(`load claims: ${cErr.message}`);
  const byId = new Map((((claimRows ?? []) as Array<{ id: string; statement: string; provenance: string; state: string; status: string }>)).map((c) => [c.id, c]));
  for (const c of candidates) {
    const row = byId.get(c.claim_id);
    if (!row || row.status === "struck") continue; // a struck claim is not struck twice
    plans.find((p) => p.proposal_id === c.attributedTo)!.struck_claim_ids.push({ id: row.id, statement: row.statement, provenance: row.provenance, state: row.state });
  }
  return plans;
}

export type RetirementApplied = { proposal_id: string; superseded: number; struck: number; ledger_id: string | null };

export async function applyRetirement(supabase: Sb, companyId: string, plans: RetirementPlan[], opts: { reason: string; actor: string; note?: string }): Promise<RetirementApplied[]> {
  if (!isRetirementReason(opts.reason)) throw new Error(`reason must be <who>:<what> snake_case, got "${opts.reason}"`);
  if (!opts.actor || !opts.actor.trim()) throw new Error("actor required");
  const out: RetirementApplied[] = [];
  const nowIso = new Date().toISOString();
  for (const plan of plans) {
    if (plan.change !== "retire") { out.push({ proposal_id: plan.proposal_id, superseded: 0, struck: 0, ledger_id: null }); continue; }
    // 1. supersede the live signals (never delete); from/to recorded in raw_payload
    let superseded = 0;
    for (const sid of plan.superseded_signal_ids) {
      const { data: row } = await supabase.from("signals").select("raw_payload").eq("id", sid).is("superseded_at", null).maybeSingle();
      if (!row) continue; // already superseded since the plan — not superseded twice
      const rp = row.raw_payload && typeof row.raw_payload === "object" ? (row.raw_payload as Record<string, unknown>) : {};
      const { error } = await supabase.from("signals").update({
        superseded_at: nowIso, superseded_reason: opts.reason, updated_at: nowIso,
        raw_payload: { ...rp, superseded_by_retirement: { at: nowIso, reason: opts.reason, actor: opts.actor, proposal_id: plan.proposal_id, from: "live", to: "retired" } },
      }).eq("id", sid).is("superseded_at", null);
      if (error) throw new Error(`supersede signal ${sid}: ${error.message}`);
      superseded++;
    }
    // 2. strike the claims whose whole backing was retired — same reason, same actor; refs and provenance untouched
    let struck = 0;
    for (const c of plan.struck_claim_ids) {
      const { data: cur } = await supabase.from("claims").select("status").eq("id", c.id).maybeSingle();
      if (!cur || cur.status === "struck") continue;
      const { error } = await supabase.rpc("set_claim_status", { p_claim_id: c.id, p_status: "struck", p_reason: opts.reason, p_actor: opts.actor });
      if (error) throw new Error(`strike claim ${c.id}: ${error.message}`);
      struck++;
    }
    // 3. ledger — the operator's decision, verbatim
    const { data: ledger, error: ledgerErr } = await supabase.from("provenance_remints").insert({
      company_id: companyId, kind: "retirement", input_file_id: plan.file_id, proposal_id: plan.proposal_id, reason: opts.reason,
      superseded_signal_ids: plan.superseded_signal_ids, struck_claim_ids: plan.struck_claim_ids.map((c) => c.id), minted_signal_ids: [], minted_claim_ids: [],
      dry_run: false, actor: opts.actor, note: opts.note ?? null,
    }).select("id").maybeSingle();
    if (ledgerErr) throw new Error(`ledger: ${ledgerErr.message}`);
    out.push({ proposal_id: plan.proposal_id, superseded, struck, ledger_id: ledger?.id ?? null });
  }
  if (out.some((o) => o.superseded > 0 || o.struck > 0)) await snapshotMojoScore(supabase as any, companyId);
  return out;
}
