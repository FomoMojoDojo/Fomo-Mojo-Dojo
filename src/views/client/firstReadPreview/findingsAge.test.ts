// R4 (2026-08-20): findings age classification + ordering reuse the freshness lever's 18-month
// threshold. Fresh outranks stale at equal recurrence; the fresh-first key is the falsification target.
import { describe, it, expect } from "vitest";
import { classifyFindingAge, orderFindings } from "./findingsAge";

const READ = "2026-08-20";

describe("R4 — classifyFindingAge (reuses FRESHNESS_WINDOW_MONTHS=18)", () => {
  it("recent event (< 18mo) → fresh, no marker", () => {
    expect(classifyFindingAge("2026-03-01", READ)).toEqual({ stale: false, ageMarker: null });
  });
  it("old event (> 18mo) → stale, 'dated'", () => {
    expect(classifyFindingAge("2014-06-01", READ)).toEqual({ stale: true, ageMarker: "dated" });
  });
  it("no event date → stale, 'undated'", () => {
    expect(classifyFindingAge(null, READ)).toEqual({ stale: true, ageMarker: "undated" });
  });
  it("boundary: just under 18 months is fresh", () => {
    expect(classifyFindingAge("2025-03-15", READ).stale).toBe(false);
  });
});

type F = { id: string; recurrence: number; stale: boolean; recencyKey: string };
const f = (id: string, recurrence: number, stale: boolean, recencyKey: string): F => ({ id, recurrence, stale, recencyKey });

describe("R4 — orderFindings: recurrence desc → fresh-before-stale → recency desc", () => {
  it("a stale item ranks BELOW a fresh item of EQUAL recurrence", () => {
    const out = orderFindings([
      f("stale", 3, true, "2014-01-01"),
      f("fresh", 3, false, "2026-01-01"),
      f("undated", 3, true, "2026-06-01"),
    ]);
    expect(out[0].id).toBe("fresh"); // fresh wins the tie
    expect(out.map((x) => x.id).slice(1)).toContain("stale");
  });

  it("recurrence still dominates: a stale high-recurrence beats a fresh low-recurrence", () => {
    const out = orderFindings([f("freshLow", 1, false, "2026-01-01"), f("staleHigh", 5, true, "2014-01-01")]);
    expect(out[0].id).toBe("staleHigh");
  });

  it("FALSIFICATION: removing the fresh-first key lets stale outrank fresh at equal recurrence", () => {
    const list = [f("stale", 3, true, "2014-01-01"), f("fresh", 3, false, "2026-01-01")];
    // A sort WITHOUT the fresh-first key (recurrence then recency only) puts the OLD-recency stale
    // item's peer ordering purely by recency — here fresh (2026) would still lead by recency, so use
    // a stale item with NEWER recency to expose the missing key.
    const list2 = [f("staleNew", 3, true, "2026-12-01"), f("freshOld", 3, false, "2025-01-01")];
    const withoutKey = [...list2].sort((a, b) => b.recurrence - a.recurrence || b.recencyKey.localeCompare(a.recencyKey));
    expect(withoutKey[0].id).toBe("staleNew"); // BAD: stale leads without the fresh-first key
    const withKey = orderFindings(list2);
    expect(withKey[0].id).toBe("freshOld"); // GOOD: fresh-first key restores correct order
    // (list unused-guard)
    expect(list).toHaveLength(2);
  });
});
