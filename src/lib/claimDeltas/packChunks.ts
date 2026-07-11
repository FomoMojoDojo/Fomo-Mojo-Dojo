// CH-2b-2 — chunk packing for the client-side claim-delta recompute loop.
//
// The server's plan call (generate-claim-deltas, plan:true) returns per-declared-
// claim candidate counts; this packs WHOLE declared claims into chunks whose
// summed candidates_fresh stays within the cap. The cap exists because a fresh
// candidate costs a 14b propose (~2-7s) + 70b judge (~26s) sequentially inside
// one edge request, and the gateway cuts responses at ~150s: 3 × ~33s worst-case
// leaves headroom for a cold model load. Cached and tombstoned candidates cost
// hash lookups only — they are free and never count against the cap.
//
// Rules (design-gate rulings, binding):
// - whole claims per chunk — a chunk boundary is one or more declared claims;
// - claims with candidates_fresh = 0 are SKIPPED entirely (nothing to compute;
//   the finalize sees their banked rows via the kept path) — this is also the
//   resume math: re-plan is the server truth, banked work shows up as fresh 0;
// - a single claim with fresh > cap goes ALONE (accepted: it may exceed the
//   response wall, but inline banking converges it across kills/re-clicks);
// - the client NEVER computes content identity — counts and ids only.

export type DeltaPlanClaim = {
  declared_claim_id: string;
  candidates_total: number;
  candidates_cached: number;
  candidates_tombstoned: number;
  candidates_fresh: number;
};

export const CHUNK_FRESH_CAP = 3;

export function packDeltaChunks(
  claims: DeltaPlanClaim[],
  cap: number = CHUNK_FRESH_CAP,
): DeltaPlanClaim[][] {
  const work = claims.filter((c) => c.candidates_fresh > 0);
  const chunks: DeltaPlanClaim[][] = [];
  let current: DeltaPlanClaim[] = [];
  let currentFresh = 0;
  for (const c of work) {
    if (current.length > 0 && currentFresh + c.candidates_fresh > cap) {
      chunks.push(current);
      current = [];
      currentFresh = 0;
    }
    current.push(c);
    currentFresh += c.candidates_fresh;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export function chunkFreshCount(chunk: DeltaPlanClaim[]): number {
  return chunk.reduce((n, c) => n + c.candidates_fresh, 0);
}
