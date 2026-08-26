// Struck-preservation law (07-09 gate): STRUCK claims are recorded operator
// decisions — they survive signal loss and are NEVER eligible for the R2
// signals-gone prune. Only remove_claim (explicit relevance category, audited)
// may delete one. Minimized claims prune normally: minimize is display-only
// de-emphasis with no recorded decision attached — it counts like active
// everywhere, so it prunes like active.
//
// RB-1 provenance scoping (08-04 gate): the reconcile rebuild derives ONLY from
// public signals, so it may prune ONLY public_observed claims. internal_declared,
// client_attested (and any other provenance) are NOT signal-derived and are
// structurally out of reach here — a rebuild must never delete a declared or
// attested claim (or the frozen verdicts that cascade off it). `provenance` is
// therefore REQUIRED on every candidate row: a caller cannot omit it and silently
// widen scope; a non-public_observed row is refused before the manual/struck
// exemptions are even consulted. This narrows scope; it never widens it.
//
// Single victim-selection authority for the reconcile's R2 prune — the edge
// reconcile (evidencePhase1) imports this; tests pin the law here.

export type PruneCandidateRow = {
  id: string;
  status?: string | null;
  provenance: string | null;
  claim_type?: string | null;
};

export function selectPruneVictims(
  rows: PruneCandidateRow[],
  candidateIds: Set<string>,
  manualClaimIds: Set<string>,
): string[] {
  return rows
    .filter((r) =>
      r.provenance === "public_observed" &&
      // OWN-WORDS CARVE-OUT (R1, 2026-08-26): own_words claims are provenance='public_observed'
      // but are NOT signal-derived — mapSignalsToClaimCandidates never emits them (they are written
      // by extract-own-words from own_words_page_snapshots). So they are NEVER in candidateIds and a
      // rebuild CANNOT re-mint this class. Pruning them here silently emptied beat-3 "In your words"
      // (gate-2 recompute did exactly that for CB2 + Edgewood). Excluded structurally at the
      // victim-selection site: a rebuild may only prune what a rebuild can re-mint.
      r.claim_type !== "own_words" &&
      !manualClaimIds.has(r.id) &&
      r.status !== "struck" &&
      !candidateIds.has(r.id)
    )
    .map((r) => r.id);
}
