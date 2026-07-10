// Struck rows never fold away (operator ruling 07-09): rail/pair rows render
// line-through in place; the ALWAYS-EXPANDED residual section (the post-
// recompute honest surface) shows only struck claims with no surviving
// on-screen delta row. Pure selection logic — the render lives in
// StrategicDirectionDelta.tsx.
import type { ClaimDeltaRow, StruckClaim } from "@/hooks/useStrategicDelta";

// Claim ids visible in rendered delta rows (tombstoned pairs render nothing).
export function visibleClaimIds(deltas: ClaimDeltaRow[]): Set<string> {
  const ids = new Set<string>();
  for (const d of deltas) {
    if ((d.delta_type === "echoed" || d.delta_type === "divergent") && d.operator_disposition === "rejected_pairing") continue;
    if (d.delta_type === "internally_silent") { if (d.public_claim_id) ids.add(d.public_claim_id); continue; }
    if (d.delta_type === "publicly_silent") { if (d.declared_claim_id) ids.add(d.declared_claim_id); continue; }
    if (d.declared_claim_id) ids.add(d.declared_claim_id);
    if (d.public_claim_id) ids.add(d.public_claim_id);
  }
  return ids;
}

export function residualStruckClaims(deltas: ClaimDeltaRow[], struck: StruckClaim[]): StruckClaim[] {
  const visible = visibleClaimIds(deltas);
  return struck.filter((c) => !visible.has(c.id));
}
