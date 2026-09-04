// RF CHANNELS ADMISSION — APPLY core (operator ruling 2026-09-04). Applies an OPERATOR-SIGNED plan
// (claim id → kind [+ judge reason]) to the inference claims of ONE company: writes claims.statement_kind +
// declared_eligible, one own_words_retypes audit row per change (from/to kind + eligibility, reason,
// decided_by='judge' — machine, never operator), under a long_runner_runs row (run_kind rf_channels_admission).
// NEVER calls the judge: the signed table IS the plan. Pure (injected store, no Deno). Mirrors ownWordsRetype.ts.
// Frozen companies are refused BEFORE any read; own_words claims are never touched by this door.
// Idempotent: `changed` is computed against the CURRENT row values, so a second run writes nothing.
import { FROZEN_COMPANY_IDS } from "./frozenCompanies.ts";
import { declaredEligibleFor, parseOwnWordsKind, type OwnWordsKind } from "./ownWordsKinds.ts";

export type RfApplyMode = "dry_run" | "apply";
export type RfApplyPlanRow = { claim_id: string; kind: unknown; reason?: string | null };
export type RfApplyRow = {
  claim_id: string; statement: string;
  from_kind: string | null; from_eligible: boolean;
  to_kind: OwnWordsKind | null; to_eligible: boolean;
  audit_reason: string; changed: boolean;
  /** why a plan row was NOT applied (never written): unknown claim, own_words claim, invalid kind. */
  refused: "unknown_claim" | "own_words_claim" | "invalid_kind" | null;
};
export type RfApplyResult =
  | { ok: false; skipped: "frozen_company" | "company_not_found" }
  | { ok: false; error: string }
  | { ok: true; mode: RfApplyMode; run_id: string | null; totals: { planned: number; refused: number; changed: number; applied: number; audited: number }; rows: RfApplyRow[] };

// deno-lint-ignore no-explicit-any
type Store = { from: (t: string) => any };

/** The audit reason vocabulary — byte-exact. product_description carries the deterministic reason; every
 *  other kind carries the judge's reason ("judge: <reason>"). */
export const RF_AUDIT_PRODUCT_DESCRIPTION = "product description";
export function rfAuditReason(kind: OwnWordsKind, reason: string | null | undefined): string {
  if (kind === "product_description") return RF_AUDIT_PRODUCT_DESCRIPTION;
  return `judge: ${(reason ?? "").trim() || "(no reason recorded)"}`;
}

export async function runRfChannelsApply(args: {
  supabase: Store; companyId: string; plan: RfApplyPlanRow[]; mode: RfApplyMode; nowIso: string; runId?: string | null;
}): Promise<RfApplyResult> {
  if (FROZEN_COMPANY_IDS.has(args.companyId)) return { ok: false, skipped: "frozen_company" };
  const { data: co } = await args.supabase.from("companies").select("id, frozen").eq("id", args.companyId).maybeSingle();
  if (!co) return { ok: false, skipped: "company_not_found" };
  if ((co as { frozen?: boolean }).frozen) return { ok: false, skipped: "frozen_company" };

  const ids = [...new Set(args.plan.map((p) => p.claim_id).filter(Boolean))];
  const { data: rows, error } = ids.length
    ? await args.supabase.from("claims").select("id, statement, claim_type, statement_kind, declared_eligible")
        .eq("company_id", args.companyId).in("id", ids)
    : { data: [], error: null };
  if (error) return { ok: false, error: String(error.message ?? error) };
  type Row = { id: string; statement: string | null; claim_type: string | null; statement_kind: string | null; declared_eligible: boolean | null };
  const byId = new Map(((rows ?? []) as Row[]).map((r) => [r.id, r]));

  const out: RfApplyRow[] = [];
  for (const p of args.plan) {
    const c = byId.get(p.claim_id);
    const kind = parseOwnWordsKind(p.kind);
    const refused: RfApplyRow["refused"] = !c ? "unknown_claim" : c.claim_type === "own_words" ? "own_words_claim" : kind === null ? "invalid_kind" : null;
    const fromKind = c?.statement_kind ?? null;
    const fromEligible = c ? c.declared_eligible !== false : true;
    const toEligible = kind ? declaredEligibleFor(kind) : fromEligible;
    out.push({
      claim_id: p.claim_id, statement: (c?.statement ?? "").trim(),
      from_kind: fromKind, from_eligible: fromEligible,
      to_kind: kind, to_eligible: toEligible,
      audit_reason: kind ? rfAuditReason(kind, p.reason) : "",
      changed: !refused && (kind !== fromKind || toEligible !== fromEligible),
      refused,
    });
  }
  const changed = out.filter((r) => r.changed);
  const totals = { planned: args.plan.length, refused: out.filter((r) => r.refused).length, changed: changed.length, applied: 0, audited: 0 };
  if (args.mode !== "apply") return { ok: true, mode: "dry_run", run_id: null, totals, rows: out };

  const runId = args.runId ?? crypto.randomUUID();
  const { error: ledErr } = await args.supabase.from("long_runner_runs").insert({
    id: runId, run_kind: "rf_channels_admission", company_id: args.companyId, status: "running", target_count: changed.length, done_count: 0, started_at: args.nowIso,
  });
  if (ledErr) return { ok: false, error: `ledger insert failed: ${ledErr.message}` };
  for (const r of changed) {
    const { error: upErr } = await args.supabase.from("claims")
      .update({ statement_kind: r.to_kind, declared_eligible: r.to_eligible })
      .eq("id", r.claim_id).eq("company_id", args.companyId);
    if (upErr) return { ok: false, error: `claim update failed for ${r.claim_id}: ${upErr.message}` };
    totals.applied++;
    const { error: audErr } = await args.supabase.from("own_words_retypes").insert({
      company_id: args.companyId, claim_id: r.claim_id, run_id: runId,
      from_kind: r.from_kind, to_kind: r.to_kind, from_eligible: r.from_eligible, to_eligible: r.to_eligible,
      reason: r.audit_reason, applied_at: args.nowIso, decided_by: "judge",
    });
    if (audErr) return { ok: false, error: `audit insert failed for ${r.claim_id}: ${audErr.message}` };
    totals.audited++;
  }
  await args.supabase.from("long_runner_runs").update({ status: "completed", done_count: totals.applied, finished_at: args.nowIso }).eq("id", runId);
  return { ok: true, mode: "apply", run_id: runId, totals, rows: out };
}
