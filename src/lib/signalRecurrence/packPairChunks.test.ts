import { describe, expect, it } from "vitest";
import { PAIR_CHUNK_CAP, packPairChunks, type RecurrencePlanPair } from "./packPairChunks";

const pair = (n: number, status: "frozen" | "fresh"): RecurrencePlanPair => ({
  signal_a_id: `a${n}`,
  signal_b_id: `b${n}`,
  status,
  basis: "shared_tokens:1",
});

describe("packPairChunks", () => {
  it("packs only fresh pairs, cap per chunk", () => {
    const pairs = [
      ...Array.from({ length: 7 }, (_, i) => pair(i, "fresh")),
      pair(90, "frozen"),
      pair(91, "frozen"),
    ];
    const chunks = packPairChunks(pairs);
    expect(chunks.length).toBe(2);
    expect(chunks[0].length).toBe(PAIR_CHUNK_CAP);
    expect(chunks[1].length).toBe(2);
    // frozen pairs never packed
    const flat = chunks.flat();
    expect(flat.some((p) => p.a === "a90" || p.a === "a91")).toBe(false);
    // shape is {a,b} refs in plan order
    expect(chunks[0][0]).toEqual({ a: "a0", b: "b0" });
  });

  it("all-frozen plan packs zero chunks (finalize-only resume)", () => {
    expect(packPairChunks([pair(0, "frozen"), pair(1, "frozen")])).toEqual([]);
  });

  it("empty plan packs zero chunks", () => {
    expect(packPairChunks([])).toEqual([]);
  });
});
