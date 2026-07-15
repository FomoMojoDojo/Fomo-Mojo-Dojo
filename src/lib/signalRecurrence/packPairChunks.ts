// CV-2d-2c — pair packer for the chunked signal-recurrence recompute.
//
// Judge-only pipeline: every fresh pair costs one 70b judgment (~26s worst
// case, cold model swap). The Kong gateway cuts an edge response at ~150s, so
// a chunk carries at most PAIR_CHUNK_CAP fresh pairs: 5 × 26s = 130s + edge
// overhead ≈ 140s < 150s (6 × 26s = 156s fails the wall). Frozen pairs cost a
// hash lookup only and are excluded here — the plan manifest is resume truth,
// so a re-click after a kill packs only what isn't banked.

export const PAIR_CHUNK_CAP = 5;

export type RecurrencePlanPair = {
  signal_a_id: string;
  signal_b_id: string;
  status: "frozen" | "fresh";
  basis: string;
};

export type PairRef = { a: string; b: string };

export function packPairChunks(pairs: RecurrencePlanPair[]): PairRef[][] {
  const fresh = pairs.filter((p) => p.status === "fresh");
  const chunks: PairRef[][] = [];
  for (let i = 0; i < fresh.length; i += PAIR_CHUNK_CAP) {
    chunks.push(
      fresh.slice(i, i + PAIR_CHUNK_CAP).map((p) => ({ a: p.signal_a_id, b: p.signal_b_id })),
    );
  }
  return chunks;
}
