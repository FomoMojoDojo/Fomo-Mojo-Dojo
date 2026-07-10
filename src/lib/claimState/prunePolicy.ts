// Struck-preservation law (07-09 gate): STRUCK claims are recorded operator
// decisions — they survive signal loss and are NEVER eligible for the R2
// signals-gone prune. Only remove_claim (explicit relevance category, audited)
// may delete one. Minimized claims prune normally: minimize is display-only
// de-emphasis with no recorded decision attached — it counts like active
// everywhere, so it prunes like active.
//
// Single victim-selection authority for the reconcile's R2 prune — the edge
// reconcile (evidencePhase1) imports this; tests pin the law here.

export type PruneCandidateRow = {
  id: string;
  status?: string | null;
};

export function selectPruneVictims(
  rows: PruneCandidateRow[],
  candidateIds: Set<string>,
  manualClaimIds: Set<string>,
): string[] {
  return rows
    .filter((r) =>
      !manualClaimIds.has(r.id) &&
      r.status !== "struck" &&
      !candidateIds.has(r.id)
    )
    .map((r) => r.id);
}
