// CH-2b-2 — packing rules for the chunked claim-delta recompute (cap = Σfresh 3).
import { describe, expect, it } from "vitest";
import { CHUNK_FRESH_CAP, chunkFreshCount, packDeltaChunks, type DeltaPlanClaim } from "./packChunks";

function claim(id: string, fresh: number, cached = 0, tombstoned = 0): DeltaPlanClaim {
  return {
    declared_claim_id: id,
    candidates_total: fresh + cached + tombstoned,
    candidates_cached: cached,
    candidates_tombstoned: tombstoned,
    candidates_fresh: fresh,
  };
}

describe("packDeltaChunks", () => {
  it("packs whole claims until Σfresh would exceed the cap", () => {
    const chunks = packDeltaChunks([claim("a", 1), claim("b", 2), claim("c", 1), claim("d", 2)]);
    // a+b = 3 (fits), c would make 4 → new chunk; c+d = 3 (fits).
    expect(chunks.map((ch) => ch.map((c) => c.declared_claim_id))).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    for (const ch of chunks) expect(chunkFreshCount(ch)).toBeLessThanOrEqual(CHUNK_FRESH_CAP);
  });

  it("skips claims with zero fresh candidates entirely (resume math: banked work is free)", () => {
    const chunks = packDeltaChunks([claim("done", 0, 4, 1), claim("a", 2), claim("alsoDone", 0, 2)]);
    expect(chunks).toEqual([[claim("a", 2)]]);
  });

  it("a single claim with fresh > cap goes alone (accepted over-cap; inline banking converges it)", () => {
    const chunks = packDeltaChunks([claim("big", 5), claim("a", 1), claim("b", 2)]);
    expect(chunks.map((ch) => ch.map((c) => c.declared_claim_id))).toEqual([
      ["big"],
      ["a", "b"],
    ]);
    expect(chunkFreshCount(chunks[0])).toBe(5);
  });

  it("an exact-cap claim fills a chunk by itself when nothing else fits", () => {
    const chunks = packDeltaChunks([claim("a", 3), claim("b", 3), claim("c", 1)]);
    expect(chunks.map((ch) => ch.map((c) => c.declared_claim_id))).toEqual([
      ["a"],
      ["b"],
      ["c"],
    ]);
  });

  it("all-banked plan (fresh_total 0) packs to zero chunks — the caller runs the finalize only", () => {
    expect(packDeltaChunks([claim("x", 0, 3), claim("y", 0, 0, 2)])).toEqual([]);
  });

  it("empty manifest packs to zero chunks", () => {
    expect(packDeltaChunks([])).toEqual([]);
  });

  it("never splits a claim across chunks (whole-claim boundary)", () => {
    const chunks = packDeltaChunks([claim("a", 2), claim("b", 2), claim("c", 2)]);
    const ids = chunks.flat().map((c) => c.declared_claim_id);
    expect(ids).toEqual(["a", "b", "c"]);
    expect(new Set(ids).size).toBe(3);
    expect(chunks.every((ch) => chunkFreshCount(ch) <= CHUNK_FRESH_CAP)).toBe(true);
  });
});
