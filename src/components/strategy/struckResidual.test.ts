// Struck rows never fold away (operator ruling 07-09): rail/pair rows render
// line-through in place, and the ALWAYS-EXPANDED residual section shows only
// struck claims with no surviving on-screen delta row — the honest surface
// after a recompute deletes a struck claim's delta rows.
import { describe, expect, it } from "vitest";
import { residualStruckClaims, visibleClaimIds } from "@/lib/claimState/struckResidual";
import type { ClaimDeltaRow, StruckClaim } from "@/hooks/useStrategicDelta";

const row = (over: Partial<ClaimDeltaRow>): ClaimDeltaRow => ({
  id: "d1", delta_type: "echoed", pairing_basis: "judge_confirmed", judge_reason: null,
  operator_disposition: null, declared_statement: "dec", public_statement: "pub",
  declared_claim_id: null, public_claim_id: null,
  declared_claim_status: null, public_claim_status: null,
  declared_claim_provenance: null, declared_attested_date: null,
  ...over,
});
const struck = (id: string): StruckClaim => ({
  id, statement: `s-${id}`, provenance: "public_observed",
  struck_reason: "r", struck_at: "2026-07-09T00:00:00Z", struck_by: "operator",
});

describe("struck residual — never fold away", () => {
  it("a struck claim still referenced by an on-screen rail row is NOT residual (renders in place)", () => {
    const deltas = [row({ id: "d1", delta_type: "internally_silent", public_claim_id: "c1", public_claim_status: "struck" })];
    expect(residualStruckClaims(deltas, [struck("c1")])).toEqual([]);
  });

  it("a struck claim with no surviving delta row IS residual (post-recompute surface)", () => {
    const deltas = [row({ id: "d1", delta_type: "echoed", declared_claim_id: "a", public_claim_id: "b" })];
    const residual = residualStruckClaims(deltas, [struck("gone")]);
    expect(residual.map((c) => c.id)).toEqual(["gone"]);
  });

  it("tombstoned pairings render nothing, so their claims count as residual when struck", () => {
    const deltas = [row({ id: "d1", delta_type: "echoed", operator_disposition: "rejected_pairing", declared_claim_id: "a", public_claim_id: "b" })];
    expect(visibleClaimIds(deltas).size).toBe(0);
    expect(residualStruckClaims(deltas, [struck("b")]).map((c) => c.id)).toEqual(["b"]);
  });
});
