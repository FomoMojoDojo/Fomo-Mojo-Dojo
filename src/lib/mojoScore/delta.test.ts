// Δ SINCE LAST RUN (Gate 2, 2026-09-10).
//
// The load-bearing rule is the METHODOLOGY SCOPE. `mojo_scores` mixes `v1.1.0` (internal),
// `outside-v1.0.0` and `outside-v1.1.0` (public record) — different scales measuring different
// things. Subtracting across them invents movement: Cafe Barra 2's real rows would read an internal
// 35 against an outside 21 as a fall of 14 when nothing about the company changed.
import { describe, expect, it } from "vitest";
import { formatScoreDelta, scoreDelta, scoreDeltaTone, type ScoreRowLike } from "./delta";

const R = (score: number, methodology: string, at: string): ScoreRowLike =>
  ({ total_score: score, methodology_version: methodology, computed_at: new Date(at).toISOString() });

const OUT = "outside-v1.1.0";
const INT = "v1.1.0";

describe("two rows of the same methodology", () => {
  it("returns the signed difference, newest minus previous", () => {
    const d = scoreDelta([R(21, OUT, "2026-09-05"), R(19, OUT, "2026-08-21")])!;
    expect(d.current).toBe(21);
    expect(d.previous).toBe(19);
    expect(d.delta).toBe(2);
    expect(d.methodology).toBe(OUT);
  });

  it("a fall is negative", () => {
    expect(scoreDelta([R(13, OUT, "2026-08-22"), R(14.5, OUT, "2026-08-20")])!.delta).toBe(-1.5);
  });

  it("no change is 0, and 0 is a real answer — not an empty", () => {
    const d = scoreDelta([R(20, OUT, "2026-09-09"), R(20, OUT, "2026-09-01")])!;
    expect(d.delta).toBe(0);
    expect(formatScoreDelta(d)).toBe("0.0");
  });
});

describe("METHODOLOGY SCOPE — never subtract across families", () => {
  it("Cafe Barra 2's real shape: an internal row and an outside row are NOT compared", () => {
    // newest is outside-v1.1.0 (21); the internal 35 is a different scale and must be ignored.
    const rows = [R(21, OUT, "2026-09-05"), R(35, INT, "2026-07-10")];
    expect(scoreDelta(rows)).toBeNull(); // one row in the current family ⇒ no Δ
  });

  it("with two outside rows present, the internal rows are still ignored", () => {
    const rows = [
      R(21, OUT, "2026-09-05"),
      R(19, OUT, "2026-08-21"),
      R(35, INT, "2026-07-10"),  // newer than the older outside row, and irrelevant
      R(40, INT, "2026-09-04"),  // newer still, and STILL irrelevant — wrong family
    ];
    const d = scoreDelta(rows)!;
    expect(d.methodology).toBe(OUT);
    expect(d.delta).toBe(2);      // 21 − 19, never 21 − 40 or 21 − 35
  });

  it("VACUOUS PROOF — dropping the methodology filter changes the answer", () => {
    // The unscoped shape: newest minus second-newest by date, whatever family they belong to.
    const rows = [
      R(21, OUT, "2026-09-05"),
      R(19, OUT, "2026-08-21"),
      R(40, INT, "2026-09-04"),
    ];
    const unscoped = (rs: ScoreRowLike[]) => {
      const s = [...rs].sort((a, b) => (a.computed_at < b.computed_at ? 1 : -1));
      return Number(s[0].total_score) - Number(s[1].total_score);
    };
    expect(unscoped(rows)).toBe(-19);      // the wrong answer — a 19-point fall that never happened
    expect(scoreDelta(rows)!.delta).toBe(2); // the right one
  });

  it("the current methodology is the NEWEST row's, not the most common one", () => {
    const rows = [
      R(20, OUT, "2026-09-09"), R(18, OUT, "2026-09-08"),
      R(35, INT, "2026-07-10"), R(34, INT, "2026-07-09"), R(33, INT, "2026-07-08"),
    ];
    expect(scoreDelta(rows)!.methodology).toBe(OUT);
  });
});

describe("single row and empty input are honest empties", () => {
  it("one row in the current family → null", () => {
    expect(scoreDelta([R(20, OUT, "2026-09-09")])).toBeNull();
  });
  it("no rows → null", () => {
    expect(scoreDelta([])).toBeNull();
  });
  it("null renders an em dash, never 0", () => {
    expect(formatScoreDelta(null)).toBe("—");
    expect(formatScoreDelta(null)).not.toBe("0.0");
  });
});

describe("ordering is by computed_at, not by insertion", () => {
  it("rows supplied oldest-first still yield the newest as current", () => {
    const d = scoreDelta([R(19, OUT, "2026-08-21"), R(21, OUT, "2026-09-05")])!;
    expect(d.current).toBe(21);
    expect(d.delta).toBe(2);
  });

  it("rows supplied shuffled yield the same answer", () => {
    const d = scoreDelta([R(20, OUT, "2026-09-01"), R(21, OUT, "2026-09-05"), R(19, OUT, "2026-08-21")])!;
    expect(d.current).toBe(21);
    expect(d.previous).toBe(20);   // second-NEWEST, not the smallest or the first supplied
    expect(d.delta).toBe(1);
  });
});

describe("the Δ cell string and tone", () => {
  it("renders signed to one decimal with a real minus sign", () => {
    expect(formatScoreDelta(scoreDelta([R(21, OUT, "2026-09-05"), R(19, OUT, "2026-08-21")]))).toBe("+2.0");
    expect(formatScoreDelta(scoreDelta([R(13, OUT, "2026-08-22"), R(14.5, OUT, "2026-08-20")]))).toBe("−1.5");
    expect(formatScoreDelta(scoreDelta([R(20, OUT, "2026-09-09"), R(20, OUT, "2026-09-01")]))).toBe("0.0");
    expect(formatScoreDelta(null)).toBe("—");
  });

  it("the minus is U+2212, not a hyphen", () => {
    const s = formatScoreDelta(scoreDelta([R(13, OUT, "2026-08-22"), R(14.5, OUT, "2026-08-20")]));
    expect(s.charCodeAt(0)).toBe(0x2212);
  });

  it("tones: positive / negative / flat / none", () => {
    expect(scoreDeltaTone(scoreDelta([R(21, OUT, "2026-09-05"), R(19, OUT, "2026-08-21")]))).toBe("positive");
    expect(scoreDeltaTone(scoreDelta([R(19, OUT, "2026-09-05"), R(21, OUT, "2026-08-21")]))).toBe("negative");
    expect(scoreDeltaTone(scoreDelta([R(20, OUT, "2026-09-05"), R(20, OUT, "2026-08-21")]))).toBe("flat");
    expect(scoreDeltaTone(null)).toBe("none");
  });
});
