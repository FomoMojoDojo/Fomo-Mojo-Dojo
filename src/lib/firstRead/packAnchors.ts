// V2-4 — the wall-clock chunking law for the open-question generator.
//
// Each anchor costs ~1 gen (14b, ~2-7s) + 1 judge (70b, ~26s) sequentially inside one
// edge request; the gateway cuts responses at ~150s. 3 × ~33s ≈ 100s leaves headroom for
// a cold model load — the same cap-3 the claim-delta packer uses.
export const ANCHOR_CHUNK_CAP = 3;

/** Split anchor identities into cap-sized chunks (stable order = birth order). */
export function packAnchorChunks(identities: string[], cap: number = ANCHOR_CHUNK_CAP): string[][] {
  const ids = identities.filter((x) => typeof x === "string" && x.trim().length > 0);
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += cap) chunks.push(ids.slice(i, i + cap));
  return chunks;
}
