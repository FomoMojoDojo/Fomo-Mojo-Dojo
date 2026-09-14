// Retirement of proposals by OPERATOR decision (mechanism signed 2026-09-14) — the pure part.
//
// Retirement is the 284d37b re-mint tool with the re-ingest removed: the proposal's live signals are
// superseded under a reason the operator states, the claims whose ENTIRE live backing was those signals
// are struck under the same reason, and one ledger row per proposal records the decision. Nothing is
// minted, nothing resolves authorship — the decision is the operator's, never a machine finding.
//
// This module holds the parts that need no database: reason validation and the whole-backing strike
// computation. The DB side is supabase/functions/_shared/retireProposals.ts.

/** An operator reason is `<who>:<what>` in snake_case, e.g. operator_retired:test_ingest. */
export const RETIREMENT_REASON_PATTERN = /^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/;

export function isRetirementReason(reason: unknown): reason is string {
  return typeof reason === "string" && RETIREMENT_REASON_PATTERN.test(reason);
}

export type ClaimSignalRef = { claim_id: string; signal_id: string };

/**
 * Claims whose EVERY backing signal is dead once `retiring` is superseded — `dead` is the set of signals
 * already superseded before this run. A claim with at least one ref on a live, non-retiring signal keeps
 * standing; a claim with no refs is never a candidate (nothing to lose). The whole batch is considered at
 * once, so a claim spread across two retiring proposals is struck exactly once, attributed to the proposal
 * of its first retiring ref (`attributedTo`).
 */
export function claimsWhollyBackedBy(
  refs: ClaimSignalRef[],
  retiring: ReadonlyMap<string, string>, // signal_id -> proposal_id
  dead: ReadonlySet<string>,
): Array<{ claim_id: string; attributedTo: string }> {
  const byClaim = new Map<string, string[]>();
  for (const r of refs) byClaim.set(r.claim_id, [...(byClaim.get(r.claim_id) ?? []), r.signal_id]);
  const out: Array<{ claim_id: string; attributedTo: string }> = [];
  for (const [claimId, sids] of byClaim) {
    const first = sids.find((s) => retiring.has(s));
    if (!first) continue;
    if (!sids.every((s) => retiring.has(s) || dead.has(s))) continue;
    out.push({ claim_id: claimId, attributedTo: retiring.get(first)! });
  }
  return out.sort((a, b) => a.claim_id.localeCompare(b.claim_id));
}
